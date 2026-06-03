'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, SkipForward } from 'lucide-react';

import { useEpisodeAutoScroll } from '@/lib/hooks/use-episode-auto-scroll';
import {
  getRecentlyWatchedProgress,
  requestHomeScrollRestore,
  trackRecentlyWatched,
  useWatchedEpisodes,
} from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import { buildAnimepaheEmbedUrl } from '@/lib/media/embed';
import {
  getEpisodeLimit,
  type EpisodePreview,
} from '@/lib/media/types';

import type { WatchPlayerProps } from './watch-player.types';

const ANIME_EPISODE_GROUP_SIZE = 50;
const VIDNEST_ORIGIN = 'https://vidnest.fun';

interface NormalizedPlayerProgress {
  durationSeconds?: number;
  progressPercent?: number;
  progressSeconds: number;
}

interface PapiProgressPayload {
  anilistId: string;
  season: string;
  episode: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  startAt: number;
  currentTime: number;
  duration?: number | null;
  progressPercent: number;
  lastEventType?: string | null;
}

function buildEpisodeHistoryKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

function normalizeWatchSearch(searchString: string): string {
  if (!searchString || searchString === '?') return '';
  const params = new URLSearchParams(searchString.startsWith('?') ? searchString.slice(1) : searchString);
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === 'progress') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

function formatUpcomingEpisodeLabel(episode: EpisodePreview): string | null {
  if (episode.isReleased !== false) {
    return null;
  }

  const scheduledAt = typeof episode.scheduledAt === 'number' ? episode.scheduledAt * 1000 : null;
  if (!scheduledAt) {
    return 'Upcoming';
  }

  const millisecondsUntil = scheduledAt - Date.now();
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const hourMilliseconds = 60 * 60 * 1000;

  if (millisecondsUntil <= hourMilliseconds) {
    return 'Airing soon';
  }

  if (millisecondsUntil < dayMilliseconds) {
    return `Airs in ${Math.max(1, Math.ceil(millisecondsUntil / hourMilliseconds))}h`;
  }

  if (millisecondsUntil < dayMilliseconds * 2) {
    return 'Airs tomorrow';
  }

  if (millisecondsUntil < dayMilliseconds * 7) {
    return `Airs in ${Math.max(1, Math.ceil(millisecondsUntil / dayMilliseconds))}d`;
  }

  return `Airs ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(scheduledAt))}`;
}

