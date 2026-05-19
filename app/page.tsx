import { HomePage } from '@/components/media/home-page';
import { getCatalogSections } from '@/lib/media/catalog';
import type { MediaEntry, MediaType } from '@/lib/media/types';
import { lookupTmdbMediaEntry, mergeCatalogEntryWithTmdb } from '@/lib/tmdb/client';

async function hydrateCatalogEntry(entry: MediaEntry): Promise<MediaEntry> {
  const tmdbLookup = await lookupTmdbMediaEntry(entry.tmdbId, entry.type);

  if (!tmdbLookup.ok) {
    return entry;
  }

  return mergeCatalogEntryWithTmdb(entry, tmdbLookup.entry);
}

async function hydrateCatalogSections(
  catalog: Record<MediaType, MediaEntry[]>,
): Promise<Record<MediaType, MediaEntry[]>> {
  const [movies, series] = await Promise.all([
    Promise.all(catalog.movie.map(hydrateCatalogEntry)),
    Promise.all(catalog.tv.map(hydrateCatalogEntry)),
  ]);

  return {
    movie: movies,
    tv: series,
  };
}

export default async function Page() {
  const catalog = await hydrateCatalogSections(getCatalogSections());

  return <HomePage catalog={catalog} />;
}
