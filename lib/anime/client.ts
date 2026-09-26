import 'server-only';

import {
  fetchAnilistBrowseBuckets,
  fetchAnilistMediaById,
  fetchAnilistRelationsById,
  searchAnilistAnime,
  type AnilistMedia,
  type AnilistMediaDetails,
  type AnilistRelationEdge,
} from '@/lib/anime/anilist';
import { appConfig } from '@/lib/config';
import {
  buildAnimePlaylist,
  isMatchingSeriesTitle,
  isSeriesRelation,
  rankAnimeRecommendations,
  seriesNameKey,
} from '@/lib/anime/playlist';
import {
  cleanSynopsis,
  cleanText,
  getAnilistTitle,
  getBackdropUrl,
  getEpisodeCount,
  getReleasedEpisodeBoundary,
  getPosterUrl,
  isReleasedAnime,
  mapAnilistFormatToMediaType,
} from '@/lib/anime/episodes';
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

function getAliases(media: AnilistMedia): string[] {
  return dedupeStrings([
    media.title.english,
    media.title.userPreferred,
    media.title.romaji,
    media.title.native,
    ...(media.synonyms ?? []),
  ]);
}

function getReleaseYear(media: AnilistMedia): number | undefined {
  return media.seasonYear ?? media.startDate?.year ?? undefined;
}

function getFallbackEpisodeName(episodeNumber: number): string {
  return `Episode ${String(episodeNumber).padStart(2, '0')}`;
}

function getVisibleEpisodeCount(media: AnilistMedia): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  return Math.max(
    getEpisodeCount(media),
    media.nextAiringEpisode?.episode ?? 0,
  );
}

function buildSeasonDetails(media: AnilistMedia): SeasonDetails | null {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) !== 'tv') {
    return null;
  }

  const releasedEpisodeCount = getEpisodeCount(media);
  const episodeCount = Math.max(releasedEpisodeCount, getVisibleEpisodeCount(media));
  const upcomingEpisodeBoundary = getReleasedEpisodeBoundary(media);

  return {
    episodeCount,
    episodes: Array.from({ length: episodeCount }, (_, index) => {
      const episodeNumber = index + 1;
      return {
        episodeNumber,
        fallbackStillUrl: getPosterUrl(media),
        isReleased: upcomingEpisodeBoundary > 0 ? episodeNumber <= upcomingEpisodeBoundary : episodeNumber <= releasedEpisodeCount,
        name: getFallbackEpisodeName(episodeNumber),
        overview: '',
        scheduledAt:
          episodeNumber === media.nextAiringEpisode?.episode && typeof media.nextAiringEpisode.airingAt === 'number'
            ? media.nextAiringEpisode.airingAt
            : undefined,
        seasonNumber: 1,
        stillUrl: getBackdropUrl(media) || getPosterUrl(media),
      };
    }),
    name: 'Episodes',
    overview: cleanSynopsis(media.description),
    posterUrl: getPosterUrl(media),
    releasedEpisodeCount,
    seasonNumber: 1,
  };
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

function createTvEntry(media: AnilistMedia): TvMediaEntry {
  const episodeCount = getEpisodeCount(media);
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

function createAnimeEntry(media: AnilistMedia): MediaEntry {
  return mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie'
    ? createMovieEntry(media)
    : createTvEntry(media);
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
  return media.map((entry) => toLibraryMediaEntry(createAnimeEntry(entry)));
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

function mapRecommendations(details: AnilistMediaDetails, playlistIds: Set<number>): LibraryMediaEntry[] {
  const recommendationEntries = (details.recommendations?.nodes ?? [])
    .map((node) => node.mediaRecommendation)
    .filter((entry): entry is AnilistMedia => Boolean(entry));
  return dedupeEntries(
    rankAnimeRecommendations(details, recommendationEntries, playlistIds, appConfig.animeIncludeAdult)
      .map((entry) => toLibraryMediaEntry(createAnimeEntry(entry))),
    18,
  );
}

async function mapAnimeSeries(details: AnilistMediaDetails) {
  const media = new Map<number, AnilistMedia>([[details.id, details]]);
  const relations = new Map<number, AnilistRelationEdge[]>([
    [details.id, details.relations?.edges ?? []],
  ]);
  const seen = new Set<number>([details.id]);
  let frontier = [details.id];

  // Follow a short prequel/sequel chain. AniList keeps each season as a
  // separate Media ID, so every playlist item retains its own player key.
  for (let depth = 0; depth < 3 && frontier.length && media.size < 16; depth += 1) {
    const next: number[] = [];
    for (const id of frontier) {
      const edges = relations.get(id) ?? [];
      for (const edge of edges) {
        if (!isSeriesRelation(edge) || !edge.node || media.size >= 16) continue;
        if (!appConfig.animeIncludeAdult && edge.node.isAdult) continue;
        media.set(edge.node.id, edge.node);
        if ((edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') &&
            !seen.has(edge.node.id) && next.length < 6) {
          seen.add(edge.node.id);
          next.push(edge.node.id);
        }
      }
    }
    if (depth === 2) break;
    const fetched = await Promise.all(next.map(async (id) => {
      try { return [id, await fetchAnilistRelationsById(id)] as const; }
      catch { return [id, [] as AnilistRelationEdge[]] as const; }
    }));
    for (const [id, edges] of fetched) relations.set(id, edges);
    frontier = next;
  }

  // A matching title can fill a missing AniList relation. Keep the match
  // strict so unrelated titles with similar words are not merged.
  const titleKey = seriesNameKey(details.title.english || details.title.romaji || getAnilistTitle(details));
  if (titleKey.length >= 6) {
    try {
      const candidates = await searchAnilistAnime(titleKey, 18);
      for (const item of candidates) {
        if (media.size >= 16) break;
        if (isMatchingSeriesTitle(item, titleKey) && (appConfig.animeIncludeAdult || !item.isAdult)) {
          media.set(item.id, item);
        }
      }
    } catch { /* Relations remain usable when search is unavailable. */ }
  }

  return buildAnimePlaylist(details.id, media, relations,
    (item) => toLibraryMediaEntry(createAnimeEntry(item)), appConfig.animeIncludeAdult);
}

export async function lookupAnimeMediaEntry(id: string): Promise<AnimeLookupResult> {
  const parsedId = Number.parseInt(id, 10);
  if (!Number.isFinite(parsedId) || parsedId < 1) {
    return createLookupFailure('AniList ID must be a positive integer.', 'not-found', 404);
  }

  const media = await fetchAnilistMediaById(String(parsedId)).catch(() => null);

  if (!media) {
    return createLookupFailure(`AniList anime ${id} was not found.`, 'not-found', 404);
  }

  if (!isReleasedAnime(media)) {
    return createLookupFailure(`AniList anime ${id} has not released yet.`, 'not-found', 404);
  }

  return {
    entry: createAnimeEntry(media),
    ok: true,
    seasonDetails: buildSeasonDetails(media),
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

  const animePlaylist = await mapAnimeSeries(details);
  const playlistIds = new Set(animePlaylist.map((item) => Number(item.entry.id)));

  return {
    data: {
      animePlaylist,
      cast: mapCast(details),
      entry: lookup.entry,
      recommendations: mapRecommendations(details, playlistIds),
      trailers: mapTrailers(details),
    },
    ok: true,
  };
}
