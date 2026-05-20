'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { buildWatchHref, buildWatchSlug } from '@/lib/media/routes';
import type { LibraryMediaEntry, MediaCastMember, MediaDetailsPayload } from '@/lib/media/types';

interface MediaDetailsModalProps {
  entry: LibraryMediaEntry | null;
  onClose: () => void;
  onSelectEntry: (entry: LibraryMediaEntry) => void;
}

interface DetailsResponse {
  data?: MediaDetailsPayload;
  error?: string;
}

interface ResumeMediaEntry extends LibraryMediaEntry {
  episode?: string;
  progressSeconds?: number;
  season?: string;
}

interface DetailsErrorState {
  key: string;
  message: string;
}

function CastList({ cast, isLoading }: { cast: MediaCastMember[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading cast...</p>;
  }

  if (cast.length === 0) {
    return <p className="text-sm text-zinc-500">Cast details unavailable.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {cast.map((member) => (
        <div key={`${member.id ?? member.name}-${member.character ?? 'cast'}`} className="min-w-0">
          <div className="relative mb-2 aspect-[2/3] overflow-hidden rounded-md bg-zinc-900">
            {member.profileUrl ? (
              <Image src={member.profileUrl} alt={member.name} fill sizes="120px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-zinc-600">
                {member.name}
              </div>
            )}
          </div>
          <p className="line-clamp-1 text-xs font-semibold text-white">{member.name}</p>
          {member.character ? <p className="line-clamp-1 text-[11px] text-zinc-500">{member.character}</p> : null}
        </div>
      ))}
    </div>
  );
}

function RecommendationCarousel({
  entries,
  isLoading,
  onSelectEntry,
  title,
}: {
  entries: LibraryMediaEntry[];
  isLoading: boolean;
  onSelectEntry: (entry: LibraryMediaEntry) => void;
  title: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.85 : el.clientWidth * 0.85, behavior: 'smooth' });
  }, []);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const el = rowRef.current;
    if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    el.scrollLeft += event.deltaY;
  }, []);

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading recommendations...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No recommendations available.</p>;
  }

  return (
    <div className="group/recs relative">
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label={`Scroll ${title} recommendations left`}
        className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center bg-gradient-to-r from-[#111] to-transparent opacity-0 transition-opacity group-hover/recs:opacity-100"
      >
        <ChevronLeft className="h-6 w-6 text-white" />
      </button>

      <div ref={rowRef} onWheel={onWheel} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {entries.map((item) => (
          <button
            key={`${item.type}:${item.tmdbId}`}
            type="button"
            onClick={() => onSelectEntry(item)}
            className="group/item w-[clamp(7.5rem,12vw,10rem)] shrink-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-zinc-900">
              {item.posterUrl ? (
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  sizes="160px"
                  className="object-cover transition-transform duration-300 group-hover/item:scale-[1.06]"
                />
              ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight text-white">{item.title}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
              {item.type === 'movie' ? 'Movie' : 'TV'}
              {item.year ? ` / ${item.year}` : ''}
            </p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label={`Scroll ${title} recommendations right`}
        className="absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-center bg-gradient-to-l from-[#111] to-transparent opacity-0 transition-opacity group-hover/recs:opacity-100"
      >
        <ChevronRight className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}

export function MediaDetailsModal({ entry, onClose, onSelectEntry }: MediaDetailsModalProps) {
  const [details, setDetails] = useState<MediaDetailsPayload | null>(null);
  const [error, setError] = useState<DetailsErrorState | null>(null);

  useEffect(() => {
    if (!entry) return;

    const controller = new AbortController();
    const requestKey = `${entry.type}:${entry.tmdbId}`;
    const slug = buildWatchSlug(entry.title, entry.tmdbId);
    const searchParams = new URLSearchParams({
      id: entry.tmdbId,
      type: entry.type,
    });

    void fetch(`/api/media/${encodeURIComponent(slug)}/details?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as DetailsResponse | null;
        if (controller.signal.aborted) return;
        if (!res.ok || !json?.data) {
          throw new Error(json?.error ?? 'Could not load details.');
        }

        setDetails(json.data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError({
            key: requestKey,
            message: err instanceof Error ? err.message : 'Could not load details.',
          });
        }
      });

    return () => controller.abort(new DOMException('Details request changed', 'AbortError'));
  }, [entry]);

  useEffect(() => {
    if (!entry) return;

    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [entry, onClose]);

  const selectRecommendation = useCallback(
    (nextEntry: LibraryMediaEntry) => {
      onSelectEntry(nextEntry);
    },
    [onSelectEntry],
  );

  const selectedKey = entry ? `${entry.type}:${entry.tmdbId}` : null;
  const detailsKey = details ? `${details.entry.type}:${details.entry.tmdbId}` : null;
  const activeDetails = selectedKey === detailsKey ? details : null;
  const activeError = error?.key === selectedKey ? error.message : null;
  const isLoading = Boolean(entry && !activeDetails && !activeError);
  const displayEntry = activeDetails?.entry ?? entry;
  const cast = activeDetails?.cast ?? [];
  const recommendations = activeDetails?.recommendations ?? [];
  const backdropUrl = displayEntry?.backdropUrl ?? entry?.backdropUrl;
  const posterUrl = displayEntry?.posterUrl ?? entry?.posterUrl;
  const resumeEntry = entry as ResumeMediaEntry | null;
  const playHref = displayEntry
    ? buildWatchHref(displayEntry, {
        episode: resumeEntry?.type === 'tv' ? resumeEntry.episode : undefined,
        progress: resumeEntry?.progressSeconds,
        season: resumeEntry?.type === 'tv' ? resumeEntry.season : undefined,
      })
    : '#';

  return (
    <AnimatePresence>
      {entry && displayEntry ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-stretch justify-stretch bg-black/85 p-0 text-white backdrop-blur-md sm:items-center sm:justify-center sm:px-3 sm:py-6 md:px-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${displayEntry.title} details`}
            className="thin-scrollbar relative h-[100dvh] max-h-[100dvh] w-full overflow-y-auto border-white/10 bg-[#111] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-xl sm:border"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="absolute right-[calc(env(safe-area-inset-right)+1rem)] top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-zinc-200 transition-colors hover:bg-black/80 hover:text-white sm:right-4 sm:top-4 sm:h-auto sm:w-auto sm:p-2"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative min-h-[20rem] overflow-hidden sm:min-h-[22rem] sm:rounded-t-xl">
              {backdropUrl ? (
                <Image src={backdropUrl} alt="" fill priority sizes="100vw" className="object-cover" />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-[#111] via-[#111]/75 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/50" />

              <div className="relative z-10 grid gap-6 px-5 pb-6 pt-[calc(env(safe-area-inset-top)+4rem)] sm:pb-8 sm:pt-16 md:grid-cols-[13rem_1fr] md:px-8 md:pt-20">
                <div className="relative hidden aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-xl md:block">
                  {posterUrl ? <Image src={posterUrl} alt={displayEntry.title} fill sizes="208px" className="object-cover" /> : null}
                </div>

                <div className="flex max-w-2xl flex-col justify-end">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-zinc-400">
                    {displayEntry.type === 'movie' ? 'Movie' : 'TV Series'}
                  </p>
                  <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl">{displayEntry.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                    {displayEntry.year ? <span>{displayEntry.year}</span> : null}
                    {typeof entry.rating === 'number' ? <span className="text-amber-400">Rating {entry.rating}</span> : null}
                    {typeof entry.voteCount === 'number' ? <span>{entry.voteCount.toLocaleString()} votes</span> : null}
                  </div>
                  {displayEntry.synopsis ? (
                    <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-zinc-200 sm:line-clamp-5 md:text-base">
                      {displayEntry.synopsis}
                    </p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      href={playHref}
                      className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-zinc-200"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Play
                    </Link>
                  </div>
                  {activeError ? <p className="mt-4 text-sm text-amber-300">{activeError}</p> : null}
                </div>
              </div>
            </div>

            <div className="space-y-8 px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:px-8">
              <section>
                <h3 className="mb-3 text-base font-bold">Cast</h3>
                <CastList cast={cast} isLoading={isLoading} />
              </section>

              <section>
                <h3 className="mb-3 text-base font-bold">
                  If you like {displayEntry.title}, you might also like
                </h3>
                <RecommendationCarousel
                  entries={recommendations}
                  isLoading={isLoading}
                  onSelectEntry={selectRecommendation}
                  title={displayEntry.title}
                />
              </section>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
