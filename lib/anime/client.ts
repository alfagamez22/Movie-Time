import 'server-only';

import {
  fetchAniZipMappings,
  getAniZipEpisodeTitle,
  listAniZipEpisodes,
  type AniZipEpisode,
  type AniZipMappingsResponse,
} from '@/lib/anime/ani-zip';
import {
  fetchAnilistBrowseBuckets,
  fetchAnilistMediaById,
  searchAnilistAnime,
  type AnilistMedia,
  type AnilistMediaDetails,
} from '@/lib/anime/anilist';
import {
  toLibraryMediaEntry,
  type AnimeFormat,
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
import { normalizeSlug } from '@/lib/slugs/media';

type AnimeLookupFailureReason = 'not-found' | 'upstream-error';

interface AnimeLookupSuccess {
  entry: MediaEntry;
  ok: true;
  seasonDetails: SeasonDetails | null;
}

interface AnimeLookupFailure {
  message: string;
  ok: false;
  reason: AnimeLookupFailureReason;
  status: number;
}

interface AnimeSearchSuccess {
  entries: LibraryMediaEntry[];
  ok: true;
  page: number;
  totalPages: number;
  totalResults: number;
}

interface AnimeLibrarySectionsSuccess {
  featured: LibraryMediaEntry | null;
  ok: true;
  sections: LibrarySection[];
}

type AnimeLookupResult = AnimeLookupSuccess | AnimeLookupFailure;
type AnimeSearchResult = AnimeSearchSuccess | AnimeLookupFailure;
type AnimeLibrarySectionsResult = AnimeLibrarySectionsSuccess | AnimeLookupFailure;
type AnimeMediaDetailsResult =
  | {
      data: MediaDetailsPayload;
      ok: true;
    }
  | AnimeLookupFailure;

function createLookupFailure(message: string, reason: AnimeLookupFailureReason, status: number): AnimeLookupFailure {
  return {
    message,
    ok: false,
    reason,
    status,
  };
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

function normalizeRating(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value) / 10;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value))
        .filter(Boolean),
    ),
  );
}

function mapAnilistFormatToMediaType(format: AnimeFormat | null | undefined): MediaType {
  return format === 'MOVIE' ? 'movie' : 'tv';
}

function getAnilistTitle(media: AnilistMedia): string {
  return (
    cleanText(media.title.userPreferred) ||
    cleanText(media.title.english) ||
    cleanText(media.title.romaji) ||
    cleanText(media.title.native) ||
    `AniList ${media.id}`
  );
}

function getAliases(media: AnilistMedia): string[] {
  return dedupeStrings([
    media.title.userPreferred,
    media.title.english,
    media.title.romaji,
    media.title.native,
    ...(media.synonyms ?? []),
  ]);
}

function getBackdropUrl(media: AnilistMedia): string | undefined {
  return cleanText(media.bannerImage) || cleanText(media.coverImage?.extraLarge) || cleanText(media.coverImage?.large) || undefined;
}

function getPosterUrl(media: AnilistMedia): string | undefined {
  return cleanText(media.coverImage?.extraLarge) || cleanText(media.coverImage?.large) || getBackdropUrl(media);
}

function getReleaseYear(media: AnilistMedia): number | undefined {
  return media.seasonYear ?? media.startDate?.year ?? undefined;
}

function getStartDateTimestamp(media: AnilistMedia): number | null {
  const year = media.startDate?.year;
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return null;
  }

  const month = media.startDate?.month;
  const day = media.startDate?.day;
  return Date.UTC(year, Math.max(0, (month ?? 1) - 1), day ?? 1);
}

function getAniZipEpisodeAirTimestamp(episode: AniZipEpisode | undefined): number | null {
  const airDate = cleanText(episode?.airDate);
  if (!airDate) {
    return null;
  }

  const parsedAirDate = Date.parse(`${airDate}T00:00:00Z`);
  return Number.isFinite(parsedAirDate) ? parsedAirDate : null;
}

