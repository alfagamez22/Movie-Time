import { redirect } from 'next/navigation';

import { BookmarksPageClient } from '@/components/media/bookmarks-page-client';
import type { BookmarkRecord } from '@/lib/hooks/use-bookmarks';
import { auth } from '@/lib/auth';
import { findRecords, type AppRecord } from '@/lib/db/records';
import { isBookmarkStatus } from '@/lib/media/user-actions';

export const dynamic = 'force-dynamic';

type BookmarkSource = AppRecord & {
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  synopsis: string;
  rating: number | null;
  year: number | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export default async function BookmarksPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/');
  }

  const bookmarks = await findRecords<BookmarkSource>('bookmark', { userId: session.user.id }, { orderBy: 'updatedAt' });

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
    createdAt: new Date(bookmark.createdAt as string | Date).toISOString(),
    updatedAt: new Date(bookmark.updatedAt as string | Date).toISOString(),
  }));

  return (
    <BookmarksPageClient initialBookmarks={initialBookmarks} />
  );
}
