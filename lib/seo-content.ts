/**
 * Search-intent copy and keywords. Kept free of config/env imports so both server and client
 * components can use it.
 */

export interface SeoFaq {
  answer: string;
  question: string;
}

/** Extra site-wide intent phrases; merged into SEO_KEYWORDS in lib/seo.ts. */
export const INTENT_KEYWORDS = [
  'free movies',
  'watch movies online free',
  'where to watch movies',
  'where to watch movies online',
  'free movie streaming site',
  'stream movies free',
  'watch TV series online free',
  'action movies',
  'watch action movies online',
  'best action movies',
  'comedy movies online',
  'horror movies online',
];

export function truncateSeo(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export const HOME_FAQS: SeoFaq[] = [
  {
    answer: 'PapiFlix is a free movie and TV series streaming site. Browse trending titles, search by name or explore genres like action, comedy, horror and Filipino movies, then open a title for its synopsis, trailer and playback options. Availability depends on the playback provider.',
    question: 'Where can I watch movies online for free?',
  },
  {
    answer: 'Open the Action genre page to browse popular, top rated and newly released action movies and TV series. You can switch between movies and TV shows and sort by Popular, Top Rated or New Releases.',
    question: 'Where can I watch action movies online?',
  },
  {
    answer: 'Yes. PapiFlix has a Filipino & international movies collection, plus genre pages for every category. Use the search box to look up any movie or series by title.',
    question: 'Does PapiFlix have Filipino movies and TV series?',
  },
  {
    answer: 'Yes. Start a watch party from a title page and share the link to watch together with friends. PapiFlix also has PapiAnime for anime with subs and dubs and PapiManga for reading manga.',
    question: 'Can I watch movies with friends?',
  },
];

export function genreSeo(name: string, supportsMovies = true, supportsTv = true) {
  const mediaTypes = supportsMovies ? (supportsTv ? 'movies and TV shows' : 'movies') : 'TV shows';
  const mediaType = supportsMovies ? 'movies' : 'TV shows';
  const genre = name.toLowerCase();
  const year = new Date().getFullYear();

  const faqs: SeoFaq[] = [
    {
      answer: `You can watch ${genre} ${mediaTypes} online on PapiFlix. Browse popular, top rated and new releases, then open any title to see its synopsis, trailer and playback options. Availability depends on the playback provider.`,
      question: `Where can I watch ${genre} ${mediaType} online for free?`,
    },
    {
      answer: `Set the list to Top Rated to see the best-reviewed ${genre} titles, or Popular to see what viewers are watching most right now.`,
      question: `What are the best ${genre} ${mediaType} to watch?`,
    },
    {
      answer: `Yes. Choose New Releases to see the latest ${genre} ${mediaTypes} first.${supportsMovies && supportsTv ? ' Switch between Movies and TV Shows at the top of the page.' : ''}`,
      question: `Can I find new ${genre} releases on PapiFlix?`,
    },
  ];

  return {
    description: truncateSeo(
      `Watch free ${genre} ${mediaTypes} online on PapiFlix. Browse popular, top rated and new ${genre} titles and find where to watch your next favorite.`,
      160,
    ),
    faqs,
    heading: `Watch ${name} ${mediaTypes} online`,
    intro: `Looking for ${genre} ${mediaType} to watch online? PapiFlix lists popular, top rated and newly released ${genre} ${mediaTypes} in one place. Sort by Popular to see what viewers are watching now, Top Rated for the best-reviewed ${genre} titles, or New Releases for the latest. Open any title for its synopsis, trailer and playback options. Availability depends on the playback provider.`,
    keywords: [
      `${genre} ${mediaType}`,
      `watch ${genre} ${mediaType} online`,
      `free ${genre} ${mediaType}`,
      `watch ${genre} ${mediaType} free`,
      `best ${genre} ${mediaType}`,
      `best ${genre} ${mediaType} ${year}`,
      `new ${genre} ${mediaType}`,
      `where to watch ${genre} ${mediaType}`,
      `${genre} ${mediaType} to watch`,
      ...(supportsTv ? [`${genre} TV series`] : []),
      `stream ${genre} ${mediaType} online`,
      supportsMovies ? 'free movies online' : 'free TV shows online',
      'PapiFlix',
    ],
    title: `Watch Free ${name} ${supportsMovies ? (supportsTv ? 'Movies & TV Shows' : 'Movies') : 'TV Shows'} Online`,
  };
}

export function titleSeoKeywords(title: string, year: number | string | undefined, isSeries: boolean): string[] {
  return [
    title,
    `watch ${title}`,
    `watch ${title} online`,
    `watch ${title} online free`,
    `${title} free`,
    `where to watch ${title}`,
    ...(year ? [`${title} ${year}`] : []),
    ...(isSeries ? [`${title} all episodes`, `${title} TV series`] : [`${title} full movie`]),
    'PapiFlix',
  ];
}
