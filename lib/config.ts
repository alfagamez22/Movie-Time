function readUrlEnv(name: string, fallback: string): string {
  const candidate = process.env[name]?.trim() || fallback;

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Environment variable ${name} must be a valid absolute URL.`);
  }
}

const APP_NAME = 'PapiFlix';
const SOCIAL_PREVIEW_IMAGE = {
  alt: `${APP_NAME} website preview`,
  height: 1024,
  path: '/icons/papiflixbannerimage.png',
  type: 'image/png',
  width: 1536,
} as const;

export const appConfig = {
  aniZipApiBaseUrl: readUrlEnv('ANI_ZIP_API_BASE_URL', 'https://api.ani.zip'),
  anilistGraphqlUrl: readUrlEnv('ANILIST_GRAPHQL_URL', 'https://graphql.anilist.co'),
  name: APP_NAME,
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    'Search-driven movie and series library with native playback controls.',
  vidnestAnimeApiBaseUrl: readUrlEnv('VIDNEST_ANIME_API_BASE_URL', 'https://new.vidnest.fun'),
  vidfastEmbedBaseUrl: readUrlEnv('VIDFAST_EMBED_BASE_URL', 'https://vidfast.net'),
  vidkingEmbedBaseUrl: readUrlEnv('VIDKING_EMBED_BASE_URL', 'https://www.vidking.net/embed'),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
  socialPreviewImage: SOCIAL_PREVIEW_IMAGE,
};
