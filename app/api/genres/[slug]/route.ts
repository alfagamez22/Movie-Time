import { NextResponse } from 'next/server';

import { findGenreTile, getGenreTitles, parseGenreSort } from '@/lib/tmdb/genres';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tile = await findGenreTile((await params).slug);
  if (!tile) return NextResponse.json({ error: 'Unknown genre' }, { status: 404 });

  const searchParams = new URL(request.url).searchParams;
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const result = await getGenreTitles(tile, type, parseGenreSort(searchParams.get('sort')), page);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
