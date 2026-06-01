import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    throw new Error(`Unexpected import while loading ${relativePath}: ${specifier}`);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

// Stub AniList search with a controllable response
const anilistStub = {
  _nextResults: [],
  _nextDelay: 0,
  searchAnilistAnime: async (query, perPage) => {
    if (anilistStub._nextDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, anilistStub._nextDelay));
    }
    return anilistStub._nextResults.slice(0, perPage);
  },
};

const episodesStub = {
  cleanText: (value) => (value == null ? '' : String(value).trim()),
};

const resolver = loadTsModuleWithRequire('lib/anime/resolve-streaming-id.ts', {
  stubs: {
    'server-only': {},
    '@/lib/anime/anilist': anilistStub,
    '@/lib/anime/episodes': episodesStub,
  },
});

const { resolveAnilistIdByTitle, clearResolvedStreamingIdCache } = resolver;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('returns null for an empty external title', async () => {
  const result = await resolveAnilistIdByTitle({ externalTitle: '   ' });
  assert.equal(result, null);
});

test('returns fallbackId when AniList search returns nothing', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [];
  const result = await resolveAnilistIdByTitle({
    externalTitle: 'Mystery Anime',
    fallbackId: '42',
  });
  assert.ok(result);
  assert.equal(result.anilistId, '42');
  assert.equal(result.confidence, 0);
});

test('returns null when no results and no fallback', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [];
  const result = await resolveAnilistIdByTitle({ externalTitle: 'No Match' });
  assert.equal(result, null);
});

test('matches the strongest candidate by title similarity', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 100,
      title: {
        userPreferred: 'Completely Different Show',
        english: 'A Whole Other Series',
        romaji: 'Betsu no Anime',
        native: '別のアニメ',
      },
      seasonYear: 2020,
      startDate: { year: 2020 },
    },
    {
      id: 200,
      title: {
        userPreferred: 'Cowboy Bebop',
        english: 'Cowboy Bebop',
        romaji: 'Cowboy Bebop',
        native: 'カウボーイビバップ',
      },
      seasonYear: 1998,
      startDate: { year: 1998 },
    },
  ];

  const result = await resolveAnilistIdByTitle({
    externalTitle: 'Cowboy Bebop',
    externalYear: 1998,
  });
  assert.ok(result);
  assert.equal(result.anilistId, '200');
  assert.ok(result.confidence >= 0.55, `Expected confidence >= 0.55, got ${result.confidence}`);
});

test('falls back to fallbackId when the best match is below confidence threshold', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 100,
      title: {
        userPreferred: 'Some Unrelated Show',
        english: 'A Different Title',
        romaji: 'Matawa',
        native: '別の作品',
      },
      seasonYear: 2010,
      startDate: { year: 2010 },
    },
  ];

  const result = await resolveAnilistIdByTitle({
    externalTitle: 'Cowboy Bebop',
    externalYear: 1998,
    fallbackId: '9999',
  });
  assert.ok(result);
  assert.equal(result.anilistId, '9999');
});

test('caches the resolution for 24 hours (second call skips AniList)', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 300,
      title: {
        userPreferred: 'Cached Show',
        english: 'Cached Show',
        romaji: 'Cached Show',
        native: 'キャッシュ',
      },
      seasonYear: 2024,
      startDate: { year: 2024 },
    },
  ];

  const first = await resolveAnilistIdByTitle({ externalTitle: 'Cached Show' });
  assert.ok(first);
  assert.equal(first.anilistId, '300');

  // Now flip the AniList results — cached resolution should still return the
  // first answer.
  anilistStub._nextResults = [
    {
      id: 9999,
      title: {
        userPreferred: 'Different Result',
        english: 'Different Result',
        romaji: 'Different Result',
        native: '違う',
      },
      seasonYear: 2099,
      startDate: { year: 2099 },
    },
  ];

  const second = await resolveAnilistIdByTitle({ externalTitle: 'Cached Show' });
  assert.ok(second);
  assert.equal(second.anilistId, '300');
});

test('clearResolvedStreamingIdCache forces a fresh AniList lookup', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 400,
      title: { userPreferred: 'A', english: 'A', romaji: 'A', native: 'A' },
      seasonYear: 2020,
      startDate: { year: 2020 },
    },
  ];
  const first = await resolveAnilistIdByTitle({ externalTitle: 'A' });
  assert.equal(first?.anilistId, '400');

  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 500,
      title: { userPreferred: 'A', english: 'A', romaji: 'A', native: 'A' },
      seasonYear: 2020,
      startDate: { year: 2020 },
    },
  ];
  const second = await resolveAnilistIdByTitle({ externalTitle: 'A' });
  assert.equal(second?.anilistId, '500');
});

test('strips "season N" / "part N" suffixes when comparing titles', async () => {
  clearResolvedStreamingIdCache();
  anilistStub._nextResults = [
    {
      id: 600,
      title: {
        userPreferred: 'Attack on Titan',
        english: 'Attack on Titan',
        romaji: 'Shingeki no Kyojin',
        native: '進撃の巨人',
      },
      seasonYear: 2013,
      startDate: { year: 2013 },
    },
  ];

  // External title has a "season 2" suffix that should be stripped before scoring.
  const result = await resolveAnilistIdByTitle({
    externalTitle: 'Attack on Titan Season 2',
    externalYear: 2013,
  });
  assert.ok(result);
  assert.equal(result.anilistId, '600');
});
