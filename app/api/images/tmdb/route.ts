import { DEFAULT_TMDB_IMAGE_SIZE, isTmdbImageSize, TMDB_IMAGE_PATH_PATTERN } from '@/lib/images/tmdb-image-path';

const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/**
 * Legacy query-string form (`/api/images/tmdb?path=/x.jpg&size=w300`) still stored in older bookmarks and
 * history rows. Redirect to the CDN-cacheable path form instead of re-encoding every hit uncached.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const imagePath = requestUrl.searchParams.get('path') ?? '';
  const requestedSize = requestUrl.searchParams.get('size');

  if (!TMDB_IMAGE_PATH_PATTERN.test(imagePath)) {
    return new Response('Invalid TMDB image path.', { status: 400 });
  }
  if (requestedSize !== null && !isTmdbImageSize(requestedSize)) {
    return new Response('Invalid TMDB image size.', { status: 400 });
  }

  const size = requestedSize ?? DEFAULT_TMDB_IMAGE_SIZE;
  const location = new URL(`/api/images/tmdb/${size}${imagePath}`, requestUrl.origin);
  return new Response(null, {
    headers: {
      'Cache-Control': `public, max-age=${YEAR_IN_SECONDS}, s-maxage=${YEAR_IN_SECONDS}`,
      Location: location.toString(),
    },
    status: 308,
  });
}
