# Chess app — where things stand (updated 2026-08-07)

## Already done and pushed — do NOT redo these

- **Game History (Stockfish games) — COMPLETE, all 4 tasks.** Every game you
  play against the engine is saved automatically and can be browsed, filtered
  and replayed. Reach it from **Play → 📜 Game History**.
  - New module **`js/history.js`** — record building, the history screen, and
    replay. New IndexedDB store `playHistory` (DB v2 → **v3**).
  - Replay opens the normal Analysis board with a `historyId` context, so the
    tab bar stays lit on Play and there is a back / prev / next bar plus a
    one-line headline. `⋯ → 👁 View PGN` shows the game text; games can be
    exported or deleted from the card long-press or from `⋯`.
  - Plan: `docs/superpowers/plans/2026-08-07-stockfish-game-history.md`.
    Commits `a8705f7`, `9a90522`, `d302722`, `a86947e`.
  - **`js/app.js` now exports things.** It used to export nothing. `toast`,
    `modal`, `askConfirm`, `sheet`, `segInit`, `segValue`, `sharePgnText` and
    `Analysis` are exported so `js/history.js` can import them instead of
    copying them. app.js and history.js import each other — the cycle is
    deliberate and safe, but `js/history.js` must never touch an app.js
    binding at module top level. See "The module boundary" in the plan.
  - Deliberately left out: resuming an unfinished game, board thumbnails,
    clocks, cloud sync. The record shape already supports all four.

- **Play tab level picker — robot cards.** The eight engine levels are now a
  2-column grid of cards on the Play tab: the existing
  `icons/badges/beat_engine_N.png` robot, the level name, and the strength
  range it covers (Beginner 1300-1450 … Maximum 2800+).
  - `LEVELS` in `js/engine.js` gained a **display-only `range`** field. `elo`,
    `movetime` and the persisted level index are untouched.
  - `buildLevelSeg(el, def, rich)` — only the two Play call sites pass `rich`,
    so **the Trainer tab keeps the compact `3·Casual` strip**. If you ever
    make Trainer rich too, its setup screen gets much taller.
  - New `.lvgrid` block in `css/style.css`, reusing `--panel2`, `--gold`,
    `--gold-bg`, `--muted`, `--radius`. No new strings were needed: the names
    already come from `level_names`, and the ranges are just numbers.
  - Honest caveat Adrian accepted: **1320 is Stockfish's `UCI_Elo` floor**, so
    the level labelled "Beginner" cannot actually be made weaker than a decent
    club player. The ranges are presented as-is anyway.
  - Commit `ca9e87a`.

- **`sw.js` is at `chess-training-center-v30`.** The `v11` written here
  earlier was stale for a long time — trust the file, not this note, and bump
  it whenever `index.html`, any `js/*.js` or `css/style.css` changes, or
  returning users get served stale files.
  - `icons/badges/beat_engine_0..7.png` are now precached in `ASSETS`, because
    they render on a core screen. The rest of `icons/badges/` is not — it is
    only cached after first fetch by the `CACHE_FIRST` handler.

**`refactor/split-app-js` is merged into `main` and deployed** (merge
`0e46dff`). Both the module split and the robot cards are live.

- **Work order #1 — both Sentry errors.** One was a real null-dereference:
  tapping the Openings board before pressing Start crashed the app. The other
  (`myUndefinedFunction`) came from a browser extension, not this codebase; the
  crash guard and Sentry now ignore extension-attributed errors.
- **#4 — trash button removed** from Board Setup (13 → 12 buttons).
- **#5 — board scrolling fixed.** `.board` had `touch-action: none`, so the
  board swallowed every gesture. Now `pan-y`.
- **#9 — "Jaques mate" → "Jaque mates"** in the Spanish Learn tab.
- **Kael's corner no longer swallows taps** (commit `242dc7f`) — he is quieter,
  hides off-screen when silent, and the bubble is see-through. This was the
  urgent touchscreen bug; it is FIXED.
- Endgame tab: 265 endgames, bilingual, live.

## Still to do

### English copy review — IN PROGRESS, multi-session

Making every English string read like a native speaker who knows chess.
Spanish is out of scope. **Read `docs/STYLE-EN.md` (the rules) and
`docs/EN-REVIEW-PLAN.md` (the batch checklist) before touching any English
text.** One batch per commit. Batch 1 of 10 is done (`js/quotes-data.js`);
batch 2 is `js/tour.js`. Nothing is pushed until all ten are done.

**`HANDOFFS.md` is stale — tasks A–D in it are all done.** Ignore the table
below and the prompts in that file until someone rewrites them.

One conversation each:

