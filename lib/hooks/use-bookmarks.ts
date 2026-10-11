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
  anilistId?: string | null;
  malId?: string | null;
  animeFormat?: string | null;
  status: BookmarkStatus;
  createdAt: string;
  updatedAt: string;
}

interface AddBookmarkPayload extends Omit<BookmarkRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'synopsis'> {
  synopsis?: string;
  status?: BookmarkStatus;
}
const EMPTY_BOOKMARKS: BookmarkRecord[] = [];
export const PERSONAL_LIBRARY_CHANGED = 'papiflix-personal-library-changed';
const reads = new Map<string, Promise<BookmarkRecord[]>>();

export function announceLibraryChange(userId: string, extra: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent(PERSONAL_LIBRARY_CHANGED, { detail: { ...extra, userId } }));
}

export function useBookmarks(experience?: string, initialBookmarks: BookmarkRecord[] = EMPTY_BOOKMARKS,
  { initialUserId, load = true }: { initialUserId?: string; load?: boolean } = {}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const fetchKey = userId ? `${userId}:${experience ?? 'all'}` : null;
  const activeKey = useRef(fetchKey);
  useEffect(() => { activeKey.current = fetchKey; }, [fetchKey]);
  const [state, setState] = useState({ owner: initialUserId ? `${initialUserId}:${experience ?? 'all'}` : fetchKey, bookmarks: initialBookmarks });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  const fetchBookmarks = useCallback(async () => {
    if (!fetchKey) return;
    const requestId = ++sequence.current;
    setLoading(true);
    const url = experience ? `/api/bookmarks?experience=${encodeURIComponent(experience)}` : '/api/bookmarks';
    try {
      let pending = reads.get(fetchKey);
      if (!pending) {
        pending = fetch(url, { cache: 'no-store' }).then(async (response) => {
          if (!response.ok) throw new Error('Could not load My List. Try again.');
          const data = await response.json();
          if (!Array.isArray(data.bookmarks)) throw new Error('Could not load My List.');
          return data.bookmarks as BookmarkRecord[];
        });
        reads.set(fetchKey, pending);
        void pending.finally(() => { if (reads.get(fetchKey) === pending) reads.delete(fetchKey); }).catch(() => undefined);
      }
      const bookmarks = await pending;
      if (activeKey.current === fetchKey && requestId === sequence.current) {
        setState({ owner: fetchKey, bookmarks });
        setError(null);
      }
    } catch (failure) {
      if (activeKey.current === fetchKey && requestId === sequence.current) setError(failure instanceof Error ? failure.message : 'My List is unavailable.');
    } finally {
      if (activeKey.current === fetchKey && requestId === sequence.current) setLoading(false);
    }
  }, [experience, fetchKey]);

  useEffect(() => {
    if (!fetchKey || !load) return;
    const timer = window.setTimeout(() => void fetchBookmarks(), 0);
    const onChange = (event: Event) => {
      if ((event as CustomEvent).detail?.userId === userId) void fetchBookmarks();
    };
    window.addEventListener(PERSONAL_LIBRARY_CHANGED, onChange);
    window.addEventListener('focus', fetchBookmarks);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PERSONAL_LIBRARY_CHANGED, onChange);
      window.removeEventListener('focus', fetchBookmarks);
    };
  }, [fetchKey, fetchBookmarks, userId, load]);

  const bookmarks = useMemo(() => fetchKey && state.owner === fetchKey ? state.bookmarks : EMPTY_BOOKMARKS, [fetchKey, state]);
  const getBookmark = useCallback((mediaId: string, provider: string, type: string) =>
    bookmarks.find((item) => item.mediaId === mediaId && item.mediaProvider === provider && item.mediaType === type) ?? null, [bookmarks]);

  // Commit the UI only after the server accepts the action. Every mounted list then refreshes.
  const mutate = useCallback(async (url: string, method: string, body?: unknown) => {
    if (!userId || !fetchKey) return null;
    setError(null);
    ++sequence.current;
    setLoading(false);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save your change. Try again.');
      if (activeKey.current === fetchKey) {
        reads.delete(fetchKey);
        announceLibraryChange(userId);
      }
      return data;
    } catch (failure) {
      if (activeKey.current === fetchKey) setError(failure instanceof Error ? failure.message : 'Could not save your change. Try again.');
      return null;
    }
  }, [fetchKey, userId]);

  const addBookmark = useCallback(async (payload: AddBookmarkPayload): Promise<BookmarkRecord | null> => {
    const data = await mutate('/api/bookmarks', 'POST', payload);
    if (data?.bookmark && activeKey.current === fetchKey) setState((current) => ({ owner: fetchKey, bookmarks: [data.bookmark, ...current.bookmarks.filter((item) => item.id !== data.bookmark.id)] }));
    return data?.bookmark ?? null;
  }, [fetchKey, mutate]);
  const updateStatus = useCallback(async (id: string, status: BookmarkStatus) => {
    const data = await mutate(`/api/bookmarks/${encodeURIComponent(id)}`, 'PATCH', { status });
    if (data && activeKey.current === fetchKey) setState((current) => ({ ...current, bookmarks: current.bookmarks.map((item) => item.id === id ? { ...item, status } : item) }));
    return Boolean(data);
  }, [fetchKey, mutate]);
  const removeBookmark = useCallback(async (id: string) => {
    const data = await mutate(`/api/bookmarks/${encodeURIComponent(id)}`, 'DELETE');
    if (data && activeKey.current === fetchKey) setState((current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== id) }));
    return Boolean(data);
  }, [fetchKey, mutate]);
  return { bookmarks, loading, error, getBookmark, addBookmark, updateStatus, removeBookmark, refetch: fetchBookmarks };
}
