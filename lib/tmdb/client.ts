import 'server-only';

import {
  isTvEntry,
  type MediaEntry,
  type MediaType,
  type MovieMediaEntry,
  type SeasonDetails,
  type TvMediaEntry,
} from '@/lib/media/types';

const TMDB_API_BASE_URL = process.env.TMDB_API_BASE_URL?.trim() || 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';

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

interface TmdbEpisodeResponse {
  air_date?: string;
  episode_number: number;
  name: string;
  overview?: string;
  runtime?: number;
  season_number: number;
  still_path?: string;
}

interface TmdbSeasonDetailsResponse {
  air_date?: string;
  episodes?: TmdbEpisodeResponse[];
  name: string;
  overview?: string;
  poster_path?: string;
  season_number: number;
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
export type TmdbSeasonDetailsResult =
  | {
      data: SeasonDetails;
      ok: true;
    }
  | TmdbLookupFailure;

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

function buildTmdbImageUrl(path: string | undefined, size: 'w300' | 'w780' = 'w780'): string | undefined {
  if (!path) {
    return undefined;
  }

  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function createUpstreamFailure(message: string, reason: TmdbLookupFailureReason, status: number): TmdbLookupFailure {
  return {
    message,
    ok: false,
    reason,
    status,
  };
}

function buildTmdbRequestUrl(pathname: string, credentials: TmdbCredentials): URL {
  const requestUrl = new URL(`${TMDB_API_BASE_URL}${pathname}`);
  if (!credentials.bearerToken && credentials.apiKey) {
    requestUrl.searchParams.set('api_key', credentials.apiKey);
  }

  return requestUrl;
}

function buildTmdbRequestHeaders(credentials: TmdbCredentials): HeadersInit {
  return {
    Accept: 'application/json',
    ...(credentials.bearerToken
      ? {
          Authorization: `Bearer ${credentials.bearerToken}`,
        }
      : {}),
  };
}

async function requestTmdb(pathname: string): Promise<Response | TmdbLookupFailure> {
  const credentials = readTmdbCredentials();
  if (!credentials) {
    return createUpstreamFailure(
      'TMDB metadata is not configured. Set TMDB_API_TOKEN or TMDB_API_KEY in your environment.',
      'missing-config',
      503,
    );
  }

  const requestUrl = buildTmdbRequestUrl(pathname, credentials);

  try {
    return await fetch(requestUrl, {
      headers: buildTmdbRequestHeaders(credentials),
      next: {
        revalidate: 86400,
      },
    });
  } catch {
    return createUpstreamFailure('Unable to reach TMDB right now. Try again later.', 'upstream-error', 502);
  }
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

function createSeasonDetails(response: TmdbSeasonDetailsResponse): SeasonDetails {
  const episodes = (response.episodes ?? []).map((episode) => ({
    airDate: episode.air_date,
    episodeNumber: episode.episode_number,
    name: episode.name,
    overview: episode.overview?.trim() || '',
    runtime: episode.runtime,
    seasonNumber: episode.season_number,
    stillUrl: buildTmdbImageUrl(episode.still_path),
  }));

  return {
    airDate: response.air_date,
    episodeCount: episodes.length,
    episodes,
    name: response.name,
    overview: response.overview?.trim() || '',
    posterUrl: buildTmdbImageUrl(response.poster_path, 'w300'),
    seasonNumber: response.season_number,
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
  const response = await requestTmdb(`/${type}/${encodeURIComponent(tmdbId)}`);
  if (!(response instanceof Response)) {
    return response;
  }

  if (response.status === 404) {
    return createUpstreamFailure(`TMDB ${type} ${tmdbId} was not found.`, 'not-found', 404);
  }

  if (!response.ok) {
    return createUpstreamFailure(`TMDB lookup failed with status ${response.status}.`, 'upstream-error', 502);
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
}

export async function lookupTmdbSeasonDetails(
  tmdbId: string,
  seasonNumber: number,
): Promise<TmdbSeasonDetailsResult> {
  const response = await requestTmdb(`/tv/${encodeURIComponent(tmdbId)}/season/${seasonNumber}`);
  if (!(response instanceof Response)) {
    return response;
  }

  if (response.status === 404) {
    return createUpstreamFailure(
      `TMDB season ${seasonNumber} for TV ID ${tmdbId} was not found.`,
      'not-found',
      404,
    );
  }

  if (!response.ok) {
    return createUpstreamFailure(
      `TMDB season lookup failed with status ${response.status}.`,
      'upstream-error',
      502,
    );
  }

  const payload = (await response.json()) as TmdbSeasonDetailsResponse;
  return {
    data: createSeasonDetails(payload),
    ok: true,
  };
}