| | Task | Work order items |
|---|---|---|
| **A** | Artwork integration | #2 — *blocked on 2 questions* |
| **B** | Learn reorganisation + tab reorder | #8 + #12 — must ship together |
| **C** | Swipe nav + Opening Explorer variations | #10 + #11 |
| **D** | Button work | #3, #6, #7 |

Lower priority, not in the work order:
1. Export Firestore security rules to `firestore.rules` — they only exist in the
   Firebase console.
2. Test the Firestore WRITE rules. Read rules were verified live; write rules
   never were. Writes to production — ask first.
3. Restrict the Firebase web API key by HTTP referrer in Google Cloud Console.
4. ~~Puzzle difficulty does not scale with ELO~~ — **NOT A BUG ANY MORE. Fixed
   on 31 Jul in `7bfc92e`; verified empirically 7 Aug, no code changed.** The
   old cause was that puzzle bands were fetched once at startup, so a rating
   that climbed during a session kept drawing from the band it started in.
   `nextPuzzle()` now calls `ensureForRating(target)` every puzzle
   (`js/app.js:3514`). Measured by seeding `puzzleElo` 2050 with the
   calibration window spent, then reading the rating the status line prints:
   Normal served avg **2065** (1999–2122), Harder (+500) served avg **2494**
   (2457–2549). Theme filters cannot starve it either — the rarest motif
   (`doubleBishopMate`) still has 17 puzzles within ±100 of 2050, so the
   ±100→±1200 widening never fires. If this is ever reported again, suspect a
   **stale service-worker cache** first: the number in parentheses under the
   board is the puzzle's own rating, so it is checkable on the device in two
   seconds. Do not "fix" the picker, the K-factor or `DIFFICULTY_LEVELS` —
   fast calibration (K=192 for the first 10 attempts, `js/app.js:3409`) is
   already there too.
5. **Dead write: `userLevel`.** Kael's onboarding asks the player's strength
   and shows real ELO ranges on the cards (Expert is labelled "ELO 1901-2300"),
   then saves the answer as `userLevel` (`js/app.js:498`) — and nothing in
   `js/` ever reads it. So a strong new player tells the app they are 2000 and
   still starts at `puzzleElo` 1200. The fix is to seed `puzzleElo` from the
   chosen tier at first run only. Adrian was told and chose to leave it for
   now; it does nothing for him (he is past onboarding and already rated
   correctly), it only helps new strong users. **Must stay first-run only —
   never rewrite an existing user's stored `puzzleElo`.**
6. History dates older than yesterday show the month in the *device's*
   language, not the app's — `formatWhen()` in `js/history.js` calls
   `toLocaleDateString(undefined, …)`. In Spanish on an English phone you get
   "Aug 5 13:16". Passing `getLang()` instead of `undefined` fixes it. Cosmetic
   and pre-existing to Task 2; not fixed because it was outside Task 4.
7. New "Read" tab — PDF reader, brief in `READ-TAB-PROMPT.md`. Later.
8. **Repo is 137 MB, and 138 MB of the working tree is
   `avatars/CTC new arts/`** — the full-size source PNGs, several over 3 MB
   (`frame-obsidian.png` 3.6 MB, `flamegold.png` 3.2 MB). Nothing loads them at
   runtime, but GitHub Pages serves this repo, so every one is publicly
   downloadable at the site root, and git history is permanent. This is the
   opposite of the `.gitignore` policy that keeps `icons/Streak Flames/` out.
   Deciding what to do needs Adrian: leaving it is harmless day to day, and the
   only real fix (history rewrite, or moving the sources out of the repo) is
   disruptive. **Ask before touching this — do not rewrite history unprompted.**

## Token rules — paste these into every new chess session

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md first.
- js/app.js is 235 KB (~57,000 tokens). NEVER read it whole. Grep for the
  symbol, then read with offset/limit. Check the small modules first —
  Sound, Themes, ColorMode, Avatars, Badges, Leaderboard and PublicProfile
  are no longer in app.js.
