import 'server-only';

import { appConfig } from '@/lib/config';
import { cleanSynopsis, cleanText } from '@/lib/anime/episodes';
import { normalizeSlug } from '@/lib/slugs/media';
import { toLibraryMediaEntry, type LibraryMediaEntry, type MediaType } from '@/lib/media/types';

// ---------------------------------------------------------------------------
// Jikan v4 REST client
// ---------------------------------------------------------------------------
//
// Jikan (https://jikan.moe) is a free, unauthenticated REST wrapper around
// MyAnimeList. Anime records have a stable MAL numeric id (e.g. "1" for
// "Cowboy Bebop") and rich metadata. Used to back PapiAnime Players 5.
// Rate-limited to ~3 requests/second; we cache aggressively (1 hour TTL).
//
// Response shape (subset):
//   { data: { mal_id, title, title_english, title_japanese, type, episodes,
//             score, scored_by, images, aired, status, synopsis, ... } }

interface JikanAired {
  from?: string | null;
  prop?: {
    from?: { year?: number | null } | null;
    to?: { year?: number | null } | null;
  } | null;
  to?: string | null;
}

interface JikanImageSet {
  jpg?: { image_url?: string | null; large_image_url?: string | null } | null;
  webp?: { image_url?: string | null; large_image_url?: string | null } | null;
}

interface JikanImages {
  jpg?: JikanImageSet['jpg'] | null;
  webp?: JikanImageSet['webp'] | null;
}

interface JikanTrailer {
  url?: string | null;
  youtube_id?: string | null;
}

interface JikanAnime {
  aired?: JikanAired | null;
  episodes?: number | null;
  images?: JikanImages | null;
  mal_id: number;
  score?: number | null;
  scored_by?: number | null;
  status?: string | null;
  synopsis?: string | null;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
  trailer?: JikanTrailer | null;
  type?: string | null;
  url?: string | null;
  year?: number | null;
}

interface JikanListResponse {
  data?: JikanAnime[];
  pagination?: {
    has_next_page?: boolean;
    items?: { count?: number; total?: number };
  };
}

interface JikanSingleResponse {
  data?: JikanAnime | null;
}

const JIKAN_TYPE_TO_MEDIA_TYPE: Record<string, MediaType> = {
  movie: 'movie',
  music: 'tv',
  ona: 'tv',
  ova: 'tv',
  special: 'movie',
  tv: 'tv',
};

const JIKAN_TYPE_TO_ANIME_FORMAT: Record<string, 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC'> = {
  movie: 'MOVIE',
  music: 'MUSIC',
  ona: 'ONA',
  ova: 'OVA',
  special: 'SPECIAL',
  tv: 'TV',
};

function readJikanBaseUrl(): string {
  return appConfig.jikanApiBaseUrl.replace(/\/+$/, '');
}

function mapJikanTypeToFields(type: string | null | undefined): {
  animeFormat: 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
  mediaType: MediaType;
} {
  const normalized = (type ?? '').toLowerCase();
  const animeFormat = JIKAN_TYPE_TO_ANIME_FORMAT[normalized] ?? 'TV';
  const mediaType = JIKAN_TYPE_TO_MEDIA_TYPE[normalized] ?? 'tv';
  return { animeFormat, mediaType };
}

function mapJikanStatusToReleased(status: string | null | undefined): boolean {
  // Jikan statuses: Finished Airing, Currently Airing, Not yet aired, etc.
  const normalized = (status ?? '').toLowerCase();
  return normalized.includes('finished') || normalized.includes('airing');
}

function parseJikanScore(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  // Jikan's `score` is already 0–10 (one decimal place). AniList's
  // `averageScore` is 0–100, so this adapter should not divide further.
  return Math.round(value * 100) / 100;
}

function parseJikanYear(value: number | null | undefined, aired: JikanAired | null | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const airedFrom = aired?.prop?.from?.year;
  if (typeof airedFrom === 'number' && Number.isFinite(airedFrom) && airedFrom > 0) {
    return airedFrom;
  }
  const airedFromString = aired?.from;
  if (airedFromString) {
    const parsed = Date.parse(airedFromString);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).getUTCFullYear();
    }
  }
  return undefined;
}

function getJikanTitle(anime: JikanAnime): string {
  return (
    cleanText(anime.title_english) ||
    cleanText(anime.title) ||
    cleanText(anime.title_japanese) ||
    `MAL ${anime.mal_id}`
  );
}

function getJikanPosterUrl(anime: JikanAnime): string | undefined {
  return (
    cleanText(anime.images?.jpg?.large_image_url) ||
    cleanText(anime.images?.jpg?.image_url) ||
    cleanText(anime.images?.webp?.large_image_url) ||
    cleanText(anime.images?.webp?.image_url) ||
    undefined
  );
}

