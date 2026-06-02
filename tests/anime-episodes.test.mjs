import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const episodes = loadTsModuleWithRequire('lib/anime/episodes.ts', {
  stubs: {
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
  getEpisodeCount,
  getStartDateTimestamp,
} = episodes;

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
const FAR_PAST = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365;

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

test('getAnilistTitle: prefers english', () => {
  const media = makeMedia({ title: { userPreferred: 'Preferred', english: 'English', romaji: 'Romaji', native: 'Native' } });
  assert.equal(getAnilistTitle(media), 'English');
});

test('getAnilistTitle: falls through to userPreferred when english missing', () => {
  const media = makeMedia({ title: { userPreferred: 'Preferred', english: null, romaji: null, native: null } });
  assert.equal(getAnilistTitle(media), 'Preferred');
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

test('getEpisodeCount: MOVIE format → 1 if released', () => {
  const media = makeMedia({ format: 'MOVIE', status: 'FINISHED' });
  assert.equal(getEpisodeCount(media), 1);
});

test('getEpisodeCount: MOVIE format → 0 if not released', () => {
  const media = makeMedia({ format: 'MOVIE', status: 'NOT_YET_RELEASED' });
  assert.equal(getEpisodeCount(media), 0);
});

test('getEpisodeCount: TV finished 12ep → 12', () => {
  const media = makeMedia({ format: 'TV', status: 'FINISHED', episodes: 12 });
  assert.equal(getEpisodeCount(media), 12);
});

test('getEpisodeCount: RELEASING TV uses next airing boundary when episode count is missing', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    episodes: null,
    nextAiringEpisode: { episode: 1165, airingAt: FAR_FUTURE },
  });
  assert.equal(getEpisodeCount(media), 1164);
});

test('getEpisodeCount: RELEASING TV prefers next airing boundary over stale episode field', () => {
  const media = makeMedia({
    format: 'TV',
    status: 'RELEASING',
    episodes: 1,
    nextAiringEpisode: { episode: 10, airingAt: FAR_FUTURE },
  });
  assert.equal(getEpisodeCount(media), 9);
});

test('getEpisodeCount: TV NOT_YET_RELEASED → 0', () => {
  const media = makeMedia({ format: 'TV', status: 'NOT_YET_RELEASED', episodes: 0 });
  assert.equal(getEpisodeCount(media), 0);
});

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