- Never read puzzles/*.json (5.1 MB) or graphify-out/graph.json (292 KB).
  Read graphify-out/GRAPH_REPORT.md instead — it is 8 KB.
- js/endgames-data.js (212 KB) is data. Grep only.
- One task per conversation. Tell me to /clear when this one is finished.
```

## Structural debt — splitting js/app.js (IN PROGRESS)

The dedicated session happened on 2026-08-07. **`js/app.js` went from 255 KB to
235 KB (~8%).** Five modules are out, each its own commit, each verified in a
real browser before the next one started. Branch `refactor/split-app-js`.

This was a **pure refactor**: every block was moved verbatim. No behaviour, no
visuals, no storage keys changed.

### New file layout

| File | Holds | Size |
|---|---|---|
| `js/sound.js` | `Sound` | 0.7 KB |
| `js/appearance.js` | `Themes`, `ColorMode` | 2.0 KB |
| `js/avatars.js` | `AVATAR_OPTIONS`, `avatarHtml()`, `Avatars` | 2.6 KB |
| `js/badges.js` | `BADGE_DEFS`, `badgeLabel()`, `Badges` | 7.9 KB |
| `js/leaderboard.js` | `LEADERBOARD_FIELDS`, `rankTier()`, `Leaderboard`, `VISIBILITY_SECTIONS`, `canSee()`, `withLocalDetail()`, `PublicProfile` | 9.0 KB |
| `js/engine.js` | gained `LEVELS` (was in app.js) | — |

### How the split works — read this before extracting the next one

`js/app.js` is still the entry module and now exports 18 things: `$`, `toast`,
`modal`, `askConfirm`, `sheet`, `esc`, `segInit`, `segValue`, `showScreen`,
`monthStr`, `radarThemes`, `sharePgnText`, `activeScreen`, `RADAR_MIN`,
`KaelQuotes`, `Analysis`, `Setup`, `Profile`.

Child modules import those back from app.js, so app.js and every child form an
import cycle. **The cycle is safe only while the child never touches an app.js
binding at module top level** — inside methods and event handlers is fine,
because both modules have finished evaluating by then. A
`Cannot access '...' before initialization` error means exactly that mistake.

`LEVELS` moving to `js/engine.js` is the worked example. `BADGE_DEFS` is built
at module top level and maps over `LEVELS`, so reading it from app.js across
the cycle would have crashed the app. Anything a child needs **at top level**
must live in a module that does not import app.js back.

`activeScreen` is an exported `let`. ES module bindings are live, so children
see `showScreen()` reassign it. Do not copy it into a local variable.

### Still in js/app.js — 18 of the 23 objects

`Onboarding 439`, `KaelQuotes 513`, `Streak 814`, `DailyMissions 912`,
`Analysis 1212`, `Base 1852`, `Play 2310`, `GameReview 2593`, `Trainer 2702`,
`PuzzleLog 3092`, `Puzzles 3198`, `Rush 3681`, `Blind 3948`, `Endgame 4240`,
`Setup 4888`, `Profile 5212`. (Line numbers as of this commit.)

Next best candidates, in order: `PuzzleLog` and `GameReview` (both fairly
self-contained), then `Streak` + `DailyMissions` together, then `Onboarding`.
`Analysis`, `Play`, `Puzzles` and `Endgame` are the big ones and are heavily
cross-wired — leave those until last.

### The rules that made this safe (keep following them)

1. One module per commit. Verify before starting the next.
2. Move code **verbatim**. Do not tidy it on the way out.
3. Every new `js/*.js` goes in the `ASSETS` array in `sw.js` **and** the cache
   version gets bumped. `sw.js` is now at **`chess-training-center-v30`**.
4. Never rename a storage key: `'endgame'`, `puzzleElo`, `endgameElo`,
   `openingElo`, `blindfoldElo`, `earnedBadges`, avatar ids, badge ids, and
   the `LEVELS` index (persisted in `engineLevelsBeaten`).

### How this was verified

There is no test framework, so verification means driving the real app. The
Claude browser pane still will not composite, so a small CDP driver against
headless Chrome was used instead (scripts in the session scratchpad;
`~/.claude/launch.json` entry `chess-app46`, port 9159). After each extraction:
boot with zero new console errors, all 7 tabs open, Play → start → 64 squares
and 32 pieces, Game History → card renders → replay opens Analysis with the
tab bar still lit on Play, Profile radar + 64 trophy cells, 375px in light and
dark, and an offline reload with the network cut.

**Observed, not fixed** (out of scope for a pure refactor):
- `js/learning-data.js`, `js/quotes-data.js`, `js/legal-data.js` and
  `js/openings-eco.js` are imported by app.js but are **not** in the `sw.js`
  `ASSETS` array. Offline still works because the network-first handler caches
  them after the first load, but a user whose very first launch goes offline
  mid-install would not have them precached. Pre-existing, unrelated to the
  split.
- The only console error during every run is a `403` from
  `content-firebaseappcheck.googleapis.com`. It is App Check rejecting an
  unregistered origin (`127.0.0.1:9159`) and appears identically before and
  after the refactor.

## Housekeeping

Nothing outstanding. `avatars/CTC new arts/` and `tools/` **are** committed —
the old note here claimed otherwise and was wrong for a long time. Verify a
claim like that with `git ls-files <path>` before repeating it.
