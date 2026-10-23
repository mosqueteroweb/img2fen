// Service Worker de Img2FEN: funciona 100% offline y recibe imágenes compartidas (Web Share Target).
const VERSION = '3.0.1';
const CACHE = `img2fen-v${VERSION}`;
const SHARED = 'img2fen-shared-data';
const ASSETS = [
  './', './index.html', './style.css', './main.js', './manifest.webmanifest',
  './js/recognizer.js', './js/detector.js', './js/geometry.js', './js/imageops.js',
  './js/vendor/ort.wasm.min.mjs', './js/vendor/chess.js',
  './wasm/ort-wasm-simd-threaded.mjs', './wasm/ort-wasm-simd-threaded.wasm',
  './model/chess-tiles-v2.onnx', './model/chess-yolo26n.onnx', './model/board-segmentation.onnx',
  './icons/icon-192.png', './icons/icon-512.png', './icons/creator-logo.png',
  ...['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'].map((p) => `./pieces/${p}.svg`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // borra cachés antiguas, incluidas las de Workbox de la versión 2.x
    await Promise.all(keys.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Web Share Target: guarda la imagen compartida y redirige a la app con ?shared=1
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.get('image');
        if (file) {
          const cache = await caches.open(SHARED);
          await cache.put('shared-image', new Response(file, {
            headers: { 'content-type': file.type || 'image/png', 'x-file-name': file.name || 'shared-diagram.png' },
          }));
        }
      } catch (err) {
        console.error('[SW] Error guardando la imagen compartida:', err);
      }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isNav = req.mode === 'navigate';
    const hit = await cache.match(isNav ? './index.html' : req, { ignoreSearch: isNav });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (isNav) return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
