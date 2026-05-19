'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'papiflix-player';

export type PlayerChoice = '1' | '2';

export const PLAYER_LABELS: Record<PlayerChoice, string> = {
  '1': 'Vidking',
  '2': 'Videasy',
};

export function usePlayerPreference() {
  // Always start with '1' to match SSR; sync from localStorage after hydration.
  const [player, setPlayerState] = useState<PlayerChoice>('1');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1' || stored === '2') setPlayerState(stored);
  }, []);

  // Sync across tabs / windows
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === '1' || e.newValue === '2')) {
        setPlayerState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPlayer = useCallback((choice: PlayerChoice) => {
    setPlayerState(choice);
    localStorage.setItem(STORAGE_KEY, choice);
  }, []);

  return { player, setPlayer } as const;
}
