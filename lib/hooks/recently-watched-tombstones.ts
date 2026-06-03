'use client';

import type { RecentlyWatchedNamespace } from '@/lib/hooks/recently-watched-merge';

type TombstoneSubject = { id: string; provider: string; type: string };

export const MAX_TOMBSTONES_PER_NAMESPACE = 200;
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecentlyWatchedTombstone {
  deletedAt: number;
  id: string;
  provider: string;
  type: string;
}

type TombstoneMap = Record<string, RecentlyWatchedTombstone>;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window !== null && typeof localStorage !== 'undefined';
}

function getNamespacePrefix(namespace: RecentlyWatchedNamespace): string {
  if (namespace === 'papianime') return 'papianime';
  if (namespace === 'papimanga') return 'papimanga';
  return 'papiflix';
}

export function getTombstoneStorageKey(namespace: RecentlyWatchedNamespace): string {
  return `${getNamespacePrefix(namespace)}-deleted-v1`;
}

export function tombstoneMatchKey(entry: { id: string; provider: string; type: string }): string {
  return `${entry.type}::${entry.provider}::${entry.id}`;
}

export function isExpired(tombstone: RecentlyWatchedTombstone, now: number = Date.now()): boolean {
  return now - tombstone.deletedAt > TOMBSTONE_TTL_MS;
}

export function readRecentlyWatchedTombstones(
  namespace: RecentlyWatchedNamespace,
  options: { now?: number; maxEntries?: number } = {},
): RecentlyWatchedTombstone[] {
  if (!isBrowser()) return [];
  const key = getTombstoneStorageKey(namespace);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const now = options.now ?? Date.now();
  const cap = options.maxEntries ?? MAX_TOMBSTONES_PER_NAMESPACE;
  const seen = new Set<string>();
  const valid: RecentlyWatchedTombstone[] = [];

  for (const [matchKey, value] of Object.entries(parsed as TombstoneMap)) {
    if (!value || typeof value !== 'object') continue;
    const tomb = value as Partial<RecentlyWatchedTombstone>;
    if (
      typeof tomb.id !== 'string' ||
      typeof tomb.provider !== 'string' ||
      typeof tomb.type !== 'string' ||
      typeof tomb.deletedAt !== 'number'
    ) {
      continue;
    }
    if (isExpired({ deletedAt: tomb.deletedAt, id: tomb.id, provider: tomb.provider, type: tomb.type }, now)) {
      continue;
    }
    if (seen.has(matchKey)) continue;
    seen.add(matchKey);
    valid.push({ deletedAt: tomb.deletedAt, id: tomb.id, provider: tomb.provider, type: tomb.type });
  }

  valid.sort((a, b) => b.deletedAt - a.deletedAt);
  return valid.slice(0, cap);
}

function writeTombstones(namespace: RecentlyWatchedNamespace, tombstones: RecentlyWatchedTombstone[]): boolean {
  if (!isBrowser()) return false;
  const map: TombstoneMap = {};
  for (const tomb of tombstones) {
    map[tombstoneMatchKey(tomb)] = tomb;
  }
  try {
    localStorage.setItem(getTombstoneStorageKey(namespace), JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

export function addRecentlyWatchedTombstone(
  entry: TombstoneSubject,
  namespace: RecentlyWatchedNamespace = 'papiflix',
  options: { now?: number } = {},
): RecentlyWatchedTombstone {
  const now = options.now ?? Date.now();
  const next: RecentlyWatchedTombstone = {
    deletedAt: now,
    id: entry.id,
    provider: entry.provider,
    type: entry.type,
  };

  const existing = readRecentlyWatchedTombstones(namespace, { now }).filter((tomb) => {
    return tombstoneMatchKey(tomb) !== tombstoneMatchKey(next);
  });
  existing.unshift(next);

  // Cap to N most-recent entries, then write.
  const trimmed = existing.slice(0, MAX_TOMBSTONES_PER_NAMESPACE);
  writeTombstones(namespace, trimmed);
  return next;
}

export function clearRecentlyWatchedTombstone(
  entry: TombstoneSubject,
  namespace: RecentlyWatchedNamespace = 'papiflix',
  options: { now?: number } = {},
): boolean {
  const now = options.now ?? Date.now();
  const existing = readRecentlyWatchedTombstones(namespace, { now });
  const match = tombstoneMatchKey(entry);
  const filtered = existing.filter((tomb) => tombstoneMatchKey(tomb) !== match);
  if (filtered.length === existing.length) {
    return false;
  }
  writeTombstones(namespace, filtered);
  return true;
}

export function buildTombstoneFilter<T extends { id: string; provider: string; type: string }>(
  tombstones: ReadonlyArray<RecentlyWatchedTombstone>,
): (entry: T) => boolean {
  if (tombstones.length === 0) return () => true;
  const blocked = new Set<string>();
  for (const tomb of tombstones) {
    blocked.add(tombstoneMatchKey(tomb));
  }
  return (entry) => !blocked.has(tombstoneMatchKey(entry));
}
