'use client';

import { startTransition, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isPublicBrowsePath } from '@/lib/cache/public-pages';

export function PwaServiceWorker() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.filter((registration) => {
          const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL;
          return script === new URL('/sw.js', window.location.origin).href;
        }).map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    let cancelled = false;

    const registerWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
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

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator) || !isPublicBrowsePath(pathname)) return;
    let lastRefresh = 0;
    let lastCheck = 0;
    const marker = Array.from(document.childNodes).find(node => node.nodeType === 8 && node.nodeValue?.startsWith('papiflix-cache-revision:'));
    const renderedRevision = marker?.nodeValue?.slice('papiflix-cache-revision:'.length).split(':');
    let knownRevision = renderedRevision?.[1] === pathname ? renderedRevision[0] : undefined;
    let updatePending = false;
    let refreshTimer: number | undefined;
    const applyUpdate = () => {
      if (!updatePending || document.visibilityState !== 'visible') return;
      const remaining = 30_000 - (Date.now() - lastRefresh);
      if (remaining > 0) {
        if (refreshTimer === undefined) refreshTimer = window.setTimeout(() => { refreshTimer = undefined; applyUpdate(); }, remaining);
        return;
      }
      updatePending = false;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    };
    const refresh = (event: MessageEvent) => {
      if (event.source !== navigator.serviceWorker.controller || event.data?.type !== 'PAPIFLIX_PUBLIC_UPDATED' ||
          event.data.path !== window.location.pathname || event.data.revision === knownRevision) return;
      knownRevision = event.data.revision;
      updatePending = true;
      // Refresh server-rendered browse data without resetting search, scroll or open dialogs.
      applyUpdate();
    };
    const check = () => {
      applyUpdate();
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      navigator.serviceWorker.controller?.postMessage({ type: 'PAPIFLIX_REVALIDATE_PUBLIC', revision: knownRevision });
    };
    navigator.serviceWorker.addEventListener('message', refresh);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      navigator.serviceWorker.removeEventListener('message', refresh);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.clearTimeout(refreshTimer);
    };
  }, [pathname, router]);

  return null;
}
