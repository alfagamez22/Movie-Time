import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function loadTsModuleWithRequire(relativePath, options = {}) {
  const filename = resolve(__dirname, '..', relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const runtimeModule = { exports: {} };
  const stubs = options.stubs ?? {};
  const require = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
      return stubs[specifier];
    }
    // Pass real node_modules through
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) {
      return _require(specifier);
    }
    throw new Error(`Unexpected import while loading ${relativePath}: ${specifier}`);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

const { parseVidNestPlaybackRecord } = loadTsModuleWithRequire('lib/anime/vidnest-schema.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid payload that `parseVidNestPlaybackRecord` should accept. */
function minimalPayload(overrides = {}) {
  return {
    success: true,
    status: 200,
    sources: [{ file: 'https://cdn.example.com/ep1.m3u8', type: 'hls', quality: '1080p' }],
    tracks: [],
    intro: { start: 0, end: 90 },
    outro: { start: 1300, end: 1380 },
    metadata: { title: 'Test Anime', image: 'https://img.example.com/thumb.jpg', poster: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseVidNestPlaybackRecord — happy paths
// ---------------------------------------------------------------------------

test('returns parsed record for a minimal valid payload', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload());
  assert.ok(result !== null);
  assert.equal(result.success, true);
  assert.equal(result.status, 200);
});

test('preserves sources array', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload());
  assert.ok(result !== null);
  assert.equal(result.sources?.length, 1);
  assert.equal(result.sources?.[0].file, 'https://cdn.example.com/ep1.m3u8');
  assert.equal(result.sources?.[0].type, 'hls');
  assert.equal(result.sources?.[0].quality, '1080p');
});

test('preserves intro and outro markers', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload());
  assert.ok(result !== null);
  assert.deepEqual(result.intro, { start: 0, end: 90 });
  assert.deepEqual(result.outro, { start: 1300, end: 1380 });
});

test('preserves metadata fields', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload());
  assert.ok(result !== null);
  assert.equal(result.metadata?.title, 'Test Anime');
  assert.equal(result.metadata?.image, 'https://img.example.com/thumb.jpg');
  assert.equal(result.metadata?.poster, null);
});

test('accepts string status as well as numeric', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ status: 'ok' }));
  assert.ok(result !== null);
  assert.equal(result.status, 'ok');
});

test('accepts payload with tracks', () => {
  const payload = minimalPayload({
    tracks: [
      { file: 'https://cdn.example.com/sub_en.vtt', kind: 'captions', label: 'English', srclang: 'en', lang: 'en', default: true },
      { file: 'https://cdn.example.com/sub_jp.vtt', kind: 'captions', label: 'Japanese', srclang: 'ja', lang: 'ja', default: false },
    ],
  });
  const result = parseVidNestPlaybackRecord(payload);
  assert.ok(result !== null);
  assert.equal(result.tracks?.length, 2);
  assert.equal(result.tracks?.[0].label, 'English');
  assert.equal(result.tracks?.[1].srclang, 'ja');
});

test('accepts payload with multiple sources of different qualities', () => {
  const payload = minimalPayload({
    sources: [
      { file: 'https://cdn.example.com/ep1_1080.m3u8', type: 'hls', quality: '1080p' },
      { file: 'https://cdn.example.com/ep1_720.m3u8', type: 'hls', quality: '720p' },
      { file: 'https://cdn.example.com/ep1_480.m3u8', type: 'hls', quality: '480p' },
    ],
  });
  const result = parseVidNestPlaybackRecord(payload);
  assert.ok(result !== null);
  assert.equal(result.sources?.length, 3);
});

// ---------------------------------------------------------------------------
// Nullable / missing field handling
// ---------------------------------------------------------------------------

test('accepts payload where sources is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ sources: null }));
  assert.ok(result !== null);
  assert.equal(result.sources, null);
});

test('accepts payload where sources is missing', () => {
  const { sources: _s, ...rest } = minimalPayload();
  const result = parseVidNestPlaybackRecord(rest);
  assert.ok(result !== null);
  assert.equal(result.sources, undefined);
});

