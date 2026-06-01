import 'server-only';

import type { MediaEntry, MediaType, SeasonDetails } from '@/lib/media/types';
import { normalizeSlug } from '@/lib/slugs/media';

import { lookupAnimeMediaEntry, searchAnimeLibrary } from './client';
import { fetchKitsuAnimeById } from './kitsu';
import { fetchJikanAnimeById } from './jikan';
import { resolveAnilistIdByTitle } from './resolve-streaming-id';

export interface ResolvedAnimeMediaEntry {
  entry: MediaEntry;
  matchedBy: 'id' | 'kitsu' | 'mal' | 'search' | 'title';
  seasonDetails: SeasonDetails | null;
}

function matchesExactAlias(entry: MediaEntry, identifier: string): boolean {
  const normalizedIdentifier = normalizeSlug(identifier);

  return entry.aliases.some((alias) => normalizeSlug(alias) === normalizedIdentifier);
}

async function resolveExternalIdToAnilistId(
  externalId: string,
  fetcher: { fetch: (id: string) => Promise<{ title: string; year?: number } | null> },
): Promise<string | null> {
  const record = await fetcher.fetch(externalId);
  if (!record) {
    return null;
  }

  const resolved = await resolveAnilistIdByTitle({
    externalTitle: record.title,
    externalYear: record.year,
  });

  return resolved?.anilistId ?? null;
}

const KitsuFetcher = { fetch: (id: string) => fetchKitsuAnimeById(id.replace(/^kitsu-/, '')) };
const JikanFetcher = { fetch: (id: string) => fetchJikanAnimeById(id.replace(/^mal-/, '')) };

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

  if (trimmedIdentifier.startsWith('kitsu-')) {
    const anilistId = await resolveExternalIdToAnilistId(trimmedIdentifier, KitsuFetcher);
    if (anilistId) {
      const lookup = await lookupAnimeMediaEntry(anilistId);
      if (lookup.ok) {
        return { entry: lookup.entry, matchedBy: 'kitsu', seasonDetails: lookup.seasonDetails };
      }
    }
  }

  if (trimmedIdentifier.startsWith('mal-')) {
    const anilistId = await resolveExternalIdToAnilistId(trimmedIdentifier, JikanFetcher);
    if (anilistId) {
      const lookup = await lookupAnimeMediaEntry(anilistId);
      if (lookup.ok) {
        return { entry: lookup.entry, matchedBy: 'mal', seasonDetails: lookup.seasonDetails };
      }
    }
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
