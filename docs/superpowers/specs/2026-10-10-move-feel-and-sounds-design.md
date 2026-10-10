# Move feel and sounds - design

Date: 2026-10-10. Status: **BUILT (v181).** Adrian's answers, same day: a yes, b yes, c made by code, d yes, e yes.
Measured results and what was not tested are in HANDOVER.md.
Start point: commit a7fdd58, cache v180.

## What Adrian asked for

"Improve the sound and movement of the pieces. The movement to be smoother, it means that
the reply of the opponent / engine need to be faster like chess.com or lichess. For the
sound let me know the options we have to avoid copyright, but still being a better and
more natural chess sound."

Success = a reply that lands about as fast as lichess, a piece that slides instead of
jumping, and board sounds that are more natural with a licence that is beyond doubt.

## What was measured (2026-10-10, headless Chrome, `tools/cdp-measure-reply.mjs`)

The move is called through the board's normal `onMove` funnel (not tapped); the number is
the wait from that call to the reply landing on the board. Each row is 3-6 runs.

| Screen | What | Now (measured) | Where it comes from |
|---|---|---|---|
| Puzzles | my move -> reply | 412-415 ms | `sleep(400)` in `Puzzles.userMove` |
| Puzzles | puzzle shown -> its opening move | 604-613 ms | `openTimer`, 600 |
| Blindfold | my move -> reply | 412-414 ms | `sleep(400)` in `Blind.userMove` |
| Blindfold | puzzle shown -> opening move | 500 (read, not timed) | `startTimer`, 500 |
| Rush | my move -> reply | 308-312 ms | `setTimeout 300` in `Rush.userMove` |
| Rush | solved -> next puzzle's opening move | 655-680 ms | 350 (`onSolve`) + 300 (`loadNext`) |
| Duel | both of the above | same as Rush | NOT timed live (needs two players). It is Rush's own code: `Object.create(Rush)` in `js/pulso-match.js`, with `NEXT_MS = 350` |
| Play vs engine | my move -> reply | 304 / 504 / 803 / 2003 ms at levels 0 / 2 / 4 / 7 | the level's `movetime` in `LEVELS` (`js/engine.js`): 300, 400, 500, 600, 800, 1000, 1500, 2000. The wait IS the engine's thinking time; the first move of a session adds ~160 ms of engine start-up |
| Openings | my move -> book reply | 461 ms (timed later with a seeded book; a fresh test profile has no opening base) | `sleep(450)` in `Trainer.computerMove` |
| Openings | out of book | same as Play vs engine | the level's `movetime` |
| Endgames | my move -> book reply | 414-416 ms | `sleep(400)` in `Endgame.playBookReply` |
| Endgames | my move -> engine reply | 702-703 ms | `movetime: 700` in `Endgame.engineReply` |
| Endgames | opponent-moves-first study | 700 (read) | `setTimeout 700` in `startPractice` |
| Lessons (Learn) | walk-through step / engine reply / set-up move | 600 / 500 / 900 (read) | `walker.step`, `engineReply`, `openLesson` |

**The pieces do not slide at all today.** Measured on the board: transition `0s`, animation
`none`. A move is drawn by swapping the pictures on the two squares. The
`transition: transform .28s ease` near line 315 of `css/style.css` is the side drawer, not
the pieces.

### What lichess does (read from its public source code today, not from memory)

- Piece slide: 250 ms by default ("Normal"; the user can pick 0 / 120 / 250 / 500), with
  a cubic ease-in-out curve. A slide shorter than 70 ms is skipped. A dragged piece does
  not slide. (`modules/pref/.../Pref.scala`, chessground `anim.ts`)
- Puzzle reply: slide time x 1.5 = **375 ms**, or x 1 = **250 ms** when auto-next is on.
  Opening move of a puzzle: **500 ms**. (`ui/puzzle/src/ctrl.ts`)
- Puzzle Storm (their Rush): **no added wait** - the reply and the next puzzle are drawn at
  once and only the slide is seen. (`ui/storm/src/ctrl.ts`)

### What chess.com does

Not known. Its code is closed and it publishes no numbers; I did not time it (that needs
a signed-in session on their site). The proposals below are set against lichess only.

## Where the current sounds came from

All 8 files in `sounds/` were added in commit 3869b65 (2026-07-07). Its message says they
were "Synthesized" - made by code in that session, not downloaded and not recorded. So they
carry no third-party licence. The script that made them was not kept in the repo.
`HANDOVER.md` has no other note on their origin.

**Found on the way:** the sound files are in NO precache list in `sw.js` (already noted,
unfixed, in HANDOVER: "sounds/*.wav ... are in no list either"). Today a sound is stored the
first time it is played and wiped again at every app update, so the first sound after an
update, with no signal, is silent. This build puts every sound in the precache list.

## Decisions (Adrian answers; my recommendation is given for each)

### a. Reply speed

