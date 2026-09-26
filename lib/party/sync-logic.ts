/** Pure watch-party decisions, shared by the client and the claim endpoint so they stay testable. */

export interface SyncState {
  episode: string | null;
  playing: boolean;
  season: string | null;
  sentAt: number;
  time: number;
}

export interface LocalPlayback {
  /** When the last progress event arrived; 0 when unknown (e.g. right after a reload). */
  at: number;
  playing: boolean;
  seconds: number;
}

export const DRIFT_TOLERANCE_S = 8;
export const RESYNC_COOLDOWN_MS = 20_000;
export const MAX_FAILED_RESYNCS = 2;

const PAUSED_STATUSES = new Set(['paused', 'pause', 'ended', 'completed']);
const PLAYING_STATUSES = new Set(['playing', 'play', 'resumed']);

/**
 * Embeds post progress several times a second, often repeating the same timestamp and sometimes without a
 * status. Only an explicit status or real time movement may change play state, otherwise it flickers.
 */
export function nextPlayState(previous: { playing: boolean; seconds: number }, seconds: number, status: string): boolean {
  if (PAUSED_STATUSES.has(status)) return false;
  if (PLAYING_STATUSES.has(status) || seconds !== previous.seconds) return true;
  return previous.playing;
}

export function expectedHostTime(state: Pick<SyncState, 'playing' | 'sentAt' | 'time'>, now: number): number {
  return state.time + (state.playing ? Math.max(0, now - state.sentAt) / 1000 : 0);
}

export function localTimeAt(local: LocalPlayback, now: number): number {
  return local.seconds + (local.playing && local.at ? Math.max(0, now - local.at) / 1000 : 0);
}

export interface PresenceEntry {
  clientId: string;
  joinedAt: number;
}

/** Oldest member first; ties broken by clientId so every client computes the same order. */
export function orderByJoin(members: PresenceEntry[]): string[] {
  const earliest = new Map<string, number>();
  for (const member of members) {
    earliest.set(member.clientId, Math.min(earliest.get(member.clientId) ?? Infinity, member.joinedAt));
  }
  return [...earliest.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([clientId]) => clientId);
}

/** Who should become host, or null when the current host is still present or nobody is left. */
export function pickSuccessor(members: PresenceEntry[], hostId: string | null): string | null {
  const ordered = orderByJoin(members);
  if (!hostId || ordered.includes(hostId)) return null;
  return ordered[0] ?? null;
}

export type GuestAction = 'none' | 'pause' | 'resume' | 'episode' | 'drift' | 'out-of-sync';

export interface GuestDecisionInput {
  episode: string | null;
  failedResyncs: number;
  guestPaused: boolean;
  host: SyncState;
  lastResyncAt: number;
  local: LocalPlayback;
  now: number;
  season: string | null;
  settleUntil: number;
}

/** What a guest's player should do given the host's latest state. Pause confirmation delay is the caller's job. */
export function decideGuestAction(input: GuestDecisionInput): GuestAction {
  const { host, local, now } = input;
  const episodeChanged = (host.season ?? null) !== input.season || (host.episode ?? null) !== input.episode;

  if (!host.playing) return input.guestPaused && !episodeChanged ? 'none' : 'pause';
  if (episodeChanged) return 'episode';
  if (input.guestPaused) return 'resume';

  if (!local.at || now < input.settleUntil) return 'none';
  const drift = Math.abs(localTimeAt(local, now) - expectedHostTime(host, now));
  if (drift <= DRIFT_TOLERANCE_S || now - input.lastResyncAt < RESYNC_COOLDOWN_MS) return 'none';
  return input.failedResyncs >= MAX_FAILED_RESYNCS ? 'out-of-sync' : 'drift';
}
