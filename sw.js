const CACHE = 'chess-training-center-v7';
// App code changes often; heavy/rarely-changing assets (engine, pieces, icons)
// benefit from cache-first. Everything else should prefer the network so
// updates show up on the very next load instead of needing two reloads.
const CACHE_FIRST = /\/(vendor|pieces|pieces2|icons)\//;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/board.js',
  'js/db.js',
  'js/engine.js',
  'js/i18n.js',
  'js/firebase.js',
  'js/puzzles-data.js',
  'js/endgames-data.js',
  'js/tree.js',
  'vendor/chess.js',
  'vendor/chart.umd.js',
  'vendor/stockfish-17.1-lite-single-03e3232.js',
  'vendor/stockfish-17.1-lite-single-03e3232.wasm',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png',
  'icons/logo-mark.png',
  'icons/logo-full.png',
  'icons/google-g.svg',
  'pieces/wK.svg', 'pieces/wQ.svg', 'pieces/wR.svg', 'pieces/wB.svg', 'pieces/wN.svg', 'pieces/wP.svg',
  'pieces/bK.svg', 'pieces/bQ.svg', 'pieces/bR.svg', 'pieces/bB.svg', 'pieces/bN.svg', 'pieces/bP.svg',
  'pieces2/wK.svg', 'pieces2/wQ.svg', 'pieces2/wR.svg', 'pieces2/wB.svg', 'pieces2/wN.svg', 'pieces2/wP.svg',
  'pieces2/bK.svg', 'pieces2/bQ.svg', 'pieces2/bR.svg', 'pieces2/bB.svg', 'pieces2/bN.svg', 'pieces2/bP.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (CACHE_FIRST.test(e.request.url)) {
    // Cache-first: heavy, rarely-changing assets — fast and works offline.
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Network-first: app code — always fresh when online, cached fallback offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
