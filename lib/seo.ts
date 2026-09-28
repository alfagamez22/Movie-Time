import { appConfig } from '@/lib/config';
import type { LibraryMediaEntry, MediaEntry } from '@/lib/media/types';

export const SITE_URL = appConfig.siteUrl.replace(/\/+$/, '');

export const SEO_KEYWORDS = [
  'watch movies online',
  'watch TV series online',
  'stream movies',
  'anime streaming',
  'watch anime sub and dub',
  'read manga online',
  'movie watch party',
  'PapiFlix',
  'PapiAnime',
  'PapiManga',
];

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
    description: appConfig.description,
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
    url: absoluteUrl(url),
  };
}

/** Serialises JSON-LD safely for a <script> tag (no `</script>` break-out). */
export function jsonLdScript(data: JsonLdValue | JsonLdValue[]): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
