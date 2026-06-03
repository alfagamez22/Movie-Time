import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';

import {
  DEFAULT_DISK_CACHE_CONFIG,
  findCacheEntry,
  groomCache,
  writeCacheEntry,
  type DiskCacheConfig,
  type DiskCacheFormat,
} from '@/lib/images/disk-cache';

const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL?.trim() || 'https://image.tmdb.org/t/p';

type SupportedSize = 'w92' | 'w300' | 'w780';
type OutputFormat = DiskCacheFormat;

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

function isSaveDataEnabled(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  return /save-data/i.test(acceptHeader);
}

function selectOutputFormat(acceptHeader: string | null, saveData: boolean): OutputFormat {
  if (saveData) {
    return 'jpeg';
  }
  const normalizedAccept = acceptHeader?.toLowerCase() ?? '';
  if (normalizedAccept.includes('image/avif')) {
    return 'avif';
  }
  if (normalizedAccept.includes('image/webp')) {
    return 'webp';
  }
  return 'jpeg';
}

function transformImage(buffer: Buffer, width: number, format: OutputFormat, saveData: boolean) {
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
      return pipeline.jpeg({ mozjpeg: true, quality: saveData ? 70 : 88 });
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

function getCacheConfig(): DiskCacheConfig {
  return DEFAULT_DISK_CACHE_CONFIG;
}

async function streamCachedFile(filePath: string, format: OutputFormat): Promise<Response | null> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile() || stats.size <= 0) {
      return null;
    }
    const nodeStream = createReadStream(filePath);
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk) : new TextEncoder().encode(String(chunk)));
        });
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        'Cache-Control': `public, max-age=${YEAR_IN_SECONDS}, s-maxage=${YEAR_IN_SECONDS}, immutable`,
        'Content-Length': String(stats.size),
        'Content-Type': getContentType(format),
        Vary: 'Accept, Save-Data',
      },
    });
  } catch {
    return null;
  }
}

export async function handleTmdbImageRequest(
  imagePath: string,
  requestedSize: string | null,
  acceptHeader: string | null,
  cacheLong: boolean,
): Promise<Response> {
  if (!TMDB_IMAGE_PATH_PATTERN.test(imagePath)) {
    return new Response('Invalid TMDB image path.', { status: 400 });
  }

  const size = isSupportedSize(requestedSize) ? requestedSize : 'w780';
  const variant = IMAGE_VARIANTS[size];
  const saveData = isSaveDataEnabled(acceptHeader);
  const outputFormat = selectOutputFormat(acceptHeader, saveData);
  const cacheConfig = getCacheConfig();

  const cachedFile = findCacheEntry(cacheConfig, {
    format: outputFormat,
    imagePath,
    size,
  });
  if (cachedFile) {
    const cached = await streamCachedFile(cachedFile, outputFormat);
    if (cached) {
      return cached;
    }
  }

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

  try {
    const optimizedBuffer = await transformImage(sourceBuffer, variant.outputWidth, outputFormat, saveData).toBuffer();

    let persistedPath: string | null = null;
    try {
      persistedPath = await writeCacheEntry(
        cacheConfig,
        { format: outputFormat, imagePath, size },
        optimizedBuffer,
      );
    } catch {
      // Disk persistence is best-effort; serve from memory even if write fails.
    }

    if (persistedPath) {
      const cached = await streamCachedFile(persistedPath, outputFormat);
      if (cached) {
        return cached;
      }
    }

    const cacheControl = cacheLong
      ? `public, max-age=${YEAR_IN_SECONDS}, s-maxage=${YEAR_IN_SECONDS}, stale-while-revalidate=${DAY_IN_SECONDS}`
      : 'public, no-cache, max-age=0, must-revalidate';

    return new Response(new Blob([Uint8Array.from(optimizedBuffer)]), {
      headers: {
        'Cache-Control': cacheControl,
        'Content-Length': String(optimizedBuffer.byteLength),
        'Content-Type': getContentType(outputFormat),
        Vary: 'Accept, Save-Data',
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
        Vary: 'Accept, Save-Data',
      },
    });
  }
}

export async function groomImageCache(): Promise<void> {
  await groomCache(DEFAULT_DISK_CACHE_CONFIG);
}
