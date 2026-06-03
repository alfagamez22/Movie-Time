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

const { buildEzvidEmbedUrl, buildFilmuEmbedUrl } = loadTsModuleWithRequire('lib/media/embed.ts', {
  stubs: {
    '@/lib/config': {
      appConfig: {
        ezvidEmbedBaseUrl: 'https://ezvidapi.com/embed',
        filmuEmbedBaseUrl: 'https://embed.filmu.in',
        multiEmbedBaseUrl: 'https://multiembed.mov',
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
