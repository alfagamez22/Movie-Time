import { randomInt } from 'node:crypto';

import { findRecords, readRecord, saveRecord, type AppRecord } from '@/lib/db/records';

import type { PublicParty, WatchParty } from './types';

const RECORD_TYPE = 'watchParty';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PARTY_ACTIVE_WINDOW_MS = 90_000;

export function isPartyCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Z2-9]{6}$/.test(value);
}

function newCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export async function getParty(code: string): Promise<WatchParty | null> {
  if (!isPartyCode(code)) return null;
  return readRecord<WatchParty & { id: string }>(RECORD_TYPE, code);
}

type NewParty = Omit<WatchParty, 'code' | 'createdAt' | 'endedAt' | 'lastActiveAt' | 'updatedAt' | 'viewerCount'>;

export async function createParty(input: NewParty): Promise<WatchParty> {
  let code = newCode();
  for (let attempt = 0; attempt < 4 && (await getParty(code)); attempt += 1) code = newCode();
  const now = new Date().toISOString();
  const party: WatchParty = { ...input, code, createdAt: now, endedAt: null, lastActiveAt: now, updatedAt: now, viewerCount: 1 };
  await saveRecord(RECORD_TYPE, code, { ...party });
  return party;
}

export async function updateParty(party: WatchParty, changes: Partial<WatchParty>) {
  const next: WatchParty = { ...party, ...changes, code: party.code, updatedAt: new Date().toISOString() };
  await saveRecord(RECORD_TYPE, party.code, { ...next });
  return next;
}

export function isPartyLive(party: WatchParty, now = Date.now()) {
  return !party.endedAt && now - Date.parse(party.lastActiveAt ?? party.createdAt) < PARTY_ACTIVE_WINDOW_MS;
}

export async function listLiveParties(experience: string): Promise<PublicParty[]> {
  const rows = await findRecords<AppRecord & WatchParty>(RECORD_TYPE, { experience }, { direction: 'desc', limit: 60, orderBy: 'updatedAt' });
  const now = Date.now();
  return rows
    .filter((party) => isPartyLive(party, now))
    .sort((a, b) => b.viewerCount - a.viewerCount)
    .slice(0, 30)
    .map((party) => ({
      backdropUrl: party.backdropUrl ?? null,
      code: party.code,
      duration: party.duration ?? null,
      episode: party.episode ?? null,
      experience: party.experience,
      hostImage: party.hostImage,
      hostName: party.hostName,
      posterUrl: party.posterUrl ?? null,
      season: party.season ?? null,
      time: party.time ?? 0,
      title: party.title,
      viewerCount: party.viewerCount ?? 1,
      watchPath: party.watchPath,
    }));
}
