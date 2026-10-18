import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
function load(relativePath, imports = {}) {
  const source = readFileSync(resolve(relativePath), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const runtimeModule = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(runtimeModule.exports, (name) => {
    if (name in imports) return imports[name];
    if (name === 'zod') return nativeRequire(name);
    throw new Error(`Unexpected import ${name}`);
  }, runtimeModule);
  return runtimeModule.exports;
}
const merge = load('lib/hooks/recently-watched-merge.ts');
const library = load('lib/media/personal-library.ts', { '@/lib/hooks/recently-watched-merge': merge });
const validation = load('lib/media/personal-library-validation.ts');
const row = (mediaId, mediaType = 'movie', mediaProvider = 'tmdb', extra = {}) => ({
  id: `record-${mediaId}`, mediaId, mediaType, mediaProvider, experience: mediaProvider === 'tmdb' ? 'papiflix' : 'papianime', title: mediaId,
  synopsis: '', watchedAt: '2026-10-11T01:00:00Z', updatedAt: '2026-10-11T01:00:00Z', ...extra,
});
const dataset = (extra = {}) => ({ bookmarks: [], history: [], progress: [], likes: [], trailers: [], ...extra });

test('completed movies leave Continue Watching and are available to restart', () => {
  const result = library.buildPersonalCollections(dataset({ history: [row('finished', 'movie', 'tmdb', { progressPercent: 96 }), row('ongoing', 'movie', 'tmdb', { progressPercent: 30 })] }));
  assert.deepEqual(result.continueWatching.map((entry) => entry.id), ['ongoing']);
  assert.deepEqual(result.watchAgain.map((entry) => entry.id), ['finished']);
  assert.equal(result.recentlyWatched.length, 2);
});
test('one completed episode does not complete an unknown or unfinished series', () => {
  const result = library.buildPersonalCollections(dataset({ history: [row('show', 'tv', 'tmdb', { episode: '1', season: '1', progressPercent: 100 })], progress: [row('show', 'tv', 'tmdb', { episode: '1', season: '1', completed: true })] }));
  assert.equal(result.continueWatching.length, 1);
  assert.equal(result.watchAgain.length, 0);
});
test('known full series completion deduplicates episodes and respects provider identity', () => {
  const history = [row('42', 'tv', 'anilist', { episodeCount: 2, finishedEpisodeCount: 2 }), row('42', 'tv', 'tmdb', { episodeCount: 2, finishedEpisodeCount: 2 })];
  const progress = [row('42', 'tv', 'anilist', { episode: '1', completed: true }), row('42', 'tv', 'anilist', { episode: '1', completed: true }), row('42', 'tv', 'anilist', { episode: '2', completed: true })];
  const result = library.buildPersonalCollections(dataset({ history, progress }));
  assert.equal(result.watchAgain.length, 1);
  assert.equal(result.watchAgain[0].provider, 'anilist');
  assert.equal(result.continueWatching[0].provider, 'tmdb');
});
test('catching up to all released episodes does not finish an airing series', () => {
  const result = library.buildPersonalCollections(dataset({ history: [row('airing', 'tv', 'anilist', { episodeCount: 1 })], progress: [row('airing', 'tv', 'anilist', { episode: '1', completed: true })] }));
  assert.equal(result.continueWatching.length, 1);
  assert.equal(result.watchAgain.length, 0);
});
test('favorites, likes, and Completed status are independent collections', () => {
  const result = library.buildPersonalCollections(dataset({ bookmarks: [row('favorite', 'movie', 'tmdb', { status: 'favorite' }), row('planned', 'tv', 'tmdb', { status: 'plan_to_watch' }), row('complete', 'tv', 'anilist', { status: 'watched' })], likes: [row('planned', 'tv')], history: [row('complete', 'tv', 'anilist')] }));
  assert.deepEqual(result.myList.map((entry) => entry.mediaId), ['favorite']);
  assert.deepEqual(result.likes.map((entry) => entry.mediaId), ['planned']);
  assert.deepEqual(result.watchAgain.map((entry) => entry.id), ['complete']);
  assert.equal(result.continueWatching.length, 0);
});
test('title payloads reject malformed identities and unsafe image URLs', () => {
  assert.equal(validation.personalTitleSchema.safeParse({ ...row('42'), posterUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(validation.titleIdentitySchema.safeParse({ mediaId: '1', mediaType: 'tv', mediaProvider: 'bad' }).success, false);
  assert.equal(validation.personalTitleSchema.safeParse(row('42', 'tv', 'anilist')).success, true);
  assert.equal(validation.trailerHistorySchema.safeParse({ ...row('42'), trailer: { title: 'Official trailer', youtubeId: '../bad' } }).success, false);
});

test('title artwork accepts app TMDB proxy paths while rejecting unsafe relative URLs', () => {
  for (const posterUrl of ['/api/images/tmdb/w300/poster.jpg', '/api/images/tmdb/w780/backdrop.webp', 'https://image.tmdb.org/t/p/w500/poster.jpg']) {
    assert.equal(validation.personalTitleSchema.safeParse({ ...row('42'), posterUrl }).success, true, posterUrl);
  }
  for (const posterUrl of ['//evil.example/poster.jpg', '/api/images/tmdb/w300/../poster.jpg', '/api/images/tmdb/w300/poster.jpg?redirect=https://evil.example', '/unrelated/poster.jpg', 'https://user:pass@example.com/poster.jpg']) {
    assert.equal(validation.personalTitleSchema.safeParse({ ...row('42'), posterUrl }).success, false, posterUrl);
  }
});

function routes(relativePath, authenticated = true) {
  const calls = [];
  const auth = async () => authenticated ? { user: { id: 'current-user' } } : null;
  const records = {
    readRecord: async (...args) => { calls.push(['read', ...args]); return null; },
    saveRecord: async (...args) => { calls.push(['save', ...args]); return { id: args[1], ...args[2] }; },
    deleteRecord: async (...args) => { calls.push(['delete', ...args]); },
    stableRecordId: (...parts) => parts.map(encodeURIComponent).join(':'),
    findRecords: async (...args) => { calls.push(['find', ...args]); return []; },
  };
  const NextResponse = { json: (body, options = {}) => new Response(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }) };
  return { calls, api: load(relativePath, { 'next/server': { NextResponse }, '@/lib/auth': { auth }, '@/lib/db/records': records, '@/lib/media/personal-library-validation': validation }) };
}
const request = (method, body) => new Request('http://localhost/api/test', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test('like accepts the actual movie entry payload with optimized artwork and supports unlike', async () => {
  const { api, calls } = routes('app/api/likes/route.ts');
  const entry = { id: '42', provider: 'tmdb', type: 'movie', title: 'Example Movie', synopsis: 'Synopsis',
    posterUrl: '/api/images/tmdb/w300/poster.jpg', backdropUrl: '/api/images/tmdb/w780/backdrop.jpg' };
  const body = library.entryPayload(entry);
  const response = await api.POST(request('POST', body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { liked: true });
  assert.equal(calls[0][3].posterUrl, entry.posterUrl);
  assert.equal(calls[0][3].userId, 'current-user');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await api.DELETE(request('DELETE', body))).status, 200);
});
test('account APIs reject unsigned users before touching Couchbase', async () => {
  for (const file of ['app/api/likes/route.ts', 'app/api/trailer-history/route.ts', 'app/api/my-papiflix/route.ts']) {
    const { api, calls } = routes(file, false);
    const response = api.POST ? await api.POST(request('POST', row('42'))) : await api.GET();
    assert.equal(response.status, 401); assert.equal(calls.length, 0);
  }
});
test('like writes and deletes always use the signed-in owner, ignoring supplied account fields', async () => {
  const { api, calls } = routes('app/api/likes/route.ts');
  const body = { ...row('42', 'tv', 'anilist'), userId: 'victim', experience: 'papiflix' };
  assert.equal((await api.POST(request('POST', body))).status, 200);
  assert.equal(calls[0][2], 'current-user:42:anilist:tv');
  assert.equal(calls[0][3].userId, 'current-user');
  assert.equal(calls[0][3].experience, 'papianime');
  assert.equal((await api.DELETE(request('DELETE', body))).status, 200);
  assert.deepEqual(calls[1], ['delete', 'likedTitle', 'current-user:42:anilist:tv']);
});
test('trailer records use a canonical safe URL and one id per title/trailer', async () => {
  const { api, calls } = routes('app/api/trailer-history/route.ts');
  const response = await api.POST(request('POST', { ...row('42'), trailer: { title: 'Trailer', youtubeId: 'dQw4w9WgXcQ', url: 'https://malicious.example' } }));
  assert.equal(response.status, 201);
  assert.equal(calls[0][2], 'current-user:42:tmdb:movie:dQw4w9WgXcQ');
  assert.equal(calls[0][3].trailer.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
test('library aggregation scopes every read to the signed-in account and private cache', async () => {
  const { api, calls } = routes('app/api/my-papiflix/route.ts');
  const response = await api.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(calls.length, 10);
  assert.ok(calls.every((call) => call[2].userId === 'current-user'));
  assert.ok(calls.every((call) => ['papiflix', 'papianime'].includes(call[2].experience)));
});
