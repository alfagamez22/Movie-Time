import type {
  LibraryMediaEntry,
  MangaFormat as MediaMangaFormat,
  MediaProvider,
  TvCatalogEntry,
  TvMediaEntry,
} from '@/lib/media/types';
import {
  findCoverArt,
  pickDescription,
  pickTitle,
  type MangaDexManga,
  type MangaDexMangaAttributes,
} from './client';

function mapMangaFormat(attributes: MangaDexMangaAttributes): MediaMangaFormat | undefined {
  const tag = attributes.tags.find((t) => t.attributes.group === 'format');
  const name = tag ? tag.attributes.name.en?.toLowerCase() : undefined;

  if (!name) {
    return undefined;
  }

  if (name === 'manga' || name === 'manhwa' || name === 'manhua' || name === 'novel' || name === 'one_shot') {
    return name as MediaMangaFormat;
  }

  return undefined;
}

export function mangaDexToCatalogEntry(manga: MangaDexManga): TvCatalogEntry {
  const attributes = manga.attributes;
  const title = pickTitle(attributes);
  const coverUrl = findCoverArt(manga);
  const mangaFormat = mapMangaFormat(attributes);

  return {
    id: manga.id,
    title,
    provider: 'mangadex' as MediaProvider,
    type: 'tv',
    animeFormat: undefined,
    mangaFormat,
    synopsis: pickDescription(attributes).slice(0, 500),
    posterUrl: coverUrl ?? undefined,
    backdropUrl: undefined,
    rating: 0,
    voteCount: 0,
    year: attributes.year ?? undefined,
    maxSeasons: 1,
    maxEpisodes: 9999,
    episodesBySeason: undefined,
  };
}

export function mangaDexToLibraryEntry(manga: MangaDexManga): LibraryMediaEntry {
  const attributes = manga.attributes;
  const title = pickTitle(attributes);
  const coverUrl = findCoverArt(manga);
  const mangaFormat = mapMangaFormat(attributes);

  return {
    id: manga.id,
    title,
    provider: 'mangadex' as MediaProvider,
    type: mangaFormat === 'novel' ? 'movie' : 'tv',
    synopsis: pickDescription(attributes).slice(0, 300),
    posterUrl: coverUrl ?? undefined,
    rating: 0,
    mangaFormat,
    year: attributes.year ?? undefined,
  };
}

export function mangaDexToMediaEntry(manga: MangaDexManga): TvMediaEntry {
  const attributes = manga.attributes;
  const title = pickTitle(attributes);
  const coverUrl = findCoverArt(manga);
  const mangaFormat = mapMangaFormat(attributes);

  return {
    id: manga.id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || manga.id,
    aliases: [manga.id],
    animeFormat: undefined,
    mangaFormat,
    anilistId: undefined,
    backdropUrl: coverUrl ?? undefined,
    defaultLanguage: undefined,
    episodeCount: undefined,
    episodeEmbedIds: undefined,
    malId: undefined,
    nextEpisodeAt: undefined,
    nextEpisodeNumber: undefined,
    posterUrl: coverUrl ?? undefined,
    provider: 'mangadex' as MediaProvider,
    rating: 0,
    title,
    voteCount: 0,
    year: attributes.year ?? undefined,
    synopsis: pickDescription(attributes),
    type: 'tv',
    maxSeasons: 1,
    maxEpisodes: 9999,
    episodesBySeason: undefined,
  };
}
