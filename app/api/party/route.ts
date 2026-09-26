import { NextResponse } from 'next/server';

import { rateLimit } from '@/lib/rate-limit';

import { auth } from '@/lib/auth';
import { createParty, listLiveParties } from '@/lib/party/store';

const EXPERIENCES = new Set(['papiflix', 'papianime']);

function text(value: unknown, max = 300) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function imageUrl(value: unknown) {
  const url = text(value, 500);
  return url && (url.startsWith('https://') || (url.startsWith('/') && !url.startsWith('//'))) ? url : null;
}

function seconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export async function GET(request: Request) {
  const experience = new URL(request.url).searchParams.get('experience') ?? '';
  if (!EXPERIENCES.has(experience)) return NextResponse.json({ parties: [] });
  const parties = await listLiveParties(experience).catch(() => []);
  return NextResponse.json({ parties }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to start a watch party.' }, { status: 401 });
  const limited = rateLimit('party-create', session.user.id, 5, 10 * 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const experience = text(body?.experience, 20);
  const watchPath = text(body?.watchPath, 500);
  const mediaId = text(body?.mediaId, 50);
  const mediaProvider = text(body?.mediaProvider, 20);
  const mediaType = text(body?.mediaType, 10);
  const title = text(body?.title);
  if (!experience || !EXPERIENCES.has(experience) || !watchPath?.startsWith('/') || watchPath.startsWith('//') || !mediaId || !mediaProvider || !mediaType || !title) {
    return NextResponse.json({ error: 'Missing party details.' }, { status: 400 });
  }

  const party = await createParty({
    backdropUrl: imageUrl(body?.backdropUrl),
    duration: seconds(body?.duration),
    episode: text(body?.episode, 10),
    experience,
    hostId: session.user.id,
    hostImage: session.user.image ?? null,
    hostName: session.user.name ?? session.user.email ?? 'Host',
    mediaId,
    mediaProvider,
    mediaType,
    posterUrl: imageUrl(body?.posterUrl),
    season: text(body?.season, 10),
    startTime: seconds(body?.time) ?? 0,
    time: seconds(body?.time) ?? 0,
    title,
    watchPath,
  });
  return NextResponse.json({ party });
}
