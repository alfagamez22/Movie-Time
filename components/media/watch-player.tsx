'use client';

import Image from 'next/image';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';

import type { MediaExperienceConfig } from '@/lib/media/experience';
import {
  buildEmbedUrl,
  buildVidFastEmbedUrl,
  buildMegaPlayEmbedUrl,
  buildVideasyEmbedUrl,
  buildVidSrcEmbedUrl,
  type PlaybackOptions,
} from '@/lib/media/embed';
import {
  ANIME_LANGUAGE_LABELS,
  useAnimeLanguagePreference,
  usePlayerPreference,
  type AnimeLanguageChoice,
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
import type { WatchPlayerProps } from './watch-player.types';

interface NormalizedPlayerProgress {
  durationSeconds?: number;
  progressPercent?: number;
  progressSeconds: number;
}

const ANIME_EPISODE_GROUP_SIZE = 50;
const VIDFAST_ALLOWED_ORIGINS = new Set([
  'https://vidfast.pro',
  'https://vidfast.in',
  'https://vidfast.io',
  'https://vidfast.me',
  'https://vidfast.net',
  'https://vidfast.pm',
  'https://vidfast.xyz',
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

function isEpisodeNavigationEvent(data: unknown): boolean {
  const parsed = parseMessageData(data);
  if (!isRecord(parsed)) return false;

  const nestedRecords = [parsed.data, parsed.payload, parsed.detail].filter(isRecord);
  const records = [parsed, ...nestedRecords];
  const eventName = readEventName(records);

  if (/^(next|nextepisode|next_episode|autonext|auto_next|ended|complete|finished|end)$/.test(eventName)) {
    return true;
  }

  for (const record of records) {
    if (record.nextEpisode === true || record.next === true || record.autoNext === true) {
      return true;
    }
  }

  return false;
}

function buildEpisodeHistoryKey(season: string, episodeNumber: string): string {
  return `${season}:${episodeNumber}`;
}

function LoadingOverlay({
  isAnime,
  isLoading,
  onSwitchLanguage,
  showFallback,
}: {
  isAnime: boolean;
  isLoading: boolean;
  onSwitchLanguage?: () => void;
  showFallback: boolean;
}) {
  if (!isLoading && !showFallback) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
      <div className="pointer-events-auto max-w-md rounded-2xl border border-white/10 bg-black/75 p-5 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">
          {showFallback ? 'Playback Check' : 'Loading Player'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-white">
          {showFallback ? 'The embedded player did not finish loading.' : 'Preparing your stream...'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          {showFallback
            ? 'Reload this episode or switch the available playback option if the stream stays blank.'
            : 'Opening the stream wrapper now.'}
        </p>
        {showFallback && isAnime && onSwitchLanguage ? (
          <button
            type="button"
            onClick={onSwitchLanguage}
            className="mt-4 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Switch Sub/Dub
          </button>
        ) : null}
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
  const [useFallback, setUseFallback] = useState(false);
  const resolvedSrc = useFallback ? fallbackSrc : src || fallbackSrc;

  if (!resolvedSrc) {
    return <div className="h-full w-full bg-[radial-gradient(circle_at_center,rgba(229,9,20,0.15),transparent)]" />;
  }

  return (
    <Image
      key={`${src ?? 'none'}:${fallbackSrc ?? 'none'}`}
      src={resolvedSrc}
      alt={alt}
      fill
      sizes="112px"
      className="object-cover"
      priority={priority}
      onError={() => {
        if (!useFallback && fallbackSrc && fallbackSrc !== resolvedSrc) {
          setUseFallback(true);
        }
      }}
    />
  );
}

export function WatchPlayer({
  entry,
  experience,
  initialPlayback,
  initialSeasonDetails = null,
}: WatchPlayerProps) {
  const router = useRouter();
  const isAnime = isAnimeProvider(entry.provider);
  const isSeries = isTvEntry(entry);
  const watchedEpisodeKeys = useWatchedEpisodes(entry, experience.id);

  const [season, setSeason] = useState(initialPlayback.season);
  const [episode, setEpisode] = useState(initialPlayback.episode);
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<SeasonDetails | null>(initialSeasonDetails);
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isPlayerLoading, setIsPlayerLoading] = useState(true);
  const [showPlayerFallback, setShowPlayerFallback] = useState(false);
  const [animeLanguage, setAnimeLanguage] = useState(initialPlayback.language);
  const { player } = usePlayerPreference();
  const { setLanguage: setStoredAnimeLanguage } = useAnimeLanguagePreference();
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasIframeLoadedRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const vidsrcElapsedRef = useRef(0);
  const selfInitiatedLoadRef = useRef(true);
  const lastEmbedNavTimeRef = useRef(0);

  const safeSeason = isSeries
    ? String(Math.min(Math.max(1, Number.parseInt(season, 10)), entry.maxSeasons))
    : '1';
  const safeEpisodeLimit = isSeries
    ? (activeSeasonDetails?.episodeCount ?? getEpisodeLimit(entry, safeSeason))
    : 1;
  const safeEpisode = String(Math.min(Math.max(1, Number.parseInt(episode, 10)), safeEpisodeLimit));
  const effectiveLanguage = isAnime ? animeLanguage : initialPlayback.language;

  const seasonOptions = !isAnime && isSeries
    ? Array.from({ length: entry.maxSeasons }, (_, index) => String(index + 1))
    : [];
  const episodeOptions = isSeries
    ? Array.from({ length: safeEpisodeLimit }, (_, index) => String(index + 1))
    : [];

  const seasonEpisodeCards: EpisodePreview[] = (activeSeasonDetails?.episodes ?? []).length > 0
      ? activeSeasonDetails?.episodes ?? []
      : episodeOptions.map((episodeNumber) => ({
        airDate: undefined,
        episodeNumber: Number.parseInt(episodeNumber, 10),
        fallbackStillUrl: isAnime ? entry.backdropUrl ?? entry.posterUrl : undefined,
        name: `Episode ${episodeNumber.padStart(2, '0')}`,
        overview: '',
        runtime: undefined,
        seasonNumber: isAnime ? 1 : Number.parseInt(safeSeason, 10),
        stillUrl: isAnime ? entry.backdropUrl ?? entry.posterUrl : undefined,
      }));

  const playbackOptions = {
    ...initialPlayback,
    episode: safeEpisode,
    language: effectiveLanguage,
    season: safeSeason,
  };
  const isVidFastPlayer = !isAnime && player === '1';
  const embedUrl = isAnime
    ? buildMegaPlayEmbedUrl(entry, playbackOptions)
    : player === '1'
      ? buildVidFastEmbedUrl(entry, playbackOptions)
      : player === '2'
        ? buildVidSrcEmbedUrl(entry, playbackOptions)
        : player === '3'
          ? buildVideasyEmbedUrl(entry, playbackOptions)
          : buildEmbedUrl(entry, playbackOptions);

  useEffect(() => {
    const trackingEntry = isAnime ? { ...entry, defaultLanguage: effectiveLanguage } : entry;
    trackRecentlyWatched(
      trackingEntry,
      {
        episode: isSeries ? safeEpisode : undefined,
        season: !isAnime && isSeries ? safeSeason : undefined,
      },
      experience.id,
    );
  }, [effectiveLanguage, entry, experience.id, isAnime, isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    hasIframeLoadedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (hasIframeLoadedRef.current) return;
      setIsPlayerLoading(false);
      setShowPlayerFallback(true);
    }, isAnime ? 20000 : 12000);

    return () => window.clearTimeout(timeoutId);
  }, [embedUrl, isAnime]);

  useEffect(() => {
    const expectedOrigin = new URL(embedUrl).origin;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (isVidFastPlayer ? !VIDFAST_ALLOWED_ORIGINS.has(event.origin) : event.origin !== expectedOrigin) return;

      hasIframeLoadedRef.current = true;
      setIsPlayerLoading(false);
      setShowPlayerFallback(false);

      if (isSeries && isEpisodeNavigationEvent(event.data)) {
        const now = Date.now();
        if (now - lastEmbedNavTimeRef.current > 2000) {
          lastEmbedNavTimeRef.current = now;
          const currentEp = Number.parseInt(safeEpisode, 10);
          if (currentEp < safeEpisodeLimit) {
            selfInitiatedLoadRef.current = true;
            handleEpisodeChange(String(currentEp + 1));
          }
        }
        return;
      }

      const progress = extractPlayerProgress(event.data);
      if (!progress) return;

      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5_000 && progress.progressPercent !== 100) return;
      lastProgressWriteRef.current = now;

      const trackingEntry = isAnime ? { ...entry, defaultLanguage: effectiveLanguage } : entry;
      trackRecentlyWatched(
        trackingEntry,
        {
          durationSeconds: progress.durationSeconds,
          episode: isSeries ? safeEpisode : undefined,
          progressPercent: progress.progressPercent,
          progressSeconds: progress.progressSeconds,
          season: !isAnime && isSeries ? safeSeason : undefined,
        },
        experience.id,
      );
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveLanguage, embedUrl, entry, experience.id, handleEpisodeChange, isAnime, isSeries, isVidFastPlayer, safeEpisode, safeEpisodeLimit, safeSeason]);

  // VidSrc (P2) doesn't send postMessage progress events, so we track elapsed
  // wall-clock time as a proxy for playback progress while the player is active.
  useEffect(() => {
    if (player !== '2' || isAnime || isPlayerLoading || showPlayerFallback) return;

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
      );
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [player, isAnime, isPlayerLoading, showPlayerFallback, entry, experience.id, isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    if (isAnime) return;

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
    isAnime,
    router,
    safeEpisode,
    safeSeason,
  ]);

  const revealChrome = useCallback(() => {
    setIsChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => setIsChromeVisible(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    };
  }, []);

  const handleSeasonChange = useCallback(
    async (newSeason: string) => {
      if (isAnime) {
        return;
      }

      selfInitiatedLoadRef.current = true;
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
    [entry.id, entry.slug, entry.type, isAnime],
  );

  const handleEpisodeChange = useCallback((newEpisode: string) => {
    selfInitiatedLoadRef.current = true;
    setIsPlayerLoading(true);
    setShowPlayerFallback(false);
    setEpisode(newEpisode);
  }, []);

  const handleAnimeLanguageChange = useCallback(
    (nextLanguage: AnimeLanguageChoice) => {
      setIsPlayerLoading(true);
      setShowPlayerFallback(false);
      setAnimeLanguage(nextLanguage);
      setStoredAnimeLanguage(nextLanguage);
    },
    [setStoredAnimeLanguage],
  );

  const handleBackToLibrary = useCallback(() => {
    requestHomeScrollRestore(experience.id);
    router.push(experience.homeHref, { scroll: false });
  }, [experience.homeHref, experience.id, router]);

  const handleSwitchAnimeLanguage = useCallback(() => {
    handleAnimeLanguageChange(animeLanguage === 'sub' ? 'dub' : 'sub');
  }, [animeLanguage, handleAnimeLanguageChange]);

  if (isAnime) {
    return (
      <AnimeWatchPlayer
        entry={entry}
        experience={experience}
        initialPlayback={initialPlayback}
        initialSeasonDetails={initialSeasonDetails}
      />
    );
  }

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

        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[calc(env(safe-area-inset-top)+3rem)] items-start justify-center bg-gradient-to-b from-black/80 to-transparent px-16 pt-[calc(env(safe-area-inset-top)+0.8rem)] transition-opacity duration-300 ${
            isChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <span className="line-clamp-1 text-center text-[12px] font-semibold uppercase tracking-widest text-white sm:text-[13px]">
            {entry.title}
            {isSeries ? (isAnime ? ` EP ${safeEpisode.padStart(2, '0')}` : ` S${safeSeason.padStart(2, '0')}E${safeEpisode.padStart(2, '0')}`) : ''}
          </span>
        </div>

        <LoadingOverlay
          isAnime={isAnime}
          isLoading={isPlayerLoading}
          onSwitchLanguage={isAnime ? handleSwitchAnimeLanguage : undefined}
          showFallback={showPlayerFallback}
        />

        <iframe
          key={`${entry.provider}-${isAnime ? effectiveLanguage : player}-${safeSeason}-${safeEpisode}`}
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
            if (!selfInitiatedLoadRef.current && isSeries) {
              const now = Date.now();
              if (now - lastEmbedNavTimeRef.current > 2000) {
                lastEmbedNavTimeRef.current = now;
                const currentEp = Number.parseInt(safeEpisode, 10);
                if (currentEp < safeEpisodeLimit) {
                  selfInitiatedLoadRef.current = true;
                  handleEpisodeChange(String(currentEp + 1));
                  return;
                }
              }
            }
            selfInitiatedLoadRef.current = false;
            hasIframeLoadedRef.current = true;
            setIsPlayerLoading(false);
            setShowPlayerFallback(false);
          }}
          referrerPolicy="strict-origin-when-cross-origin"
          title={`Watch ${entry.title}`}
        />
      </div>

      {isSeries ? (
        isAnime ? (
          <AnimeEpisodeSidebar
            key={entry.id}
            episodeCards={seasonEpisodeCards}
            language={effectiveLanguage}
            onEpisodeChange={handleEpisodeChange}
            onLanguageChange={handleAnimeLanguageChange}
            safeEpisode={safeEpisode}
            safeEpisodeLimit={safeEpisodeLimit}
            watchedEpisodeKeys={watchedEpisodeKeys}
          />
        ) : (
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
          />
        )
      ) : null}
    </div>
  );
}

