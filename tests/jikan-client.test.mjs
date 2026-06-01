import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Test infrastructure (mirrors kitsu-client.test.mjs pattern)
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

// Stubs for modules the Jikan adapter depends on
const appConfigStub = {
  appConfig: {
    jikanApiBaseUrl: 'https://api.jikan.moe/v4',
    kitsuApiBaseUrl: 'https://kitsu.app/api/edge',
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
    malId: entry.malId,
  }),
};

const jikan = loadTsModuleWithRequire('lib/anime/jikan.ts', {
  stubs: {
    'server-only': {},
    '@/lib/config': appConfigStub,
    '@/lib/anime/episodes': episodesStub,
    '@/lib/slugs/media': slugsStub,
    '@/lib/media/types': typesStub,
  },
});

const { searchJikanAnime, fetchJikanTopAnime, fetchJikanAnimeById } = jikan;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('searchJikanAnime returns [] for an empty query', async () => {
  const entries = await searchJikanAnime('');
  assert.deepEqual(entries, []);
});

test('searchJikanAnime returns [] when fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  try {
    const entries = await searchJikanAnime('Naruto');
    assert.deepEqual(entries, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchJikanAnime maps a TV anime to a LibraryMediaEntry with malId', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          mal_id: 1,
          title: 'Cowboy Bebop',
          title_english: 'Cowboy Bebop',
          title_japanese: 'カウボーイビバップ',
          type: 'TV',
          episodes: 26,
          status: 'Finished Airing',
          aired: { from: '1998-04-03T00:00:00+00:00', prop: { from: { year: 1998 } } },
          score: 8.75,
          scored_by: 500000,
          year: 1998,
          synopsis: 'Bounty hunters in space.',
          images: {
            jpg: { image_url: 'https://example.com/poster.jpg', large_image_url: 'https://example.com/poster-large.jpg' },
            webp: { image_url: 'https://example.com/poster.webp', large_image_url: 'https://example.com/poster-large.webp' },
          },
        },
      ],
    }),
  });

  try {
    const entries = await searchJikanAnime('Cowboy Bebop');
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.id, 'mal-1');
    assert.equal(entry.title, 'Cowboy Bebop');
    assert.equal(entry.type, 'tv');
    assert.equal(entry.animeFormat, 'TV');
    assert.equal(entry.episodeCount, 26);
    assert.equal(entry.year, 1998);
    assert.equal(entry.rating, 8.75);
    assert.equal(entry.malId, '1');
    assert.equal(entry.posterUrl, 'https://example.com/poster-large.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchJikanAnime prefers title_english over title', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          mal_id: 21,
          title: 'ONE PIECE',
          title_english: 'One Piece',
          title_japanese: 'ワンピース',
          type: 'TV',
          episodes: null,
          status: 'Currently Airing',
          aired: { from: '1999-10-20T00:00:00+00:00' },
          score: 8.7,
          images: { jpg: { large_image_url: 'https://example.com/op.jpg' } },
        },
      ],
    }),
  });

  try {
    const entries = await searchJikanAnime('One Piece');
    assert.equal(entries.length, 1);
    // title_english "One Piece" is preferred over raw "ONE PIECE"
    assert.equal(entries[0].title, 'One Piece');
    // No episodes known -> defaults to 1
    assert.equal(entries[0].episodeCount, 1);
    // year is parsed from aired.from
    assert.equal(entries[0].year, 1999);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchJikanAnime maps a movie to type=movie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          mal_id: 199,
          title: 'Spirited Away',
          title_english: 'Spirited Away',
          title_japanese: '千と千尋の神隠し',
          type: 'Movie',
          episodes: 1,
          status: 'Finished Airing',
          aired: { from: '2001-07-20T00:00:00+00:00', prop: { from: { year: 2001 } } },
          score: 8.92,
          images: { jpg: { large_image_url: 'https://example.com/spirited.jpg' } },
        },
      ],
    }),
  });

  try {
    const entries = await searchJikanAnime('Spirited Away');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, 'movie');
    assert.equal(entries[0].animeFormat, 'MOVIE');
    assert.equal(entries[0].year, 2001);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchJikanAnime filters out not-yet-aired anime', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          mal_id: 50000,
          title: 'Future Anime',
          title_english: 'Future Anime',
          title_japanese: null,
          type: 'TV',
          episodes: 12,
          status: 'Not yet aired',
          aired: { from: '2099-01-01T00:00:00+00:00' },
          score: null,
          images: { jpg: { large_image_url: 'https://example.com/future.jpg' } },
        },
      ],
    }),
  });

  try {
    const entries = await searchJikanAnime('Future Anime');
    assert.equal(entries.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchJikanAnime clamps score <= 0 to undefined', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          mal_id: 100,
          title: 'Zero Score',
          title_english: 'Zero Score',
          title_japanese: null,
          type: 'TV',
          episodes: 1,
          status: 'Finished Airing',
          aired: { from: '2000-01-01T00:00:00+00:00' },
          score: 0,
          images: { jpg: { large_image_url: 'https://example.com/z.jpg' } },
        },
      ],
    }),
  });

  try {
    const entries = await searchJikanAnime('Zero Score');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].rating, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJikanAnimeById returns null for non-numeric id', async () => {
  const entry = await fetchJikanAnimeById('not-a-number');
  assert.equal(entry, null);
});

test('fetchJikanAnimeById returns null for id <= 0', async () => {
  const entry = await fetchJikanAnimeById('0');
  assert.equal(entry, null);
});

test('fetchJikanAnimeById returns the entry on a 200', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('/anime/1/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mal_id: 1,
            title: 'Cowboy Bebop',
            title_english: 'Cowboy Bebop',
            title_japanese: 'カウボーイビバップ',
            type: 'TV',
            episodes: 26,
            status: 'Finished Airing',
            aired: { from: '1998-04-03T00:00:00+00:00' },
            score: 8.75,
            images: { jpg: { large_image_url: 'https://example.com/poster.jpg' } },
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  try {
    const entry = await fetchJikanAnimeById('1');
    assert.ok(entry);
    assert.equal(entry.id, 'mal-1');
    assert.equal(entry.title, 'Cowboy Bebop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJikanAnimeById returns null on 404', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  try {
    const entry = await fetchJikanAnimeById('999999');
    assert.equal(entry, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchJikanTopAnime returns [] on upstream error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    const entries = await fetchJikanTopAnime();
    assert.deepEqual(entries, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
