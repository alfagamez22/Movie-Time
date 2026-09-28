import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { browseAnimeForPlayer } from '@/lib/anime/player-config';
import { papianimeExperience } from '@/lib/media/experience';

// Browse rows change slowly; serve a cached page and rebuild in the background every 30 minutes.
export const revalidate = 1800;

export default async function AnimePage() {
  const library = await browseAnimeForPlayer('p1');

  return (
    <Suspense fallback={null}>
      <HomePage
        discoveryError={library.error ?? null}
        experience={papianimeExperience}
        sections={library.sections}
      />
    </Suspense>
  );
}