interface EpisodeSidebarProps {
  onEpisodeChange: (episode: string) => void;
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
}: EpisodeSidebarProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#111] landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <select
          value={safeSeason}
          onChange={(event) => onSeasonChange(event.target.value)}
          className="cursor-pointer bg-transparent text-sm font-semibold text-white outline-none"
          title="Select season"
          aria-label="Select season"
        >
          {seasonOptions.map((season) => (
            <option key={season} value={season} className="bg-[#1a1a1a] text-white">
              Season {season}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">{safeEpisodeLimit} Episodes</span>
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

function AnimeEpisodeSidebar({
  episodeCards,
  language,
  onEpisodeChange,
  onLanguageChange,
  safeEpisode,
  safeEpisodeLimit,
  watchedEpisodeKeys,
}: {
  episodeCards: EpisodePreview[];
  language: 'dub' | 'sub';
  onEpisodeChange: (episode: string) => void;
  onLanguageChange: (language: 'dub' | 'sub') => void;
  safeEpisode: string;
  safeEpisodeLimit: number;
  watchedEpisodeKeys: Set<string>;
}) {
  const [selectedGroupStart, setSelectedGroupStart] = useState(() => {
    const episodeNumber = Number.parseInt(safeEpisode, 10);
    return Math.floor((Math.max(episodeNumber, 1) - 1) / ANIME_EPISODE_GROUP_SIZE) * ANIME_EPISODE_GROUP_SIZE + 1;
  });
  const [selectedRangeEpisode, setSelectedRangeEpisode] = useState(safeEpisode);
  const defaultGroupStart =
    Math.floor((Math.max(Number.parseInt(safeEpisode, 10) || 1, 1) - 1) / ANIME_EPISODE_GROUP_SIZE) *
      ANIME_EPISODE_GROUP_SIZE +
    1;
  const activeGroupStart = selectedRangeEpisode === safeEpisode ? selectedGroupStart : defaultGroupStart;

  const episodeGroups = Array.from({ length: Math.ceil(safeEpisodeLimit / ANIME_EPISODE_GROUP_SIZE) }, (_, index) => {
    const startEpisode = index * ANIME_EPISODE_GROUP_SIZE + 1;
    const endEpisode = Math.min(safeEpisodeLimit, startEpisode + ANIME_EPISODE_GROUP_SIZE - 1);

    return {
      endEpisode,
      label: `${startEpisode}-${endEpisode}`,
      value: String(startEpisode),
    };
  });

  const visibleEpisodeCards =
    episodeGroups.length > 1
      ? episodeCards.filter(
          (episode) =>
            episode.episodeNumber >= activeGroupStart &&
            episode.episodeNumber < activeGroupStart + ANIME_EPISODE_GROUP_SIZE,
        )
      : episodeCards;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#101014] landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0">
      <div className="space-y-3 border-b border-white/5 px-4 py-3 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Episode List</span>
          <span className="text-xs text-zinc-500">{safeEpisodeLimit} Episodes</span>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5 text-xs">
          {(['sub', 'dub'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onLanguageChange(choice)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${
                language === choice ? 'bg-netflix-red text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {ANIME_LANGUAGE_LABELS[choice]}
            </button>
          ))}
        </div>
        {episodeGroups.length > 1 ? (
          <div className="space-y-1">
            <label htmlFor="anime-episode-group" className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              Episode Range
            </label>
            <select
              id="anime-episode-group"
              value={String(activeGroupStart)}
              onChange={(event) => {
                setSelectedRangeEpisode(safeEpisode);
                setSelectedGroupStart(Number.parseInt(event.target.value, 10));
              }}
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
        key={activeGroupStart}
        cards={visibleEpisodeCards}
        onEpisodeChange={onEpisodeChange}
        safeEpisode={safeEpisode}
        safeSeason="1"
        watchedEpisodeKeys={watchedEpisodeKeys}
      />
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
    <div className="thin-scrollbar flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
      {cards.map((episode) => {
        const episodeNumber = String(episode.episodeNumber);
        const isActive = episodeNumber === safeEpisode;
        const isWatched = watchedEpisodeKeys.has(buildEpisodeHistoryKey(safeSeason, episodeNumber));

        return (
          <button
            key={episodeNumber}
            type="button"
            onClick={() => onEpisodeChange(episodeNumber)}
            className={`flex w-full gap-3 border-b border-white/5 p-3 text-left transition-colors ${
              isActive ? 'bg-white/[0.08]' : isWatched ? 'bg-black/30 opacity-80 hover:bg-white/[0.045]' : 'hover:bg-white/[0.05]'
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
