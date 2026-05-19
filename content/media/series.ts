import type { TvCatalogEntry } from '@/lib/media/types';

export const seriesCatalog: TvCatalogEntry[] = [
  {
    type: 'tv',
    tmdbId: '2734',
    title: 'Law & Order: SVU',
    slug: 'law-and-order-svu',
    aliases: ['law-order-svu'],
    synopsis: 'Long-running crime drama entry with season and episode bounds stored in the catalog.',
    maxSeasons: 25,
    maxEpisodes: 22,
  },
  {
    type: 'tv',
    tmdbId: '76479',
    title: 'The Boys',
    slug: 'the-boys',
    synopsis: 'Featured series entry managed through the content layer.',
    maxSeasons: 4,
    maxEpisodes: 8,
  },
  {
    type: 'tv',
    tmdbId: '1439930',
    title: 'Featured Series 3',
    slug: 'featured-series-3',
    synopsis: 'Editable series entry with a human-readable slug and TV playback defaults.',
    maxSeasons: 1,
    maxEpisodes: 10,
  },
  {
    type: 'tv',
    tmdbId: '85552',
    title: 'Euphoria',
    slug: 'euphoria',
    synopsis: 'Drama series entry resolved through the slug index.',
    maxSeasons: 2,
    maxEpisodes: 8,
  },
];