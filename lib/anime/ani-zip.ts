import 'server-only';

import { appConfig } from '@/lib/config';

interface AniZipTitleGroup {
  en?: string | null;
  'x-jat'?: string | null;
  ja?: string | null;
}

export interface AniZipEpisode {
  airDate?: string | null;
  episodeNumber?: number | null;
  image?: string | null;
  overview?: string | null;
  runtime?: number | null;
  title?: AniZipTitleGroup | null;
}

export interface AniZipMappingsResponse {
  episodes?: Record<string, AniZipEpisode> | null;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, CacheEntry<unknown>>();
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

function parseEpisodeNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchAniZipMappings(anilistId: string): Promise<AniZipMappingsResponse | null> {
  const parsedId = Number.parseInt(anilistId, 10);
  if (!Number.isFinite(parsedId) || parsedId < 1) {
    return null;
  }

  const requestUrl = new URL('/mappings', appConfig.aniZipApiBaseUrl);
  requestUrl.searchParams.set('anilist_id', String(parsedId));

  const cacheKey = requestUrl.toString();
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value as AniZipMappingsResponse;
  }

  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
    },
    next: {
      revalidate: 300,
    },
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as AniZipMappingsResponse | null;
  if (!payload) {
    return null;
  }

  responseCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: payload,
  });

  return payload;
}

export function listAniZipEpisodes(mappings: AniZipMappingsResponse | null | undefined): AniZipEpisode[] {
  const episodes = mappings?.episodes ?? {};

  return Object.entries(episodes)
    .map(([key, value]) => ({
      ...value,
      episodeNumber: value?.episodeNumber ?? parseEpisodeNumber(key),
    }))
    .filter((episode): episode is AniZipEpisode & { episodeNumber: number } => {
      return typeof episode.episodeNumber === 'number' && Number.isFinite(episode.episodeNumber) && episode.episodeNumber > 0;
    })
    .sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
}

export function getAniZipEpisodeCount(mappings: AniZipMappingsResponse | null | undefined): number {
  return listAniZipEpisodes(mappings).length;
}

export function getAniZipEpisodeTitle(episode: AniZipEpisode | null | undefined): string {
  return (
    episode?.title?.en?.trim() ||
    episode?.title?.['x-jat']?.trim() ||
    episode?.title?.ja?.trim() ||
    ''
  );
}
