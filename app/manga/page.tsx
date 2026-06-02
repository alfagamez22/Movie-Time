import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { browseManga } from '@/lib/manga/browse';
import { papimangaExperience } from '@/lib/media/experience';

export const dynamic = 'force-dynamic';

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
