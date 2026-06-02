import { searchAnimeLibrary, getAnimeLibrarySections } from '@/lib/anime/client';
import type { LibraryMediaEntry, LibrarySection, MediaType } from '@/lib/media/types';

export interface AnimeSearchResult {
  data: LibraryMediaEntry[];
  error?: string;
  source: string;
}

export async function searchAnimeForPlayer(
  _playerId: string,
  query: string,
  type?: MediaType,
): Promise<AnimeSearchResult> {
  try {
    const result = await searchAnimeLibrary(query);
    if (!result.ok) {
      return { data: [], error: result.message, source: 'anilist' };
    }
    const filtered = type ? result.entries.filter((entry) => entry.type === type) : result.entries;
    return { data: filtered.slice(0, 24), source: 'anilist' };
  } catch {
    return { data: [], error: 'Search is temporarily unavailable.', source: 'anilist' };
  }
}

export interface AnimeBrowseResult {
  data: LibraryMediaEntry[];
  error?: string;
  sections: LibrarySection[];
  source: string;
}

export async function browseAnimeForPlayer(_playerId: string): Promise<AnimeBrowseResult> {
  const result = await getAnimeLibrarySections();
  if (!result.ok) {
    return { data: [], error: result.message, sections: [], source: 'anilist' };
  }
  const sections = result.sections;
  const data = sections.flatMap((section) => section.entries).slice(0, 42);
  return { data, sections, source: 'anilist' };
}
