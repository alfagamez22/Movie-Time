export type AnimePlayerId = 'p1';

export const ANIME_PLAYER_IDS: AnimePlayerId[] = ['p1'];

export const DEFAULT_ANIME_PLAYER: AnimePlayerId = 'p1';

export type AnimePlayerCatalog = 'anilist';

export interface AnimePlayerDefinition {
  catalog: AnimePlayerCatalog;
  colorAccent: string;
  description: string;
  id: AnimePlayerId;
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
};

export function getAnimePlayer(id: string | null | undefined): AnimePlayerDefinition {
  return ANIME_PLAYERS[DEFAULT_ANIME_PLAYER];
}

export function isAnimePlayerId(value: string | null | undefined): value is AnimePlayerId {
  return value === 'p1';
}
