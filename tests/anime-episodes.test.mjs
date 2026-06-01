import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Test infrastructure (mirrors watch-history.test.mjs pattern)
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

// Minimal AniZip stubs used by episodes.ts
const aniZipStub = {
  listAniZipEpisodes(mappings) {
    const episodes = mappings?.episodes ?? {};
    return Object.entries(episodes)
      .map(([key, value]) => ({
        ...value,
        episodeNumber: value?.episodeNumber ?? (Number.parseInt(key, 10) || null),
      }))
      .filter((ep) => typeof ep.episodeNumber === 'number' && ep.episodeNumber > 0)
      .sort((a, b) => a.episodeNumber - b.episodeNumber);
  },
  getAniZipEpisodeTitle(episode) {
    return episode?.title?.en?.trim() || episode?.title?.['x-jat']?.trim() || episode?.title?.ja?.trim() || '';
  },
};

const episodes = loadTsModuleWithRequire('lib/anime/episodes.ts', {
  stubs: {
    '@/lib/anime/ani-zip': aniZipStub,
    '@/lib/media/types': {},
    '@/lib/anime/anilist': {},
  },
});

const {
  cleanText,
  cleanSynopsis,
  mapAnilistFormatToMediaType,
  getAnilistTitle,
  getBackdropUrl,
  getPosterUrl,
  isReleasedAnime,
  getReleasedEpisodeCount,
  getVisibleEpisodeCount,
  getNextEpisodeInfo,
  getEpisodeCount,
  isAniZipEpisodeReleased,
  isAniZipEpisodeScheduled,
  getUpcomingEpisodeBoundary,
  getStartDateTimestamp,
} = episodes;

// ---------------------------------------------------------------------------
// Helpers for building test fixtures
// ---------------------------------------------------------------------------

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year from now
const FAR_PAST = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365;   // 1 year ago
const TOMORROW = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
const YESTERDAY = Math.floor(Date.now() / 1000) - 60 * 60 * 24;

function makeMedia(overrides = {}) {
  return {
    id: 1,
    title: {
      userPreferred: 'Test Anime',
      english: 'Test Anime EN',
      romaji: 'Test Anime Romaji',
      native: 'テストアニメ',
    },
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    averageScore: 80,
    startDate: { year: 2020, month: 4, day: 1 },
    ...overrides,
  };
}

function makeMappings(episodeList) {
  const episodes = {};
  for (const ep of episodeList) {
    episodes[String(ep.episodeNumber)] = {
      episodeNumber: ep.episodeNumber,
      airDate: ep.airDate ?? null,
      title: ep.title ? { en: ep.title } : null,
      runtime: ep.runtime ?? null,
      overview: ep.overview ?? null,
    };
  }
  return { episodes };
}

// ---------------------------------------------------------------------------
// cleanText
// ---------------------------------------------------------------------------

