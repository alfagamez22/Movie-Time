import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Test infrastructure (mirrors anime-episodes.test.mjs pattern)
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

// Stubs for modules the Kitsu adapter depends on
const appConfigStub = {
  appConfig: {
    kitsuApiBaseUrl: 'https://kitsu.app/api/edge',
    jikanApiBaseUrl: 'https://api.jikan.moe/v4',
  },
};

const episodesStub = {
  cleanSynopsis: (value) => (value == null ? '' : String(value).replace(/<[^>]+>/g, '').trim()),
  cleanText: (value) => (value == null ? '' : String(value).trim()),
};

const slugsStub = {
  normalizeSlug: (value) => (value ? String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : ''),
};

const typesStub = {
  toLibraryMediaEntry: (entry) => ({
    id: entry.id,
    title: entry.title,
    type: entry.type,
    provider: entry.provider,
    posterUrl: entry.posterUrl,
    backdropUrl: entry.backdropUrl,
    synopsis: entry.synopsis,
    year: entry.year,
    rating: entry.rating,
    episodeCount: entry.episodeCount,
    animeFormat: entry.animeFormat,
  }),
};

const kitsu = loadTsModuleWithRequire('lib/anime/kitsu.ts', {
  stubs: {
    'server-only': {},
    '@/lib/config': appConfigStub,
    '@/lib/anime/episodes': episodesStub,
    '@/lib/slugs/media': slugsStub,
    '@/lib/media/types': typesStub,
  },
});

const { searchKitsuAnime, fetchKitsuTrendingAnime, fetchKitsuAnimeById } = kitsu;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('searchKitsuAnime returns [] for an empty query', async () => {
  const entries = await searchKitsuAnime('');
  assert.deepEqual(entries, []);
});

test('searchKitsuAnime returns [] when fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
  try {
    const entries = await searchKitsuAnime('Naruto');
    assert.deepEqual(entries, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchKitsuAnime maps a TV anime resource to a LibraryMediaEntry', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('/anime?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: '1',
              type: 'anime',
              attributes: {
                titles: { en: 'Cowboy Bebop', ja_jp: 'カウボーイビバップ' },
                slug: 'cowboy-bebop',
                description: 'Bounty hunters in space.',
                startDate: '1998-04-03',
                status: 'finished',
                showType: 'tv',
                episodeCount: 26,
                episodeLength: 24,
                posterImage: { original: 'https://example.com/poster.jpg' },
                coverImage: { original: 'https://example.com/cover.jpg' },
                averageRating: '86.5',
                userCount: 12000,
              },
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const entries = await searchKitsuAnime('Cowboy Bebop');
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.id, 'kitsu-1');
    assert.equal(entry.title, 'Cowboy Bebop');
    assert.equal(entry.type, 'tv');
    assert.equal(entry.provider, 'anilist');
    assert.equal(entry.episodeCount, 26);
    assert.equal(entry.animeFormat, 'TV');
    assert.equal(entry.year, 1998);
    assert.equal(entry.rating, 8.65);
    assert.equal(entry.posterUrl, 'https://example.com/poster.jpg');
    assert.equal(entry.backdropUrl, 'https://example.com/cover.jpg');
    assert.equal(entry.synopsis, 'Bounty hunters in space.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchKitsuAnime maps a movie anime resource to type=movie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          id: '50',
          type: 'anime',
          attributes: {
            titles: { en: 'Spirited Away', ja_jp: '千と千尋の神隠し' },
            slug: 'spirited-away',
            description: 'A girl enters a spirit world.',
            startDate: '2001-07-20',
            status: 'finished',
            showType: 'movie',
            episodeCount: 1,
            posterImage: { original: 'https://example.com/spirited.jpg' },
            coverImage: null,
            averageRating: '92.0',
            userCount: 50000,
          },
        },
      ],
    }),
  });

  try {
    const entries = await searchKitsuAnime('Spirited Away');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'movie');
    assert.equal(entries[0].animeFormat, 'MOVIE');
    assert.equal(entries[0].episodeCount, 1);
    assert.equal(entries[0].rating, 9.2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchKitsuAnime filters out unreleased anime (status=upcoming)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          id: '100',
          type: 'anime',
          attributes: {
            titles: { en: 'Future Anime' },
            slug: 'future-anime',
            description: 'Not out yet.',
            startDate: '2099-01-01',
            status: 'upcoming',
            showType: 'tv',
            episodeCount: 12,
            posterImage: { original: 'https://example.com/future.jpg' },
            coverImage: null,
            averageRating: null,
            userCount: 100,
          },
        },
      ],
    }),
  });

  try {
    const entries = await searchKitsuAnime('Future Anime');
    assert.equal(entries.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchKitsuAnime normalises a 0.0 averageRating to undefined', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          id: '200',
          type: 'anime',
          attributes: {
            titles: { en: 'Zero Rated' },
            slug: 'zero-rated',
            description: '',
            startDate: '2020-01-01',
            status: 'finished',
            showType: 'tv',
            episodeCount: 12,
            posterImage: { original: 'https://example.com/z.jpg' },
            coverImage: null,
            averageRating: '0',
            userCount: 0,
          },
        },
      ],
    }),
  });

  try {
    const entries = await searchKitsuAnime('Zero Rated');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].rating, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchKitsuAnimeById returns null on non-OK response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  try {
    const entry = await fetchKitsuAnimeById('9999');
    assert.equal(entry, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchKitsuAnimeById returns null for empty id', async () => {
  const entry = await fetchKitsuAnimeById('');
  assert.equal(entry, null);
});

test('fetchKitsuTrendingAnime uses sort=-userCount filter', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    };
  };

  try {
    const entries = await fetchKitsuTrendingAnime();
    assert.equal(entries.length, 0);
    assert.ok(capturedUrl.includes('filter%5Bstatus%5D=current'), `Expected current-status filter, got: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('sort=-userCount'), `Expected -userCount sort, got: ${capturedUrl}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