function getEpisodeCards(props: WatchPlayerProps): EpisodePreview[] {
  if (props.entry.type !== 'tv') {
    return [
      {
        episodeNumber: 1,
        fallbackStillUrl: props.entry.posterUrl,
        name: props.entry.title,
        overview: props.entry.synopsis,
        seasonNumber: 1,
        stillUrl: props.entry.backdropUrl ?? props.entry.posterUrl,
      },
    ];
  }

  if (props.initialSeasonDetails?.episodes?.length) {
    return props.initialSeasonDetails.episodes;
  }

  const episodeCount = getEpisodeLimit(props.entry, 1);

  return Array.from({ length: episodeCount }, (_, index) => {
    const episodeNumber = index + 1;

    return {
      episodeNumber,
      fallbackStillUrl: props.entry.posterUrl,
      name: `Episode ${String(episodeNumber).padStart(2, '0')}`,
      overview: '',
      seasonNumber: 1,
      stillUrl: props.entry.backdropUrl ?? props.entry.posterUrl,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(records: Record<string, unknown>[], keys: string[]): number | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return undefined;
}

function parseMessageData(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
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
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const primary = src || fallbackSrc;
  const resolvedSrc =
    primary && !failedUrls.has(primary)
      ? primary
      : fallbackSrc && fallbackSrc !== primary && !failedUrls.has(fallbackSrc)
        ? fallbackSrc
        : undefined;

  const usePlaceholder = !resolvedSrc || Boolean(src && fallbackSrc && src === fallbackSrc);

  if (usePlaceholder) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(135deg,#111827_0%,#171717_45%,#1f2937_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.22),transparent_35%)]" />
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
        setFailedUrls((prev) => {
          if (prev.has(resolvedSrc)) return prev;
          const next = new Set(prev);
          next.add(resolvedSrc);
          return next;
        });
      }}
    />
  );
}

function EpisodeCardList({
  cards,
  currentEpisode,
  onEpisodeChange,
  watchedEpisodeKeys,
}: {
  cards: EpisodePreview[];
  currentEpisode: number;
  onEpisodeChange: (episode: number) => void;
  watchedEpisodeKeys: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEpisodeAutoScroll(containerRef, String(currentEpisode));

  return (
    <div
      ref={containerRef}
      className="thin-scrollbar flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
    >
      {cards.map((episode) => {
        const isActive = episode.episodeNumber === currentEpisode;
        const isUpcoming = episode.isReleased === false;
        const isWatched = watchedEpisodeKeys.has(buildEpisodeHistoryKey(episode.seasonNumber, episode.episodeNumber));
        const upcomingLabel = formatUpcomingEpisodeLabel(episode);

        return (
          <button
            key={`${episode.seasonNumber}-${episode.episodeNumber}`}
            type="button"
            data-episode-active={isActive ? 'true' : 'false'}
            disabled={isUpcoming}
            onClick={() => onEpisodeChange(episode.episodeNumber)}
            className={`flex w-full gap-3 border-b border-white/5 p-3 text-left transition-colors ${
              isActive
                ? 'bg-white/[0.08]'
                : isUpcoming
                  ? 'cursor-not-allowed bg-white/[0.015] opacity-55'
                  : isWatched
                    ? 'bg-black/30 opacity-80 hover:bg-white/[0.045]'
                    : 'hover:bg-white/[0.05]'
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
                episodeLabel={`E${String(episode.episodeNumber).padStart(2, '0')}`}
                fallbackSrc={episode.fallbackStillUrl}
                priority={isActive}
                src={episode.stillUrl}
              />
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="mb-0.5 text-[11px] text-zinc-400">
                E{String(episode.episodeNumber).padStart(2, '0')}
                {episode.runtime != null ? ` · ${episode.runtime}m` : ''}
              </p>
              <p className="line-clamp-1 text-xs font-medium text-white">{episode.name}</p>
              {isUpcoming && upcomingLabel ? (
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                  {upcomingLabel}
                </p>
              ) : null}
              {isWatched && !isActive && !isUpcoming ? (
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

function SidebarControls({
  autoNextEnabled,
  currentEpisode,
  currentSeason,
  episodeCards,
  episodeLimit,
  episodesBySeason,
  watchedEpisodeKeys,
  onEpisodeChange,
  onSeasonChange,
  onToggleAutoNext,
  showPlaybackToggles = true,
}: {
  autoNextEnabled: boolean;
  currentEpisode: number;
  currentSeason: number;
  episodeCards: EpisodePreview[];
  episodeLimit: number;
  episodesBySeason: Record<string, number>;
  watchedEpisodeKeys: Set<string>;
  onEpisodeChange: (episode: number) => void;
  onSeasonChange: (season: number) => void;
  onToggleAutoNext: () => void;
  showPlaybackToggles?: boolean;
}) {
  const defaultGroupStart =
    Math.floor((Math.max(currentEpisode, 1) - 1) / ANIME_EPISODE_GROUP_SIZE) * ANIME_EPISODE_GROUP_SIZE + 1;
  const [selectedRange, setSelectedRange] = useState(() => ({
    episodeAnchor: currentEpisode,
    start: defaultGroupStart,
  }));

  const episodeGroups = Array.from({ length: Math.ceil(episodeLimit / ANIME_EPISODE_GROUP_SIZE) }, (_, index) => {
    const startEpisode = index * ANIME_EPISODE_GROUP_SIZE + 1;
    const endEpisode = Math.min(episodeLimit, startEpisode + ANIME_EPISODE_GROUP_SIZE - 1);

    return {
      endEpisode,
      label: `${startEpisode}-${endEpisode}`,
      value: startEpisode,
    };
  });

  const activeGroupStart = selectedRange.episodeAnchor === currentEpisode ? selectedRange.start : defaultGroupStart;

  const visibleEpisodeCards =
    episodeGroups.length > 1
      ? episodeCards.filter((episode) => {
          return (
            episode.episodeNumber >= activeGroupStart &&
            episode.episodeNumber < activeGroupStart + ANIME_EPISODE_GROUP_SIZE
          );
        })
      : episodeCards;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#101014] landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0">
      <div className="space-y-3 border-b border-white/5 px-4 py-3 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Episode List</span>
          <div className="flex items-center gap-2">
            {currentEpisode < episodeLimit ? (
              <button
                type="button"
                onClick={() => onEpisodeChange(currentEpisode + 1)}
                aria-label="Next episode"
                title="Next episode"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <span className="text-xs text-zinc-500">{episodeLimit} Episodes</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {Object.keys(episodesBySeason).length > 1 ? (
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
              {Object.keys(episodesBySeason)
                .map(Number)
                .sort((a, b) => a - b)
                .map((season) => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => onSeasonChange(season)}
                    className={`flex-1 rounded-full px-3 py-1 text-center font-medium transition-colors ${
                      currentSeason === season ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    S{season}
                  </button>
                ))}
            </div>
          ) : null}

          {showPlaybackToggles ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleAutoNext}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  autoNextEnabled ? 'border-netflix-red/40 bg-netflix-red/15 text-white' : 'border-white/10 bg-white/5 text-zinc-300'
                }`}
              >
                Auto Next {autoNextEnabled ? 'On' : 'Off'}
              </button>
            </div>
          ) : null}
        </div>

        {episodeGroups.length > 1 ? (
          <div className="space-y-1">
            <label htmlFor="anime-episode-group" className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Episode Range
            </label>
            <select
              id="anime-episode-group"
              value={String(activeGroupStart)}
              onChange={(event) =>
                setSelectedRange({
                  episodeAnchor: currentEpisode,
                  start: Number.parseInt(event.target.value, 10),
                })
              }
              className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white outline-none transition focus:border-white/20"
              aria-label="Select episode range"
            >
              {episodeGroups.map((group) => (
                <option key={group.value} value={group.value} className="bg-[#111] text-white">
                  Episodes {group.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <EpisodeCardList
        cards={visibleEpisodeCards}
        currentEpisode={currentEpisode}
        onEpisodeChange={onEpisodeChange}
        watchedEpisodeKeys={watchedEpisodeKeys}
      />
    </div>
  );
}

export function AnimeWatchPlayer({
  entry,
  experience,
  initialPlayback,
  initialSeasonDetails = null,
}: WatchPlayerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const isSeries = entry.type === 'tv';
  const canSyncWatchHistory = Boolean(session?.user?.id);
  const watchedEpisodeKeys = useWatchedEpisodes(entry, experience.id);
  const episodeCards = getEpisodeCards({ entry, experience, initialPlayback, initialSeasonDetails });
  const playableEpisodeLimit = isSeries
    ? (initialSeasonDetails?.releasedEpisodeCount ?? getEpisodeLimit(entry, 1))
    : 1;
  const episodeLimit = isSeries ? (initialSeasonDetails?.episodeCount ?? playableEpisodeLimit) : 1;
  const initialEpisode = Math.min(Math.max(1, Number.parseInt(initialPlayback.episode, 10) || 1), playableEpisodeLimit);
  const anilistId = entry.anilistId ?? entry.id;

  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [autoNextEnabled, setAutoNextEnabled] = useState(initialPlayback.autoNext ?? false);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [savedStartAt, setSavedStartAt] = useState<number | null>(initialPlayback.progress ?? null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastProgressWriteRef = useRef(0);
  const lastEventTypeRef = useRef<string | null>(null);
  const savedProgressRef = useRef<PapiProgressPayload | null>(null);

  const savedProgress =
    savedStartAt == null
      ? getRecentlyWatchedProgress(
          entry,
          isSeries
            ? {
                episode: String(currentEpisode),
              }
            : {},
          experience.id,
        )
      : null;
  const resumeStartSeconds = savedStartAt ?? savedProgress?.progressSeconds ?? 0;
  const currentLanguage = 'sub' as const;

  const embedUrl = buildAnimepaheEmbedUrl(anilistId, currentEpisode, currentLanguage, resumeStartSeconds);

  useEffect(() => {
    if (!canSyncWatchHistory) return;

    const controller = new AbortController();

    void fetch(
      `/api/watch-history/anime-progress?anilistId=${encodeURIComponent(anilistId)}&season=1&episode=${currentEpisode}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return;
        const json = await response.json().catch(() => null);
        if (!json?.progress) return;
        savedProgressRef.current = json.progress;
        setSavedStartAt(json.progress.currentTime ?? json.progress.startAt ?? null);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [anilistId, currentEpisode, canSyncWatchHistory]);

  const saveProgress = useCallback((progress: NormalizedPlayerProgress, eventType: string) => {
    if (!canSyncWatchHistory) return;

    const now = Date.now();
    if (now - lastProgressWriteRef.current < 5_000 && progress.progressPercent !== 100) return;
    lastProgressWriteRef.current = now;
    lastEventTypeRef.current = eventType;

    const payload: PapiProgressPayload = {
      anilistId,
      season: '1',
      episode: String(currentEpisode),
      title: entry.title,
      posterUrl: entry.posterUrl ?? null,
      backdropUrl: entry.backdropUrl ?? null,
      startAt: resumeStartSeconds,
      currentTime: Math.floor(progress.progressSeconds),
      duration: progress.durationSeconds != null ? Math.floor(progress.durationSeconds) : null,
      progressPercent: progress.progressPercent ?? 0,
      lastEventType: eventType,
    };

    void fetch('/api/watch-history/anime-progress', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => undefined);

    const trackingEntry = { ...entry, defaultLanguage: currentLanguage };
    trackRecentlyWatched(
      trackingEntry,
      {
        durationSeconds: progress.durationSeconds ? Math.floor(progress.durationSeconds) : undefined,
        episode: isSeries ? String(currentEpisode) : undefined,
        progressPercent: progress.progressPercent,
        progressSeconds: Math.floor(progress.progressSeconds),
      },
      experience.id,
      canSyncWatchHistory,
    );
  }, [anilistId, canSyncWatchHistory, currentEpisode, currentLanguage, entry, experience.id, isSeries, resumeStartSeconds]);

  useEffect(() => {
    if (!embedUrl) return;

    const expectedOrigin = VIDNEST_ORIGIN;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;

      const rootWindow = iframeRef.current?.contentWindow;
      if (rootWindow) {
        let win: Window | null = event.source as Window | null;
        let isDescendant = false;
        while (win) {
          if (win === rootWindow) { isDescendant = true; break; }
          try {
            const parent = win.parent;
            win = parent === win ? null : parent;
          } catch {
            win = null;
          }
        }
        if (!isDescendant) return;
      }

      setIsIframeLoading(false);
      setIframeError(null);

      const progress = extractPlayerProgress(event.data);
      if (!progress) return;

      const eventType = typeof event.data === 'object' && event.data !== null ? (event.data as Record<string, unknown>).type as string ?? 'update' : 'update';
      saveProgress(progress, eventType);

      if (progress.progressPercent != null && progress.progressPercent >= 90) {
        if (autoNextEnabled && isSeries && currentEpisode < playableEpisodeLimit) {
          setCurrentEpisode((episode) => Math.min(playableEpisodeLimit, episode + 1));
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embedUrl, autoNextEnabled, isSeries, currentEpisode, playableEpisodeLimit, saveProgress]);

  useEffect(() => {
    startTransition(() => {
      setIsIframeLoading(true);
      setIframeError(null);
    });
  }, [embedUrl]);

  useEffect(() => {
    const trackingEntry = { ...entry, defaultLanguage: currentLanguage };
    trackRecentlyWatched(
      trackingEntry,
      {
        episode: isSeries ? String(currentEpisode) : undefined,
      },
      experience.id,
      canSyncWatchHistory,
    );
  }, [canSyncWatchHistory, currentEpisode, currentLanguage, entry, experience.id, isSeries]);

  useEffect(() => {
    const href = buildWatchHref(entry, {
      autoNext: autoNextEnabled,
      autoPlay: initialPlayback.autoPlay,
      basePath: experience.watchBasePath,
      episode: currentEpisode,
      language: currentLanguage,
      progress: null,
      skipIntro: false,
    });

    const currentSearch = normalizeWatchSearch(window.location.search);
    const canonicalSearch = normalizeWatchSearch(href.includes('?') ? href.slice(href.indexOf('?')) : '');
    const currentPath = window.location.pathname;
    const canonicalPath = href.includes('?') ? href.slice(0, href.indexOf('?')) : href;

    if (`${currentPath}${currentSearch}` === `${canonicalPath}${canonicalSearch}`) {
      return;
    }

    window.history.replaceState(null, '', href);
  }, [autoNextEnabled, currentEpisode, currentLanguage, entry, experience.watchBasePath, initialPlayback.autoPlay]);

  const handleBackToLibrary = () => {
    requestHomeScrollRestore(experience.id);
    router.push(experience.homeHref, { scroll: false });
  };

  const handleEpisodeChange = (episode: number) => {
    if (episode > playableEpisodeLimit) return;
    setIsIframeLoading(true);
    setIframeError(null);
    setCurrentEpisode(Math.min(Math.max(1, episode), playableEpisodeLimit));
    setSavedStartAt(0);
  };

  const handleSeasonChange = (season: number) => {
    if (season === currentSeason) return;
    setIsIframeLoading(true);
    setIframeError(null);
    setCurrentSeason(season);
    setCurrentEpisode(1);
    setSavedStartAt(0);
  };

  return (
    <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-black text-white landscape:flex-row">
      <div className="relative aspect-video w-full shrink-0 bg-black landscape:h-full landscape:min-h-0 landscape:min-w-0 landscape:flex-1">
        <button
          type="button"
          onClick={handleBackToLibrary}
          aria-label="Back to library"
          title="Back to library"
          className="absolute left-[calc(env(safe-area-inset-left)+1rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black/20 text-zinc-100 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+3rem)] items-start justify-center bg-gradient-to-b from-black/80 to-transparent px-16 pt-[calc(env(safe-area-inset-top)+0.8rem)]">
          <span className="line-clamp-1 text-center text-[12px] font-semibold uppercase tracking-widest text-white sm:text-[13px]">
            {entry.title} EP {String(currentEpisode).padStart(2, '0')}
          </span>
        </div>

        {isIframeLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
            <div className="max-w-md rounded-2xl border border-white/10 bg-black/75 p-5 text-center shadow-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">Loading Player</p>
              <h2 className="mt-3 text-xl font-bold text-white">Preparing your stream...</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">Loading the anime player now.</p>
            </div>
          </div>
        ) : null}

        {iframeError && !isIframeLoading ? (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-30 flex max-w-sm items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 backdrop-blur-sm">
            <p className="flex-1 text-xs leading-relaxed text-amber-100">{iframeError}</p>
            <button
              type="button"
              onClick={() => setIframeError(null)}
              aria-label="Dismiss"
              className="text-amber-200 transition hover:text-white"
            >
              ×
            </button>
          </div>
        ) : null}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="h-full w-full"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          onLoad={() => {
            setIsIframeLoading(false);
            setIframeError(null);
          }}
          onError={() => {
            setIsIframeLoading(false);
            setIframeError('The player failed to load. Try refreshing the page.');
          }}
          referrerPolicy="no-referrer"
          title={`Watch ${entry.title}`}
        />
      </div>

      {isSeries ? (
        <SidebarControls
          autoNextEnabled={autoNextEnabled}
          currentEpisode={currentEpisode}
          currentSeason={currentSeason}
          episodeCards={episodeCards}
          episodeLimit={episodeLimit}
          episodesBySeason={entry.type === 'tv' ? (entry.episodesBySeason ?? { '1': episodeLimit }) : { '1': 1 }}
          watchedEpisodeKeys={watchedEpisodeKeys}
          onEpisodeChange={handleEpisodeChange}
          onSeasonChange={handleSeasonChange}
          onToggleAutoNext={() => setAutoNextEnabled((value) => !value)}
          showPlaybackToggles
        />
      ) : null}
    </div>
  );
}
