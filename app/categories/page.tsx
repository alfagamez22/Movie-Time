import { Suspense } from 'react';

import { CategoriesPage } from '@/components/media/categories-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';

export const revalidate = 3600;

export const metadata = {
  description: 'Browse every PapiFlix category — regional cinema, genres, ratings, and Vivamax sections.',
  title: 'Categories | PapiFlix',
};

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();

  return (
    <Suspense fallback={null}>
      <CategoriesPage
        experience={papiflixExperience}
        sections={liveLibrary.ok ? liveLibrary.sections : []}
        discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      />
    </Suspense>
  );
}