| Screen | Now | Proposed |
|---|---|---|
| Puzzles: reply | 400 | **250** |
| Puzzles: opening move | 600 | **400** |
| Rush + Duel: reply | 300 | **150** |
| Rush + Duel: solved -> next puzzle, then its opening move | 350 + 300 | **250 + 200** |
| Blindfold: reply | 400 | **400 (kept)** |
| Blindfold: opening move | 500 | 500 (kept) |
| Openings: book reply | 450 | **250** |
| Endgames: book reply | 400 | **250** |
| Endgames: opponent-first study | 700 | **400** |
| Endgames: engine reply | 700 | **400** |
| Lessons: engine reply | 500 | **300** |
| Lessons: walk-through step, set-up move | 600, 900 | kept (they are demonstrations, meant to be watched) |
| Play vs engine + Openings out of book | 300-2000 by level | **300, 300, 300, 300, 300, 500, 800, 1200** |

- **Blindfold keeps 400.** Its replies are heard, not seen: two knocks 250 ms apart blur
  into one, and the player must tell "my move" from "the reply" by ear.
- **The engine is the real slowness.** On Play the wait is thinking time, nothing else.
  The five lower levels are already held back by a strength limit (`UCI_Elo`), so they do
  not need long thinking. Risk, said plainly: less thinking can make a level play a little
  weaker, and I have not measured by how much. The top level (full strength) loses the
  most: 2.0 s -> 1.2 s is still far above any human.
- As built: in Rush and Duel the reply (150 ms) can arrive 50 ms before a TAPPED piece has
  finished its 200 ms slide. The board then puts that piece straight on its square and
  slides the reply, as lichess's Storm does. A dragged piece never slides, so it is not
  affected.

### b. Piece animation

Recommended: **200 ms, lichess's ease-in-out curve**, a little quicker than lichess's 250
because the board on a phone is small. Applies to every move that lands on a board: mine
when tapped, the opponent's, the solution being played out, castling (king and rook).
- **A dragged piece does not slide** - it is already under the finger (same as lichess).
- Phones set to "reduce motion": no slide.
- Blindfold with the pieces hidden: nothing to slide.
- No new switch in Settings.

### c. Where the board sounds come from

| Option | How it sounds | Licence | Work for Adrian |
|---|---|---|---|
| 1. **Your own recording** (phone, real pieces on a real board) | The most natural: it IS a chess piece | Yours outright, no licence at all | ~15 min: record 5-6 knocks in a quiet room, send me the file; I cut, clean and level them |
| 2. CC0 recordings from the internet | Natural, if a good one exists | CC0 = public domain, but ONLY if each file's own page says so. None is verified yet. Checked today: lichess's standard move/capture sounds are **not free** (its COPYING.md lists them under "non-free"), so they are out | Say yes to each file after I show you its page, author and licence text |
| 3. Made by code (what the app has now, done better) | A clean wooden "tock". Better than today, but it stays a made sound | None exists - nothing is copied | None |

Recommendation: **option 1 if you have a board and pieces at hand, otherwise option 3.**
Option 2 is the weakest: the best-known sets are not free, and a "CC0" label on a sharing
site is only as good as the uploader's word. The non-board sounds (puzzle right/wrong, win,
lose, draw, Kael's pop) stay as they are in every option.
Whatever is chosen, I cannot hear it: you judge it on your phone.

### d. Which sounds

Add: **check**, **castle** (two quick knocks), **promotion**. Keep: move, capture, puzzle
correct/wrong, game win/lose/draw, Kael's pop. Do not add a pre-move sound (lichess has
none; a queued move is silent, the real move sounds when it lands).
One sound per move, by this order: check > promotion > castle > capture > move.
In Blindfold the check sound plays too: there it is useful and fair, the same as an
opponent saying "check".

### e. Format and size

Keep **.wav** (mono, 16-bit, 44.1 kHz). A knock is under a quarter of a second, so each
file is 10-20 KB; the whole folder stays under ~250 KB (141 KB today). WAV plays on every
phone with no decoding wait, which matters more here than saving a few KB with MP3/OGG.
All sound files go into the precache list.

## How it will be built (after the answers)

- `js/move-feel.js` - new, imports nothing: the reply-delay table (one named number per
  screen), the slide length, and `moveSoundKind({ capture, castle, promotion, check })`.
  Unit tests for the table and the priority order.
- `js/board.js` - the slide (only for the piece named in `lastMove`, plus the castling
  rook), skipped after a drag, on reduce-motion and with hidden pieces; `setPosition` asks
  `moveSoundKind` instead of counting pieces only.
- `js/sound.js` - sounds are loaded once and played through Web Audio, so a knock starts
  with the move instead of a beat late (the old way stays as the fallback).
- `js/app.js`, `js/pulso-match.js`, `js/engine.js` - each wait reads its number from the
  table. Every existing guard (`token`, `live(run)`, the puzzle identity checks) stays
  exactly where it is: they are what stops a reply landing on the wrong puzzle.
- `sw.js` - cache v181, every sound file in the precache list.
- Not touched: `firestore.rules`, the indexes, any rating maths.

## Verify

- `test:tree`, `test:precache`, `test:rules`: before = 209 pass / OK (46 files, 142 art) /
  435 pass, all 0 fail (re-run today). Same or more after, 0 fail.
- `tools/cdp-measure-reply.mjs` again: the "Proposed" column, measured.
- Pre-moves still fire on every screen; Next / Show solution during a wait never lets a
  reply land on the new puzzle.
- Each changed screen at 375 px, light and dark, Spanish and English, pictures looked at.
- Sound: Adrian, on his phone. Headless Chrome cannot judge a sound.
