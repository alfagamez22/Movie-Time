import { normalizeSlug } from '@/lib/slugs/media';

import type { LibraryMediaEntry, MediaEntry, MediaType } from './types';

interface WatchHrefOptions {
  autoPlay?: boolean;
  color?: string;
  episode?: number | string;
  progress?: number | null;
  season?: number | string;
}

type RouteEntry = Pick<LibraryMediaEntry | MediaEntry, 'title' | 'tmdbId' | 'type'>;

export function buildWatchSlug(title: string, tmdbId: string): string {
  return normalizeSlug(title) || tmdbId;
}

export function buildWatchHref(entry: RouteEntry, options: WatchHrefOptions = {}): string {
  const searchParams = new URLSearchParams({
    id: entry.tmdbId,
    type: entry.type,
  });

  if (entry.type === 'tv') {
    searchParams.set('s', String(options.season ?? 1));
    searchParams.set('e', String(options.episode ?? 1));
  }

  if (options.color) {
    searchParams.set('color', options.color);
  }

  if (options.autoPlay === false) {
    searchParams.set('autoPlay', 'false');
  }

  if (typeof options.progress === 'number' && Number.isFinite(options.progress) && options.progress >= 0) {
    searchParams.set('progress', String(Math.floor(options.progress)));
  }

  return `/watch/${encodeURIComponent(buildWatchSlug(entry.title, entry.tmdbId))}?${searchParams.toString()}`;
}

export function parseMediaType(value: string | null | undefined): MediaType | undefined {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return undefined;
}
