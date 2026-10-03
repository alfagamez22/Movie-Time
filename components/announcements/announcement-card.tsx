'use client';

import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import type { PublicAnnouncement } from '@/lib/announcements/validation';

export function AnnouncementCard({ post, bannerSrc, onClose, preview = false }: { post: PublicAnnouncement; bannerSrc?: string | null; onClose: () => void; preview?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = bannerSrc === undefined ? (post.hasBanner ? `/api/announcements/${post.id}/banner` : null) : bannerSrc;
  return <article className={`relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111111] text-white shadow-2xl ${preview ? 'max-h-[calc(100dvh-6rem)]' : 'max-h-[calc(100dvh-2rem)]'}`}>
    <button type="button" onClick={onClose} aria-label={preview ? 'Close announcement preview' : 'Dismiss announcement'} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/70 text-zinc-200 backdrop-blur transition hover:bg-black hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="h-4 w-4" /></button>
    {image && failedImage !== image ? <div className="relative aspect-video max-h-[25dvh] shrink-0 bg-zinc-900 [@media(max-height:500px)]:max-h-[18dvh]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" onError={() => setFailedImage(image)} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111111] to-transparent" />
    </div> : <div className="flex h-24 max-h-[20dvh] shrink-0 items-center justify-center bg-gradient-to-br from-red-950 via-zinc-900 to-[#111111] [@media(max-height:500px)]:h-14"><Megaphone className="h-8 w-8 text-red-500" /></div>}
    <div className="flex min-h-0 flex-col px-5 pb-5 pt-4 sm:px-8 sm:pb-6 [@media(max-height:500px)]:py-3">
      <div className="shrink-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-[0.18em]"><span className="text-red-500">What’s new on PapiFlix</span><time className="text-zinc-500" dateTime={post.publishAt}>{new Date(post.publishAt).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</time></div>
        <h2 id={preview ? 'announcement-preview-title' : 'announcement-popup-title'} tabIndex={0} aria-label="Announcement title" className="mt-3 max-h-24 overflow-y-auto text-2xl font-black leading-tight tracking-tight outline-none [overflow-wrap:anywhere] [scrollbar-color:#52525b_transparent] [scrollbar-width:thin] focus-visible:rounded focus-visible:ring-1 focus-visible:ring-white/30 sm:text-3xl [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:max-h-12">{post.title}</h2>
      </div>
      <div role="region" aria-label="Announcement content. Scroll to read more." tabIndex={0} className="mt-4 min-h-0 max-h-60 overflow-y-auto overscroll-contain pr-2 text-sm leading-7 text-zinc-300 outline-none [scrollbar-color:#52525b_transparent] [scrollbar-width:thin] focus-visible:rounded focus-visible:ring-1 focus-visible:ring-white/30 [@media(max-height:500px)]:mt-3">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{post.description}</p>
      </div>
      <button type="button" onClick={onClose} className="mt-5 inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold transition hover:bg-red-500 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 motion-reduce:transform-none [@media(max-height:500px)]:mt-3">Continue browsing</button>
    </div>
  </article>;
}