function isAniZipEpisodeReleased(episode: AniZipEpisode): boolean {
  const parsedAirDate = getAniZipEpisodeAirTimestamp(episode);
  if (parsedAirDate === null) {
    return true;
  }

  return parsedAirDate <= Date.now();
}

function isAniZipEpisodeScheduled(episode: AniZipEpisode): boolean {
  const parsedAirDate = getAniZipEpisodeAirTimestamp(episode);
  return parsedAirDate !== null && parsedAirDate > Date.now();
}

function getUpcomingEpisodeBoundary(media: AnilistMedia): number | null {
  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;

  if (
    typeof nextEpisodeNumber !== 'number' ||
    !Number.isFinite(nextEpisodeNumber) ||
    typeof nextEpisodeAt !== 'number' ||
    !Number.isFinite(nextEpisodeAt) ||
    nextEpisodeAt * 1000 <= Date.now()
  ) {
    return null;
  }

  return nextEpisodeNumber;
}

function getReleasedAniZipEpisodeCount(
  mappings?: AniZipMappingsResponse | null,
  upcomingEpisodeBoundary?: number | null,
): number {
  return listAniZipEpisodes(mappings)
    .filter((episode) => {
      if (typeof episode.episodeNumber === 'number' && upcomingEpisodeBoundary && episode.episodeNumber >= upcomingEpisodeBoundary) {
        return false;
      }

      return isAniZipEpisodeReleased(episode);
    })
    .length;
}

function getVisibleAniZipEpisodeCount(mappings?: AniZipMappingsResponse | null): number {
  return listAniZipEpisodes(mappings)
    .filter((episode) => isAniZipEpisodeReleased(episode) || isAniZipEpisodeScheduled(episode))
    .reduce((highestEpisodeNumber, episode) => {
      return typeof episode.episodeNumber === 'number' ? Math.max(highestEpisodeNumber, episode.episodeNumber) : highestEpisodeNumber;
    }, 0);
}

function isReleasedAnime(media: AnilistMedia): boolean {
  if (media.status === 'NOT_YET_RELEASED') {
    return false;
  }

  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;
  if (
    typeof nextEpisodeNumber === 'number' &&
    nextEpisodeNumber <= 1 &&
    typeof nextEpisodeAt === 'number' &&
    nextEpisodeAt * 1000 > Date.now()
  ) {
    return false;
  }

  const startDateTimestamp = getStartDateTimestamp(media);
  if (startDateTimestamp !== null && startDateTimestamp > Date.now()) {
    return false;
  }

  return true;
}

function getReleasedEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  const upcomingEpisodeBoundary = getUpcomingEpisodeBoundary(media);
  const aniZipEpisodeCount = getReleasedAniZipEpisodeCount(mappings, upcomingEpisodeBoundary);

  if (media.status === 'RELEASING') {
    if (typeof upcomingEpisodeBoundary === 'number') {
      return Math.max(upcomingEpisodeBoundary - 1, 0);
    }

    if (aniZipEpisodeCount > 0) {
      return aniZipEpisodeCount;
    }

    return isReleasedAnime(media) ? 1 : 0;
  }

  return Math.max(media.episodes ?? 0, aniZipEpisodeCount, isReleasedAnime(media) ? 1 : 0);
}

function getVisibleEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  return Math.max(
    getReleasedEpisodeCount(media, mappings),
    getVisibleAniZipEpisodeCount(mappings),
    media.nextAiringEpisode?.episode ?? 0,
  );
}

function getNextEpisodeInfo(media: AnilistMedia): Pick<TvMediaEntry, 'nextEpisodeAt' | 'nextEpisodeNumber'> {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) !== 'tv' || !isReleasedAnime(media)) {
    return {};
  }

  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;
  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  if (
    typeof nextEpisodeAt !== 'number' ||
    !Number.isFinite(nextEpisodeAt) ||
    nextEpisodeAt * 1000 <= Date.now() ||
    typeof nextEpisodeNumber !== 'number' ||
    !Number.isFinite(nextEpisodeNumber)
  ) {
    return {};
  }

  return {
    nextEpisodeAt,
    nextEpisodeNumber,
  };
}

function getEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return 1;
  }

  return Math.max(getReleasedEpisodeCount(media, mappings), 1);
}

function getFallbackEpisodeName(episodeNumber: number): string {
  return `Episode ${String(episodeNumber).padStart(2, '0')}`;
}

function mapAniZipEpisode(
  episode: AniZipEpisode | undefined,
  episodeNumber: number,
  isReleased: boolean,
  scheduledAt: number | undefined,
  fallbackStillUrl?: string,
) {
  return {
    airDate: cleanText(episode?.airDate) || undefined,
    episodeNumber,
    fallbackStillUrl,
    isReleased,
    name: getAniZipEpisodeTitle(episode) || getFallbackEpisodeName(episodeNumber),
    overview: cleanSynopsis(episode?.overview),
    runtime: typeof episode?.runtime === 'number' && Number.isFinite(episode.runtime) ? episode.runtime : undefined,
    scheduledAt,
    seasonNumber: 1,
    stillUrl: cleanText(episode?.image) || fallbackStillUrl,
  };
}

function buildSeasonDetails(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): SeasonDetails | null {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) !== 'tv') {
    return null;
  }

  const fallbackStillUrl = getBackdropUrl(media) || getPosterUrl(media);
  const aniZipEpisodes = listAniZipEpisodes(mappings);
  const episodeMap = new Map<number, AniZipEpisode>();

  aniZipEpisodes.forEach((episode) => {
    if (typeof episode.episodeNumber === 'number') {
      episodeMap.set(episode.episodeNumber, episode);
    }
  });

  const releasedEpisodeCount = getReleasedEpisodeCount(media, mappings);
  const episodeCount = Math.max(releasedEpisodeCount, getVisibleEpisodeCount(media, mappings));
  const nextAiringEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextAiringTimestamp =
    typeof media.nextAiringEpisode?.airingAt === 'number' ? media.nextAiringEpisode.airingAt * 1000 : undefined;
  const upcomingEpisodeBoundary = getUpcomingEpisodeBoundary(media);

  return {
    episodeCount,
    episodes: Array.from({ length: episodeCount }, (_, index) => {
      const episodeNumber = index + 1;
      const mappedEpisode = episodeMap.get(episodeNumber);
      const mappedScheduledAt = getAniZipEpisodeAirTimestamp(mappedEpisode);
      const isReleased =
        typeof upcomingEpisodeBoundary === 'number'
          ? episodeNumber < upcomingEpisodeBoundary
          : mappedEpisode != null
            ? isAniZipEpisodeReleased(mappedEpisode)
            : episodeNumber <= releasedEpisodeCount;
      const scheduledAt =
        typeof mappedScheduledAt === 'number'
          ? Math.floor(mappedScheduledAt / 1000)
          : episodeNumber === nextAiringEpisodeNumber && nextAiringTimestamp
            ? Math.floor(nextAiringTimestamp / 1000)
            : undefined;

      return mapAniZipEpisode(mappedEpisode, episodeNumber, isReleased, scheduledAt, fallbackStillUrl);
    }),
    name: 'Episodes',
    overview: cleanSynopsis(media.description),
    posterUrl: getPosterUrl(media),
    releasedEpisodeCount,
    seasonNumber: 1,
  };
}

function createMovieEntry(media: AnilistMedia): MovieMediaEntry {
  return {
    aliases: getAliases(media),
    animeFormat: media.format ?? 'MOVIE',
    anilistId: String(media.id),
    backdropUrl: getBackdropUrl(media),
    defaultLanguage: 'sub',
    episodeCount: 1,
    id: String(media.id),
    malId: media.idMal ? String(media.idMal) : undefined,
    posterUrl: getPosterUrl(media),
    provider: 'anilist',
    rating: normalizeRating(media.averageScore),
    slug: normalizeSlug(getAnilistTitle(media)) || String(media.id),
    synopsis: cleanSynopsis(media.description),
    title: getAnilistTitle(media),
    type: 'movie',
    year: getReleaseYear(media),
  };
}

