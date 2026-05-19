'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { ArrowRight, Play, Search, Sparkles, Star } from 'lucide-react';
import { motion } from 'motion/react';

import { buildWatchHref } from '@/lib/media/routes';
import type { BrowseMediaType, LibraryMediaEntry } from '@/lib/media/types';

interface HomePageProps {
  discoverEntries: LibraryMediaEntry[];
  discoveryError: string | null;
  featured: LibraryMediaEntry | null;
}

interface SearchState {
  entries: LibraryMediaEntry[];
  error: string | null;
  key: string;
  totalResults: number;
}

const FILTERS: Array<{ label: string; value: BrowseMediaType }> = [
  { label: 'All', value: 'all' },
  { label: 'Movies', value: 'movie' },
  { label: 'Series', value: 'tv' },
];

function formatVoteCount(value: number | undefined): string | null {
  if (typeof value !== 'number' || value < 1) {
    return null;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k votes`;
  }

  return `${value} votes`;
}

function MediaCard({ entry, priority = false }: { entry: LibraryMediaEntry; priority?: boolean }) {
  const voteCountLabel = formatVoteCount(entry.voteCount);

  return (
    <Link
      href={buildWatchHref(entry)}
      className="group relative block overflow-hidden rounded-[1.65rem] border border-white/10 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.36),rgba(255,255,255,0.03)_50%,transparent_78%)]">
        {entry.backdropUrl || entry.posterUrl ? (
          <Image
            src={entry.backdropUrl ?? entry.posterUrl ?? ''}
            alt={entry.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 92vw, (max-width: 1280px) 45vw, 24vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#070707]/35 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-zinc-200 backdrop-blur-xl">
          {entry.type === 'movie' ? 'Movie' : 'Series'}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-1 text-lg font-semibold text-white">{entry.title}</h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-zinc-400">
            {entry.synopsis || 'Open this title in the native player and keep full control of playback.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
          {entry.year ? <span>{entry.year}</span> : null}
          {typeof entry.rating === 'number' ? (
            <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-zinc-200">
              <Star className="h-3.5 w-3.5 fill-current text-amber-300" />
              {entry.rating}
            </span>
          ) : null}
          {voteCountLabel ? <span>{voteCountLabel}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function HomePage({ discoverEntries, discoveryError, featured }: HomePageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BrowseMediaType>('all');
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const activeSearchKey = `${filter}:${deferredQuery}`;

  useEffect(() => {
    if (!deferredQuery) {
      return;
    }

    const abortController = new AbortController();
    const searchParams = new URLSearchParams({
      q: deferredQuery,
    });

    if (filter !== 'all') {
      searchParams.set('type', filter);
    }

    void fetch(`/api/media?${searchParams.toString()}`, {
      signal: abortController.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | {
              data?: LibraryMediaEntry[];
              error?: string;
              totalResults?: number;
            }
          | null;

        if (abortController.signal.aborted) {
          return;
        }

        setSearchState({
          entries: payload?.data ?? [],
          error: payload?.error ?? (response.ok ? null : 'Unable to search the live library right now.'),
          key: activeSearchKey,
          totalResults: payload?.totalResults ?? payload?.data?.length ?? 0,
        });
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }

        setSearchState({
          entries: [],
          error: 'Unable to reach the search route right now.',
          key: activeSearchKey,
          totalResults: 0,
        });
      });

    return () => {
      abortController.abort();
    };
  }, [activeSearchKey, deferredQuery, filter]);

  const searchResults = searchState?.key === activeSearchKey ? searchState.entries : [];
  const searchError = searchState?.key === activeSearchKey ? searchState.error : null;
  const totalResults = searchState?.key === activeSearchKey ? searchState.totalResults : 0;
  const isSearchLoading = Boolean(deferredQuery) && searchState?.key !== activeSearchKey;
  const activeFeatured = searchResults[0] ?? featured ?? discoverEntries[0] ?? null;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="relative isolate overflow-hidden border-b border-white/6">
        <div className="absolute inset-0">
          {activeFeatured?.backdropUrl || activeFeatured?.posterUrl ? (
            <Image
              src={activeFeatured.backdropUrl ?? activeFeatured.posterUrl ?? ''}
              alt={activeFeatured.title}
              fill
              priority
              sizes="100vw"
              className="object-cover opacity-40"
            />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.28),transparent_32%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#050505]/76 to-[#050505]" />
          <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(4,4,4,0.92)_20%,rgba(4,4,4,0.62)_52%,rgba(4,4,4,0.92)_100%)]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative z-10 mx-auto flex min-h-[42rem] w-full max-w-7xl flex-col px-5 pb-10 pt-6 md:px-8 md:pt-8"
        >
          <header className="flex flex-col gap-5 border-b border-white/8 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-400">
                Search, Open, Watch
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">
                Movie DB
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-300">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
                Search by title or numeric ID
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
                Movies and TV series
              </span>
            </div>
          </header>

          <div className="grid flex-1 items-end gap-10 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:py-14">
            <div className="max-w-3xl space-y-6">
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-200 backdrop-blur-xl">
                  <Sparkles className="h-3.5 w-3.5 text-netflix-red" />
                  {deferredQuery ? 'Search Focus' : 'Live Discovery'}
                </p>
                <h2 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">
                  {activeFeatured?.title ?? 'Search a movie or series and launch it instantly.'}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-zinc-300 md:text-base">
                  {activeFeatured?.synopsis ||
                    'Jump straight into a title, switch sources, pick subtitles, and keep the player entirely under local control.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                {activeFeatured?.year ? (
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2">
                    {activeFeatured.year}
                  </span>
                ) : null}
                {typeof activeFeatured?.rating === 'number' ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2">
                    <Star className="h-4 w-4 fill-current text-amber-300" />
                    {activeFeatured.rating} / 10
                  </span>
                ) : null}
                {activeFeatured ? (
                  <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 uppercase tracking-[0.24em]">
                    {activeFeatured.type === 'movie' ? 'Movie' : 'TV series'}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                {activeFeatured ? (
                  <Link
                    href={buildWatchHref(activeFeatured)}
                    className="inline-flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.22em] text-black transition-transform hover:-translate-y-0.5"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play Now
                  </Link>
                ) : null}
                <a
                  href="#library"
                  className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-xl transition-colors hover:bg-white/10"
                >
                  Explore Titles
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="glass rounded-[2rem] p-5 md:p-6">
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-400">
                    Search the catalog
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Use a title like <span className="font-semibold text-white">The Boys</span> or paste a numeric ID.
                  </p>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search titles or enter a numeric ID"
                    className="input-glass w-full rounded-2xl py-4 pl-12 pr-4 text-sm text-white"
                    title="Search titles or enter a numeric ID"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((filterOption) => (
                    <button
                      key={filterOption.value}
                      type="button"
                      onClick={() => setFilter(filterOption.value)}
                      className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] transition-all ${
                        filter === filterOption.value
                          ? 'bg-netflix-red text-white shadow-lg shadow-red-950/25'
                          : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      {filterOption.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Current Mode</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {filter === 'all' ? 'Mixed search' : filter === 'movie' ? 'Movies only' : 'Series only'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Search results open on a clean title route while the numeric identifier stays in the query for exact lookup.
                  </p>
                </div>

                {discoveryError && !discoverEntries.length && (
                  <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-400/6 p-4 text-sm leading-relaxed text-amber-100">
                    Featured rows are unavailable right now, but direct search still works.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="library" className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 md:px-8 md:py-12">
        {deferredQuery ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">Search Results</p>
                <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
                  {isSearchLoading ? 'Searching...' : `${searchResults.length} visible results`}
                </h3>
                <p className="mt-2 text-sm text-zinc-400">
                  {totalResults > searchResults.length
                    ? `Showing the top ${searchResults.length} matches for "${deferredQuery}".`
                    : `Results for "${deferredQuery}".`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setQuery('')}
                className="w-fit rounded-full border border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
              >
                Clear Search
              </button>
            </div>

            {searchError && (
              <div className="rounded-[1.5rem] border border-amber-400/20 bg-amber-400/6 p-4 text-sm leading-relaxed text-amber-100">
                {searchError}
              </div>
            )}

            {isSearchLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={`search-skeleton-${index + 1}`}
                    className="overflow-hidden rounded-[1.65rem] border border-white/8 bg-white/[0.03]"
                  >
                    <div className="aspect-[16/10] animate-pulse bg-white/[0.06]" />
                    <div className="space-y-3 p-4">
                      <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[0.06]" />
                      <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.05]" />
                      <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/[0.05]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {searchResults.map((entry, index) => (
                  <MediaCard key={`${entry.type}:${entry.tmdbId}`} entry={entry} priority={index < 2} />
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-white/8 bg-white/[0.02] p-8 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">No Matches</p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
                  Nothing matched this search yet.
                </h3>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
                  Try a broader title, switch between movies and series, or paste the exact numeric identifier for a direct hit.
                </p>
              </div>
            )}
          </div>
        ) : discoverEntries.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">Start Watching</p>
                <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
                  Fresh titles ready to open
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                  Pick any live title below or use the search box above to jump directly into a specific movie or series.
                </p>
              </div>
              <p className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-zinc-400">
                {discoverEntries.length} titles loaded
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {discoverEntries.map((entry, index) => (
                <MediaCard key={`${entry.type}:${entry.tmdbId}`} entry={entry} priority={index < 2} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-white/8 bg-white/[0.02] p-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-zinc-500">Library Unavailable</p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">
              Featured titles could not be loaded right now.
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Search is still available above. Try a specific title or numeric identifier to open a watch page directly.
            </p>
          </div>
        )}
      </section>

      <footer className="border-t border-white/6 px-5 py-8 text-center text-sm text-zinc-500 md:px-8">
        Metadata and artwork provided by The Movie Database.
      </footer>
    </main>
  );
}
