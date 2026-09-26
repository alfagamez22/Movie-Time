import assert from 'node:assert/strict';
import test from 'node:test';

const logic = await import(new URL('../lib/party/sync-logic.ts', import.meta.url).pathname);

const host = (overrides = {}) => ({ episode: '1', playing: true, season: '1', sentAt: 0, time: 100, ...overrides });
const input = (overrides = {}) => ({
  episode: '1',
  failedResyncs: 0,
  guestPaused: false,
  host: host(),
  lastResyncAt: -1e9,
  local: { at: 1000, playing: true, seconds: 101 },
  now: 1000,
  season: '1',
  settleUntil: 0,
  ...overrides,
});

test('nextPlayState ignores repeated timestamps instead of flickering to paused', () => {
  assert.equal(logic.nextPlayState({ playing: true, seconds: 50 }, 50, ''), true);
  assert.equal(logic.nextPlayState({ playing: false, seconds: 50 }, 50, ''), false);
  assert.equal(logic.nextPlayState({ playing: false, seconds: 50 }, 51, ''), true);
});

test('nextPlayState honours explicit statuses', () => {
  assert.equal(logic.nextPlayState({ playing: true, seconds: 50 }, 51, 'paused'), false);
  assert.equal(logic.nextPlayState({ playing: false, seconds: 50 }, 50, 'playing'), true);
  assert.equal(logic.nextPlayState({ playing: true, seconds: 50 }, 50, 'ended'), false);
});

test('expectedHostTime advances only while playing', () => {
  assert.equal(logic.expectedHostTime({ playing: true, sentAt: 0, time: 10 }, 5000), 15);
  assert.equal(logic.expectedHostTime({ playing: false, sentAt: 0, time: 10 }, 5000), 10);
});

test('orderByJoin sorts by earliest join and breaks ties by clientId', () => {
  const order = logic.orderByJoin([
    { clientId: 'c', joinedAt: 30 },
    { clientId: 'b', joinedAt: 10 },
    { clientId: 'a', joinedAt: 10 },
    { clientId: 'c', joinedAt: 5 },
  ]);
  assert.deepEqual(order, ['c', 'a', 'b']);
});

test('pickSuccessor hands off only when the host has left', () => {
  const members = [{ clientId: 'guest1', joinedAt: 10 }, { clientId: 'guest2', joinedAt: 20 }];
  assert.equal(logic.pickSuccessor([...members, { clientId: 'host', joinedAt: 1 }], 'host'), null);
  assert.equal(logic.pickSuccessor(members, 'host'), 'guest1');
  assert.equal(logic.pickSuccessor([], 'host'), null);
});

test('guest in sync does nothing', () => {
  assert.equal(logic.decideGuestAction(input()), 'none');
});

test('guest pauses when the host pauses, once', () => {
  assert.equal(logic.decideGuestAction(input({ host: host({ playing: false }) })), 'pause');
  assert.equal(logic.decideGuestAction(input({ guestPaused: true, host: host({ playing: false }) })), 'none');
});

test('guest resumes when the host plays again', () => {
  assert.equal(logic.decideGuestAction(input({ guestPaused: true })), 'resume');
});

test('guest follows episode changes, even while paused', () => {
  assert.equal(logic.decideGuestAction(input({ host: host({ episode: '2' }) })), 'episode');
  assert.equal(logic.decideGuestAction(input({ guestPaused: true, host: host({ episode: '2', playing: false }) })), 'pause');
});

test('drift triggers a resync only after the settle window and cooldown', () => {
  const drifted = { local: { at: 1000, playing: true, seconds: 0 } };
  assert.equal(logic.decideGuestAction(input(drifted)), 'drift');
  assert.equal(logic.decideGuestAction(input({ ...drifted, settleUntil: 5000 })), 'none');
  assert.equal(logic.decideGuestAction(input({ ...drifted, lastResyncAt: 500 })), 'none');
  assert.equal(logic.decideGuestAction(input({ local: { at: 0, playing: false, seconds: 0 } })), 'none');
});

test('repeated failed resyncs stop auto-reloading', () => {
  const drifted = { local: { at: 1000, playing: true, seconds: 0 } };
  assert.equal(logic.decideGuestAction(input({ ...drifted, failedResyncs: 2 })), 'out-of-sync');
});
