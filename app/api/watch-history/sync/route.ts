import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { upsertWatchHistoryWithProgress, type WatchEntry } from '@/lib/media/watch-history';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { entries?: WatchEntry[] } | null;
  const entries = body?.entries;

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const valid = entries.filter(
    (e): e is WatchEntry => Boolean(e?.id && e.provider && e.type && e.experience),
  );

  const results = await Promise.allSettled(
    valid.map((entry) => upsertWatchHistoryWithProgress(session.user.id, entry, entry.experience)),
  );

  const synced = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - synced;

  return NextResponse.json({ synced, failed });
}
