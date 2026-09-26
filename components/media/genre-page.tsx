'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import { consumePlaybackReturn } from '@/lib/media/playback-return';
import type { LibraryMediaEntry, MediaType } from '@/lib/media/types';
import type { GenrePage as GenrePageData, GenreSort, GenreTile } from '@/lib/tmdb/genres';

import { HeroBanner } from './hero-banner';
import { MediaDetailsModal } from './media-details-modal';

const SORT_OPTIONS: Array<{ label: string; value: GenreSort }> = [
  { label: 'Popular', value: 'popular' },
  { label: 'Top Rated', value: 'top-rated' },
  { label: 'New Releases', value: 'newest' },
];

interface GenrePageProps {
  experience: MediaExperienceConfig;
  initial: GenrePageData;
  initialSort: GenreSort;
  initialType: MediaType;
  tile: GenreTile;
}

function PosterCard({ entry, onSelect }: { entry: LibraryMediaEntry; onSelect: (entry: LibraryMediaEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="group relative aspect-[2/3] overflow-hidden rounded-md bg-zinc-900 ring-1 ring-white/5 transition duration-200 hover:z-10 hover:scale-105 hover:ring-2 hover:ring-white/80 focus-visible:z-10 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {entry.posterUrl ? (
        <Image src={entry.posterUrl} alt="" fill sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw" className="object-cover" />
      ) : null}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2 pt-8 text-left opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-2 text-xs font-bold text-white sm:text-sm">{entry.title}</span>
        <span className="mt-0.5 block text-[11px] text-zinc-400">
          {[entry.year, typeof entry.rating === 'number' ? `★ ${entry.rating}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}

export function GenrePageClient({ experience, initial, initialSort, initialType, tile }: GenrePageProps) {
  const [type, setType] = useState<MediaType>(initialType);
  const [sort, setSort] = useState<GenreSort>(initialSort);
  const [entries, setEntries] = useState(initial.entries);
  const [page, setPage] = useState(initial.page);
  const [totalPages, setTotalPages] = useState(initial.totalPages);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LibraryMediaEntry | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const hasBothTypes = Boolean(tile.movieGenreId && tile.tvGenreId);

  useEffect(() => {
    const returnEntry = consumePlaybackReturn(experience.id);
    if (!returnEntry) return;
    const id = setTimeout(() => setSelectedEntry(returnEntry), 0);
    return () => clearTimeout(id);
  }, [experience.id]);

  const load = useCallback(async (nextType: MediaType, nextSort: GenreSort, nextPage: number) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), sort: nextSort, type: nextType });
      const response = await fetch(`/api/genres/${tile.slug}?${params}`);
      const data = (await response.json()) as GenrePageData;
      if (requestId !== requestRef.current) return;
      setEntries((current) => {
        if (nextPage === 1) return data.entries;
        const seen = new Set(current.map((entry) => `${entry.type}:${entry.id}`));
        return [...current, ...data.entries.filter((entry) => !seen.has(`${entry.type}:${entry.id}`))];
      });
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch {
      // Keep what is already on screen; the sentinel retries on the next scroll.
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [tile.slug]);

  const applyFilters = useCallback((nextType: MediaType, nextSort: GenreSort) => {
    setType(nextType);
    setSort(nextSort);
    window.history.replaceState(null, '', `?type=${nextType}&sort=${nextSort}`);
    window.scrollTo({ behavior: 'smooth', top: 0 });
    void load(nextType, nextSort, 1);
  }, [load]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((items) => {
      if (items[0]?.isIntersecting && !loading && page < totalPages) void load(type, sort, page + 1);
    }, { rootMargin: '800px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load, loading, page, sort, totalPages, type]);

  const heroItems = entries.filter((entry) => entry.backdropUrl).slice(0, 5);

  return (
    <main className="min-h-dvh bg-[#050505] pb-20 text-white" data-browse-theme="cinema">
      <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/95 via-black/70 to-transparent">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-12">
          <Link
            href="/categories"
            aria-label="Back to categories"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-black tracking-tight md:text-4xl">{tile.name}</h1>

          <div className="ml-auto flex items-center gap-2">
            {hasBothTypes ? (
              <div role="tablist" aria-label="Media type" className="flex rounded-full border border-white/25 bg-black/50 p-0.5 backdrop-blur">
                {(['movie', 'tv'] as const).map((value) => (
                  <button
                    key={value}
                    role="tab"
                    type="button"
                    aria-selected={type === value}
                    onClick={() => type !== value && applyFilters(value, sort)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition sm:px-4 sm:text-sm ${type === value ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                  >
                    {value === 'movie' ? 'Movies' : 'TV Shows'}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="relative">
              <span className="sr-only">Sort titles</span>
              <select
                value={sort}
                onChange={(event) => applyFilters(type, event.target.value as GenreSort)}
                className="appearance-none rounded-sm border border-white/60 bg-black/70 py-1.5 pl-3 pr-8 text-xs font-semibold text-white backdrop-blur focus:border-white focus:outline-none sm:text-sm"
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" />
            </label>
          </div>
        </div>
      </header>

      {heroItems.length > 0 ? (
        <HeroBanner items={heroItems} onInfoSelect={setSelectedEntry} watchBasePath={experience.watchBasePath} />
      ) : (
        <div className="h-28" />
      )}

      <section className="relative mx-auto -mt-6 max-w-[1800px] px-4 md:px-12">
        <h2 className="mb-4 text-lg font-bold md:text-2xl">
          {SORT_OPTIONS.find((option) => option.value === sort)?.label} {tile.name} {type === 'movie' ? 'Movies' : 'TV Shows'}
        </h2>
        {entries.length === 0 && !loading ? (
          <p className="py-16 text-center text-zinc-500">No titles found in this genre.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {entries.map((entry) => (
              <PosterCard key={`${entry.type}:${entry.id}`} entry={entry} onSelect={setSelectedEntry} />
            ))}
          </div>
        )}
        <div ref={sentinelRef} className="flex h-20 items-center justify-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-zinc-500" /> : null}
        </div>
      </section>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={() => setSelectedEntry(null)}
        onSelectEntry={setSelectedEntry}
        preferredAnimeLanguage="sub"
        recentlyWatched={[]}
      />
    </main>
  );
}
