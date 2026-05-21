import 'server-only';

import { normalizeSlug } from '@/lib/slugs/media';
import { lookupTmdbMediaEntry, searchTmdbLibrary } from '@/lib/tmdb/client';

import type { MediaEntry, MediaType } from './types';

export interface ResolvedLiveMediaEntry {
  entry: MediaEntry;
  matchedBy: 'id' | 'search' | 'title';
}

async function lookupById(tmdbId: string, typeHint?: MediaType): Promise<MediaEntry | null> {
  if (typeHint) {
    const lookup = await lookupTmdbMediaEntry(tmdbId, typeHint);
    return lookup.ok ? lookup.entry : null;
  }

  const [movieLookup, tvLookup] = await Promise.all([
    lookupTmdbMediaEntry(tmdbId, 'movie'),
    lookupTmdbMediaEntry(tmdbId, 'tv'),
  ]);

  if (movieLookup.ok) {
    return movieLookup.entry;
  }

  if (tvLookup.ok) {
    return tvLookup.entry;
  }

  return null;
}

export function buildCanonicalMediaSlug(entry: Pick<MediaEntry, 'id' | 'title'>): string {
  return normalizeSlug(entry.title) || entry.id;
}

export async function resolveLiveMediaEntry(
  identifier: string,
  typeHint?: MediaType,
  preferredTmdbId?: string,
): Promise<ResolvedLiveMediaEntry | null> {
  const preferredId = preferredTmdbId?.trim();
  if (preferredId && /^\d+$/.test(preferredId)) {
    const entry = await lookupById(preferredId, typeHint);
    if (entry) {
      return {
        entry,
        matchedBy: 'id',
      };
    }
  }

  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return null;
  }

  if (/^\d+$/.test(trimmedIdentifier)) {
    const entry = await lookupById(trimmedIdentifier, typeHint);
    if (entry) {
      return {
        entry,
        matchedBy: 'id',
      };
    }
  }

  const search = await searchTmdbLibrary(trimmedIdentifier, typeHint);
  if (!search.ok || search.entries.length === 0) {
    return null;
  }

  const normalizedIdentifier = normalizeSlug(trimmedIdentifier);
  const exactMatch = search.entries.find((candidate) => normalizeSlug(candidate.title) === normalizedIdentifier);
  const selectedEntry = exactMatch ?? search.entries[0];
  const entry = await lookupById(selectedEntry.id, selectedEntry.type);

  if (!entry) {
    return null;
  }

  return {
    entry,
    matchedBy: exactMatch ? 'title' : 'search',
  };
}
