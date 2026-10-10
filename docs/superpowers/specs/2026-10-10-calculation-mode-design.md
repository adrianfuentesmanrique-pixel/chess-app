# Jugadas selladas / Sealed Moves — a fifth puzzle mode with variation trees (design)

Date: 2026-10-10. Status: **conversations 1 and 2 of section 4 are built (v185,
v186); conversation 3 (rating and progress) is not.** What was built, and where
it differs from the sketch in 3c, is in `HANDOVER.md`. Written against commit
`770bd44` (cache v183). Internal working name "calc"; the visible name was
chosen later (decision e). Section 3 was updated the same day with Adrian's
answers.

Adrian's words: "check the https://chessriddle.com/ ideas. let's adopt it and do
one section in our puzzles like that with variation trees."

---

## 1. What chessriddle.com does (opened and used 2026-10-10)

I played its three free demo puzzles in the browser pane and read its "How It
Works" page. Screenshots were looked at live; none are saved in this repo, on
purpose (their artwork is theirs).

In plain words:

- **A "riddle" is an ordinary tactics position with one twist: the board never
  moves.** You see the position and whose turn it is. When you tap a move, the
  piece stays where it was. The move is only written down in a panel beside the
  board called the variation tree.
- **You enter both sides.** After your move you tap the opponent's reply
  yourself (again on the frozen board, so you must picture where the pieces now
  are), then your next move, and so on. Illegal moves are refused: in demo 2 a
  pawn capture I tried was silently not accepted because the pawn was pinned.
- **The tree** is a list: move number, White's move, Black's move, one row per
  move pair. The move you last entered is a highlighted chip with a bin icon
  next to it. Tapping an earlier move and entering a different move from there
  starts a branch.
- **One button hands it in.** Nothing is marked right or wrong before that.
  - Demo 1 (mate in 2, one legal defence): I entered the three moves, handed in,
    got "correct", the puzzle's rating, and an engine panel with its lines.
  - Demo 3: I entered only the first move and handed in. It answered that the
    moves were right so far but some were missing, and let me add more and hand
    in again. Their guide says a wrong move ends the puzzle at once.
  - Demo 2: I pressed their Solution button. The solution was **one line of
    three moves**, not a branching tree.
- **Grading is done by a live Stockfish on their server**, with tolerance
  tables (how many pawns worse than the best move is still accepted). Side
  branches are optional: their guide says at least one branch must follow the
  opponent's best defence to the required depth.
- Around that core they sell other modes (visualisation, evaluation guessing,
  streaks, duels, arena) on a subscription. Out of scope here.

Honest observation: in the three demos the "variation tree" was in practice a
single line the player types out. Branches are possible but nothing asked for
them. Our design below makes the branches the point.

## 2. Where the line is: idea yes, expression no

We take **ideas**, which nobody owns:
- the board stays still while you calculate;
- you write down the whole answer, the opponent's replies included;
- you hand it in once and it is graded as a whole;
- the answer can branch into variations.

