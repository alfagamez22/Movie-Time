import 'server-only';

import { fetchJikanAnimeMetadata } from '@/lib/anime/jikan';
import { appConfig } from '@/lib/config';
import {
  toLibraryMediaEntry,
  type AnimeFormat,
  type LibraryMediaEntry,
  type LibrarySection,
  type MediaDetailsPayload,
  type MediaEntry,
  type MediaType,
  type MovieMediaEntry,
  type SeasonDetails,
  type TvMediaEntry,
} from '@/lib/media/types';

type AnikotoFailureReason = 'not-found' | 'upstream-error';

interface AnikotoTermsByType {
  genre?: string[] | null;
  producers?: string[] | null;
  studios?: string[] | null;
  type?: string[] | null;
}

interface AnikotoAnime {
  aired?: string | null;
  alternative?: string | null;
  ani_id?: string | number | null;
  background_image?: string | null;
  description?: string | null;
  duration?: string | number | null;
  episodes?: string | number | null;
  id: string | number;
  is_dub?: string | number | null;
  is_sub?: string | number | null;
  mal_id?: string | number | null;
  native?: string | null;
  next_air_ep?: string | number | null;
  poster?: string | null;
  score?: string | number | null;
  season?: string | null;
  slug?: string | null;
  status?: string | null;
  terms_by_type?: AnikotoTermsByType | null;
  title?: string | null;
  titles?: string | null;
  year?: string | number | null;
}

interface AnikotoEpisode {
  embed_url?: {
    dub?: string | null;
    sub?: string | null;
  } | null;
  episode_embed_id?: string | number | null;
  id?: string | number | null;
  jp_title?: string | null;
  number?: string | number | null;
  title?: string | null;
  updated_at?: string | null;
}

interface AnikotoRecentResponse {
  data?: AnikotoAnime[] | null;
  ok?: boolean;
  pagination?: {
    page?: number | null;
    per_page?: number | null;
    total?: number | null;
    total_pages?: number | null;
  } | null;
}

interface AnikotoSeriesResponse {
  data?: {
    anime?: AnikotoAnime | null;
    episodes?: AnikotoEpisode[] | null;
  } | null;
  ok?: boolean;
}

interface AnikotoLookupSuccess {
  entry: MediaEntry;
  ok: true;
  seasonDetails: SeasonDetails | null;
}

interface AnikotoFailure {
  message: string;
  ok: false;
  reason: AnikotoFailureReason;
  status: number;
}

interface AnikotoSearchSuccess {
  entries: LibraryMediaEntry[];
  ok: true;
  page: number;
  totalPages: number;
  totalResults: number;
}

interface AnikotoLibrarySectionsSuccess {
  featured: LibraryMediaEntry | null;
  ok: true;
  sections: LibrarySection[];
}

type AnikotoLookupResult = AnikotoLookupSuccess | AnikotoFailure;
type AnikotoSearchResult = AnikotoSearchSuccess | AnikotoFailure;
type AnikotoLibrarySectionsResult = AnikotoLibrarySectionsSuccess | AnikotoFailure;
type AnikotoMediaDetailsResult =
  | {
      data: MediaDetailsPayload;
      ok: true;
    }
  | AnikotoFailure;

const BROWSE_PAGE_SIZE = 60;
const DEFAULT_SECTION_SIZE = 18;
const SEARCH_PAGE_LIMIT = 6;
const CACHE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

function createAnikotoFailure(message: string, reason: AnikotoFailureReason, status: number): AnikotoFailure {
  return {
    message,
    ok: false,
    reason,
    status,
  };
}

function isAnikotoFailure(value: unknown): value is AnikotoFailure {
  return Boolean(value) && typeof value === 'object' && 'ok' in (value as object) && (value as { ok?: boolean }).ok === false;
}

function createAnikotoUrl(path: string, searchParams?: Record<string, string | number | undefined>) {
  const url = new URL(path.replace(/^\//, ''), `${appConfig.anikotoApiBaseUrl}/`);

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function requestAnikoto<T>(path: string, searchParams?: Record<string, string | number | undefined>): Promise<T | AnikotoFailure> {
  const url = createAnikotoUrl(path, searchParams);
  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      next: {
        revalidate: 300,
      },
    });
  } catch {
    return createAnikotoFailure('Unable to reach Anikoto right now. Try again later.', 'upstream-error', 502);
  }

  if (response.status === 404) {
    return createAnikotoFailure('Anime entry not found in Anikoto.', 'not-found', 404);
  }

  if (!response.ok) {
    return createAnikotoFailure(`Anikoto request failed with status ${response.status}.`, 'upstream-error', 502);
  }

  let payload: T;

  try {
    payload = (await response.json()) as T;
  } catch {
    return createAnikotoFailure('Anikoto returned an unreadable response.', 'upstream-error', 502);
  }

  responseCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: payload,
  });

  return payload;
}

