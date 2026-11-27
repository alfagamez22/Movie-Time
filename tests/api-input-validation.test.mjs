import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, stubs = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const runtimeModule = { exports: {} };
  new Function('require', 'exports', 'module', output)((name) => {
    if (!(name in stubs)) throw new Error(`Unexpected import: ${name}`);
    return stubs[name];
  }, runtimeModule.exports, runtimeModule);
  return runtimeModule.exports;
}

const nextServer = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const guard = load('lib/validation/media-identity.ts');
const userActions = load('lib/media/user-actions.ts');
const rateLimitModule = load('lib/rate-limit.ts', { 'next/server': nextServer, './rate-limit-core': load('lib/rate-limit-core.ts') });

function jsonRequest(url, body, method = 'POST') {
  return new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('media identity guard accepts every routable provider and rejects unknown ones', () => {
  for (const mediaProvider of ['tmdb', 'anilist', 'anikoto', 'mangadex']) {
    assert.equal(guard.validateMediaIdentity({ mediaId: '42', mediaProvider, mediaType: 'tv' }).ok, true);
  }
  assert.deepEqual(guard.validateMediaIdentity({ mediaId: '42', mediaProvider: 'netflix', mediaType: 'tv' }), { ok: false, error: 'Invalid media provider.' });
  assert.equal(guard.validateMediaIdentity({ mediaId: '42', mediaProvider: 'tmdb', mediaType: 'book' }).ok, false);
  assert.equal(guard.validateMediaIdentity({ mediaId: 'x'.repeat(129), mediaProvider: 'tmdb', mediaType: 'movie' }).ok, false);
  assert.equal(guard.validateMediaIdentity({ mediaId: { $ne: null }, mediaProvider: 'tmdb', mediaType: 'movie' }).ok, false);
  assert.equal(guard.validateMediaIdentity({ mediaId: 'x'.repeat(128), mediaProvider: 'tmdb', mediaType: 'movie' }).ok, true);
});

test('experience, title, synopsis and image guards enforce their bounds', () => {
  for (const experience of ['papiflix', 'papianime', 'papimanga']) assert.equal(guard.isMediaExperience(experience), true);
  assert.equal(guard.isMediaExperience('mangadex'), false);
  assert.deepEqual(guard.validateOptionalExperience(null), { ok: true, value: null });
  assert.deepEqual(guard.validateOptionalExperience('papianime'), { ok: true, value: 'papianime' });
  assert.equal(guard.validateOptionalExperience('nope').ok, false);

  assert.equal(guard.validateTitle('t'.repeat(300)).ok, true);
  assert.equal(guard.validateTitle('t'.repeat(301)).ok, false);
  assert.equal(guard.validateTitle('   ').ok, false);
  assert.equal(guard.validateTitle(42).ok, false);

  assert.equal(guard.normalizeSynopsis('s'.repeat(1500)).length, 1000);
  assert.equal(guard.normalizeSynopsis(undefined), '');
  assert.equal(guard.normalizeSynopsis({ html: '<b>' }), '');

  assert.deepEqual(guard.validateImageUrl(null), { ok: true, value: null });
  assert.deepEqual(guard.validateImageUrl(undefined), { ok: true, value: null });
  assert.deepEqual(guard.validateImageUrl('/api/images/tmdb/w300/a.jpg'), { ok: true, value: '/api/images/tmdb/w300/a.jpg' });
  assert.equal(guard.validateImageUrl('h'.repeat(2049)).ok, false);
  assert.equal(guard.validateImageUrl(['https://example.com/a.jpg']).ok, false);
});

function commentsRoute({ userId = 'fixture-user', records = {} } = {}) {
  const saved = [];
  const queries = [];
  const route = load('app/api/comments/route.ts', {
    'next/server': nextServer,
    'node:crypto': { randomUUID: () => `comment-${saved.length + 1}` },
    '@/lib/auth': { auth: async () => (userId ? { user: { id: userId } } : null) },
    '@/lib/db/records': {
      findRecords: async (type, filters) => { queries.push({ type, filters }); return records.comments ?? []; },
      readRecord: async (_type, id) => ({ id, image: null, name: 'Fixture' }),
      saveRecord: async (type, id, document) => { saved.push({ type, id, document }); return { ...document, id }; },
    },
    '@/lib/media/user-actions': userActions,
    '@/lib/rate-limit': rateLimitModule,
    '@/lib/validation/media-identity': guard,
  });
  return { route, saved, queries };
}

const validComment = { body: 'Great episode', experience: 'papianime', mediaId: '21', mediaProvider: 'anikoto', mediaType: 'tv', title: 'Fixture' };

test('public comments GET rejects unknown providers with 400 before touching the database', async () => {
  const { route, queries } = commentsRoute();
  const bad = await route.GET(new Request('http://localhost/api/comments?mediaId=1&mediaType=tv&mediaProvider=netflix'));
  assert.equal(bad.status, 400);
  assert.equal(queries.length, 0);

  const ok = await route.GET(new Request('http://localhost/api/comments?mediaId=1&mediaType=tv&mediaProvider=anilist'));
  assert.equal(ok.status, 200);
  assert.deepEqual(queries[0].filters, { mediaId: '1', mediaType: 'tv', mediaProvider: 'anilist' });
});

test('comments POST returns 400 for an unknown provider, experience or over-long title', async () => {
  const { route, saved } = commentsRoute({ userId: `validation-${Math.random()}` });
  for (const override of [{ mediaProvider: 'netflix' }, { experience: 'papiflux' }, { title: 't'.repeat(301) }, { mediaId: 'x'.repeat(129) }]) {
    const response = await route.POST(jsonRequest('http://localhost/api/comments', { ...validComment, ...override }));
    assert.equal(response.status, 400, JSON.stringify(override));
  }
  assert.equal(saved.length, 0);

  const created = await route.POST(jsonRequest('http://localhost/api/comments', validComment));
  assert.equal(created.status, 201);
  assert.equal(saved[0].document.mediaProvider, 'anikoto');
  assert.equal(saved[0].document.experience, 'papianime');
});

test('comments POST is rate limited per user and still requires sign-in first', async () => {
  const anonymous = commentsRoute({ userId: null });
  assert.equal((await anonymous.route.POST(jsonRequest('http://localhost/api/comments', validComment))).status, 401);

  const userId = `limit-${Math.random()}`;
  const { route, saved } = commentsRoute({ userId });
  for (let index = 0; index < 10; index++) {
    assert.equal((await route.POST(jsonRequest('http://localhost/api/comments', validComment))).status, 201);
  }
  const limited = await route.POST(jsonRequest('http://localhost/api/comments', validComment));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) >= 1);
  assert.equal(saved.length, 10);

  const other = commentsRoute({ userId: `${userId}-other` });
  assert.equal((await other.route.POST(jsonRequest('http://localhost/api/comments', validComment))).status, 201);
});

