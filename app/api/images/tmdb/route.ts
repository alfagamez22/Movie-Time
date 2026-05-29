import sharp from 'sharp';

const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';

export const runtime = 'nodejs';

type SupportedSize = 'w300' | 'w780';
type OutputFormat = 'avif' | 'jpeg' | 'webp';

const IMAGE_VARIANTS: Record<SupportedSize, { outputWidth: number; upstreamSize: string }> = {
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
  return value === 'w300' || value === 'w780';
}

function selectOutputFormat(acceptHeader: string | null): OutputFormat {
  const normalizedAccept = acceptHeader?.toLowerCase() ?? '';

  if (normalizedAccept.includes('image/avif')) {
    return 'avif';
  }

  if (normalizedAccept.includes('image/webp')) {
    return 'webp';
  }

  return 'jpeg';
}

function transformImage(buffer: Buffer, width: number, format: OutputFormat) {
  const pipeline = sharp(buffer).rotate().resize({
    fit: 'inside',
    width,
    withoutEnlargement: true,
  });

  switch (format) {
    case 'avif':
      return pipeline.avif({ effort: 4, quality: 62 });
    case 'webp':
      return pipeline.webp({ effort: 4, quality: 82 });
    default:
      return pipeline.jpeg({ mozjpeg: true, quality: 88 });
  }
}

function getContentType(format: OutputFormat): string {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function toResponseBody(buffer: Buffer): Blob {
  return new Blob([Uint8Array.from(buffer)]);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const imagePath = requestUrl.searchParams.get('path');
  const requestedSize = requestUrl.searchParams.get('size');

  if (!imagePath || !TMDB_IMAGE_PATH_PATTERN.test(imagePath)) {
    return new Response('Invalid TMDB image path.', { status: 400 });
  }

  const size = isSupportedSize(requestedSize) ? requestedSize : 'w780';
  const variant = IMAGE_VARIANTS[size];
  const upstreamUrl = `${TMDB_IMAGE_BASE_URL}/${variant.upstreamSize}${imagePath}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    next: {
      revalidate: DAY_IN_SECONDS,
    },
  });

  if (!upstreamResponse.ok) {
    return new Response('TMDB image unavailable.', { status: upstreamResponse.status });
  }

  const sourceBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
  const outputFormat = selectOutputFormat(request.headers.get('accept'));

  try {
    const optimizedBuffer = await transformImage(sourceBuffer, variant.outputWidth, outputFormat).toBuffer();

    return new Response(toResponseBody(optimizedBuffer), {
      headers: {
        'Cache-Control': `public, max-age=${YEAR_IN_SECONDS}, s-maxage=${YEAR_IN_SECONDS}, stale-while-revalidate=${DAY_IN_SECONDS}`,
        'Content-Length': String(optimizedBuffer.byteLength),
        'Content-Type': getContentType(outputFormat),
        Vary: 'Accept',
      },
    });
  } catch {
    return new Response(toResponseBody(sourceBuffer), {
      headers: {
        'Cache-Control': `public, max-age=${DAY_IN_SECONDS}, s-maxage=${DAY_IN_SECONDS}`,
        'Content-Length': String(sourceBuffer.byteLength),
        'Content-Type': upstreamResponse.headers.get('content-type') ?? 'image/jpeg',
      },
    });
  }
}