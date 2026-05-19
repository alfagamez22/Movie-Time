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
  name: process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Movie DB',
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() ||
    'Readable slug-based movie and series routes for a Vidking-powered catalog.',
  vidkingEmbedBaseUrl: readUrlEnv('VIDKING_EMBED_BASE_URL', 'https://www.vidking.net/embed'),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
};