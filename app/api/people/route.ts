import { NextResponse } from 'next/server';

import { clientIp, rateLimit } from '@/lib/rate-limit';

import { searchAnilistStaff } from '@/lib/people/anilist';
import { searchTmdbPeople } from '@/lib/people/tmdb';

export async function GET(request: Request) {
  const limited = rateLimit('people', clientIp(request), 60, 60_000);
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().slice(0, 100) ?? '';
  const source = searchParams.get('source') === 'anilist' ? 'anilist' : 'tmdb';
  const people = source === 'anilist' ? await searchAnilistStaff(query) : await searchTmdbPeople(query);
  return NextResponse.json({ people }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
