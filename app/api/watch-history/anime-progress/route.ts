import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { deleteRecord, findRecord, findRecords, saveRecord, stableRecordId, type AppRecord } from '@/lib/db/records';

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
    const progress = await findRecord('papiAnimeProgress', {
      userId: session.user.id, anilistId, season, episode,
    });

    return NextResponse.json({ progress });
  }

  const allProgress = await findRecords('papiAnimeProgress', {
    userId: session.user.id, anilistId,
  }, { orderBy: 'updatedAt' });

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

  const key = {
    userId: session.user.id,
    anilistId: body.anilistId,
    season: body.season ?? '1',
    episode: body.episode,
  };
  const existing = await findRecord<AppRecord & { id: string }>('papiAnimeProgress', key);
  const now = new Date().toISOString();
  const progress = await saveRecord('papiAnimeProgress', existing?.id ?? stableRecordId(...Object.values(key)), {
    ...existing,
    ...key,
    title: body.title,
    posterUrl: body.posterUrl ?? null,
    backdropUrl: body.backdropUrl ?? null,
    startAt: body.startAt ?? 0,
    currentTime: body.currentTime ?? 0,
    duration: body.duration ?? null,
    progressPercent: body.progressPercent ?? 0,
    lastEventType: body.lastEventType ?? null,
    lastWatchedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
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

  const progress = await findRecord<AppRecord & { id: string }>('papiAnimeProgress', {
    userId: session.user.id, anilistId, season, episode,
  });
  if (progress) await deleteRecord('papiAnimeProgress', progress.id);

  return NextResponse.json({ deleted: true });
}
