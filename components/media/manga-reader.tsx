'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';

import { trackRecentlyWatched } from '@/lib/hooks/use-recently-watched';
import type { LibraryMediaEntry, MangaChapterData, MangaReadPayload } from '@/lib/media/types';

interface MangaReaderProps {
  chapterData: MangaChapterData;
  entry: LibraryMediaEntry;
  mangaId: string;
  mangaTitle: string;
  nextChapter: string | null;
  payload: MangaReadPayload;
  prevChapter: string | null;
}

function getChapterLabel(chapter: Pick<MangaReadPayload['chapter'], 'chapter' | 'title'>): string {
  if (chapter.chapter) {
    return `Ch. ${chapter.chapter}`;
  }

  return chapter.title || 'Chapter';
}

export function MangaReaderClient({
  chapterData,
  entry,
  mangaId,
  mangaTitle,
  nextChapter,
  payload,
  prevChapter,
}: MangaReaderProps) {
  const { data: session } = useSession();
  const [scaleMode, setScaleMode] = useState<'fit' | 'full'>('fit');
  const [showSidebar, setShowSidebar] = useState(false);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const chapterLabel = getChapterLabel(payload.chapter);
  const readerLanguage = payload.chapter.language === 'en' ? 'en' : 'raw';

  useEffect(() => {
    const el = pageContainerRef.current;
    el?.scrollTo(0, 0);
  }, [payload.chapter.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f' || event.key === 'F') {
        setScaleMode((prev) => (prev === 'fit' ? 'full' : 'fit'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    trackRecentlyWatched(
      entry,
      {
        episode: payload.chapter.chapter ?? undefined,
        season: payload.chapter.id,
      },
      'papimanga',
      Boolean(session?.user?.id),
    );
  }, [entry, payload.chapter.chapter, payload.chapter.id, session?.user?.id]);

  return (
    <div className="flex h-screen bg-[#050505]">
      {showSidebar ? (
        <MangaChapterSidebar
          chapters={chapterData.chapters}
          currentChapterId={payload.chapter.id}
          mangaId={mangaId}
          onClose={() => setShowSidebar(false)}
        />
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#0a0a0f] px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSidebar((value) => !value)}
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/manga" className="text-sm font-semibold text-white transition-colors hover:text-netflix-red">
              PapiManga
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="max-w-[200px] truncate text-sm text-zinc-400">{mangaTitle}</span>
            <span className="text-sm text-zinc-300">{chapterLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => setScaleMode((prev) => (prev === 'fit' ? 'full' : 'fit'))}
            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {scaleMode === 'fit' ? 'Fit Width' : 'Full Size'}
          </button>
        </header>

        <nav className="flex items-center justify-between border-b border-white/5 bg-[#0a0a0f] px-4 py-2">
          {prevChapter ? (
            <Link
              href={`/manga/read/${prevChapter}?language=${readerLanguage}`}
              className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              Previous
            </Link>
          ) : (
            <div />
          )}
          <span className="text-xs text-zinc-500">{payload.pages.length} pages</span>
          {nextChapter ? (
            <Link
              href={`/manga/read/${nextChapter}?language=${readerLanguage}`}
              className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              Next
            </Link>
          ) : (
            <div />
          )}
        </nav>

        <div ref={pageContainerRef} className="flex-1 overflow-y-auto">
          <div className={`mx-auto flex flex-col items-center ${scaleMode === 'fit' ? 'max-w-4xl' : ''}`}>
            {payload.pages.map((page) => (
              <img
                key={page.index}
                alt={`${mangaTitle} ${chapterLabel} p.${page.index + 1}`}
                className={`w-full ${scaleMode === 'fit' ? 'object-contain' : ''}`}
                loading="lazy"
                src={page.src}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 border-t border-white/10 bg-[#0a0a0f] px-4 py-4">
            {prevChapter ? (
              <Link
                href={`/manga/read/${prevChapter}?language=${readerLanguage}`}
                className="rounded-lg bg-white/10 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                Previous Chapter
              </Link>
            ) : null}
            <Link
              href="/manga"
              className="rounded-lg border border-white/20 px-6 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-white/40 hover:text-white"
            >
              Back to Library
            </Link>
            {nextChapter ? (
              <Link
                href={`/manga/read/${nextChapter}?language=${readerLanguage}`}
                className="rounded-lg bg-netflix-red px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Next Chapter
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MangaChapterSidebar({
  chapters,
  currentChapterId,
  mangaId,
  onClose,
}: {
  chapters: MangaChapterData['chapters'];
  currentChapterId: string;
  mangaId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex w-72 flex-col border-r border-white/10 bg-[#0a0a0f]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Chapters</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chapters.map((chapter) => (
          <Link
            key={chapter.id}
            href={`/manga/read/${mangaId}/${chapter.id}?language=${chapter.language === 'en' ? 'en' : 'raw'}`}
            className={`flex items-center gap-2 border-b border-white/5 px-4 py-2.5 text-xs transition-colors ${
              chapter.id === currentChapterId
                ? 'bg-netflix-red/20 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="w-12 shrink-0 font-medium">{chapter.chapter ? `Ch. ${chapter.chapter}` : 'Special'}</span>
            <span className="truncate">{chapter.title || (chapter.chapter ? `Chapter ${chapter.chapter}` : 'Untitled chapter')}</span>
            <span className="ml-auto shrink-0 text-zinc-600">{chapter.language.toUpperCase()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
