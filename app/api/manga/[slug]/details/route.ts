import { NextResponse } from 'next/server';

import { getMangaDexMangaById } from '@/lib/manga/client';
import { mangaDexToMediaEntry } from '@/lib/manga/mapping';
import type { MediaDetailsPayload } from '@/lib/media/types';

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
    });
  } catch {
    return NextResponse.json(
      { error: 'Manga details not found.' },
      { status: 404 },
    );
  }
}
