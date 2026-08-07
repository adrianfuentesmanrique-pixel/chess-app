# Stockfish Game History — design

Date: 2026-08-07
Status: approved, ready for implementation planning

## Goal

Every game played against Stockfish in the Play tab is saved automatically. The
player can browse, filter and replay past games from a Game History screen
inside the Play tab.

## What already exists

This feature is mostly plumbing. The app already has:

| Need | Existing code |
|---|---|
| Game storage in IndexedDB | `js/db.js` — `games` store, PGN-based |
| Paged list with "load more" | `Base.renderGames()` in `js/app.js` |
| Filter UI + active-filter chip | `Base.openAdvanced()` / `applyFilter()` |
| Replay: first/prev/next/last, flip | `Analysis` — `ana-first/prev/next/last/flip` |
| Copy PGN, export PGN | `Analysis.moreMenu()`, `sharePgnText()` |
| Back-to-list + prev/next game nav | `Analysis.updateBaseNav()` / `ana-base-nav` |
| Opening recognition | `classifyOpening(sanHistory)` in `js/openings-eco.js` |
| Confirm dialogs, action sheets, toasts | `askConfirm()`, `sheet()`, `toast()` |

New work is limited to: the record format and its store, the save hooks, the
history screen, and a history context inside `Analysis`.

## Decisions taken

1. **Dedicated store, not a database.** Games go to a new `playHistory`
   IndexedDB store, not into a `bases` entry. Keeps imported study material
   clean, allows the extra metadata, and the history cannot be destroyed by
   renaming or deleting a database.
2. **Replay reuses `Analysis`.** No second replay screen. Future analysis
   features are then built once, not twice.
3. **Abandoned games are saved as unfinished** (result `*`) when they have at
   least 4 half-moves — the same threshold `Play.finish()` already uses to
   decide whether to offer a game review. Resuming an unfinished game is **out
   of scope**.
4. **No board thumbnail.** 30 mini-boards per page is the most expensive thing
   on the screen and unreadable at 375px. `finalFen` is stored regardless, so
   thumbnails can be added later with no data migration.
5. **Clocks do not exist in the Play tab**, so time forfeit is currently
   unreachable. `endReason: 'timeout'` is defined but unused until clocks ship.
   Duration is wall-clock, `endedAt - playedAt`.

## Storage

### Schema

`js/db.js` moves from `DB_VER = 2` to `DB_VER = 3`, adding one store in a
stepwise `onupgradeneeded` block (`if (e.oldVersion < 3)`), matching the
existing v1→v2 upgrade. No existing store is touched.

Store `playHistory`, `keyPath: 'id'`, `autoIncrement: true`.

```js
{
  id,            // autoIncrement local key
  uid,           // stable string id, survives a future cloud sync
  version: 1,    // record format version
  source: 'stockfish',   // future: 'human' | 'online' | 'import'

  playedAt,      // ms epoch, first move / game start
  endedAt,       // ms epoch, game end       -> duration = endedAt - playedAt

  playerColor,   // 'w' | 'b'
  level,         // index into LEVELS (0-7)
  levelElo,      // LEVELS[level].elo — null at level 7 ("Maximum")

  result,        // '1-0' | '0-1' | '1/2-1/2' | '*'
  outcome,       // 'win' | 'loss' | 'draw' | 'unfinished'  — from the player's side
  endReason,     // 'checkmate' | 'resign' | 'stalemate' | 'repetition'
                 // | 'fiftyMove' | 'insufficient' | 'draw' | 'abandoned' | 'timeout'

  moveCount,     // full moves
  opening,       // classifyOpening() result, or ''
  startFen,      // supports games begun from a position
  finalFen,      // for a future thumbnail
  pgn,           // full game — the source of truth
}
```

Indexes: `playedAt`, `outcome`, `playerColor`, `level`, `opening`.

`clearAllLocalData()` in `js/db.js` must be extended to clear `playHistory`
too, so account deletion still wipes everything.

### Reading

A new module `js/history.js` owns both storage access and the screen. `app.js`
receives only small hooks. This is deliberate: `app.js` is 236 KB and its size
is recorded as structural debt in `HANDOVER.md`.

Two rules keep the list fast at thousands of games:

1. The list reads a **reverse cursor on the `playedAt` index**, one page of 30
   at a time. It never loads the whole history. (The Databases tab loads all
   summaries at once; this must not.)
2. The cursor yields **every field except `pgn`**, which is roughly 90% of a
   record. Moves are fetched only when a game is opened — the same technique as
   `db.listGameSummaries()`.

Filters are applied as a predicate **inside** the cursor, so any combination is
correct and the scan still stops once a page is full. Sorting is the cursor
direction (`'prev'` newest-first, `'next'` oldest-first). No filter-specific
index selection — one code path, correct for every combination.

## Saving

Both hooks live in `Play` and call into `js/history.js`.

**On game end** — `Play.finish()` already runs for checkmate, resignation,
stalemate and every draw type. It gains a save call. `endReason` is derived
from the `chess.js` position: `isCheckmate()`, `isStalemate()`,
`isThreefoldRepetition()`, `isInsufficientMaterial()`, fifty-move via the
halfmove clock, resignation from the finish message, otherwise `'draw'`. The
exact draw-detection method names must be confirmed against the bundled
`chess.js` build in stage 1 rather than assumed.

