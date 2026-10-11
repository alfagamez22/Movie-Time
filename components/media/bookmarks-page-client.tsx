'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useBookmarks, type BookmarkRecord } from '@/lib/hooks/use-bookmarks';
import { recordToEntry } from '@/lib/media/personal-library';
import { BOOKMARK_STATUSES, BOOKMARK_STATUS_LABELS, getAuthPromptCopy, type AuthPromptReason } from '@/lib/media/user-actions';
import { papiflixExperience, papianimeExperience, papimangaExperience } from '@/lib/media/experience';
import { consumePlaybackReturn } from '@/lib/media/playback-return';
import type { LibraryMediaEntry } from '@/lib/media/types';
import { AuthModal } from '@/components/auth/auth-modal';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { LibraryHeader, LibraryBottomNavigation } from './library-navigation';
import { PersonalTitleCard } from './personal-title-card';
import { MediaDetailsModal } from './media-details-modal';

type Filter = 'all' | 'movie' | 'tv' | 'anime';
export function BookmarksPageClient({ initialBookmarks, initialUserId }: { initialBookmarks: BookmarkRecord[]; initialUserId: string }) {
  const { bookmarks, loading, error, removeBookmark, updateStatus, refetch } = useBookmarks(undefined, initialBookmarks, { initialUserId });
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<LibraryMediaEntry | null>(null);
  const [authReason, setAuthReason] = useState<AuthPromptReason | null>(null);
  const filtered = useMemo(() => bookmarks.filter((item) => {
    const anime = item.mediaProvider === 'anilist' || item.mediaProvider === 'anikoto';
    return filter === 'all' || (filter === 'anime' ? anime : !anime && item.mediaType === filter);
  }), [bookmarks, filter]);
  const experience = selected?.provider === 'mangadex' ? papimangaExperience : selected?.provider === 'tmdb' ? papiflixExperience : papianimeExperience;
  const action = async (id: string, operation: () => Promise<unknown>) => { setPending(id); try { await operation(); } finally { setPending(null); } };
  useEffect(() => {
    const entry = consumePlaybackReturn('papiflix') ?? consumePlaybackReturn('papianime');
    if (!entry) return;
    const timer = setTimeout(() => setSelected(entry), 0); return () => clearTimeout(timer);
  }, []);
  const authCopy = authReason ? getAuthPromptCopy(authReason) : null;
  return <main className="min-h-dvh bg-[#080808] pb-24 text-white">
    <LibraryHeader experience={papiflixExperience} /><LibraryBottomNavigation experience={papiflixExperience} />
    <div className="mx-auto max-w-[1600px] px-5 py-8 md:px-12 md:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">My List</h1>
        <p className="mt-3 text-sm text-zinc-400">Your favorites, plans, and completed titles. {bookmarks.length} saved.</p></div>
        <Link href="/my-papiflix" className="text-sm text-zinc-300 underline hover:text-white">Go to My PapiFlix</Link>
      </div>
      <div className="my-8 flex flex-wrap gap-2">{([['all', 'All titles'], ['movie', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime']] as const).map(([value, label]) =>
        <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full border px-4 text-sm ${filter === value ? 'border-white bg-white font-bold text-black' : 'border-white/25 text-zinc-400 hover:text-white'}`}>{label}</button>)}
      </div>
      {error ? <p role="alert" className="mb-6 text-sm text-red-300">{error} <button type="button" onClick={() => void refetch()} className="font-bold underline">Retry</button></p> : null}
      {loading && !bookmarks.length ? <LoadingIndicator label="Loading My List" /> : !filtered.length ? <div className="py-16 text-center"><h2 className="text-xl font-bold">{bookmarks.length ? 'No titles match this filter' : 'Save something you love'}</h2><p className="mt-3 text-sm text-zinc-500">Add titles from the My List menu in any details panel.</p><Link href="/" className="mt-6 inline-flex rounded bg-white px-5 py-3 text-sm font-bold text-black hover:bg-zinc-300">Browse titles</Link></div> :
        <div className="space-y-10">{BOOKMARK_STATUSES.map((status) => {
          const items = filtered.filter((record) => record.status === status);
          if (!items.length) return null;
          return <section key={status}><h2 className="mb-4 text-xl font-bold">{status === 'favorite' ? 'Favorites' : BOOKMARK_STATUS_LABELS[status]} <span className="ml-2 text-sm font-normal text-zinc-500">{items.length}</span></h2>
            <div className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((record) => {
              const entry = recordToEntry(record); if (!entry) return null;
              return <PersonalTitleCard key={record.id} entry={entry} onSelect={setSelected} status={record.status} pending={pending === record.id}
                onStatusChange={(value) => void action(record.id, () => updateStatus(record.id, value))}
                onRemove={() => void action(record.id, () => removeBookmark(record.id))} />;
            })}</div>
          </section>;
        })}</div>}
    </div>
    <MediaDetailsModal entry={selected} experience={experience} onClose={() => setSelected(null)} onSelectEntry={setSelected} onSignInRequired={setAuthReason} />
    {authCopy ? <AuthModal {...authCopy} onClose={() => setAuthReason(null)} /> : null}
  </main>;
}
