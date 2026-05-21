import 'server-only';

import type { MediaEntry, MediaType, SeasonDetails } from '@/lib/media/types';
import { normalizeSlug } from '@/lib/slugs/media';

import { lookupAnimeMediaEntry, searchAnimeLibrary } from './client';

export interface ResolvedAnimeMediaEntry {
  entry: MediaEntry;
  matchedBy: 'id' | 'search' | 'title';
  seasonDetails: SeasonDetails | null;
}

function matchesExactAlias(entry: MediaEntry, identifier: string): boolean {
  const normalizedIdentifier = normalizeSlug(identifier);

  return entry.aliases.some((alias) => normalizeSlug(alias) === normalizedIdentifier);
}

export async function resolveAnimeMediaEntry(
  identifier: string,
  preferredAnilistId?: string,
): Promise<ResolvedAnimeMediaEntry | null> {
  const preferredId = preferredAnilistId?.trim();
  if (preferredId && /^\d+$/.test(preferredId)) {
    const lookup = await lookupAnimeMediaEntry(preferredId);
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
    const lookup = await lookupAnimeMediaEntry(trimmedIdentifier);
    if (lookup.ok) {
      return {
        entry: lookup.entry,
        matchedBy: 'id',
        seasonDetails: lookup.seasonDetails,
      };
    }
  }

  const search = await searchAnimeLibrary(trimmedIdentifier);
  if (!search.ok || search.entries.length === 0) {
    return null;
  }

  const exactMatch = search.entries.find((candidate) => normalizeSlug(candidate.title) === normalizeSlug(trimmedIdentifier));
  const aliasMatch = exactMatch
    ? null
    : search.entries.find((candidate) => {
        const aliases = [candidate.title];
        return aliases.some((alias) => normalizeSlug(alias) === normalizeSlug(trimmedIdentifier));
      });
  const selectedEntry = exactMatch ?? aliasMatch ?? search.entries[0];
  const lookup = await lookupAnimeMediaEntry(selectedEntry.id);

  if (!lookup.ok) {
    return null;
  }

  return {
    entry: lookup.entry,
    matchedBy: exactMatch || matchesExactAlias(lookup.entry, trimmedIdentifier) ? 'title' : 'search',
    seasonDetails: lookup.seasonDetails,
  };
}

export function filterAnimeEntriesByType(entries: MediaEntry[], type?: MediaType) {
  return type ? entries.filter((entry) => entry.type === type) : entries;
}
