import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomePage } from '@/components/media/home-page';
import { papiflixExperience } from '@/lib/media/experience';
import { HOME_SEO_DESCRIPTION, HOME_SEO_TITLE, faqJsonLd, jsonLdScript, websiteJsonLd } from '@/lib/seo';
import { HOME_FAQS } from '@/lib/seo-content';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';
import { LoadingScreen } from '@/components/ui/loading-indicator';

export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description: HOME_SEO_DESCRIPTION,
  title: { absolute: HOME_SEO_TITLE },
  openGraph: {
    description: HOME_SEO_DESCRIPTION,
    images: [{ url: '/icons/papiflix-social-preview-v2.jpg', width: 1200, height: 630, alt: 'PapiFlix website preview' }],
    siteName: 'PapiFlix',
    title: HOME_SEO_TITLE,
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    description: HOME_SEO_DESCRIPTION,
    images: ['/icons/papiflix-social-preview-v2.jpg'],
    title: HOME_SEO_TITLE,
  },
};

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript([websiteJsonLd(), faqJsonLd(HOME_FAQS)])} />
    <Suspense fallback={<LoadingScreen label="Loading your library" />}>
      <HomePage
        experience={papiflixExperience}
        sections={liveLibrary.ok ? liveLibrary.sections : []}
        discoveryError={liveLibrary.ok ? null : liveLibrary.message}
      />
    </Suspense>
    </>
  );
}
