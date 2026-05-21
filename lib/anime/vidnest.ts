import 'server-only';

import { appConfig } from '@/lib/config';
import {
  type AnimePlaybackPayload,
  type AnimePlaybackServer,
  type AnimePlaybackTrack,
  type PlaybackLanguage,
  type PlaybackMarker,
} from '@/lib/media/types';

import { decodeVidNestPayload } from './vidnest-crypto';

type ProxyProfile = 'aniwave-media' | 'anitaku-media' | 'subtitle';

interface VidNestTrackRecord {
  default?: boolean | null;
  file?: string | null;
  kind?: string | null;
  label?: string | null;
  lang?: string | null;
  srclang?: string | null;
}

interface VidNestSourceRecord {
  file?: string | null;
  quality?: string | null;
  type?: string | null;
  url?: string | null;
}

interface VidNestPlaybackRecord {
  error?: string | null;
  intro?: {
    end?: number | null;
    start?: number | null;
  } | null;
  metadata?: {
    image?: string | null;
    poster?: string | null;
    title?: string | null;
  } | null;
  outro?: {
    end?: number | null;
    start?: number | null;
  } | null;
  sources?: VidNestSourceRecord[] | null;
  status?: number | string | null;
  success?: boolean | null;
  tracks?: VidNestTrackRecord[] | null;
}

interface AnimePlaybackMetadata {
  posterUrl?: string;
  title?: string;
}

interface ResolveAnimePlaybackOptions {
  anilistId: string;
  episode: number;
  language: PlaybackLanguage;
  metadata?: AnimePlaybackMetadata;
  preferredServer?: AnimePlaybackServer;
}

interface AttemptDescriptor {
  language: PlaybackLanguage;
  server: AnimePlaybackServer;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export class AnimePlaybackError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'AnimePlaybackError';
  }
}

function cleanHeaders(headers: Record<string, unknown> | null | undefined): Record<string, string> {
  const normalizedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!key.trim() || value == null) {
      continue;
    }

    normalizedHeaders[key.trim()] = String(value).trim();
  }

  return normalizedHeaders;
}

function cleanUrl(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, '') ?? '';
}

function buildEndpoint(server: AnimePlaybackServer, anilistId: string, episode: number, language: PlaybackLanguage) {
  if (server === 'anitaku') {
    return new URL(`/anitaku/${encodeURIComponent(anilistId)}/${episode}/${language}/hd-2`, appConfig.vidnestAnimeApiBaseUrl);
  }

  return new URL(`/hianime/anime/${encodeURIComponent(anilistId)}/${episode}/${language}`, appConfig.vidnestAnimeApiBaseUrl);
}

function buildProxyUrl(url: string, profile: ProxyProfile): string {
  const searchParams = new URLSearchParams({
    profile,
    url,
  });

  return `/api/anime/playback/proxy?${searchParams.toString()}`;
}

function normalizeMarker(marker: { end?: number | null; start?: number | null } | null | undefined): PlaybackMarker | undefined {
  const startTime = typeof marker?.start === 'number' && Number.isFinite(marker.start) ? marker.start : null;
  const endTime = typeof marker?.end === 'number' && Number.isFinite(marker.end) ? marker.end : null;

  if (startTime == null || endTime == null || endTime <= startTime) {
    return undefined;
  }

  return {
    endTime,
    startTime,
  };
}

function normalizeTracks(records: VidNestTrackRecord[] | null | undefined): AnimePlaybackTrack[] {
  const tracks = new Map<string, AnimePlaybackTrack>();

  for (const [index, record] of (records ?? []).entries()) {
    const rawUrl = cleanUrl(record.file);
    if (!rawUrl) {
      continue;
    }

    const label = record.label?.trim() || record.lang?.trim() || record.srclang?.trim() || `Track ${index + 1}`;
    const srclang = (record.srclang?.trim() || record.lang?.trim() || label).slice(0, 24).toLowerCase();
    const track: AnimePlaybackTrack = {
      default: record.default === true || tracks.size === 0,
      kind: record.kind === 'subtitles' ? 'subtitles' : 'captions',
      label,
      src: buildProxyUrl(rawUrl, 'subtitle'),
      srclang,
    };

    tracks.set(rawUrl, track);
  }

  return Array.from(tracks.values());
}

