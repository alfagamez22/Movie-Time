import type { AnilistMedia, AnilistRelationEdge } from './anilist';
import { isReleasedAnime } from './episodes';
import type { AnimePlaylistItem, LibraryMediaEntry } from '@/lib/media/types';

const SERIES_RELATIONS = new Set([
  'PREQUEL', 'SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE',
  'SUMMARY', 'COMPILATION', 'PARENT',
]);

export function seriesNameKey(title: string): string {
  let name = title.normalize('NFKC').toLowerCase();
  name = name.replace(/\b(?:season|part)\s*\d+\b.*$/i, '');
  name = name.replace(/\b(?:\d+(?:st|nd|rd|th)|second|third|fourth)\s+season\b.*$/i, '');
  name = name.replace(/\s+(?:ii|iii|iv|v)\b.*$/i, '');
  const colon = name.indexOf(':');
  if (colon >= 6) name = name.slice(0, colon);
  return name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function isSeriesRelation(edge: AnilistRelationEdge): boolean {
  return SERIES_RELATIONS.has(edge.relationType ?? '') &&
    edge.node?.type !== 'MANGA' && Boolean(edge.node?.id);
}

export function isMatchingSeriesTitle(candidate: AnilistMedia, rootName: string): boolean {
  if (candidate.type === 'MANGA' || !rootName || rootName.length < 6) return false;
  const titles = [candidate.title.english, candidate.title.romaji, candidate.title.userPreferred];
  return titles.some((title) => title && seriesNameKey(title) === rootName);
}

export function buildAnimePlaylist(
  rootId: number,
  media: Map<number, AnilistMedia>,
  relations: Map<number, AnilistRelationEdge[]>,
  toEntry: (item: AnilistMedia) => LibraryMediaEntry,
  includeAdult: boolean,
): AnimePlaylistItem[] {
  const playable = [...media.values()].filter((item) =>
    item.type !== 'MANGA' && (includeAdult || !item.isAdult) && isReleasedAnime(item));
  if (!playable.some((item) => item.id === rootId)) return [];

  const ids = new Set(playable.map((item) => item.id));
  const before = new Map<number, Set<number>>();
  const sideStoryIds = new Set<number>();
  for (const item of playable) {
    for (const edge of relations.get(item.id) ?? []) {
      const other = edge.node?.id;
      if (!other || !ids.has(other) || other === item.id) continue;
      if (edge.relationType === 'SIDE_STORY' || edge.relationType === 'SPIN_OFF' ||
          edge.relationType === 'ALTERNATIVE' || edge.relationType === 'SUMMARY' ||
          edge.relationType === 'COMPILATION') sideStoryIds.add(other);
      const previous = edge.relationType === 'PREQUEL' ? other
        : edge.relationType === 'SEQUEL' ? item.id : null;
      const next = edge.relationType === 'PREQUEL' ? item.id
        : edge.relationType === 'SEQUEL' ? other : null;
      if (previous === null || next === null) continue;
      if (!before.has(next)) before.set(next, new Set());
      before.get(next)!.add(previous);
    }
  }

  const byDate = (a: AnilistMedia, b: AnilistMedia) =>
    (a.startDate?.year ?? a.seasonYear ?? 9999) - (b.startDate?.year ?? b.seasonYear ?? 9999) ||
    (a.startDate?.month ?? 1) - (b.startDate?.month ?? 1) || a.id - b.id;
  const remaining = new Map(playable.map((item) => [item.id, item]));
  const ordered: AnilistMedia[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter((item) => [...(before.get(item.id) ?? [])].every((id) => !remaining.has(id)))
      .sort(byDate);
    const item = ready[0] ?? [...remaining.values()].sort(byDate)[0];
    ordered.push(item);
    remaining.delete(item.id);
  }

  let season = 0;
  let movie = 0;
  let special = 0;
  return ordered.map((item) => {
    const kind = item.format === 'MOVIE' ? 'movie'
      : sideStoryIds.has(item.id) ? 'special'
        : item.format === 'TV' || item.format === 'TV_SHORT' ? 'season' : 'special';
    const number = kind === 'movie' ? ++movie : kind === 'season' ? ++season : ++special;
    return {
      entry: toEntry(item),
      key: `${kind}#${number}:anilist#${item.id}`,
      label: `${kind === 'season' ? 'Season' : kind === 'movie' ? 'Movie' : 'Special'} #${number}`,
    };
  });
}

export function rankAnimeRecommendations(
  root: AnilistMedia,
  candidates: AnilistMedia[],
  excludedIds: Set<number>,
  includeAdult: boolean,
): AnilistMedia[] {
  const rootGenres = new Set(root.genres ?? []);
  const unique = new Map<number, AnilistMedia>();
  for (const item of candidates) {
    if (item.id === root.id || excludedIds.has(item.id) || item.type === 'MANGA' ||
        (!includeAdult && item.isAdult) || !isReleasedAnime(item)) continue;
    unique.set(item.id, item);
  }
  return [...unique.values()].sort((a, b) => {
    const score = (item: AnilistMedia) =>
      (item.genres ?? []).filter((genre) => rootGenres.has(genre)).length * 18 +
      (item.format === root.format ? 8 : 0) +
      (item.averageScore ?? 0) * 0.35 +
      Math.log10(1 + (item.popularity ?? 0)) * 2;
    return score(b) - score(a) || b.id - a.id;
  });
}
