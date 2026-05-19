import { NextResponse } from 'next/server';

import { resolveMediaIdentifier } from '@/lib/media/catalog';
import { lookupTmdbSeasonDetails } from '@/lib/tmdb/client';
import { isTvEntry, type MediaType } from '@/lib/media/types';

interface SeasonRouteContext {
  params: Promise<{ season: string; slug: string }>;
}

function parseMediaType(value: string | null): MediaType | null {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return null;
}

export async function GET(request: Request, context: SeasonRouteContext) {
  const { season, slug } = await context.params;
  const requestUrl = new URL(request.url);
  const seasonNumber = Number.parseInt(season, 10);

  if (Number.isNaN(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json({ error: 'Season must be a positive integer.' }, { status: 400 });
  }

  const identifier = decodeURIComponent(slug);
  const resolution = resolveMediaIdentifier(identifier);
  let tmdbId: string | null = null;

  if (resolution && isTvEntry(resolution.entry)) {
    tmdbId = resolution.entry.tmdbId;
  } else if (/^\d+$/.test(identifier) && parseMediaType(requestUrl.searchParams.get('type')) === 'tv') {
    tmdbId = identifier;
  }

  if (!tmdbId) {
    return NextResponse.json({ error: 'TV series entry not found.' }, { status: 404 });
  }

  const tmdbSeasonLookup = await lookupTmdbSeasonDetails(tmdbId, seasonNumber);
  if (!tmdbSeasonLookup.ok) {
    return NextResponse.json({ error: tmdbSeasonLookup.message }, { status: tmdbSeasonLookup.status });
  }

  return NextResponse.json({
    data: tmdbSeasonLookup.data,
    tmdbId,
  });
}