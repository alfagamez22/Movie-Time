import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath) {
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
  const fn = new Function('exports', 'module', '__filename', '__dirname', compiled);
  fn(runtimeModule.exports, runtimeModule, filename, dirname(filename));
  return runtimeModule.exports;
}

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

const watchHistory = loadTsModuleWithRequire('lib/media/watch-history.ts', {
  stubs: {
    '@/lib/db': { prisma: {} },
    '@/lib/generated/prisma/client': { PrismaClient: function () {} },
    '@/lib/generated/prisma/internal/prismaNamespace': { Prisma: {} },
  },
});
const recentlyWatched = loadTsModule('lib/hooks/recently-watched-merge.ts');

test('normalizeProgress clamps invalid values to safe integers', () => {
  const result = watchHistory.normalizeProgress({
    durationSeconds: -10,
    id: 'm1',
    progressPercent: 250,
    progressSeconds: 1.8,
    provider: 'tmdb',
    title: 'Movie',
    type: 'movie',
  });
  assert.equal(result.progressSeconds, 1);
  assert.equal(result.progressPercent, 100);
  assert.equal(result.durationSeconds, undefined);
});

test('shouldApplyIncomingProgress keeps existing when incoming is stale', () => {
  const existing = watchHistory.normalizeProgress({
    durationSeconds: 1200,
    id: 'm1',
    progressPercent: 80,
    progressSeconds: 960,
    provider: 'tmdb',
    title: 'Movie',
    type: 'movie',
  });
  const incoming = watchHistory.normalizeProgress({
    durationSeconds: 1200,
    id: 'm1',
    progressPercent: 10,
    progressSeconds: 120,
    provider: 'tmdb',
    title: 'Movie',
    type: 'movie',
  });

  const decision = watchHistory.shouldApplyIncomingProgress(existing, incoming, Date.now());

  assert.equal(decision.isNewer, false);
  assert.equal(decision.merged.progressSeconds, 960);
  assert.equal(decision.merged.progressPercent, 80);
});

test('shouldApplyIncomingProgress merges higher progress without losing existing data', () => {
  const existing = watchHistory.normalizeProgress({
    durationSeconds: 1000,
    id: 'm1',
    progressPercent: 30,
    progressSeconds: 300,
    provider: 'tmdb',
    title: 'Movie',
    type: 'movie',
  });
  const incoming = watchHistory.normalizeProgress({
    durationSeconds: 1000,
    id: 'm1',
    progressPercent: 60,
    progressSeconds: 600,
    provider: 'tmdb',
    title: 'Movie',
    type: 'movie',
  });

  const decision = watchHistory.shouldApplyIncomingProgress(existing, incoming, Date.now());

  assert.equal(decision.merged.progressSeconds, 600);
  assert.equal(decision.merged.progressPercent, 60);
});

test('serverEntryToClient normalizes a database row into client shape', () => {
  const now = new Date('2025-06-01T10:00:00.000Z').getTime();
  const clientEntry = recentlyWatched.serverEntryToClient({
    backdropUrl: '/backdrop.jpg',
    defaultLanguage: 'sub',
    episode: null,
    episodeCount: null,
    experience: 'papiflix',
    id: 'wh-1',
    mediaId: 'tt-1234',
    mediaProvider: 'tmdb',
    mediaType: 'movie',
    posterUrl: '/poster.jpg',
    progressPercent: 75,
    progressSeconds: 900,
    rating: 7.4,
    season: null,
    synopsis: 'A summary',
    title: 'Example Movie',
    updatedAt: now,
    userId: 'user-1',
    watchedAt: now,
    year: 2024,
    durationSeconds: 1200,
  });

  assert.ok(clientEntry);
  assert.equal(clientEntry?.id, 'tt-1234');
  assert.equal(clientEntry?.provider, 'tmdb');
  assert.equal(clientEntry?.type, 'movie');
  assert.equal(clientEntry?.progressPercent, 75);
  assert.equal(clientEntry?.progressSeconds, 900);
  assert.equal(clientEntry?.defaultLanguage, 'sub');
  assert.equal(clientEntry?.watchedAt, now);
});

