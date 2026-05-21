import { NextResponse } from 'next/server';

import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { parseMediaType } from '@/lib/media/routes';
import { lookupTmdbSeasonDetails } from '@/lib/tmdb/client';
import { isTvEntry } from '@/lib/media/types';

interface SeasonRouteContext {
  params: Promise<{ season: string; slug: string }>;
}

export async function GET(request: Request, context: SeasonRouteContext) {
  const { season, slug } = await context.params;
  const requestUrl = new URL(request.url);
  const seasonNumber = Number.parseInt(season, 10);

  if (Number.isNaN(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json({ error: 'Season must be a positive integer.' }, { status: 400 });
  }

  const identifier = decodeURIComponent(slug);
  const preferredTmdbId = requestUrl.searchParams.get('id')?.trim();
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(requestUrl.searchParams.get('type')), preferredTmdbId);

  if (!resolvedEntry || !isTvEntry(resolvedEntry.entry)) {
    return NextResponse.json({ error: 'TV series entry not found.' }, { status: 404 });
  }

  const tmdbSeasonLookup = await lookupTmdbSeasonDetails(resolvedEntry.entry.id, seasonNumber);
  if (!tmdbSeasonLookup.ok) {
    return NextResponse.json({ error: tmdbSeasonLookup.message }, { status: tmdbSeasonLookup.status });
  }

  return NextResponse.json({
    data: tmdbSeasonLookup.data,
    id: resolvedEntry.entry.id,
  });
}
