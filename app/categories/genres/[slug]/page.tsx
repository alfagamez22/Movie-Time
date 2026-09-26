import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GenrePageClient } from '@/components/media/genre-page';
import { papiflixExperience } from '@/lib/media/experience';
import { findGenreTile, getGenreTitles, parseGenreSort } from '@/lib/tmdb/genres';

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tile = await findGenreTile((await params).slug);
  return tile
    ? { description: `Browse ${tile.name} movies and TV shows on PapiFlix.`, title: `${tile.name} | Categories` }
    : { title: 'Genre not found' };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tile = await findGenreTile(slug);
  if (!tile) notFound();

  const requestedType = query.type === 'tv' ? 'tv' : 'movie';
  const type = requestedType === 'tv' ? (tile.tvGenreId ? 'tv' : 'movie') : (tile.movieGenreId ? 'movie' : 'tv');
  const sort = parseGenreSort(typeof query.sort === 'string' ? query.sort : undefined);
  const initial = await getGenreTitles(tile, type, sort, 1);

  return <GenrePageClient experience={papiflixExperience} initial={initial} initialSort={sort} initialType={type} tile={tile} />;
}
