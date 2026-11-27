import { NextResponse } from 'next/server';

import { getMangaDexMangaById } from '@/lib/manga/client';
import { mangaDexToMediaEntry } from '@/lib/manga/mapping';
import type { MediaDetailsPayload } from '@/lib/media/types';

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const requestUrl = new URL(request.url);
  const mangaId = requestUrl.searchParams.get('id')?.trim() || slug;

  try {
    const manga = await getMangaDexMangaById(mangaId);
    const entry = mangaDexToMediaEntry(manga);

    const payload: MediaDetailsPayload = {
      cast: [],
      entry,
      recommendations: [],
      trailers: [],
    };

    return NextResponse.json({
      data: payload,
      requestedKey: `mangadex:${entry.type}:${entry.id}`,
    }, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } });
  } catch {
    return NextResponse.json(
      { error: 'Manga details not found.' },
      { status: 404, headers: NO_STORE },
    );
  }
}