function normalizePlaybackRecord(
  record: VidNestPlaybackRecord,
  server: AnimePlaybackServer,
  language: PlaybackLanguage,
  fallbackMetadata?: AnimePlaybackMetadata,
): AnimePlaybackPayload {
  if (record.success === false) {
    throw new AnimePlaybackError(record.error?.trim() || 'VidNest did not return a playable anime source.');
  }

  const source = (record.sources ?? []).find((candidate) => cleanUrl(candidate.file ?? candidate.url));
  const sourceUrl = cleanUrl(source?.file ?? source?.url);

  if (!sourceUrl) {
    throw new AnimePlaybackError(record.error?.trim() || 'VidNest did not return a playable anime source.');
  }

  const sourceType = sourceUrl.toLowerCase().includes('.m3u8') || source?.type?.toLowerCase().includes('hls')
    ? 'hls'
    : 'mp4';
  const sourceProfile: ProxyProfile = server === 'anitaku' ? 'anitaku-media' : 'aniwave-media';

  return {
    actualLanguage: language,
    displayTitle: record.metadata?.title?.trim() || fallbackMetadata?.title || `AniList ${fallbackMetadata?.title ?? ''}`.trim(),
    intro: normalizeMarker(record.intro),
    outro: normalizeMarker(record.outro),
    posterUrl: record.metadata?.poster?.trim() || record.metadata?.image?.trim() || fallbackMetadata?.posterUrl,
    server,
    sourceType,
    src: buildProxyUrl(sourceUrl, sourceProfile),
    tracks: normalizeTracks(record.tracks),
  };
}

async function fetchPlaybackRecord(attempt: AttemptDescriptor, anilistId: string, episode: number): Promise<VidNestPlaybackRecord | null> {
  const endpoint = buildEndpoint(attempt.server, anilistId, episode, attempt.language);
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
    },
    next: {
      revalidate: 60,
    },
  }).catch(() => null);

  if (!response) {
    return null;
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      return null;
    }

    throw new AnimePlaybackError(`VidNest playback request failed with status ${response.status}.`, response.status);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload) {
    return null;
  }

  const decoded = decodeVidNestPayload<VidNestPlaybackRecord>(payload);
  const normalizedHeaders = cleanHeaders((decoded as { headers?: Record<string, unknown> }).headers);

  if (Object.keys(normalizedHeaders).length > 0) {
    // Keep parity with the upstream payload normalization even though the proxy
    // currently uses fixed header profiles.
  }

  return decoded;
}

function buildAttemptMatrix(
  preferredServer: AnimePlaybackServer | undefined,
  preferredLanguage: PlaybackLanguage,
): AttemptDescriptor[] {
  const primaryServer = preferredServer ?? 'aniwave';
  const secondaryServer: AnimePlaybackServer = primaryServer === 'aniwave' ? 'anitaku' : 'aniwave';
  const alternateLanguage: PlaybackLanguage = preferredLanguage === 'dub' ? 'sub' : 'dub';

  return [
    { language: preferredLanguage, server: primaryServer },
    { language: preferredLanguage, server: secondaryServer },
    { language: alternateLanguage, server: primaryServer },
    { language: alternateLanguage, server: secondaryServer },
  ];
}

export async function resolveAnimePlayback({
  anilistId,
  episode,
  language,
  metadata,
  preferredServer,
}: ResolveAnimePlaybackOptions): Promise<AnimePlaybackPayload> {
  const parsedEpisode = Math.max(1, Math.floor(episode));

  for (const attempt of buildAttemptMatrix(preferredServer, language)) {
    const payload = await fetchPlaybackRecord(attempt, anilistId, parsedEpisode);
    if (!payload) {
      continue;
    }

    try {
      return normalizePlaybackRecord(payload, attempt.server, attempt.language, metadata);
    } catch (error) {
      if (error instanceof AnimePlaybackError) {
        continue;
      }

      throw error;
    }
  }

  throw new AnimePlaybackError('No anime playback server returned a playable source.');
}
