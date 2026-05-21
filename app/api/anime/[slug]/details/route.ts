import { NextResponse } from 'next/server';

import { lookupAnikotoMediaDetails } from '@/lib/anime/client';
import { resolveAnimeMediaEntry } from '@/lib/anime/resolve';

interface AnimeDetailsRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: AnimeDetailsRouteContext) {
  const { slug } = await context.params;
  const requestUrl = new URL(request.url);
  const identifier = decodeURIComponent(slug);
  const preferredId = requestUrl.searchParams.get('id')?.trim();
  const resolvedEntry = await resolveAnimeMediaEntry(identifier, preferredId);

  if (!resolvedEntry) {
    return NextResponse.json({ error: 'Anime entry not found.' }, { status: 404 });
  }

  const details = await lookupAnikotoMediaDetails(resolvedEntry.entry.id);
  if (!details.ok) {
    return NextResponse.json({ error: details.message }, { status: details.status });
  }

  return NextResponse.json({
    data: details.data,
    matchedBy: resolvedEntry.matchedBy,
    source: 'live',
  });
}
