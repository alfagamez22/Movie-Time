import type { LibraryMediaEntry } from '@/lib/media/types';
import {
  buildTmdbImageUrl,
  createLibraryEntryFromBrowseResult,
  isTmdbFailure,
  requestOfficialTmdb,
  type TmdbBrowseResult,
} from '@/lib/tmdb/client';

import type { PersonProfile, PersonSummary } from './types';

interface TmdbPersonSearchResult {
  id: number;
  known_for?: Array<TmdbBrowseResult & { media_type?: string }>;
  known_for_department?: string;
  name?: string;
  popularity?: number;
  profile_path?: string;
}

interface TmdbCredit extends TmdbBrowseResult {
  character?: string;
  episode_count?: number;
  job?: string;
  popularity?: number;
}

interface TmdbPersonResponse {
  biography?: string;
  birthday?: string;
  combined_credits?: { cast?: TmdbCredit[]; crew?: TmdbCredit[] };
  id: number;
  known_for_department?: string;
  name?: string;
  place_of_birth?: string;
  profile_path?: string;
}

const ROW_LIMIT = 40;
const TALK_SHOW_PATTERN = /^(self|himself|herself|themselves|host|narrator|guest)\b/i;

function releaseTime(credit: TmdbCredit) {
  const date = credit.release_date || credit.first_air_date;
  return date ? Date.parse(date) || 0 : 0;
}

function toEntries(credits: TmdbCredit[]): LibraryMediaEntry[] {
  const seen = new Set<string>();
  const entries: LibraryMediaEntry[] = [];
  for (const credit of credits) {
    const entry = createLibraryEntryFromBrowseResult(credit);
    if (!entry || !entry.posterUrl) continue;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= ROW_LIMIT) break;
  }
  return entries;
}

function isReleased(credit: TmdbCredit) {
  const time = releaseTime(credit);
  return time > 0 && time <= Date.now();
}

export async function searchTmdbPeople(query: string): Promise<PersonSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const payload = await requestOfficialTmdb<{ results?: TmdbPersonSearchResult[] }>('/search/person', {
    include_adult: false,
    query: trimmed,
  });
  if (isTmdbFailure(payload)) return [];

  return (payload.results ?? [])
    .filter((person) => person.name && person.profile_path && (person.known_for?.length ?? 0) > 0)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 10)
    .map((person) => ({
      id: String(person.id),
      knownFor: person.known_for
        ?.map((credit) => credit.title ?? credit.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ') || person.known_for_department,
      name: person.name!,
      profileUrl: buildTmdbImageUrl(person.profile_path, 'w300'),
      source: 'tmdb' as const,
    }));
}

export async function getTmdbPerson(id: string): Promise<PersonProfile | null> {
  if (!/^\d+$/.test(id)) return null;
  const payload = await requestOfficialTmdb<TmdbPersonResponse>(`/person/${id}`, {
    append_to_response: 'combined_credits',
  });
  if (isTmdbFailure(payload) || !payload.name) return null;

  const cast = (payload.combined_credits?.cast ?? []).filter(
    (credit) => isReleased(credit) && !(credit.character && TALK_SHOW_PATTERN.test(credit.character)),
  );
  const crew = (payload.combined_credits?.crew ?? []).filter(
    (credit) => isReleased(credit) && ['Directing', 'Writing', 'Production', 'Creator'].includes(String((credit as { department?: string }).department)),
  );
  const primary = payload.known_for_department === 'Acting' || crew.length === 0 ? cast : crew;

  const knownFor = toEntries(
    [...primary].sort((a, b) => (b.vote_count ?? 0) * (b.popularity ?? 1) - (a.vote_count ?? 0) * (a.popularity ?? 1)),
  ).slice(0, 20);
  const newest = toEntries([...primary].sort((a, b) => releaseTime(b) - releaseTime(a)));
  const movies = toEntries(cast.filter((credit) => credit.media_type === 'movie').sort((a, b) => releaseTime(b) - releaseTime(a)));
  const shows = toEntries(
    cast
      .filter((credit) => credit.media_type === 'tv' && (credit.episode_count ?? 2) > 1)
      .sort((a, b) => releaseTime(b) - releaseTime(a)),
  );
  const behind = payload.known_for_department === 'Acting'
    ? toEntries(crew.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0)))
    : [];

  const rows = [
    { entries: knownFor, id: 'known-for', title: 'Known For' },
    { entries: newest, id: 'latest', title: 'Latest' },
    { entries: movies, id: 'movies', title: 'Movies' },
    { entries: shows, id: 'tv-shows', title: 'TV Shows' },
    { entries: behind, id: 'behind-the-camera', title: 'Behind the Camera' },
  ].filter((row) => row.entries.length > 0);

  return {
    biography: payload.biography?.trim() || undefined,
    birthday: payload.birthday || undefined,
    department: payload.known_for_department,
    id: String(payload.id),
    name: payload.name,
    placeOfBirth: payload.place_of_birth || undefined,
    profileUrl: buildTmdbImageUrl(payload.profile_path, 'w780'),
    rows,
    source: 'tmdb',
    totalCredits: new Set([...cast, ...crew].map((credit) => `${credit.media_type}:${credit.id}`)).size,
  };
}
