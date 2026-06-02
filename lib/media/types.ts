export type MediaType = 'movie' | 'tv';
export type BrowseMediaType = MediaType | 'all';
export type MediaProvider = 'tmdb' | 'anilist' | 'anikoto' | 'mangadex';
export type MediaExperience = 'papiflix' | 'papianime' | 'papimanga';
export type PlaybackLanguage = 'sub' | 'dub';
export type AnimeFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC';
export type MangaFormat = 'manga' | 'novel' | 'one_shot' | 'manhwa' | 'manhua';
export type MangaLanguage = 'en' | 'raw';

export interface EpisodePreview {
  airDate?: string;
  episodeNumber: number;
  fallbackStillUrl?: string;
  isReleased?: boolean;
  name: string;
  overview: string;
  runtime?: number;
  scheduledAt?: number;
  seasonNumber: number;
  stillUrl?: string;
}

export interface SeasonDetails {
  airDate?: string;
  episodeCount: number;
  episodes: EpisodePreview[];
  name: string;
  overview: string;
  posterUrl?: string;
  releasedEpisodeCount?: number;
  seasonNumber: number;
}

interface CatalogEntryBase {
  animeFormat?: AnimeFormat;
  anilistId?: string;
  backdropUrl?: string;
  defaultLanguage?: PlaybackLanguage;
  episodeCount?: number;
  episodeEmbedIds?: Record<string, string>;
  id: string;
  malId?: string;
  mangaFormat?: MangaFormat;
  nextEpisodeAt?: number;
  nextEpisodeNumber?: number;
  posterUrl?: string;
  provider: MediaProvider;
  rating?: number;
  title: string;
  slug?: string;
  aliases?: string[];
  synopsis: string;
  voteCount?: number;
  year?: number;
}

export interface MovieCatalogEntry extends CatalogEntryBase {
  type: 'movie';
}

export interface TvCatalogEntry extends CatalogEntryBase {
  episodesBySeason?: Record<string, number>;
  type: 'tv';
  maxSeasons: number;
  maxEpisodes: number;
  totalEpisodes?: number;
}

export type CatalogEntry = MovieCatalogEntry | TvCatalogEntry;

interface MediaEntryBase extends Omit<CatalogEntryBase, 'slug' | 'aliases'> {
  slug: string;
  aliases: string[];
}

export interface LibraryMediaEntry {
  animeFormat?: AnimeFormat;
  anilistId?: string;
  backdropUrl?: string;
  defaultLanguage?: PlaybackLanguage;
  episodeCount?: number;
  episodeEmbedIds?: Record<string, string>;
  id: string;
  malId?: string;
  mangaFormat?: MangaFormat;
  nextEpisodeAt?: number;
  nextEpisodeNumber?: number;
  posterUrl?: string;
  provider: MediaProvider;
  rating?: number;
  synopsis: string;
  title: string;
  type: MediaType;
  voteCount?: number;
  year?: number;
}

export interface LibrarySection {
  description: string;
  entries: LibraryMediaEntry[];
  id: string;
  title: string;
}

export interface MediaCastMember {
  character?: string;
  id?: number;
  name: string;
  profileUrl?: string;
}

export interface MediaTrailer {
  embedUrl?: string;
  thumbnailUrl?: string;
  title: string;
  url: string;
  youtubeId?: string;
}

export interface MediaDetailsPayload {
  cast: MediaCastMember[];
  entry: MediaEntry;
  recommendations: LibraryMediaEntry[];
  trailers: MediaTrailer[];
}

export interface MovieMediaEntry extends MediaEntryBase {
  type: 'movie';
}

export interface TvMediaEntry extends MediaEntryBase {
  episodesBySeason?: Record<string, number>;
  type: 'tv';
  maxSeasons: number;
  maxEpisodes: number;
  totalEpisodes?: number;
}

export type MediaEntry = MovieMediaEntry | TvMediaEntry;

export function isTvEntry(entry: CatalogEntry | MediaEntry): entry is TvCatalogEntry | TvMediaEntry {
  return entry.type === 'tv';
}

export function isAnimeProvider(provider: MediaProvider): boolean {
  return provider === 'anilist' || provider === 'anikoto';
}

export function toLibraryMediaEntry(entry: CatalogEntry | MediaEntry): LibraryMediaEntry {
  return {
    animeFormat: entry.animeFormat,
    anilistId: entry.anilistId,
    backdropUrl: entry.backdropUrl,
    defaultLanguage: entry.defaultLanguage,
    episodeCount: entry.episodeCount,
    episodeEmbedIds: entry.episodeEmbedIds,
    id: entry.id,
    malId: entry.malId,
    nextEpisodeAt: entry.nextEpisodeAt,
    nextEpisodeNumber: entry.nextEpisodeNumber,
    posterUrl: entry.posterUrl,
    provider: entry.provider,
    rating: entry.rating,
    synopsis: entry.synopsis,
    title: entry.title,
    type: entry.type,
    voteCount: entry.voteCount,
    year: entry.year,
  };
}

export function getEpisodeLimit(entry: TvCatalogEntry | TvMediaEntry, season: string | number): number {
  return entry.episodesBySeason?.[String(season)] ?? entry.maxEpisodes;
}

export function getMediaKindLabel(
  entry: Pick<LibraryMediaEntry | MediaEntry, 'animeFormat' | 'mangaFormat' | 'provider' | 'type'>,
): string {
  if (isAnimeProvider(entry.provider)) {
    if (entry.type === 'movie') {
      return 'Anime Movie';
    }

    return entry.animeFormat === 'TV_SHORT' ? 'Anime Short' : 'Anime Series';
  }

  if (entry.provider === 'mangadex') {
    if (entry.mangaFormat === 'novel') {
      return 'Light Novel';
    }

    if (entry.mangaFormat === 'manhwa') {
      return 'Manhwa';
    }

    if (entry.mangaFormat === 'manhua') {
      return 'Manhua';
    }

    if (entry.mangaFormat === 'one_shot') {
      return 'One Shot';
    }

    return 'Manga';
  }

  return entry.type === 'movie' ? 'Movie' : 'TV Series';
}

export interface MangaChapter {
  chapter: string | null;
  id: string;
  language: string;
  pages: number;
  readableAt: string;
  scanlationGroup: string;
  title: string;
  volume: string | null;
}

export interface MangaChapterPage {
  height: number;
  index: number;
  src: string;
  width: number;
}

export interface MangaChapterData {
  chapters: MangaChapter[];
  manga: {
    id: string;
    posterUrl: string;
    title: string;
  };
}

export interface MangaReadPayload {
  chapter: MangaChapter;
  pages: MangaChapterPage[];
}

export function isMangaProvider(provider: MediaProvider): boolean {
  return provider === 'mangadex';
}
