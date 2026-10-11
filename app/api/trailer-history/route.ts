import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { saveRecord, stableRecordId } from '@/lib/db/records';
import { titleExperience, trailerHistorySchema } from '@/lib/media/personal-library-validation';

export async function POST(request: Request) {
  const session = await auth();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const body = trailerHistorySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid trailer.' }, { status: 400, headers });
  const { mediaId, mediaProvider, mediaType, trailer } = body.data;
  const record = await saveRecord('trailerHistory', stableRecordId(session.user.id, mediaId, mediaProvider, mediaType, trailer.youtubeId), {
    ...body.data, trailer: { ...trailer, url: `https://www.youtube.com/watch?v=${trailer.youtubeId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${trailer.youtubeId}/hqdefault.jpg` },
    userId: session.user.id, experience: titleExperience(mediaProvider), updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ trailer: record }, { status: 201, headers });
}
