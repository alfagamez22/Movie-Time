'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { AuthModal } from '@/components/auth/auth-modal';
import { UserMenu } from '@/components/auth/user-menu';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { announceLibraryChange, PERSONAL_LIBRARY_CHANGED, useBookmarks } from '@/lib/hooks/use-bookmarks';
import { removeRecentlyWatched } from '@/lib/hooks/use-recently-watched';
import { buildPersonalCollections, EMPTY_PERSONAL_LIBRARY, recordToEntry, recordTitleKey, titleKey, type PersonalLibraryData } from '@/lib/media/personal-library';
import { buildWatchHref } from '@/lib/media/routes';
import { consumePlaybackReturn } from '@/lib/media/playback-return';
import { papiflixExperience, papianimeExperience } from '@/lib/media/experience';
import { getAuthPromptCopy, type AuthPromptReason } from '@/lib/media/user-actions';
import type { LibraryMediaEntry, MediaTrailer } from '@/lib/media/types';
import { buildTombstoneFilter, clearRecentlyWatchedTombstone, readRecentlyWatchedTombstones } from '@/lib/hooks/recently-watched-tombstones';
import { LibraryHeader, LibraryBottomNavigation } from './library-navigation';
import { PersonalTitleCard } from './personal-title-card';
import { MediaDetailsModal } from './media-details-modal';
import { LikeButton } from './like-button';
import { TrailerPlayer } from './trailer-player';

