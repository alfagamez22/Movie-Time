import type { MetadataRoute } from 'next';

import { getAnimeLibrarySections } from '@/lib/anime/client';
import { buildWatchHref } from '@/lib/media/routes';
import type { LibraryMediaEntry } from '@/lib/media/types';
import { absoluteUrl, canonicalWatchPath } from '@/lib/seo';
import { normalizeSlug } from '@/lib/slugs/media';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';
import { getGenreTiles } from '@/lib/tmdb/genres';

export const revalidate = 86_400;

const COLLECTIONS = ['trending', 'discover', 'regional', 'genre', 'rating'];

function uniqueEntries(sections: Array<{ entries: LibraryMediaEntry[]; tier?: string }>) {
  const seen = new Map<string, LibraryMediaEntry>();
  for (const section of sections) {
    if (section.tier === 'mature') continue;
    for (const entry of section.entries) seen.set(`${entry.provider}:${entry.type}:${entry.id}`, entry);
  }
  return [...seen.values()];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [tmdb, anime, genres] = await Promise.all([
    getTmdbLibrarySections().catch(() => null),
    getAnimeLibrarySections().catch(() => null),
    getGenreTiles().catch(() => []),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { changeFrequency: 'daily', lastModified: now, priority: 1, url: absoluteUrl('/') },
    { changeFrequency: 'daily', lastModified: now, priority: 0.9, url: absoluteUrl('/anime') },
    { changeFrequency: 'daily', lastModified: now, priority: 0.8, url: absoluteUrl('/manga') },
    { changeFrequency: 'weekly', lastModified: now, priority: 0.7, url: absoluteUrl('/categories') },
    ...COLLECTIONS.map((category) => ({
      changeFrequency: 'weekly' as const,
      lastModified: now,
      priority: 0.6,
      url: absoluteUrl(`/categories/${category}`),
    })),
    ...genres.map((genre) => ({
      changeFrequency: 'weekly' as const,
      lastModified: now,
      priority: 0.6,
      url: absoluteUrl(`/categories/genres/${genre.slug}`),
    })),
  ];

  const titles: MetadataRoute.Sitemap = tmdb?.ok
    ? uniqueEntries(tmdb.sections).map((entry) => ({
      changeFrequency: 'weekly' as const,
      lastModified: now,
      priority: 0.5,
      url: absoluteUrl(canonicalWatchPath(normalizeSlug(entry.title) || entry.id, entry.type, entry.id)),
    }))
    : [];

  const animeTitles: MetadataRoute.Sitemap = anime?.ok
    ? uniqueEntries(anime.sections).map((entry) => ({
      changeFrequency: 'weekly' as const,
      lastModified: now,
      priority: 0.5,
      url: absoluteUrl(buildWatchHref(entry, { basePath: '/anime/watch' })),
    }))
    : [];

  return [...staticPages, ...titles, ...animeTitles];
}
