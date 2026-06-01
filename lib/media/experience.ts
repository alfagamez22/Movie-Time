import type { MediaExperience } from './types';

export interface MediaNavLink {
  href: string;
  label: string;
}

export interface MediaExperienceConfig {
  brandBannerSrc: string;
  brandBackgroundPosition: string;
  brandBackgroundSize: string;
  brandName: string;
  detailsApiBasePath: string;
  emptySearchText: string;
  footerText: string;
  homeHref: string;
  id: MediaExperience;
  navLinks: MediaNavLink[];
  preferenceMode: 'language' | 'player';
  searchEndpoint: string;
  searchPlaceholder: string;
  watchBasePath: string;
}

export const papiflixExperience: MediaExperienceConfig = {
  brandBannerSrc: '/icons/papiflixbanner.png',
  brandBackgroundPosition: '47% center',
  brandBackgroundSize: '200% auto',
  brandName: 'PapiFlix',
  detailsApiBasePath: '/api/media',
  emptySearchText: 'Type to search across movies and TV series',
  footerText: 'Metadata and artwork provided by The Movie Database.',
  homeHref: '/',
  id: 'papiflix',
  navLinks: [
    { href: '/', label: 'Home' },
    { href: '/#movies', label: 'Movies' },
    { href: '/#tv-shows', label: 'TV Shows' },
    { href: '/anime', label: 'Anime' },
  ],
  // preferenceMode: 'player' — the PapiFlix watch UI shows a player-switcher
  // (Player 1–5). Player 5 is the StreamIMDB embed and is exclusive to the
  // PapiFlix experience; it is intentionally absent on the /anime route because
  // papianimeExperience sets preferenceMode: 'language' (see below), which
  // renders a dub/sub toggle in place of the player-switcher.
  preferenceMode: 'player',
  searchEndpoint: '/api/media',
  searchPlaceholder: 'Search movies, series, or enter a numeric ID...',
  watchBasePath: '/watch',
};

export const papianimeExperience: MediaExperienceConfig = {
  brandBannerSrc: '/icons/papianimebanner.png',
  brandBackgroundPosition: '44% center',
  brandBackgroundSize: '160% auto',
  brandName: 'PapiAnime',
  detailsApiBasePath: '/api/anime',
  emptySearchText: 'Search anime titles, browse current seasons, or enter an AniList ID',
  footerText: 'Metadata provided by AniList. Playback powered by VidNest anime sources.',
  homeHref: '/anime',
  id: 'papianime',
  navLinks: [
    { href: '/anime', label: 'Home' },
    { href: '/anime#currently-airing', label: 'Airing' },
    { href: '/anime#anime-movies', label: 'Movies' },
    { href: '/', label: 'PapiFlix' },
  ],
  // preferenceMode: 'language' — the PapiAnime watch UI shows a dub/sub
  // language toggle instead of the PapiFlix player-switcher. This keeps Player
  // 5 (StreamIMDB) off the /anime route, where it would be irrelevant.
  preferenceMode: 'language',
  searchEndpoint: '/api/anime',
  searchPlaceholder: 'Search anime titles or AniList ID...',
  watchBasePath: '/anime/watch',
};
