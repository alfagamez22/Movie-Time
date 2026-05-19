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
    uniqueEntries.set(`${entry.type}:${entry.tmdbId}`, entry);
  });

  return Array.from(uniqueEntries.values());
}

export async function GET(request: Request) {
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
