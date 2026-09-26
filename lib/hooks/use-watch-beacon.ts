'use client';

import { useEffect } from 'react';

import type { LibraryMediaEntry } from '@/lib/media/types';

const HEARTBEAT_MS = 30_000;

interface WatchBeaconInput {
  entry: Pick<LibraryMediaEntry, 'id' | 'posterUrl' | 'provider' | 'title' | 'type'>;
  episode?: string | number | null;
  experience: string;
  season?: string | number | null;
}

export function useWatchBeacon({ entry, episode, experience, season }: WatchBeaconInput) {
  const { id, posterUrl, provider, title, type } = entry;
  const seasonKey = season == null ? null : String(season);
  const episodeKey = episode == null ? null : String(episode);

  useEffect(() => {
    const sessionId = crypto.randomUUID();
    const payload = JSON.stringify({
      episode: episodeKey,
      experience,
      mediaId: id,
      mediaType: type,
      posterUrl,
      provider,
      season: seasonKey,
      sessionId,
      title,
    });
    const send = (final = false) => {
      if (final && navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/heartbeat', new Blob([payload], { type: 'application/json' }));
        return;
      }
      void fetch('/api/analytics/heartbeat', {
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: final,
        method: 'POST',
      }).catch(() => undefined);
    };

    send();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') send();
    }, HEARTBEAT_MS);
    const onHide = () => send(true);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      send(true);
    };
  }, [episodeKey, experience, id, posterUrl, provider, seasonKey, title, type]);
}
