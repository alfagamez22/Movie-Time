import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { findRecord, findRecords, saveRecord, stableRecordId } from '@/lib/db/records';
import { isBookmarkStatus } from '@/lib/media/user-actions';
import {
  isMediaExperience,
  normalizeSynopsis,
  validateImageUrl,
  validateMediaIdentity,
  validateOptionalExperience,
  validateTitle,
} from '@/lib/validation/media-identity';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ bookmarks: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = validateOptionalExperience(searchParams.get('experience'));
  if (!experience.ok) {
    return NextResponse.json({ error: experience.error }, { status: 400 });
  }

  const bookmarks = await findRecords('bookmark', {
    userId: session.user.id,
    ...(experience.value ? { experience: experience.value } : {}),
  }, { orderBy: 'updatedAt' });

  return NextResponse.json({ bookmarks }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mediaId?: unknown;
    mediaType?: unknown;
    mediaProvider?: unknown;
    experience?: unknown;
    title?: unknown;
    posterUrl?: unknown;
    backdropUrl?: unknown;
    synopsis?: unknown;
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
  if (body.status != null && !isBookmarkStatus(body.status)) {
    return NextResponse.json({ error: 'Invalid bookmark status.' }, { status: 400 });
  }
  const identity = validateMediaIdentity(body);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 });
  if (!isMediaExperience(body.experience)) return NextResponse.json({ error: 'Invalid experience.' }, { status: 400 });
  const title = validateTitle(body.title);
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });
  const posterUrl = validateImageUrl(body.posterUrl);
  const backdropUrl = validateImageUrl(body.backdropUrl);
  if (!posterUrl.ok || !backdropUrl.ok) return NextResponse.json({ error: 'Invalid image URL.' }, { status: 400 });

  const key = {
    userId: session.user.id,
    mediaId: identity.value.mediaId,
    mediaProvider: identity.value.mediaProvider,
    mediaType: identity.value.mediaType,
  };
  const existing = await findRecord<Record<string, unknown> & { id: string }>('bookmark', key);
  const now = new Date().toISOString();
  const bookmark = await saveRecord('bookmark', existing?.id ?? stableRecordId(...Object.values(key)), {
    ...existing,
    ...key,
    experience: body.experience,
    title: title.value,
    posterUrl: posterUrl.value,
    backdropUrl: backdropUrl.value,
    synopsis: normalizeSynopsis(body.synopsis),
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
