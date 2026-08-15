# Learn tab — guided walkthrough mode (design)

Date: 2026-08-14. Agreed with Adrian in the brainstorming session that preceded
this document. **Legend-only was his call** — see "The cost decision" below.

## What it is

A third way to work through a Learn lesson, next to the two that exist today.
The app shows you the next move of the lesson's line, then hands the board back
and asks you to play that same move yourself. When you do, the opponent's reply
plays itself and the next move is shown. On to the end of the line.

Reached from a new **👣 Walk through** button beside the existing 🎯 Practice
button on the lesson screen.

## Why it is not a third system

`Endgame.Lessons` (`js/app.js:4747`) already holds three things, and the new
mode is built out of the parts of all three:

| Existing part | Where | Reused how |
|---|---|---|
| Demo stepper | `renderDemoStep` 4833 | Its `new Chess(lesson.fen)` + replay-N-plies loop is exactly "rebuild the board at step N". Copied in shape, not in code. |
| Single-move quiz | `checkPracticeMove` 4903 | Already the board's `onMove` handler. The walkthrough is one new branch beside the existing `if (this.vsEngine)`. |
| Feedback | 4923–4935 | `Sound.play('puzzle-correct' / 'puzzle-wrong')`, `learn-practice-status` with `.good` / `.bad`, and `.shake` on `learn-board`. Used verbatim. Nothing new invented. |

What none of them do, and what this adds: showing a move *and then* asking for
it back, and advancing through a line rather than stopping after one move.

New state on the object is four fields: `walking`, `walkIdx`, `walkChess`,
`walkTries`.

## The data — nothing to add

The five Basic Checkmates lessons already carry `demo.moves`, a legal UCI line.
Measured:

| Lesson | Plies | Side to move at `fen` |
|---|---|---|
| `kq_vs_k` | 15 | w |
| `k2r_vs_k` | 3 | w |
| `kr_vs_k` | 23 | w |
| `k2b_vs_k` | 33 | w |
| `kbn_vs_k` | 61 | w |

All five start with White and all five have an odd ply count, so every line ends
on the player's own move — the mate. A legal move list always alternates, so
**"is this my move?" is derivable: even index = yours.** No `you` flag, no new
lesson field, no authoring.

`js/learning-data.js` is not modified by this task.

The button appears when `lesson.demo` exists, which today means exactly the five
Basic Checkmates. The twelve Rules lessons have no demo and are untouched — they
take byte-for-byte the same code path they take now.

## The cost decision — legend only

The original ask was a written explanation per move, with the text under the
board changing as you advance. Costed honestly: 135 plies across the five mates,
270 bilingual strings, all of it chess commentary I would be generating.

**Adrian chose the legend instead.** `lesson.text` — already written, already
bilingual, already on screen — stays under the board for the whole walkthrough
as the standing plan. Nothing is authored for this task.

What that trades away, recorded so nobody re-discovers it: a fixed legend says
"drive the king to the edge" on move 1 and still says it on move 12. Without
per-move text the walkthrough teaches the *moves* by repetition, not the *why*
of any individual move. That is a real limitation and it is deliberate.

**The upgrade path is open and costs no rework.** If per-move notes are ever
wanted, add an optional `lesson.walk = { notes: [ {en,es} | null, ... ] }`
aligned to `demo.moves` by index, and render it in a slim line under the status
bar. The renderer already has `walkIdx` in hand. Lessons without `notes` keep
the legend. No code written now blocks this.

## The flow

Starting from `👣 Walk through`: the demo scrubber row hides, the walk row
shows, `learn-lesson-text` keeps the lesson text, board is set to `lesson.fen`.

For each ply at even index (yours):

1. **Show.** An arrow from → to appears via the board's existing `setShapes`,
   status bar reads "Watch this move". 1.4 seconds.
2. **Hand over.** Arrow clears, status reads the existing
   `learn_practice_prompt` ("Now it's your turn: make the move on the board"),
   board goes interactive.
3. **You play it.**
   - **Right:** correct sound, the move lands with its from/to highlight, and
     the opponent's reply plays itself 600 ms later. On to the next ply.
   - **Wrong:** wrong sound, board shakes, piece returns, status reads the
     existing `learn_try_again`. **Unlimited retries, no lockout, nothing
     scored.** On the *second* wrong try at the same ply the arrow comes back
     for 1.4 s by itself, then hands over again.

The arrow deliberately clears before your turn — recalling the move is the
point. `👁 Show me` brings it back at any time.

## The controls

A new `learn-walk-nav` row, built from the existing `.row` and `.hint` classes.
No new CSS, no new visual style.

