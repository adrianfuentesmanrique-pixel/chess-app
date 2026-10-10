# Chess tasks — one conversation each

Run each in its OWN fresh conversation. Do not run two in one session.

`HANDOVER.md` is the long record and the authority on what has already happened.
This file is only the queue of what to do next. Where the two disagree, believe
`HANDOVER.md`.

## Status, 2026-08-28

The four tasks that used to head this file (A artwork, B Learn merge, C swipe +
explorer, D buttons) are **all done** — `HANDOVER.md` already said so and it was
re-confirmed against the code:

| Old task | Evidence |
|---|---|
| A — Artwork | `icons/badges/` holds 76 files |
| B — Learn merge + tab reorder | `screen-learn` appears 0 times in `index.html` and `js/app.js`; `LEARNING_CATEGORIES` renders inside the Endgame screen with its isolation comment intact; the tab bar is already Analysis · Learn · Bases · Openings · Puzzles · Play · Profile |
| C — Swipe nav | `goAdjacentTab`, `pushTabHistory` and the `popstate` handler are live in `js/app.js` |
| C — Explorer variations | `Trainer` branches a variation when you move from an earlier position, with a `variation_started` toast |
| D — Buttons | `play-back` and `trainer-back` exist in `index.html` |

The old prompts are kept at the bottom for reference. **Do not run them.**

## ⚠ Do not cite line numbers in these prompts

`js/app.js` is being split (branch `refactor/split-app-js`, see the structural
debt section of `HANDOVER.md`), so line numbers move every commit. Everything
below names **symbols** instead. Grep for the symbol; do not trust a number.

## Verified state as of 2026-08-28

Checked directly, because a stale note on any of these will send a session the
wrong way:

| | Value |
|---|---|
| Branch / HEAD | `main` @ `9fa1b83` |
| Service worker cache | **`chess-training-center-v78`** |
| IndexedDB `mi-ajedrez` | **`DB_VER = 3`** — stores `bases`, `games`, `kv`, `playHistory` |
| `js/app.js` | 256 KB, still the entry module |
| `js/` | 23 files — the split has already moved out `sound`, `appearance`, `avatars`, `badges`, `leaderboard`; `friends`, `history`, `masterclass`, `chapter-order` are separate too |

---

# NEXT — run these in order

Task 1 is three real bugs Adrian hits while using the app; it goes first because
two of them make the Bases tab painful today, and because task 2 touches one of
the same functions (`Analysis.updateBaseNav`) — fixing behaviour before
restructuring navigation, not after. Task 2 removes the bottom tab bar, which
deletes the "how do we fit 8 tabs into 375px" problem before we pay to solve it.
Task 3 builds the limits page that the Read tab later adds one row to. Doing
Read first means building both twice.

---

## 1 — Three bugs in the Bases tab and the move list

Reported by Adrian 2026-08-28. All three were traced to an exact cause before
this prompt was written; the diagnoses below are verified, not guesses.

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md and CLAUDE.md first.
- js/app.js is 256 KB. NEVER read it whole. Grep for the symbol, then read with
  offset/limit. Several objects are no longer in app.js — check js/sound.js,
  js/appearance.js, js/avatars.js, js/badges.js, js/leaderboard.js,
  js/friends.js, js/history.js, js/masterclass.js first.
