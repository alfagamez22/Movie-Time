import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { MAX_WATCH_HISTORY_ENTRIES, upsertWatchHistoryWithProgress, type WatchEntry } from '@/lib/media/watch-history';

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
  if (entries.length > MAX_WATCH_HISTORY_ENTRIES) {
    return NextResponse.json({ error: 'Too many history entries.' }, { status: 400 });
  }

  const valid = entries.filter(
    (e): e is WatchEntry => Boolean(e?.id && e.provider && e.type && e.experience),
  );

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  // Keep a first-visit sync from flooding Couchbase with every record at once.
  for (let offset = 0; offset < valid.length; offset += 6) {
    const results = await Promise.allSettled(
      valid.slice(offset, offset + 6).map((entry) => upsertWatchHistoryWithProgress(session.user.id, entry, entry.experience)),
    );
    synced += results.filter((r) => r.status === 'fulfilled' && r.value).length;
    skipped += results.filter((r) => r.status === 'fulfilled' && !r.value).length;
    failed += results.filter((r) => r.status === 'rejected').length;
  }

  return NextResponse.json({ synced, skipped, failed });
}
