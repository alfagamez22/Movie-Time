import { NextResponse } from 'next/server';

import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { parseMediaType } from '@/lib/media/routes';
import { lookupTmdbMediaDetails } from '@/lib/tmdb/client';

interface MediaDetailsRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: MediaDetailsRouteContext) {
  const { slug } = await context.params;
  const requestUrl = new URL(request.url);
  const identifier = decodeURIComponent(slug);
  const preferredTmdbId = requestUrl.searchParams.get('id')?.trim();
  const mediaType = parseMediaType(requestUrl.searchParams.get('type'));
  const resolvedEntry = await resolveLiveMediaEntry(identifier, mediaType, preferredTmdbId);

  if (!resolvedEntry) {
    return NextResponse.json({ error: 'Media entry not found.' }, { status: 404 });
  }

  const details = await lookupTmdbMediaDetails(resolvedEntry.entry.tmdbId, resolvedEntry.entry.type);
  if (!details.ok) {
    return NextResponse.json({ error: details.message }, { status: details.status });
  }

  return NextResponse.json({
    data: details.data,
    matchedBy: resolvedEntry.matchedBy,
    source: 'live',
  });
}
