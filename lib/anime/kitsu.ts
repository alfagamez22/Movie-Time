import 'server-only';

import { appConfig } from '@/lib/config';
import { cleanSynopsis, cleanText } from '@/lib/anime/episodes';
import { normalizeSlug } from '@/lib/slugs/media';
import { toLibraryMediaEntry, type LibraryMediaEntry, type MediaType } from '@/lib/media/types';

// ---------------------------------------------------------------------------
// Kitsu JSON:API client
// ---------------------------------------------------------------------------
//
// Kitsu (https://kitsu.app) is a free anime catalog with a public JSON:API
// endpoint at https://kitsu.app/api/edge/. No authentication is required.
// Anime records have a stable Kitsu numeric id (e.g. "1" for "Crayon Shin-chan")
// and rich metadata (titles, episode count, ratings, posters, start date).
//
// The responses follow the JSON:API spec — we surface only the fields we need
// for the PapiAnime player; the rest is intentionally left untyped.

interface KitsuTitles {
  en?: string | null;
  ja_jp?: string | null;
}

interface KitsuPosterImage {
  original?: string | null;
  large?: string | null;
  medium?: string | null;
  small?: string | null;
}

interface KitsuCoverImage {
  original?: string | null;
  large?: string | null;
  small?: string | null;
}

interface KitsuAttributes {
  averageRating?: string | null;
  coverImage?: KitsuCoverImage | null;
  description?: string | null;
  endDate?: string | null;
  episodeCount?: number | null;
  episodeLength?: number | null;
  posterImage?: KitsuPosterImage | null;
  showType?: string | null;
  slug?: string | null;
  startDate?: string | null;
  status?: string | null;
  titles?: KitsuTitles | null;
  userCount?: number | null;
  youtubeTrailerVideoId?: string | null;
}

interface KitsuResource<TAttrs> {
  attributes?: TAttrs | null;
  id: string;
  type: 'anime';
}

interface KitsuListResponse<TAttrs> {
  data?: KitsuResource<TAttrs>[] | null;
  meta?: {
    count?: number | null;
  };
}

interface KitsuSingleResponse<TAttrs> {
  data?: KitsuResource<TAttrs> | null;
}

const KITSUShowTypeToAnimeFormat: Record<string, 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'TV_SHORT' | 'MUSIC'> = {
  movie: 'MOVIE',
  music: 'MUSIC',
  ona: 'ONA',
  ova: 'OVA',
  special: 'SPECIAL',
  tv: 'TV',
  tv_short: 'TV_SHORT',
};

const KITSUShowTypeToMediaType: Record<string, MediaType> = {
  movie: 'movie',
  music: 'tv',
  ona: 'tv',
  ova: 'tv',
  special: 'movie',
  tv: 'tv',
  tv_short: 'tv',
};

function mapShowType(showType: string | null | undefined): { animeFormat: 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'TV_SHORT' | 'MUSIC'; type: MediaType } {
  const normalized = (showType ?? '').toLowerCase();
  const animeFormat = KITSUShowTypeToAnimeFormat[normalized] ?? 'TV';
  const type = KITSUShowTypeToMediaType[normalized] ?? 'tv';
  return { animeFormat, type };
}

function mapKitsuStatusToReleased(status: string | null | undefined): boolean {
  // Kitsu statuses: current, finished, upcoming, tba, unreleased
  const normalized = (status ?? '').toLowerCase();
  return normalized === 'current' || normalized === 'finished';
}

function parseKitsuRating(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round((parsed / 10) * 100) / 100;
}

function parseKitsuYear(date: string | null | undefined): number | undefined {
  if (!date) return undefined;
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).getUTCFullYear();
}

function getKitsuTitle(attributes: KitsuAttributes): string {
  return (
    cleanText(attributes.titles?.en) ||
    cleanText(attributes.titles?.ja_jp) ||
    cleanText(attributes.slug) ||
    'Unknown title'
  );
}

function getKitsuPosterUrl(attributes: KitsuAttributes): string | undefined {
  return (
    cleanText(attributes.posterImage?.original) ||
    cleanText(attributes.posterImage?.large) ||
    cleanText(attributes.posterImage?.medium) ||
    cleanText(attributes.posterImage?.small) ||
    undefined
  );
}

function getKitsuBackdropUrl(attributes: KitsuAttributes): string | undefined {
  return (
    cleanText(attributes.coverImage?.original) ||
    cleanText(attributes.coverImage?.large) ||
    cleanText(attributes.coverImage?.small) ||
    getKitsuPosterUrl(attributes)
  );
}

interface KitsuAdapterContext {
  baseUrl: string;
}

function readKitsuBaseUrl(): string {
  return appConfig.kitsuApiBaseUrl.replace(/\/+$/, '');
}

function buildKitsuContext(): KitsuAdapterContext {
  return { baseUrl: readKitsuBaseUrl() };
}

function buildKitsuHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

