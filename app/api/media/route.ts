import { NextResponse } from 'next/server';

import type { LibraryMediaEntry, MediaType } from '@/lib/media/types';
import { getTmdbLibrarySections, searchTmdbLibrary } from '@/lib/tmdb/client';

function parseMediaType(value: string | null): MediaType | undefined {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return undefined;
}

function dedupeEntries(entries: LibraryMediaEntry[]): LibraryMediaEntry[] {
  const uniqueEntries = new Map<string, LibraryMediaEntry>();

  entries.forEach((entry) => {
    uniqueEntries.set(`${entry.provider}:${entry.type}:${entry.id}`, entry);
  });

  return Array.from(uniqueEntries.values());
}

async function handleGet(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const type = parseMediaType(searchParams.get('type'));
  const query = searchParams.get('q')?.trim() || '';

  if (query) {
    const tmdbSearch = await searchTmdbLibrary(query, type);

    if (!tmdbSearch.ok) {
      return NextResponse.json(
        {
          data: [],
          error: tmdbSearch.message,
          filters: {
            query,
            type: type ?? null,
          },
          mode: 'search',
          source: null,
          total: 0,
          totalResults: 0,
        },
        { status: tmdbSearch.status === 404 ? 404 : 200 },
      );
    }

    return NextResponse.json({
      data: tmdbSearch.entries,
      filters: {
        query,
        type: type ?? null,
      },
      mode: 'search',
      source: 'live',
      total: tmdbSearch.entries.length,
      totalResults: tmdbSearch.totalResults,
    });
  }

  const tmdbSections = await getTmdbLibrarySections();
  if (!tmdbSections.ok) {
    return NextResponse.json(
      {
        data: [],
        error: tmdbSections.message,
        filters: {
          query: null,
          type: type ?? null,
        },
        mode: 'browse',
        source: null,
        total: 0,
      },
      { status: 200 },
    );
  }

  const browseEntries = dedupeEntries(
    tmdbSections.sections
      .flatMap((section) => section.entries)
      .filter((entry) => !type || entry.type === type),
  ).slice(0, 36);

  return NextResponse.json({
    data: browseEntries,
    filters: {
      query: null,
      type: type ?? null,
    },
    mode: 'browse',
    source: 'live',
    total: browseEntries.length,
  });
}

// Search/browse results are identical for everyone, so let the CDN answer repeat queries. Errors stay uncached.
const SEARCH_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

export async function GET(request: Request) {
  const response = await handleGet(request);
  if (response.status === 200) response.headers.set('Cache-Control', SEARCH_CACHE_CONTROL);
  return response;
}
