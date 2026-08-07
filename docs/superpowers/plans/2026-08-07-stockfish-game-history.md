# Stockfish Game History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game played against Stockfish is saved automatically and can be browsed, filtered and replayed from a Game History screen inside the Play tab.

**Architecture:** A new `playHistory` IndexedDB store (DB v2 → v3) holds one record per game, with the PGN as the source of truth and every other field derived from it. A new module `js/history.js` owns the record building and the history screen; `js/db.js` gains the store access; `js/app.js` receives only small hooks. Replay reuses the existing `Analysis` screen through a new `historyId` context, mirroring how games opened from the Databases tab already work.

**Tech Stack:** Vanilla ES modules, no build step, no package manager. IndexedDB via `js/db.js`. `chess.js` from `vendor/`. Bilingual through `js/i18n.js`.

**Spec:** `docs/superpowers/specs/2026-08-07-stockfish-game-history-design.md`

## Global Constraints

- **There is no test framework in this repo** — no `package.json`, no test runner, no test directory. "Verify" always means: run the dev server and check in the browser pane. Every task ends with explicit browser verification steps and expected output. Do not invent a test framework.
- **Never read `js/app.js` whole** — it is 236 KB (~58k tokens). Grep for the symbol, then Read with `offset`/`limit`.
- **Never read** `js/endgames-data.js`, `puzzles/*.json`, or `graphify-out/graph.json`.
- **Mobile-first:** judge every UI change at 375px width first, in **both** light and dark mode.
- **Design language:** navy and gold, Kael. Reuse existing classes (`.list-item`, `.seg`, `.btn`, `.toolbar`, `.hint`) and existing CSS variables (`--success`, `--danger`, `--warning`, `--muted`, `--panel`, `--text`, `--accent`). Do not invent a new visual style.
- **Offline-first PWA:** no CDN, no external API, no placeholder images.
- **Bilingual:** every user-visible string goes in `js/i18n.js` with both `es` and `en`. No hardcoded English or Spanish in `js/history.js`.
- **Do not rename `'endgame'`** or any other storage key.
- **`sw.js` cache version is currently `chess-training-center-v22`** (the `v11` in `HANDOVER.md` is stale — trust the file).
- Branch: `feature/stockfish-game-history`, already created. Commit after every task.

### Verified facts — do not re-derive

- `vendor/chess.js` exposes all four draw checks: `isStalemate()`, `isThreefoldRepetition()`, `isInsufficientMaterial()`, `isDrawByFiftyMoves()`, plus `isDraw()` and `isCheckmate()`.
- `LEVELS` (`js/app.js:1218`) has 8 entries, indices 0-7. `LEVELS[7].elo` is `null` ("Maximum").
- `t('level_names')` (`js/i18n.js:120`) returns an 8-entry array matching those indices.
- The player's display name is `await db.kvGet('profileName', '')`.
- Dev server: `preview_start` with `{name: "chess-app"}` → http://localhost:8811 (from `.claude/launch.json`).
- `icons/kael/kael-bust.png` exists. `.kael-portrait` exists at `css/style.css:500`. `.kael-empty` does **not** exist and must be added.
- `.filter-chip` exists at `css/style.css:264`, with `.filter-chip button` at `:269`.
- `#ana-base-nav` is at `index.html:119-128`.

### The module boundary — read before Task 3

**`js/app.js` currently exports nothing.** It is the entry module. Since `js/app.js` will import `js/history.js`, and `js/history.js` needs helpers that live in `js/app.js`, the two modules form an import cycle.

**This cycle is safe and is the approach to take.** ES module bindings are live, and every one of these helpers is either a hoisted `function` declaration or an object that `js/history.js` only touches inside event handlers — i.e. long after both modules have finished evaluating. `js/history.js` must not call any of them at module top level.

So in `js/app.js`, add the `export` keyword to these existing declarations, changing nothing else about them:

```
toast (line 103), modal (111), askConfirm (219), sheet (232),
segInit (1206), segValue (1215), esc, parsePgn, sharePgnText,
treeFromHistory, and `const Analysis`
```

Then in `js/history.js`:

```js
import { toast, modal, askConfirm, sheet, segInit, segValue,
         parsePgn, sharePgnText, Analysis } from './app.js';
```

Do **not** copy these helpers into `js/history.js`, and do **not** create a `js/ui.js` — moving code out of `js/app.js` is a separate refactor that `HANDOVER.md` says needs its own dedicated session. `esc()` is the one exception: `js/history.js` defines its own four-line copy so the list can render before the cycle resolves.

If the app fails to load with a `Cannot access '...' before initialization` error, the cause is `js/history.js` touching an `js/app.js` binding at module top level — move that access inside a function.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `js/db.js` | Modify | DB v3 migration; raw `playHistory` store access. Owns the IndexedDB connection, so store access must live here — `open()` is module-private. |
| `js/history.js` | Create | Record building, formatting, and the Game History screen. Everything history-specific that is not raw storage. |
| `js/app.js` | Modify | Save hooks in `Play`; history context in `Analysis`; `View PGN` menu item. Small, surgical edits only. |
| `index.html` | Modify | `#play-history` panel markup, the 📜 button, the `ana-hist-nav` bar. |
| `css/style.css` | Modify | History card styles (result bar, layout). |
| `js/i18n.js` | Modify | English and Spanish strings. |
| `sw.js` | Modify | Precache `js/history.js`; bump cache version. |

---

## Task 1: Storage and saving (no UI)

**Files:**
- Modify: `js/db.js` — `DB_VER`, `onupgradeneeded`, `clearAllLocalData()`; add history functions at the end
- Create: `js/history.js`
- Modify: `js/app.js` — `Play.begin()`, `Play.finish()`, `#play-back` handler in `Play.init()`
- Modify: `sw.js` — `CACHE` version and `ASSETS`

