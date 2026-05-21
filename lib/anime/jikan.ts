import 'server-only';

import { appConfig } from '@/lib/config';
import type { MediaCastMember, MediaTrailer } from '@/lib/media/types';

interface JikanImageVariant {
  image_url?: string | null;
  large_image_url?: string | null;
  maximum_image_url?: string | null;
  medium_image_url?: string | null;
  small_image_url?: string | null;
}

interface JikanImageSet {
  jpg?: JikanImageVariant | null;
  webp?: JikanImageVariant | null;
}

interface JikanPerson {
  images?: JikanImageSet | null;
  mal_id?: number | null;
  name?: string | null;
}

interface JikanCharacter {
  images?: JikanImageSet | null;
  mal_id?: number | null;
  name?: string | null;
}

interface JikanVoiceActor {
  language?: string | null;
  person?: JikanPerson | null;
}

interface JikanCharacterRole {
  character?: JikanCharacter | null;
  favorites?: number | null;
  role?: string | null;
  voice_actors?: JikanVoiceActor[] | null;
}

interface JikanCharactersResponse {
  data?: JikanCharacterRole[] | null;
}

interface JikanTrailerResource {
  embed_url?: string | null;
  images?: JikanImageVariant | null;
  url?: string | null;
  youtube_id?: string | null;
}

interface JikanPromoVideo {
  title?: string | null;
  trailer?: JikanTrailerResource | null;
}

