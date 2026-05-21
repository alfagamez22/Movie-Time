import { NextResponse } from 'next/server';

import { resolveAnimeMediaEntry } from '@/lib/anime/resolve';
import { buildWatchSlug } from '@/lib/media/routes';

interface AnimeRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: AnimeRouteContext) {
  const { slug } = await context.params;
  const identifier = decodeURIComponent(slug);
  const requestUrl = new URL(request.url);
  const preferredId = requestUrl.searchParams.get('id')?.trim();
  const resolvedEntry = await resolveAnimeMediaEntry(identifier, preferredId);

  if (!resolvedEntry) {
    return NextResponse.json({ error: 'Anime entry not found.' }, { status: 404 });
  }

  return NextResponse.json({
    canonicalSlug: buildWatchSlug(resolvedEntry.entry.title, resolvedEntry.entry.id),
    data: resolvedEntry.entry,
    matchedBy: resolvedEntry.matchedBy,
    source: 'live',
  });
}