async function kitsuFetch<T>(url: string, revalidateSeconds: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: buildKitsuHeaders(),
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

function kitsuResourceToLibraryEntry(resource: KitsuResource<KitsuAttributes>): LibraryMediaEntry | null {
  const attributes = resource.attributes;
  if (!attributes) {
    return null;
  }

  if (!mapKitsuStatusToReleased(attributes.status)) {
    return null;
  }

  const { animeFormat, type } = mapShowType(attributes.showType);
  const title = getKitsuTitle(attributes);
  const episodeCount = typeof attributes.episodeCount === 'number' && attributes.episodeCount > 0
    ? attributes.episodeCount
    : 1;

  const entry: import('@/lib/media/types').MovieMediaEntry | import('@/lib/media/types').TvMediaEntry =
    type === 'movie'
      ? {
          aliases: dedupeTitles(attributes),
          animeFormat,
          anilistId: undefined,
          backdropUrl: getKitsuBackdropUrl(attributes),
          defaultLanguage: 'sub',
          episodeCount: 1,
          id: `kitsu-${resource.id}`,
          malId: undefined,
          posterUrl: getKitsuPosterUrl(attributes),
          provider: 'anilist',
          rating: parseKitsuRating(attributes.averageRating),
          slug: normalizeSlug(title) || resource.id,
          synopsis: cleanSynopsis(attributes.description),
          title,
          type: 'movie',
          year: parseKitsuYear(attributes.startDate),
        }
      : {
          aliases: dedupeTitles(attributes),
          animeFormat,
          anilistId: undefined,
          backdropUrl: getKitsuBackdropUrl(attributes),
          defaultLanguage: 'sub',
          episodeCount,
          episodesBySeason: { '1': episodeCount },
          id: `kitsu-${resource.id}`,
          malId: undefined,
          maxEpisodes: episodeCount,
          maxSeasons: 1,
          posterUrl: getKitsuPosterUrl(attributes),
          provider: 'anilist',
          rating: parseKitsuRating(attributes.averageRating),
          slug: normalizeSlug(title) || resource.id,
          synopsis: cleanSynopsis(attributes.description),
          title,
          totalEpisodes: episodeCount,
          type: 'tv',
          year: parseKitsuYear(attributes.startDate),
        };

  return toLibraryMediaEntry(entry);
}

function dedupeTitles(attributes: KitsuAttributes): string[] {
  const titles = [attributes.titles?.en, attributes.titles?.ja_jp, attributes.slug]
    .map((value) => cleanText(value))
    .filter(Boolean);
  return Array.from(new Set(titles));
}

export interface KitsuSearchOptions {
  limit?: number;
  revalidateSeconds?: number;
}

export async function searchKitsuAnime(
  query: string,
  options: KitsuSearchOptions = {},
): Promise<LibraryMediaEntry[]> {
  const trimmedQuery = cleanText(query);
  if (!trimmedQuery) {
    return [];
  }

  const { baseUrl } = buildKitsuContext();
  const limit = Math.min(Math.max(options.limit ?? 18, 1), 20);
  const params = new URLSearchParams({
    'fields[anime]':
      'titles,slug,description,startDate,endDate,status,showType,episodeCount,episodeLength,posterImage,coverImage,averageRating,userCount',
    'filter[text]': trimmedQuery,
    'page[limit]': String(limit),
    'sort': '-userCount',
  });
  const url = `${baseUrl}/anime?${params.toString()}`;

  const response = await kitsuFetch<KitsuListResponse<KitsuAttributes>>(url, options.revalidateSeconds ?? 300);
  if (!response?.data) {
    return [];
  }

  return response.data
    .map(kitsuResourceToLibraryEntry)
    .filter((entry): entry is LibraryMediaEntry => entry !== null)
    .slice(0, limit);
}

export interface KitsuTrendingOptions {
  limit?: number;
  revalidateSeconds?: number;
}

export async function fetchKitsuTrendingAnime(
  options: KitsuTrendingOptions = {},
): Promise<LibraryMediaEntry[]> {
  const { baseUrl } = buildKitsuContext();
  const limit = Math.min(Math.max(options.limit ?? 18, 1), 20);
  const params = new URLSearchParams({
    'fields[anime]':
      'titles,slug,description,startDate,endDate,status,showType,episodeCount,episodeLength,posterImage,coverImage,averageRating,userCount',
    'filter[status]': 'current',
    'page[limit]': String(limit),
    'sort': '-userCount',
  });
  const url = `${baseUrl}/anime?${params.toString()}`;

  const response = await kitsuFetch<KitsuListResponse<KitsuAttributes>>(url, options.revalidateSeconds ?? 600);
  if (!response?.data) {
    return [];
  }

  return response.data
    .map(kitsuResourceToLibraryEntry)
    .filter((entry): entry is LibraryMediaEntry => entry !== null)
    .slice(0, limit);
}

export async function fetchKitsuAnimeById(kitsuId: string): Promise<LibraryMediaEntry | null> {
  const trimmedId = cleanText(kitsuId);
  if (!trimmedId) {
    return null;
  }

  const { baseUrl } = buildKitsuContext();
  const params = new URLSearchParams({
    'fields[anime]':
      'titles,slug,description,startDate,endDate,status,showType,episodeCount,episodeLength,posterImage,coverImage,averageRating,userCount',
  });
  const url = `${baseUrl}/anime/${encodeURIComponent(trimmedId)}?${params.toString()}`;

  const response = await kitsuFetch<KitsuSingleResponse<KitsuAttributes>>(url, 600);
  if (!response?.data) {
    return null;
  }

  return kitsuResourceToLibraryEntry(response.data);
}

export function getKitsuAnimeBaseUrl(): string {
  return readKitsuBaseUrl();
}