- Never read puzzles/*.json or graphify-out/graph.json.
- One task per conversation. Tell me to /clear when this is finished.

TASK: three bugs I hit while actually using the app. The cause of each is
already known — confirm it, then fix it.

BUG 1 — the ◀ ▶ arrows inside a game always fail.
Open a base, open a game, press either arrow: "Could not read the file. Is it a
PGN?" every single time.
CAUSE (verified): Analysis.gotoAdjacentGame() takes the next record straight
out of Base.gamesCache and calls parsePgn(g.pgn). But gamesCache holds
SUMMARIES — db.listGameSummaries() deliberately omits the PGN text, because
pulling it for every row dragged megabytes into memory. So g.pgn is undefined,
parsePgn throws, and the catch shows t('import_failed'). It can never have
worked.
FIX: fetch the full record first, exactly the way Base.openGame() already does
it (`const full = g.pgn ? g : await db.getGame(g.id)`), and keep the guard for
a record that genuinely has no PGN. gotoAdjacentGame becomes async.

BUG 2 — the arrows should follow the list I am looking at.
Once bug 1 is fixed, the arrows still walk the whole base. If I searched for one
opponent, ▶ must step to the next game OF THAT SEARCH, not the next game in the
database.
CAUSE: gotoAdjacentGame and Analysis.updateBaseNav both index into
Base.gamesCache, while the list on screen is built in Base.renderGames() from
`this.filterResults ?? this.gamesCache` and then narrowed again by the quick
search box.
FIX: give Base one method that returns the currently visible games in the order
they are displayed, use it in renderGames(), and use the SAME method in
gotoAdjacentGame() and in updateBaseNav()'s disabled/enabled maths. One source
of truth — the arrows and the list must never disagree.

BUG 3 — the search is thrown away when I come back from a game.
I search, open a game, press ← Back to base, and the search box is empty and my
advanced filter is gone. I have to search again for every single game.
CAUSE: Base.openBase() unconditionally clears $('game-search').value,
this.filter, this.filterResults and this.filterCapped. The comment there ("a
filter belongs to the base it was built against") is right, but the function
also runs when Analysis.backToBase() returns you to the SAME base.
FIX: only clear the search and the filter when the base id actually CHANGES.
When re-opening the same base, keep the search text and the filter — but
re-apply the filter against the freshly loaded gamesCache rather than reusing
the old filterResults array, which can name games that have since been deleted.
Restoring the scroll position / gamesShown as well would be nice; ask me before
adding anything bigger than that.

BUG 4 — the board jumps when I step through a game with long comments.
Stepping with the ◀ ▶ move arrows on a game that has comments scrolls the PAGE
so the comment is visible, which pushes the board up and down. The board must
NEVER move when I step through moves, no matter how long the comment is. If I
want to read the comment I will scroll there myself.
CAUSE: Analysis.renderMoves() ends with
`curEl.scrollIntoView({ block: 'nearest' })`. scrollIntoView scrolls EVERY
scrollable ancestor, including the document — so even though .movelist has its
own `overflow-y: auto` and `max-height: 30dvh`, the page scrolls too whenever
the highlighted move sits below the fold.
FIX: scroll the move list container ONLY, by setting its scrollTop directly,
and never touch the page scroll. Keep the current move visible inside
#ana-moves. Check whether the same pattern was copied anywhere else that
renders a move list before you finish.

VERIFY BEFORE COMMITTING — all at 375px, light and dark:
- The arrows move between games with no toast, from the first game and from the
  last, and they grey out correctly at both ends.
- Search for an opponent, open a game, use ▶: it goes to the next game OF THE
  SEARCH. Come back: the search box and the filter chip are still there.
- Switching to a DIFFERENT base still clears the search — that part is correct
  behaviour and must not regress.
- Open a game with a long comment, hold ▶ through it, and confirm
  document.scrollingElement.scrollTop does not change while the move list
  scrolls internally.

The Claude browser pane has failed to composite on this machine before — if
screenshots time out, drive headless Chrome over CDP instead.

Bump the sw.js cache version (currently chess-training-center-v78).

When done: commit, update HANDOVER.md, and write me the prompt for the next
session.
```

---

## 2 — Menu navigation, replacing the tab bar

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md and CLAUDE.md first.
- js/app.js is 256 KB. NEVER read it whole. Grep for the symbol, then read with
  offset/limit. Several objects are no longer in app.js — check js/sound.js,
  js/appearance.js, js/avatars.js, js/badges.js, js/leaderboard.js,
  js/friends.js, js/history.js, js/masterclass.js first.
- Never read puzzles/*.json or graphify-out/graph.json.
- js/endgames-data.js is data. Grep only.
- One task per conversation. Tell me to /clear when this is finished.

TASK: replace the bottom tab bar with a menu button.

Today #tabbar in index.html is 7 buttons always on screen. Replace it with a
single centred button showing the hamburger icon plus the CURRENT screen's name,
so I never lose track of where I am. Tapping it slides a panel up from the
bottom with all destinations as a 2-column grid, icon above label. Tapping any
destination navigates and slides the panel away. Tapping outside it, or the
Android back gesture, closes it without navigating.

DECIDED — do not re-open:
- Bottom sheet, NOT a left drawer. A left drawer fights the Android back
  gesture and the app's existing horizontal swipe-nav.
- Rename tab_base in js/i18n.js to 'Bases' in BOTH languages. It is currently
  es 'Bases' / en 'Databases'. CLAUDE.md permits label changes; the 'base' key
  must NOT be renamed.

MUST NOT BREAK — grep each symbol, the line numbers move:
- TAB_ORDER in js/app.js is built by reading '#tabbar button' from the DOM. If
  the markup changes, that must still yield the same ordered list of screens,
  or swipe navigation silently stops working.
- showScreen() sets .on classes on '#tabbar button'. Update it to match the new
  markup or the active-screen highlight dies with no error.
- pushTabHistory() and the popstate handler currently own the Android back
  button. When the menu is OPEN, back must close the menu and nothing else — it
  must NOT navigate to the previous screen. Push a history entry when the menu
  opens and consume it on close.
- Some screens re-light the tab bar deliberately after showScreen() — Analysis
  does it for a game opened from a base (updateBaseNav), and Masterclass does it
  so Bases stays lit while its screen is open. Both must still work.

Respect prefers-reduced-motion — css/style.css already has that pattern in
several places; follow it, do not invent a new one.

MEASURED 2026-08-28, so you do not have to re-check it: hiding the tab bar frees
48px of vertical space (main grows 713 -> 761 at 375x812) but the board does NOT
get bigger — it is limited by the width of the phone, not by height. The 48px is
scroll room. The screens that gain are the scrolling lists and, later, the Read
tab. Do not promise a bigger board.

Use the existing Kael navy-and-gold design language. Mobile-first: verify at
375px in BOTH light and dark mode before claiming it works. A dev server config
exists at .claude/launch.json. NOTE: the Claude browser pane has failed to
composite on this machine before — if screenshots time out, drive headless
Chrome over CDP instead, which is how the app.js split was verified.

Bump the sw.js cache version (currently chess-training-center-v78) and add any
new js/*.js to its ASSETS array.

When done: commit, update HANDOVER.md, and write me the prompt for the next
session.
```

---

## 3 — Limits, counters, backup & restore

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md and CLAUDE.md first.
[same token rules as task 1 — grep, never read js/app.js whole; one task per
conversation]

TASK: make the app's limits visible before a user hits them, and let bases
survive moving to a new phone.

CONTEXT: I filled up my 10 databases and only found out at the moment I was
blocked. That must never happen again.

PART A — live counters where the limit is consumed.
Show 'Bases 7/10' in the Bases screen header and 'Masterclasses 3/5' in the
Masterclass screen header. Turn the counter gold when one slot is left. These
matter more than any help page: a number you watch climb never ambushes you.

PART B — one 'Limits & storage' page, reached from the menu built in task 2.
List every real cap. These VALUES were verified on 2026-08-28; grep the
constant, do not trust the file path if the split has moved it:
  Databases 10                 MAX_DATABASES      js/app.js
  Engine lines 2               MAX_ENGINE_LINES   js/app.js
  Radar themes 13              MAX_RADAR_THEMES   js/app.js
  Rush strikes 3               Rush.MAX_STRIKES   js/app.js
  Masterclasses 5              MAX_MASTERCLASSES  js/firebase.js
  Chapters per Masterclass 50  MAX_CHAPTERS       js/firebase.js
  Size of one chapter 100 KB   MAX_CHAPTER_BYTES  js/firebase.js
  Members per Masterclass 30   MAX_MEMBERS        js/firebase.js
  Search results shown 2,000   the LIMIT const inside Base's filter code
Import the constants, never retype the numbers — a hardcoded page will drift.
Plain language, no jargon.

Note: js/firebase.js comments MAX_MASTERCLASSES, MAX_CHAPTERS and MAX_MEMBERS
as ADVISORY, UI-side only — no Firestore rule enforces them, because counting
needs a server-side counter. Only the 100 KB chapter size is enforced in
firestore.rules. Word the page as "limits in the app", not as guarantees. Do
NOT try to fix that here.

The same page also states, in one short paragraph: your games and databases are
stored on THIS device only; signing in on another device brings your profile,
rating and streaks but not your databases; here is how to move them (points at
Part C).

PART C — backup and restore all bases.
Base.shareBase() already exports ONE base as .pgn through sharePgnText(), which
handles the navigator.share path with a download fallback. base-import already
reads one back. Extend this:
  - 'Back up all bases' -> a single file containing every base, with names
    preserved, through that same sharePgnText() path.
  - 'Restore from backup' -> reads that file back, recreating the bases.
    Restoring must NOT silently blow past MAX_DATABASES, and must not duplicate
    a base that is already there — ask me what to do instead.
Reuse db.addGamesBatch(). A big restore must not open one giant transaction.

DO NOT upload anything to Firebase. Backups are files I move myself.

Mobile-first, existing Kael navy-and-gold language, verify at 375px in light
and dark mode before claiming it works. Bump the sw.js cache version.

When done: commit, update HANDOVER.md, and write me the prompt for the next
session.
```

---

## 4 — Read tab, Stage 1

Not written yet, deliberately — it should reference the menu and the Limits page
as they actually end up. Ask for it at the end of task 3.

The agreed design, for whoever writes it:

- **Stage 1 — the reader.** Add a PDF from the phone, a shelf with covers, read
  it, remembers your page, works offline. PDF.js self-hosted in `vendor/`
  alongside chess.js and the Stockfish wasm. **`DB_VER` is currently 3
  (`bases`, `games`, `kv`, `playHistory`) so a `books` store makes it 4.** Add
  `books` to `clearAllLocalData()` — which already lists `playHistory` — and
  deliberately NOT to `clearSyncedProfileData()`: signing out must not delete a
  library the user never uploaded.
- **Stage 2 — long-press a diagram, crop it, land on the existing Board Setup
  screen** (`Setup.open(fen)`) with the crop pinned above an EMPTY board. No
  computer vision at all. This delivers the whole user story, and because Setup
  already validates the position and offers "Analyze this" / "Play from here",
  a wrong position can never reach Analysis presented as correct.
- **Stage 3 — automatic reading.** Grid detection, one-time per-book
  calibration on the starting position, template matching, pre-filled board.
  Same destination screen. Any failure falls back to Stage 2 behaviour.
  **Match the ink, not raw pixels:** in the starting position the king only ever
  appears on a light square and the queen only on a dark one, so raw-pixel
  templates would fail on a king that later sits on a dark square. Strip the
  known square colour and compare the piece shape as a mask.
- **Stage 4** — bookmarks, storage usage, re-calibration.

Storage: check the quota before importing and refuse with a readable message,
catch `QuotaExceededError` mid-write and delete the partial record, and request
persistent storage on first import so Android does not silently evict the
user's books.

**Hard rule, never to be relaxed: books never reach Firebase.** Firestore sync
is allowlist-based (`SYNCED_KEYS` in `js/firebase.js`) and only covers the `kv`
store, so a separate `books` store is structurally unable to sync. Keep it that
way. No "back up my books" button, ever.

---
---

# COMPLETED — kept for reference only. Do not run these.

## A — Artwork integration (work order #2) — DONE

```
In C:\Users\Adrian\chess-app, integrate the artwork in `avatars/CTC new arts`
(44 badge files, 31 avatars). `tools/build_badges.py` already has the 64-badge →
symbol map and a Pillow compositor; finish it. Key out the magenta backgrounds,
trim, scale, composite symbol onto frame, write 512px PNGs to `icons/badges/`.
Map `theme_discoveredCheck` to the `discovered` symbol — Adrian wants all
discoveries sharing one icon. TIER RULE (confirmed, see the table further down
this file): five families — puzzle, flame, robot, target, lightning — each have
silver/obsidian/gold symbols, and there are FOUR frames: bronze, silver,
obsidian, gold. It is a matrix of 3 symbols x 4 frames = 12 tiers per family.
The frame cycles through all four before the symbol advances: silver+bronze,
silver+silver, silver+obsidian, silver+gold, then obsidian+bronze ... up to
gold+gold as the top tier. All artwork is present — nothing is missing.
Endgame piece badges: render from the app's own
`pieces/*.svg` via the browser pane (no cairo locally). For avatars: the app
circle-crops them in CSS, so strip any baked-in ring; add the missing `queen_b`;
update `AVATAR_OPTIONS` in js/app.js. Verify light AND dark mode, then commit
and push.
```

---

## B — Learn reorganisation + tab reorder (work order #8 and #12) — DONE

The direction was reversed on Adrian's call (2026-08-05): Learn's content moved
INTO the Endgame screen and the tab was renamed, rather than moving 265 endgames
the other way. `endgames-data.js` is 10.8× larger than `learning-data.js`, the
Endgame screen carries the fragile machinery (lazy loading, engine integration,
ELO tracking, a radar-chart domain key), and existing users kept their endgame
ELO. The permanent rules that came out of it are now in `CLAUDE.md`:

- The internal key `'endgame'` must NEVER be renamed — it is one of four ELO
  domains and a radar-chart key. Visible labels can change; keys cannot.
- `ENDGAME_CATEGORIES` must contain ONLY ending categories. If a Rules or
  Basic-Checkmates category ever lands in it, it immediately appears on the
  radar chart and drags the endgame ELO average. Keep `LEARNING_CATEGORIES`
  separate.
- Rules and Basic Checkmates persist NO progress and must never reach
  `db.kvSet('endgameElo', …)` or `recordEloHistory`.

---

## C — Swipe navigation + Opening Explorer variations (#10 and #11) — DONE

```
In C:\Users\Adrian\chess-app, two navigation features. (1) Opening Explorer: let
the user step back to any earlier move and play a different move from there,
creating a variation, after which the app keeps following the selected opening
database from the new position. Don't break existing database behaviour.
(2) Add swipe navigation: horizontal swipes move between adjacent tabs; an
inward edge swipe goes back to the previously visited tab rather than closing
the app. Treat Analysis as home — maintain a tab history stack so Analysis →
Learn → Openings → back → Learn → back → Analysis works, and only the Android
system back on Analysis exits. Must not interfere with board piece dragging
(`.board` uses touch-action pan-y and pointer capture during drags) or with
horizontally scrolling strips (`.seg.scroll`, `.plog`). Verify in the browser
pane, then commit and push.
```

---

## D — Button work (work order #3, #6, #7) — DONE

```
In C:\Users\Adrian\chess-app, three button changes.
(3) Redesign the Edit Board buttons to look cleaner and more modern, consistent
with the app's existing navy-and-gold design language — do not invent a new
style.
(6) In the Play tab, remove the text labels from the action buttons and keep
only their icons. Replace the "New Game" button with a Back button in the
upper-left corner behaving like standard navigation.
(7) Apply the same pattern to the Openings tab: remove "New Game", add a Back
button in the upper-left corner.
Keep every existing behaviour working. Verify in the browser pane at 375px in
both light and dark mode, then commit and push.
```

---

## Reference — the badge tier rules (Adrian, confirmed 2026-08-05)

**3 symbol styles × 4 frames = 12 tiers per family.** The frame cycles through
all four before the symbol advances.

| Tier | Symbol | Frame |
|---|---|---|
| 1 | silver | bronze |
| 2 | silver | silver |
| 3 | silver | obsidian |
| 4 | silver | gold |
| 5 | obsidian | bronze |
| 6 | obsidian | silver |
| 7 | obsidian | obsidian |
| 8 | obsidian | gold |
| 9 | gold | bronze |
| 10 | gold | silver |
| 11 | gold | obsidian |
| 12 (top) | **gold** | **gold** |

Symbol order is **silver → obsidian → gold**, gold highest.

| Family | Symbol files |
|---|---|
| puzzle | puzzlesilver · puzzleobsidian · puzzlegold |
| flame | flamesilver · flameobsidian · flamegold |
| robot | robotsilver · robotobsidian · robotgold |
| target | targetsilver · targetobsidian · targetgold |
| lightning | lightningsilver · lightningobsidian · lightninggold |

Frames: `frame-bronze.png` · `frame-silver.png` · `frame-obsidian.png` ·
`frame-gold.png`
