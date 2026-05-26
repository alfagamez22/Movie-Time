import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateCommentBody } from '@/lib/media/user-actions';

interface CommentUser {
  id: string;
  image: string | null;
  name: string | null;
}

interface CommentWithUser {
  body: string;
  createdAt: Date;
  id: string;
  updatedAt: Date;
  user: CommentUser;
  userId: string;
}

function serializeComment(comment: CommentWithUser, viewerId?: string) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
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

  const comments = await prisma.mediaComment.findMany({
    where: { mediaId, mediaType, mediaProvider },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          image: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    comments: comments.map((comment: CommentWithUser) => serializeComment(comment, session?.user?.id)),
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

  const comment = await prisma.mediaComment.create({
    data: {
      userId: session.user.id,
      mediaId: body.mediaId,
      mediaType: body.mediaType,
      mediaProvider: body.mediaProvider,
      experience: body.experience,
      title: body.title,
      body: validation.value,
    },
    include: {
      user: {
        select: {
          id: true,
          image: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ comment: serializeComment(comment, session.user.id) }, { status: 201 });
}
