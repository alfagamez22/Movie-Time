import { normalizeSlug } from '@/lib/slugs/media';

import { isAnimeProvider, type LibraryMediaEntry, type MediaEntry, type MediaType, type PlaybackLanguage } from './types';

interface WatchHrefOptions {
  autoPlay?: boolean;
  basePath?: string;
  color?: string;
  episode?: number | string;
  language?: PlaybackLanguage;
  progress?: number | null;
  season?: number | string;
}

type RouteEntry = Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'title' | 'type'>;

export function buildWatchSlug(title: string, id: string): string {
  return normalizeSlug(title) || id;
}

export function buildWatchHref(entry: RouteEntry, options: WatchHrefOptions = {}): string {
  const searchParams = new URLSearchParams({
    id: entry.id,
  });
  const basePath = options.basePath ?? (isAnimeProvider(entry.provider) ? '/anime/watch' : '/watch');

  if (isAnimeProvider(entry.provider)) {
    searchParams.set('e', String(options.episode ?? 1));
    searchParams.set('lang', options.language ?? 'sub');
  } else {
    searchParams.set('type', entry.type);

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
  }

  return `${basePath}/${encodeURIComponent(buildWatchSlug(entry.title, entry.id))}?${searchParams.toString()}`;
}

export function parseMediaType(value: string | null | undefined): MediaType | undefined {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return undefined;
}

export function parsePlaybackLanguage(value: string | null | undefined): PlaybackLanguage | undefined {
  if (value === 'sub' || value === 'dub') {
    return value;
  }

  return undefined;
}
