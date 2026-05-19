'use client';

import { useEffect } from 'react';

export function PwaServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    let cancelled = false;

    const registerWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        if (!cancelled) {
          void registration.update();
        }
      } catch {
        // PWA install still works where the browser allows it; registration can fail on unsupported origins.
      }
    };

    if (document.readyState === 'complete') {
      void registerWorker();
    } else {
      window.addEventListener('load', registerWorker, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', registerWorker);
    };
  }, []);

  return null;
}
