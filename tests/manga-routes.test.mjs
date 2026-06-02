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

const mediaRoutes = loadTsModuleWithRequire('lib/media/routes.ts', {
  stubs: {
    '@/lib/slugs/media': {
      normalizeSlug: (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    },
    './types': {
      isAnimeProvider: (provider) => provider === 'anilist' || provider === 'anikoto',
      isMangaProvider: (provider) => provider === 'mangadex',
    },
  },
});

test('buildWatchHref leaves manga chapter selection to the reader page when no chapter is known', () => {
  const href = mediaRoutes.buildWatchHref({
    id: 'manga-123',
    provider: 'mangadex',
    title: 'Example Manga',
    type: 'tv',
  });

  assert.equal(href, '/manga/read/manga-123');
});

test('buildWatchHref uses the stored manga chapter id when resuming reading', () => {
  const href = mediaRoutes.buildWatchHref(
    {
      id: 'manga-123',
      provider: 'mangadex',
      title: 'Example Manga',
      type: 'tv',
    },
    {
      episode: '12',
      language: 'raw',
      season: 'chapter-id-12',
    },
  );

  assert.equal(href, '/manga/read/manga-123/chapter-id-12?language=raw');
});
