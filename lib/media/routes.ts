import { normalizeSlug } from '@/lib/slugs/media';

import {
  isAnimeProvider,
  type AnimePlaybackServer,
  type LibraryMediaEntry,
  type MediaEntry,
  type MediaType,
  type PlaybackLanguage,
} from './types';

interface WatchHrefOptions {
  autoPlay?: boolean;
  autoNext?: boolean;
  basePath?: string;
  color?: string;
  episode?: number | string;
  language?: PlaybackLanguage;
  progress?: number | null;
  season?: number | string;
  server?: AnimePlaybackServer;
  skipIntro?: boolean;
}

type RouteEntry = Pick<LibraryMediaEntry | MediaEntry, 'id' | 'provider' | 'title' | 'type'>;

export function buildWatchSlug(title: string, id: string): string {
  return normalizeSlug(title) || id;
}

export function buildWatchHref(entry: RouteEntry, options: WatchHrefOptions = {}): string {
  const basePath = options.basePath ?? (isAnimeProvider(entry.provider) ? '/anime/watch' : '/watch');

  if (isAnimeProvider(entry.provider)) {
    const searchParams = new URLSearchParams();

    if (options.server && options.server !== 'aniwave') {
      searchParams.set('server', options.server);
    }

    if (options.autoPlay === false) {
      searchParams.set('autoPlay', 'false');
    }

    if (options.autoNext === false) {
      searchParams.set('autonext', 'false');
    }

    if (typeof options.skipIntro === 'boolean') {
      searchParams.set('skipintro', String(options.skipIntro));
    }

    if (typeof options.progress === 'number' && Number.isFinite(options.progress) && options.progress >= 0) {
      searchParams.set('progress', String(Math.floor(options.progress)));
    }

    const search = searchParams.toString();
    return `${basePath}/${encodeURIComponent(entry.id)}/${encodeURIComponent(String(options.episode ?? 1))}/${options.language ?? 'sub'}${search ? `?${search}` : ''}`;
  }

  const searchParams = new URLSearchParams({
    id: entry.id,
  });
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

  return `${basePath}/${encodeURIComponent(buildWatchSlug(entry.title, entry.id))}?${searchParams.toString()}`;
}

export function parseAnimePlaybackServer(value: string | null | undefined): AnimePlaybackServer | undefined {
  if (value === 'aniwave' || value === 'anitaku') {
    return value;
  }

  return undefined;
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
