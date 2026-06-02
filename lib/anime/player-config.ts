import 'server-only';

import {
  ANIME_PLAYERS,
  DEFAULT_ANIME_PLAYER,
  getAnimePlayer,
  isAnimePlayerId,
  type AnimePlayerCatalog,
  type AnimePlayerId,
} from '@/lib/anime/player-metadata';
import { searchAnimeLibrary, getAnimeLibrarySections } from '@/lib/anime/client';
import type { LibraryMediaEntry, LibrarySection, MediaType } from '@/lib/media/types';

export { ANIME_PLAYERS, DEFAULT_ANIME_PLAYER, getAnimePlayer, isAnimePlayerId };
export type { AnimePlayerId, AnimePlayerCatalog, AnimePlayerDefinition } from '@/lib/anime/player-metadata';

// ---------------------------------------------------------------------------
// Search / browse — always uses AniList via the anime library client.
// ---------------------------------------------------------------------------

export interface AnimeSearchResult {
  data: LibraryMediaEntry[];
  error?: string;
  source: AnimePlayerCatalog;
}

export async function searchAnimeForPlayer(
  _playerId: AnimePlayerId,
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
  source: AnimePlayerCatalog;
}

export async function browseAnimeForPlayer(_playerId: AnimePlayerId): Promise<AnimeBrowseResult> {
  const result = await getAnimeLibrarySections();
  if (!result.ok) {
    return { data: [], error: result.message, sections: [], source: 'anilist' };
  }
  const sections = result.sections;
  const data = sections.flatMap((section) => section.entries).slice(0, 42);
  return { data, sections, source: 'anilist' };
}
