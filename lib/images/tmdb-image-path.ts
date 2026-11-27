/** Shared by the image proxy and the legacy query-string route, which must not load sharp just to redirect. */
export type TmdbImageSize = 'w92' | 'w300' | 'w780';

export const DEFAULT_TMDB_IMAGE_SIZE: TmdbImageSize = 'w780';
export const TMDB_IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i;

export function isTmdbImageSize(value: string | null | undefined): value is TmdbImageSize {
  return value === 'w92' || value === 'w300' || value === 'w780';
}
