import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { MAX_WATCH_HISTORY_ENTRIES, upsertWatchHistoryWithProgress, type WatchEntry } from '@/lib/media/watch-history';
import { findRecords } from '@/lib/db/records';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entries: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');
  if (experience && !['papiflix', 'papianime', 'papimanga'].includes(experience)) {
    return NextResponse.json({ error: 'Unknown experience.' }, { status: 400 });
  }
  const filters = {
    userId: session.user.id,
    ...(experience ? { experience } : {}),
  };
  try {
    const [entries, progress] = await Promise.all([
      findRecords('watchHistory', filters, { orderBy: 'watchedAt', limit: MAX_WATCH_HISTORY_ENTRIES }),
      searchParams.get('includeProgress') === '1'
        ? findRecords('watchProgress', filters, { orderBy: 'updatedAt' })
        : Promise.resolve(undefined),
    ]);
    return NextResponse.json({ entries, ...(progress ? { progress } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Your watch history is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
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

  const result = await upsertWatchHistoryWithProgress(session.user.id, entry, experience);
  if (!result) return NextResponse.json({ skipped: 'deleted' });

  return NextResponse.json({ entry: result.record, progress: result.progress });
}
