import { NextResponse } from 'next/server';

import { lookupAnimeMediaDetails, lookupAnimeMediaEntry } from '@/lib/anime/client';

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = { 'Cache-Control': 'no-store' };

interface AnimeDetailsRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: AnimeDetailsRouteContext) {
  const { slug } = await context.params;
  const requestUrl = new URL(request.url);
  const identifier = decodeURIComponent(slug);
  const preferredId = requestUrl.searchParams.get('id')?.trim();
  const id = preferredId || identifier;
  const lookup = await lookupAnimeMediaEntry(id);

  if (!lookup.ok) {
    return NextResponse.json({ error: 'Anime entry not found.' }, { status: 404, headers: NO_STORE });
  }

  const details = await lookupAnimeMediaDetails(lookup.entry.id);
  if (!details.ok) {
    return NextResponse.json({ error: details.message }, { status: details.status, headers: NO_STORE });
  }

  return NextResponse.json({
    data: details.data,
    requestedKey: `anilist:${lookup.entry.type}:${id}`,
    source: 'live',
  }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } });
}
