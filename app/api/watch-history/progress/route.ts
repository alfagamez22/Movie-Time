import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { findRecords } from '@/lib/db/records';
import { isMediaId, validateOptionalExperience } from '@/lib/validation/media-identity';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ progress: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = validateOptionalExperience(searchParams.get('experience'));
  if (!experience.ok) {
    return NextResponse.json({ error: experience.error }, { status: 400 });
  }
  const mediaId = searchParams.get('mediaId');
  if (mediaId && !isMediaId(mediaId)) {
    return NextResponse.json({ error: 'Invalid media id.' }, { status: 400 });
  }

  const progress = await findRecords('watchProgress', {
    userId: session.user.id,
    ...(experience.value ? { experience: experience.value } : {}),
    ...(mediaId ? { mediaId } : {}),
  }, { orderBy: 'updatedAt' });

  return NextResponse.json({ progress });
}
