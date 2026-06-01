import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';

export const revalidate = 3600;

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();

  return (
    <Suspense fallback={null}>
      <HomePage
        experience={papiflixExperience}
        sections={liveLibrary.ok ? liveLibrary.sections : []}
        discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      />
    </Suspense>
  );
}
