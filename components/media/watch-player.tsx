'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clapperboard, Link2, Maximize2, Minimize2, Settings, Tv } from 'lucide-react';
import { motion } from 'motion/react';

import { buildEmbedUrl, type PlaybackOptions } from '@/lib/media/embed';
import { getEpisodeLimit, isTvEntry, type MediaEntry, type SeasonDetails } from '@/lib/media/types';

interface WatchPlayerProps {
  entry: MediaEntry;
  initialPlayback: PlaybackOptions;
  initialSeasonDetails?: SeasonDetails | null;
  isCatalogEntry: boolean;
}

const PLAYER_COLORS = [
  { label: 'Red', value: 'e50914', swatchClassName: 'bg-netflix-red' },
  { label: 'Blue', value: '0dcaf0', swatchClassName: 'bg-player-blue' },
  { label: 'Green', value: '1db954', swatchClassName: 'bg-player-green' },
  { label: 'Purple', value: '9146ff', swatchClassName: 'bg-player-purple' },
] as const;

interface VidkingPlayerEventData {
  currentTime?: number;
  duration?: number;
  episode?: number;
  event?: 'timeupdate' | 'play' | 'pause' | 'ended' | 'seeked' | string;
  id?: string;
  mediaType?: string;
  progress?: number;
  season?: number;
  timestamp?: number;
}

interface VidkingPlayerMessage {
  data?: VidkingPlayerEventData;
  type?: string;
}

interface StoredWatchProgress {
  currentTime: number;
  duration?: number;
  progress?: number;
  updatedAt: number;
}

function clampPositiveInteger(value: string, max: number): string {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue) || parsedValue < 1) {
    return '1';
  }

  return String(Math.min(parsedValue, max));
}

function parsePlayerMessage(payload: unknown): VidkingPlayerMessage | null {
  let nextPayload = payload;

  if (typeof nextPayload === 'string') {
    try {
      nextPayload = JSON.parse(nextPayload);
    } catch {
      return null;
    }
  }

  if (!nextPayload || typeof nextPayload !== 'object') {
    return null;
  }

  return nextPayload as VidkingPlayerMessage;
}

function buildWatchProgressStorageKey(
  entry: MediaEntry,
  season: string | number | undefined,
  episode: string | number | undefined,
): string {
  if (isTvEntry(entry)) {
    return `vidking-progress:tv:${entry.tmdbId}:${String(season ?? 1)}:${String(episode ?? 1)}`;
  }

  return `vidking-progress:movie:${entry.tmdbId}`;
}

function clearSavedWatchProgress(entry: MediaEntry, season: string | number, episode: string | number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(buildWatchProgressStorageKey(entry, season, episode));
}

function saveWatchProgress(
  entry: MediaEntry,
  eventData: VidkingPlayerEventData,
  fallbackSeason: string,
  fallbackEpisode: string,
) {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof eventData.currentTime !== 'number' || !Number.isFinite(eventData.currentTime)) {
    return;
  }

  const currentTime = Math.max(0, Math.floor(eventData.currentTime));
  const duration =
    typeof eventData.duration === 'number' && Number.isFinite(eventData.duration)
      ? Math.max(0, Math.floor(eventData.duration))
      : undefined;
  const progress =
    typeof eventData.progress === 'number' && Number.isFinite(eventData.progress)
      ? Math.max(0, Math.min(100, Number(eventData.progress.toFixed(1))))
      : undefined;

  const payload: StoredWatchProgress = {
    currentTime,
    updatedAt: typeof eventData.timestamp === 'number' ? eventData.timestamp : Date.now(),
    ...(duration !== undefined ? { duration } : {}),
    ...(progress !== undefined ? { progress } : {}),
  };

  window.localStorage.setItem(
    buildWatchProgressStorageKey(entry, eventData.season ?? fallbackSeason, eventData.episode ?? fallbackEpisode),
    JSON.stringify(payload),
  );
}