We take **none of their expression**:
- not their name or the word "Riddle" (never used for our section unless Adrian
  asks for it), nor their feature names ("Proof of Calculation", "Riddle
  Streak", and so on);
- no sentence of theirs: instructions, feedback messages and guide text are
  written fresh in our voice, Spanish first;
- none of their positions. Ours are our own 30,000;
- not their layout (dark two-column page, tree card on the right), colours,
  icons (their tree emoji, their brain emoji) or artwork;
- not their tolerance table. Our main line is graded against the puzzle itself;
  the engine is asked only about side variations, with one rule of our own.

This section is a practical boundary, not legal advice.

---

## 3. Decisions

Adrian answered on 2026-10-10: **a, c, d and f agreed as recommended; b
changed by him (below); e decided after he saw more names; g added by
him.**

### a. What the section is — AGREED

*A puzzle where the board never moves: you write down your whole answer — your
moves and the opponent's replies — and hand it in once. A normal puzzle checks
you move by move and plays the replies for you; here nothing is checked until
you hand in.*

How one puzzle goes:

1. The position appears with "White/Black to move". The board is frozen for the
   whole puzzle. The opponent's last move is highlighted.
2. The player taps from-square then to-square. The move appears as a chip in
   the tree under the board. It is not checked, only refused if illegal in the
   position the player has reached in their head (the tree knows that position).
3. The player then taps the opponent's reply, then their own next move, and so
   on. Tapping an earlier chip and entering a different move starts a
   variation. Variations are optional.
4. **Hand in** (enabled once there is at least one move). See b for the
   grading.
5. "Show solution" before solving counts as a failed puzzle.

### b. Where the content comes from — DECIDED BY ADRIAN

His words: "there is not need to get the variations. the only important thing
is to get the main line. if the user by any chance set a variation, the only
thing we need to do is to verify with the stockfish in the moment he submit the
answer, and just in that moment correct it if is wrong. So we can use all the
30 000 puzzles, without exception, and without the need to build more stuff."

So: **all 30,000 puzzles, as they are. No build tool, no new data files.**

Facts checked: `puzzles/puzzles-0..9.json` hold 30,000 puzzles shaped
`{id, fen, moves, rating, themes}`. `moves` is in engine notation and its first
move is the opponent's (the player answers from the second). Move counts today:
2,685 puzzles have one player move, 14,035 two, 8,709 three, 3,142 four, 1,429
five or more. A one-move puzzle here is simply a one-chip answer.

**The main line is the puzzle's own line. It is graded with no engine,
instantly and offline:**

- A move of the player's on the main line is right if it is the puzzle's move.
  One exception, to be fair: a different move that gives checkmate on the spot
  is also right.
- The opponent's reply on the main line is the puzzle's reply. If the player
  wrote a different reply there, that is not an error — it is a variation (next
  block) — but the puzzle's reply is still owed.

**Hand-in has three outcomes:**

- **A wrong move of the player's own on the main line** → failed. The tree
  colours, the board comes alive, the puzzle's line is shown.
- **Right so far, but the main line is not finished** → Kael adds what is
  missing: he writes in the puzzle's reply the player did not consider ("La
  mejor defensa es …Rg8. ¿Y ahora?") with an empty slot after it. The player
  fills the slot and hands in again.
- **The whole main line right** → solved. On the first hand-in, with no help
  from Kael and no hint, it is a **perfect** solve.

**Side variations — checked by Stockfish only at hand-in:**

- A side variation starts where the player wrote an opponent reply that is not
  the puzzle's. Only the player's own moves inside it are judged.
- One rule, ours: the player's move is right if the engine finds it no more
  than 1 pawn worse than its own best move there, or the position is still
  clearly winning afterwards (+3 or more), or it mates. Otherwise it is wrong
  and the engine's move is written next to it as the correction.
- **A wrong side variation is corrected, not punished**: it does not fail the
  puzzle and does not touch the rating. (Confirmed by Adrian. "just in that moment
  correct it if is wrong".) It does cost the "perfect" mark.
- Uses the engine already in the app (`Engine` in `js/engine.js`, the vendored
  Stockfish file). Budget: about half a second per judged move, capped at 8
  judged moves a hand-in; anything beyond the cap is shown grey, "not checked".
- If the engine cannot start, side variations are shown grey and the main-line
  result stands. The mode never waits on the engine to decide solved or failed.

What this costs, honestly: the engine verdict on a variation can differ a
little between a fast and a slow phone, because it is given time, not depth.
Since variations never decide the result, that is harmless.

### c. How the tree looks at 375px — AGREED

Checked: `js/tree.js` (16 KB) is the app's game tree — `GameTree`, with
variations, `play()`, a FEN on every node, and a PGN reader/writer. It is used
by Analysis/Play/Opening (through `js/movelist.js`), Masterclass and History;
the Read tab only takes `START_FEN` from it. **Reuse it** for the player's
answer: no second tree. What is *not* reused is the drawing in
`js/movelist.js`: it prints variations inline in brackets, which is right for
reading a game and wrong here (chips must be big enough to tap, and empty slots
must be visible). The tree gets its own small renderer.

```
┌───────────────────────────────────────┐ 375px
│ 🧩 Puzzles │ 🙈 A ciegas │ ⚡ Rush      │  mode row, 3 + 2
│   ⚔ Duelo        │   <new mode>        │
├───────────────────────────────────────┤
│ Juegan blancas   [Tema] [⚙]      1430 │
│ ┌───────────────────────────────────┐ │
│ │                                   │ │
│ │     board — never moves           │ │
│ │     (last move highlighted)       │ │
│ │                                   │ │
│ └───────────────────────────────────┘ │
│ Tu análisis                           │
│  16. [Ce6+]                           │
│      ├ … [Rg8]   17. [  ?  ] ← Kael   │
│      └ … [Re8]   17. [Cxc7+]  variante│
│                                       │
│ [⌫] [💡 Pista] [👁 Solución] [Entregar]│
└───────────────────────────────────────┘
```

- One row per opponent reply, indented under the move it answers. A variation
  is a new row, never brackets.
- Chips are at least 40px tall. The selected chip has the gold border: the next
  move entered goes after it. ⌫ deletes the selected chip and everything after.
- An empty slot `[ ? ]` is a question from Kael. Tapping it selects it.
- The tree panel scrolls inside itself; at least three rows stay visible at
  375×667. The build session measures this rather than trusting the drawing.
- After hand-in: right chips green, wrong red, unchecked grey, an engine
  correction beside a wrong variation move; the board unfreezes and follows the
  tapped chip.
- Navy and gold, the existing chip and card styles, Kael's horse artwork for
  his questions. No owl, no tree emoji.

### d. Rating, and what counts as solved — AGREED

**Its own rating, private, shown only inside the section.**

- **Solved** = the whole main line right, however many hand-ins it took.
  **Perfect** = solved on the first hand-in, no hint. **Failed** = a wrong own
  move on the main line, or the solution opened.
- Rating: the same Elo arithmetic the puzzles use (reuse the existing function,
  do not write a second one), key `calcElo`, starting at the player's puzzle
  rating minus 200. A perfect solve pays 1.25× the normal gain. Stored with
  `calcEloHistory`, `calcAttemptCount` and `calcSolved` (`{id: 1}` solved,
  `{id: 2}` perfect).
- **The stored keys say `calc` whatever the section ends up being called.**
  Labels can change freely; keys cannot, exactly like `'endgame'`.
- It is **not** a fifth "domain": it stays off the radar chart, the
  leaderboard, the profile cards and the teacher's view at launch. The four
  domain keys (puzzle/opening/endgame/blindfold) are untouched.

### e. Name and where the button goes — DECIDED: Jugadas selladas / Sealed Moves

Checked: the row is `.seg.puzzle-modes`, a two-column grid in `css/style.css`,
and its four buttons are **repeated in four screens** (`index.html` — the
puzzles, rush, pulso and blind sections). `openPuzzleMode()` in `js/app.js`
does the switching. `tools/cdp-verify-puzzle-modes.mjs` and
`tools/cdp-verify-swipe-modes.mjs` exist and will need the fifth mode.

**Button — AGREED: five buttons in the same two rows, three on top and two
below.** The row keeps its height.

**Name — DECIDED by Adrian, 2026-10-10: "Jugadas selladas" / "Sealed Moves", in the
plural (an answer is several moves). His reason: "is history of chess and is
unique." Button label: "✉ Jugadas selladas" / "✉ Sealed Moves" if it fits the
half-width button at 375px without being cut; otherwise "✉ Selladas" / "✉ Sealed".
The build session measures it. He also confirmed that the engine failing leaves
side variations "not checked" with the main-line result standing. Stored keys
and internal ids stay `calc`. The options he chose from, for the record:**

**Name — Adrian asked for options that are ours alone and say what makes this
format different.** "Cálculo / Calculation" was too generic.

| Spanish / English | On the button | Why |
|---|---|---|
| **Jugada sellada / Sealed Move (recommended)** | ✉ Sellada / ✉ Sealed | In an adjourned game the player wrote the move on paper and sealed it in an envelope without playing it on the board. That is this mode exactly: written, not played, handed in. A real chess tradition; I have not checked whether another app uses it as a mode name. |
| La planilla / Scoresheet | 📝 Planilla / 📝 Scoresheet | You fill in the scoresheet instead of moving the pieces. Homely and clear. |
| Sin tocar / Hands Off | ✋ Sin tocar / ✋ Hands Off | Plays on "pieza tocada, pieza jugada": here no piece is touched at all. |
| Tablero quieto / Still Board | Tablero quieto / Still Board | Says the rule literally. Plain, less character. |
| De cabeza / In Your Head | De cabeza / In Your Head | Says where the work happens. Could be confused with Blindfold. |

"Riddle" / "Acertijo" is not used unless Adrian asks.

### f. firestore.rules and sync — AGREED

Checked in `firestore.rules`: the private document `users/{userId}` has
**deliberately no field allowlist** (the comment there says so), and
`js/firebase.js` syncs any key listed in `SYNCED_KEYS` to it.

**The new keys are added to `SYNCED_KEYS`. No rules change, no deploy, nothing
for Adrian to run.** A rules change is needed only if the rating later goes on
the leaderboard or the teacher's view. Left out of launch.

### g. The same options as Puzzles, kept separate — ADDED BY ADRIAN

His words: "let give also the same possibilities isolated from the puzzles, in
accordance with the theme selection, difficulty, hint, etc."

Checked: the Puzzles screen has a theme button (`puzzle-theme-btn`), an options
button (`puzzle-options`), hint, solution, share, analyse and next buttons, a
timer, the rating with its last change, and a log; it stores `puzzleDifficulty`
and `puzzleAutoNext`.

The new mode gets its own of each, **with its own saved choices, so changing
the theme or difficulty here never changes Puzzles, and the other way round**:

- **Theme**: the same theme list and the same picker, saved as `calcTheme`.
- **Difficulty**: the same choices, saved as `calcDifficulty`, applied around
  the mode's own rating.
- **Auto-next**: saved as `calcAutoNext`.
- **Hint**: shows which piece moves for the selected empty step of the main
  line. A hint costs the "perfect" mark; its effect on the rating is whatever a
  hint costs in Puzzles (the build session reads that rule and mirrors it).
- **Solution, Analyse, Next, Share, timer, log**: as in Puzzles.
- Reuse the existing picker and option sheet with a different storage key. Do
  not copy their code into a second version.

---

## 4. Build plan — three conversations

1. **The core.** `js/calc.js` (pure: turn a puzzle into its main line, grade an
   answer tree, list what is missing, the side-variation rule as a function of
   two engine scores) with unit tests; the fifth mode's screen and button row
   on all five screens; frozen-board entry; the tree renderer; hand-in graded
   on the main line; Kael's missing-reply slot; the result view; both
   languages; precache and version bump. Puzzles are served by the player's
   puzzle rating. No engine, no options yet.
2. **Variations and options.** Stockfish at hand-in for side variations, with
   the correction shown; then decision g: theme, difficulty, auto-next, hint,
   analyse, share, timer, each with its own saved choice.
3. **Rating and progress.** `calcElo` and friends, `SYNCED_KEYS`, picking by
   the mode's own rating, not repeating solved ones, the first-time explanation
   from Kael.

Every session that changes a screen checks it at 375px, light AND dark, Spanish
AND English, with screenshots actually opened and looked at.

## 5. Not in scope

Streaks, duels or timed runs in this mode; the leaderboard; teacher homework
made of these puzzles; pre-built variation trees; hand-written puzzles; any
other chessriddle.com mode.

## 6. Open risks, said plainly

- **Entering the opponent's moves on a frozen board is the hard part of the
  idea**, and also its whole value. If it feels bad on a phone, the fallback is
  to have the app write the puzzle's reply in by itself after each move.
- **Most answers will be a single line.** With variations optional, the "tree"
  is only as branched as the player makes it. That is the decision taken; it
  is also what chessriddle.com's own demos looked like.
- **The puzzle's reply is the engine's best defence, not the only one.** A
  player who analysed a different defence correctly is told the main one is
  still owed. Kael's wording must make that feel like a follow-up question,
  not a mistake.
- **Where the 30,000 puzzles came from is not written in the repo.** The ids
  and themes match the Lichess puzzle database (CC0). Worth recording.
