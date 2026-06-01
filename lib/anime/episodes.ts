import type { AnilistMedia } from '@/lib/anime/anilist';
import type { AniZipEpisode, AniZipMappingsResponse } from '@/lib/anime/ani-zip';
import { getAniZipEpisodeTitle, listAniZipEpisodes } from '@/lib/anime/ani-zip';
import type { AnimeFormat, MediaType, TvMediaEntry } from '@/lib/media/types';

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function cleanText(value: string | number | null | undefined): string {
  return value == null ? '' : String(value).replace(/\r\n/g, '\n').trim();
}

export function cleanSynopsis(value: string | number | null | undefined): string {
  return cleanText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Format / type helpers
// ---------------------------------------------------------------------------

export function mapAnilistFormatToMediaType(format: AnimeFormat | null | undefined): MediaType {
  return format === 'MOVIE' ? 'movie' : 'tv';
}

// ---------------------------------------------------------------------------
// AniList media field helpers
// ---------------------------------------------------------------------------

export function getAnilistTitle(media: AnilistMedia): string {
  return (
    cleanText(media.title.userPreferred) ||
    cleanText(media.title.english) ||
    cleanText(media.title.romaji) ||
    cleanText(media.title.native) ||
    `AniList ${media.id}`
  );
}

export function getBackdropUrl(media: AnilistMedia): string | undefined {
  return (
    cleanText(media.bannerImage) ||
    cleanText(media.coverImage?.extraLarge) ||
    cleanText(media.coverImage?.large) ||
    undefined
  );
}

export function getPosterUrl(media: AnilistMedia): string | undefined {
  return cleanText(media.coverImage?.extraLarge) || cleanText(media.coverImage?.large) || getBackdropUrl(media);
}

// ---------------------------------------------------------------------------
// Release / airing logic
// ---------------------------------------------------------------------------

export function getStartDateTimestamp(media: AnilistMedia): number | null {
  const year = media.startDate?.year;
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return null;
  }

  const month = media.startDate?.month;
  const day = media.startDate?.day;
  return Date.UTC(year, Math.max(0, (month ?? 1) - 1), day ?? 1);
}

export function getAniZipEpisodeAirTimestamp(episode: AniZipEpisode | undefined): number | null {
  const airDate = cleanText(episode?.airDate);
  if (!airDate) {
    return null;
  }

  const parsedAirDate = Date.parse(`${airDate}T00:00:00Z`);
  return Number.isFinite(parsedAirDate) ? parsedAirDate : null;
}

export function isAniZipEpisodeReleased(episode: AniZipEpisode): boolean {
  const parsedAirDate = getAniZipEpisodeAirTimestamp(episode);
  if (parsedAirDate === null) {
    return true;
  }

  return parsedAirDate <= Date.now();
}

export function isAniZipEpisodeScheduled(episode: AniZipEpisode): boolean {
  const parsedAirDate = getAniZipEpisodeAirTimestamp(episode);
  return parsedAirDate !== null && parsedAirDate > Date.now();
}

export function getUpcomingEpisodeBoundary(media: AnilistMedia): number | null {
  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;

  if (
    typeof nextEpisodeNumber !== 'number' ||
    !Number.isFinite(nextEpisodeNumber) ||
    typeof nextEpisodeAt !== 'number' ||
    !Number.isFinite(nextEpisodeAt) ||
    nextEpisodeAt * 1000 <= Date.now()
  ) {
    return null;
  }

  return nextEpisodeNumber;
}

export function isReleasedAnime(media: AnilistMedia): boolean {
  if (media.status === 'NOT_YET_RELEASED') {
    return false;
  }

  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;
  if (
    typeof nextEpisodeNumber === 'number' &&
    nextEpisodeNumber <= 1 &&
    typeof nextEpisodeAt === 'number' &&
    nextEpisodeAt * 1000 > Date.now()
  ) {
    return false;
  }

  const startDateTimestamp = getStartDateTimestamp(media);
  if (startDateTimestamp !== null && startDateTimestamp > Date.now()) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Episode counting
// ---------------------------------------------------------------------------

export function getReleasedAniZipEpisodeCount(
  mappings?: AniZipMappingsResponse | null,
  upcomingEpisodeBoundary?: number | null,
): number {
  return listAniZipEpisodes(mappings)
    .filter((episode) => {
      if (
        typeof episode.episodeNumber === 'number' &&
        upcomingEpisodeBoundary &&
        episode.episodeNumber >= upcomingEpisodeBoundary
      ) {
        return false;
      }

      return isAniZipEpisodeReleased(episode);
    })
    .length;
}

export function getVisibleAniZipEpisodeCount(mappings?: AniZipMappingsResponse | null): number {
  return listAniZipEpisodes(mappings)
    .filter((episode) => isAniZipEpisodeReleased(episode) || isAniZipEpisodeScheduled(episode))
    .reduce((highestEpisodeNumber, episode) => {
      return typeof episode.episodeNumber === 'number'
        ? Math.max(highestEpisodeNumber, episode.episodeNumber)
        : highestEpisodeNumber;
    }, 0);
}

export function getReleasedEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  const upcomingEpisodeBoundary = getUpcomingEpisodeBoundary(media);
  const aniZipEpisodeCount = getReleasedAniZipEpisodeCount(mappings, upcomingEpisodeBoundary);

  if (media.status === 'RELEASING') {
    if (typeof upcomingEpisodeBoundary === 'number') {
      return Math.max(upcomingEpisodeBoundary - 1, 0);
    }

    if (aniZipEpisodeCount > 0) {
      return aniZipEpisodeCount;
    }

    return isReleasedAnime(media) ? 1 : 0;
  }

  return Math.max(media.episodes ?? 0, aniZipEpisodeCount, isReleasedAnime(media) ? 1 : 0);
}

export function getVisibleEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  return Math.max(
    getReleasedEpisodeCount(media, mappings),
    getVisibleAniZipEpisodeCount(mappings),
    media.nextAiringEpisode?.episode ?? 0,
  );
}

export function getNextEpisodeInfo(media: AnilistMedia): Pick<TvMediaEntry, 'nextEpisodeAt' | 'nextEpisodeNumber'> {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) !== 'tv' || !isReleasedAnime(media)) {
    return {};
  }

  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;
  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  if (
    typeof nextEpisodeAt !== 'number' ||
    !Number.isFinite(nextEpisodeAt) ||
    nextEpisodeAt * 1000 <= Date.now() ||
    typeof nextEpisodeNumber !== 'number' ||
    !Number.isFinite(nextEpisodeNumber)
  ) {
    return {};
  }

  return {
    nextEpisodeAt,
    nextEpisodeNumber,
  };
}

export function getEpisodeCount(media: AnilistMedia, mappings?: AniZipMappingsResponse | null): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return 1;
  }

  return Math.max(getReleasedEpisodeCount(media, mappings), 1);
}

// ---------------------------------------------------------------------------
// Episode-specific helpers (used for building SeasonDetails)
// ---------------------------------------------------------------------------

export { getAniZipEpisodeTitle, listAniZipEpisodes };
