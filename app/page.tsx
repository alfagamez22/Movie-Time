import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { papiflixExperience } from '@/lib/media/experience';
import { jsonLdScript, websiteJsonLd } from '@/lib/seo';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';

export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description: 'Watch trending movies and TV series, browse by genre, and host live watch parties with friends on PapiFlix.',
  title: { absolute: 'PapiFlix — Watch Movies & TV Series Online' },
};

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(websiteJsonLd())} />
    <Suspense fallback={null}>
      <HomePage
        experience={papiflixExperience}
        sections={liveLibrary.ok ? liveLibrary.sections : []}
        discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      />
    </Suspense>
    </>
  );
}
