import { getEpisodeLimit, isTvEntry, type MediaEntry, type SeasonDetails, type TvMediaEntry } from './types';

// TMDB 65942 groups every Re:Zero episode into one season. Keep the familiar
// broadcast seasons in PapiFlix while addressing Videasy with TMDB's numbering.
const RE_ZERO_ID = '65942';
const RE_ZERO_SEASON_STARTS = [0, 25, 50, 66] as const;

function isFlattenedReZero(entry: MediaEntry): entry is TvMediaEntry {
  return entry.provider === 'tmdb' && isTvEntry(entry) && entry.id === RE_ZERO_ID &&
    entry.maxSeasons === 1 && getEpisodeLimit(entry, 1) > RE_ZERO_SEASON_STARTS[3];
}

export function withPapiflixSeasonLayout(entry: MediaEntry): MediaEntry {
  if (!isFlattenedReZero(entry)) return entry;

  const total = getEpisodeLimit(entry, 1);
  const episodesBySeason = {
    '1': 25,
    '2': 25,
    '3': 16,
    '4': total - RE_ZERO_SEASON_STARTS[3],
  };

  return {
    ...entry,
    episodesBySeason,
    maxEpisodes: Math.max(...Object.values(episodesBySeason)),
    maxSeasons: 4,
  };
}

function isSplitReZero(entry: MediaEntry): entry is TvMediaEntry {
  return entry.provider === 'tmdb' && isTvEntry(entry) && entry.id === RE_ZERO_ID &&
    entry.maxSeasons === 4 && entry.episodesBySeason?.['3'] === 16;
}

export function toTmdbEpisodeCoordinates(entry: MediaEntry, season: string, episode: string) {
  if (!isSplitReZero(entry)) return { season, episode };

  const seasonIndex = Number.parseInt(season, 10) - 1;
  const offset = RE_ZERO_SEASON_STARTS[seasonIndex];
  if (offset === undefined) return { season, episode };

  return { season: '1', episode: String(offset + Number.parseInt(episode, 10)) };
}

export function fromTmdbEpisodeCoordinates(entry: MediaEntry, season: string, episode: string) {
  if (!isSplitReZero(entry) || season !== '1') return { season, episode };

  const tmdbEpisode = Number.parseInt(episode, 10);
  if (!Number.isInteger(tmdbEpisode) || tmdbEpisode < 1) return { season, episode };

  const seasonIndex = RE_ZERO_SEASON_STARTS.findLastIndex((start) => tmdbEpisode > start);
  const offset = RE_ZERO_SEASON_STARTS[seasonIndex];
  if (offset === undefined) return { season, episode };

  return { season: String(seasonIndex + 1), episode: String(tmdbEpisode - offset) };
}

export function toTmdbSeasonNumber(entry: MediaEntry, season: number): number {
  return isSplitReZero(entry) && season >= 1 && season <= 4 ? 1 : season;
}

export function toPapiflixSeasonDetails(entry: MediaEntry, season: number, details: SeasonDetails): SeasonDetails {
  if (!isSplitReZero(entry) || season < 1 || season > 4) return details;

  const offset = RE_ZERO_SEASON_STARTS[season - 1];
  const count = getEpisodeLimit(entry, season);
  const byNumber = new Map(details.episodes.map((episode) => [episode.episodeNumber, episode]));
  const episodes = Array.from({ length: count }, (_, index) => {
    const episodeNumber = index + 1;
    const source = byNumber.get(offset + episodeNumber);
    return source
      ? { ...source, episodeNumber, seasonNumber: season }
      : { episodeNumber, seasonNumber: season, name: `Episode ${episodeNumber}`, overview: '' };
  });

  return { ...details, episodeCount: count, episodes, name: `Season ${season}`, seasonNumber: season };
}
