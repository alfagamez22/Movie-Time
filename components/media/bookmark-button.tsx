'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import type { LibraryMediaEntry } from '@/lib/media/types';
import type { MediaExperienceConfig } from '@/lib/media/experience';
import { useBookmarks, type BookmarkStatus } from '@/lib/hooks/use-bookmarks';
import { BOOKMARK_STATUSES, BOOKMARK_STATUS_LABELS } from '@/lib/media/user-actions';

export function BookmarkButton({ entry, experience, onSignInRequired }: {
  entry: LibraryMediaEntry; experience: MediaExperienceConfig; onSignInRequired?: () => void;
}) {
  const { data: session } = useSession();
  const { getBookmark, addBookmark, updateStatus, removeBookmark, error } = useBookmarks(experience.id);
  const existing = getBookmark(entry.id, entry.provider, entry.type);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.type === 'scroll' && menu.current?.contains(event.target as Node)) return;
      if (menu.current?.matches(':popover-open')) menu.current.hidePopover();
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
  }, [open]);

  const toggleMenu = () => {
    if (!session?.user?.id) { onSignInRequired?.(); return; }
    if (!menu.current || !trigger.current) return;
    if (menu.current.matches(':popover-open')) { menu.current.hidePopover(); return; }
    const rect = trigger.current.getBoundingClientRect();
    const height = existing ? 196 : 148;
    setPosition({ left: Math.max(12, Math.min(rect.right - 224, window.innerWidth - 236)),
      top: rect.bottom + height + 12 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8) });
    menu.current.showPopover();
    requestAnimationFrame(() => menu.current?.querySelector('button')?.focus());
  };

  const change = async (status?: BookmarkStatus) => {
    if (!session?.user?.id) { onSignInRequired?.(); return; }
    if (menu.current?.matches(':popover-open')) menu.current.hidePopover();
    setPending(true);
    try {
      if (!status && existing) await removeBookmark(existing.id);
      else if (existing && status) await updateStatus(existing.id, status);
      else if (status) await addBookmark({ mediaId: entry.id, mediaType: entry.type, mediaProvider: entry.provider,
        experience: experience.id, title: entry.title, posterUrl: entry.posterUrl, backdropUrl: entry.backdropUrl,
        synopsis: entry.synopsis?.slice(0, 180), rating: entry.rating, year: entry.year, anilistId: entry.anilistId,
        malId: entry.malId, animeFormat: entry.animeFormat, status });
    } finally { setPending(false); trigger.current?.focus(); }
  };

  return <div className="inline-flex flex-col items-start">
    <IconButton ref={trigger} disabled={pending} onClick={toggleMenu}
      label={pending ? 'Saving…' : existing ? `My List · ${BOOKMARK_STATUS_LABELS[existing.status]}` : 'My List'}
      aria-label={existing ? `Bookmarked as ${BOOKMARK_STATUS_LABELS[existing.status]}` : 'Add to My List'}
      aria-expanded={open} aria-controls={id} aria-haspopup="menu"
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition hover:border-white hover:bg-white/10 disabled:opacity-40 ${existing ? 'border-white bg-white/15 text-white' : 'border-white/40 text-zinc-300'}`}>
      {pending ? <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" /> : existing ? <Check aria-hidden="true" className="h-5 w-5" /> : <Plus aria-hidden="true" className="h-5 w-5" />}
    </IconButton>
    {/* The browser's top layer escapes artwork overflow and transformed modal ancestors. */}
    <div ref={menu} id={id} popover="auto" role="menu" aria-label="Bookmark status"
      onToggle={(event) => setOpen(event.newState === 'open')}
      onKeyDown={(event) => {
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}
      style={{ top: position.top, left: position.left, margin: 0, insetInlineEnd: 'auto', bottom: 'auto' }}
      className="fixed max-h-[calc(100dvh-24px)] w-56 max-w-[calc(100vw-24px)] overflow-y-auto rounded-md border border-white/20 bg-[#242424] p-1 text-white shadow-2xl">
      {BOOKMARK_STATUSES.map((status) => <button key={status} role="menuitemradio" aria-checked={existing?.status === status}
        type="button" onClick={() => void change(status)} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm hover:bg-white/15 focus:bg-white/15 focus:outline-none">
        {BOOKMARK_STATUS_LABELS[status]}{existing?.status === status ? <Check className="h-4 w-4" /> : null}
      </button>)}
      {existing ? <button type="button" role="menuitem" onClick={() => void change()} className="flex min-h-11 w-full items-center gap-2 border-t border-white/10 px-3 text-sm text-red-300 hover:bg-white/10"><Trash2 className="h-4 w-4" />Remove bookmark</button> : null}
    </div>
    {error ? <p role="alert" className="mt-2 max-w-64 text-xs text-red-300">{error}</p> : null}
  </div>;
}
