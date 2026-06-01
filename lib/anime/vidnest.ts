import 'server-only';

import { appConfig } from '@/lib/config';
import {
  type AnimePlaybackPayload,
  type AnimePlaybackQualityOption,
  type AnimePlaybackServer,
  type AnimePlaybackTrack,
  type PlaybackLanguage,
  type PlaybackMarker,
} from '@/lib/media/types';

import { decodeVidNestPayload } from './vidnest-crypto';
import {
  parseVidNestPlaybackRecord,
  type VidNestPlaybackRecord,
  type VidNestSourceRecord,
  type VidNestTrackRecord,
} from './vidnest-schema';

type ProxyProfile = 'aniwave-media' | 'anitaku-media' | 'subtitle';

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
    return new URL(`/animepahe/${encodeURIComponent(anilistId)}/${episode}/${language}`, appConfig.vidnestAnimeApiBaseUrl);
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

    // Deduplicate by logical identity (label + language) rather than URL so
    // that the same subtitle track served from multiple CDN URLs doesn't appear
    // more than once in the track selector.
    const dedupeKey = `${label}|${srclang}`;
    if (tracks.has(dedupeKey)) {
      continue;
    }

    const track: AnimePlaybackTrack = {
      default: record.default === true || tracks.size === 0,
      kind: record.kind === 'subtitles' ? 'subtitles' : 'captions',
      label,
      src: buildProxyUrl(rawUrl, 'subtitle'),
      srclang,
    };

    tracks.set(dedupeKey, track);
  }

  return Array.from(tracks.values());
}

function getSourceType(candidate: VidNestSourceRecord): 'hls' | 'mp4' {
  const sourceUrl = cleanUrl(candidate.file ?? candidate.url).toLowerCase();
  return sourceUrl.includes('.m3u8') || candidate.type?.toLowerCase().includes('hls') ? 'hls' : 'mp4';
}

function getQualityLabel(candidate: VidNestSourceRecord, fallbackIndex: number): string {
  const normalizedQuality = candidate.quality?.trim();
  if (normalizedQuality) {
    return normalizedQuality.toLowerCase().endsWith('p') ? normalizedQuality : `${normalizedQuality}p`;
  }

  return `Source ${fallbackIndex + 1}`;
}

function normalizeQualityOptions(
  records: VidNestSourceRecord[] | null | undefined,
  sourceProfile: ProxyProfile,
): AnimePlaybackQualityOption[] {
  const normalizedSources = (records ?? [])
    .map((candidate, index) => {
      const sourceUrl = cleanUrl(candidate.file ?? candidate.url);
      if (!sourceUrl) {
        return null;
      }

      return {
        index,
        label: getQualityLabel(candidate, index),
        sourceType: getSourceType(candidate),
        src: buildProxyUrl(sourceUrl, sourceProfile),
      };
    })
    .filter((candidate): candidate is { index: number; label: string; sourceType: 'hls' | 'mp4'; src: string } => Boolean(candidate));

  const uniqueSources = new Map<string, AnimePlaybackQualityOption>();
  normalizedSources.forEach((candidate) => {
    uniqueSources.set(candidate.src, {
      label: candidate.label,
      sourceType: candidate.sourceType,
      src: candidate.src,
    });
  });

  const mp4Options = Array.from(uniqueSources.values()).filter((candidate) => candidate.sourceType === 'mp4');
  if (mp4Options.length > 1) {
    return mp4Options.sort((left, right) => right.label.localeCompare(left.label, undefined, { numeric: true }));
  }

  return [];
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
  const qualityOptions = normalizeQualityOptions(record.sources, sourceProfile);

  return {
    actualLanguage: language,
    displayTitle: record.metadata?.title?.trim() || fallbackMetadata?.title || `AniList ${fallbackMetadata?.title ?? ''}`.trim(),
    intro: normalizeMarker(record.intro),
    outro: normalizeMarker(record.outro),
    posterUrl: record.metadata?.poster?.trim() || record.metadata?.image?.trim() || fallbackMetadata?.posterUrl,
    qualityOptions,
    server,
    sourceType,
    src: buildProxyUrl(sourceUrl, sourceProfile),
    tracks: normalizeTracks(record.tracks),
  };
}

async function fetchPlaybackRecord(attempt: AttemptDescriptor, anilistId: string, episode: number): Promise<VidNestPlaybackRecord> {
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
    throw new AnimePlaybackError(`${attempt.server} server is unreachable for this ${attempt.language} episode.`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new AnimePlaybackError(`${attempt.server} (${attempt.language}): episode not found on this source.`);
    }

    if (response.status === 502 || response.status === 503) {
      throw new AnimePlaybackError(`${attempt.server} (${attempt.language}): source temporarily unavailable.`);
    }

    throw new AnimePlaybackError(`VidNest playback request failed with status ${response.status}.`, response.status);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload) {
    throw new AnimePlaybackError(`${attempt.server} (${attempt.language}): invalid response from VidNest.`);
  }

  const rawDecoded = decodeVidNestPayload<unknown>(payload);
  const normalizedHeaders = cleanHeaders((rawDecoded as { headers?: Record<string, unknown> }).headers);

  if (Object.keys(normalizedHeaders).length > 0) {
  }

  const parsed = parseVidNestPlaybackRecord(rawDecoded);
  if (!parsed) {
    throw new AnimePlaybackError(`${attempt.server} (${attempt.language}): unexpected response shape from VidNest.`);
  }

  return parsed;
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
  const attemptLog: string[] = [];

  for (const attempt of buildAttemptMatrix(preferredServer, language)) {
    try {
      const payload = await fetchPlaybackRecord(attempt, anilistId, parsedEpisode);

      return normalizePlaybackRecord(payload, attempt.server, attempt.language, metadata);
    } catch (error) {
      if (error instanceof AnimePlaybackError) {
        attemptLog.push(error.message);
        continue;
      }

      throw error;
    }
  }

  throw new AnimePlaybackError(`Playback unavailable. ${attemptLog.join('; ')}`);
}