test('accepts payload where tracks is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ tracks: null }));
  assert.ok(result !== null);
  assert.equal(result.tracks, null);
});

test('accepts payload where intro is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ intro: null }));
  assert.ok(result !== null);
  assert.equal(result.intro, null);
});

test('accepts payload where outro is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ outro: null }));
  assert.ok(result !== null);
  assert.equal(result.outro, null);
});

test('accepts payload where metadata is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ metadata: null }));
  assert.ok(result !== null);
  assert.equal(result.metadata, null);
});

test('accepts payload where success is false (error state)', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ success: false, error: 'Not found', sources: null }));
  assert.ok(result !== null);
  assert.equal(result.success, false);
  assert.equal(result.error, 'Not found');
});

test('accepts payload where success is null', () => {
  const result = parseVidNestPlaybackRecord(minimalPayload({ success: null }));
  assert.ok(result !== null);
  assert.equal(result.success, null);
});

test('accepts fully empty object', () => {
  // All fields are optional, so {} should be valid
  const result = parseVidNestPlaybackRecord({});
  assert.ok(result !== null);
});

// ---------------------------------------------------------------------------
// Source record field validation
// ---------------------------------------------------------------------------

test('source record allows url field as alias for file', () => {
  const payload = minimalPayload({
    sources: [{ url: 'https://cdn.example.com/ep1.mp4', type: 'mp4', quality: '720p' }],
  });
  const result = parseVidNestPlaybackRecord(payload);
  assert.ok(result !== null);
  assert.equal(result.sources?.[0].url, 'https://cdn.example.com/ep1.mp4');
});

test('source record allows all fields to be null', () => {
  const payload = minimalPayload({
    sources: [{ file: null, url: null, type: null, quality: null }],
  });
  const result = parseVidNestPlaybackRecord(payload);
  assert.ok(result !== null);
  assert.equal(result.sources?.[0].file, null);
});

// ---------------------------------------------------------------------------
// Track record field validation
// ---------------------------------------------------------------------------

test('track record allows all fields to be null', () => {
  const payload = minimalPayload({
    tracks: [{ file: null, kind: null, label: null, srclang: null, lang: null, default: null }],
  });
  const result = parseVidNestPlaybackRecord(payload);
  assert.ok(result !== null);
  assert.equal(result.tracks?.[0].label, null);
});

test('track default field accepts true/false/null', () => {
  for (const val of [true, false, null]) {
    const payload = minimalPayload({ tracks: [{ file: 'sub.vtt', default: val }] });
    const result = parseVidNestPlaybackRecord(payload);
    assert.ok(result !== null, `should accept default=${val}`);
    assert.equal(result.tracks?.[0].default, val);
  }
});

// ---------------------------------------------------------------------------
// Rejection / null return paths
// ---------------------------------------------------------------------------

test('returns null for null input', () => {
  const result = parseVidNestPlaybackRecord(null);
  assert.equal(result, null);
});

test('returns null for undefined input', () => {
  const result = parseVidNestPlaybackRecord(undefined);
  assert.equal(result, null);
});

test('returns null for a plain string', () => {
  const result = parseVidNestPlaybackRecord('not an object');
  assert.equal(result, null);
});

test('returns null for a number', () => {
  const result = parseVidNestPlaybackRecord(42);
  assert.equal(result, null);
});

test('returns null for an array at top level', () => {
  const result = parseVidNestPlaybackRecord([{ sources: [] }]);
  assert.equal(result, null);
});

test('returns null when sources contains a non-object element', () => {
  const payload = minimalPayload({ sources: ['bad-string-element'] });
  const result = parseVidNestPlaybackRecord(payload);
  assert.equal(result, null);
});

test('returns null when tracks contains a non-object element', () => {
  const payload = minimalPayload({ tracks: [42] });
  const result = parseVidNestPlaybackRecord(payload);
  assert.equal(result, null);
});
