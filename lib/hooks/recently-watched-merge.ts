import type { AnimeFormat, MediaExperience } from '@/lib/media/types';

export const MAX_RECENTLY_WATCHED = 12;

export interface RecentlyWatchedEntry {
  animeFormat?: AnimeFormat;
  anilistId?: string;
  backdropUrl?: string;
  defaultLanguage?: 'sub' | 'dub';
  durationSeconds?: number;
  episode?: string;
  episodeCount?: number;
  episodeEmbedIds?: Record<string, string>;
  id: string;
  malId?: string;
  posterUrl?: string;
  progressPercent?: number;
  progressSeconds?: number;
  provider: 'tmdb' | 'anilist' | 'anikoto';
  rating?: number;
  season?: string;
  synopsis: string;
  title: string;
  type: 'movie' | 'tv';
  voteCount?: number;
  watchedAt: number;
  year?: number;
}

export interface ServerWatchHistoryEntry {
  id: string;
  userId: string;
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  synopsis: string;
  rating: number | null;
  year: number | null;
  episode: string | null;
  season: string | null;
  progressSeconds: number | null;
  progressPercent: number | null;
  durationSeconds: number | null;
  anilistId: string | null;
  malId: string | null;
  animeFormat: string | null;
  defaultLanguage: string | null;
  episodeCount: number | null;
  watchedAt: string | number | Date;
  updatedAt: string | number | Date;
}

export interface ServerWatchProgressEntry {
  id: string;
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  season: string;
  episode: string;
  title: string;
  progressSeconds: number;
  progressPercent: number;
  durationSeconds: number | null;
  completed: boolean;
  watchedAt: string | number | Date;
  updatedAt: string | number | Date;
}

export function watchedAtToMs(value: string | number | Date | null | undefined): number {
  if (value == null) return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeServerProvider(provider: string): RecentlyWatchedEntry['provider'] {
  if (provider === 'anilist' || provider === 'anikoto' || provider === 'tmdb') {
    return provider;
  }
  return 'tmdb';
}

function normalizeServerType(type: string): 'movie' | 'tv' {
  return type === 'tv' ? 'tv' : 'movie';
}

function normalizeServerDefaultLanguage(value: string | null | undefined): 'sub' | 'dub' | undefined {
  if (value === 'sub' || value === 'dub') return value;
  return undefined;
}

const ANIME_FORMATS: ReadonlySet<AnimeFormat> = new Set<AnimeFormat>([
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
]);

function normalizeAnimeFormat(value: string | null | undefined): AnimeFormat | undefined {
  if (value && ANIME_FORMATS.has(value as AnimeFormat)) {
    return value as AnimeFormat;
  }
  return undefined;
}

export function serverEntryToClient(entry: ServerWatchHistoryEntry): RecentlyWatchedEntry | null {
  if (!entry.mediaId || !entry.mediaProvider || !entry.mediaType) return null;
  const watchedAt = watchedAtToMs(entry.watchedAt);
  return {
    animeFormat: normalizeAnimeFormat(entry.animeFormat),
    anilistId: entry.anilistId ?? undefined,
    backdropUrl: entry.backdropUrl ?? undefined,
    defaultLanguage: normalizeServerDefaultLanguage(entry.defaultLanguage),
    durationSeconds: typeof entry.durationSeconds === 'number' ? entry.durationSeconds : undefined,
    episode: entry.episode ?? undefined,
    episodeCount: typeof entry.episodeCount === 'number' ? entry.episodeCount : undefined,
    id: entry.mediaId,
    malId: entry.malId ?? undefined,
    posterUrl: entry.posterUrl ?? undefined,
    progressPercent: typeof entry.progressPercent === 'number' ? entry.progressPercent : undefined,
    progressSeconds: typeof entry.progressSeconds === 'number' ? entry.progressSeconds : undefined,
    provider: normalizeServerProvider(entry.mediaProvider),
    rating: typeof entry.rating === 'number' ? entry.rating : undefined,
    season: entry.season ?? undefined,
    synopsis: typeof entry.synopsis === 'string' ? entry.synopsis : '',
    title: entry.title,
    type: normalizeServerType(entry.mediaType),
    watchedAt,
    year: typeof entry.year === 'number' ? entry.year : undefined,
  };
}

export function buildEpisodeKey(season: string | undefined, episode: string | undefined): string | null {
  if (!episode) return null;
  return `${season ?? '1'}:${episode}`;
}

export function watchedEpisodesFromProgress(progressEntries: ServerWatchProgressEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const progress of progressEntries) {
    if (!progress.completed) continue;
    const key = buildEpisodeKey(progress.season, progress.episode);
    if (!key) continue;
    const mediaKey = `${progress.mediaProvider}:${progress.mediaType}:${progress.mediaId}`;
    const existing = map.get(mediaKey) ?? new Set<string>();
    existing.add(key);
    map.set(mediaKey, existing);
  }
  return map;
}

export interface MergeOptions {
  preferServer: boolean;
  serverEntries: RecentlyWatchedEntry[];
  localEntries: RecentlyWatchedEntry[];
}

export function mergeRecentlyWatched({ localEntries, preferServer, serverEntries }: MergeOptions): RecentlyWatchedEntry[] {
  const map = new Map<string, RecentlyWatchedEntry>();
  const sortByWatchedAtDesc = (a: RecentlyWatchedEntry, b: RecentlyWatchedEntry) => b.watchedAt - a.watchedAt;

  for (const entry of [...localEntries].sort(sortByWatchedAtDesc)) {
    const key = `${entry.provider}:${entry.type}:${entry.id}`;
    map.set(key, entry);
  }

  for (const entry of [...serverEntries].sort(sortByWatchedAtDesc)) {
    const key = `${entry.provider}:${entry.type}:${entry.id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
      continue;
    }
    if (preferServer || entry.watchedAt >= existing.watchedAt) {
      const merged: RecentlyWatchedEntry = {
        animeFormat: entry.animeFormat ?? existing.animeFormat,
        anilistId: entry.anilistId ?? existing.anilistId,
        backdropUrl: entry.backdropUrl ?? existing.backdropUrl,
        defaultLanguage: entry.defaultLanguage ?? existing.defaultLanguage,
        durationSeconds: entry.durationSeconds ?? existing.durationSeconds,
        episode: entry.episode ?? existing.episode,
        episodeCount: entry.episodeCount ?? existing.episodeCount,
        episodeEmbedIds: entry.episodeEmbedIds ?? existing.episodeEmbedIds,
        id: entry.id,
        malId: entry.malId ?? existing.malId,
        posterUrl: entry.posterUrl ?? existing.posterUrl,
        progressPercent:
          typeof entry.progressPercent === 'number'
            ? Math.max(entry.progressPercent, existing.progressPercent ?? 0)
            : existing.progressPercent,
        progressSeconds:
          typeof entry.progressSeconds === 'number'
            ? Math.max(entry.progressSeconds, existing.progressSeconds ?? 0)
            : existing.progressSeconds,
        provider: entry.provider,
        rating: entry.rating ?? existing.rating,
        season: entry.season ?? existing.season,
        synopsis: entry.synopsis || existing.synopsis,
        title: entry.title || existing.title,
        type: entry.type,
        voteCount: entry.voteCount ?? existing.voteCount,
        watchedAt: Math.max(entry.watchedAt, existing.watchedAt),
        year: entry.year ?? existing.year,
      };
      map.set(key, merged);
    }
  }

  return Array.from(map.values())
    .sort(sortByWatchedAtDesc)
    .slice(0, MAX_RECENTLY_WATCHED);
}

export type RecentlyWatchedNamespace = MediaExperience;
