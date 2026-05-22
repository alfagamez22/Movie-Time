'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { RecentlyWatchedEntry } from '@/lib/hooks/use-recently-watched';
import type { MediaExperienceConfig } from '@/lib/media/experience';
import { buildWatchHref, buildWatchSlug } from '@/lib/media/routes';
import {
  getMediaKindLabel,
  type LibraryMediaEntry,
  type MediaCastMember,
  type MediaDetailsPayload,
  type MediaTrailer,
  type PlaybackLanguage,
} from '@/lib/media/types';

interface MediaDetailsModalProps {
  entry: LibraryMediaEntry | null;
  experience: MediaExperienceConfig;
  onClose: () => void;
  onSelectEntry: (entry: LibraryMediaEntry) => void;
  preferredAnimeLanguage?: PlaybackLanguage;
  recentlyWatched?: RecentlyWatchedEntry[];
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

function findResumeEntry(entry: LibraryMediaEntry | null, recentlyWatched: RecentlyWatchedEntry[] | undefined) {
  if (!entry) {
    return null;
  }

  return (
    recentlyWatched?.find((candidate) => {
      return candidate.type === entry.type && candidate.id === entry.id && candidate.provider === entry.provider;
    }) ?? null
  );
}

function getTrailerEmbedUrl(trailer: MediaTrailer): string | null {
  if (trailer.embedUrl) {
    return trailer.embedUrl;
  }

  if (trailer.youtubeId) {
    return `https://www.youtube-nocookie.com/embed/${trailer.youtubeId}?enablejsapi=1&rel=0`;
  }

  return trailer.url.includes('/embed/') ? trailer.url : null;
}

function TrailerList({
  isLoading,
  onSelectTrailer,
  trailers,
}: {
  isLoading: boolean;
  onSelectTrailer: (trailer: MediaTrailer) => void;
  trailers: MediaTrailer[];
}) {
  if (isLoading) {
    return <p className="text-sm text-zinc-500">Loading trailers...</p>;
  }

  if (trailers.length === 0) {
    return <p className="text-sm text-zinc-500">Trailers unavailable.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trailers.map((trailer) => (
        <button
          key={`${trailer.youtubeId ?? trailer.url}-${trailer.title}`}
          type="button"
          onClick={() => onSelectTrailer(trailer)}
          className="group block overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
        >
          <div className="relative aspect-video bg-zinc-900">
            {trailer.thumbnailUrl ? (
              <Image
                src={trailer.thumbnailUrl}
                alt={trailer.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(229,9,20,0.35),_transparent_55%),linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-white">{trailer.title}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">YouTube</p>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function TrailerPlayer({
  onClose,
  trailer,
}: {
  onClose: () => void;
  trailer: MediaTrailer;
}) {
  const embedUrl = getTrailerEmbedUrl(trailer);
  if (!embedUrl) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close trailer"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-zinc-200 transition-colors hover:bg-black/80 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={embedUrl}
            title={`${trailer.title} trailer`}
            className="h-full w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
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
            key={`${item.provider}:${item.type}:${item.id}`}
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
              {getMediaKindLabel(item)}
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

export function MediaDetailsModal({
  entry,
  experience,
  onClose,
  onSelectEntry,
  preferredAnimeLanguage,
  recentlyWatched,
}: MediaDetailsModalProps) {
  const [details, setDetails] = useState<MediaDetailsPayload | null>(null);
  const [error, setError] = useState<DetailsErrorState | null>(null);
  const [activeTrailer, setActiveTrailer] = useState<MediaTrailer | null>(null);

  useEffect(() => {
    if (!entry) return;

    const controller = new AbortController();
    const requestKey = `${entry.provider}:${entry.type}:${entry.id}`;
    const slug = buildWatchSlug(entry.title, entry.id);
    const searchParams = new URLSearchParams({
      id: entry.id,
    });

    if (entry.provider === 'tmdb') {
      searchParams.set('type', entry.type);
    }

    void fetch(`${experience.detailsApiBasePath}/${encodeURIComponent(slug)}/details?${searchParams.toString()}`, {
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
  }, [entry, experience.detailsApiBasePath]);

  useEffect(() => {
    if (!entry) return;

    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (activeTrailer) {
        setActiveTrailer(null);
        return;
      }

      onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [activeTrailer, entry, onClose]);

  const selectRecommendation = useCallback(
    (nextEntry: LibraryMediaEntry) => {
      onSelectEntry(nextEntry);
    },
    [onSelectEntry],
  );

  const openTrailer = useCallback((trailer: MediaTrailer) => {
    setActiveTrailer(trailer);
  }, []);

  const closeTrailer = useCallback(() => {
    setActiveTrailer(null);
  }, []);

  const selectedKey = entry ? `${entry.provider}:${entry.type}:${entry.id}` : null;
  const detailsKey = details ? `${details.entry.provider}:${details.entry.type}:${details.entry.id}` : null;
  const activeDetails = selectedKey === detailsKey ? details : null;
  const activeError = error?.key === selectedKey ? error.message : null;
  const isLoading = Boolean(entry && !activeDetails && !activeError);
  const displayEntry = activeDetails?.entry ?? entry;
  const cast = activeDetails?.cast ?? [];
  const recommendations = activeDetails?.recommendations ?? [];
  const trailers = activeDetails?.trailers ?? [];
  const backdropUrl = displayEntry?.backdropUrl ?? entry?.backdropUrl;
  const posterUrl = displayEntry?.posterUrl ?? entry?.posterUrl;
  const resumeEntry = findResumeEntry(displayEntry ?? entry, recentlyWatched) as ResumeMediaEntry | null;
  const primaryTrailer = trailers[0];
  const playHref = displayEntry
    ? buildWatchHref(displayEntry, {
        basePath: experience.watchBasePath,
        episode: resumeEntry?.type === 'tv' ? resumeEntry.episode : undefined,
        language: resumeEntry?.defaultLanguage ?? preferredAnimeLanguage,
        progress: resumeEntry?.progressSeconds,
        season: resumeEntry?.type === 'tv' ? resumeEntry.season : undefined,
      })
    : '#';
  const playLabel =
    resumeEntry?.type === 'tv' && resumeEntry.episode
      ? resumeEntry.season
        ? `Continue S${resumeEntry.season} E${resumeEntry.episode}`
        : `Continue E${resumeEntry.episode}`
      : resumeEntry?.progressSeconds
        ? 'Continue'
        : 'Play';

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
                    {getMediaKindLabel(displayEntry)}
                  </p>
                  <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl">{displayEntry.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                    {displayEntry.year ? <span>{displayEntry.year}</span> : null}
                    {typeof displayEntry.rating === 'number' ? <span className="text-amber-400">Rating {displayEntry.rating}</span> : null}
                    {typeof displayEntry.voteCount === 'number' ? <span>{displayEntry.voteCount.toLocaleString()} votes</span> : null}
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
                      {playLabel}
                    </Link>
                    {primaryTrailer ? (
                      <button
                        type="button"
                        onClick={() => openTrailer(primaryTrailer)}
                        className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:border-white/25 hover:bg-white/10"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        Watch Trailer
                      </button>
                    ) : null}
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
                <h3 className="mb-3 text-base font-bold">Trailers</h3>
                <TrailerList isLoading={isLoading} onSelectTrailer={openTrailer} trailers={trailers} />
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

            {activeTrailer ? <TrailerPlayer trailer={activeTrailer} onClose={closeTrailer} /> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
