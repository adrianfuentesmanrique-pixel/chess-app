const CACHE = 'chess-training-center-v166';
// Transient hand-off for the Web Share Target: the POST below stashes the shared
// file here and the app reads it on the next load. Kept OUT of the version wipe in
// `activate` so an update mid-share doesn't drop it.
const SHARE_CACHE = 'ctc-shared-inbox';
// Heavy files fetched on first use that must outlive an update: they live in
// their own cache, which `activate` does not wipe. Without it every CACHE bump
// threw the 7 MB engine away and the bot and the analysis evaluation could not
// start offline until it had been downloaded again; the same went for the
// Read tab's PDF engine, so a book already on the phone would not open. ONLY
// files whose NAME or FOLDER carries their version belong here — nothing else
// ever replaces an entry. An entry that is no longer listed is removed in
// `activate`.
const KEEP_CACHE = 'ctc-engine';
const KEEP = [
  'vendor/stockfish-17.1-lite-single-03e3232.wasm',
  'vendor/pdfjs-6.3.289/pdf.worker.min.mjs',
  'vendor/pdfjs-6.3.289/jbig2.wasm',
  'vendor/pdfjs-6.3.289/openjpeg.wasm',
];
const abs = u => new URL(u, self.location).href;
const KEEP_URLS = KEEP.map(abs);
// Up to v150 the three pdf.js files sat in vendor/ with no version in their
// path. They never changed while they lived there, so a copy a phone already
// holds under the old address IS the 6.3.289 file: `activate` carries it
// across instead of making the phone download it again. Never add an entry
// here for a file that was ever replaced under its old name.
const KEEP_WAS = Object.fromEntries(['pdf.worker.min.mjs', 'jbig2.wasm', 'openjpeg.wasm']
  .map(f => [abs('vendor/pdfjs-6.3.289/' + f), abs('vendor/' + f)]));
