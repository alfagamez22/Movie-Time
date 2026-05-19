'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'papiflix-player';
const PLAYER_CHANGE_EVENT = 'papiflix-player-change';

export type PlayerChoice = '1' | '2';

export const PLAYER_LABELS: Record<PlayerChoice, string> = {
  '1': 'Vidking',
  '2': 'Videasy',
};

function normalizePlayerChoice(value: string | null): PlayerChoice {
  return value === '2' ? '2' : '1';
}

function getPlayerSnapshot(): PlayerChoice {
  return normalizePlayerChoice(localStorage.getItem(STORAGE_KEY));
}

function getServerPlayerSnapshot(): PlayerChoice {
  return '1';
}

function subscribePlayerPreference(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const onLocalChange = () => onStoreChange();

  window.addEventListener('storage', onStorage);
  window.addEventListener(PLAYER_CHANGE_EVENT, onLocalChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PLAYER_CHANGE_EVENT, onLocalChange);
  };
}

export function usePlayerPreference() {
  const player = useSyncExternalStore(
    subscribePlayerPreference,
    getPlayerSnapshot,
    getServerPlayerSnapshot,
  );

  const setPlayer = useCallback((choice: PlayerChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    window.dispatchEvent(new Event(PLAYER_CHANGE_EVENT));
  }, []);

  return { player, setPlayer } as const;
}
