import { NextResponse } from 'next/server';

import { isMangaDexNotFound } from '@/lib/manga/client';
import { loadMangaReadPageData } from '@/lib/manga/read';
import { parseMangaLanguage } from '@/lib/media/routes';

// MangaDex manga and chapter ids are UUIDs; chapter refs may also be a chapter number such as "12.5".
const MANGADEX_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAPTER_NUMBER_PATTERN = /^[0-9A-Za-z._-]{1,32}$/;

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
  if (!MANGADEX_ID_PATTERN.test(mangaId)) {
    return NextResponse.json({ error: 'Invalid manga ID.' }, { status: 400 });
  }
  if (chapter !== undefined && !MANGADEX_ID_PATTERN.test(chapter) && !CHAPTER_NUMBER_PATTERN.test(chapter)) {
    return NextResponse.json({ error: 'Invalid chapter.' }, { status: 400 });
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
    if (isMangaDexNotFound(err)) {
      return NextResponse.json({ error: 'Manga or chapter not found.' }, { status: 404 });
    }
    console.error('Manga read failed', { error: err instanceof Error ? err.name : 'UnknownError' });
    return NextResponse.json({ error: 'Failed to load chapter.' }, { status: 500 });
  }
}
