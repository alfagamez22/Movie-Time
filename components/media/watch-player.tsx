'use client';

import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, SkipForward } from 'lucide-react';

import { buildPlayerEmbedUrl } from '@/lib/media/embed';
import {
  PLAYER_LABELS,
  usePlayerPreference,
  type PlayerChoice,
} from '@/lib/hooks/use-player-preference';
import {
  requestHomeScrollRestore,
  trackRecentlyWatched,
  useWatchedEpisodes,
} from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import {
  getEpisodeLimit,
  isAnimeProvider,
  isTvEntry,
  type EpisodePreview,
  type MediaEntry,
  type SeasonDetails,
} from '@/lib/media/types';
import { AnimeWatchPlayer } from './anime-watch-player';
import { PlayerViewControls } from './player-view-controls';
import type { WatchPlayerProps } from './watch-player.types';

interface NormalizedPlayerProgress {
  durationSeconds?: number;
  progressPercent?: number;
  progressSeconds: number;
}

const VIDFAST_ALLOWED_ORIGINS = new Set([
  'https://vidfast.pro',
  'https://vidfast.in',
  'https://vidfast.io',
  'https://vidfast.me',
  'https://vidfast.net',
  'https://vidfast.pm',
  'https://vidfast.xyz',
  'https://vidninja.pro',
  'https://www.vidninja.pro',
  'https://watch.vidninja.pro',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseMessageData(data: unknown): unknown {
  if (typeof data !== 'string') return data;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function readNumber(records: Record<string, unknown>[], keys: string[]): number | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }

  return undefined;
}

function readEventName(records: Record<string, unknown>[]): string {
  for (const record of records) {
    for (const key of ['type', 'event', 'name', 'action']) {
      const value = record[key];
      if (typeof value === 'string') return value.toLowerCase();
    }
  }

  return '';
}

function extractPlayerProgress(data: unknown): NormalizedPlayerProgress | null {
  const parsed = parseMessageData(data);
  if (!isRecord(parsed)) return null;

  const nestedRecords = [parsed.data, parsed.payload, parsed.detail, parsed.player, parsed.video].filter(isRecord);
  const records = [parsed, ...nestedRecords];
  const eventName = readEventName(records);
  const looksLikeProgressEvent = /progress|time|seek|pause|play|ended|update/.test(eventName);

  let progressSeconds = readNumber(records, [
    'currentTime',
    'current_time',
    'seconds',
    'time',
    'position',
    'playedSeconds',
  ]);
  const durationSeconds = readNumber(records, ['duration', 'totalDuration', 'total_duration', 'length']);
  let progressPercent = readNumber(records, ['progressPercent', 'progress_percent', 'percent', 'percentage']);
  const rawProgress = readNumber(records, ['progress']);

  if (rawProgress !== undefined && progressSeconds === undefined) {
    if (durationSeconds && rawProgress <= 100) {
      progressPercent = progressPercent ?? (rawProgress <= 1 ? rawProgress * 100 : rawProgress);
      progressSeconds = durationSeconds * (progressPercent / 100);
    } else {
      progressSeconds = rawProgress;
    }
  } else if (progressSeconds === undefined && durationSeconds && progressPercent !== undefined) {
    progressSeconds = durationSeconds * (progressPercent / 100);
  }

  if (progressSeconds === undefined || !Number.isFinite(progressSeconds) || progressSeconds < 0) {
    return null;
  }

  if (!looksLikeProgressEvent && durationSeconds === undefined && progressPercent === undefined) {
    return null;
  }

  const clampedPercent =
    progressPercent !== undefined && Number.isFinite(progressPercent)
      ? Math.min(100, Math.max(0, progressPercent))
      : durationSeconds && durationSeconds > 0
        ? Math.min(100, Math.max(0, (progressSeconds / durationSeconds) * 100))
        : undefined;

  return {
    durationSeconds,
    progressPercent: clampedPercent,
    progressSeconds,
  };
}


function isAllowedVidFastOrigin(origin: string, expectedOrigin: string): boolean {
  if (origin === expectedOrigin || VIDFAST_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'watch.vidninja.pro' || hostname === 'vidninja.pro' || hostname.endsWith('.vidninja.pro');
  } catch {
    return false;
  }
}

function buildEpisodeHistoryKey(season: string, episodeNumber: string): string {
  return `${season}:${episodeNumber}`;
}

function LoadingOverlay({
  isLoading,
  player,
  onSwitchPlayer,
  onReload,
  showFallback,
}: {
  isLoading: boolean;
  player: PlayerChoice;
  onSwitchPlayer: (choice: PlayerChoice) => void;
  onReload: () => void;
  showFallback: boolean;
}) {
  if (!isLoading && !showFallback) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
      <div className="pointer-events-auto relative max-w-md rounded-2xl border border-white/10 bg-black/75 p-5 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">
          {showFallback ? 'Playback Check' : 'Loading Player'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {showFallback ? 'The embedded player did not finish loading.' : 'Preparing your stream...'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {showFallback
            ? player === '2'
              ? 'VidSrc may not be supported on your browser. Try P1 (VidFast) or P3 (Videasy) instead.'
              : 'Reload this episode or switch the available playback option if the stream stays blank.'
            : 'Opening the stream wrapper now.'}
        </p>

        <button
            type="button"
            onClick={onReload}
            className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Reload
          </button>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {(['1', '2', '3', '4', '5', '6', '7'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onSwitchPlayer(choice)}
                title={`Switch to ${PLAYER_LABELS[choice]}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  player === choice
                    ? 'border-netflix-red bg-netflix-red text-white'
                    : 'border-white/15 bg-white/5 text-zinc-200 hover:bg-white/15'
                }`}
              >
                P{choice} · {PLAYER_LABELS[choice]}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export function WatchPlayer(props: WatchPlayerProps) {
  if (isAnimeProvider(props.entry.provider)) {
    return <AnimeWatchPlayer {...props} />;
  }

  return <StandardWatchPlayer {...props} />;
}

function StandardWatchPlayer({
  entry,
  experience,
  imdbId = null,
  initialPlayback,
  initialSeasonDetails = null,
}: WatchPlayerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const isSeries = isTvEntry(entry);
  const canSyncWatchHistory = Boolean(session?.user?.id);
  const watchedEpisodeKeys = useWatchedEpisodes(entry, experience.id);

  const [season, setSeason] = useState(initialPlayback.season);
  const [episode, setEpisode] = useState(initialPlayback.episode);
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<SeasonDetails | null>(initialSeasonDetails);
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlayerLoading, setIsPlayerLoading] = useState(true);
  const [showPlayerFallback, setShowPlayerFallback] = useState(false);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const [isEpisodeListVisible, setIsEpisodeListVisible] = useState(true);
  const { player, setPlayer } = usePlayerPreference();
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const hasIframeLoadedRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const vidsrcElapsedRef = useRef(0);

  const safeSeason = isSeries
    ? String(Math.min(Math.max(1, Number.parseInt(season, 10)), entry.maxSeasons))
    : '1';
  const safeEpisodeLimit = isSeries
    ? (activeSeasonDetails?.episodeCount ?? getEpisodeLimit(entry, safeSeason))
    : 1;
  const safeEpisode = String(Math.min(Math.max(1, Number.parseInt(episode, 10)), safeEpisodeLimit));
  const maxSeasons = isTvEntry(entry) ? entry.maxSeasons : 1;

  const seasonOptions = useMemo(
    () => (isSeries ? Array.from({ length: maxSeasons }, (_, index) => String(index + 1)) : []),
    [isSeries, maxSeasons],
  );
  const seasonEpisodeCards = useMemo<EpisodePreview[]>(() => {
    if (activeSeasonDetails?.episodes?.length) {
      return activeSeasonDetails.episodes;
    }

    return Array.from({ length: safeEpisodeLimit }, (_, index) => {
      const episodeNumber = String(index + 1);
      return {
        airDate: undefined,
        episodeNumber: Number.parseInt(episodeNumber, 10),
        name: `Episode ${episodeNumber.padStart(2, '0')}`,
        overview: '',
        runtime: undefined,
        seasonNumber: Number.parseInt(safeSeason, 10),
      };
    });
  }, [activeSeasonDetails, safeEpisodeLimit, safeSeason]);

  const playbackOptions = {
    ...initialPlayback,
    episode: safeEpisode,
    language: initialPlayback.language,
    progress: player === '4' || player === '5' || player === '6' || player === '7' ? null : initialPlayback.progress,
    season: safeSeason,
  };
  const isVidFastPlayer = player === '1';
  const embedUrl = buildPlayerEmbedUrl(entry, playbackOptions, player, imdbId);

  const handleEpisodeChange = useCallback((newEpisode: string) => {
    setIsPlayerLoading(true);
    setShowPlayerFallback(false);
    setEpisode(newEpisode);
  }, []);

  useEffect(() => {
    trackRecentlyWatched(
      entry,
      {
        episode: isSeries ? safeEpisode : undefined,
        season: isSeries ? safeSeason : undefined,
      },
      experience.id,
      canSyncWatchHistory,
    );
  }, [canSyncWatchHistory, entry, experience.id, isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    if (!embedUrl) {
      return;
    }

    hasIframeLoadedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (hasIframeLoadedRef.current) return;
      setIsPlayerLoading(false);
      setShowPlayerFallback(true);
    }, 12_000);

    return () => window.clearTimeout(timeoutId);
  }, [embedUrl]);

  useEffect(() => {
    if (!embedUrl) {
      return;
    }

    const expectedOrigin = new URL(embedUrl, window.location.origin).origin;

    const onMessage = (event: MessageEvent) => {
      const isTrackedSource = event.source === iframeRef.current?.contentWindow;
      if (!isTrackedSource) return;
      if (isVidFastPlayer ? !isAllowedVidFastOrigin(event.origin, expectedOrigin) : event.origin !== expectedOrigin) return;

      hasIframeLoadedRef.current = true;
      setIsPlayerLoading(false);
      setShowPlayerFallback(false);

      const progress = extractPlayerProgress(event.data);
      if (!progress) return;

      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5_000 && progress.progressPercent !== 100) return;
      lastProgressWriteRef.current = now;

      trackRecentlyWatched(
        entry,
        {
          durationSeconds: progress.durationSeconds,
          episode: isSeries ? safeEpisode : undefined,
          progressPercent: progress.progressPercent,
          progressSeconds: progress.progressSeconds,
          season: isSeries ? safeSeason : undefined,
        },
        experience.id,
        canSyncWatchHistory,
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [canSyncWatchHistory, embedUrl, entry, experience.id, isSeries, isVidFastPlayer, safeEpisode, safeSeason]);

  // VidSrc (P2) doesn't send postMessage progress events, so we track elapsed
  // wall-clock time as a proxy for playback progress while the player is active.
  useEffect(() => {
    if (player !== '2' || isPlayerLoading || showPlayerFallback) return;

    vidsrcElapsedRef.current = 0;
    const intervalId = setInterval(() => {
      vidsrcElapsedRef.current += 10;
      trackRecentlyWatched(
        entry,
        {
          episode: isSeries ? safeEpisode : undefined,
          progressSeconds: vidsrcElapsedRef.current,
          season: isSeries ? safeSeason : undefined,
        },
        experience.id,
        canSyncWatchHistory,
      );
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [canSyncWatchHistory, player, isPlayerLoading, showPlayerFallback, entry, experience.id, isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    const href = buildWatchHref(entry, {
      autoPlay: initialPlayback.autoPlay,
      basePath: experience.watchBasePath,
      color: initialPlayback.color,
      episode: safeEpisode,
      progress: null,
      season: safeSeason,
    });

    if (`${window.location.pathname}${window.location.search}` === href) return;

    startTransition(() => router.replace(href, { scroll: false }));
  }, [
    entry,
    experience.watchBasePath,
    initialPlayback.autoPlay,
    initialPlayback.color,
    router,
    safeEpisode,
    safeSeason,
  ]);

  const revealChrome = useCallback(() => {
    setIsChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => {
      setIsChromeVisible(false);
      iframeRef.current?.focus();
    }, 3000);
  }, []);

  const hideChrome = useCallback(() => {
    if (chromeTimerRef.current) {
      clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = null;
    }
    setIsChromeVisible(false);
    iframeRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Don't hijack Escape when the user is typing in an input.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      requestHomeScrollRestore(experience.id);
      router.push(experience.homeHref, { scroll: false });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [experience.homeHref, experience.id, router]);



  const handleSwitchPlayer = useCallback(
    (choice: PlayerChoice) => {
      if (player === choice) {
        return;
      }
      setIsPlayerLoading(true);
      setShowPlayerFallback(false);
      setPlayer(choice);
    },
    [player, setPlayer],
  );

  const handleReloadPlayer = useCallback(() => {
    setIsPlayerLoading(true);
    setShowPlayerFallback(false);
    setIframeReloadKey((value) => value + 1);
  }, []);

  const handleSeasonChange = useCallback(
    async (newSeason: string) => {
      setIsPlayerLoading(true);
      setShowPlayerFallback(false);
      setSeason(newSeason);
      setEpisode('1');
      setActiveSeasonDetails(null);
      setSeasonDetailsError(null);

      try {
        const response = await fetch(
          `/api/media/${encodeURIComponent(entry.slug)}/seasons/${newSeason}?type=${entry.type}&id=${entry.id}`,
        );
        if (!response.ok) throw new Error('Season fetch failed');
        const json: { data: SeasonDetails } = await response.json();
        setActiveSeasonDetails(json.data);
      } catch {
        setSeasonDetailsError('Could not load episode list for this season.');
      }
    },
    [entry.id, entry.slug, entry.type],
  );

  const handleBackToLibrary = useCallback(() => {
    requestHomeScrollRestore(experience.id);
    router.push(experience.homeHref, { scroll: false });
  }, [experience.homeHref, experience.id, router]);

  return (
    <div
      ref={playerShellRef}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') revealChrome();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') hideChrome();
      }}
      className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-black text-white landscape:flex-row"
    >
      <div
        className={`relative w-full bg-black landscape:h-full landscape:min-h-0 landscape:min-w-0 landscape:flex-1 ${
          isSeries && isEpisodeListVisible ? 'aspect-video shrink-0' : 'min-h-0 flex-1'
        }`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[calc(env(safe-area-inset-top)+2px)] bg-gradient-to-b from-black/80 to-transparent" />
        <button
          type="button"
          onClick={handleBackToLibrary}
          aria-label="Back to library"
          title="Back to library (Esc)"
          className={`absolute left-[calc(env(safe-area-inset-left)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-full bg-black/45 text-zinc-100 backdrop-blur-md transition-opacity duration-300 hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/20 ${
            isChromeVisible ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <PlayerViewControls
          targetRef={playerShellRef}
          episodeListVisible={isSeries ? isEpisodeListVisible : undefined}
          onToggleEpisodeList={isSeries ? () => setIsEpisodeListVisible((visible) => !visible) : undefined}
          className={`absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex items-center gap-2 transition-opacity duration-300 ${
            isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 flex justify-center transition-all duration-300 ${
            isChromeVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <span className="line-clamp-1 max-w-[60vw] rounded-full bg-black/65 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-lg backdrop-blur-md sm:text-[12px]">
            {entry.title}
            {isSeries ? ` S${safeSeason.padStart(2, '0')}E${safeEpisode.padStart(2, '0')}` : ''}
          </span>
        </div>

        <LoadingOverlay
          isLoading={isPlayerLoading}
          player={player}
          onSwitchPlayer={handleSwitchPlayer}
          onReload={handleReloadPlayer}
          showFallback={showPlayerFallback}
        />

        <iframe
          key={`${entry.provider}-${player}-${safeSeason}-${safeEpisode}-${iframeReloadKey}`}
          ref={iframeRef}
          src={embedUrl}
          className="h-full w-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-storage-access-by-user-activation"
          onError={() => {
            hasIframeLoadedRef.current = false;
            setIsPlayerLoading(false);
            setShowPlayerFallback(true);
          }}
          onLoad={() => {
            hasIframeLoadedRef.current = true;
            setIsPlayerLoading(false);
            setShowPlayerFallback(false);
          }}
          referrerPolicy={player === '5' ? 'origin' : 'no-referrer'}
          title={`Watch ${entry.title}`}
        />
      </div>

      {isSeries && isEpisodeListVisible ? (
          <EpisodeSidebar
            safeSeason={safeSeason}
            safeEpisode={safeEpisode}
            safeEpisodeLimit={safeEpisodeLimit}
            seasonOptions={seasonOptions}
            seasonEpisodeCards={seasonEpisodeCards}
            seasonDetailsError={seasonDetailsError}
            watchedEpisodeKeys={watchedEpisodeKeys}
            onSeasonChange={(nextSeason) => void handleSeasonChange(nextSeason)}
            onEpisodeChange={handleEpisodeChange}
            onNextEpisode={() => {
              handleEpisodeChange(String(Number.parseInt(safeEpisode, 10) + 1));
              iframeRef.current?.focus();
            }}
          />
      ) : null}
    </div>
  );
}

interface EpisodeSidebarProps {
  onEpisodeChange: (episode: string) => void;
  onNextEpisode?: () => void;
  onSeasonChange: (season: string) => void;
  safeEpisode: string;
  safeEpisodeLimit: number;
  safeSeason: string;
  seasonDetailsError: string | null;
  seasonEpisodeCards: EpisodePreview[];
  seasonOptions: string[];
  watchedEpisodeKeys: Set<string>;
}

function EpisodeSidebar({
  safeSeason,
  safeEpisode,
  safeEpisodeLimit,
  seasonOptions,
  seasonEpisodeCards,
  seasonDetailsError,
  watchedEpisodeKeys,
  onSeasonChange,
  onEpisodeChange,
  onNextEpisode,
}: EpisodeSidebarProps) {
  return (
    <div className="flex w-full shrink-0 flex-col border-t border-white/5 bg-[#111] landscape:h-full landscape:w-[clamp(16rem,26vw,20rem)] landscape:border-l landscape:border-t-0">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-4 py-3 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <select
          value={safeSeason}
          onChange={(event) => onSeasonChange(event.target.value)}
          className="min-h-11 min-w-0 flex-1 touch-manipulation cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none transition focus:border-white/25"
          title="Select season"
          aria-label="Select season"
        >
          {seasonOptions.map((season) => (
            <option key={season} value={season} className="bg-[#1a1a1a] text-white">
              Season {season}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-2">
          {onNextEpisode && safeEpisodeLimit > Number.parseInt(safeEpisode, 10) ? (
            <button
              type="button"
              onClick={onNextEpisode}
              aria-label="Next episode"
              title="Next episode"
              className="inline-flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/15"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span className="text-xs text-zinc-500">{safeEpisodeLimit} Episodes</span>
        </div>
      </div>

      <EpisodeCardList
        cards={seasonEpisodeCards}
        onEpisodeChange={onEpisodeChange}
        safeEpisode={safeEpisode}
        safeSeason={safeSeason}
        watchedEpisodeKeys={watchedEpisodeKeys}
      />

      {seasonDetailsError ? (
        <div className="m-3 shrink-0 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-xs text-amber-200">
          {seasonDetailsError}
        </div>
      ) : null}
    </div>
  );
}

function EpisodeCardList({
  cards,
  onEpisodeChange,
  safeEpisode,
  safeSeason,
  watchedEpisodeKeys,
}: {
  cards: EpisodePreview[];
  onEpisodeChange: (episode: string) => void;
  safeEpisode: string;
  safeSeason: string;
  watchedEpisodeKeys: Set<string>;
}) {
  return (
    <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
      <label htmlFor="episode-selector" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        Episode
      </label>
      <select
        id="episode-selector"
        value={safeEpisode}
        onChange={(event) => onEpisodeChange(event.target.value)}
        className="min-h-11 w-full touch-manipulation cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white outline-none transition focus:border-white/25"
        aria-label="Select episode"
      >
        {cards.map((episode) => {
          const episodeNumber = String(episode.episodeNumber);
          const isWatched = watchedEpisodeKeys.has(buildEpisodeHistoryKey(safeSeason, episodeNumber));
          return (
            <option key={episodeNumber} value={episodeNumber} className="bg-[#111] text-white">
              E{episodeNumber.padStart(2, '0')} · {episode.name}{isWatched ? ' · Watched' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
