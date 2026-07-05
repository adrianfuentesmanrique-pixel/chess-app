// IndexedDB storage: databases ("bases") of games + puzzle progress + settings.
const DB_NAME = 'mi-ajedrez';
const DB_VER = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      const bases = db.createObjectStore('bases', { keyPath: 'id', autoIncrement: true });
      bases.createIndex('name', 'name');
      const games = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
      games.createIndex('baseId', 'baseId');
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

// --- key/value (settings, puzzle progress) ---
export async function kvGet(key, def = null) {
  const db = await open();
  const v = await reqToPromise(db.transaction('kv').objectStore('kv').get(key));
  return v === undefined ? def : v;
}

export function kvSet(key, value) {
  return tx('kv', 'readwrite', s => s.put(value, key));
}
