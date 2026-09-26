import type { LibraryMediaEntry } from '@/lib/media/types';

export type PeopleSource = 'tmdb' | 'anilist';

export interface PersonSummary {
  id: string;
  knownFor?: string;
  name: string;
  profileUrl?: string;
  source: PeopleSource;
}

export interface PersonRow {
  entries: LibraryMediaEntry[];
  id: string;
  title: string;
}

export interface PersonProfile extends PersonSummary {
  biography?: string;
  birthday?: string;
  department?: string;
  placeOfBirth?: string;
  rows: PersonRow[];
  totalCredits: number;
}
