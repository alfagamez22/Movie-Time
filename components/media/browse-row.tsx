'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';

import { buildWatchHref } from '@/lib/media/routes';
import type { LibraryMediaEntry } from '@/lib/media/types';

interface BrowseRowProps {
  entries: LibraryMediaEntry[];
  title: string;
}

function PosterCard({ entry }: { entry: LibraryMediaEntry }) {
  return (
    <Link
      href={buildWatchHref(entry)}
      className="group relative shrink-0 w-36 overflow-hidden rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-netflix-red"
    >
      <div className="relative aspect-[2/3] w-full bg-zinc-900">
        {entry.posterUrl ? (
          <Image
            src={entry.posterUrl}
            alt={entry.title}
            fill
            sizes="144px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.08]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-800 px-2 text-center">
            <Play className="h-8 w-8 text-zinc-600" />
            <p className="line-clamp-3 text-[10px] font-medium text-zinc-500">{entry.title}</p>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{entry.title}</p>
          {typeof entry.rating === 'number' ? (
            <p className="mt-0.5 text-[10px] font-medium text-amber-400">★ {entry.rating}</p>
          ) : null}
          <div className="mt-1.5 flex items-center justify-center gap-1 rounded bg-white/15 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Play className="h-2.5 w-2.5 fill-current" /> Play
          </div>
        </div>
      </div>
    </Link>
  );
}

export function BrowseRow({ entries, title }: BrowseRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  if (entries.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (!rowRef.current) return;
    const amount = rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="group/row">
      <h2 className="mb-3 px-6 text-base font-bold text-white md:px-12 md:text-lg">{title}</h2>
      <div className="relative">
        {/* Left gradient + arrow */}
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label={`Scroll ${title} left`}
          className="absolute left-0 top-0 z-10 flex h-full w-12 items-center justify-center bg-gradient-to-r from-[#050505] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
        >
          <ChevronLeft className="h-6 w-6 text-white drop-shadow-md" />
        </button>

        <div
          ref={rowRef}
          className="flex gap-2 overflow-x-auto scroll-smooth px-6 pb-2 scrollbar-hide md:px-12"
        >
          {entries.map((entry) => (
            <PosterCard key={`${entry.type}:${entry.tmdbId}`} entry={entry} />
          ))}
        </div>

        {/* Right gradient + arrow */}
        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label={`Scroll ${title} right`}
          className="absolute right-0 top-0 z-10 flex h-full w-12 items-center justify-center bg-gradient-to-l from-[#050505] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
        >
          <ChevronRight className="h-6 w-6 text-white drop-shadow-md" />
        </button>
      </div>
    </div>
  );
}
