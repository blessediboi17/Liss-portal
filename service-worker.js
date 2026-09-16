/*
  LISS service worker.
  - Caches the app shell (HTML/CSS/JS/icons/manifest) so the app opens
    instantly and can install as a PWA.
  - Never caches or intercepts calls to Supabase (auth/rest/storage) —
    those always go straight to the network, so school data is never
    served stale or offline by accident.
  - Bump CACHE_VERSION whenever you ship a new index.html so clients
    pick up the update instead of serving the old cached shell.
*/

const CACHE_VERSION = 'liss-shell-v1';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

// Hosts that must always hit the network untouched.
const NEVER_CACHE_HOSTS = ['supabase.co', 'supabase.in'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isNeverCacheHost(url) {
  return NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes

  const url = new URL(req.url);

  // Cross-origin API/auth/storage calls (Supabase, fonts, CDN libs):
  // let the network handle it, don't cache school data or hide errors.
  if (url.origin !== self.location.origin || isNeverCacheHost(url)) {
    return;
  }

  // Same-origin navigation: network-first so a fresh deploy is picked
  // up immediately; fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', res.clone()));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Same-origin static assets: cache-first, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
