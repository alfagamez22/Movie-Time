import { NextResponse } from 'next/server';

import { browseAnimeForPlayer, searchAnimeForPlayer } from '@/lib/anime/player-config';
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
    const result = await searchAnimeForPlayer('p1', query, type);
    const error = result.error ?? null;

    if (error && result.data.length === 0) {
      return NextResponse.json(
        {
          data: [],
          error,
          filters: { player: 'p1', query, type: type ?? null },
          mode: 'search',
          source: result.source,
          total: 0,
          totalResults: 0,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      data: result.data,
      filters: { player: 'p1', query, type: type ?? null },
      mode: 'search',
      source: result.source,
      total: result.data.length,
      totalResults: result.data.length,
    });
  }

  const library = await browseAnimeForPlayer('p1');
  if (library.error && library.data.length === 0) {
    return NextResponse.json(
      {
        data: [],
        error: library.error,
        filters: { player: 'p1', query: null, type: type ?? null },
        mode: 'browse',
        source: library.source,
        total: 0,
        totalResults: 0,
      },
      { status: 200 },
    );
  }

  const browseEntries = dedupeEntries(library.data.filter((entry) => !type || entry.type === type)).slice(0, 42);

  return NextResponse.json({
    data: browseEntries,
    filters: { player: 'p1', query: null, type: type ?? null },
    mode: 'browse',
    source: library.source,
    total: browseEntries.length,
    totalResults: browseEntries.length,
  });
}
