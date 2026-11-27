import { NextResponse } from 'next/server';

import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { parseMediaType } from '@/lib/media/routes';
import { lookupTmdbMediaDetails } from '@/lib/tmdb/client';

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = { 'Cache-Control': 'no-store' };

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
    return NextResponse.json({ error: 'Media entry not found.' }, { status: 404, headers: NO_STORE });
  }

  const details = await lookupTmdbMediaDetails(resolvedEntry.entry.id, resolvedEntry.entry.type);
  if (!details.ok) {
    return NextResponse.json({ error: details.message }, { status: details.status, headers: NO_STORE });
  }

  return NextResponse.json({
    data: details.data,
    matchedBy: resolvedEntry.matchedBy,
    source: 'live',
  }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } });
}
