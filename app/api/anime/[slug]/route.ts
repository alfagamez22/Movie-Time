import { NextResponse } from 'next/server';

import { lookupAnimeMediaEntry } from '@/lib/anime/client';
import { buildWatchSlug } from '@/lib/media/routes';

interface AnimeRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: AnimeRouteContext) {
  const { slug } = await context.params;
  const identifier = decodeURIComponent(slug);
  const requestUrl = new URL(request.url);
  const preferredId = requestUrl.searchParams.get('id')?.trim();
  const id = preferredId || identifier;
  const lookup = await lookupAnimeMediaEntry(id);

  if (!lookup.ok) {
    return NextResponse.json({ error: 'Anime entry not found.' }, { status: 404 });
  }

  return NextResponse.json({
    canonicalSlug: buildWatchSlug(lookup.entry.title, lookup.entry.id),
    data: lookup.entry,
    source: 'live',
  });
}
