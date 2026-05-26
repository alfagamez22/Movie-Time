'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { BookmarkStatus } from '@/lib/media/user-actions';

export type { BookmarkStatus } from '@/lib/media/user-actions';

export interface BookmarkRecord {
  id: string;
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  synopsis: string;
  rating?: number | null;
  year?: number | null;
  status: BookmarkStatus;
  createdAt: string;
  updatedAt: string;
}

interface AddBookmarkPayload {
  mediaId: string;
  mediaType: string;
  mediaProvider: string;
  experience: string;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  synopsis?: string;
  rating?: number;
  year?: number;
  anilistId?: string;
  malId?: string;
  animeFormat?: string;
  status?: BookmarkStatus;
}

const EMPTY_BOOKMARKS: BookmarkRecord[] = [];

export function useBookmarks(experience?: string) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const fetchKey = userId ? `${userId}:${experience ?? 'all'}` : null;
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  const fetchBookmarks = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const url = experience ? `/api/bookmarks?experience=${encodeURIComponent(experience)}` : '/api/bookmarks';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { bookmarks: BookmarkRecord[] };
        setBookmarks(data.bookmarks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, experience]);

  useEffect(() => {
    if (!fetchKey) {
      fetchedRef.current = null;
      return;
    }
    if (fetchedRef.current !== fetchKey) {
      fetchedRef.current = fetchKey;
      void fetchBookmarks();
    }
  }, [fetchKey, fetchBookmarks]);

  const visibleBookmarks = useMemo(
    () => (userId ? bookmarks : EMPTY_BOOKMARKS),
    [bookmarks, userId],
  );

  const getBookmark = useCallback(
    (mediaId: string, provider: string, type: string) =>
      visibleBookmarks.find(
        (b) => b.mediaId === mediaId && b.mediaProvider === provider && b.mediaType === type,
      ) ?? null,
    [visibleBookmarks],
  );

  const addBookmark = useCallback(
    async (payload: AddBookmarkPayload): Promise<BookmarkRecord | null> => {
      if (!userId) return null;

      const optimistic: BookmarkRecord = {
        id: `temp-${Date.now()}`,
        ...payload,
        synopsis: payload.synopsis ?? '',
        status: payload.status ?? 'favorite',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setBookmarks((prev) => {
        const filtered = prev.filter(
          (b) =>
            !(b.mediaId === payload.mediaId &&
              b.mediaProvider === payload.mediaProvider &&
              b.mediaType === payload.mediaType),
        );
        return [optimistic, ...filtered];
      });

      try {
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = (await res.json()) as { bookmark: BookmarkRecord };
          setBookmarks((prev) =>
            prev.map((b) => (b.id === optimistic.id ? data.bookmark : b)),
          );
          return data.bookmark;
        }
      } catch {
        setBookmarks((prev) => prev.filter((b) => b.id !== optimistic.id));
      }
      return null;
    },
    [userId],
  );

  const updateStatus = useCallback(
    async (bookmarkId: string, status: BookmarkStatus): Promise<void> => {
      setBookmarks((prev) =>
        prev.map((b) => (b.id === bookmarkId ? { ...b, status } : b)),
      );
      try {
        await fetch(`/api/bookmarks/${bookmarkId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
      } catch {
        void fetchBookmarks();
      }
    },
    [fetchBookmarks],
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string): Promise<void> => {
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      try {
        await fetch(`/api/bookmarks/${bookmarkId}`, { method: 'DELETE' });
      } catch {
        void fetchBookmarks();
      }
    },
    [fetchBookmarks],
  );

  return { bookmarks: visibleBookmarks, loading, getBookmark, addBookmark, updateStatus, removeBookmark, refetch: fetchBookmarks };
}
