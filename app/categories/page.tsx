import { Suspense } from 'react';

import { CategoriesPage } from '@/components/media/categories-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';
import { getGenreTiles } from '@/lib/tmdb/genres';

export const revalidate = 3600;

export const metadata = {
  description: 'Browse PapiFlix by genre, or explore curated collections like regional cinema, top rated and Vivamax.',
  title: 'Categories',
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
