'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

import type { LibraryMediaEntry, MediaEntry, MediaExperience } from '@/lib/media/types';
import {
  MAX_RECENTLY_WATCHED,
  buildEpisodeKey,
  mergeRecentlyWatched,
  serverEntryToClient,
  watchedEpisodesFromProgress,
  type RecentlyWatchedEntry,
  type RecentlyWatchedNamespace,
  type ServerWatchHistoryEntry,
  type ServerWatchProgressEntry,
} from '@/lib/hooks/recently-watched-merge';

const MAX_COOKIE_LENGTH = 3800;
const EMPTY_RECENTLY_WATCHED: RecentlyWatchedEntry[] = [];
const EMPTY_WATCHED_EPISODES = new Set<string>();

export type {
  RecentlyWatchedEntry,
  ServerWatchHistoryEntry,
  ServerWatchProgressEntry,
  RecentlyWatchedNamespace,
} from '@/lib/hooks/recently-watched-merge';
export {
  buildEpisodeKey,
  mergeRecentlyWatched,
  serverEntryToClient,
  watchedEpisodesFromProgress,
} from '@/lib/hooks/recently-watched-merge';

interface TrackPlaybackOptions {
  durationSeconds?: number;
  episode?: string;
  progressPercent?: number;
  progressSeconds?: number;
  season?: string;
}

interface NamespaceKeys {
  eventName: string;
  homeScrollKey: string;
  recentlyWatchedCookie: string;
  recentlyWatchedStorageKey: string;
  restoreHomeScrollKey: string;
  watchedEpisodesStorageKey: string;
}

const rawValueCache = new Map<RecentlyWatchedNamespace, string>();
const entryCache = new Map<RecentlyWatchedNamespace, RecentlyWatchedEntry[]>();
const watchedEpisodesRawValueCache = new Map<RecentlyWatchedNamespace, string>();
const watchedEpisodesSetCache = new Map<RecentlyWatchedNamespace, Map<string, Set<string>>>();
const serverHydratedNamespace = new Set<RecentlyWatchedNamespace>();

function getNamespacePrefix(namespace: RecentlyWatchedNamespace): string {
  return namespace === 'papianime' ? 'papianime' : 'papiflix';
}

function getNamespaceKeys(namespace: RecentlyWatchedNamespace): NamespaceKeys {
  const prefix = getNamespacePrefix(namespace);

  return {
    eventName: `${prefix}-recently-watched-change`,
    homeScrollKey: `${prefix}-home-scroll-y`,
    recentlyWatchedCookie: `${prefix}_recently_watched_v1`,
    recentlyWatchedStorageKey: `${prefix}-recently-watched-v1`,
    restoreHomeScrollKey: `${prefix}-restore-home-scroll`,
    watchedEpisodesStorageKey: `${prefix}-watched-episodes-v1`,
  };
}

function getCachedRawValue(namespace: RecentlyWatchedNamespace): string {
  return rawValueCache.get(namespace) ?? '';
}

function setCachedRawValue(namespace: RecentlyWatchedNamespace, value: string) {
  rawValueCache.set(namespace, value);
}

function getCachedEntries(namespace: RecentlyWatchedNamespace): RecentlyWatchedEntry[] {
  return entryCache.get(namespace) ?? EMPTY_RECENTLY_WATCHED;
}

function setCachedEntries(namespace: RecentlyWatchedNamespace, entries: RecentlyWatchedEntry[]) {
  entryCache.set(namespace, entries);
}

function getCachedWatchedEpisodesRawValue(namespace: RecentlyWatchedNamespace): string {
  return watchedEpisodesRawValueCache.get(namespace) ?? '';
}

function setCachedWatchedEpisodesRawValue(namespace: RecentlyWatchedNamespace, value: string) {
  watchedEpisodesRawValueCache.set(namespace, value);
}

function getCachedWatchedEpisodeSets(namespace: RecentlyWatchedNamespace): Map<string, Set<string>> {
  return watchedEpisodesSetCache.get(namespace) ?? new Map<string, Set<string>>();
}

