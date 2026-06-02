import 'server-only';

import type { LibraryMediaEntry } from '@/lib/media/types';
import { searchMangaDex } from './client';
import { mangaDexToLibraryEntry } from './mapping';

export interface MangaSearchResult {
  data: LibraryMediaEntry[];
  error?: string;
}

export async function searchManga(query: string, limit: number = 24): Promise<MangaSearchResult> {
  try {
    const result = await searchMangaDex(query, { limit });
    return { data: result.data.map(mangaDexToLibraryEntry) };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : 'Search failed.' };
  }
}
