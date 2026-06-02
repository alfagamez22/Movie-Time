'use client';

import Hls from 'hls.js';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Settings, SkipForward } from 'lucide-react';

import { useAnimeLanguagePreference } from '@/lib/hooks/use-player-preference';
import {
  getRecentlyWatchedProgress,
  requestHomeScrollRestore,
  trackRecentlyWatched,
  useWatchedEpisodes,
} from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import {
  getEpisodeLimit,
  type AnimePlaybackPayload,
  type AnimePlaybackQualityOption,
  type AnimePlaybackServer,
  type EpisodePreview,
} from '@/lib/media/types';

import type { WatchPlayerProps } from './watch-player.types';

interface AnimePlaybackResponse {
  data?: AnimePlaybackPayload;
  error?: string;
}

interface QualityLevel {
  height: number;
  index: number;
}

const ANIME_EPISODE_GROUP_SIZE = 50;

function buildEpisodeHistoryKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

/**
 * Normalize a URL search string for comparison, stripping transient params
 * (e.g. `progress`) and sorting remaining keys alphabetically.
 */
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
        fallbackStillUrl: props.entry.backdropUrl ?? props.entry.posterUrl,
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
      fallbackStillUrl: props.entry.backdropUrl ?? props.entry.posterUrl,
      name: `Episode ${String(episodeNumber).padStart(2, '0')}`,
      overview: '',
      seasonNumber: 1,
      stillUrl: props.entry.backdropUrl ?? props.entry.posterUrl,
    };
  });
}

