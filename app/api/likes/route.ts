import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteRecord, readRecord, saveRecord, stableRecordId } from '@/lib/db/records';
import { personalTitleSchema, titleExperience, titleIdentitySchema } from '@/lib/media/personal-library-validation';

const headers = { 'Cache-Control': 'private, no-store' };
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return respond({ error: 'Unauthorized' }, 401);
  const key = titleIdentitySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!key.success) return respond({ error: 'Invalid title.' }, 400);
  const { mediaId, mediaProvider, mediaType } = key.data;
  const record = await readRecord('likedTitle', stableRecordId(session.user.id, mediaId, mediaProvider, mediaType), { experience: titleExperience(mediaProvider) });
  return respond({ liked: Boolean(record) });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return respond({ error: 'Unauthorized' }, 401);
  const body = personalTitleSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return respond({ error: 'Invalid title.' }, 400);
  const { mediaId, mediaProvider, mediaType } = body.data;
  await saveRecord('likedTitle', stableRecordId(session.user.id, mediaId, mediaProvider, mediaType), {
    ...body.data, userId: session.user.id, experience: titleExperience(mediaProvider), updatedAt: new Date().toISOString(),
  });
  return respond({ liked: true });
}
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return respond({ error: 'Unauthorized' }, 401);
  const body = titleIdentitySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return respond({ error: 'Invalid title.' }, 400);
  const { mediaId, mediaProvider, mediaType } = body.data;
  await deleteRecord('likedTitle', stableRecordId(session.user.id, mediaId, mediaProvider, mediaType));
  return respond({ liked: false });
}
