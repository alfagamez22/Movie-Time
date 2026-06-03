import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function importTombs() {
  const url = new URL('../lib/hooks/recently-watched-tombstones.ts', import.meta.url).pathname;
  return await import(url);
}

function installFakeBrowser(store, tombstoneKey) {
  const localStorage = {
    data: new Map(store ? Object.entries(store) : []),
    getItem(key) {
      if (key !== tombstoneKey) return null;
      return this.data.get(key) ?? null;
    },
    setItem(key, value) {
      if (key !== tombstoneKey) return;
      this.data.set(key, value);
    },
    removeItem(key) {
      if (key !== tombstoneKey) return;
      this.data.delete(key);
    },
    clear() {
      this.data.clear();
    },
  };
  globalThis.window = { localStorage };
  globalThis.localStorage = localStorage;
}

test('add + read round-trips a tombstone', async () => {
  const tomb = await importTombs();
  installFakeBrowser(null, tomb.getTombstoneStorageKey('papiflix'));
  const subject = { id: 'm-1', provider: 'tmdb', type: 'movie' };
  tomb.addRecentlyWatchedTombstone(subject, 'papiflix', { now: 1_000 });
  const list = tomb.readRecentlyWatchedTombstones('papiflix', { now: 1_000 });
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { deletedAt: 1_000, id: 'm-1', provider: 'tmdb', type: 'movie' });
  delete globalThis.window;
  delete globalThis.localStorage;
});

test('read skips expired tombstones (older than 30 days)', async () => {
  const tomb = await importTombs();
  installFakeBrowser(null, tomb.getTombstoneStorageKey('papiflix'));
  const old = { id: 'a', provider: 'tmdb', type: 'movie' };
  const fresh = { id: 'b', provider: 'tmdb', type: 'movie' };
  tomb.addRecentlyWatchedTombstone(old, 'papiflix', { now: 0 });
  tomb.addRecentlyWatchedTombstone(fresh, 'papiflix', { now: 31 * 24 * 60 * 60 * 1000 });
  const list = tomb.readRecentlyWatchedTombstones('papiflix', { now: 31 * 24 * 60 * 60 * 1000 + 1 });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'b');
  delete globalThis.window;
  delete globalThis.localStorage;
});

test('clear removes a single tombstone by match key', async () => {
  const tomb = await importTombs();
  installFakeBrowser(null, tomb.getTombstoneStorageKey('papiflix'));
  const a = { id: 'a', provider: 'tmdb', type: 'movie' };
  const b = { id: 'b', provider: 'tmdb', type: 'movie' };
  tomb.addRecentlyWatchedTombstone(a, 'papiflix', { now: 100 });
  tomb.addRecentlyWatchedTombstone(b, 'papiflix', { now: 200 });
  const removed = tomb.clearRecentlyWatchedTombstone(a, 'papiflix', { now: 250 });
  assert.equal(removed, true);
  const list = tomb.readRecentlyWatchedTombstones('papiflix', { now: 250 });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'b');
  delete globalThis.window;
  delete globalThis.localStorage;
});

test('read caps to MAX_TOMBSTONES_PER_NAMESPACE most-recent entries', async () => {
  const tomb = await importTombs();
  installFakeBrowser(null, tomb.getTombstoneStorageKey('papiflix'));
  for (let i = 0; i < tomb.MAX_TOMBSTONES_PER_NAMESPACE + 25; i++) {
    tomb.addRecentlyWatchedTombstone({ id: `id-${i}`, provider: 'tmdb', type: 'movie' }, 'papiflix', { now: i });
  }
  const list = tomb.readRecentlyWatchedTombstones('papiflix', { now: 1_000_000 });
  assert.equal(list.length, tomb.MAX_TOMBSTONES_PER_NAMESPACE);
  assert.equal(list[0].id, 'id-224');
  delete globalThis.window;
  delete globalThis.localStorage;
});

test('buildTombstoneFilter blocks matching entries only', async () => {
  const tomb = await importTombs();
  const filter = tomb.buildTombstoneFilter([
    { deletedAt: 1, id: 'a', provider: 'tmdb', type: 'movie' },
  ]);
  const kept = [
    { id: 'a', provider: 'tmdb', type: 'movie', title: 'should be filtered' },
    { id: 'b', provider: 'tmdb', type: 'movie', title: 'kept' },
  ].filter(filter);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 'b');
});
