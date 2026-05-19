'use client';

import { useSyncExternalStore } from 'react';

import type { LibraryMediaEntry, MediaEntry } from '@/lib/media/types';

const RECENTLY_WATCHED_KEY = 'papiflix-recently-watched-v1';
const RECENTLY_WATCHED_COOKIE = 'papiflix_recently_watched_v1';
const RECENTLY_WATCHED_EVENT = 'papiflix-recently-watched-change';
const HOME_SCROLL_KEY = 'papiflix-home-scroll-y';
const RESTORE_HOME_SCROLL_KEY = 'papiflix-restore-home-scroll';
const MAX_RECENTLY_WATCHED = 12;
const MAX_COOKIE_LENGTH = 3800;

export interface RecentlyWatchedEntry extends LibraryMediaEntry {
  episode?: string;
  season?: string;
  watchedAt: number;
}

interface TrackPlaybackOptions {
  episode?: string;
  season?: string;
}

let cachedRawValue = '';
let cachedEntries: RecentlyWatchedEntry[] = [];

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function normalizeEntry(value: unknown): RecentlyWatchedEntry | null {
  if (!value || typeof value !== 'object') return null;

  const entry = value as Partial<RecentlyWatchedEntry>;
  if (
    typeof entry.tmdbId !== 'string' ||
    typeof entry.title !== 'string' ||
    (entry.type !== 'movie' && entry.type !== 'tv')
  ) {
    return null;
  }

  return {
    backdropUrl: typeof entry.backdropUrl === 'string' ? entry.backdropUrl : undefined,
    episode: typeof entry.episode === 'string' ? entry.episode : undefined,
    posterUrl: typeof entry.posterUrl === 'string' ? entry.posterUrl : undefined,
    rating: typeof entry.rating === 'number' ? entry.rating : undefined,
    season: typeof entry.season === 'string' ? entry.season : undefined,
    synopsis: typeof entry.synopsis === 'string' ? entry.synopsis : '',
    title: entry.title,
    tmdbId: entry.tmdbId,
    type: entry.type,
    voteCount: typeof entry.voteCount === 'number' ? entry.voteCount : undefined,
    watchedAt: typeof entry.watchedAt === 'number' ? entry.watchedAt : Date.now(),
    year: typeof entry.year === 'number' ? entry.year : undefined,
  };
}

function readCookie(name: string): string {
  if (!isBrowser()) return '';

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split('; ')
    .find((candidate) => candidate.startsWith(prefix));

  if (!cookie) return '';

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return '';
  }
}

function writeSessionCookie(entries: RecentlyWatchedEntry[]) {
  if (!isBrowser()) return;

  let cookieEntries = entries;
  let encodedValue = encodeURIComponent(JSON.stringify(cookieEntries));

  while (encodedValue.length > MAX_COOKIE_LENGTH && cookieEntries.length > 1) {
    cookieEntries = cookieEntries.slice(0, -1);
    encodedValue = encodeURIComponent(JSON.stringify(cookieEntries));
  }

  document.cookie = `${RECENTLY_WATCHED_COOKIE}=${encodedValue}; Path=/; SameSite=Lax`;
}

function readRawRecentlyWatched(): string {
  if (!isBrowser()) return '';
  return sessionStorage.getItem(RECENTLY_WATCHED_KEY) || readCookie(RECENTLY_WATCHED_COOKIE);
}

function parseRecentlyWatched(rawValue: string): RecentlyWatchedEntry[] {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is RecentlyWatchedEntry => Boolean(entry))
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, MAX_RECENTLY_WATCHED);
  } catch {
    return [];
  }
}

function getRecentlyWatchedSnapshot(): RecentlyWatchedEntry[] {
  const rawValue = readRawRecentlyWatched();
  if (rawValue === cachedRawValue) return cachedEntries;

  cachedRawValue = rawValue;
  cachedEntries = parseRecentlyWatched(rawValue);
  return cachedEntries;
}

function getServerRecentlyWatchedSnapshot(): RecentlyWatchedEntry[] {
  return [];
}

function subscribeRecentlyWatched(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === RECENTLY_WATCHED_KEY) onStoreChange();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(RECENTLY_WATCHED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(RECENTLY_WATCHED_EVENT, onStoreChange);
  };
}

function compactEntry(entry: LibraryMediaEntry | MediaEntry, options: TrackPlaybackOptions): RecentlyWatchedEntry {
  return {
    backdropUrl: entry.backdropUrl,
    episode: options.episode,
    posterUrl: entry.posterUrl,
    season: options.season,
    synopsis: entry.synopsis.slice(0, 180),
    title: entry.title,
    tmdbId: entry.tmdbId,
    type: entry.type,
    watchedAt: Date.now(),
    year: entry.year,
  };
}

export function trackRecentlyWatched(entry: LibraryMediaEntry | MediaEntry, options: TrackPlaybackOptions = {}) {
  if (!isBrowser()) return;

  const nextEntry = compactEntry(entry, options);
  const nextEntries = [
    nextEntry,
    ...getRecentlyWatchedSnapshot().filter((candidate) => {
      return candidate.type !== nextEntry.type || candidate.tmdbId !== nextEntry.tmdbId;
    }),
  ].slice(0, MAX_RECENTLY_WATCHED);

  const rawValue = JSON.stringify(nextEntries);
  sessionStorage.setItem(RECENTLY_WATCHED_KEY, rawValue);
  writeSessionCookie(nextEntries);
  cachedRawValue = rawValue;
  cachedEntries = nextEntries;
  window.dispatchEvent(new Event(RECENTLY_WATCHED_EVENT));
}

export function removeRecentlyWatched(entry: Pick<LibraryMediaEntry, 'tmdbId' | 'type'>) {
  if (!isBrowser()) return;

  const nextEntries = getRecentlyWatchedSnapshot().filter((candidate) => {
    return candidate.type !== entry.type || candidate.tmdbId !== entry.tmdbId;
  });

  const rawValue = JSON.stringify(nextEntries);
  sessionStorage.setItem(RECENTLY_WATCHED_KEY, rawValue);
  writeSessionCookie(nextEntries);
  cachedRawValue = rawValue;
  cachedEntries = nextEntries;
  window.dispatchEvent(new Event(RECENTLY_WATCHED_EVENT));
}

export function useRecentlyWatched() {
  return useSyncExternalStore(
    subscribeRecentlyWatched,
    getRecentlyWatchedSnapshot,
    getServerRecentlyWatchedSnapshot,
  );
}

export function saveHomeScrollPosition() {
  if (!isBrowser()) return;
  sessionStorage.setItem(HOME_SCROLL_KEY, String(Math.max(0, Math.round(window.scrollY))));
}

export function requestHomeScrollRestore() {
  if (!isBrowser()) return;
  sessionStorage.setItem(RESTORE_HOME_SCROLL_KEY, '1');
}

export function restoreHomeScrollIfRequested() {
  if (!isBrowser() || sessionStorage.getItem(RESTORE_HOME_SCROLL_KEY) !== '1') return;

  sessionStorage.removeItem(RESTORE_HOME_SCROLL_KEY);
  const scrollY = Number.parseInt(sessionStorage.getItem(HOME_SCROLL_KEY) || '0', 10);
  if (!Number.isFinite(scrollY) || scrollY <= 0) return;

  const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 250);
}
