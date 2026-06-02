import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ progress: null }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const anilistId = searchParams.get('anilistId');
  const season = searchParams.get('season') ?? '1';
  const episode = searchParams.get('episode');

  if (!anilistId) {
    return NextResponse.json({ error: 'anilistId is required' }, { status: 400 });
  }

  if (episode) {
    const progress = await prisma.papiAnimeProgress.findUnique({
      where: {
        userId_anilistId_season_episode: {
          userId: session.user.id,
          anilistId,
          season,
          episode,
        },
      },
    });

    return NextResponse.json({ progress });
  }

  const allProgress = await prisma.papiAnimeProgress.findMany({
    where: { userId: session.user.id, anilistId },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ progress: allProgress });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    anilistId: string;
    season?: string;
    episode: string;
    title: string;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    startAt?: number;
    currentTime?: number;
    duration?: number | null;
    progressPercent?: number;
    lastEventType?: string | null;
  } | null;

  if (!body?.anilistId || !body?.episode || !body?.title) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const progress = await prisma.papiAnimeProgress.upsert({
    where: {
      userId_anilistId_season_episode: {
        userId: session.user.id,
        anilistId: body.anilistId,
        season: body.season ?? '1',
        episode: body.episode,
      },
    },
    update: {
      title: body.title,
      posterUrl: body.posterUrl ?? null,
      backdropUrl: body.backdropUrl ?? null,
      startAt: body.startAt ?? 0,
      currentTime: body.currentTime ?? 0,
      duration: body.duration ?? null,
      progressPercent: body.progressPercent ?? 0,
      lastEventType: body.lastEventType ?? null,
      lastWatchedAt: new Date(),
    },
    create: {
      userId: session.user.id,
      anilistId: body.anilistId,
      season: body.season ?? '1',
      episode: body.episode,
      title: body.title,
      posterUrl: body.posterUrl ?? null,
      backdropUrl: body.backdropUrl ?? null,
      startAt: body.startAt ?? 0,
      currentTime: body.currentTime ?? 0,
      duration: body.duration ?? null,
      progressPercent: body.progressPercent ?? 0,
      lastEventType: body.lastEventType ?? null,
    },
  });

  return NextResponse.json({ progress });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const anilistId = searchParams.get('anilistId');
  const season = searchParams.get('season') ?? '1';
  const episode = searchParams.get('episode');

  if (!anilistId || !episode) {
    return NextResponse.json({ error: 'anilistId and episode are required' }, { status: 400 });
  }

  await prisma.papiAnimeProgress.deleteMany({
    where: {
      userId: session.user.id,
      anilistId,
      season,
      episode,
    },
  });

  return NextResponse.json({ deleted: true });
}
