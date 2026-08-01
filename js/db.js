// IndexedDB storage: databases ("bases") of games + puzzle progress + settings.
const DB_NAME = 'mi-ajedrez';
// v2 adds search indexes on the games store so filtering can be done by the
// database instead of scanning every record in memory.
const DB_VER = 2;

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
  const games = await listGames(id);
  await tx('games', 'readwrite', s => { for (const g of games) s.delete(g.id); });
  await tx('bases', 'readwrite', s => s.delete(id));
}

export async function getBase(id) {
  const db = await open();
  return reqToPromise(db.transaction('bases').objectStore('bases').get(id));
}

// --- games ---
export async function listGames(baseId) {
  const db = await open();
  const idx = db.transaction('games').objectStore('games').index('baseId');
  return reqToPromise(idx.getAll(baseId));
}

export function addGame(game) {
  return tx('games', 'readwrite', s => reqToPromise(s.add(game)));
}

export function updateGame(game) {
  return tx('games', 'readwrite', s => reqToPromise(s.put(game)));
}

export function deleteGame(id) {
  return tx('games', 'readwrite', s => s.delete(id));
}

export async function getGame(id) {
  const db = await open();
  return reqToPromise(db.transaction('games').objectStore('games').get(id));
}

export async function addGames(games) {
  return tx('games', 'readwrite', s => { for (const g of games) s.add(g); });
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
      out.push({ id: g.id, baseId: g.baseId, white: g.white, black: g.black,
                 event: g.event, date: g.date, result: g.result, updatedAt: g.updatedAt });
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
        const summary = { id: g.id, baseId: g.baseId, white: g.white, black: g.black,
                          event: g.event, date: g.date, result: g.result, updatedAt: g.updatedAt };
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
  return open().then(database => new Promise((resolve, reject) => {
    const t = database.transaction('games', 'readwrite');
    const s = t.objectStore('games');
    for (const g of games) s.add(g);
    t.oncomplete = () => resolve(games.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
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
  await Promise.all(['bases', 'games', 'kv'].map(store => new Promise((resolve, reject) => {
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
