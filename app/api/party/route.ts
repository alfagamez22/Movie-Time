import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { createParty } from '@/lib/party/store';

const EXPERIENCES = new Set(['papiflix', 'papianime']);

function text(value: unknown, max = 300) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to start a watch party.' }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const experience = text(body?.experience, 20);
  const watchPath = text(body?.watchPath, 500);
  const mediaId = text(body?.mediaId, 50);
  const mediaProvider = text(body?.mediaProvider, 20);
  const mediaType = text(body?.mediaType, 10);
  const title = text(body?.title);
  if (!experience || !EXPERIENCES.has(experience) || !watchPath?.startsWith('/') || watchPath.startsWith('//') || !mediaId || !mediaProvider || !mediaType || !title) {
    return NextResponse.json({ error: 'Missing party details.' }, { status: 400 });
  }

  const party = await createParty({
    experience,
    hostId: session.user.id,
    hostImage: session.user.image ?? null,
    hostName: session.user.name ?? session.user.email ?? 'Host',
    mediaId,
    mediaProvider,
    mediaType,
    title,
    watchPath,
  });
  return NextResponse.json({ party });
}
