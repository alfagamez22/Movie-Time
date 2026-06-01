'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { PLAYER_LABELS, useAnimeLanguagePreference, usePlayerPreference } from '@/lib/hooks/use-player-preference';
import { removeRecentlyWatched, restoreHomeScrollIfRequested, saveHomeScrollPosition, useRecentlyWatched, useWatchHistorySync } from '@/lib/hooks/use-recently-watched';
import { getMediaKindLabel, type LibraryMediaEntry, type LibrarySection } from '@/lib/media/types';
import { getAuthPromptCopy, type AuthPromptReason } from '@/lib/media/user-actions';
import { AuthModal } from '@/components/auth/auth-modal';
import { UserMenu } from '@/components/auth/user-menu';
import { BrowseRow } from './browse-row';
import { HeroBanner } from './hero-banner';
import { MediaDetailsModal } from './media-details-modal';

interface HomePageProps {
  discoveryError: string | null;
  experience: MediaExperienceConfig;
  sections: LibrarySection[];
}

function getFeaturedItems(sections: LibrarySection[]): LibraryMediaEntry[] {
  return (sections[0]?.entries ?? [])
    .filter((entry) => Boolean(entry.backdropUrl ?? entry.posterUrl))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);
}

function SearchResultCard({
  entry,
  onSelect,
}: {
  entry: LibraryMediaEntry;
  onSelect: (entry: LibraryMediaEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-label={`Show details for ${entry.title}`}
      className="group flex w-full gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left shadow-[0_14px_45px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red sm:gap-4 sm:rounded-xl sm:p-4"
    >
      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 sm:h-28 sm:w-20 md:h-32 md:w-24">
        {entry.posterUrl ? (
          <Image
            src={entry.posterUrl}
            alt={entry.title}
            fill
            sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 px-2 text-center text-xs font-semibold text-zinc-500">
            {entry.title}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 text-base font-bold leading-tight text-white sm:text-lg md:text-xl">{entry.title}</p>
          <span className="hidden shrink-0 items-center gap-1 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white transition-colors group-hover:bg-white/18 sm:flex">
            <Info className="h-3.5 w-3.5" />
            Details
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          {entry.year ? <span>{entry.year}</span> : null}
          {typeof entry.rating === 'number' ? (
            <span className="text-amber-400">* {entry.rating}</span>
          ) : null}
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">
            {getMediaKindLabel(entry)}
          </span>
        </div>
        {entry.synopsis ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400 sm:line-clamp-3">{entry.synopsis}</p>
        ) : null}
      </div>
    </button>
  );
}

function PreferenceSwitcher({ experience }: { experience: MediaExperienceConfig }) {
  const { player, setPlayer } = usePlayerPreference();

  if (experience.preferenceMode === 'language') {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
      {(['1', '2', '3', '4', '5'] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => setPlayer(choice)}
          title={`Switch to ${PLAYER_LABELS[choice]}`}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            player === choice ? 'bg-netflix-red text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          P{choice}
        </button>
      ))}
    </div>
  );
}

