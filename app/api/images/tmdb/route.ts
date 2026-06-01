import { handleTmdbImageRequest } from '@/lib/images/tmdb-proxy';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const imagePath = requestUrl.searchParams.get('path');
  const size = requestUrl.searchParams.get('size');

  return handleTmdbImageRequest(imagePath ?? '', size, request.headers.get('accept'), false);
}