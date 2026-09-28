import sharp from 'sharp';

const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';

type SupportedSize = 'w92' | 'w300' | 'w780';
/**
 * One output format for every browser: WebP encodes several times faster than AVIF on a cold serverless
 * instance, and a single variant (no `Vary: Accept`) means one CDN cache entry per image instead of one per browser.
 */
const WEBP_OPTIONS = { effort: 2, quality: 78 } as const;

const IMAGE_VARIANTS: Record<SupportedSize, { outputWidth: number; upstreamSize: string }> = {
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
const TMDB_IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9/_-]+\.(?:avif|gif|jpe?g|png|webp)$/i;

function isSupportedSize(value: string | null): value is SupportedSize {
  return value === 'w92' || value === 'w300' || value === 'w780';
}

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

  const size = isSupportedSize(requestedSize) ? requestedSize : 'w780';
  const variant = IMAGE_VARIANTS[size];

  const upstreamUrl = `${TMDB_IMAGE_BASE_URL}/${variant.upstreamSize}${imagePath}`;

  // The CDN caches our small WebP output; also caching the multi-MB original in the data cache only slows misses.
  const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });

  if (!upstreamResponse.ok) {
    return new Response('TMDB image unavailable.', { status: upstreamResponse.status });
  }

  const sourceBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

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
