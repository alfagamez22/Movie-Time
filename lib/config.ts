function readUrlEnv(name: string, fallback: string): string {
  const candidate = process.env[name]?.trim() || fallback;

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Environment variable ${name} must be a valid absolute URL.`);
  }
}

function normalizeAbsoluteUrl(candidate: string | undefined): string | null {
  const trimmed = candidate?.trim();

  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isLocalUrl(candidate: string): boolean {
  const { hostname } = new URL(candidate);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]';
}

function readSiteUrl(): string {
  const explicitSiteUrl = normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const vercelSiteUrl =
    normalizeAbsoluteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeAbsoluteUrl(process.env.VERCEL_BRANCH_URL) ||
    normalizeAbsoluteUrl(process.env.VERCEL_URL);

  if (explicitSiteUrl && !isLocalUrl(explicitSiteUrl)) {
    return explicitSiteUrl;
  }

  if (vercelSiteUrl) {
    return vercelSiteUrl;
  }

  return explicitSiteUrl ?? 'http://localhost:3000';
}

const APP_NAME = 'PapiFlix';
const SOCIAL_PREVIEW_IMAGE = {
  alt: `${APP_NAME} website preview`,
  height: 630,
  path: '/icons/papiflix-social-preview-v2.jpg',
  type: 'image/jpeg',
  width: 1200,
} as const;

export const appConfig = {
  anilistGraphqlUrl: readUrlEnv('ANILIST_GRAPHQL_URL', 'https://graphql.anilist.co'),
  anilistClientId: process.env.ANILIST_CLIENT_ID?.trim(),
  mangadexApiBaseUrl: readUrlEnv('MANGADEX_API_BASE_URL', 'https://api.mangadex.org'),
  mangadexCdnOrigin: readUrlEnv('MANGADEX_CDN_ORIGIN', 'https://uploads.mangadex.org'),
  name: APP_NAME,
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    'Search-driven movie and series library with native playback controls.',
  ezvidEmbedBaseUrl: readUrlEnv('EZVID_EMBED_BASE_URL', 'https://ezvidapi.com/embed'),
  filmuEmbedBaseUrl: readUrlEnv('FILMU_EMBED_BASE_URL', 'https://embed.filmu.in'),
  multiEmbedBaseUrl: readUrlEnv('MULTIEMBED_BASE_URL', 'https://multiembed.mov'),
  vidfastEmbedBaseUrl: readUrlEnv('VIDFAST_EMBED_BASE_URL', 'https://vidfast.net'),
  vidkingEmbedBaseUrl: readUrlEnv('VIDKING_EMBED_BASE_URL', 'https://www.vidking.net/embed'),
  siteUrl: readSiteUrl(),
  socialPreviewImage: SOCIAL_PREVIEW_IMAGE,
  animeIncludeAdult: process.env.NEXT_PUBLIC_ANIME_INCLUDE_ADULT?.trim() === '1',
};
