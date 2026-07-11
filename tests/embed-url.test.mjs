import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

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
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) {
      return _require(specifier);
    }
    throw new Error(`Unexpected import while loading ${relativePath}: ${specifier}`);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, require, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

const { buildEzvidEmbedUrl, buildFilmuEmbedUrl, buildPlayerEmbedUrl, buildVidApiEmbedUrl, buildVidSrcEmbedUrl } = loadTsModuleWithRequire('lib/media/embed.ts', {
  stubs: {
    '@/lib/config': {
      appConfig: {
        ezvidEmbedBaseUrl: 'https://ezvidapi.com/embed',
        filmuEmbedBaseUrl: 'https://embed.filmu.in',
        multiEmbedBaseUrl: 'https://multiembed.mov',
        vidapiEmbedBaseUrl: 'https://vidapi.xyz/embed',
        vidsrcEmbedBaseUrl: 'https://vidsrc.to/embed',
        vidfastEmbedBaseUrl: 'https://vidfast.net',
        vidkingEmbedBaseUrl: 'https://www.vidking.net/embed',
      },
    },
    './types': {
      getEpisodeLimit: () => 1,
      isAnimeProvider: () => false,
      isTvEntry: (entry) => entry.type === 'tv',
    },
  },
});

const defaultPlayback = {
  autoPlay: true,
  color: 'e50914',
  episode: '1',
  language: 'sub',
  progress: null,
  season: '1',
};

test('buildFilmuEmbedUrl uses FilmU movie wrapper by TMDB ID', () => {
  const url = buildFilmuEmbedUrl(
    {
      id: '1726',
      provider: 'tmdb',
      title: 'Iron Man',
      type: 'movie',
    },
    defaultPlayback,
  );

  assert.equal(url, 'https://embed.filmu.in/movie/1726');
});

test('buildFilmuEmbedUrl uses FilmU TV wrapper by TMDB season and episode', () => {
  const url = buildFilmuEmbedUrl(
    {
      id: '132117',
      maxSeasons: 3,
      provider: 'tmdb',
      title: 'Example Show',
      type: 'tv',
    },
    {
      ...defaultPlayback,
      episode: '4',
      season: '2',
    },
  );

  assert.equal(url, 'https://embed.filmu.in/tv/132117/2/4');
});

test('buildEzvidEmbedUrl uses selected provider for movies', () => {
  const url = buildEzvidEmbedUrl(
    {
      id: '1726',
      provider: 'tmdb',
      title: 'Iron Man',
      type: 'movie',
    },
    defaultPlayback,
    'vidrock',
  );

  assert.equal(url, 'https://ezvidapi.com/embed/movie/1726?provider=vidrock');
});

test('buildEzvidEmbedUrl uses selected provider for TV episodes', () => {
  const url = buildEzvidEmbedUrl(
    {
      id: '60625',
      maxSeasons: 9,
      provider: 'tmdb',
      title: 'Rick and Morty',
      type: 'tv',
    },
    {
      ...defaultPlayback,
      episode: '2',
      season: '9',
    },
    'vidzee',
  );

  assert.equal(url, 'https://ezvidapi.com/embed/tv/60625/9/2?provider=vidzee');
});

test('buildVidApiEmbedUrl uses IMDb ID for movies', () => {
  const url = buildVidApiEmbedUrl(
    {
      id: '1726',
      provider: 'tmdb',
      title: 'Iron Man',
      type: 'movie',
    },
    defaultPlayback,
    'tt0371746',
  );

  assert.equal(url, 'https://vidapi.xyz/embed/movie/tt0371746');
});

test('buildVidSrcEmbedUrl uses vidsrc.to movie wrapper by TMDB ID', () => {
  const url = buildVidSrcEmbedUrl(
    {
      id: '1726',
      provider: 'tmdb',
      title: 'Iron Man',
      type: 'movie',
    },
    defaultPlayback,
  );

  assert.equal(url, 'https://vidsrc.to/embed/movie/1726');
});

test('buildVidSrcEmbedUrl uses vidsrc.to TV wrapper by TMDB season and episode', () => {
  const url = buildVidSrcEmbedUrl(
    {
      id: '1399',
      maxSeasons: 8,
      provider: 'tmdb',
      title: 'Game of Thrones',
      type: 'tv',
    },
    {
      ...defaultPlayback,
      episode: '3',
      season: '1',
    },
  );

  assert.equal(url, 'https://vidsrc.to/embed/tv/1399/1/3');
});

test('buildPlayerEmbedUrl selects the requested player and falls back when VidAPI has no IMDb ID', () => {
  const entry = {
    id: '1726',
    provider: 'tmdb',
    title: 'Iron Man',
    type: 'movie',
  };

  assert.equal(buildPlayerEmbedUrl(entry, defaultPlayback, '6'), 'https://embed.filmu.in/movie/1726');
  assert.equal(buildPlayerEmbedUrl(entry, defaultPlayback, '7'), 'https://www.vidking.net/embed/movie/1726?color=e50914&autoPlay=true');
  assert.equal(buildPlayerEmbedUrl(entry, defaultPlayback, '7', 'tt0371746'), 'https://vidapi.xyz/embed/movie/tt0371746');
});

test('buildVidApiEmbedUrl uses IMDb ID for TV with season and episode', () => {
  const url = buildVidApiEmbedUrl(
    {
      id: '60625',
      maxSeasons: 9,
      provider: 'tmdb',
      title: 'Rick and Morty',
      type: 'tv',
    },
    {
      ...defaultPlayback,
      episode: '2',
      season: '9',
    },
    'tt2861424',
  );

  assert.equal(url, 'https://vidapi.xyz/embed/tv/tt2861424/9/2');
});
