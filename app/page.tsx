import { HomePage } from '@/components/media/home-page';
import { getTmdbLibrarySections } from '@/lib/tmdb/client';

export default async function Page() {
  const liveLibrary = await getTmdbLibrarySections();

  return (
    <HomePage
      sections={liveLibrary.ok ? liveLibrary.sections : []}
      discoveryError={liveLibrary.ok ? null : liveLibrary.message}
    />
  );
}
