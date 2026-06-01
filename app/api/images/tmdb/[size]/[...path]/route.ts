import { type NextRequest } from 'next/server';
import { handleTmdbImageRequest } from '@/lib/images/tmdb-proxy';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ size: string; path: string[] }> },
) {
  const { size, path } = await params;
  const imagePath = '/' + path.join('/');
  return handleTmdbImageRequest(imagePath, size, request.headers.get('accept'), true);
}
