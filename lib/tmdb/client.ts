import 'server-only';

import {
  isTvEntry,
  toLibraryMediaEntry,
  type LibraryMediaEntry,
  type LibrarySection,
  type MediaCastMember,
  type MediaDetailsPayload,
  type MediaEntry,
  type MediaTrailer,
  type MediaType,
  type MovieMediaEntry,
  type SeasonDetails,
  type TvMediaEntry,
} from '@/lib/media/types';

const TMDB_API_BASE_URL = process.env.TMDB_API_BASE_URL?.trim() || 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';
const TMDB_IMAGE_PROXY_PATH = '/api/images/tmdb';
const TMDB_PUBLIC_DB_BASE_URL = process.env.TMDB_PUBLIC_DB_BASE_URL?.trim() || 'https://db.videasy.net/3';
const DEFAULT_TMDB_LANGUAGE = process.env.TMDB_LANGUAGE?.trim() || 'en-US';
const VIVAMAX_COMPANY_ID = '149142';

type TmdbLookupFailureReason = 'missing-config' | 'not-found' | 'upstream-error';

interface TmdbMovieResponse {
  backdrop_path?: string;
  id: number;
  overview?: string;
  poster_path?: string;
  release_date?: string;
  title: string;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbSeasonSummary {
  episode_count?: number;
  season_number: number;
}

interface TmdbTvResponse {
  backdrop_path?: string;
  first_air_date?: string;
  id: number;
  name: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  overview?: string;
  poster_path?: string;
  seasons?: TmdbSeasonSummary[];
  vote_average?: number;
  vote_count?: number;
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

interface TmdbBrowseResult {
  adult?: boolean;
  backdrop_path?: string;
  first_air_date?: string;
  id: number;
  media_type?: string;
  name?: string;
  overview?: string;
  poster_path?: string;
  release_date?: string;
  title?: string;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbCastResult {
  character?: string;
  id?: number;
  name?: string;
  order?: number;
  profile_path?: string;
}

interface TmdbCreditsResponse {
  cast?: TmdbCastResult[];
}

interface TmdbPagedResponse<T> {
  page?: number;
  results?: T[];
  total_pages?: number;
  total_results?: number;
}

interface TmdbSearchSuccess {
  entries: LibraryMediaEntry[];
  ok: true;
  page: number;
  totalPages: number;
  totalResults: number;
}

interface TmdbLibrarySectionsSuccess {
  featured: LibraryMediaEntry | null;
  ok: true;
  sections: LibrarySection[];
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
export type TmdbSearchResult = TmdbSearchSuccess | TmdbLookupFailure;
export type TmdbLibrarySectionsResult = TmdbLibrarySectionsSuccess | TmdbLookupFailure;
export type TmdbMediaDetailsResult =
  | {
      data: MediaDetailsPayload;
      ok: true;
    }
  | TmdbLookupFailure;

interface TmdbCredentials {
  apiKey?: string;
  bearerToken?: string;
}

interface MetadataRequestTarget {
  baseUrl: string;
  credentials?: TmdbCredentials | null;
  name: 'tmdb' | 'public-db';
}

interface TmdbBrowseSectionDefinition {
  adultOnly?: boolean;
  description: string;
  id: string;
  includeAdult?: boolean;
  pathname: string;
  type?: MediaType;
  title: string;
}

const TMDB_BROWSE_SECTIONS: TmdbBrowseSectionDefinition[] = [
  {
    description: 'The biggest titles picking up momentum across TMDB right now.',
    id: 'trending',
    pathname: '/trending/all/day',
    title: 'Trending Now',
  },
  {
    description: 'Popular movies from across the TMDB library.',
    id: 'movies',
    pathname: '/discover/movie?sort_by=popularity.desc',
    title: 'Movies',
    type: 'movie',
  },
  {
    description: 'Popular TV shows and series from across the TMDB library.',
    id: 'tv-shows',
    pathname: '/discover/tv?sort_by=popularity.desc',
    title: 'TV Shows',
    type: 'tv',
  },
  {
    description: 'Popular Filipino movies excluding TMDB titles produced by Vivamax.',
    id: 'filipino-movies',
    pathname: `/discover/movie?with_original_language=tl&region=PH&without_companies=${VIVAMAX_COMPANY_ID}&sort_by=popularity.desc`,
    title: 'Filipino Movies',
    type: 'movie',
  },
  {
    description: 'TMDB movies produced by Vivamax, separated from the general Filipino row.',
    id: 'vivamax-movies',
    includeAdult: true,
    pathname: `/discover/movie?with_companies=${VIVAMAX_COMPANY_ID}&sort_by=popularity.desc`,
    title: 'Vivamax Movies',
    type: 'movie',
  },
  {
    description: 'Popular Japanese movies from the TMDB library.',
    id: 'japanese-movies',
    pathname: '/discover/movie?with_original_language=ja&region=JP&sort_by=popularity.desc',
    title: 'Japanese Movies',
    type: 'movie',
  },
  {
    description: 'Mature-rated movies using PH R-18 certification data while excluding adult-only TMDB titles.',
    id: 'r18-movies',
    pathname: '/discover/movie?certification_country=PH&certification=R-18&sort_by=popularity.desc',
    title: 'R18 Movies',
    type: 'movie',
  },
  {
    adultOnly: true,
    description: 'Adult-tagged TMDB movie results surfaced separately from the standard mature row.',
    id: 'adult-r18-movies',
    includeAdult: true,
    pathname: '/discover/movie?sort_by=popularity.desc',
    title: 'Adult R18 Movies',
    type: 'movie',
  },
  {
    description: 'Broad-audience movies with the strongest current pull.',
    id: 'popular-movies',
    pathname: '/movie/popular',
    title: 'Popular Movies',
    type: 'movie',
  },
  {
    description: 'Series with the strongest ratings and long-tail binge value.',
    id: 'top-rated-series',
    pathname: '/tv/top_rated',
    title: 'Top Rated Series',
    type: 'tv',
  },
  {
    description: 'Highly rated movies across all time.',
    id: 'top-rated-movies',
    pathname: '/movie/top_rated',
    title: 'Top Rated Movies',
    type: 'movie',
  },
  {
    description: 'TV shows dominating viewership right now.',
    id: 'popular-tv',
    pathname: '/tv/popular',
    title: 'Popular TV Shows',
    type: 'tv',
  },
  {
    description: 'Newer theatrical releases and fresh movie arrivals.',
    id: 'now-playing',
    pathname: '/movie/now_playing',
    title: 'Now Playing',
    type: 'movie',
  },
  {
    description: 'Shows with active weekly release cycles and current audience attention.',
    id: 'on-the-air',
    pathname: '/tv/on_the_air',
    title: 'Currently Airing',
    type: 'tv',
  },
  {
    description: 'High-octane action movies from around the world.',
    id: 'action-movies',
    pathname: '/discover/movie?with_genres=28&sort_by=popularity.desc',
    title: 'Action & Adventure',
    type: 'movie',
  },
  {
    description: 'Sci-fi and fantasy films pushing the limits of imagination.',
    id: 'scifi-movies',
    pathname: '/discover/movie?with_genres=878&sort_by=popularity.desc',
    title: 'Sci-Fi & Fantasy',
    type: 'movie',
  },
  {
    description: 'Horror films that keep you on the edge of your seat.',
    id: 'horror-movies',
    pathname: '/discover/movie?with_genres=27&sort_by=popularity.desc',
    title: 'Horror',
    type: 'movie',
  },
  {
    description: 'The funniest movies to lighten your mood.',
    id: 'comedy-movies',
    pathname: '/discover/movie?with_genres=35&sort_by=popularity.desc',
    title: 'Comedy',
    type: 'movie',
  },
  {
    description: 'Gripping crime and thriller films.',
    id: 'crime-movies',
    pathname: '/discover/movie?with_genres=80&sort_by=popularity.desc',
    title: 'Crime & Thriller',
    type: 'movie',
  },
  {
    description: 'The most popular K-Dramas and Korean series.',
    id: 'korean-tv',
    pathname: '/discover/tv?with_original_language=ko&sort_by=popularity.desc',
    title: 'K-Drama',
    type: 'tv',
  },
  {
    description: 'Top anime series from Japan.',
    id: 'anime',
    pathname: '/discover/tv?with_original_language=ja&with_genres=16&sort_by=popularity.desc',
    title: 'Anime',
    type: 'tv',
  },
  {
    description: 'Award-winning and acclaimed Spanish-language cinema.',
    id: 'spanish-movies',
    pathname: '/discover/movie?with_original_language=es&sort_by=popularity.desc',
    title: 'Spanish Cinema',
    type: 'movie',
  },
];

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

export function isTmdbReadAccessConfigured(): boolean {
  return Boolean(readTmdbCredentials());
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

  const searchParams = new URLSearchParams({ path, size });
  return `${TMDB_IMAGE_PROXY_PATH}?${searchParams.toString()}`;
}

function createUpstreamFailure(message: string, reason: TmdbLookupFailureReason, status: number): TmdbLookupFailure {
  return {
    message,
    ok: false,
    reason,
    status,
  };
}

function isTmdbFailure(value: unknown): value is TmdbLookupFailure {
  if (!value || typeof value !== 'object' || !('ok' in value)) {
    return false;
  }

  return (value as { ok?: boolean }).ok === false;
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

function buildMetadataTargets(): MetadataRequestTarget[] {
  const credentials = readTmdbCredentials();
  const targets: MetadataRequestTarget[] = [];

  if (credentials) {
    targets.push({
      baseUrl: TMDB_API_BASE_URL,
      credentials,
      name: 'tmdb',
    });
  }

  targets.push({
    baseUrl: TMDB_PUBLIC_DB_BASE_URL,
    credentials: null,
    name: 'public-db',
  });

  return targets;
}

function buildMetadataRequestUrl(pathname: string, target: MetadataRequestTarget): URL {
  if (target.name === 'tmdb' && target.credentials) {
    return buildTmdbRequestUrl(pathname, target.credentials);
  }

  return new URL(`${target.baseUrl}${pathname}`);
}

function buildMetadataRequestHeaders(target: MetadataRequestTarget): HeadersInit {
  if (target.name === 'tmdb' && target.credentials) {
    return buildTmdbRequestHeaders(target.credentials);
  }

  return {
    Accept: 'application/json',
  };
}

async function requestTmdb(pathname: string): Promise<Response | TmdbLookupFailure> {
  let failure: TmdbLookupFailure | null = null;

  for (const target of buildMetadataTargets()) {
    const requestUrl = buildMetadataRequestUrl(pathname, target);

    try {
      const response = await fetch(requestUrl, {
        headers: buildMetadataRequestHeaders(target),
        next: {
          revalidate: 86400,
        },
      });

      if (response.ok || response.status === 404) {
        return response;
      }

      failure = createUpstreamFailure(
        `Metadata lookup failed with status ${response.status}.`,
        'upstream-error',
        502,
      );
    } catch {
      failure = createUpstreamFailure('Unable to reach the metadata service right now. Try again later.', 'upstream-error', 502);
    }
  }

  if (failure) {
    return failure;
  }

  return createUpstreamFailure(
    'Metadata is not configured. Set TMDB_API_TOKEN or TMDB_API_KEY, or allow access to the public metadata mirror.',
    'missing-config',
    503,
  );
}

async function requestOfficialTmdb<T>(
  pathname: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<T | TmdbLookupFailure> {
  const credentials = readTmdbCredentials();
  if (!credentials) {
    return createUpstreamFailure(
      'TMDB browse APIs are not configured. Add TMDB_API_TOKEN or TMDB_API_KEY to .env.local.',
      'missing-config',
      503,
    );
  }

  const requestUrl = buildTmdbRequestUrl(pathname, credentials);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    requestUrl.searchParams.set(key, String(value));
  });

  try {
    const response = await fetch(requestUrl, {
      headers: buildTmdbRequestHeaders(credentials),
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return createUpstreamFailure(
        `TMDB request failed with status ${response.status}.`,
        response.status === 404 ? 'not-found' : 'upstream-error',
        response.status === 404 ? 404 : 502,
      );
    }

    return (await response.json()) as T;
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

function normalizeRating(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Number(value.toFixed(1));
}

function createLibraryEntryFromBrowseResult(
  result: TmdbBrowseResult,
  explicitType?: MediaType,
): LibraryMediaEntry | null {
  const type = explicitType ?? (result.media_type === 'movie' || result.media_type === 'tv' ? result.media_type : null);
  if (!type) {
    return null;
  }

  const title = type === 'movie' ? result.title : result.name;
  if (!title?.trim()) {
    return null;
  }

  return {
    backdropUrl: buildTmdbImageUrl(result.backdrop_path),
    id: String(result.id),
    posterUrl: buildTmdbImageUrl(result.poster_path, 'w300'),
    provider: 'tmdb',
    rating: normalizeRating(result.vote_average),
    synopsis: result.overview?.trim() || '',
    title: title.trim(),
    type,
    voteCount: typeof result.vote_count === 'number' ? result.vote_count : undefined,
    year: getReleaseYear(type === 'movie' ? result.release_date : result.first_air_date),
  };
}

function createMovieEntry(response: TmdbMovieResponse, tmdbId: string): MovieMediaEntry {
  return {
    aliases: [],
    backdropUrl: buildTmdbImageUrl(response.backdrop_path),
    id: tmdbId,
    posterUrl: buildTmdbImageUrl(response.poster_path, 'w300'),
    provider: 'tmdb',
    rating: normalizeRating(response.vote_average),
    slug: tmdbId,
    synopsis: response.overview?.trim() || '',
    title: response.title,
    type: 'movie',
    voteCount: typeof response.vote_count === 'number' ? response.vote_count : undefined,
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
    backdropUrl: buildTmdbImageUrl(response.backdrop_path),
    episodesBySeason,
    id: tmdbId,
    maxEpisodes: seasonEpisodeCounts.length > 0 ? Math.max(...seasonEpisodeCounts) : fallbackEpisodeCount,
    maxSeasons: seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : fallbackSeasonCount,
    posterUrl: buildTmdbImageUrl(response.poster_path, 'w300'),
    provider: 'tmdb',
    rating: normalizeRating(response.vote_average),
    slug: tmdbId,
    synopsis: response.overview?.trim() || '',
    title: response.name,
    totalEpisodes: fallbackEpisodeCount,
    type: 'tv',
    voteCount: typeof response.vote_count === 'number' ? response.vote_count : undefined,
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

function takeDistinctEntries(entries: Array<LibraryMediaEntry | null>, limit = 18): LibraryMediaEntry[] {
  const uniqueEntries = new Map<string, LibraryMediaEntry>();

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    uniqueEntries.set(`${entry.provider}:${entry.type}:${entry.id}`, entry);
  });

  return Array.from(uniqueEntries.values()).slice(0, limit);
}

function mapPageResultsToEntries(
  results: TmdbBrowseResult[] | undefined,
  explicitType?: MediaType,
  limit = 18,
): LibraryMediaEntry[] {
  return takeDistinctEntries(
    (results ?? []).map((result) => createLibraryEntryFromBrowseResult(result, explicitType)),
    limit,
  );
}

function filterBrowseResultsForSection(
  results: TmdbBrowseResult[] | undefined,
  section: TmdbBrowseSectionDefinition,
): TmdbBrowseResult[] | undefined {
  if (!section.adultOnly || !results) {
    return results;
  }

  const hasAdultFlag = results.some((result) => typeof result.adult === 'boolean');
  return hasAdultFlag ? results.filter((result) => result.adult === true) : results;
}

function mapCastMembers(cast: TmdbCastResult[] | undefined, limit = 10): MediaCastMember[] {
  return (cast ?? [])
    .filter((member) => Boolean(member.name?.trim()))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
    .map((member) => ({
      character: member.character?.trim() || undefined,
      id: member.id,
      name: member.name?.trim() as string,
      profileUrl: buildTmdbImageUrl(member.profile_path, 'w300'),
    }));
}

async function lookupExactTmdbSearchEntries(query: string, type?: MediaType): Promise<LibraryMediaEntry[]> {
  if (!/^\d+$/.test(query)) {
    return [];
  }

  if (type) {
    const lookup = await lookupTmdbMediaEntry(query, type);
    return lookup.ok ? [toLibraryMediaEntry(lookup.entry)] : [];
  }

  const [movieLookup, tvLookup] = await Promise.all([
    lookupTmdbMediaEntry(query, 'movie'),
    lookupTmdbMediaEntry(query, 'tv'),
  ]);

  return takeDistinctEntries([
    movieLookup.ok ? toLibraryMediaEntry(movieLookup.entry) : null,
    tvLookup.ok ? toLibraryMediaEntry(tvLookup.entry) : null,
  ]);
}

async function fetchBrowseSection(
  section: TmdbBrowseSectionDefinition,
): Promise<LibrarySection | null> {
  const payload = await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>(section.pathname, {
    include_adult: section.includeAdult ?? false,
    language: DEFAULT_TMDB_LANGUAGE,
    page: 1,
  });

  if (isTmdbFailure(payload)) {
    return null;
  }

  const entries = mapPageResultsToEntries(filterBrowseResultsForSection(payload.results, section), section.type, 18);
  if (entries.length === 0) {
    return null;
  }

  return {
    description: section.description,
    entries,
    id: section.id,
    title: section.title,
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

async function fetchTmdbCastMembers(tmdbId: string, type: MediaType): Promise<MediaCastMember[]> {
  const payload = await requestOfficialTmdb<TmdbCreditsResponse>(`/${type}/${encodeURIComponent(tmdbId)}/credits`, {
    language: DEFAULT_TMDB_LANGUAGE,
  });

  return isTmdbFailure(payload) ? [] : mapCastMembers(payload.cast);
}

async function fetchTmdbRelatedEntries(tmdbId: string, type: MediaType): Promise<LibraryMediaEntry[]> {
  const requestOptions = {
    include_adult: false,
    language: DEFAULT_TMDB_LANGUAGE,
    page: 1,
  };

  const recommendations = await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>(
    `/${type}/${encodeURIComponent(tmdbId)}/recommendations`,
    requestOptions,
  );

  if (!isTmdbFailure(recommendations)) {
    const entries = mapPageResultsToEntries(recommendations.results, type, 18);
    if (entries.length > 0) {
      return entries;
    }
  }

  const similar = await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>(
    `/${type}/${encodeURIComponent(tmdbId)}/similar`,
    requestOptions,
  );

  return isTmdbFailure(similar) ? [] : mapPageResultsToEntries(similar.results, type, 18);
}

interface TmdbVideoResult {
  id: string;
  key: string;
  name: string;
  official: boolean;
  published_at: string;
  site: string;
  type: string;
}

interface TmdbVideosResponse {
  results: TmdbVideoResult[];
}

const YOUTUBE_EMBED_BASE_URL = process.env.YOUTUBE_EMBED_BASE_URL?.trim() || 'https://www.youtube.com/embed';
const YOUTUBE_THUMBNAIL_BASE_URL = process.env.YOUTUBE_THUMBNAIL_BASE_URL?.trim() || 'https://img.youtube.com/vi';
const YOUTUBE_WATCH_BASE_URL = process.env.YOUTUBE_WATCH_BASE_URL?.trim() || 'https://www.youtube.com/watch';

const VIDEO_TYPE_ORDER = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes', 'Bloopers'];

async function fetchTmdbTrailers(tmdbId: string, type: MediaType): Promise<MediaTrailer[]> {
  const payload = await requestOfficialTmdb<TmdbVideosResponse>(
    `/${type}/${encodeURIComponent(tmdbId)}/videos`,
    { language: DEFAULT_TMDB_LANGUAGE },
  );

  const results = isTmdbFailure(payload) ? [] : payload.results;

  return results
    .filter((v) => v.site === 'YouTube' && v.key)
    .sort((a, b) => {
      const aOrder = VIDEO_TYPE_ORDER.indexOf(a.type);
      const bOrder = VIDEO_TYPE_ORDER.indexOf(b.type);
      const typeScore = (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
      if (typeScore !== 0) return typeScore;
      return (b.official ? 1 : 0) - (a.official ? 1 : 0);
    })
    .map((v) => ({
      embedUrl: `${YOUTUBE_EMBED_BASE_URL}/${v.key}?autoplay=1`,
      thumbnailUrl: `${YOUTUBE_THUMBNAIL_BASE_URL}/${v.key}/hqdefault.jpg`,
      title: v.name,
      url: `${YOUTUBE_WATCH_BASE_URL}?v=${v.key}`,
      youtubeId: v.key,
    }));
}

export async function lookupTmdbMediaDetails(tmdbId: string, type: MediaType): Promise<TmdbMediaDetailsResult> {
  const entryLookup = await lookupTmdbMediaEntry(tmdbId, type);
  if (!entryLookup.ok) {
    return entryLookup;
  }

  const [cast, recommendations, trailers] = await Promise.all([
    fetchTmdbCastMembers(tmdbId, type),
    fetchTmdbRelatedEntries(tmdbId, type),
    fetchTmdbTrailers(tmdbId, type),
  ]);

  return {
    data: {
      cast,
      entry: entryLookup.entry,
      recommendations,
      trailers,
    },
    ok: true,
  };
}

export async function searchTmdbLibrary(query: string, type?: MediaType): Promise<TmdbSearchResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      entries: [],
      ok: true,
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }

  const exactEntries = await lookupExactTmdbSearchEntries(trimmedQuery, type);
  if (exactEntries.length > 0) {
    return {
      entries: exactEntries,
      ok: true,
      page: 1,
      totalPages: 1,
      totalResults: exactEntries.length,
    };
  }

  const payload =
    type === 'movie'
      ? await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>('/search/movie', {
          include_adult: false,
          language: DEFAULT_TMDB_LANGUAGE,
          page: 1,
          query: trimmedQuery,
        })
      : type === 'tv'
        ? await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>('/search/tv', {
            include_adult: false,
            language: DEFAULT_TMDB_LANGUAGE,
            page: 1,
            query: trimmedQuery,
          })
        : await requestOfficialTmdb<TmdbPagedResponse<TmdbBrowseResult>>('/search/multi', {
            include_adult: false,
            language: DEFAULT_TMDB_LANGUAGE,
            page: 1,
            query: trimmedQuery,
          });

  if (isTmdbFailure(payload)) {
    return payload;
  }

  const entries = mapPageResultsToEntries(payload.results, type, 24);
  return {
    entries,
    ok: true,
    page: payload.page ?? 1,
    totalPages: payload.total_pages ?? 1,
    totalResults: payload.total_results ?? entries.length,
  };
}

export async function getTmdbLibrarySections(): Promise<TmdbLibrarySectionsResult> {
  const credentials = readTmdbCredentials();
  if (!credentials) {
    return createUpstreamFailure(
      'TMDB browse APIs are not configured. Add TMDB_API_TOKEN or TMDB_API_KEY to .env.local.',
      'missing-config',
      503,
    );
  }

  const sections = (await Promise.all(TMDB_BROWSE_SECTIONS.map((section) => fetchBrowseSection(section)))).filter(
    (section): section is LibrarySection => Boolean(section),
  );

  return {
    featured: sections[0]?.entries[0] ?? null,
    ok: true,
    sections,
  };
}
