import { HomePage } from '@/components/media/home-page';
import { getAnikotoLibrarySections } from '@/lib/anime/client';
import { papianimeExperience } from '@/lib/media/experience';

export const dynamic = 'force-dynamic';

export default async function AnimePage() {
  const library = await getAnikotoLibrarySections();

  return (
    <HomePage
      discoveryError={library.ok ? null : library.message}
      experience={papianimeExperience}
      sections={library.ok ? library.sections : []}
    />
  );
}