function cleanText(value: string | number | null | undefined): string {
  return value == null ? '' : String(value).replace(/\r\n/g, '\n').trim();
}

function cleanSynopsis(value: string | number | null | undefined): string {
  return cleanText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseNumber(value: string | number | null | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value: string | number | null | undefined): number | undefined {
  const parsed = parseNumber(value);
  if (typeof parsed !== 'number' || parsed < 1) {
    return undefined;
  }

  return Math.floor(parsed);
}

function normalizeRating(value: string | number | null | undefined): number | undefined {
  const parsed = parseNumber(value);
  if (typeof parsed !== 'number' || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed * 10) / 10;
}

function getAnimeTitle(anime: AnikotoAnime): string {
  return cleanText(anime.title) || cleanText(anime.alternative) || cleanText(anime.native) || `Anime ${cleanText(anime.id)}`;
}

function getAnimeTypeLabels(anime: AnikotoAnime): string[] {
  return (anime.terms_by_type?.type ?? []).map((value) => cleanText(value).toLowerCase()).filter(Boolean);
}

function getAnimeType(anime: AnikotoAnime): MediaType {
  return getAnimeTypeLabels(anime).some((value) => value.includes('movie') || value.includes('film')) ? 'movie' : 'tv';
}

function getAnimeFormat(anime: AnikotoAnime): AnimeFormat | undefined {
  const labels = getAnimeTypeLabels(anime);
  const joinedLabels = labels.join(' ');

  if (joinedLabels.includes('movie') || joinedLabels.includes('film')) return 'MOVIE';
  if (joinedLabels.includes('short')) return 'TV_SHORT';
  if (joinedLabels.includes('special')) return 'SPECIAL';
  if (joinedLabels.includes('ova')) return 'OVA';
  if (joinedLabels.includes('ona')) return 'ONA';
  if (joinedLabels.includes('music')) return 'MUSIC';
  if (joinedLabels.includes('tv')) return 'TV';

  return getAnimeType(anime) === 'movie' ? 'MOVIE' : 'TV';
}

function getAvailableEpisodeCount(anime: AnikotoAnime, episodes?: AnikotoEpisode[] | null): number {
  const type = getAnimeType(anime);
  if (type === 'movie') {
    return 1;
  }

  const releasedEpisodeNumbers = (episodes ?? [])
    .map((episode) => parsePositiveInteger(episode.number))
    .filter((episodeNumber): episodeNumber is number => typeof episodeNumber === 'number');

  return Math.max(
    parsePositiveInteger(anime.is_sub) ?? 0,
    parsePositiveInteger(anime.is_dub) ?? 0,
    parsePositiveInteger(anime.episodes) ?? 0,
    parsePositiveInteger(anime.next_air_ep) ? Math.max((parsePositiveInteger(anime.next_air_ep) ?? 1) - 1, 1) : 0,
    ...releasedEpisodeNumbers,
    1,
  );
}

function splitTitles(value: string | null | undefined): string[] {
  return cleanText(value)
    .split(/[;,]/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function getAliases(anime: AnikotoAnime): string[] {
  const candidates = [
    anime.title,
    anime.alternative,
    anime.native,
    anime.slug,
    ...splitTitles(anime.titles),
  ];

  return Array.from(
    new Set(
      candidates
        .map((candidate) => cleanText(candidate))
        .filter(Boolean),
    ),
  );
}

function getEpisodeEmbedId(episode: AnikotoEpisode): string | undefined {
  const directId = cleanText(episode.episode_embed_id);
  if (directId) {
    return directId;
  }

  const url = cleanText(episode.embed_url?.sub) || cleanText(episode.embed_url?.dub);
  const match = url.match(/\/stream\/s-2\/([^/]+)\//);
  return match?.[1];
}

function getEpisodeEmbedIds(episodes?: AnikotoEpisode[] | null): Record<string, string> | undefined {
  const ids: Record<string, string> = {};

  (episodes ?? []).forEach((episode) => {
    const episodeNumber = parsePositiveInteger(episode.number);
    const embedId = getEpisodeEmbedId(episode);

    if (episodeNumber && embedId) {
      ids[String(episodeNumber)] = embedId;
    }
  });

  return Object.keys(ids).length > 0 ? ids : undefined;
}

function getDefaultLanguage(anime: AnikotoAnime): 'sub' | 'dub' {
  const subCount = parsePositiveInteger(anime.is_sub) ?? 0;
  const dubCount = parsePositiveInteger(anime.is_dub) ?? 0;

  return subCount > 0 || dubCount === 0 ? 'sub' : 'dub';
}

function createAnimeMovieEntry(anime: AnikotoAnime, episodes?: AnikotoEpisode[] | null): MovieMediaEntry {
  return {
    aliases: getAliases(anime),
    animeFormat: getAnimeFormat(anime),
    anilistId: cleanText(anime.ani_id) || undefined,
    backdropUrl: cleanText(anime.background_image) || undefined,
    defaultLanguage: getDefaultLanguage(anime),
    episodeCount: 1,
    episodeEmbedIds: getEpisodeEmbedIds(episodes),
    id: cleanText(anime.id),
    malId: cleanText(anime.mal_id) || undefined,
    posterUrl: cleanText(anime.poster) || undefined,
    provider: 'anikoto',
    rating: normalizeRating(anime.score),
    slug: cleanText(anime.slug) || cleanText(anime.id),
    synopsis: cleanSynopsis(anime.description),
    title: getAnimeTitle(anime),
    type: 'movie',
    year: parsePositiveInteger(anime.year),
  };
}

function createAnimeTvEntry(anime: AnikotoAnime, episodes?: AnikotoEpisode[] | null): TvMediaEntry {
  const episodeCount = getAvailableEpisodeCount(anime, episodes);

  return {
    aliases: getAliases(anime),
    animeFormat: getAnimeFormat(anime),
    anilistId: cleanText(anime.ani_id) || undefined,
    backdropUrl: cleanText(anime.background_image) || undefined,
    defaultLanguage: getDefaultLanguage(anime),
    episodeCount,
    episodeEmbedIds: getEpisodeEmbedIds(episodes),
    episodesBySeason: {
      '1': episodeCount,
    },
    id: cleanText(anime.id),
    malId: cleanText(anime.mal_id) || undefined,
    maxEpisodes: episodeCount,
    maxSeasons: 1,
    posterUrl: cleanText(anime.poster) || undefined,
    provider: 'anikoto',
    rating: normalizeRating(anime.score),
    slug: cleanText(anime.slug) || cleanText(anime.id),
    synopsis: cleanSynopsis(anime.description),
    title: getAnimeTitle(anime),
    totalEpisodes: episodeCount,
    type: 'tv',
    year: parsePositiveInteger(anime.year),
  };
}

function createAnimeEntry(anime: AnikotoAnime, episodes?: AnikotoEpisode[] | null): MediaEntry {
  return getAnimeType(anime) === 'movie'
    ? createAnimeMovieEntry(anime, episodes)
    : createAnimeTvEntry(anime, episodes);
}

function getEpisodeFallbackTitle(episodeNumber: number): string {
  return `Episode ${String(episodeNumber).padStart(2, '0')}`;
}

function createAnikotoSeasonDetails(anime: AnikotoAnime, episodes?: AnikotoEpisode[] | null): SeasonDetails | null {
  if (getAnimeType(anime) !== 'tv') {
    return null;
  }

  const episodeCount = getAvailableEpisodeCount(anime, episodes);
  const fallbackStillUrl = cleanText(anime.background_image) || cleanText(anime.poster) || undefined;
  const episodeRecords = new Map<number, AnikotoEpisode>();

  (episodes ?? []).forEach((episode) => {
    const episodeNumber = parsePositiveInteger(episode.number);
    if (!episodeNumber) {
      return;
    }

    episodeRecords.set(episodeNumber, episode);
  });

  return {
    episodeCount,
    episodes: Array.from({ length: episodeCount }, (_, index) => {
      const episodeNumber = index + 1;
      const episode = episodeRecords.get(episodeNumber);
      const primaryTitle = cleanText(episode?.title);
      const secondaryTitle = cleanText(episode?.jp_title);

      return {
        airDate: undefined,
        episodeNumber,
        name: primaryTitle || secondaryTitle || getEpisodeFallbackTitle(episodeNumber),
        overview:
          primaryTitle && secondaryTitle && primaryTitle !== secondaryTitle
            ? secondaryTitle
            : '',
        runtime: undefined,
        seasonNumber: 1,
        stillUrl: fallbackStillUrl,
      };
    }),
    name: 'Episodes',
    overview: cleanSynopsis(anime.description),
    posterUrl: cleanText(anime.poster) || fallbackStillUrl,
    seasonNumber: 1,
  };
}

function dedupeEntries(entries: Array<LibraryMediaEntry | null | undefined>, limit = DEFAULT_SECTION_SIZE): LibraryMediaEntry[] {
  const uniqueEntries = new Map<string, LibraryMediaEntry>();

  entries.forEach((entry) => {
    if (!entry) return;
    uniqueEntries.set(`${entry.provider}:${entry.type}:${entry.id}`, entry);
  });

  return Array.from(uniqueEntries.values()).slice(0, limit);
}

function animeMatchesQuery(anime: AnikotoAnime, normalizedQuery: string): boolean {
  if (cleanText(anime.id) === normalizedQuery) {
    return true;
  }

  return getAliases(anime).some((alias) => alias.toLowerCase().includes(normalizedQuery));
}

function createSection(id: string, title: string, description: string, entries: LibraryMediaEntry[]): LibrarySection | null {
  const sectionEntries = dedupeEntries(entries);
  if (sectionEntries.length === 0) {
    return null;
  }

  return {
    description,
    entries: sectionEntries,
    id,
    title,
  };
}

async function fetchRecentAnimePage(page: number, perPage = BROWSE_PAGE_SIZE): Promise<AnikotoRecentResponse | AnikotoFailure> {
  const payload = await requestAnikoto<AnikotoRecentResponse>('/recent-anime', {
    page,
    per_page: perPage,
  });

  if (isAnikotoFailure(payload)) {
    return payload;
  }

  if (!payload.ok || !Array.isArray(payload.data)) {
    return createAnikotoFailure('Anikoto did not return browse data.', 'upstream-error', 502);
  }

  return payload;
}

async function fetchRecentAnimePages(pageCount: number, perPage = BROWSE_PAGE_SIZE): Promise<AnikotoAnime[] | AnikotoFailure> {
  const pages = await Promise.all(Array.from({ length: pageCount }, (_, index) => fetchRecentAnimePage(index + 1, perPage)));
  const entries: AnikotoAnime[] = [];

  for (const page of pages) {
    if (isAnikotoFailure(page)) {
      continue;
    }

    entries.push(...(page.data ?? []));
  }

  if (entries.length === 0) {
    return createAnikotoFailure('Anime browse sections are unavailable right now. Try again later.', 'upstream-error', 502);
  }

  return entries;
}

function buildLibrarySections(animeEntries: AnikotoAnime[]): LibrarySection[] {
  const entries = animeEntries.map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const currentYear = new Date().getFullYear();
  const latest = entries;
  const currentlyAiring = animeEntries
    .filter((anime) => cleanText(anime.status).toLowerCase().includes('airing'))
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const dubbed = animeEntries
    .filter((anime) => (parsePositiveInteger(anime.is_dub) ?? 0) > 0)
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const subbed = animeEntries
    .filter((anime) => (parsePositiveInteger(anime.is_sub) ?? 0) > 0)
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const topRated = [...animeEntries]
    .sort((left, right) => (normalizeRating(right.score) ?? 0) - (normalizeRating(left.score) ?? 0))
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const currentSeason = animeEntries
    .filter((anime) => parsePositiveInteger(anime.year) === currentYear)
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));
  const movies = animeEntries
    .filter((anime) => getAnimeType(anime) === 'movie')
    .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)));

  return [
    createSection('latest-updates', 'Latest Updates', 'Fresh anime updates from the Anikoto catalog.', latest),
    createSection('currently-airing', 'Currently Airing', 'Series that are actively releasing new episodes.', currentlyAiring),
    createSection('dubbed-episodes', 'Dubbed Episodes', 'Anime with dubbed episodes available through MegaPlay.', dubbed),
    createSection('subbed-episodes', 'Subbed Episodes', 'Anime with subbed episodes available through MegaPlay.', subbed),
    createSection('top-rated-anime', 'Top Rated Anime', 'Higher-scored anime currently present in the Anikoto feed.', topRated),
    createSection('seasonal-anime', `${currentYear} Anime`, 'Recent seasonal anime from the live Anikoto feed.', currentSeason),
    createSection('anime-movies', 'Anime Movies', 'Movie-format anime entries found in the current catalog feed.', movies),
  ].filter((section): section is LibrarySection => Boolean(section));
}

