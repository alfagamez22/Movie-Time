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

  const entries = await findRecords('watchHistory', {
    userId: session.user.id,
    ...(experience ? { experience } : {}),
  }, { orderBy: 'watchedAt', limit: MAX_WATCH_HISTORY_ENTRIES });

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

  const result = await upsertWatchHistoryWithProgress(session.user.id, entry, experience);
  if (!result) return NextResponse.json({ skipped: 'deleted' });

  return NextResponse.json({ entry: result.record, progress: result.progress });
}