function setCachedWatchedEpisodeSets(namespace: RecentlyWatchedNamespace, value: Map<string, Set<string>>) {
  watchedEpisodesSetCache.set(namespace, value);
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function buildEpisodeStorageKey(season: string | undefined, episode: string | undefined): string | null {
  return buildEpisodeKey(season, episode);
}

function normalizeEntry(value: unknown): RecentlyWatchedEntry | null {
  if (!value || typeof value !== 'object') return null;

  const entry = value as Partial<RecentlyWatchedEntry>;
  if (
    typeof entry.id !== 'string' ||
    typeof entry.title !== 'string' ||
    typeof entry.provider !== 'string' ||
    (entry.type !== 'movie' && entry.type !== 'tv')
  ) {
    return null;
  }

  return {
    animeFormat: typeof entry.animeFormat === 'string' ? entry.animeFormat : undefined,
    anilistId: typeof entry.anilistId === 'string' ? entry.anilistId : undefined,
    backdropUrl: typeof entry.backdropUrl === 'string' ? entry.backdropUrl : undefined,
    defaultLanguage: entry.defaultLanguage === 'dub' ? 'dub' : entry.defaultLanguage === 'sub' ? 'sub' : undefined,
    durationSeconds: typeof entry.durationSeconds === 'number' ? entry.durationSeconds : undefined,
    episode: typeof entry.episode === 'string' ? entry.episode : undefined,
    episodeCount: typeof entry.episodeCount === 'number' ? entry.episodeCount : undefined,
    episodeEmbedIds:
      entry.episodeEmbedIds && typeof entry.episodeEmbedIds === 'object'
        ? Object.fromEntries(
            Object.entries(entry.episodeEmbedIds).filter((candidate): candidate is [string, string] => {
              return typeof candidate[0] === 'string' && typeof candidate[1] === 'string';
            }),
          )
        : undefined,
    id: entry.id,
    malId: typeof entry.malId === 'string' ? entry.malId : undefined,
    posterUrl: typeof entry.posterUrl === 'string' ? entry.posterUrl : undefined,
    progressPercent: typeof entry.progressPercent === 'number' ? entry.progressPercent : undefined,
    progressSeconds: typeof entry.progressSeconds === 'number' ? entry.progressSeconds : undefined,
    provider: entry.provider === 'anilist' ? 'anilist' : entry.provider === 'anikoto' ? 'anikoto' : 'tmdb',
    rating: typeof entry.rating === 'number' ? entry.rating : undefined,
    season: typeof entry.season === 'string' ? entry.season : undefined,
    synopsis: typeof entry.synopsis === 'string' ? entry.synopsis : '',
    title: entry.title,
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

  if (!cookie) {
    return '';
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return '';
  }
}

function writeSessionCookie(namespace: RecentlyWatchedNamespace, entries: RecentlyWatchedEntry[]) {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);
  let cookieEntries = entries;
  let encodedValue = encodeURIComponent(JSON.stringify(cookieEntries));

  while (encodedValue.length > MAX_COOKIE_LENGTH && cookieEntries.length > 1) {
    cookieEntries = cookieEntries.slice(0, -1);
    encodedValue = encodeURIComponent(JSON.stringify(cookieEntries));
  }

  document.cookie = `${keys.recentlyWatchedCookie}=${encodedValue}; Path=/; SameSite=Lax`;
}

function readRawRecentlyWatched(namespace: RecentlyWatchedNamespace): string {
  if (!isBrowser()) return '';

  const keys = getNamespaceKeys(namespace);

  try {
    return sessionStorage.getItem(keys.recentlyWatchedStorageKey) || readCookie(keys.recentlyWatchedCookie);
  } catch {
    return readCookie(keys.recentlyWatchedCookie);
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

function getRecentlyWatchedSnapshot(namespace: RecentlyWatchedNamespace): RecentlyWatchedEntry[] {
  const rawValue = readRawRecentlyWatched(namespace);
  if (rawValue === getCachedRawValue(namespace)) {
    return getCachedEntries(namespace);
  }

  const entries = parseRecentlyWatched(rawValue);
  setCachedRawValue(namespace, rawValue);
  setCachedEntries(namespace, entries);
  return entries;
}

function getServerRecentlyWatchedSnapshot(): RecentlyWatchedEntry[] {
  return EMPTY_RECENTLY_WATCHED;
}

function subscribeRecentlyWatched(namespace: RecentlyWatchedNamespace, onStoreChange: () => void) {
  const keys = getNamespaceKeys(namespace);
  const onStorage = (event: StorageEvent) => {
    if (event.key === keys.recentlyWatchedStorageKey || event.key === keys.watchedEpisodesStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(keys.eventName, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(keys.eventName, onStoreChange);
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

function readRawWatchedEpisodes(namespace: RecentlyWatchedNamespace): string {
  if (!isBrowser()) return '';

  const keys = getNamespaceKeys(namespace);

  try {
    return localStorage.getItem(keys.watchedEpisodesStorageKey) || '';
  } catch {
    return '';
  }
}

function buildMediaStorageKey(entry: Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'type'>): string {
  return `${entry.provider}:${entry.type}:${entry.id}`;
}

function parseWatchedEpisodesMap(rawValue: string): Record<string, string[]> {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([entryKey, watchedEpisodes]) => {
        if (!Array.isArray(watchedEpisodes)) {
          return [entryKey, []];
        }

        return [
          entryKey,
          watchedEpisodes.filter((value): value is string => typeof value === 'string'),
        ];
      }),
    );
  } catch {
    return {};
  }
}

function getWatchedEpisodesMap(namespace: RecentlyWatchedNamespace): Record<string, string[]> {
  return parseWatchedEpisodesMap(readRawWatchedEpisodes(namespace));
}

function getWatchedEpisodeSnapshot(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'type'> | null,
  namespace: RecentlyWatchedNamespace,
): Set<string> {
  if (!entry || !isBrowser()) {
    return EMPTY_WATCHED_EPISODES;
  }

  const rawValue = readRawWatchedEpisodes(namespace);
  if (rawValue !== getCachedWatchedEpisodesRawValue(namespace)) {
    const parsedMap = parseWatchedEpisodesMap(rawValue);
    const cachedSets = new Map<string, Set<string>>();

    Object.entries(parsedMap).forEach(([mediaKey, episodes]) => {
      cachedSets.set(mediaKey, new Set<string>(episodes));
    });

    setCachedWatchedEpisodesRawValue(namespace, rawValue);
    setCachedWatchedEpisodeSets(namespace, cachedSets);
  }

  return getCachedWatchedEpisodeSets(namespace).get(buildMediaStorageKey(entry)) ?? EMPTY_WATCHED_EPISODES;
}

function writeWatchedEpisodesMap(namespace: RecentlyWatchedNamespace, watchedEpisodesMap: Record<string, string[]>) {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);
  const rawValue = JSON.stringify(watchedEpisodesMap);

  try {
    localStorage.setItem(keys.watchedEpisodesStorageKey, rawValue);
  } catch {
    // Keep the session usable even when persistent storage is unavailable.
  }

  const cachedSets = new Map<string, Set<string>>();
  Object.entries(watchedEpisodesMap).forEach(([mediaKey, episodes]) => {
    cachedSets.set(mediaKey, new Set<string>(episodes));
  });

  setCachedWatchedEpisodesRawValue(namespace, rawValue);
  setCachedWatchedEpisodeSets(namespace, cachedSets);
}

function shouldMarkEpisodeWatched(options: TrackPlaybackOptions, previous?: RecentlyWatchedEntry): boolean {
  const canReusePreviousProgress = previous?.season === options.season && previous?.episode === options.episode;
  const progressPercent =
    sanitizePercent(options.progressPercent) ??
    (canReusePreviousProgress ? sanitizePercent(previous?.progressPercent) : undefined);
  if (typeof progressPercent === 'number' && progressPercent >= 85) {
    return true;
  }

  const durationSeconds =
    sanitizeNonNegativeNumber(options.durationSeconds) ??
    (canReusePreviousProgress ? previous?.durationSeconds : undefined);
  const progressSeconds =
    sanitizeNonNegativeNumber(options.progressSeconds) ??
    (canReusePreviousProgress ? previous?.progressSeconds : undefined);
  if (
    typeof durationSeconds === 'number' &&
    durationSeconds > 0 &&
    typeof progressSeconds === 'number' &&
    progressSeconds >= Math.max(durationSeconds * 0.85, durationSeconds - 120)
  ) {
    return true;
  }

  return false;
}

function markEpisodeWatched(
  entry: LibraryMediaEntry | MediaEntry,
  options: TrackPlaybackOptions,
  previous: RecentlyWatchedEntry | undefined,
  namespace: RecentlyWatchedNamespace,
) {
  if (entry.type !== 'tv' || !options.episode || !shouldMarkEpisodeWatched(options, previous)) {
    return;
  }

  const episodeStorageKey = buildEpisodeStorageKey(options.season, options.episode);
  if (!episodeStorageKey) {
    return;
  }

  const watchedEpisodesMap = getWatchedEpisodesMap(namespace);
  const mediaStorageKey = buildMediaStorageKey(entry);
  const existingEpisodes = watchedEpisodesMap[mediaStorageKey] ?? [];

  if (existingEpisodes.includes(episodeStorageKey)) {
    return;
  }

  watchedEpisodesMap[mediaStorageKey] = [...existingEpisodes, episodeStorageKey];
  writeWatchedEpisodesMap(namespace, watchedEpisodesMap);
}

function compactEntry(
  entry: LibraryMediaEntry | MediaEntry,
  options: TrackPlaybackOptions,
  previous?: RecentlyWatchedEntry,
): RecentlyWatchedEntry {
  const canCarryProgress =
    entry.type === 'movie' || (previous?.season === options.season && previous?.episode === options.episode);

  return {
    animeFormat: entry.animeFormat,
    anilistId: entry.anilistId,
    backdropUrl: entry.backdropUrl,
    defaultLanguage: entry.defaultLanguage,
    durationSeconds:
      sanitizeNonNegativeNumber(options.durationSeconds) ??
      (canCarryProgress ? previous?.durationSeconds : undefined),
    episode: options.episode,
    episodeCount: entry.episodeCount,
    episodeEmbedIds: entry.episodeEmbedIds,
    id: entry.id,
    malId: entry.malId,
    posterUrl: entry.posterUrl,
    progressPercent:
      sanitizePercent(options.progressPercent) ?? (canCarryProgress ? previous?.progressPercent : undefined),
    progressSeconds:
      sanitizeNonNegativeNumber(options.progressSeconds) ??
      (canCarryProgress ? previous?.progressSeconds : undefined),
    provider: entry.provider,
    rating: entry.rating,
    season: options.season,
    synopsis: entry.synopsis.slice(0, 180),
    title: entry.title,
    type: entry.type,
    voteCount: entry.voteCount,
    watchedAt: Date.now(),
    year: entry.year,
  };
}

export function trackRecentlyWatched(
  entry: LibraryMediaEntry | MediaEntry,
  options: TrackPlaybackOptions = {},
  namespace: RecentlyWatchedNamespace = 'papiflix',
  syncToServer = false,
) {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);
  const previousEntries = getRecentlyWatchedSnapshot(namespace);
  const previousEntry = previousEntries.find((candidate) => {
    return candidate.type === entry.type && candidate.id === entry.id && candidate.provider === entry.provider;
  });
  const nextEntry = compactEntry(entry, options, previousEntry);
  const nextEntries = [
    nextEntry,
    ...previousEntries.filter((candidate) => {
      return (
        candidate.type !== nextEntry.type ||
        candidate.id !== nextEntry.id ||
        candidate.provider !== nextEntry.provider
      );
    }),
  ].slice(0, MAX_RECENTLY_WATCHED);

  const rawValue = JSON.stringify(nextEntries);
  try {
    sessionStorage.setItem(keys.recentlyWatchedStorageKey, rawValue);
  } catch {
    // Browser storage can be full in dev/PWA sessions; keep the in-memory snapshot usable.
  }
  writeSessionCookie(namespace, nextEntries);
  markEpisodeWatched(entry, options, previousEntry, namespace);
  setCachedRawValue(namespace, rawValue);
  setCachedEntries(namespace, nextEntries);
  window.dispatchEvent(new Event(keys.eventName));

  if (!syncToServer) {
    return;
  }

  fetch('/api/watch-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: nextEntry, experience: namespace }),
  }).catch(() => {});
}

export function getRecentlyWatchedEntry(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'type'>,
  namespace: RecentlyWatchedNamespace = 'papiflix',
) {
  if (!isBrowser()) return null;

  return (
    getRecentlyWatchedSnapshot(namespace).find((candidate) => {
      return candidate.type === entry.type && candidate.id === entry.id && candidate.provider === entry.provider;
    }) ?? null
  );
}

export function getRecentlyWatchedProgress(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'type'>,
  options: Pick<TrackPlaybackOptions, 'episode' | 'season'> = {},
  namespace: RecentlyWatchedNamespace = 'papiflix',
) {
  if (!isBrowser()) return null;

  const match = getRecentlyWatchedSnapshot(namespace).find((candidate) => {
    if (candidate.type !== entry.type || candidate.id !== entry.id || candidate.provider !== entry.provider) {
      return false;
    }
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

export function removeRecentlyWatched(
  entry: Pick<LibraryMediaEntry, 'id' | 'provider' | 'type'>,
  namespace: RecentlyWatchedNamespace = 'papiflix',
  syncToServer = false,
) {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);
  const nextEntries = getRecentlyWatchedSnapshot(namespace).filter((candidate) => {
    return candidate.type !== entry.type || candidate.id !== entry.id || candidate.provider !== entry.provider;
  });

  const rawValue = JSON.stringify(nextEntries);
  try {
    sessionStorage.setItem(keys.recentlyWatchedStorageKey, rawValue);
  } catch {
    // Browser storage can be full in dev/PWA sessions; keep the in-memory snapshot usable.
  }
  writeSessionCookie(namespace, nextEntries);
  setCachedRawValue(namespace, rawValue);
  setCachedEntries(namespace, nextEntries);
  window.dispatchEvent(new Event(keys.eventName));

  if (!syncToServer) {
    return;
  }

  fetch('/api/watch-history/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mediaId: entry.id,
      mediaProvider: entry.provider,
      mediaType: entry.type,
    }),
  }).catch(() => {});
}