test('serverEntryToClient rejects malformed entries', () => {
  const result = recentlyWatched.serverEntryToClient({
    backdropUrl: null,
    defaultLanguage: null,
    episode: null,
    episodeCount: null,
    experience: 'papiflix',
    id: 'wh-bad',
    mediaId: '',
    mediaProvider: 'tmdb',
    mediaType: 'movie',
    posterUrl: null,
    progressPercent: null,
    progressSeconds: null,
    rating: null,
    season: null,
    synopsis: '',
    title: 'Example',
    updatedAt: 0,
    userId: 'user-1',
    watchedAt: 0,
    year: null,
    durationSeconds: null,
  });

  assert.equal(result, null);
});

test('mergeRecentlyWatched prefers the newer entry and merges progress maximums', () => {
  const localEntry = {
    backdropUrl: undefined,
    id: 'tt-1',
    posterUrl: undefined,
    progressPercent: 20,
    progressSeconds: 200,
    provider: 'tmdb',
    rating: undefined,
    season: undefined,
    synopsis: '',
    title: 'Example',
    type: 'movie',
    voteCount: undefined,
    watchedAt: 1000,
    year: 2024,
  };

  const serverEntry = {
    ...localEntry,
    progressPercent: 50,
    progressSeconds: 600,
    watchedAt: 2000,
  };

  const merged = recentlyWatched.mergeRecentlyWatched({
    localEntries: [localEntry],
    preferServer: true,
    serverEntries: [serverEntry],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].watchedAt, 2000);
  assert.equal(merged[0].progressPercent, 50);
  assert.equal(merged[0].progressSeconds, 600);
});

test('mergeRecentlyWatched fills missing fields from local when server has them', () => {
  const localEntry = {
    backdropUrl: '/backdrop.jpg',
    id: 'tt-1',
    posterUrl: '/poster.jpg',
    progressPercent: 20,
    progressSeconds: 200,
    provider: 'tmdb',
    rating: 7.5,
    season: undefined,
    synopsis: 'Local summary',
    title: 'Example',
    type: 'movie',
    voteCount: undefined,
    watchedAt: 1000,
    year: 2024,
  };

  const serverEntry = {
    ...localEntry,
    backdropUrl: undefined,
    posterUrl: undefined,
    progressPercent: 10,
    progressSeconds: 100,
    rating: undefined,
    watchedAt: 500,
  };

  const merged = recentlyWatched.mergeRecentlyWatched({
    localEntries: [localEntry],
    preferServer: true,
    serverEntries: [serverEntry],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].backdropUrl, '/backdrop.jpg');
  assert.equal(merged[0].posterUrl, '/poster.jpg');
  assert.equal(merged[0].rating, 7.5);
  assert.equal(merged[0].progressPercent, 20);
  assert.equal(merged[0].progressSeconds, 200);
});

test('mergeRecentlyWatched dedupes by provider:type:id and keeps the most recent', () => {
  const localEntry = {
    id: 'tt-1',
    posterUrl: undefined,
    progressPercent: 10,
    progressSeconds: 100,
    provider: 'tmdb',
    season: undefined,
    synopsis: '',
    title: 'Example',
    type: 'movie',
    watchedAt: 5000,
    year: 2024,
  };

  const serverEntry = {
    ...localEntry,
    watchedAt: 3000,
  };

  const merged = recentlyWatched.mergeRecentlyWatched({
    localEntries: [localEntry],
    preferServer: false,
    serverEntries: [serverEntry],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].watchedAt, 5000);
});

test('mergeRecentlyWatched adds server-only entries to the merged list', () => {
  const serverEntry = {
    id: 'tt-1',
    posterUrl: undefined,
    progressPercent: 80,
    progressSeconds: 800,
    provider: 'tmdb',
    season: undefined,
    synopsis: '',
    title: 'Example',
    type: 'movie',
    watchedAt: 2000,
    year: 2024,
  };

  const merged = recentlyWatched.mergeRecentlyWatched({
    localEntries: [],
    preferServer: true,
    serverEntries: [serverEntry],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'tt-1');
  assert.equal(merged[0].watchedAt, 2000);
});
