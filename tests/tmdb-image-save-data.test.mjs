import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import ts from 'typescript';

function load(path, stubs = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const runtimeModule = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(runtimeModule.exports, (specifier) => {
    if (!(specifier in stubs)) throw new Error(`Unexpected import while loading ${path}: ${specifier}`);
    return stubs[specifier];
  }, runtimeModule);
  return runtimeModule.exports;
}

const imagePath = load('lib/images/tmdb-image-path.ts');

function loadProxy(transformCalls) {
  const sharp = () => {
    const pipeline = {
      rotate: () => pipeline,
      resize: (options) => { transformCalls.push({ resize: options }); return pipeline; },
      webp: (options) => { transformCalls.push({ format: 'webp', options }); return pipeline; },
      toBuffer: async () => Buffer.from('optimized'),
    };
    return pipeline;
  };
  return load('lib/images/tmdb-proxy.ts', { sharp, './tmdb-image-path': imagePath });
}

function mockFetch(t, implementation) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return implementation(...args); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const pngResponse = () => new Response(Buffer.from('source'), { status: 200, headers: { 'content-type': 'image/png' } });

test('every browser gets one long-cached WebP variant at the requested width', async (t) => {
  const fetchCalls = mockFetch(t, pngResponse);
  const transforms = [];
  const { handleTmdbImageRequest } = loadProxy(transforms);

  const response = await handleTmdbImageRequest('/poster.jpg', 'w300', true);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control'), /max-age=31536000/);
  assert.deepEqual(transforms.find((call) => call.format), { format: 'webp', options: { effort: 2, quality: 78 } });
  assert.equal(transforms.find((call) => call.resize).resize.width, 320);
  assert.equal(fetchCalls[0][0], 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.ok(fetchCalls[0][1].signal instanceof AbortSignal, 'upstream fetch must carry a timeout signal');
});

test('upstream timeouts and network failures become an uncached 502', async (t) => {
  mockFetch(t, () => { throw new DOMException('The operation timed out.', 'TimeoutError'); });
  const { handleTmdbImageRequest } = loadProxy([]);

  const response = await handleTmdbImageRequest('/poster.jpg', 'w780', true);

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('invalid image paths are rejected before any upstream request', async (t) => {
  const fetchCalls = mockFetch(t, pngResponse);
  const { handleTmdbImageRequest } = loadProxy([]);

  for (const path of ['../etc/passwd', '/poster.svg', '//evil.test/a.jpg?x', '']) {
    assert.equal((await handleTmdbImageRequest(path, 'w300', true)).status, 400, path);
  }
  assert.equal(fetchCalls.length, 0);
});

test('legacy query-string URLs permanently redirect to the cacheable path form', async () => {
  const route = load('app/api/images/tmdb/route.ts', { '@/lib/images/tmdb-image-path': imagePath });
  const get = (query) => route.GET(new Request(`https://papiflix.test/api/images/tmdb?${query}`));

  const redirect = await get('path=%2Fposter.jpg&size=w300');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), 'https://papiflix.test/api/images/tmdb/w300/poster.jpg');
  assert.match(redirect.headers.get('cache-control'), /max-age=31536000/);

  const defaultSize = await get('path=%2Fnested%2Fbackdrop.webp');
  assert.equal(defaultSize.headers.get('location'), 'https://papiflix.test/api/images/tmdb/w780/nested/backdrop.webp');

  for (const size of ['original', '']) {
    const fallback = await get(`path=%2Fposter.jpg&size=${size}`);
    assert.equal(fallback.status, 308);
    assert.equal(fallback.headers.get('location'), 'https://papiflix.test/api/images/tmdb/w780/poster.jpg');
  }
  assert.equal((await get('path=https%3A%2F%2Fevil.test%2Fa.jpg&size=w300')).status, 400);
  assert.equal((await get('size=w300')).status, 400);
});
