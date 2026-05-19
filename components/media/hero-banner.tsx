'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { buildWatchHref } from '@/lib/media/routes';
import type { LibraryMediaEntry } from '@/lib/media/types';

interface HeroBannerProps {
  items: LibraryMediaEntry[];
  onInfoSelect?: (entry: LibraryMediaEntry) => void;
}

export function HeroBanner({ items, onInfoSelect }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = items.length;

  // Auto-advance every 6 seconds; resets whenever activeIndex changes (user nav or auto)
  useEffect(() => {
    if (count <= 1) return;
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % count);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeIndex, count]);

  if (count === 0) return null;

  const active = items[activeIndex];
  const heroImageUrl = active.backdropUrl ?? active.posterUrl;

  const go = (index: number) => {
    setActiveIndex(((index % count) + count) % count);
  };

  return (
    <div className="relative h-[85vh] min-h-[560px] w-full overflow-hidden bg-black">
      {/* Crossfading backdrop */}
      <AnimatePresence mode="sync">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          className="absolute inset-0"
        >
          {heroImageUrl ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${heroImageUrl}")` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/30" />
        </motion.div>
      </AnimatePresence>

      {/* Foreground content */}
      <div className="absolute inset-0 flex items-center pt-16">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={`content-${activeIndex}`}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="max-w-xl space-y-4"
            >
              <span className="inline-block rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-200 backdrop-blur-sm">
                {active.type === 'movie' ? 'Movie' : 'TV Series'}
              </span>

              <h1 className="text-4xl font-black leading-tight tracking-tight text-white drop-shadow-lg md:text-6xl">
                {active.title}
              </h1>

              <div className="flex items-center gap-3 text-sm text-zinc-300">
                {active.year ? <span>{active.year}</span> : null}
                {typeof active.rating === 'number' ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-zinc-500" />
                    <span className="font-semibold text-amber-400">★ {active.rating}</span>
                  </>
                ) : null}
              </div>

              {active.synopsis ? (
                <p className="line-clamp-3 text-sm leading-relaxed text-zinc-300 md:text-base">
                  {active.synopsis}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href={buildWatchHref(active)}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition-all hover:bg-zinc-200 active:scale-95"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play
                </Link>
                {onInfoSelect ? (
                  <button
                    type="button"
                    onClick={() => onInfoSelect(active)}
                    className="inline-flex items-center gap-2 rounded-md bg-zinc-700/60 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-zinc-600/70 active:scale-95"
                  >
                    <Info className="h-4 w-4" />
                    More Info
                  </button>
                ) : (
                  <Link
                    href={buildWatchHref(active)}
                    className="inline-flex items-center gap-2 rounded-md bg-zinc-700/60 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-zinc-600/70 active:scale-95"
                  >
                    <Info className="h-4 w-4" />
                    More Info
                  </Link>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Prev / Next arrows */}
      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(activeIndex - 1)}
            aria-label="Previous title"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => go(activeIndex + 1)}
            aria-label="Next title"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      {/* Dot indicators */}
      {count > 1 ? (
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2">
          {items.map((item, i) => (
            <button
              key={item.tmdbId}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${item.title}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