// App code changes often; heavy/rarely-changing assets (engine, pieces, icons)
// benefit from cache-first. Everything else should prefer the network so
// updates show up on the very next load instead of needing two reloads.
const CACHE_FIRST = /\/(vendor|pieces|pieces2|icons|streaks|avatars)\//;
// The app's art: every badge, every streak flame, every avatar the app can
// show and Kael's two portraits (4.1 MB together). Fetched at install into a cache of its OWN, which
// `activate` does not wipe — up to v157 only the 8 robot badges were precached,
// the rest was stored on first sight in the versioned cache, and every CACHE
// bump threw it away, so offline the trophy case, the flames and the player's
// own avatar came up empty after each update.
// These files carry no version in their names, so the CACHE NAME carries it:
// when any art file is redrawn under its existing name, bump the number here
// (the old art cache is then deleted in `activate`) AND make ART_WAS return
// false, or a phone coming from an old version would carry the old drawing in.
// `npm.cmd run test:precache` fails if a file in these folders is not listed.
// avatars/ is top-level files only: "avatars/CTC new arts" is the 137 MB of
// source drawings for tools/build_*.py, which the app never loads.
const ART_CACHE = 'ctc-art-1';
const ART_RE = /\/(icons\/(badges|kael)|streaks|avatars)\//;
// Versioned caches that may hold today's art from a first fetch: the art last
// changed during v62. What a phone already has is moved across at install
// instead of being downloaded again.
const ART_WAS = k => +(k.match(/^chess-training-center-v(\d+)$/) || [])[1] >= 63;
const names = (dir, list) => list.split(' ').map(n => `${dir}/${n}.png`);
const ART = [
  ...names('icons/kael', 'kael-bust kael-welcome'),
  ...names('icons/badges',
    'beat_engine_0 beat_engine_1 beat_engine_2 beat_engine_3 beat_engine_4 beat_engine_5 ' +
    'beat_engine_6 beat_engine_7 beat_engine_all daily_180 daily_1825 daily_270 daily_30 ' +
    'daily_365 daily_3650 daily_7 daily_730 daily_90 endgame_bishop endgame_knight endgame_minor ' +
    'endgame_pawn endgame_queen endgame_rook first_engine first_import opening_1 opening_3 puz_10 ' +
    'puz_1000 puz_200 puz_50 puz_5000 rush3_20 rush3_30 rush3_40 rush5_30 rush5_40 rush5_50 ' +
    'streak_180 streak_1825 streak_270 streak_30 streak_365 streak_3650 streak_7 streak_730 ' +
    'streak_90 theme_advancedPawn theme_attraction theme_backRankMate theme_capturingDefender ' +
    'theme_clearance theme_defensiveMove theme_deflection theme_discoveredAttack ' +
    'theme_discoveredCheck theme_doubleCheck theme_fork theme_hangingPiece theme_interference ' +
    'theme_intermezzo theme_mateIn1 theme_mateIn2 theme_mateIn3 theme_mateIn4 theme_mateIn5 ' +
    'theme_pin theme_promotion theme_quietMove theme_sacrifice theme_skewer theme_smotheredMate ' +
    'theme_trappedPiece theme_xRayAttack theme_zugzwang'),
  ...names('streaks',
    'bishop1 bishop2 bishop3 bishop4 flame1 flame2 flame3 flame4 flame5 flame6 knight1 knight2 ' +
    'knight3 knight4 pawn1 pawn2 pawn3 pawn4 pawn5 pawn6 queen1 queen2 queen3 rook1 rook2 rook3'),
  ...names('avatars',
    'bear bishop_b bishop_w crystal dragon eagle fire galaxy griffin hydra ice king_b king_w ' +
    'knight_b knight_w kraken lion owl pawn_b pawn_w phoenix queen_b queen_w raven rook_b rook_w ' +
    'shadow storm tiger void wolf'),
];
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
  'js/pulso.js',
  'js/pulso-ui.js',
  'js/pulso-match.js',
  'js/sound.js',
  'js/appearance.js',
  'js/avatars.js',
  'js/badges.js',
  'js/badge-card.js',
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
  // The Firebase SDK, statically imported by js/firebase.js (and so by
  // js/app.js): without all four the app never gets past the splash. Copied
  // from www.gstatic.com/firebasejs/10.14.1; the folder carries the version, so
  // an SDK upgrade is a new path and cache-first can never serve a stale one.
  'vendor/firebase-10.14.1/firebase-app.js',
  'vendor/firebase-10.14.1/firebase-auth.js',
  'vendor/firebase-10.14.1/firebase-firestore.js',
  'vendor/firebase-10.14.1/firebase-app-check.js',
  'vendor/chart.umd.js',
  'vendor/stockfish-17.1-lite-single-03e3232.js',
  // PDF.js main library for the Read tab (~500 KB). The separate ~1.3 MB
  // pdf.worker.min.mjs is deliberately NOT precached — same reasoning as the
  // Stockfish .wasm below: it is fetched on first use (the first time a book is
  // opened or added) and cached by the cache-first handler into KEEP_CACHE, so
  // an update does not throw it away. A first launch by someone who never opens
  // Read stays light. The image-decoder wasm (jbig2.wasm ~102 KB, openjpeg.wasm
  // ~246 KB) that pdf.js uses to render JBIG2/JPEG2000 scanned pages is likewise
  // NOT precached — same first-use path as the worker above.
  // The folder carries the pdf.js version: an upgrade is a new folder.
  'vendor/pdfjs-6.3.289/pdf.min.mjs',
  // NOTE: the 7 MB Stockfish .wasm is deliberately NOT precached here. Pulling
  // it during install put a 7 MB download in front of first launch, and since
  // install is all-or-nothing, a phone that dropped it got NOTHING cached.
  // It is fetched on first use instead and cached by the handler below, into
  // KEEP_CACHE (see the top of this file), so an update does not throw it away.
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon-180.png',
  'icons/logo-mark.png',
  'icons/logo-full.png',
  'icons/google-g.svg',
  // Badges, Kael, streak flames and avatars are NOT here: see ART above.
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
    Promise.all([
      caches.open(CACHE).then(c => Promise.all(ASSETS.map(url =>
        c.add(url).catch(err => console.warn('[sw] skipped', url, err))))),
      stockArt().catch(err => console.warn('[sw] art', err)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => keys.filter(k => k !== CACHE && k !== SHARE_CACHE && k !== KEEP_CACHE && k !== ART_CACHE))
      .then(old => tidyKeep(old).catch(err => console.warn('[sw] keep', err))
        .then(() => Promise.all(old.map(k => caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

// Runs at install, while the old caches are still there. Each art file that is
// not in the art cache yet is taken from an old versioned cache if one has it,
// and downloaded otherwise — one by one, so a dropped connection costs only
// the files it dropped; those are stored the first time they are shown.
async function stockArt() {
  const art = await caches.open(ART_CACHE);
  const was = (await caches.keys()).filter(ART_WAS);
  await Promise.all(ART.map(abs).map(async url => {
    if (await art.match(url)) return;
    for (const k of was) {
      const hit = await (await caches.open(k)).match(url);
      if (hit) return art.put(url, hit);
    }
    await art.add(url).catch(err => console.warn('[sw] skipped', url, err));
  }));
}

// Runs before the old caches go. Drops kept files that are no longer listed
// (an engine upgrade must not leave the old 7 MB behind), and moves a listed
// file that an older version stored in its versioned cache across — under its
// own address or the one it had before (KEEP_WAS) — so the update that starts
// keeping a file does not cost anyone a second download.
async function tidyKeep(old) {
  const keep = await caches.open(KEEP_CACHE);
  for (const req of await keep.keys()) if (!KEEP_URLS.includes(req.url)) await keep.delete(req);
  for (const url of KEEP_URLS) {
    if (await keep.match(url)) continue;
    for (const k of old) {
      const c = await caches.open(k);
      let hit = await c.match(url);
      // Found under the old address: stored as a new Response, which does not
      // carry that address, so it is served as the file now asked for.
      if (!hit && KEEP_WAS[url] && (hit = await c.match(KEEP_WAS[url]))) hit = new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers });
      if (hit) { await keep.put(url, hit); break; }
    }
  }
}

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

  // Only ever cache our own files. Cross-origin GETs (Firebase auth/data,
  // reCAPTCHA) go straight to the network: CacheStorage is readable by any
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
          if (res.ok) { const copy = res.clone(); caches.open(KEEP_URLS.includes(e.request.url) ? KEEP_CACHE : ART_RE.test(e.request.url) ? ART_CACHE : CACHE).then(c => c.put(e.request, copy)); }
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
  // A page load is looked up without its query: ./?code=…&state=… (back from
  // lichess.org) and ./?shared=1 are the same page as ./ — and must never be
  // stored under an address that carries a one-time sign-in code.
  const nav = e.request.mode === 'navigate';
  const cached = await caches.match(e.request, { ignoreSearch: nav });
  if (!cached) {
    // Nothing stored for this file: only the network can answer.
    // cache: 'no-store' bypasses the browser's own HTTP disk cache, which can
    // otherwise silently serve a stale response for an unchanged URL.
    const res = await fetch(e.request, { cache: 'no-store' });
    // Clone synchronously — see the cache-first branch above.
    if (res.ok && !(nav && new URL(e.request.url).search)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
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
