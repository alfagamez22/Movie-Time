import 'server-only';

import { appConfig } from '@/lib/config';

const MANGADEX_RATE_LIMIT_MS = 250;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MANGADEX_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, MANGADEX_RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'PapiManga/1.0',
      ...init?.headers,
    },
  });
}

interface MangaDexMangaAttributes {
  contentRating: string;
  description: Record<string, string>;
  lastVolume: string | null;
  lastChapter: string | null;
  publicationDemographic: string | null;
  status: string;
  tags: Array<{ attributes: { name: Record<string, string>; group: string } }>;
  title: Record<string, string>;
  availableTranslatedLanguages: string[];
  createdAt: string;
  updatedAt: string;
  year: number | null;
}

interface MangaDexRelationship {
  attributes?: Record<string, unknown>;
  id: string;
  type: string;
}

interface MangaDexManga {
  attributes: MangaDexMangaAttributes;
  id: string;
  relationships: MangaDexRelationship[];
  type: string;
}

interface MangaDexChapterAttributes {
  chapter: string | null;
  createdAt: string;
  externalUrl: string | null;
  pages: number;
  publishAt: string;
  readableAt: string;
  title: string;
  translatedLanguage: string;
  updatedAT: string;
  volume: string | null;
}

interface MangaDexChapter {
  attributes: MangaDexChapterAttributes;
  id: string;
  relationships: MangaDexRelationship[];
  type: string;
}

interface MangaDexList {
  data: MangaDexManga[];
  limit: number;
  offset: number;
  result: string;
  total: number;
}

interface MangaDexChapterList {
  data: MangaDexChapter[];
  limit: number;
  offset: number;
  result: string;
  total: number;
}

interface MangaDexAtHomeResponse {
  chapter: {
    data: string[];
    dataSaver: string[];
    hash: string;
  };
  baseUrl: string;
  result: string;
}

function pickTitle(attributes: MangaDexMangaAttributes): string {
  for (const key of ['en', 'ja-ro', 'ja', 'ko-ro', 'zh-ro'] as const) {
    if (attributes.title[key]) {
      return attributes.title[key];
    }
  }
  return Object.values(attributes.title)[0] ?? 'Untitled';
}

function pickDescription(attributes: MangaDexMangaAttributes): string {
  for (const key of ['en', 'ja-ro', 'ja'] as const) {
    if (attributes.description[key]) {
      return attributes.description[key];
    }
  }
  return Object.values(attributes.description)[0] ?? '';
}

function findCoverArt(manga: MangaDexManga): string | null {
  const coverRel = manga.relationships.find((r) => r.type === 'cover_art');
  if (!coverRel?.attributes?.fileName) {
    return null;
  }
  return `${appConfig.mangadexCdnOrigin}/covers/${manga.id}/${coverRel.attributes.fileName as string}`;
}

function findAuthor(manga: MangaDexManga): string | null {
  const authorRel = manga.relationships.find((r) => r.type === 'author');
  return (authorRel?.attributes?.name as string) ?? null;
}

export interface MangaDexSearchOptions {
  contentRating?: string[];
  limit?: number;
  offset?: number;
}

export async function searchMangaDex(query: string, options: MangaDexSearchOptions = {}): Promise<MangaDexList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'cover_art');
  params.append('includes[]', 'author');
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  params.set('title', query);

  for (const rating of options.contentRating ?? ['safe', 'suggestive']) {
    params.append('contentRating[]', rating);
  }

  const url = `${appConfig.mangadexApiBaseUrl}/manga?${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex search failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexList>;
}

export async function getMangaDexMangaById(id: string): Promise<MangaDexManga> {
  const url = `${appConfig.mangadexApiBaseUrl}/manga/${id}?includes[]=cover_art&includes[]=author`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex get manga failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data: MangaDexManga };
  return json.data;
}

export async function getMangaDexChapters(
  mangaId: string,
  language: string = 'en',
  limit: number = 100,
  offset: number = 0,
): Promise<MangaDexChapterList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'scanlation_group');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('order[chapter]', 'asc');

  if (language && language !== 'raw') {
    params.append('translatedLanguage[]', language);
  }

  const url = `${appConfig.mangadexApiBaseUrl}/chapter?manga=${mangaId}&${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex chapters failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexChapterList>;
}

export async function getMangaDexChapterPages(chapterId: string): Promise<MangaDexAtHomeResponse> {
  const url = `${appConfig.mangadexApiBaseUrl}/at-home/server/${chapterId}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex chapter pages failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexAtHomeResponse>;
}

export async function getMangaDexPopular(limit: number = 24): Promise<MangaDexList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'cover_art');
  params.append('includes[]', 'author');
  params.set('order[followedCount]', 'desc');
  params.set('order[rating]', 'desc');
  params.set('limit', String(limit));
  params.set('offset', '0');
  params.append('contentRating[]', 'safe');
  params.append('contentRating[]', 'suggestive');

  const url = `${appConfig.mangadexApiBaseUrl}/manga?${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex popular failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexList>;
}

export async function getMangaDexLatest(limit: number = 24): Promise<MangaDexList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'cover_art');
  params.append('includes[]', 'author');
  params.set('order[updatedAt]', 'desc');
  params.set('limit', String(limit));
  params.set('offset', '0');
  params.append('contentRating[]', 'safe');
  params.append('contentRating[]', 'suggestive');

  const url = `${appConfig.mangadexApiBaseUrl}/manga?${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex latest failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexList>;
}

export async function getMangaDexRecentlyAdded(limit: number = 24): Promise<MangaDexList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'cover_art');
  params.append('includes[]', 'author');
  params.set('order[createdAt]', 'desc');
  params.set('limit', String(limit));
  params.set('offset', '0');
  params.append('contentRating[]', 'safe');
  params.append('contentRating[]', 'suggestive');

  const url = `${appConfig.mangadexApiBaseUrl}/manga?${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex recently added failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexList>;
}

export async function getMangaDexByTag(
  tagId: string,
  limit: number = 24,
): Promise<MangaDexList> {
  const params = new URLSearchParams();
  params.append('includes[]', 'cover_art');
  params.append('includes[]', 'author');
  params.set('includedTags[]', tagId);
  params.set('limit', String(limit));
  params.set('offset', '0');
  params.append('contentRating[]', 'safe');
  params.append('contentRating[]', 'suggestive');
  params.set('order[rating]', 'desc');

  const url = `${appConfig.mangadexApiBaseUrl}/manga?${params.toString()}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    throw new Error(`MangaDex tag browse failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MangaDexList>;
}

export type {
  MangaDexAtHomeResponse,
  MangaDexChapter,
  MangaDexChapterAttributes,
  MangaDexList,
  MangaDexManga,
  MangaDexMangaAttributes,
  MangaDexRelationship,
};

export { findAuthor, findCoverArt, pickDescription, pickTitle };