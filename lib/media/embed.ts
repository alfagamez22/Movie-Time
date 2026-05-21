import { appConfig } from '@/lib/config';

import {
  getEpisodeLimit,
  isAnimeProvider,
  isTvEntry,
  type AnimePlaybackServer,
  type MediaEntry,
  type PlaybackLanguage,
} from './types';

const DEFAULT_PLAYER_COLOR = 'e50914';
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

export interface PlaybackOptions {
  autoPlay: boolean;
  autoNext?: boolean;
  color: string;
  episode: string;
  language: PlaybackLanguage;
  progress: number | null;
  server?: AnimePlaybackServer;
  season: string;
  skipIntro?: boolean;
}

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

function getFirstParam(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function clampPositiveInteger(value: string | undefined, max: number): string {
  const parsed = Number.parseInt(value ?? '1', 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return '1';
  }

  return String(Math.min(parsed, max));
}

function sanitizeProgress(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function sanitizePlayerColor(value: string | undefined): string {
  if (!value) {
    return DEFAULT_PLAYER_COLOR;
  }

  const normalized = value.trim().replace(/^#/, '').toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : DEFAULT_PLAYER_COLOR;
}

export function resolvePlaybackOptions(entry: MediaEntry, searchParams: SearchParams): PlaybackOptions {
  const color = sanitizePlayerColor(getFirstParam(searchParams.color));
  const autoPlayRaw = getFirstParam(searchParams.autoPlay);
  const autoPlay = autoPlayRaw === undefined ? true : autoPlayRaw !== 'false';
  const autoNextRaw = getFirstParam(searchParams.autonext);
  const autoNext = autoNextRaw === undefined ? true : autoNextRaw !== 'false';
  const progress = sanitizeProgress(getFirstParam(searchParams.progress));
  const language = getFirstParam(searchParams.lang) === 'dub' ? 'dub' : entry.defaultLanguage ?? 'sub';
  const serverValue = getFirstParam(searchParams.server);
  const server = serverValue === 'anitaku' ? 'anitaku' : serverValue === 'aniwave' ? 'aniwave' : undefined;
  const skipIntroValue = getFirstParam(searchParams.skipintro);
  const skipIntro =
    skipIntroValue === undefined ? undefined : skipIntroValue === 'true' || skipIntroValue === '1';

  if (isAnimeProvider(entry.provider)) {
    const maxEpisodes = entry.type === 'tv' ? getEpisodeLimit(entry, 1) : 1;

    return {
      autoPlay,
      autoNext,
      color,
      episode: clampPositiveInteger(getFirstParam(searchParams.e), maxEpisodes),
      language,
      progress,
      server,
      season: '1',
      skipIntro,
    };
  }

  if (isTvEntry(entry)) {
    const season = clampPositiveInteger(getFirstParam(searchParams.s), entry.maxSeasons);
    return {
      autoPlay,
      color,
      episode: clampPositiveInteger(getFirstParam(searchParams.e), getEpisodeLimit(entry, season)),
      language,
      progress,
      season,
    };
  }

  return {
    autoPlay,
    color,
    episode: '1',
    language,
    progress,
    season: '1',
  };
}

export function buildVideasyEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const base = 'https://player.videasy.net';
  const path = isTvEntry(entry)
    ? `${base}/tv/${encodeURIComponent(entry.id)}/${options.season}/${options.episode}`
    : `${base}/movie/${encodeURIComponent(entry.id)}`;

  const url = new URL(path);
  url.searchParams.set('color', options.color);
  url.searchParams.set('overlay', 'true');

  if (options.progress !== null) {
    const progress = String(Math.floor(options.progress));
    url.searchParams.set('progress', progress);
    url.searchParams.set('start', progress);
    url.searchParams.set('startAt', progress);
    url.searchParams.set('time', progress);
  }

  if (isTvEntry(entry)) {
    url.searchParams.set('nextEpisode', 'true');
    url.searchParams.set('autoplayNextEpisode', 'true');
  }

  return url.toString();
}

export function buildVidFastEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const baseUrl = appConfig.vidfastEmbedBaseUrl;
  const path = isTvEntry(entry)
    ? `${baseUrl}/tv/${encodeURIComponent(entry.id)}/${options.season}/${options.episode}`
    : `${baseUrl}/movie/${encodeURIComponent(entry.id)}`;

  const url = new URL(path);
  url.searchParams.set('theme', options.color);

  if (options.autoPlay) {
    url.searchParams.set('autoPlay', 'true');
  }

  if (options.progress !== null) {
    url.searchParams.set('startAt', String(Math.floor(options.progress)));
  }

  if (isTvEntry(entry)) {
    url.searchParams.set('nextButton', 'true');
    url.searchParams.set('autoNext', 'true');
  }

  return url.toString();
}

export function buildEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const baseUrl = appConfig.vidkingEmbedBaseUrl;
  const path = isTvEntry(entry)
    ? `${baseUrl}/tv/${encodeURIComponent(entry.id)}/${options.season}/${options.episode}`
    : `${baseUrl}/movie/${encodeURIComponent(entry.id)}`;

  const url = new URL(path);
  url.searchParams.set('color', options.color);

  if (options.autoPlay) {
    url.searchParams.set('autoPlay', 'true');
  }

  if (options.progress !== null) {
    url.searchParams.set('progress', String(options.progress));
  }

  if (isTvEntry(entry)) {
    url.searchParams.set('nextEpisode', 'true');
  }

  return url.toString();
}

export function buildVidSrcEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const base = 'https://vidsrc.to/embed';
  const path = isTvEntry(entry)
    ? `${base}/tv/${encodeURIComponent(entry.id)}/${options.season}/${options.episode}`
    : `${base}/movie/${encodeURIComponent(entry.id)}`;

  return path;
}

export function buildMegaPlayEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const anilistId = entry.provider === 'anikoto' ? entry.anilistId || entry.id : entry.id;
  const url = new URL(
    `https://vidnest.fun/anime/${encodeURIComponent(anilistId)}/${options.episode}/${options.language}`,
  );

  if (options.autoPlay) {
    url.searchParams.set('autoplay', 'true');
  }

  return url.toString();
}
