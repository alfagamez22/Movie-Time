import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadProxy(transformCalls) {
  const filename = resolve(__dirname, '..', 'lib/images/tmdb-proxy.ts');
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const sharp = () => {
    const pipeline = {
      rotate() {
        return pipeline;
      },
      resize() {
        return pipeline;
      },
      avif(options) {
        transformCalls.push({ format: 'avif', options });
        return pipeline;
      },
      webp(options) {
        transformCalls.push({ format: 'webp', options });
        return pipeline;
      },
      jpeg(options) {
        transformCalls.push({ format: 'jpeg', options });
        return pipeline;
      },
      async toBuffer() {
        return Buffer.from('optimized');
      },
    };
    return pipeline;
  };

  const runtimeModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === 'sharp') return sharp;
    throw new Error(`Unexpected import while loading TMDB image proxy: ${specifier}`);
  };

  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

test('Save-Data on forces the lower-bandwidth JPEG transform', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () =>
    new Response(Buffer.from('source'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });

  try {
    const { handleTmdbImageRequest } = loadProxy(calls);
    const response = await handleTmdbImageRequest(
      '/poster.jpg',
      'w300',
      'image/avif,image/webp,image/*',
      'on',
      true,
    );

    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(calls.at(-1), {
      format: 'jpeg',
      options: { mozjpeg: true, quality: 70 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normal image requests still prefer AVIF when supported', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () =>
    new Response(Buffer.from('source'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });

  try {
    const { handleTmdbImageRequest } = loadProxy(calls);
    const response = await handleTmdbImageRequest(
      '/poster.jpg',
      'w300',
      'image/avif,image/webp,image/*',
      null,
      true,
    );

    assert.equal(response.headers.get('content-type'), 'image/avif');
    assert.deepEqual(calls.at(-1), {
      format: 'avif',
      options: { effort: 4, quality: 62 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
