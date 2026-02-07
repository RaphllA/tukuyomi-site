// Service Worker cache strategy:
// - Core app files (HTML/CSS/JS/manifest/markdown): network-first + cache:no-store
//   to minimize stale deploys.
// - Other same-origin assets: stale-while-revalidate for speed/offline fallback.
// App data (IndexedDB/localStorage) is not affected by this file cache.
const CACHE_PREFIX = 'twitter-simulator-static';
const CACHE_NAME = `${CACHE_PREFIX}-runtime-v2`;
const INDEX_FALLBACK_URL = './index.html';
const HUB_FALLBACK_URL = './hub/index.html';

const OFFLINE_FALLBACKS = [
  './',
  './index.html',
  './hub/index.html',
  './hub/style.css',
  './css/style.css',
  './js/data.js',
  './js/image-store.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/icon.svg'
];

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

function getBasePath() {
  // Keep routing compatible with both custom-domain root and project subpaths.
  // If SW URL is https://host/repo/sw.js, base path is /repo/.
  return new URL('./', self.location).pathname;
}

function isAppPath(pathname, app) {
  const base = getBasePath();
  return pathname === `${base}${app}` || pathname.startsWith(`${base}${app}/`);
}

function isExternalAppPath(pathname) {
  return isAppPath(pathname, '2ch');
}

function getNavigationFallbackURL(url) {
  if (isAppPath(url.pathname, 'hub')) return HUB_FALLBACK_URL;
  return INDEX_FALLBACK_URL;
}

function shouldUseNetworkFirst(request, url) {
  if (isNavigationRequest(request)) return true;
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'document') {
    return true;
  }
  return (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.md')
  );
}

function withNoStore(request) {
  return new Request(request, { cache: 'no-store' });
}

async function putInCache(cache, request, response) {
  if (!response || !response.ok) return;
  try {
    await cache.put(request, response.clone());
  } catch {
    // Ignore opaque/invalid cache puts.
  }
}

async function precacheFallbacks() {
  const cache = await caches.open(CACHE_NAME);
  for (const url of OFFLINE_FALLBACKS) {
    try {
      const response = await fetch(new Request(url, { cache: 'no-store' }));
      if (response && response.ok) {
        await cache.put(url, response.clone());
      }
    } catch {
      // Ignore network failures during install; runtime handlers still work.
    }
  }
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  const ours = keys.filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME);
  await Promise.all(ours.map((key) => caches.delete(key)));
}

async function networkFirstNoStore(request, url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(withNoStore(request));
    await putInCache(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      const fallback = await cache.match(getNavigationFallbackURL(url));
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then(async (response) => {
      await putInCache(cache, request, response);
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheFallbacks());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCaches());
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isExternalAppPath(url.pathname)) return;

  // Let browser handle SW script requests directly to avoid update edge-cases.
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/sw.js.map')) return;

  if (shouldUseNetworkFirst(event.request, url)) {
    event.respondWith(networkFirstNoStore(event.request, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
