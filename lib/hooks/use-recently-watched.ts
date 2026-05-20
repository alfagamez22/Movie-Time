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
  durationSeconds?: number;
  episode?: string;
  progressPercent?: number;
  progressSeconds?: number;
  season?: string;
  watchedAt: number;
}

interface TrackPlaybackOptions {
  durationSeconds?: number;
  episode?: string;
  progressPercent?: number;
  progressSeconds?: number;
  season?: string;
}

let cachedRawValue = '';
let cachedEntries: RecentlyWatchedEntry[] = [];
const EMPTY_RECENTLY_WATCHED: RecentlyWatchedEntry[] = [];

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
    durationSeconds: typeof entry.durationSeconds === 'number' ? entry.durationSeconds : undefined,
    episode: typeof entry.episode === 'string' ? entry.episode : undefined,
    posterUrl: typeof entry.posterUrl === 'string' ? entry.posterUrl : undefined,
    progressPercent: typeof entry.progressPercent === 'number' ? entry.progressPercent : undefined,
    progressSeconds: typeof entry.progressSeconds === 'number' ? entry.progressSeconds : undefined,
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
  try {
    return sessionStorage.getItem(RECENTLY_WATCHED_KEY) || readCookie(RECENTLY_WATCHED_COOKIE);
  } catch {
    return readCookie(RECENTLY_WATCHED_COOKIE);
  }
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
  return EMPTY_RECENTLY_WATCHED;
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

function sanitizeNonNegativeNumber(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function sanitizePercent(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function compactEntry(
  entry: LibraryMediaEntry | MediaEntry,
  options: TrackPlaybackOptions,
  previous?: RecentlyWatchedEntry,
): RecentlyWatchedEntry {
  const canCarryProgress =
    entry.type === 'movie' || (previous?.season === options.season && previous?.episode === options.episode);

  return {
    backdropUrl: entry.backdropUrl,
    durationSeconds:
      sanitizeNonNegativeNumber(options.durationSeconds) ??
      (canCarryProgress ? previous?.durationSeconds : undefined),
    episode: options.episode,
    posterUrl: entry.posterUrl,
    progressPercent:
      sanitizePercent(options.progressPercent) ?? (canCarryProgress ? previous?.progressPercent : undefined),
    progressSeconds:
      sanitizeNonNegativeNumber(options.progressSeconds) ??
      (canCarryProgress ? previous?.progressSeconds : undefined),
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

  const previousEntries = getRecentlyWatchedSnapshot();
  const previousEntry = previousEntries.find((candidate) => {
    return candidate.type === entry.type && candidate.tmdbId === entry.tmdbId;
  });
  const nextEntry = compactEntry(entry, options, previousEntry);
  const nextEntries = [
    nextEntry,
    ...previousEntries.filter((candidate) => {
      return candidate.type !== nextEntry.type || candidate.tmdbId !== nextEntry.tmdbId;
    }),
  ].slice(0, MAX_RECENTLY_WATCHED);

  const rawValue = JSON.stringify(nextEntries);
  try {
    sessionStorage.setItem(RECENTLY_WATCHED_KEY, rawValue);
  } catch {
    // Browser storage can be full in dev/PWA sessions; keep the in-memory snapshot usable.
  }
  writeSessionCookie(nextEntries);
  cachedRawValue = rawValue;
  cachedEntries = nextEntries;
  window.dispatchEvent(new Event(RECENTLY_WATCHED_EVENT));
}

export function getRecentlyWatchedProgress(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'tmdbId' | 'type'>,
  options: Pick<TrackPlaybackOptions, 'episode' | 'season'> = {},
) {
  if (!isBrowser()) return null;

  const match = getRecentlyWatchedSnapshot().find((candidate) => {
    if (candidate.type !== entry.type || candidate.tmdbId !== entry.tmdbId) return false;
    if (entry.type === 'tv' && options.season && candidate.season !== options.season) return false;
    if (entry.type === 'tv' && options.episode && candidate.episode !== options.episode) return false;
    return typeof candidate.progressSeconds === 'number';
  });

  if (!match || typeof match.progressSeconds !== 'number') return null;

  return {
    durationSeconds: match.durationSeconds,
    progressPercent: match.progressPercent,
    progressSeconds: match.progressSeconds,
  };
}

export function removeRecentlyWatched(entry: Pick<LibraryMediaEntry, 'tmdbId' | 'type'>) {
  if (!isBrowser()) return;

  const nextEntries = getRecentlyWatchedSnapshot().filter((candidate) => {
    return candidate.type !== entry.type || candidate.tmdbId !== entry.tmdbId;
  });

  const rawValue = JSON.stringify(nextEntries);
  try {
    sessionStorage.setItem(RECENTLY_WATCHED_KEY, rawValue);
  } catch {
    // Browser storage can be full in dev/PWA sessions; keep the in-memory snapshot usable.
  }
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
  try {
    sessionStorage.setItem(HOME_SCROLL_KEY, String(Math.max(0, Math.round(window.scrollY))));
  } catch {
    // Non-critical convenience state.
  }
}

export function requestHomeScrollRestore() {
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(RESTORE_HOME_SCROLL_KEY, '1');
  } catch {
    // Non-critical convenience state.
  }
}

export function restoreHomeScrollIfRequested() {
  if (!isBrowser()) return;

  let shouldRestore = false;
  try {
    shouldRestore = sessionStorage.getItem(RESTORE_HOME_SCROLL_KEY) === '1';
  } catch {
    return;
  }

  if (!shouldRestore) return;

  let scrollY = 0;
  try {
    sessionStorage.removeItem(RESTORE_HOME_SCROLL_KEY);
    scrollY = Number.parseInt(sessionStorage.getItem(HOME_SCROLL_KEY) || '0', 10);
  } catch {
    return;
  }
  if (!Number.isFinite(scrollY) || scrollY <= 0) return;

  const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 250);
}
