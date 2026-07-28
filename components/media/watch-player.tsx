'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, SkipForward } from 'lucide-react';

import { useEpisodeAutoScroll } from '@/lib/hooks/use-episode-auto-scroll';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import { buildPlayerEmbedUrl, type PlaybackOptions } from '@/lib/media/embed';
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
  posterUrl,
  pressToPlay,
  onPressToPlay,
  onSwitchPlayer,
  onReload,
  showFallback,
}: {
  isLoading: boolean;
  player: PlayerChoice;
  posterUrl?: string;
  pressToPlay: boolean;
  onPressToPlay?: () => void;
  onSwitchPlayer: (choice: PlayerChoice) => void;
  onReload: () => void;
  showFallback: boolean;
}) {
  if (!pressToPlay && !isLoading && !showFallback) {
    return null;
  }

  const showPressToPlay = pressToPlay && Boolean(posterUrl);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 backdrop-blur-sm ${
        showPressToPlay ? 'bg-black/35' : 'bg-black/55'
      }`}
    >
      {showPressToPlay && posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
      ) : null}
      <div
        className={`pointer-events-auto relative max-w-md rounded-2xl border border-white/10 p-5 text-center shadow-2xl ${
          showPressToPlay ? 'bg-black/80' : 'bg-black/75'
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">
          {showPressToPlay ? 'Ready to Play' : showFallback ? 'Playback Check' : 'Loading Player'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {showPressToPlay
            ? 'Press play to start the stream'
            : showFallback
              ? 'The embedded player did not finish loading.'
              : 'Preparing your stream...'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {showPressToPlay
            ? 'Streams start only when you ask. This avoids a long wait on first open.'
            : showFallback
              ? player === '2'
                ? 'VidSrc may not be supported on your browser. Try P1 (VidFast) or P3 (Videasy) instead.'
                : 'Reload this episode or switch the available playback option if the stream stays blank.'
              : 'Opening the stream wrapper now.'}
        </p>

        {showPressToPlay ? (
          <button
            type="button"
            onClick={onPressToPlay}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-netflix-red px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#f6121d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="ml-0.5 inline-block h-0 w-0 border-b-[6px] border-l-[10px] border-t-[6px] border-b-transparent border-t-transparent border-l-white" />
            Press Play
          </button>
        ) : null}

        {!showPressToPlay ? (
          <button
            type="button"
            onClick={onReload}
            className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Reload
          </button>
        ) : null}

        {!showPressToPlay ? (
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
        ) : null}
      </div>
    </div>
  );
}

function EpisodeStillImage({
  alt,
  episodeLabel,
  fallbackSrc,
  priority,
  src,
}: {
  alt: string;
  episodeLabel?: string;
  fallbackSrc?: string;
  priority: boolean;
  src?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const shouldUseFallback = Boolean(src && failedSrc === src);
  const resolvedSrc = shouldUseFallback ? fallbackSrc : src || fallbackSrc;
  const usePlaceholder = !resolvedSrc || Boolean(src && fallbackSrc && src === fallbackSrc);

  if (usePlaceholder) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(135deg,#111827_0%,#171717_45%,#1f2937_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.20),transparent_35%)]" />
        <div className="absolute inset-x-0 bottom-0 p-2">
          <span className="rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-100 shadow-lg backdrop-blur-sm">
            {episodeLabel ?? 'Episode'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      fill
      sizes="112px"
      className="object-cover"
      priority={priority}
      onError={() => {
        if (src && !shouldUseFallback && fallbackSrc && fallbackSrc !== resolvedSrc) {
          setFailedSrc(src);
        }
      }}
    />
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
  const [pressToPlay, setPressToPlay] = useState(false);
  const [isEpisodeListVisible, setIsEpisodeListVisible] = useState(true);
  const { player, setPlayer } = usePlayerPreference();
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const hasIframeLoadedRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const vidsrcElapsedRef = useRef(0);
  const hasStartedPlaybackRef = useRef<boolean | null>(null);

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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
    if (hasStartedPlaybackRef.current !== null) return;
    hasStartedPlaybackRef.current = false;
    let alreadyStarted = false;
    try {
      alreadyStarted = sessionStorage.getItem('papiflix-player-autostart-hint') === '1';
    } catch {
      // Treat storage failure as "first visit" so the gate still shows.
    }
    setPressToPlay(!alreadyStarted);
  }, []);

  const handleStartPlayback = useCallback(() => {
    setPressToPlay(false);
    hasStartedPlaybackRef.current = true;
    try {
      sessionStorage.setItem('papiflix-player-autostart-hint', '1');
    } catch {
      // Best-effort hint; the gate will simply re-show next session.
    }
  }, []);

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

        {embedUrl ? (
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download video"
            title="Open stream in new tab to download"
            className={`absolute left-[calc(env(safe-area-inset-left)+4.5rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-100 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <Download className="h-5 w-5" />
          </a>
        ) : null}

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
          posterUrl={entry.backdropUrl ?? entry.posterUrl}
          pressToPlay={pressToPlay}
          onPressToPlay={pressToPlay ? handleStartPlayback : undefined}
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#111] landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div
          role="group"
          aria-label="Select season"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {seasonOptions.map((season) => (
            <button
              key={season}
              type="button"
              onClick={() => onSeasonChange(season)}
              aria-pressed={season === safeSeason}
              className={`min-h-11 shrink-0 touch-manipulation select-none rounded-full border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                season === safeSeason
                  ? 'border-white/25 bg-white/15 text-white'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white active:bg-white/15'
              }`}
            >
              Season {season}
            </button>
          ))}
        </div>
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
  const containerRef = useRef<HTMLDivElement>(null);
  useEpisodeAutoScroll(containerRef, `${safeSeason}:${safeEpisode}`, [safeSeason]);

  return (
    <div
      ref={containerRef}
      className="thin-scrollbar flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
    >
      {cards.map((episode) => {
        const episodeNumber = String(episode.episodeNumber);
        const isActive = episodeNumber === safeEpisode;
        const isWatched = watchedEpisodeKeys.has(buildEpisodeHistoryKey(safeSeason, episodeNumber));

        return (
          <button
            key={episodeNumber}
            type="button"
            data-episode-active={isActive ? 'true' : 'false'}
            onClick={() => onEpisodeChange(episodeNumber)}
            className={`flex w-full touch-manipulation select-none gap-3 border-b border-white/5 p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white ${
              isActive ? 'bg-white/[0.08]' : isWatched ? 'bg-black/30 opacity-80 hover:bg-white/[0.045]' : 'hover:bg-white/[0.05] active:bg-white/[0.1]'
            }`}
          >
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-black/40 landscape:h-16 landscape:w-28">
              {isActive ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white">
                    <div className="ml-0.5 border-b-[5px] border-l-[8px] border-t-[5px] border-b-transparent border-t-transparent border-l-white" />
                  </div>
                </div>
              ) : null}
              <EpisodeStillImage
                alt=""
                episodeLabel={`E${episodeNumber.padStart(2, '0')}`}
                fallbackSrc={episode.fallbackStillUrl}
                priority={isActive}
                src={episode.stillUrl}
              />
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="mb-0.5 text-[11px] text-zinc-400">
                E{episodeNumber}
                {episode.runtime != null ? ` · ${episode.runtime}m` : ''}
              </p>
              <p className="line-clamp-1 text-xs font-medium text-white">{episode.name}</p>
              {isWatched && !isActive ? (
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Watched
                </p>
              ) : null}
              {episode.overview ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{episode.overview}</p>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
