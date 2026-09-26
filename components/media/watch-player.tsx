'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, SkipForward } from 'lucide-react';

import { useEpisodeAutoScroll } from '@/lib/hooks/use-episode-auto-scroll';
import { buildVideasyEmbedUrl } from '@/lib/media/embed';
import { fromTmdbEpisodeCoordinates } from '@/lib/media/season-layout';
import {
  requestHomeScrollRestore,
  trackRecentlyWatched,
  useWatchedEpisodes,
} from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import { playbackBackTarget } from '@/lib/media/playback-return';
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
import { useWatchBeacon } from '@/lib/hooks/use-watch-beacon';
import { emitPlayerProgress } from '@/lib/party/player-events';
import { WatchPartyPlayerLayer, WatchPartyRoot, WatchPartySidebar, type FollowTarget } from '@/components/party/watch-party';

interface NormalizedPlayerProgress {
  durationSeconds?: number;
  progressPercent?: number;
  progressSeconds: number;
}

/* Previous P1–P7 choice and VidFast origin logic, disabled for Videasy-only PapiFlix.
const PLAYER_CHOICES: PlayerChoice[] = ['1', '2', '3', '4', '5', '6', '7'];

function getAvailablePlayerChoices(imdbId: string | null): PlayerChoice[] {
  return imdbId ? PLAYER_CHOICES : PLAYER_CHOICES.filter((choice) => choice !== '7');
}

function getNextPlayerChoice(player: PlayerChoice, availableChoices: PlayerChoice[]): PlayerChoice {
  if (availableChoices.length === 0) {
    return '1';
  }

  const currentIndex = availableChoices.indexOf(player);
  return availableChoices[(currentIndex + 1 + availableChoices.length) % availableChoices.length] ?? availableChoices[0] ?? '1';
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
*/

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
  const looksLikeProgressEvent = eventName === 'player_event' || /progress|time|seek|pause|play|ended|update/.test(eventName);

  let progressSeconds = readNumber(records, [
    'currentTime',
    'current_time',
    'seconds',
    'time',
    'position',
    'playedSeconds',
    'player_progress',
  ]);
  const durationSeconds = readNumber(records, ['duration', 'totalDuration', 'total_duration', 'length', 'player_duration']);
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

function extractPlayerEpisode(data: unknown, tmdbId: string): { season: string; episode: string } | null {
  const parsed = parseMessageData(data);
  if (!isRecord(parsed) || parsed.type !== 'PLAYER_EVENT' || !isRecord(parsed.data) ||
      !isRecord(parsed.data.player_info)) return null;

  const info = parsed.data.player_info;
  if (String(info.tmdb) !== tmdbId) return null;

  const season = readNumber([info], ['season']);
  const episode = readNumber([info], ['episode']);
  if (!season || !episode || !Number.isInteger(season) || !Number.isInteger(episode)) return null;
  return { season: String(season), episode: String(episode) };
}


/* Previous VidFast message origin allowance, disabled.
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
*/

function buildEpisodeHistoryKey(season: string, episodeNumber: string): string {
  return `${season}:${episodeNumber}`;
}

