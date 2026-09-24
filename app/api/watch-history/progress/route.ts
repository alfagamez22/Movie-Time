import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { findRecords } from '@/lib/db/records';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ progress: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');
  const mediaId = searchParams.get('mediaId');

  const progress = await findRecords('watchProgress', {
    userId: session.user.id,
    ...(experience ? { experience } : {}),
    ...(mediaId ? { mediaId } : {}),
  }, { orderBy: 'updatedAt' });

  return NextResponse.json({ progress });
}