function LoadingState({ error, isLoading }: { error: string | null; isLoading: boolean }) {
  if (!isLoading && !error) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div className="max-w-md rounded-2xl border border-white/10 bg-black/75 p-5 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">
          {error ? 'Playback Error' : 'Loading Player'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {error ? 'This stream could not be loaded.' : 'Preparing your stream...'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {error ?? 'Resolving the selected anime source now.'}
        </p>

      </div>
    </div>
  );
}

function EpisodeStillImage({
  alt,
  fallbackSrc,
  priority,
  src,
}: {
  alt: string;
  fallbackSrc?: string;
  priority: boolean;
  src?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const shouldUseFallback = Boolean(src && failedSrc === src);
  const resolvedSrc = shouldUseFallback ? fallbackSrc : src || fallbackSrc;

  if (!resolvedSrc) {
    return <div className="h-full w-full bg-[radial-gradient(circle_at_center,rgba(229,9,20,0.15),transparent)]" />;
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
  return (
    <div className="thin-scrollbar flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
      {cards.map((episode) => {
        const isActive = episode.episodeNumber === currentEpisode;
        const isUpcoming = episode.isReleased === false;
        const isWatched = watchedEpisodeKeys.has(buildEpisodeHistoryKey(episode.seasonNumber, episode.episodeNumber));
        const upcomingLabel = formatUpcomingEpisodeLabel(episode);

        return (
          <button
            key={`${episode.seasonNumber}-${episode.episodeNumber}`}
            type="button"
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
  currentLanguage,
  currentSeason,
  episodeCards,
  episodeLimit,
  episodesBySeason,
  watchedEpisodeKeys,
  onEpisodeChange,
  onLanguageChange,
  onSeasonChange,
  onToggleAutoNext,
  onToggleSkipIntro,
  skipIntroEnabled,
  showPlaybackToggles = true,
}: {
  autoNextEnabled: boolean;
  currentEpisode: number;
  currentLanguage: 'dub' | 'sub';
  currentSeason: number;
  episodeCards: EpisodePreview[];
  episodeLimit: number;
  episodesBySeason: Record<string, number>;
  watchedEpisodeKeys: Set<string>;
  onEpisodeChange: (episode: number) => void;
  onLanguageChange: (language: 'dub' | 'sub') => void;
  onSeasonChange: (season: number) => void;
  onToggleAutoNext: () => void;
  onToggleSkipIntro: () => void;
  showPlaybackToggles?: boolean;
  skipIntroEnabled: boolean;
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
          <span className="text-xs text-zinc-500">{episodeLimit} Episodes</span>
        </div>

        <div className="flex flex-col gap-2">
          {/* Season selector — only visible when the entry has multiple seasons */}
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

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
            {(['sub', 'dub'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onLanguageChange(choice)}
                className={`flex-1 rounded-full px-3 py-1 text-center font-medium transition-colors ${
                  currentLanguage === choice ? 'bg-netflix-red text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {choice === 'sub' ? 'Sub' : 'Dub'}
              </button>
            ))}
          </div>

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
              <button
                type="button"
                onClick={onToggleSkipIntro}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  skipIntroEnabled ? 'border-netflix-red/40 bg-netflix-red/15 text-white' : 'border-white/10 bg-white/5 text-zinc-300'
                }`}
              >
                Skip Intro {skipIntroEnabled ? 'On' : 'Off'}
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
  const { language: storedLanguage, setLanguage: setStoredLanguage } = useAnimeLanguagePreference();
  const isSeries = entry.type === 'tv';
  const canSyncWatchHistory = Boolean(session?.user?.id);
  const watchedEpisodeKeys = useWatchedEpisodes(entry, experience.id);
  const episodeCards = getEpisodeCards({ entry, experience, initialPlayback, initialSeasonDetails });
  const playableEpisodeLimit = isSeries
    ? (initialSeasonDetails?.releasedEpisodeCount ?? getEpisodeLimit(entry, 1))
    : 1;
  const episodeLimit = isSeries ? (initialSeasonDetails?.episodeCount ?? playableEpisodeLimit) : 1;
  const initialEpisode = Math.min(Math.max(1, Number.parseInt(initialPlayback.episode, 10) || 1), playableEpisodeLimit);

  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentLanguage, setCurrentLanguage] = useState<'dub' | 'sub'>(initialPlayback.language ?? storedLanguage);
  const currentServer: AnimePlaybackServer = initialPlayback.server ?? 'aniwave';
  const [autoNextEnabled, setAutoNextEnabled] = useState(initialPlayback.autoNext ?? true);
  const [skipIntroEnabled, setSkipIntroEnabled] = useState(initialPlayback.skipIntro ?? false);
  const [playbackData, setPlaybackData] = useState<AnimePlaybackPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [resumeOverrideSeconds, setResumeOverrideSeconds] = useState<number | null>(initialPlayback.progress ?? null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [selectedQualitySrc, setSelectedQualitySrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const lastProgressWriteRef = useRef(0);
  const autoSkippedEpisodeRef = useRef<string | null>(null);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const shouldResumePlaybackRef = useRef(false);
  const requestedRef = useRef({
    episode: initialEpisode,
    language: initialPlayback.language,
    server: initialPlayback.server ?? 'aniwave',
  });

  const savedProgress =
    initialPlayback.progress == null
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
  const resumeStartSeconds = resumeOverrideSeconds ?? savedProgress?.progressSeconds ?? 0;
  const playbackOptions = {
    autoNext: autoNextEnabled,
    autoPlay: initialPlayback.autoPlay,
    color: initialPlayback.color,
    episode: String(currentEpisode),
    language: currentLanguage,
    progress: initialPlayback.progress,
    season: String(currentSeason),
    server: currentServer,
    skipIntro: skipIntroEnabled,
  };
  const manualQualityOptions = playbackData?.qualityOptions ?? [];
  const activeManualQuality =
    manualQualityOptions.find((candidate) => candidate.src === (selectedQualitySrc ?? playbackData?.src)) ?? null;
  const resolvedSourceUrl = selectedQualitySrc ?? playbackData?.src;
  const resolvedSourceType = activeManualQuality?.sourceType ?? playbackData?.sourceType;

  useEffect(() => {
    requestedRef.current = {
      episode: currentEpisode,
      language: currentLanguage,
      server: currentServer,
    };

    const controller = new AbortController();
    const searchParams = new URLSearchParams();
    searchParams.set('server', currentServer);

    void fetch(
      `/api/anime/playback/${encodeURIComponent(entry.id)}/${currentEpisode}/${currentLanguage}?${searchParams.toString()}`,
      {
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as AnimePlaybackResponse | null;
        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok || !json?.data) {
          throw new Error(json?.error ?? 'Could not load anime playback.');
        }

        setSelectedQualitySrc(null);
        setPlaybackData(json.data);
        setIsLoading(false);
        setError(null);

        if (json.data.actualLanguage !== requestedRef.current.language) {
          setCurrentLanguage(json.data.actualLanguage);
        }
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          return;
        }

        if (!controller.signal.aborted) {
          setError(fetchError instanceof Error ? fetchError.message : 'Could not load anime playback.');
          setIsLoading(false);
        }
      });

    return () => controller.abort(new DOMException('Playback request changed', 'AbortError'));
  }, [currentEpisode, currentLanguage, currentServer, entry.id]);

  useEffect(() => {
    const video = videoRef.current;
    const sourceUrl = resolvedSourceUrl;

    if (!video || !sourceUrl) {
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.pause();
    video.removeAttribute('src');
    video.load();

    setQualityLevels([]);
    setCurrentQuality(-1);

    if (resolvedSourceType === 'hls' && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = data.levels
          .map((level, index) => ({ height: level.height, index }))
          .filter((l) => l.height > 0)
          .sort((a, b) => b.height - a.height);
        setQualityLevels(levels);
      });

      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (resolvedSourceType === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      // Browser supports neither hls.js nor native HLS (e.g. older Chromium
      // without Media Source Extensions). Surface a clear message rather than
      // letting the video element silently fail to load.
      setError(
        'HLS playback is not supported in this browser. Try Chrome, Firefox, or Safari, or switch to a different server.',
      );
      setIsLoading(false);
    } else {
      video.src = sourceUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [resolvedSourceType, resolvedSourceUrl]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !playbackData) {
      return;
    }

    const playbackKey = `${currentEpisode}:${playbackData.server}:${playbackData.actualLanguage}`;
    autoSkippedEpisodeRef.current = null;

    const applyStartPosition = () => {
      const targetStartSeconds = pendingSeekRef.current ?? resumeStartSeconds;
      if (targetStartSeconds > 0 && Number.isFinite(targetStartSeconds)) {
        const safeResume = Math.max(0, Math.min(targetStartSeconds, Math.max(0, video.duration - 5)));
        if (safeResume > 0) {
          video.currentTime = safeResume;
        }
      }

      pendingSeekRef.current = null;

      if (skipIntroEnabled && playbackData.intro && autoSkippedEpisodeRef.current !== playbackKey && video.currentTime < playbackData.intro.endTime) {
        video.currentTime = playbackData.intro.endTime;
        autoSkippedEpisodeRef.current = playbackKey;
      }

      if (shouldResumePlaybackRef.current || initialPlayback.autoPlay !== false) {
        void video.play().catch(() => undefined);
      }

      shouldResumePlaybackRef.current = false;
    };

    video.addEventListener('loadedmetadata', applyStartPosition);

    return () => {
      video.removeEventListener('loadedmetadata', applyStartPosition);
    };
  }, [currentEpisode, initialPlayback.autoPlay, playbackData, resumeStartSeconds, skipIntroEnabled]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const writeProgress = () => {
      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5_000 && !video.ended) {
        return;
      }

      lastProgressWriteRef.current = now;
      trackRecentlyWatched(
        {
          ...entry,
          defaultLanguage: currentLanguage,
        },
        {
          durationSeconds: Number.isFinite(video.duration) ? Math.floor(video.duration) : undefined,
          episode: isSeries ? String(currentEpisode) : undefined,
          progressPercent:
            Number.isFinite(video.duration) && video.duration > 0 ? (video.currentTime / video.duration) * 100 : undefined,
          progressSeconds: Math.floor(video.currentTime),
        },
        experience.id,
        canSyncWatchHistory,
      );
    };

      const handleEnded = () => {
        writeProgress();

        if (autoNextEnabled && isSeries && currentEpisode < playableEpisodeLimit) {
          setCurrentEpisode((episode) => Math.min(playableEpisodeLimit, episode + 1));
        }
      };

    const handleTimeUpdate = () => {
      setPlayheadSeconds(video.currentTime);
      writeProgress();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', writeProgress);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', writeProgress);
      video.removeEventListener('ended', handleEnded);
    };
  }, [autoNextEnabled, canSyncWatchHistory, currentEpisode, currentLanguage, entry, experience.id, isSeries, playableEpisodeLimit]);

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
      server: currentServer,
      skipIntro: skipIntroEnabled,
    });

    const currentSearch = normalizeWatchSearch(window.location.search);
    const canonicalSearch = normalizeWatchSearch(href.includes('?') ? href.slice(href.indexOf('?')) : '');
    const currentPath = window.location.pathname;
    const canonicalPath = href.includes('?') ? href.slice(0, href.indexOf('?')) : href;

    if (`${currentPath}${currentSearch}` === `${canonicalPath}${canonicalSearch}`) {
      return;
    }

    startTransition(() => router.replace(href, { scroll: false }));
  }, [autoNextEnabled, currentEpisode, currentLanguage, currentServer, entry, experience.watchBasePath, initialPlayback.autoPlay, router, skipIntroEnabled]);

  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) {
        clearTimeout(chromeTimerRef.current);
      }
    };
  }, []);

  const revealChrome = () => {
    setIsChromeVisible(true);

    if (chromeTimerRef.current) {
      clearTimeout(chromeTimerRef.current);
    }

    chromeTimerRef.current = setTimeout(() => setIsChromeVisible(false), 3000);
  };

  const handleBackToLibrary = () => {
    requestHomeScrollRestore(experience.id);
    router.push(experience.homeHref, { scroll: false });
  };

  const handleLanguageChange = (language: 'dub' | 'sub') => {
    setIsLoading(true);
    setError(null);
    setPlaybackData(null);
    setCurrentLanguage(language);
    setStoredLanguage(language);
    setResumeOverrideSeconds(0);
  };

  const handleEpisodeChange = (episode: number) => {
    if (episode > playableEpisodeLimit) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setPlaybackData(null);
    setCurrentEpisode(Math.min(Math.max(1, episode), playableEpisodeLimit));
    setResumeOverrideSeconds(0);
  };

  const handleSeasonChange = (season: number) => {
    if (season === currentSeason) {
      return;
    }

    setCurrentSeason(season);
    setCurrentEpisode(1);
    setIsLoading(true);
    setError(null);
    setPlaybackData(null);
    setResumeOverrideSeconds(0);
  };

  const handleSkipIntroNow = () => {
    if (!videoRef.current || !playbackData?.intro) {
      return;
    }

    videoRef.current.currentTime = playbackData.intro.endTime;
  };

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
  };

  const handleManualQualityChange = (qualityOption: AnimePlaybackQualityOption) => {
    if (!videoRef.current || selectedQualitySrc === qualityOption.src) {
      setShowQualityMenu(false);
      return;
    }

    pendingSeekRef.current = videoRef.current.currentTime;
    shouldResumePlaybackRef.current = !videoRef.current.paused && !videoRef.current.ended;
    setSelectedQualitySrc(qualityOption.src);
    setShowQualityMenu(false);
  };

  const handleDownloadVideo = () => {
    if (!resolvedSourceUrl) {
      return;
    }

    const filename = `${entry.title} EP${String(currentEpisode).padStart(2, '0')}${resolvedSourceType === 'hls' ? '.m3u8' : '.mp4'}`;

    if (resolvedSourceUrl.startsWith('/api/anime/playback/proxy?')) {
      const proxyUrl = new URL(resolvedSourceUrl, window.location.origin);
      proxyUrl.searchParams.set('download', '1');
      proxyUrl.searchParams.set('filename', filename);
      const anchor = document.createElement('a');
      anchor.href = `${proxyUrl.pathname}${proxyUrl.search}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    if (resolvedSourceType === 'mp4') {
      const downloadUrl = `/api/playback/proxy?url=${encodeURIComponent(resolvedSourceUrl)}&download=1&filename=${encodeURIComponent(filename)}`;
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    window.open(resolvedSourceUrl, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!showQualityMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(event.target as Node)) {
        setShowQualityMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showQualityMenu]);

  const showSkipButton =
    Boolean(playbackData?.intro) &&
    playheadSeconds >= (playbackData?.intro?.startTime ?? Number.MAX_SAFE_INTEGER) &&
    playheadSeconds < (playbackData?.intro?.endTime ?? -1);
  const showQualityControl = qualityLevels.length > 1 || manualQualityOptions.length > 1;
  const qualityButtonLabel =
    manualQualityOptions.length > 1
      ? activeManualQuality?.label ?? 'Quality'
      : currentQuality === -1
        ? 'Auto'
        : `${qualityLevels.find((l) => l.index === currentQuality)?.height ?? '?'}p`;

  return (
    <div
      onMouseMove={revealChrome}
      className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-black text-white landscape:flex-row"
    >
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

        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+3rem)] items-start justify-center bg-gradient-to-b from-black/80 to-transparent px-16 pt-[calc(env(safe-area-inset-top)+0.8rem)] transition-opacity duration-300 ${
            isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <span className="line-clamp-1 text-center text-[12px] font-semibold uppercase tracking-widest text-white sm:text-[13px]">
            {playbackData?.displayTitle ?? entry.title} EP {String(currentEpisode).padStart(2, '0')}
          </span>
        </div>

        <LoadingState error={error} isLoading={isLoading} />

        {showSkipButton ? (
          <button
            type="button"
            onClick={handleSkipIntroNow}
            className="absolute bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <SkipForward className="h-4 w-4" />
            Skip Intro
          </button>
        ) : null}

        {showQualityControl ? (
          <div
            ref={qualityMenuRef}
            className={`absolute right-[calc(env(safe-area-inset-right)+1rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex flex-col items-end transition-opacity duration-300 ${isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <button
              type="button"
              onClick={() => setShowQualityMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <Settings className="h-3.5 w-3.5" />
              {qualityButtonLabel}
            </button>
            {showQualityMenu ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur-sm">
                {manualQualityOptions.length > 1 ? (
                  manualQualityOptions.map((qualityOption) => (
                    <button
                      key={qualityOption.src}
                      type="button"
                      onClick={() => handleManualQualityChange(qualityOption)}
                      className={`flex w-full items-center px-4 py-2 text-xs font-medium transition-colors ${
                        activeManualQuality?.src === qualityOption.src
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {qualityOption.label}
                      {activeManualQuality?.src === qualityOption.src ? (
                        <span className="ml-auto pl-4 text-netflix-red">*</span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <>
                <button
                  type="button"
                  onClick={() => handleQualityChange(-1)}
                  className={`flex w-full items-center px-4 py-2 text-xs font-medium transition-colors ${currentQuality === -1 ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                >
                  Auto
                  {currentQuality === -1 ? <span className="ml-auto pl-4 text-netflix-red">●</span> : null}
                </button>
                {qualityLevels.map((level) => (
                  <button
                    key={level.index}
                    type="button"
                    onClick={() => handleQualityChange(level.index)}
                    className={`flex w-full items-center px-4 py-2 text-xs font-medium transition-colors ${currentQuality === level.index ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
                  >
                    {level.height}p
                    {currentQuality === level.index ? <span className="ml-auto pl-4 text-netflix-red">●</span> : null}
                  </button>
                ))}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {resolvedSourceUrl ? (
          <button
            type="button"
            onClick={handleDownloadVideo}
            aria-label="Download video"
            title="Download video"
            className={`absolute right-[calc(env(safe-area-inset-right)+1rem)] z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-sm transition-all hover:bg-black/70 hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              showQualityControl
                ? 'top-[calc(env(safe-area-inset-top)+3.5rem)]'
                : 'top-[calc(env(safe-area-inset-top)+0.75rem)]'
            } ${isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <Download className="h-4 w-4" />
          </button>
        ) : null}

        <video
            key={`${entry.id}-${currentEpisode}-${currentLanguage}-${currentServer}`}
            ref={videoRef}
            controls
            autoPlay={initialPlayback.autoPlay !== false}
            poster={playbackData?.posterUrl ?? entry.posterUrl}
            className="h-full w-full bg-black"
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
          >
            {playbackData?.tracks.map((track, index) => (
              <track
                key={`${index}-${track.srclang}-${track.label}`}
                default={track.default}
                kind={track.kind}
                label={track.label}
                src={track.src}
                srcLang={track.srclang}
              />
            ))}
          </video>
      </div>

      {isSeries ? (
        <SidebarControls
          autoNextEnabled={autoNextEnabled}
          currentEpisode={currentEpisode}
          currentLanguage={currentLanguage}
          currentSeason={currentSeason}
          episodeCards={episodeCards}
          episodeLimit={episodeLimit}
          episodesBySeason={entry.type === 'tv' ? (entry.episodesBySeason ?? { '1': episodeLimit }) : { '1': 1 }}
          watchedEpisodeKeys={watchedEpisodeKeys}
          onEpisodeChange={handleEpisodeChange}
          onLanguageChange={handleLanguageChange}
          onSeasonChange={handleSeasonChange}
          onToggleAutoNext={() => setAutoNextEnabled((value) => !value)}
          onToggleSkipIntro={() => setSkipIntroEnabled((value) => !value)}
          showPlaybackToggles
          skipIntroEnabled={skipIntroEnabled}
        />
      ) : (
        <div className="flex w-full flex-col gap-3 border-t border-white/5 bg-[#101014] p-4 landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0 landscape:pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
            {(['sub', 'dub'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => handleLanguageChange(choice)}
                className={`flex-1 rounded-full px-3 py-1 text-center font-medium transition-colors ${
                  currentLanguage === choice ? 'bg-netflix-red text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {choice === 'sub' ? 'Sub' : 'Dub'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSkipIntroEnabled((value) => !value)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
              skipIntroEnabled ? 'border-netflix-red/40 bg-netflix-red/15 text-white' : 'border-white/10 bg-white/5 text-zinc-300'
            }`}
          >
            Skip Intro {skipIntroEnabled ? 'On' : 'Off'}
          </button>
        </div>
      )}
    </div>
  );
}
