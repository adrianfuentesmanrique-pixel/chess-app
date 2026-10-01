// IndexedDB storage: databases ("bases") of games + puzzle progress + settings.
const DB_NAME = 'mi-ajedrez';
// v2 adds search indexes on the games store so filtering can be done by the
// database instead of scanning every record in memory.
// v3 adds the playHistory store for games played against the engine.
// v4 adds the books store for the Read tab (PDF chess books, device-only).
// v5 adds the posIndex store: the Analysis position search's index, kept so it
// is built once per base instead of once per app start.
const DB_VER = 5;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    // Stepwise so an existing install upgrades in place instead of trying to
    // recreate stores that already exist.
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        const bases = db.createObjectStore('bases', { keyPath: 'id', autoIncrement: true });
        bases.createIndex('name', 'name');
        const games = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
        games.createIndex('baseId', 'baseId');
        db.createObjectStore('kv');
      }
      if (e.oldVersion < 2) {
        // IndexedDB backfills these from existing records during the upgrade.
        const games = req.transaction.objectStore('games');
        for (const f of ['white', 'black', 'event', 'date', 'result']) {
          if (!games.indexNames.contains(f)) games.createIndex(f, f);
        }
      }
      if (e.oldVersion < 3) {
        const hist = db.createObjectStore('playHistory', { keyPath: 'id', autoIncrement: true });
        hist.createIndex('playedAt', 'playedAt');
        hist.createIndex('outcome', 'outcome');
        hist.createIndex('playerColor', 'playerColor');
        hist.createIndex('level', 'level');
        hist.createIndex('opening', 'opening');
      }
      if (e.oldVersion < 4) {
        // The user's own PDF books. The PDF Blob lives here and NOWHERE else —
        // never synced to Firebase (SYNCED_KEYS covers only the kv store, so a
        // separate store is structurally unable to reach the cloud). Indexed by
        // openedAt so the shelf can list most-recently-read first.
        const books = db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
        books.createIndex('openedAt', 'openedAt');
      }
      if (e.oldVersion < 5) {
        // A new, empty store — nothing is backfilled, so the upgrade is instant
        // however large the bases are. Keys are written out by hand:
        //   [baseId, 'block', n]  one block of the index (see explore-index.js)
        //   [baseId, 'rev']       counts every write to that base's games
        //   [baseId, 'built']     the 'rev' the stored blocks were built at
        db.createObjectStore('posIndex');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs of this app'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    // A full device aborts the transaction without an error event.
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- bases ---
export async function listBases() {
  const db = await open();
  const s = db.transaction('bases').objectStore('bases');
  const bases = await reqToPromise(s.getAll());
  // add game counts
  const gs = db.transaction('games').objectStore('games').index('baseId');
  for (const b of bases) b.count = await reqToPromise(gs.count(b.id));
  return bases.sort((a, b) => a.name.localeCompare(b.name));
}

export function createBase(name) {
  return tx('bases', 'readwrite', s => reqToPromise(s.add({ name, createdAt: Date.now() })));
}

export function renameBase(id, name) {
  return tx('bases', 'readwrite', s => {
    s.get(id).onsuccess = function () { const b = this.result; if (b) { b.name = name; s.put(b); } };
  });
}

export async function deleteBase(id) {
  const db = await open();
  const ids = await reqToPromise(db.transaction('games').objectStore('games').index('baseId').getAllKeys(id));
  // The base's stored position index goes in the same transaction as its games.
  await gamesWrite((s, touch, pos) => { for (const k of ids) s.delete(k); pos.delete(posRange(id)); });
  await tx('bases', 'readwrite', s => s.delete(id));
}

export async function getBase(id) {
  const db = await open();
  return reqToPromise(db.transaction('bases').objectStore('bases').get(id));
}

// --- games ---
// Counts every write to the games store. The Analysis position search keeps an
// index of a base in memory and compares this number to know, without reading
// anything, whether that index can still be trusted.
export let gamesRev = 0;

// gamesRev is forgotten when the app closes, and the position index is kept on
// disk, so each base also has a counter ON DISK ([baseId, 'rev'] in posIndex).
// Every write to the games store goes through here and bumps the counter of the
// base it touches IN THE SAME TRANSACTION — the game and the bump land together
// or not at all. A stored index is trusted only while its 'built' number equals
// that counter, which is what lets an app start skip re-reading the base.
//
// The counter says THAT the base changed; [baseId, 'log'] says WHICH games:
// { since, ids } = the ids of every game of this base written after the counter
// stood at `since`. It lets the search catch up by reading those few games
// instead of walking the base's whole game list. It is kept short: a write
// that does not name its games (a bulk import), or more than LOG_MAX ids,
// drops it, and the search falls back to the walk. Written here, in the same
// transaction as the game, so it cannot miss a write either.
// fn(games, touch, posIndex): call touch(baseId, gameId) for every game written
// — or touch(baseId) alone when the games are too many to name.
const LOG_MAX = 200;
function gamesWrite(fn) {
  gamesRev++;
  return open().then(database => new Promise((resolve, reject) => {
    const t = database.transaction(['games', 'posIndex'], 'readwrite');
    const pos = t.objectStore('posIndex');
    const bases = new Map();   // baseId → { ids (null = not listed), since, ready }
    const saveLog = (baseId, b) => {
      if (b.ids) pos.put({ since: b.since, ids: b.ids }, [baseId, 'log']); else pos.delete([baseId, 'log']);
    };
    const touch = (baseId, id) => {
      if (typeof baseId !== 'number') return;
      let b = bases.get(baseId);
      if (!b) {
        bases.set(baseId, b = { ids: [], since: 0, ready: false });
        const rev = pos.get([baseId, 'rev']);
        rev.onsuccess = () => { b.since = rev.result || 0; pos.put(b.since + 1, [baseId, 'rev']); };
        const log = pos.get([baseId, 'log']);
        log.onsuccess = () => {
          // An existing list carries on; without one, a new list starts here.
          const had = log.result;
          if (had && b.ids) { b.since = had.since; b.ids = [...new Set([...had.ids, ...b.ids])]; }
          if (b.ids && b.ids.length > LOG_MAX) b.ids = null;
          b.ready = true;
          saveLog(baseId, b);
        };
      }
      if (!b.ids) return;
      if (id === undefined) b.ids = null;
      else if (!b.ids.includes(id)) { b.ids.push(id); if (b.ids.length > LOG_MAX) b.ids = null; }
      else return;
      if (b.ready) saveLog(baseId, b);
    };
    const out = fn(t.objectStore('games'), touch, pos);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

// Adds the games and returns their requests. A handful of games are named to
// touch() one by one, as their ids come back; a bulk import is not.
function addAll(s, touch, games) {
  const named = games.length <= LOG_MAX;
  return games.map(g => {
    const req = s.add(g);
    if (named) req.addEventListener('success', () => touch(g.baseId, req.result)); else touch(g.baseId);
    return req;
  });
}

export async function listGames(baseId) {
  const db = await open();
  const idx = db.transaction('games').objectStore('games').index('baseId');
  return reqToPromise(idx.getAll(baseId));
}

export function addGame(game) {
  return gamesWrite((s, touch) => reqToPromise(addAll(s, touch, [game])[0]));
}

export function updateGame(game) {
  return gamesWrite((s, touch) => {
    // The base the game was in before, in case the edit moved it.
    const old = s.get(game.id);
    old.onsuccess = () => { if (old.result) touch(old.result.baseId, game.id); };
    touch(game.baseId, game.id);
    return reqToPromise(s.put(game));
  });
}

export function deleteGame(id) {
  return gamesWrite((s, touch) => {
    const old = s.get(id);
    old.onsuccess = () => { if (old.result) touch(old.result.baseId, id); s.delete(id); };
  });
}

export async function getGame(id) {
  const db = await open();
  return reqToPromise(db.transaction('games').objectStore('games').get(id));
}

export async function addGames(games) {
  return gamesWrite((s, touch) => { addAll(s, touch, games); });
}

// --- the stored position index (see explore-index.js) ---
// Everything stored for one base: its blocks, 'built' and 'rev'.
function posRange(baseId) { return IDBKeyRange.bound([baseId], [baseId, []]); }

// { blocks: [{ n, summaries, counts, hashes }], built, rev, log } — the index
// is up to date exactly when built === rev.
export async function loadPosIndex(baseId) {
  const database = await open();
  const s = database.transaction('posIndex').objectStore('posIndex');
  const [keys, values] = await Promise.all([reqToPromise(s.getAllKeys(posRange(baseId))), reqToPromise(s.getAll(posRange(baseId)))]);
  const out = { blocks: [], built: null, rev: 0, log: null };
  keys.forEach((k, i) => {
    if (k[1] === 'block') out.blocks.push({ n: k[2], ...values[i] });
    else out[k[1]] = values[i];
  });
  return out;
}

// { rev, log } as they stand together (one transaction): the base's counter and
// the list of games written — see gamesWrite(). log is null when there is none.
export async function posIndexChanges(baseId) {
  const database = await open();
  const s = database.transaction('posIndex').objectStore('posIndex');
  const [rev, log] = await Promise.all([reqToPromise(s.get([baseId, 'rev'])), reqToPromise(s.get([baseId, 'log']))]);
  return { rev: rev || 0, log: log || null };
}

// block === null removes it. Rejects (QuotaExceededError) when the device is full.
export function savePosBlock(baseId, n, block) {
  return tx('posIndex', 'readwrite', s => { if (block) s.put(block, [baseId, 'block', n]); else s.delete([baseId, 'block', n]); });
}

// The index now matches the base as it was at counter `rev`. `stored` false =
// the index is in memory only, so nothing is said about the blocks on disk.
// If no game was written since, the list of written games has been used up and
// starts again empty; otherwise it stays, and still covers the newer writes.
export function markPosIndexBuilt(baseId, rev, { stored = true } = {}) {
  return tx('posIndex', 'readwrite', s => {
    if (stored) s.put(rev, [baseId, 'built']);
    const now = s.get([baseId, 'rev']);
    now.onsuccess = () => { if ((now.result || 0) === rev) s.delete([baseId, 'log']); };
  });
}

// Drops the stored blocks but keeps the 'rev' counter counting (and the 'log').
export function clearPosIndex(baseId) {
  return tx('posIndex', 'readwrite', s => { s.delete(IDBKeyRange.bound([baseId, 'block'], [baseId, 'built'])); });
}

// One game as the lists show it: every field EXCEPT the PGN text.
export function gameSummary(g) {
  return { id: g.id, baseId: g.baseId, white: g.white, black: g.black,
           event: g.event, date: g.date, result: g.result, updatedAt: g.updatedAt };
}

// Lightweight list for the games view: every field EXCEPT the PGN text.
// getAll() pulls whole records, and the PGN is ~90% of each one, so listing a
// large base used to drag megabytes of move text into memory just to draw
// names. A cursor lets us keep only what the list actually shows.
export async function listGameSummaries(baseId) {
  const database = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const idx = database.transaction('games').objectStore('games').index('baseId');
    const req = idx.openCursor(IDBKeyRange.only(baseId));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      const g = cur.value;
      out.push(gameSummary(g));
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// Index-backed lookup for the advanced filter. Ranges are resolved by the
// database, so only matching records are read — unlike a full scan, this does
// not get slower as the rest of the base grows.
// `field` must be one of the indexed columns: white, black, event, date, result.
//
// `match` is an optional extra predicate applied to each candidate. It runs
// inside the cursor so `limit` counts games the caller actually wants: capping
// before the predicate would return a short page of mostly-rejected rows.
export async function findGamesBy(baseId, field, { equals, prefix, from, to } = {},
                                  { limit = 500, match = null } = {}) {
  const database = await open();
  let range = null;
  if (equals !== undefined) range = IDBKeyRange.only(equals);
  else if (prefix) range = IDBKeyRange.bound(prefix, prefix + '￿');
  else if (from !== undefined || to !== undefined) {
    range = from !== undefined && to !== undefined ? IDBKeyRange.bound(from, to)
          : from !== undefined ? IDBKeyRange.lowerBound(from) : IDBKeyRange.upperBound(to);
  }
  return new Promise((resolve, reject) => {
    const out = [];
    const req = database.transaction('games').objectStore('games').index(field).openCursor(range);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur || out.length >= limit) { resolve(out); return; }
      const g = cur.value;
      // The index spans every base, so filter to the one being viewed.
      if (g.baseId === baseId) {
        const summary = gameSummary(g);
        if (!match || match(summary)) out.push(summary);
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// Inserts one batch and resolves when the transaction commits, so an import
// can await each chunk instead of opening a single transaction over the whole
// file — which grows unboundedly and can time out.
export function addGamesBatch(games) {
  return gamesWrite((s, touch) => { addAll(s, touch, games); return games.length; });
}

// --- play history (games against the engine) ---
export function addHistoryGame(rec) {
  return tx('playHistory', 'readwrite', s => reqToPromise(s.add(rec)));
}

export async function getHistoryGame(id) {
  const db = await open();
  return reqToPromise(db.transaction('playHistory').objectStore('playHistory').get(id));
}

export function deleteHistoryGame(id) {
  return tx('playHistory', 'readwrite', s => s.delete(id));
}

export function clearHistory() {
  return tx('playHistory', 'readwrite', s => s.clear());
}

// One page of history, newest first by default.
//
// Reads through a cursor on the playedAt index and stops as soon as `count`
// matching records have been collected, so the whole history is never loaded.
// The PGN is stripped: it is roughly 90% of a record and the list never shows
// it, so pulling it would drag megabytes of move text in just to draw cards.
//
// "Load more" re-requests from the top with a larger `count` rather than
// resuming a cursor. Resuming across an await needs continuePrimaryKey and
// breaks if the anchor record was deleted meanwhile; re-scanning a few hundred
// tiny records costs nothing and is the same approach the games list uses.
export async function pageHistory({ count = 30, dir = 'prev', match = null } = {}) {
  const database = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const idx = database.transaction('playHistory').objectStore('playHistory').index('playedAt');
    const req = idx.openCursor(null, dir);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve({ items: out, hasMore: false }); return; }
      const g = cur.value;
      if (!match || match(g)) {
        if (out.length >= count) { resolve({ items: out, hasMore: true }); return; }
        const { pgn, ...summary } = g;
        out.push(summary);
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// --- books (Read tab: the user's own PDF chess books, device-only) ---
//
// A book record is:
//   { id, name, blob (the PDF), size, cover (dataURL thumb), pageCount,
//     page (last page read, 1-based), addedAt, openedAt }
// The Blob is the only heavy field, so the shelf reads SUMMARIES (everything
// but the Blob) and only getBook() pulls the PDF itself.

// Shelf list, most-recently-opened first, WITHOUT the PDF Blob. A cursor lets
// us keep only the light fields — pulling whole records would drag every book's
// megabytes into memory just to draw cards.
export async function listBookSummaries() {
  const database = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const idx = database.transaction('books').objectStore('books').index('openedAt');
    const req = idx.openCursor(null, 'prev'); // newest openedAt first
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      const { blob, ...summary } = cur.value;
      out.push(summary);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// Adds one book and resolves with its new id. A book is 5–50 MB, so a
// QuotaExceededError can land mid-write. This is a single-record transaction,
// so IndexedDB aborts and rolls the partial write back automatically — nothing
// half-written lingers and the other books are untouched. The rejection
// carries that error up so the caller can tell the user; there is no partial
// record to clean up by hand.
export function addBook(rec) {
  return open().then(database => new Promise((resolve, reject) => {
    const t = database.transaction('books', 'readwrite');
    const s = t.objectStore('books');
    const req = s.add(rec);
    let id = null;
    req.onsuccess = () => { id = req.result; };
    t.oncomplete = () => resolve(id);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

export async function getBook(id) {
  const db = await open();
  return reqToPromise(db.transaction('books').objectStore('books').get(id));
}

// Patches metadata (page position, openedAt, name) without touching the Blob.
// Reads the record, merges, writes it back — the Blob rides along untouched.
export function updateBookMeta(id, patch) {
  return tx('books', 'readwrite', s => {
    s.get(id).onsuccess = function () {
      const b = this.result;
      if (b) { Object.assign(b, patch); s.put(b); }
    };
  });
}

export function deleteBook(id) {
  return tx('books', 'readwrite', s => s.delete(id));
}

// --- key/value (settings, puzzle progress) ---
export async function kvGet(key, def = null) {
  const db = await open();
  const v = await reqToPromise(db.transaction('kv').objectStore('kv').get(key));
  return v === undefined ? def : v;
}

let syncHook = null;
// Called on every kvSet with (key, value); wired up by the Firebase sync layer
// so cloud-tracked keys mirror to Firestore without touching every call site.
export function setSyncHook(fn) { syncHook = fn; }

export async function kvSet(key, value) {
  await tx('kv', 'readwrite', s => s.put(value, key));
  if (syncHook) syncHook(key, value);
}

// Wipes every local store (settings/progress, imported databases, saved
// games) — used for account deletion, so nothing lingers on the device
// once the cloud account and its data are gone.
export async function clearAllLocalData() {
  const database = await open();
  await Promise.all(['bases', 'games', 'kv', 'playHistory', 'books', 'posIndex'].map(store => new Promise((resolve, reject) => {
    const t = database.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  })));
}

// Clears only synced profile/settings data (name, ELO, streaks, avatar,
// etc.) — used on sign-out so a different account signing in next on the
// same device can't inherit or contaminate a previous identity's stats.
// Leaves imported bases/games alone since those were never tied to the
// account and signing out shouldn't destroy unsynced local work.
export async function clearSyncedProfileData() {
  const database = await open();
  await new Promise((resolve, reject) => {
    const t = database.transaction('kv', 'readwrite');
    t.objectStore('kv').clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
