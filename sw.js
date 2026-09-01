const CACHE = 'chess-training-center-v92';
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
  'js/history.js',
  'js/engine.js',
  'js/i18n.js',
  'js/firebase.js',
  'js/puzzles.js',
  'js/sound.js',
  'js/appearance.js',
  'js/avatars.js',
  'js/badges.js',
  'js/leaderboard.js',
  'js/friends.js',
  'js/masterclass.js',
  'js/chapter-order.js',
  'js/read.js',
  'js/diagram.js',
  // Only the band a new account starts in (ELO 1200). The other nine are
  // fetched on demand and cached by the network-first handler below — bundling
  // all 5 MB into install would be slow and mostly unused.
  'puzzles/puzzles-3.json',
  'js/endgames-data.js',
  'js/tree.js',
  'js/tour.js',
  'vendor/chess.js',
  'vendor/chart.umd.js',
  'vendor/stockfish-17.1-lite-single-03e3232.js',
  // PDF.js main library for the Read tab (~500 KB). The separate ~1.3 MB
  // pdf.worker.min.mjs is deliberately NOT precached — same reasoning as the
  // Stockfish .wasm below: it is fetched on first use (the first time a book is
  // opened or added) and cached by the cache-first handler, since vendor/ is
  // CACHE_FIRST. So a first launch by someone who never opens Read stays light.
  // The image-decoder wasm (vendor/jbig2.wasm ~102 KB, vendor/openjpeg.wasm
  // ~246 KB) that pdf.js uses to render JBIG2/JPEG2000 scanned pages is likewise
  // NOT precached — same cache-first-on-first-use path as the worker above.
  'vendor/pdf.min.mjs',
  // NOTE: the 7 MB Stockfish .wasm is deliberately NOT precached here. Pulling
  // it during install put a 7 MB download in front of first launch, and since
  // install is all-or-nothing, a phone that dropped it got NOTHING cached.
  // It is fetched on first use instead and cached by the handler below.
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-180.png',
  'icons/logo-mark.png',
  'icons/logo-full.png',
  'icons/google-g.svg',
  // The 8 robot badges are the Play tab's level picker, so they must be there
  // on a first launch that happens offline. The rest of icons/badges/ is not
  // precached — it is only cached after first fetch.
  'icons/badges/beat_engine_0.png', 'icons/badges/beat_engine_1.png',
  'icons/badges/beat_engine_2.png', 'icons/badges/beat_engine_3.png',
  'icons/badges/beat_engine_4.png', 'icons/badges/beat_engine_5.png',
  'icons/badges/beat_engine_6.png', 'icons/badges/beat_engine_7.png',
  'pieces/wK.svg', 'pieces/wQ.svg', 'pieces/wR.svg', 'pieces/wB.svg', 'pieces/wN.svg', 'pieces/wP.svg',
  'pieces/bK.svg', 'pieces/bQ.svg', 'pieces/bR.svg', 'pieces/bB.svg', 'pieces/bN.svg', 'pieces/bP.svg',
  'pieces2/wK.svg', 'pieces2/wQ.svg', 'pieces2/wR.svg', 'pieces2/wB.svg', 'pieces2/wN.svg', 'pieces2/wP.svg',
  'pieces2/bK.svg', 'pieces2/bQ.svg', 'pieces2/bR.svg', 'pieces2/bB.svg', 'pieces2/bN.svg', 'pieces2/bP.svg',
];

self.addEventListener('install', e => {
  // Cache each asset independently. cache.addAll() rejects the whole install if
  // a single request fails, which on a flaky mobile connection meant the app
  // installed with an empty cache and then failed at runtime.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(url =>
        c.add(url).catch(err => console.warn('[sw] skipped', url, err)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Only ever cache our own files. Cross-origin GETs (Firebase auth/data, the
  // gstatic SDK) go straight to the network: CacheStorage is readable by any
  // script on this origin and survives sign-out, so a cached authenticated
  // response would outlive the session it belonged to.
  if (new URL(e.request.url).origin !== self.location.origin) return;

  if (CACHE_FIRST.test(e.request.url)) {
    // Cache-first: heavy, rarely-changing assets — fast and works offline.
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(err => {
          // Previously this resolved to `cached`, which is undefined when
          // nothing was stored — and respondWith(undefined) surfaces to the
          // page as an opaque network failure. Stockfish loads its .wasm over
          // XHR, so that became an uncatchable "Aborted(NetworkError)" crash.
          // A real Response lets the caller see a status and retry.
          return new Response('offline: ' + err.message,
            { status: 504, statusText: 'Gateway Timeout' });
        });
      })
    );
    return;
  }

  // Network-first: app code — always fresh when online, cached fallback offline.
  // cache: 'no-store' bypasses the browser's own HTTP disk cache, which can
  // otherwise silently serve a stale response for an unchanged URL even when
  // this handler explicitly wants to hit the network.
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
