import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ bookmarks: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id, ...(experience ? { experience } : {}) },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ bookmarks });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mediaId?: string;
    mediaType?: string;
    mediaProvider?: string;
    experience?: string;
    title?: string;
    posterUrl?: string;
    backdropUrl?: string;
    synopsis?: string;
    rating?: number;
    year?: number;
    anilistId?: string;
    malId?: string;
    animeFormat?: string;
    status?: string;
  } | null;

  if (!body?.mediaId || !body.mediaType || !body.mediaProvider || !body.experience || !body.title) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.upsert({
    where: {
      userId_mediaId_mediaProvider_mediaType: {
        userId: session.user.id,
        mediaId: body.mediaId,
        mediaProvider: body.mediaProvider,
        mediaType: body.mediaType,
      },
    },
    update: { status: body.status ?? 'favorite', updatedAt: new Date() },
    create: {
      userId: session.user.id,
      mediaId: body.mediaId,
      mediaType: body.mediaType,
      mediaProvider: body.mediaProvider,
      experience: body.experience,
      title: body.title,
      posterUrl: body.posterUrl ?? null,
      backdropUrl: body.backdropUrl ?? null,
      synopsis: body.synopsis ?? '',
      rating: body.rating ?? null,
      year: body.year ?? null,
      anilistId: body.anilistId ?? null,
      malId: body.malId ?? null,
      animeFormat: body.animeFormat ?? null,
      status: body.status ?? 'favorite',
    },
  });

  return NextResponse.json({ bookmark }, { status: 201 });
}
