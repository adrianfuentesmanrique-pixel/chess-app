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

- **`sw.js` is at `chess-training-center-v24`.** The `v11` written here
  earlier was stale for a long time — trust the file, not this note, and bump
  it whenever `index.html`, any `js/*.js` or `css/style.css` changes, or
  returning users get served stale files.

Latest commit: `a86947e`

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

All four remaining tasks, with ready-to-paste prompts, are in **HANDOFFS.md**.
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
4. Puzzle difficulty does not scale with ELO (Adrian is 2000+, still gets easy
   problems).
5. History dates older than yesterday show the month in the *device's*
   language, not the app's — `formatWhen()` in `js/history.js` calls
   `toLocaleDateString(undefined, …)`. In Spanish on an English phone you get
   "Aug 5 13:16". Passing `getLang()` instead of `undefined` fixes it. Cosmetic
   and pre-existing to Task 2; not fixed because it was outside Task 4.
5. New "Read" tab — PDF reader, brief in `READ-TAB-PROMPT.md`. Later.

## Token rules — paste these into every new chess session

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md first.
- js/app.js is 232 KB (~58,000 tokens). NEVER read it whole. Grep for the
  symbol, then read with offset/limit.
- Never read puzzles/*.json (5.1 MB) or graphify-out/graph.json (292 KB).
  Read graphify-out/GRAPH_REPORT.md instead — it is 8 KB.
- js/endgames-data.js (212 KB) is data. Grep only.
- One task per conversation. Tell me to /clear when this one is finished.
```

## Structural debt

`js/app.js` is a single 232 KB file, which is why every task here is expensive.
The graphify run confirmed it: Community 0 has the worst cohesion score of all
17 communities (0.045), bundling `AVATAR_OPTIONS`, `BADGE_DEFS`,
`DIFFICULTY_LEVELS`, `GameReview` and `engine` together. Splitting it is the
permanent fix — but it needs its own dedicated session, never as a side-task.

## Housekeeping

`avatars/CTC new arts/` and `tools/` are still untracked in git. Commit them
before starting task A so the new art is not at risk.