function createTvEntry(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): TvMediaEntry {
  const episodeCount = getEpisodeCount(media, mappings);
  const nextEpisodeInfo = getNextEpisodeInfo(media);

  return {
    aliases: getAliases(media),
    animeFormat: media.format ?? 'TV',
    anilistId: String(media.id),
    backdropUrl: getBackdropUrl(media),
    defaultLanguage: 'sub',
    episodeCount,
    episodesBySeason: {
      '1': episodeCount,
    },
    id: String(media.id),
    malId: media.idMal ? String(media.idMal) : undefined,
    maxEpisodes: episodeCount,
    maxSeasons: 1,
    posterUrl: getPosterUrl(media),
    provider: 'anilist',
    rating: normalizeRating(media.averageScore),
    slug: normalizeSlug(getAnilistTitle(media)) || String(media.id),
    synopsis: cleanSynopsis(media.description),
    title: getAnilistTitle(media),
    totalEpisodes: episodeCount,
    type: 'tv',
    year: getReleaseYear(media),
    ...nextEpisodeInfo,
  };
}

function createAnimeEntry(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): MediaEntry {
  return mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie'
    ? createMovieEntry(media)
    : createTvEntry(media, mappings);
}

function dedupeEntries(entries: Array<LibraryMediaEntry | null | undefined>, limit = 18): LibraryMediaEntry[] {
  const uniqueEntries = new Map<string, LibraryMediaEntry>();

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    uniqueEntries.set(`${entry.provider}:${entry.type}:${entry.id}`, entry);
  });

  return Array.from(uniqueEntries.values()).slice(0, limit);
}

