'use client';

import Image from 'next/image';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Minimize2, PanelRight, Tv } from 'lucide-react';

import { buildEmbedUrl, type PlaybackOptions } from '@/lib/media/embed';
import { buildWatchHref } from '@/lib/media/routes';
import { getEpisodeLimit, isTvEntry, type EpisodePreview, type MediaEntry, type SeasonDetails } from '@/lib/media/types';

interface WatchPlayerProps {
  entry: MediaEntry;
  initialPlayback: PlaybackOptions;
  initialSeasonDetails?: SeasonDetails | null;
}

export function WatchPlayer({ entry, initialPlayback, initialSeasonDetails = null }: WatchPlayerProps) {
  const router = useRouter();
  const isSeries = isTvEntry(entry);

  const [season, setSeason] = useState(initialPlayback.season);
  const [episode, setEpisode] = useState(initialPlayback.episode);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [showNavigator, setShowNavigator] = useState(true);
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<SeasonDetails | null>(initialSeasonDetails);
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeSeason = isSeries
    ? String(Math.min(Math.max(1, Number.parseInt(season, 10)), entry.maxSeasons))
    : '1';
  const safeEpisodeLimit = isSeries
    ? (activeSeasonDetails?.episodeCount ?? getEpisodeLimit(entry, safeSeason))
    : 1;
  const safeEpisode = isSeries
    ? String(Math.min(Math.max(1, Number.parseInt(episode, 10)), safeEpisodeLimit))
    : '1';

  const seasonOptions = isSeries
    ? Array.from({ length: entry.maxSeasons }, (_, i) => String(i + 1))
    : [];
  const episodeOptions = isSeries
    ? Array.from({ length: safeEpisodeLimit }, (_, i) => String(i + 1))
    : [];

  const seasonEpisodeCards: EpisodePreview[] =
    activeSeasonDetails?.episodes ??
    episodeOptions.map((epNum) => ({
      airDate: undefined,
      episodeNumber: Number.parseInt(epNum, 10),
      name: `Episode ${epNum.padStart(2, '0')}`,
      overview: '',
      runtime: undefined,
      seasonNumber: Number.parseInt(safeSeason, 10),
      stillUrl: undefined,
    }));

  const embedUrl = buildEmbedUrl(entry, {
    ...initialPlayback,
    season: safeSeason,
    episode: safeEpisode,
  });

  // Keep URL in sync with current season/episode
  useEffect(() => {
    if (!isSeries) return;
    const href = buildWatchHref(entry, {
      autoPlay: initialPlayback.autoPlay,
      color: initialPlayback.color,
      episode: safeEpisode,
      progress: null,
      season: safeSeason,
    });
    startTransition(() => router.replace(href, { scroll: false }));
  }, [safeSeason, safeEpisode, entry, initialPlayback.autoPlay, initialPlayback.color, router, isSeries]);

  // Auto-hide chrome in theater mode — called on mouse move and when entering theater
  const revealChrome = useCallback(() => {
    setIsChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => setIsChromeVisible(false), 3000);
  }, []);

  // Clear any lingering timer on unmount
  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    };
  }, []);

  const handleSeasonChange = useCallback(
    async (newSeason: string) => {
      setSeason(newSeason);
      setEpisode('1');
      setActiveSeasonDetails(null);
      setSeasonDetailsError(null);

      try {
        const resp = await fetch(
          `/api/media/${encodeURIComponent(entry.slug)}/seasons/${newSeason}?type=${entry.type}&id=${entry.tmdbId}`,
        );
        if (!resp.ok) throw new Error('Season fetch failed');
        const json: { data: SeasonDetails } = await resp.json();
        setActiveSeasonDetails(json.data);
      } catch {
        setSeasonDetailsError('Could not load episode list for this season.');
      }
    },
    [entry.slug, entry.type, entry.tmdbId],
  );

  const handleEpisodeChange = useCallback((newEpisode: string) => {
    setEpisode(newEpisode);
  }, []);

  // Theater mode
  if (isTheaterMode) {
    return (
      <div
        onMouseMove={revealChrome}
        className="fixed inset-0 z-[70] flex bg-black text-white"
      >
        {/* Left: player */}
        <div className="relative min-w-0 flex-1">
          <div
            className={`absolute inset-x-0 top-0 z-30 flex h-12 items-center gap-4 bg-gradient-to-b from-black/80 to-transparent px-4 transition-opacity duration-300 ${
              isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="Back to library"
              title="Back to library"
              className="flex items-center gap-1.5 text-zinc-300 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center text-[13px] font-semibold uppercase tracking-widest text-white">
              {entry.title}
              {isSeries && ` S${safeSeason.padStart(2, '0')}E${safeEpisode.padStart(2, '0')}`}
            </span>
            <button
              type="button"
              onClick={() => { setIsTheaterMode(false); if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current); }}
              title="Exit theater mode"
              aria-label="Exit theater mode"
              className="text-zinc-300 transition-colors hover:text-white"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          <iframe
            key={`${safeSeason}-${safeEpisode}`}
            src={embedUrl}
            className="h-full w-full border-0"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
            title={`Watch ${entry.title}`}
          />
        </div>

        {/* Right: episode sidebar */}
        {isSeries && (
          <EpisodeSidebar
            safeSeason={safeSeason}
            safeEpisode={safeEpisode}
            safeEpisodeLimit={safeEpisodeLimit}
            seasonOptions={seasonOptions}
            seasonEpisodeCards={seasonEpisodeCards}
            seasonDetailsError={seasonDetailsError}
            onSeasonChange={(s) => void handleSeasonChange(s)}
            onEpisodeChange={handleEpisodeChange}
          />
        )}
      </div>
    );
  }

  // Normal mode
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050505] text-white">
      <header className="glass z-50 flex h-16 w-full shrink-0 items-center justify-between px-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Back to library"
          className="flex items-center gap-2 text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Library</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">{entry.title}</span>
          {isSeries && (
            <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
              S{safeSeason.padStart(2, '0')}E{safeEpisode.padStart(2, '0')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setIsTheaterMode(true); revealChrome(); }}
            title="Enter theater mode"
            aria-label="Enter theater mode"
            className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            <Tv className="h-4 w-4" />
            Theater
          </button>
          {isSeries && (
            <button
              type="button"
              onClick={() => setShowNavigator((v) => !v)}
              title={showNavigator ? 'Hide episodes' : 'Show episodes'}
              aria-label={showNavigator ? 'Hide episode navigator' : 'Show episode navigator'}
              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              <PanelRight className="h-4 w-4" />
              {showNavigator ? 'Hide' : 'Episodes'}
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-1 gap-4 overflow-hidden p-4 md:p-6">
        <section className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl">
            <div className="aspect-video w-full">
              <iframe
                key={`${safeSeason}-${safeEpisode}`}
                src={embedUrl}
                className="h-full w-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture"
                title={`Watch ${entry.title}`}
              />
            </div>
          </div>

          <div className="mt-5 px-1">
            <h1 className="text-2xl font-black text-white">{entry.title}</h1>
            {entry.synopsis && (
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{entry.synopsis}</p>
            )}
          </div>
        </section>

        {isSeries && showNavigator && (
          <aside className="glass flex w-80 shrink-0 flex-col overflow-hidden rounded-[1.75rem]">
            <EpisodeSidebar
              safeSeason={safeSeason}
              safeEpisode={safeEpisode}
              safeEpisodeLimit={safeEpisodeLimit}
              seasonOptions={seasonOptions}
              seasonEpisodeCards={seasonEpisodeCards}
              seasonDetailsError={seasonDetailsError}
              onSeasonChange={(s) => void handleSeasonChange(s)}
              onEpisodeChange={handleEpisodeChange}
            />
          </aside>
        )}
      </main>
    </div>
  );
}

// Shared episode sidebar used in both theater and normal mode

interface EpisodeSidebarProps {
  safeSeason: string;
  safeEpisode: string;
  safeEpisodeLimit: number;
  seasonOptions: string[];
  seasonEpisodeCards: EpisodePreview[];
  seasonDetailsError: string | null;
  onSeasonChange: (season: string) => void;
  onEpisodeChange: (episode: string) => void;
}

function EpisodeSidebar({
  safeSeason,
  safeEpisode,
  safeEpisodeLimit,
  seasonOptions,
  seasonEpisodeCards,
  seasonDetailsError,
  onSeasonChange,
  onEpisodeChange,
}: EpisodeSidebarProps) {
  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-[#111]">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <select
          value={safeSeason}
          onChange={(e) => onSeasonChange(e.target.value)}
          className="cursor-pointer bg-transparent text-sm font-semibold text-white outline-none"
          title="Select season"
          aria-label="Select season"
        >
          {seasonOptions.map((s) => (
            <option key={s} value={s} className="bg-[#1a1a1a] text-white">
              Season {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">{safeEpisodeLimit} Episodes</span>
      </div>

      <div className="thin-scrollbar flex-1 overflow-y-auto">
        {seasonEpisodeCards.map((ep) => {
          const epNum = String(ep.episodeNumber);
          const isActive = epNum === safeEpisode;
          return (
            <button
              key={epNum}
              type="button"
              onClick={() => onEpisodeChange(epNum)}
              className={`flex w-full gap-3 border-b border-white/5 p-3 text-left transition-colors ${
                isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black/40">
                {isActive && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white">
                      <div className="ml-0.5 border-b-[5px] border-l-[8px] border-t-[5px] border-b-transparent border-t-transparent border-l-white" />
                    </div>
                  </div>
                )}
                {ep.stillUrl ? (
                  <Image src={ep.stillUrl} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_center,rgba(229,9,20,0.15),transparent)]" />
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="mb-0.5 text-[11px] text-zinc-400">
                  E{epNum}
                  {ep.runtime != null ? ` · ${ep.runtime}m` : ''}
                </p>
                <p className="line-clamp-1 text-xs font-medium text-white">{ep.name}</p>
                {ep.overview ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{ep.overview}</p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {seasonDetailsError && (
        <div className="m-3 shrink-0 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-xs text-amber-200">
          {seasonDetailsError}
        </div>
      )}
    </div>
  );
}
