// ---------------------------------------------------------------------------
// Client-safe anime player metadata
// ---------------------------------------------------------------------------
//
// This file is imported by both the server (app/anime/page.tsx) and the
// client (components/media/home-page.tsx via the AnimePlayerSwitcher). It
// must not import any `server-only` modules — the actual catalog/streaming
// adapters live in lib/anime/player-config.tsx (server) instead.

export type AnimePlayerId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';

export const ANIME_PLAYER_IDS: AnimePlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];

export const DEFAULT_ANIME_PLAYER: AnimePlayerId = 'p1';

export type AnimePlayerCatalog = 'anilist' | 'kitsu' | 'jikan';

export interface AnimePlayerDefinition {
  catalog: AnimePlayerCatalog;
  colorAccent: string;
  description: string;
  id: AnimePlayerId;
  /** Whether this player uses the VidNest JSON proxy (vs the iframe embed). */
  isEmbed: boolean;
  label: string;
  shortLabel: string;
}

export const ANIME_PLAYERS: Record<AnimePlayerId, AnimePlayerDefinition> = {
  p1: {
    catalog: 'anilist',
    colorAccent: '#8b5cf6',
    description: 'AniList data, HiAnime JSON streaming',
    id: 'p1',
    isEmbed: false,
    label: 'AniList · HiAnime',
    shortLabel: 'P1',
  },
  p2: {
    catalog: 'anilist',
    colorAccent: '#10b981',
    description: 'AniList data, VidNest embed iframe',
    id: 'p2',
    isEmbed: true,
    label: 'AniList · Embed',
    shortLabel: 'P2',
  },
  p3: {
    catalog: 'anilist',
    colorAccent: '#14b8a6',
    description: 'AniList data, AnimePahe fallback streaming',
    id: 'p3',
    isEmbed: false,
    label: 'AniList · AnimePahe',
    shortLabel: 'P3',
  },
  p4: {
    catalog: 'kitsu',
    colorAccent: '#fb7185',
    description: 'Kitsu data, HiAnime JSON streaming',
    id: 'p4',
    isEmbed: false,
    label: 'Kitsu · HiAnime',
    shortLabel: 'P4',
  },
  p5: {
    catalog: 'jikan',
    colorAccent: '#f59e0b',
    description: 'Jikan (MAL) data, HiAnime JSON streaming',
    id: 'p5',
    isEmbed: false,
    label: 'Jikan · HiAnime',
    shortLabel: 'P5',
  },
};

export function getAnimePlayer(id: string | null | undefined): AnimePlayerDefinition {
  if (id === 'p2' || id === 'p3' || id === 'p4' || id === 'p5') {
    return ANIME_PLAYERS[id];
  }
  return ANIME_PLAYERS[DEFAULT_ANIME_PLAYER];
}

export function isAnimePlayerId(value: string | null | undefined): value is AnimePlayerId {
  return value === 'p1' || value === 'p2' || value === 'p3' || value === 'p4' || value === 'p5';
}