function mapRecommendations(entry: MediaEntry, recentEntries: AnikotoAnime[]): LibraryMediaEntry[] {
  const entryGenreAliases = new Set(entry.aliases.map((alias) => alias.toLowerCase()));

  return dedupeEntries(
    recentEntries
      .filter((anime) => cleanText(anime.id) !== entry.id)
      .filter((anime) => {
        const genres = anime.terms_by_type?.genre ?? [];
        return genres.some((genre) => entryGenreAliases.has(cleanText(genre).toLowerCase())) || getAnimeType(anime) === entry.type;
      })
      .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime))),
  );
}

export async function lookupAnikotoMediaEntry(id: string): Promise<AnikotoLookupResult> {
  const parsedId = Number.parseInt(id, 10);
  if (Number.isNaN(parsedId) || parsedId < 1) {
    return createAnikotoFailure('Anikoto ID must be a positive integer.', 'not-found', 404);
  }

  const payload = await requestAnikoto<AnikotoSeriesResponse>(`/series/${parsedId}`);
  if (isAnikotoFailure(payload)) {
    return payload;
  }

  if (!payload.ok || !payload.data?.anime) {
    return createAnikotoFailure(`Anikoto anime ${id} was not found.`, 'not-found', 404);
  }

  return {
    entry: createAnimeEntry(payload.data.anime, payload.data.episodes),
    ok: true,
    seasonDetails: createAnikotoSeasonDetails(payload.data.anime, payload.data.episodes),
  };
}

