const CACHE = 'ip-lus-mobile-v10-login-recovery';
const APP_SHELL = [
  './',
  './index.html',
  './chart-layout.css?v=9',
  './charts.js?v=9',
  './interactions.js?v=9',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('ip-lus-mobile-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error('Resposta temporariamente indisponível');
    await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    return (await cache.match(request)) || (fallback ? await cache.match(fallback) : Response.error());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Dados, autenticação e Realtime do Supabase nunca entram no cache do PWA.
  if (url.hostname.endsWith('.supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Mantém apenas a biblioteca pública e versionada disponível offline.
  if (request.url.startsWith(SUPABASE_CDN)) {
    event.respondWith(networkFirst(request));
  }
});