export function useRecentlyWatched(namespace: RecentlyWatchedNamespace = 'papiflix') {
  return useSyncExternalStore(
    (onStoreChange) => subscribeRecentlyWatched(namespace, onStoreChange),
    () => getRecentlyWatchedSnapshot(namespace),
    getServerRecentlyWatchedSnapshot,
  );
}

export function useWatchedEpisodes(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'type'> | null,
  namespace: RecentlyWatchedNamespace = 'papiflix',
) {
  return useSyncExternalStore(
    (onStoreChange) => subscribeRecentlyWatched(namespace, onStoreChange),
    () => getWatchedEpisodeSnapshot(entry, namespace),
    () => EMPTY_WATCHED_EPISODES,
  );
}

export function useWatchHistorySync(namespace: RecentlyWatchedNamespace = 'papiflix', options: { pollIntervalMs?: number } = {}) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const fetchKey = userId ? `${userId}:${namespace}` : null;
  const fetchedRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const pushLocalToServer = useCallback(async () => {
    if (!userId || !isBrowser()) return;
    const localEntries = getRecentlyWatchedSnapshot(namespace);
    if (localEntries.length === 0) return;
    try {
      await fetch('/api/watch-history/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: localEntries.map((entry) => ({ ...entry, experience: namespace })),
        }),
      });
    } catch {
      // Network blip - non-critical.
    }
  }, [namespace, userId]);

  const fetchServer = useCallback(async () => {
    if (!userId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [historyResponse, progressResponse] = await Promise.all([
        fetch(`/api/watch-history?experience=${encodeURIComponent(namespace)}`),
        fetch(`/api/watch-history/progress?experience=${encodeURIComponent(namespace)}`),
      ]);

      if (!historyResponse.ok) {
        return;
      }

      const historyJson = (await historyResponse.json().catch(() => ({}))) as {
        entries?: ServerWatchHistoryEntry[];
      };
      const progressJson = (progressResponse.ok
        ? ((await progressResponse.json().catch(() => ({}))) as { progress?: ServerWatchProgressEntry[] })
        : { progress: [] });

      const serverEntries = (historyJson.entries ?? [])
        .map(serverEntryToClient)
        .filter((entry): entry is RecentlyWatchedEntry => Boolean(entry));
      const localEntries = getRecentlyWatchedSnapshot(namespace);
      const merged = mergeRecentlyWatched({ localEntries, preferServer: true, serverEntries });

      const keys = getNamespaceKeys(namespace);
      const rawValue = JSON.stringify(merged);
      try {
        sessionStorage.setItem(keys.recentlyWatchedStorageKey, rawValue);
      } catch {
        // Storage may be full - keep in-memory cache consistent.
      }
      writeSessionCookie(namespace, merged);
      setCachedRawValue(namespace, rawValue);
      setCachedEntries(namespace, merged);

      const progressMap = watchedEpisodesFromProgress(progressJson.progress ?? []);
      const cachedSets = new Map<string, Set<string>>();
      Object.entries(parseWatchedEpisodesMap(readRawWatchedEpisodes(namespace))).forEach(([mediaKey, episodes]) => {
        const fromServer = progressMap.get(mediaKey);
        if (fromServer) {
          const mergedSet = new Set<string>([...episodes, ...fromServer]);
          cachedSets.set(mediaKey, mergedSet);
        } else {
          cachedSets.set(mediaKey, new Set<string>(episodes));
        }
      });
      progressMap.forEach((serverSet, mediaKey) => {
        if (!cachedSets.has(mediaKey)) {
          cachedSets.set(mediaKey, new Set<string>(serverSet));
        }
      });
      const watchedEpisodesMap: Record<string, string[]> = {};
      cachedSets.forEach((episodes, mediaKey) => {
        watchedEpisodesMap[mediaKey] = Array.from(episodes);
      });
      writeWatchedEpisodesMap(namespace, watchedEpisodesMap);

      serverHydratedNamespace.add(namespace);
      lastSyncedRef.current = Date.now();
      window.dispatchEvent(new Event(keys.eventName));
    } finally {
      inFlightRef.current = false;
    }
  }, [namespace, userId]);

  useEffect(() => {
    if (!fetchKey) {
      fetchedRef.current = null;
      serverHydratedNamespace.delete(namespace);
      return;
    }
    if (fetchedRef.current !== fetchKey) {
      fetchedRef.current = fetchKey;
      void (async () => {
        await pushLocalToServer();
        await fetchServer();
      })();
    }
  }, [fetchKey, fetchServer, namespace, pushLocalToServer]);

  useEffect(() => {
    if (!userId || !isBrowser()) return;
    const onFocus = () => {
      void fetchServer();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchServer();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const intervalMs = options.pollIntervalMs ?? 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    if (intervalMs > 0) {
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchServer();
        }
      }, intervalMs);
    }
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (interval) clearInterval(interval);
    };
  }, [fetchServer, options.pollIntervalMs, userId]);

  return useMemo(
    () => ({
      hydrated: serverHydratedNamespace.has(namespace),
      pushLocalToServer,
      refetch: fetchServer,
    }),
    [fetchServer, namespace, pushLocalToServer],
  );
}

export function saveHomeScrollPosition(namespace: RecentlyWatchedNamespace = 'papiflix') {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);

  try {
    sessionStorage.setItem(keys.homeScrollKey, String(Math.max(0, Math.round(window.scrollY))));
  } catch {
    // Non-critical convenience state.
  }
}

export function requestHomeScrollRestore(namespace: RecentlyWatchedNamespace = 'papiflix') {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);

  try {
    sessionStorage.setItem(keys.restoreHomeScrollKey, '1');
  } catch {
    // Non-critical convenience state.
  }
}

export function restoreHomeScrollIfRequested(namespace: RecentlyWatchedNamespace = 'papiflix') {
  if (!isBrowser()) return;

  const keys = getNamespaceKeys(namespace);

  let shouldRestore = false;
  try {
    shouldRestore = sessionStorage.getItem(keys.restoreHomeScrollKey) === '1';
  } catch {
    return;
  }

  if (!shouldRestore) return;

  let scrollY = 0;
  try {
    sessionStorage.removeItem(keys.restoreHomeScrollKey);
    scrollY = Number.parseInt(sessionStorage.getItem(keys.homeScrollKey) || '0', 10);
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