**Interfaces:**
- Consumes: nothing (first task).
- Produces, from `js/db.js`:
  - `addHistoryGame(rec) -> Promise<number>` (the new `id`)
  - `getHistoryGame(id) -> Promise<record|undefined>`
  - `deleteHistoryGame(id) -> Promise<void>`
  - `clearHistory() -> Promise<void>`
  - `pageHistory({ count = 30, dir = 'prev', match = null }) -> Promise<{ items: summary[], hasMore: boolean }>` where a `summary` is the record **without** `pgn`
- Produces, from `js/history.js`:
  - `buildRecord({ chess, startFen, playerColor, level, playedAt, resigned, abandoned, profileName }) -> record`
  - `saveGame(rec) -> Promise<number>`
  - `HISTORY_MIN_PLIES = 4`

- [x] **Step 1: Bump the DB version and add the store**

In `js/db.js`, change line 5:

```js
const DB_VER = 3;
```

Update the comment above it:

```js
// v2 adds search indexes on the games store so filtering can be done by the
// database instead of scanning every record in memory.
// v3 adds the playHistory store for games played against the engine.
const DB_VER = 3;
```

Then inside `onupgradeneeded`, after the existing `if (e.oldVersion < 2) { ... }` block, add:

```js
      if (e.oldVersion < 3) {
        const hist = db.createObjectStore('playHistory', { keyPath: 'id', autoIncrement: true });
        hist.createIndex('playedAt', 'playedAt');
        hist.createIndex('outcome', 'outcome');
        hist.createIndex('playerColor', 'playerColor');
        hist.createIndex('level', 'level');
        hist.createIndex('opening', 'opening');
      }
```

- [x] **Step 2: Add the history store functions to `js/db.js`**

Append after the `addGamesBatch` function, before the `// --- key/value ---` section:

```js
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
```

- [x] **Step 3: Include the new store in the wipe**

In `js/db.js`, in `clearAllLocalData()`, change the store list:

```js
  await Promise.all(['bases', 'games', 'kv', 'playHistory'].map(store => new Promise((resolve, reject) => {
```

Leave `clearSyncedProfileData()` alone — history is local work, not account identity, so signing out must not delete it.

- [x] **Step 4: Create `js/history.js` with record building**

```js
// Game history: every game played against the engine, stored locally.
//
// The PGN is the source of truth and every other field is derived from it.
// That is what keeps future work cheap: a cloud backup uploads these records
// as they stand, imported or human games are the same record with a different
// `source`, and favorites/notes/analysis are new optional fields. None of
// those need a migration.
import * as db from './db.js';
import { classifyOpening } from './openings-eco.js';

export const HISTORY_VERSION = 1;

// A game shorter than this was a misclick, not a game.
export const HISTORY_MIN_PLIES = 4;

function newUid() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Why the game stopped. Order matters: checkmate outranks everything, and a
// resignation is a player decision that no position check can detect.
export function endReasonOf(chess, { resigned = false, abandoned = false } = {}) {
  if (chess.isCheckmate()) return 'checkmate';
  if (resigned) return 'resign';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isDrawByFiftyMoves()) return 'fiftyMove';
  if (chess.isDraw()) return 'draw';
  if (abandoned) return 'abandoned';
  return 'abandoned';
}

// `result` is the PGN-standard string; `outcome` is the same fact from the
// player's point of view, which is what the filters use.
export function resultOf(chess, playerColor, { resigned = false } = {}) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w';
    return { result: winner === 'w' ? '1-0' : '0-1',
             outcome: winner === playerColor ? 'win' : 'loss' };
  }
  if (resigned) {
    return { result: playerColor === 'w' ? '0-1' : '1-0', outcome: 'loss' };
  }
  if (chess.isDraw() || chess.isStalemate()) {
    return { result: '1/2-1/2', outcome: 'draw' };
  }
  return { result: '*', outcome: 'unfinished' };
}

export function buildRecord({ chess, startFen, playerColor, level, levelElo,
                              playedAt, pgn, resigned = false, abandoned = false }) {
  const history = chess.history();
  const { result, outcome } = resultOf(chess, playerColor, { resigned });
  return {
    uid: newUid(),
    version: HISTORY_VERSION,
    source: 'stockfish',
    playedAt,
    endedAt: Date.now(),
    playerColor,
    level,
    levelElo,
    result,
    outcome,
    endReason: endReasonOf(chess, { resigned, abandoned }),
    moveCount: Math.ceil(history.length / 2),
    opening: classifyOpening(history) || '',
    startFen,
    finalFen: chess.fen(),
    pgn,
  };
}

export function saveGame(rec) {
  return db.addHistoryGame(rec);
}
```

- [x] **Step 5: Wire the save into `Play`**

In `js/app.js`, find `const Play = {` (around line 2273).

Add `playedAt: 0,` and `saved: false,` to the property block at the top, after `thinking: false,`.

In `Play.begin()`, after `this.thinking = false;` add:

```js
    this.playedAt = Date.now();
    this.saved = false;
```

Add this method to `Play`, immediately after `finish()`:

```js
  // Saves the finished game to history. `resigned` and `abandoned` are the two
  // things the final position cannot tell us. Guarded by `saved` so a game
  // cannot be recorded twice — leaving the screen after a normal finish must
  // not add a second, "abandoned" copy of the same game.
  async saveToHistory({ resigned = false, abandoned = false } = {}) {
    if (this.saved || !this.chess) return;
    const hist = this.chess.history();
    if (hist.length < History.HISTORY_MIN_PLIES) return;
    this.saved = true;
    try {
      const profileName = await db.kvGet('profileName', '');
      const me = profileName || t('history_you');
      const bot = t('history_bot_name').replace('{lvl}', t('level_names')[this.level]);
      const tree = treeFromHistory(this.startFen, hist);
      tree.setHeader('White', this.playerColor === 'w' ? me : bot);
      tree.setHeader('Black', this.playerColor === 'b' ? me : bot);
      tree.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
      tree.setHeader('Event', t('history_event'));
      const rec = History.buildRecord({
        chess: this.chess,
        startFen: this.startFen,
        playerColor: this.playerColor,
        level: this.level,
        levelElo: LEVELS[this.level].elo,
        playedAt: this.playedAt,
        pgn: '',
        resigned, abandoned,
      });
      tree.setHeader('Result', rec.result);
      rec.pgn = tree.toPgn();
      await History.saveGame(rec);
    } catch (e) {
      console.error('history save failed', e);
    }
  },
```

