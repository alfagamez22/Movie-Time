'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Bookmark, BookmarkCheck, Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { LibraryMediaEntry } from '@/lib/media/types';
import type { MediaExperienceConfig } from '@/lib/media/experience';
import { useBookmarks, type BookmarkStatus } from '@/lib/hooks/use-bookmarks';
import { BOOKMARK_STATUSES, BOOKMARK_STATUS_LABELS } from '@/lib/media/user-actions';

interface BookmarkButtonProps {
  entry: LibraryMediaEntry;
  experience: MediaExperienceConfig;
  onSignInRequired?: () => void;
}

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

  const requireSignIn = useCallback(() => {
    setDropdownOpen(false);
    onSignInRequired?.();
  }, [onSignInRequired]);

  const addEntryBookmark = useCallback(
    async (status: BookmarkStatus) => {
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
          status,
        });
      } finally {
        setPendingAction(false);
      }
    },
    [addBookmark, entry, experience.id],
  );

  const handleMainClick = useCallback(async () => {
    if (!session?.user) {
      requireSignIn();
      return;
    }

    if (existing) {
      setDropdownOpen((v) => !v);
      return;
    }

    await addEntryBookmark('favorite');
  }, [session?.user, existing, requireSignIn, addEntryBookmark]);

  const handleDropdownClick = useCallback(() => {
    if (!session?.user) {
      requireSignIn();
      return;
    }
    setDropdownOpen((v) => !v);
  }, [session?.user, requireSignIn]);

  const handleStatusChange = useCallback(
    async (status: BookmarkStatus) => {
      if (!session?.user) {
        requireSignIn();
        return;
      }

      setDropdownOpen(false);
      if (existing) {
        await updateStatus(existing.id, status);
        return;
      }

      await addEntryBookmark(status);
    },
    [session?.user, existing, updateStatus, addEntryBookmark, requireSignIn],
  );

  const handleRemove = useCallback(async () => {
    if (!existing) return;
    setDropdownOpen(false);
    await removeBookmark(existing.id);
  }, [existing, removeBookmark]);

  const isBookmarked = Boolean(existing);
  const currentStatus = existing?.status as BookmarkStatus | undefined;
  const mainLabel = isBookmarked ? BOOKMARK_STATUS_LABELS[currentStatus ?? 'favorite'] : 'Bookmark';
  const actionTone = isBookmarked
    ? 'border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20'
    : 'border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10';

  return (
    <div ref={dropdownRef} className="relative inline-flex">
      <button
        type="button"
        onClick={handleMainClick}
        disabled={pendingAction}
        aria-label={isBookmarked ? `Bookmarked as ${mainLabel}` : 'Add to bookmarks'}
        className={`inline-flex items-center gap-2 rounded-l-md border border-r-0 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${actionTone}`}
      >
        {isBookmarked ? (
          <BookmarkCheck className="h-4 w-4 shrink-0" />
        ) : (
          <Bookmark className="h-4 w-4 shrink-0" />
        )}
        {mainLabel}
      </button>
      <button
        type="button"
        onClick={handleDropdownClick}
        disabled={pendingAction}
        aria-label="Choose bookmark status"
        aria-expanded={dropdownOpen}
        className={`inline-flex items-center justify-center rounded-r-md border px-2.5 py-2.5 transition-colors disabled:opacity-50 ${actionTone}`}
      >
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-80 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {dropdownOpen && session?.user ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.1 }}
            className="absolute left-0 top-full z-20 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl"
          >
            {BOOKMARK_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void handleStatusChange(status)}
                className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-white/8 ${
                  currentStatus === status ? 'text-amber-400' : 'text-zinc-300'
                }`}
              >
                {BOOKMARK_STATUS_LABELS[status]}
                {currentStatus === status ? <Check className="ml-auto h-4 w-4 text-amber-400" /> : null}
              </button>
            ))}
            {existing ? (
              <div className="border-t border-white/8">
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  className="flex w-full items-center px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                  Remove bookmark
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
