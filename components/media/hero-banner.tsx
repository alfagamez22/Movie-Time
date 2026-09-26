'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Info, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { RecentlyWatchedEntry } from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import { rememberPlaybackReturn } from '@/lib/media/playback-return';
import { getMediaKindLabel, isMangaProvider, type LibraryMediaEntry, type PlaybackLanguage } from '@/lib/media/types';

interface HeroBannerProps {
  items: LibraryMediaEntry[];
  onInfoSelect?: (entry: LibraryMediaEntry) => void;
  preferredAnimeLanguage?: PlaybackLanguage;
  recentlyWatched?: RecentlyWatchedEntry[];
  watchBasePath?: string;
}

function findResumeEntry(entry: LibraryMediaEntry, recentlyWatched: RecentlyWatchedEntry[] | undefined) {
  return (
    recentlyWatched?.find((candidate) => {
      return candidate.type === entry.type && candidate.id === entry.id && candidate.provider === entry.provider;
    }) ?? null
  );
}

export function HeroBanner({
  items,
  onInfoSelect,
  preferredAnimeLanguage,
  recentlyWatched,
  watchBasePath,
}: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
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
  const isManga = isMangaProvider(active.provider);
  const resumeEntry = findResumeEntry(active, recentlyWatched);
  const heroImageUrl = active.backdropUrl ?? active.posterUrl;
  const playHref = buildWatchHref(active, {
    basePath: watchBasePath,
    episode: resumeEntry?.provider === 'mangadex' ? resumeEntry.episode : resumeEntry?.type === 'tv' ? resumeEntry.episode : undefined,
    language: resumeEntry?.defaultLanguage ?? preferredAnimeLanguage,
    progress: resumeEntry?.progressSeconds,
    season: resumeEntry?.provider === 'mangadex' ? resumeEntry.season : resumeEntry?.type === 'tv' ? resumeEntry.season : undefined,
  });
  const playLabel =
    isManga
      ? resumeEntry?.episode
        ? `Continue Ch. ${resumeEntry.episode}`
        : resumeEntry
          ? 'Continue Reading'
          : 'Read'
      : resumeEntry?.type === 'tv' && resumeEntry.episode
        ? resumeEntry.season
          ? `Continue S${resumeEntry.season} E${resumeEntry.episode}`
          : `Continue E${resumeEntry.episode}`
      : resumeEntry?.progressSeconds
        ? 'Continue'
        : 'Play';

  const go = (index: number) => {
    setActiveIndex(((index % count) + count) % count);
  };

  return (
    <div
      className="browse-hero relative w-full touch-pan-y overflow-hidden bg-black"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current;
        touchStartX.current = null;
        const endX = event.changedTouches[0]?.clientX;
        if (startX === null || endX === undefined || count <= 1) return;
        const delta = endX - startX;
        if (Math.abs(delta) > 50) go(activeIndex + (delta < 0 ? 1 : -1));
      }}
    >
      {/* Crossfading backdrop */}
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          className="absolute inset-0"
        >
          {heroImageUrl ? (
            <Image
              src={heroImageUrl}
              alt=""
              aria-hidden="true"
              fill
              preload={activeIndex === 0}
              loading={activeIndex === 0 ? 'eager' : 'lazy'}
              fetchPriority={activeIndex === 0 ? 'high' : 'auto'}
              sizes="100vw"
              className="object-cover object-[70%_20%]"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-black/30" />
        </motion.div>
      </AnimatePresence>

      {/* Foreground content */}
      <div className="browse-hero-content absolute inset-0 flex items-end">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`content-${activeIndex}`}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="max-w-xl space-y-3 sm:space-y-4"
            >
              <span className="inline-block rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-200 backdrop-blur-sm">
                {getMediaKindLabel(active)}
              </span>

              <h1 title={active.title} className="line-clamp-2 text-4xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
                {active.title}
              </h1>

              <div className="flex items-center gap-3 text-sm text-zinc-300">
                {active.year ? <span>{active.year}</span> : null}
                {typeof active.rating === 'number' ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-zinc-500" />
                    <span className="font-semibold text-amber-400">* {active.rating}</span>
                  </>
                ) : null}
              </div>

              {active.synopsis ? (
                <p className="line-clamp-2 text-sm leading-relaxed text-zinc-300 sm:line-clamp-3 md:text-base">
                  {active.synopsis}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href={playHref}
                  onClick={() => { if (!isManga) rememberPlaybackReturn(active, active.provider === 'tmdb' ? 'papiflix' : 'papianime'); }}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition-all hover:bg-zinc-200 active:scale-95"
                >
                  {isManga ? <BookOpen className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                  {playLabel}
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
                    href={playHref}
                    onClick={() => { if (!isManga) rememberPlaybackReturn(active, active.provider === 'tmdb' ? 'papiflix' : 'papianime'); }}
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
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full md:block bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => go(activeIndex + 1)}
            aria-label="Next title"
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full md:block bg-black/30 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      {/* Dot indicators */}
      {count > 1 ? (
        <div className="browse-hero-dots absolute right-6 flex gap-0.5 md:right-12">
          {items.map((item, i) => (
            <button
              key={`${item.provider}:${item.type}:${item.id}`}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${item.title}`}
              aria-current={i === activeIndex ? 'true' : undefined}
              className="group/dot flex h-6 min-w-6 items-center justify-center"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40 group-hover/dot:bg-white/70'
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