At the end of `Play.finish(msg)`, after the existing `if (hist.length >= 4) { GameReview.open({...}); }` block, add:

```js
    this.saveToHistory({ resigned: msg === t('you_resigned') });
```

Replace the `#play-back` handler in `Play.init()`:

```js
    $('play-back').onclick = () => {
      engine.stop();
      if (!this.over) this.saveToHistory({ abandoned: true });
      $('play-game').classList.add('hidden');
      $('play-setup').classList.remove('hidden');
    };
```

- [x] **Step 6: Import the module in `js/app.js`**

Add near the other imports at the top of `js/app.js` (the `classifyOpening` import is at line 16):

```js
import * as History from './history.js';
```

- [x] **Step 7: Add the strings used above to `js/i18n.js`**

Add to `DICT`:

```js
  history_you: { es: 'Tú', en: 'You' },
  history_bot_name: { es: 'Bot {lvl}', en: '{lvl} bot' },
  history_event: { es: 'Partida contra el motor', en: 'Game vs engine' },
```

- [x] **Step 8: Precache the new module and bump the cache**

In `sw.js`, change line 1:

```js
const CACHE = 'chess-training-center-v23';
```

and add to `ASSETS`, after `'js/db.js',`:

```js
  'js/history.js',
```

Missing this breaks the app offline for every existing user.

- [x] **Step 9: Verify — a decisive win**

Start the server (`preview_start` with `{name: "chess-app"}`), open http://localhost:8811, go to the **Play** tab, pick **Beginner**, and play a short game to checkmate (Scholar's mate: e4 e5, Bc4, Qh5, Qxf7#).

Then in the browser console:

```js
const r = indexedDB.open('mi-ajedrez');
r.onsuccess = () => r.result.transaction('playHistory').objectStore('playHistory').getAll().onsuccess = e => console.table(e.target.result);
```

Expected: **one row**, with `outcome: 'win'`, `endReason: 'checkmate'`, `result: '1-0'`, `level: 0`, `playerColor: 'w'`, `moveCount: 4`, a non-empty `pgn`, and `opening` set. Confirm `endedAt > playedAt`.

- [x] **Step 10: Verify — resignation, abandonment, and the double-save guard**

1. Start a new game, play 3 full moves, press **Resign**, confirm.
2. Then press **Back**.
3. Start another game, play 3 full moves, press **Back** without finishing.
4. Start another game, play **one** move only, press **Back**.

Re-run the console query. Expected: **exactly three rows total** (the win, the resignation, the abandonment).
- The resignation row: `outcome: 'loss'`, `endReason: 'resign'`, and `result` is `0-1` if you played White.
- The abandoned row: `outcome: 'unfinished'`, `endReason: 'abandoned'`, `result: '*'`.
- **No fourth row** — the one-move game is below the threshold, and pressing Back after the resignation must NOT have added a duplicate. If there are four rows, the `saved` guard is wrong.

- [x] **Step 11: Verify the upgrade path**

The migration matters more than the feature: an existing user must not lose data. In the console:

```js
const q = indexedDB.open('mi-ajedrez');
q.onsuccess = () => console.log('version', q.result.version, [...q.result.objectStoreNames]);
```

Expected: `version 3` and `['bases', 'games', 'kv', 'playHistory']`. Then open the **Databases** tab and confirm any existing databases and games are still listed, and the **Profile** tab still shows your ELO and streak.

- [x] **Step 12: Commit**

```bash
git add js/db.js js/history.js js/app.js js/i18n.js sw.js
git commit -m "feat(history): save games against the engine to a playHistory store"
```

---

## Task 2: The Game History list

**Files:**
- Modify: `index.html` — the 📜 button in `#play-setup`, the `#play-history` panel
- Modify: `js/history.js` — the screen module
- Modify: `js/app.js` — `Play.init()` wires the button; `History.init()` is called at startup
- Modify: `css/style.css` — card styles
- Modify: `js/i18n.js` — strings

**Interfaces:**
- Consumes: `db.pageHistory({ count, dir, match })`, `db.deleteHistoryGame(id)` from Task 1.
- Produces:
  - `History.init()` — binds the screen once at startup
  - `History.open()` — shows the history panel and loads page one
  - `History.close()` — returns to the Play setup panel
  - `History.formatDuration(ms) -> string`, `History.formatWhen(ms) -> string`
  - `History.namesFor(rec) -> { white, black }`
  - `History.state.items` — the currently loaded summaries, in display order (Task 4 uses this for prev/next)

- [ ] **Step 1: Add the entry button**

In `index.html`, inside `#play-setup`, replace the Start Game button line (currently line 256) with:

```html
      <button id="play-start" class="btn primary big" data-i18n="start_game"></button>
      <button id="play-history-btn" class="btn big" data-i18n="history_title"></button>
```

- [ ] **Step 2: Add the history panel**

In `index.html`, immediately after the closing `</div>` of `#play-game` and before `</section>` (currently line 282-283), add:

```html
    <div id="play-history" class="hidden">
      <div class="nav-row">
        <button id="hist-back" class="nav-back" data-i18n-aria="back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span data-i18n="back"></span>
        </button>
      </div>
      <h2 data-i18n="history_title"></h2>
      <div id="hist-list"></div>
    </div>
```

The filter controls are deliberately not here yet — Task 3 adds them.

- [ ] **Step 3: Add the strings**

In `js/i18n.js`, add to `DICT`:

