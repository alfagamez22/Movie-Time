'use client';

import Image from 'next/image';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { buildEmbedUrl, buildVideasyEmbedUrl, type PlaybackOptions } from '@/lib/media/embed';
import { usePlayerPreference } from '@/lib/hooks/use-player-preference';
import {
  requestHomeScrollRestore,
  trackRecentlyWatched,
} from '@/lib/hooks/use-recently-watched';
import { buildWatchHref } from '@/lib/media/routes';
import { getEpisodeLimit, isTvEntry, type EpisodePreview, type MediaEntry, type SeasonDetails } from '@/lib/media/types';

interface WatchPlayerProps {
  entry: MediaEntry;
  initialPlayback: PlaybackOptions;
  initialSeasonDetails?: SeasonDetails | null;
}

interface NormalizedPlayerProgress {
  durationSeconds?: number;
  progressPercent?: number;
  progressSeconds: number;
}

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

export function WatchPlayer({ entry, initialPlayback, initialSeasonDetails = null }: WatchPlayerProps) {
  const router = useRouter();
  const isSeries = isTvEntry(entry);

  const [season, setSeason] = useState(initialPlayback.season);
  const [episode, setEpisode] = useState(initialPlayback.episode);
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<SeasonDetails | null>(initialSeasonDetails);
  const [seasonDetailsError, setSeasonDetailsError] = useState<string | null>(null);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const { player } = usePlayerPreference();
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastProgressWriteRef = useRef(0);
  const latestProgressRef = useRef<number | null>(initialPlayback.progress);

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

  const playbackOptions = { ...initialPlayback, season: safeSeason, episode: safeEpisode };
  const embedUrl = player === '1'
    ? buildVideasyEmbedUrl(entry, playbackOptions)
    : buildEmbedUrl(entry, playbackOptions);

  useEffect(() => {
    trackRecentlyWatched(entry, {
      episode: isSeries ? safeEpisode : undefined,
      season: isSeries ? safeSeason : undefined,
    });
  }, [entry, isSeries, safeEpisode, safeSeason]);

  useEffect(() => {
    const expectedOrigin = new URL(embedUrl).origin;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== expectedOrigin) return;

      const progress = extractPlayerProgress(event.data);
      if (!progress) return;
      latestProgressRef.current = progress.progressSeconds;

      const now = Date.now();
      if (now - lastProgressWriteRef.current < 5_000 && progress.progressPercent !== 100) return;
      lastProgressWriteRef.current = now;

      trackRecentlyWatched(entry, {
        durationSeconds: progress.durationSeconds,
        episode: isSeries ? safeEpisode : undefined,
        progressPercent: progress.progressPercent,
        progressSeconds: progress.progressSeconds,
        season: isSeries ? safeSeason : undefined,
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embedUrl, entry, isSeries, safeEpisode, safeSeason]);

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

    if (`${window.location.pathname}${window.location.search}` === href) return;

    startTransition(() => router.replace(href, { scroll: false }));
  }, [
    safeSeason,
    safeEpisode,
    entry.title,
    entry.tmdbId,
    entry.type,
    entry,
    initialPlayback.autoPlay,
    initialPlayback.color,
    router,
    isSeries,
  ]);

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

  const handleBackToLibrary = useCallback(() => {
    requestHomeScrollRestore();
    router.push('/', { scroll: false });
  }, [router]);

  return (
      <div
        onMouseMove={revealChrome}
        className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-black text-white landscape:flex-row"
      >
        {/* Left: player */}
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
              {entry.title}
              {isSeries && ` S${safeSeason.padStart(2, '0')}E${safeEpisode.padStart(2, '0')}`}
            </span>
          </div>

          <iframe
            key={`${player}-${safeSeason}-${safeEpisode}`}
            ref={iframeRef}
            src={embedUrl}
            className="h-full w-full border-0"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-t border-white/5 bg-[#111] landscape:h-full landscape:w-[clamp(16rem,30vw,21rem)] landscape:flex-none landscape:shrink-0 landscape:border-l landscape:border-t-0">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 landscape:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
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

      <div className="thin-scrollbar flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
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
              <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-black/40 landscape:h-16 landscape:w-28">
                {isActive && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white">
                      <div className="ml-0.5 border-b-[5px] border-l-[8px] border-t-[5px] border-b-transparent border-t-transparent border-l-white" />
                    </div>
                  </div>
                )}
                {ep.stillUrl ? (
                  <Image src={ep.stillUrl} alt="" fill sizes="112px" className="object-cover" priority={isActive} />
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
