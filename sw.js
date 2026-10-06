const CACHE = 'chess-training-center-v148';
// Transient hand-off for the Web Share Target: the POST below stashes the shared
// file here and the app reads it on the next load. Kept OUT of the version wipe in
// `activate` so an update mid-share doesn't drop it.
const SHARE_CACHE = 'ctc-shared-inbox';
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
  'js/students.js',
  'js/activity.js',
  'js/chapter-order.js',
  'js/read.js',
  'js/read-training.js',
  'js/blind-elo.js',
  'js/diagram.js',
  // Statically imported by js/app.js, so the app cannot start without them.
  // Every file app.js imports at startup MUST be listed here: one that is not
  // only gets cached on a second online visit, and each CACHE bump throws it
  // out again. `npm.cmd run test:precache` fails if this list falls behind.
  'js/learning-data.js',
  'js/quotes-data.js',
  'js/legal-data.js',
  'js/openings-eco.js',
  // Only the band a new account starts in (ELO 1200). The other nine are
  // fetched on demand and cached by the network-first handler below — bundling
  // all 5 MB into install would be slow and mostly unused.
  'puzzles/puzzles-3.json',
  'js/endgames-data.js',
  'js/tree.js',
  'js/movelist.js',
  'js/explore-index.js',
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
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Web Share Target endpoint. A file shared to the app (WhatsApp → Share → CTC)
  // arrives here as a POST — there is no server, so the SW IS the endpoint: pull
  // the file out, stash it, and redirect into the app, which imports it on load.
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('file');
        if (file && file.size) {
          const c = await caches.open(SHARE_CACHE);
          await c.put('/__ctc-shared', new Response(file, {
            headers: { 'content-type': file.type || 'application/octet-stream',
                       'x-file-name': encodeURIComponent(file.name || 'shared') },
          }));
        }
      } catch (err) { /* fall through — the app just won't find a file */ }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

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
          // Clone NOW, before the page starts reading the body. Cloning inside the
          // async .then() ran after the body was consumed ("Response body is
          // already used"), so the put silently failed and nothing got cached.
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
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
  e.respondWith(networkFirst(e));
});

// Network-first used to wait for the network with no limit, so on a weak signal
// a fully cached app re-downloaded itself before every launch and sat on the
// splash for most of a minute. Now each file gets NET_TIMEOUT, and the choice
// between network and cache is made ONCE PER LAUNCH, never per file — a per-file
// limit would hand out new small files next to an old cached app.js:
//  - the first file that is too slow (or fails) switches the whole launch to
//    the cache; requests still in the air are dropped;
//  - every file that does arrive is compared with its cached copy. All the same:
//    it makes no difference which one is served. One different (an update is
//    out): the limit is lifted for the rest of the launch, so the launch is all
//    new. A changed file is NOT written to the cache — a launch cut off halfway
//    would leave it half old, half new. The next CACHE version replaces it whole.
const NET_TIMEOUT = 2500;
const launches = new Map();   // client id → { cacheOnly, changed, stop, gaveUp }

function launchFor(e) {
  const nav = e.request.mode === 'navigate';
  const id = (nav ? e.resultingClientId : e.clientId) || '';
  if (nav || !launches.has(id)) {
    if (launches.size > 20) launches.delete(launches.keys().next().value);
    const L = { cacheOnly: false, changed: false, stop: new AbortController() };
    L.gaveUp = new Promise(r => { L.giveUp = () => { L.cacheOnly = true; r('slow'); L.stop.abort(); }; });
    launches.set(id, L);
  }
  return launches.get(id);
}

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

async function networkFirst(e) {
  const L = launchFor(e);
  const cached = await caches.match(e.request);
  if (!cached) {
    // Nothing stored for this file: only the network can answer.
    // cache: 'no-store' bypasses the browser's own HTTP disk cache, which can
    // otherwise silently serve a stale response for an unchanged URL.
    const res = await fetch(e.request, { cache: 'no-store' });
    // Clone synchronously — see the cache-first branch above.
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }
  if (L.cacheOnly) return cached;

  const fresh = fetch(e.request, { cache: 'no-store', signal: L.stop.signal }).then(async res => {
    if (!res.ok) return { res, same: true };   // an error page says nothing about an update; pass it on as before
    const copy = res.clone();   // synchronously, before the body is read below
    const [a, b] = await Promise.all([res.arrayBuffer(), cached.clone().arrayBuffer()]);
    return { res: copy, same: sameBytes(a, b) };
  });
  fresh.catch(() => {});
  const use = got => {
    if (got.same) return got.res;
    if (L.cacheOnly) return cached;   // this launch already runs on the cache
    L.changed = true;
    return got.res;
  };

  let timer;
  const got = await Promise.race([
    fresh.catch(() => 'failed'),
    L.gaveUp,
    new Promise(r => { timer = setTimeout(r, NET_TIMEOUT, 'slow'); }),
  ]);
  clearTimeout(timer);
  if (got === 'slow' && L.changed) return fresh.then(use, () => cached);   // an update is loading: wait it out
  if (got === 'slow' || got === 'failed') {
    if (!L.changed) L.giveUp();
    return cached;
  }
  return use(got);
}
