'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bookmark, Play, Trash2 } from 'lucide-react';

import { useBookmarks, type BookmarkRecord, type BookmarkStatus } from '@/lib/hooks/use-bookmarks';
import { buildWatchHref } from '@/lib/media/routes';
import { BOOKMARK_STATUSES, BOOKMARK_STATUS_LABELS } from '@/lib/media/user-actions';
import type { MediaProvider, MediaType } from '@/lib/media/types';

type BookmarkKindFilter = 'all' | 'anime' | 'movie' | 'tv';

interface BookmarksPageClientProps {
  initialBookmarks: BookmarkRecord[];
}

function isMediaProvider(value: string): value is MediaProvider {
  return value === 'tmdb' || value === 'anilist' || value === 'anikoto';
}

function isMediaType(value: string): value is MediaType {
  return value === 'movie' || value === 'tv';
}

function isAnimeBookmark(bookmark: BookmarkRecord): boolean {
  return bookmark.mediaProvider === 'anilist' || bookmark.mediaProvider === 'anikoto';
}

function getExperienceLabel(experience: string): string {
  if (experience === 'papianime') return 'PapiAnime';
  if (experience === 'papimanga') return 'PapiManga';
  return 'PapiFlix';
}

function getKindLabel(bookmark: BookmarkRecord): string {
  if (isAnimeBookmark(bookmark)) {
    return bookmark.mediaType === 'movie' ? 'Anime Movie' : 'Anime Series';
  }

  return bookmark.mediaType === 'movie' ? 'Movie' : 'TV Series';
}

function getWatchHref(bookmark: BookmarkRecord): string | null {
  if (!isMediaProvider(bookmark.mediaProvider) || !isMediaType(bookmark.mediaType)) {
    return null;
  }

  return buildWatchHref({
    id: bookmark.mediaId,
    provider: bookmark.mediaProvider,
    title: bookmark.title,
    type: bookmark.mediaType,
  });
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function matchesFilter(bookmark: BookmarkRecord, filter: BookmarkKindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'anime') return isAnimeBookmark(bookmark);
  if (filter === 'movie') return bookmark.mediaType === 'movie' && !isAnimeBookmark(bookmark);
  return bookmark.mediaType === 'tv' && !isAnimeBookmark(bookmark);
}

