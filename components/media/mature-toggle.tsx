'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Lock, Unlock } from 'lucide-react';

import type { LibrarySection } from '@/lib/media/types';

const STORAGE_KEY = 'papiflix-mature-unlocked';
const STORAGE_EVENT = 'papiflix-mature-unlocked-change';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readMatureUnlocked(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeMatureUnlocked(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(STORAGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(STORAGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

function setMatureUnlocked(value: boolean): void {
  if (!isBrowser()) return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    // Storage unavailable - best-effort only.
  }
}

export function useMatureUnlocked(): boolean {
  return useSyncExternalStore(subscribeMatureUnlocked, readMatureUnlocked, getServerSnapshot);
}

export function isMatureSection(section: LibrarySection): boolean {
  return section.tier === 'mature' || section.id === 'vivamax-movies';
}

export function filterMatureSections<T extends LibrarySection>(
  sections: ReadonlyArray<T>,
  unlocked: boolean,
): T[] {
  if (unlocked) return sections.slice();
  return sections.filter((section) => !isMatureSection(section));
}

export function MatureToggle() {
  const unlocked = useMatureUnlocked();
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const handleClick = useCallback(() => {
    if (unlocked) {
      const confirmed = window.confirm('Hide Vivamax sections? You can re-enable them anytime.');
      if (!confirmed) return;
      setMatureUnlocked(false);
    } else {
      const confirmed = window.confirm('Unhide Vivamax sections? This will reveal Vivamax and similar mature Filipino movie rows.');
      if (!confirmed) return;
      setMatureUnlocked(true);
    }
  }, [unlocked]);

  const label = useMemo(() => (unlocked ? 'Click to hide Vivamax sections' : 'Click to reveal Vivamax sections'), [unlocked]);

  if (!isHydrated) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-pressed={unlocked}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        unlocked
          ? 'border-netflix-red bg-netflix-red/15 text-white hover:bg-netflix-red/25'
          : 'border-white/15 bg-white/5 text-zinc-300 hover:border-white/30 hover:text-white'
      }`}
    >
      {unlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      <span>Vivamax</span>
    </button>
  );
}
