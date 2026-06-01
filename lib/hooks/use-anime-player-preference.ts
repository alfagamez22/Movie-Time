'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { ANIME_PLAYERS, DEFAULT_ANIME_PLAYER, isAnimePlayerId, type AnimePlayerId } from '@/lib/anime/player-metadata';

const PLAYER_STORAGE_KEY = 'papianime-player';
const PLAYER_CHANGE_EVENT = 'papianime-player-change';
const PLAYER_STORAGE_VERSION = '1';
const PLAYER_STORAGE_VERSION_KEY = 'papianime-player-version';

interface PlayerStore {
  changeEvent: string;
  memoryValue: AnimePlayerId | null;
  storageKey: string;
  versionKey: string;
  version: string;
}

const playerStore: PlayerStore = {
  changeEvent: PLAYER_CHANGE_EVENT,
  memoryValue: null,
  storageKey: PLAYER_STORAGE_KEY,
  version: PLAYER_STORAGE_VERSION,
  versionKey: PLAYER_STORAGE_VERSION_KEY,
};

function getSnapshot(): AnimePlayerId {
  if (playerStore.memoryValue) {
    return playerStore.memoryValue;
  }

  try {
    const stored = localStorage.getItem(playerStore.storageKey);
    const storedVersion = localStorage.getItem(playerStore.versionKey);
    const candidate = isAnimePlayerId(stored) ? stored : null;

    if (storedVersion === playerStore.version && candidate) {
      playerStore.memoryValue = candidate;
      return candidate;
    }

    // First run or version mismatch — write defaults so future reads are stable.
    playerStore.memoryValue = DEFAULT_ANIME_PLAYER;
    localStorage.setItem(playerStore.storageKey, DEFAULT_ANIME_PLAYER);
    localStorage.setItem(playerStore.versionKey, playerStore.version);
    return DEFAULT_ANIME_PLAYER;
  } catch {
    return DEFAULT_ANIME_PLAYER;
  }
}

function getServerSnapshot(): AnimePlayerId {
  return DEFAULT_ANIME_PLAYER;
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === playerStore.storageKey) {
      playerStore.memoryValue = isAnimePlayerId(event.newValue) ? event.newValue : DEFAULT_ANIME_PLAYER;
      onStoreChange();
    }
  };
  const onLocalChange = () => onStoreChange();

  window.addEventListener('storage', onStorage);
  window.addEventListener(playerStore.changeEvent, onLocalChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(playerStore.changeEvent, onLocalChange);
  };
}

function persist(player: AnimePlayerId) {
  playerStore.memoryValue = player;
  try {
    localStorage.setItem(playerStore.storageKey, player);
    localStorage.setItem(playerStore.versionKey, playerStore.version);
  } catch {
    // Storage may be full or unavailable — selection still applies for this tab.
  }
  window.dispatchEvent(new Event(playerStore.changeEvent));
}

export function useAnimePlayerPreference() {
  const player = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPlayer = useCallback((next: AnimePlayerId) => {
    if (next in ANIME_PLAYERS) {
      persist(next);
    }
  }, []);

  return { player, setPlayer } as const;
}
