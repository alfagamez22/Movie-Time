'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bookmark, BookmarkCheck, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { LibraryMediaEntry } from '@/lib/media/types';
import type { MediaExperienceConfig } from '@/lib/media/experience';
import { useBookmarks, type BookmarkStatus } from '@/lib/hooks/use-bookmarks';

interface BookmarkButtonProps {
  entry: LibraryMediaEntry;
  experience: MediaExperienceConfig;
  onSignInRequired?: () => void;
}

const STATUS_LABELS: Record<BookmarkStatus, string> = {
  favorite: 'Favorite',
  watched: 'Watched',
  plan_to_watch: 'Plan to Watch',
};

export function BookmarkButton({ entry, experience, onSignInRequired }: BookmarkButtonProps) {
  const { data: session } = useSession();
  const { getBookmark, addBookmark, updateStatus, removeBookmark } = useBookmarks(experience.id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const existing = getBookmark(entry.id, entry.provider, entry.type);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [dropdownOpen]);

  const handleMainClick = useCallback(async () => {
    if (!session?.user) {
      onSignInRequired?.();
      return;
    }
    if (existing) {
      setDropdownOpen((v) => !v);
      return;
    }
    setPendingAction(true);
    try {
      await addBookmark({
        mediaId: entry.id,
        mediaType: entry.type,
        mediaProvider: entry.provider,
        experience: experience.id,
        title: entry.title,
        posterUrl: entry.posterUrl,
        backdropUrl: entry.backdropUrl,
        synopsis: entry.synopsis?.slice(0, 180),
        rating: entry.rating,
        year: entry.year,
        anilistId: entry.anilistId,
        malId: entry.malId,
        animeFormat: entry.animeFormat,
        status: 'favorite',
      });
    } finally {
      setPendingAction(false);
    }
  }, [session?.user, existing, addBookmark, entry, experience.id, onSignInRequired]);

  const handleStatusChange = useCallback(
    async (status: BookmarkStatus) => {
      if (!existing) return;
      setDropdownOpen(false);
      await updateStatus(existing.id, status);
    },
    [existing, updateStatus],
  );

  const handleRemove = useCallback(async () => {
    if (!existing) return;
    setDropdownOpen(false);
    await removeBookmark(existing.id);
  }, [existing, removeBookmark]);

  const isBookmarked = Boolean(existing);
  const currentStatus = existing?.status as BookmarkStatus | undefined;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleMainClick}
        disabled={pendingAction}
        aria-label={isBookmarked ? `Bookmarked as ${STATUS_LABELS[currentStatus ?? 'favorite']}` : 'Add to bookmarks'}
        className={`inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
          isBookmarked
            ? 'border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20'
            : 'border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10'
        }`}
      >
        {isBookmarked ? (
          <BookmarkCheck className="h-4 w-4 shrink-0" />
        ) : (
          <Bookmark className="h-4 w-4 shrink-0" />
        )}
        {isBookmarked ? STATUS_LABELS[currentStatus ?? 'favorite'] : 'Bookmark'}
        {isBookmarked ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
      </button>

      <AnimatePresence>
        {dropdownOpen && existing ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full z-20 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl"
          >
            {(['favorite', 'watched', 'plan_to_watch'] as BookmarkStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void handleStatusChange(status)}
                className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-white/8 ${
                  currentStatus === status ? 'text-amber-400' : 'text-zinc-300'
                }`}
              >
                {STATUS_LABELS[status]}
                {currentStatus === status ? <span className="ml-auto text-amber-400">✓</span> : null}
              </button>
            ))}
            <div className="border-t border-white/8">
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="flex w-full items-center px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                Remove bookmark
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
