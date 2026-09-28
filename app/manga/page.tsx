import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { browseManga } from '@/lib/manga/browse';
import { papimangaExperience } from '@/lib/media/experience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/manga' },
  description: 'Read popular and newly updated manga chapters online on PapiManga.',
  title: { absolute: 'PapiManga — Read Manga Online' },
};

export default async function MangaPage() {
  const library = await browseManga();

  return (
    <Suspense fallback={null}>
      <HomePage
        discoveryError={library.error}
        experience={papimangaExperience}
        sections={library.sections}
      />
    </Suspense>
  );
}
