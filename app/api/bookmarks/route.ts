import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { findRecord, findRecords, saveRecord, stableRecordId } from '@/lib/db/records';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ bookmarks: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');

  const bookmarks = await findRecords('bookmark', {
    userId: session.user.id,
    ...(experience ? { experience } : {}),
  }, { orderBy: 'updatedAt' });

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

  const key = {
    userId: session.user.id,
    mediaId: body.mediaId,
    mediaProvider: body.mediaProvider,
    mediaType: body.mediaType,
  };
  const existing = await findRecord<Record<string, unknown> & { id: string }>('bookmark', key);
  const now = new Date().toISOString();
  const bookmark = await saveRecord('bookmark', existing?.id ?? stableRecordId(...Object.values(key)), {
    ...existing,
    ...key,
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
    status: body.status ?? existing?.status ?? 'favorite',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  return NextResponse.json({ bookmark }, { status: 201 });
}
