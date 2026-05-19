import 'server-only';

import { isTvEntry, type MediaEntry, type MediaType, type MovieMediaEntry, type TvMediaEntry } from '@/lib/media/types';

const TMDB_API_BASE_URL = process.env.TMDB_API_BASE_URL?.trim() || 'https://api.themoviedb.org/3';

type TmdbLookupFailureReason = 'missing-config' | 'not-found' | 'upstream-error';

interface TmdbMovieResponse {
  id: number;
  overview?: string;
  release_date?: string;
  title: string;
}

interface TmdbSeasonSummary {
  episode_count?: number;
  season_number: number;
}

interface TmdbTvResponse {
  first_air_date?: string;
  id: number;
  name: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  overview?: string;
  seasons?: TmdbSeasonSummary[];
}

export interface TmdbLookupSuccess {
  entry: MediaEntry;
  ok: true;
}

export interface TmdbLookupFailure {
  message: string;
  ok: false;
  reason: TmdbLookupFailureReason;
  status: number;
}

export type TmdbLookupResult = TmdbLookupSuccess | TmdbLookupFailure;

interface TmdbCredentials {
  apiKey?: string;
  bearerToken?: string;
}

function readTmdbCredentials(): TmdbCredentials | null {
  const bearerToken = process.env.TMDB_API_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();

  if (!bearerToken && !apiKey) {
    return null;
  }

  return {
    apiKey,
    bearerToken,
  };
}

function getReleaseYear(dateValue?: string): number | undefined {
  if (!dateValue) {
    return undefined;
  }

  const year = Number.parseInt(dateValue.slice(0, 4), 10);
  return Number.isNaN(year) ? undefined : year;
}

function buildEpisodesBySeason(seasons: TmdbSeasonSummary[] | undefined): Record<string, number> {
  const entries = (seasons ?? [])
    .filter((season) => season.season_number > 0 && typeof season.episode_count === 'number')
    .map((season) => [String(season.season_number), Math.max(season.episode_count ?? 1, 1)]);

  return Object.fromEntries(entries);
}

function createMovieEntry(response: TmdbMovieResponse, tmdbId: string): MovieMediaEntry {
  return {
    aliases: [],
    slug: tmdbId,
    synopsis: response.overview?.trim() || '',
    title: response.title,
    tmdbId,
    type: 'movie',
    year: getReleaseYear(response.release_date),
  };
}

function createTvEntry(response: TmdbTvResponse, tmdbId: string): TvMediaEntry {
  const episodesBySeason = buildEpisodesBySeason(response.seasons);
  const seasonNumbers = Object.keys(episodesBySeason).map((seasonNumber) => Number.parseInt(seasonNumber, 10));
  const seasonEpisodeCounts = Object.values(episodesBySeason);
  const fallbackSeasonCount = Math.max(response.number_of_seasons ?? 1, 1);
  const fallbackEpisodeCount = Math.max(response.number_of_episodes ?? 1, 1);

  return {
    aliases: [],
    episodesBySeason,
    maxEpisodes: seasonEpisodeCounts.length > 0 ? Math.max(...seasonEpisodeCounts) : fallbackEpisodeCount,
    maxSeasons: seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : fallbackSeasonCount,
    slug: tmdbId,
    synopsis: response.overview?.trim() || '',
    title: response.name,
    tmdbId,
    totalEpisodes: fallbackEpisodeCount,
    type: 'tv',
    year: getReleaseYear(response.first_air_date),
  };
}

export function mergeCatalogEntryWithTmdb(catalogEntry: MediaEntry, tmdbEntry: MediaEntry): MediaEntry {
  const synopsis = tmdbEntry.synopsis || catalogEntry.synopsis;
  const title = tmdbEntry.title || catalogEntry.title;
  const year = tmdbEntry.year ?? catalogEntry.year;

  if (isTvEntry(catalogEntry) && isTvEntry(tmdbEntry)) {
    return {
      ...catalogEntry,
      ...tmdbEntry,
      aliases: catalogEntry.aliases,
      episodesBySeason:
        Object.keys(tmdbEntry.episodesBySeason ?? {}).length > 0
          ? tmdbEntry.episodesBySeason
          : catalogEntry.episodesBySeason,
      slug: catalogEntry.slug,
      synopsis,
      title,
      totalEpisodes: tmdbEntry.totalEpisodes ?? catalogEntry.totalEpisodes,
      year,
    };
  }

  if (!isTvEntry(catalogEntry) && !isTvEntry(tmdbEntry)) {
    return {
      ...catalogEntry,
      ...tmdbEntry,
      aliases: catalogEntry.aliases,
      slug: catalogEntry.slug,
      synopsis,
      title,
      year,
    };
  }

  return catalogEntry;
}

export async function lookupTmdbMediaEntry(tmdbId: string, type: MediaType): Promise<TmdbLookupResult> {
  const credentials = readTmdbCredentials();
  if (!credentials) {
    return {
      message: 'TMDB metadata is not configured. Set TMDB_API_TOKEN or TMDB_API_KEY in your environment.',
      ok: false,
      reason: 'missing-config',
      status: 503,
    };
  }

  const requestUrl = new URL(`${TMDB_API_BASE_URL}/${type}/${encodeURIComponent(tmdbId)}`);
  if (!credentials.bearerToken && credentials.apiKey) {
    requestUrl.searchParams.set('api_key', credentials.apiKey);
  }

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
        ...(credentials.bearerToken
          ? {
              Authorization: `Bearer ${credentials.bearerToken}`,
            }
          : {}),
      },
      next: {
        revalidate: 86400,
      },
    });

    if (response.status === 404) {
      return {
        message: `TMDB ${type} ${tmdbId} was not found.`,
        ok: false,
        reason: 'not-found',
        status: 404,
      };
    }

    if (!response.ok) {
      return {
        message: `TMDB lookup failed with status ${response.status}.`,
        ok: false,
        reason: 'upstream-error',
        status: 502,
      };
    }

    if (type === 'movie') {
      const payload = (await response.json()) as TmdbMovieResponse;
      return {
        entry: createMovieEntry(payload, tmdbId),
        ok: true,
      };
    }

    const payload = (await response.json()) as TmdbTvResponse;
    return {
      entry: createTvEntry(payload, tmdbId),
      ok: true,
    };
  } catch {
    return {
      message: 'Unable to reach TMDB right now. Try again later.',
      ok: false,
      reason: 'upstream-error',
      status: 502,
    };
  }
}