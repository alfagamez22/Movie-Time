import { redirect } from 'next/navigation';

import { BookmarksPageClient } from '@/components/media/bookmarks-page-client';
import type { BookmarkRecord } from '@/lib/hooks/use-bookmarks';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isBookmarkStatus } from '@/lib/media/user-actions';

export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/');
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
  });

  const initialBookmarks: BookmarkRecord[] = bookmarks.map((bookmark) => ({
    id: bookmark.id,
    mediaId: bookmark.mediaId,
    mediaType: bookmark.mediaType,
    mediaProvider: bookmark.mediaProvider,
    experience: bookmark.experience,
    title: bookmark.title,
    posterUrl: bookmark.posterUrl,
    backdropUrl: bookmark.backdropUrl,
    synopsis: bookmark.synopsis,
    rating: bookmark.rating,
    year: bookmark.year,
    status: isBookmarkStatus(bookmark.status) ? bookmark.status : 'favorite',
    createdAt: bookmark.createdAt.toISOString(),
    updatedAt: bookmark.updatedAt.toISOString(),
  }));

  return (
    <BookmarksPageClient initialBookmarks={initialBookmarks} />
  );
}