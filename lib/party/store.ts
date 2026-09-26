import { randomInt } from 'node:crypto';

import { readRecord, saveRecord } from '@/lib/db/records';

import type { WatchParty } from './types';

const RECORD_TYPE = 'watchParty';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

export async function createParty(input: Omit<WatchParty, 'code' | 'createdAt' | 'endedAt'>): Promise<WatchParty> {
  let code = newCode();
  for (let attempt = 0; attempt < 4 && (await getParty(code)); attempt += 1) code = newCode();
  const party: WatchParty = { ...input, code, createdAt: new Date().toISOString(), endedAt: null };
  await saveRecord(RECORD_TYPE, code, { ...party });
  return party;
}

export async function updateParty(party: WatchParty, changes: Partial<Pick<WatchParty, 'endedAt' | 'title' | 'watchPath'>>) {
  const next = { ...party, ...changes };
  await saveRecord(RECORD_TYPE, party.code, { ...next });
  return next;
}
