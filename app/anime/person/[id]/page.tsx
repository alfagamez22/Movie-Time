import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PersonPage } from '@/components/media/person-page';
import { papianimeExperience } from '@/lib/media/experience';
import { getAnilistStaff } from '@/lib/people/anilist';

export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = await getAnilistStaff((await params).id);
  if (!person) return { title: 'Person not found' };
  return {
    description: person.biography?.slice(0, 160) || `Titles featuring ${person.name} on PapiAnime.`,
    openGraph: person.profileUrl ? { images: [person.profileUrl] } : undefined,
    title: person.name,
  };
}

export default async function Page({ params }: Props) {
  const person = await getAnilistStaff((await params).id);
  if (!person) notFound();
  return <PersonPage experience={papianimeExperience} person={person} />;
}
