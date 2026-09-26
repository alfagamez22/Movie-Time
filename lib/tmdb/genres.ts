import type { LibraryMediaEntry, MediaType } from '@/lib/media/types';
import { normalizeSlug } from '@/lib/slugs/media';

import {
  createLibraryEntryFromBrowseResult,
  isTmdbFailure,
  requestOfficialTmdb,
  type TmdbBrowseResult,
} from './client';

export type GenreSort = 'popular' | 'top-rated' | 'newest';

export interface GenreTile {
  backdropUrl?: string;
  movieGenreId?: number;
  name: string;
  slug: string;
  tvGenreId?: number;
}

export interface GenrePage {
  entries: LibraryMediaEntry[];
  page: number;
  totalPages: number;
}

const HIDDEN_GENRES = new Set(['TV Movie', 'News', 'Soap', 'Talk']);

async function fetchGenreList(type: MediaType) {
  const payload = await requestOfficialTmdb<{ genres?: Array<{ id: number; name: string }> }>(`/genre/${type}/list`);
  return isTmdbFailure(payload) ? [] : payload.genres ?? [];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function discoverQuery(type: MediaType, genreId: number, sort: GenreSort, page: number) {
  const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
  const sortBy = sort === 'top-rated' ? 'vote_average.desc' : sort === 'newest' ? `${dateField}.desc` : 'popularity.desc';
  return {
    [`${dateField}.lte`]: today(),
    include_adult: false,
    page,
    sort_by: sortBy,
    'vote_count.gte': sort === 'top-rated' ? 300 : sort === 'newest' ? 20 : 50,
    with_genres: genreId,
  };
}

export async function getGenreTiles(): Promise<GenreTile[]> {
  const [movieGenres, tvGenres] = await Promise.all([fetchGenreList('movie'), fetchGenreList('tv')]);
  const tiles = new Map<string, GenreTile>();
  for (const genre of movieGenres) {
    if (HIDDEN_GENRES.has(genre.name)) continue;
    tiles.set(genre.name, { movieGenreId: genre.id, name: genre.name, slug: normalizeSlug(genre.name) });
  }
  for (const genre of tvGenres) {
    if (HIDDEN_GENRES.has(genre.name)) continue;
    const existing = tiles.get(genre.name);
    if (existing) existing.tvGenreId = genre.id;
    else tiles.set(genre.name, { name: genre.name, slug: normalizeSlug(genre.name), tvGenreId: genre.id });
  }

  const list = [...tiles.values()].sort((a, b) => a.name.localeCompare(b.name));
  const candidates = await Promise.all(list.map(async (tile) => {
    const type: MediaType = tile.movieGenreId ? 'movie' : 'tv';
    const payload = await requestOfficialTmdb<{ results?: TmdbBrowseResult[] }>(
      `/discover/${type}`,
      discoverQuery(type, (tile.movieGenreId ?? tile.tvGenreId)!, 'popular', 1),
    );
    if (isTmdbFailure(payload)) return [];
    return (payload.results ?? [])
      .map((result) => createLibraryEntryFromBrowseResult(result, type)?.backdropUrl)
      .filter((url): url is string => Boolean(url));
  }));

  // Popular titles span many genres; give each tile its own image.
  const used = new Set<string>();
  list.forEach((tile, index) => {
    const pick = candidates[index].find((url) => !used.has(url)) ?? candidates[index][0];
    if (pick) used.add(pick);
    tile.backdropUrl = pick;
  });

  return list;
}

export async function findGenreTile(slug: string): Promise<GenreTile | null> {
  const tiles = await getGenreTiles();
  return tiles.find((tile) => tile.slug === slug) ?? null;
}

export async function getGenreTitles(tile: GenreTile, type: MediaType, sort: GenreSort, page = 1): Promise<GenrePage> {
  const genreId = type === 'movie' ? tile.movieGenreId : tile.tvGenreId;
  if (!genreId) return { entries: [], page, totalPages: 0 };
  const safePage = Math.min(Math.max(1, Math.floor(page)), 500);
  const payload = await requestOfficialTmdb<{ page?: number; results?: TmdbBrowseResult[]; total_pages?: number }>(
    `/discover/${type}`,
    discoverQuery(type, genreId, sort, safePage),
  );
  if (isTmdbFailure(payload)) return { entries: [], page: safePage, totalPages: 0 };
  const entries = (payload.results ?? [])
    .map((result) => createLibraryEntryFromBrowseResult(result, type))
    .filter((entry): entry is LibraryMediaEntry => Boolean(entry?.posterUrl));
  return { entries, page: safePage, totalPages: Math.min(payload.total_pages ?? 0, 500) };
}

export function parseGenreSort(value: string | null | undefined): GenreSort {
  return value === 'top-rated' || value === 'newest' ? value : 'popular';
}
