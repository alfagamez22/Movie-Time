import 'server-only';

import { appConfig } from '@/lib/config';

// Imported lazily below via a deferred require to avoid a circular-type
// dependency at module evaluation time (episodes.ts imports AnilistMedia type
// from this file). At runtime there is no cycle since that import is
// type-only and erased. We use a regular import here because modern bundlers
// and Node.js ESM handle circular type-only references correctly.
import { isReleasedAnime } from './episodes';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type AnilistFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
export type AnilistStatus = 'FINISHED' | 'NOT_YET_RELEASED' | 'RELEASING' | 'CANCELLED' | 'HIATUS';
export type AnilistSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AnilistTitleGroup {
  english?: string | null;
  native?: string | null;
  romaji?: string | null;
  userPreferred?: string | null;
}

export interface AnilistCoverImage {
  extraLarge?: string | null;
  large?: string | null;
}

export interface AnilistMedia {
  averageScore?: number | null;
  bannerImage?: string | null;
  coverImage?: AnilistCoverImage | null;
  description?: string | null;
  duration?: number | null;
  episodes?: number | null;
  format?: AnilistFormat | null;
  genres?: string[] | null;
  id: number;
  idMal?: number | null;
  nextAiringEpisode?: {
    airingAt?: number | null;
    episode?: number | null;
  } | null;
  popularity?: number | null;
  season?: AnilistSeason | null;
  seasonYear?: number | null;
  startDate?: {
    day?: number | null;
    month?: number | null;
    year?: number | null;
  } | null;
  status?: AnilistStatus | null;
  synonyms?: string[] | null;
  title: AnilistTitleGroup;
}

export interface AnilistCharacterEdge {
  node?: {
    image?: {
      large?: string | null;
    } | null;
    name?: {
      full?: string | null;
    } | null;
  } | null;
  role?: string | null;
  voiceActors?: Array<{
    image?: {
      large?: string | null;
    } | null;
    name?: {
      full?: string | null;
    } | null;
  }> | null;
}

export interface AnilistRecommendationNode {
  mediaRecommendation?: AnilistMedia | null;
}

export interface AnilistRelationEdge {
  node?: AnilistMedia | null;
  relationType?: string | null;
}

export interface AnilistTrailer {
  id?: string | null;
  site?: string | null;
  thumbnail?: string | null;
}

export interface AnilistMediaDetails extends AnilistMedia {
  characters?: {
    edges?: AnilistCharacterEdge[] | null;
  } | null;
  recommendations?: {
    nodes?: AnilistRecommendationNode[] | null;
  } | null;
  relations?: {
    edges?: AnilistRelationEdge[] | null;
  } | null;
  trailer?: AnilistTrailer | null;
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface BrowseQueryResult {
  airing: { media: AnilistMedia[] };
  completed: { media: AnilistMedia[] };
  movies: { media: AnilistMedia[] };
  seasonal: { media: AnilistMedia[] };
  topRated: { media: AnilistMedia[] };
  trending: { media: AnilistMedia[] };
}

interface DetailsQueryResult {
  Media: AnilistMediaDetails | null;
}

interface SearchQueryResult {
  Page: {
    media: AnilistMedia[];
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const BROWSE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — browse sections change slowly
const responseCache = new Map<string, CacheEntry<unknown>>();

const MEDIA_CARD_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
    userPreferred
  }
  synonyms
  description(asHtml: false)
  format
  status
  episodes
  duration
  averageScore
  popularity
  coverImage {
    extraLarge
    large
  }
  bannerImage
  season
  seasonYear
  startDate {
    day
    month
    year
  }
  nextAiringEpisode {
    airingAt
    episode
  }
  genres
`;

function getCurrentSeason(date = new Date()): { season: AnilistSeason; year: number } {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  if (month <= 3) return { season: 'WINTER', year };
  if (month <= 6) return { season: 'SPRING', year };
  if (month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

async function requestAnilist<T>(query: string, variables: Record<string, unknown>, ttlMs = CACHE_TTL_MS): Promise<T> {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (appConfig.anilistClientId) {
    headers['X-Anilist-Client-Id'] = appConfig.anilistClientId;
  }

  const response = await fetch(appConfig.anilistGraphqlUrl, {
    body: JSON.stringify({ query, variables }),
    headers,
    method: 'POST',
    next: {
      revalidate: Math.max(60, Math.floor(ttlMs / 1000)),
    },
  });

  if (!response.ok) {
    throw new Error(`AniList request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GraphqlEnvelope<T>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join(' | ') || 'AniList request failed.');
  }

  if (!payload.data) {
    throw new Error('AniList returned an empty payload.');
  }

  responseCache.set(cacheKey, {
    expiresAt: now + ttlMs,
    value: payload.data,
  });

  return payload.data;
}

export async function fetchAnilistMediaById(id: string): Promise<AnilistMediaDetails | null> {
  const parsedId = Number.parseInt(id, 10);
  if (!Number.isFinite(parsedId) || parsedId < 1) {
    return null;
  }

  const query = `
    query AnimeDetails($id: Int!) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_CARD_FRAGMENT}
        trailer {
          id
          site
          thumbnail
        }
        recommendations(sort: [RATING_DESC], page: 1, perPage: 10) {
          nodes {
            mediaRecommendation {
              ${MEDIA_CARD_FRAGMENT}
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              ${MEDIA_CARD_FRAGMENT}
            }
          }
        }
        characters(page: 1, perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
          edges {
            role
            node {
              name {
                full
              }
              image {
                large
              }
            }
            voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
              name {
                full
              }
              image {
                large
              }
            }
          }
        }
      }
    }
  `;

  const result = await requestAnilist<DetailsQueryResult>(query, { id: parsedId });
  return result.Media ?? null;
}

function buildAdultFilter(): string {
  return appConfig.animeIncludeAdult ? '' : 'isAdult: false, ';
}

export async function searchAnilistAnime(queryText: string, perPage = 18): Promise<AnilistMedia[]> {
  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) {
    return [];
  }

  const query = `
    query AnimeSearch($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, ${buildAdultFilter()}search: $search, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const result = await requestAnilist<SearchQueryResult>(query, {
    perPage,
    search: trimmedQuery,
  });

  return result.Page.media?.filter(isReleasedAnime) ?? [];
}

export async function fetchAnilistBrowseBuckets(): Promise<BrowseQueryResult> {
  const { season, year } = getCurrentSeason();
  const adultFilter = buildAdultFilter();
  const query = `
    query AnimeBrowse($season: MediaSeason!, $seasonYear: Int!) {
      trending: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}sort: [TRENDING_DESC, POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      seasonal: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      airing: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}status: RELEASING, sort: [POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      topRated: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}sort: [SCORE_DESC, POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      movies: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}format: MOVIE, sort: [POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      completed: Page(page: 1, perPage: 18) {
        media(type: ANIME, ${adultFilter}status: FINISHED, sort: [END_DATE_DESC, POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const result = await requestAnilist<BrowseQueryResult>(query, {
    season,
    seasonYear: year,
  }, BROWSE_CACHE_TTL_MS);

  // Filter unreleased entries at the data layer so all callers get clean lists.
  const filterBucket = (bucket: { media: AnilistMedia[] }) => ({
    media: bucket.media.filter(isReleasedAnime),
  });

  return {
    airing: filterBucket(result.airing),
    completed: filterBucket(result.completed),
    movies: filterBucket(result.movies),
    seasonal: filterBucket(result.seasonal),
    topRated: filterBucket(result.topRated),
    trending: filterBucket(result.trending),
  };
}
