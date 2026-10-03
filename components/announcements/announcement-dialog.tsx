'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnnouncementCard } from './announcement-card';
import type { PublicAnnouncement } from '@/lib/announcements/validation';

export function AnnouncementDialog({ post, onClose, preview = false, bannerSrc }: { post: PublicAnnouncement; onClose: () => void; preview?: boolean; bannerSrc?: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div ref={root} role="dialog" aria-modal="true" aria-labelledby={preview ? 'announcement-preview-title' : 'announcement-popup-title'} className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <AnnouncementCard post={post} bannerSrc={bannerSrc} onClose={onClose} preview={preview} />
  </div>, document.body);
}