```js
  history_title: { es: '📜 Historial de partidas', en: '📜 Game History' },
  history_empty: { es: 'Aún no hay partidas. Gáname y lo recordaré.', en: "No games yet. Beat me and I'll remember it." },
  history_moves: { es: 'jugadas', en: 'moves' },
  history_today: { es: 'Hoy', en: 'Today' },
  history_yesterday: { es: 'Ayer', en: 'Yesterday' },
  history_end_checkmate: { es: 'Jaque mate', en: 'Checkmate' },
  history_end_resign: { es: 'Abandono', en: 'Resigned' },
  history_end_stalemate: { es: 'Ahogado', en: 'Stalemate' },
  history_end_repetition: { es: 'Triple repetición', en: 'Threefold repetition' },
  history_end_fiftyMove: { es: 'Regla de 50 jugadas', en: 'Fifty-move rule' },
  history_end_insufficient: { es: 'Material insuficiente', en: 'Insufficient material' },
  history_end_draw: { es: 'Tablas', en: 'Draw' },
  history_end_abandoned: { es: 'Sin terminar', en: 'Unfinished' },
  history_end_timeout: { es: 'Tiempo agotado', en: 'Time forfeit' },
  history_load_more: { es: 'Cargar más', en: 'Load more' },
  history_delete_confirm: { es: '¿Borrar esta partida del historial?', en: 'Delete this game from your history?' },
```

- [ ] **Step 4: Add the card styles**

In `css/style.css`, append:

```css
/* ── Game history cards ─────────────────────────────── */
/* Built on .list-item so light/dark, spacing and press feedback are inherited.
   The result is carried by a thick right-edge bar: at 375px a colour you can
   spot while scrolling beats a word you have to read. */
.hist-item {
  position: relative;
  padding-right: 16px;
  border-right: 6px solid var(--muted);
}
.hist-item.win { border-right-color: var(--success); }
.hist-item.loss { border-right-color: var(--danger); }
.hist-item.draw { border-right-color: var(--muted); }
.hist-item.unfinished { border-right-color: var(--warning); }

.hist-players {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-weight: 600;
}
.hist-players .hist-result {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hist-line2 { font-size: .88em; opacity: .85; }
.hist-meta { font-size: .82em; opacity: .65; }
```

- [ ] **Step 5: Write the screen module**

Append to `js/history.js`. **Move the `import` line up to join the existing imports at the top of the file** — mid-file imports are legal but the rest of this codebase keeps them together:

```js
import { t } from './i18n.js';

const $ = id => document.getElementById(id);

const PAGE = 30;

export const state = {
  items: [],      // loaded summaries, in display order
  count: PAGE,    // how many are requested
  hasMore: false,
  dir: 'prev',    // 'prev' = newest first
};

export function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Friendly and short: the year is noise for a game played this morning.
export function formatWhen(ms) {
  const d = new Date(ms);
  const time = d.toTimeString().slice(0, 5);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  if (ms >= startOfToday.getTime()) return `${t('history_today')} ${time}`;
  if (ms >= startOfToday.getTime() - dayMs) return `${t('history_yesterday')} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

// The engine's name carries the difficulty, and the order of the two names
// carries the player's colour — which is why the card shows neither a level
// label nor a colour dot.
export function namesFor(rec) {
  const me = t('history_you');
  const bot = t('history_bot_name').replace('{lvl}', t('level_names')[rec.level]);
  return rec.playerColor === 'w' ? { white: me, black: bot } : { white: bot, black: me };
}

function displayResult(rec) {
  return rec.result === '1/2-1/2' ? '½-½' : rec.result;
}

export function init() {
  $('hist-back').onclick = () => close();
}

export function open() {
  $('play-setup').classList.add('hidden');
  $('play-game').classList.add('hidden');
  $('play-history').classList.remove('hidden');
  state.count = PAGE;
  load();
}

export function close() {
  $('play-history').classList.add('hidden');
  $('play-setup').classList.remove('hidden');
}

export async function load() {
  const { items, hasMore } = await db.pageHistory({ count: state.count, dir: state.dir });
  state.items = items;
  state.hasMore = hasMore;
  render();
}

function render() {
  const el = $('hist-list');
  el.innerHTML = '';
  if (!state.items.length) {
    el.innerHTML = `<div class="kael-empty">
      <img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael">
      <p class="hint">${esc(t('history_empty'))}</p>
    </div>`;
    return;
  }
  for (const rec of state.items) el.appendChild(card(rec));
  if (state.hasMore) {
    const more = document.createElement('button');
    more.className = 'btn';
    more.style.cssText = 'margin-top:8px; width:100%';
    more.textContent = t('history_load_more');
    more.onclick = () => { state.count += PAGE; load(); };
    el.appendChild(more);
  }
}

function card(rec) {
  const { white, black } = namesFor(rec);
  const line2 = rec.opening || t(`history_end_${rec.endReason}`);
  const meta = [
    `${rec.moveCount} ${t('history_moves')}`,
    formatDuration(rec.endedAt - rec.playedAt),
    formatWhen(rec.playedAt),
  ].filter(Boolean).join(' · ');

  const item = document.createElement('button');
  item.className = `list-item hist-item ${rec.outcome}`;
  item.innerHTML =
    `<span class="hist-players"><span class="ellipsis">${esc(white)} – ${esc(black)}</span>` +
    `<span class="hist-result">${esc(displayResult(rec))}</span></span>` +
    `<span class="hist-line2 ellipsis">${esc(line2)}</span>` +
    `<span class="hist-meta">${esc(meta)}</span>`;
  return item;
}

// Local copy: js/app.js keeps esc() private, and importing app.js here would
// create a circular import.
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
```

Tapping a card does nothing yet — Task 4 wires it.

- [ ] **Step 6: Add the empty-state style**

`icons/kael/kael-bust.png` exists and `.kael-portrait` is already defined at `css/style.css:500`, so both are reused as written above. Only the wrapper is missing. Append to `css/style.css`:

```css
.kael-empty { text-align: center; padding: 32px 16px; }
.kael-empty .kael-portrait { width: 96px; height: auto; opacity: .9; margin-bottom: 12px; }
```

- [ ] **Step 7: Wire the button and startup**

In `js/app.js`, in `Play.init()`, add:

```js
    $('play-history-btn').onclick = () => History.open();
