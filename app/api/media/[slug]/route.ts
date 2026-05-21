import { NextResponse } from 'next/server';

import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { buildWatchSlug, parseMediaType } from '@/lib/media/routes';

interface MediaRouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: MediaRouteContext) {
  const { slug } = await context.params;
  const identifier = decodeURIComponent(slug);
  const requestUrl = new URL(request.url);
  const mediaType = parseMediaType(requestUrl.searchParams.get('type'));
  const preferredTmdbId = requestUrl.searchParams.get('id')?.trim();
  const resolvedEntry = await resolveLiveMediaEntry(identifier, mediaType, preferredTmdbId);

  if (!resolvedEntry) {
    return NextResponse.json({ error: 'Media entry not found.' }, { status: 404 });
  }

  return NextResponse.json({
    canonicalSlug: buildWatchSlug(resolvedEntry.entry.title, resolvedEntry.entry.id),
    data: resolvedEntry.entry,
    matchedBy: resolvedEntry.matchedBy,
    source: 'live',
  });
}
