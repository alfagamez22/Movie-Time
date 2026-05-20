'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'papiflix-player';
const PLAYER_CHANGE_EVENT = 'papiflix-player-change';

export type PlayerChoice = '1' | '2';

export const PLAYER_LABELS: Record<PlayerChoice, string> = {
  '1': 'Videasy',
  '2': 'Vidking',
};

let memoryPlayerChoice: PlayerChoice | null = null;

function normalizePlayerChoice(value: string | null): PlayerChoice {
  return value === '2' ? '2' : '1';
}

function getPlayerSnapshot(): PlayerChoice {
  if (memoryPlayerChoice) {
    return memoryPlayerChoice;
  }

  try {
    memoryPlayerChoice = normalizePlayerChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be full or unavailable; keep the current tab usable.
  }

  return memoryPlayerChoice ?? '1';
}

function getServerPlayerSnapshot(): PlayerChoice {
  return '1';
}

function subscribePlayerPreference(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memoryPlayerChoice = normalizePlayerChoice(event.newValue);
      onStoreChange();
    }
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
    memoryPlayerChoice = choice;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // If storage is full, the selection still applies for this session.
    }
    window.dispatchEvent(new Event(PLAYER_CHANGE_EVENT));
  }, []);

  return { player, setPlayer } as const;
}
