import { NextResponse } from 'next/server';

import { lookupAnimeMediaDetails, lookupAnimeMediaEntry } from '@/lib/anime/client';

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
    return NextResponse.json({ error: 'Anime entry not found.' }, { status: 404 });
  }

  const details = await lookupAnimeMediaDetails(lookup.entry.id);
  if (!details.ok) {
    return NextResponse.json({ error: details.message }, { status: details.status });
  }

  return NextResponse.json({
    data: details.data,
    requestedKey: `anilist:${lookup.entry.type}:${id}`,
    source: 'live',
  });
}
