'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { EZVID_PROVIDERS, isEzvidProvider, type EzvidProvider } from '@/lib/media/embed';

export type PlayerChoice = '1' | '2' | '3' | '4' | '5' | '6';
export type AnimeLanguageChoice = 'dub' | 'sub';
export type AnimeServerChoice = 'aniwave';

const PLAYER_STORAGE_VERSION = '3';
const PLAYER_STORAGE_VERSION_KEY = 'papiflix-player-version';
const DEFAULT_EZVID_PROVIDER: EzvidProvider = 'vidsrc';

export const PLAYER_LABELS: Record<PlayerChoice, string> = {
  '1': 'VidFast',
  '2': 'VidSrc',
  '3': 'Videasy',
  '4': 'Vidking',
  '5': 'EZVid',
  '6': 'FilmU',
};

export const EZVID_PROVIDER_LABELS: Record<EzvidProvider, string> = {
  dixsrc: 'DixSrc',
  icefy: 'Icefy',
  popr: 'Popr',
  vidlink: 'VidLink',
  vidnest: 'VidNest',
  vidrock: 'VidRock',
  vidsrc: 'VidSrc',
  vidzee: 'VidZee',
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

function normalizePlayerChoice(value: string | null): PlayerChoice {
  return value === '2'
    ? '2'
    : value === '3'
      ? '3'
      : value === '4'
        ? '4'
        : value === '5'
          ? '5'
          : value === '6'
            ? '6'
            : '1';
}

function migratePlayerChoice(value: string | null, version: string | null): PlayerChoice {
  if (version === PLAYER_STORAGE_VERSION) {
    return normalizePlayerChoice(value);
  }

  return value === '1' ? '2' : value === '2' ? '3' : value === '3' ? '4' : value === '4' ? '5' : '1';
}

const playerStore: ChoiceStore<PlayerChoice> = {
  changeEvent: 'papiflix-player-change',
  defaultValue: '1',
  memoryValue: null,
  normalize: normalizePlayerChoice,
  storageKey: 'papiflix-player',
};

const animeLanguageStore: ChoiceStore<AnimeLanguageChoice> = {
  changeEvent: 'papianime-language-change',
  defaultValue: 'sub',
  memoryValue: null,
  normalize: (value) => (value === 'dub' ? 'dub' : 'sub'),
  storageKey: 'papianime-language',
};

const animeServerStore: ChoiceStore<AnimeServerChoice> = {
  changeEvent: 'papianime-server-change',
  defaultValue: 'aniwave',
  memoryValue: null,
  normalize: () => 'aniwave' as const,
  storageKey: 'papianime-server',
};

const ezvidProviderStore: ChoiceStore<EzvidProvider> = {
  changeEvent: 'papiflix-ezvid-provider-change',
  defaultValue: DEFAULT_EZVID_PROVIDER,
  memoryValue: null,
  normalize: (value) => (isEzvidProvider(value) ? value : DEFAULT_EZVID_PROVIDER),
  storageKey: 'papiflix-ezvid-provider',
};

function getChoiceSnapshot<T extends string>(store: ChoiceStore<T>): T {
  if (store.memoryValue) {
    return store.memoryValue;
  }

  try {
    if (store.storageKey === playerStore.storageKey) {
      const migratedChoice = migratePlayerChoice(
        localStorage.getItem(store.storageKey),
        localStorage.getItem(PLAYER_STORAGE_VERSION_KEY),
      );
      store.memoryValue = migratedChoice as T;
      localStorage.setItem(store.storageKey, migratedChoice);
      localStorage.setItem(PLAYER_STORAGE_VERSION_KEY, PLAYER_STORAGE_VERSION);
    } else {
      store.memoryValue = store.normalize(localStorage.getItem(store.storageKey));
    }
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
    if (store.storageKey === playerStore.storageKey) {
      localStorage.setItem(PLAYER_STORAGE_VERSION_KEY, PLAYER_STORAGE_VERSION);
    }
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

export function useEzvidProviderPreference() {
  const { setValue: setProvider, value: provider } = useStoredChoice(ezvidProviderStore);
  return { provider, setProvider } as const;
}
