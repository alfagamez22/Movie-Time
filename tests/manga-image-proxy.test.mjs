import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import sharp from 'sharp';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const runtimeModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, runtimeModule, runtimeModule.exports);
  return runtimeModule.exports;
}
const { handleMangaImageRequest } = loadModule('../lib/manga/image-proxy.ts');
const { genreSeo } = loadModule('../lib/seo-content.ts');
const origin = 'https://uploads.mangadex.org';
const source = `${origin}/data/hash/page.png`;
function request(url = source, width = '640') {
  const params = new URLSearchParams({ url });
  if (width !== null) params.set('width', width);
  return new Request(`https://papiflix.test/api/manga/proxy?${params}`);
}
function mockFetch(t, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
}

test('rejects lookalike hosts, insecure URLs, credentials and unsupported widths before fetching', async (t) => {
  mockFetch(t, () => { throw new Error('Must not fetch'); });
  for (const url of ['https://eviluploads.mangadex.org/a', 'https://uploads.mangadex.org.evil.test/a', 'http://uploads.mangadex.org/a', 'https://user:pass@uploads.mangadex.org/a', 'https://uploads.mangadex.org:8443/a']) {
    assert.equal((await handleMangaImageRequest(request(url), origin)).status, 403);
  }
  assert.equal((await handleMangaImageRequest(request(source, '9999'), origin)).status, 400);
});

test('resizes a large page to a smaller cached WebP and blocks unchecked redirects', async (t) => {
  const image = await sharp(randomBytes(1200 * 1600 * 3), { raw: { width: 1200, height: 1600, channels: 3 } }).png().toBuffer();
  mockFetch(t, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return new Response(image, { headers: { 'Content-Type': 'image/png' } });
  });
  const response = await handleMangaImageRequest(request(), origin);
  const result = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control'), /s-maxage=86400/);
  assert.equal((await sharp(result).metadata()).width, 640);
  assert.ok(result.length < image.length);
});

test('small images and full-size reading preserve original bytes', async (t) => {
  const image = await sharp({ create: { width: 800, height: 1200, channels: 3, background: 'white' } }).webp().toBuffer();
  mockFetch(t, async () => new Response(image, { headers: { 'Content-Type': 'image/webp' } }));
  for (const width of ['640', null]) {
    const response = await handleMangaImageRequest(request(source, width), origin);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  }
});

test('conversion failure returns original while non-images and oversized responses are rejected', async (t) => {
  mockFetch(t, async () => new Response(new Uint8Array(40_000), { headers: { 'Content-Type': 'image/png' } }));
  const fallback = await handleMangaImageRequest(request(), origin);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('content-type'), 'image/png');
  assert.equal((await fallback.arrayBuffer()).byteLength, 40_000);
  globalThis.fetch = async () => new Response('HTML', { headers: { 'Content-Type': 'text/html' } });
  assert.equal((await handleMangaImageRequest(request(), origin)).status, 415);
  globalThis.fetch = async () => new Response('image', { headers: { 'Content-Type': 'image/png', 'Content-Length': String(13 * 1024 * 1024) } });
  assert.equal((await handleMangaImageRequest(request(), origin)).status, 413);
  globalThis.fetch = async () => new Response(new Uint8Array(13 * 1024 * 1024), { headers: { 'Content-Type': 'image/png' } });
  assert.equal((await handleMangaImageRequest(request(), origin)).status, 413);
});

test('upstream errors remain uncached', async (t) => {
  mockFetch(t, async () => { throw new Error('Network failure'); });
  const response = await handleMangaImageRequest(request(), origin);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), null);
});

test('full-size image response starts before the upstream stream finishes', async (t) => {
  let upstreamController;
  const body = new ReadableStream({ start(controller) { upstreamController = controller; controller.enqueue(new Uint8Array([1, 2])); } });
  mockFetch(t, async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }));
  const response = await handleMangaImageRequest(request(source, null), origin);
  const reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2]));
  upstreamController.close();
  assert.equal((await reader.read()).done, true);
});

test('TV-only genres do not advertise movies', () => {
  const seo = genreSeo('War & Politics', false);
  assert.doesNotMatch(JSON.stringify(seo), /movies/i);
  assert.match(seo.title, /TV Shows/);
});

test('movie-only genres do not advertise TV shows or unavailable type controls', () => {
  const seo = genreSeo('History', true, false);
  assert.doesNotMatch(JSON.stringify(seo), /TV shows|TV series|switch between/i);
  assert.match(seo.title, /Movies/);
});
