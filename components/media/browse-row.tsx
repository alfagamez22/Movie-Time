'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Info, Play, X } from 'lucide-react';

import type { LibraryMediaEntry } from '@/lib/media/types';

const MAX_LOOPABLE_ENTRIES = 8;

interface BrowseRowProps {
  anchorId?: string;
  entries: LibraryMediaEntry[];
  loop?: boolean;
  onEntryRemove?: (entry: LibraryMediaEntry) => void;
  onEntrySelect: (entry: LibraryMediaEntry) => void;
  title: string;
}

interface ProgressDisplayEntry extends LibraryMediaEntry {
  durationSeconds?: number;
  episode?: string;
  progressPercent?: number;
  progressSeconds?: number;
  season?: string;
}

function formatWatchTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getProgressDisplay(entry: LibraryMediaEntry) {
  const progressEntry = entry as ProgressDisplayEntry;
  if (typeof progressEntry.progressSeconds !== 'number') return null;

  const progressPercent =
    typeof progressEntry.progressPercent === 'number'
      ? progressEntry.progressPercent
      : typeof progressEntry.durationSeconds === 'number' && progressEntry.durationSeconds > 0
        ? (progressEntry.progressSeconds / progressEntry.durationSeconds) * 100
        : undefined;
  const labelPrefix =
    entry.type === 'tv' && progressEntry.season && progressEntry.episode
      ? `S${progressEntry.season} E${progressEntry.episode}`
      : 'Left at';

  return {
    label: `${labelPrefix} ${formatWatchTime(progressEntry.progressSeconds)}`,
    percent:
      typeof progressPercent === 'number' && Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : null,
  };
}

function formatNextEpisodeArrival(entry: LibraryMediaEntry): string | null {
  if (
    entry.type !== 'tv' ||
    typeof entry.nextEpisodeAt !== 'number' ||
    !Number.isFinite(entry.nextEpisodeAt) ||
    typeof entry.nextEpisodeNumber !== 'number' ||
    !Number.isFinite(entry.nextEpisodeNumber)
  ) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const secondsUntil = entry.nextEpisodeAt - nowSeconds;
  if (secondsUntil <= 0) {
    return null;
  }

  const daySeconds = 24 * 60 * 60;
  const hourSeconds = 60 * 60;
  const minuteSeconds = 60;

  let arrivalLabel = '';
  if (secondsUntil < hourSeconds) {
    arrivalLabel = `in ${Math.max(1, Math.ceil(secondsUntil / minuteSeconds))}m`;
  } else if (secondsUntil < daySeconds) {
    arrivalLabel = `in ${Math.max(1, Math.ceil(secondsUntil / hourSeconds))}h`;
  } else if (secondsUntil < daySeconds * 2) {
    arrivalLabel = 'tomorrow';
  } else if (secondsUntil < daySeconds * 7) {
    arrivalLabel = `in ${Math.max(1, Math.ceil(secondsUntil / daySeconds))}d`;
  } else {
    arrivalLabel = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(entry.nextEpisodeAt * 1000));
  }

  return `Next ep ${entry.nextEpisodeNumber} ${arrivalLabel}`;
}

