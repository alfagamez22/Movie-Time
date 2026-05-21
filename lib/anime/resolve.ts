import 'server-only';

import { normalizeSlug } from '@/lib/slugs/media';

import { lookupAnikotoMediaEntry, searchAnikotoLibrary } from './client';

import type { MediaEntry, MediaType, SeasonDetails } from '@/lib/media/types';

export interface ResolvedAnimeMediaEntry {
  entry: MediaEntry;
  matchedBy: 'id' | 'search' | 'title';
  seasonDetails: SeasonDetails | null;
}

export async function resolveAnimeMediaEntry(
  identifier: string,
  preferredAnikotoId?: string,
): Promise<ResolvedAnimeMediaEntry | null> {
  const preferredId = preferredAnikotoId?.trim();
  if (preferredId && /^\d+$/.test(preferredId)) {
    const lookup = await lookupAnikotoMediaEntry(preferredId);
    if (lookup.ok) {
      return {
        entry: lookup.entry,
        matchedBy: 'id',
        seasonDetails: lookup.seasonDetails,
      };
    }
  }

  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return null;
  }

  if (/^\d+$/.test(trimmedIdentifier)) {
    const lookup = await lookupAnikotoMediaEntry(trimmedIdentifier);
    if (lookup.ok) {
      return {
        entry: lookup.entry,
        matchedBy: 'id',
        seasonDetails: lookup.seasonDetails,
      };
    }
  }

  const search = await searchAnikotoLibrary(trimmedIdentifier);
  if (!search.ok || search.entries.length === 0) {
    return null;
  }

  const normalizedIdentifier = normalizeSlug(trimmedIdentifier);
  const exactMatch = search.entries.find((candidate) => normalizeSlug(candidate.title) === normalizedIdentifier);
  const selectedEntry = exactMatch ?? search.entries[0];
  const lookup = await lookupAnikotoMediaEntry(selectedEntry.id);

  if (!lookup.ok) {
    return null;
  }

  return {
    entry: lookup.entry,
    matchedBy: exactMatch ? 'title' : 'search',
    seasonDetails: lookup.seasonDetails,
  };
}

export function filterAnimeEntriesByType(entries: MediaEntry[], type?: MediaType) {
  return type ? entries.filter((entry) => entry.type === type) : entries;
}
