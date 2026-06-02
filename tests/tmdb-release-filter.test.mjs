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

const tmdb = loadTsModuleWithRequire('lib/tmdb/client.ts', {
  stubs: {
    'server-only': {},
    '@/lib/media/types': {
      isTvEntry: (entry) => entry?.type === 'tv',
      toLibraryMediaEntry: (entry) => entry,
    },
  },
});

const { isReleasedTmdbBrowseResult } = tmdb;

test('isReleasedTmdbBrowseResult rejects future movie release dates', () => {
  assert.equal(isReleasedTmdbBrowseResult({ release_date: '2999-01-01' }, 'movie'), false);
});

test('isReleasedTmdbBrowseResult rejects future TV first air dates', () => {
  assert.equal(isReleasedTmdbBrowseResult({ first_air_date: '2999-01-01' }, 'tv'), false);
});

test('isReleasedTmdbBrowseResult keeps released and undated entries', () => {
  assert.equal(isReleasedTmdbBrowseResult({ release_date: '2020-01-01' }, 'movie'), true);
  assert.equal(isReleasedTmdbBrowseResult({}, 'movie'), true);
});
