import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import { findRecords, readRecord, saveRecord, type AppRecord } from '@/lib/db/records';
import { validateCommentBody } from '@/lib/media/user-actions';

interface CommentUser extends Record<string, unknown> {
  id: string;
  image: string | null;
  name: string | null;
}

interface CommentWithUser {
  body: string;
  createdAt: Date | string;
  id: string;
  updatedAt: Date | string;
  user: CommentUser;
  userId: string;
}

function serializeComment(comment: CommentWithUser, viewerId?: string) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: new Date(comment.createdAt).toISOString(),
    updatedAt: new Date(comment.updatedAt).toISOString(),
    ownedByViewer: Boolean(viewerId && viewerId === comment.userId),
    user: {
      id: comment.user.id,
      image: comment.user.image,
      name: comment.user.name ?? 'PapiFlix user',
    },
  };
}

function missingMediaParams(searchParams: URLSearchParams) {
  return !searchParams.get('mediaId') || !searchParams.get('mediaType') || !searchParams.get('mediaProvider');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (missingMediaParams(searchParams)) {
    return NextResponse.json({ error: 'Missing media identifiers.' }, { status: 400 });
  }

  const session = await auth();
  const mediaId = searchParams.get('mediaId')!;
  const mediaType = searchParams.get('mediaType')!;
  const mediaProvider = searchParams.get('mediaProvider')!;

  const comments = await findRecords<AppRecord & Omit<CommentWithUser, 'user'> & { title: string }>('mediaComment', {
    mediaId, mediaType, mediaProvider,
  }, { orderBy: 'createdAt', limit: 50 });
  const userIds = [...new Set(comments.map((comment) => comment.userId))];
  const users = await Promise.all(userIds.map((id) => readRecord<CommentUser>('user', id)));
  const usersById = new Map(users.filter((user): user is CommentUser => Boolean(user)).map((user) => [user.id, user]));

  return NextResponse.json({
    comments: comments.flatMap((comment) => {
      const user = usersById.get(comment.userId);
      return user ? [serializeComment({ ...comment, user }, session?.user?.id)] : [];
    }),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    body?: unknown;
    experience?: string;
    mediaId?: string;
    mediaProvider?: string;
    mediaType?: string;
    title?: string;
  } | null;

  if (!body?.mediaId || !body.mediaType || !body.mediaProvider || !body.experience || !body.title) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const validation = validateCommentBody(body.body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const comment = await saveRecord('mediaComment', randomUUID(), {
    userId: session.user.id,
    mediaId: body.mediaId,
    mediaType: body.mediaType,
    mediaProvider: body.mediaProvider,
    experience: body.experience,
    title: body.title,
    body: validation.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const user = await readRecord<CommentUser>('user', session.user.id);

  if (!user) return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
  return NextResponse.json({ comment: serializeComment({ ...comment, user } as CommentWithUser, session.user.id) }, { status: 201 });
}
