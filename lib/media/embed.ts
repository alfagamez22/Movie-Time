import { appConfig } from '@/lib/config';

import { getEpisodeLimit, isTvEntry, type MediaEntry } from './types';

const DEFAULT_PLAYER_COLOR = 'e50914';
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

export interface PlaybackOptions {
  season: string;
  episode: string;
  color: string;
  autoPlay: boolean;
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

  if (isTvEntry(entry)) {
    const season = clampPositiveInteger(getFirstParam(searchParams.s), entry.maxSeasons);
    return {
      season,
      episode: clampPositiveInteger(getFirstParam(searchParams.e), getEpisodeLimit(entry, season)),
      color,
      autoPlay,
    };
  }

  return {
    season: '1',
    episode: '1',
    color,
    autoPlay,
  };
}

export function buildEmbedUrl(entry: MediaEntry, options: PlaybackOptions): string {
  const baseUrl = appConfig.vidkingEmbedBaseUrl;
  const path = isTvEntry(entry)
    ? `${baseUrl}/tv/${encodeURIComponent(entry.tmdbId)}/${options.season}/${options.episode}`
    : `${baseUrl}/movie/${encodeURIComponent(entry.tmdbId)}`;

  const url = new URL(path);
  url.searchParams.set('color', options.color);

  if (options.autoPlay) {
    url.searchParams.set('autoPlay', 'true');
  }

  if (isTvEntry(entry)) {
    url.searchParams.set('nextEpisode', 'true');
    url.searchParams.set('episodeSelector', 'true');
  }

  return url.toString();
}