export function BookmarksPageClient({ initialBookmarks }: BookmarksPageClientProps) {
  const router = useRouter();
  const { bookmarks, loading, removeBookmark, updateStatus } = useBookmarks(undefined, initialBookmarks);
  const [activeFilter, setActiveFilter] = useState<BookmarkKindFilter>('all');
  const [pendingBookmarkId, setPendingBookmarkId] = useState<string | null>(null);

  const filterCounts = useMemo(() => {
    return {
      all: bookmarks.length,
      anime: bookmarks.filter((bookmark) => matchesFilter(bookmark, 'anime')).length,
      movie: bookmarks.filter((bookmark) => matchesFilter(bookmark, 'movie')).length,
      tv: bookmarks.filter((bookmark) => matchesFilter(bookmark, 'tv')).length,
    } satisfies Record<BookmarkKindFilter, number>;
  }, [bookmarks]);

  const filteredBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => matchesFilter(bookmark, activeFilter)),
    [activeFilter, bookmarks],
  );

  const groupedBookmarks = useMemo(
    () =>
      BOOKMARK_STATUSES.map((status) => ({
        items: filteredBookmarks.filter((bookmark) => bookmark.status === status),
        status,
      })).filter((group) => group.items.length > 0),
    [filteredBookmarks],
  );

  const handleStatusChange = async (bookmarkId: string, status: BookmarkStatus) => {
    setPendingBookmarkId(bookmarkId);
    try {
      await updateStatus(bookmarkId, status);
    } finally {
      setPendingBookmarkId((current) => (current === bookmarkId ? null : current));
    }
  };

  const handleRemove = async (bookmarkId: string) => {
    setPendingBookmarkId(bookmarkId);
    try {
      await removeBookmark(bookmarkId);
    } finally {
      setPendingBookmarkId((current) => (current === bookmarkId ? null : current));
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(229,9,20,0.14),transparent_24%),linear-gradient(180deg,#080808_0%,#050505_32%,#040404_100%)] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 md:px-12 md:py-12">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-6">
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-300">
                  <Bookmark className="h-3.5 w-3.5" />
                  My List
                </span>
                <div className="mt-4 max-w-2xl space-y-3">
                  <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">Bookmarks</h1>
                  <p className="text-sm leading-relaxed text-zinc-400 sm:text-base">
                    Your saved movies, series, and anime across PapiFlix and PapiAnime in one place.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid min-w-[14rem] gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Saved Titles</p>
                <p className="mt-2 text-3xl font-black text-white">{bookmarks.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Visible Now</p>
                <p className="mt-2 text-3xl font-black text-white">{filteredBookmarks.length}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {([
              ['all', 'All'],
              ['movie', 'Movies'],
              ['tv', 'TV'],
              ['anime', 'Anime'],
            ] as const).map(([filter, label]) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-white/30 bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.08)]'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? 'bg-black/10 text-black' : 'bg-white/10 text-zinc-300'}`}>
                    {filterCounts[filter]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-12 text-center shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-sm">
            <h2 className="text-xl font-bold text-white">No bookmarks yet</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Save titles from any details panel and they will appear here.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              Browse titles
            </Link>
          </div>
        ) : groupedBookmarks.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.03] px-6 py-12 text-center shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-sm">
            <h2 className="text-xl font-bold text-white">No matches for this filter</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Try another filter to see more saved titles.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-12">
            {groupedBookmarks.map((group) => (
              <section key={group.status} className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white sm:text-2xl">{BOOKMARK_STATUS_LABELS[group.status]}</h2>
                    <p className="text-sm text-zinc-500">
                      {group.items.length} saved {group.items.length === 1 ? 'title' : 'titles'}
                    </p>
                  </div>
                  {loading ? <p className="text-sm text-zinc-500">Refreshing…</p> : null}
                </div>

                <div className="grid gap-5 lg:grid-cols-1 2xl:grid-cols-2">
                  {group.items.map((bookmark) => {
                    const watchHref = getWatchHref(bookmark);
                    const isPending = pendingBookmarkId === bookmark.id;

                    return (
                      <article
                        key={bookmark.id}
                        className="group overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c0c0f] shadow-[0_24px_70px_rgba(0,0,0,0.38)] transition-colors hover:border-white/16"
                      >
                        <div className="relative overflow-hidden">
                          {bookmark.backdropUrl ? (
                            <div className="absolute inset-x-0 top-0 h-32 opacity-50">
                              <Image
                                src={bookmark.backdropUrl}
                                alt=""
                                fill
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-black/25 to-[#0c0c0f]" />
                            </div>
                          ) : (
                            <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(229,9,20,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
                          )}

                          <div className="relative grid gap-4 p-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:p-6">
                            <div className="relative aspect-[2/3] w-28 overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10 shadow-[0_18px_45px_rgba(0,0,0,0.32)] sm:w-[8.5rem]">
                            {bookmark.posterUrl ? (
                              <Image
                                src={bookmark.posterUrl}
                                alt={bookmark.title}
                                fill
                                sizes="(max-width: 640px) 112px, 136px"
                                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-zinc-900 px-2 text-center text-xs font-semibold text-zinc-500">
                                {bookmark.title}
                              </div>
                            )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col">
                              <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                                  {getExperienceLabel(bookmark.experience)}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                                  {getKindLabel(bookmark)}
                                </span>
                              </div>

                              <h3 className="mt-4 line-clamp-2 text-2xl font-black leading-tight tracking-tight text-white sm:text-[1.9rem]">
                                {bookmark.title}
                              </h3>

                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                                {bookmark.year ? <span>{bookmark.year}</span> : null}
                                {typeof bookmark.rating === 'number' ? (
                                  <span className="font-semibold text-amber-400">* {bookmark.rating.toFixed(1)}</span>
                                ) : null}
                                <span>Updated {formatUpdatedAt(bookmark.updatedAt)}</span>
                              </div>

                              {bookmark.synopsis ? (
                                <p className="mt-4 max-w-2xl line-clamp-4 text-sm leading-relaxed text-zinc-300 sm:text-[0.95rem]">
                                  {bookmark.synopsis}
                                </p>
                              ) : null}

                              <div className="mt-auto flex flex-col gap-4 pt-6 lg:flex-row lg:items-end lg:justify-between">
                                <div className="flex min-w-0 flex-col gap-2 lg:max-w-xs">
                                  <label htmlFor={`bookmark-status-${bookmark.id}`} className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                    Status
                                  </label>
                                  <select
                                    id={`bookmark-status-${bookmark.id}`}
                                    value={bookmark.status}
                                    disabled={isPending}
                                    onChange={(event) => void handleStatusChange(bookmark.id, event.target.value as BookmarkStatus)}
                                    className="min-w-0 rounded-full border border-white/12 bg-[#111214] px-4 py-3 text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-white/30 disabled:opacity-50"
                                  >
                                    {BOOKMARK_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {BOOKMARK_STATUS_LABELS[status]}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {watchHref ? (
                                    <Link
                                      href={watchHref}
                                      className="inline-flex items-center gap-2 rounded-full bg-netflix-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#f01420]"
                                    >
                                      <Play className="h-4 w-4 fill-current" />
                                      Watch now
                                    </Link>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => void handleRemove(bookmark.id)}
                                    className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/8 px-5 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/14 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}