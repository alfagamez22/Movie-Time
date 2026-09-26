'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Lock } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import type { GenreTile } from '@/lib/tmdb/genres';
import { consumePlaybackReturn } from '@/lib/media/playback-return';
import type {
  LibrarySection,
  LibrarySectionCategory,
  LibrarySectionTier,
} from '@/lib/media/types';

import { BrowseRow } from './browse-row';
import { MediaDetailsModal } from './media-details-modal';
import { isMatureSection, useMatureUnlocked } from './mature-toggle';

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

const FILIPINO_SECTION_ID = 'filipino-movies';
const VIVAMAX_SECTION_ID = 'vivamax-movies';

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
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 md:px-12 md:py-0">
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
      </div>
    </header>
  );
}

type GenreFilter = 'all' | 'movie' | 'tv';

function CollectionTile({
  backdropUrl,
  category,
  count,
  description,
  isMature,
  label,
}: {
  backdropUrl?: string;
  category: LibrarySectionCategory;
  count: number;
  description: string;
  isMature: boolean;
  label: string;
}) {
  return (
    <Link
      href={`/categories/${category}`}
      className="category-tile group relative flex aspect-[16/9] overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 transition duration-200 hover:scale-[1.03] hover:ring-2 hover:ring-white/80 focus-visible:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {backdropUrl ? (
        <Image src={backdropUrl} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover opacity-70 transition duration-300 group-hover:opacity-90" />
      ) : null}
      <div className={`absolute inset-0 ${isMature ? 'bg-gradient-to-t from-black via-netflix-red/25 to-black/10' : 'bg-gradient-to-t from-black via-black/40 to-transparent'}`} />
      <div className="relative mt-auto w-full p-3 sm:p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
          {isMature ? <span className="rounded-sm bg-netflix-red px-1 py-px text-[9px] font-black tracking-[0.15em] text-white">VMX</span> : null}
          {count} {count === 1 ? 'row' : 'rows'}
        </p>
        <h3 className="mt-1 text-lg font-black leading-tight text-white drop-shadow sm:text-xl">{label}</h3>
        <p className="mt-1 hidden text-xs text-zinc-300 sm:line-clamp-1">{description}</p>
      </div>
    </Link>
  );
}

function GenreTileCard({ filter, tile }: { filter: GenreFilter; tile: GenreTile }) {
  const type = filter === 'all' ? (tile.movieGenreId ? 'movie' : 'tv') : filter;
  return (
    <Link
      href={`/categories/genres/${tile.slug}?type=${type}`}
      className="category-tile group relative flex aspect-[16/9] overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 transition duration-200 hover:scale-[1.03] hover:ring-2 hover:ring-white/80 focus-visible:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {tile.backdropUrl ? (
        <Image src={tile.backdropUrl} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-cover transition duration-300 group-hover:scale-105" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
      <h3 className="relative mt-auto p-3 text-base font-black leading-tight tracking-tight text-white drop-shadow-lg sm:p-4 sm:text-xl">{tile.name}</h3>
    </Link>
  );
}

const GENRE_FILTERS: Array<{ label: string; value: GenreFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Movies', value: 'movie' },
  { label: 'TV Shows', value: 'tv' },
];

export function CategoriesPage({ discoveryError, experience, genres, sections }: BaseProps & { genres: GenreTile[] }) {
  const matureUnlocked = useMatureUnlocked();
  const [filter, setFilter] = useState<GenreFilter>('all');
  const grouped = useMemo(() => groupSectionsByCategory(sections), [sections]);
  const visibleGenres = useMemo(
    () => genres.filter((tile) => filter === 'all' || (filter === 'movie' ? tile.movieGenreId : tile.tvGenreId)),
    [filter, genres],
  );

  return (
    <main className="min-h-screen bg-[#050505] pb-16 pt-[calc(env(safe-area-inset-top)+5rem)] text-white">
      <CategoryNav experience={experience} />

      <section className="mx-auto max-w-[1800px] px-4 sm:px-6 md:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Browse</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">Pick a genre to explore every movie and series in it.</p>
          </div>
          <div role="tablist" aria-label="Filter genres" className="flex gap-2">
            {GENRE_FILTERS.map((option) => (
              <button
                key={option.value}
                role="tab"
                type="button"
                aria-selected={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  filter === option.value ? 'border-white bg-white text-black' : 'border-white/30 text-white hover:border-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {discoveryError && sections.length === 0 && genres.length === 0 ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
            Categories unavailable: {discoveryError}
          </div>
        ) : null}

        <h2 className="mb-3 text-lg font-bold sm:text-xl">Genres</h2>
        <div className="category-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {visibleGenres.map((tile) => (
            <GenreTileCard key={tile.slug} tile={tile} filter={filter} />
          ))}
        </div>

        {filter === 'all' ? (
          <>
            <h2 className="mb-3 mt-12 text-lg font-bold sm:text-xl">Collections</h2>
            <div className="category-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {CATEGORY_ORDER.map((category) => {
                const categorySections = grouped.get(category) ?? [];
                if (categorySections.length === 0) return null;
                if (category === 'mature' && !matureUnlocked) return null;
                return (
                  <CollectionTile
                    key={category}
                    backdropUrl={categorySections.flatMap((section) => section.entries).find((entry) => entry.backdropUrl)?.backdropUrl}
                    category={category}
                    count={categorySections.length}
                    description={CATEGORY_DESCRIPTIONS[category]}
                    isMature={category === 'mature'}
                    label={CATEGORY_LABELS[category]}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </section>
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
  useEffect(() => {
    const returnEntry = consumePlaybackReturn(experience.id);
    if (!returnEntry) return;
    const id = setTimeout(() => setSelectedEntry(returnEntry), 0);
    return () => clearTimeout(id);
  }, [experience.id]);
  const openDetails = useCallback((entry: typeof sections[number]['entries'][number]) => {
    setSelectedEntry(entry);
  }, []);
  const closeDetails = useCallback(() => setSelectedEntry(null), []);

  const isMature = category === 'mature';
  const visibleSections = useMemo(() => {
    const sorted = sections.slice().sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier));
    if (isMature) return sorted;

    const general = sorted.filter((section) => !isMatureSection(section));
    const vivamax = sorted.find((section) => section.id === VIVAMAX_SECTION_ID);
    if (!matureUnlocked || !vivamax) return general;

    return general.map((section) => {
      if (section.id !== FILIPINO_SECTION_ID) return section;
      const seen = new Set(section.entries.map((entry) => `${entry.type}:${entry.id}`));
      const extra = vivamax.entries.filter((entry) => !seen.has(`${entry.type}:${entry.id}`));
      const mixed: typeof section.entries = [];
      for (let index = 0; index < Math.max(section.entries.length, extra.length); index += 1) {
        if (section.entries[index]) mixed.push(section.entries[index]);
        if (extra[index]) mixed.push(extra[index]);
      }
      return { ...section, entries: mixed, title: 'Filipino Movies & Vivamax' };
    });
  }, [isMature, matureUnlocked, sections]);

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
              Turn on VMX from the PapiFlix home page to see Vivamax and similar mature Filipino movie rows.
            </p>
            <Link href="/" className="mt-4 inline-flex rounded-md bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200">
              Go to home
            </Link>
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
