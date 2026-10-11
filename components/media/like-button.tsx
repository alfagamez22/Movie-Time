'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ThumbsUp } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { PERSONAL_LIBRARY_CHANGED, announceLibraryChange } from '@/lib/hooks/use-bookmarks';
import { entryPayload, titleKey } from '@/lib/media/personal-library';
import type { LibraryMediaEntry } from '@/lib/media/types';

export function LikeButton({ entry, initialLiked, onSignInRequired, onChange }: {
  entry: LibraryMediaEntry; initialLiked?: boolean; onSignInRequired?: () => void; onChange?: (liked: boolean) => void;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const key = `${userId ?? 'guest'}:${titleKey(entry)}`;
  const [state, setState] = useState({ key, liked: initialLiked ?? false, ready: initialLiked !== undefined });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liked = state.key === key ? state.liked : initialLiked ?? false;
  const ready = initialLiked !== undefined || (state.key === key && state.ready);
  useEffect(() => {
    if (!userId || initialLiked !== undefined) return;
    const controller = new AbortController();
    const load = () => {
      const params = new URLSearchParams({ mediaId: entry.id, mediaProvider: entry.provider, mediaType: entry.type });
      void fetch(`/api/likes?${params}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('Could not load your like.');
        const data = await response.json();
        if (!controller.signal.aborted) { setState({ key, liked: data.liked === true, ready: true }); setError(null); }
      }).catch(() => { if (!controller.signal.aborted) setError('Could not load your like. Reopen this title to retry.'); });
    };
    load();
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); };
  }, [userId, key, entry.id, entry.provider, entry.type, initialLiked]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.userId === userId && detail.titleKey === titleKey(entry) && typeof detail.liked === 'boolean') setState({ key, liked: detail.liked, ready: true });
    };
    window.addEventListener(PERSONAL_LIBRARY_CHANGED, listener);
    return () => window.removeEventListener(PERSONAL_LIBRARY_CHANGED, listener);
  }, [entry, key, userId]);
  const toggle = async () => {
    if (!userId) { onSignInRequired?.(); return; }
    setPending(true); setError(null);
    try {
      const response = await fetch('/api/likes', { method: liked ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entryPayload(entry)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save your like. Try again.');
      setState({ key, liked: data.liked, ready: true });
      announceLibraryChange(userId, { titleKey: titleKey(entry), liked: data.liked });
      onChange?.(data.liked);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save your like.'); }
    finally { setPending(false); }
  };
  return <div className="inline-flex flex-col items-start">
    <IconButton label={pending ? 'Saving…' : liked ? 'Unlike' : 'Like'} aria-label={liked ? `Unlike ${entry.title}` : `Like ${entry.title}`} aria-pressed={liked}
      disabled={pending || Boolean(userId && !ready)} onClick={() => void toggle()}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition hover:border-white hover:bg-white/10 disabled:opacity-40 ${liked ? 'border-white bg-white/15 text-white' : 'border-white/40 text-zinc-300'}`}>
      <ThumbsUp aria-hidden="true" className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
    </IconButton>
    {error ? <p role="alert" className="mt-2 max-w-52 text-xs text-red-300">{error}</p> : null}
  </div>;
}
