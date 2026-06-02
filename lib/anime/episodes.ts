import type { AnilistMedia } from '@/lib/anime/anilist';
import type { AnimeFormat, MediaType } from '@/lib/media/types';

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

export function mapAnilistFormatToMediaType(format: AnimeFormat | null | undefined): MediaType {
  return format === 'MOVIE' ? 'movie' : 'tv';
}

export function getAnilistTitle(media: AnilistMedia): string {
  return (
    cleanText(media.title.english) ||
    cleanText(media.title.userPreferred) ||
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

export function getStartDateTimestamp(media: AnilistMedia): number | null {
  const year = media.startDate?.year;
  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return null;
  }

  const month = media.startDate?.month;
  const day = media.startDate?.day;
  return Date.UTC(year, Math.max(0, (month ?? 1) - 1), day ?? 1);
}

export function getReleasedEpisodeBoundary(media: AnilistMedia): number {
  const nextEpisodeNumber = media.nextAiringEpisode?.episode;
  const nextEpisodeAt = media.nextAiringEpisode?.airingAt;

  if (
    typeof nextEpisodeNumber !== 'number' ||
    !Number.isFinite(nextEpisodeNumber) ||
    typeof nextEpisodeAt !== 'number' ||
    !Number.isFinite(nextEpisodeAt) ||
    nextEpisodeAt * 1000 <= Date.now()
  ) {
    return 0;
  }

  return Math.max(0, Math.floor(nextEpisodeNumber) - 1);
}

export function getEpisodeCount(media: AnilistMedia): number {
  if (mapAnilistFormatToMediaType(media.format ?? undefined) === 'movie') {
    return isReleasedAnime(media) ? 1 : 0;
  }

  if (!isReleasedAnime(media)) {
    return 0;
  }

  return Math.max(media.episodes ?? 0, getReleasedEpisodeBoundary(media), 1);
}