function createSection(id: string, title: string, description: string, entries: LibraryMediaEntry[]): LibrarySection | null {
  const sectionEntries = dedupeEntries(entries, 18);
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

function mapBrowseEntries(media: AnilistMedia[]): LibraryMediaEntry[] {
  return media
    .filter(isReleasedAnime)
    .map((entry) => toLibraryMediaEntry(createAnimeEntry(entry)));
}

function mapCast(details: AnilistMediaDetails): MediaCastMember[] {
  return (details.characters?.edges ?? [])
    .map<MediaCastMember | null>((edge) => {
      const actor = edge.voiceActors?.[0];
      const characterName = cleanText(edge.node?.name?.full);
      const actorName = cleanText(actor?.name?.full);

      if (!characterName && !actorName) {
        return null;
      }

      return {
        character: characterName || undefined,
        name: actorName || characterName,
        profileUrl: cleanText(actor?.image?.large) || cleanText(edge.node?.image?.large) || undefined,
      };
    })
    .filter((member): member is MediaCastMember => member !== null)
    .slice(0, 15);
}

function mapTrailers(details: AnilistMediaDetails): MediaTrailer[] {
  const trailer = details.trailer;

  if (!trailer?.id || trailer.site?.toLowerCase() !== 'youtube') {
    return [];
  }

  return [
    {
      embedUrl: `https://www.youtube-nocookie.com/embed/${trailer.id}?enablejsapi=1&rel=0`,
      thumbnailUrl: cleanText(trailer.thumbnail) || `https://i.ytimg.com/vi/${trailer.id}/hqdefault.jpg`,
      title: `${getAnilistTitle(details)} Trailer`,
      url: `https://www.youtube.com/watch?v=${trailer.id}`,
      youtubeId: trailer.id,
    },
  ];
}

function mapRecommendations(details: AnilistMediaDetails): LibraryMediaEntry[] {
  const recommendationEntries = (details.recommendations?.nodes ?? [])
    .map((node) => node.mediaRecommendation)
    .filter((entry): entry is AnilistMedia => Boolean(entry));
  const relationEntries = (details.relations?.edges ?? [])
    .map((edge) => edge.node)
    .filter((entry): entry is AnilistMedia => Boolean(entry));

  return dedupeEntries(
    [...recommendationEntries, ...relationEntries]
      .filter(isReleasedAnime)
      .filter((entry) => String(entry.id) !== String(details.id))
      .map((entry) => toLibraryMediaEntry(createAnimeEntry(entry))),
    18,
  );
}

export async function lookupAnimeMediaEntry(id: string): Promise<AnimeLookupResult> {
  const parsedId = Number.parseInt(id, 10);
  if (!Number.isFinite(parsedId) || parsedId < 1) {
    return createLookupFailure('AniList ID must be a positive integer.', 'not-found', 404);
  }

  const [media, mappings] = await Promise.all([
    fetchAnilistMediaById(String(parsedId)).catch(() => null),
    fetchAniZipMappings(String(parsedId)).catch(() => null),
  ]);

  if (!media) {
    return createLookupFailure(`AniList anime ${id} was not found.`, 'not-found', 404);
  }

  if (!isReleasedAnime(media)) {
    return createLookupFailure(`AniList anime ${id} has not released yet.`, 'not-found', 404);
  }

  return {
    entry: createAnimeEntry(media, mappings),
    ok: true,
    seasonDetails: buildSeasonDetails(media, mappings),
  };
}

export async function searchAnimeLibrary(query: string, type?: MediaType): Promise<AnimeSearchResult> {
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
    const lookup = await lookupAnimeMediaEntry(trimmedQuery);
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

  const results = await searchAnilistAnime(trimmedQuery, 24).catch(() => null);
  if (!results) {
    return createLookupFailure('AniList search is unavailable right now. Try again later.', 'upstream-error', 502);
  }

  const entries = dedupeEntries(
    results
      .filter(isReleasedAnime)
      .map((entry) => toLibraryMediaEntry(createAnimeEntry(entry)))
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

export async function getAnimeLibrarySections(): Promise<AnimeLibrarySectionsResult> {
  const browse = await fetchAnilistBrowseBuckets().catch(() => null);
  if (!browse) {
    return createLookupFailure('AniList browse sections are unavailable right now. Try again later.', 'upstream-error', 502);
  }

  const sections = [
    createSection('trending-now', 'Trending Now', 'Anime currently trending across AniList.', mapBrowseEntries(browse.trending.media)),
    createSection(
      'popular-this-season',
      'Popular This Season',
      'The most-followed anime airing this season.',
      mapBrowseEntries(browse.seasonal.media),
    ),
    createSection(
      'currently-airing',
      'Currently Airing',
      'Series that are actively releasing episodes.',
      mapBrowseEntries(browse.airing.media),
    ),
    createSection('top-rated', 'Top Rated', 'Highest-rated anime from AniList.', mapBrowseEntries(browse.topRated.media)),
    createSection('anime-movies', 'Anime Movies', 'Feature-length anime films.', mapBrowseEntries(browse.movies.media)),
    createSection(
      'recently-completed',
      'Recently Completed',
      'Finished anime with the freshest recent attention.',
      mapBrowseEntries(browse.completed.media),
    ),
  ].filter((section): section is LibrarySection => Boolean(section));

  if (sections.length === 0) {
    return createLookupFailure('AniList browse sections are unavailable right now. Try again later.', 'upstream-error', 502);
  }

  return {
    featured: sections[0]?.entries[0] ?? null,
    ok: true,
    sections,
  };
}

export async function lookupAnimeMediaDetails(id: string): Promise<AnimeMediaDetailsResult> {
  const lookup = await lookupAnimeMediaEntry(id);
  if (!lookup.ok) {
    return lookup;
  }

  const details = await fetchAnilistMediaById(id).catch(() => null);
  if (!details) {
    return createLookupFailure('AniList details are unavailable right now. Try again later.', 'upstream-error', 502);
  }

  return {
    data: {
      cast: mapCast(details),
      entry: lookup.entry,
      recommendations: mapRecommendations(details),
      trailers: mapTrailers(details),
    },
    ok: true,
  };
}
