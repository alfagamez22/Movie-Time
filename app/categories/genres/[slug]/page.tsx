import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { appConfig } from '@/lib/config';
import { GenrePageClient } from '@/components/media/genre-page';
import { SeoFaqSection } from '@/components/seo/seo-faq';
import { papiflixExperience } from '@/lib/media/experience';
import { breadcrumbJsonLd, faqJsonLd, jsonLdScript, titleListJsonLd } from '@/lib/seo';
import { genreSeo } from '@/lib/seo-content';
import { findGenreTile, getGenreDefinitions, getGenreTitles, parseGenreSort } from '@/lib/tmdb/genres';

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tile = await findGenreTile((await params).slug);
  if (!tile) return { title: 'Genre not found' };

  const seo = genreSeo(tile.name, Boolean(tile.movieGenreId), Boolean(tile.tvGenreId));
  const canonical = `/categories/genres/${tile.slug}`;
  return {
    alternates: { canonical },
    description: seo.description,
    keywords: seo.keywords,
    openGraph: { description: seo.description, title: seo.title, images: [{ url: appConfig.socialPreviewImage.path }], type: 'website', url: canonical },
    title: seo.title,
    twitter: { images: [appConfig.socialPreviewImage.path], card: 'summary_large_image', description: seo.description, title: seo.title },
  };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tile = await findGenreTile(slug);
  if (!tile) notFound();

  const requestedType = query.type === 'tv' ? 'tv' : 'movie';
  const type = requestedType === 'tv' ? (tile.tvGenreId ? 'tv' : 'movie') : (tile.movieGenreId ? 'movie' : 'tv');
  const sort = parseGenreSort(typeof query.sort === 'string' ? query.sort : undefined);
  const [initial, allGenres] = await Promise.all([getGenreTitles(tile, type, sort, 1), getGenreDefinitions()]);

  const seo = genreSeo(tile.name, Boolean(tile.movieGenreId), Boolean(tile.tvGenreId));
  const canonical = `/categories/genres/${tile.slug}`;
  const related = allGenres
    .filter((genre) => genre.slug !== tile.slug)
    .map((genre) => ({ href: `/categories/genres/${genre.slug}`, label: `${genre.name} ${genre.movieGenreId ? 'movies' : 'TV shows'}` }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Categories', path: '/categories' },
            { name: `${tile.name} ${tile.movieGenreId ? 'movies' : 'TV shows'}`, path: canonical },
          ]),
          faqJsonLd(seo.faqs),
          ...(initial.entries.length ? [titleListJsonLd(seo.heading, initial.entries)] : []),
        ])}
      />
      <GenrePageClient experience={papiflixExperience} initial={initial} initialSort={sort} initialType={type} tile={tile} />
      <div className="bg-[#050505] pb-24">
        <SeoFaqSection faqs={seo.faqs} heading={seo.heading} intro={seo.intro} links={related} />
      </div>
    </>
  );
}
