import { NextResponse } from 'next/server';

import { getAnimeLibrarySections, searchAnimeLibrary } from '@/lib/anime/client';
import type { LibraryMediaEntry, MediaType } from '@/lib/media/types';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = parseMediaType(searchParams.get('type'));
  const query = searchParams.get('q')?.trim() || '';

  if (query) {
    const search = await searchAnimeLibrary(query, type);

    if (!search.ok) {
      return NextResponse.json(
        {
          data: [],
          error: search.message,
          filters: {
            query,
            type: type ?? null,
          },
          mode: 'search',
          source: null,
          total: 0,
          totalResults: 0,
        },
        { status: search.status === 404 ? 404 : 200 },
      );
    }

    return NextResponse.json({
      data: search.entries,
      filters: {
        query,
        type: type ?? null,
      },
      mode: 'search',
      source: 'live',
      total: search.entries.length,
      totalResults: search.totalResults,
    });
  }

  const sections = await getAnimeLibrarySections();
  if (!sections.ok) {
    return NextResponse.json(
      {
        data: [],
        error: sections.message,
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
    sections.sections
      .flatMap((section) => section.entries)
      .filter((entry) => !type || entry.type === type),
  ).slice(0, 42);

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
