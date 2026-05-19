import { NextResponse } from 'next/server';

import { getMediaCatalog, searchMediaCatalog } from '@/lib/media/catalog';
import type { MediaType } from '@/lib/media/types';

function parseMediaType(value: string | null): MediaType | undefined {
  if (value === 'movie' || value === 'tv') {
    return value;
  }

  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = parseMediaType(searchParams.get('type'));
  const query = searchParams.get('q')?.trim() || '';
  const data = query ? searchMediaCatalog(query, type) : getMediaCatalog(type);

  return NextResponse.json({
    data,
    total: data.length,
    filters: {
      type: type ?? null,
      query: query || null,
    },
  });
}