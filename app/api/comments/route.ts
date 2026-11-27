import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import { findRecords, readRecord, saveRecord, type AppRecord } from '@/lib/db/records';
import { validateCommentBody } from '@/lib/media/user-actions';
import { rateLimit } from '@/lib/rate-limit';
import { isMediaExperience, validateMediaIdentity, validateTitle } from '@/lib/validation/media-identity';

const COMMENT_LIMIT = 10;
const COMMENT_WINDOW_MS = 60_000;

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

  const identity = validateMediaIdentity({
    mediaId: searchParams.get('mediaId'),
    mediaProvider: searchParams.get('mediaProvider'),
    mediaType: searchParams.get('mediaType'),
  });
  if (!identity.ok) {
    return NextResponse.json({ error: identity.error }, { status: 400 });
  }

  const session = await auth();
  const { mediaId, mediaType, mediaProvider } = identity.value;

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
  const limited = rateLimit('comment', session.user.id, COMMENT_LIMIT, COMMENT_WINDOW_MS);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    body?: unknown;
    experience?: unknown;
    mediaId?: unknown;
    mediaProvider?: unknown;
    mediaType?: unknown;
    title?: unknown;
  } | null;

  if (!body?.mediaId || !body.mediaType || !body.mediaProvider || !body.experience || !body.title) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  const identity = validateMediaIdentity(body);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 });
  if (!isMediaExperience(body.experience)) return NextResponse.json({ error: 'Invalid experience.' }, { status: 400 });
  const title = validateTitle(body.title);
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  const validation = validateCommentBody(body.body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const user = await readRecord<CommentUser>('user', session.user.id);
  if (!user) return NextResponse.json({ error: 'User record not found.' }, { status: 404 });

  const comment = await saveRecord('mediaComment', randomUUID(), {
    userId: session.user.id,
    ...identity.value,
    experience: body.experience,
    title: title.value,
    body: validation.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ comment: serializeComment({ ...comment, user } as CommentWithUser, session.user.id) }, { status: 201 });
}