test('cleanText: null/undefined → empty string', () => {
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('cleanText: trims whitespace', () => {
  assert.equal(cleanText('  hello  '), 'hello');
});

test('cleanText: normalises CRLF to LF', () => {
  assert.equal(cleanText('line1\r\nline2'), 'line1\nline2');
});

test('cleanText: converts numbers to strings', () => {
  assert.equal(cleanText(42), '42');
});

// ---------------------------------------------------------------------------
// cleanSynopsis
// ---------------------------------------------------------------------------

test('cleanSynopsis: strips HTML tags', () => {
  assert.equal(cleanSynopsis('<p>Hello <b>world</b></p>'), 'Hello world');
});

test('cleanSynopsis: converts <br> to newline', () => {
  assert.equal(cleanSynopsis('line1<br/>line2'), 'line1\nline2');
});

test('cleanSynopsis: collapses triple+ newlines', () => {
  const input = 'a\n\n\n\nb';
  assert.equal(cleanSynopsis(input), 'a\n\nb');
});

test('cleanSynopsis: decodes HTML entities', () => {
  assert.equal(cleanSynopsis('Rock &amp; Roll &lt;3 &quot;music&quot;'), "Rock & Roll <3 \"music\"");
});

test('cleanSynopsis: handles null', () => {
  assert.equal(cleanSynopsis(null), '');
});

// ---------------------------------------------------------------------------
// mapAnilistFormatToMediaType
// ---------------------------------------------------------------------------

test('mapAnilistFormatToMediaType: MOVIE → movie', () => {
  assert.equal(mapAnilistFormatToMediaType('MOVIE'), 'movie');
});

test('mapAnilistFormatToMediaType: TV → tv', () => {
  assert.equal(mapAnilistFormatToMediaType('TV'), 'tv');
});

test('mapAnilistFormatToMediaType: OVA → tv', () => {
  assert.equal(mapAnilistFormatToMediaType('OVA'), 'tv');
});

test('mapAnilistFormatToMediaType: null → tv (default)', () => {
  assert.equal(mapAnilistFormatToMediaType(null), 'tv');
});

test('mapAnilistFormatToMediaType: undefined → tv (default)', () => {
  assert.equal(mapAnilistFormatToMediaType(undefined), 'tv');
});

// ---------------------------------------------------------------------------
// getAnilistTitle
// ---------------------------------------------------------------------------

test('getAnilistTitle: prefers userPreferred', () => {
  const media = makeMedia({ title: { userPreferred: 'Preferred', english: 'English', romaji: 'Romaji', native: 'Native' } });
  assert.equal(getAnilistTitle(media), 'Preferred');
});

test('getAnilistTitle: falls through to english when userPreferred missing', () => {
  const media = makeMedia({ title: { userPreferred: null, english: 'English Title', romaji: null, native: null } });
  assert.equal(getAnilistTitle(media), 'English Title');
});

test('getAnilistTitle: falls through to romaji', () => {
  const media = makeMedia({ title: { userPreferred: null, english: null, romaji: 'Romaji Title', native: null } });
  assert.equal(getAnilistTitle(media), 'Romaji Title');
});

test('getAnilistTitle: falls through to native', () => {
  const media = makeMedia({ title: { userPreferred: null, english: null, romaji: null, native: 'Native Title' } });
  assert.equal(getAnilistTitle(media), 'Native Title');
});

test('getAnilistTitle: falls back to AniList ID', () => {
  const media = makeMedia({ id: 999, title: { userPreferred: null, english: null, romaji: null, native: null } });
  assert.equal(getAnilistTitle(media), 'AniList 999');
});

// ---------------------------------------------------------------------------
// getBackdropUrl / getPosterUrl
// ---------------------------------------------------------------------------

test('getBackdropUrl: returns bannerImage when present', () => {
  const media = makeMedia({ bannerImage: 'https://cdn/banner.jpg', coverImage: { extraLarge: 'https://cdn/cover.jpg' } });
  assert.equal(getBackdropUrl(media), 'https://cdn/banner.jpg');
});

test('getBackdropUrl: falls back to coverImage.extraLarge', () => {
  const media = makeMedia({ bannerImage: null, coverImage: { extraLarge: 'https://cdn/cover.jpg', large: 'https://cdn/large.jpg' } });
  assert.equal(getBackdropUrl(media), 'https://cdn/cover.jpg');
});

test('getBackdropUrl: returns undefined when all empty', () => {
  const media = makeMedia({ bannerImage: null, coverImage: null });
  assert.equal(getBackdropUrl(media), undefined);
});

test('getPosterUrl: prefers coverImage.extraLarge', () => {
  const media = makeMedia({ coverImage: { extraLarge: 'https://cdn/xl.jpg', large: 'https://cdn/lg.jpg' } });
  assert.equal(getPosterUrl(media), 'https://cdn/xl.jpg');
});

test('getPosterUrl: falls back to backdrop', () => {
  const media = makeMedia({ bannerImage: 'https://cdn/banner.jpg', coverImage: null });
  assert.equal(getPosterUrl(media), 'https://cdn/banner.jpg');
});

// ---------------------------------------------------------------------------
// isReleasedAnime
// ---------------------------------------------------------------------------

test('isReleasedAnime: NOT_YET_RELEASED status → false', () => {
  const media = makeMedia({ status: 'NOT_YET_RELEASED' });
  assert.equal(isReleasedAnime(media), false);
});

test('isReleasedAnime: FINISHED status, past start date → true', () => {
  const media = makeMedia({ status: 'FINISHED', startDate: { year: 2020, month: 1, day: 1 } });
  assert.equal(isReleasedAnime(media), true);
});

test('isReleasedAnime: first episode in the future → false', () => {
  const media = makeMedia({
    status: 'RELEASING',
    nextAiringEpisode: { episode: 1, airingAt: FAR_FUTURE },
    startDate: null,
  });
  assert.equal(isReleasedAnime(media), false);
});

test('isReleasedAnime: start date in the future → false', () => {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const media = makeMedia({
    status: 'NOT_YET_RELEASED',
    startDate: { year: nextYear.getFullYear(), month: 1, day: 1 },
  });
  assert.equal(isReleasedAnime(media), false);
});

test('isReleasedAnime: RELEASING with episode 2 airing soon → true', () => {
  const media = makeMedia({
    status: 'RELEASING',
    nextAiringEpisode: { episode: 2, airingAt: FAR_FUTURE },
  });
  assert.equal(isReleasedAnime(media), true);
});

// ---------------------------------------------------------------------------
// getReleasedEpisodeCount
// ---------------------------------------------------------------------------

test('getReleasedEpisodeCount: MOVIE format → 1 if released', () => {
  const media = makeMedia({ format: 'MOVIE', status: 'FINISHED' });
  assert.equal(getReleasedEpisodeCount(media), 1);
});

test('getReleasedEpisodeCount: MOVIE format → 0 if not released', () => {
  const media = makeMedia({ format: 'MOVIE', status: 'NOT_YET_RELEASED' });
  assert.equal(getReleasedEpisodeCount(media), 0);
});

test('getReleasedEpisodeCount: FINISHED TV with episodes field → episode count', () => {
  const media = makeMedia({ format: 'TV', status: 'FINISHED', episodes: 24 });
  assert.equal(getReleasedEpisodeCount(media), 24);
});

test('getReleasedEpisodeCount: RELEASING TV, uses upcoming boundary', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    episodes: null,
    nextAiringEpisode: { episode: 5, airingAt: TOMORROW },
  });
  // upcomingEpisodeBoundary = 5, so released = max(5-1, 0) = 4
  assert.equal(getReleasedEpisodeCount(media), 4);
});

