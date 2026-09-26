import { MEDIA_CARD_FRAGMENT, requestAnilist, type AnilistMedia } from '@/lib/anime/anilist';
import { mapBrowseEntries } from '@/lib/anime/client';
import { isReleasedAnime } from '@/lib/anime/episodes';

import type { PersonProfile, PersonSummary } from './types';

interface StaffNode {
  dateOfBirth?: { day?: number | null; month?: number | null; year?: number | null } | null;
  description?: string | null;
  homeTown?: string | null;
  id: number;
  image?: { large?: string | null } | null;
  name?: { full?: string | null; native?: string | null } | null;
  primaryOccupations?: string[] | null;
}

interface StaffDetails extends StaffNode {
  characterMedia?: { edges?: Array<{ node?: AnilistMedia | null }> | null } | null;
  staffMedia?: { edges?: Array<{ node?: AnilistMedia | null; staffRole?: string | null }> | null } | null;
}

function cleanDescription(value: string | null | undefined) {
  if (!value) return undefined;
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/~!|!~/g, '')
    .split('\n')
    .map((line) => line.trim())
    // Lines like "[Profile](..) | [Twitter](..)" are link bars, not prose.
    .filter((line) => line && (line.match(/\]\(/g)?.length ?? 0) < 2 || !line.includes('|'))
    .map((line) => line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/(^|\s)_(\S.*?\S|\S)_(?=\s|[.,!?;:]|$)/g, '$1$2'))
    .filter(Boolean)
    .join('\n')
    .trim() || undefined;
}

function formatBirthday(date: StaffNode['dateOfBirth']) {
  if (!date?.year) return undefined;
  const month = String(date.month ?? 1).padStart(2, '0');
  const day = String(date.day ?? 1).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

function animeOnly(media: Array<AnilistMedia | null | undefined>): AnilistMedia[] {
  const seen = new Set<number>();
  return media.filter((item): item is AnilistMedia => {
    if (!item || item.type !== 'ANIME' || item.isAdult || !isReleasedAnime(item) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export async function searchAnilistStaff(query: string): Promise<PersonSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const result = await requestAnilist<{ Page: { staff?: Array<StaffNode & { characterMedia?: { nodes?: Array<{ title?: { userPreferred?: string | null } }> } }> } }>(
    `query StaffSearch($search: String!) {
      Page(page: 1, perPage: 10) {
        staff(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
          id
          name { full }
          image { large }
          primaryOccupations
          characterMedia(perPage: 2, sort: [POPULARITY_DESC]) { nodes { title { userPreferred } } }
        }
      }
    }`,
    { search: trimmed },
  ).catch(() => null);

  return (result?.Page.staff ?? [])
    .filter((staff) => staff.name?.full && staff.image?.large && !staff.image.large.includes('/default.'))
    .map((staff) => ({
      id: String(staff.id),
      knownFor: staff.characterMedia?.nodes?.map((node) => node.title?.userPreferred).filter(Boolean).join(', ')
        || staff.primaryOccupations?.join(', ')
        || undefined,
      name: staff.name!.full!,
      profileUrl: staff.image!.large!,
      source: 'anilist' as const,
    }));
}

export async function getAnilistStaff(id: string): Promise<PersonProfile | null> {
  const staffId = Number.parseInt(id, 10);
  if (!Number.isFinite(staffId) || staffId < 1) return null;

  const result = await requestAnilist<{ Staff: StaffDetails | null }>(
    `query StaffDetails($id: Int!) {
      Staff(id: $id) {
        id
        name { full native }
        image { large }
        description(asHtml: false)
        primaryOccupations
        homeTown
        dateOfBirth { year month day }
        characterMedia(page: 1, perPage: 50, sort: [POPULARITY_DESC]) {
          edges { node { ${MEDIA_CARD_FRAGMENT} } }
        }
        staffMedia(page: 1, perPage: 25, type: ANIME, sort: [POPULARITY_DESC]) {
          edges { staffRole node { ${MEDIA_CARD_FRAGMENT} } }
        }
      }
    }`,
    { id: staffId },
  ).catch(() => null);

  const staff = result?.Staff;
  if (!staff?.name?.full) return null;

  const roles = animeOnly((staff.characterMedia?.edges ?? []).map((edge) => edge.node));
  const staffWork = animeOnly((staff.staffMedia?.edges ?? []).map((edge) => edge.node));
  const byYear = (a: AnilistMedia, b: AnilistMedia) => (b.seasonYear ?? b.startDate?.year ?? 0) - (a.seasonYear ?? a.startDate?.year ?? 0);

  const rows = [
    { entries: mapBrowseEntries(roles.slice(0, 20)), id: 'popular-roles', title: 'Popular Roles' },
    { entries: mapBrowseEntries([...roles].sort(byYear).slice(0, 30)), id: 'latest-roles', title: 'Latest Roles' },
    { entries: mapBrowseEntries(roles.filter((media) => media.format === 'MOVIE')), id: 'movies', title: 'Anime Movies' },
    { entries: mapBrowseEntries(staffWork), id: 'staff-work', title: 'Staff Work' },
  ].filter((row) => row.entries.length > 0);

  return {
    biography: cleanDescription(staff.description),
    birthday: formatBirthday(staff.dateOfBirth),
    department: staff.primaryOccupations?.[0] ?? 'Voice Actor',
    id: String(staff.id),
    knownFor: staff.name.native ?? undefined,
    name: staff.name.full,
    placeOfBirth: staff.homeTown ?? undefined,
    profileUrl: staff.image?.large ?? undefined,
    rows,
    source: 'anilist',
    totalCredits: new Set([...roles, ...staffWork].map((media) => media.id)).size,
  };
}
