'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Lock, Sparkles } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import type {
  LibrarySection,
  LibrarySectionCategory,
  LibrarySectionTier,
} from '@/lib/media/types';

import { BrowseRow } from './browse-row';
import { MediaDetailsModal } from './media-details-modal';
import { isMatureSection, MatureToggle, useMatureUnlocked } from './mature-toggle';

const CATEGORY_ORDER: LibrarySectionCategory[] = [
  'trending',
  'discover',
  'regional',
  'genre',
  'rating',
  'mature',
];

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

function fallbackCategory(section: LibrarySection): LibrarySectionCategory {
  if (isMatureSection(section)) return 'mature';
  return 'discover';
}

function groupSectionsByCategory(sections: LibrarySection[]) {
  const grouped = new Map<LibrarySectionCategory, LibrarySection[]>();
  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }
  for (const section of sections) {
    const category = section.category ?? fallbackCategory(section);
    grouped.get(category)?.push(section);
  }
  return grouped;
}

function tierOrder(tier: LibrarySectionTier | undefined): number {
  return tier === 'mature' ? 1 : 0;
}

interface BaseProps {
  description?: string;
  discoveryError: string | null;
  experience: MediaExperienceConfig;
  label?: string;
  sections: LibrarySection[];
}

function CategoryNav({ experience }: { experience: MediaExperienceConfig }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[#050505]/95 shadow-lg backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 md:px-12 md:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={experience.homeHref}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Back to home"
            title="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link
            href={experience.homeHref}
            className="truncate text-sm font-semibold text-white sm:text-base"
          >
            Categories
          </Link>
        </div>
        <MatureToggle />
      </div>
    </header>
  );
}

function CategoryCard({
  category,
  count,
  isMature,
  label,
  description,
}: {
  category: LibrarySectionCategory;
  count: number;
  isMature: boolean;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={`/categories/${category}`}
      className={`group relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-2xl border p-5 transition-all sm:p-6 ${
        isMature
          ? 'border-netflix-red/30 bg-gradient-to-br from-netflix-red/20 via-black to-black hover:border-netflix-red/60'
          : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          {isMature ? <Lock className="h-4 w-4 text-netflix-red" /> : <Sparkles className="h-4 w-4 text-amber-300" />}
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {count} {count === 1 ? 'row' : 'rows'}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{label}</h2>
        <p className="mt-2 line-clamp-3 text-sm text-zinc-300">{description}</p>
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white/80 group-hover:text-white">
        Browse
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function CategoriesPage({ description: _description, discoveryError, experience, sections }: BaseProps) {
  const matureUnlocked = useMatureUnlocked();
  const [selectedEntry, setSelectedEntry] = useState<typeof sections[number]['entries'][number] | null>(null);
  const grouped = useMemo(() => groupSectionsByCategory(sections), [sections]);

  const openDetails = useCallback((entry: typeof sections[number]['entries'][number]) => {
    setSelectedEntry(entry);
  }, []);
  const closeDetails = useCallback(() => setSelectedEntry(null), []);

  return (
    <main className="min-h-screen bg-[#050505] pb-16 pt-[calc(env(safe-area-inset-top)+5rem)] text-white">
      <CategoryNav experience={experience} />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Browse by Category</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Every PapiFlix section grouped into categories. Tap a card to drill in. Vivamax rows stay
            hidden until you opt in.
          </p>
        </div>

        {discoveryError && sections.length === 0 ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
            Categories unavailable: {discoveryError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_ORDER.map((category) => {
            const categorySections = grouped.get(category) ?? [];
            if (categorySections.length === 0) return null;
            const isMature = category === 'mature';
            return (
              <CategoryCard
                key={category}
                category={category}
                count={categorySections.length}
                isMature={isMature}
                label={CATEGORY_LABELS[category]}
                description={CATEGORY_DESCRIPTIONS[category]}
              />
            );
          })}
        </div>
      </section>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={closeDetails}
        onSelectEntry={(entry) => setSelectedEntry(entry)}
        onSignInRequired={() => {}}
        preferredAnimeLanguage="sub"
        recentlyWatched={[]}
      />
    </main>
  );
}

export function CategoryDetailPage({
  category,
  description,
  discoveryError,
  experience,
  label,
  sections,
}: BaseProps & { category: LibrarySectionCategory; label: string }) {
  const matureUnlocked = useMatureUnlocked();
  const [selectedEntry, setSelectedEntry] = useState<typeof sections[number]['entries'][number] | null>(null);
  const openDetails = useCallback((entry: typeof sections[number]['entries'][number]) => {
    setSelectedEntry(entry);
  }, []);
  const closeDetails = useCallback(() => setSelectedEntry(null), []);

  const isMature = category === 'mature';
  const visibleSections = useMemo(() => {
    const sorted = sections.slice().sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier));
    if (!isMature) {
      return sorted.filter((section) => !isMatureSection(section));
    }
    return sorted;
  }, [isMature, sections]);

  const locked = isMature && !matureUnlocked;

  return (
    <main className="min-h-screen bg-[#050505] pb-16 pt-[calc(env(safe-area-inset-top)+5rem)] text-white">
      <CategoryNav experience={experience} />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 md:px-12">
        <div className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
          <Link href="/categories" className="transition-colors hover:text-white">
            Categories
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-zinc-300">{label}</span>
        </div>
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{label}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">{description}</p>
        </div>

        {discoveryError && visibleSections.length === 0 ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
            Categories unavailable: {discoveryError}
          </div>
        ) : null}

        {locked ? (
          <div className="rounded-2xl border border-netflix-red/30 bg-netflix-red/5 p-6 text-center">
            <Lock className="mx-auto h-8 w-8 text-netflix-red" />
            <h2 className="mt-3 text-xl font-bold text-white">Vivamax rows are hidden</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Unlock Vivamax sections to see Vivamax and similar mature Filipino movie rows.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Use the Vivamax pill in the top-right corner to opt in.
            </p>
          </div>
        ) : (
          <div className="space-y-10 py-4">
            {visibleSections.map((section, index) => (
              <BrowseRow
                anchorId={`${category}-${section.id}`}
                key={section.id}
                title={section.title}
                entries={section.entries}
                onEntrySelect={openDetails}
                prioritizeLeadPoster={index === 0}
              />
            ))}
          </div>
        )}
      </section>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={closeDetails}
        onSelectEntry={(entry) => setSelectedEntry(entry)}
        onSignInRequired={() => {}}
        preferredAnimeLanguage="sub"
        recentlyWatched={[]}
      />
    </main>
  );
}
