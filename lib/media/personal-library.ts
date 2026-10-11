import type { BookmarkRecord } from '@/lib/hooks/use-bookmarks';
import type { RecentlyWatchedEntry, ServerWatchHistoryEntry, ServerWatchProgressEntry } from '@/lib/hooks/recently-watched-merge';
import { serverEntryToClient } from '@/lib/hooks/recently-watched-merge';
import type { LibraryMediaEntry, MediaTrailer } from './types';

export interface PersonalTitleRecord {
  id: string;
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  synopsis?: string | null;
  year?: number | null;
  rating?: number | null;
  anilistId?: string | null;
  malId?: string | null;
  animeFormat?: string | null;
  updatedAt: string;
}
export interface TrailerHistoryRecord extends PersonalTitleRecord { trailer: MediaTrailer }
export interface PersonalLibraryData {
  bookmarks: BookmarkRecord[];
  history: ServerWatchHistoryEntry[];
  progress: ServerWatchProgressEntry[];
  likes: PersonalTitleRecord[];
  trailers: TrailerHistoryRecord[];
}
export const EMPTY_PERSONAL_LIBRARY: PersonalLibraryData = { bookmarks: [], history: [], progress: [], likes: [], trailers: [] };
export function titleKey(entry: Pick<LibraryMediaEntry, 'id' | 'provider' | 'type'>) {
  return `${entry.provider}:${entry.type}:${entry.id}`;
}
export function recordTitleKey(record: Pick<PersonalTitleRecord, 'mediaId' | 'mediaProvider' | 'mediaType'>) {
  return `${record.mediaProvider}:${record.mediaType}:${record.mediaId}`;
}
export function recordToEntry(record: PersonalTitleRecord): LibraryMediaEntry | null {
  if (!record.mediaId || !record.title || !['movie', 'tv'].includes(record.mediaType) ||
      !['tmdb', 'anilist', 'anikoto', 'mangadex'].includes(record.mediaProvider)) return null;
  return {
    id: record.mediaId, provider: record.mediaProvider as LibraryMediaEntry['provider'], type: record.mediaType as LibraryMediaEntry['type'],
    title: record.title, synopsis: record.synopsis ?? '', posterUrl: record.posterUrl ?? undefined,
    backdropUrl: record.backdropUrl ?? undefined, year: record.year ?? undefined, rating: record.rating ?? undefined,
    anilistId: record.anilistId ?? undefined, malId: record.malId ?? undefined,
    animeFormat: record.animeFormat as LibraryMediaEntry['animeFormat'],
  };
}
export function entryPayload(entry: LibraryMediaEntry) {
  return { mediaId: entry.id, mediaProvider: entry.provider, mediaType: entry.type, title: entry.title,
    synopsis: entry.synopsis.slice(0, 1000), posterUrl: entry.posterUrl, backdropUrl: entry.backdropUrl,
    year: entry.year, rating: entry.rating, anilistId: entry.anilistId, malId: entry.malId, animeFormat: entry.animeFormat };
}

export function buildPersonalCollections(data: PersonalLibraryData) {
  const history = data.history.map(serverEntryToClient).filter((entry): entry is RecentlyWatchedEntry => entry !== null && entry.provider !== 'mangadex');
  const completed = new Set(data.bookmarks.filter((record) => record.status === 'watched').map(recordTitleKey));
  const completeEpisodes = new Map<string, Set<string>>();
  for (const progress of data.progress) {
    if (!progress.completed) continue;
    const key = recordTitleKey(progress);
    if (progress.mediaType === 'movie') completed.add(key);
    else if (progress.episode) {
      const episodes = completeEpisodes.get(key) ?? new Set<string>();
      episodes.add(`${progress.season || '1'}:${progress.episode}`);
      completeEpisodes.set(key, episodes);
    }
  }
  for (const entry of history) {
    if (entry.type === 'movie' && (entry.progressPercent ?? 0) >= 95) completed.add(titleKey(entry));
    // Only a known full episode count can establish automatic series completion.
    if (entry.type === 'tv' && entry.finishedEpisodeCount && (completeEpisodes.get(titleKey(entry))?.size ?? 0) >= entry.finishedEpisodeCount) completed.add(titleKey(entry));
  }
  const again = new Map<string, LibraryMediaEntry>();
  for (const record of data.bookmarks) {
    if (record.status !== 'watched') continue;
    const entry = recordToEntry(record);
    if (entry && entry.provider !== 'mangadex') again.set(titleKey(entry), entry);
  }
  for (const entry of history) if (completed.has(titleKey(entry))) again.set(titleKey(entry), entry);
  // Progress records can outlive the bounded recent-history snapshot.
  for (const progress of data.progress) {
    if (!progress.completed || progress.mediaType !== 'movie') continue;
    const entry = recordToEntry(progress as unknown as PersonalTitleRecord);
    if (entry && !again.has(titleKey(entry))) again.set(titleKey(entry), entry);
  }
  return { continueWatching: history.filter((entry) => !completed.has(titleKey(entry))),
    recentlyWatched: history, watchAgain: [...again.values()],
    myList: data.bookmarks.filter((record) => record.status === 'favorite'),
    likes: data.likes, trailers: data.trailers };
}
