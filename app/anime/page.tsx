import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { browseAnimeForPlayer } from '@/lib/anime/player-config';
import { papianimeExperience } from '@/lib/media/experience';

export const dynamic = 'force-dynamic';

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
