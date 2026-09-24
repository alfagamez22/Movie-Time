import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { deleteRecord, readRecord, saveRecord } from '@/lib/db/records';

type BookmarkDoc = Record<string, unknown> & { id: string; userId: string; status?: string };

interface RouteContext {
  params: Promise<{ bookmarkId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookmarkId } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;

  const validStatuses = ['favorite', 'watched', 'plan_to_watch'];
  if (!body?.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const bookmark = await readRecord<BookmarkDoc>('bookmark', bookmarkId);
  if (!bookmark || bookmark.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const updated = await saveRecord('bookmark', bookmarkId, {
    ...bookmark,
    status: body.status,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ bookmark: updated });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { bookmarkId } = await context.params;

  const bookmark = await readRecord<BookmarkDoc>('bookmark', bookmarkId);
  if (!bookmark || bookmark.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  await deleteRecord('bookmark', bookmarkId);
  return NextResponse.json({ success: true });
}
