'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { removeRecentlyWatched, restoreHomeScrollIfRequested, saveHomeScrollPosition, useRecentlyWatched, useWatchHistorySync } from '@/lib/hooks/use-recently-watched';
import { getMediaKindLabel, type LibraryMediaEntry, type LibrarySection } from '@/lib/media/types';
import { getAuthPromptCopy, type AuthPromptReason } from '@/lib/media/user-actions';
import type { PersonSummary } from '@/lib/people/types';
import { AuthModal } from '@/components/auth/auth-modal';
import { UserMenu } from '@/components/auth/user-menu';
import { BrowseRow } from './browse-row';
import { LivePartiesRow } from '@/components/party/live-parties-row';
import { HeroBanner } from './hero-banner';
import { MatureToggle, filterMatureSections, useMatureUnlocked } from './mature-toggle';
import { MediaDetailsModal } from './media-details-modal';
import { consumePlaybackReturn } from '@/lib/media/playback-return';

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

function SearchPeopleStrip({ basePath, label, people }: { basePath: string; label: string; people: PersonSummary[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</h2>
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {people.map((person) => (
          <Link
            key={person.id}
            href={`${basePath}/${person.id}`}
            className="group flex w-24 shrink-0 flex-col items-center text-center focus-visible:outline-none sm:w-28"
          >
            <span className="relative h-20 w-20 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/10 transition group-hover:ring-white group-focus-visible:ring-white sm:h-24 sm:w-24">
              {person.profileUrl ? (
                <Image src={person.profileUrl} alt="" fill sizes="96px" className="object-cover" />
              ) : null}
            </span>
            <span className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-white group-hover:underline">{person.name}</span>
            {person.knownFor ? <span className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{person.knownFor}</span> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

function ExperienceSwitcher({ experience }: { experience: MediaExperienceConfig }) {
  const router = useRouter();

  const currentHref =
    experience.id === 'papianime' ? '/anime' : experience.id === 'papimanga' ? '/manga' : '/';

  return (
    <select
      value={currentHref}
      onChange={(event) => {
        const nextHref = event.target.value;
        if (nextHref !== currentHref) {
          router.push(nextHref);
        }
      }}
      aria-label="Switch Papi experience"
      title="Switch between PapiFlix, PapiAnime, and PapiManga"
      className="h-9 max-w-[7.75rem] touch-manipulation rounded-full border border-white/10 bg-black/60 px-3 text-xs font-semibold text-white outline-none backdrop-blur-md focus:border-white/25 focus:ring-2 focus:ring-white/70"
    >
      <option value="/" className="bg-[#111] text-white">PapiFlix</option>
      <option value="/anime" className="bg-[#111] text-white">PapiAnime</option>
      <option value="/manga" className="bg-[#111] text-white">PapiManga</option>
    </select>
  );
}

export function HomePage({ discoveryError, experience, sections }: HomePageProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LibraryMediaEntry[]>([]);
  const [searchPeople, setSearchPeople] = useState<PersonSummary[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LibraryMediaEntry | null>(null);
  const [navScrolled, setNavScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<AuthPromptReason>('default');
  const recentlyWatched = useRecentlyWatched(experience.id);
  useWatchHistorySync(experience.id, { pollIntervalMs: 60_000 });
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const isSearchPending = query.trim() !== debouncedQuery;

  useEffect(() => {
    const returnEntry = consumePlaybackReturn(experience.id);
    if (!returnEntry) return;
    const id = setTimeout(() => setSelectedEntry(returnEntry), 0);
    return () => clearTimeout(id);
  }, [experience.id]);

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
    const params = new URLSearchParams({ q: debouncedQuery });

    void fetch(`${experience.searchEndpoint}?${params.toString()}`, { signal: controller.signal })
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

    if (experience.peopleSource) {
      const peopleParams = new URLSearchParams({ q: debouncedQuery, source: experience.peopleSource });
      void fetch(`/api/people?${peopleParams.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as { people?: PersonSummary[] } | null;
          if (!controller.signal.aborted) setSearchPeople(json?.people ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchPeople([]);
        });
    }

    return () => controller.abort(new DOMException('Query changed', 'AbortError'));
  }, [debouncedQuery, experience.searchEndpoint, experience.id, experience.peopleSource]);

  const featuredItems = getFeaturedItems(sections);
  const authPromptCopy = getAuthPromptCopy(authPromptReason);
  const matureUnlocked = useMatureUnlocked();

  const visibleSections = useMemo(
    () => experience.id === 'papiflix' ? filterMatureSections(sections, matureUnlocked) : sections,
    [experience.id, matureUnlocked, sections],
  );

  return (
    <main className="min-h-screen bg-[#050505] text-white" data-browse-theme={experience.id === 'papimanga' ? undefined : 'cinema'}>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          navScrolled ? 'bg-[#050505]/95 shadow-lg backdrop-blur-md' : 'bg-gradient-to-b from-black/70 to-transparent'
        }`}
      >
        <div className="safe-page-x mx-auto max-w-7xl pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:py-0">
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
              {experience.id === 'papiflix' ? (
                <Link href="/categories" className="transition-colors hover:text-white">
                  Categories
                </Link>
              ) : null}
              {isAuthenticated ? (
                <Link href="/bookmarks" className="transition-colors hover:text-white">
                  Bookmarks
                </Link>
              ) : null}
            </nav>
            <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              {experience.id === 'papiflix' ? (
                <div className="hidden md:block">
                  <MatureToggle />
                </div>
              ) : null}
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:hidden">
            <ExperienceSwitcher experience={experience} />
            {experience.id === 'papiflix' ? <MatureToggle /> : null}
          </div>
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
            <div className="safe-page-x border-b border-white/8 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
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
            <div className="safe-page-x flex-1 overflow-y-auto py-5 sm:py-6">
              <div className="mx-auto max-w-4xl">
                {!debouncedQuery ? (
                  <p className="mt-10 text-center text-sm text-zinc-400">{experience.emptySearchText}</p>
                ) : isSearchPending ? (
                  <p className="text-center text-sm text-zinc-500">Searching...</p>
                ) : searchResults.length === 0 && searchPeople.length === 0 ? (
                  <p className="text-center text-sm text-zinc-500">
                    No results for &ldquo;{debouncedQuery}&rdquo;
                  </p>
                ) : (
                  <>
                    {searchPeople.length > 0 && experience.personBasePath ? (
                      <SearchPeopleStrip
                        basePath={experience.personBasePath}
                        label={experience.peopleSource === 'anilist' ? 'Voice Actors' : 'Cast & Crew'}
                        people={searchPeople}
                      />
                    ) : null}
                    {searchResults.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {searchPeople.length > 0 ? (
                          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Titles</h2>
                        ) : null}
                        {searchResults.map((entry) => (
                          <SearchResultCard key={`${entry.provider}:${entry.type}:${entry.id}`} entry={entry} onSelect={openDetails} />
                        ))}
                      </div>
                    ) : null}
                  </>
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

      <div className="browse-shelves space-y-10 py-8">
        {experience.id === 'papiflix' || experience.id === 'papianime' ? <LivePartiesRow experience={experience.id} /> : null}
        {recentlyWatched.length > 0 ? (
          <BrowseRow
            cinematic={experience.id !== 'papimanga'}
            anchorId="recently-watched"
            key="recently-watched"
            title={experience.id === 'papimanga' ? 'Recently Read' : 'Recently Watched'}
            entries={recentlyWatched}
            loop={false}
            onEntryRemove={removeRecentEntry}
            onEntrySelect={openDetails}
            prioritizeLeadPoster
          />
        ) : null}
        {visibleSections.map((section, index) => (
          <BrowseRow
            cinematic={experience.id !== 'papimanga'}
            anchorId={section.id}
            key={section.id}
            title={section.title}
            entries={section.entries}
            onEntrySelect={openDetails}
            prioritizeLeadPoster={index === 0}
          />
        ))}
      </div>

      <MediaDetailsModal
        entry={selectedEntry}
        experience={experience}
        onClose={closeDetails}
        onSelectEntry={selectDetailsEntry}
        onSignInRequired={openAuthModal}
        recentlyWatched={recentlyWatched}
      />

      <footer className="border-t border-white/6 px-6 py-8 text-center text-sm text-zinc-400 md:px-12">
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
