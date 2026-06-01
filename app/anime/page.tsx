import { HomePage } from '@/components/media/home-page';
import { browseAnimeForPlayer, isAnimePlayerId, type AnimePlayerId } from '@/lib/anime/player-config';
import { papianimeExperience } from '@/lib/media/experience';

export const dynamic = 'force-dynamic';

interface AnimePageProps {
  searchParams: Promise<{ player?: string }>;
}

export default async function AnimePage(props: AnimePageProps) {
  const searchParams = await props.searchParams;
  const playerId: AnimePlayerId = isAnimePlayerId(searchParams.player) ? searchParams.player : 'p1';

  const library = await browseAnimeForPlayer(playerId);

  return (
    <HomePage
      discoveryError={library.error ?? null}
      experience={papianimeExperience}
      sections={library.sections}
    />
  );
}
