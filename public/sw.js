const CACHE_NAME = 'papiflix-pwa-v2';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/icons/papiflixbanner.png',
  '/icons/favicon/apple-touch-icon.png',
  '/icons/favicon/favicon.ico',
  '/icons/favicon/favicon-16x16.png',
  '/icons/favicon/favicon-32x32.png',
  '/icons/favicon/android-chrome-192x192.png',
  '/icons/favicon/android-chrome-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response('PapiFlix is offline. Reconnect to continue browsing.', {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
            },
            status: 503,
          }),
      ),
    );
    return;
  }

  if (
    requestUrl.pathname.startsWith('/_next/static/') ||
    requestUrl.pathname.startsWith('/icons/') ||
    requestUrl.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });
          return response;
        });
      }),
    );
  }
});
