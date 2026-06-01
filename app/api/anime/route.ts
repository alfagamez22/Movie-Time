import { NextResponse } from 'next/server';

import { isAnimePlayerId, searchAnimeForPlayer, type AnimePlayerId } from '@/lib/anime/player-config';
import { searchAnimeLibrary, getAnimeLibrarySections } from '@/lib/anime/client';
import type { LibraryMediaEntry, MediaType } from '@/lib/media/types';

function parseMediaType(value: string | null): MediaType | undefined {
  if (value === 'movie' || value === 'tv') {
    return value;
  }
  return undefined;
}

function parsePlayer(value: string | null): AnimePlayerId {
  return isAnimePlayerId(value) ? value : 'p1';
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
  const playerId = parsePlayer(searchParams.get('player'));
  const query = searchParams.get('q')?.trim() || '';

  if (query) {
    const result = await searchAnimeForPlayer(playerId, query, type);
    const error = result.error ?? null;

    if (error && result.data.length === 0) {
      return NextResponse.json(
        {
          data: [],
          error,
          filters: { player: playerId, query, type: type ?? null },
          mode: 'search',
          player: playerId,
          source: result.source,
          total: 0,
          totalResults: 0,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      data: result.data,
      filters: { player: playerId, query, type: type ?? null },
      mode: 'search',
      player: playerId,
      source: result.source,
      total: result.data.length,
      totalResults: result.data.length,
    });
  }

  // Browse mode — delegate to the AniList client for the default P1/P2/P3
  // (P4/P5 fetch their own sections in the server-rendered home page).
  const sections = await getAnimeLibrarySections();
  if (!sections.ok) {
    return NextResponse.json(
      {
        data: [],
        error: sections.message,
        filters: { player: playerId, query: null, type: type ?? null },
        mode: 'browse',
        player: playerId,
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
    filters: { player: playerId, query: null, type: type ?? null },
    mode: 'browse',
    player: playerId,
    source: 'anilist',
    total: browseEntries.length,
  });
}