export function HomePage({ discoveryError, experience, sections }: HomePageProps) {
  const showPlayerSwitcher = experience.preferenceMode === 'player';
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LibraryMediaEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LibraryMediaEntry | null>(null);
  const [navScrolled, setNavScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason>('default');
  const { language } = useAnimeLanguagePreference();
  const recentlyWatched = useRecentlyWatched(experience.id);
  useWatchHistorySync(experience.id, { pollIntervalMs: 60_000 });
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const isSearchPending = query.trim() !== debouncedQuery;

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
  }, []);

  const openDetails = useCallback(
    (entry: LibraryMediaEntry) => {
      closeSearch();
      setSelectedEntry(entry);
    },
    [closeSearch],
  );

  const closeDetails = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  const openAuthModal = useCallback((reason: AuthPromptReason = 'default') => {
    setAuthPromptReason(reason);
    setAuthOpen(true);
  }, []);

  const selectDetailsEntry = useCallback((entry: LibraryMediaEntry) => {
    setSelectedEntry(entry);
  }, []);

  const removeRecentEntry = useCallback(
    (entry: LibraryMediaEntry) => {
      removeRecentlyWatched(entry, experience.id, isAuthenticated);
      if (
        selectedEntry?.type === entry.type &&
        selectedEntry.id === entry.id &&
        selectedEntry.provider === entry.provider
      ) {
        setSelectedEntry(null);
      }
    },
    [experience.id, isAuthenticated, selectedEntry],
  );

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    restoreHomeScrollIfRequested(experience.id);

    let frame: number | null = null;
    const saveScroll = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        saveHomeScrollPosition(experience.id);
      });
    };

    const onPageHide = () => saveHomeScrollPosition(experience.id);

    saveScroll();
    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', saveScroll);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [experience.id]);

  useEffect(() => {
    if (!searchOpen) return;
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeoutId);
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeSearch]);

  useEffect(() => {
    if (!debouncedQuery) return;

    const controller = new AbortController();
    void fetch(`${experience.searchEndpoint}?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: LibraryMediaEntry[] } | null;
        if (!controller.signal.aborted) {
          setSearchResults(json?.data ?? []);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      });

    return () => controller.abort(new DOMException('Query changed', 'AbortError'));
  }, [debouncedQuery, experience.searchEndpoint]);

  const featuredItems = getFeaturedItems(sections);
  const authPromptCopy = getAuthPromptCopy(authPromptReason);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          navScrolled ? 'bg-[#050505]/95 shadow-lg backdrop-blur-md' : 'bg-gradient-to-b from-black/70 to-transparent'
        }`}
      >
        <div className="mx-auto max-w-7xl px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-6 md:px-12 md:py-0">
          <div className="flex items-center justify-between gap-3 md:h-16">
            <Link
              href={experience.homeHref}
              className="h-9 w-24 shrink-0 select-none bg-no-repeat sm:h-12 sm:w-36 md:h-14 md:w-44"
              aria-label={`${experience.brandName} home`}
              style={{
                backgroundImage: `url('${experience.brandBannerSrc}')`,
                backgroundPosition: experience.brandBackgroundPosition,
                backgroundSize: experience.brandBackgroundSize,
              }}
            >
              <span className="sr-only">{experience.brandName}</span>
            </Link>
            <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex">
              {experience.navLinks.map((link) => (
                <Link key={`${link.label}-${link.href}`} href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              ))}
              {isAuthenticated ? (
                <Link href="/bookmarks" className="transition-colors hover:text-white">
                  Bookmarks
                </Link>
              ) : null}
            </nav>
            <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              <div className={showPlayerSwitcher ? 'hidden md:block' : 'hidden'}>
                <PreferenceSwitcher experience={experience} />
              </div>
              <UserMenu onSignInClick={() => openAuthModal('default')} />
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Open search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>
          {showPlayerSwitcher ? (
            <div className="mt-3 flex justify-center md:hidden">
              <PreferenceSwitcher experience={experience} />
            </div>
          ) : null}
        </div>
      </header>

      <AnimatePresence>
        {searchOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] flex flex-col bg-black/95 backdrop-blur-lg"
          >
            <div className="border-b border-white/8 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:px-12">
              <div className="mx-auto flex max-w-4xl items-center gap-4">
                <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={experience.searchPlaceholder}
                  className="flex-1 bg-transparent text-base text-white placeholder:text-zinc-600 focus:outline-none sm:text-lg"
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
            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 md:px-12">
              <div className="mx-auto max-w-4xl">
                {!debouncedQuery ? (
                  <p className="mt-10 text-center text-sm text-zinc-600">{experience.emptySearchText}</p>
                ) : isSearchPending ? (
                  <p className="text-center text-sm text-zinc-500">Searching...</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500">
                    No results for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {searchResults.map((entry) => (
                      <SearchResultCard key={`${entry.provider}:${entry.type}:${entry.id}`} entry={entry} onSelect={openDetails} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {featuredItems.length > 0 ? (
        <HeroBanner
          items={featuredItems}
          onInfoSelect={openDetails}
          preferredAnimeLanguage={experience.preferenceMode === 'language' ? language : undefined}
          recentlyWatched={recentlyWatched}
          watchBasePath={experience.watchBasePath}
        />
      ) : null}

      {discoveryError && sections.length === 0 ? (
        <div className="mx-auto max-w-7xl px-6 py-6 md:px-12">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
            Browse sections unavailable: {discoveryError}
          </div>
        </div>
      ) : null}

      <div className="space-y-10 py-8">
        {recentlyWatched.length > 0 ? (
          <BrowseRow
            anchorId="recently-watched"
            key="recently-watched"
            title="Recently Watched"
            entries={recentlyWatched}
            loop={false}
            onEntryRemove={removeRecentEntry}
            onEntrySelect={openDetails}
            prioritizeLeadPoster
          />
        ) : null}
        {sections.map((section, index) => (
          <BrowseRow
            anchorId={section.id}
            key={section.id}
            title={section.title}
            entries={section.entries}
            onEntrySelect={openDetails}
            prioritizeLeadPoster={recentlyWatched.length === 0 && index === 0}
          />
        ))}
      </div>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={closeDetails}
        onSelectEntry={selectDetailsEntry}
        onSignInRequired={openAuthModal}
        preferredAnimeLanguage={experience.preferenceMode === 'language' ? language : undefined}
        recentlyWatched={recentlyWatched}
      />

      <footer className="border-t border-white/6 px-6 py-8 text-center text-sm text-zinc-600 md:px-12">
        {experience.footerText}
      </footer>

      <AnimatePresence>
        {authOpen ? (
          <AuthModal
            description={authPromptCopy.description}
            onClose={() => setAuthOpen(false)}
            title={authPromptCopy.title}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