export async function searchAnikotoLibrary(query: string, type?: MediaType): Promise<AnikotoSearchResult> {
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

  if (/^\d+$/.test(trimmedQuery)) {
    const lookup = await lookupAnikotoMediaEntry(trimmedQuery);
    if (lookup.ok && (!type || lookup.entry.type === type)) {
      return {
        entries: [toLibraryMediaEntry(lookup.entry)],
        ok: true,
        page: 1,
        totalPages: 1,
        totalResults: 1,
      };
    }
  }

  const recentEntries = await fetchRecentAnimePages(SEARCH_PAGE_LIMIT, BROWSE_PAGE_SIZE);
  if (isAnikotoFailure(recentEntries)) {
    return recentEntries;
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const entries = dedupeEntries(
    recentEntries
      .filter((anime) => animeMatchesQuery(anime, normalizedQuery))
      .map((anime) => toLibraryMediaEntry(createAnimeEntry(anime)))
      .filter((entry) => !type || entry.type === type),
    24,
  );

  return {
    entries,
    ok: true,
    page: 1,
    totalPages: 1,
    totalResults: entries.length,
  };
}

export async function getAnikotoLibrarySections(): Promise<AnikotoLibrarySectionsResult> {
  const recentEntries = await fetchRecentAnimePages(2, BROWSE_PAGE_SIZE);
  if (isAnikotoFailure(recentEntries)) {
    return recentEntries;
  }

  const sections = buildLibrarySections(recentEntries);
  if (sections.length === 0) {
    return createAnikotoFailure('Anime browse sections are unavailable right now. Try again later.', 'upstream-error', 502);
  }

  return {
    featured: sections[0]?.entries[0] ?? null,
    ok: true,
    sections,
  };
}

export async function lookupAnikotoMediaDetails(id: string): Promise<AnikotoMediaDetailsResult> {
  const lookup = await lookupAnikotoMediaEntry(id);
  if (!lookup.ok) {
    return lookup;
  }

  const [recentEntries, jikanMetadata] = await Promise.all([
    fetchRecentAnimePages(2, BROWSE_PAGE_SIZE),
    lookup.entry.malId
      ? fetchJikanAnimeMetadata(lookup.entry.malId)
      : Promise.resolve({
          cast: [],
          trailers: [],
        }),
  ]);
  const recommendations = isAnikotoFailure(recentEntries) ? [] : mapRecommendations(lookup.entry, recentEntries);

  return {
    data: {
      cast: jikanMetadata.cast,
      entry: lookup.entry,
      recommendations,
      trailers: jikanMetadata.trailers,
    },
    ok: true,
  };
}
