import { NextResponse } from 'next/server';

import { resolveMediaIdentifier } from '@/lib/media/catalog';
import { lookupTmdbMediaEntry, mergeCatalogEntryWithTmdb } from '@/lib/tmdb/client';
import type { MediaType } from '@/lib/media/types';

interface MediaRouteContext {
  params: Promise<{ slug: string }>;
}

function parseMediaType(value: string | null): MediaType | null {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return null;
}

export async function GET(request: Request, context: MediaRouteContext) {
  const { slug } = await context.params;
  const identifier = decodeURIComponent(slug);
  const requestUrl = new URL(request.url);
  const resolution = resolveMediaIdentifier(identifier);

  if (!resolution) {
    const mediaType = parseMediaType(requestUrl.searchParams.get('type'));
    if (/^\d+$/.test(identifier) && mediaType) {
      const tmdbLookup = await lookupTmdbMediaEntry(identifier, mediaType);
      if (!tmdbLookup.ok) {
        return NextResponse.json(
          {
            code: tmdbLookup.reason,
            error: tmdbLookup.message,
          },
          { status: tmdbLookup.status },
        );
      }

      return NextResponse.json({
        data: tmdbLookup.entry,
        canonicalSlug: null,
        matchedBy: 'id',
        source: 'tmdb',
      });
    }

    return NextResponse.json({ error: 'Media entry not found.' }, { status: 404 });
  }

  if (requestUrl.searchParams.get('hydrate') === 'tmdb') {
    const tmdbLookup = await lookupTmdbMediaEntry(resolution.entry.tmdbId, resolution.entry.type);
    if (tmdbLookup.ok) {
      return NextResponse.json({
        data: mergeCatalogEntryWithTmdb(resolution.entry, tmdbLookup.entry),
        canonicalSlug: resolution.entry.slug,
        matchedBy: resolution.matchedBy,
        source: 'catalog+tmdb',
      });
    }

    return NextResponse.json({
      data: resolution.entry,
      canonicalSlug: resolution.entry.slug,
      matchedBy: resolution.matchedBy,
      metadataError: tmdbLookup.message,
      source: 'catalog',
    });
  }

  return NextResponse.json({
    data: resolution.entry,
    canonicalSlug: resolution.entry.slug,
    matchedBy: resolution.matchedBy,
    source: 'catalog',
  });
}