import { NextResponse } from 'next/server';

import { querySessions } from '@/lib/analytics/store';
import { forbidden, getAdminSession } from '@/lib/auth/require-admin';
import { findRecords } from '@/lib/db/records';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await getAdminSession())) return forbidden();
  const { userId } = await params;

  const [sessions, history, bookmarks] = await Promise.all([
    querySessions({ includeAdmin: true, limit: 100, userId }),
    findRecords('watchHistory', { userId }, { direction: 'desc', limit: 100, orderBy: 'watchedAt' }).catch(() => []),
    findRecords('bookmark', { userId }, { direction: 'desc', limit: 100, orderBy: 'createdAt' }).catch(() => []),
  ]);

  return NextResponse.json({ bookmarks, history, sessions });
}
