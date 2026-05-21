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

export const appConfig = {
  anikotoApiBaseUrl: readUrlEnv('ANIKOTO_API_BASE_URL', 'https://anikotoapi.site'),
  jikanApiBaseUrl: readUrlEnv('JIKAN_API_BASE_URL', 'https://api.jikan.moe/v4'),
  megaPlayEmbedBaseUrl: readUrlEnv('MEGAPLAY_EMBED_BASE_URL', 'https://megaplay.buzz/stream'),
  name: APP_NAME,
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    'Search-driven movie and series library with native playback controls.',
  vidfastEmbedBaseUrl: readUrlEnv('VIDFAST_EMBED_BASE_URL', 'https://vidfast.net'),
  vidkingEmbedBaseUrl: readUrlEnv('VIDKING_EMBED_BASE_URL', 'https://www.vidking.net/embed'),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
};
