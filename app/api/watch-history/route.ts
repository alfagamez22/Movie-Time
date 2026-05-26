import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

type WatchEntry = {
  id: string;
  title: string;
  provider: string;
  type: string;
  experience: string;
  episode?: string;
  season?: string;
  progressSeconds?: number;
  progressPercent?: number;
  durationSeconds?: number;
  posterUrl?: string;
  backdropUrl?: string;
  synopsis?: string;
  rating?: number;
  year?: number;
  anilistId?: string;
  malId?: string;
  animeFormat?: string;
  defaultLanguage?: string;
  episodeCount?: number;
  watchedAt?: number;
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entries: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');

  const entries = await prisma.watchHistory.findMany({
    where: { userId: session.user.id, ...(experience ? { experience } : {}) },
    orderBy: { watchedAt: 'desc' },
    take: 24,
  });

  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    entry?: WatchEntry;
    experience?: string;
  } | null;

  const entry = body?.entry;
  const experience = body?.experience ?? entry?.experience;

  if (!entry?.id || !entry.provider || !entry.type || !experience) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const record = await prisma.watchHistory.upsert({
    where: {
      userId_mediaId_mediaProvider_mediaType: {
        userId: session.user.id,
        mediaId: entry.id,
        mediaProvider: entry.provider,
        mediaType: entry.type,
      },
    },
    update: {
      episode: entry.episode ?? null,
      season: entry.season ?? null,
      progressSeconds: entry.progressSeconds ?? null,
      progressPercent: entry.progressPercent ?? null,
      durationSeconds: entry.durationSeconds ?? null,
      watchedAt: entry.watchedAt ? new Date(entry.watchedAt) : new Date(),
      updatedAt: new Date(),
    },
    create: {
      userId: session.user.id,
      mediaId: entry.id,
      mediaType: entry.type,
      mediaProvider: entry.provider,
      experience,
      title: entry.title,
      posterUrl: entry.posterUrl ?? null,
      backdropUrl: entry.backdropUrl ?? null,
      synopsis: entry.synopsis ?? '',
      rating: entry.rating ?? null,
      year: entry.year ?? null,
      episode: entry.episode ?? null,
      season: entry.season ?? null,
      progressSeconds: entry.progressSeconds ?? null,
      progressPercent: entry.progressPercent ?? null,
      durationSeconds: entry.durationSeconds ?? null,
      anilistId: entry.anilistId ?? null,
      malId: entry.malId ?? null,
      animeFormat: entry.animeFormat ?? null,
      defaultLanguage: entry.defaultLanguage ?? null,
      episodeCount: entry.episodeCount ?? null,
      watchedAt: entry.watchedAt ? new Date(entry.watchedAt) : new Date(),
    },
  });

  return NextResponse.json({ entry: record });
}