```

Find where the other modules are initialised at startup (`grep -n "Play.init()" js/app.js`) and add `History.init();` next to it, in the same block.

- [ ] **Step 8: Verify the list**

Reload http://localhost:8811. You should already have three games from Task 1. Open **Play → 📜 Game History**.

Expected:
- Three cards, **newest first**.
- The win card reads `You – Beginner bot` with `1-0` on the right and a **green** right bar.
- The abandoned card shows `*` and an **amber** bar.
- Line 2 shows an opening name, or an end reason when the opening is unrecognised.
- Line 3 reads like `4 moves · 0:38 · Today 18:22`.
- **Back** returns to the Play setup screen.

- [ ] **Step 9: Verify the empty state and both colour modes**

Resize the browser to **375px**. Check the cards in **light mode**, then switch the app to **dark mode** and check again: the result bars must stay clearly distinguishable and no text may overflow its card.

Then wipe history to see the empty state:

```js
const r = indexedDB.open('mi-ajedrez');
r.onsuccess = () => r.result.transaction('playHistory', 'readwrite').objectStore('playHistory').clear();
```

Reload and reopen the history. Expected: Kael's portrait and the "No games yet" line, no error in the console. Then play one more short game so later tasks have data.

- [ ] **Step 10: Verify Spanish**

Switch the app language to Spanish and reopen the history. Expected: the title reads *Historial de partidas*, the bot is *Bot Principiante*, the date reads *Hoy*, and **no English leaks through**.

- [ ] **Step 11: Commit**

```bash
git add index.html js/history.js js/app.js js/i18n.js css/style.css
git commit -m "feat(history): add the Game History list to the Play tab"
```

---

## Task 3: Filters and sorting

**Files:**
- Modify: `index.html` — the chip row, the Filters button, the active-filter chip
- Modify: `js/history.js` — filter state, the predicate, the filter sheet
- Modify: `js/i18n.js` — strings

**Interfaces:**
- Consumes: `state`, `load()`, `render()` from Task 2; `db.pageHistory({ match })`, `db.clearHistory()` from Task 1.
- Produces:
  - `state.filter` — `{ outcome, playerColor, level, opening, from, to }`, any field `null`/`''` meaning "any"
  - `matcher() -> (rec) => boolean`, passed to `db.pageHistory` as `match`

- [ ] **Step 1: Add the controls**

In `index.html`, inside `#play-history`, between the `<h2>` and `<div id="hist-list">`, add:

```html
      <div class="seg scroll" id="hist-chips">
        <button data-v="" class="on" data-i18n="hist_all"></button>
        <button data-v="win" data-i18n="hist_wins"></button>
        <button data-v="loss" data-i18n="hist_losses"></button>
        <button data-v="draw" data-i18n="hist_draws"></button>
      </div>
      <div class="row">
        <button id="hist-filters" class="btn" data-i18n="hist_filters"></button>
        <button id="hist-sort" class="btn" data-i18n="hist_newest"></button>
      </div>
      <div id="hist-filter-chip" class="filter-chip hidden"></div>
```

`filter-chip` is the existing class the Databases tab uses, defined at `css/style.css:264`. No new CSS is needed for it.

- [ ] **Step 2: Add the strings**

```js
  hist_all: { es: 'Todas', en: 'All' },
  hist_wins: { es: 'Victorias', en: 'Wins' },
  hist_losses: { es: 'Derrotas', en: 'Losses' },
  hist_draws: { es: 'Tablas', en: 'Draws' },
  hist_filters: { es: '⚙ Filtros', en: '⚙ Filters' },
  hist_newest: { es: 'Recientes', en: 'Newest' },
  hist_oldest: { es: 'Antiguas', en: 'Oldest' },
  hist_any: { es: 'Cualquiera', en: 'Any' },
  hist_color: { es: 'Color', en: 'Colour' },
  hist_level: { es: 'Nivel', en: 'Level' },
  hist_opening: { es: 'Apertura', en: 'Opening' },
  hist_from: { es: 'Desde', en: 'From' },
  hist_to: { es: 'Hasta', en: 'To' },
  hist_apply: { es: 'Aplicar', en: 'Apply' },
  hist_clear: { es: 'Limpiar', en: 'Clear' },
  hist_delete_all: { es: '🗑 Borrar todo el historial', en: '🗑 Delete all history' },
  hist_delete_all_confirm: { es: '¿Borrar TODAS las partidas del historial? No se puede deshacer.', en: 'Delete ALL games from your history? This cannot be undone.' },
  hist_none_match: { es: 'Ninguna partida coincide con el filtro.', en: 'No games match this filter.' },
```

- [ ] **Step 3: Add filter state and the predicate**

In `js/history.js`, extend `state`:

```js
export const state = {
  items: [],
  count: PAGE,
  hasMore: false,
  dir: 'prev',
  filter: { outcome: '', playerColor: '', level: '', opening: '', from: '', to: '' },
};
```

Add:

```js
// One predicate for every filter, run inside the cursor. Deliberately not
// index-per-filter: a single predicate is correct for every combination of
// filters, and the cursor still stops as soon as a page is full.
export function matcher() {
  const f = state.filter;
  const active = Object.values(f).some(v => v !== '' && v != null);
  if (!active) return null;
  const wantOpening = String(f.opening ?? '').toLowerCase();
  const fromMs = f.from ? new Date(f.from).setHours(0, 0, 0, 0) : null;
  const toMs = f.to ? new Date(f.to).setHours(23, 59, 59, 999) : null;
  return (rec) => {
    if (f.outcome && rec.outcome !== f.outcome) return false;
    if (f.playerColor && rec.playerColor !== f.playerColor) return false;
    if (f.level !== '' && f.level != null && rec.level !== +f.level) return false;
    if (wantOpening && !String(rec.opening ?? '').toLowerCase().includes(wantOpening)) return false;
    if (fromMs !== null && rec.playedAt < fromMs) return false;
    if (toMs !== null && rec.playedAt > toMs) return false;
    return true;
  };
}
```

