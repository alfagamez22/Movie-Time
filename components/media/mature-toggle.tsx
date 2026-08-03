'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Lock } from 'lucide-react';

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
    setMatureUnlocked(!unlocked);
  }, [unlocked]);

  const label = unlocked ? 'Hide VMX sections' : 'Reveal VMX sections';

  if (!isHydrated) {
    return null;
  }

  return (
    <button
      type="button"
      role="switch"
      onClick={handleClick}
      title={label}
      aria-label={label}
      aria-checked={unlocked}
      className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 py-1 pl-2.5 pr-1 text-xs font-semibold text-zinc-200 backdrop-blur-sm transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Lock className={`h-3.5 w-3.5 transition-colors ${unlocked ? 'text-netflix-red' : 'text-zinc-400'}`} />
      <span className="tracking-[0.12em]">VMX</span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
          unlocked ? 'bg-netflix-red' : 'bg-zinc-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            unlocked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
