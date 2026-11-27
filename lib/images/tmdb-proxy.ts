import sharp from 'sharp';

import { DEFAULT_TMDB_IMAGE_SIZE, isTmdbImageSize, TMDB_IMAGE_PATH_PATTERN, type TmdbImageSize } from './tmdb-image-path';

const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';
const UPSTREAM_TIMEOUT_MS = 10_000;
/**
 * One output format for every browser: WebP encodes several times faster than AVIF on a cold serverless
 * instance, and a single variant (no `Vary: Accept`) means one CDN cache entry per image instead of one per browser.
 */
const WEBP_OPTIONS = { effort: 2, quality: 78 } as const;

const IMAGE_VARIANTS: Record<TmdbImageSize, { outputWidth: number; upstreamSize: string }> = {
  w92: {
    outputWidth: 110,
    upstreamSize: 'w185',
  },
  w300: {
    outputWidth: 320,
    upstreamSize: 'w500',
  },
  w780: {
    outputWidth: 960,
    upstreamSize: 'w1280',
  },
};

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const DAY_IN_SECONDS = 60 * 60 * 24;

function transformImage(buffer: Buffer, width: number) {
  return sharp(buffer)
    .rotate()
    .resize({ fit: 'inside', width, withoutEnlargement: true })
    .webp(WEBP_OPTIONS);
}

export async function handleTmdbImageRequest(
  imagePath: string,
  requestedSize: string | null,
  cacheLong: boolean,
): Promise<Response> {
  if (!TMDB_IMAGE_PATH_PATTERN.test(imagePath)) {
    return new Response('Invalid TMDB image path.', { status: 400 });
  }

  const size = isTmdbImageSize(requestedSize) ? requestedSize : DEFAULT_TMDB_IMAGE_SIZE;
  const variant = IMAGE_VARIANTS[size];

  const upstreamUrl = `${TMDB_IMAGE_BASE_URL}/${variant.upstreamSize}${imagePath}`;

  let upstreamResponse: Response;
  let sourceBuffer: Buffer;
  try {
    // The CDN caches our small WebP output; also caching the multi-MB original in the data cache only slows misses.
    upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });

    if (!upstreamResponse.ok) {
      return new Response('TMDB image unavailable.', { status: upstreamResponse.status });
    }

    sourceBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
  } catch {
    return new Response('TMDB image unavailable.', { headers: { 'Cache-Control': 'no-store' }, status: 502 });
  }

  try {
    const optimizedBuffer = await transformImage(sourceBuffer, variant.outputWidth).toBuffer();

    const cacheControl = cacheLong
      ? `public, max-age=${YEAR_IN_SECONDS}, s-maxage=${YEAR_IN_SECONDS}, stale-while-revalidate=${DAY_IN_SECONDS}`
      : 'public, no-cache, max-age=0, must-revalidate';

    return new Response(new Blob([Uint8Array.from(optimizedBuffer)]), {
      headers: {
        'Cache-Control': cacheControl,
        'Content-Length': String(optimizedBuffer.byteLength),
        'Content-Type': 'image/webp',
      },
    });
  } catch {
    return new Response(new Blob([Uint8Array.from(sourceBuffer)]), {
      headers: {
        'Cache-Control': cacheLong
          ? `public, max-age=${DAY_IN_SECONDS}, s-maxage=${DAY_IN_SECONDS}`
          : 'public, no-cache, max-age=0, must-revalidate',
        'Content-Length': String(sourceBuffer.byteLength),
        'Content-Type': upstreamResponse.headers.get('content-type') ?? 'image/jpeg',
      },
    });
  }
}