Change `load()` to use it:

```js
export async function load() {
  const { items, hasMore } = await db.pageHistory({
    count: state.count, dir: state.dir, match: matcher(),
  });
  state.items = items;
  state.hasMore = hasMore;
  renderFilterChip();
  render();
}
```

In `render()`, distinguish "no games at all" from "nothing matched":

```js
  if (!state.items.length) {
    if (matcher()) {
      el.innerHTML = `<p class="hint">${esc(t('hist_none_match'))}</p>`;
      return;
    }
    el.innerHTML = `<div class="kael-empty">
      <img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael">
      <p class="hint">${esc(t('history_empty'))}</p>
    </div>`;
    return;
  }
```

- [ ] **Step 4: Wire the chips and the sort toggle**

Add to `init()`:

```js
  segInit($('hist-chips'));
  $('hist-chips').addEventListener('click', () => {
    state.filter.outcome = segValue($('hist-chips')) ?? '';
    state.count = PAGE;
    load();
  });
  $('hist-sort').onclick = () => {
    state.dir = state.dir === 'prev' ? 'next' : 'prev';
    $('hist-sort').textContent = t(state.dir === 'prev' ? 'hist_newest' : 'hist_oldest');
    state.count = PAGE;
    load();
  };
  $('hist-filters').onclick = () => openFilters();
```

`segInit` and `segValue` come from `js/app.js` — see **The module boundary** in Global Constraints. Export them there and import them here; do not copy them.

- [ ] **Step 5: The filter sheet**

Add to `js/history.js`:

```js
// Mirrors Base.openAdvanced() in js/app.js: same modal, same Apply/Clear row,
// same active-chip feedback — so this screen behaves like one the user knows.
function openFilters() {
  modal((box, close) => {
    const f = state.filter;
    box.innerHTML = `<h3>${esc(t('hist_filters'))}</h3>`;

    const label = (text) => {
      const l = document.createElement('label');
      l.className = 'hint';
      l.style.cssText = 'display:block; margin:8px 0 2px;';
      l.textContent = text;
      return l;
    };

    const colorSeg = document.createElement('div');
    colorSeg.className = 'seg';
    for (const [v, key] of [['', 'hist_any'], ['w', 'white'], ['b', 'black']]) {
      const b = document.createElement('button');
      b.dataset.v = v;
      b.textContent = t(key);
      if ((f.playerColor ?? '') === v) b.classList.add('on');
      colorSeg.appendChild(b);
    }
    segInit(colorSeg);
    box.append(label(t('hist_color')), colorSeg);

    const levelSel = document.createElement('select');
    levelSel.className = 'input';
    const anyOpt = document.createElement('option');
    anyOpt.value = ''; anyOpt.textContent = t('hist_any');
    levelSel.appendChild(anyOpt);
    t('level_names').forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = name;
      if (String(f.level) === String(i)) o.selected = true;
      levelSel.appendChild(o);
    });
    box.append(label(t('hist_level')), levelSel);

    const openingInp = document.createElement('input');
    openingInp.className = 'input';
    openingInp.value = f.opening ?? '';
    box.append(label(t('hist_opening')), openingInp);

    const fromInp = document.createElement('input');
    fromInp.className = 'input'; fromInp.type = 'date'; fromInp.value = f.from ?? '';
    const toInp = document.createElement('input');
    toInp.className = 'input'; toInp.type = 'date'; toInp.value = f.to ?? '';
    box.append(label(t('hist_from')), fromInp, label(t('hist_to')), toInp);

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '12px';
    const apply = document.createElement('button');
    apply.className = 'btn primary';
    apply.textContent = t('hist_apply');
    apply.onclick = () => {
      state.filter.playerColor = segValue(colorSeg) ?? '';
      state.filter.level = levelSel.value;
      state.filter.opening = openingInp.value.trim();
      state.filter.from = fromInp.value;
      state.filter.to = toInp.value;
      state.count = PAGE;
      close(null);
      load();
    };
    const clear = document.createElement('button');
    clear.className = 'btn';
    clear.textContent = t('hist_clear');
    clear.onclick = () => {
      state.filter = { outcome: state.filter.outcome, playerColor: '', level: '', opening: '', from: '', to: '' };
      state.count = PAGE;
      close(null);
      load();
    };
    row.append(apply, clear);
    box.appendChild(row);

    const wipe = document.createElement('button');
    wipe.className = 'btn danger';
    wipe.style.cssText = 'margin-top:16px; width:100%';
    wipe.textContent = t('hist_delete_all');
    wipe.onclick = async () => {
      close(null);
      if (await askConfirm(t('hist_delete_all_confirm'))) {
        await db.clearHistory();
        state.count = PAGE;
        load();
      }
    };
    box.appendChild(wipe);
  });
}

function renderFilterChip() {
  const el = $('hist-filter-chip');
  const f = state.filter;
  const bits = [];
  if (f.playerColor) bits.push(t(f.playerColor === 'w' ? 'white' : 'black'));
  if (f.level !== '' && f.level != null) bits.push(t('level_names')[+f.level]);
  if (f.opening) bits.push(f.opening);
  if (f.from || f.to) bits.push(`${f.from || '…'} – ${f.to || '…'}`);
  el.classList.toggle('hidden', !bits.length);
  if (!bits.length) return;
  el.innerHTML = '';
  const lab = document.createElement('span');
  lab.className = 'ellipsis';
  lab.textContent = bits.join(' · ');
  const btn = document.createElement('button');
  btn.textContent = t('hist_clear');
  btn.onclick = () => {
    state.filter = { outcome: state.filter.outcome, playerColor: '', level: '', opening: '', from: '', to: '' };
    state.count = PAGE;
    load();
  };
  el.append(lab, btn);
}
```

`modal` and `askConfirm` come from `js/app.js` too — same import, see **The module boundary** in Global Constraints.

- [ ] **Step 6: Reset filters on leaving**