function LoadingOverlay({
  isLoading,
  message,
  onReload,
  showFallback,
}: {
  isLoading: boolean;
  message: string;
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
          {showFallback ? 'Videasy needs another playback attempt.' : 'Preparing your stream...'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {message || 'Opening Videasy now.'}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onReload}
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

/* Previous player picker retained as commented reference.
function PlayerSelect({
  player,
  availableChoices = PLAYER_CHOICES,
  onSwitchPlayer,
  compact = false,
}: {
  player: PlayerChoice;
  availableChoices?: PlayerChoice[];
  onSwitchPlayer: (choice: PlayerChoice) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () => document.removeEventListener('pointerdown', handleClickOutside);
    }
  }, [open]);

  const selectedLabel = `P${player} · ${PLAYER_LABELS[player]}`;

  return (
    <div
      ref={containerRef}
      className={compact ? 'relative inline-block text-left' : 'relative inline-block w-full max-w-[16rem] text-left'}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={compact ? `Select player, currently ${selectedLabel}` : undefined}
        title={compact ? selectedLabel : undefined}
        className={
          compact
            ? 'flex h-12 min-w-12 touch-manipulation items-center justify-center gap-1.5 rounded-full bg-black/45 px-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/20'
            : 'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white'
        }
      >
        <span>{compact ? `P${player}` : selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Select player"
          className={`absolute z-50 mt-1.5 overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] py-1 shadow-2xl ${
            compact ? 'right-0 w-[min(16rem,calc(100vw-1.5rem))]' : 'w-full min-w-[16rem]'
          }`}
        >
          {PLAYER_CHOICES.map((choice) => {
            const isSelected = player === choice;
            const isAvailable = availableChoices.includes(choice);
            return (
              <li key={choice} role="option" aria-selected={isSelected} aria-disabled={!isAvailable}>
                <button
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    if (!isAvailable) return;
                    onSwitchPlayer(choice);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    !isAvailable
                      ? 'cursor-not-allowed text-zinc-600'
                      : isSelected
                        ? 'bg-netflix-red text-white'
                        : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="font-medium">P{choice} · {PLAYER_LABELS[choice]}</span>
                  {!isAvailable && choice === '7' ? (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                      No IMDb ID
                    </span>
                  ) : isSelected ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
*/

export function WatchPlayer(props: WatchPlayerProps) {
  if (isAnimeProvider(props.entry.provider)) {
    return <AnimeWatchPlayer {...props} />;
  }

  return <StandardWatchPlayer {...props} />;
}

function StandardWatchPlayer({
  entry,
  experience,
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
  const [embedPlayback, setEmbedPlayback] = useState({ season: initialPlayback.season, episode: initialPlayback.episode });
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<SeasonDetails | null>(initialSeasonDetails);
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlayerLoading, setIsPlayerLoading] = useState(true);
  const [showPlayerFallback, setShowPlayerFallback] = useState(false);
  const [playerMessage, setPlayerMessage] = useState('Opening Videasy now.');
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const [isEpisodeListVisible, setIsEpisodeListVisible] = useState(true);
  const [partyStartAt, setPartyStartAt] = useState<number | null>(null);
  const [partyPaused, setPartyPaused] = useState(false);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const hasIframeLoadedRef = useRef(false);
  const lastProgressWriteRef = useRef(0);

  const safeSeason = isSeries
    ? String(Math.min(Math.max(1, Number.parseInt(season, 10)), entry.maxSeasons))
    : '1';
  const safeEpisodeLimit = isSeries
    ? (activeSeasonDetails?.episodeCount ?? getEpisodeLimit(entry, safeSeason))
    : 1;
  const safeEpisode = String(Math.min(Math.max(1, Number.parseInt(episode, 10)), safeEpisodeLimit));
  const maxSeasons = isTvEntry(entry) ? entry.maxSeasons : 1;
  useWatchBeacon({ entry, episode: isSeries ? embedPlayback.episode : null, experience: experience.id, season: isSeries ? embedPlayback.season : null });

  const seasonOptions = useMemo(
    () => (isSeries ? Array.from({ length: maxSeasons }, (_, index) => String(index + 1)) : []),
    [isSeries, maxSeasons],
  );
  const seasonEpisodeCards = useMemo<EpisodePreview[]>(() => {
    if (activeSeasonDetails?.episodes?.length) {
      return activeSeasonDetails.episodes.map((episode) => ({
        ...episode,
        fallbackStillUrl: episode.fallbackStillUrl ?? entry.backdropUrl ?? entry.posterUrl,
      }));
    }

    return Array.from({ length: safeEpisodeLimit }, (_, index) => {
      const episodeNumber = String(index + 1);
      return {
        airDate: undefined,
        episodeNumber: Number.parseInt(episodeNumber, 10),
        name: `Episode ${episodeNumber.padStart(2, '0')}`,
        fallbackStillUrl: entry.backdropUrl ?? entry.posterUrl,
        overview: '',
        runtime: undefined,
        seasonNumber: Number.parseInt(safeSeason, 10),
      };
    });
  }, [activeSeasonDetails, entry.backdropUrl, entry.posterUrl, safeEpisodeLimit, safeSeason]);

  // Previous player preference and P1–P7 fallback are disabled.
  /*
  const availablePlayerChoices = useMemo(() => getAvailablePlayerChoices(imdbId), [imdbId]);
  const effectivePlayer = availablePlayerChoices.includes(player) ? player : availablePlayerChoices[0];
  */
  const playbackOptions = {
    ...initialPlayback,
    episode: embedPlayback.episode,
    language: initialPlayback.language,
    progress: partyStartAt ?? (embedPlayback.season === initialPlayback.season && embedPlayback.episode === initialPlayback.episode
      ? initialPlayback.progress : null),
    season: embedPlayback.season,
  };
  const embedUrl = buildVideasyEmbedUrl(entry, playbackOptions);

  const handleEpisodeChange = useCallback((newEpisode: string) => {
    setIsPlayerLoading(true);
    setShowPlayerFallback(false);
    setPlayerMessage('Opening Videasy now.');
    setPartyStartAt(null);
    setEpisode(newEpisode);
    setEmbedPlayback({ season: safeSeason, episode: newEpisode });
  }, [safeSeason]);

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
    lastProgressWriteRef.current = 0;
    const timeoutId = window.setTimeout(() => {
      if (hasIframeLoadedRef.current) return;
      setIsPlayerLoading(false);
      setPlayerMessage('Videasy is taking longer than expected to load.');
      setShowPlayerFallback(true);
    }, 30_000);

    return () => window.clearTimeout(timeoutId);
  }, [embedUrl, iframeReloadKey]);

  useEffect(() => {
    if (!embedUrl) {
      return;
    }

    const expectedOrigin = new URL(embedUrl, window.location.origin).origin;

    const onMessage = (event: MessageEvent) => {
      const isTrackedSource = event.source === iframeRef.current?.contentWindow;
      if (!isTrackedSource) return;
      if (event.origin !== expectedOrigin) return;

      hasIframeLoadedRef.current = true;
      setIsPlayerLoading(false);
      setShowPlayerFallback(false);

      const parsedMessage = parseMessageData(event.data);
      if (isRecord(parsedMessage) && parsedMessage.type === 'PLAYER_EVENT' && isRecord(parsedMessage.data)) {
        const status = typeof parsedMessage.data.player_status === 'string'
          ? parsedMessage.data.player_status.toLowerCase()
          : '';
        if (status === 'playing') {
          setPlayerMessage('');
        } else if (status === 'error' || status === 'failed') {
          setPlayerMessage('Videasy could not play this source. Reload the player to ask Videasy to select a source again.');
          setShowPlayerFallback(true);
        }
      }

      const playerEpisode = extractPlayerEpisode(event.data, entry.id);
      const currentEpisode = playerEpisode
        ? fromTmdbEpisodeCoordinates(entry, playerEpisode.season, playerEpisode.episode)
        : null;
      if (currentEpisode && isTvEntry(entry) && currentEpisode.season !== safeSeason &&
          Number(currentEpisode.season) <= entry.maxSeasons) {
        setSeason(currentEpisode.season);
        setEpisode(currentEpisode.episode);
        setActiveSeasonDetails(null);
        void fetch(`/api/media/${encodeURIComponent(entry.slug)}/seasons/${currentEpisode.season}?type=${entry.type}&id=${entry.id}`)
          .then((response) => response.ok ? response.json() : null)
          .then((json: { data: SeasonDetails } | null) => { if (json) setActiveSeasonDetails(json.data); })
          .catch(() => setSeasonDetailsError('Could not load episode list for this season.'));
      } else if (currentEpisode && currentEpisode.season === safeSeason && currentEpisode.episode !== safeEpisode) {
        setEpisode(currentEpisode.episode);
      }

      const progress = extractPlayerProgress(event.data);
      if (!progress) return;

      const now = Date.now();
      const playerStatus = isRecord(parsedMessage) && isRecord(parsedMessage.data) &&
        typeof parsedMessage.data.player_status === 'string'
        ? parsedMessage.data.player_status.toLowerCase()
        : '';
      emitPlayerProgress(progress.progressSeconds, playerStatus, progress.durationSeconds);
      const isFinalPosition = ['paused', 'seeked', 'completed'].includes(playerStatus);
      if (now - lastProgressWriteRef.current < 5_000 && !isFinalPosition && progress.progressPercent !== 100) return;
      lastProgressWriteRef.current = now;

      trackRecentlyWatched(
        entry,
        {
          durationSeconds: progress.durationSeconds,
          episode: isSeries ? currentEpisode?.episode ?? safeEpisode : undefined,
          progressPercent: progress.progressPercent,
          progressSeconds: progress.progressSeconds,
          season: isSeries ? currentEpisode?.season ?? safeSeason : undefined,
        },
        experience.id,
        canSyncWatchHistory,
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [canSyncWatchHistory, embedUrl, entry, experience.id, isSeries, safeEpisode, safeSeason]);

  /* VidSrc elapsed-time fallback disabled with the old P1–P7 players.
  // VidSrc (P2) doesn't send postMessage progress events, so we track elapsed
  // wall-clock time as a proxy for playback progress while the player is active.
  useEffect(() => {
    if (effectivePlayer !== '2' || isPlayerLoading || showPlayerFallback) return;

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
  }, [canSyncWatchHistory, effectivePlayer, isPlayerLoading, showPlayerFallback, entry, experience.id, isSeries, safeEpisode, safeSeason]);
  */

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

  const handleBackToDetails = useCallback(() => {
    const target = playbackBackTarget(entry, experience.id, experience.homeHref);
    if (target === experience.homeHref || target.startsWith(`${experience.homeHref}#`) ||
        target.startsWith(`${experience.homeHref}?`)) requestHomeScrollRestore(experience.id);
    router.replace(target, { scroll: false });
  }, [entry, experience.homeHref, experience.id, router]);

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
      handleBackToDetails();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBackToDetails]);



  /* Previous player switching is disabled.
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
  */

  const handlePartyFollow = useCallback((target: FollowTarget) => {
    const nextSeason = isSeries && target.season ? target.season : safeSeason;
    const nextEpisode = isSeries && target.episode ? target.episode : safeEpisode;
    if (nextSeason !== safeSeason) setActiveSeasonDetails(null);
    setIsPlayerLoading(true);
    setSeason(nextSeason);
    setEpisode(nextEpisode);
    setEmbedPlayback({ season: nextSeason, episode: nextEpisode });
    setPartyStartAt(Math.max(0, Math.floor(target.time)));
    setPartyPaused(target.paused);
    if (!target.paused) setIframeReloadKey((value) => value + 1);
  }, [isSeries, safeEpisode, safeSeason]);

  const handleReloadPlayer = useCallback(() => {
    setIsPlayerLoading(true);
    setShowPlayerFallback(false);
    setPartyStartAt(null);
    setPlayerMessage('Asking Videasy to load this title again…');
    setEmbedPlayback({ season: safeSeason, episode: safeEpisode });
    setIframeReloadKey((value) => value + 1);
  }, [safeSeason, safeEpisode]);

  const handleSeasonChange = useCallback(
    async (newSeason: string) => {
      setIsPlayerLoading(true);
      setShowPlayerFallback(false);
      setPartyStartAt(null);
      setSeason(newSeason);
      setEpisode('1');
      setEmbedPlayback({ season: newSeason, episode: '1' });
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

  const episodeSidebar = isSeries ? (
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
  ) : null;

  return (
    <WatchPartyRoot
      entry={entry}
      episode={isSeries ? safeEpisode : null}
      experienceId="papiflix"
      iframeRef={iframeRef}
      onFollow={handlePartyFollow}
      season={isSeries ? safeSeason : null}
    >
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
          onClick={handleBackToDetails}
          aria-label="Back to title details"
          title="Back to title details (Esc)"
          className={`absolute left-[calc(env(safe-area-inset-left)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-full bg-black/45 text-zinc-100 backdrop-blur-md transition-opacity duration-300 hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/20 ${
            isChromeVisible ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div
          className={`absolute right-[calc(env(safe-area-inset-right)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex items-center gap-2 transition-opacity duration-300 ${
            isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <PlayerViewControls
            targetRef={playerShellRef}
            showFullscreenButton={false}
            episodeListVisible={isSeries ? isEpisodeListVisible : undefined}
            onToggleEpisodeList={isSeries ? () => setIsEpisodeListVisible((visible) => !visible) : undefined}
            className="flex items-center gap-2"
          />
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 flex justify-center transition-all duration-300 ${
            isChromeVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
        >
          <span className="hidden max-w-[48vw] rounded-full bg-black/65 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-lg backdrop-blur-md sm:line-clamp-1 sm:block sm:text-[12px] lg:max-w-[60vw]">
            {entry.title}
            {isSeries ? ` S${safeSeason.padStart(2, '0')}E${safeEpisode.padStart(2, '0')}` : ''}
          </span>
        </div>

        <LoadingOverlay
          isLoading={isPlayerLoading}
          onReload={handleReloadPlayer}
          showFallback={showPlayerFallback}
          message={playerMessage}
        />

        <button
          type="button"
          onClick={handleReloadPlayer}
          aria-label="Reload player"
          title="Reload player if an overlay blocks playback"
          className="absolute left-[calc(env(safe-area-inset-left)+4.5rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/75 text-white shadow-lg hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-white"
        >
          <RotateCcw className="h-5 w-5" />
        </button>

        {partyPaused ? null : (
          <iframe
            key={`${entry.provider}-videasy-${embedPlayback.season}-${embedPlayback.episode}-${iframeReloadKey}`}
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
              setPlayerMessage('Videasy loaded. If playback is blank, reload to request another source.');
            }}
            referrerPolicy="strict-origin-when-cross-origin"
            title={`Watch ${entry.title}`}
          />
        )}
        <WatchPartyPlayerLayer chromeVisible={isChromeVisible} />
      </div>

      <WatchPartySidebar
        episodes={episodeSidebar}
        fallback={isEpisodeListVisible ? episodeSidebar : null}
      />
    </div>
    </WatchPartyRoot>
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#111] landscape:h-full landscape:w-[clamp(18rem,30vw,23rem)] landscape:flex-none landscape:border-l landscape:border-t-0">
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
  const containerRef = useRef<HTMLDivElement>(null);
  useEpisodeAutoScroll(containerRef, `${safeSeason}:${safeEpisode}`, [safeSeason]);

  return (
    <div ref={containerRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
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
            className={`group flex w-full touch-manipulation select-none gap-3 border-b border-white/5 p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white ${
              isActive
                ? 'bg-white/10'
                : isWatched
                  ? 'bg-black/20 opacity-80 hover:bg-white/6'
                  : 'hover:bg-white/6 active:bg-white/10'
            }`}
          >
            <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-zinc-900 sm:w-36 landscape:w-32">
              <EpisodeStillImage
                alt={`${episode.name} episode still`}
                episodeLabel={`E${episodeNumber.padStart(2, '0')}`}
                fallbackSrc={episode.fallbackStillUrl}
                priority={isActive}
                src={episode.stillUrl}
              />
              {isActive ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-black/20">
                    <div className="ml-0.5 border-b-[5px] border-l-8 border-t-[5px] border-b-transparent border-t-transparent border-l-white" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 py-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 text-sm font-semibold text-white">{episode.name}</p>
                <span className="shrink-0 text-[11px] text-zinc-500">
                  {episode.runtime != null ? `${episode.runtime}m` : `E${episodeNumber}`}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                Episode {episodeNumber}{isWatched && !isActive ? ' · Watched' : ''}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                {episode.overview || 'Episode details are not available yet.'}
              </p>
            </div>
          </button>
        );
      })}
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
  episodeLabel: string;
  fallbackSrc?: string;
  priority: boolean;
  src?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src && failedSrc !== src ? src : fallbackSrc;

  if (!resolvedSrc) {
    return (
      <div className="flex h-full w-full items-end bg-[linear-gradient(135deg,#18181b,#09090b)] p-2">
        <span className="rounded bg-black/70 px-1.5 py-1 text-[10px] font-semibold text-white">{episodeLabel}</span>
      </div>
    );
  }

  return (
    <Image
      src={resolvedSrc}
      alt={alt}
      fill
      sizes="(max-width: 640px) 128px, 144px"
      className="object-cover transition duration-300 group-hover:scale-[1.03]"
      priority={priority}
      onError={() => {
        if (src && resolvedSrc === src) setFailedSrc(src);
      }}
    />
  );
}
