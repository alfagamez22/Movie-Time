import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import ts from 'typescript';

function loadDiskCache(cacheRoot) {
  const source = `
    import { join, resolve } from 'node:path';
    module.exports = require(${JSON.stringify(new URL('../lib/images/disk-cache.ts', import.meta.url).pathname)});
  `;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const runtime = { exports: {} };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtime.exports, (s) => (s === 'node:path' ? require('node:path') : require(s)), runtime, __filename, __dirname);
  const factory = runtime.exports;
  return factory;
}

async function importDiskCache() {
  const url = new URL('../lib/images/disk-cache.ts', import.meta.url).pathname;
  return await import(url);
}

test('buildCacheKey is deterministic and varies by size+format+path', async () => {
  const cache = await importDiskCache();
  const a = cache.buildCacheKey({ format: 'avif', imagePath: '/abc.jpg', size: 'w300' });
  const b = cache.buildCacheKey({ format: 'avif', imagePath: '/abc.jpg', size: 'w300' });
  const c = cache.buildCacheKey({ format: 'avif', imagePath: '/abc.jpg', size: 'w780' });
  const d = cache.buildCacheKey({ format: 'webp', imagePath: '/abc.jpg', size: 'w300' });
  const e = cache.buildCacheKey({ format: 'avif', imagePath: '/xyz.jpg', size: 'w300' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.notEqual(a, e);
});

test('write then find round-trips on disk', async () => {
  const cache = await importDiskCache();
  const root = mkdtempSync(join(tmpdir(), 'imgcache-'));
  const config = { cacheRoot: root, maxBytes: 1024 * 1024 };
  try {
    const target = await cache.writeCacheEntry(
      config,
      { format: 'jpeg', imagePath: '/sample.jpg', size: 'w300' },
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    );
    const stats = statSync(target);
    assert.ok(stats.size > 0);
    const found = cache.findCacheEntry(config, { format: 'jpeg', imagePath: '/sample.jpg', size: 'w300' });
    assert.equal(found, target);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('maybeEvict drops oldest files until under cap', async () => {
  const cache = await importDiskCache();
  const root = mkdtempSync(join(tmpdir(), 'imgcache-'));
  const config = { cacheRoot: root, maxBytes: 5 * 1024 };
  try {
    for (let i = 0; i < 5; i++) {
      const buf = Buffer.alloc(1024, i + 1);
      await cache.writeCacheEntry(
        config,
        { format: 'jpeg', imagePath: `/file-${i}.jpg`, size: 'w300' },
        buf,
      );
      // Stagger mtimes so eviction is deterministic.
      const past = new Date(Date.now() - (5 - i) * 60_000);
      utimesSync(join(root, 'w300', `${cache.buildCacheKey({ format: 'jpeg', imagePath: `/file-${i}.jpg`, size: 'w300' })}.jpg`), past, past);
    }
    await cache.maybeEvict(config);
    const total = await cache.totalCacheBytes(config);
    assert.ok(total <= config.maxBytes, `expected total (${total}) <= max (${config.maxBytes})`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findCacheEntry returns null when entry is absent', async () => {
  const cache = await importDiskCache();
  const root = mkdtempSync(join(tmpdir(), 'imgcache-'));
  try {
    const result = cache.findCacheEntry(
      { cacheRoot: root, maxBytes: 1024 },
      { format: 'avif', imagePath: '/missing.jpg', size: 'w780' },
    );
    assert.equal(result, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
