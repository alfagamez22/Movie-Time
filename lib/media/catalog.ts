import { movieCatalog } from '@/content/media/movies';
import { seriesCatalog } from '@/content/media/series';
import { normalizeSlug, normalizeSlugList } from '@/lib/slugs/media';

import { isTvEntry, type CatalogEntry, type MediaEntry, type MediaType } from './types';

export interface MediaResolution {
  entry: MediaEntry;
  matchedBy: 'slug' | 'alias' | 'id';
}

const sourceCatalog: CatalogEntry[] = [...seriesCatalog, ...movieCatalog];

function toMediaEntry(entry: CatalogEntry): MediaEntry {
  const canonicalSlug = normalizeSlug(entry.slug ?? entry.title);
  if (!canonicalSlug) {
    throw new Error(`Catalog entry "${entry.title}" is missing a valid slug.`);
  }

  const titleSlug = normalizeSlug(entry.title);
  const aliases = normalizeSlugList([
    ...(entry.aliases ?? []),
    ...(titleSlug !== canonicalSlug ? [titleSlug] : []),
  ]);

  if (isTvEntry(entry)) {
    return {
      ...entry,
      slug: canonicalSlug,
      aliases,
    };
  }

  return {
    ...entry,
    slug: canonicalSlug,
    aliases,
  };
}

const mediaCatalog: MediaEntry[] = sourceCatalog.map(toMediaEntry);
const slugIndex = new Map<string, MediaEntry>();
const aliasIndex = new Map<string, MediaEntry>();
const idIndex = new Map<string, MediaEntry>();

for (const entry of mediaCatalog) {
  if (idIndex.has(entry.tmdbId)) {
    throw new Error(`Duplicate TMDB ID detected in catalog: ${entry.tmdbId}`);
  }

  if (slugIndex.has(entry.slug) || aliasIndex.has(entry.slug)) {
    throw new Error(`Duplicate canonical slug detected in catalog: ${entry.slug}`);
  }

  idIndex.set(entry.tmdbId, entry);
  slugIndex.set(entry.slug, entry);

  for (const alias of entry.aliases) {
    if (alias === entry.slug) {
      continue;
    }

    if (slugIndex.has(alias) || aliasIndex.has(alias)) {
      throw new Error(`Duplicate alias detected in catalog: ${alias}`);
    }

    aliasIndex.set(alias, entry);
  }
}

export function getMediaCatalog(type?: MediaType): MediaEntry[] {
  if (!type) {
    return mediaCatalog;
  }

  return mediaCatalog.filter((entry) => entry.type === type);
}

export function getCatalogSections(): Record<MediaType, MediaEntry[]> {
  return {
    movie: getMediaCatalog('movie'),
    tv: getMediaCatalog('tv'),
  };
}

export function searchMediaCatalog(query: string, type?: MediaType): MediaEntry[] {
  const normalizedQuery = normalizeSlug(query);
  if (!normalizedQuery) {
    return getMediaCatalog(type);
  }

  return getMediaCatalog(type).filter((entry) => {
    if (entry.slug.includes(normalizedQuery) || entry.tmdbId === query.trim()) {
      return true;
    }

    return entry.aliases.some((alias) => alias.includes(normalizedQuery));
  });
}

export function resolveMediaIdentifier(identifier: string): MediaResolution | null {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return null;
  }

  const byId = idIndex.get(trimmedIdentifier);
  if (byId) {
    return {
      entry: byId,
      matchedBy: 'id',
    };
  }

  const normalizedIdentifier = normalizeSlug(trimmedIdentifier);
  if (!normalizedIdentifier) {
    return null;
  }

  const bySlug = slugIndex.get(normalizedIdentifier);
  if (bySlug) {
    return {
      entry: bySlug,
      matchedBy: 'slug',
    };
  }

  const byAlias = aliasIndex.get(normalizedIdentifier);
  if (byAlias) {
    return {
      entry: byAlias,
      matchedBy: 'alias',
    };
  }

  return null;
}