function bookmarksRoute() {
  const saved = [];
  const queries = [];
  const route = load('app/api/bookmarks/route.ts', {
    'next/server': nextServer,
    '@/lib/auth': { auth: async () => ({ user: { id: 'fixture-user' } }) },
    '@/lib/db/records': {
      findRecord: async () => null,
      findRecords: async (type, filters) => { queries.push({ type, filters }); return []; },
      saveRecord: async (type, id, document) => { saved.push({ type, id, document }); return { ...document, id }; },
      stableRecordId: (...parts) => parts.join(':'),
    },
    '@/lib/media/user-actions': userActions,
    '@/lib/validation/media-identity': guard,
  });
  return { route, saved, queries };
}

const validBookmark = { experience: 'papimanga', mediaId: 'manga-1', mediaProvider: 'mangadex', mediaType: 'tv', title: 'Fixture', posterUrl: null };

test('bookmarks POST accepts MangaDex and null posters, truncates synopsis, and 400s bad input', async () => {
  const { route, saved } = bookmarksRoute();
  const created = await route.POST(jsonRequest('http://localhost/api/bookmarks', { ...validBookmark, synopsis: 's'.repeat(2000) }));
  assert.equal(created.status, 201);
  assert.equal(saved[0].document.posterUrl, null);
  assert.equal(saved[0].document.synopsis.length, 1000);

  for (const override of [{ mediaProvider: 'kitsu' }, { experience: 'mangadex' }, { posterUrl: 'h'.repeat(2049) }, { posterUrl: 7 }, { title: 't'.repeat(301) }]) {
    const response = await route.POST(jsonRequest('http://localhost/api/bookmarks', { ...validBookmark, ...override }));
    assert.equal(response.status, 400, JSON.stringify(override));
  }
  assert.equal(saved.length, 1);
});

