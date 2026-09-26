import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CategoryDetailPage } from '@/components/media/categories-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';
import type { LibrarySectionCategory } from '@/lib/media/types';

export const revalidate = 3600;

const CATEGORY_LABELS: Record<LibrarySectionCategory, string> = {
  discover: 'Discover',
  genre: 'Genres',
  mature: 'Vivamax',
  rating: 'Top Rated & Trending',
  regional: 'Regional',
  trending: 'Trending',
};

const CATEGORY_DESCRIPTIONS: Record<LibrarySectionCategory, string> = {
  discover: 'Headline picks for movies and TV series across the PapiFlix catalog.',
  genre: 'Drill into your favorite movie genres — action, sci-fi, horror, and more.',
  mature: 'Vivamax and similar mature Filipino movie rows. Hidden until you opt in.',
  rating: 'Highest-rated and most-watched titles by audience demand.',
  regional: 'Local and international cinema organized by language and country.',
  trending: 'What is hot on TMDB right now.',
};

export async function generateStaticParams() {
  return Object.keys(CATEGORY_LABELS).map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) return { title: 'Category' };
  return {
    description: CATEGORY_DESCRIPTIONS[category],
    title: `${CATEGORY_LABELS[category]} | Categories`,
  };
}

function isCategory(value: string): value is LibrarySectionCategory {
  return value in CATEGORY_LABELS;
}

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) {
    notFound();
  }

  const liveLibrary = await getTmdbLibrarySections();
  const allSections = liveLibrary.ok ? liveLibrary.sections : [];
  // Regional also receives the Vivamax row so it can be blended into Filipino Movies once VMX is on.
  const filtered = allSections.filter((section) => {
    const sectionCategory = section.category ?? 'discover';
    return sectionCategory === category || (category === 'regional' && section.id === 'vivamax-movies');
  });

  return (
    <CategoryDetailPage
      category={category}
      experience={papiflixExperience}
      sections={filtered}
      description={CATEGORY_DESCRIPTIONS[category]}
      label={CATEGORY_LABELS[category]}
      discoveryError={liveLibrary.ok ? null : liveLibrary.message}
    />
  );
}

export const dynamicParams = false;
