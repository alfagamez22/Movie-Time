'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnnouncementDialog } from './announcement-dialog';
import type { PublicAnnouncement } from '@/lib/announcements/validation';

const STORAGE = 'papiflix-dismissed-announcements-v1';
function dismissed(): string[] {
  try { const value = JSON.parse(localStorage.getItem(STORAGE) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(-100) : []; }
  catch { return []; }
}
export function AnnouncementPopup() {
  const [post, setPost] = useState<PublicAnnouncement | null>(null);
  const current = useRef<PublicAnnouncement | null>(null);
  const closedThisVisit = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || closedThisVisit.current) return;
      try {
        const response = await fetch('/api/announcements', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const { posts } = await response.json() as { posts: PublicAnnouncement[] };
        if (!Array.isArray(posts) || closedThisVisit.current || controller.signal.aborted) return;
        const hidden = dismissed();
        const selected = current.current ? posts.find((item) => item.id === current.current?.id) ?? null : posts.find((item) => !hidden.includes(item.id)) ?? null;
        current.current = selected;
        setPost(selected);
      } catch { /* Announcement service failures should not interrupt browsing. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    if (!post) return;
    const expire = () => {
      const remaining = Date.parse(post.expiresAt) - Date.now();
      if (remaining <= 0) { current.current = null; setPost(null); return; }
      timer = window.setTimeout(expire, Math.min(remaining, 2147483647));
    };
    let timer: number;
    expire();
    return () => window.clearTimeout(timer);
  }, [post]);
  const close = useCallback(() => {
    if (current.current) {
      try { localStorage.setItem(STORAGE, JSON.stringify([...dismissed().filter((id) => id !== current.current?.id), current.current.id].slice(-100))); } catch { /* Still close when storage is unavailable. */ }
    }
    closedThisVisit.current = true;
    current.current = null;
    setPost(null);
  }, []);
  return post ? <AnnouncementDialog post={post} onClose={close} /> : null;
}