type Filter = 'all' | 'papiflix' | 'papianime';
const sectionNames = [['continue', 'Continue Watching'], ['list', 'My List'], ['liked', 'TV Shows & Movies I Liked'], ['trailers', 'Trailers Watched'], ['again', 'Watch It Again']] as const;
function LibraryRow({ id, title, description, children, empty }: { id: string; title: string; description?: string; children: React.ReactNode[]; empty: string }) {
  const row = useRef<HTMLDivElement>(null);
  return <section id={id} className="scroll-mt-8">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>{description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}</div>
      {children.length > 2 ? <div className="hidden items-center gap-2 sm:flex">{([-1, 1] as const).map((direction) => <button key={direction} type="button" aria-label={`Scroll ${title} ${direction < 0 ? 'left' : 'right'}`} onClick={() => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' })} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">{direction < 0 ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</button>)}</div> : null}
    </div>
    {children.length ? <div ref={row} className="thin-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">{children.map((child, index) => <div key={index} className="w-[min(82vw,300px)] shrink-0 snap-start">{child}</div>)}</div> : <p className="border-l-2 border-zinc-800 py-5 pl-4 text-sm text-zinc-500">{empty}</p>}
  </section>;
}

export function MyPapiFlixPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [state, setState] = useState<{ owner?: string; data: PersonalLibraryData; error: string | null }>({ data: EMPTY_PERSONAL_LIBRARY, error: null });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<LibraryMediaEntry | null>(null);
  const [trailer, setTrailer] = useState<{ entry: LibraryMediaEntry; trailer: MediaTrailer } | null>(null);
  const [authReason, setAuthReason] = useState<AuthPromptReason | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const activeUser = useRef(userId);
  useEffect(() => { activeUser.current = userId; }, [userId]);
  const { removeBookmark, updateStatus, error: bookmarkError } = useBookmarks(undefined, undefined, { load: false });

  const refresh = useCallback(async () => {
    if (!userId) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true);
    try {
      // Flush earlier offline removals before accepting a fresh account snapshot.
      await Promise.all((['papiflix', 'papianime'] as const).map(async (namespace) => {
        await Promise.all(readRecentlyWatchedTombstones(namespace).map(async (tombstone) => {
          const response = await fetch('/api/watch-history/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
            body: JSON.stringify({ mediaId: tombstone.id, mediaProvider: tombstone.provider, mediaType: tombstone.type }) });
          if (response.ok) clearRecentlyWatchedTombstone(tombstone, namespace);
        }));
      }));
      const response = await fetch('/api/my-papiflix', { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
      const data = await response.json();
      if (!response.ok || !['bookmarks', 'history', 'progress', 'likes', 'trailers'].every((key) => Array.isArray(data[key]))) throw new Error(data.error ?? 'Your library could not be loaded.');
      const allowed = buildTombstoneFilter([...readRecentlyWatchedTombstones('papiflix'), ...readRecentlyWatchedTombstones('papianime')]);
      data.history = data.history.filter((record: PersonalLibraryData['history'][number]) => allowed({ id: record.mediaId, provider: record.mediaProvider, type: record.mediaType }));
      if (!request.signal.aborted && activeUser.current === userId) setState({ owner: userId, data, error: null });
    } catch (failure) {
      if (!request.signal.aborted && activeUser.current === userId) setState((current) => ({ ...current, owner: userId, data: current.owner === userId ? current.data : EMPTY_PERSONAL_LIBRARY, error: failure instanceof Error ? failure.message : 'Your library could not be loaded.' }));
    } finally { if (!request.signal.aborted && activeUser.current === userId) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    void refresh();
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.userId === userId) void refresh(); };
    window.addEventListener(PERSONAL_LIBRARY_CHANGED, changed); window.addEventListener('focus', refresh);
    return () => { controller.current?.abort(); window.removeEventListener(PERSONAL_LIBRARY_CHANGED, changed); window.removeEventListener('focus', refresh); };
  }, [refresh, userId]);
  useEffect(() => {
    const entry = consumePlaybackReturn('papiflix') ?? consumePlaybackReturn('papianime');
    if (!entry) return;
    const timer = setTimeout(() => setSelected(entry), 0); return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!trailer) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setTrailer(null); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', close); };
  }, [trailer]);

  const data = userId && state.owner === userId ? state.data : EMPTY_PERSONAL_LIBRARY;
  const filtered = useMemo(() => {
    if (filter === 'all') return data;
    return Object.fromEntries(Object.entries(data).map(([key, records]) => [key, records.filter((record: { experience: string }) => record.experience === filter)])) as unknown as PersonalLibraryData;
  }, [data, filter]);
  const collections = useMemo(() => buildPersonalCollections(filtered), [filtered]);
  const experience = selected?.provider === 'tmdb' ? papiflixExperience : papianimeExperience;
  const removeHistory = async (entry: LibraryMediaEntry) => {
    if (!userId) return;
    const key = titleKey(entry); setPending(key);
    try {
      const response = await fetch('/api/watch-history/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaId: entry.id, mediaProvider: entry.provider, mediaType: entry.type }) });
      if (!response.ok) throw new Error('Could not remove this title. Try again.');
      if (activeUser.current !== userId) return;
      const namespace = entry.provider === 'tmdb' ? 'papiflix' : 'papianime';
      removeRecentlyWatched(entry, namespace, false); clearRecentlyWatchedTombstone(entry, namespace);
      setState((current) => ({ ...current, data: { ...current.data,
        history: current.data.history.filter((item) => recordTitleKey(item) !== key), progress: current.data.progress.filter((item) => recordTitleKey(item) !== key) } }));
      announceLibraryChange(userId);
    } catch (failure) { if (activeUser.current === userId) setState((current) => ({ ...current, error: failure instanceof Error ? failure.message : 'Could not remove this title.' })); }
    finally { setPending(null); }
  };
  const bookmarkAction = async (id: string, action: () => Promise<unknown>) => {
    setPending(id); try { await action(); } finally { setPending(null); }
  };
  const authCopy = authReason ? getAuthPromptCopy(authReason) : null;
  const error = state.owner === userId ? state.error ?? bookmarkError : null;

  return <main className="min-h-dvh bg-[#080808] pb-24 text-white">
    <LibraryHeader experience={papiflixExperience} /><LibraryBottomNavigation experience={papiflixExperience} />
    <div className="mx-auto max-w-[1600px] px-5 py-8 md:px-12 md:py-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4"><div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-netflix-red sm:h-20 sm:w-20">
          {session?.user?.image ? <Image src={session.user.image} alt="" fill sizes="80px" className="object-cover" /> : <UserRound className="h-9 w-9" />}
        </div><div><p className="truncate text-sm text-zinc-400">{session?.user?.name ?? 'Your personal collection'}</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">My PapiFlix</h1><p className="mt-2 text-xs text-zinc-500">Your movies, shows, and anime. All together.</p></div></div>
        <UserMenu onSignInClick={() => setAuthReason('default')} />
      </div>
      {!userId && status !== 'loading' ? <div className="py-16 text-center"><h2 className="text-2xl font-bold">Make it yours.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">Sign in to see your watch history, favorite titles, likes, and watched trailers across PapiFlix and PapiAnime.</p><button type="button" onClick={() => setAuthReason('default')} className="mt-6 rounded bg-netflix-red px-6 py-3 font-bold text-white hover:bg-red-700">Sign in</button></div> : <>
        <div className="mt-8 flex flex-wrap items-center gap-2" aria-label="Library filters">
          {([['all', 'All titles'], ['papiflix', 'PapiFlix'], ['papianime', 'PapiAnime']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full border px-4 text-sm transition ${filter === value ? 'border-white bg-white font-bold text-black' : 'border-white/25 text-zinc-400 hover:text-white'}`}>{label}</button>)}
          <Link href="/bookmarks" className="ml-auto py-2 text-xs text-zinc-400 underline hover:text-white">Manage saved titles</Link>
        </div>
        <nav aria-label="My PapiFlix sections" className="mt-6 flex gap-6 overflow-x-auto border-b border-white/10 pb-4 text-xs text-zinc-400 sm:text-sm">{sectionNames.map(([id, label]) => <a className="whitespace-nowrap hover:text-white" key={id} href={`#${id}`}>{label}</a>)}</nav>
        {error ? <div role="alert" className="mt-6 flex items-center gap-4 rounded border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">{error}<button type="button" onClick={() => void refresh()} className="ml-auto shrink-0 font-bold underline">Retry</button></div> : null}
        {(loading || status === 'loading') && !data.history.length && !data.bookmarks.length && !data.likes.length && !data.trailers.length ? <LoadingIndicator label="Loading your library" /> : <div className="mt-8 space-y-10">
          {loading ? <p role="status" className="text-xs text-zinc-500">Updating your library…</p> : null}
          <LibraryRow id="continue" title="Continue Watching" description="Pick up where you left off. Remove a title to clear its watch history." empty="Start a movie, show, or anime and find it here.">
            {collections.continueWatching.map((entry) => <PersonalTitleCard key={titleKey(entry)} entry={entry} onSelect={setSelected} onRemove={() => void removeHistory(entry)} pending={pending === titleKey(entry)} progressPercent={entry.progressPercent ?? 0}
              episodeLabel={entry.type === 'tv' && entry.episode ? `${entry.provider === 'tmdb' ? `Season ${entry.season || '1'} · ` : ''}Episode ${entry.episode}` : undefined}
              playLabel="Continue" href={buildWatchHref(entry, { episode: entry.episode, season: entry.season, progress: entry.progressPercent && entry.progressPercent >= 95 ? 0 : entry.progressSeconds, language: entry.defaultLanguage })} />)}
          </LibraryRow>
          <LibraryRow id="list" title="My List" description="Your favorites across PapiFlix and PapiAnime." empty="Add favorites from a title’s My List menu.">
            {collections.myList.flatMap((record) => { const entry = recordToEntry(record); return entry ? [<PersonalTitleCard key={record.id} entry={entry} onSelect={setSelected} pending={pending === record.id} onRemove={() => void bookmarkAction(record.id, () => removeBookmark(record.id))} status={record.status} onStatusChange={(value) => void bookmarkAction(record.id, () => updateStatus(record.id, value))} />] : []; })}
          </LibraryRow>
          <LibraryRow id="liked" title="TV Shows & Movies I Liked" description="A thumbs up keeps the titles you enjoyed here." empty="Like a movie, series, or anime from its details panel.">
            {collections.likes.flatMap((record) => { const entry = recordToEntry(record); return entry ? [<PersonalTitleCard key={record.id} entry={entry} onSelect={setSelected} extraAction={<LikeButton entry={entry} initialLiked />} />] : []; })}
          </LibraryRow>
          <LibraryRow id="trailers" title="Trailers Watched" description="Revisit trailers you have played." empty="Play a trailer while signed in and it will appear here.">
            {collections.trailers.flatMap((record) => { const entry = recordToEntry(record); return entry ? [<PersonalTitleCard key={record.id} entry={entry} onSelect={setSelected} artwork={record.trailer.thumbnailUrl} episodeLabel={record.trailer.title} playLabel="Trailer" onPlay={() => setTrailer({ entry, trailer: record.trailer })} />] : []; })}
          </LibraryRow>
          <LibraryRow id="again" title="Watch It Again" description="Finished movies and completed series. Mark a series Completed from My List when you finish it." empty="Completed titles will appear here, ready to restart.">
            {collections.watchAgain.map((entry) => <PersonalTitleCard key={titleKey(entry)} entry={entry} onSelect={setSelected} playLabel="Play again" href={buildWatchHref(entry, { episode: 1, season: 1, progress: 0, language: entry.defaultLanguage })} />)}
          </LibraryRow>
          <LibraryRow id="recent" title="Recently Watched" description="Your recent viewing, including completed titles." empty="Your watch history is empty.">
            {collections.recentlyWatched.map((entry) => <PersonalTitleCard key={titleKey(entry)} entry={entry} onSelect={setSelected} onRemove={() => void removeHistory(entry)} pending={pending === titleKey(entry)} />)}
          </LibraryRow>
        </div>}
      </>}
    </div>
    <MediaDetailsModal entry={selected} experience={experience} onClose={() => setSelected(null)} onSelectEntry={setSelected} onSignInRequired={setAuthReason} recentlyWatched={collections.recentlyWatched} />
    {trailer ? <TrailerPlayer entry={trailer.entry} trailer={trailer.trailer} onClose={() => setTrailer(null)} /> : null}
    {authCopy ? <AuthModal {...authCopy} onClose={() => setAuthReason(null)} /> : null}
  </main>;
}