function PosterCard({
  entry,
  onRemove,
  onSelect,
}: {
  entry: LibraryMediaEntry;
  onRemove?: (entry: LibraryMediaEntry) => void;
  onSelect: (entry: LibraryMediaEntry) => void;
}) {
  const progress = getProgressDisplay(entry);
  const isRecentlyWatched = Boolean(onRemove);
  const nextEpisodeArrival = formatNextEpisodeArrival(entry);

  return (
    <div
      // Regular rows stay compact; personal rows get a larger card treatment.
      className={`group relative shrink-0 ${isRecentlyWatched ? 'poster-card-recent' : 'poster-card-regular'}`}
    >
      <button
        type="button"
        onClick={() => onSelect(entry)}
        aria-label={`Show details for ${entry.title}`}
        className={`relative w-full overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red ${
          isRecentlyWatched
            ? 'rounded-xl bg-zinc-950 shadow-[0_18px_50px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-1 hover:ring-white/20'
            : 'rounded-md'
        }`}
      >
        <div className="relative aspect-[2/3] w-full bg-zinc-900">
          {entry.posterUrl ? (
            <Image
              src={entry.posterUrl}
              alt={entry.title}
              fill
              sizes={
                isRecentlyWatched
                  ? '(max-width: 768px) 15rem, 18rem'
                  : '(max-width: 640px) 42vw, (max-width: 1023px) 16vw, (max-width: 1279px) 14rem, (max-width: 1535px) 15rem, (max-width: 2199px) 16rem, 18rem'
              }
              className={`object-cover transition-transform duration-300 ${
                isRecentlyWatched ? 'group-hover:scale-[1.04]' : 'group-hover:scale-[1.08]'
              }`}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-800 px-2 text-center">
              <Play className="h-8 w-8 text-zinc-600" />
              <p className="line-clamp-3 text-xs font-medium text-zinc-500">{entry.title}</p>
            </div>
          )}
          {/* Hover overlay */}
          <div
            className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/35 to-transparent p-3 transition-opacity duration-200 ${
              isRecentlyWatched ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
            }`}
          >
            <p
              className={`${isRecentlyWatched ? 'text-sm' : 'text-xs'} line-clamp-2 font-semibold leading-tight text-white`}
            >
              {entry.title}
            </p>
            {typeof entry.rating === 'number' && !isRecentlyWatched ? (
              <p className="mt-0.5 text-[11px] font-medium text-amber-400">* {entry.rating}</p>
            ) : null}
            <div className={`mt-2 flex items-center gap-2 ${progress ? 'justify-between' : 'justify-stretch'}`}>
              {progress ? (
                <span className="shrink-0 rounded-md bg-black/70 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                  {progress.label}
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-white/15 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm transition-colors group-hover:bg-white/25">
                <Info className="h-3 w-3 shrink-0" /> Details
              </span>
            </div>
          </div>

          {nextEpisodeArrival ? (
            <div className="absolute left-2 top-2 z-10 rounded-md bg-emerald-500/85 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm">
              {nextEpisodeArrival}
            </div>
          ) : null}

          {progress ? (
            <>
              {progress.percent !== null ? (
                <div className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/20">
                  <div className="h-full bg-netflix-red" style={{ width: `${progress.percent}%` }} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </button>

      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(entry)}
          aria-label={`Remove ${entry.title} from recently watched`}
          title="Remove from recently watched"
          className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-zinc-100 opacity-100 shadow-lg ring-1 ring-white/10 backdrop-blur-md transition hover:scale-105 hover:bg-netflix-red hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red md:opacity-80 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function BrowseRow({ anchorId, entries, loop = true, onEntryRemove, onEntrySelect, title }: BrowseRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Flag to prevent the scroll handler from re-triggering during a silent jump
  const isJumping = useRef(false);
  const hasEntries = entries.length > 0;
  // Large TMDB rows become noticeably heavier when tripled for the seamless loop.
  const shouldLoop = loop && entries.length > 2 && entries.length <= MAX_LOOPABLE_ENTRIES;

  // Scroll to the middle copy after mount
  useEffect(() => {
    if (!shouldLoop) return;
    const el = rowRef.current;
    if (!el) return;
    const snapToMiddle = () => {
      if (el.scrollWidth > 0) el.scrollLeft = el.scrollWidth / 3;
    };
    snapToMiddle();
    // Fallback for first paint
    const t = setTimeout(snapToMiddle, 50);
    return () => clearTimeout(t);
  }, [shouldLoop]);

  // Silently teleport back to the middle copy when the user exits it
  const onScroll = useCallback(() => {
    if (!shouldLoop) return;
    const el = rowRef.current;
    if (!el || isJumping.current) return;
    const third = el.scrollWidth / 3;
    if (el.scrollLeft >= third * 2) {
      // Entered copy3, jump back to copy2.
      isJumping.current = true;
      el.scrollLeft -= third;
      setTimeout(() => { isJumping.current = false; }, 80);
    } else if (el.scrollLeft < 4) {
      // Entered copy1 boundary, jump forward to copy2.
      isJumping.current = true;
      el.scrollLeft += third;
      setTimeout(() => { isJumping.current = false; }, 80);
    }
  }, [shouldLoop]);

  useEffect(() => {
    if (!shouldLoop) return;
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [shouldLoop, onScroll]);

  const scroll = (dir: 'left' | 'right') => {
    if (!rowRef.current) return;
    // 80% of viewport width per click feels like one full "page" shift.
    const amount = rowRef.current.clientWidth * 0.8;
    rowRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!hasEntries) return null;

  // Triple long browse rows for the seamless loop, but keep short personal rows exact.
  const rowItems = shouldLoop ? [...entries, ...entries, ...entries] : entries;

  return (
    <div id={anchorId} className="group/row content-auto-section scroll-mt-24">
      <h2 className="mb-3 px-5 text-base font-bold text-white sm:px-6 md:px-12 md:text-lg">{title}</h2>
      <div className="relative">
        {/* Left arrow */}
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label={`Scroll ${title} left`}
          className="absolute left-0 top-0 z-10 flex h-full w-14 items-center justify-center bg-gradient-to-r from-[#050505] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
        >
          <ChevronLeft className="h-7 w-7 text-white drop-shadow-md" />
        </button>

        {/* No scroll-smooth class so direct el.scrollLeft assignments stay instant for the silent jump. */}
        <div
          ref={rowRef}
          className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide sm:px-6 md:gap-2 md:px-12"
        >
          {rowItems.map((entry, i) => (
            <PosterCard
              key={`${shouldLoop ? 'loop' : 'single'}-${i}-${entry.provider}:${entry.type}:${entry.id}`}
              entry={entry}
              onRemove={onEntryRemove}
              onSelect={onEntrySelect}
            />
          ))}
        </div>

        {/* Right arrow */}
        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label={`Scroll ${title} right`}
          className="absolute right-0 top-0 z-10 flex h-full w-14 items-center justify-center bg-gradient-to-l from-[#050505] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
        >
          <ChevronRight className="h-7 w-7 text-white drop-shadow-md" />
        </button>
      </div>
    </div>
  );
}
