import { Suspense } from 'react';

import { MangaReaderClient } from '@/components/media/manga-reader';
import { loadMangaReadPageData } from '@/lib/manga/read';
import { parseMangaLanguage } from '@/lib/media/routes';

interface ReadPageProps {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ language?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function MangaReadPage(props: ReadPageProps) {
  const { segments } = await props.params;
  const searchParams = await props.searchParams;
  const [mangaId, chapter] = segments;
  const language = parseMangaLanguage(searchParams.language);

  if (!mangaId) {
    return <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">Missing manga ID.</div>;
  }

  try {
    const data = await loadMangaReadPageData(mangaId, chapter, language);

    return (
      <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
        <MangaReaderClient
          chapterData={data.chapterData}
          entry={data.entry}
          mangaId={mangaId}
          mangaTitle={data.entry.title}
          nextChapter={data.nextChapter}
          payload={data.payload}
          prevChapter={data.prevChapter}
        />
      </Suspense>
    );
  } catch (err) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] text-white">
        <p className="text-lg">Failed to load chapter.</p>
        <p className="text-sm text-zinc-500">{err instanceof Error ? err.message : 'Unknown error'}</p>
      </div>
    );
  }
}
