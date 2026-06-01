import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { deleteWatchHistoryForUser } from '@/lib/media/watch-history';

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mediaId?: string;
    mediaProvider?: string;
    mediaType?: string;
  } | null;

  if (!body?.mediaId || !body.mediaProvider || !body.mediaType) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  await deleteWatchHistoryForUser(
    session.user.id,
    body.mediaId,
    body.mediaProvider,
    body.mediaType,
  );

  return NextResponse.json({ deleted: true });
}
