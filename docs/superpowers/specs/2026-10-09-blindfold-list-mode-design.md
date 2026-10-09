# Blindfold "List mode" — design

Date: 2026-10-09. Status: **APPROVED by Adrian 2026-10-09 and built (cache v177).**
Decisions a, b and e below are his own wording, not the first draft's.

## What it is

Blindfold gets a second way to play, asked for by a tester.

- **Mode 1, "See position"** (today's): the position is on the board for the chosen
  1–20 seconds, then the pieces vanish.
- **Mode 2, "List"** (new): the position is never shown. The player reads a written
  list of where the white and the black pieces stand, for up to 60 seconds, and can
  stop it sooner. Then the empty board appears and the puzzle is solved exactly as
  today.

Both modes feed the same blindfold ELO (`'blindfold'` domain, `blindfoldElo`,
`blindfoldEloHistory`, `blindfoldAttemptCount`). No new rating, no new leaderboard
column, no change to `firestore.rules` or the indexes.

## Facts checked in the code (commit 6e943b9, cache v176)

- A peek shows the pieces for **5 seconds** (`Blind.peek`, `setTimeout(..., 5000)`).
  The comment above `Blind` is correct.
- A puzzle starts with the opponent's move: `nextPuzzle` shows the position, plays
  `moves[0]` after half a second, then starts the countdown. So the position the
  player must remember is the one **after** that move.
- `blindEloResult` with `seconds: 2` gives extra factor 1 and long-look factor 1.
  List mode therefore needs no new formula, only a named constant.
- There is no existing helper that writes piece letters in Spanish; one is needed.
- `blindfoldSeconds` is on the cloud-synced key list in `js/firebase.js`. The new
  mode key is NOT added there, so it stays on this device and touches no rule.

## Decisions (recommendation for each)

**a. How the list is written (Adrian's format).** One line per side, White first:

```
White: Kg1, Qd3, Ra1, Rf1, Bc3, Nf3, a2, b2, c2
Black: Kg8, a6, b7, c5
```

Letters in the app's language (ES R D T A C, EN K Q R B N). Order: King, Queen,
Rooks, Bishops, Knights, then the pawns as bare squares. Inside one kind the squares
run a→h, then by rank. The lines wrap; the longest position (16 a side) is two lines
per side at 375px, with no sideways scrolling.

**b. Whose move.** No "(tú)/(you)" mark. The existing turn line ("Blancas juegan /
White to move") stands above the list. The empty board is turned to the player's
side, as today.

**c. The limit.** 60 seconds, a visible countdown (the existing gold countdown
number), and one big primary button "✓ Estoy listo / ✓ I'm ready". At 0 the list
closes by itself and the empty board appears — same as the button.

**d. Pay.** Flat: list mode always pays as a 2-second look in mode 1 — the normal
points in full plus an extra equal to the normal points for a clean win. The time
spent on the list (5 s or 60 s) changes nothing; no long-look reduction. A loss costs
the same as in mode 1. In code: `BLIND_LIST_PAY_SECONDS = 2` in `js/blind-elo.js`,
passed as `seconds` to the existing `blindEloResult`.

**e. Peek in list mode.** Same two-peek limit, same Kael warning the first time ever,
same rule: a peek cancels the extra only. A peek shows the LIST (never the pieces)
for **30 seconds**, with the same "Estoy listo / I'm ready" button to close it
sooner. The list on a peek is the position as it stands NOW, like a mode-1 peek.

**f. The switch and the names.** A two-button switch at the top of the Blindfold
start panel, in the app's existing segmented-switch style:
`👁 Ver posición | 📋 Lista` — `👁 See position | 📋 List`. One tap. The choice is
stored on this device under `blindfoldMode` (`'look'` or `'list'`, default `'look'`).
Like the time, the mode is locked while a puzzle is running; the existing "Change
time" button (renamed "⚙ Cambiar modo o tiempo / ⚙ Change mode or time") opens the
start panel after the current puzzle.

**g. The seconds picker in list mode.** Hidden, not disabled. In its place the pay
line reads "📋 Lista: paga como un vistazo de 2 s — resolver sin vistazo paga un 100%
extra" / "📋 List: pays like a 2 s look — a clean solve pays 100% extra".

**h. Result line and history.** The result line names the mode: where mode 1 says
"2 s: +14 normal, +14 extra", list mode says "Lista: +14 normal, +14 extra" (and the
peeked and loss variants). The history log under the board gets a small 📋 in front
of list-mode lines. Nothing is stored in the cloud about the mode.

**i. The opponent's first move (not in Adrian's list — found in the code).** In mode
1 the player sees the opponent's move being played. In list mode the list shows the
position after that move, and one line above it says what it was: "Último movimiento:
las negras jugaron Txe5 / Last move: Black played Rxe5". On the empty board the two
squares of that move stay highlighted, as they are today.

## How it is built

- `js/blind-elo.js`: `BLIND_LIST_PAY_SECONDS = 2`, `BLIND_LIST_READ_SECONDS = 60`,
  `BLIND_LIST_PEEK_SECONDS = 30`.
- New `js/blind-list.js` (imports nothing, so it is unit-testable):
  `blindPieceList(fen, lang)` returns `{ w: ['Kg1', …], b: […] }`;
  `blindSanLocal(san, lang)` rewrites a move's piece letters. In the precache list.
- `js/app.js`, `Blind`: new fields `mode` and `listOnDone`; new methods `showList`,
  `fillList`, `closeList`. The mode can only change on the start panel, so there is
  no per-puzzle copy of it. `nextPuzzle` branches: list mode keeps the pieces hidden
  from the first frame, hides the board, shows the list panel and a 60 s countdown;
  "I'm ready" or 0 calls the existing `hidePieces()`. `peek()` branches to show the
  list panel for 30 s. `recordResult` passes
  `BLIND_LIST_PAY_SECONDS` in list mode and picks the list wording.
- `index.html`: the mode switch in `#blind-start`; a `#blind-list` panel and an
  "I'm ready" button in `#blind-game`.
- `css/style.css`: the list panel, in the existing panel / gold-accent style.
- `js/i18n.js`: every new string in Spanish and English.
- Mode 1 code paths are untouched when `mode === 'look'`.

## Tests

- `tests/unit/blind-elo.test.js`: list pay equals a 2 s look for win, peeked win and
  loss; the constant is 2.
- New `tests/unit/blind-list.test.js`: Adrian's own example, the start position (16
  a side), bare kings, letters in ES and EN, the order, a move in Spanish letters.
- `tools/cdp-verify-blind.mjs` extended: mode switch, the list at its longest, the
  list peek, the result line — 375px, light and dark, Spanish and English.

## Risk to know about

Nobody has measured whether reading a list for up to a minute is harder or easier
than a 2-second look. The pay is one constant, so it can be changed later without
touching anything else.
