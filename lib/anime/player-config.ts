import 'server-only';

import {
  ANIME_PLAYERS,
  DEFAULT_ANIME_PLAYER,
  getAnimePlayer,
  isAnimePlayerId,
  type AnimePlayerCatalog,
  type AnimePlayerId,
} from '@/lib/anime/player-metadata';
import { searchAnilistAnime, fetchAnilistBrowseBuckets } from '@/lib/anime/anilist';
import { searchJikanAnime, fetchJikanTopAnime } from '@/lib/anime/jikan';
import { searchKitsuAnime, fetchKitsuTrendingAnime } from '@/lib/anime/kitsu';
import { resolveAnilistIdByTitle } from '@/lib/anime/resolve-streaming-id';
import { lookupAnimeMediaEntry, searchAnimeLibrary, getAnimeLibrarySections } from '@/lib/anime/client';
import type { LibraryMediaEntry, LibrarySection, MediaEntry, MediaType, SeasonDetails } from '@/lib/media/types';
import type { AnimePlaybackServer } from '@/lib/media/types';

// Re-export the client-safe player metadata so server code that already
// imported from '@/lib/anime/player-config' keeps working.
export { ANIME_PLAYERS, DEFAULT_ANIME_PLAYER, getAnimePlayer, isAnimePlayerId };
export type { AnimePlayerId, AnimePlayerCatalog, AnimePlayerDefinition } from '@/lib/anime/player-metadata';

// Server-only additions: each player gets a streaming server hint.
const PLAYER_STREAMING_SERVER: Record<AnimePlayerId, AnimePlaybackServer> = {
  p1: 'aniwave',
  p2: 'aniwave',
  p3: 'anitaku',
  p4: 'aniwave',
  p5: 'aniwave',
};

export function getAnimePlayerStreamingServer(id: AnimePlayerId): AnimePlaybackServer {
  return PLAYER_STREAMING_SERVER[id] ?? 'aniwave';
}


// ---------------------------------------------------------------------------
// Anime player registry — server-only functions
// ---------------------------------------------------------------------------
//
// Each player combines a catalog (AniList, Kitsu, Jikan/MAL) with a streaming
// source (all of which ultimately resolve through VidNest's aniwave path).
// The catalog drives search, browse rows, and details metadata; the streaming
// source is the AniList ID that the VidNest pipeline expects.
//
// P1 (default) — AniList + /hianime/anime/ JSON (current behavior)
// P2            — AniList + VidNest embed iframe
// P3            — AniList + /animepahe/ JSON (fallback when /hianime/ 502s)
// P4            — Kitsu data + /hianime/anime/ JSON
// P5            — Jikan/MAL data + /hianime/anime/ JSON

export interface AnimePlayerCatalogAdapter {
  /** Return LibraryMediaEntry[] for a free-text query, or [] on failure. */
  search: (query: string, limit?: number) => Promise<LibraryMediaEntry[]>;
  /** Return browse sections ready for the homepage row grid. */
  browse?: () => Promise<LibrarySection[]>;
  /** Resolve a specific entry to a MediaEntry (or null if not found). */
  resolve?: (id: string) => Promise<AnimeCatalogResolution | null>;
}

export interface AnimeCatalogResolution {
  /** The MediaEntry that the watch player will use (AniList-derived). */
  entry: MediaEntry;
  /** Optional season details used to populate the episode list. */
  seasonDetails: SeasonDetails | null;
  /** Where the data originally came from — for the "via Kitsu" pill on details. */
  sourceLabel: string;
  /** Optional external ID that the user clicked on (e.g. MAL id "21"). */
  externalId?: string;
}

// ---------------------------------------------------------------------------
// Catalog adapters
// ---------------------------------------------------------------------------

const anilistAdapter: AnimePlayerCatalogAdapter = {
  browse: async () => {
    const result = await getAnimeLibrarySections();
    return result.ok ? result.sections : [];
  },
  resolve: async (id) => {
    const lookup = await lookupAnimeMediaEntry(id);
    if (!lookup.ok) {
      return null;
    }
    return {
      entry: lookup.entry,
      seasonDetails: lookup.seasonDetails,
      sourceLabel: 'AniList',
    };
  },
  search: async (query, limit = 18) => {
    const result = await searchAnimeLibrary(query);
    if (!result.ok) {
      return [];
    }
    return result.entries.slice(0, limit);
  },
};

