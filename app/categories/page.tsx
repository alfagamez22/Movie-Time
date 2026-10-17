import { Suspense } from 'react';

import { CategoriesPage } from '@/components/media/categories-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';
import { getGenreTiles } from '@/lib/tmdb/genres';

export const revalidate = 3600;

export const metadata = {
  alternates: { canonical: '/categories' },
  description: 'Browse free movies and TV series by genre on PapiFlix: action, comedy, horror, romance, thriller and more. Find where to watch trending, top rated and Filipino movies online.',
  keywords: ['movie genres', 'browse movies by genre', 'action movies', 'comedy movies', 'horror movies', 'free movies online', 'where to watch movies', 'Filipino movies'],
  title: 'Browse Free Movies & TV Series by Genre',
};

export default async function Page() {
  const [liveLibrary, genres] = await Promise.all([getTmdbLibrarySections(), getGenreTiles()]);

  return (
    <Suspense fallback={null}>
      <CategoriesPage
        experience={papiflixExperience}
        genres={genres}
        sections={liveLibrary.ok ? liveLibrary.sections : []}
        discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      />
    </Suspense>
  );
}
