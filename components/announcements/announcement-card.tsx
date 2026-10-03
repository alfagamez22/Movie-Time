'use client';

import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import type { PublicAnnouncement } from '@/lib/announcements/validation';

export function AnnouncementCard({ post, bannerSrc, onClose, preview = false }: { post: PublicAnnouncement; bannerSrc?: string | null; onClose: () => void; preview?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = bannerSrc === undefined ? (post.hasBanner ? `/api/announcements/${post.id}/banner` : null) : bannerSrc;
  return <article className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111111] text-white shadow-2xl">
    <button type="button" onClick={onClose} aria-label={preview ? 'Close announcement preview' : 'Dismiss announcement'} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/70 text-zinc-200 backdrop-blur transition hover:bg-black hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="h-4 w-4" /></button>
    {image && failedImage !== image ? <div className="relative aspect-video max-h-[35dvh] shrink-0 bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" onError={() => setFailedImage(image)} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#111111] to-transparent" />
    </div> : <div className="flex h-28 shrink-0 items-center justify-center bg-gradient-to-br from-red-950 via-zinc-900 to-[#111111]"><Megaphone className="h-10 w-10 text-red-500" /></div>}
    <div className="min-h-0 overflow-y-auto px-6 pb-6 pt-4 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-[0.18em]"><span className="text-red-500">{preview ? 'Announcement preview' : 'What’s new on PapiFlix'}</span><time className="text-zinc-500" dateTime={post.publishAt}>{new Date(post.publishAt).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</time></div>
      <h2 id={preview ? 'announcement-preview-title' : 'announcement-popup-title'} className="mt-3 text-2xl font-black leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{post.title}</h2>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300 [overflow-wrap:anywhere]">{post.description}</p>
      <button type="button" onClick={onClose} className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold transition hover:bg-red-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 motion-reduce:transform-none">{preview ? 'Back to editor' : 'Continue browsing'}</button>
    </div>
  </article>;
}