const kitsuAdapter: AnimePlayerCatalogAdapter = {
  resolve: async (kitsuId) => {
    // Player 4 always routes through AniList for watch playback (VidNest is
    // AniList-driven). When the user clicks a Kitsu entry on the home page we
    // pass them through `lookupAnimeMediaEntry` with the Kitsu raw id; for
    // now the practical path is: search AniList by the Kitsu record's title.
    const { searchKitsuAnime } = await import('@/lib/anime/kitsu');
    const results = await searchKitsuAnime(kitsuId, { limit: 1 });
    if (results.length === 0) {
      return null;
    }
    const kitsuEntry = results[0];
    const externalId = kitsuEntry.id.replace(/^kitsu-/, '');
    const externalTitle = kitsuEntry.title;
    const externalYear = kitsuEntry.year;

    const resolved = await resolveAnilistIdByTitle({
      externalTitle,
      externalYear,
      fallbackId: externalId,
    });

    if (!resolved) {
      return null;
    }

    const lookup = await lookupAnimeMediaEntry(resolved.anilistId);
    if (!lookup.ok) {
      return null;
    }
    return {
      entry: lookup.entry,
      externalId,
      seasonDetails: lookup.seasonDetails,
      sourceLabel: 'Kitsu',
    };
  },
  search: async (query, limit = 18) => {
    return searchKitsuAnime(query, { limit });
  },
};

const jikanAdapter: AnimePlayerCatalogAdapter = {
  resolve: async (malId) => {
    const { fetchJikanAnimeById } = await import('@/lib/anime/jikan');
    const malEntry = await fetchJikanAnimeById(malId);
    if (!malEntry) {
      return null;
    }

    const resolved = await resolveAnilistIdByTitle({
      externalTitle: malEntry.title,
      externalYear: malEntry.year,
      fallbackId: malId,
    });

    if (!resolved) {
      return null;
    }

    const lookup = await lookupAnimeMediaEntry(resolved.anilistId);
    if (!lookup.ok) {
      return null;
    }
    return {
      entry: lookup.entry,
      externalId: malId,
      seasonDetails: lookup.seasonDetails,
      sourceLabel: 'MyAnimeList',
    };
  },
  search: async (query, limit = 18) => {
    return searchJikanAnime(query, { limit });
  },
};

export function getAnimeCatalogAdapter(catalog: AnimePlayerCatalog): AnimePlayerCatalogAdapter {
  if (catalog === 'kitsu') {
    return kitsuAdapter;
  }
  if (catalog === 'jikan') {
    return jikanAdapter;
  }
  return anilistAdapter;
}

// ---------------------------------------------------------------------------
// Search / browse helpers shared between the server page and the API route.
// ---------------------------------------------------------------------------

export interface AnimeSearchResult {
  data: LibraryMediaEntry[];
  error?: string;
  source: AnimePlayerCatalog;
}

export async function searchAnimeForPlayer(
  playerId: AnimePlayerId,
  query: string,
  type?: MediaType,
): Promise<AnimeSearchResult> {
  const player = ANIME_PLAYERS[playerId] ?? ANIME_PLAYERS[DEFAULT_ANIME_PLAYER];
  const adapter = getAnimeCatalogAdapter(player.catalog);

  try {
    const entries = await adapter.search(query, 24);
    const filtered = type ? entries.filter((entry) => entry.type === type) : entries;
    return { data: filtered, source: player.catalog };
  } catch {
    return { data: [], error: 'Search is temporarily unavailable.', source: player.catalog };
  }
}

export interface AnimeBrowseResult {
  data: LibraryMediaEntry[];
  error?: string;
  sections: LibrarySection[];
  source: AnimePlayerCatalog;
}

export async function browseAnimeForPlayer(playerId: AnimePlayerId): Promise<AnimeBrowseResult> {
  const player = ANIME_PLAYERS[playerId] ?? ANIME_PLAYERS[DEFAULT_ANIME_PLAYER];

  // P1/P2/P3 all use AniList browse — share the cached AniList response.
  if (player.catalog === 'anilist') {
    const result = await getAnimeLibrarySections();
    if (!result.ok) {
      return { data: [], error: result.message, sections: [], source: 'anilist' };
    }
    const sections = result.sections;
    const data = sections.flatMap((section) => section.entries).slice(0, 42);
    return { data, sections, source: 'anilist' };
  }

  if (player.catalog === 'kitsu') {
    const trending = await fetchKitsuTrendingAnime({ limit: 24 });
    const sections: LibrarySection[] = trending.length
      ? [
          {
            description: 'Anime currently trending on Kitsu.',
            entries: trending,
            id: 'kitsu-trending',
            title: 'Trending on Kitsu',
          },
        ]
      : [];
    return { data: trending.slice(0, 42), sections, source: 'kitsu' };
  }

  // Jikan
  const top = await fetchJikanTopAnime({ limit: 24 });
  const sections: LibrarySection[] = top.length
    ? [
        {
          description: 'Top-rated anime on MyAnimeList.',
          entries: top,
          id: 'jikan-top',
          title: 'Top on MyAnimeList',
        },
      ]
    : [];
  return { data: top.slice(0, 42), sections, source: 'jikan' };
}

// Re-export the AniList search fn for components that already use it directly
// (kept for backwards compatibility with the /api/anime route).
export { searchAnilistAnime, fetchAnilistBrowseBuckets };
