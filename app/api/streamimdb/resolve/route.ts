import { resolveStreamimdbId } from '@/lib/media/streamimdb-resolver';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tmdbId = requestUrl.searchParams.get('tmdbId');
  const type = requestUrl.searchParams.get('type');

  if (!tmdbId || (type !== 'movie' && type !== 'tv')) {
    return Response.json({ imdbId: null }, { status: 400 });
  }

  const imdbId = await resolveStreamimdbId(tmdbId, type);

  return Response.json({ imdbId });
}
