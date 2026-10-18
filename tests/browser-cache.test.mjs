import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pagePolicySource = ts.transpileModule(readFileSync(new URL('../lib/cache/public-pages.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const policy = { exports: {} };
new Function('exports', pagePolicySource)(policy.exports);
const ORIGIN = 'https://papiflix.test';
const html = (value, headers = {}) => new Response(`<html>${value}</html>`, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=0', ...headers } });
function harness() {
  const handlers = {};
  const storage = new Map();
  const requests = [];
  const messages = [];
  let now = Date.now();
  let network = async () => html('initial');
  const key = value => typeof value === 'string' ? value : value.url;
  const caches = {
    keys: async () => [...storage.keys()],
    delete: async name => storage.delete(name),
    open: async name => {
      if (!storage.has(name)) storage.set(name, new Map());
      const rows = storage.get(name);
      return {
        match: async request => rows.get(key(request))?.clone(),
        put: async (request, response) => { rows.set(key(request), response.clone()); },
        delete: async request => rows.delete(key(request)),
        keys: async () => [...rows.keys()].map(url => new Request(url)),
      };
    },
  };
  const context = vm.createContext({ Response, Request, Headers, URL, AbortSignal, Uint8Array, TextEncoder, TextDecoder, crypto: webcrypto, caches,
    Date: class extends Date { static now() { return now; } },
    fetch: async (request, options) => { requests.push({ request, options }); return network(request, options); },
    self: { location: { origin: ORIGIN }, addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [{ url: `${ORIGIN}/`, postMessage: message => messages.push(message) }] } },
  });
  vm.runInContext(workerSource, context);
  function dispatch(type, extra) {
    const waits = [];
    let response;
    handlers[type]({ ...extra, waitUntil: promise => waits.push(promise), respondWith: promise => { response = promise; } });
    return { response, done: async () => { for (let index = 0; index < waits.length; index++) await waits[index]; } };
  }
  const request = (path = '/', mode = 'navigate', options = {}) => {
    const value = new Request(`${ORIGIN}${path}`, options);
    Object.defineProperty(value, 'mode', { value: mode });
    return value;
  };
  return { context, caches, storage, requests, messages, dispatch, request, advance: ms => { now += ms; }, setNetwork: fn => { network = fn; },
    fetch: (path, mode, options) => dispatch('fetch', { request: request(path, mode, options) }) };
}
async function visit(h, path = '/', mode = 'navigate', options) {
  const event = h.fetch(path, mode, options);
  const response = await event.response;
  await event.done();
  return response;
}

test('warm navigation returns saved HTML before a slow refresh, then updates cache and notifies the visible page', async () => {
  const h = harness();
  h.setNetwork(async () => html('old', { Vary: 'rsc, next-router-state-tree, next-router-prefetch, Accept-Encoding' }));
  await visit(h);
  let finish;
  h.setNetwork(() => new Promise(resolve => { finish = resolve; }));
  const event = h.fetch('/');
  const response = await event.response;
  assert.match(await response.text(), /old/);
  assert.equal(h.requests[0].request.credentials, 'omit');
  finish(html('new'));
  await event.done();
  assert.equal(h.messages[0].type, 'PAPIFLIX_PUBLIC_UPDATED');
  assert.match(await (await (await h.caches.open('papiflix-pwa-v3-pages')).match(`${ORIGIN}/`)).text(), /new/);
});

test('expired cached pages are not reused, including when offline', async () => {
  const h = harness();
  await visit(h);
  h.advance(86_400_001);
  h.setNetwork(async () => { throw new Error('offline'); });
  assert.equal((await visit(h)).status, 503);
});

test('recent cached pages work offline and server errors do not overwrite a good snapshot', async () => {
  const h = harness();
  await visit(h);
  h.setNetwork(async () => new Response('server error', { status: 500 }));
  assert.match(await (await visit(h)).text(), /initial/);
  h.setNetwork(async () => { throw new Error('offline'); });
  assert.match(await (await visit(h)).text(), /initial/);
});

test('personal data, auth, playback, query variants and RSC responses never enter the worker cache', () => {
  const h = harness();
  for (const path of ['/api/auth/session', '/api/bookmarks', '/api/likes', '/api/my-papiflix', '/api/watch-history', '/dashboard', '/my-papiflix', '/bookmarks', '/watch/title', '/anime/watch/42', '/manga/read/42', '/categories/mature', '/?q=movie', '/?_rsc=123']) {
    assert.equal(h.fetch(path).response, undefined, path);
  }
  assert.equal(h.fetch('/', 'cors', { headers: { RSC: '1' } }).response, undefined);
  assert.equal(h.fetch('/', 'navigate', { headers: { Authorization: 'Bearer fixture' } }).response, undefined);
  assert.equal(h.fetch('/api/manga/proxy?url=https://uploads.mangadex.org/image.jpg', 'cors').response, undefined);
  assert.equal(h.requests.length, 0);
});

test('public page allowlists match in the worker and application session gate', () => {
  const h = harness();
  for (const path of ['/', '/anime', '/manga', '/categories', '/categories/regional', '/categories/genres/action', '/categories/mature', '/my-papiflix', '/watch/title', '/categories/trending/extra']) {
    assert.equal(vm.runInContext(`isPublicPage(new URL(${JSON.stringify(ORIGIN + path)}))`, h.context), policy.exports.isPublicBrowsePath(path), path);
  }
});

test('private, no-store, non-HTML, redirected and error responses are never stored', async () => {
  for (const response of [html('private', { 'Cache-Control': 'private' }), html('no-store', { 'Cache-Control': 'no-store' }), html('cookie', { Vary: 'Cookie' }), new Response('{}', { headers: { 'Content-Type': 'application/json' } }), new Response('error', { status: 500 })]) {
    const h = harness();
    h.setNetwork(async () => response);
    await visit(h);
    assert.equal((await (await h.caches.open('papiflix-pwa-v3-pages')).keys()).length, 0);
  }
});

test('artwork is reused while fresh and refreshed after one day', async () => {
  const h = harness();
  h.setNetwork(async () => new Response('webp', { headers: { 'Content-Type': 'image/webp' } }));
  const path = '/api/images/tmdb/w300/poster.jpg';
  await visit(h, path, 'cors');
  await visit(h, path, 'cors');
  assert.equal(h.requests.length, 1);
  h.advance(86_400_001);
  await visit(h, path, 'cors');
  assert.equal(h.requests.length, 2);
});

test('cache eviction bounds bytes, entries and individual image sizes', async () => {
  const h = harness();
  vm.runInContext('POLICIES.images.maxEntries = 2; POLICIES.images.maxBytes = 10; POLICIES.images.maxEntryBytes = 8;', h.context);
  h.setNetwork(async () => new Response('123456', { headers: { 'Content-Type': 'image/webp' } }));
  await visit(h, '/api/images/tmdb/w300/a.jpg', 'cors');
  await visit(h, '/api/images/tmdb/w300/b.jpg', 'cors');
  const cache = await h.caches.open('papiflix-pwa-v3-images');
  assert.equal((await cache.keys()).length, 1);
  h.setNetwork(async () => new Response('123456789', { headers: { 'Content-Type': 'image/webp' } }));
  await visit(h, '/api/images/tmdb/w300/large.jpg', 'cors');
  assert.equal((await cache.keys()).length, 1);
});

test('activation removes old PapiFlix caches and preserves unrelated app storage', async () => {
  const h = harness();
  await h.caches.open('papiflix-pwa-v2');
  await h.caches.open('other-app');
  await h.dispatch('activate').done();
  assert.deepEqual(await h.caches.keys(), ['other-app']);
});

test('blocked storage still returns network content', async () => {
  const h = harness();
  h.caches.open = async () => { throw new Error('quota or storage unavailable'); };
  assert.equal((await visit(h)).status, 200);
});

test('focus/reconnect refresh only accepts the callers public page', async () => {
  const h = harness();
  await h.dispatch('message', { data: { type: 'PAPIFLIX_REVALIDATE_PUBLIC' }, source: { url: `${ORIGIN}/my-papiflix` } }).done();
  assert.equal(h.requests.length, 0);
  await h.dispatch('message', { data: { type: 'PAPIFLIX_REVALIDATE_PUBLIC' }, source: { url: `${ORIGIN}/` } }).done();
  assert.equal(h.requests.length, 1);
});

test('restored pages carry a revision and catch refreshes completed before hydration', async () => {
  const h = harness();
  await visit(h);
  const delivered = await visit(h);
  assert.match(await delivered.text(), /<!--papiflix-cache-revision:[a-f0-9]{64}:\/-->/);
  const messages = [];
  await h.dispatch('message', { data: { type: 'PAPIFLIX_REVALIDATE_PUBLIC', revision: 'old-rendered-snapshot' },
    source: { url: `${ORIGIN}/`, postMessage: message => messages.push(message) } }).done();
  assert.equal(messages[0].type, 'PAPIFLIX_PUBLIC_UPDATED');
  assert.match(messages[0].revision, /^[a-f0-9]{64}$/);
});

test('redirected navigation responses are not cacheable', () => {
  const h = harness();
  const response = html('redirected');
  Object.defineProperty(response, 'redirected', { value: true });
  h.context.fixtureResponse = response;
  assert.equal(vm.runInContext('isCacheable(fixtureResponse, "pages")', h.context), false);
});

function pwaClient(pathname = '/') {
  const effects = [];
  const timers = new Map();
  const messages = [];
  let now = 100_000;
  let refreshes = 0;
  const target = () => ({ listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type) { this.listeners.delete(type); } });
  const document = { ...target(), visibilityState: 'visible', childNodes: [{ nodeType: 8, nodeValue: `papiflix-cache-revision:original:${pathname}` }] };
  const controller = { postMessage: message => messages.push(message) };
  const navigator = { onLine: true, serviceWorker: { ...target(), controller } };
  const window = { ...target(), location: { origin: ORIGIN, pathname }, setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  const imports = {
    react: { useEffect: callback => effects.push(callback), startTransition: callback => callback() },
    'next/navigation': { usePathname: () => pathname, useRouter: () => ({ refresh: () => { refreshes++; } }) },
    '@/lib/cache/public-pages': policy.exports,
  };
  const output = ts.transpileModule(readFileSync(new URL('../components/media/pwa-service-worker.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'window', 'document', 'navigator', 'process', 'Date', output)(exports, name => imports[name], window, document, navigator, { env: { NODE_ENV: 'production' } }, { now: () => now });
  exports.PwaServiceWorker();
  const cleanup = effects[1]();
  return { document, navigator, window, messages, timers, cleanup,
    refreshes: () => refreshes, advance: ms => { now += ms; },
    message: revision => navigator.serviceWorker.listeners.get('message')?.({ source: controller, data: { type: 'PAPIFLIX_PUBLIC_UPDATED', path: pathname, revision } }) };
}

test('visible public pages refresh once per revision, retain rapid updates and clean up listeners', () => {
  const h = pwaClient();
  assert.equal(h.messages[0].revision, 'original');
  h.message('new');
  h.message('new');
  assert.equal(h.refreshes(), 1);
  h.message('newer');
  assert.equal(h.timers.size, 1);
  h.advance(30_001);
  [...h.timers.values()][0]();
  assert.equal(h.refreshes(), 2);
  h.cleanup();
  assert.equal(h.navigator.serviceWorker.listeners.size, 0);
});

test('hidden tabs defer refresh and apply pending data on return; private pages do not attach cache listeners', () => {
  const h = pwaClient();
  h.document.visibilityState = 'hidden';
  h.message('new');
  assert.equal(h.refreshes(), 0);
  h.document.visibilityState = 'visible';
  h.window.listeners.get('focus')();
  assert.equal(h.refreshes(), 1);
  assert.equal(pwaClient('/my-papiflix').navigator.serviceWorker.listeners.size, 0);
});

test('public browse content renders during session checks while private pages remain gated', () => {
  const output = ts.transpileModule(readFileSync(new URL('../components/auth/session-bootstrap.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const pathname of ['/', '/anime', '/manga', '/categories/genres/action', '/my-papiflix', '/dashboard', '/watch/title']) {
    const imports = {
      react: React, 'react/jsx-runtime': jsxRuntime,
      'next-auth/react': { useSession: () => ({ status: 'loading' }) },
      'next/navigation': { usePathname: () => pathname },
      '@/lib/cache/public-pages': policy.exports,
      '@/components/ui/loading-transition': { LoadingTransition: () => null },
    };
    const exports = {};
    new Function('exports', 'require', output)(exports, name => imports[name]);
    const rendered = renderToStaticMarkup(React.createElement(exports.SessionBootstrap, null, React.createElement('h1', null, 'Content')));
    assert.equal(rendered.includes('visibility:hidden'), !policy.exports.isPublicBrowsePath(pathname), pathname);
    assert.equal(rendered.includes('inert=""'), !policy.exports.isPublicBrowsePath(pathname), pathname);
  }
});