function getJikanBackdropUrl(anime: JikanAnime): string | undefined {
  return getJikanPosterUrl(anime);
}

function jikanAnimeToLibraryEntry(anime: JikanAnime): LibraryMediaEntry | null {
  if (!mapJikanStatusToReleased(anime.status)) {
    return null;
  }

  const { animeFormat, mediaType } = mapJikanTypeToFields(anime.type);
  const title = getJikanTitle(anime);
  const episodeCount = typeof anime.episodes === 'number' && anime.episodes > 0 ? anime.episodes : 1;
  const posterUrl = getJikanPosterUrl(anime);
  const backdropUrl = getJikanBackdropUrl(anime);
  const year = parseJikanYear(anime.year ?? null, anime.aired ?? null);
  const rating = parseJikanScore(anime.score);

  const entry: import('@/lib/media/types').MovieMediaEntry | import('@/lib/media/types').TvMediaEntry =
    mediaType === 'movie'
      ? {
          aliases: dedupeJikanTitles(anime),
          animeFormat,
          anilistId: undefined,
          backdropUrl,
          defaultLanguage: 'sub',
          episodeCount: 1,
          id: `mal-${anime.mal_id}`,
          malId: String(anime.mal_id),
          posterUrl,
          provider: 'anilist',
          rating,
          slug: normalizeSlug(title) || String(anime.mal_id),
          synopsis: cleanSynopsis(anime.synopsis),
          title,
          type: 'movie',
          year,
        }
      : {
          aliases: dedupeJikanTitles(anime),
          animeFormat,
          anilistId: undefined,
          backdropUrl,
          defaultLanguage: 'sub',
          episodeCount,
          episodesBySeason: { '1': episodeCount },
          id: `mal-${anime.mal_id}`,
          malId: String(anime.mal_id),
          maxEpisodes: episodeCount,
          maxSeasons: 1,
          posterUrl,
          provider: 'anilist',
          rating,
          slug: normalizeSlug(title) || String(anime.mal_id),
          synopsis: cleanSynopsis(anime.synopsis),
          title,
          totalEpisodes: episodeCount,
          type: 'tv',
          year,
        };

  return toLibraryMediaEntry(entry);
}

function dedupeJikanTitles(anime: JikanAnime): string[] {
  return Array.from(
    new Set(
      [anime.title_english, anime.title, anime.title_japanese]
        .map((value) => cleanText(value))
        .filter(Boolean),
    ),
  );
}

async function jikanFetch<T>(url: string, revalidateSeconds: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: revalidateSeconds },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface JikanSearchOptions {
  limit?: number;
  revalidateSeconds?: number;
}

export async function searchJikanAnime(
  query: string,
  options: JikanSearchOptions = {},
): Promise<LibraryMediaEntry[]> {
  const trimmedQuery = cleanText(query);
  if (!trimmedQuery) {
    return [];
  }

  const baseUrl = readJikanBaseUrl();
  const limit = Math.min(Math.max(options.limit ?? 18, 1), 25);
  const params = new URLSearchParams({
    limit: String(limit),
    order_by: 'members',
    q: trimmedQuery,
    sort: 'desc',
  });
  const url = `${baseUrl}/anime?${params.toString()}`;

  const response = await jikanFetch<JikanListResponse>(url, options.revalidateSeconds ?? 600);
  if (!response?.data) {
    return [];
  }

  return response.data
    .map(jikanAnimeToLibraryEntry)
    .filter((entry): entry is LibraryMediaEntry => entry !== null)
    .slice(0, limit);
}

export interface JikanBrowseOptions {
  limit?: number;
  revalidateSeconds?: number;
}

export async function fetchJikanTopAnime(options: JikanBrowseOptions = {}): Promise<LibraryMediaEntry[]> {
  const baseUrl = readJikanBaseUrl();
  const limit = Math.min(Math.max(options.limit ?? 18, 1), 25);
  const params = new URLSearchParams({
    limit: String(limit),
  });
  const url = `${baseUrl}/top/anime?${params.toString()}`;

  const response = await jikanFetch<JikanListResponse>(url, options.revalidateSeconds ?? 3600);
  if (!response?.data) {
    return [];
  }

  return response.data
    .map(jikanAnimeToLibraryEntry)
    .filter((entry): entry is LibraryMediaEntry => entry !== null)
    .slice(0, limit);
}

export async function fetchJikanAnimeById(malId: string): Promise<LibraryMediaEntry | null> {
  const parsed = Number.parseInt(malId, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  const baseUrl = readJikanBaseUrl();
  const url = `${baseUrl}/anime/${parsed}/full`;

  const response = await jikanFetch<JikanSingleResponse>(url, 3600);
  if (!response?.data) {
    return null;
  }

  return jikanAnimeToLibraryEntry(response.data);
}

export function getJikanAnimeBaseUrl(): string {
  return readJikanBaseUrl();
}
