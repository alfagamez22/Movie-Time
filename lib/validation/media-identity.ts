import type { MediaExperience, MediaProvider, MediaType } from '@/lib/media/types';

/**
 * Request guards for user-owned media records (bookmarks, comments, progress).
 * Unknown providers/experiences cannot be routed to a Couchbase collection, so they must be
 * rejected with a 400 before reaching lib/db instead of surfacing as a 500.
 */
export const MEDIA_PROVIDERS: readonly MediaProvider[] = ['tmdb', 'anilist', 'anikoto', 'mangadex'];
export const MEDIA_EXPERIENCES: readonly MediaExperience[] = ['papiflix', 'papianime', 'papimanga'];
export const MEDIA_TYPES: readonly MediaType[] = ['movie', 'tv'];

export const MAX_MEDIA_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 300;
export const MAX_SYNOPSIS_LENGTH = 1000;
export const MAX_IMAGE_URL_LENGTH = 2048;

export type GuardResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MediaIdentity {
  mediaId: string;
  mediaProvider: MediaProvider;
  mediaType: MediaType;
}

export function isMediaProvider(value: unknown): value is MediaProvider {
  return typeof value === 'string' && (MEDIA_PROVIDERS as readonly string[]).includes(value);
}

export function isMediaExperience(value: unknown): value is MediaExperience {
  return typeof value === 'string' && (MEDIA_EXPERIENCES as readonly string[]).includes(value);
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && (MEDIA_TYPES as readonly string[]).includes(value);
}

export function isMediaId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_MEDIA_ID_LENGTH;
}

export function validateMediaIdentity(input: {
  mediaId?: unknown;
  mediaProvider?: unknown;
  mediaType?: unknown;
}): GuardResult<MediaIdentity> {
  if (!isMediaId(input.mediaId)) return { ok: false, error: 'Invalid media id.' };
  if (!isMediaProvider(input.mediaProvider)) return { ok: false, error: 'Invalid media provider.' };
  if (!isMediaType(input.mediaType)) return { ok: false, error: 'Invalid media type.' };
  return { ok: true, value: { mediaId: input.mediaId, mediaProvider: input.mediaProvider, mediaType: input.mediaType } };
}

/** Optional experience filter from a query string: absent is fine, unknown is not. */
export function validateOptionalExperience(value: string | null | undefined): GuardResult<MediaExperience | null> {
  if (value == null || value === '') return { ok: true, value: null };
  return isMediaExperience(value) ? { ok: true, value } : { ok: false, error: 'Invalid experience.' };
}

export function validateTitle(value: unknown): GuardResult<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'Invalid title.' };
  if (value.length > MAX_TITLE_LENGTH) return { ok: false, error: 'Title is too long.' };
  return { ok: true, value };
}

/** Synopses come from upstream catalogs and are display-only, so over-long text is truncated, not rejected. */
export function normalizeSynopsis(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_SYNOPSIS_LENGTH) : '';
}

/** Image URLs are optional: missing/null becomes null, anything else must be a bounded string. */
export function validateImageUrl(value: unknown): GuardResult<string | null> {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > MAX_IMAGE_URL_LENGTH) return { ok: false, error: 'Invalid image URL.' };
  return { ok: true, value };
}