test('getReleasedEpisodeCount: RELEASING TV, no boundary, uses AniZip episodes', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    episodes: null,
    nextAiringEpisode: null,
  });
  const pastDate = '2020-01-01';
  const mappings = makeMappings([
    { episodeNumber: 1, airDate: pastDate },
    { episodeNumber: 2, airDate: pastDate },
    { episodeNumber: 3, airDate: pastDate },
  ]);
  assert.equal(getReleasedEpisodeCount(media, mappings), 3);
});

// ---------------------------------------------------------------------------
// getEpisodeCount
// ---------------------------------------------------------------------------

test('getEpisodeCount: MOVIE → always 1', () => {
  const media = makeMedia({ format: 'MOVIE', status: 'FINISHED', episodes: 0 });
  assert.equal(getEpisodeCount(media), 1);
});

test('getEpisodeCount: TV min 1', () => {
  // NOT_YET_RELEASED → releasedEpisodeCount = 0, getEpisodeCount clamps to 1
  const media = makeMedia({ format: 'TV', status: 'NOT_YET_RELEASED', episodes: 0 });
  assert.equal(getEpisodeCount(media), 1);
});

test('getEpisodeCount: TV finished 12ep → 12', () => {
  const media = makeMedia({ format: 'TV', status: 'FINISHED', episodes: 12 });
  assert.equal(getEpisodeCount(media), 12);
});

// ---------------------------------------------------------------------------
// getNextEpisodeInfo
// ---------------------------------------------------------------------------

