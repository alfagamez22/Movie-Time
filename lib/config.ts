function readUrlEnv(name: string, fallback: string): string {
  const candidate = process.env[name]?.trim() || fallback;

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Environment variable ${name} must be a valid absolute URL.`);
  }
}

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'PapiFlix',
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    'Search-driven movie and series library with native playback controls.',
  vidkingEmbedBaseUrl: readUrlEnv('VIDKING_EMBED_BASE_URL', 'https://www.vidking.net/embed'),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
};
