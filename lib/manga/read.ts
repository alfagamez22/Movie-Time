import 'server-only';

import { getMangaDexChapterPages, getMangaDexChapters, getMangaDexMangaById, type MangaDexChapter } from '@/lib/manga/client';
import { mangaDexToLibraryEntry } from '@/lib/manga/mapping';
import type { LibraryMediaEntry, MangaChapter, MangaChapterData, MangaLanguage, MangaReadPayload } from '@/lib/media/types';

const CHAPTER_PAGE_SIZE = 100;

function mapChapter(chapter: MangaDexChapter): MangaChapter {
  return {
    chapter: chapter.attributes.chapter,
    id: chapter.id,
    language: chapter.attributes.translatedLanguage,
    pages: chapter.attributes.pages,
    readableAt: chapter.attributes.readableAt,
    scanlationGroup: (chapter.relationships.find((relationship) => relationship.type === 'scanlation_group')?.attributes?.name as string) ?? '',
    title: chapter.attributes.title,
    volume: chapter.attributes.volume,
  };
}

function buildPageSource(baseUrl: string, hash: string, filename: string): string {
  return `/api/manga/proxy?url=${encodeURIComponent(`${baseUrl}/data/${hash}/${filename}`)}`;
}

function findChapter(chapters: MangaDexChapter[], chapterRef?: string): MangaDexChapter | null {
  if (!chapterRef) {
    return chapters[0] ?? null;
  }

  return (
    chapters.find((chapter) => chapter.id === chapterRef) ??
    chapters.find((chapter) => String(chapter.attributes.chapter ?? '') === chapterRef) ??
    null
  );
}

async function getAllMangaDexChapters(mangaId: string, language: MangaLanguage): Promise<MangaDexChapter[]> {
  const chapters: MangaDexChapter[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (chapters.length < total) {
    const page = await getMangaDexChapters(mangaId, language, CHAPTER_PAGE_SIZE, offset);
    chapters.push(...page.data);
    total = page.total;

    if (page.data.length === 0) {
      break;
    }

    offset += page.data.length;
  }

  return chapters;
}

async function getResolvedChapterList(
  mangaId: string,
  preferredLanguage: MangaLanguage,
  chapterRef?: string,
): Promise<{ chapters: MangaDexChapter[]; selectedChapter: MangaDexChapter | null }> {
  const preferredChapters = await getAllMangaDexChapters(mangaId, preferredLanguage);
  const selectedPreferredChapter = findChapter(preferredChapters, chapterRef);

  if (selectedPreferredChapter || preferredLanguage === 'raw') {
    return {
      chapters: preferredChapters,
      selectedChapter: selectedPreferredChapter,
    };
  }

  const fallbackChapters = await getAllMangaDexChapters(mangaId, 'raw');
  return {
    chapters: fallbackChapters,
    selectedChapter: findChapter(fallbackChapters, chapterRef),
  };
}

export interface MangaReadPageData {
  chapterData: MangaChapterData;
  entry: LibraryMediaEntry;
  nextChapter: string | null;
  payload: MangaReadPayload;
  prevChapter: string | null;
}

export async function loadMangaReadPageData(
  mangaId: string,
  chapterRef: string | undefined,
  preferredLanguage: MangaLanguage = 'en',
): Promise<MangaReadPageData> {
  const [manga, chapterResult] = await Promise.all([
    getMangaDexMangaById(mangaId),
    getResolvedChapterList(mangaId, preferredLanguage, chapterRef),
  ]);

  const selectedChapter = chapterResult.selectedChapter;
  if (!selectedChapter) {
    throw new Error(chapterRef ? 'Chapter not found.' : 'No readable chapters found.');
  }

  const pagesData = await getMangaDexChapterPages(selectedChapter.id);
  const pages = pagesData.chapter.data.map((filename, index) => ({
    height: 0,
    index,
    src: buildPageSource(pagesData.baseUrl, pagesData.chapter.hash, filename),
    width: 0,
  }));
  const foundIndex = chapterResult.chapters.findIndex((chapter) => chapter.id === selectedChapter.id);
  const entry = mangaDexToLibraryEntry(manga);

  return {
    chapterData: {
      chapters: chapterResult.chapters.map(mapChapter),
      manga: {
        id: manga.id,
        posterUrl: entry.posterUrl ?? '',
        title: entry.title,
      },
    },
    entry,
    nextChapter:
      foundIndex >= 0 && foundIndex < chapterResult.chapters.length - 1
        ? `${mangaId}/${chapterResult.chapters[foundIndex + 1]!.id}`
        : null,
    payload: {
      chapter: mapChapter(selectedChapter),
      pages,
    },
    prevChapter: foundIndex > 0 ? `${mangaId}/${chapterResult.chapters[foundIndex - 1]!.id}` : null,
  };
}
