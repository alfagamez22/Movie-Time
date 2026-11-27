import { NextResponse } from 'next/server';

import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { parseMediaType } from '@/lib/media/routes';
import { lookupTmdbSeasonDetails } from '@/lib/tmdb/client';
import { isTvEntry } from '@/lib/media/types';
import { toPapiflixSeasonDetails, toTmdbSeasonNumber } from '@/lib/media/season-layout';

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = { 'Cache-Control': 'no-store' };

interface SeasonRouteContext {
  params: Promise<{ season: string; slug: string }>;
}

export async function GET(request: Request, context: SeasonRouteContext) {
  const { season, slug } = await context.params;
  const requestUrl = new URL(request.url);
  const seasonNumber = Number.parseInt(season, 10);

  if (Number.isNaN(seasonNumber) || seasonNumber < 1) {
    return NextResponse.json({ error: 'Season must be a positive integer.' }, { status: 400, headers: NO_STORE });
  }

  const identifier = decodeURIComponent(slug);
  const preferredTmdbId = requestUrl.searchParams.get('id')?.trim();
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(requestUrl.searchParams.get('type')), preferredTmdbId);

  if (!resolvedEntry || !isTvEntry(resolvedEntry.entry)) {
    return NextResponse.json({ error: 'TV series entry not found.' }, { status: 404, headers: NO_STORE });
  }

  if (seasonNumber > resolvedEntry.entry.maxSeasons) {
    return NextResponse.json({ error: 'Season was not found.' }, { status: 404, headers: NO_STORE });
  }

  const tmdbSeasonLookup = await lookupTmdbSeasonDetails(
    resolvedEntry.entry.id,
    toTmdbSeasonNumber(resolvedEntry.entry, seasonNumber),
  );
  if (!tmdbSeasonLookup.ok) {
    return NextResponse.json({ error: tmdbSeasonLookup.message }, { status: tmdbSeasonLookup.status, headers: NO_STORE });
  }

  return NextResponse.json({
    data: toPapiflixSeasonDetails(resolvedEntry.entry, seasonNumber, tmdbSeasonLookup.data),
    id: resolvedEntry.entry.id,
  }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } });
}
