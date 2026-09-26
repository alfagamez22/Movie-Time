import type { LibraryMediaEntry, MediaExperience } from './types';

const STORAGE_KEY = 'papiflix-playback-return-v1';
const MAX_AGE_MS = 60 * 60 * 1000;

interface PlaybackReturnContext {
  createdAt: number;
  entry: LibraryMediaEntry;
  experience: MediaExperience;
  sourcePath: string;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function readContext(): PlaybackReturnContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PlaybackReturnContext>;
    if (!value.entry?.id || !value.entry?.title || !value.entry.provider || !value.entry.type ||
        !value.experience || !value.sourcePath?.startsWith('/') || value.sourcePath.startsWith('//') ||
        typeof value.createdAt !== 'number' || Date.now() - value.createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value as PlaybackReturnContext;
  } catch {
    return null;
  }
}

export function rememberPlaybackReturn(entry: LibraryMediaEntry, experience: MediaExperience) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      createdAt: Date.now(),
      entry,
      experience,
      sourcePath: currentPath(),
    } satisfies PlaybackReturnContext));
  } catch {
    // Back still works with the library fallback if browser storage is unavailable.
  }
}

export function playbackBackTarget(entry: LibraryMediaEntry, experience: MediaExperience, homeHref: string): string {
  const context = readContext();
  if (context?.experience === experience && context.entry.id === entry.id &&
      context.entry.provider === entry.provider && context.entry.type === entry.type &&
      (context.sourcePath === homeHref || context.sourcePath.startsWith(`${homeHref}?`) ||
       context.sourcePath.startsWith(`${homeHref}#`) || context.sourcePath.startsWith('/categories'))) {
    return context.sourcePath;
  }
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        createdAt: Date.now(), entry, experience, sourcePath: homeHref,
      } satisfies PlaybackReturnContext));
    } catch {
      // Returning to the home page remains possible without browser storage.
    }
  }
  return homeHref;
}

export function consumePlaybackReturn(experience: MediaExperience): LibraryMediaEntry | null {
  const context = readContext();
  if (!context || context.experience !== experience ||
      context.sourcePath.split('#')[0] !== currentPath().split('#')[0]) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The card can still be restored for this visit.
  }
  return context.entry;
}
