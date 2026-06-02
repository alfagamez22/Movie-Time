import { NextResponse } from 'next/server';

import { getMangaDexMangaById } from '@/lib/manga/client';
import { mangaDexToMediaEntry } from '@/lib/manga/mapping';

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

    return NextResponse.json({
      canonicalSlug: entry.slug,
      data: entry,
      matchedBy: mangaId === slug ? 'id' : 'query',
      source: 'mangadex',
    });
  } catch {
    return NextResponse.json(
      { error: 'Manga not found.', matchedBy: null, source: null },
      { status: 404 },
    );
  }
}
