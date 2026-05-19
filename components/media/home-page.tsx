'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { buildWatchHref } from '@/lib/media/routes';
import type { LibraryMediaEntry, LibrarySection } from '@/lib/media/types';
import { BrowseRow } from './browse-row';
import { HeroBanner } from './hero-banner';

interface HomePageProps {
  sections: LibrarySection[];
  discoveryError: string | null;
}

function getFeaturedItems(sections: LibrarySection[]): LibraryMediaEntry[] {
  return (sections[0]?.entries ?? [])
    .filter((e) => Boolean(e.backdropUrl))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);
}

function SearchResultCard({ entry }: { entry: LibraryMediaEntry }) {
  return (
    <Link
      href={buildWatchHref(entry)}
      className="group flex gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.07]"
    >
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        {entry.posterUrl ? (
          <Image src={entry.posterUrl} alt={entry.title} fill sizes="56px" className="object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-1 font-semibold text-white">{entry.title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
          {entry.year ? <span>{entry.year}</span> : null}
          {typeof entry.rating === 'number' ? (
            <span className="text-amber-400">★ {entry.rating}</span>
          ) : null}
          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {entry.type === 'movie' ? 'Movie' : 'TV'}
          </span>
        </div>
        {entry.synopsis ? (
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{entry.synopsis}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function HomePage({ sections, discoveryError }: HomePageProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LibraryMediaEntry[]>([]);
  const [navScrolled, setNavScrolled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const isSearchPending = query.trim() !== deferredQuery;

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, []);

  // Sticky nav background on scroll
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Focus search input when overlay opens
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [searchOpen]);

  // ESC to close search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeSearch]);

  // Live search
  useEffect(() => {
    if (!deferredQuery) return;
    const controller = new AbortController();
    void fetch(`/api/media?q=${encodeURIComponent(deferredQuery)}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: LibraryMediaEntry[] } | null;
        if (!controller.signal.aborted) setSearchResults(json?.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSearchResults([]);
      });
    return () => controller.abort();
  }, [deferredQuery]);

  const featuredItems = getFeaturedItems(sections);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      {/* Sticky navbar */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          navScrolled ? 'bg-[#050505]/95 shadow-lg backdrop-blur-md' : 'bg-gradient-to-b from-black/70 to-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-12">
          <a href="/" className="select-none text-2xl font-black tracking-tight text-netflix-red">
            PapiFlix
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex">
            <a href="/" className="transition-colors hover:text-white">
              Home
            </a>
            <a href="/" className="transition-colors hover:text-white">
              Movies
            </a>
            <a href="/" className="transition-colors hover:text-white">
              TV Shows
            </a>
          </nav>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Full-screen search overlay */}
      <AnimatePresence>
        {searchOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-lg"
          >
            <div className="border-b border-white/8 px-6 py-4 md:px-12">
              <div className="mx-auto flex max-w-3xl items-center gap-4">
                <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search movies, series, or enter a numeric ID…"
                  className="flex-1 bg-transparent text-lg text-white placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="Close search"
                  className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-12">
              <div className="mx-auto max-w-3xl">
                {!deferredQuery ? (
                  <p className="mt-10 text-center text-sm text-zinc-600">
                    Type to search across movies and TV series
                  </p>
                ) : isSearchPending ? (
                  <p className="text-center text-sm text-zinc-500">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500">
                    No results for &ldquo;{deferredQuery}&rdquo;
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {searchResults.map((entry) => (
                      <SearchResultCard key={`${entry.type}:${entry.tmdbId}`} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Hero banner */}
      {featuredItems.length > 0 ? <HeroBanner items={featuredItems} /> : null}

      {/* Discovery error notice */}
      {discoveryError && sections.length === 0 ? (
        <div className="mx-auto max-w-7xl px-6 py-6 md:px-12">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
            Browse sections unavailable: {discoveryError}
          </div>
        </div>
      ) : null}

      {/* Browse rows */}
      <div className="space-y-10 py-8">
        {sections.map((section) => (
          <BrowseRow key={section.id} title={section.title} entries={section.entries} />
        ))}
      </div>

      <footer className="border-t border-white/6 px-6 py-8 text-center text-sm text-zinc-600 md:px-12">
        Metadata and artwork provided by The Movie Database.
      </footer>
    </main>
  );
}
