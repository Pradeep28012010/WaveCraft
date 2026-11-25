const CACHE_NAME = 'wavecraft-shell-v8.2-v5.4.0';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  // Never force skipWaiting() during install so active audio playback is never interrupted by a silent reload
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k !== CACHE_NAME &&
                !k.startsWith('wavecraft-offline-') &&
                !k.startsWith('wavecraft-permanent-')
            )
            .map((k) => caches.delete(k))
        )
      )
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API, version manifests, installer binaries (.apk), range requests, or external media endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json' ||
    url.pathname === '/sw.js' ||
    url.pathname.endsWith('.apk') ||
    request.headers.has('range') ||
    url.hostname.includes('youtube') ||
    url.hostname.includes('googlevideo') ||
    url.hostname.includes('saavncdn') ||
    url.hostname.includes('lrclib')
  ) {
    return;
  }

  // Navigation requests: fetch fresh with no-cache, fallback to cached index.html when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          const ct = (response?.headers?.get('content-type') || '').toLowerCase();
          if (response && response.status === 200 && response.type === 'basic' && ct.includes('text/html')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const match = await caches.match('/index.html');
          return (
            match ||
            new Response('Offline - WaveCraft is disconnected', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            })
          );
        })
    );
    return;
  }

  // Hashed Vite build assets: cache-first, rejecting non-asset/HTML 200 SPA fallback poisoning
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            const ct = (response?.headers?.get('content-type') || '').toLowerCase();
            if (
              response &&
              response.status === 200 &&
              response.type === 'basic' &&
              !ct.includes('text/html')
            ) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
            }
            return response;
          })
          .catch(
            () =>
              new Response('Asset unavailable offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              })
          );
      })
    );
    return;
  }

  // Static same-origin assets: network-first with stale fallback (always resolving a valid Response)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const ct = (response?.headers?.get('content-type') || '').toLowerCase();
          if (
            response &&
            response.status === 200 &&
            response.type === 'basic' &&
            !ct.includes('text/html')
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const match = await caches.match(request);
          return (
            match ||
            new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            })
          );
        })
    );
  }
});
