import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfigWithEnv(env) {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...env };

  try {
    const filename = resolve(__dirname, '..', 'lib/config.ts');
    const source = readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;

    const runtimeModule = { exports: {} };
    const fn = new Function('exports', 'module', '__filename', '__dirname', compiled);
    fn(runtimeModule.exports, runtimeModule, filename, dirname(filename));
    return runtimeModule.exports.appConfig;
  } finally {
    process.env = originalEnv;
  }
}

test('uses the Vercel production URL when deployed with a localhost site URL', () => {
  const config = loadConfigWithEnv({
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    VERCEL_PROJECT_PRODUCTION_URL: 'papiflix.vercel.app',
  });

  assert.equal(config.siteUrl, 'https://papiflix.vercel.app');
});

test('keeps an explicit non-local site URL on Vercel', () => {
  const config = loadConfigWithEnv({
    NEXT_PUBLIC_SITE_URL: 'https://watch.papiflix.example',
    VERCEL_PROJECT_PRODUCTION_URL: 'papiflix.vercel.app',
  });

  assert.equal(config.siteUrl, 'https://watch.papiflix.example');
});

test('keeps localhost for local development', () => {
  const config = loadConfigWithEnv({
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    VERCEL: '',
    VERCEL_PROJECT_PRODUCTION_URL: '',
  });

  assert.equal(config.siteUrl, 'http://localhost:3000');
});

test('uses a crawler-friendly social preview asset', () => {
  const config = loadConfigWithEnv({});

  assert.deepEqual(config.socialPreviewImage, {
    alt: 'PapiFlix website preview',
    height: 630,
    path: '/icons/papiflix-social-preview-v2.jpg',
    type: 'image/jpeg',
    width: 1200,
  });
});