test('bookmarks and progress GET reject an unknown experience filter with 400', async () => {
  const { route, queries } = bookmarksRoute();
  assert.equal((await route.GET(new Request('http://localhost/api/bookmarks?experience=bogus'))).status, 400);
  assert.equal(queries.length, 0);
  assert.equal((await route.GET(new Request('http://localhost/api/bookmarks?experience=papimanga'))).status, 200);
  assert.deepEqual(queries[0].filters, { userId: 'fixture-user', experience: 'papimanga' });

  const progressQueries = [];
  const progress = load('app/api/watch-history/progress/route.ts', {
    'next/server': nextServer,
    '@/lib/auth': { auth: async () => ({ user: { id: 'fixture-user' } }) },
    '@/lib/db/records': { findRecords: async (type, filters) => { progressQueries.push(filters); return []; } },
    '@/lib/validation/media-identity': guard,
  });
  assert.equal((await progress.GET(new Request('http://localhost/api/watch-history/progress?experience=bogus'))).status, 400);
  assert.equal((await progress.GET(new Request(`http://localhost/api/watch-history/progress?mediaId=${'x'.repeat(129)}`))).status, 400);
  assert.equal(progressQueries.length, 0);
  assert.equal((await progress.GET(new Request('http://localhost/api/watch-history/progress?experience=papiflix&mediaId=42'))).status, 200);
  assert.deepEqual(progressQueries[0], { userId: 'fixture-user', experience: 'papiflix', mediaId: '42' });
});

test('anikoto records route to the anime collection instead of throwing', () => {
  const couchbase = load('lib/db/couchbase.ts');
  assert.equal(couchbase.collectionForRecord('mediaComment', { mediaProvider: 'anikoto' }), 'papianime');
  assert.throws(() => couchbase.collectionForRecord('mediaComment', { mediaProvider: 'netflix' }), /Cannot determine Couchbase collection/);
});

function mangaReadRoute(loadMangaReadPageData) {
  class MangaDexError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  const route = load('app/api/manga/read/[...segments]/route.ts', {
    'next/server': nextServer,
    '@/lib/manga/client': { isMangaDexNotFound: (error) => error instanceof MangaDexError && error.status === 404 },
    '@/lib/manga/read': { loadMangaReadPageData },
    '@/lib/media/routes': { parseMangaLanguage: (value) => (value === 'raw' ? 'raw' : 'en') },
  });
  const call = (...segments) => route.GET(new Request('http://localhost/api/manga/read'), { params: Promise.resolve({ segments }) });
  return { call, MangaDexError };
}

const mangaId = '0f9b6c3e-8d7a-4b2c-9e1f-123456789abc';

test('manga read API validates ids, maps not-found to 404 and hides upstream error text', async (t) => {
  const calls = [];
  const { call, MangaDexError } = mangaReadRoute(async (...args) => {
    calls.push(args);
    if (args[1] === '999') throw new MangaDexError('Chapter not found.', 404);
    throw new Error('MangaDex chapters failed: 503 Service Unavailable https://api.mangadex.org/secret');
  });
  t.mock.method(console, 'error', () => {});

  assert.equal((await call('not-a-uuid')).status, 400);
  assert.equal((await call('../../at-home/server/x')).status, 400);
  assert.equal((await call(mangaId, 'bad/chapter?x')).status, 400);
  assert.equal(calls.length, 0);

  const missing = await call(mangaId, '999');
  assert.equal(missing.status, 404);

  const failed = await call(mangaId, '12.5');
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Failed to load chapter.' });
  assert.deepEqual(calls.at(-1), [mangaId, '12.5', 'en']);
});

test('analytics setup retries after a failed Couchbase bootstrap instead of caching the rejection', async () => {
  delete globalThis.papiflixAnalyticsReady;
  let attempts = 0;
  const store = load('lib/analytics/store.ts', {
    '@/lib/db/couchbase': {
      getCouchbase: async () => {
        attempts++;
        if (attempts === 1) throw new Error('bootstrap failed');
        return {
          bucket: { name: 'fixture', collections: () => ({ createCollection: async () => {} }) },
          cluster: { query: async () => ({ rows: [{ id: 'session' }] }) },
          scope: { name: 'app', collection: () => ({}) },
        };
      },
    },
  });
  try {
    await assert.rejects(store.querySessions(), /bootstrap failed/);
    assert.equal(globalThis.papiflixAnalyticsReady, undefined);
    assert.deepEqual(await store.querySessions(), [{ id: 'session' }]);
  } finally {
    delete globalThis.papiflixAnalyticsReady;
  }
});
