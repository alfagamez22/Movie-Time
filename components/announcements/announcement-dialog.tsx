'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnnouncementCard } from './announcement-card';
import type { PublicAnnouncement } from '@/lib/announcements/validation';

export function AnnouncementDialog({ post, onClose, preview = false, bannerSrc, previewBackground = 'home' }: { post: PublicAnnouncement; onClose: () => void; preview?: boolean; bannerSrc?: string | null; previewBackground?: 'home' | 'dashboard' }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = [...(root.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') ?? [])];
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div ref={root} role="dialog" aria-modal="true" aria-labelledby={preview ? 'announcement-preview-title' : 'announcement-popup-title'} className={`fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4 ${preview ? 'pt-16' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {preview && previewBackground === 'home' ? <iframe src="/?announcement-preview=1" title="Visitor homepage preview background" aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-zinc-950" /> : null}
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/75 backdrop-blur-sm" />
    {preview ? <div className="absolute inset-x-4 top-3 z-10 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs text-zinc-400"><span>Preview · {previewBackground === 'home' ? 'Visitor homepage' : 'Admin dashboard'} · not published</span><button type="button" onClick={onClose} className="shrink-0 rounded px-2 py-1 font-semibold text-white transition hover:bg-white/10">Back to editor</button></div> : null}
    <AnnouncementCard post={post} bannerSrc={bannerSrc} onClose={onClose} preview={preview} />
  </div>, document.body);
}
