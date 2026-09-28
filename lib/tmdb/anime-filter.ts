/** Anime lives on PapiAnime; PapiFlix hides it everywhere (rows, search, genres, people, recommendations, playback). */

const ANIMATION_GENRE_ID = 16;

export interface AnimeSignals {
  genreIds?: number[] | null;
  originCountry?: string[] | null;
  originalLanguage?: string | null;
}

/** Japanese animation. Western cartoons and Japanese live action stay on PapiFlix. */
export function isAnimeTitle({ genreIds, originCountry, originalLanguage }: AnimeSignals): boolean {
  if (!genreIds?.includes(ANIMATION_GENRE_ID)) return false;
  return originalLanguage === 'ja' || Boolean(originCountry?.includes('JP'));
}
