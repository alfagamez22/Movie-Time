import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ progress: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const experience = searchParams.get('experience');
  const mediaId = searchParams.get('mediaId');

  const progress = await prisma.watchProgress.findMany({
    where: {
      userId: session.user.id,
      ...(experience ? { experience } : {}),
      ...(mediaId ? { mediaId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ progress });
}