test('getNextEpisodeInfo: non-tv entry → empty object', () => {
  const media = makeMedia({ format: 'MOVIE' });
  assert.deepEqual(getNextEpisodeInfo(media), {});
});

test('getNextEpisodeInfo: not yet released → empty object', () => {
  const media = makeMedia({ format: 'TV', status: 'NOT_YET_RELEASED' });
  assert.deepEqual(getNextEpisodeInfo(media), {});
});

test('getNextEpisodeInfo: airing in the future → returns episode info', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    nextAiringEpisode: { episode: 7, airingAt: FAR_FUTURE },
  });
  const result = getNextEpisodeInfo(media);
  assert.equal(result.nextEpisodeNumber, 7);
  assert.equal(result.nextEpisodeAt, FAR_FUTURE);
});

test('getNextEpisodeInfo: airing time in the past → empty object', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    nextAiringEpisode: { episode: 7, airingAt: FAR_PAST },
  });
  assert.deepEqual(getNextEpisodeInfo(media), {});
});

// ---------------------------------------------------------------------------
// getUpcomingEpisodeBoundary
// ---------------------------------------------------------------------------

test('getUpcomingEpisodeBoundary: no nextAiringEpisode → null', () => {
  const media = makeMedia({ nextAiringEpisode: null });
  assert.equal(getUpcomingEpisodeBoundary(media), null);
});

test('getUpcomingEpisodeBoundary: future airing → episode number', () => {
  const media = makeMedia({ nextAiringEpisode: { episode: 3, airingAt: FAR_FUTURE } });
  assert.equal(getUpcomingEpisodeBoundary(media), 3);
});

test('getUpcomingEpisodeBoundary: airing time in the past → null', () => {
  const media = makeMedia({ nextAiringEpisode: { episode: 3, airingAt: FAR_PAST } });
  assert.equal(getUpcomingEpisodeBoundary(media), null);
});

// ---------------------------------------------------------------------------
// isAniZipEpisodeReleased / isAniZipEpisodeScheduled
// ---------------------------------------------------------------------------

test('isAniZipEpisodeReleased: no airDate → true (assume released)', () => {
  assert.equal(isAniZipEpisodeReleased({ airDate: null }), true);
});

test('isAniZipEpisodeReleased: past airDate → true', () => {
  assert.equal(isAniZipEpisodeReleased({ airDate: '2020-01-01' }), true);
});

test('isAniZipEpisodeReleased: future airDate → false', () => {
  const nextYear = new Date().getUTCFullYear() + 1;
  assert.equal(isAniZipEpisodeReleased({ airDate: `${nextYear}-01-01` }), false);
});

test('isAniZipEpisodeScheduled: no airDate → false', () => {
  assert.equal(isAniZipEpisodeScheduled({ airDate: null }), false);
});

test('isAniZipEpisodeScheduled: future airDate → true', () => {
  const nextYear = new Date().getUTCFullYear() + 1;
  assert.equal(isAniZipEpisodeScheduled({ airDate: `${nextYear}-01-01` }), true);
});

test('isAniZipEpisodeScheduled: past airDate → false', () => {
  assert.equal(isAniZipEpisodeScheduled({ airDate: '2020-01-01' }), false);
});

// ---------------------------------------------------------------------------
// getStartDateTimestamp
// ---------------------------------------------------------------------------

test('getStartDateTimestamp: no year → null', () => {
  const media = makeMedia({ startDate: { year: null, month: 4, day: 1 } });
  assert.equal(getStartDateTimestamp(media), null);
});

test('getStartDateTimestamp: valid date → UTC timestamp', () => {
  const media = makeMedia({ startDate: { year: 2020, month: 1, day: 1 } });
  const ts = getStartDateTimestamp(media);
  assert.equal(ts, Date.UTC(2020, 0, 1));
});

test('getStartDateTimestamp: missing month defaults to January', () => {
  const media = makeMedia({ startDate: { year: 2021, month: null, day: null } });
  const ts = getStartDateTimestamp(media);
  assert.equal(ts, Date.UTC(2021, 0, 1));
});
