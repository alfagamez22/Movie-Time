export type MediaType = 'movie' | 'tv';

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

export function getEpisodeLimit(entry: TvCatalogEntry | TvMediaEntry, season: string | number): number {
  return entry.episodesBySeason?.[String(season)] ?? entry.maxEpisodes;
}