export function WatchPlayer({
  entry,
  initialPlayback,
  initialSeasonDetails = null,
  isCatalogEntry,
}: WatchPlayerProps) {
  const router = useRouter();
  const playerShellRef = useRef<HTMLDivElement>(null);
  const chromeHideTimeoutRef = useRef<number | null>(null);
  const [color, setColor] = useState(initialPlayback.color);
  const [autoPlay, setAutoPlay] = useState(initialPlayback.autoPlay);
  const [season, setSeason] = useState(initialPlayback.season);
  const [episode, setEpisode] = useState(initialPlayback.episode);
  const [showSettings, setShowSettings] = useState(false);
  const [showNavigator, setShowNavigator] = useState(isTvEntry(entry));
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [seasonDetailCache, setSeasonDetailCache] = useState<Record<string, SeasonDetails>>(() => {
    if (!initialSeasonDetails) {
      return {};
    }

    return {
      [String(initialSeasonDetails.seasonNumber)]: initialSeasonDetails,
    };
  });
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);

  const isSeries = isTvEntry(entry);
  const safeSeason = isSeries ? clampPositiveInteger(season, entry.maxSeasons) : '1';
  const safeEpisodeLimit = isSeries ? getEpisodeLimit(entry, safeSeason) : 1;
  const safeEpisode = isSeries ? clampPositiveInteger(episode, safeEpisodeLimit) : '1';
  const seasonOptions = isSeries
    ? Array.from({ length: entry.maxSeasons }, (_, index) => String(index + 1))
    : [];
  const episodeOptions = isSeries
    ? Array.from({ length: safeEpisodeLimit }, (_, index) => String(index + 1))
    : [];
  const activeSeasonDetails = isSeries ? seasonDetailCache[safeSeason] : undefined;
  const isSeasonDetailsLoading = isSeries && !activeSeasonDetails && !seasonDetailsError;
  const activeProgress =
    safeSeason === initialPlayback.season && safeEpisode === initialPlayback.episode
      ? initialPlayback.progress
      : null;
  const embedUrl = buildEmbedUrl(entry, {
    season: safeSeason,
    episode: safeEpisode,
    color,
    autoPlay,
    progress: activeProgress,
  });
  const playerOrigin = new URL(embedUrl).origin;

  function clearChromeHideTimeout() {
    if (chromeHideTimeoutRef.current !== null) {
      window.clearTimeout(chromeHideTimeoutRef.current);
      chromeHideTimeoutRef.current = null;
    }
  }

  function revealChrome() {
    setIsChromeVisible(true);

    if (!isTheaterMode || showSettings) {
      return;
    }

    clearChromeHideTimeout();
    chromeHideTimeoutRef.current = window.setTimeout(() => {
      setIsChromeVisible(false);
    }, 2200);
  }

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== playerOrigin) {
        return;
      }

      const playerMessage = parsePlayerMessage(event.data);
      if (!playerMessage || playerMessage.type !== 'PLAYER_EVENT' || !playerMessage.data?.event) {
        return;
      }

      if (playerMessage.data.event === 'ended') {
        clearSavedWatchProgress(
          entry,
          playerMessage.data.season ?? safeSeason,
          playerMessage.data.episode ?? safeEpisode,
        );
        return;
      }

      saveWatchProgress(entry, playerMessage.data, safeSeason, safeEpisode);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [entry, playerOrigin, safeEpisode, safeSeason]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (showSettings) {
        setShowSettings(false);
        return;
      }

      if (isTheaterMode) {
        setIsChromeVisible(true);
        setIsTheaterMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterMode, showSettings]);

  useEffect(() => {
    clearChromeHideTimeout();

    if (!isTheaterMode || showSettings) {
      return;
    }

    chromeHideTimeoutRef.current = window.setTimeout(() => {
      setIsChromeVisible(false);
    }, 2200);

    return () => {
      clearChromeHideTimeout();
    };
  }, [isTheaterMode, showSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextUrl = new URL(window.location.href);
    if (isSeries) {
      nextUrl.searchParams.set('s', safeSeason);
      nextUrl.searchParams.set('e', safeEpisode);
    } else {
      nextUrl.searchParams.delete('s');
      nextUrl.searchParams.delete('e');
    }

    window.history.replaceState(null, '', nextUrl.toString());
  }, [isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    if (!isSeries || seasonDetailCache[safeSeason]) {
      return;
    }

    const abortController = new AbortController();

    void fetch(`/api/media/${encodeURIComponent(entry.slug)}/seasons/${safeSeason}?type=tv`, {
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setSeasonDetailsError(payload?.error || 'Unable to load season details right now.');
          return;
        }

        const payload = (await response.json()) as { data: SeasonDetails };
        setSeasonDetailCache((currentCache) => ({
          ...currentCache,
          [safeSeason]: payload.data,
        }));
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }

        setSeasonDetailsError('Unable to load season details right now.');
      });

    return () => {
      abortController.abort();
    };
  }, [entry.slug, isSeries, safeSeason, seasonDetailCache]);

  const handleSeasonChange = (nextSeason: string) => {
    if (!isSeries) {
      return;
    }

    const clampedSeason = clampPositiveInteger(nextSeason, entry.maxSeasons);
    setSeasonDetailsError(null);
    setSeason(clampedSeason);
    setEpisode((currentEpisode) => clampPositiveInteger(currentEpisode, getEpisodeLimit(entry, clampedSeason)));
  };

  const handleEpisodeChange = (nextEpisode: string) => {
    setEpisode(nextEpisode);
  };

  const handleFullscreenToggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await playerShellRef.current?.requestFullscreen();
    } catch {
      setIsBrowserFullscreen(false);
    }
  };

  const handleNavigatorToggle = () => {
    revealChrome();
    setShowNavigator((currentValue) => !currentValue);
  };

  const handleTheaterToggle = () => {
    clearChromeHideTimeout();
    setIsChromeVisible(true);

    if (!isTheaterMode) {
      setShowNavigator(false);
    }

    setIsTheaterMode((currentValue) => !currentValue);
  };

  const handleSettingsToggle = () => {
    revealChrome();
    setIsChromeVisible(true);
    setShowSettings((currentValue) => !currentValue);
  };

  return (
    <div
      onMouseMove={isTheaterMode ? revealChrome : undefined}
      onFocusCapture={isTheaterMode ? revealChrome : undefined}
      className={
        isTheaterMode
          ? 'fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-[#050505] text-white'
          : 'flex min-h-screen flex-col bg-[#050505] text-white'
      }
    >
      <header
        className={
          isTheaterMode
            ? `absolute inset-x-0 top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/5 bg-black/45 px-6 backdrop-blur-xl transition-all duration-300 ${
                isChromeVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
              }`
            : 'glass z-50 flex h-16 w-full items-center justify-between px-8'
        }
      >
        <button
          type="button"
          onClick={() => router.push('/')}
          className="group flex items-center gap-2 text-zinc-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium uppercase tracking-widest text-gray-400">Back</span>
        </button>

        <h1 className="hidden text-2xl font-black tracking-tighter text-netflix-red md:block">
          MOVIE DB
        </h1>

        <button
          type="button"
          title="Open player settings"
          aria-label="Open player settings"
          onClick={handleSettingsToggle}
          className="rounded-full p-2 text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-5 w-5" />
        </button>
      </header>

      {isTheaterMode && !isChromeVisible && (
        <div className="pointer-events-none fixed right-4 top-4 z-[80] flex items-center gap-3 md:right-6 md:top-6">
          <p className="hidden rounded-full border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-300 backdrop-blur-xl md:block">
            Press Esc to exit
          </p>
          <button
            type="button"
            onClick={handleTheaterToggle}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-xl transition-colors hover:bg-black/70"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Exit theater
          </button>
        </div>
      )}

      <main className="relative flex grow flex-col items-center justify-center">
        <div
          className={`mx-auto flex h-full w-full grow flex-col ${
            isTheaterMode ? 'max-w-[120rem] px-4 py-4 md:px-6' : 'max-w-[110rem] px-4 py-6 md:px-6'
          }`}
        >
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wider text-gray-400 transition-all duration-300 ${
              isTheaterMode
                ? isChromeVisible
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0'
                : 'opacity-100'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 px-3 py-1">{entry.type}</span>
              <span className="rounded-full border border-white/10 px-3 py-1">TMDB {entry.tmdbId}</span>
              <span className="rounded-full border border-white/10 px-3 py-1">slug {entry.slug}</span>
              {isSeries && (
                <span className="rounded-full border border-white/10 px-3 py-1">
                  season {safeSeason} episode {safeEpisode}
                </span>
              )}
              {!isCatalogEntry && (
                <span className="rounded-full border border-amber-400/30 px-3 py-1 text-amber-300">
                  manual TMDB route
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isSeries && (
                <button
                  type="button"
                  onClick={handleNavigatorToggle}
                  className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  {showNavigator ? 'Hide navigator' : 'Show navigator'}
                </button>
              )}
              <button
                type="button"
                onClick={handleTheaterToggle}
                className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                {isTheaterMode ? 'Exit theater' : 'Theater mode'}
              </button>
              <button
                type="button"
                onClick={handleFullscreenToggle}
                className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                {isBrowserFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                {isBrowserFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </button>
            </div>
          </div>

          <div className={`grid grow gap-6 ${isSeries && showNavigator ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
            <section className="min-w-0">
              <div
                className={`mb-4 flex items-start justify-between gap-4 transition-all duration-300 ${
                  isTheaterMode ? 'pointer-events-none max-h-0 overflow-hidden opacity-0' : 'max-h-60 opacity-100'
                }`}
              >
                <div className="max-w-3xl space-y-2">
                  <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">{entry.title}</h2>
                  <p className="text-sm leading-relaxed text-zinc-400">{entry.synopsis}</p>
                </div>
                <div className="hidden rounded-2xl border border-white/5 bg-white/5 p-4 text-xs uppercase tracking-widest text-zinc-400 md:block">
                  {isSeries ? <Tv className="mb-2 h-4 w-4" /> : <Clapperboard className="mb-2 h-4 w-4" />}
                  {isCatalogEntry ? 'catalog-backed route' : 'manual identifier mode'}
                </div>
              </div>

              <div
                ref={playerShellRef}
                className={`player-canvas relative w-full overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl ${
                  isTheaterMode
                    ? 'aspect-[16/8.8] min-h-[28rem] max-h-[calc(100vh-8rem)]'
                    : 'aspect-video'
                }`}
              >
                <iframe
                  src={embedUrl}
                  title={`${entry.title} player`}
                  className="absolute inset-0 h-full w-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                ></iframe>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent"></div>
                {isTheaterMode && (
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 transition-opacity duration-300 ${
                      isChromeVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <div className="max-w-xl rounded-2xl bg-black/35 px-4 py-3 backdrop-blur-md">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">
                        {isSeries ? `Season ${safeSeason} Episode ${safeEpisode}` : 'Now watching'}
                      </p>
                      <h3 className="mt-1 text-2xl font-black text-white">{entry.title}</h3>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 transition-all duration-300 ${
                  isTheaterMode ? (isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0') : 'opacity-100'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    {entry.slug}
                  </span>
                  <span>{entry.tmdbId}</span>
                  {isSeries && (
                    <span>
                      Season {safeSeason} has {safeEpisodeLimit} episodes
                    </span>
                  )}
                </div>
                <span>
                  Vidking keeps the native transport, volume, and episode selector in the embed. Watch progress is saved locally from player events.
                </span>
              </div>
            </section>

            {isSeries && showNavigator && (
              <aside className="glass flex min-h-[22rem] flex-col rounded-[1.75rem] p-4 xl:max-h-[calc(100vh-11rem)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">
                      Episode Navigator
                    </p>
                    <h3 className="mt-1 text-xl font-semibold text-white">Season {safeSeason}</h3>
                    {activeSeasonDetails?.overview && (
                      <p className="mt-2 line-clamp-2 max-w-xs text-xs leading-relaxed text-zinc-400">
                        {activeSeasonDetails.overview}
                      </p>
                    )}
                  </div>
                  <div className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300">
                    {safeEpisodeLimit} episodes
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {seasonOptions.map((seasonNumber) => {
                    const isActive = seasonNumber === safeSeason;
                    return (
                      <button
                        key={seasonNumber}
                        type="button"
                        onClick={() => handleSeasonChange(seasonNumber)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] transition-all ${
                          isActive
                            ? 'bg-netflix-red text-white shadow-lg shadow-red-900/25'
                            : 'border border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        Season {seasonNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="thin-scrollbar grid grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
                  {isSeasonDetailsLoading && !activeSeasonDetails
                    ? Array.from({ length: Math.min(safeEpisodeLimit, 4) }, (_, index) => (
                        <div
                          key={`episode-skeleton-${index + 1}`}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                        >
                          <div className="h-28 rounded-xl bg-white/6"></div>
                          <div className="mt-4 h-4 w-2/3 rounded-full bg-white/6"></div>
                          <div className="mt-3 h-3 w-full rounded-full bg-white/6"></div>
                          <div className="mt-2 h-3 w-4/5 rounded-full bg-white/6"></div>
                        </div>
                      ))
                    : (activeSeasonDetails?.episodes ?? episodeOptions.map((episodeNumber) => ({
                        airDate: undefined,
                        episodeNumber: Number.parseInt(episodeNumber, 10),
                        name: `Episode ${episodeNumber.padStart(2, '0')}`,
                        overview: '',
                        runtime: undefined,
                        seasonNumber: Number.parseInt(safeSeason, 10),
                        stillUrl: undefined,
                      }))).map((episodeData) => {
                    const episodeNumber = String(episodeData.episodeNumber);
                    const isActive = episodeNumber === safeEpisode;
                    return (
                      <button
                        key={episodeNumber}
                        type="button"
                        onClick={() => handleEpisodeChange(episodeNumber)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          isActive
                            ? 'border-netflix-red bg-netflix-red/10 text-white shadow-lg shadow-red-950/20'
                            : 'border-white/8 bg-white/[0.03] text-zinc-200 hover:border-white/18 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="overflow-hidden rounded-xl border border-white/6 bg-black/20">
                          {episodeData.stillUrl ? (
                            <img
                              src={episodeData.stillUrl}
                              alt={`${entry.title} Season ${safeSeason} Episode ${episodeNumber} still`}
                              className="h-32 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-32 w-full items-end bg-[radial-gradient(circle_at_top,_rgba(229,9,20,0.28),_rgba(255,255,255,0.04)_45%,_transparent_72%)] p-3 text-left">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-400">Episode preview</p>
                                <p className="mt-1 text-sm font-semibold text-white">{episodeData.name}</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-sm font-semibold">Episode {episodeNumber.padStart(2, '0')}</span>
                            <p className="mt-1 text-xs text-zinc-400">{episodeData.name}</p>
                          </div>
                          {isActive && (
                            <span className="rounded-full bg-netflix-red px-2 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-white">
                              Now playing
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-white/6 bg-gradient-to-br from-white/8 via-white/[0.03] to-transparent p-3 text-xs leading-relaxed text-zinc-400">
                          {episodeData.overview
                            ? episodeData.overview
                            : `Jump straight to Season ${safeSeason}, Episode ${episodeNumber} from the local navigator.`}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                          <span>{episodeData.airDate ?? 'Release date unavailable'}</span>
                          {episodeData.runtime ? <span>{episodeData.runtime} min</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {seasonDetailsError && (
                  <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200">
                    {seasonDetailsError}
                  </div>
                )}

                <p className="mt-4 text-xs leading-relaxed text-zinc-500">
                  Theater mode collapses the surrounding page chrome automatically while Vidking keeps its native transport, volume, and episode selector inside the embed.
                </p>
              </aside>
            )}
          </div>
        </div>

        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass absolute bottom-4 right-4 z-10 w-full max-w-xs rounded-2xl p-6 shadow-2xl md:bottom-8 md:right-8"
          >
            <h3 className="mb-4 text-lg font-bold">Player Settings</h3>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm text-zinc-400">Theme Color</p>
                <div className="flex gap-2">
                  {PLAYER_COLORS.map((colorOption) => (
                    <button
                      key={colorOption.value}
                      type="button"
                      title={`Set player accent to ${colorOption.label}`}
                      aria-label={`Set player accent to ${colorOption.label}`}
                      onClick={() => setColor(colorOption.value)}
                      className={`h-8 w-8 rounded-full border-2 ${colorOption.swatchClassName} ${
                        color === colorOption.value ? 'border-white' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="autoplay-toggle" className="text-sm text-gray-400">
                  Auto Play
                </label>
                <label htmlFor="autoplay-toggle" className="relative inline-flex cursor-pointer items-center">
                  <input
                    id="autoplay-toggle"
                    type="checkbox"
                    className="peer sr-only"
                    title="Toggle auto play"
                    checked={autoPlay}
                    onChange={(event) => setAutoPlay(event.target.checked)}
                  />
                  <div className="peer h-6 w-11 rounded-full bg-white/10 peer-focus:outline-none peer-checked:bg-netflix-red peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']"></div>
                </label>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs leading-relaxed text-zinc-400">
                <p className="font-semibold uppercase tracking-[0.24em] text-zinc-300">Control scope</p>
                <p>
                  Layout, theater mode, and episode navigation are controlled by this app shell.
                  Vidking still renders the native transport, volume, and episode selector inside the embed, while progress events are saved locally.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="input-glass mt-4 w-full rounded-lg py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}