'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';

import type { LibraryMediaEntry } from '@/lib/media/types';

interface BrowseRowProps {
  entries: LibraryMediaEntry[];
  onEntrySelect: (entry: LibraryMediaEntry) => void;
  title: string;
}

function PosterCard({ entry, onSelect }: { entry: LibraryMediaEntry; onSelect: (entry: LibraryMediaEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-label={`Show details for ${entry.title}`}
      // clamp: min 9rem (small screens), preferred 14vw (scales with monitor), max 18rem (huge screens)
      className="group relative shrink-0 w-[clamp(9rem,14vw,18rem)] overflow-hidden rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
    >
      <div className="relative aspect-[2/3] w-full bg-zinc-900">
        {entry.posterUrl ? (
          <Image
            src={entry.posterUrl}
            alt={entry.title}
            fill
            sizes="(max-width: 768px) 9rem, 14vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.08]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-800 px-2 text-center">
            <Play className="h-8 w-8 text-zinc-600" />
            <p className="line-clamp-3 text-xs font-medium text-zinc-500">{entry.title}</p>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{entry.title}</p>
          {typeof entry.rating === 'number' ? (
            <p className="mt-0.5 text-[11px] font-medium text-amber-400">★ {entry.rating}</p>
          ) : null}
          <div className="mt-2 flex items-center justify-center gap-1 rounded bg-white/15 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
            <Info className="h-3 w-3" /> Details
          </div>
        </div>
      </div>
    </button>
  );
}

export function BrowseRow({ entries, onEntrySelect, title }: BrowseRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Flag to prevent the scroll handler from re-triggering during a silent jump
  const isJumping = useRef(false);
  const hasEntries = entries.length > 0;

  // Scroll to the middle copy after mount
  useEffect(() => {
    if (!hasEntries) return;
    const el = rowRef.current;
    if (!el) return;
    const snapToMiddle = () => {
      if (el.scrollWidth > 0) el.scrollLeft = el.scrollWidth / 3;
    };
    snapToMiddle();
    // Fallback for first paint
    const t = setTimeout(snapToMiddle, 50);
    return () => clearTimeout(t);
  }, [hasEntries]);

  // Silently teleport back to the middle copy when the user exits it
  const onScroll = useCallback(() => {
    const el = rowRef.current;
    if (!el || isJumping.current) return;
    const third = el.scrollWidth / 3;
    if (el.scrollLeft >= third * 2) {
      // Entered copy3 → jump back to copy2
      isJumping.current = true;
      el.scrollLeft -= third;
      setTimeout(() => { isJumping.current = false; }, 80);
    } else if (el.scrollLeft < 4) {
      // Entered copy1 boundary → jump forward to copy2
      isJumping.current = true;
      el.scrollLeft += third;
      setTimeout(() => { isJumping.current = false; }, 80);
    }
  }, []);

  useEffect(() => {
    if (!hasEntries) return;
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasEntries, onScroll]);

  const scroll = (dir: 'left' | 'right') => {
    if (!rowRef.current) return;
    // 80% of viewport width per click — feels like one full "page" shift
    const amount = rowRef.current.clientWidth * 0.8;
    rowRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!hasEntries) return null;

  // Triple the list: [copy1 | copy2(middle) | copy3]
  // We start scrolled to copy2 so arrows work in both directions immediately.
  const loopItems = [...entries, ...entries, ...entries];

  return (
    <div className="group/row">
      <h2 className="mb-3 px-6 text-base font-bold text-white md:px-12 md:text-lg">{title}</h2>
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

        {/* No scroll-smooth class — direct el.scrollLeft assignments stay instant (for the silent jump) */}
        <div
          ref={rowRef}
          className="flex gap-2 overflow-x-auto px-6 pb-2 scrollbar-hide md:px-12"
        >
          {loopItems.map((entry, i) => (
            <PosterCard
              key={`loop-${i}-${entry.type}:${entry.tmdbId}`}
              entry={entry}
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
