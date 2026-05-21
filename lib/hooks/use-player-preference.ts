'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type PlayerChoice = '1' | '2';
export type AnimeLanguageChoice = 'dub' | 'sub';

export const PLAYER_LABELS: Record<PlayerChoice, string> = {
  '1': 'Videasy',
  '2': 'Vidking',
};

export const ANIME_LANGUAGE_LABELS: Record<AnimeLanguageChoice, string> = {
  dub: 'Dub',
  sub: 'Sub',
};

interface ChoiceStore<T extends string> {
  changeEvent: string;
  defaultValue: T;
  memoryValue: T | null;
  normalize: (value: string | null) => T;
  storageKey: string;
}

const playerStore: ChoiceStore<PlayerChoice> = {
  changeEvent: 'papiflix-player-change',
  defaultValue: '1',
  memoryValue: null,
  normalize: (value) => (value === '2' ? '2' : '1'),
  storageKey: 'papiflix-player',
};

const animeLanguageStore: ChoiceStore<AnimeLanguageChoice> = {
  changeEvent: 'papianime-language-change',
  defaultValue: 'sub',
  memoryValue: null,
  normalize: (value) => (value === 'dub' ? 'dub' : 'sub'),
  storageKey: 'papianime-language',
};

function getChoiceSnapshot<T extends string>(store: ChoiceStore<T>): T {
  if (store.memoryValue) {
    return store.memoryValue;
  }

  try {
    store.memoryValue = store.normalize(localStorage.getItem(store.storageKey));
  } catch {
    // Storage can be full or unavailable; keep the current tab usable.
  }

  return store.memoryValue ?? store.defaultValue;
}

function subscribeChoicePreference<T extends string>(store: ChoiceStore<T>, onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === store.storageKey) {
      store.memoryValue = store.normalize(event.newValue);
      onStoreChange();
    }
  };
  const onLocalChange = () => onStoreChange();

  window.addEventListener('storage', onStorage);
  window.addEventListener(store.changeEvent, onLocalChange);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(store.changeEvent, onLocalChange);
  };
}

function persistChoice<T extends string>(store: ChoiceStore<T>, choice: T) {
  store.memoryValue = choice;
  try {
    localStorage.setItem(store.storageKey, choice);
  } catch {
    // If storage is full, the selection still applies for this session.
  }
  window.dispatchEvent(new Event(store.changeEvent));
}

function useStoredChoice<T extends string>(store: ChoiceStore<T>) {
  const value = useSyncExternalStore(
    (onStoreChange) => subscribeChoicePreference(store, onStoreChange),
    () => getChoiceSnapshot(store),
    () => store.defaultValue,
  );

  const setValue = useCallback((choice: T) => {
    persistChoice(store, choice);
  }, [store]);

  return { setValue, value } as const;
}

export function usePlayerPreference() {
  const { setValue: setPlayer, value: player } = useStoredChoice(playerStore);
  return { player, setPlayer } as const;
}

export function useAnimeLanguagePreference() {
  const { setValue: setLanguage, value: language } = useStoredChoice(animeLanguageStore);
  return { language, setLanguage } as const;
}
