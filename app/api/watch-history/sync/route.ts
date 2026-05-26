import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

type SyncEntry = {
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

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { entries?: SyncEntry[] } | null;
  const entries = body?.entries;

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const valid = entries.filter(
    (e): e is SyncEntry => Boolean(e?.id && e.provider && e.type && e.experience),
  );

  await Promise.all(
    valid.map((entry) =>
      prisma.watchHistory.upsert({
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
          experience: entry.experience,
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
      }),
    ),
  );

  return NextResponse.json({ synced: valid.length });
}
