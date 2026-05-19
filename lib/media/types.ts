export type MediaType = 'movie' | 'tv';
export type BrowseMediaType = MediaType | 'all';

export interface EpisodePreview {
  airDate?: string;
  episodeNumber: number;
  name: string;
  overview: string;
  runtime?: number;
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
  seasonNumber: number;
}

interface CatalogEntryBase {
  backdropUrl?: string;
  posterUrl?: string;
  tmdbId: string;
  title: string;
  slug?: string;
  aliases?: string[];
  synopsis: string;
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
  backdropUrl?: string;
  posterUrl?: string;
  rating?: number;
  synopsis: string;
  title: string;
  tmdbId: string;
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

export function toLibraryMediaEntry(entry: CatalogEntry | MediaEntry): LibraryMediaEntry {
  return {
    backdropUrl: entry.backdropUrl,
    posterUrl: entry.posterUrl,
    synopsis: entry.synopsis,
    title: entry.title,
    tmdbId: entry.tmdbId,
    type: entry.type,
    year: entry.year,
  };
}

export function getEpisodeLimit(entry: TvCatalogEntry | TvMediaEntry, season: string | number): number {
  return entry.episodesBySeason?.[String(season)] ?? entry.maxEpisodes;
}