| Control | Behavior |
|---|---|
| `◀` | Step back one of your moves and re-show it. Rebuilds from `lesson.fen`, same as the demo stepper does. Disabled at the start. |
| `4 / 15` | Ply counter, same shape as `learn-demo-counter`. |
| `👁 Show me` | The skip. Plays the current move for you and advances. Always available — you can never be stuck. |

At the end of the line: status turns green with "Line complete! 🎉", the board
goes non-interactive, the walk row hides and both buttons come back — `👣 Walk
through` to run it again, `🎯 Practice` to try it against the engine for real.

## Ratings and the streak

**This mode writes to no rating.** Not `puzzleElo`, not `endgameElo`, not
`openingElo`, not `blindfoldElo`, and not the profile radar. That matches the
isolation already documented at `js/app.js:4741`: the Learn sections persist
nothing, and only the Endings section may touch `endgameElo`.

**It does credit the streak** — `Streak.recordActivity()` on reaching the end of
the line, the same call the existing practice completion makes at 4928 and 4954.
Approved by Adrian. This is a new streak trigger in the same family as the
existing one ("Learn lessons that have a practice section"), and if the streak
rules list on Profile is ever revised it should be revised with it.

## Strings

Four new keys in `js/i18n.js`, each with `en:` and `es:`. Written against
`docs/STYLE-EN.md`: sentence case, no terminal period on buttons, emoji plus one
space, second person.

| Key | en | es |
|---|---|---|
| `learn_walk_btn` | `👣 Walk through` | `👣 Paso a paso` |
| `learn_walk_watch` | `Watch this move` | `Mira esta jugada` |
| `learn_walk_show` | `👁 Show me` | `👁 Muéstrame` |
| `learn_walk_done` | `Line complete! 🎉` | `¡Línea completa! 🎉` |

`learn_walk_btn` is 15 characters including the emoji, inside the 16-character
budget for a button in a `.row` pair (STYLE-EN §9). Reused unchanged:
`learn_practice_prompt`, `learn_correct`, `learn_try_again`.

No move notation is generated anywhere in this feature — the board's arrow and
highlight show which move it is. That is deliberate: the app never translates
SAN, so any auto-generated "2. Nf3" label would read English to Spanish users.
Not changed in this task.

## Files touched

| File | Change |
|---|---|
| `index.html` | The `learn-walk-nav` row and the `learn-walk-btn` button |
| `js/app.js` | `Endgame.Lessons` — one branch in `checkPracticeMove`, plus `startWalk` / `renderWalkStep` / `walkShow` / `walkAdvance` / `walkBack` |
| `js/i18n.js` | Four keys |
| `sw.js` | `chess-training-center-v52` → `v53` |

No new files. No CSS. `js/learning-data.js` untouched.

## Verification

No test framework, so verification means driving the real app. The browser pane
does not composite on this machine; headless Chrome over CDP is used instead
(HANDOVER.md, "How this was verified").

Checked at 375px in **light and dark**, in **both languages**:

1. A Rules lesson shows **no** walk button and behaves exactly as before.
2. `k2r_vs_k` (3 plies) — full run: show, play, reply, mate, green line-complete.
3. `kq_vs_k` (15 plies) — a wrong move shakes and lets you retry; a second wrong
   move re-shows the arrow by itself.
4. `👁 Show me` advances past a move; `◀` steps back and re-shows.
5. The three lines under the board — status, and the lesson text as legend — fit
   without the page scrolling sideways at 375px.
6. `🎯 Practice` still starts the vs-engine mode unchanged.
7. Zero new console errors. (The App Check 403 from
   `content-firebaseappcheck.googleapis.com` is pre-existing on 127.0.0.1.)
8. `puzzleElo`, `endgameElo`, `openingElo` and `blindfoldElo` in localStorage are
   byte-identical before and after a completed walkthrough.

## Deliberately not in scope

- **Endings (265 studies).** Each already has a `moves` line of the same shape,
  so the mode drops in later with no code change. 2,774 plies is why it waits.
- **Rules (12 lessons).** One-move ideas with no line to walk.
- **Openings.** Checked: there is no built-in opening line data in the app. The
  Openings trainer builds its book at runtime from a PGN database the user
  imports (`buildBook`, `js/app.js:2990`) and its explanations are whatever
  comments were in that PGN. Nothing to attach a walkthrough to.
- **Spanish move notation.** Costed at ~40 lines plus an audit across three
  display sites, with nine storage/comparison sites that must not be converted.
  Not needed here and not done.
