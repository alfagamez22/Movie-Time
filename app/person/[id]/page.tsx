import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PersonPage } from '@/components/media/person-page';
import { papiflixExperience } from '@/lib/media/experience';
import { getTmdbPerson } from '@/lib/people/tmdb';

export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = await getTmdbPerson((await params).id);
  if (!person) return { title: 'Person not found' };
  return {
    description: person.biography?.slice(0, 160) || `Titles featuring ${person.name} on PapiFlix.`,
    openGraph: person.profileUrl ? { images: [person.profileUrl] } : undefined,
    title: person.name,
  };
}

export default async function Page({ params }: Props) {
  const person = await getTmdbPerson((await params).id);
  if (!person) notFound();
  return <PersonPage experience={papiflixExperience} person={person} />;
}
