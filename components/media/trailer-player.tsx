'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { X } from 'lucide-react';
import { announceLibraryChange } from '@/lib/hooks/use-bookmarks';
import { entryPayload } from '@/lib/media/personal-library';
import { loadYouTubePlayer, type YouTubePlayer } from '@/lib/media/youtube-player';
import type { LibraryMediaEntry, MediaTrailer } from '@/lib/media/types';

export function TrailerPlayer({ onClose, trailer, entry }: { onClose: () => void; trailer: MediaTrailer; entry: LibraryMediaEntry }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(onClose);
  const [error, setError] = useState<string | null>(null);
  const fallbackUrl = trailer.embedUrl ?? (trailer.url.includes('/embed/') ? trailer.url : null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button, a[href], iframe');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => {
    if (!trailer.youtubeId || !host.current) return;
    let disposed = false;
    let player: YouTubePlayer | undefined;
    let saved = false;
    let saving = false;
    const controller = new AbortController();
    const mount = document.createElement('div');
    host.current.appendChild(mount);
    void loadYouTubePlayer().then((api) => {
      if (disposed) return;
      player = new api.Player(mount, {
        host: 'https://www.youtube-nocookie.com', videoId: trailer.youtubeId!, width: '100%', height: '100%',
        playerVars: { origin: window.location.origin, rel: 0, playsinline: 1 },
        events: {
          onReady: ({ target }) => {
            target.getIframe().title = `${trailer.title} trailer`;
            target.getIframe().referrerPolicy = 'strict-origin-when-cross-origin';
          },
          onError: () => { if (!disposed) setError('This trailer is unavailable in the embedded player. Open the original trailer below.'); },
          onStateChange: ({ data }) => {
            // Loading or opening a trailer is not a watched event. Record the first PLAYING event.
            if (data !== 1 || saved || saving || !userId || disposed) return;
            saving = true;
            void fetch('/api/trailer-history', { method: 'POST', signal: controller.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...entryPayload(entry), trailer: { title: trailer.title, youtubeId: trailer.youtubeId } }),
            }).then((response) => {
              if (!response.ok) throw new Error('Trailer history could not be saved.');
              saved = true; announceLibraryChange(userId); setError(null);
            }).catch(() => { if (!disposed) setError('Your trailer history could not be saved. Play the trailer again to retry.'); })
              .finally(() => { saving = false; });
          },
        },
      });
    }).catch(() => { if (!disposed) setError('The trailer player could not load. Open the trailer on YouTube below.'); });
    return () => { disposed = true; controller.abort(); player?.destroy(); mount.remove(); };
  }, [entry, trailer, userId]);

  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label={`${entry.title} trailer player`}
    className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="relative w-full max-w-4xl rounded-md border border-white/10 bg-black shadow-2xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3"><p className="truncate text-sm font-bold">{trailer.title}</p>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close trailer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
      </div>
      <div className="aspect-video min-h-[200px] w-full bg-black">
        {trailer.youtubeId ? <div ref={host} className="h-full w-full" /> : fallbackUrl ? <iframe src={fallbackUrl} title={`${trailer.title} trailer`} className="h-full w-full border-0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p className="p-5 text-zinc-400">This trailer cannot be embedded.</p>}
      </div>
      {error ? <p role="alert" className="px-4 pt-3 text-sm text-red-300">{error}</p> : null}
      <a href={trailer.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 text-xs text-zinc-400 underline hover:text-white">Open original trailer</a>
    </div>
  </div>, document.body);
}