interface JikanVideosResponse {
  data?: {
    promo?: JikanPromoVideo[] | null;
  } | null;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CAST_LIMIT = 10;
const DEFAULT_TRAILER_LIMIT = 6;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function createJikanUrl(path: string): URL {
  return new URL(path.replace(/^\//, ''), `${appConfig.jikanApiBaseUrl}/`);
}

async function requestJikan<T>(path: string): Promise<T | null> {
  const url = createJikanUrl(path);
  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      next: {
        revalidate: 3600,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: T;

  try {
    payload = (await response.json()) as T;
  } catch {
    return null;
  }

  responseCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    value: payload,
  });

  return payload;
}

function getImageUrl(images?: JikanImageSet | null): string | undefined {
  const candidates = [
    images?.webp?.maximum_image_url,
    images?.jpg?.maximum_image_url,
    images?.webp?.large_image_url,
    images?.jpg?.large_image_url,
    images?.webp?.image_url,
    images?.jpg?.image_url,
    images?.webp?.medium_image_url,
    images?.jpg?.medium_image_url,
    images?.webp?.small_image_url,
    images?.jpg?.small_image_url,
  ];

  return candidates.map((candidate) => cleanText(candidate)).find(Boolean) || undefined;
}

function getRolePriority(role?: string | null): number {
  const normalizedRole = cleanText(role).toLowerCase();

  if (normalizedRole === 'main') return 0;
  if (normalizedRole === 'supporting') return 1;
  return 2;
}

function getPreferredVoiceActor(voiceActors?: JikanVoiceActor[] | null): JikanVoiceActor | undefined {
  const candidates = (voiceActors ?? []).filter((voiceActor) => Boolean(cleanText(voiceActor.person?.name)));

  for (const preferredLanguage of ['English', 'Japanese']) {
    const preferredActor = candidates.find(
      (voiceActor) => cleanText(voiceActor.language).toLowerCase() === preferredLanguage.toLowerCase(),
    );

    if (preferredActor) {
      return preferredActor;
    }
  }

  return candidates[0];
}

function extractYouTubeId(resource?: JikanTrailerResource | null): string | undefined {
  const directId = cleanText(resource?.youtube_id);
  if (directId) {
    return directId;
  }

  const urlCandidates = [cleanText(resource?.url), cleanText(resource?.embed_url)];

  for (const candidate of urlCandidates) {
    if (!candidate) continue;

    const embedMatch = candidate.match(/\/embed\/([^?&/]+)/);
    if (embedMatch?.[1]) {
      return embedMatch[1];
    }

    const watchMatch = candidate.match(/[?&]v=([^?&/]+)/);
    if (watchMatch?.[1]) {
      return watchMatch[1];
    }

    const shortMatch = candidate.match(/youtu\.be\/([^?&/]+)/);
    if (shortMatch?.[1]) {
      return shortMatch[1];
    }
  }

  return undefined;
}

function getTrailerUrl(resource?: JikanTrailerResource | null): string | undefined {
  const directUrl = cleanText(resource?.url);
  if (directUrl) {
    return directUrl;
  }

  const youtubeId = extractYouTubeId(resource);
  if (youtubeId) {
    return `https://www.youtube.com/watch?v=${youtubeId}`;
  }

  const embedUrl = cleanText(resource?.embed_url);
  return embedUrl || undefined;
}

function getTrailerEmbedUrl(resource?: JikanTrailerResource | null): string | undefined {
  const embedUrl = cleanText(resource?.embed_url);
  if (embedUrl) {
    return embedUrl;
  }

  const youtubeId = extractYouTubeId(resource);
  return youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&rel=0` : undefined;
}

function getTrailerThumbnailUrl(resource?: JikanTrailerResource | null): string | undefined {
  const imageCandidates = [
    resource?.images?.maximum_image_url,
    resource?.images?.large_image_url,
    resource?.images?.medium_image_url,
    resource?.images?.image_url,
    resource?.images?.small_image_url,
  ];

  const imageUrl = imageCandidates.map((candidate) => cleanText(candidate)).find(Boolean);
  if (imageUrl) {
    return imageUrl;
  }

  const youtubeId = extractYouTubeId(resource);
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined;
}

function mapCastMembers(payload: JikanCharactersResponse | null, limit = DEFAULT_CAST_LIMIT): MediaCastMember[] {
  const cast = (payload?.data ?? [])
    .filter((member) => Boolean(cleanText(member.character?.name)))
    .sort((left, right) => {
      const leftPriority = getRolePriority(left.role);
      const rightPriority = getRolePriority(right.role);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return (right.favorites ?? 0) - (left.favorites ?? 0);
    })
    .map((member) => {
      const preferredVoiceActor = getPreferredVoiceActor(member.voice_actors);
      const characterName = cleanText(member.character?.name);
      const actorName = cleanText(preferredVoiceActor?.person?.name) || characterName;

      return {
        character: characterName || undefined,
        id: member.character?.mal_id ?? preferredVoiceActor?.person?.mal_id ?? undefined,
        name: actorName,
        profileUrl: getImageUrl(preferredVoiceActor?.person?.images) ?? getImageUrl(member.character?.images),
      };
    })
    .filter((member) => Boolean(member.name));

  const uniqueCast = new Map<string, MediaCastMember>();

  cast.forEach((member) => {
    uniqueCast.set(`${member.id ?? member.name}:${member.character ?? ''}`, member);
  });

  return Array.from(uniqueCast.values()).slice(0, limit);
}

function mapTrailers(payload: JikanVideosResponse | null, limit = DEFAULT_TRAILER_LIMIT): MediaTrailer[] {
  const trailers: MediaTrailer[] = [];

  (payload?.data?.promo ?? []).forEach((promo) => {
    const title = cleanText(promo.title) || 'Trailer';
    const youtubeId = extractYouTubeId(promo.trailer);
    const url = getTrailerUrl(promo.trailer);

    if (!url) {
      return;
    }

    trailers.push({
      embedUrl: getTrailerEmbedUrl(promo.trailer),
      thumbnailUrl: getTrailerThumbnailUrl(promo.trailer),
      title,
      url,
      youtubeId,
    });
  });

  const uniqueTrailers = new Map<string, MediaTrailer>();

  trailers.forEach((trailer) => {
    uniqueTrailers.set(trailer.youtubeId ?? trailer.url, trailer);
  });

  return Array.from(uniqueTrailers.values()).slice(0, limit);
}

export async function fetchJikanAnimeMetadata(malId: string): Promise<{
  cast: MediaCastMember[];
  trailers: MediaTrailer[];
}> {
  const parsedMalId = Number.parseInt(malId, 10);
  if (Number.isNaN(parsedMalId) || parsedMalId < 1) {
    return {
      cast: [],
      trailers: [],
    };
  }

  const [charactersPayload, videosPayload] = await Promise.all([
    requestJikan<JikanCharactersResponse>(`/anime/${parsedMalId}/characters`),
    requestJikan<JikanVideosResponse>(`/anime/${parsedMalId}/videos`),
  ]);

  return {
    cast: mapCastMembers(charactersPayload),
    trailers: mapTrailers(videosPayload),
  };
}
