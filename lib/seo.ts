import { appConfig } from '@/lib/config';
import type { LibraryMediaEntry, MediaEntry } from '@/lib/media/types';
import { INTENT_KEYWORDS, type SeoFaq } from '@/lib/seo-content';
import { normalizeSlug } from '@/lib/slugs/media';

export const SITE_URL = appConfig.siteUrl.replace(/\/+$/, '');

export const HOME_SEO_TITLE = 'PapiFlix — Watch Free Movies & TV Series Online';
export const HOME_SEO_DESCRIPTION = 'Watch free movies and TV series online on PapiFlix. Explore trending titles, action, comedy, horror and Filipino movies, plus watch parties with friends.';

const BASE_SEO_KEYWORDS = [
  // Core streaming
  'free movies online',
  'watch free movies',
  'watch movies online',
  'stream movies',
  'watch TV series online',
  'stream TV shows free',
  'free TV series online',
  'viva max',
  'free vivamax',
  'vivamax',


  // Filipino / Pinoy
  'Filipino movies',
  'Filipino movies free',
  'watch Filipino movies online free',
  'Pinoy movies',
  'Pinoy movies online',
  'Tagalog movies online',
  'Filipino TV series online',
  'Pinoy teleserye online',
  'libreng palabas',

  // Anime
  'anime streaming',
  'anime streaming site',
  'watch anime online free',
  'watch anime sub and dub',
  'anime sub vs dub',
  'English dub anime',
  'Tagalog dub anime',
  'watch anime HD',
  'libreng anime',


  // Manga
  'read manga online',
  'read manga online free',
  'read manga in English',
  'manga reader',
  'latest manga chapters',

  // Watch party
  'movie watch party',
  'online movie watch party',
  'watch movies with friends online',
  'synced movie watch party',

  // Long-tail intent
  'where to watch movies free',
  'best site to watch free movies',
  'free anime streaming site',

  // Brand
  'PapiFlix',
  'PapiFlix movies',
  'PapiFlix free movies',
  'PapiAnime',
  'PapiAnime sub dub',
  'PapiManga',
  'PapiManga read online',
  'free netflix',
  'putlocker',
  'free movies',
];

export const SEO_KEYWORDS = [...new Set([...BASE_SEO_KEYWORDS, ...INTENT_KEYWORDS])];

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Strips playback-only params (progress, party, color…) so each title has one canonical URL. */
export function canonicalWatchPath(slug: string, type: string, id: string): string {
  return `/watch/${encodeURIComponent(slug)}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
}

type JsonLdValue = Record<string, unknown>;

export function websiteJsonLd(): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    alternateName: 'PapiFlix',
    description: HOME_SEO_DESCRIPTION,
    inLanguage: 'en',
    name: appConfig.name,
    publisher: { '@type': 'Organization', logo: absoluteUrl('/icons/favicon/android-chrome-512x512.png'), name: appConfig.name },
    url: SITE_URL,
  };
}

export function titleJsonLd(entry: LibraryMediaEntry | MediaEntry, url: string): JsonLdValue {
  const isSeries = entry.type === 'tv';
  return {
    '@context': 'https://schema.org',
    '@type': isSeries ? 'TVSeries' : 'Movie',
    ...(typeof entry.rating === 'number' && entry.rating > 0 && typeof entry.voteCount === 'number' && entry.voteCount > 0
      ? { aggregateRating: { '@type': 'AggregateRating', bestRating: 10, ratingCount: entry.voteCount, ratingValue: entry.rating } }
      : {}),
    ...(entry.year ? { datePublished: String(entry.year) } : {}),
    ...(entry.synopsis ? { description: entry.synopsis.slice(0, 500) } : {}),
    ...(entry.posterUrl ? { image: absoluteUrl(entry.posterUrl) } : {}),
    name: entry.title,
    potentialAction: { '@type': 'WatchAction', target: absoluteUrl(url) },
    url: absoluteUrl(url),
  };
}

export function faqJsonLd(faqs: SeoFaq[]): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      name: faq.question,
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      item: absoluteUrl(item.path),
      name: item.name,
      position: index + 1,
    })),
  };
}

export function titleListJsonLd(name: string, entries: Array<LibraryMediaEntry | MediaEntry>): JsonLdValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: entries.slice(0, 20).map((entry, index) => ({
      '@type': 'ListItem',
      name: entry.title,
      position: index + 1,
      url: absoluteUrl(canonicalWatchPath(normalizeSlug(entry.title) || entry.id, entry.type, entry.id)),
    })),
    name,
  };
}

/** Serialises JSON-LD safely for a <script> tag (no `</script>` break-out). */
export function jsonLdScript(data: JsonLdValue | JsonLdValue[]): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
