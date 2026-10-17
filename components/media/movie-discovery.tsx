import Link from 'next/link';

import { SeoFaqSection } from '@/components/seo/seo-faq';
import { HOME_FAQS } from '@/lib/seo-content';

const browseLinks = [
  { href: '/categories/trending', label: 'Trending movies & series' },
  { href: '/categories/rating', label: 'Top rated titles' },
  { href: '/categories/genres/action', label: 'Action movies' },
  { href: '/categories/genres/comedy', label: 'Comedy movies' },
  { href: '/categories/genres/horror', label: 'Horror movies' },
  { href: '/categories/genres/romance', label: 'Romance movies' },
  { href: '/categories/genres/thriller', label: 'Thriller movies' },
  { href: '/categories/genres/adventure', label: 'Adventure movies' },
  { href: '/categories/genres/science-fiction', label: 'Sci-fi movies' },
  { href: '/categories/regional', label: 'Filipino & international movies' },
  { href: '/anime', label: 'Anime with sub & dub' },
];

export function MovieDiscovery() {
  return (
    <>
    <section aria-labelledby="movie-discovery-heading" className="mx-auto max-w-7xl px-6 py-10 md:px-12">
      <h2 id="movie-discovery-heading" className="text-xl font-bold text-white md:text-2xl">
        Watch free movies and TV series online
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
        Find your next movie night on PapiFlix. Browse trending movies, discover TV series, or explore
        action, comedy, horror and Filipino cinema. Open a title for its synopsis, trailer and playback
        options. Availability depends on the playback provider.
      </p>
      <nav aria-label="Explore movies and series" className="mt-5 flex flex-wrap gap-3">
        {browseLinks.map(({ href, label }) => (
          <Link key={href} href={href} className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-zinc-400">
        Sign in to keep your list, likes and watch history together in{' '}
        <Link href="/my-papiflix" className="text-zinc-200 underline underline-offset-4">My PapiFlix</Link>,
        or start a watch party to enjoy a title with friends.
      </p>
    </section>
    <SeoFaqSection faqs={HOME_FAQS} heading="Frequently asked questions" />
    </>
  );
}
