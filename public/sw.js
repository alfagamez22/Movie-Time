// Bump this version when changing cache rules or the stored representation.
const VERSION = 'v3';
const PREFIX = 'papiflix-pwa-';
const CACHE_NAMES = { pages: `${PREFIX}${VERSION}-pages`, assets: `${PREFIX}${VERSION}-assets`, images: `${PREFIX}${VERSION}-images` };
const DAY = 86_400_000;
const POLICIES = {
  pages: { maxAge: DAY, freshFor: 0, maxEntries: 12, maxBytes: 8 * 1024 * 1024, maxEntryBytes: 1024 * 1024 },
  assets: { maxAge: 30 * DAY, freshFor: DAY, maxEntries: 160, maxBytes: 24 * 1024 * 1024, maxEntryBytes: 4 * 1024 * 1024 },
  images: { maxAge: 7 * DAY, freshFor: DAY, maxEntries: 120, maxBytes: 24 * 1024 * 1024, maxEntryBytes: 2 * 1024 * 1024 },
};
const inFlight = new Map();
const writes = new Map();
const STATIC_ASSETS = ['/manifest.webmanifest', '/icons/papiflixbanner.png', '/icons/favicon/android-chrome-192x192.png', '/icons/favicon/android-chrome-512x512.png'];

// Keep this allowlist aligned with lib/cache/public-pages.ts. Never cache account or player HTML.
function isPublicPage(url) {
  return !url.search && (['/', '/anime', '/manga', '/categories'].includes(url.pathname) ||
    /^\/categories\/(?:trending|discover|regional|genre|rating)$/.test(url.pathname) ||
    /^\/categories\/genres\/[a-z0-9-]+$/.test(url.pathname));
}
function cacheKind(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') ||
      request.headers.has('RSC') || request.headers.has('Next-Router-State-Tree') || url.searchParams.has('_rsc')) return null;
  if (request.mode === 'navigate') return isPublicPage(url) ? 'pages' : null;
  if (url.pathname.startsWith('/_next/static/') && !url.search) return 'assets';
  if ((url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') && !url.search) return 'assets';
  // Only deterministic TMDB artwork, not arbitrary URL proxies, manga chapters or playback data.
  if (/^\/api\/images\/tmdb\/(w92|w300|w780)\/[A-Za-z0-9/_-]+\.(avif|gif|jpe?g|png|webp)$/i.test(url.pathname) && !url.search) return 'images';
  return null;
}
function isCacheable(response, kind) {
  const control = response.headers.get('Cache-Control') || '';
  const type = response.headers.get('Content-Type') || '';
  return response.ok && !response.redirected && response.type !== 'opaque' &&
    !/(?:private|no-store|no-cache)/i.test(control) &&
    !/(?:cookie|authorization)/i.test(response.headers.get('Vary') || '') &&
    (kind === 'pages' ? type.includes('text/html') : kind === 'images' ? /^image\//.test(type) : true);
}
async function readLimited(response, maxBytes) {
  if (Number(response.headers.get('Content-Length')) > maxBytes || !response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { void reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function notifyUpdated(url, revision) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    if (new URL(client.url).pathname === new URL(url).pathname) client.postMessage({ type: 'PAPIFLIX_PUBLIC_UPDATED', path: new URL(url).pathname, revision });
  }
}
async function storeResponse(key, response, kind) {
  if (!isCacheable(response, kind)) return;
  const policy = POLICIES[kind];
  let bytes = await readLimited(response, policy.maxEntryBytes);
  if (!bytes) return;
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  headers.set('X-Papiflix-Cached-At', String(Date.now()));
  if (kind === 'pages') {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const revision = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    headers.set('X-Papiflix-Content-Hash', revision);
    // Let a slowly hydrating client identify the rendered snapshot even if it missed an early update message.
    // A document-level comment leaves React's hydrated element attributes unchanged.
    const html = new TextDecoder().decode(bytes).replace(/<html(?=[\s>])/i, `<!--papiflix-cache-revision:${revision}:${new URL(key).pathname}--><html`);
    bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > policy.maxEntryBytes) return;
  }
  headers.set('X-Papiflix-Cache-Bytes', String(bytes.byteLength));
  const previous = writes.get(kind) || Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    const cache = await caches.open(CACHE_NAMES[kind]);
    const old = await cache.match(key);
    await cache.delete(key);
    await cache.put(key, new Response(bytes, { status: response.status, statusText: response.statusText, headers }));
    const entries = [];
    for (const request of await cache.keys()) {
      const item = await cache.match(request);
      if (item) entries.push({ request, size: Number(item.headers.get('X-Papiflix-Cache-Bytes')) || 0, time: Number(item.headers.get('X-Papiflix-Cached-At')) || 0 });
    }
    entries.sort((a, b) => a.time - b.time);
    let size = entries.reduce((sum, item) => sum + item.size, 0);
    let count = entries.length;
    for (const item of entries) {
      if (Date.now() - item.time > policy.maxAge || count > policy.maxEntries || size > policy.maxBytes) {
        await cache.delete(item.request); size -= item.size; count--;
      }
    }
    if (kind === 'pages' && old && old.headers.get('X-Papiflix-Content-Hash') !== headers.get('X-Papiflix-Content-Hash')) await notifyUpdated(key, headers.get('X-Papiflix-Content-Hash'));
  });
  writes.set(kind, write);
  try { await write; } finally { if (writes.get(kind) === write) writes.delete(kind); }
}
function fetchAndStore(request, kind, event) {
  const key = request.url;
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      // A shared browser cache only receives anonymous responses. Auth cookies stay in the browser.
      const response = await fetch(new Request(request, { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(10_000) }));
      const stored = storeResponse(key, response.clone(), kind).catch(() => undefined);
      if (event) event.waitUntil(stored);
      return { response, stored };
    })();
    inFlight.set(key, job);
    void job.then(async ({ stored }) => { await stored; if (inFlight.get(key) === job) inFlight.delete(key); }, () => { if (inFlight.get(key) === job) inFlight.delete(key); });
  }
  return job.then(({ response }) => response.clone());
}
async function cachedResponse(request, kind) {
  const cache = await caches.open(CACHE_NAMES[kind]);
  const cached = await cache.match(request.url);
  if (!cached) return null;
  const age = Date.now() - Number(cached.headers.get('X-Papiflix-Cached-At') || 0);
  if (age < 0 || age > POLICIES[kind].maxAge) { await cache.delete(request.url); return null; }
  return { response: cached, age };
}
function offlineResponse() {
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PapiFlix is offline</title><body style="background:#050505;color:white;font:18px system-ui;padding:10vw"><h1>You are offline</h1><p>Reconnect to load this page. Previously visited browse pages may still be available.</p><a href="/" style="color:white">Open PapiFlix</a></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
self.addEventListener('install', event => {
  // A missing icon must not prevent the worker from installing.
  event.waitUntil(Promise.allSettled(STATIC_ASSETS.map(async path => {
    const response = await fetch(path, { credentials: 'omit' });
    await storeResponse(new URL(path, self.location.origin).href, response, 'assets');
  })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && !Object.values(CACHE_NAMES).includes(key)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const kind = cacheKind(request, new URL(request.url));
  if (!kind) return;
  let background;
  const response = (async () => {
    let cached = null;
    try { cached = await cachedResponse(request, kind); } catch { /* Storage can be unavailable or evicted. */ }
    if (cached) {
      if (kind === 'pages' || cached.age > POLICIES[kind].freshFor) background = fetchAndStore(request, kind, event).catch(() => undefined);
      return cached.response;
    }
    try { return await fetchAndStore(request, kind, event); } catch {
      return kind === 'pages' ? offlineResponse() : new Response(null, { status: 503 });
    }
  })();
  event.respondWith(response);
  event.waitUntil(response.then(async () => { if (background) await background; }).catch(() => undefined));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'PAPIFLIX_REVALIDATE_PUBLIC') return;
  // The caller can only refresh its own allowlisted public URL.
  if (!event.source?.url) return;
  const url = new URL(event.source.url);
  if (url.origin !== self.location.origin || !isPublicPage(url)) return;
  const request = new Request(url.href, { headers: { Accept: 'text/html' } });
  event.waitUntil((async () => {
    await fetchAndStore(request, 'pages', event);
    // Also catch updates completed before a restored tab attached its listener.
    const job = inFlight.get(request.url);
    if (job) await (await job).stored;
    const cached = await cachedResponse(request, 'pages');
    const revision = cached?.response.headers.get('X-Papiflix-Content-Hash');
    if (revision && typeof event.data.revision === 'string' && revision !== event.data.revision) {
      event.source.postMessage({ type: 'PAPIFLIX_PUBLIC_UPDATED', path: url.pathname, revision });
    }
  })().catch(() => undefined));
});
