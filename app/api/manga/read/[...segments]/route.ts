import { NextResponse } from 'next/server';

import { loadMangaReadPageData } from '@/lib/manga/read';
import { parseMangaLanguage } from '@/lib/media/routes';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  const [mangaId, chapter] = segments;
  const requestUrl = new URL(request.url);
  const language = parseMangaLanguage(requestUrl.searchParams.get('language'));

  if (!mangaId) {
    return NextResponse.json({ error: 'Missing manga ID.' }, { status: 400 });
  }

  try {
    const data = await loadMangaReadPageData(mangaId, chapter, language);

    return NextResponse.json({
      chapters: data.chapterData.chapters,
      manga: data.chapterData.manga,
      nextChapter: data.nextChapter,
      payload: data.payload,
      prevChapter: data.prevChapter,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load chapter.' },
      { status: 500 },
    );
  }
}
