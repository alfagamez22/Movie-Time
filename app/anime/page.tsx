import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { browseAnimeForPlayer } from '@/lib/anime/player-config';
import { papianimeExperience } from '@/lib/media/experience';

// Browse rows change slowly; serve a cached page and rebuild in the background every 30 minutes.
export const revalidate = 1800;

export const metadata: Metadata = {
  alternates: { canonical: '/anime' },
  description: 'Stream anime with subs and dubs: currently airing series, seasonal picks, anime movies and watch parties on PapiAnime.',
  title: { absolute: 'PapiAnime — Watch Anime Online (Sub & Dub)' },
};

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
