# Calculation mode — a fifth puzzle mode with variation trees (design)

Date: 2026-10-10. Status: **spec only, nothing built.** Checked against commit
`770bd44` (cache v183). Working name "Cálculo / Calculation" — Adrian has not
approved the name yet (decision e).

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
- the answer is a tree, not a single line.

We take **none of their expression**:
- not their name or the word "Riddle" (never used for our section unless Adrian
  asks for it), nor their feature names ("Proof of Calculation", "Riddle
  Streak", and so on);
- no sentence of theirs: instructions, feedback messages and guide text are
  written fresh in our voice, Spanish first;
- none of their positions. Ours are built from our own 30,000;
- not their layout (dark two-column page, tree card on the right), colours,
  icons (their tree emoji, their brain emoji) or artwork;
- not their tolerance table. We do not grade with a live engine at all.

Ours also works differently in two visible ways: Kael asks follow-up questions
("and if he defends like this?"), and everything is graded offline from trees
built in advance. This section is a practical boundary, not legal advice.

---

## 3. Decisions (each with a recommendation)

### a. What the section is

**Recommendation.** *Calculation is a puzzle where the board never moves: you
write down your whole answer — your moves, the opponent's replies, and what you
would play against each serious defence — and hand it in once. A normal puzzle
checks you move by move and plays the replies for you; here nothing is checked
until you hand in, and one puzzle has two to four branches to answer.*

How one puzzle goes:

1. The position appears with "White/Black to move". The board is frozen for the
   whole puzzle. The opponent's last move is highlighted.
2. The player taps from-square then to-square. The move appears as a chip in
   the tree under the board. It is not checked, only refused if illegal in the
   position the player has reached in their head (the tree knows that position).
3. The player then taps the opponent's reply, then their own next move, and so
   on. Tapping an earlier chip and entering a different move starts a branch.
4. **Hand in** (enabled once there is at least one move):
   - **A wrong move of the player's own, anywhere** → the puzzle is failed. The
     tree colours red/green, the board comes alive, and tapping any chip shows
     that position. The stored solution tree is shown underneath.
   - **All right so far, but not everything answered** → Kael adds what is
     missing as empty slots: the continuation of the main line if the player
     stopped early, and each serious defence the player did not consider
     ("¿Y si …Re8?"). The player fills the slots and hands in again.
   - **Every required branch answered right** → solved. If that happened on the
     **first** hand-in, with no help from Kael, it is a **perfect** solve (a
     gold mark, and a small rating bonus — decision d).
5. An opponent reply the player invents that is not in the stored tree is shown
   greyed and labelled "not checked"; it neither helps nor hurts. (We have no
   engine verdict stored for it, and we do not pretend to.)
6. "Show solution" before solving counts as a failed puzzle.

Alternative considered: **guided** — the app supplies the opponent's replies
itself the moment the player enters a move. Simpler to use, but the number of
replies it shows would give away whether the first move was right, and it stops
being "prove you saw the defence". Not recommended.

### b. Where the content comes from

Facts checked: `puzzles/puzzles-0..9.json` hold 30,000 puzzles shaped
`{id, fen, moves, rating, themes}`. `moves` is in engine notation and its first
move is the opponent's (the player answers from the second). Counted today:
25,886 of the 30,000 have two to four player moves, the useful length here.
The ids and theme names match the Lichess puzzle database, which is released
CC0 — **but I did not find the source written down anywhere in the repo**; the
first build session records it or says it could not.

| Option | What it costs | What we get |
|---|---|---|
| **1. Built from our 30,000 with Stockfish, in advance (recommended)** | One build conversation for the tool, then one unattended run on Adrian's PC (my unmeasured guess: 4–10 hours for the full set; the pilot measures it). No money, no new download: the app's own engine file has a Node code path. | Hundreds to low thousands of trees, graded offline and identically on every phone. |
| 2. Written by hand | Each tree must still be engine-checked. Realistically 20–40 per conversation. | A small, lovingly explained set. Fine later as "Kael's picks", hopeless as the launch pool. |
| 3. A public-domain source | Old study and problem books (pre-1930) are free but exist as scans: positions typed in by hand, solutions known to contain errors, and studies are far too hard for most of our players. I know of no ready CC0 set that already has variation trees. Lichess *studies* are user content, not CC0. | Little, slowly. Not recommended. |
| 4. No stored content: live Stockfish grades on the phone (their way) | No build run and all 30,000 usable, but every hand-in waits seconds per move on a phone, two phones can disagree, and thresholds invite arguments. | Not recommended for launch. |

**How option 1 builds one tree** (tool: `tools/build-calc.mjs`):

- Walk the puzzle's own line. That is the main line; Lichess already guarantees
  the player's move is the only good one at each step.
- At each point where the opponent replies, ask Stockfish for its top few
  replies at a fixed depth. A reply other than the puzzle's own counts as a
  **serious defence** when it is close to the best one (starting threshold: 1.5
  pawns, or for forced mates no more than two moves longer). Keep at most two
  per puzzle, the closest first.
- For each serious defence, ask Stockfish what the player should answer. Every
  move that keeps the win and is within 1 pawn of the best is stored as
  accepted. That branch ends there.
- Keep the puzzle only if it ends up with 2–4 leaves in total, and only if a
  second, deeper pass agrees with every stored move. Otherwise drop it.
- The thresholds are starting values. The pilot (300 puzzles) reports the yield
  and the time, and prints ten trees for Adrian to look at before the full run.

**Stored shape** (one file per rating band, `puzzles/calc-0..9.json`, loaded on
demand like the puzzle files):

```
{ "id": "c4pxqH", "src": "4pxqH", "fen": "<position with the PLAYER to move>",
  "last": "c5c2", "rating": 1430, "themes": ["fork"],
  "t": [ ["Bxe6+"], [ ["Kf8", [["Bxa2"], []]],
                      ["Kh8", [["Bxa2","Qf6+"], []]] ] ] }
```

`t` is a player node: `[accepted, replies]`. `accepted` lists the moves counted
right, the first being the one shown in the solution; more than one is allowed
only where the branch ends. `replies` lists `[opponentMove, nextPlayerNode]`,
main defence first; an empty list means the line is over.

**How many at launch.** Target **1,000 (100 per rating band)**; floor 300. The
real number comes from the pilot's yield — I will not promise it before
measuring.

### c. How the tree looks at 375px

Checked: `js/tree.js` (16 KB) is the app's game tree — `GameTree`, with
variations, `play()`, a FEN on every node, and a PGN reader/writer. It is used
by Analysis/Play/Opening (through `js/movelist.js`), Masterclass and History;
the Read tab only takes `START_FEN` from it. **Reuse it** for the player's
answer and for the stored solution: no second tree. What is *not* reused is the
drawing in `js/movelist.js`: it prints variations inline in brackets, which is
right for reading a game and wrong here (chips must be big enough to tap, and
empty slots must be visible). The tree gets its own small renderer.

```
┌───────────────────────────────────────┐ 375px
│ 🧩 Puzzles │ 🙈 A ciegas │ ⚡ Rush      │  mode row, 3 + 2
│   ⚔ Duelo        │   🧮 Cálculo        │
├───────────────────────────────────────┤
│ Juegan blancas            Cálculo 1430│
│ ┌───────────────────────────────────┐ │
│ │                                   │ │
│ │     board — never moves           │ │
│ │     (last move highlighted)       │ │
│ │                                   │ │
│ └───────────────────────────────────┘ │
│ Tu análisis                           │
│  16. [Ce6+]                           │
│      ├ … [Rg8]   17. [Cxc7]           │
│      └ … [Re8]   17. [  ?  ] ← Kael   │
│                                       │
│ [⌫ Borrar] [👁 Solución] [ Entregar ] │
└───────────────────────────────────────┘
```

- One row per opponent reply, indented under the move it answers. A branch is a
  new row, never brackets.
- Chips are at least 40px tall. The selected chip has the gold border: the next
  move entered goes after it. "Borrar" deletes the selected chip and everything
  after it.
- An empty slot `[ ? ]` is a question from Kael. Tapping it selects it.
- The tree panel scrolls inside itself; at least three rows stay visible at
  375×667. The build session measures this rather than trusting the drawing.
- After hand-in: right chips green, wrong red, unchecked grey; the board
  unfreezes and follows the tapped chip.
- Navy and gold, the existing chip and card styles, Kael's horse artwork for
  his questions. No owl, no tree emoji.

### d. Rating, and what counts as solved

**Recommendation: its own rating, private, shown only inside the section.**

- **Solved** = every required branch answered right with no wrong move, however
  many hand-ins it took. **Perfect** = solved on the first hand-in. **Failed** =
  any wrong own move, or the solution opened.
- Rating: the same Elo arithmetic the puzzles use (reuse the existing function,
  do not write a second one), new key `calcElo`, starting at the player's
  puzzle rating minus 200. A perfect solve pays 1.25× the normal gain. Stored
  with `calcEloHistory`, `calcAttemptCount` and `calcSolved` (`{id: 1}` solved,
  `{id: 2}` perfect).
- It is **not** a fifth "domain": it stays off the radar chart, the
  leaderboard, the profile cards and the teacher's view at launch. The four
  domain keys (puzzle/opening/endgame/blindfold) are untouched.

Alternatives: feeding the normal puzzle rating (rejected — these are harder and
would distort it); no rating at all, just a solved count (simplest, but then
the mode cannot pick puzzles of the right difficulty).

### e. Name and where the button goes

Checked: the row is `.seg.puzzle-modes`, a two-column grid in `css/style.css`,
and its four buttons are **repeated in four screens** (`index.html` — the
puzzles, rush, pulso and blind sections). `openPuzzleMode()` in `js/app.js`
does the switching. `tools/cdp-verify-puzzle-modes.mjs` and
`tools/cdp-verify-swipe-modes.mjs` exist and will need the fifth mode.

**Name — recommendation: "🧮 Cálculo" / "🧮 Calculation".** It is the plain
chess word for the skill, it fits the button, and it is nobody's brand.
Alternatives: "Variantes / Lines", "A fondo / In depth". "Riddle" / "Acertijo"
is not used unless Adrian asks.

**Button — recommendation: five buttons in the same two rows, three on top and
two below** (Puzzles · A ciegas · Rush / Duelo · Cálculo). The row keeps its
height, so no screen loses space. Alternatives: a third row for the new button
alone (costs about 46px on all five screens); or a switch inside the Puzzles
screen instead of a mode (hides it).

### f. firestore.rules and sync

Checked in `firestore.rules`: the private document `users/{userId}` has
**deliberately no field allowlist** (the comment there says so), and
`js/firebase.js` syncs any key listed in `SYNCED_KEYS` to it.

**Recommendation: sync the four new keys by adding them to `SYNCED_KEYS`. No
rules change, no deploy, nothing for Adrian to run.** The rating follows the
player to another phone like the blindfold one does.

A rules change (and Adrian's `rules:deploy`) is needed only if the rating later
goes on the **leaderboard** or the **teacher's view** — both of those documents
do have allowlists. That is deliberately left out of launch.

---

## 4. Build plan — three conversations

1. **Content.** `js/calc.js` (pure: read the stored shape into a `GameTree`,
   grade an answer, list what is missing) with unit tests under `tests/unit/`;
   `tools/build-calc.mjs`; the 300-puzzle pilot with measured yield and time;
   ten printed trees for Adrian; then the command for the full run. No screen
   changes. Ends when `puzzles/calc-*.json` exist and are committed.
2. **The screen.** The fifth mode: section, button row on all five screens,
   frozen-board entry, the tree renderer, hand-in, Kael's questions, the result
   view, both languages, precache and version bump. No rating yet: puzzles are
   served by the player's puzzle rating.
3. **Rating and progress.** `calcElo` and friends, `SYNCED_KEYS`, picking by
   rating, not repeating solved ones, the first-time explanation from Kael.

Every session that changes a screen checks it at 375px, light AND dark, Spanish
AND English, with screenshots actually opened and looked at.

## 5. Not in scope

Streaks, duels or timed runs in this mode; the leaderboard; teacher homework
made of Calculation puzzles; live engine grading; hand-written puzzles; any
other chessriddle.com mode.

## 6. Open risks, said plainly

- **Yield is unknown.** If few puzzles have a second serious defence, the pool
  is small or the thresholds must loosen. The pilot answers this before any
  screen is built.
- **Engine-chosen defences can be dull** (a reply that loses the same way).
  The filters and Adrian's look at ten trees are the guard.
- **The app's engine file running under Node is unproven.** It has a Node code
  path; the first build step tries it. If it fails, a native Stockfish download
  is the fallback and needs Adrian's yes first.
- **Entering the opponent's moves on a frozen board is the hard part of the
  idea**, and also its whole value. If it feels bad on a phone, the fallback is
  the guided variant in decision a.