In `close()`, add before hiding the panel:

```js
  state.filter = { outcome: '', playerColor: '', level: '', opening: '', from: '', to: '' };
  state.dir = 'prev';
  state.count = PAGE;
```

so returning to the history never shows a mysteriously empty list.

- [ ] **Step 7: Verify**

Reload. Play two more games so you have at least one win, one loss and one unfinished game.

1. Tap **Wins** — only wins remain; **All** brings everything back.
2. Tap **Newest** — the label becomes **Oldest** and the oldest game moves to the top.
3. Open **⚙ Filters**, pick colour **Black**, Apply. Expected: only games you played as Black, and the active-filter chip appears reading `Black`. Tap its clear button — the chip disappears and all games return.
4. Set a level filter with no matching games. Expected: *"No games match this filter."*, **not** Kael's empty state.
5. Go **Back**, reopen the history. Expected: filters are reset, all games listed.
6. Check the chip row and Filters sheet at **375px** in both colour modes.

- [ ] **Step 8: Verify Delete all**

Open **⚙ Filters → Delete all history**, confirm. Expected: Kael's empty state. Then play one game so Task 4 has data.

- [ ] **Step 9: Commit**

```bash
git add index.html js/history.js js/app.js js/i18n.js
git commit -m "feat(history): add filters, sorting and delete-all"
```

---

## Task 4: Replay through the Analysis screen

**Files:**
- Modify: `index.html` — the `ana-hist-nav` bar
- Modify: `js/app.js` — `Analysis.updateBaseNav()`, `Analysis.moreMenu()`, new `backToHistory()` / `gotoAdjacentHistory()` / `viewPgn()`
- Modify: `js/history.js` — card tap, long-press menu, `openGame()`
- Modify: `js/i18n.js` — strings

**Interfaces:**
- Consumes: `state.items` (display order) from Task 2; `db.getHistoryGame(id)`, `db.deleteHistoryGame(id)` from Task 1.
- Produces: `History.openGame(rec)` — loads a saved game into `Analysis` with `ctx.historyId` set.

- [ ] **Step 1: Add the nav bar**

`#ana-base-nav` is at `index.html:119-128`. Add this sibling immediately after it (after line 128) — same classes and inline styles, so the bar looks identical to the one the Databases tab already shows:

```html
    <div id="ana-hist-nav" class="row wrap hidden" style="justify-content:space-between; margin:0 0 6px;">
      <div class="row" style="margin:0; gap:4px;">
        <button id="ana-hist-back" class="btn small">← <span data-i18n="history_title"></span></button>
      </div>
      <div class="row" style="margin:0; gap:4px;">
        <button id="ana-hist-prev" class="btn small">◀</button>
        <button id="ana-hist-next" class="btn small">▶</button>
      </div>
      <div id="ana-hist-head" class="hint ellipsis" style="flex:1 1 100%; margin:2px 0 0;"></div>
    </div>
```

Note the arrows are `◀`/`▶`, matching `ana-base-prev`/`ana-base-next` — not the `‹`/`›` used elsewhere.

- [ ] **Step 2: Add the strings**

```js
  hist_view_pgn: { es: '👁 Ver PGN', en: '👁 View PGN' },
  hist_delete_game: { es: '🗑 Borrar partida', en: '🗑 Delete game' },
  hist_export_pgn: { es: '📤 Exportar PGN', en: '📤 Export PGN' },
```

- [ ] **Step 3: Open a saved game from a card**

In `js/history.js`, in `card(rec)`, before `return item`, add:

```js
  item.onclick = () => openGame(rec);
  item.oncontextmenu = (e) => { e.preventDefault(); gameMenu(rec); };
  // Long-press for touch, matching the games list in the Databases tab.
  let timer = null;
  item.addEventListener('pointerdown', () => { timer = setTimeout(() => { timer = null; gameMenu(rec); }, 550); });
  item.addEventListener('pointerup', () => clearTimeout(timer));
  item.addEventListener('pointermove', () => clearTimeout(timer));
```

And add:

```js
// The list holds summaries only, so the moves are fetched on demand.
export async function openGame(rec) {
  const full = await db.getHistoryGame(rec.id);
  if (!full || !full.pgn) { toast(t('import_failed')); return; }
  const tree = parsePgn(full.pgn);
  Analysis.loadTree(tree, { baseId: null, gameId: null, historyId: full.id });
}

function gameMenu(rec) {
  sheet([
    { label: t('hist_export_pgn'), action: async () => {
        const full = await db.getHistoryGame(rec.id);
        if (full) sharePgnText(`game_${rec.id}.pgn`, full.pgn);
      } },
    { label: t('hist_delete_game'), danger: true, action: async () => {
        if (await askConfirm(t('history_delete_confirm'))) {
          await db.deleteHistoryGame(rec.id);
          load();
        }
      } },
  ]);
}
```

`parsePgn`, `Analysis`, `sheet`, `toast` and `sharePgnText` come from `js/app.js` — see **The module boundary** in Global Constraints. All of them are used only inside handlers here, which is what makes the import cycle safe.

- [ ] **Step 4: Teach `Analysis` about the history context**

In `js/app.js`, in `Analysis.updateBaseNav()` (around line 1383), after the existing `$('ana-gr-nav').classList.toggle(...)` line, add:

```js
    const inHist = !!this.ctx.historyId;
    $('ana-hist-nav').classList.toggle('hidden', !inHist);
    if (inHist) {
      // Keep the player oriented: they came from the Play tab, so that is the
      // tab that stays lit.
      document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.screen === 'play'));
      const idx = History.state.items.findIndex(g => g.id === this.ctx.historyId);
      $('ana-hist-prev').disabled = idx <= 0;
      $('ana-hist-next').disabled = idx === -1 || idx >= History.state.items.length - 1;
      const rec = History.state.items[idx];
      $('ana-hist-head').textContent = rec ? History.headline(rec) : '';
    }
```

Add these methods to `Analysis`, next to `backToBase()`:

```js
  backToHistory() {
    showScreen('play');
    History.open();
  },

  gotoAdjacentHistory(dir) {
    const idx = History.state.items.findIndex(g => g.id === this.ctx.historyId);
    if (idx === -1) return;
    const next = History.state.items[idx + dir];
    if (!next) return;
    History.openGame(next);
  },
```

And bind them in `Analysis.init()`, next to the `ana-first`/`ana-prev` bindings (around line 1280):

```js
    $('ana-hist-back').onclick = () => this.backToHistory();
    $('ana-hist-prev').onclick = () => this.gotoAdjacentHistory(-1);
    $('ana-hist-next').onclick = () => this.gotoAdjacentHistory(1);
```

Make sure `this.ctx = { baseId: null, gameId: null }` assignments in `exitBase()` and `exitGameReview()` also clear `historyId`, so leaving one context cannot strand the other's nav bar on screen:

```js
    this.ctx = { baseId: null, gameId: null, historyId: null };
```

- [ ] **Step 5: Add the headline**

In `js/history.js`:

```js
// The one line the card had no room for.
export function headline(rec) {
  const { white, black } = namesFor(rec);
  const result = rec.result === '1/2-1/2' ? '½-½' : rec.result;
  return [
    `${white} – ${black}`,
    result,
    t(`history_end_${rec.endReason}`),
    formatDuration(rec.endedAt - rec.playedAt),
    formatWhen(rec.playedAt),
  ].filter(Boolean).join(' · ');
}
```

- [ ] **Step 6: Add View PGN and history delete to the ⋯ menu**

In `js/app.js`, in `Analysis.moreMenu()` (around line 1723), add after the `copy_fen` item:

```js
      { label: t('hist_view_pgn'), action: () => this.viewPgn() },
```

and at the end of the `items` array construction, before `sheet(items)`:

```js
    if (this.ctx.historyId) {
      items.push({ label: t('hist_delete_game'), danger: true, action: async () => {
        if (await askConfirm(t('history_delete_confirm'))) {
          await db.deleteHistoryGame(this.ctx.historyId);
          this.ctx = { baseId: null, gameId: null, historyId: null };
          this.backToHistory();
        }
      } });
    }
```

Add the method to `Analysis`:

```js
  // Copy and Export already exist; this is for actually reading the game text.
  viewPgn() {
    const text = this.tree.toPgn();
    modal((box, close) => {
      box.innerHTML = `<h3>PGN</h3>`;
      const pre = document.createElement('pre');
      pre.className = 'pgn-view';
      pre.textContent = text;
      box.appendChild(pre);
      const row = document.createElement('div');
      row.className = 'row';
      const copy = document.createElement('button');
      copy.className = 'btn primary';
      copy.textContent = t('copy_pgn');
      copy.onclick = () => copyText(text);
      const ok = document.createElement('button');
      ok.className = 'btn';
      ok.textContent = t('ok');
      ok.onclick = () => close(null);
      row.append(copy, ok);
      box.appendChild(row);
    });
  },
```

Add to `css/style.css`:

```css
.pgn-view {
  max-height: 45vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: .85em;
  background: var(--panel);
  padding: 10px;
  border-radius: 8px;
}
```

- [ ] **Step 7: Verify replay**

Reload. Play two or three short games so the list has several entries. Open the history and tap a card.

Expected:
- The Analysis board opens with the game loaded, and the bottom tab bar stays lit on **Play**.
- The history nav bar shows, with the headline reading like `You – Beginner bot · 1-0 · Checkmate · 0:38 · Today 18:22`.
- **⏮ ◀ ▶ ⏭** step through the moves, and **flip** turns the board.
- **‹** and **›** move to the neighbouring games; **‹** is disabled on the newest game and **›** on the oldest.
- **← Game History** returns to the list.

- [ ] **Step 8: Verify PGN and delete**

In the ⋯ menu:
1. **View PGN** — the modal shows headers with your name (or "You") and the bot's name, the result matching the card, and the moves. Copy works.
2. **Export PGN** — a `.pgn` file is offered.
3. **Delete game** — after confirming, you return to the history and the game is gone.
4. Long-press a card in the list — the sheet offers Export PGN and Delete, and Delete removes it from the list immediately.

Check the PGN modal at **375px** — the move text must scroll inside the modal, not push it off screen.

- [ ] **Step 9: Verify nothing else broke**

Open a game from the **Databases** tab. Expected: the base nav bar appears, the history bar does **not**, and the tab bar stays on **Databases**. Then finish a game in the Play tab and use **Analyze the game** from the Game Review. Expected: the game-review nav appears and the history bar does not.

- [ ] **Step 10: Verify offline**

Confirm `js/history.js` is in `sw.js`'s `ASSETS` and `CACHE` is `chess-training-center-v23`. Reload twice, then set the browser to offline and reload. Expected: the app still loads and the history still opens. This is the check that matters most for a Play Store TWA.

- [ ] **Step 11: Commit**

```bash
git add index.html js/app.js js/history.js js/i18n.js css/style.css
git commit -m "feat(history): replay saved games through the Analysis screen"
```

---

## Wrap-up

- [ ] Update `HANDOVER.md`: note the Game History feature, that `sw.js` is now at `v23` (the file said `v11`, which was already stale), and that `js/history.js` is a new module.
- [ ] Merge to `main` and push. **Pushed is not deployed** — the app is served through Cloudflare in front of GitHub Pages. Verify the live site actually serves the new files (compare the md5 of the deployed `js/history.js` against the local one) before telling Adrian to test on his phone.

## Known gaps, deliberately left

- **Resuming an unfinished game** is out of scope. The record has everything needed for it (`finalFen`, `playerColor`, `level`), so it can be added later without a migration.
- **Board thumbnails** are not drawn. `finalFen` is stored, so they can be switched on without touching the data.
- **Clocks do not exist** in the Play tab, so `endReason: 'timeout'` is defined and translated but never produced.
- **Cloud sync** is not built. `uid` and `version` exist so records can be uploaded and evolved later.