**On abandon** — `#play-back` currently hides the game panel and stops the
engine. It gains a save with `result: '*'`, `outcome: 'unfinished'`,
`endReason: 'abandoned'`.

**Threshold** — nothing is saved below 4 half-moves. A game is saved exactly
once; the abandon path must not re-save a game that already ended.

`Play` records `playedAt` in `begin()`.

## Game History screen

### Entry point

The Play tab already swaps `#play-setup` and `#play-game`. A third panel
`#play-history` joins them, so history stays inside the Play tab: no new entry
in `SCREENS`, no bottom-nav change, and Back returns to the Play setup.

A **📜 Game History** button sits on the Play setup screen directly beneath
**Start Game**, styled secondary so Start Game remains the primary action.

### Card

One `.list-item`-derived card per game, so light/dark mode, spacing and press
animation are inherited.

```
┌───────────────────────────────────────────┐
│ You  –  Casual bot                1-0   ▐ │ ← green
│ Ruy Lopez, Morphy Defense                 │
│ 34 moves · 12:40 · Today 18:22            │
└───────────────────────────────────────────┘
```

- **Line 1** — `White – Black` by name, plus the result. The player is always
  "You"; the engine is `{level name} bot` in English, `Bot {level name}` in
  Spanish, from the existing `level_names` i18n array. Name order therefore
  conveys the player's colour and the difficulty, which is why the card carries
  neither a colour dot nor a level label.
- **Result** — displayed as `1-0`, `0-1`, `½-½`, `*`. The stored `result` field
  keeps the PGN-standard `1/2-1/2`; `½-½` is display only, matching the
  existing Databases advanced-search control.
- **Right-edge bar** — 6px, full card height: `--success` win, `--danger` loss,
  `--muted` draw, `--warning` unfinished. Theme variables, so both colour modes
  work automatically.
- **Line 2** — the opening; when unrecognised, the end reason instead.
- **Line 3** — move count, duration, and a friendly date: *Today 18:22*,
  *Yesterday 09:15*, then *5 Aug 18:22*. Bilingual.

Long-press or right-click opens an action sheet (Export PGN / Delete), the same
gesture `Base.renderGames()` already binds.

Newest games first by default. Pages of 30, with the existing "load more"
button pattern.

### Filters and sorting

- Chip row: **All · Wins · Losses · Draws**.
- **⚙ Filters** sheet: colour, difficulty level, opening, date range — built on
  the `Base.openAdvanced()` pattern, with the same active-filter chip and clear
  button beneath the chip row.
- **Newest / Oldest** toggle.
- **Delete all history** lives at the bottom of the Filters sheet behind
  `askConfirm()`, reachable but never a mis-tap.

Filter state persists while the user stays in the Play tab and resets on
leaving, so the list is never mysteriously empty on return.

### Empty state

A Kael-styled panel — his portrait and one line, *"No games yet. Beat me and
I'll remember it."* — matching how Kael speaks elsewhere, rather than a bare
"No games".

## Replay

Tapping a card fetches that record's PGN, parses it with `parsePgn()`, and
calls `Analysis.loadTree(tree, { historyId })`.

`Analysis.updateBaseNav()` gains a history branch mirroring the base branch: a
nav bar with **← Game History**, **‹ previous game**, **next game ›**, with the
bottom tab bar held on **Play**. Prev/next walk the currently loaded, currently
filtered page order.

A header line above the board shows what the card omits:
`You – Casual bot · 1-0 · Checkmate · 12:40 · 5 Aug 2026`.

Forward, back, jump to start, jump to end, flip, move list, engine evaluation,
variations, Copy PGN and Export PGN are all existing `Analysis` behaviour and
need no new code.

**One addition:** a **👁 View PGN** item in the `Analysis` ⋯ menu, opening a
scrollable modal of the game text with a copy button. It goes in the shared
menu, not a history-only one, so the Databases tab gets it too.

Delete is available from the replay ⋯ menu and returns to the list.

The PGN's `White`/`Black` headers use the player's profile name when one is
set, falling back to "You", so shared games carry a real name. This replaces
the current `Me` / `Yo` strings.

## Offline / PWA

`js/history.js` must be added to the `sw.js` precache list and the cache
version bumped from v11. Omitting this breaks the app offline for existing
users. Handled in stage 1, re-verified at the end.

## Future compatibility

`pgn` is the source of truth; every other field is derived. Therefore:

- **Cloud backup** — upload the records as they stand.
- **Human, online or imported games** — the same record with a different
  `source`.
- **Favorites, notes, engine analysis** — new optional fields on an existing
  record.

None are built now; none require a migration later.

## Out of scope

Resuming an unfinished game; clocks and time forfeit; board thumbnails; cloud
sync; favorites; notes; stored engine analysis; games against humans.

## Build stages

Each stage is committed separately and verified in the browser pane at 375px in
both colour modes before the next begins.

1. **Storage and saving, no UI.** `db.js` v3 and its migration,
   `js/history.js` storage functions, the two `Play` hooks, `sw.js` precache
   and cache bump. Verified by playing a win, a resignation and an abandon, and
   by confirming an existing install upgrades without data loss.
2. **The list.** Entry button, `#play-history` panel, cards with the result
   bar, paged loading, Kael empty state, English and Spanish strings.
3. **Filters and sorting.** Chip row, Filters sheet, active-filter chip,
   Newest/Oldest, Delete all history.
4. **Replay.** History context in `Analysis`, nav bar, header line, prev/next
   game, View PGN, delete from replay.
