import type { MovieCatalogEntry } from '@/lib/media/types';

export const movieCatalog: MovieCatalogEntry[] = [
  {
    type: 'movie',
    tmdbId: '914',
    title: 'The Great Dictator',
    slug: 'the-great-dictator',
    synopsis: 'A restored catalog favorite with a dedicated readable route.',
    year: 1940,
  },
  {
    type: 'movie',
    tmdbId: '1038392',
    title: 'Featured Movie 1',
    slug: 'featured-movie-1',
    synopsis: 'Pinned movie entry managed from the local catalog instead of page code.',
  },
  {
    type: 'movie',
    tmdbId: '1610418',
    title: 'Featured Movie 2',
    slug: 'featured-movie-2',
    synopsis: 'Another editable movie entry with a canonical slug.',
  },
  {
    type: 'movie',
    tmdbId: '508642',
    title: 'Featured Movie 3',
    slug: 'featured-movie-3',
    synopsis: 'Sample catalog entry showing how new movies can be added without touching routes.',
  },
];