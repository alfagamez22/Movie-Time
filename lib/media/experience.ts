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
  emptySearchText: 'Type to search recent anime titles or enter an Anikoto ID',
  footerText: 'Metadata provided by Anikoto. Playback powered by MegaPlay.',
  homeHref: '/anime',
  id: 'papianime',
  navLinks: [
    { href: '/anime', label: 'Home' },
    { href: '/anime#currently-airing', label: 'Airing' },
    { href: '/anime#anime-movies', label: 'Movies' },
    { href: '/', label: 'PapiFlix' },
  ],
  preferenceMode: 'language',
  searchEndpoint: '/api/anime',
  searchPlaceholder: 'Search recent anime titles or Anikoto ID...',
  watchBasePath: '/anime/watch',
};
