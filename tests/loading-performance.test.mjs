import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, stubs) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const runtimeModule = { exports: {} };
  new Function('require', 'exports', 'module', output)((name) => {
    if (!(name in stubs)) throw new Error(`Unexpected import: ${name}`);
    return stubs[name];
  }, runtimeModule.exports, runtimeModule);
  return runtimeModule.exports;
}

function recordsFixture(document = null, legacyRows = []) {
  const reads = [];
  const queries = [];
  const records = load('lib/db/records.ts', { './couchbase': {
    getDocument: async (...args) => { reads.push(args); return document; },
    collectionsForRecord: () => ['papiflix'],
    getCouchbase: async () => ({ bucket: { name: 'fixture' }, scope: { name: 'app' }, cluster: {
      query: async (statement, options) => { queries.push({ statement, options }); return { rows: legacyRows }; },
    } }),
  } });
  return { records, reads, queries };
}

const key = { userId: 'user/a', mediaId: '42', mediaProvider: 'tmdb', mediaType: 'movie' };

test('deterministic media records use one routed KV read without a query', async () => {
  const document = { ...key, id: 'modern' };
  const { records, reads, queries } = recordsFixture(document);
  assert.equal(await records.findRecord('watchHistory', key), document);
  assert.deepEqual(reads, [['watchHistory', 'user%2Fa:42:tmdb:movie', key]]);
  assert.equal(queries.length, 0);
});

test('legacy IDs retain the indexed query fallback and fresh read consistency', async () => {
  const legacy = { ...key, id: 'migrated-uuid' };
  const { records, reads, queries } = recordsFixture(null, [legacy]);
  assert.equal(await records.findRecord('bookmark', key), legacy);
  assert.equal(reads.length, 1);
  assert.equal(queries[0].options.adhoc, false);
  assert.equal(queries[0].options.scanConsistency, 'request_plus');
  assert.equal(queries[0].options.parameters.limit, 1);
});

test('KV shortcuts respect all filters and never bypass the field allowlist', async () => {
  const { records, queries } = recordsFixture({ ...key, experience: 'papianime' });
  assert.equal(await records.findRecord('watchHistory', { ...key, experience: 'papiflix' }), null);
  assert.equal(queries.length, 1);
  await assert.rejects(records.findRecord('watchHistory', { ...key, secretField: 'x' }), /Unsupported Couchbase filter/);
});

test('partial progress lookups use a query instead of inventing an episode key', async () => {
  const { records, reads } = recordsFixture();
  await records.findRecord('watchProgress', key);
  assert.equal(reads.length, 0);
});

test('genre ID lookup fetches definitions without requesting every tile artwork', async () => {
  const requests = [];
  const genres = load('lib/tmdb/genres.ts', {
    '@/lib/slugs/media': { normalizeSlug: value => value.toLowerCase() },
    './client': {
      isTmdbFailure: value => Boolean(value.error),
      requestOfficialTmdb: async path => { requests.push(path); return { genres: [{ id: 28, name: 'Action' }] }; },
    },
  });
  assert.equal((await genres.findGenreTile('action')).movieGenreId, 28);
  assert.deepEqual(requests, ['/genre/movie/list', '/genre/tv/list']);
});

test('genre upstream failures remain errors instead of successful empty pages', async () => {
  const genres = load('lib/tmdb/genres.ts', {
    '@/lib/slugs/media': {},
    './client': { isTmdbFailure: () => true, requestOfficialTmdb: async () => ({ ok: false }) },
  });
  const result = await genres.getGenreTitles({ movieGenreId: 28 }, 'movie', 'popular', 2);
  assert.ok(result.error);
  assert.equal(result.page, 2);
});

test('combined history API requires authentication and queries only the current user', async () => {
  let signedIn = false;
  const queries = [];
  const route = load('app/api/watch-history/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/auth': { auth: async () => signedIn ? { user: { id: 'fixture-user' } } : null },
    '@/lib/media/watch-history': { MAX_WATCH_HISTORY_ENTRIES: 24 },
    '@/lib/db/records': { findRecords: async (type, filters) => { queries.push({ type, filters }); return [{ id: type }]; } },
  });
  const request = new Request('http://localhost/api/watch-history?experience=papiflix&includeProgress=1');
  assert.equal((await route.GET(request)).status, 401);
  assert.equal(queries.length, 0);
  signedIn = true;
  const response = await route.GET(request);
  assert.deepEqual(await response.json(), { entries: [{ id: 'watchHistory' }], progress: [{ id: 'watchProgress' }] });
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(queries.map(q => q.filters), Array(2).fill({ userId: 'fixture-user', experience: 'papiflix' }));
});

test('history sync bounds database concurrency and reports partial failures', async () => {
  let active = 0;
  let maximum = 0;
  const route = load('app/api/watch-history/sync/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/auth': { auth: async () => ({ user: { id: 'fixture-user' } }) },
    '@/lib/media/watch-history': {
      MAX_WATCH_HISTORY_ENTRIES: 24,
      upsertWatchHistoryWithProgress: async (_user, entry) => {
        active++; maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active--;
        if (entry.id === '0') throw new Error('fixture failure');
        return entry.id === '1' ? null : {};
      },
    },
  });
  const entries = Array.from({ length: 13 }, (_, index) => ({ id: String(index), provider: 'tmdb', type: 'movie', experience: 'papiflix' }));
  const response = await route.POST(new Request('http://localhost/api/watch-history/sync', { method: 'POST', body: JSON.stringify({ entries }) }));
  assert.deepEqual(await response.json(), { synced: 11, skipped: 1, failed: 1 });
  assert.equal(maximum, 6);
  assert.equal((await route.POST(new Request('http://localhost/api/watch-history/sync', { method: 'POST', body: JSON.stringify({ entries: Array(25).fill(entries[0]) }) }))).status, 400);
});

for (const provider of ['media', 'anime']) {
  test(`${provider} search errors are uncached even when the API returns HTTP 200`, async () => {
    const failure = provider === 'media' ? { ok: false, message: 'Unavailable', status: 503 } : { error: 'Unavailable', data: [], source: 'live' };
    const stubs = {
      'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
      '@/lib/tmdb/client': { searchTmdbLibrary: async () => failure },
      '@/lib/anime/player-config': { searchAnimeForPlayer: async () => failure },
    };
    const route = load(`app/api/${provider}/route.ts`, stubs);
    const response = await route.GET(new Request(`http://localhost/api/${provider}?q=fixture`));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
}
