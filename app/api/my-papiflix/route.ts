import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { findRecords } from '@/lib/db/records';

export async function GET() {
  const session = await auth();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const userId = session.user.id;
    const collections = await Promise.all(['papiflix', 'papianime'].map(async (experience) => {
      const filters = { userId, experience };
      const [bookmarks, history, progress, likes, trailers] = await Promise.all([
        findRecords('bookmark', filters, { orderBy: 'updatedAt' }),
        findRecords('watchHistory', filters, { orderBy: 'watchedAt', limit: 100 }),
        findRecords('watchProgress', filters, { orderBy: 'watchedAt' }),
        findRecords('likedTitle', filters, { orderBy: 'updatedAt' }),
        findRecords('trailerHistory', filters, { orderBy: 'updatedAt', limit: 100 }),
      ]);
      return { bookmarks, history, progress, likes, trailers };
    }));
    const data = Object.fromEntries(['bookmarks', 'history', 'progress', 'likes', 'trailers'].map((key) => [key,
      collections.flatMap((collection) => collection[key as keyof typeof collection])
        .sort((a, b) => String(b.watchedAt ?? b.updatedAt ?? '').localeCompare(String(a.watchedAt ?? a.updatedAt ?? '')))
        .map(({ userId: _owner, ...record }) => record),
    ]));
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: 'Your library could not be loaded. Try again.' }, { status: 503, headers });
  }
}
