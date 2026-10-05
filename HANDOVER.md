# Chess app — where things stand (updated 2026-10-04)

## Already done and pushed — do NOT redo these

- **BLINDFOLD — PEEK IS SWITCHED OFF WHILE THE PIECES ARE ON SHOW FOR MEMORISING
  (v146, 2026-10-04, later session).** `sw.js` v144 → **v146** in this commit (v145
  was another session's uncommitted bump for its `js/diagram.js` work; that work is
  NOT in this commit, only the number moved past it). Committed on `main`, NOT
  pushed, NOT deployed. **Not tested on a real phone.** Adrian chose "greyed out"
  over "pressable but harmless".
  - **Reproduced first, with real taps (EN/light, old code, 8 s look):** Peek during
    the countdown AND Peek in the half second before the countdown appears — both
    spent a peek (0 → 1), forfeited the time extra ("Time extra forfeited by the
    peek"), and ~5.0 s after the tap hid the pieces and turned the board live with
    the countdown still on screen (≈500 samples each, 5 ms apart).
  - **Fix.** `js/app.js`, `Blind.memorising`: set true in `nextPuzzle` (before
    `updatePeekBtn`), false in `hidePieces` (which now calls `updatePeekBtn`) and in
    `cleanup()`. `Blind.peek` returns at once while it is true; `updatePeekBtn`
    disables the button. `Blind.token`, `js/board.js`, `js/blind-elo.js` untouched.
  - **Verified, headless CDP at 375px.** `taps` mode EN/ES x light/dark **125/125**
    (was 97; +7 per combination at the end of `tapsBlind`: the two early-Peek cases,
    3 checks each, and "Peek on a live puzzle still works" — one peek spent, extra
    given up, 5 s shown with the board locked, then hidden and live). Peek after
    the puzzle is over: still green. `cdp-verify-blind.mjs` **75/75**. `test:tree`
    **98/98** (two of those are the other session's uncommitted diagram tests).
  - **NOT GREEN: full pre-move suite 83/84, twice** (CPU 100% then ~45% — League of
    Legends running, not another session). Run 1: one Puzzles case, `lagMs` 5.5
    against a limit of 5. Run 2: `BLINDFOLD reply / tap / straddle` — the first move
    was never taken (`played:false`). Blindfold part alone, twice more: 50/52 (a
    Puzzles `deadMs` of 1; and the countdown case served a puzzle whose first move
    is a promotion, which that case cannot use and reports as a FAIL), then
    **52/52**. The not-taken move did not repeat in those two runs. **Not
    explained** — a guess, not checked: `blindNext()` accepts `timeLocked` as proof
    the new puzzle arrived, and an unscored old puzzle is also time-locked.
  - **REALLY TAPPED:** Next, Peek (at a point re-measured after the countdown number
    appears — it pushes the button down), Go, every chess move. **SEEDED:** the 8 s
    (and 2 s) memorising time through the slider's own events, hint warning marked
    seen, autoNext off. Puzzles are the app's own.

- **READ TAB — IN A SIX-TYPE BOOK A HELD SHAPE OF ANOTHER TYPE NEARER THAN THE WINNER
  EMPTIES THE SQUARE (v145, 2026-10-04). BUILT; ADRIAN APPROVED THE COMMIT AFTER
  SEEING THE SLIPPED-LESSON COST BELOW.** Committed on `main`, NOT pushed, NOT
  deployed, not tested on a real phone. `sw.js` v144 → **v145** in this commit, put
  in through the index only: the working copy already said v146 (another session's
  bump for its own uncommitted `js/app.js` work — theirs, not in this commit). The
  next free number is **v147** unless that session has moved again — grep first.
  - **The change** — one line in `classifyCells` (`js/diagram.js`), beside the v143
    line, BRACES INCLUDED (without them the `else` binds to the inner `if` and the
    rule is a silent no-op):
    `if (types.size < 6) { …v143… } else { for (const ty of Object.keys(byHeld)) if (ty !== type && byHeld[ty] < d1) d2 = d1; }`
    `modelOf`, `nearest`, `learnFromCells`, `PEND_CAP` 8, `LEARN_AGREE` 0.025 and
    every `STRICT` number are unchanged. It can only empty a square.
  - **Tests** (`tests/unit/diagram.test.js`, now 33; `test:tree` 98/98): three new —
    nearer held shape of another type empties (failed on v143: read `p`); nearer
    held shape of the SAME type does nothing; held shape of another type FURTHER
    than the winner but inside `lead` does nothing. Each was run against the wrong
    form it guards (no braces / `ty !== type` dropped / the dead `byHeld < d2`
    form) in a scratch copy and failed there. The v143 test "the same held shape
    does nothing in a book that knows all six types" was REMOVED: its made-up held
    shape sat nearer than the winner, so it asserted the opposite of this rule.
  - **Clean lessons, before the gate — reproduced exactly.** Hold-out wrong: v143
    0 at 0–6, 2 at 7, 2 at 8, 0 at 9–10; built 0 at 0–10; correct identical at
    every count (1187, 10550, 9598, 8532, 7348, 6160, 4947, 3873, 2752, 1613, 738).
    First set wrong 0 everywhere; correct 3860 → 3858 at 1 lesson, same elsewhere.
  - **SLIPPED LESSONS — measured for the first time. The rule costs correct pieces
    when a wrong confirmation is being held.** Correct pieces v143 showed that the
    rule empties (`NOGATE=1`; v143 correct in brackets):

    | | set | 2 | 4 | 6 | 8 |
    |---|---|---|---|---|---|
    | `POISON=one` | first | 20 (3324) | 0 | 0 | 0 |
    | | hold-out | 1 | 0 | 0 | 0 |
    | `POISON=one POISON_BOTH=1` | first | 41 (3315) | 57 (2298) | 41 (1360) | 16 (460) |
    | | hold-out | 1 | 1 | 0 | 0 |
    | `POISON=same` | first | 11 | 0 | 0 | 0 |
    | | hold-out | 5 | 0 | 0 | 3 |
    | `POISON=same POISON_BOTH=1` | first | 11 | 17 | 10 | 6 |
    | | hold-out | 5 | 10 | 11 | 7 |

    Worst: a slip in EVERY lesson on Chess Life, 1.2–3.5% of correct pieces. One
    slip in the first lesson: 20 at 2 lessons, nothing from 4 on. Wrong pieces
    under slips, v143 → built: first set `same` 5 → 0 (2 lessons), 4 → 0 (4),
    `same`+BOTH 3 → 0 (6); hold-out at 8 lessons `one` 3 → 0, `same` 7 → 3,
    `same`+BOTH 8 → 6, `one`+BOTH 4 → 4. Hold-out `same` at 2/4/6 lessons: 9/7/4
    wrong under BOTH versions — the rule does nothing for those. No wrong-colour
    reads. Totals only: WHICH squares are lost was not listed.
  - **Verified:** `cdp-verify-pieces` 55/55 (375px, EN/ES × light/dark; really
    tapped: long-press, Clear board, a square, Open; seeded: the book and its
    templates). `cdp-verify-hatched` 92/92 (last argument 17). `cdp-verify-stage2`
    green on the preview server's real port (it failed twice with "Failed to fetch
    dynamically imported module" while 14 measurement runs had the machine
    saturated, and passed once they finished — run it on an idle machine).
  - **STILL UNMEASURED:** the rule once the useful held shape has been pushed out by
    `PEND_CAP`; which squares the slipped runs lose and whether the gate changes
    the count; the 4–9 wrong pieces the hold-out still places under `POISON=same`
    (old, not caused by this rule); lesson orders other than book order; more than
    10 lessons; FCE as a six-type book beyond 3–6 boards; another shaded-square
    book at six types; a sixth book; scans; a real phone. Both truth files are
    fitted, neither is unseen.
  - **NOT FIXED — the cause.** "Six types known" is counted without regard to
    square shade, and `LEARN_AGREE` 0.025 is too tight for FCE's dark squares
    (the same pawn differs 0.030–0.066 between diagrams, so it stays held). This
    rule only covers the case where the true piece is held and nearer.

- **BLINDFOLD — PEEK DOES NOTHING ONCE THE PUZZLE IS OVER; NO CHECK GLOW WHILE THE
  PIECES ARE HIDDEN (v144, 2026-10-04).** `sw.js` v143 → **v144** in this commit
  (another session had already bumped the working copy to v145 for its own
  `js/diagram.js` work — that bump is theirs and is not in this commit). Committed
  on `main`, NOT pushed, NOT deployed. **Not tested on a real phone.**
  - **Reproduced first, with real taps (EN/light, old code):** Peek after Show
    solution had finished, Peek after solving by hand, and Peek while the solution
    was still playing — all three spent a peek and 5 s later hid the pieces again;
    the two Show-solution cases also turned the locked board live. The check glow
    was lit on every sample taken with the pieces hidden (54 of 54).
  - **Fix.** `js/app.js`: new `Blind.isOver()` (= `this.logged`, set by a solve and
    by Show solution, cleared only by `nextPuzzle`); `Blind.peek` returns at once
    when it is true; `Blind.updatePeekBtn` disables the button then, and is now
    also called on a solve and at the start of `showSolution`. `Blind.token` and
    `cleanup()` untouched. `js/board.js` (Adrian said yes): `render` adds `.check`
    only when `!this.piecesHidden`. `js/blind-elo.js` untouched.
  - **Verified, headless CDP at 375px.** `taps` mode EN/ES x light/dark **97/97**
    (was 61; +9 per combination in `tapsBlind`). `cdp-verify-blind.mjs` **75/75**.
    `test:tree` **96/96**. Peek during a live puzzle still works (existing "Peek
    inside the reply window" case: 5 s, then hidden and live).
  - **NOT GREEN: full pre-move suite 79/84, twice — and 78/84 on an untouched copy
    of the previous commit run the same hour.** A different handful fails each run,
    every one a timing limit missed by a hair (`lagMs < 5`, `deadMs < 1`) in
    Puzzles, Rush and Blindfold alike. The CPU sat at 100% throughout (another
    session was working in this checkout). Machine noise, not this change — but
    84/84 was NOT seen today. Re-run it on a quiet machine before trusting it.
  - **REALLY TAPPED:** every chess move, Peek, Show solution, Next, Go.
    **SEEDED:** the 2 s memorising time, the hint warning marked seen, autoNext
    off. Puzzles are the app's own; Next is tapped until one fits the case.
  - **Seen, left alone (not in scope):** after a hand solve the Blindfold board
    stays live (taps select pieces, no move is taken) — the Puzzles tab does the
    same. **Read from the code, NOT run:** Peek during the memorising countdown is
    not guarded — it spends a peek, forfeits the extra, and its 5 s timer hides
    the pieces and opens the board while a longer countdown is still on screen.

- **READ TAB — THE "PAWN SHOWN AS A ROOK PAST 6 LESSONS" DEFECT DIAGNOSED; ONE RULE
  PROPOSED AND MEASURED; NOTHING BUILT — ADRIAN DECIDES (2026-10-04, later session).**
  No file the app loads was touched by this session; `js/diagram.js` is unchanged.
  `test:tree` 96/96. Nothing tapped: real `classifyCells`/`learnFromCells` in Node on
  squares measured afresh in headless Chrome (both truth files re-rendered). All
  scripts were scratch and are gone; the rule is one line, quoted below.
  (Another session had `js/app.js`, `js/board.js`, `sw.js` → v144 and
  `tools/cdp-verify-premove.mjs` uncommitted in the tree at the time — not this work.)
  - **1. Reproduced exactly.** Hold-out, `LEARN=7` and `8`, `NOGATE=1`: FCE
    p350→p150a **h6** and p150b **d6**, `r` for `p`. First set: 0.
  - **2. THE CAUSE — the rook samples are REAL rooks, learned from clean lessons.
    What is missing is the pawn.** Traced sample by sample:
    - Nearest to h6 / d6: `r` from **p200a g5** (0.071 / 0.074) and `r` from
      **p200b h8** (0.080 / 0.096) — both true black rooks on dark squares.
    - The book's trusted pawn samples at that point (P ×4, p ×2) ALL come from
      LIGHT squares. The nearest of them is **0.51 / 0.46** away. In FCE the dark
      square's shading dominates the measured shape: everything standing on a
      dark square is within ~0.10 of everything else on one, and ~0.5 from the
      same piece on a light square.
    - The book HAD been shown black pawns on dark squares four times in three
      lessons (p250 b6 and a7, p70 f6, p100a g7). They sit 0.021–0.045 from h6/d6
      — much nearer than the rook. All were still HELD, never trusted: between
      diagrams the same dark-square pawn differs by 0.030–0.066, which is over
      `LEARN_AGREE` 0.025, so two diagrams never "agree". (p250 a7 was itself
      refused as a contradiction of the rook.)
    - So: p350 teaches no pawn; light-square pawns get learned; the book then
      counts as knowing all six TYPES; `STRICT.full` (match 0.13) switches on;
      and a dark-square pawn, which the book effectively has never learned, is
      inside 0.13 of a rook with the next trusted type (king, 0.135–0.145) a full
      `lead` behind. "Six types known" is counted per type, but in this book a
      shape is only known per square shade.
  - **3. Exposure (v143, clean lessons, before the gate, six-type books only).**

    | correct reads at d1 > 0.06 / all correct | 7 | 8 | 9 | 10 |
    |---|---|---|---|---|
    | hold-out | 35 / 2096 (1.7%) | 19 / 1599 | 9 / 1085 | 2 / 523 |
    | first set (ChessLife only) | 97 / 750 (12.9%) | 50 / 378 | no reads | no reads |

    **The number that matters more: FCE has almost never been read as a six-type
    book.** At 7 lessons 1 plan of 30 reaches six types (3 boards read), at 8
    three plans (6 boards), at 9 six plans (6 boards). In that one plan at 7
    lessons, 2 of 19 pieces shown were wrong. Dvoretsky and Hellsten never reach
    six types in either file. So `STRICT.full` is measured on Chess Life (where
    square shade does not matter: 41 of 41 "pawn-type known only on the other
    shade" reads were right) and next to nothing else. In FCE, pieces whose type
    was known only from the other shade: 15 at 7 lessons — 0 right, 2 wrong, 13
    left empty.
  - **4. THE ONE RULE PROPOSED — "in a six-type book, a held shape of another type
    that is NEARER than the winner empties the square".** In `classifyCells`,
    beside the v143 line (braces matter — an `else` without them binds to the
    inner `if`, which silently made the first measurement a no-op):
    `if (types.size < 6) { …v143 line… } else { for (const ty of Object.keys(byHeld)) if (ty !== type && byHeld[ty] < d1) d2 = d1; }`
    This is NOT the dead "held-shape rule applied to six-type books" (that one
    fires when a held shape is within `lead` of the winner and lost 97–156
    pieces); this fires only when the held shape beats the winner outright. It can
    only empty a square. Measured from a scratch copy, both sets, 0–10 lessons:

    | hold-out, lessons | 0–6 | 7 | 8 | 9 | 10 |
    |---|---|---|---|---|---|
    | v143 wrong | 0 | **2** | **2** | 0 | 0 |
    | rule wrong | 0 | 0 | 0 | 0 | 0 |
    | correct lost | 0 | 0 | 0 | 0 | 0 |
    | correct (both) | 73.9–82.5% | 83.5% | 84.0% | 84.1% | 87.6% |

    First set: wrong 0 / 0 at every count; correct lost **2 at 1 lesson** (3860 →
    3858), 0 at every other count (no reads at 9–10).
  - **HOW THIN:** very. It removes exactly the two squares it was designed on, in
    one lesson order of one book, and nothing else in either file moved (bar 2
    pieces). It only helps when the true piece was confirmed at least once on
    that shade AND is still held — `p` held was at the `PEND_CAP` of 8 in this
    plan, so one more held pawn could have pushed the useful one out. It does
    nothing for a dark-square piece never confirmed at all. It treats the
    symptom; the cause (shade-blind "six types", and `LEARN_AGREE` too tight for
    FCE's dark squares) stands.
  - **Considered, NOT measured as a rule:** "use `partial` on a shade that lacks
    one of the six types". Estimated only: it would catch both squares but drop
    56 of 750 correct at 7 lessons on the first set (114 of 1481 at 5) for
    nothing gained there, and needs every sample to remember its square shade
    (a stored-data change).
  - **STILL UNMEASURED:** the rule under `POISON=` (a slipped held shape can now
    empty right squares in a six-type book); the rule once the useful held shape
    has been pushed out; `LEARN_AGREE` per shade or looser for FCE dark squares
    (0.035 for all is dead); lesson orders other than book order; FCE as a
    six-type book beyond 3–6 boards; any other book with shaded dark squares at
    six types; more than 10 lessons; a sixth book; scans; a real phone. Both
    truth files are fitted, neither is unseen.

- **READ TAB — "A HELD SHAPE OF ANOTHER TYPE IS A RIVAL" BUILT (v143); AND A NEW
  DEFECT FOUND PAST 6 LESSONS, NOT FIXED (2026-10-04).** `sw.js` v142 → **v143**.
  Changed: `js/diagram.js` (`modelOf` returns `held`, `nearest` returns `byHeld`,
  one line in `classifyCells`, only while `types.size < 6`; `learnFromCells`
  untouched), `tests/unit/diagram.test.js` (+3, 31 tests). Committed on `main`,
  NOT pushed, NOT deployed. **Not tested on a real phone.**
  - **Tests.** `test:tree` 96/96. Of the three new tests only the first can fail
    on the old code (it did: read `p`, expected empty). The other two are guards:
    each was checked to fail against the wrong form it guards (rule applied to a
    six-type book; rival not excluding the chosen type), on throwaway copies.
  - **Re-measured, both sets rendered afresh in headless Chrome, clean lessons,
    before the gate — matches the entry below exactly.**

    | hold-out, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | v139 wrong | 0 | 0 | 0 | 1 | 1 | 1 | 1 |
    | v143 wrong | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
    | v139 correct | 73.9% | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | v143 correct | 73.9% | 75.2% | 77.3% | 78.9% | 79.8% | 81.0% | 82.5% |

    | first set, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | v139 / v143 wrong | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
    | v139 correct | 77.0% | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | v143 correct | 77.0% | 76.3% | 77.5% | 78.4% | 80.5% | 81.4% | 82.3% |

    `POISON=same` (v143, wrong before the gate, 2/3/4/6 lessons): hold-out
    9 / 8 / 7 / 4, slips accepted 5/5/5/3 of 118; first set 5 / 4 / 4 / 0, 1/1/1/0
    of 52. **The rule still does NOT fix the repeated slip.** `POISON=one` (1, 3)
    and `POISON=one POISON_BOTH=1` (3, 6): 0 wrong on both sets.
  - **`PEND_CAP` full — measured, nothing decided.** The cap is not a rare event:
    held shapes are pushed out from 2 lessons on (hold-out, summed over all
    plans: 38 drops at 2 lessons, 224 at 4, 450 at 6, 866 at 10). Compared against
    a copy that never drops (`PEND_CAP` 1000) at 1–10 lessons: **wrong pieces
    identical at every lesson count on both sets**; correct pieces within 3 on the
    hold-out, and the real cap 8 is BETTER on the first set (1430 vs 1416 at 6
    lessons). **f8 does not come back**: 0 at 7, 8, 9, 10 lessons (v139 still had
    it at 7 and 8), and not even with the cap forced down to 2.
  - **NEW DEFECT, IN v139 AND v143 ALIKE, NOT FIXED: a black pawn SHOWN as a black
    rook at 7 and 8 lessons.** FCE taught from p350, lessons
    p200a+p200b+p250+p300+p380+p70+p100a(+p100b): p150a **h6** and p150b **d6**,
    `r` for `p`, d1 0.071 / 0.074, lead 0.073 / 0.061, clear 0.064 / 0.057. The
    book knows all six types by then, so `STRICT.full` applies (match 0.13, lead
    0.06) and the new rule is not in play. **The gate does not catch it — these
    two are shown to the user.** One lesson order out of 11; in the other orders
    the same squares read `p` or empty. 0 at 9 and 10 lessons (few reads: 162,
    66). First set: 0 at 7 lessons. Why the pawn sits nearer a rook sample than
    any pawn sample: NOT looked at. Nobody had run more than 6 lessons before.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-pieces`
    **55/55**, `cdp-verify-hatched` **92/92** (last argument 17),
    `cdp-verify-stage2` exit 0 first try (preview server on 8743). REALLY TAPPED:
    what those tools tap (long-presses, Clear board, a square, Open). SEEDED: the
    books and their templates, as before. **No browser check exercises the new
    rule itself** — it is covered by the unit tests and the Node measurement on
    squares measured in Chrome.
  - **STILL UNMEASURED:** the rook-for-pawn defect above (cause, and how often in
    other orders/books); `SLIP_TO=` other types; the same slip on different
    square shades; lessons in another order than book order; more than 10
    lessons, and 7+ on Silman (7 diagrams — too few); a Chess Life issue other
    than 2026-09; a sixth book; scans or photos; a real phone. Both truth files
    are fitted, neither is unseen.
  - Run: `LEARN=7 REUSE=1 NOGATE=1 LIST=1 DUMP=<file> node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`

- **READ TAB — THE "UNLEARNED PIECE READ AS A LEARNED ONE" HOLE MEASURED; ONE RULE
  PROPOSED AND MEASURED; NOTHING BUILT — ADRIAN WAS NOT THERE TO CHOOSE
  (2026-10-04).** Tool only: `tools/measure-pieces.mjs` gained `DUMP=<file>` (one
  JSON line per square that holds or was given a piece: truth, placed before the
  gate `raw`, after it `shown`, nearest type, d1, lead, clear, the codes the book
  held). **The app is unchanged, `sw.js` not bumped by this session.** `test:tree`
  93/93. Nothing tapped: real `classifyCells`/`learnFromCells` in Node on the
  squares measured in headless Chrome by the v139 session (features reused).
  The baseline reproduces the v141 entry below exactly (75.4 / 77.5 / 79.2 / 80.2 /
  81.5 / 83.1 on the hold-out; same slip 5 of 118, 9 / 9 / 7 / 5 wrong).
  - **1. How often (v139, clean lessons, before the gate).** "Unlearned" = the
    book holds no trusted sample of that piece TYPE in either colour.

    | hold-out, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | unlearned pieces read | 162 | 1404 | 1076 | 860 | 674 | 471 | 325 |
    | of them within `match` 0.06 of a learned type | 13 | 127 | 116 | 99 | 86 | 73 | 59 |
    | READ AS ANOTHER TYPE, before the gate | 0 | 0 | 0 | **1** | **1** | **1** | 0 (*) |
    | after the gate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

    (*) at 6 lessons the same square is still read wrong: the book has by then
    learned the WHITE bishop, so the type counts as learned, but the white shape
    is no help against a black bishop (lead still 0.072). First set: 0 at every
    lesson count (48–312 unlearned pieces, at most 2 within 0.06).
    It is ONE square on ONE board every time — FCE p150b f8, black bishop read as
    a pawn, d1 0.053–0.058, lead 0.067–0.072, clear 0.054–0.059.
  - **The finding that matters: `match` is not what protects.** About 1 unlearned
    piece in 10 on the hold-out sits inside 0.06 of a learned type (10 distinct
    squares; Dvoretsky rooks at 0.054–0.057 from a pawn, an FCE rook at 0.041).
    They are stopped by `lead` and `clear`, several by under 0.01. So "a tighter
    match while the book is incomplete" is the wrong tool: 0.05 would drop 89
    correct pieces at 3 lessons on the hold-out (65 on the first set) and still
    leave 14 unlearned pieces inside it. Estimated from the dump, NOT run.
  - **2. THE ONE RULE PROPOSED — "a held shape of another type is a rival".** While
    the book knows fewer than six piece types, the shapes waiting in `t.pending`
    count against a read: if a held shape of ANOTHER type is nearer than
    `lead` beyond the trusted match, the square is left empty. A held shape can
    then only empty a square, never place a piece — the same footing as an empty
    sample. It works on f8 because a black bishop had already been confirmed in the
    lessons and was waiting (which lesson squares: not checked). Scratch copy only (`modelOf` + `nearest` +
    one line in `classifyCells`, about 6 lines); not in the repo.
    Clean lessons, before the gate, wrong pieces / pieces read correctly:

    | hold-out, lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | v139 wrong | 0 | 0 | 1 | 1 | 1 | 1 |
    | rule wrong | 0 | 0 | 0 | 0 | 0 | 0 |
    | v139 correct | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | rule correct | 75.2% | 77.3% | 78.9% | 79.8% | 81.0% | 82.5% |
    | correct pieces lost | 26 | 32 | 31 | 35 | 35 | 33 |

    | first set, lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | v139 / rule wrong | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
    | v139 correct | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | rule correct | 76.3% | 77.5% | 78.4% | 80.5% | 81.4% | 82.3% |
    | correct pieces lost | 5 | 6 | 8 | 6 | 5 | 4 |

    In books still short of six types alone the cost is 0.3–1.0 point (hold-out
    70.7% → 70.2% at 3 lessons). 0 lessons: identical (nothing is held yet).
  - **The same rule applied to EVERY book (also those that know all six) was
    measured first and is worse — do not build that form:** also 0 wrong, but it
    loses 97–156 correct pieces per column (first set 76.4% → 74.3% after one
    lesson, below "nothing learned"), nearly all in Chess Life, where the hole
    cannot occur.
  - **`POISON=same` — THE RULE DOES NOT FIX THE REPEATED SLIP.** The prompt's
    guess that it is the same hole is wrong. Wrong pieces before the gate, v139 →
    rule: hold-out 9 → 9 (2 lessons), 9 → 8 (3), 7 → 7 (4), 5 → 4 (6); first set
    5 / 4 / 4 / 0 unchanged. Slipped pairs accepted: unchanged (5 of 118, 1 of 52)
    — the rule is in the reader, not in learning. `POISON=one` (1 and 3 lessons)
    and `POISON=one POISON_BOTH=1` (3 and 6): v139's lone wrong piece goes 1 → 0,
    nothing new appears, cost 0.1–0.3 point.
  - **3. Recommendation given to Adrian: build it** (the narrow form). The gate
    caught f8 only because a pawn cannot stand on the back rank; the same misread
    on any other rank would not trip the gate (not observed, reasoned). Cost about half a point of correct
    reads. **Stated plainly: the evidence is one square in one book, and the rule
    is fitted on both truth files.** Leaving it is also defensible: 0 wrong with
    the gate on everything measured.
  - **What the rule cannot do:** it needs the unlearned piece to have been
    confirmed at least once. A piece the user has never confirmed in that book is
    still held off only by `lead` and `clear` (99 such near pieces at 3 lessons on
    the hold-out, none placed).
  - **4. STILL UNMEASURED:** a slip to other wrong types (`SLIP_TO=` not run); the
    same slip on different square shades; lessons in another order than book
    order; more than 6 lessons; the rule with `PEND_CAP` full (old held shapes
    are dropped, so a rival can disappear); a Chess Life issue other than
    2026-09; a sixth book; scans or photos; a real phone.
  - Run: `LEARN=3 REUSE=1 DUMP=<file> node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`

- **NOTHING DELAYED OUTLIVES ITS PUZZLE — SHOW SOLUTION, THE REPLY, BLINDFOLD'S
  COUNTDOWN, A RUSH RUN'S TIMERS (2026-10-04).** `sw.js` v141 → **v142** (v141
  is another session's Read work). Changed `js/app.js` only (`js/board.js` and
  `js/blind-elo.js` untouched); `tools/cdp-verify-premove.mjs` gained a `taps`
  mode. Web-only. Committed on `main`, NOT pushed. **Not tested on a real phone.**
  - **Reproduced with real taps before anything was changed (EN/light, 9 of 16
    checks failed).** What really failed:
    1. **Show solution + Next, Puzzles and Blindfold** — the new puzzle was
       played out to its last move for the player, uncharged.
    2. **Next inside the 0.4 s reply** — Puzzles: the old reply landed on the new
       puzzle (its opening move shown twice in the history; mild). Blindfold:
       the board went **live with the new puzzle's pieces on show**, for the
       whole memorising countdown.
    3. **Peek inside the 0.4 s reply (Blindfold)** — the board went live during
       the 5 s peek: a move could be made in sight of the pieces.
    4. **Show solution inside the 0.4 s reply, both** (not on the list, same
       shape) — the reply made the board live while the solution was playing.
    5. **Show solution during Blindfold's memorising countdown** (not on the
       list) — the countdown ran on and hid the pieces mid-solution.
    6. **Rush, left and restarted inside a second** — restart inside the
       count-in: two clocks, 6 s lost in 4 s, and the orphan clock never stops.
       Wrong move, then restart inside 1.2 s: the old run swapped the new run's
       first puzzle. **Honest limit:** this took four taps (menu, Puzzles, Rush
       chip, Start) in 0.3–0.4 s, machine speed; the windows are 1.0 s and 1.2 s.
       A hand will rarely manage it. Fixed because the stuck double clock is
       ugly when it does happen.
  - **The fix — one idea, three places.** Each mode holds a throwaway object;
    whatever is about to wait keeps a reference and gives up if it has been
    replaced when it wakes.
    - `Puzzles.token`: replaced in `loadPuzzle()` and at the start of
      `showSolution()`. Checked after the `sleep(400)` in `userMove` and after
      each `sleep(700)` in `showSolution`. So Show solution also takes over from
      a pending reply and from an earlier tap on itself.
    - `Blind.token`: replaced in `cleanup()` (Next, start panel, leaving).
      `showSolution()` now calls `cleanup()` first — that is what stops the
      countdown and a peek. After the reply `board.interactive =
      board.piecesHidden`, so a peek keeps the board locked and its own 5 s
      timer hands it back. **Peek does not replace the token** — the reply must
      still land during a peek.
    - `Rush.run`: replaced in `start()`. `Rush.live(run)` = still running AND
      the same run; every Rush `setTimeout` and both count-in steps use it.
    - It is an object, not the puzzle, on purpose: a homework list with one
      puzzle left reloads **the same puzzle object**, and Blindfold can draw the
      same one twice, so `this.current === solvedPuzzle` would not have caught
      those. Auto-next still uses the puzzle identity; left alone.
  - **Charging unchanged:** `markFailed()` still runs before the loop. Measured:
    the abandoned puzzle is charged once (attempts +1), the new one not at all.
  - **Measured, `node tools/cdp-verify-premove.mjs <outDir> taps`, 375 px, EN/ES
    × light/dark:** 61/61 after the fix (15 cases per language/theme).
    `stale` mode passes; the pre-move suite still 84/84, `cdp-verify-blind.mjs`
    75/75, `test:tree` 93/93. `ONE=1` keeps `taps` to EN/light,
    `ONLY=tapsPuzzles|tapsBlind|tapsRush` to one mode.
  - **Tapped vs seeded:** every chess move and every button is a real touch.
    SEEDED: which puzzle the Puzzles cases start on (`loadPuzzle`), Blindfold's
    2 s memorising time, the hint warning marked seen, `autoNext` off.
    Blindfold and Rush puzzles are the app's own. Rush's restart taps land the
    instant each button is on top, with no human pause.
  - **Harness facts:** on a phone the tab bar is a drawer — tap `#tabmenu-btn`
    first. The test profile's ratings sink to the 600 floor after a few loads,
    where a loss is recorded but the number cannot drop; "charged" is judged on
    the attempt count.
  - **READ FROM THE CODE, NOT RUN, NOT FIXED:** Peek pressed *after* a Blindfold
    solution has played would hide the pieces again 5 s later (`peek()` does
    not look at whether the puzzle is over).
  - **STILL ADRIAN'S CALL, untouched:** Blindfold shows the red check glow with
    the pieces hidden (see the pre-move entry below).

- **PRE-MOVE — ALWAYS AVAILABLE IN PUZZLES, RUSH AND BLINDFOLD (2026-10-04).**
  `sw.js` v139 → **v140**. Changed `js/board.js`, `js/app.js`; new
  `tools/cdp-verify-premove.mjs`. Web-only. Committed on `main`, NOT pushed.
  **Not tested on a real phone — Adrian's word closes it.**
  - **Adrian's report, reproduced with real touches before anything was changed:**
    9 of 11 cases failed. Only a move made *entirely inside* the 0.4 s reply
    window worked. Three separate causes, all confirmed by the failing run:
    1. **The opening move was a dead window** — `Puzzles.loadPuzzle` and
       `Rush.loadNext` never armed pre-move. Measured dead time 600 ms (Puzzles),
       300 ms (Rush); a drag in it scrolled the page (`pointercancel`).
    2. **A move that straddled the opponent's move was thrown away** — first
       tap (or drag start) while waiting, second tap (or drop) after his move
       landed. `Board.setPosition()` cleared the selection, so the second half
       had nothing to move. This is the one a human hits most: 0.4 s is shorter
       than a tap-tap.
    3. **A recapture could not be queued at all** — a pre-move was only taken if
       it was legal in the position *before* the opponent moved, so retaking on a
       square my own piece stood on reselected that piece instead, and a pawn
       capture of a piece that had not arrived yet was refused.
  - **The fix (`js/board.js`, shared by every pre-move board):**
    - `setPosition()` keeps `selected` across the opponent's move **only while a
      pre-move is armed** and the piece is still there. Every other position
      change calls `clearPremove()` first, so new puzzle / undo / history still
      drop it. Do not make this unconditional.
    - New module function `premoveReach(piece, from, to)`: a pre-move is accepted
      on the piece's geometry (where it could go on an empty board), and that
      test now comes **before** the "tap my own piece = reselect" branch.
      `firePremove()` is unchanged and still applies the real legality test.
    - **With the pieces hidden (Blindfold) any square is accepted.** Deliberate:
      a tint that appeared only for reachable squares would tell you what the
      hidden piece is. The destination dots were already off when hidden.
  - **The fix (`js/app.js`):** `Puzzles.loadPuzzle` arms on appear and fires
    after the opening move (the timer is now `this.openTimer`, cleared on a
    second load and by Show solution); `Rush.loadNext` the same, skipped under
    the count-in (`Rush.start` now sets `countingIn` **before** `loadNext()` —
    it used to arm for the first puzzle); `Blind` built with `premove: true`,
    armed/fired around its 0.4 s reply, cleared in `cleanup()` (Next, start
    panel, leaving the screen), on a solve, Show solution and Peek. Leaving
    Puzzles (`showScreen`) and `Rush.stop()` clear it too. `Play`, `Rush` and
    `Endgame` are now `export`ed — for the harness only.
  - **Where pre-move is deliberately OFF** — Blindfold's memorising countdown,
    **Blindfold's 5 s Peek** (same reason: the pieces are on show — this one was
    not on Adrian's list, he has been told), Rush's count-in (the overlay eats
    the touch anyway), after a puzzle is finished, and while stepping back
    through a puzzle's history.
  - **No timing was changed.** 0.4 s / 0.3 s / 0.6 s are as they were.
  - **Measured, `tools/cdp-verify-premove.mjs`, 84 checks, 375 px, EN/ES ×
    light/dark, real touches (`Input.dispatchTouchEvent`):** dead time inside
    both waiting windows 0.1–0.3 ms in all three modes (it is the same
    JavaScript task, so no touch can fall in it); a queued move is on the board
    0.7–1.9 ms after the opponent's; tap-tap and drag, inside and straddling,
    plain and recapture-type; a wrong pre-move charged exactly the hand-move
    loss (Puzzles and Blindfold ELO to 1e-6, one Rush strike); an illegal one
    dropped free; Next / Show solution / Peek / leaving clear it; no scroll and
    no `pointercancel` on a drag, `touch-action: none` on the piece. Play driven
    for real (d4 queued while the engine thinks); Trainer and Endgame boards
    checked on a **seeded** position (rook retakes on its own queen's square).
    `node tools/cdp-verify-premove.mjs <outDir> repro` runs the 12 Puzzles
    cases alone. `test:tree` 93/93. The header of the tool lists what is
    tapped, clicked and seeded.
  - **Harness facts:** Kael's bubble and toasts cover the buttons under the
    board for seconds — `clearView()` waits them out; `tapEl()` retries. A
    button point worked out before a 0.4 s window is the only way to tap inside
    it.
  - **FOUND HERE, FIXED IN v142 (see the entry above) — Show solution outlives
    its puzzle (pre-existing, not a pre-move bug).** `Puzzles.showSolution()` loops on `this.current` with a
    0.7 s sleep per move. Press Next before it finishes and the loop carries on
    **in the new puzzle**, playing its moves for you, uncharged. Confirmed:
    `node tools/cdp-verify-premove.mjs <outDir> stale` (8-move solution, new
    4-move puzzle ends at `moveIdx` 4 untouched). `Blind.showSolution()` and the
    `await sleep(400)` reply in `Puzzles.userMove` / `Blind.userMove` have the
    same shape and are **read from the code, not run**.
  - **SEEN, NOT FIXED — Blindfold shows the red check glow with the pieces
    hidden** (pre-existing). `Board.render()` adds `.check` to the king's square
    whether or not `piecesHidden` is set, so a check gives away where that king
    stands. Visible in the harness screenshot `blind-premove-tint-hidden.png`.
    Whether that is wanted is Adrian's call.

- **READ TAB — v139 "TWO DIAGRAMS MUST AGREE" MEASURED OVER 1–6 LESSONS AND WITH
  THE SAME SLIP MADE TWICE; ADRIAN CHOSE (a)+(c): THE RULE STAYS, THE DIALOG NOW
  SAYS SO (2026-10-04).** Two commits on `main`, NOT pushed, NOT deployed.
  `sw.js` v140 → **v141** (v140 is another session's pre-move work).
  - **(c) built:** "Check the position" (review mode only, not "Teach me the
    pieces") shows one small line under the piece palette — i18n
    `read_review_learn`: EN "A correction counts once a second diagram of this
    book agrees." / ES "Una corrección cuenta cuando un segundo diagrama de este
    libro coincide." `js/read.js` (`teachPieces`), `js/i18n.js`,
    `css/style.css` (`.read-teach-learn`). It is static text: it does not say
    how many shapes are waiting. "Clear board" leaves it in place.
  - **(b) three diagrams NOT built** — Adrian's choice, on the numbers below.
  - **Verified for (c):** `test:tree` 93/93 (no unit test added: the change is
    one line of dialog text). Headless CDP at 375px, EN/ES × light/dark:
    `cdp-verify-pieces` **55/55** (47 + 2 new per language/theme: the line is
    there in the right language and inside the dialog, and it survives "Clear
    board"; both need the new element, so they fail on v139 by construction — not
    run against v139). REAL long-press and taps; SEEDED: the book and templates.
    `cdp-verify-hatched` **92/92** (last argument 17). `cdp-verify-stage2` exit 0
    on the second run and on a run without the change; the FIRST run failed at
    `teachOpen` ("no board there" after the long-press) — a one-off, not
    reproduced, cause not found. es/dark screenshot looked at by eye.
  - **The measurement** — `tools/measure-pieces.mjs` gained: `LEARN=N` (any N), `NOLEARN=1` (same reads,
  no lessons), `POISON=same` (+ `SLIP_TO=`), `JSON_OUT=`/`TAG=`.
  - **Learning speed — pieces read correctly, before the gate, clean lessons.**
    Each column is the same reads for all three lines. Hold-out (5 books; Silman
    drops out at 6):

    | lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | nothing learned | 75.4% | 75.6% | 75.8% | 76.2% | 76.7% | 77.4% |
    | v138 (learn at once) | 80.5% | 82.6% | 83.5% | 83.9% | 84.6% | 85.6% |
    | **v139 (two diagrams)** | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | three diagrams (scratch only) | – | – | 76.6% | 78.1% | – | 80.7% |

    First set (from 3 lessons only Chess Life + Hellsten, from 5 only Chess Life):

    | lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | nothing learned | 76.4% | 76.2% | 76.1% | 76.0% | 76.0% | 76.0% |
    | v138 | 82.2% | 84.0% | 85.8% | 87.5% | 87.3% | 87.1% |
    | **v139** | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | three diagrams (scratch only) | – | – | 76.5% | 76.7% | – | 77.7% |

    v139 keeps 0 / 27 / 44 / 52 / 61 / 70 % of v138's gain on the hold-out after
    1..6 lessons (first set 0 / 18 / 26 / 41 / 50 / 59 %). Held shapes do pile up
    (hold-out 10 → 26 per book after 1 → 6 lessons; capped at 8 per piece code).
  - **v139 IS NOT 0 WRONG WITH 3+ CLEAN LESSONS: 1 wrong piece before the gate on
    the hold-out** (of 900 reads; 0 on the first set). FCE taught from p350, lessons
    p100a+p100b+p150a: the black pawn is learned, the black bishop is not yet, and
    the bishop on f8 of p150b sits 0.053–0.058 from a pawn sample (`partial.match`
    0.06). The gate refuses that board (pawn on the back rank), so the user sees an
    empty board, not the pawn: **0 wrong with the gate**. It is a reader-threshold
    hole (an untaught type that looks like a taught one), not a slip. Not fixed.
    `POISON=one POISON_BOTH=1` at 3 and 6 lessons: the same 1, nothing more.
  - **The same slip twice (`POISON=same`: same piece, same square shade, same wrong
    type in the first two lessons; later lessons clean) BITES, rarely.** Wrong
    pieces before the gate, and how many slipped lesson pairs the book accepted:

    | | accepted | 2 lessons | 3 | 4 | 6 |
    |---|---|---|---|---|---|
    | hold-out v139 | 5 of 118 | 9 | 9 | 7 | 5 |
    | hold-out v138 | 24 of 118 | 26 | 22 | 12 | 6 |
    | first set v139 | 1 of 52 | 5 | 4 | 4 | 0 |
    | first set v138 | 6 of 52 | 4 | 2 | 0 | 0 |
    | three diagrams, both sets | 0 | – | 0 | – | 0 |

    Every accepted case is a book whose teaching diagram did not hold the TRUE
    piece type (FCE p350: no pawns, a pawn called a knight → 7 pawns read as
    knights; Chess Life p17a: no rooks; Dvoretsky: no bishop). Where the type was
    taught, the contradiction guard already throws the slip out. Slipped in EVERY
    lesson: v139 9 wrong at 3 lessons, 5 at 6 (hold-out); three diagrams 0 at 3
    but 4 at 6 — no count of agreeing diagrams stops a mistake made every time.
  - **"Three diagrams" was measured on a scratch copy only (not in the repo).**
    It also removes the stray clean wrong piece, at about half of v139's learning.
  - **Everything here is fitted/seen on both truth files; neither is unseen.**
  - **STILL UNMEASURED:** a slip to other wrong types than pawn→knight /
    anything→pawn (`SLIP_TO=` exists, not run); the same slip on DIFFERENT square
    shades; lessons in an order other than book order; more than 6 lessons; any
    Chess Life issue other than 2026-09; a sixth book; scans or photos; a real phone.
  - **Measurement verified:** the changed tool reproduces v139's 77.5%
    (hold-out, 2 lessons). Nothing tapped: real `classifyCells`/`learnFromCells` in Node on squares measured in
    headless Chrome by the v139 session (features reused).
  - Run: `LEARN=4 POISON=same NOGATE=1 REUSE=1 node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (2–6 minutes each at 3–6 lessons).

- **READ TAB — ONE WRONGLY CONFIRMED PIECE NO LONGER TEACHES THE BOOK A WRONG
  SHAPE: A NEW SHAPE COUNTS ONLY AFTER TWO DIFFERENT DIAGRAMS AGREE (2026-10-04).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v138 → **v139**.
  `js/diagram.js` (`learnFromCells` only; `classifyCells`, `STRICT` and board
  FINDING untouched), `tests/unit/diagram.test.js` (24 → 28),
  `tools/measure-pieces.mjs` (`LEARN=2`, `POISON_BOTH=1`),
  `tools/cdp-verify-pieces.mjs` (2 checks reworded for the new rule).
  - **Adrian was not there to choose; option (a) of the prompt was built**, (b)
    measured as numbers only, (c) not needed.
  - **The rule:** a piece shape the book does not already hold is put in
    `t.pending[code]` (`{ v, s }`, 8 per code) and READS NOTHING. When a later,
    DIFFERENT diagram confirms the same shape under the same code (within
    `LEARN_AGREE` 0.025, tried slid ±2 like the reader), both become samples, and
    the same shape held under any OTHER type is dropped. "Different diagram" =
    a different set of occupied squares in the confirmed position, so the same
    diagram confirmed twice is still one. Empty squares are learned at once, as
    before (a wrong empty sample can only leave a square empty).
  - **Starting numbers reproduced first (v138, `POISON=one`):** hold-out 40 wrong
    before the gate / 27 with it (Dvoretsky 22, FCE 17, Silman 1); first set 6 / 6
    (Hellsten).
  - **After (before the gate, both sets): wrong pieces 0, wrong colour 0 in EVERY
    mode** — base, `LEARN=1`, `LEARN=2`, and `POISON=swap|colour|forgot|one` with
    one lesson, with two lessons (first one wrong) and with BOTH lessons wrong
    (`POISON_BOTH=1`). v138 with both lessons slipped: 52 wrong on the hold-out.
  - **What correct learning loses — this is the price.** Pieces read correctly,
    against the same reads with nothing learned:

    | | hold-out, 1 lesson | hold-out, 2 lessons | first set, 1 lesson | first set, 2 lessons |
    |---|---|---|---|---|
    | nothing learned | 75.4% | 75.6% | 76.4% | 76.2% |
    | v138 (learn at once) | 80.5% | 82.6% | 82.2% | 84.0% |
    | **v139 (two diagrams)** | 75.4% | 77.5% | 76.4% | 77.6% |
    | option (b), not built | 75.9% | 76.1% | 78.6% | 79.6% |

    One lesson now teaches NOTHING about pieces; two lessons keep about a quarter
    of what v138 gained. **Visible in the app:** a diagram you corrected and
    opened, pressed again, comes back exactly as the first time (v138 read it
    whole). The corrections are not lost — they are waiting for a second diagram.
  - **Option (b) does not do what it promised** (as built for the numbers: a piece
    is shown only if a TAUGHT sample of that type is also within `match`):
    `POISON=one` still placed 18 wrong pieces on the hold-out (Dvoretsky), 32 with
    both lessons slipped. A slip files the rook under "pawn", and the pawn WAS
    taught. Kept as `b.js` in a scratchpad only; not in the repo.
  - **Looser variants tried and rejected** (0 wrong too, but +0.1 to +0.5 points
    only): agreement with an already trusted sample; `LEARN_AGREE` 0.035.
  - **`LEARN_AGREE` 0.025 WAS FITTED ON BOTH TRUTH FILES.** Across the five books
    the nearest square of another TYPE on another diagram was never closer than
    0.038 (FCE; Dvoretsky 0.052), while the same piece on another diagram was
    within 0.02 / 0.03 for (hold-out) Dvoretsky 97% / 97%, Hellsten 92% / 96%,
    Chess Life 62% / 81%, FCE 54% / 85%, Silman 31% / 70% of squares.
    Neither file is unseen for it.
  - **Old books:** a book taught or corrected on v137/v138 has learned samples and
    no `pending`; it reads and learns as before (unit test). What v138 already
    learned from a slip STAYS — only "Re-learn the pieces" clears it.
  - **STILL UNMEASURED:** three or more lessons in a row (how fast v139 catches
    up, whether held slips pile up); the SAME slip made on two diagrams (a rook
    called a pawn twice — the rule then accepts it, by design); the same diagram
    at two zoom levels counted as one (it is, by occupied squares — not tapped);
    two different diagrams with the same occupied squares (counted as one,
    harmless); any Chess Life issue other than 2026-09; a sixth book; scans or
    photos; a real phone.
  - **Verified:** `test:tree` **93/93** (65 + 28; 5 of the 28 FAIL on the v138
    code — the 3 new slip tests and the 2 reworked learning tests — checked
    against `git show HEAD:js/diagram.js`). Headless CDP at 375px, EN/ES ×
    light/dark: `cdp-verify-pieces` **47/47** (REAL long-press and REAL taps,
    incl. correcting the board and Open; SEEDED: the book and its templates) —
    it now checks that Open HOLDS 10 shapes with the samples unchanged (31 → 31)
    and that the same diagram pressed again reads exactly as before, nothing
    wrong. `cdp-verify-hatched` **92/92** (last argument 17),
    `cdp-verify-stage2` green (exit 0). The two truth sets are NOT tapped: real
    `classifyCells`/`learnFromCells` in Node on squares measured in headless Chrome.
  - Run: `LEARN=2 POISON=one POISON_BOTH=1 NOGATE=1 REUSE=1 node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (a `LEARN` run takes about a minute even with `REUSE=1`, not seconds).

- **READ TAB — THE STRICT PIECE READER MEASURED ON DIAGRAMS IT HAD NEVER SEEN;
  THREE HOLES FOUND AND CLOSED (2026-10-03).** Committed on `main`, NOT pushed,
  NOT deployed. `sw.js` v137 → **v138**. `js/diagram.js` (3 small changes, board
  FINDING untouched), `tests/unit/diagram.test.js` (21 → 24), `tools/measure-pieces.mjs`
  (`POISON=one`, wrong-colour squares now listed), new
  `tools/fixtures/piece-truth-holdout.json`.
  - **The hold-out set:** 52 new diagrams, true positions read BY EYE from `find`
    crops — Chess Life 12 (pages 18–32, none of 17/20/22/30/36), Dvoretsky 12
    (knights, rooks, queens, bishops: pages 272–940), Hellsten 10 (middlegame-like,
    up to 26 pieces), Silman 7 (queens, rooks, knights; two diagram sizes), FCE 11
    (never measured before). 132 reads, **1,607 real pieces**. Kept SEPARATE from
    `piece-truth.json` (which holds **23** diagrams, not 19 as v137 wrote).
  - **Measured with the SHIPPED v137 numbers first, before touching anything:**

    | book | real | correct | WRONG | wrong colour | left empty |
    |---|---|---|---|---|---|
    | Chess Life | 567 | 521 | 0 | 0 | 46 |
    | Dvoretsky | 275 | 172 | **1** | 0 | 102 |
    | Hellsten | 282 | 266 | 0 | 0 | 16 |
    | Silman | 248 | 134 | 0 | 0 | 114 |
    | FCE | 235 | 98 | 0 | 0 | 137 |

    That is before the whole-board gate. WITH the gate: 0 wrong — the one wrong
    piece was a white pawn on rank 1, so the gate refused that board (shown empty).
  - **Hole 1 — the wrong piece** (Dvoretsky p580, g1): a hollow white rook on a
    HATCHED square, in a book taught its rook on a plain square. The hatching
    drowns the piece: the square was exactly as close to "empty hatched square"
    (0.055) as to "pawn on a hatched square" (0.055), and the rule had no margin
    there (`clear: 0`), so the tie went to the pawn. Fix: `STRICT.*.clear` 0 →
    **0.01**. With `LEARN=1` (correct lessons) v137 made the same mistake 14 times.
  - **Hole 2 — a correct lesson turned a black king white** (Silman p400b, e4,
    `LEARN=1`): Silman's black king is drawn half hollow, so its fill says nothing;
    the book then held a white king on a light square and a black one only on a
    dark square, and "shape decides the colour" was really the square deciding.
    Fix: shape may settle the colour only if BOTH colours of that piece match well
    (`Math.max(dw, db) <= S.match`).
  - **Hole 3 — v137's "a wrong lesson never places a wrong piece" was false off the
    first set:** `POISON=swap` (kings confirmed as queens, bishops as pawns) gave
    Dvoretsky 76, Silman 2, FCE 238 wrong pieces. A book that has not met the queen
    cannot contradict "this king is a queen". But that lesson has no kings, and the
    dialog already refuses to Open without them (`read_teach_need_kings`) — the
    tool was testing what the app cannot do. `learnFromCells` now enforces it
    itself: no king of each colour → nothing learned.
  - **After the three fixes (v138), before the gate, BOTH sets:** wrong pieces **0**,
    wrong colour **0**, in base, `LEARN=1`, and `POISON=swap|colour|forgot`.
    Cost in real pieces left empty: hold-out 415 → 420 (Dvoretsky +3, Silman +1,
    FCE +1), first set 165 → 166 (Chess Life +1). Read correctly on the hold-out:
    Chess Life 92%, Hellsten 94%, Dvoretsky 62%, Silman 54%, FCE 41%.
  - **STILL OPEN, measured, NOT fixed — one slip in a confirmed board
    (`POISON=one`, new):** ONE piece confirmed as the wrong type (a rook as a
    pawn), kings in place, so the app accepts it. Hold-out: **40 wrong pieces** in
    1,164 reads (Dvoretsky 22, FCE 17, Silman 1; 27 after the gate); first set 6
    (Hellsten). Chess Life: 0. It only bites when the book was never taught that
    piece on that kind of square — then nothing contradicts the slip, the book
    files a rook under "pawn", and later rooks on hatched squares come back as
    pawns. No threshold fixes this (in hatched books the square outweighs the
    piece: a king is 0.14 from the same king on the other shade, a rook 0.055 from
    a pawn on the same shade). It needs a design choice — see the handover prompt.
  - **How far "zero wrong" can be trusted:** with a book taught once and no
    corrections, on these five books: 0 wrong in 2,330 real pieces after the fix,
    and v137 itself had 1 in 1,607 on diagrams it had never seen. But the hold-out
    is no longer unseen for `clear`, the colour rule and the kings rule — they
    were chosen ON it. The next honest test needs new diagrams again.
  - **Unmeasured:** any Chess Life issue other than 2026-09 (the hold-out pages are
    the same issue, same font, as the first set); any sixth book; scans or photos
    (all five are born-digital PDFs); a book taught before v137 (one averaged shape
    per piece); a real phone (speed and screen); more than one lesson per book.
  - **Verified:** `test:tree` **89/89** (65 + 24; the 3 new tests FAIL on the v137
    code, checked against `git show HEAD:js/diagram.js`). Headless CDP at 375px,
    EN/ES × light/dark: `cdp-verify-pieces` **47/47** (REAL long-press, REAL taps;
    SEEDED: the book and its templates, as before), `cdp-verify-hatched` **92/92**
    (with puzzle page 17; without that last argument it reports 82/82),
    `cdp-verify-stage2` green (exit 0; its one `confident:false` is the
    degrades-honestly case). The hold-out itself is NOT tapped: it is the real
    `classifyCells`/`learnFromCells` run in Node on square measurements taken in
    headless Chrome from the real pages.
  - Run: `node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (~3 min the first time; `REUSE=1` afterwards is seconds).

- **READ TAB — "CHECK THE POSITION" SHOWS ONLY PIECES IT IS SURE OF, AND LEARNS
  FROM CORRECTIONS (2026-10-03).** Committed on `main`, NOT pushed, NOT deployed.
  `sw.js` v136 → **v137**. `js/diagram.js` (everything from `buildTemplatesFromGrid`
  down; board FINDING untouched — the diff starts at line 778), `js/read.js`
  (`onLongPress`, `teachPieces`), `js/i18n.js` (3 strings), `css/style.css` (2 rules).
  New: `tools/measure-pieces.mjs`, `tools/cdp-verify-pieces.mjs`,
  `tools/fixtures/piece-truth.json`, `tests/unit/diagram.test.js` (21 tests).
  - **Adrian's report:** Chess Life p20 came back with ~50 pieces, nearly all rooks
    and queens. "I prefer an empty square to a wrong piece, every time."
  - **Diagnosis, measured before any fix** (true positions read BY EYE from crops,
    19 diagrams, 4 books): NOT the board rectangle (p20's three boards are found
    exactly). The real pieces were matched fine; the extra ~30 per board were
    GHOSTS ON EMPTY SQUARES. An empty square has no ink, so its normalised edge
    map is just its border lines, which look like a rook, and the old test
    (`d1 < distance to the averaged empty pattern`) let them through. Second
    cause behind it: a later board never lands on the taught one's exact pixels,
    and a one-pixel slide made a king read as a queen (19 wrong types → 1 once
    the cell is also tried slid ±2 feature cells). Third: a book never taught a
    queen read every queen as a king (endgame books are taught from K+R+P).
  - **The rule now** (`classifyCells`, thresholds in `STRICT`): nearest TYPE over
    every stored sample and every slide; shown only if match ≤ 0.13, next type
    ≥ 0.06 further, fill decisively white/black (or, fill unclear, the shape
    leads one colour by the same margin). A book not yet taught all six types
    uses match ≤ 0.06. Anything else → EMPTY, and marked (dashed) only if the
    square carries a piece's worth of ink. The loosest zero-wrong values measured
    were 0.15/0.05 and 0.07; the shipped ones sit a step inside.
  - **Templates are SAMPLES now (ver 4), not one average per piece** — measured
    better (partial books: 220 vs 189 correct at zero wrong). ver-3 books keep
    working (read as a list of one) and are upgraded on their first lesson.
    `boardCells` / `templatesFromCells` / `classifyCells` are pure, so the tool
    measures the real code in Node from cached square features (`REUSE=1`).
  - **Whole-board gate** `boardSanity`: two kings of a colour, >16 of a colour,
    >8 pawns, a pawn on rank 1/8, more promoted pieces than missing pawns →
    EMPTY board + "I could not read this diagram reliably…". On the measured set
    it never fires (0 wrong before the gate); it is the net for a mis-taught book.
  - **Clear board** button in the dialog (string `clear_board` already existed).
  - **Learning** (Adrian chose: build it, SILENT). Open in review mode calls
    `learnFromCells`: the confirmed board's squares are added as samples. Guards:
    a square that contradicts what the book knows well is not learned (known
    piece called another type / left empty, known empty called a piece, fill
    decisively the other colour); inked squares left empty that match no known
    empty are skipped (arrows, forgotten pieces); more than 3 contradictions →
    nothing learned; the first teaching's samples are the anchor and never
    rotate out (12 learned per list rotate behind them). "Re-learn the pieces"
    is still the full reset.
  - **Numbers** (`measure-pieces.mjs`, every diagram read with every teaching
    diagram of its book, 723 real pieces): v136 → v137 —
    wrong pieces placed **456 → 0** (Chess Life 425, Dvoretsky 3, Hellsten 12,
    Silman 16 → all 0), wrong colour only **6 → 0**, correct 627 → 558, real
    pieces left empty 22 → 165 (Chess Life 138/579, Dvoretsky 9/66, Hellsten
    16/72, Silman 2/6). With ONE confirmed correction per book (`LEARN=1`):
    still 0 wrong; read correctly Chess Life 76% → 81%, Dvoretsky 86% → 95%,
    Hellsten 78% → 92%. With that confirmation deliberately WRONG
    (`POISON=swap|colour|forgot`): still **0 wrong pieces** — a bad lesson costs
    more empty squares, never a wrong piece.
  - **Honest limit:** 100% cannot be promised. The thresholds were chosen ON these
    19 diagrams; a book outside the set can still produce a wrong piece, and the
    gate only catches impossible boards. What is promised is the direction: when
    unsure, empty.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-pieces`
    **47/47** — REAL long-press on Chess Life p20, REAL taps on a square, Clear
    board, Open; then (EN/light) the board corrected by 2 REAL taps, Open, and the
    same diagram pressed again reads 10 of 10 (9 before). SEEDED: the book
    (`db.addBook`) and its templates (`buildTemplatesFromGrid` on the p30 diagram
    with its true position — not tapped in "Teach me the pieces"); the refused
    board uses templates seeded wrong on purpose. `cdp-verify-hatched` **92/92**,
    `cdp-verify-stage2` green (two checks there now read `templates.samples`),
    `cdp-verify-training` **65/65**, `test:tree` **86/86** (65 + 21).
    `measure-fallback.mjs` NOT re-run: no line of board finding changed.
  - **The CDP long-press trap, now written down:** in headless Chrome, lifting the
    finger "taps" what the dialog put under it and drops a pawn on that square.
    Read the dialog WHILE THE FINGER IS DOWN (`cdp-verify-pieces` does).
  - Run: `node tools/measure-pieces.mjs find <outDir> 50 "<pdf>:20,30"` (crops to
    read by eye), `node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth.json`
    (env `REUSE=1`, `NOGATE=1`, `LIST=all`, `LEARN=1`, `POISON=…`, `STRICT='{…}'`,
    `DIAGRAM=<file>`), `node tools/cdp-verify-pieces.mjs <outDir> "<Chess Life.pdf>"`.
    The books are in `C:\Users\Adrian\ChessPuzzleImport\` (Chess Life in
    `D:\2. Chess\2. Material\2. CBH and PDF\`).
  - **Open:** a book taught before v137 (Adrian's Chess Life) still has ONE
    averaged shape per piece until it learns — "Re-learn the pieces" once gives it
    the full benefit. One read takes 56 ms on this PC after teaching, 169 ms after
    nine lessons; NOT timed on a phone. Hatched books (Dvoretsky, Silman): only
    3 + 3 diagrams measured, no rook/queen/knight among them. Not tested on a
    real phone.

- **BLINDFOLD — START PANEL WITH GO, TIME LOCKED WHILE A PUZZLE RUNS, PAID-AT
  LINE, CHANGE TIME BUTTON (2026-10-03).** Committed on `main`, NOT deployed.
  `sw.js` v135 → **v136**. No `firestore.rules` change, no new storage keys,
  `js/blind-elo.js` untouched (its 12 tests unchanged).
  - **Why:** Adrian lowered the slider to 2 s during a 10 s countdown and could
    not tell afterwards which time he was paid for. The maths was already right
    (`secondsThis`); the screen did not say so.
  - **Start panel** `#blind-start` (index.html; styled like `#rush-intro`):
    ELO card, the slider, `#blind-pays` (what the time pays, as a rule — % extra
    under 10 s), `#blind-last-paid`, `#blind-go`. The board lives in
    `#blind-game`. `Blind.open()` → `Blind.showStart()`; `Blind.go()` starts the
    first puzzle. **Shown EVERY time Blindfold opens** (Adrian's choice). There
    is ONE `.blind-time` box; `showStart()`/`go()` move it between the two panels.
  - **Lock:** `Blind.timeLocked` is true from `nextPuzzle` until `recordResult`
    (solve, first wrong move, Show solution). The range is `disabled`, the box
    gets `.locked`, the label gets 🔒, the hint reads "Locked until this puzzle
    is scored", and `oninput` refuses the change even if an event gets through.
  - **Paid-at line:** after scoring `#blind-bonus` no longer empties — it shows
    `Blind.paidLine`, e.g. "2 s look: +52 normal, +9 extra", "… no extra (you
    peeked)", or "2 s look: −10 — a miss costs the same at any time". The two
    parts are rounded so they add up to `lastDelta` (the badge / log number).
  - **Change time** `#blind-change-time` (Adrian's choice, for auto-next's 1.4 s
    gap): between puzzles it opens the start panel at once; during a puzzle it
    changes nothing and sets `Blind.changeArmed`, so the next `nextPuzzle()`
    (Next or auto-next) opens the panel instead. `nextPuzzle()` also returns
    early while the start panel is up, so a late auto-next starts nothing.
  - **Bug found and fixed (was real):** two quick taps on Next left two 500 ms
    timers pending → two countdowns, and the orphaned one then hid the pieces
    every second for good (measured: 4 hides in 5 s; now 1). The timer is now
    `Blind.startTimer`, cleared in `cleanup()` and before it is set.
  - **Verified:** `npm.cmd run test:tree` 65/65. `tools/cdp-verify-blind.mjs`
    rewritten for the Go step: **75/75** at 375px, EN/ES × light/dark — Go
    measured at 1, 10 and 20 s. Its header lists what was really tapped
    (Go, Next, Change time, moves, a finger on the slider locked and unlocked),
    what was called (other slider changes: events dispatched, not a drag) and
    what was seeded (attempt count 10; `Puzzles.autoNext` set in memory).
    `node tools/cdp-verify-blind.mjs <dir> double-next` runs only the Next repro.
  - **Not done:** not tested on a real phone; a real finger DRAG of the slider
    is not reproducible over CDP. The paid line is not re-translated if the
    language is switched while it is on screen (it is rebuilt on the next puzzle).

- **BLINDFOLD — CHOOSE THE MEMORISING TIME (1-20 s), TIME EXTRA, NEW PEEK RULE,
  FAST START (2026-10-03).** Committed on `main`, NOT pushed, NOT deployed.
  `sw.js` v134 → **v135**. No `firestore.rules` change, so NO rules deploy.
  - **All the rating maths is in the new `js/blind-elo.js`** (imports nothing;
    `blindEloResult`, `blindExtraPreview`, `blindExtraFactor`,
    `blindLongLookFactor`, `clampBlindSeconds`). `Blind.recordResult` only calls it.
    Numbers Adrian approved (table shown to him first), for a puzzle at the
    player's own level after the first ten — normal points 16:
    1 s +34 · 2 s +32 · 5 s +26 · 10 s +16 · 15 s +12 · 20 s +8; loss always −16.
    - Under 10 s: extra = normal × (10 − s) ÷ 8, clean wins only. The extra is
      always sized off K 32, never the fast-start K.
    - Over 10 s: a win pays 75% at 15 s, 50% at 20 s (linear). Losses unchanged.
    - **Peek cancels ONLY the extra.** A win after a peek pays the full normal
      points (it used to pay K 12 instead of K 32). A loss after a peek is the
      full normal loss too (it used to be softened). At 10 s or more a peek is
      free — Adrian's choice.
    - **Fast start:** K 192 for the first 10 blindfold puzzles, then K 32 — the
      confirmed cause of "Blindfold ELO rises slower than Puzzles". After the
      first ten Blindfold was already FASTER per puzzle (32 vs Puzzles' 24).
      Counted from this update for EVERYONE (Adrian's choice: the app never
      counted blindfold puzzles, so existing users get ten fast ones too).
  - **Leaderboard effect, simulated** (same player, 100 puzzles, vs playing at
    10 s): always 1 s ≈ +130, 2 s ≈ +120, 5 s ≈ +85, 15 s ≈ −50, 20 s ≈ −115.
    It is reached inside 100 puzzles and does not grow after (same at 1,000);
    50% or 70% solved ends in the same place.
  - **Screen:** `#blind-bonus` (gold line under the turn/ELO row: the extra on
    offer and that a peek forfeits it, or the 10 s / over-10 s message; empty once
    the puzzle is scored) and `.blind-time` (label + native range 1-20 under the
    buttons). `Blind.seconds` is the choice, `Blind.secondsThis` is what the
    CURRENT puzzle was shown for — a change mid-puzzle applies from the next one.
  - **New kv keys:** `blindfoldSeconds`, `blindfoldAttemptCount`, both added to
    `SYNCED_KEYS` in `js/firebase.js`. `/users/{uid}` has deliberately NO
    `hasOnly()` allowlist (firestore.rules line 23), so no rules change was
    needed — the handover prompt's "needs the allowlists at ~101 and ~601" was
    wrong: those are `/leaderboard` and `/studentReports`, and neither key goes there.
  - `KAEL_HINT_WARNING` (EN + ES) and `blind_explain` rewritten for the new rule.
    Users who already dismissed the old warning will not see the new one
    (`blindfoldHintWarningSeen` is already true for them) — the gold line tells them.
  - `Blind` is now `export`ed from `js/app.js` (like `Puzzles`) so the harness can
    read the puzzle's solution.
  - **Tests:** `tests/unit/blind-elo.test.js` (12) — `npm run test:tree` is now
    **65** (was 53), all green. `tools/cdp-verify-blind.mjs <outDir>` — 40/40 at
    375px, EN/ES × light/dark. REALLY TAPPED: the Blindfold button, Next, Peek,
    Kael's "Got it", Show solution, every chess move. CALLED: the slider (value
    set + input/change events), the reload. CLICKED: the Puzzles tab. SEEDED: the
    attempt count set to 10 before the peek/loss checks. Countdowns measured:
    1.02 s, 1.99 s, 3.0 s, 10.01 s, 20.00 s.
  - **Not done:** not tested on a real phone; the slider was never dragged by a
    finger. `countdownTimer` is still a setInterval cleared with clearTimeout
    (works; left alone on purpose).

- **READ TAB — SLID BOARDS JUDGED BY EYE, THE FAINT-CAPTION SLIDE FIXED (2026-10-03).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v133 → **v134**.
  `js/diagram.js` (`slidBlock` only, ~10 lines), `tools/measure-fallback.mjs`
  (counts slides itself). Follows the v133 entry below and CORRECTS it.
  - **The v133 counting rule was wrong.** "Of two grids one square apart, the
    less-pressed is the slid one" points the wrong way on the two pages that
    matter. Judged by eye from crops (15 slid grids, 12 opened, all genuine slides,
    none a second real board):
    **FCE p120** — the grid 123.8,647.8 that v133 called slid is the REAL board;
    the slid one is 124,604 (one rank up, into the text line), given by 77 presses
    against 71 for the true one. **Chess Life p52** — board 459,864.3 slid one rank
    DOWN into its blue "POSITION AFTER…" caption on 35 presses, incl. presses
    INSIDE the board; the true board came back only from its top rank (5).
    Chess Life p29 (8 presses, two ranks down), p45 (two boards, 6 + 6), p10 (2),
    p39 (6); Silman p20 (2); FCE pp. 20, 60, 180 (two boards), 220, 280 (59).
    Also: slides of TWO squares exist, which the 1.6-square rule never counted.
  - **True count on v133** (133 pages, 40-px grid, ~129,000 presses): slid presses
    Chess Life 63, Dvoretsky 0, Hellsten 0, Silman 2, FCE 136 = **201** (v133's
    entry said 20 / 0 / 0 / 2 / 122).
  - **Why:** a caption or text row can alternate light/dark by chance, but
    FAINTLY (FCE p120: all 7 pairs, by ~20 shades against the board's ~50; p52:
    the caption scored 3, the same as the true top rank with its two pieces).
    `slidBlock` only counted WHETHER each pair alternates (±1 past 3 shades).
  - **The fix:** each line also gets `w` — every pair as a share of the block's own
    light/dark step (median neighbour difference), capped at 1. Slid if the v133
    test says so OR `beyond.w >= 4 && outer.w <= beyond.w - 2.5`.
  - **After, every press compared one by one:** slid **201 → 7**. Of the 199 that
    stopped sliding, 137 now give the true board, 62 "no board". **No press that
    gave a true board lost it or changed board.** 116 presses that gave "no board"
    now give the true one (Hellsten 60, Chess Life 33, Dvoretsky 12, Silman 9,
    FCE 2). Inside a real board, gave it: Chess Life 3,301 → 3,321 of 3,415;
    FCE 2,579 → 2,627 of 2,627; Dvoretsky 1,968 of 1,972, Hellsten 1,432 of 1,432,
    Silman 837 of 837 unchanged. probe ≠ `detectBoard`: 0 in both runs, no ERR.
  - **Left, deliberately not chased (7 presses, all OUTSIDE the board):** Chess
    Life p10, 2 presses, two ranks down (unchanged); Chess Life p53, 5 presses in
    the text below board 96.3,825 give it one rank down — NEW, those presses gave
    "no board" before. The one "unconfirmed" crop (Chess Life p51, 27 presses) is
    the real board the tone search never finds (see v132), not a false one.
  - **The tool now:** per book — slid grids, slid presses (tone / fallback), and
    "inside a real board: gave it / presses". SLID = of two grids that overlap on
    a page (corners under 7 squares apart), the one with LESS checker contrast
    (summed light/dark difference over the 112 pairs, each capped at 60). "fb
    confirmed" now means matching a tone-search board that is NOT slid. Crops:
    `slid-*.jpg` for every slid grid, tone search included (slid red, the board it
    slid off green, small boards enlarged), `unconfirmed-*.jpg` for the rest.
    `env DIAGRAM=<file>` measures a candidate copy of `diagram.js` without
    touching the real one. A full run takes ~37 min with 4 workers; the progress
    dots do not show through a PowerShell redirect — check the node process.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-hatched`
    **92/92** (REAL long-presses on Dvoretsky/Hellsten/Chess Life p30 and a p17
    puzzle board; the p17 title-row and beside-the-board checks are CALLED),
    `cdp-verify-stage2` green (its one `confident:false` is the honest-degradation
    check, as intended), `cdp-verify-training` **65/65**, `test:tree` **53/53**.
    The 129k-press grids are CALLED, not pressed. SEEDED: books via `db.addBook()`.
    FCE p120 and Chess Life p52 were NOT long-pressed in the app, only measured.
    Not tested on a real phone.

- **READ TAB — DIAGRAM READER NO LONGER RETURNS A BOARD SLID ONE SQUARE (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v132 → **v133**.
  `js/diagram.js` (new `slidBlock` + `isSlid`, used by `placeByTone`, `accept`
  and the fallback's gate; the fallback gets the second `placeByTone` look the
  tone search already had), `tools/measure-fallback.mjs` (replays the same
  steps), `tools/cdp-verify-hatched.mjs` (optional puzzle page). Follows v132.
  - **The v132 "16 slid presses" was an undercount.** The tone search slides too,
    and `measure-fallback.mjs` counts a fallback board as "confirmed" when it
    matches ANY tone-search board — including a slid one. Counted properly (two
    grids on one page overlapping by under 1.6 squares; the less-pressed is the
    slid one — a RULE, not judged by eye; only four crops from pp. 17/19/26 were
    looked at), before the fix, 40-px grid, 133 pages, ~129,000 presses:
    Chess Life 718 slid presses, Dvoretsky 251, Hellsten 70, Silman 158, FCE 837.
  - **When:** a press just OUTSIDE a board (title or caption row, or beside it)
    gave the board slid a rank/file so that it held the finger.
    **Why:** `placeByTone` prefers the block holding the finger unless another
    scores 5% higher. A row of plain paper whose shade lies between the two
    square shades (Chess Life p17: paper 241, squares 254/194) votes with every
    square of the rank beside it, so the slid block loses only the 7 pairs ALONG
    that row, and title letters win some back: 106–109 of 112 vs the true 112.
  - **The fix:** a block is slid if an outer rank/file does not alternate along
    its own line (its 7 pairs) while the line just beyond the OPPOSITE side does
    (≥ 5, and ≥ 3 more than the outer one) — the real rank it dropped. Slid blocks
    are skipped in `placeByTone`; a finished board that still shows it is refused
    (a press further than two squares out has no better block in reach).
  - **After (same pages, same grid; cross-check probe vs real `detectBoard`
    0 differences):** slid presses Chess Life 718 → 20, Dvoretsky 251 → 0,
    Hellsten 70 → 0, Silman 158 → 2, FCE 837 → 122. Presses INSIDE a real board
    that give it: Chess Life 3,549 → 3,548 of 3,653; Dvoretsky 2,004 → 2,004;
    Hellsten 1,445 → 1,445; Silman 856 → 856; FCE 2,952 → 2,955. Real boards via
    the fallback: Chess Life 247 → 266, Hellsten 68 → 69, Dvoretsky 8 → 8. About
    390 formerly slid presses now give the true board, the rest "no board".
    **Cost:** ~510 presses OUTSIDE a board (mostly over a square away) that used to
    reach the true board now give nothing (Adrian accepted this).
  - **Verified (headless CDP, 375px):** `cdp-verify-hatched` with Chess Life p30
    and puzzle page 17 **92/92** (the new title-row check FAILS on the v132
    `diagram.js`: 91/92) — REAL long-presses on Dvoretsky/Hellsten/the p30 board
    and inside a p17 puzzle board in EN/ES × light/dark; the title-row and
    beside-the-board presses on p17 are CALLED (`detectBoard` on the reader's own
    canvas), not pressed. `cdp-verify-stage2` green, `cdp-verify-training`
    **65/65**, `test:tree` **53/53**. The 129k-press grids are CALLED. SEEDED:
    books via `db.addBook()`.
    Run: `node tools/cdp-verify-hatched.mjs <outDir> "<Dvoretsky.pdf>" 395 "<Hellsten.pdf>" 102 "<Chess Life.pdf>" 30 17`.
  - **Open, NOT looked at by eye:** FCE p120 — one grid (123.8,647.8, 41.6-px
    squares, 120 presses, unchanged by the fix) that the counting rule calls slid;
    it may be a real board beside another. Chess Life pp. 29, 45, 52 (14 presses)
    and p10 (2). `measure-fallback.mjs`'s own "confirmed" column still has the
    undercount described above. Not tested on a real phone.

- **READ TAB — DIAGRAM READER'S OLD FALLBACK NO LONGER TAKES TEXT FOR A BOARD (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v131 → **v132**. Only
  `js/diagram.js` changed (the fallback block at the end of `detectBoard`), plus a
  new dev tool `tools/measure-fallback.mjs`. Follows the v131 entry below.
  - **Measured first, decided with Adrian.** `measure-fallback.mjs` renders pages
    as the reader does (1065-px canvas), presses every 40 px over WHOLE pages and
    replays `detectBoard` step by step (its cross-check against the real
    `detectBoard` read 0 differences on every run). A fallback board equal to one
    the tone search found on that page counts as real; every other one is saved as
    a crop and was judged by eye. 147 pages, ~144,000 presses (Chess Life all 68,
    Dvoretsky 21, Hellsten 15, Silman 15, FCE 14 x2 files — they are the same book):
    the fallback found a REAL board the tone search missed from that spot on
    **388** presses (Chess Life 247, Hellsten 131, Dvoretsky 8, Silman 2 — incl. a
    Chess Life p51 board the tone search never finds from ANY press) and a FALSE one
    on **223**. Dropping it would have lost the 388.
  - **The fix:** the fallback's answer must pass the same plain-checker test the
    tone search uses (`checkerVotes` ≥ 80 of 112), else the next window size is
    tried. Every real fallback find scored ≥ 80; every grid over text or photos
    scored under 80, most under 15. **After (same probe, same pages): real 388 →
    388, false 223 → 16.** The 16 left are NOT text: they are real puzzle boards on
    Chess Life pp. 17, 19, 26 found SLID one rank or one file (votes 100–109, so
    the gate cannot catch them). Hellsten, Dvoretsky, Silman, FCE: 0 false.
  - **Line-only boards (no shading) are no longer found at all** — the tone search
    never found them, and now the fallback refuses them too. None exist in any of
    the six books; on text a no-shading board and a text block score the same (≈0),
    so a line-only exception would let the text back in (Adrian chose this).
  - **Verified (headless CDP, 375px):** `cdp-verify-stage2` green (synthetic boards
    are shaded; blank area and text still give no board), `cdp-verify-hatched`
    with Chess Life p30 **82/82** — REAL long-presses at five spots on the magazine
    board and on Dvoretsky/Hellsten in EN/ES × light/dark; `cdp-verify-training`
    **65/65**; `test:tree` **53/53**. The 144k-press grids are CALLED
    (`detectBoard` internals on a rendered canvas), not pressed. SEEDED: books via
    `db.addBook()` in the verifiers.
  - Run: `node tools/measure-fallback.mjs <outDir> 40 12 "<pdf>:all" "<pdf>:20-420/20"`
    with env `GATE=80` (current code) or `GATE=0` (the v131 fallback). ~60 s per
    page per worker; the scans need the `wasmUrl` it passes.
  - **Open:** the 16 slid puzzle-board presses above (Chess Life puzzle pages lay
    boards on one lattice; the p17/p66 "1–3 px off" limit in the v131 entry is the
    same family). Not tested on a real phone.

- **READ TAB — DIAGRAM READER ON MAGAZINE BOARDS (CHESS LIFE) (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v130 → **v131**. Only
  `js/diagram.js` changed (plus `tools/cdp-verify-hatched.mjs`, which now takes
  an optional magazine page). Follows the v130 entry below.
  - **Adrian's report:** in `D:\2. Chess\2. Material\2. CBH and PDF\Chess Life
    Magazine 2026-09 Septmber.pdf` a long-press on a diagram under the red
    players' lines gave a board grid shifted up over the red text and the rule
    (6 ranks of board + text). Boards there: small (22–27 px squares at 1065 px),
    pale grey dark squares, two text columns, photos close by.
  - **Measured on the whole issue (68 pages, 8x8 presses per diagram), v130 →
    v131: presses missed 37% → 3%; false boards on ~16,700 presses over text and
    photos 18 → 35 (0.1% → 0.2%). The remaining ones are integer grids from the
    OLD window search (the fallback), which now runs on presses the tone search
    rightly turns down — a follow-up could drop or tighten that fallback.** Dvoretsky + Hellsten re-checked: still 0
    missed, one grid per board.
  - **Causes and fixes (all in the tone search, `detectFromBand`):**
    a. `findComb` replaces `findGrid` there: a tooth scores by how far it stands
       above the profile half a square either side. Text is busy everywhere, and a
       comb at twice the square size half on the next text column won by height.
    b. `boardRows`: the board's top and bottom from the files just found, so the
       rank search is not swamped by the bold move lines above and below.
    c. `placeByTone` counts neighbour-pair VOTES (not summed brightness), judges a
       square by its corners (`cellTone`; a black piece on a light square made the
       cell mean darker than a dark square), and only looks within two squares of
       the finger, preferring the block that holds it (on p17's 12 puzzle boards a
       neighbouring board fits the same lattice).
    d. `accept(…, shaded)`: the tone search must show a plain checker pattern
       (`checkerVotes` ≥ 80 of 112; every real board in the issue scored 89–112,
       every false one ≤ 68), line contrast relaxed to 1.1 (crowded small boards
       came out ~1.2). Line-only boards fail this and go to the window search, as
       before.
  - **Verified:** `tools/cdp-verify-hatched.mjs` with Chess Life p30 (the page in
    Adrian's screenshot, printed 28): the grid found is the drawn board to within
    3 px, ≥240/256 inner points give it; REAL long-presses at five spots on the
    board open the dialog in EN/ES × light/dark; Dvoretsky/Hellsten checks as in
    the v130 entry. `cdp-verify-stage2` green, `cdp-verify-training` 65/65,
    `test:tree` 53/53.
  - **Known limits:** on p30, 16 of 256 inner points (top-right corner, under the
    black rook/knight) still miss; boards on p17/p66 (puzzle pages) sometimes give
    a grid 1–3 px off from a few presses; the scans (Silman/FCE) give a board
    shifted one square for presses JUST OUTSIDE a board (inside presses are fine).
    Not tested on a real phone.

- **READ TAB — DIAGRAM READER FINDS A HATCHED BOARD WHEREVER IT IS PRESSED (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v129 → **v130**. One
  shipped file changed, `js/diagram.js` (already in sw ASSETS); one new dev tool,
  `tools/cdp-verify-hatched.mjs`. Closes the "FOUND, NOT FIXED" bullet at the end
  of the Training-mode entry below.
  - **How bad it was (measured before the fix, headless Chrome, 375px, page canvas
    1065 px):** a 16x16 grid of presses inside each board. Dvoretsky, 9 pages /
    11 boards: **about 4 presses in 10 missed** (p160's board was never found from
    anywhere; lower boards on p205/p350 found only from a couple of strips). The
    boards it did find were often a little off (squares read as 48 px instead of
    47, so the far side drifted 8 px; some 48x56). Hellsten, 4 pages: 14% missed
    (the bottom rank and lower corners). A press on BLANK white margin came back as
    a tiny "board" (findGrid's gate compared 0 with 0 and passed).
  - **Cause, two parts:** (1) hatching is all edges, so every row and column of a
    hatched board is busy and the square boundaries barely stand out — `findGrid`
    (almost always on the horizontal lines) passed or failed depending on how much
    white margin the window happened to include, i.e. on finger height; (2) the
    window is centred on the finger, so a press near a board's edge needs a
    board-sized window, which is then half full of the text next to the diagram.
  - **The fix (`js/diagram.js`):** `detectBoard` now first runs
    `detectFromBand` on a **tone map** (`toneMap`: the page box-blurred twice,
    radius `W/355` ≈ 3 px at 1065 — hatching, wood grain and scan speckle average
    to flat grey). Files from a low band of rows through the finger (whole page
    width); ranks from only those columns; then `placeByTone` picks which 8x8 block
    of the lattice is the board by the strength of its light/dark alternation (the
    comb can sit up to 7 squares off), `fitBoard` re-finds the grid from exactly
    that block and `refineAxis` fits period and origin to a fraction of a pixel on
    the 7 INNER lines. The same guards as before (`accept`: squareness,
    `lineContrast` ≥ 1.35 both axes, `validateCheckerboard`). The old tap-centred
    window search (`detectInWindow`) is kept as the **fallback** (Adrian chose
    this), but its result is now checked against the tone pattern: if the pattern
    says the board is elsewhere on that lattice, the fitted board is returned, or
    nothing. `findGrid` now rejects a window with no edges at all (blank paper).
    Board coordinates can now be fractional; `cellRect`/`cropBoardCanvas` already
    took floats.
  - **After the fix (same probe, same pages):** Dvoretsky 16 pages / 19 boards +
    Hellsten 4 pages / 7 boards = **6,656 presses on 26 boards, 0 missed, and every
    board gives ONE grid from all 256 points** (Dvoretsky 47x47 exact, matching the
    470-px picture = 10 squares incl. border; Hellsten 41.5 = 332/8 exact).
    **False boards on presses OFF the boards (text and margins), 13 pages, final
    code: 2 of 2,966** (both Hellsten p60, both from the old fallback, a
    pre-existing kind). Before the fix the same pages gave 254 on Dvoretsky
    (nearly all blank white margin) and 26 on Hellsten. A 2x-zoom
    render (2130 px) gave the same result. The two
    SCANNED books (Silman, Fundamental Chess Endings — also hatched) went from
    almost nothing found to every diagram found on the 6 scan pages tried, one grid
    per board in nearly all presses (3 of 132 presses on FCE p200 gave a grid 1 px
    off in period).
  - **Verified** — `tools/cdp-verify-hatched.mjs` (headless, 375px, EN/ES ×
    light/dark, **56/56**): Dvoretsky p395 + Hellsten p102. REALLY PRESSED with CDP
    touch input (finger held 1.1 s, dialog read while the finger is still down): on
    Dvoretsky at 20%, 28% and 70% of the page height — the heights that were missed
    — with Training off AND on → the diagram dialog opens with the board; on plain
    text (50%) → "Couldn't find a board there" / "No encontré un tablero ahí" and no
    dialog; on the bottom rank of a Hellsten board → dialog. The Training button
    REALLY TAPPED. CALLED, not pressed: `detectBoard` on the reader's own page
    canvas — 16x16 inside each of the four boards, all 256 give the same grid;
    280-point grid over the rest of both pages → no board. CLICKED with
    `element.click()`: Read tab, shelf cards, Back. SCROLLED by setting `scrollTop`.
    SEEDED: the two books via `db.addBook()`. Run:
    `node tools/cdp-verify-hatched.mjs <outDir> "<Dvoretsky.pdf>" 395 "<Hellsten.pdf>" 102`.
    Also green: `node tools/cdp-verify-stage2.mjs http://localhost:<port>` (all
    checks, incl. the blank-area and no-board-on-text ones),
    `tools/cdp-verify-training.mjs` **65/65**, `npm.cmd run test:tree` **53/53**.
  - **Book templates:** a book already calibrated on the phone was taught from
    the OLD, slightly-off grid. If Dvoretsky reads pieces worse than before, clear
    its templates (the reader's re-teach option) and teach it once more.
  - **Not tested:** a real phone and finger; reading the PIECES on a real
    Dvoretsky board after this change (only finding the board was checked;
    stage-2 reading is checked on synthetic boards); time on a slow phone (a miss
    costs ~40 ms in desktop headless, ~1.5x the old path); memory at deep zoom
    (the tone map adds two page-sized float arrays, ~60 MB at the 2400-px cap).
  - **Dev-only probe** (pages 30–395 of Dvoretsky, Hellsten 60/102/150/200, the
    scans) was throwaway, not committed; the committed tool covers p395 and p102.

- **READ TAB — TRAINING MODE: "!" MOVES ARE COVERED, TAP TO REVEAL (2026-10-02).**
  Committed on `main` (`cd92abb`), NOT pushed, NOT deployed. Main is ONE commit
  ahead of origin: origin is at `a32e801`, so the tab-swipe entry below saying
  "NOT pushed" is out of date — v127 and v128 are on origin. No rules change. `sw.js` v128 → **v129**; one new shipped
  file, `js/read-training.js`, added to the sw ASSETS.
  - **What it does:** a new button in the reader header (crossed-out eye, left of
    full-screen). On: every move marked "!" or "!!" on the page is hidden under a
    navy block; one tap on a block reveals that one move. For training alone with
    a book. Off: nothing is added to the page at all.
  - **Decided with Adrian:** "!" and "!!" only — "!?", "?!", "?", "??" stay
    visible. The block hides the move, its mark and any sign glued to it
    ("Rd2!+–", "g5+!=", "Ke3!ʘ"); the move NUMBER stays ("34." then a block), and
    so does a closing bracket or comma. On/off is remembered PER BOOK. A revealed
    move stays revealed until its page is scrolled well away, the mode is turned
    off, or the book/Read tab is left — then it is covered again; nothing about
    reveals is stored. Prose with an exclamation mark ("error!") is never covered.
  - **Scanned books cannot do this** (no text in the file, and no OCR — it would
    break the self-hosted / light-first-launch rules). On a scan the button is
    dimmed; tapping it says, in one line, that the book is a scan.
  - **Adrian's five PDFs in `ChessPuzzleImport\` (30 pages sampled each):**
    Dvoretsky and Hellsten have real text (about 5–8 "!" moves a page) → Training
    works. Silman and both copies of Fundamental Chess Endings are pure scans →
    dimmed button. **CORRECTION to the 2026-08-31 entry below:** Dvoretsky is NOT
    "a true scan with 0 embedded fonts" — its text is real, visible, positioned
    text (only the diagrams are pictures).
  - **How it works (`js/read.js`, section "Training mode"):** the pages are still
    pictures. With Training on, `buildCovers(slot)` asks pdf.js for the page's
    text — `page.getTextContent()`, the first and only use of it in the app — and
    hands it to `findCovers()` in `js/read-training.js`, which returns boxes as
    fractions of the page. They are drawn as `.train-cover` divs in a
    `.train-covers` layer inside the page's slot, sized in %, so zoom, pinch,
    rotation and the crisp re-render carry them with no extra work. Built once per
    slot (that is what keeps a reveal until the page is left); removed in
    `releaseSlot`. Taps: `handleTap` asks `coverAtClient()` first — a hit removes
    the cover and uses the tap up (`lastTap = 0`), so it is never half a
    double-tap. The covers take no pointer events; the long-press path is untouched.
  - **The rule itself (`js/read-training.js`, imports nothing):** pdf.js returns
    text in chunks that ignore words — one chunk holds several moves ("f4! g5!
    7."), and one move is split across two (the figurine in its own font, then
    "f4!"). So chunks are laid out as one character stream, words are cut from it,
    and `coverSpan()` decides. It never reads piece letters (figurines come back
    as private characters, e.g. U+E026): it needs a square (`e4`) or castling
    before the mark. A move's place inside a chunk is measured with the book's own
    embedded font, which pdf.js registers in `document.fonts` under the chunk's
    `fontName` once the page has rendered.
  - **Stored on the book record (IndexedDB `books`):** `training` (true/false) and
    `hasText` (true/false, worked out once per book by `checkHasText()` from the
    open page plus five spread through the book; a page counts at 150+ characters).
    New fields only; nothing renamed.
  - **Name trap:** `.read-cover` is the SHELF's cover thumbnail. The training
    blocks are `.train-cover` for that reason.
  - **Strings:** `read_training`, `read_training_on`, `read_training_off`,
    `read_training_scan` (EN + ES).
  - **Verified** by `tools/cdp-verify-training.mjs` (headless Chrome, 375px, EN/ES
    × light/dark, **65/65**; it serves the repo and the books itself, no preview
    port). Books: Hellsten p102 (figurine), Dvoretsky p395, Silman p60 (scan).
    Run: `node tools/cdp-verify-training.mjs <outDir> <figurine.pdf> 102 <text.pdf> 395 <scan.pdf>`.
    Checked: off = no layer and a screenshot byte-identical to before it was ever
    on; covers = the "!"/"!!" moves counted separately under Node (12 and 7); every
    cover has print under it and both edges in white space, read from the page's
    own pixels — at 1x, after double-tap zoom, after pinch (2.6x), after scrolling
    six pages away and back, sideways (812x375) and upright again, in full screen.
    REALLY TAPPED with touch input (CDP `Input.dispatchTouchEvent`): the Training
    button, every reveal, the taps beside and away from a cover, reveal-then-quick-
    tap (no zoom), double-tap zoom, the pinch, long-press on a cover (not a
    reveal), long-press on a diagram with Training off and on (dialog opens).
    CLICKED with `element.click()`: the Read tab, shelf cards, Back, full-screen,
    the Puzzles tab. CALLED: scrolling (`scrollTop` set), rotation (emulated
    screen resized). SEEDED: the three books, put on the shelf with
    `db.addBook()` and a starting page. `npm.cmd run test:tree` 53/53 (8 new in
    `tests/unit/read-training.test.js`).
  - **Known limits:** a move broken across two lines is not covered; rotated text
    is ignored. The padding on a block can rest on the dot of the move number. A
    tap within 12px of a block counts as a tap on it (blocks are ~4mm wide on a
    phone), so a double-tap that starts that close to one reveals instead of
    zooming.
  - **Not tested:** a real phone and a real finger; any book other than those
    three; a book whose text is an invisible OCR layer over a scan (none on hand —
    blocks there would only be as accurate as the OCR).
  - **FIXED 2026-10-02 (entry above)** — was: **FOUND, NOT FIXED (pre-existing, nothing to do with Training):** the diagram
    reader misses Dvoretsky's hatched boards at some finger heights. Probing
    `detectBoard` directly on p395 at 375px: inside the first board it finds the
    board at 8%, 12%, 16% and 24% of the page height but NOT at 20% or 28%; in the
    second board it misses at 70%. Hellsten's boards were found at every spot
    tried. On a phone this is "Couldn't find a board there" on a press that is
    plainly on the diagram.

- **TAB SWIPE WORKS IN PUZZLE RUSH AND BLINDFOLD (2026-10-02).** Committed on
  `main`, NOT pushed, NOT deployed (main is now two commits ahead of origin
  `5cdeae6`). Behaviour only — no rules change, no data change, no new text.
  `sw.js` v127 → **v128**.
  - **What it does:** a sideways swipe on Puzzle Rush or Blindfold now goes to
    the same neighbours as Puzzles — Openings one way, Play the other. Swiping
    back towards Puzzles from either side lands on plain Puzzles, as the drawer
    does. Android Back after a swipe returns to the Rush / Blindfold screen that
    was left, the same as after a drawer tap.
  - **Leaving mid-run is the drawer's behaviour, unchanged:** a Rush run is
    dropped (clock stopped, no result card, no score saved, no dialog); a
    Blindfold puzzle is abandoned (countdown and peek timers cancelled, no
    rating change, no dialog). The swipe goes through the same `showScreen()`.
  - **Added on purpose, beyond the bare fix:** the Blindfold board and the Rush
    board (and Rush's 5…1 count-in lying over it) keep EVERY touch — a drag that
    starts anywhere on them never switches tabs, not even from an empty square.
    On the Puzzles board an empty square still swipes, as before. Reason: with
    hidden pieces nobody can tell an empty square from their own piece, and a
    slipped swipe in Rush would silently end the run. To swipe away from those
    two screens, start the drag above or below the board.
  - **Left alone on purpose:** Leaderboard, Friends, Blocked, Friends
    leaderboard, a public profile, Masterclass and Set up position still have
    no swipe neighbours — each is left by its Back button.
  - **Code:** `js/app.js` only — `SWIPE_AS_HOME` (rush, blind) and
    `neighbourTab()`, which looks those two up under their home tab through the
    existing `MENU_AREA`; `boardOwnsTouch()` (the two board ids); `SWIPE_SAFE`
    (`#rush-countdown`). The mode chips were already covered (`.seg.scroll`).
  - **Verified** by `tools/cdp-verify-swipe-modes.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **161/161**), preview `chess-app75` = port 9190.
    REALLY SWIPED with touch input (CDP `Input.dispatchTouchEvent`): every tab
    swipe, every drag on the chips, every drag on a board (a piece, an empty
    square, hidden Blindfold pieces after the countdown, the Rush count-in).
    CLICKED with `element.click()`, not a finger: ☰ and drawer destinations,
    the mode chips, Rush Start, Leaderboard, Friends. CALLED, not tapped:
    `history.back()` stands in for Android Back; `showScreen()` opened Blocked,
    Friends leaderboard, a public profile, Masterclass and Set up position, with
    no data behind them. SEEDED: nothing. `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real phone (a real finger is less straight than the
    test's), a signed-in account, and an OPEN base — the fresh test profile has
    no bases, so only the Bases list was swiped; its code path was not touched.

- **TAB HEADERS: NO SECOND TITLE (2026-10-02).** Committed on `main`, NOT
  pushed, NOT deployed (main was level with origin at `5cdeae6` before this).
  Looks only — no rules change, no data change. `sw.js` v126 → **v127**.
  - **What it does:** the top bar already names the tab, so the ten top-level
    tabs no longer repeat it in a second title underneath (Bases, Play, Read,
    Openings, Puzzles, Puzzle Rush, Blindfold, Learn, Profile, Students).
    Every tab's first content now starts 10px under the top bar, the same as
    Analysis.
  - **Where each stranded control went:** Bases — **New base** and **Import
    PGN** share one row, counter at the right edge. Read — the storage line
    sits left of **Add book**. Puzzles — the rating and +/− badges joined the
    progress/timer row. Blindfold — the rating badge sits right of the
    "White to move" line. Students — ⟳ moved to the right end of the "My
    students" heading (so it is not shown signed out, where there is nothing
    to reload).
  - **Kept on purpose:** every sub-screen title, because there the top bar only
    names the parent tab — an open base, a Masterclass, Game History, the Rush
    result, Learn's lists/lessons/endings, Leaderboard, Friends, Blocked,
    Friends leaderboard, a public profile, Set up position.
  - **Screen readers:** `#app-title` in the top bar is now the page's one
    `<h1>` (it was a `<span>`). Rush and Blindfold keep their title as an
    invisible `<h2 class="sr-only">`, because the top bar says only "Puzzles".
  - **Code:** `index.html` head rows; `css/style.css` — `.tab-head`,
    `.tab-head-btns`, `.tab-lead`, `.badge-group`, `.sr-only`, `.blind-head`,
    and a first-visible-section rule for `#stu-body`. Three strings that
    nothing else used were deleted from `js/i18n.js`: `play_title`,
    `read_title`, `trainer_title` (`docs/EN-REVIEW-PLAN.md` still lists them).
    `puzzles_title`, `rush_title`, `blind_title` stay — still used.
  - **Older fault fixed on the way:** with an empty bookshelf the Read tab
    scrolled sideways by 30px — its watermark had no positioned parent and
    hung off the page. `#read-shelf` joined the watermark-container rule and
    got a `min-height` so the watermark is not cut short.
  - **Verified** by `tools/cdp-verify-tabheads.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **301/301**), preview `chess-app74` = port 9189.
    REALLY CLICKED: ☰ and every drawer destination, the three puzzle-mode
    chips, New base, Import PGN, Add book, ⟳, Leaderboard, Friends, a base,
    Game History, Learn down to a lesson and an ending position, every Back,
    and the whole guided tour started from Settings (33 steps, every target
    found and ringed, finished). SEEDED: nobody was signed in — the signed-in
    Students tab was faked the same way as the hardest-topics check, with
    `Students.load` swapped for a counter to see ⟳ call it once; Blocked,
    Friends leaderboard, Masterclass and a public profile were opened by
    calling `showScreen()`, the last two with no data, so only the heading's
    place in the row was checked there. `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real phone, a signed-in account, the Rush result card
    (untouched markup, not opened), and the +10/−10 badge appearing after a
    solved puzzle (present in the page, not triggered).
  - **Found here, FIXED since (v128, entry above):** swiping sideways to the neighbouring tab
    does nothing in Puzzle Rush and Blindfold. `neighbourTab()` in `js/app.js`
    looks the screen up in `TAB_ORDER`, which holds only the drawer's nine
    screens; `rush` and `blind` are not in it, so it returns null.

- **STUDENTS: HARDEST TOPICS + WEAK-SPOT MARKS (2026-10-01).** Committed on
  `main`, NOT pushed, NOT deployed. No rules change, no change to what a
  student shares, no IndexedDB change. `sw.js` v125 → **v126**.
  - **What it does:** (1) on a student's page, the puzzle themes that are a
    weak spot get a gold edge, a tint and a ▼ (with a "Weak spot" label for
    screen readers), and a line under the grid says what the mark means.
    (2) At the top of the Students tab, "Hardest topics for your students" /
    "Temas más difíciles para tus alumnos": the themes that are a weak spot for
    the most students — rank, "3 of 4 students", a bar, and the names.
  - **Adrian's two decisions:** scope A (existing data only — NOT real mistake
    counts); and "weak" = judged against the student's OWN puzzle rating, not
    simply the three lowest.
  - **The rule, exactly:** a named theme is a weak spot when its rounded rating
    is **75 or more below the student's rounded puzzle rating**, the lowest
    **3** at most (`WEAK_GAP`, `WEAK_MAX`). The class block counts students per
    weak theme, lists only themes shared by **two or more**, most students
    first, ties broken by the bigger total shortfall, top 5 (`HARD_SHOWN`).
    Only students with a puzzle rating AND at least one named theme take part;
    the note says "N of M students share themes". Fewer than two such students:
    a plain sentence with the count, no ranking. No accepted student: no block.
  - **Honest limit — it is ratings, not mistakes.** Checked in the code:
    nothing a student shares counts mistakes or attempts per theme
    (`buildStudentReport`, js/firebase.js). A theme gets a rating only once one
    puzzle of it is tried, and in a student's first 10 puzzles one result moves
    a theme about 100 points — so a mark on a brand-new student can be one
    unlucky puzzle. The app cannot tell "tried once" from "tried 200 times".
  - **Code (`js/students.js`):** `namedThemes(themes)` (the one meta-tag
    filter, now shared), `weakThemes(r)`, `renderHard()` (called from
    `render()`), and `themesBlock(r)` — it now takes the whole summary, not
    just `puzzleThemeElo`. Markup `#stu-hard` in `index.html`; CSS
    `.stu-theme.weak`, `.stu-hard-*`; 8 strings `stu_weak_*` / `stu_hard_*`.
    The Assign-homework sheet's weakest-first chips are untouched.
  - **Verified** by `tools/cdp-verify-hardtopics.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **169/169**), preview `chess-app73` = port 9188.
    SEEDED: nobody was signed in — the teacher uid, the coaching links and
    seven students' summaries were written straight into the live `Students`
    object, `Students.load` was replaced by a no-op, and the tab was opened by
    calling `showScreen('students')`, not by a tap. REALLY CLICKED: every
    student card, "Show all", and Close. The expected ranking was counted by
    hand in the script's comments (fork 3, pin 2, skewer 2 of 4 sharing
    students; two one-student themes left out) and the page matched it; also
    checked: exactly −75 is marked and −74 is not, a 4th theme at −75 is left
    out by the cap, meta-tags never show, a student sharing nothing, a student
    with only meta-tags, a student with no summary, one student only, two
    students with nothing in common, no accepted student, no sideways scroll.
    `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real signed-in teacher with real students, and a real
    phone. Offered and NOT built: per-theme first-try misses from homework
    results (data already arrives, no rules change), and scope B (count real
    failures per theme on the student's device — needs a summary + rules
    change and a rules deploy).

- **OPENINGS: ONE CHOSEN GAME PLAYS TO ITS LAST MOVE (2026-10-01).** Committed
  on `main`, NOT pushed, NOT deployed. No rules change, no IndexedDB change, no
  new control, no new string. `sw.js` v124 → **v125**.
  - **What it does:** with "Practice one game only" on, the book is now the
    WHOLE game — main line and every variation, however late — so the computer
    stays "in book" to the final move. The count next to the toggle is the
    game's real length (the 45-half-move Immortal Game says 45, it said 41).
  - **Adrian's decision, taken as his stated default:** the WHOLE-database book
    is unchanged — still the first 500 games, 40 half-moves deep. It is an
    openings book; nobody asked for it to go deeper.
  - **Code (`js/app.js`, `Trainer.buildBook`):** one line —
    `const maxDepth = gameId ? 1000 : 40;` and `walk()` tests `depth > maxDepth`.
    1000 half-moves is only a safety stop for a damaged PGN (the longest
    tournament game ever played is 538). This supersedes the "Known, not new"
    40-ply note in the entry below.
  - **Build time, measured** (headless Chrome on this PC, median of 9): a
    300-half-move game builds in ~19 ms, of which ~17 ms is reading the PGN —
    which the app did in full even under the old limit. The Immortal Game
    ~5 ms. So the deeper walk itself costs about 2 ms; nothing to feel.
  - **Verified** by `tools/cdp-verify-onegame.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, now **47/47**). SEEDED straight into IndexedDB: the
    four old bases plus "Verify Long" — the Immortal Game with one extra
    variation on its last black move (22...Ne7 23.Qxe7#), and a 300-half-move
    SYNTHETIC game of seeded-random legal moves. Really clicked: toggle, game
    rows, Black, Start, Back; the select was set and fired `change`. The
    player's moves went in through `Trainer.userMove`, not taps. Results:
    Immortal alone 45 positions, and played to the end as Black the computer
    made all 23 White moves from the book, badge "in book" on 23.Be7#; the late
    variation counts 46, offers both 22...Nxf6 and 22...Ne7, and answers
    22...Ne7 with 23.Qxe7# from the book; the 300-half-move game counts 295
    (5 positions repeat — cross-checked against a count made with chess.js at
    seed time, not hand-counted); whole base still 81, 51 after the Opera Game
    is deleted; toggle off/on, switching games, changing database, reload and
    offline all still pass. `npm.cmd run test:tree` 45/45.
  - **Script trap, fixed:** a play-out helper that read `Trainer.chess` straight
    after clicking Start saw the PREVIOUS game for one tick and moved on it.
    `playOutAsBlack` now waits 300 ms first.
  - **Not tested:** a real phone, real finger taps on the board, and a real
    imported long game (both long games here were seeded).

- **OPENINGS: PRACTISE ONE CHOSEN GAME (2026-10-01).** Committed on `main`,
  NOT pushed, NOT deployed. No rules change, no IndexedDB schema change.
  `sw.js` v123 → **v124**.
  - **What it does:** under the database select on the Openings tab, a toggle
    "Practice one game only" / "Solo una partida" (off by default = the whole
    database, exactly as before). On: a row shows the chosen game; tapping it
    opens a sheet with a search box and the base's games (same rows and
    200-at-a-time paging as the Bases tab; search matches White, Black, event
    and date). The book is then built from that ONE game, variations and
    comments included, and the count next to the toggle is that game's.
  - **Adrian's two decisions:** one game only (not several ticked games); the
    last database / toggle / game ARE remembered, on this device only — kv key
    `trainerPick` `{baseId, oneGame, gameId}`, deliberately not in
    `SYNCED_KEYS` because game ids are local.
  - **Code (`js/app.js`, `Trainer`, now exported for the verify script):**
    `bookBaseId` is GONE, replaced by `bookKey` = `"baseId|gameId"` (gameId
    empty = whole base) — that was the cache trap. `buildBook(baseId, gameId)`,
    `syncGame()`, `renderPick()`, `savePick()`, `baseChanged()`,
    `toggleOneGame()`, `pickGame()`. `gameRowHtml(g)` is the one game-row
    markup, shared by `Bases.renderGames()` and the picker.
  - **Rules it follows:** changing the database clears the game (the toggle
    stays on and asks for one); a one-game database picks its game by itself;
    toggling off and on keeps the game; Start with nothing chosen opens the
    picker instead of starting; a remembered game that has since been deleted
    drops back to the whole database rather than swapping in another game.
  - **Layout trap, measured:** the toggle shares ONE line with the "N book
    moves" count (`.trainer-one-row`). A row of its own made the group 48px
    taller and Kael's card then covered part of the tour's `trainerSet` frame
    (`#trainer-base` → `#trainer-level`) at 375x812. Now the default screen is
    the same height as before and the card clears the level buttons by 1px —
    there is NO spare room; anything added inside that frame breaks the step.
    The Spanish label is short for the same reason.
  - **Verified** by `tools/cdp-verify-onegame.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, 42/42): SEEDED straight into IndexedDB — four bases
    (Morphy's Opera Game, Anderssen's Immortal Game, a Queen's Gambit study
    with two variations and two comments; a one-game base; 450 synthetic
    games). Really clicked: the toggle, the game rows, Start, Back; the search
    box got real input events; the select was set and fired `change`. The
    player's own moves went in through `Trainer.userMove`, not taps. Results:
    whole base 81 positions; Opera 33; Immortal 41; study 11; as Black against
    game A the computer played 1.e4 2.Nf3 six times of six, against game B
    1.e4 2.f4 six of six; leaving the game's moves hands over to the engine;
    reload and offline reload (service worker) keep the choice.
    `npm.cmd run test:tree` 45/45.
  - **Known, not new:** the book builder stops 40 plies deep (the 45-ply
    Immortal Game counts 41), so the tail of a long game is never played from
    the book — more visible now that one long game can be the whole book.
    Restarting the tour from Settings WITH a game chosen makes the frame taller
    than the space left, and the card then covers the database select; a
    first-time user never sees that state.
  - **Not tested:** a real phone, and real finger taps on the board.

- **LIVE SEARCH: ONE CHANGED GAME NO LONGER RE-READS THE BASE (2026-10-01).**
  Committed on `main`, NOT pushed, NOT deployed. No rules change. **No
  IndexedDB schema change** (`DB_VER` stays 5 — one more hand-written key in
  the existing `posIndex` store, so there is no upgrade step). `sw.js` v122 →
  **v123**. This closes the "Not done, follows from this" bullet of the entry
  below.
  - **What it does:** after one game is added, edited, moved or deleted, the
    search reads THAT game, not the base's whole game list. Before / after
    (`tools/measure-livesearch.mjs`, real app, headless Chrome, this PC;
    x4 ≈ a phone):

    | Base | Games | Next search after 1 game added, before x1 / x4 | after x1 / x4 | 2nd start after 1 game added, before x1 / x4 | after x1 / x4 | 2nd start, no change (must not regress) x1 / x4 |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` | 27,129 | 0.5 s / 1.5 s | **0.02 s / 0.05 s** | 0.5 s / 1.6 s | **0.07 s / 0.22 s** | 0.05 s / 0.19 s (was 0.05 / 0.20) |
    | `2024 - 27 UPDATES.pgn` | 177,139 | 3.4 s / 10.0 s | **0.04 s / 0.12 s** | 3.7 s / 11.2 s | **0.39 s / 1.4 s** | 0.37 s / 1.5 s (was 0.34 / 1.6) |

    The tool now prints which path ran: "base NOT walked, 1 listed game(s)
    re-read". A second start after a change now costs the same as one with no
    change (it is the reopening of the stored blocks, nothing else). First ever
    build unchanged (140 s / 660 s on the 177k base).
  - **How:** next to each base's `rev` counter there is now a short list of
    WHICH games were written: key `[baseId,'log']` = `{ since, ids }` — the ids
    of every game of that base written after the counter stood at `since`.
    `gamesWrite()` writes it in the SAME transaction as the game and the `rev`
    bump. `touch(baseId, gameId)` names a game; `touch(baseId)` alone (a write
    too big to name) drops the list.
  - **The rule that keeps it correct:** `Analysis.explore.at` = the base's
    counter when the index was last right (from `built` on disk after a start,
    then kept in memory). `syncExplore()` reads `{ rev, log }` in one
    transaction (`db.posIndexChanges`), then:
    1. `rev === at` → nothing was written to THIS base; return (a write to
       another base now costs nothing).
    2. `log && log.since <= at` → the list vouches for everything since →
       `PositionIndex.patch(ids, getGame)` looks at those ids only.
    3. anything else (no list, a list that starts too late, index never built
       or unreadable) → the full `listGameSummaries` + `sync()` walk, exactly
       as before. **The walk is still the fallback and must stay.**
    `markPosIndexBuilt(baseId, rev, { stored })` empties the list in the same
    transaction ONLY if the counter still equals `rev`; a game written during
    the sync stays listed. `patch()` is safe to repeat (a listed id whose
    `updatedAt` already matches costs one look), so a list that was not
    emptied, or a sync cut short, is harmless.
  - **Cap:** `LOG_MAX = 200` ids (`js/db.js`). A write of more than 200 games
    at once (`addGamesBatch` — the importer sends 500 a batch) names nothing
    and drops the list → one walk on the next search, as before; the list
    starts again with the next single write. A small import (≤ 200 games in a
    batch) IS named and read game by game.
  - **Memory-only index (`noStore`, device short of space):** same path — the
    list lives with the games' counter, not with the stored blocks, and
    `markPosIndexBuilt(..., { stored: false })` empties it without writing
    `built`. `clearPosIndex` keeps `rev` and `log`.
  - **Files:** `js/db.js` (`gamesWrite`, `addAll`, `gameSummary`,
    `posIndexChanges` — replaces `posIndexRev` —, `markPosIndexBuilt`,
    `loadPosIndex` now also returns `log`), `js/explore-index.js`
    (`PositionIndex.patch`), `js/app.js` (`Analysis.syncExplore()` only;
    `explore` gained `at`). **Any new code that writes games must still go
    through `gamesWrite()` and should name the game to `touch()`.**
  - **Verified:** `npm.cmd run test:tree` = **45** green (new tests 18–21:
    `patch()` for add / edit / delete, block filling, unchanged or unknown ids,
    and patch-then-full-sync agreeing). `tools/cdp-verify-livesearch.mjs` — ALL
    PASSED at 375px, EN/ES × light/dark, now **51 checks each**, 0 page errors.
    The tool now counts walks (`sync`) and list checks (`patch`) separately.
    Old checks 8, 12, 13 now assert **0 walks**. New (all writes SEEDED through
    `js/db.js`): 14 a write to another base costs nothing; 15 two games
    imported at once → 2 read, 0 walks; 16 a game moved to another base leaves
    this one, and after a restart the other base — whose index was not open
    when it was written — finds it by reading 2 games, 0 walks; 17 a 250-game
    batch → ONE walk that re-reads only the 250, no list kept, and the next
    single game is read alone again; 18 no room (`roomForIndex` FORCED false):
    stored copy dropped, add and delete still found with 0 walks, and after a
    restart with room the base is walked once and stored again; 19 (was 14)
    base deleted → no `log` left either.
  - **NOT tested:** a real full phone (the branch where saving a block fails),
    as before; two tabs of the app open at once (reasoned through: the second
    tab's list would start after the first tab's `at`, so it falls back to the
    walk — not run).

- **LIVE SEARCH: THE POSITION INDEX IS NOW KEPT ON DISK (2026-10-01).**
  Committed on `main`, NOT pushed, NOT deployed. No rules change.
  **IndexedDB schema change: `DB_VER` 4 → 5** (one new empty store, `posIndex`;
  nothing is backfilled, so the upgrade is instant — a real v4 database with a
  game in it was upgraded in place in the preview pane and searched fine).
  `sw.js` v121 → **v122**. This closes the "OPEN DECISION" in the entry below.
  - **What it does:** the index is built once per base and reopened on later
    app starts. Before / after, first search of a base **after an app start**
    (`tools/measure-livesearch.mjs`, real app, headless Chrome, this PC;
    slowdown 4 ≈ a phone):

    | Base | Games | Before x1 / x4 | After (2nd start) x1 / x4 | 2nd start after 1 game was added x1 / x4 | First ever build x1 / x4 | On disk |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` | 27,129 | 20.9 s / 83.7 s | **0.05 s / 0.20 s** | 0.5 s / 1.6 s | 18.3 s / 89.7 s | 15.1 MB, 14 blocks |
    | `2024 - 27 UPDATES.pgn` | 177,139 | 137 s / 677 s | **0.34 s / 1.6 s** | 3.7 s / 11.2 s | 140 s / 680 s | 121.1 MB, 89 blocks |

    On a normal second start the base is NOT read at all (the tool counts it:
    "none — the base was not read"). The first ever build costs the same as
    before; saving it adds under a second.
  - **Adrian's decision (he left the call to me: keep the app's capacity,
    keep it fast, and above all do not bother the user):** the index is ALWAYS
    stored, for every base, with NO question, setting or message. The safety
    valve is silent: `Analysis.roomForIndex()` checks free space before each
    sync, and with under 300 MB free (or if a save fails) the stored copy of
    that base is dropped and the search works in memory exactly as in v121.
    Why not a size cut-off: the index is ~40–60% on top of a base already on
    the phone (browser estimate: 177k base 222 MB + index ~136 MB; Panama
    41.5 MB + ~16 MB), and the big base is where it matters most.
  - **Layout — blocks of 2,000 games** (`BLOCK` in `js/explore-index.js`), not
    a record per game. Measured on the 177k base before choosing: blocks reopen
    in 0.39 s / 1.28 s (x1 / x4) and save in 0.6 s; a record per game reopens in
    2.1 s / 4.1 s and saves in 12.7 s. A block = `{ summaries, counts, hashes }`
    (the games' summaries, and their position lists laid end to end).
  - **`js/explore-index.js`:** `PositionIndex.load(blocks)`; `sync()` takes
    `onBlock(n, block)` — called for each block whose games changed, as soon as
    it is complete (null = block now empty), so a long first build is saved as
    it goes and a build cut short carries on from the saved blocks. An edited
    game stays in its block; a new game fills the last block, then opens a new
    one. Entries gained a `block` number. Tests 14–17 cover this
    (`npm.cmd run test:tree` = **41** green).
  - **`js/db.js`:** store `posIndex`, hand-written keys `[baseId,'block',n]`,
    `[baseId,'rev']`, `[baseId,'built']`. **`gamesWrite()`** — every write to
    the games store (`addGame`, `updateGame`, `deleteGame`, `addGames`,
    `addGamesBatch`, `deleteBase`) now goes through it and bumps that base's
    `rev` counter IN THE SAME TRANSACTION. The stored index is trusted only
    when `built === rev`; otherwise the per-game `updatedAt` check runs as
    before. **Any new code that writes games MUST use `gamesWrite()`**, or a
    stored index will be trusted when it is stale. New: `loadPosIndex`,
    `posIndexRev`, `savePosBlock`, `markPosIndexBuilt`, `clearPosIndex`.
    `deleteBase` deletes the base's index with its games (and no longer loads
    every game's PGN just to delete them). `clearAllLocalData` clears the new
    store. `tx()` now rejects on abort (a full device aborts with no error
    event — it used to hang).
  - **`js/app.js`:** only `Analysis.syncExplore()` changed, plus
    `roomForIndex()` and `stopStoringIndex()`. `Analysis.explore` gained
    `opened` / `noStore`.
  - **Verified:** `tools/cdp-verify-livesearch.mjs` — ALL PASSED at 375px,
    EN/ES × light/dark, now **41 checks each**, 0 page errors. New checks 11–14
    (page really reloaded = a new app start; the delete/edit are SEEDED through
    `js/db.js`): restart → same results with 0 index builds; game deleted +
    restart → gone, noticed by one check that re-read 0 games; game edited →
    found by re-reading 1 game, and still right after another restart with 0
    builds; base deleted → none of its index left, the other base's intact.
    The no-room path was run by hand in the pane (`roomForIndex` forced false):
    stored copy dropped, search still right, stored again once there is room.
    NOT tested: a real full device (the save-fails branch itself).
  - **Not done, follows from this — NOW DONE, see the entry above ("ONE
    CHANGED GAME NO LONGER RE-READS THE BASE"):** with the app open, adding or
    editing ONE game made the next search re-read the base's game list
    (`db.listGameSummaries()` — 0.5 s / 1.5 s Panama, 3.4 s / 10.0 s on the 177k
    base), and so did the first start after any change.

- **LIVE DATABASE SEARCH ON THE ANALYSIS TAB (2026-10-01).** Committed on
  `main`, NOT pushed, NOT deployed. No rules change, no IndexedDB schema
  change. `sw.js` v120 → **v121**.
  - **Adrian's decisions:** the Internet (Lichess) search is NOT live — it
    stays one-shot; there is NO off switch — the search only works while the
    results list is on screen, and the base stays remembered until another is
    picked or the app is closed (leaving the Analysis tab keeps it).
  - **Behaviour:** first 🔎 = as before (Database / Internet, then which base).
    With the results showing, every board change updates the list. 🔎 with the
    MOVES showing = straight back to the results, same base, current position,
    no chooser. 🔎 with the RESULTS showing = the chooser (the base in use is
    ticked ✓). The "Games" switch does the same as 🔎. Status line:
    `📚 <base name> · N games`; over 200 matches draws the first 200 and says so.
  - **New module `js/explore-index.js`** (imports only `vendor/chess.js`,
    precached in `sw.js`). `PositionIndex`: each game is read ONCE and kept as a
    sorted `Float64Array` of 53-bit position hashes (8 bytes a position, no FEN
    text, no PGN). `sync(summaries, getPgn)` re-reads only games that are new
    or whose `updatedAt` changed; `find(fen)` is a binary search per game.
    `fenKey()` now lives here — its definition is GONE from `js/app.js`, which imports it.
  - **`pgnPositions()` — the fast reader.** `parsePgn()` costs 3–4 ms a game
    (measured: `chess.move(san)` writes the SAN of every candidate move).
    `pgnPositions()` matches the SAN by its squares using chess.js internals
    (`_moves`, `_makeMove`, `_undoMove`, `_isKingAttacked`) — ~10x faster. It is
    held to `parsePgn()`'s exact positions by tests 12–13 in
    `tests/unit/explore-index.test.js`. **If `vendor/chess.js` is ever
    upgraded, run `npm.cmd run test:tree` — those tests say whether it still
    holds.** `Analysis.treeHasFen` is GONE.
  - **`db.gamesRev`** (`js/db.js`): a counter bumped by every write to the games
    store. `Analysis.searchLive()` compares it with the index's and re-syncs
    only when they differ — a normal move touches no database at all.
  - **In `js/app.js` (`Analysis`):** state `explore` / `exploreSource` /
    `exploreSeq`; `gamesShowing()`, `exploreLive()`, `searchLive()`,
    `syncExplore()`. The hook is ONE line at the end of `refresh()`.
    `loadTree()` now calls `showMovesTab()` first, so any newly opened game
    (a Masterclass chapter included) starts on its moves with the search parked.
    The remembered base is in `Analysis.explore`, deliberately NOT in `ctx`.
  - **Verified** with `tools/cdp-verify-livesearch.mjs` (headless CDP, 375px,
    EN/ES × light/dark, 33 checks each, all pass, 0 page errors). SEEDED: two
    bases of real games written through `js/db.js`, the game added mid-run, and
    the Masterclass `ctx`. REALLY CLICKED: 🔎, every sheet/chooser button, every
    move on the board, ⏮ ◀ ▶, the result that is opened, the Moves switch.
    Search off / moves showing / Masterclass chapter: the search is called 0
    times (counted). `npm.cmd run test:tree` = 37 green.
  - **Measured** with `tools/measure-livesearch.mjs <url> <file.pgn> [slowdown]`
    (real app, headless Chrome, this PC) on a 2,000-game TEST file of short
    games: first search 0.7 s (was 6.0 s before the fast reader), 3.5 s at a
    4x "phone" slowdown; index 0.6 MB; a move 3 ms; one game added 31 ms.
    That test file flattered it. **Adrian's real bases, measured 2026-10-01**
    (same tool, files under `D:\2. Chess\`, slowdown 1 = this PC, 4 ≈ a phone):

    | Base | Games | First search x1 | First search x4 | Index | A move x1 / x4 | After 1 game added x1 / x4 |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` (22 MB) | 27,128 | 20.9 s | 83.7 s | 15.0 MB | 15 ms / 45 ms | 0.6 s / 1.4 s |
    | `Opening Encyclopedia 2024 games.pgn` (65 MB) | 37,328 | 47.0 s | 230 s | 37.3 MB | 9 ms / 45 ms | 1.1 s / 2.5 s |
    | `2024 - 27 UPDATES.pgn` (181 MB) | 177,138 | 137 s | 677 s | 120.5 MB | 20 ms / 100 ms | 3.4 s / 10.2 s |

    What the numbers say: the first search costs 0.8–1.3 ms a game on the PC
    (the Encyclopedia's games are longer: 131 positions a game against 72–89),
    x4 on a phone-like CPU — so EVERY real base is far past the ~10 s line, and
    it is paid again on every app start. The index is 8 bytes a position,
    exactly as designed. Moves stay fast once it is built. Adding ONE game is
    not free on a big base (0.6–10 s): that is `db.listGameSummaries()` re-reading
    the whole base's list, not parsing. Which of the three Adrian keeps in the
    app was not established — he asked for all three.
  - **DECIDED AND BUILT (see the entry above):** the index is stored on disk,
    built once per base, not once per app start.
  - **Not done, on purpose:** a result still opens at the END of the game, as before.
  - **Pre-existing, untouched:** offline, the Internet search shows the raw
    English "⚠️ Failed to fetch" in both languages.

- **MOVE LIST REDESIGN — ONE MOVE PAIR PER ROW + VARIATION COLOUR
  (2026-10-01).** Committed on `main`, NOT pushed, NOT deployed. No rules
  change, nothing to deploy but the push itself. `sw.js` v119 → **v120**.
  - **Adrian's decisions:** ALL THREE lists get the layout (Analysis, Play,
    Opening) — not Analysis only; the colour SYNCS between devices; comments
    always on their own line; nested variations each on their own indented line.
  - **New module `js/movelist.js`** (imports only `js/tree.js`, precached in
    `sw.js`). `moveListItems(tree)` decides what shares a row — pure, no DOM,
    covered by `tests/unit/movelist.test.js` (9 tests, `npm.cmd run test:tree`
    = 24 green). `renderMoveList(el, tree, current)` draws it.
    `Analysis.renderLine`, `numberedHistory` and `nagMoveClass` are GONE from
    `js/app.js` — do not look for them. Play and Opening pass
    `treeFromHistory(...)` to the same renderer.
  - **Markup:** main line = `div.mv-row` (grid: `.mv-num`, White `.mv`, Black
    `.mv`); a row cut by a comment or variation shows White alone and Black
    continues as `12…` in the Black column. Variation = `div.variation.dN`
    with a left bar; inside it each "number + White + Black" is one
    `span.mv-unit` with `white-space: nowrap`, "(" inside the first unit and
    ")" inside the last — that is the whole fix for lines ending on "(" or a
    lone White move. Comment = `div.mv-comment`. Every `.mv` and comment still
    carries `data-node`, so the click handler, long-press menu and the
    own-`scrollTop` keep-in-view code are untouched.
  - **One honest exception:** a variation whose LAST move is White's, or a
    White move directly followed by a comment / sub-variation, ends its line on
    a White move. Unavoidable; the checker counts these separately.
  - **Setting:** Settings → "Variation color" / "Color de las variantes"
    (Grey / Blue / Gold). `Themes.setVariationColor` in `js/appearance.js`,
    kv key `variationColor`, body class `varcol-*`, CSS var `--var-col`. Added
    to `SYNCED_KEYS` in `js/firebase.js`; like board colour, a value pulled from
    another device shows on the next app start. Measured contrast on the list
    background, light / dark: grey 4.83 / 8.73, blue 5.85 / 7.05, gold 5.54 /
    9.87 (light-mode gold is a darker `#8a6100`; the normal gold fails on
    white). Comments were ~2:1 in light mode — now `#2f6b2f`, 6.43.
  - **Verified** with `tools/cdp-verify-movelist.mjs` (headless CDP, 375px,
    EN/ES × light/dark, plus the nested game at 320–430px): character-by-
    character measurement, zero lines ending on "(", a symbol, or a White move
    with a reply; no sideways scroll; and a control run with the glue removed
    that the checker correctly fails. REAL mouse events: tap a main-line move,
    tap a move 3 levels deep, tap a comment, long-press menu, ▶ ×150 / ◀ ×60
    (current move never left the list, page never scrolled), the Settings
    buttons + reload, a Play game vs Stockfish, Opening-trainer moves.
    SEEDED: the games loaded into Analysis, the Masterclass chapter (handed to
    `Masterclass.openChapter`; Firestore unreachable), the one-game opening
    database. NOT tested: the colour arriving from a second signed-in device,
    and a live broadcast.

- **STUDENTS STAGE 6 — FINISHED-HOMEWORK NOTICE + PER-PUZZLE RESULTS
  (2026-09-30).** Committed on `main`, NOT pushed, NOT deployed. **Adrian
  must run `npm.cmd run rules:deploy` AND `npm.cmd run indexes:deploy`
  BEFORE `git push`** (new rule field + one new index). `sw.js` v118 →
  **v119**. A stage on top of the "complete" plan; still no push, no Cloud
  Functions, no email (Blaze stays off).
  - **Adrian's decisions:** a WRONG puzzle does NOT count toward `done` (only
    first-try solves, as before) — it only shows in the results. The teacher
    check runs at app open AND on returning to the app after 15+ minutes.
  - **(A) Notice.** `Students.checkFinished()` → `fetchFinishedHomework(since)`
    = ONE query `teacherUid == me, completedAt > since, orderBy completedAt,
    limit 20` (index `homework (teacherUid, completedAt)` in
    `firestore.indexes.json`; only finished homework has `completedAt`, so no
    status filter). **Cost: 0 reads with no accepted student** (decided from
    the cached roster, `hasStudents()`), **1 read when nothing is new, 1 per
    finished homework otherwise.** Runs from `onAuth` (boot), `visibilitychange`
    → visible, `online`, throttled to 15 min (`FIN_CHECK_MS`), and forced by
    `load()` (opening Students). First check on a phone looks back 14 days.
    `finSeenAt` = newest `completedAt` ms + 1 (from `doneMs`, taken off the
    Timestamp before caching). Results go into `hwGiven`, so the sheet opens
    with no further read. `finNew` (in `studentsCache`) feeds the gold dot
    (unseen lines) and the "🔔 Finished homework" strip `#stu-fin` on top of
    Students (all four kinds). A line opens the results sheet and leaves the
    strip; "Clear" drops all; both also settle that student's roster "new"
    chip (`doneSeen`). Limit: a phone with no cached roster lights only after
    its first Students visit.
  - **(B) Results.** New field `results` on `homework`: one string per
    ATTEMPT, `<packed puzzle>|<1 first try / 0 not>|<seconds>`
    (`packResult` / `unpackResult` in `js/firebase.js`) — the whole puzzle, so
    the teacher's phone needs no rating band. Kinds `puzzles` and `list`.
    Written by `Students.hwResult(puzzle, ok)`, called from **`Puzzles.log()`**
    (the one place every ending passes: solved, solved after a mistake/hint,
    solution shown, left after a wrong move; `exitHomework` now logs a failed
    unlogged puzzle too). A puzzle skipped untouched is not an attempt. In the
    solve branch `hwSolved` moved to AFTER `log()` so the finishing save
    carries the last result. Seconds are the run's practising seconds on that
    puzzle (`run.pzSec`, same `Activity.current()` rule as the total), not the
    wall clock. A list puzzle that comes back appears twice (✗ then ✓).
    Bundled with the existing saves (`addResults` → `arrayUnion`; also every 5
    results). Caps `MAX_HW_RESULTS` 300 / `MAX_HW_RESULTS_CHARS` 120,000 —
    past them detail stops, the count goes on. **If a save with results is
    refused, `saveHomeworkProgress` retries once without them** (cap filled by
    a second phone, or stage 6 rules not deployed yet): the count is never
    lost for the sake of the detail.
  - **Rules:** `results` joins the student's allowed diff. `hwResultsOk`:
    kinds puzzles/list only, list of 1–300, the OLD list must be a PREFIX of
    the new one (no drop, no reorder — auditor finding, fixed; an empty range
    errors in rules, hence the `size() == 0` arm), and **the list is JOINED
    with ';' and matched ONCE** against `(entry;)*entry` — a handful of
    expressions for any length, so 300 fit the 1,000-expression limit; joined
    size ≤ 120,000 bounds the document far under 1 MB. Create still refuses
    the field. **Emulator-proven only**: production's regex engine has not
    seen a 100 KB match yet — the retry above is the safety net.
  - **Tests:** `tests/rules/homework.test.js` 57 → 68; **313/313** total;
    `test:tree` 15/15. Auditor 5/5 after the prefix fix.
  - **Teacher view:** `Students.resultsSheet(h, p)` — "Results" button on
    every puzzles/list row of the student page, and from the strip. Totals
    (first try, missed, accuracy, average time), every attempt in order with
    ✓/✗, rating, two themes, time; a line opens the position in
    `PuzzleLog.show()` (the log's replay, split out of `review()`;
    `PuzzleLog` is now exported). Old homework → "No detail recorded";
    text/chapter → "no puzzles to show".
  - **Verified** (`tools/stu6-seed.js` + `tools/cdp-verify-students6.mjs`,
    headless CDP, 375px, EN/ES × light/dark, 0 console errors): **REALLY
    PLAYED** through `Puzzles.userMove`: a 3-puzzle homework — right, wrong +
    skipped, wrong + then solved, right, right → done 3/3, status done,
    results ✓ ✗ ✗ ✓ ✓ with 3–6 s each, total 28 s; a 3-puzzle list — #1 wrong
    and left, #2 ✓, #3 ✓, #1 came back ✓ → 4 results; the teacher sheet drawn
    from those played results (60 %, rows, position opens); the strip line →
    sheet → line gone; Clear → strip hidden, dot off; `checkFinished` did not
    run with no students, ran with one, and the second call was throttled;
    offline boot serves v119 and the sheet + position open offline.
    **SEEDED:** every Firestore-backed thing — the links, the homework, the
    two strip lines, the 14-attempt results in the screenshots, the old
    homework without results. The played results reached the teacher sheet
    inside one page, not through Firestore. The query itself is covered by
    the rules test only. **No two-account flow ran live** (App Check), and
    the seed stubs `Students.load` (it would wipe the seed on screen entry).

- **STUDENTS STAGE 5 — HOMEWORK PART 2: CHAPTERS + PUZZLE LISTS
  (2026-09-30).** Committed on `main`, NOT pushed. **RULES CHANGED: Adrian
  must run `npm.cmd run rules:deploy` BEFORE `git push`.** Stage 4's rules
  were never deployed either (Adrian confirmed) — this ONE deploy covers
  stages 4 and 5. `sw.js` v116 → **v117**. **The Students plan is complete**
  (stage 5 was its last stage; `list` was NOT split off).
  - **Rules** (`homework` block): kinds now `puzzles|text|chapter|list`.
    `chapter` params exactly `{mcId, chapterId}`, both `[A-Za-z0-9_-]{1,128}`
    (auditor: a `/` would re-aim the lookup), and `hwChapterOk` requires the
    class to be OWNED by the teacher and the chapter to exist (2 reads, chapter
    kind only). `list` = `{puzzles: 1–20 PACKED STRINGS}`
    `id|fen|uci uci…|rating|theme theme…`, one regex per puzzle (`hwPzOk`).
    **Why strings, not maps:** measured in the emulator, every field read of a
    list element costs ~12 of the 1,000 expressions a write may evaluate; a
    map with its 5 fields checked failed at FIVE puzzles. The regex is 2 reads
    and stricter (every move UCI, every theme a word). All 30,000 library
    puzzles pack. Target: chapter 1, list = `puzzles.size()`. Update diff adds
    `doneIds`: list only, `hwDoneIdsOk` (≤ 20 short strings), ≤ list length,
    only grows (`hasAll(old)`), keyed on the DIFF so `deleteField()` cannot
    shrink it (auditor). Deliberately NOT tied to `done` (two phones).
  - **Tests:** `tests/rules/homework.test.js` 38 → 57; **302/302** total.
    Includes 20 of the LONGEST legal puzzles fitting the expression budget.
    Auditor: 4/5 → both findings fixed and tested.
  - **`js/firebase.js`:** `MAX_LIST_PUZZLES` (20), `packPuzzle` /
    `unpackPuzzle` (same regex as the rule), `ensureViewer(mcId, uid,
    memberCount)` → 'member' | 'added' | 'full' | 'failed' (1 read; adds as
    viewer + bumps memberCount; refuses at MAX_MEMBERS 30 instead of going to
    31), `saveHomeworkProgress(…, addIds)` → `arrayUnion`.
  - **Chapter:** assign sheet tab "📖 Chapter" = my OWNED classes → chapters
    (`<select>`s; reuses `Masterclass.chapters` when that class is open, else
    `fetchChapters`). Sending calls `ensureViewer` first. Student card "Open"
    → `Masterclass.openForHomework(mcId, chapterId)` ('ok'|'gone'|'failed'),
    which opens the class, then the chapter, and **rewinds to the start**
    (`Analysis.loadTree` lands on the END — a naive hook counted on open).
    The run is armed only after that. `Masterclass.onBoardChange` (the
    `Analysis.refresh` choke point) calls `Students.hwChapterStep`, which
    finishes it at the last move of the MAIN line (`atMainLineEnd`: no
    children and every node is `children[0]`; a variation's end does not
    count). 'gone' → `hwGone` → card says "This chapter is no longer
    available" + Mark done (rules allow it: target 1, no class lookup).
  - **List (Adrian's choice: collect, then send):** PuzzleLog review shows
    "🎯 Give to a student" when I have an active student →
    `Students.addToDraft(p)` (student sheet if > 1). Duplicates and > 20 are
    refused, and nothing is written. The draft is `hwDraft` in `studentsCache`
    (this phone only). The student page shows "🎯 Send puzzle list (n)"; the
    sheet's "🎯 List" tab lists the draft with Remove. Sending clears it.
    Runner = Puzzles homework mode with `hw.list` + `hw.doneIds`: `pool()` is
    the list, `hwMatches` is by id and not yet done, and `nextPuzzle` takes the
    next unsolved one in the teacher's order (wrapping, so a missed first try
    comes back). The same first-try hook → `hwSolved` also records the id.
  - **Also fixed:** `Puzzles.ensureLoaded()` now shares one in-flight load
    (`loading` / `loadOnce`). `showScreen('puzzles')` and `startHomework`
    both started a load, which ran two `nextPuzzle()`s and made a list skip
    its first puzzle.
  - `hwBegin`/`hwEnd`/`hwOnTask` generalise the run (puzzles, list and
    chapter). Seconds count while on the task and `Activity.current()` is set.
  - **Verified:** `test:rules` 302/302, `test:tree` 15/15. Headless CDP
    (`tools/stu5-seed.js` + `tools/cdp-verify-students5.mjs`), 375px, EN/ES ×
    light/dark: the student's chapter/list/gone cards, the teacher page +
    Send list, the assign sheet's Chapter and List tabs, and the list runner
    bar. **REAL:** a list puzzle solved through `Puzzles.userMove` → 1/3 +
    doneIds; the next puzzle is list #2; Give to a student from the log review
    → draft 2→3, again → "already in their list"; the chapter stepped with
    Analysis's own ▶/⏮/⏭ buttons: open → not counted, ▶ → not counted, a
    variation's end → not counted, main-line end → done + toast + run cleared;
    both sheet specs read from their promises. **SEEDED:** all
    Firestore-backed state (homework, classes, chapters, draft). The open step
    ran `openForHomework`, which honestly returned 'failed' with no Firebase
    user, and then its post-network half was replayed. No two-account flow ran
    live (App Check). 0 console errors; offline boot serves v117.

- **STUDENTS STAGE 4 — HOMEWORK PART 1 (2026-09-30).** Committed on `main`,
  NOT pushed. **RULES CHANGED: Adrian must run `npm.cmd run rules:deploy`
  BEFORE `git push`** — without the homework rules every assign/save is
  refused. `sw.js` v115 → **v116**.
  - **Rules** (`firestore.rules`, end of the Students block): `homework/{id}`.
    Create = teacher only, `get(coaching/{me}_{student}).status == 'active'`,
    kinds `puzzles` {themes ≤ 5 strings ≤ 40, minRating ≤ maxRating in
    0–4000, count int 1–100} and `text` {} ONLY (`chapter`/`list` refused
    until stage 5 adds their clauses), title 1–80, note ≤ 500, dueDate
    `YYYY-MM-DD`, starts open/0/0, `createdAt == request.time`. Update =
    student only, `diff().affectedKeys()` ⊆ done/seconds/status/completedAt,
    counters only go up (the app sends `increment()`, so two phones add up),
    done ≤ target, seconds ≤ 360000, 'done' only when the target is reached
    exactly and never reopened, `completedAt == request.time` exactly once.
    Delete = teacher always; student only when the link is not active
    (`existsAfter`/`getAfter`, so End deletes link + homework in ONE batch).
    Read = `.get('teacherUid'|'studentUid','') == me`.
  - **Tests:** new `tests/rules/homework.test.js` (38). **283/283** total.
    `firebase-security-rules-auditor` scored 4/5: fixed its finding (a text
    task could be 'done' with done 0 → `hwTargetReached`); the other finding
    (no rule can cap homework count per student) is the plan's advisory cap.
  - **`js/firebase.js`:** `MAX_OPEN_HOMEWORK` (10, advisory), `HW_COUNTS_KEY`
    ('hwCounts' kv → the summary's `hwOpen`/`hwDone`, totals across ALL the
    student's teachers — one summary doc), `assignHomework`,
    `fetchHomeworkFor(studentUid)`, `fetchMyHomework`, `deleteHomework`,
    `saveHomeworkProgress(id, {addDone, addSeconds, finish})`.
    `removeStudent` and `endCoaching` now delete that pair's homework in the
    same batch; `blockUser` deletes it both ways; `deleteAccount` deletes
    homework given/received after the links.
  - **Start = "homework mode" on Puzzles (Adrian's choice).**
    `Puzzles.homework` sits on top of `themeFilter`/`difficulty` and never
    writes them: `pool()` = rating band + any of the themes, `nextPuzzle` aims
    at the player's level clamped into the band, `startHomework` loads every
    band the homework spans. Gold bar `#puzzle-hw` (title, n/count, progress,
    Exit) replaces the theme button while it runs. `Puzzles` is now exported.
  - **Counting hook** (plan 3.2): the first-try branch in `Puzzles.userMove`
    (right after `db.kvSet('puzzlesSolved', …)`) calls
    `Students.hwSolved(id)` only in homework mode and only if `hwMatches`.
    Seconds: a 1 s timer while a homework runs counts when Puzzles is on
    screen in homework mode AND `Activity.current() === 'puzzles'`.
    **Bundled saves:** every 5 puzzles, on leaving Puzzles, app hidden /
    pagehide, Exit, completion. Completion → status done, toast, mode exits,
    `hwCounts` + summary publish.
  - **Students screen:** "Homework" section (student) with open cards
    (Start / Continue, or Mark done + an honest "nobody checks it" confirm for
    text) and "Done (n)" folded. Roster card: "📘 Homework: x open · y done"
    + a gold "new" chip when hwDone rose since I last opened that page.
    Student page (teacher): Homework list with progress + time + Delete, and
    ➕ Assign → the assign sheet (Puzzles/Task, count, band defaulted from
    their rating, theme chips weakest-first with their rating, max 5, title
    auto-filled if empty, note, due date). Last list per student cached
    (`hwGiven` in `studentsCache`) so offline shows it.
  - **Gold dot** now also: open homework I haven't seen (cleared when the
    Students screen shows it), and (teacher) a student's hwDone rose — the
    teacher part only lights from cached summaries (teachers still cost 0
    reads at boot). Consent list no longer says "coming soon".
  - **Cost:** a student with a teacher = +1 query at app open (≈1 read per
    homework); a teacher pays only when opening a student page.
  - **Verified:** `npm.cmd run test:rules` 283/283. **Counting hook REAL** in
    the browser pane: a seeded homework (Fork, 1200–1500, count 3; no Firebase
    user so nothing was written), Start → Puzzles in homework mode, 3 matching
    puzzles solved through `Puzzles.userMove` (the board's own onMove path):
    1/3, 2/3, a wrong-first-move puzzle did NOT count, 3/3 finished → mode off,
    bar hidden, theme button back, themeFilter 'random' + difficulty 0
    untouched, 27 s counted, `hwCounts` {open 0, done 1},
    `previewStudentReport()` carried hwOpen 0 / hwDone 1. **Screens SEEDED**
    (`tools/stu4-seed.js` + `tools/cdp-verify-students4.mjs`, headless CDP
    375px, EN/ES × light/dark): homework cards, done list, roster line + new
    chip, teacher list on the student page, assign sheet (puzzles + task),
    Puzzles bar. `<img onerror>` / `<script>` names and notes render as text.
    The assign sheet's output was read from its promise (count 12, 2 themes,
    due date → correct spec; min > max refused). 0 console errors; offline
    boot via CDP serves v116. **No two-account flow ran live** (App Check).
  - **Stage 5 next:** `chapter` + `list` kinds.

- **STUDENTS STAGE 3 — ACTIVE TIME + THE STUDENT PAGE (2026-09-29).**
  Committed on `main`, NOT pushed (`git push` deploys the site). No rules
  change (stage 1 already allowed `activeTime`); stage 1 rules still need
  `npm.cmd run rules:deploy` if not done. `sw.js` v114 → **v115**,
  `js/activity.js` added to `ASSETS`.
  - **New `js/activity.js`** (`Activity`, `AREAS`, `sumActive`, `dayStr`,
    `daysAgo`, `IDLE_MS`): 1 s tick; a second counts only when visible AND
    pointer/key input in the last 120 s AND the screen maps to an area
    (puzzles/rush/blind → puzzles, endgame → endgames, trainer → openings,
    masterclass, analysis/base → analysis, play, read → reading; setup,
    profile, friends, leaderboards, students count nothing). kv `activeTime`
    = `{localDate: {area: seconds}}`, flushed at most once a minute + on
    `visibilitychange: hidden` / `pagehide`, pruned to 60 days. NOT in
    `SYNCED_KEYS`. On an account switch (sign-out wipes kv) the in-memory copy
    is reloaded so old minutes are not written back. Started from `app.js`
    boot: `Activity.init(() => activeScreen)` — activity.js imports nothing
    from app.js.
  - **`Students.tick()`** now samples `Activity.current()` — the stage 2
    `lastInput` listeners and `IDLE_MS` are gone (one idle detector).
    `publish()` and `accept()` call `Activity.flush(true)` first.
  - **Summary:** `buildStudentReport()` (`js/firebase.js`) now sends
    `activeTime`, last 30 days (≤ 30 keys; rules allow 31), whole seconds,
    shape-checked. New export `previewStudentReport()` = the same summary
    built locally, nothing written.
  - **`openEloHistoryModal(hist, titleKey, { share = true })`** in `js/app.js`
    is now exported and takes the history ARRAY; the four Profile callers pass
    `await db.kvGet(key, [])`. Students pass the summary's history with
    `share: false` (the share card says "my record").
  - **Roster card:** "⏱ X of practice this week" line; the whole card is
    tappable (role=button, Enter works) when a summary exists; ⋯ → Remove
    still works (stopPropagation).
  - **Student page** (`Students.openPage`, a modal): name + "updated X ago";
    4 rating tiles, each opens the chart; streak/best/solved/attempts; practice
    time: 7-day and 30-day totals, 14 bars of minutes per day (HTML/CSS, gold,
    student's own dates), 30-day area rows; puzzle themes weakest first, 8 then
    "Show all (n)" — **only themes the app names** (`theme_*` i18n exists):
    `puzzleThemeElo` also rates meta-tags like `endgame`/`short`/`crushing`,
    which were showing as raw keys; Remove student + Close. At 375px it is
    ~1.6 screens of one scroll, charts live behind the tiles (the Profile
    pattern), so no layout decision was needed.
  - **Student's own side:** a gold-outlined row at the top of "My teachers"
    (only with an ACTIVE teacher): "Your practice: X this week — Tap to see
    what your teachers see" → the same page built by `previewStudentReport()`
    with "This is exactly what your teachers see", no Remove. Consent list
    line for minutes no longer says "coming soon" (homework still does).
  - **Verified:** `npm.cmd run test:rules` 245/245. **Activity counting was
    REAL** in the browser pane (Puzzles): a real key press → counted 10 s in
    10 s, kv flushed once then throttled; no input → stopped at exactly 120 s
    after the last input (memory 120, kv 62 from the 1-minute flush). **Hiding
    was SIMULATED** (the pane keeps background tabs 'visible'; overrode
    `visibilityState` + fired the event): kv got the unflushed seconds, counting
    stopped. Profile with input counted nothing; Endgame counted `endgames`.
    `previewStudentReport()` trimmed a 45-day-old day and a junk key.
    **Screens were SEEDED** (`tools/cdp-verify-students3.mjs` + a seed body:
    `Students.load()` first, THEN `Object.assign(Students, …)` + `render()`,
    or load() wipes the seed with empty lists) and shot in headless CDP at
    375px, EN/ES × light/dark: roster with minutes, student page top/bottom,
    Show all, chart from the student's history (no Share), own view.
    `<img onerror>` name renders as text. Profile chart still opens from kv
    (with Share). Offline boot via CDP: SW v115 serves, `Activity.loaded`,
    0 console errors.
  - **Stage 4 next:** homework rules + tests, `puzzles`/`text` kinds.

- **STUDENTS STAGE 2 — THE STUDENTS SCREEN (2026-09-29).** Committed on
  `main`, NOT pushed (`git push` deploys the site). **Stage 1 rules must be
  deployed first** (`npm.cmd run rules:deploy`) or every action on the screen
  is refused. No rules change this stage. `sw.js` v113 → **v114**.
  - **New `js/students.js`** (`Students`): 9th drawer entry
    `data-screen="students"` after Read (`SCREENS`, `MENU_AREA`, `TAB_ORDER`
    pick it up); `#screen-students` in `index.html`. Sections: **My teachers**
    (only when I have a link as student: pending invite card with the full
    consent list — 6 items incl. minutes/homework marked "coming soon" + a
    "Never: …" line + "you can end it any time" — Accept/Decline; active →
    End; declined → Clear) and **My students** (always: `n/30` cap counter,
    ➕ Invite (friends picker, Masterclass-picker shape, chips for
    student/invited/declined), 🎓 My Masterclasses → Bases tab, roster cards
    with 4 ratings + puzzle ▲/▼ 7-day change from `puzzleEloHistory` + streak /
    solved / "updated X ago", ⋯ → Remove student; pending → Withdraw; declined →
    note only, rules refuse the teacher deleting it). Every destructive action
    and Decline go through `askConfirm`, names escaped. Signed out: one line +
    sign-in button (`openAuthModal` is now exported from `js/app.js`).
  - **Consent list fit at 375px** (≈290 px tall), so nothing was cut and no
    decision was needed.
  - **Invites** always toast "Invitation sent ✓", whatever `inviteStudent`
    throws (not friends / blocked). Accept only via `acceptTeacher` (the one
    batch); `max-teachers` → readable toast.
  - **Publishing:** accept (the batch), app open when the cached lists say I
    have an active teacher (fetches my teacher links once and passes them to
    `publishStudentReport(links)` — new optional param, saves a query), then
    every 15 min of practice (30 s tick; counts only while visible AND touched
    in the last 2 min; area-blind until stage 3's `js/activity.js`).
  - **Cost deviation from the plan, on purpose:** a user with NO links is
    still asked for a pending invite once per **6 hours** (1 read when empty),
    so the gold dot can appear without opening the screen. The plan's "0 extra
    reads" would mean an invite is invisible until the student happens to open
    Students. Teachers cost nothing at boot; the roster loads on open.
  - **Gold dot** (`.has-dot`) on the drawer entry AND on ☰ when an invite waits
    for my answer. Homework dots are stage 4.
  - **Offline:** cached lists (kv key `studentsCache`, keyed to the uid; also
    the has-teacher/has-students flag) with "Offline — showing saved data";
    every action is refused with a toast instead of being queued. Sign-out
    already wipes the whole kv store (`db.clearSyncedProfileData`), and
    `Students.onAuth` resets memory + the dot.
  - **`blockUser()`** now quietly deletes `coaching/{me}_{them}` and
    `coaching/{them}_{me}` (a declined link where I'm teacher stays — rules),
    then `publishStudentReport()` to prune the summary.
  - Limits sheet: "Students per teacher 30", "Teachers per student 3",
    imported `MAX_STUDENTS`/`MAX_TEACHERS`. EN + ES strings (`stu_*`,
    `tab_students`, `cap_students`, `cap_teachers`).
  - **Verified:** `npm.cmd run test:rules` 245/245. Browser pane 375px, light
    AND dark, EN AND ES. **Signed-out line, drawer, Limits rows, offline boot
    = real. Everything signed-in was SEEDED** (`Object.assign(Students, …)` +
    `render()` via `import('/js/students.js')`): pending/active/declined on
    both sides, a `<img onerror>` name (renders as text, also in the confirm),
    the picker, Withdraw/Remove confirms, offline banner + refused Accept, the
    kv cache round-trip. The Invite toast was exercised with no Firebase user,
    so no write happened. **No two-account flow has run live** — localhost
    cannot reach Firestore (App Check); the writes are proven by the stage 1
    emulator tests. Offline boot via headless CDP: SW v114 serves the app,
    only the expected App Check network error.
  - **Stage 3 next:** `js/activity.js`, minutes on the card, student page.

- **STUDENTS STAGE 1 — CONSENT RULES + DATA LAYER, NO UI (2026-09-29).**
  Committed on `main`, NOT pushed, **rules NOT deployed** — Adrian runs
  `npm.cmd run rules:deploy` (harmless without UI). No `sw.js` bump (no new
  file, nothing visible). Changed `firestore.rules` (new "Students" block),
  `js/firebase.js`, new `tests/rules/students.test.js`.
  - **Rules.** `coaching/{teacherUid}_{studentUid}`: read via
    `.get('teacherUid','')`/`.get('studentUid','')` (list-query trap); create =
    teacher only, `pending`, directional id, friends only
    (`friendPairWith()` computes the sorted pair), silent block check,
    `createdAt == request.time`; update = student only, pending → active |
    declined once, diff limited to `status`+`respondedAt`; delete = student any
    status, teacher only pending/active (never declined).
    `studentReports/{studentUid}`: read = student or `me() in
    .get('teachers',[])`; write = student only, field allowlist (no
    name/DOB/email), `teachers` ≤ 3, no duplicates, each checked by
    `linkActiveAfter()` (**getAfter**, so accept = one batch works), bounds on
    ratings/strings/histories (≤120)/counters, `activeTime` ≤ 31 keys and
    `puzzleThemeElo` ≤ 200 keys (auditor finding, fixed), `hwOpen`/`hwDone`
    0–1000 already allowed for stages 3/4. Emulator quirk: `getAfter()` on a
    missing doc ERRORS (denies) rather than returning null.
  - **Data layer (`js/firebase.js`, nothing calls it yet):** `MAX_STUDENTS`
    30 (advisory), `MAX_TEACHERS` 3 (rules-enforced), `inviteStudent`,
    `withdrawInvite` (= `removeStudent`), `removeStudent`,
    `fetchMyStudentLinks`, `fetchMyTeacherLinks`, `acceptTeacher` (one batch;
    throws `code: 'max-teachers'`), `declineTeacher`, `endCoaching` (one batch:
    delete link + prune/delete summary), `publishStudentReport` (rebuilds
    teachers from ACTIVE links, deletes the summary when none), 
    `fetchStudentReports` (one array-contains query). Internal helpers
    `buildStudentReport` (last 120 history entries, `puzzlesSolvedCount` only),
    `activeTeacherUids`. `Auth.deleteAccount()` now also deletes
    `studentReports/{me}` and every coaching link (declined links where I am
    teacher are refused by design and skipped with a warning).
  - **Verified:** `npm.cmd run test:rules` 245/245 pass (students 71, all
    other suites unchanged). App boots online and offline (SW) with no
    `js/firebase.js` errors. **The data-layer functions are proven by the
    emulator tests of the writes they make, not live** — localhost cannot
    reach Firestore (App Check). No screenshots: nothing visible changed.
  - **Owed to stage 2:** `blockUser()` must also end coaching links (plan 3.5;
    the rules do not), sign-out clears the local "has teacher/students" flag.

- **STUDENTS TAB — PLAN ONLY, NOTHING BUILT (2026-09-29).** Staged plan at
  `docs/plans/2026-09-29-students.md`; no feature code, no rules change, no
  `sw.js` bump. Decided with Adrian: a NEW directional link
  `coaching/{teacherUid}_{studentUid}` (pending → active/declined, invite
  friends only, block-silent), a student-written summary
  `studentReports/{studentUid}` readable only by the ≤ 3 teachers listed in it
  (rules check each has an ACTIVE link via `getAfter()`), and `homework/{id}`
  (4 kinds) in stage 4. Masterclass is reused for chapters and the live board, not
  duplicated. Masterclass covers about a third of the ask, not 80%: it has no
  consent step (owners add friends without a yes), no progress view and no
  homework. 9th drawer entry `data-screen="students"` after `read`. Caps 30
  students (advisory) / 3 teachers (rules-enforced). Active-time tracking is
  new (`js/activity.js`, local key `activeTime`, deliberately NOT in
  `SYNCED_KEYS`); the app stored no time before. Free-tier cost ≈ 40 reads per
  teacher open with 20 students; 0 extra for users without teachers/students.
  No push (Spark plan): students see homework on next open. **Next: stage 1**
  (consent rules + tests + `js/firebase.js` data layer, no UI).

- **"OPEN WITH" STILL FAILED ON ADRIAN'S PHONE — CAUSE: BRAVE IS HIS DEFAULT
  BROWSER (2026-09-30).** `sw.js` v117 → **v118**. Web side committed on
  `main` (NOT pushed). No Android change yet.
  - **Facts from Adrian:** Play shows 1.0.5 (code 7) live; phone App info says
    1.0.5; files come from **WhatsApp**; one CTC entry in the lists; Share →
    CTC opens the app and shows a failure toast (so the share-target POST DID
    reach the service worker and redirect to `?shared=1`, but no file was
    stashed); **default browser = Brave**.
  - **Why it passes on the emulator and fails on the phone:** the helper
    (`androidbrowserhelper` 2.6.2) runs the TWA in the *default* browser when
    it supports TWAs. Emulator = Chrome 150 → works cold AND warm (re-tested
    today through the Files app UI: PDF → Read, PGN → base "OpenWithLines";
    Chrome gets the share as `START_DELIVERED_TO_TOP`). Phone = Brave → the
    share arrives without its file. The AAB was checked: the
    LauncherActivity patch and the octet-stream filter ARE in the uploaded
    build, so it is not a stale build.
  - **Not yet confirmed on the phone.** The test: set Chrome as default
    browser, force-stop CTC, share/open a PDF from WhatsApp. Works → Brave
    confirmed; the fix is to pin the TWA provider to Chrome in
    `LauncherActivity` (override `createTwaLauncher()`, pass
    `com.android.chrome` when installed) → 1.0.6 / code 8, same keystore.
    **Caveat:** in Brave the app's local storage (IndexedDB, un-synced
    progress, sign-in) lives in Brave's profile; pinning to Chrome starts
    from Chrome's profile — decide with Adrian first.
  - **Web hardening (done):** `handleIncomingFiles()` `?open-file=1` no
    longer jumps to Read. It stays where boot lands (Analysis), shows
    `share_receiving`, and after 2.5 s with no file shows `share_open_failed`
    for 6 s. `routeIncomingFile` still picks the screen when a file arrives.
  - **Verified:** `node tools/cdp-verify-share.mjs http://localhost:9182`
    (new dev tool; fixture `tools/fixtures/TestBook.pdf`) — headless Chrome
    375px, EN/ES × light/dark: open-file with no file (no Read trap, toasts),
    shared PDF → Read, PGN → base, octet-stream PGN → base, junk →
    `share_unsupported`, offline boot, no console errors: **34/34 PASS**.
    Emulator (Chrome) Open-with warm: PDF + PGN OK. **Nothing verified in
    Brave** (the emulator has no Google account for the Play Store).
  - **UPDATE same day — BRAVE THEORY DISPROVED.** Adrian set Chrome as
    default, force-stopped CTC, opened from WhatsApp: **still fails in
    Chrome too.** He also declined pinning to Chrome (keep Brave). So do NOT
    implement the `createTwaLauncher()` Chrome pin. Remaining difference
    between emulator (works) and phone (fails): the file *source* — emulator
    tests used the Files app, the phone uses WhatsApp (its own FileProvider
    URIs + grants), plus phone vendor/Android version. Toast = the POST
    reached the SW with no file → Chrome most likely could not read the
    content:// URI (grant not passed on) or dropped it. Next step: real
    phone over USB, `adb logcat` while sharing from WhatsApp; also compare
    sharing the same PDF from the phone's Files app.
  - **ROOT CAUSE FOUND (same day): `assetlinks.json` LACKED THE PLAY APP
    SIGNING KEY.** Sharing from Samsung "My Files" failed too (not
    WhatsApp), and Adrian confirmed CTC on the phone shows a **web address
    bar** = the TWA is NOT verified. `.well-known/assetlinks.json` listed
    only the upload key (`4D:50:F8…`, the local keystore — what the
    emulator build is signed with, hence "works on emulator"). Play re-signs
    the store build with Google's app signing key
    (`AC:D4:2E:68:11:44:E2:B2:9A:B8:8D:42:FF:7A:6A:30:75:3B:6A:87:76:63:0C:E5:DC:97:95:79:1E:ED:53:FC`,
    from Play Console → App integrity → Play app signing). An unverified
    TWA is a plain Custom Tab, so the browser drops the shared file.
    **Fix: both fingerprints now in `assetlinks.json`** (web-only, no new
    AAB, stays 1.0.5 / code 7). Keep BOTH — the upload key is needed for
    emulator/sideloaded builds. Verified: live file returns both
    fingerprints. **NOT yet verified on the phone** — Adrian must
    force-stop CTC (and maybe clear the browser's cache / wait: browsers
    cache the asset-links check) and confirm the address bar is gone and
    Share / Open with works. The address bar must have been there on every
    Play install since launch.
  - **CORRECTION (same day): the `AC:D4…` fingerprint was the
    POST-QUANTUM app signing key.** Play Console now shows two app signing
    keys; phones verify against the **classical** one:
    `CD:C1:9C:AD:D3:64:0C:7F:47:0B:C6:B5:E3:9B:A4:03:F3:84:86:BF:77:10:AF:10:BC:5B:B9:9E:9D:3C:FD:D0`.
    `assetlinks.json` now lists all three (upload `4D:50…`, classical
    `CD:C1…`, post-quantum `AC:D4…`). Phone confirmation still pending.
  - **SECOND CORRECTION (same day): address bar still there with those
    three.** The current app signing key shows "Install base 0.0%"; the
    Play page's own **Digital Asset Links JSON** box gives a FOURTH
    fingerprint — the one Google says to use (presumably the original
    signing key from 26 Jul 2026, still first in the rotation lineage):
    `31:65:2A:79:91:5C:30:D8:29:54:2D:C6:FA:9C:0F:88:FE:4E:24:E6:16:A5:F3:16:9F:A0:94:1B:3D:F6:C3:AB`
    (confirmed against Adrian's pasted text). Now in
    `assetlinks.json` with the other three. **Lesson: take the fingerprint
    from the "Digital Asset Links JSON" box, not the key tiles.**
  - **CONFIRMED ON ADRIAN'S PHONE (2026-09-30): "perfect. now is
    working"** after the `31:65…` fingerprint went live (Play build 1.0.5,
    Brave as default browser). Basis: his report; he did not itemise
    address bar / PDF / PGN separately. **CLOSED.** No Android change, no
    new AAB, `LauncherActivity` untouched, no Chrome pin. Only
    `.well-known/assetlinks.json` changed (4 fingerprints: upload `4D:50…`,
    Play snippet `31:65…`, classical `CD:C1…`, post-quantum `AC:D4…`).

- **"OPEN WITH" / SHARE A PDF OR PGN FROM ANOTHER APP NOW REACHES CTC
  (2026-09-29).** `sw.js` v112 → **v113**. Web side committed on `main` (NOT
  pushed); Android side is TWA **1.0.5 (versionCode 7)**, built and signed but
  not yet on Adrian's phone. Three root causes, all fixed:
  - **The service worker never cached network responses.** Both fetch branches
    in `sw.js` did `caches.open(CACHE).then(c => c.put(req, res.clone()))` —
    the clone ran after the page had already consumed the body ("Response body
    is already used"), so every put failed silently. Now `res.clone()` is taken
    synchronously before `return res`, in both the cache-first and the
    network-first branch.
  - **Files were judged by name/MIME, which lie.** Many apps send a `.pgn` as
    `application/octet-stream` or with a junk name. `routeIncomingFile()` in
    `js/app.js` now sniffs the first 4 KB: `%PDF-` in the first 1 KB → PDF;
    otherwise, if there are no NUL bytes, a PGN tag (`[Event "…"]`) or move text
    (`1. e4`) → PGN; anything else → refused with `share_unsupported`.
    `manifest.webmanifest` `share_target` accept gains
    `application/octet-stream` (share target ONLY — not `file_handlers`, so CTC
    doesn't offer to open every unknown file).
  - **"Open with" never delivered the file.** In a TWA on Chrome 150,
    `launchQueue` does NOT receive files (the claim further down that it might
    is wrong). Fix is in the Android project `C:\Users\Adrian\chess-app-android`
    (NOT a git repo): `app/src/main/java/com/chesstrainingcenter/app/LauncherActivity.java`
    rewrites an incoming `ACTION_VIEW` intent into `ACTION_SEND` with the URI as
    `EXTRA_STREAM` (`setIntent(share)`), so it goes through the share-target
    POST that already works. `octet-stream` added to the SEND intent filter and
    the `shareTarget` resValue; `twa-manifest.json` synced; version 1.0.5 / 7.
    **minSdkVersion raised 21 → 24** (`app/build.gradle` + `twa-manifest.json`):
    Play Console rejected the first 1.0.5 AAB — "Play automatic protection
    requires a minimum SDK version of 24". Rebuilt as the same 1.0.5 / code 7
    (the rejected upload never consumed the code).
    Signed with the same keystore (fingerprint checked). New outputs
    `app-release-signed.apk` / `app-release-bundle.aab`; the old ones kept as
    `*-1.0.4.*`.
  - **⚠ NEVER run `bubblewrap update` without re-applying the
    LauncherActivity patch** (and the octet-stream filter). Bubblewrap
    regenerates the Java and the Android manifest from `twa-manifest.json` and
    will silently wipe it — "Open with" goes back to landing on an empty Read
    shelf.
  - **Verified:** Android emulator (Chrome 150) — "Open with" a PDF → Read
    shelf; a PGN → new base "OpenWithLines"; an octet-stream file is offered
    in the share sheet. Headless CDP at 375px, EN/ES, light/dark: 19/19 PASS,
    including offline boot.
  - **Not verified / limits:** no test on Adrian's real phone yet. iOS has no
    share target at all. App Check 403s in the console are expected.

- **STUDENTS SEE THE TEACHER'S ARROWS DURING A LIVE MASTERCLASS
  (2026-09-29).** `sw.js` v111 → **v112**. Changed `firestore.rules`,
  `js/masterclass.js`, `js/board.js`, `js/firebase.js`, `js/app.js`,
  `tests/rules/masterclass.test.js`. Committed, NOT pushed. **The rules must
  be deployed separately (`npm.cmd run rules:deploy`)** — until they are,
  every broadcast write carries a field the live rule refuses, so the WHOLE
  live board (moves too, not just arrows) stops reaching students.
  - **Payload.** One new field on `masterclasses/{id}/live/state`:
    `shapes: {a, s}`, two strings packed by `packShapes()` in
    `js/masterclass.js` — `a` is colour letter + from + to per arrow
    (`"Ge2e4Rd7d5"`), `s` colour letter + square (`"Yd4"`), no separators.
    Colours G/Y/R = the board's green/yellow/red. `unpackShapes()` reverses it
    and drops anything malformed. Rides the existing 1 write/s throttle in
    `pushLiveState()`; no second writer, no second document.
  - **Rules.** `shapes` added to the `hasOnly` list; optional (a client cached
    from before this still writes without it); when present it must be a map
    with exactly keys `a` and `s`, each matching
    `([GYR][a-h][1-8][a-h][1-8]){0,32}` / `([GYR][a-h][1-8]){0,32}` — the regex
    IS the 32 + 32 cap. Client cuts at the same 32 (`SHAPE_CAP`). Delete rule
    untouched. Rules tests 48–52 added (owner writes empty/full-to-cap; viewer
    refused; 33 arrows or 33 squares refused; 9 wrong-typed/malformed payloads
    refused; delete still works) — full suite passes, 0 failures.
  - **Teacher side.** `Masterclass.onBoardChange()` now sends
    `packShapes(tree.current.shapes)`. Drawing does not pass through
    `Analysis.refresh()`, so the board's `onShapesChange` (Analysis.init in
    `js/app.js`) also calls `onBoardChange()` — which still returns at once
    unless I own the class AND am broadcasting. Shapes are per-move, as
    before, so moving on sends that move's shapes (usually none) and clears
    the class's.
  - **Student side — kept SEPARATE from the student's own drawing.** New
    `board.liveShapes` + `setLiveShapes()` in `js/board.js`, painted by the
    existing `_renderShapes()` under the student's own `this.shapes`; the
    toggles never touch it, so an incoming update cannot wipe what the student
    drew. `Masterclass.liveShapesFor(tree)` returns the teacher's shapes only
    when following AND the board's FEN equals the teacher's `st.fen` (browse to
    another move → hidden; come back → shown). `Analysis.refresh()` calls it;
    `paintLiveShapes()` repaints on snapshot, Stop/Resume following and
    `closeLive()`.
  - **The liveKey trap.** `liveKey()` is unchanged (position only). A separate
    `shapesKey()` comparison in `onLiveSnapshot()` repaints on a shapes-only
    change WITHOUT re-running `applyLive()` / `gotoLine()` / the engine.
  - **Verified over CDP (headless Chrome, own static server), 375px, EN/ES ×
    light/dark, 60/60,** by calling `Masterclass.onLiveSnapshot()` directly —
    the real Firestore listener cannot run from localhost (App Check). Seeded
    a viewer class + one chapter. Checked: shapes paint; student's own arrow
    coexists and survives a teacher update; shapes-only change applies with
    zero `applyLive()` calls; a snapshot with no `shapes` clears; move +
    shapes moves and paints; browsing away hides/back shows; Stop/Resume
    following clears/restores; cached null keeps them, server null clears;
    owner drawing while not broadcasting leaves the live state alone; pack cap
    32 + bad colours/squares dropped; scrollWidth 375. **Not tried with a real
    teacher and student over Firestore.** Script was scratch, not committed.

- **YOU CAN CHOOSE THE PUZZLE-RADAR THEMES FROM SOMEONE ELSE'S PROFILE
  (2026-09-29).** `sw.js` v110 → **v111**. Changed `index.html`, `js/app.js`,
  `js/leaderboard.js`. Committed, NOT pushed.
  - **What.** New `#pubprofile-radar-pick` button ("⚙ Themes"/"⚙ Temas", key
    `radar_choose`) beside the "Puzzles by theme" heading on the public
    profile, same markup as `#radar-pick` on my own profile. It sits inside a
    `.pubprofile-detail` card, so a charts-off (private) friend never shows it.
  - **How.** `openRadarPicker(onSave)` in `js/app.js` is now **exported** and
    takes an optional callback, called after `Profile.refresh()` on Apply.
    `PublicProfile` (`js/leaderboard.js`) keeps the friend's `themeElo` from
    the last `open()` and has `drawPuzzleRadar()`, which both `open()` and the
    picker's callback use — the chart redraws in place, no screen change.
  - **One shared selection** (`kv 'radarThemes'`) for my chart and everyone
    else's, as before; the UI says nothing about it. Unrated theme → 1200.
  - **Verified over CDP, 375px, EN/ES × light/dark, 36/36**, with a SEEDED
    friend (fake entry passed to `PublicProfile.open()`; Firestore not
    reachable from localhost): button visible for a public friend; cancel
    (backdrop) stores nothing and leaves the chart alone; picker opens at
    13/13 with every unchecked box disabled; Apply redraws the friend's chart
    immediately with the friend's values (unrated = 1200); my own profile's
    puzzle chart shows the same themes after `Profile.refresh()`; a
    `profileVisibility:'private'` friend shows the private note and the
    button is not rendered; scrollWidth 375. Not tried with a real friend
    over Firestore.
  - **Pre-existing, not changed:** at 13 spokes the longest radar labels clip
    at 375px ("Discovered atta…") — same on my own profile. The first-run
    Kael "Welcome" sheet is a modal too, so test scripts must target the
    LAST `.modal-box`, not the first.

- **IMPORTING A PGN FROM THE BASES LIST NO LONGER MAKES YOU INVENT A NAME
  (2026-09-29).** `sw.js` v109 → **v110**. Changed `index.html`, `js/app.js`.
  Committed, NOT pushed. Before this, the only way into the Bases list was
  New → type a name → open the (empty) base → Import — even if all you had
  was a file.
  - **The fix.** New button `base-import-new` ("Import PGN") sits on the
    Bases LIST view (`index.html` inside `#base-list-view`, next to
    `base-new`), wired to its own hidden `<input type=file id=pgn-file-new>`.
    Its `change` handler in `Base.init()` (`js/app.js`, right after the
    existing `pgn-file` listener) enforces `MAX_DATABASES` with the same
    `database_limit_toast`, then does
    `db.createBase(file.name.replace(/\.[^.]+$/, '') || t('my_games'))` →
    `this.openBase(id)` → `this.importFile(file)` — the exact naming/flow
    `routeIncomingFile()` (~line 6699) already uses for a PGN arriving via
    Share or "Open with", just reachable from inside the app too. Zero
    prompts; a colliding name is allowed (base names were never unique;
    Rename is one tap away). `base-new` (empty database, asks for a name)
    and `base-import` (import into an already-open base) are untouched.
  - **Layout.** The new button lives on its own `.row.wrap` line below the
    `Bases N/10` / `New database` header row, not crammed into that row's
    flex slot — two buttons sharing that slot wrapped awkwardly at 375px
    (title floating between two stacked buttons). Matches the pattern the
    open-base view already uses for its `base-actions` row.
  - **Verified over CDP** (Browser pane doesn't composite on this machine —
    see the CDP-fallback note lower in this file) **at 375px, EN/ES ×
    light/dark**: plain import → base named after the file, game inside,
    zero prompts; `My.Games v2.pgn` (dot + space) → base "My.Games v2";
    `GAME.PGN` (capitals) → base "GAME"; seeded to 10 bases then imported →
    same toast (`Limit of 10 databases reached.` / `Límite de 10 bases de
    partidas alcanzado.`), base count unchanged at 10; Rename still renames;
    opening a base and using the OLD `base-import`/`pgn-file` path still adds
    into that same base (game count 1→2, not replaced). Script (a Python
    `websockets` CDP driver + a path-guarded static server) was scratch,
    deleted after the run — not part of this commit.
  - **Not changed.** `base-new`, `base-rename`, `base-import` (open-base
    path), the base-picker sheet's "＋ New base", `chooseBase()`.

- **PUZZLE ELO IS CHARGED AT THE MISTAKE, AND THE CHANGE IS SHOWN (2026-09-11).**
  `sw.js` v108 → **v109**. Changed `js/app.js`, `index.html`, `css/style.css`.
  Committed, NOT pushed. A tester found it: the rating only moved when a puzzle
  *ended*, so after a wrong move you could tap Next and walk away from the loss
  — failing and skipping was the cheapest way to hold a rating.
  - **The fix.** New `Puzzles.markFailed()` (and the same on `Blind`) sets
    `failedThis` and calls `recordResult(false)` straight away. Every route that
    means "no longer a clean solve" goes through it: the wrong-move branch of
    `userMove`, `hint()`, and `showSolution()`. `recordResult` was already
    guarded by `eloRecorded`, so the later `recordResult(!this.failedThis)` on a
    solve is a no-op — a mistake is charged exactly once and solving afterwards
    pays nothing back. `nextPuzzle()`'s `log(false)` is unchanged.
  - **The number on screen.** `recordResult` now records `lastDelta`
    (`Math.round(elo) - Math.round(before)`, so it always matches the badge's
    own rounding). `Puzzles.showEloDelta()` paints new `#puzzle-elo-delta`
    beside the ELO badge — `.elo-delta.up` green, `.down` red, `.flat` muted for
    a 0 — with an `aria-label`; `clearEloDelta()` runs in `loadPuzzle`, so it
    clears with the next puzzle. Shared helper `eloDeltaText(d)`.
  - **The strip below the board.** `PuzzleLog.add(mode, puzzle, solved, delta)`
    stores the delta and each `.plog-dot` shows it instead of its index; the
    position is still in the `title`/`aria-label` (`Puzzle 3 — Missed — Puzzle
    ELO -89`), and tapping still opens the same review. Rush passes no delta (a
    run is scored as one), so those dots keep their numbers. `.plog-dot` went
    from a fixed 22px circle to a `min-width` pill — the first ten rated
    attempts use K=192 and really do produce three-digit swings.
  - **Verified over CDP with real taps, 375px, EN/ES × light/dark, 11/11 each**
    (scratchpad script, deleted). The script identifies the puzzle on the board
    by matching the DOM placement against the live `PUZZLES` export, so it plays
    the real solution: clean solve 1200 → 1280 with a green `+80` on the tab and
    on the dot; wrong move 1280 → 1159 the moment it lands, red `-121`, and
    tapping Next left it at 1159 (charged once) with a red `-121` dot; mistake
    then full solve → no payback; hint → charged at once; solution button →
    charged once, not twice; delta cleared on the next puzzle; `scrollWidth` 375
    with the badge ending at x=365; Blindfold mistake 1200 → 1193 and Next kept
    it. ES dark needed a re-run: the first pass registered no Blindfold move at
    all (test flakiness around the 10s countdown, not app behaviour).
  - **Not changed.** The K values, the theme ELO maths, `Streak.recordActivity()`
    and `DailyMissions` (still win-only), and Rush.

- **TAB SWIPE ALSO WORKS FROM ON TOP OF A BOARD (2026-09-11).** `sw.js` v107 →
  **v108**. `js/app.js` swipe section only. Adrian reported he could not change
  tab when the swipe started on a board: `.board` was in `SWIPE_SAFE`, so every
  board (most of the screen on Analysis / Puzzles / Play) was a dead zone.
  Committed, NOT pushed.
  - **Rule now.** `.board` is out of `SWIPE_SAFE`; new `boardOwnsTouch(el)`
    (called from `swipeBlocked`) keeps the touch for the board only when landing
    there means something, because `board.js` acts on **pointerdown** (`_tap`):
    a `.sq.grabbable` piece; any square while the board has a `.sq.selected`
    (the touch would be a move/reselect) or a `.sq.premove` (any tap cancels
    it); `.board.drawing` / `.board.dragging`; and `#setup-board` (editor taps).
    Everything else — an empty square, a piece that is not yours to move — does
    nothing on the board, so a sideways drag there swipes tabs.
  - **Capture phase.** The swipe `pointerdown` listener is now registered with
    `capture: true` so `boardOwnsTouch` reads `.selected` / `.premove` BEFORE
    board.js's own pointerdown changes them (otherwise a tap-tap move onto an
    empty square would both play the move and start a swipe).
  - **Verified over CDP (`Input.dispatchTouchEvent`), 375px, EN/ES ×
    light/dark, 13/13 each** (scratchpad script, deleted): Analysis empty e4 →
    follows the finger (both sections visible, header unchanged) and lands on
    Endgame with +1 history entry; opponent piece e7 → swipes; own e2 → ghost,
    no swipe; e2 selected then drag from e4 → move `1.e4` played, no swipe;
    `.drawing` → no swipe; a `.premove` square present → no swipe; vertical drag
    from empty d5 (Analysis padded so `<main>` can scroll) → scrolled 417–518px,
    no swipe; Puzzles own piece → ghost, no swipe; Puzzles empty square → Play;
    Play (game started) empty square → Read; Setup editor board → no drag styles
    at all; `scrollWidth` 375 on all tabs (Read 405, known). `.drawing` and
    `.premove` were set by adding the classes by hand, not through the UI.

- **KAEL PARKS IN THE LOWER-RIGHT CORNER AGAIN (2026-09-10).** `sw.js` v106 →
  **v107**. One CSS value: `#kael-corner`'s idle `transform` is back to
  `translateX(34px)` (was `translateX(0)` since `49d29f2` put him in the old
  bottom bar and `c7c7c17` left him fully in place when the bar went). He keeps
  `bottom: calc(12px + safe-area)`; `#kael-corner.speaking` (added/removed in
  `js/app.js` around the quote bubble) still slides him to `translateX(0)` at
  full opacity. No JS changed. Committed, NOT pushed. Verified over CDP, 375px,
  EN/ES × light/dark (scratchpad script, deleted): idle `#kael-fab` spans
  349→397, so a 26px sliver shows, 12px off the bottom, opacity .55, and
  `elementFromPoint` on the sliver hits `#kael-fab`; tapping the sliver adds
  `.speaking` → 315→363, all 48px visible, opacity 1. `scrollWidth` 375 idle
  and on all 8 tabs (Read 405, the known watermark) — the parked FAB adds no
  horizontal scroll.

- **SWIPE BETWEEN TABS FOLLOWS THE FINGER (2026-09-10).** `sw.js` v105 →
  **v106**. Changed `js/app.js` (swipe section only) and `css/style.css`.
  Web-only; **committed, NOT pushed** (nor are `c7c7c17`, `67cac4e`,
  `b3e9295`) — `git push` deploys them all.
  - **Behaviour.** Once a touch drag passes `SWIPE_LOCK` (10px) it picks an
    axis: vertical → handed back to page scrolling; horizontal → the current
    `section#screen-*` follows the finger (`translate3d` in rAF) and the
    neighbouring tab (`neighbourTab(screen, dir)`, drawer order `TAB_ORDER`)
    slides in beside it, one `<main>` width away. Dragging back past the start
    swaps in the other neighbour. Release (`pointerup`): commits if
    |dx| > `SWIPE_COMMIT` (35%) of the width unless flicked back, or on a flick
    > `SWIPE_FLICK` (0.5 px/ms, velocity over the last 100ms only) of at least
    `SWIPE_FLICK_MIN` (30px); otherwise springs back. Both ways animate
    `SWIPE_MS` (250ms) ease-out; `pointercancel` springs back.
  - **How the neighbour is shown without switching.** `paintDrag()` removes
    `.hidden` from only that section and lifts it with inline
    `position: fixed` + `overflow: hidden`, sized to the current section's
    left/width and `<main>`'s visible box (top = main top + padding). Fixed, not
    absolute: making `<main>` a containing block would have moved the Read /
    Leaderboard `img.watermark` (the only ICB-positioned element in `<main>`,
    measured). When `settleDrag()`'s timer ends, `endDrag()` strips the inline
    props (`DRAG_PROPS`) and, on commit, `showScreen(next)` runs **once** and
    `main.scrollTop = 0` in the same task, so the neighbour lands without a
    jump and the history entry, side effects and title all happen as for a menu
    tap. The title changes only then.
  - **Kept.** Pointer events on document (not touch), `SWIPE_SAFE` /
    `swipeBlocked`, the `menuOpen` guard, sub-screens have no neighbour. Edge
    swipe (start ≤ 28px from an edge, moving inward) is still release-decided
    back via `goBackTab()` with the old 60px / 2:1 / 700ms rule, not tracked.
    `prefers-reduced-motion`: no tracked drag, same release rule, instant
    `goAdjacentTab()` → `showScreen`. At the first/last tab and on sub-screens
    the screen rubber-bands (`rubberBand()`, max a third of the width) and
    springs back. New pointerdowns are ignored while `settling` (250ms).
  - **Removed.** `slideScreenIn()` and the `screen-from-right/left` keyframes
    + `.from-right/.from-left` CSS (the old 26px slide-in). The 700ms cut-off
    no longer applies to the tracked drag.
  - **Verified over CDP, 375px, EN/ES × light/dark, 29/29 checks each**
    (scratchpad script, deleted). Input was `Input.dispatchTouchEvent` with touch
    emulation, which goes through Chrome's gesture pipeline: a vertical drag
    natively scrolled `<main>` (~1,350px) and produced a `pointercancel`, and
    forced-overflow strips scrolled natively, so `touch-action` WAS in play here
    (unlike page-synthesised PointerEvents). Still headless, not a phone.
    Checked: mid-drag at 50% both sections visible, header + `history.length`
    unchanged, `scrollWidth` 375; past threshold + release → Endgame/Learn
    (Aprender) lands, title name + SVG = lit tab, +1 history entry, no inline
    styles left; header unchanged while still settling; short drag → back, no
    entry; drag out, across to the other neighbour and back → nothing changed;
    fast 85px flick commits; far drag flicked back springs back; Analysis
    (first), Profile (last), Rush both ways → one section, rubber band 77px,
    springs back; drawer open → ignored; left-edge swipe → back; e2-e4 drag on
    Analysis moves; sideways drag from a grabbable piece on Puzzles and Play
    shows `.drag-ghost` and never swipes; `#hist-chips` / `#puzzle-actions`
    (forced to overflow) scroll and never swipe; `#ana-moves` and
    `#read-stage` (reader unhidden by hand, no book) never swipe; all 8 tabs
    375 after, Read 405 (known watermark). Reduced motion (emulated): no drag
    styles mid-drag, instant switch Endgame → Bases, +1 entry. Performance at
    4× CPU throttle, warm app, dragging toward Analysis / Puzzles / Play:
    frame max 14.6 / 20.9 / 16.8ms, no long animation frames, idle max 15.1ms.
  - **Known, not chased.** While Read is dragged (or is the neighbour) its
    ICB-positioned watermark is re-anchored to the moving section until the
    switch ends — same pre-existing watermark bug. A neighbour never visited
    this session shows whatever its DOM holds before `showScreen`'s loaders
    run (e.g. Puzzles before `ensureLoaded`).

- **MENU MOVED TO THE TOP — LEFT DRAWER + TAB ICON/NAME TITLE (2026-09-10).**
  `sw.js` v104 → **v105**. Changed `index.html`, `css/style.css`, `js/app.js`,
  `js/i18n.js`, `js/tour.js`. Web-only; **committed, NOT pushed** (neither are
  `b3e9295` / `67cac4e` before it) — `git push` deploys all three.
  **Reverses HANDOFFS.md task 2's "bottom sheet, NOT a left drawer — do not
  re-open"**: Adrian changed his mind on 2026-09-10. That line is stale.
  - **What changed.** The bottom bar `#tabmenu` is gone. `#tabmenu-btn` (☰, an
    inline SVG) now sits in `#topbar`'s left corner, where the CTC logo and the
    hard-coded "Chess Training Center" were. `#topbar` is a
    `1fr minmax(0, max-content) 1fr` grid, so `#app-title` (`#app-title-ico` +
    `#app-title-name`) is truly centred between ☰ and streak + ⚙️ and a long
    name ellipsises. `nav#tabbar` is now a full-height drawer, `min(80vw,320px)`,
    sliding in from the left (`translateX(calc(-100% - 48px))` closed, so the
    shadow never peeks). It opens ONLY from the ☰ tap — no edge-drag, on
    purpose (Android back / the app's edge swipe).
  - **Kept exactly, and why it still works.** The eight `#tabbar
    button[data-screen]` are unchanged in order with Profile the LAST button, so
    `TAB_ORDER`, swipe nav, `.on`, the click handlers and the tour targets are
    untouched. `openMenu`/`closeMenu`/`navigateFromMenu`/the `popstate`
    handler were not edited. The bottom group is `hr.drawer-sep`
    (`margin-top:auto`), then `a#menu-limits`, then Profile — Limits moved
    *before* Profile in the DOM, which is safe because it is an `<a>`, not a
    button.
  - **Icons.** All nine `.tab-ico` (8 tabs + Limits) are now hand-drawn inline
    SVG, `currentColor`, stroke 2, round caps/joins — no emoji left in the
    drawer or the title. `updateTabMenu()` (same name, still exported, still
    called by `relabel()`, `Analysis.updateBaseNav()`,
    `Masterclass.lightBasesTab()`) takes the lit button — or the `MENU_AREA`
    fallback button — and copies its label AND `cloneNode`s its SVG into the
    title, so the icon inherits `--text`. Drawer: icon `--muted`, label
    `--text`, lit row gold. New i18n key `menu_open` (Menu/Menú) is the ☰
    button's accessible name.
  - **Two small behaviour additions.** (1) The swipe `pointerdown` listener
    ignores gestures while `menuOpen`, so a horizontal drag over the open
    drawer can't change tabs behind it. (2) `Tour.handleScroll()` uses zero
    safe margins for a target inside `#tabbar`: Profile sits at the drawer's
    foot (bottom 786 of 800), inside the old 72px bottom margin, and the tour
    drew a "Keep scrolling" arrow over the drawer. Seen in a screenshot, fixed,
    re-measured.
  - **Kael** now floats bottom-right over the screen
    (`bottom: calc(12px + safe-area)`), faded .55 at rest; `main`'s
    `padding-bottom` is 72px so the last row scrolls clear. Measured over all 8
    tabs: he covers nothing tappable at scroll-bottom; on Play at scroll-top he
    sits over the lower part of the level list and `#play-start`, which scroll
    clear. `#read-reader`'s `height: calc(100dvh - 120px …)` was left alone —
    it now ends ~62px above the bottom, exactly Kael's corner.
  - **Verified over CDP, 375px, EN/ES × light/dark** (scratchpad script, deleted):
    title name + SVG equal the lit tab on all 8 tabs plus a Base game (Bases),
    a Masterclass chapter (Bases), the leaderboard (Profile/Perfil) and Rush
    (Puzzles), and after a live language switch in Settings; title SVG
    `color`, every shape's computed `stroke` and the name all equal a
    `var(--text)` probe — rgb(245,247,250) dark, rgb(26,32,44) light; zero
    emoji in title and drawer; icon + name group centred to 0px. Drawer sampled
    sliding −348 → 0, 300px wide, lit row gold, visual order ends
    read → divider → Limits → Profile, Profile 14px off the bottom; tap on the
    backdrop closes without navigating. `history.back()` with the drawer open
    closed only the drawer; a tapped destination left exactly one entry (one
    more back returned to the previous tab, menu shut). Guided tour walked with
    real taps: all 7 tab steps ring the button inside the fully open drawer and
    advance. Swipe with drawer open: ignored; closed: Read → Profile.
  - **Not caused by this, do not chase here:** `scrollWidth` is **405** on Read
    and the Leaderboard — `img.watermark` (right edge 405). Measured identical
    on a `git archive HEAD` copy of the pre-change code, so it is the
    pre-existing watermark bug already listed under "Still to do" → layout
    bugs; every other screen is 375.
  - **Stale elsewhere:** HANDOFFS.md task 2 (see above); CLAUDE.md still says
    `js/app.js` is 232 KB (it is ~281 KB). Finger-following swipe between tabs
    was PART 2 — done the same day, see the entry above.

- **PRE-MOVE — THE OTHER FOUR BOARDS MEASURED, NOT ASSUMED (2026-09-07).**
  **No code changed.** No `sw.js` bump, nothing new to deploy. This was a
  verification pass over the four pre-move boards commit `b3e9295` also touches
  but never re-checked: `play-board`, `puzzle-board`, `rush-board`,
  `endgame-board`. They were believed fixed because they share Trainer's code
  shape. They are now measured, and the fix holds on all four.
  - **Why the earlier "drag works" evidence was worthless.** The pre-move
    commit's own run drove drags over CDP, and a CDP-dispatched pointer event
    ignores `touch-action` entirely. A scripted drag therefore succeeds on a
    board where a real finger would be handed to page scrolling. Every claim
    about these four boards rested on that probe.
  - **What was asserted instead — an invariant, not a drag.** For each board:
    the set of `.sq.grabbable` squares, the set of pieces whose computed
    `touchAction === 'none'`, and the set of `.sq` elements with the same, must
    all equal exactly the squares the FEN says are occupied by the side the user
    may move right now. The expected set is read straight off `board.fen` and
    shares no code with `_movableColor()` or `render()` — the things under test.
  - **Sampled at three moments per board**: (a) opponent/engine thinking with
    the pre-move armed — expect the user's own side, not the side to move;
    (b) the instant the opponent's move lands and the board goes live — expect
    the side to move; (c) with a pre-move actually queued through the real
    `_tap()` funnel. **84 assertions, 0 failures**, at 375 px in EN and ES ×
    light and dark. Every board reached all three moments in all four combos.
  - **The harness was proved able to fail before the result was believed.**
    With the re-render branch inside `_syncPremoveClass()` temporarily removed,
    the same run failed 9 of 17 assertions — grabbable and `touch-action` stuck
    on the *opponent's* 16 pieces on Play, on the wrong side in Rush and
    Endgame. `js/board.js` was restored from a byte copy afterwards; `git diff`
    is clean.
  - **Harness facts worth not rediscovering** (the script was a scratchpad
    throwaway and is deliberately not committed — do not build a reusable one):
    the screen objects are not exported, so live `Board` instances are collected
    by wrapping `Board.prototype.render` to record `this` and keying by
    `el.id` — wrap it *permanently and early*, because these boards are built
    lazily on first visit, so the one-shot `setPieceSet(getPieceSet())` trick
    only catches boards that already exist. `board.onMove(mv)` is the way into a
    screen's real `userMove()` without the screen object. Rush allows only three
    strikes, so brute-forcing a puzzle's answer ends the run — identify the
    puzzle instead by matching `board.fen` against `PUZZLES` from
    `/js/puzzles.js` with `moves[0]` applied, then play `moves[1]`. A puzzle
    whose answer is the mate never re-arms, so each pass needs its own puzzle
    with `moves.length >= 4`. `path.join()` on Windows returns backslashes, so a
    static server's `startsWith(ROOT)` guard 404s everything and Chrome shows a
    chrome-error page that looks exactly like the app failing to boot — use
    `path.relative()`.

- **PRE-MOVE — TRAINER + BLIND DRIVEN IN A BROWSER, TWO BUGS FIXED (2026-09-07).**
  `sw.js` bumped v103 → **v104**. Changed `js/board.js`, `js/app.js`. Web-only,
  `git push` deploys it. The pre-move commit below shipped `Trainer` **reasoned
  about but never run**, and left `Blind` opted out but sharing the edited
  `Board`. Driving both over CDP turned up two real defects.
  - **BUG 1 — `.sq.grabbable` was left on the OPPONENT's pieces (`js/board.js`).**
    `.grabbable` is derived from `_movableColor()`, which flips while a pre-move
    is armed. `armPremove()` / `firePremove()` / the `interactive` setter all
    went through `_syncPremoveClass()`, which toggled the board class **and
    nothing else** — no re-render — so the squares kept whatever side the last
    position change had drawn. Measured on `trainer-board` while it was White's
    move and the board was `.live`, the pieces carrying `touch-action: none`
    were `a7,a8,b7,b8,c7,c8,d7,d8,e5,e8,f7,f8,g7,g8,h7,h8` — every one of them
    Black's. **Consequence is phone-only:** `.board.live .sq.grabbable img` is
    what claims the touch gesture, so with it on the wrong pieces the browser
    read a drag of your own piece as a page scroll — both during the pre-move
    window and on your own turn after every computer move. Tap-tap always
    worked, which is what hid it.
    - **This was not Trainer-specific.** Same code shape in `Play`, `Puzzles`,
      `Rush` and `Endgame` practice — one shared cause, fixed once in `Board`.
    - **Why the previous session's run missed it:** CDP-dispatched pointer
      events ignore `touch-action` entirely, so a scripted drag succeeds on a
      board where a real finger would fail. The class list is the only honest
      probe. If you ever verify drag again, assert on
      `getComputedStyle(img).touchAction`, not on whether the drag worked.
    - **Fix:** `_syncPremoveClass()` now re-renders when the pre-move state
      actually flips, tracked in a new field `_premoveWasActive`. Guarded on
      `this.squares` because the constructor sets `interactive` — and so reaches
      `_syncPremoveClass()` — before `_buildSquares()` has run. Do not remove
      that guard, and do not "simplify" it into an unconditional render: the
      setter is called several times per move.
  - **BUG 2 — a pre-move outlived the game it was queued in (`js/app.js`).**
    `$('trainer-back')` did not `clearPremove()`, though `Play`'s back button
    does. Queue a pre-move, press Back, press Start: the abandoned
    `computerMove()` still runs its `finally`, and a guess that happens to be
    legal in the fresh position plays itself as move 1. Reproduced exactly —
    a queued `b1c3` came back as **`1. Nc3 d5` in a brand-new game**. One line
    added to the Back handler; after it, `leftPremove: null` and the new game
    starts empty.
  - **Trainer, all four scenarios green** (375×812, touch emulation, EN **and**
    ES, light **and** dark): a pre-move queued inside the 450 ms **book** reply
    fires (`1. e4 e5 2. Nf3`); one queued during the **engine** reply fires, and
    **by drag** (`3. Bc4`); `gotoHistory` back cancels a queued pre-move
    (`armed`, `premove` and `.premoving` all cleared, engine then replies
    normally); and branching a **variation** from an earlier position fires no
    stale pre-move (`1. d4 d5`). Trainer's two `return`-from-inside-the-`try`
    success paths and its `setLiveInteractive`/`posHistory`/`atLive` machinery
    all behave — no change was needed there.
  - **Blind is untouched and still correctly opted out**: `premoveAllowed`
    false, `.premoving` never appears on `blind-board`, `piecesHidden` holds
    (0 visible pieces before *and* after a move), **no destination dots leak**
    while a hidden piece is selected, and the puzzle's real solution move lands
    through the normal funnel → `"Correct! Keep going."`. Drag on a hidden
    board also still works and leaves no `.drag-ghost` behind.
  - **`learn-board` and `setup-board` re-checked** for the same shared-`Board`
    reason: the lesson practice move grades correctly (`"Correct! 🎉"`,
    grabbable on the side to move), and the Setup **editor** still places a
    piece (`8/8/8/8/3Q4/8/8/8`). Both have `premoveAllowed` false, so the new
    re-render branch is a strict no-op for them — `_premoveActive()` is always
    false, so the state never flips.
  - **No committed harness was added** — a throwaway CDP driver (own static
    server, headless Chrome, `Runtime.evaluate`) did the work and was deleted.
    Two things it needs that are easy to lose: the screen objects are **not**
    exported from `app.js`, so live `Board`s are collected by wrapping
    `Board.prototype.render`, calling `setPieceSet(getPieceSet())` to force
    every board to draw, then unwrapping and keying by `el.id`; and a drag ends
    in `document.elementFromPoint()`, so `.modal-back` must be removed first or
    the onboarding modal swallows the drop.
  - Language is `localStorage['lang']`; colour mode is the IndexedDB kv key
    **`colorMode`** (`'system'|'light'|'dark'`), not `'theme'`. `Blind` is
    reached by the Puzzles tab then `.puzzle-modes button[data-v="blind"]`, and
    it makes you sit through a **10-second memorise countdown** before the board
    goes interactive — budget for it.

- **PRE-MOVE (2026-09-07).** `sw.js` bumped v102 → **v103**. Changed
  `js/board.js`, `js/app.js`, `css/style.css`. Web-only, no Android rebuild —
  `git push` deploys it. No new i18n strings and no new setting: a pre-move is
  self-selecting, you only get one by deliberately moving out of turn.
  - **All of it lives in `Board`**, because one `Board` class serves every tab.
    New state next to `_dragStart`: `premoveAllowed` (opt-in via
    `new Board(el, { premove: true })`), `premoveArmed`, and `premove`
    (`{from,to,promotion}`), kept **separate from `selected`** — `setPosition()`
    nulls `selected`, and outliving the opponent's move is the whole point.
  - New Board API, four methods: `armPremove()` (a screen calls it when it hands
    the turn over), `clearPremove()`, `firePremove()` (called the moment the
    opponent's move has landed and control is back), and the internals
    `_premoveActive()`, `_syncPremoveClass()`, `_movableColor(turn)`,
    `_flippedChess()`.
  - `firePremove()` routes the queued move through the **normal `onMove`
    funnel**, so it is graded, sounded and drawn exactly like a move made by
    hand. Nothing downstream knows it was a pre-move.
  - `_tap()` is still the single funnel for tap **and** drag. In pre-move mode it
    reads the movable side as flipped and generates targets from
    `_flippedChess()` — the FEN with the side-to-move field swapped and the ep
    square dropped. **That position can be genuinely illegal** (the side not to
    move may be giving check) and chess.js throws; the fallback is "no
    destination dots, but the pre-move is still accepted", because
    `firePremove()` re-checks it against the real position anyway.
  - **`.board.premoving` was the trap.** `.sq.grabbable`'s `touch-action: none`
    was scoped to `.board.live`, and a board waiting for the opponent is not
    live — so on a **phone** the drag gesture went to page scrolling and
    pre-move by drag silently did nothing while looking perfect on a desktop.
    `css/style.css:415` now lists `.board.premoving` alongside `.board.live`.
  - **`classList.toggle(name, undefined)` toggles, it does not clear.** The
    constructor sets `interactive` (which calls `_syncPremoveClass()`) *before*
    `premoveAllowed` exists, so an unforced `_premoveActive()` returned
    `undefined` and left `.premoving` stuck on every board. `_premoveActive()`
    is wrapped in `!!` for exactly this. Do not remove it.
  - Promotion is asked **at queue time** (`_askPromotion` inside `_tap`), like
    every other site. The dialog is awaited, so `_tap` re-checks
    `_premoveActive()` after it closes and drops the queue if the opponent moved
    meanwhile.
  - **Wired into five screens, all in `js/app.js`:** `Play` (arm in
    `engineMove`, fire in its `finally` — every success path returns from inside
    the `try`, so after the block is unreachable), `Endgame` practice (arm+fire
    in `playBookReply`, arm in `engineReply` and fire in its `finally`),
    `Puzzles` (arm before the 400 ms `sleep`, fire after
    `setLiveInteractive(true)`), `Rush` (arm before the 300 ms `setTimeout`,
    fire inside it) and `Trainer` (arm in `computerMove`, fire in its
    `finally`). `clearPremove()` on: Play back/undo/`finish`/`begin`,
    `Trainer.gotoHistory`/`finishMsg`, `Puzzles.loadPuzzle`/`gotoHistory`/solve,
    `Rush.loadNext`/`finish`, `Endgame.undo`/`finishPractice`.
  - **Deliberately NOT wired:** `Analysis`, `Setup`, the Masterclass/`learn`
    board, the PuzzleLog mini-boards, and **`Blind`** (blindfold puzzles) — you
    would be aiming at a square you cannot see, in a rated mode.
  - **Decision Adrian made: a wrong pre-move is graded exactly like a real
    move** — puzzle ELO, a Rush strike, a practice mistake. A pre-move that has
    become *illegal* is discarded and graded as nothing, because it never
    happened. The alternative (never penalise) would make pre-move a free extra
    guess and inflate every rating. Measured in the verification run: a legal
    but wrong pre-move took puzzle ELO 1312.4 → 1205.6.
  - **How it was verified.** No committed harness covers Play or Puzzles, so a
    throwaway CDP driver (headless Chrome, own static server, deleted after) ran
    at 375×812 with touch emulation, in light **and** dark, EN **and** ES:
    tap-tap and **drag** pre-moves in Play at level 8 (2 s think time) firing the
    instant the engine's move landed, with the sound counter proving it went
    through the normal path; a pre-move promotion (dialog at queue time, `wQ.svg`
    on g8, `g8=Q+` in the move list); a pre-move that becomes illegal being
    discarded in silence with the board still playable; Puzzles (solution queued
    and fired, wrong one graded, `puzzle-nav-prev` cancelling a queued
    pre-move); Learn practice (study `p1`); Rush (score up, no strike); and
    normal moves still working on the Analysis board, which does not opt in.
    Zero console errors beyond the usual App Check 403.
  - **Test trap worth knowing:** a drag ends in `document.elementFromPoint()`, so
    any open overlay (the first-run onboarding modal) swallows the drop and the
    drag looks broken when it is not. Direct `dispatchEvent` taps are unaffected,
    which makes it look like a drag-only bug. Clear `.modal-back` first.

- **GUIDED TOUR — READ TAB STEPS (2026-09-07).** `sw.js` bumped v101 → **v102**
  (both changed files are precached). Changed `js/tour.js`, `js/i18n.js`,
  `.gitignore`. Web-only, no Android rebuild — `git push` deploys it.
  - Two new steps in the `STEPS` array, **between Play and Profile**, so the tour
    keeps walking the tab bar in its real left-to-right order: `readTab` (a tap
    step on `#tabbar button[data-screen="read"]`, `waitFor: '#screen-read'`) and
    `readAdd` (rings `#read-add` on the shelf). The `profTab` step's `screen`
    moved from `'play'` to `'read'` to match. The tour is now 33 steps.
  - **The Read step deliberately demos nothing.** A brand-new account has no
    books, so the reader, pinch-zoom and long-press-a-diagram do not exist during
    the tour (rule 2 in tour.js's header). `#read-add` is the only always-present
    control, so it gets the ring and everything else is described in the body
    text — `tour_read_add_b`, ES + EN, next to the other `tour_*` keys in i18n.js.
  - **`resetRead()`** (new helper next to `resetBase`) presses the reader's own
    `#read-back`, because `Read.onEnter()` reopens the last-read book and would
    otherwise hide the shelf. `onEnter()` is async, so it presses twice — once
    inline and once on a 500 ms timer with `Tour.internal` set, or the tour's own
    click blocker swallows the second press.
  - Verified over CDP at 375×812 in light **and** dark, ES **and** EN: the full
    tour walks end to end (33/33), the ring lands on `#read-add` every time, the
    card is not clipped in either language (ES 328 px, EN 307 px tall, Back/Next
    and Skip all on screen), Back/Next round-trips through the two Read steps, and
    the tour still finishes with `tourDone: 'completed'`. Also verified in the
    awkward state the plain walk never reaches — a book left OPEN when the user
    last left the Read tab — where `resetRead()` puts the shelf back.
  - **Existing users do not get this automatically:** `tourDone` is already set
    for them, so they only see it via ⚙️ Settings → Replay the guided tour. A
    one-time Read intro behind a new kv flag was considered and rejected as not
    worth a new persistent flag.
  - **Harness fixture trap (cost this session ~15 min):** both
    `tools/cdp-verify.mjs` and `tools/cdp-verify-stage2.mjs` fetch
    `/__test-book.pdf` from the dev server. That file is generated, not
    committed, and without it BOTH harnesses fail at the "open" step
    (`readerVisible: false`) in a way that looks exactly like an app regression.
    It is now in `.gitignore` with the regeneration command. Run this first:
    `node tools/make-test-pdf.mjs 5 > __test-book.pdf`. With it present, both
    harnesses are fully green on this change.
  - Cosmetic, **pre-existing, not caused by this change**: in headless CDP
    screenshots the tour card renders at `opacity: 0` (its entry animation never
    plays without a compositor) and the "Keep scrolling" hint paints even though
    `hint.hidden === true` in the DOM. Both appear identically on untouched steps
    (e.g. step 14, Import PGN). Judge the card from the measured rects, not the
    pixels.

- **READ TAB — FULL-SCREEN (IMMERSIVE) READING + OPEN-WITH ROUTING (2026-09-01).**
  `sw.js` bumped v99 → **v100**. Web-only (index.html, css/style.css, js/read.js,
  js/app.js, js/i18n.js) — the TWA loads the live site, so this needs only a
  `git push`, NO Android rebuild. Context: the TWA rebuild (1.0.4/code 6) got the
  share + file intent filters working (CTC now shows in WhatsApp Share and
  "Open with"), but tapping "Open with CTC" opened the app on Analysis with no
  book, and Adrian wanted a full-screen reading mode.
  - **Full-screen:** new ⛶ button in the reader bar (`#read-fullscreen`) toggles
    `body.read-immersive`, whose CSS hides `#topbar` + `#tabbar` so the page fills
    the screen; the reader's own bar stays (so the same button + Back always exit).
    `closeBook()` clears the class. Verified over CDP (toggle on → both hidden,
    off → restored, leaving the book clears it).
  - **Open-with routing (`handleIncomingFiles`):** now, when launched via the file
    handler (`?open-file=1`), it switches to the Read shelf immediately and, if the
    File Handling API delivers the file through `launchQueue`, routes it (PDF →
    Read shelf, PGN → new collection). If no file arrives within 2.5s (some
    phone/Chrome builds open the app but don't pass the file), it toasts
    `share_open_failed` pointing the user to Share instead. **[STALE 2026-09-29:
    answered — launchQueue does NOT deliver files in a TWA on Chrome 150; the
    1.0.5 LauncherActivity patch routes "Open with" through the share target.]**
    **UNVERIFIED on device** whether the TWA actually passes the file via launchQueue — if it
    doesn't, "Open with" lands on the Read shelf + shows that toast, and Share →
    CTC (which POSTs the file and DOES work) is the reliable path.

- **SHARE TARGET — "Share → CTC" opens PDF/PGN from other apps (WhatsApp etc.)
  (2026-09-01).** Committed on `main`. `sw.js` bumped v97 → **v98**. Changed
  `manifest.webmanifest`, `sw.js`, `js/app.js`, `js/i18n.js`. This is LAYER 1
  (share sheet) of Adrian's "set CTC as an option to open PDF/PGN" request; the
  Play-Store "Open with" is layer 2, noted below.
  - **How it works:** `manifest.webmanifest` gains a `share_target` (POST,
    multipart, `params.files` name `file`, accept `application/pdf`/`.pdf` +
    `application/x-chess-pgn`/`application/vnd.chess-pgn`/`.pgn`). There is no
    server, so `sw.js` IS the endpoint: a POST whose path ends `/share-target` is
    intercepted, the file stashed in a separate cache `ctc-shared-inbox` (kept out
    of the `activate` version-wipe), then it redirects to `./?shared=1`.
    `handleSharedFile()` in `js/app.js` (run at the end of `main()`) reads the
    stash, clears the URL flag, and routes: **PDF → `Read.importFile` (Read
    shelf); PGN → `db.createBase(<filename>)` + `Base.openBase` + `Base.importFile`
    (a new collection named after the file).** New i18n `share_unsupported`.
  - **Verified over CDP** (POST a file to the SW endpoint, then load `?shared=1`):
    a shared PDF lands in the Read shelf; a shared PGN creates a base "Opening
    Lines" with its games. Both harnesses still green (offline boot + caching
    unaffected by the POST handler).
  - **REQUIRES the app be INSTALLED** (Add to Home Screen, or the Play Store TWA)
    — a share target can't attach to a plain browser tab. Android/Chrome only
    (iOS Safari doesn't support Web Share Target). PGN via the SHARE sheet only
    appears if the sender labels it `.pgn`/a chess-pgn MIME; some senders send
    octet-stream and won't match — layer 2 fixes that.
  - **LAYER 2 web-side DONE (2026-09-01, follow-up):** `manifest.webmanifest` now
    also has `file_handlers` (PDF + PGN → action `./?open-file=1`), and `js/app.js`
    handles the File Handling API: `handleIncomingFiles()` (renamed from
    handleSharedFile, still called at the end of `main()`) sets a
    `window.launchQueue` consumer that reads an opened file and feeds the SAME
    `routeIncomingFile()` the share sheet uses. `sw.js` bumped to **v99**. This is
    what makes CTC eligible for "Open with" / "Set as default". launchQueue can't
    be exercised headlessly (no OS file-open), so it's UNVERIFIED on device.
    **KEY CLARIFICATION for Adrian:** this does NOT need a *published/approved*
    Play Store app — it needs the **TWA rebuilt** (so its Android manifest carries
    the share + file intent filters) and reinstalled; an internal-testing build or
    a sideloaded signed APK is enough. The plain web Share Target does not reach
    the TWA; the TWA is a separate Android app.
  - **[STALE — superseded 2026-09-29, see top entry. The intent filters shipped
    in TWA 1.0.4; "Open with" was then fixed in 1.0.5 via a LauncherActivity
    patch. Do NOT follow the steps below, and do NOT run `bubblewrap update`.]**
    **LAYER 2 Android-side — still to do in the TWA/Bubblewrap project (NOT in this
    repo; only `.well-known/assetlinks.json` lives here):** run `bubblewrap update`
    to pull the new web manifest (Bubblewrap translates `share_target` +
    `file_handlers` into the Android intent filters), then `bubblewrap build`, then
    install the new APK/AAB on the phone (internal test or sideload). If
    Bubblewrap's auto-translation is incomplete, hand-add to the TWA activity's in the Bubblewrap/Android project add intent filters
    to the TWA activity:
    `<intent-filter><action VIEW/><category DEFAULT/BROWSABLE/><data mimeType="application/pdf"/></intent-filter>`
    and for PGN a filter matching the extension (no reliable MIME):
    `<data android:scheme="content"/><data android:host="*"/><data android:pathPattern=".*\\.pgn"/>` (also a `file` scheme variant). Bubblewrap
    exposes this via the `shareTarget`/`fileHandlers` fields in `twa-manifest.json`
    (or hand-edit `AndroidManifest.xml` post-`bubblewrap init`). The TWA forwards
    the opened file to the web app as a launch/share; the same `handleSharedFile`
    path consumes it. Also add `"file_handlers"` to the web manifest for
    installed-PWA "Open with" where the browser supports it. Test on a real device.

- **READ TAB — PIECE COLOUR FIX + CONFIRM-AND-CORRECT REVIEW STEP + REOPEN BOOK
  AT PAGE (2026-09-01).** Committed on `main`. `sw.js` bumped v96 → **v97**.
  Changed `js/diagram.js`, `js/read.js`, `js/i18n.js`, `js/app.js`. Adrian
  confirmed the queens fix works (teach 1st → later diagrams auto-read); the
  remaining complaints were wrong piece COLOURS/types in Setup, having to bounce
  back to Read to compare/correct, and Read reopening on the shelf.
  - **(A) Piece colour (`js/diagram.js`):** edge/shape matching can't tell a
    hollow white piece from a solid black one of the same type, so colours got
    swapped. Added a square-INDEPENDENT `colorScore` in `cellFeature` = where the
    cell CENTRE (the piece body) sits within the cell's own min→max luminance
    (0 = dark centre/black, 1 = light centre/white); using the cell's own range
    cancels the square shade. `buildTemplatesFromGrid` learns each colour's
    average `colorScore` → `colorRef` (only when the two separate by > 0.15).
    `classifyBoard` takes the TYPE from the shape and re-cases the COLOUR from
    `colorScore` — but CONSERVATIVELY: only when the fill is decisively past the
    midpoint (`band = (white-black)*0.25`), else it trusts the shape. A first,
    non-conservative version + a square-relative luminance version both REGRESSED
    Stage-2 (`calibConfirm`/`laterDiagramOk`) — the conservative center-vs-range
    signal is the one that passed. Do NOT revert to a raw or square-relative
    luminance colour signal.
  - **(B) Confirm-and-correct review step (`js/read.js`):** `teachPieces` now
    takes `opts = { review, initialGrid }`. In review mode it PRE-FILLS the board
    with the classified position, shows it beside the source crop, and "Open"
    (`read_review_open`) hands the corrected position to Setup WITHOUT rebuilding
    templates; Cancel just returns to the reader. `onLongPress`'s classify path
    now always goes through this instead of `openInSetup(res.fen)` — so any
    misread (colour/type/edge phantom) is fixed in place against the image rather
    than by bouncing back to Read. New i18n `read_review_title/body/open`.
  - **(C) Reopen book at page (`js/read.js` + `js/app.js`):** `showScreen` used to
    `Read.closeBook()` on leaving Read and `Read.refresh()` (shelf) on entering.
    Now leaving calls `closeBook(true)` which remembers `lastBookId`, and entering
    calls new `Read.onEnter()` which reopens that book at its saved page (the
    reader's Back button still clears it → shelf). Verified over CDP:
    leave→return reopens at the same page (`REOPENED_AT_PAGE: true`).
  - **Verified over CDP:** both harnesses green; the review modal renders
    pre-filled with the read position + source image + palette + Open/Cancel;
    reopen-at-page works. **STILL owed (device):** Adrian to confirm colours are
    right now and the review flow feels good. The edge-phantom over-detection on
    some diagrams remains (the review step is how the user removes the extras);
    a real detection-precision pass (sub-pixel grid) is still a separate follow-up.

- **READ TAB — LONG-PRESS NO LONGER DIES AFTER A FEW USES + FIXES THE "CRAZY
  ZOOM" (leaked phantom pointer) (2026-09-01).** Committed on `main`. `sw.js`
  bumped v95 → **v96**. One-spot change in `js/read.js` (`onDown`'s long-press
  timer). Adrian confirmed the queens fix works (first diagram teaches, later
  diagrams auto-read correctly); the remaining reader breakage was this:
  - **Root cause:** a long-press fires `onLongPress`, which opens a modal
    (calibrate / tap-to-teach) or navigates to Setup WHILE THE FINGER IS STILL
    DOWN. The eventual `pointerup`/`pointercancel` then lands off `#read-stage`,
    so `onUp` never runs and the pointer entry is never removed from the
    `pointers` Map. The leaked phantom pointer means the NEXT `onDown` sees
    `pointers.size === 2` → `startPinch()` and returns → the long-press never
    arms, and any move runs `doPinch()` → the reader zooms in/out on its own.
  - **Fix:** the moment the long-press fires, reset the gesture state
    (`pointers.clear(); longState = null; pinch = null;`) before calling
    `onLongPress(x, y)` with the captured coords. The current gesture is
    consumed anyway, so this is safe.
  - **Proven over CDP** (repeated long-press with NO pointerup between, i.e. the
    finger lifts off-stage): BEFORE the fix attempt 1 opened the modal and
    attempts 2/3/4 did NOT (matches "after the 3rd time it does nothing"); AFTER,
    all four open. Both harnesses still green.
  - **Adrian's other question — "why decode the whole PDF?":** the continuous-
    scroll reader renders a BUFFER of pages around the view as you scroll (not the
    whole book, and long-press samples only the pressed page). It is still heavier
    than the old one-page reader. Not changed here; if it feels heavy on device, a
    follow-up is to shrink the buffer / throttle `renderSlot`. STILL owed: confirm
    on a real phone that long-press now survives repeated use and the zoom is calm.

- **READ TAB — "IS THIS THE STARTING POSITION? → YES" NO LONGER POISONS
  CALIBRATION (the real cause of the board-full-of-queens) (2026-09-01).**
  Committed on `main`. `sw.js` bumped v94 → **v95**. Changed `js/read.js` and
  `js/i18n.js`. THIS is the actual root cause of Adrian's "completely wrong
  suggestion", not the CV occupancy (that fix stands): the first long-press in a
  book calls `calibrate()`, which asks "Is this the starting position?". Tapping
  **Yes** built the piece-font by assuming the 32 opening pieces on their start
  squares. On an ENDGAME diagram (where the answer is always No) that maps piece
  labels onto empty/other squares → garbage templates saved on the book → every
  later diagram classifies to a shelf of queens. Adrian kept tapping Yes (the
  question read like "confirm this position"), and it also dumped him into Setup
  with the plain start position ("no pieces placed").
  - **Fix (`calibrate()` in `js/read.js`):** the Yes branch now VERIFIES before
    trusting the answer — it builds the start-templates, classifies the same board
    with them, and only accepts if it reads back as EXACTLY the start
    (`chk.confident && chk.fen.split(' ')[0] === START_FEN.split(' ')[0]`).
    Otherwise it toasts `read_calib_not_start` and falls through to `teachPieces`
    (tap-to-teach) instead of saving garbage. Verified over CDP: a wrong Yes on
    Hellsten p20 → `looksLikeStart:false`, guard fires; Stage-2 `calibConfirm`
    (a real synthetic start) still saves templates and `placementOk`.
  - **UX (`js/i18n.js`):** reworded `read_calib_title`/`read_calib_body` to say
    explicitly "only if the diagram is the standard opening with all 32 pieces —
    almost no endgame diagram is"; the "No" button is now **"Place by hand" /
    "Colocar a mano"**; added `read_calib_not_start`.
  - **IMPORTANT for existing books:** a book Adrian already mis-calibrated has the
    GARBAGE templates SAVED (ver 3, so not auto-discarded). It must be re-learned:
    the book card's ⋯ menu → "Re-learn the pieces" (`read_recalib`, clears
    templates), or delete + re-add the book. Then the next long-press re-runs the
    guarded calibrate. This is a per-book manual step; there is no auto-heal.
  - **Still open / next:** the first long-press per endgame book now correctly
    routes to tap-to-teach, which means placing the first diagram's pieces by hand
    (fine for a simple K+P study, tedious for a 30-piece middlegame). If Adrian
    wants to skip that, the follow-up is auto-detecting the start (drop the
    question entirely) or a universal font. Also STILL unverified on a real
    phone: whether the long-press even fires reliably on the native-scroll reader
    (see the entry below) — Adrian must confirm on-device.

- **READ TAB — AUTO-ZOOM FIXED + LONG-PRESS MADE MORE FORGIVING; SENTRY NO LONGER
  FIRES ON LOCALHOST/HEADLESS (2026-09-01).** Committed on `main`. `sw.js` bumped
  v93 → **v94**. Changed `js/read.js` and `index.html`. Context: the continuous-
  scroll reader rebuild (`b28357e`) introduced reader regressions the user hit on
  the DEPLOYED phone app; and headless test runs were polluting the real Sentry
  project (HeadlessChrome events tagged `production`, e.g. an old `kvGet`
  NotFoundError).
  - **Auto-zoom / self-zoom (CONFIRMED + FIXED):** `onResize` reset `R.zoom = 1`
    and re-laid-out on EVERY window resize. Mobile browsers fire `resize` on every
    address-bar show/hide during a scroll (a HEIGHT-only change), so the reader
    kept zooming and jumping on its own. Fixed: `onResize` now tracks
    `lastInnerW` and returns early unless the WIDTH actually changed (rotation /
    real resize). Reproduced over CDP: a same-width `resize` reset a 2× zoom to 1×
    before, and preserves it after (`zoomResetByResize: false`). This reflow was
    also firing mid-long-press, which likely contributed to "can't select".
  - **Long-press "can't select":** the rebuilt reader scrolls with the phone's
    NATIVE `touch-action: pan-y`, which competes with the stationary hold (native
    scroll steals the touch / drift cancels it) — the old reader owned all touches
    with `touch-action: none`, so long-press was reliable there. Couldn't fully
    reproduce headlessly (synthetic pointers don't trigger native scroll — clean
    and jittered holds both fire in the harness). Made it more forgiving:
    `LONG_SLOP = 16` (was reusing `TAP_SLOP = 10`) so natural hold drift doesn't
    cancel, plus the onResize fix removes the mid-hold reflow. **This may not fully
    fix it on a real finger** — if it persists, the proper fix is a gesture rework
    (e.g. own the touch during a pending hold and hand-roll scroll for that drag,
    trading some native momentum) and MUST be tested on Adrian's device. Do NOT
    claim it fixed without device confirmation.
  - **Sentry gate:** `index.html` no longer uses a static `<script src>` for the
    Sentry loader. An inline gate injects it ONLY when NOT on localhost /
    127.0.0.1 / a private LAN IP / `.local` / a Headless UA. Verified headless:
    `window.Sentry` is undefined, no sentry script, zero sentry network requests.
    The DSN/config are unchanged for the real deployed site.
  - Both committed harnesses still green (`tools/cdp-verify.mjs` Stage 1 —
    painted/offline/tab-unchanged; its `turn`/`swipe` fields read `undefined`
    because the scroll rebuild changed page-turning and those checks are now stale,
    NOT from this change; `tools/cdp-verify-stage2.mjs` Stage 2 all true).
  - NOTE for the next session: the old `kvGet`-at-`db.js:251` Sentry error was
    from an OLDER build (line numbers don't match current `db.js`, where 251 is
    inside the playHistory cursor) and a transient headless DB state — not a
    current live crash. The reader's `turn`/`swipe` harness checks are stale vs
    the scroll reader and should be updated.

- **BOTTOM MENU BAR TIGHTENED TO ONE ROW — ☰ LEFT, SCREEN NAME CENTRED, KAEL
  RIGHT, DIVIDER GONE (2026-09-01).** Committed on `main`, NOT pushed/deployed
  yet (Cloudflare Pages; commits not pushed). **Pure CSS** — only `css/style.css`
  changed among precached files, so `sw.js` bumped v92 → **v93** (v92 was the
  concurrent "Move Delete account…" commit `6dbb881`; the v93 bump is what covers
  THIS css change). NO html/js touched, so tap-to-open and every `#tabmenu` /
  `#kael` behaviour is byte-identical in logic (verified: menu still opens).
  - **What changed (all in `css/style.css`):** `#tabmenu` was a centred gold pill
    (`☰ Análisis`) with a `border-top` divider above it, and Kael floated as a
    separate FAB *above* the bar. Now `#tabmenu` is one slim row: `#tabmenu-btn`
    is a full-width transparent grid (`grid-template-columns:1fr auto 1fr`) with
    the ☰ pinned left and `#tabmenu-label` centred, `margin-right:44px` reserving
    Kael's spot. The `border-top` divider is REMOVED. The row rests at
    `opacity:.58` ("faded while you use a tab so the screen feels fuller") and
    returns to `opacity:1` on `body.menu-open` / `:focus-within`. `#kael-corner`
    `bottom` moved 62px → `calc(2px + safe)` so Kael sits ON the row's right, and
    its idle `transform` changed `translateX(34px)` → `translateX(0)` so Kael
    rests fully in place but faded (own `opacity:.55`) instead of parking as a
    sliver off the edge — he's in the chrome strip below the board now, so the old
    "keep him off the board" park was no longer needed. `.speaking` (slide-in +
    full opacity + quote bubble) is unchanged.
  - **The label centre sits ~20px left of dead-centre on purpose** — the
    `margin-right:44px` Kael reserve. It reads centred between the ☰ and Kael
    in-app; do NOT "fix" it by dropping the reserve or Kael and the label collide.
  - **Verified over headless Chrome (CDP), throwaway probes since deleted** (scratch
    server + `_shot_tmp.mjs`/`_check_tmp.mjs`, removed, NOT committed). 375px, **ES
    and EN, light and dark** — before/after screenshots shown to Adrian. Functional
    check: `#tabmenu` height **42px** (was ~53px incl. the 1px divider → ~11px /
    ~20% shorter), `documentElement.scrollWidth == 375` (**no horizontal
    overflow**), resting opacity `.58` → `1` on menu open, tapping `#tabmenu-btn`
    still opens the slide-up sheet, geometry ☰(cx 24)·label(cx 165)·Kael(cx 339)
    on one vertical band.
  - **Reader NOT touched** (no `js/read.js` / `js/diagram.js` / reader DOM change),
    so the two CDP reader harnesses were **not re-run** per the standing rule —
    this is global bottom-chrome CSS that does not exercise reader logic.
  - **Only `css/style.css` + `sw.js` (v93) were staged here.** The concurrent
    session's `HANDOFFS.md`, `docs/superpowers/plans/2026-08-14-friends-system.md`
    and `tools/stage2-shots/` were left untouched.

- **DELETE ACCOUNT MOVED FROM THE PROFILE TAB INTO SETTINGS (2026-09-01).**
  Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped v91 → **v92**.
  Changed `index.html`, `js/app.js`, `js/i18n.js`, `js/legal-data.js`.
  - The destructive "Delete account" control no longer shows on the Profile tab.
    Removed `#profile-delete-account-btn` from `index.html` and its two wirings in
    `Profile` (the `init()` onclick and the `renderAccount()` show/hide toggle) —
    both had to go or `$('profile-delete-account-btn')` would be null and throw.
  - It now lives in the Settings sheet (`openSettings()` in `js/app.js`), appended
    after the Legal section under a new `account_section` label ("Cuenta"/"Account")
    as a full-width `.btn.danger`, and ONLY when `Auth.user` (nothing to delete when
    signed out). It calls `close(null)` first, THEN `Profile.deleteAccountFlow()`
    after 120ms, so the flow's confirm + reauth dialogs don't stack on the modal —
    same pattern as the tour button. The flow itself (`Profile.deleteAccountFlow`,
    `Auth.deleteAccount`) is unchanged.
  - Terms §18 wording updated in BOTH languages (`js/legal-data.js`): "desde
    Perfil"/"from Profile" → "desde Ajustes"/"from Settings", so the legal text
    still names where deletion lives. (Privacy policy already said "…and from
    Settings", left as-is.)
  - Verified over headless Chrome, 375px: Profile tab has no delete button; the
    Settings sheet builds with zero console errors and shows no delete entry when
    signed out; with a faked `Auth.user` it shows the red "Eliminar cuenta" button
    under a "Cuenta" label. No harness run — this is Profile/Settings UI, outside
    the reader harnesses.

- **BOARD — MOVE/SELECT HIGHLIGHT TINTS THE SQUARE, NOT THE PIECE (2026-08-31).**
  Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped v90 → **v91**.
  CSS-only, `css/style.css` (precached). The last-move / selected highlight is a
  full-square `::before` tint (`.sq.lastmove::before` = `var(--hl)`,
  `.sq.lastmove-outbook::before` = gold, `.sq.selected::before`); because the
  piece `<img>` was non-positioned it painted BELOW the positioned pseudo-element,
  so the tint sat over the figurine. Fix: `.sq img` gets `position: relative;
  z-index: 1` (piece above the tint); the move-target dot/ring
  (`.sq.dest::after`, `.sq.capture-dest::after`) get `z-index: 2` so a capture
  ring still frames the enemy piece on the target square. Verified over headless
  Chrome, 375px, light + dark: highlighted squares tint the square only, pieces
  render clean on top. Shared board component, so this applies in every tab.
  `.sq.check` (a background gradient) was already under the piece — untouched.

- **READ TAB — CONTINUOUS VERTICAL SCROLL (replaced one-page-at-a-time)
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped
  v89 → **v90** (index.html/css/js/read.js/i18n.js all precached). Design doc:
  `docs/superpowers/specs/2026-08-31-reader-continuous-scroll-design.md`.
  - **What changed:** the reader is now a native vertical scroller. `#read-stage`
    (still in `SWIPE_SAFE`) is `overflow:auto` and holds `#read-col`, a column
    sized to the whole book so the scrollbar is honest; only the pages near the
    viewport (+1 buffer each side) get a `<canvas>`, recycled from a small pool as
    you scroll (`R.slots` Map + `R.pool`). Memory stays flat on a 194-page book.
    Layout is in base (zoom-1) units × `R.zoom`: `layout()`, `colW/slotH/pageH/
    pageTop/totalH`, `syncSlots()`, `ensureSlot/releaseSlot/renderSlot`. Slot
    height comes from **page 1's aspect ratio** (uniform; odd pages letterbox).
  - **Kept working (all proven by the harnesses + a CDP pinch/visual probe):**
    pinch-zoom is now whole-column (`setZoomAbout` resizes the column and adjusts
    scrollLeft/Top about the pinch midpoint; `touch-action` flips to `pan-x pan-y`
    when zoomed so a finger pans horizontally; pages re-render crisp after the
    zoom settles — `scheduleReRender`). `renderSlot` keeps the old **OVERSAMPLE
    1.5** (capped at 2400 device px) so diagram detection sees the resolution it
    was tuned for. Long-press → diagram now finds the page slot under the finger
    (`slotAtClient`) and samples THAT canvas via `getBoundingClientRect` (maps
    correctly at any zoom). Progress: the top-most visible page is saved; reopen
    scrolls the saved page to the top.
  - **Nav bar:** the ◀ ▶ arrows and horizontal-swipe page-turn are GONE (scroll
    replaces them). The page indicator `#read-page-ind` is now a **tap-to-jump**
    button (`jumpToPage` → `askText` → `scrollToPage`). New i18n keys `read_jump`,
    `read_jump_title`. `read_prev`/`read_next` strings are now unused (harmless).
  - **Removed from the old single-canvas model:** `#read-canvas`, the global
    `#read-blank` (now per page slot), `renderPage`, `clampAndApply`, `R.tx/ty/
    baseW/baseH/renderTask/renderToken`, `nextPage/prevPage`, `SWIPE_TURN`.
  - **Harnesses updated** (they asserted the old single-canvas + transform + ◀▶
    model): `tools/cdp-verify.mjs` (open/turn/memory/swipe now drive the scroller)
    and `tools/cdp-verify-stage2.mjs` (long-press steps use `__pageCanvasAt` +
    rect mapping; `lpNoBoard` long-presses the page's TEXT, a real "not a board"
    region — dead-centre white space can trip a min-gap noise grid in
    `detectBoard`, unchanged pre-existing CV behaviour, out of scope here). BOTH
    green. Run: serve the repo + `/__test-book.pdf`, then
    `node tools/cdp-verify.mjs <url>` / `...stage2.mjs <url>`.

- **READ TAB — DIAGRAM READER FIXED ON BOLDLY-HATCHED BOARDS (was a shelf of
  phantom queens) (2026-08-31).** Committed on `main`, NOT pushed/deployed yet.
  `sw.js` bumped v88 → **v89**. Changed `js/diagram.js` and `js/read.js` (both
  already in sw ASSETS); no new files. This is the fix for Adrian's report that
  long-pressing a diagram in "Excelling at Chess Calculation" (Aagaard, a
  194-page JBIG2 scan in `ChessPuzzleImport\`, and the WA0033 copy) gave a
  completely wrong board — a black queen on almost every square.
  - **Root cause (found by CDP probe, not guessed):** detection was CORRECT (the
    grid overlay sat dead on the board). The bug was OCCUPANCY. `cellFeature`'s
    `lumStd` (luminance spread) decided empty-vs-piece, and a **boldly diagonally
    hatched empty square** spreads luminance ~100 — as wide as a real piece — so
    every hatched empty read as occupied, then its busy texture matched the
    busiest template (queen). The learned `emptyThresh` (~100) couldn't separate
    them. Proven the OLD code ALSO exploded on Dvoretsky p30 (a `k` on every
    hatched square), so `lumStd` occupancy was fragile, not Aagaard-specific — it
    only ever worked when calibration happened to learn a lucky threshold.
  - **The fix (`js/diagram.js`):** `buildTemplatesFromGrid` now also builds a
    **per-colour empty-square template** (`empties[0]`/`empties[1]`, the averaged
    edge-feature of the labelled empty squares of each colour) and bumps the
    template record to **ver 3**. `classifyBoard` decides occupancy by
    `d1 >= cosDist(feat, emptyTemplate[parity])` — a cell is empty unless it sits
    strictly closer to some piece template than to its colour's empty pattern.
    This reads a hatched EMPTY as empty (it hugs the empty pattern) AND keeps a
    dark piece on a dark hatched square (nearly uniform → `lumStd` would miss it,
    but `d1≈0 ≪ dEmpty`). `lumStd`/`emptyThresh` are RETAINED as the ver-2
    fallback for legacy templates or a colour with < 2 empties. **Do NOT
    reintroduce a margin or a lumStd-OR:** a margin toward "occupied" brings the
    queens back; a lumStd-OR floor silently drops dark-pieces-on-hatch; a learned
    absolute `occThresh` was tried and was worse — all three were measured and
    rejected. Plain `d1 >= dEmpty` is the one that never silently drops a real
    piece.
  - **`js/read.js`:** `openBook` now DISCARDS `book.templates` when `ver < 3`
    (one line), so a book calibrated before this fix re-learns with the new method
    on the next long-press instead of reusing its broken ver-2 read. New
    calibrations (`buildTemplates` start-position, or tap-to-teach) are ver 3.
  - **Verified over headless Chrome (CDP), 375px, throwaway probes since deleted,
    no book copied into the repo** (streamed from `ChessPuzzleImport\`): Aagaard
    p13 left diagram now reads a structurally correct position — **2 queens (the
    real d7/g3 queens), was ~21** — `confident:false` so the app shows its
    "check the board" warning. Dvoretsky p30 (hatched): garbage → the 5 real
    pieces correct. Hellsten p20 (wood): unregressed. Synthetic Stage-2 still
    reads a clean board EXACTLY and `confident:true`. Both committed harnesses
    green (`tools/cdp-verify.mjs`, `tools/cdp-verify-stage2.mjs`).
  - **KNOWN RESIDUAL (not chased, honest-degradation covers it):** on some
    diagrams a few PHANTOM pieces still appear, clustered on the board's edge
    columns — a pre-existing DETECTION-ALIGNMENT quantisation (cell rounded to an
    int px drifts a few px across 8 cells, so edge cells catch the board border).
    This is NOT the occupancy rule and must not be patched there. It reads
    `confident:false`, so the user reviews/edits in Setup or re-teaches. A proper
    fix is sub-pixel grid refinement in `findGrid`/`detectInWindow` — a separate
    task (see the two OTHER open reader tasks Adrian raised this session, below).

- **READ TAB — "THIS PAGE CAN'T BE DISPLAYED" FALLBACK + TWO JBIG2 BOOKS CONFIRMED
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped
  v87 → **v88**. Changed `js/read.js`, `js/i18n.js`, `index.html`, `css/style.css`
  — all already in sw ASSETS, no new files, no wasm touched (the v87 JBIG2 wiring
  is left exactly as-is).
  - **What it does:** a content page that renders blank because its scanned image
    uses an encoding pdf.js still can't decode (a *future* JBIG2/JPEG2000-class
    book we haven't vendored a wasm for) now shows a clear bilingual in-reader
    message instead of a silent white page. New i18n keys `read_blank_title` /
    `read_blank_body` (ES + EN), new overlay `#read-blank` inside `#read-stage`,
    styled with the reader's own tokens (`--panel2` / `--text` / `.hint`) — NOT a
    new visual style.
  - **The heuristic (Adrian chose "blank + any failed image"):** after a page
    renders, `maybeFlagUndecodable()` shows the notice ONLY when BOTH hold: (1)
    `isCanvasBlank()` — the canvas downscaled to 64px wide has ≤2 non-white
    thumbnail pixels, so a page number or a line of text keeps a page off the
    "blank" list; AND (2) `pagePaintsImage()` — the page's operator list contains
    an image-paint op (`paintImageXObject`/`…Repeat`/`paintInlineImageXObject`/
    `paintJpegXObject`) that was supposed to paint but didn't decode. A genuinely
    blank page (a chapter break) has NO image op → stays silently blank, no
    message. Because the check runs only on an all-white canvas, it can NEVER
    cover text the reader could otherwise have shown. `getOperatorList()` is
    fetched only for blank pages, so a normal page pays nothing. The notice is
    hidden at the top of every `renderPage` so a page turn clears it.
  - **Verified over headless Chrome (CDP), 375px, throwaway probe since deleted,
    no book copied into the repo** — real PDFs streamed from `ChessPuzzleImport\`
    by a scratchpad server only for the run. The two previously-untested JBIG2
    books now render: **"00. Fundamental_chess_endings…encyclopaedia…" →
    173,278 non-white px** and **"2. Fundamental Chess Endings - Frank Lamprecht"
    → 173,278 px** (identical size + page count + pixel count — they are the same
    FCE scan under two filenames; both render, no message). Controls unregressed:
    Silman 80,532 px, Dvoretsky 703,258, Hellsten 389,151 — all draw, none show
    the message. Fallback discriminator proven on a synthetic 3-page PDF: a
    full-page undecodable image (garbage DCTDecode) → blank + **message shown**
    (ES default AND EN after toggle); a truly blank page with no image → blank
    but **no message**; a text page → not blank, no message. Theme check: overlay
    background follows `--panel2` in light (`rgb(237,240,246)`) and dark
    (`rgb(33,43,57)`), message shown in both. Both committed harnesses re-run
    **green** (`tools/cdp-verify.mjs` Stage 1; `tools/cdp-verify-stage2.mjs` Stage
    2 — the change is inert for Stage 2, whose test book has only text pages).

- **READ TAB — LINE-ONLY WHITE BOARD VERIFIED, NO CODE CHANGE NEEDED (2026-08-31).**
  Doc-only commit; `js/diagram.js` and `sw.js` are UNCHANGED (still v86). This
  closes the last untested board style: thin black grid lines on pure white, NO
  shading and NO hatching.
  - **No real line-only book exists on this device to test on.** Of Adrian's five
    endgame PDFs only two render at all in the app's pdf.js (v6.3.289): Dvoretsky
    (hatched scan) and Hellsten (shaded vector) — both already verified, neither
    line-only. The three that *would* show line-only diagrams — Silman, Lamprecht
    (`2. Fundamental…`), and the `00.` encyclopedia — are **JBIG2-scanned and
    render BLANK** (see the separate defect entry below). So a REAL line-only test
    stays theoretical; this was verified on a **faithful synthetic** line-only
    board instead (pure-white squares + 1–2px black grid lines + the app's own
    figurine SVGs + surrounding book text), which exercises the exact CV paths in
    question. Throwaway CDP probes, deleted after (pattern per the scanned-book
    entry below).
  - **Result: line-only is one of the EASIEST styles, not a weak one.** Detected at
    the right cell size with a pixel-aligned 9×9 overlay (eyeballed), taught from
    the start, and read back to the **exact** start AND a midgame FEN,
    `confident=true`, `maxD1=0`. Text on the page → NO board. Verified clean (1px),
    thick (2px), and scan-noisy (±10 luminance) variants.
  - **The three flagged failure points were each checked and none is a bug:**
    1. *Empty `lumStd` / grid-line bleed via INSET=0.07.* With 1px lines empties
       have `lumStd≈0` (no bleed); with 2px lines some bleed lifts the worst empty
       to ~28.6, but the learned `emptyThresh` rises with it (27→44) and still sits
       well below the flattest piece (~54–60), so occupancy stays correct. Real,
       but self-correcting — not a defect.
    2. *Thin-line teeth / `lineContrast`.* A black-on-white line is a FULL-contrast
       edge — taller and sharper than a shade flip — so `findGrid`'s comb locks
       hard and `lineContrast` clears 1.35 easily. Thin lines are not weak here.
    3. *`validateCheckerboard`'s flat branch.* Confirmed it is exactly what admits
       this style: empty-square brightness spread was 0–0.3 (< 26) in every
       variant → `return true`. The parity test is never reached (correctly — a
       line-only board has no parity to separate).
  - **Honest degradation holds:** the scan-noisy midgame classified with clean
    templates came back `confident=false` (1 uncertain), never a confident wrong
    board — the Setup-plus-flip fallback covers it. **Recommendation was: do NOT
    add any tweak.** Detection already reads line-only correctly or flags itself;
    a threshold change would only risk the two real styles for a case that already
    passes. Left as-is by design.
  - **Both committed CDP harnesses re-run green** (`tools/cdp-verify.mjs` Stage 1;
    `tools/cdp-verify-stage2.mjs` Stage 2 — every check true; the only `false`s are
    the intended `confident:false` honest-degradation check and `cardOverflow:false`).
    No source changed, so the reader/i18n/375px/light/dark surface is identical to
    v86.

- **READ TAB — JBIG2 / JPEG2000 SCANNED PDFs NOW RENDER (WAS BLANK), FIXED (2026-08-31).**
  `sw.js` cache bumped v86 → **v87**. Changed `js/read.js`; added two vendored
  wasm files. NOT a diagram-detection bug — the pages simply never drew.
  - **Symptom (before):** Silman, `2. Fundamental Chess Endings - Frank Lamprecht.pdf`,
    and `00. Fundamental_chess_endings…encyclopaedia….pdf` opened in the Read tab
    and showed **pure white pages** (0 non-white pixels on content pages). Each is a
    single full-page JBIG2-encoded scan. Cause: pdf.js v6 fetches an image-decoder
    wasm from inside its worker (`${wasmUrl}jbig2.wasm`) and `loadPdfjs()` never set
    `wasmUrl`, so decode failed (`Jbig2Error: JBig2 failed to initialize`). JPEG2000
    scans fail the same way via `openjpeg.wasm`.
  - **The fix:** vendored **`vendor/jbig2.wasm` (~102 KB)** and **`vendor/openjpeg.wasm`
    (~246 KB)** — the exact v6.3.289 decoder wasm, extracted from the `pdfjs-dist-6.3.289.tgz`
    already in the local npm cache (no download). Added a module const
    `PDF_WASM_URL = new URL('../vendor/', import.meta.url).href` in `js/read.js` and
    pass `wasmUrl: PDF_WASM_URL` in **both** `getDocument()` calls (open + add-cover).
    The worker fetches the wasm itself; `vendor/` is CACHE_FIRST so it is stored on
    first book-open and then works offline — **deliberately NOT in `sw.js` ASSETS**,
    same pattern as the 1.3 MB pdf worker (keeps first launch light for non-Read
    users). sw.js got only a documenting comment + the v87 bump.
  - **Chose wasm over the two `*_nowasm_fallback.js` (~583 KB) and `qcms_bg.wasm`
    (ICC, 94 KB):** the JS fallbacks only fire if WebAssembly itself fails (never in
    the TWA) — dead weight; qcms is a *separate* console warning, not the blank-page
    cause. Adrian confirmed "two wasm only".
  - **Verified over headless Chrome (CDP), throwaway probe since deleted, no book
    copied into the repo** — the real PDFs were streamed from `ChessPuzzleImport\`
    by a scratchpad server only for the run. Page 30, 375px:
    **Silman JBIG2 → 79,129 non-white px (was 0), Jbig2Error gone**; Dvoretsky
    (692,774 px) and Hellsten (386,511 px) **still render — no regression**. Both
    committed harnesses re-run green (`tools/cdp-verify.mjs` Stage 1 — painted, page
    turns, offline boot, theme light+dark, swipe; `tools/cdp-verify-stage2.mjs`
    Stage 2 — every check true bar the intended honest-degradation `confident:false`).

- **READ TAB — DIAGRAM DETECTION ON A GENUINELY SCANNED BOOK (2026-08-31).**
  Committed on `main` (`7d4a8ba`), NOT pushed/deployed yet. `sw.js` cache bumped
  v85 → **v86**. ONE-LINE change in `js/diagram.js` (already in sw ASSETS); no new
  files. Closes the last open gap from the entry below (scanned raster/JPEG book
  was untested).
  - **Tested on a real SCAN** — `ChessPuzzleImport\1. Dvoretsky's Endgame Manual
    - 5th Edition.pdf` (JPEG pages, **0 embedded fonts** — a true scan, unlike the
    vector-rendered Hellsten). Its dark squares are **diagonally hatched**, not
    solid-shaded, which is what exposed the bug.
  - **The fix (one gate):** `findGrid`'s weakest-tooth gate was `mn < mean * 1.3`.
    A hatched board's internal white↔hatch HORIZONTAL boundaries are systematically
    lower-contrast than a solid board's, so across a shelf of endgame diagrams the
    weakest horizontal tooth ran only **1.16–1.27× the mean** (vertical ~1.4×). The
    1.3× gate rejected the CORRECT grid on nearly every real page — pages 1-8/1-10
    never detected at any window; 1-6 detected only by luck at a larger window.
    **Relaxed to `mean * 1.15`.** Text is still excluded by the two strong
    downstream filters — `lineContrast ≥ 1.35` AND needing a grid on BOTH axes (a
    text column has no periodic vertical lines). Re-verified: real scanned body
    text on the same pages → NO board. Do NOT raise the gate back toward 1.3.
  - **Occupancy needed NO change.** `cellFeature`'s `lumStd` cleanly separated the
    hatched empty squares (lumStd ~47) from pieces (~60–116) on real pixels;
    learned `emptyThresh` came out 53–57, comfortably between. The flagged lumStd
    risk did not materialise.
  - **Verified over CDP on real scanned pixels** (throwaway probes, since deleted):
    three diagrams — 1-6 `8/8/5pk1/5r2/R7/5K2/8/8`, 1-8 `8/8/8/4p1p1/8/5P2/6K1/3k4`,
    1-10 `8/4k3/3p4/3P4/2P5/8/8/5K2` — each detected with a **pixel-aligned grid
    overlay**, taught from the true position and read back to the **EXACT FEN,
    confident=true**. Cross-diagram (teach a set missing a piece type → read one
    that has it) → confident=false (honest). Real body-text taps → null.
  - **Skew/noise: recommendation is DON'T add a rotation search.** Stress on a real
    diagram: ≤0.5° skew reads correct/confident; **1–2° is still found but flagged
    `confident:false`** (high maxD1 ~0.5–0.6) — never a confident wrong board;
    heavy per-pixel noise → no board (honest null). Real scans have no meaningful
    skew anyway (Dvoretsky is axis-aligned). The honest-degradation path (Setup +
    the flip button) already covers skew cheaply; a rotation search would add cost
    to the hot path for a case that already fails safe. Left as-is by design.
  - **Both committed CDP harnesses stay green** (`tools/cdp-verify.mjs` Stage 1;
    `tools/cdp-verify-stage2.mjs` Stage 2, all checks). The synthetic harnesses are
    unchanged — no new file. The change is pure CV (thresholds), no UI/i18n, so the
    375px / light / dark / both-language reader surface is identical to v85 (which
    was verified in both themes); the calibration/teach modals are untouched.

- **READ TAB — STAGE 2 HARDENED ON A REAL BOOK + TAP-TO-TEACH + SETUP FLIP
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` cache
  bumped to `chess-training-center-v85`. No new files — all changes live in
  `js/diagram.js`, `js/read.js`, `js/app.js`, `js/i18n.js`, `css/style.css`,
  `index.html`, already in the sw ASSETS. This closes the two open gaps from the
  first Stage-2 entry below (never run on a real scan; tap-to-teach not built).
  - **Verified against a REAL printed book** (Adrian's endgame library,
    `ChessPuzzleImport\3. Hellsten … Mastering endgame strategy.pdf`, 484 pp,
    wood-texture shaded boards with a-h/1-8 coordinate labels on all four sides).
    Done over CDP with throwaway probes that were DELETED after (per the standing
    instruction) — the committed harness `tools/cdp-verify-stage2.mjs` stays
    synthetic (no copyrighted book ships), and it was extended with the
    tap-to-teach and flip checks (13 checks, all green). Stage 1
    `tools/cdp-verify.mjs` still green. **The real end-to-end was proven live:
    open the real book → render p20 → long-press the real diagram → detection on
    the live reader canvas → calibration modal → "No" → tap-to-teach modal showing
    the real cropped board.**
  - **Detector fixes in `js/diagram.js` (`detectBoard`), all because a real page is
    two dense text columns, not one clean diagram:**
    1. **Tap-centred, COARSE-TO-FINE window** (`detectInWindow`, fractions
       `[0.16..0.48]` of the short side, smallest first). The old single 0.46
       window spanned the whole page, so the edge profiles were dominated by text
       and the column gutter and the comb never locked. A small window around the
       tap excludes the neighbouring column; it grows only if nothing validates.
    2. **Clip rejection**: a board touching the window edge is discarded (it was
       truncated → wrong period/origin), forcing the search to grow.
    3. **99th-percentile cap** in `findGrid`: flattens one lone off-board spike (a
       gutter / table rule) so periodicity, not a single tall edge, sets the fit.
       Was 0.96 first — too low, it clipped the board's OWN lines when a diagram
       fills the window and broke detection; 0.99 only tames extreme outliers.
    4. **`lineContrast` gate**: grid lines must carry ≥1.35× the edge energy of the
       cell centres. A real board's boundaries dominate; a coincidental grid in
       text is as busy between its lines as on them. This is what kills text false
       positives (a bare squareness/parity test let them through).
  - **Classifier fix — the big one for real books:** occupancy (empty vs a piece)
    was decided by mean gradient ENERGY, which on wood grain gives an empty square
    almost as much energy as a sparse piece → a real board read as ALL EMPTY. Now
    `cellFeature` also returns `lumStd` (luminance std over the cell core) and
    occupancy uses THAT — texture is low-amplitude in luminance, a piece is a big
    blob far from the square shade, so lumStd separates them cleanly. The
    threshold is still learned at calibration (`buildTemplatesFromGrid`, robust
    95th-empty / 5th-piece percentiles), `templates.ver` bumped 1→2. Piece-vs-piece
    matching is unchanged (still the edge-map `feat`). **Result on real pages:
    templates taught from one diagram read OTHER diagrams in the same book to the
    exact FEN** (proven: p30-top taught → p30-bottom and p20 both read correct),
    honestly flagged `confident:false` when the cross-page match loosens.
  - **Tap-to-teach fallback (`js/read.js` `teachPieces`)** — the "No, not the
    start" branch no longer opens an empty board. It shows the detected board
    cropped tight (`cropBoardCanvas(…, 0)`, new `padFrac` arg) under an 8×8 tap
    overlay + a 12-piece palette (+ eraser). The user taps each piece; "Aprender y
    abrir" calls `buildTemplatesFromGrid(img, board, userGrid)` (same features,
    user layout instead of `START_GRID`), saves the templates on the book, and
    opens that exact position in Setup. Won't submit without both kings; Cancel
    falls back to the old blank-editor escape hatch. New CSS `.read-teach-*`, new
    strings `read_teach_*` (both languages). Verified in light AND dark at 375px.
  - **Orientation answer = flip in Setup (NOT label OCR).** New "Girar tablero"
    button (`#setup-flip`, `Setup.flip()` in js/app.js) rotates the placement 180°
    so a Black-at-bottom read is one tap to fix instead of a full re-entry; helps
    every Setup user. `.setup-tools` is now a 3-column grid; string `flip_board`.
    Verified: correct rotation (K/Q swap, colours change ends) and self-inverse.
    Coordinate-label OCR was deliberately rejected — fragile, and against the
    no-ML design, for a rare case a one-tap flip already covers.
  - **Known limits (unchanged, honest fallback covers them):** turn defaults to
    White and castling to `-` (a scan can't prove either — set in Setup); a
    flipped board still reads upside-down and is fixed with the new flip button;
    tap-to-teach only learns the piece types the user actually taps (a later
    diagram with an untaught type reads uncertain, not confidently wrong). Tested
    on ONE real book (Hellsten, vector-rendered wood boards); a genuinely SCANNED
    (raster/JPEG-noise) book or a line-only white board is plausible but untested —
    if one misreads, the lumStd threshold and the parity/flat branch of
    `validateCheckerboard` are the first places to look.

- **READ TAB — STAGE 2: DIAGRAM → BOARD (2026-08-30).** Committed on `main`, NOT
  pushed/deployed yet. `sw.js` cache bumped to `chess-training-center-v84`.
  Verified in headless Chrome over CDP with a NEW harness,
  `tools/cdp-verify-stage2.mjs` (the in-app pane never composites — same reason
  Stage 1 uses CDP). Long-press a chess diagram on a PDF page → read the position
  → open it on the real board. **All 12 automated checks pass.**
  - **New module `js/read.js`'s companion `js/diagram.js`** — pure image work, NO
    DOM and NO import from app.js, so it is unit-testable with a plain ImageData.
    Exports `detectBoard`, `buildTemplates`, `classifyBoard`, `gridToFen`,
    `cropBoardCanvas`, `START_GRID`. **Do NOT fold it into read.js or app.js.**
    Added to `sw.js` ASSETS.
  - **How it reads a board, NO ML and nothing leaves the phone:**
    1. `detectBoard()` finds the 8×8 grid by a **joint comb-correlation search**
       over (square-size, origin) on the vertical/horizontal edge profiles around
       the tap — it slides a 9-tooth comb and keeps the period+phase whose teeth
       all land on profile support. **This replaced a first attempt at "longest
       run of evenly-spaced peaks", which locked onto piece-internal strokes
       (found spacing 15 instead of 44). Do not go back to peak-picking.**
       A checkerboard/flat-paper parity test rejects tables and text blocks.
    2. Classification compares **edge maps** (per-square gradient-magnitude,
       blurred + L2-normalized), NOT raw pixels — an edge map is flat over the
       single-shade square background, so a piece reads the same on a light or a
       dark square. Empty = low edge energy (`emptyThresh`, learned at calibration).
    3. **Calibration is once per book**: the first long-press shows the cropped
       board and asks "¿Es la posición inicial?" One "yes" captures all 12 piece
       templates from `START_GRID` and stores them via
       `db.updateBookMeta(id, {templates})` — a NEW field on the book record, NO
       `DB_VER` bump (still 4), device-only like the Blob.
  - **Where it opens: the existing Setup screen (`Setup.open(fen)` in app.js),
    always — never straight to Analysis.** Setup is the editable board with
    Análisis/Jugar buttons, so a confident read and an unsure read take the SAME
    honest path: the user eyeballs and can fix any square before playing. This is
    the honest-degradation requirement met structurally. `Setup` is now imported
    into read.js; leaving Read for Setup runs `showScreen()`'s leave hook, which
    closes the book. **Verified end-to-end: calibrate → lands in Setup with the
    start position, templates persisted.**
  - **When unsure it says so:** `classifyBoard` returns `confident` = (no square
    with a weak/ambiguous match AND exactly one king each side). `confident=false`
    fires a "check the board" toast but STILL opens Setup with the best guess.
    **Proved live:** templates from one figurine set classifying a diagram drawn
    in the app's OTHER piece set → board still found, `confident=false`,
    `maxD1` 0.112 vs 0.005 for a matching book, FEN still returned. A start and a
    real Ruy-Lopez midgame in the SAME style both read to the **exact** FEN and
    `confident=true`.
  - **Long-press without breaking Stage 1's gestures:** a stationary single
    pointer held 500 ms (`LONGPRESS_MS`) fires, armed only while the gesture is
    still `undecided`; the first swipe/pan movement, a second finger (pinch), or a
    lift disarms it, and `longFired` swallows the trailing tap/​page-turn.
    **Verified the Stage 1 harness still green: page turn, swipe-suppression
    (turns page, tab unchanged), page memory all pass.** Double-tap and pinch
    are untouched (they cancel the timer).
  - **Escape hatch:** the book's ⋯ menu gains "Volver a aprender las piezas" once
    calibrated (`read_recalib`) — clears `templates`, so the next long-press
    re-asks. The right fix when the first "yes" was wrong or the style was misread.
  - **9 new bilingual `read_diagram_*` / `read_calib_*` / `read_recalib*` strings**
    (js/i18n.js), one CSS block `.read-calib-img` (white mat so a light-square
    board stays readable in dark mode — verified in both themes over CDP
    screenshots).
  - **Known limits (do not chase, honest fallback covers them):** turn defaults to
    White and castling to `-` (a scan can't prove either — user sets them in
    Setup); board orientation assumes White-at-bottom (a flipped diagram reads
    upside-down → user fixes in Setup). Detection tuned/verified on synthetic
    diagrams drawn with the app's own figurine SVGs on a shaded board — a faithful
    per-book template scenario, but NOT yet run against a scan of a real printed
    book. Stage 1 still owes its real-finger pinch check on the phone.

- **READ TAB — STAGE 1: PDF READER (2026-08-30).** Committed on `main`, NOT
  pushed/deployed yet. `sw.js` cache bumped to `chess-training-center-v83`.
  Verified in headless Chrome over CDP (the in-app pane never composites, so
  rAF never fires and PDF.js's chunked render stalls there — real Chrome is
  fine; see `tools/cdp-verify.mjs`). Stage 1 is the reader ONLY — NO diagram
  detection (that is Stage 2, unstarted; do not stub it).
  - **New module `js/read.js`** (do NOT fold into app.js). Exports
    `init()`, `refresh()` (draw the shelf), `closeBook()` (destroy the PDF +
    free memory), and `importFile(file)` (the import path, shared by the picker
    and tests). PDF.js is `import()`-ed lazily on first open/add.
  - **PDF.js** = Mozilla pdfjs-dist 6.3.289, Apache-2.0, LEGACY MINIFIED build,
    self-hosted: `vendor/pdf.min.mjs` (precached in sw.js) + the ~1.3 MB
    `vendor/pdf.worker.min.mjs` (NOT precached — cached on first use, like the
    Stockfish wasm; vendor/ is CACHE_FIRST). Shipped WITHOUT cmaps/ and
    standard_fonts/ — add only if a real book renders wrong. Apache-2.0 notice
    added to the open-source section of `js/legal-data.js` (both languages).
  - **Storage:** `js/db.js` is now `DB_VER = 4` — added a `books` store
    (index `openedAt`) via the stepwise `if (e.oldVersion < 4)` pattern
    (in-place upgrade verified: v3 data survives). New db fns:
    `listBookSummaries()` (shelf list, strips the Blob), `addBook()`,
    `getBook()`, `updateBookMeta()`, `deleteBook()`. Book record =
    `{id,name,blob,size,cover(dataURL),pageCount,page,addedAt,openedAt}`.
    `'books'` added to `clearAllLocalData()`; deliberately NOT in
    `clearSyncedProfileData()` (sign-out must not delete an un-uploaded library).
  - **HARD RULE kept:** books NEVER go to Firebase. Firestore sync is
    allowlist-based (`SYNCED_KEYS`, kv-only), so a separate `books` store cannot
    sync. No "back up my books" button — do not add one.
  - **App wiring (js/app.js):** `'read'` added to `SCREENS`, to `MENU_AREA`,
    and to `showScreen()` (refresh on enter, `Read.closeBook()` on leave).
    `Read.init()` in `main()`. `relabel()` refreshes the shelf on language
    switch. capRows() has a Books row (`cap_books`/`cap_books_val` = "limited by
    storage"). `#read-stage` added to `SWIPE_SAFE` so a page-turn gesture can
    never trigger `goAdjacentTab` (verified: swipe turns the page, tab stays).
  - **Menu:** `🔖` "Leer"/"Read" destination in `#tabbar`, between Play and
    Profile; `TAB_ORDER` picks it up automatically.
  - **Quota:** up-front `navigator.storage.estimate()` check refuses a book that
    won't fit (names both numbers, saves nothing — verified); mid-write
    `QuotaExceededError` is caught (single-record tx rolls back). First import
    calls `navigator.storage.persist()` once (kv flag `booksPersistAsked`); a
    quiet shelf line shows only while `persisted()` is false. Shelf shows
    "N books · size · free".
  - **Reader gestures** (all custom, `#read-stage` is `touch-action:none`):
    one finger turns pages / pans a zoomed or tall page, two fingers pinch-zoom
    (max 4×), double-tap toggles 1×/2×. Page position saved (throttled) and
    flushed on close — reopen returns to the same page (verified across close
    AND an offline reload).
  - **Dev tools (not shipped to the app):** `tools/make-test-pdf.mjs`
    (generates a valid N-page test PDF) and `tools/cdp-verify.mjs` (the headless
    verification harness). Serve the app and run
    `node tools/cdp-verify.mjs http://localhost:<port>` after copying a test PDF
    to `__test-book.pdf` in the app root.

- **CAP COUNTERS + A LIMITS & STORAGE PAGE + BACKUP/RESTORE ALL BASES
  (2026-08-30).** Committed (`4d9d6b2`) on `main`, NOT pushed/deployed yet.
  `sw.js` cache bumped to `chess-training-center-v82`. Browser-verified at 375px
  in light AND dark. Three parts, all reusing existing helpers — do NOT rebuild.
  - **Part A — live counters.** `paintCapCounter(id, used, cap)` (exported from
    js/app.js) paints a `used/cap` pill, gold (`.cap-counter.low`) when one slot
    is left or none. `Base.renderBases()` paints `#base-count` from
    `basesCache.length`/`MAX_DATABASES`; `Masterclass.renderList()`
    (js/masterclass.js) paints `#mc-count` from `owned().length`/
    `MAX_MASTERCLASSES`, passing `null` (blank pill) while signed out/offline/
    unloaded so it never shows a false 0/5. Counters live in `.head-with-count`
    wrappers in index.html.
  - **Part B — Limits & storage page.** Reached from a NEW footer row in
    `#tabbar`: `#menu-limits`, an `<a role="button">` — deliberately NOT a
    `<button>`, so every `#tabbar button` selector (TAB_ORDER, swipe, `.on`,
    click, tour) still matches exactly the seven destinations (verified: still
    7). It calls `closeMenu(false)` then `openLimitsSheet()`. The page
    (`openLimitsSheet` + `capRows()` in js/app.js) lists all nine caps, each
    read from the enforcing constant, never retyped: `MAX_DATABASES`,
    `MAX_MASTERCLASSES`, `MAX_CHAPTERS`, `MAX_CHAPTER_BYTES` (shown as
    `round(/1000)` KB = 100 KB), `MAX_MEMBERS`, `MAX_SEARCH_RESULTS` (NEW
    module const, lifted from the local `const LIMIT = 2000` in the advanced
    filter), `MAX_ENGINE_LINES`, `MAX_RADAR_THEMES`, `Rush.MAX_STRIKES`. Plus a
    plain-language storage paragraph (`storage_body`) and the two Part C
    buttons. All new strings are in js/i18n.js (`limits_*`, `cap_*`,
    `storage_*`, `backup_*`, `restore_*`), both languages.
  - **Part C — backup/restore all bases, FILES ONLY (no Firebase).**
    `backupAllBases()` writes every base + its games to one JSON
    (`{app,type:'bases-backup',version:1,bases:[{name,games:[…]}]}`) — base
    names preserved, local `id`/`baseId` stripped — through `shareTextFile()`
    (NEW generic share/download helper; `sharePgnText()` now delegates to it).
    `restoreBackup(file)` validates the JSON, then guards BOTH required cases:
    a name already present is a duplicate → `askDupChoice` (skip / bring as
    copies, copies get a ` (copia)` suffix); creating past `MAX_DATABASES` →
    `askCapChoice` (fill only what fits / cancel). Recreates via
    `db.addGamesBatch` (js/db.js) in 500-game chunks — never one giant
    transaction — and is cancellable mid-run. `pickBackupFile()` makes its own
    hidden `<input type=file accept=json>` on demand. Verified: happy path,
    copy+cap, skip, and the three bad-file toasts.

- **THE BOTTOM TAB BAR IS NOW A MENU BUTTON + SLIDE-UP SHEET (2026-08-29).**
  Committed (`858b927`), NOT pushed/deployed yet. `sw.js` cache bumped to
  `chess-training-center-v80`. Browser-verified at 375px in light AND dark, in
  both languages, and the guided tour was walked through the change.
  - The old `#tabbar` (seven always-on buttons) is replaced by one centred
    `#tabmenu-btn` (index.html) that shows `☰` + the current screen's name.
    Tapping it opens `#tabbar`, which is now styled as a bottom sheet (2-col
    grid, icon over label); a `#tabsheet-backdrop` catches outside taps.
  - **The seven destination buttons still live in `#tabbar`, unchanged (same
    `data-screen`, same order).** That is deliberate and load-bearing: `TAB_ORDER`
    (js/app.js) and swipe nav, `showScreen`'s `.on` highlight, the click
    handlers, and every `#tabbar button[data-screen=…]` guided-tour target all
    keep working without being touched. Do NOT "tidy" those buttons out of the
    DOM or into JS-built markup — it silently breaks all four.
  - **Menu ↔ history** (js/app.js `openMenu`/`closeMenu`/`navigateFromMenu` +
    the `popstate` handler): opening pushes one history entry so Android back
    closes the menu and nothing else; a programmatic close consumes that entry
    (`history.back()`), and a tapped destination defers its `showScreen` through
    the same back (`pendingNav`) so the entry is replaced, never stacked. The
    label is set by `updateTabMenu()`, called from `showScreen` and `relabel`.
  - **The guided tour** (js/tour.js) opens the menu for its six tab-tap steps
    via `ctx.openMenu()`/`ctx.closeMenu()` — `tourCtx()` binds them with
    `push:false`, so tour highlighting never touches history. The ring lands on
    the destination inside the open sheet; tap → navigate → advance, verified.
  - `tab_base` renamed to `'Bases'` in EN too (js/i18n.js); one new key
    `nav_destinations` for the sheet's aria-label. `prefers-reduced-motion`
    disables the slide/fade (css/style.css).

- **MENU BUTTON LABEL NOW FOLLOWS THE LIT TAB, NOT THE RAW SCREEN (2026-08-29).**
  Committed on `main`, NOT pushed/deployed. `sw.js` cache bumped to
  `chess-training-center-v81`. Fixes the cosmetic mismatch where opening a game
  from a Base or from Play history left the button reading "Analysis" while the
  sheet highlighted "Bases"/"Play" (activeScreen stays `'analysis'` but
  `updateBaseNav()`/Masterclass override the `.on` highlight).
  - `updateTabMenu()` (js/app.js) now reads its label from the currently-lit
    `#tabbar button.on [data-i18n]` when one exists, falling back to the
    `MENU_AREA` map only when no tab is lit (rush/blind/leaderboard/friends/
    public-profile light none). It is now `export`ed.
  - A single `updateTabMenu()` call was added at the end of
    `Analysis.updateBaseNav()` (covers the inBase/inMc/inHist `.on` overrides and
    the no-override case), and one in `Masterclass.lightBasesTab()`
    (js/masterclass.js, which already imports from app.js — no new import cycle).
  - Verified in the browser pane at 375px, both languages: base game → "Bases",
    Play-history game → "Play"/"Jugar", Masterclass chapter → "Bases", the
    leaderboard fallback → "Profile"/"Perfil", and all seven normal tabs still
    light and label correctly. TAB_ORDER/swipe, menu↔history, and the tour were
    not touched.

- **THE THREE BASES/MOVE-LIST BUGS ARE FIXED (2026-08-28) — HANDOFFS task 1.**
  All four sub-bugs were reproduced, fixed and browser-verified at 375px in
  light AND dark, then the fake test base was deleted. `sw.js` cache bumped to
  `chess-training-center-v79`. Committed, not pushed/deployed yet.
  - **Bug 1 — ◀ ▶ game arrows always failed.** `Analysis.gotoAdjacentGame()`
    called `parsePgn(g.pgn)` on a *summary* (no PGN text), so it always threw
    `import_failed`. Now `async` and fetches the full record the way
    `Base.openGame()` does (`g.pgn ? g : await db.getGame(g.id)`), guarding a
    record that genuinely has no PGN. `js/app.js` `Analysis.gotoAdjacentGame`.
  - **Bug 2 — arrows now follow the visible list, not the whole base.** New
    single source of truth `Base.visibleGames()` returns the games as displayed
    (advanced filter → quick-search box). `Base.renderGames()`,
    `Analysis.gotoAdjacentGame()` and `Analysis.updateBaseNav()` all read it, so
    the arrows, the grey-out maths and the on-screen list can never disagree.
  - **Bug 3 — search/filter no longer thrown away on ← Back.** `Base.openBase()`
    only clears `game-search` + `filter` when the base id actually CHANGES.
    Returning to the SAME base keeps them and RE-RUNS the filter via
    `applyFilter(this.filter)` against the freshly loaded `gamesCache` (never the
    stale `filterResults` array — verified a game deleted meanwhile drops out of
    the restored chip). Switching to a different base still clears — verified.
  - **Bug 4 — board no longer jumps on games with long comments.** Root cause on
    this build: `renderMoves()`'s `curEl.scrollIntoView({block:'nearest'})`
    scrolled the `<main>` scroll container (283px measured), which carries the
    board — not `document.scrollingElement`. Replaced with a container-only
    scroll: adjust `#ana-moves`'s own `scrollTop` by how far the current move
    sits outside its box; `<main>` is never touched. The two other `renderMoves`
    (Play, Trainer) already used `scrollTop`/`scrollHeight` and were left alone.

- **THE FIRESTORE WRITE RULES ARE VERIFIED (2026-08-20). This was listed as an
  open unknown "for months" and it was already closed — the note saying only the
  READ rules had ever been tested is STALE. Do not re-open it, and do not plan a
  live write test.** No production write was made and none is needed: the whole
  thing runs on the local Firestore emulator via `npm.cmd run test:rules`, which
  loads `firestore.rules` from disk into an empty local database. The suite was
  RUN, not read: **169 tests, 169 passing, 0 failing.**
  - **The four write claims that were asked for are each proved by a named,
    passing test — no new tests were written, because all four already existed:**
    1. *A signed-in user CAN write their own `/users/{uid}`* —
       `existing.test.js` "the owner can write their own document", plus
       `notifications.test.js` "creating the user document for the first time
       succeeds" (the create path, where `resource` is null, is a separate case
       and is covered separately).
    2. *A signed-in user CANNOT write someone else's* —
       `existing.test.js` "another signed-in user CANNOT write it" and
       `notifications.test.js` "a stranger CANNOT write someone else's user
       document".
    3. *An anonymous client cannot write either* —
       `notifications.test.js` "a signed-out visitor CANNOT read or write a user
       document" (it asserts BOTH, in one test) and `existing.test.js`
       "a signed-out visitor CANNOT write".
    4. *The leaderboard cannot be written with a forged rating or someone else's
       uid* — `existing.test.js` "another user CANNOT write someone else's
       entry", "CANNOT write an impossible puzzle ELO", "CANNOT write a negative
       puzzle ELO", "CANNOT write an impossible Rush score", "CANNOT write a
       puzzle ELO as a string", and "CAN write a believable top score" as the
       matching allow-case.
  - **Well beyond the four**, the same green run also covers the field allowlist
    (email, real name and date of birth are each refused on the public
    document), the private-profile guarantee, the 60-character text bounds, the
    `lastNudgeDate` / `lastWarnDate` function-owned fields, the whole
    `fcmTokens` block, and every Friends and Masterclass clause.
  - **No rule was weakened and no rule was found to be wrong.** Nothing in
    `firestore.rules` was edited, so there was no rules commit and **no rules
    deploy for this**.
  - **The file that was tested IS what is live.** The emulator only ever proves
    the file on disk, so this was checked separately rather than assumed:
    `firestore.rules` is committed and clean, its last change is `a59db0e`
    (2026-08-20, the notifications rules), and the note at the top of
    `docs/superpowers/plans/2026-08-17-notifications.md` records that commit as
    **built and deployed** the same day. So live and file agree as of
    2026-08-20 and no `rules:deploy` is owed.
  - **Firebase has no "download the live rules" CLI command** — `firebase
    firestore:*` has no rules subcommand and `gcloud` is not installed on this
    machine. The only ways to read the deployed text are the Firebase console's
    **Firestore → Rules** tab and the REST Rules API. If drift is ever suspected,
    re-running `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy` is
    idempotent and settles it.

- **THE FIREBASE WEB API KEY IS RESTRICTED BY HTTP REFERRER — Adrian did it in
  Google Cloud Console on 2026-08-20 and confirmed the site still works. BOTH
  pre-launch security items are now closed. Do not re-open either one and do not
  ask him to re-check them.**
  - **The key was ALREADY partly restricted before this** — a session had
    assumed it was wide open, and it was not. Four entries were already on it,
    almost certainly written by Firebase itself at project creation:
    `http://localhost/*`, `https://chess-training-center.firebaseapp.com/*`,
    `https://chess-training-center.web.app/*` and
    `https://chesstrainingcenter.app/*`. **Check the console before claiming a
    Google-side setting is unset.**
  - Adrian added three more: `https://www.chesstrainingcenter.app/*`,
    `http://localhost:8811/*` and `http://127.0.0.1:8811/*`. Seven entries
    total. **`8811` is the dev port from `.claude/launch.json`** — if that port
    ever changes, this list has to change with it.
  - **Both `localhost` forms are listed deliberately, and the plain
    `http://localhost/*` was NOT removed.** Whether a portless entry also covers
    port 8811 was not established either way, so the explicit ones were added
    rather than guessed at. Do not "tidy" the duplicate away.
  - **`chess-training-center.firebaseapp.com/*` is the lockout trap. Never
    remove it.** `js/firebase.js:107` uses `signInWithPopup`, and that popup is
    served from `chess-training-center.firebaseapp.com/__/auth/handler`, which
    calls Google's identity API *from that domain* with the same key. Without it
    **Google sign-in breaks for everybody, live site and Android TWA both**,
    while the rest of the app looks perfectly fine — so it would not be caught
    by a casual look.
  - **The TWA needs no entry of its own.** A Trusted Web Activity is Chrome
    rendering `chesstrainingcenter.app`, so its requests already carry that
    origin. The Android package name `com.chesstrainingcenter.app` belongs in
    `.well-known/assetlinks.json`, which is already correct — it is not a
    referrer and does not go on this page.
  - **"API restrictions" (the second section on that page) was deliberately left
    on "Don't restrict key".** Only *Application restrictions* was touched.
    Restricting the API list is a different control and getting it wrong takes
    down sign-in and Firestore.
  - **To undo, if it ever misbehaves:** same page, set **Application
    restrictions** to **None**, Save, wait 5 minutes. No data is affected and it
    can be flipped back and forth freely.
  - **What this rests on: Adrian's own confirmation ("all done, looks good so
    far") after applying it.** No session watched a post-change Google sign-in,
    and there was no separate 375px / light-and-dark / both-languages pass for
    it — there is nothing visual to check. Deliberate stopping point, not an
    oversight. If something surfaces in real use he will say so.
  - **Do not sell this as a data-security fix.** A Firebase web API key is a
    public project identifier, not a secret; it is *meant* to ship in
    `js/firebase.js` and every Firebase web app exposes one. This restriction
    limits quota abuse from other people's sites. What protects the data is
    `firestore.rules` (169 passing tests — see the entry below) plus App Check.
    "The key is visible in the source" is not a vulnerability and must not be
    written up as one.

- **MASTERCLASS IS CLOSED — Adrian stopped work on it on 2026-08-20.** He said
  he does not want to touch Masterclass any more and that **there is no real bug
  so far**. **This note overrides everything written below about BUG A (a
  follower cannot leave the stored chapter PGN) and BUG B (Stop does not remove
  `live/state`), and everything in `docs/MASTERCLASS-LIVE-CHECKLIST.md`.** Those
  write-ups stay in the repo as a record of what was observed, but they are
  **not a work queue**. Do not plan them, do not patch them, do not put
  Masterclass in a handover prompt as the next task, and do not offer it as a
  suggestion. Only reopen it if Adrian raises Masterclass himself.

- **Dated keys follow the player's own calendar day, not UTC (2026-08-20,
  `ef52616`, deployed and confirmed live by Adrian).** `monthStr()` built the
  monthly-leaderboard season key from `toISOString()`, which rolls over at 19:00
  Panama time, so on the last evening of a month a Rush score was filed under the
  NEXT month and the player's own row vanished from the "This month" board while
  their local calendar still said the old month. It now slices `todayStr()`,
  which was already local. The three PGN `Date` headers had the same bug and now
  reformat `todayStr()` too. **`todayStr()`, `streakCount`, `streakLastDate` and
  `bestStreak` were deliberately NOT touched** — they were already local and
  correct; do not "fix" them. `toISOString()` is now gone from `js/` apart from
  one mention inside the explanatory comment at `js/app.js:1098`. `sw.js` v76 →
  **v77**. No `firestore.rules` change, so **no rules deploy for this**.
  - **Both halves of the deploy were verified**, not assumed: the live
    `sw.js` flipped v76 → v77 about 40s after the push, and live
    `js/app.js` was fetched and checked to contain the new `monthStr()` and all
    three rewritten `Date` headers.
  - **Adrian confirmed on production, signed in as himself, that his own Rush row
    appears on the "This month" board. That closes this work — do not re-test it.**

- **Masterclass — the first production run happened on 2026-08-19 and STOPPED
  PART-WAY THROUGH PART C. Stage 1 is code-complete but NOT proven.** Two real
  first-contact failures, both written up in full in
  `docs/MASTERCLASS-LIVE-CHECKLIST.md`, whose "Ever run live?" table has been
  rewritten to say what actually happened rather than what was planned.
  - **Proved live and working:** `addMembers()`, `setMemberCount()` and
    **`pushLiveState()`** — the live document is written with correct
    `chapterId`, `path`, `fen`, `drivenBy` and a server `updatedAt`, and it
    updates as the owner moves. `watchLiveState()` delivered its first snapshot
    and the follower was carried to the right chapter by itself.
  - **BUG A — a follower cannot leave the stored chapter PGN.** The live
    document carries a POINTER (`path`, child indices) into a PGN both sides are
    assumed to share, but the moves the owner plays *during* a lesson are never
    saved to the chapter, so they do not exist in the follower's parsed copy.
    `gotoPath()` returns false, `findFen()` fails too because it searches that
    same incomplete tree, and `applyLive()` deliberately does nothing. **The
    follower's board freezes silently after the first jump.** Confirmed twice
    over: production held `path: "0.0.0.0.0.0"` against a chapter PGN that stops
    at `Bb5` (five plies), and a local reproduction produced the identical path
    and the identical FEN with `pathResolved: false`.
    **This needs its own plan** — the live document has to carry the MOVES, which
    means a `firestore.rules` change with a size cap plus tests, a payload that
    grows through a lesson against the 1-per-second throttle, and an
    `applyLive()` that EXTENDS the follower's tree rather than walking it. Do not
    patch it in a debugging session; that is how the two bugs in the original
    plan's `deleteMasterclass()` got written.
  - **BUG B — Stop does not remove `live/state`.** The owner pressed Stop, the
    document survived, and the follower stayed on "Following the class". The
    `allow delete: if mcIsOwner(mcId);` clause **is** deployed (checked in the
    console's Rules tab), so it is not commit 6's missing rule. Prime suspect is
    a real race: `pushLiveState()` fires `setDoc()` without awaiting it, and
    `stopLiveState()` can cancel a *pending* write but not one already in flight,
    so the last move's write can land after the delete and recreate the document.
    The alternative is a refusal Adrian could not see — he was on a phone.
    **Run the member side in a desktop incognito window and read the console
    before writing any fix.**
  - **Everything from step 19 on is still NEVER RUN**: the rest of Part C,
    the whole of Part C2 (the Reconnecting bar and the offline section — the
    entire commit 7 connection layer), and the whole of Part D
    (`removeMember()`, `leaveMasterclass()`, `deleteMasterclass()` and the step
    36 console check).

- **Auth — a profile is not complete without a username (2026-08-19, deployed
  and verified live).** `Auth.needsProfileCompletion` was gated on `firstName`
  alone, so every account created before usernames existed — and every Google
  sign-in, which supplies a display name and nothing else — passed the gate
  forever and was never asked. `updatePublicLeaderboardDoc()` deletes
  `usernameLower` when there is no username, so the effect was an account
  visible everywhere in the app **except friend search**, which is the one place
  it has to be findable. This is why `Impervious` could not be found by
  `searchByUsername()`. The gate now requires both, and the dialog prefills the
  first name, last name and date of birth already held — every field in it is
  required, so an account that only lacked a username would otherwise have been
  blocked by an empty first-name box. **Google display names are deliberately
  NOT adopted as usernames**: they are not unique, and they are usually a real
  full name, which would make real names searchable by anyone typing three
  letters. `sw.js` v70 → **v71**. No rules change, so no rules run. Confirmed
  fixed by Adrian against production the same day.

- **Masterclass — commit 7 of 7 is done (2026-08-17, `50d0f43`). Stage 1 is
  CODE-COMPLETE.** Connection state: the Reconnecting bar, the offline
  Masterclass section, and one real bug fixed on the way. `sw.js` v69 →
  **v70**. `firestore.rules`, `firestore.indexes.json` and every test are
  untouched — **still 124 passing, 0 failing**, and **nothing needs
  deploying but the site itself.**
  - **`watchLiveState()` now passes `{ includeMetadataChanges: true }`, and that
    flag is LOAD-BEARING.** `onSnapshot` by default only raises an event when the
    document **data** changes. Losing the server is a *metadata*-only change, so
    an idle viewer whose connection dropped would never have been called back
    and **the Reconnecting bar would never have appeared at all.** The plan's
    Task 7 did not mention this. The flag costs **no document reads** — the extra
    events are raised locally from the same snapshot, and Firestore bills reads,
    not callbacks. **Do not remove it as noise.**
  - **A cached `null` is no longer believed, and this was a real bug.** The error
    path in `watchLiveState()` hands the callback
    `(null, { fromCache: true })`, and the old code read that as "the teacher
    stopped": it **wiped the last known position off the viewer's board and
    toasted "The class stopped broadcasting" every time their signal dropped.**
    A disappearance is now only accepted when `fromCache` is false, i.e. when the
    server said it. A cached null draws Reconnecting and changes nothing else.
  - **The Reconnecting bar REPLACES the live text in the same two containers**
    (`#mc-live-bar` and `#ana-mc-live`) — not a second line, not a takeover.
    Adrian's decision, and the reasoning is load-bearing: the bar sits directly
    above the board on Analysis at 375px, so a second line would push the board
    down and back up on every wobble, and taking the bar over entirely would
    remove **Stop following** at the one moment a viewer most wants a way out of
    a frozen board. Geometry and button position are byte-identical between the
    two looks; only the colour and the text change.
  - **Grey, not gold** — `.mc-live-bar.mc-live-stale` swaps `--gold-bg` /
    `--gold` for `--panel2` / `--muted`. Gold in this app means something is
    happening; the whole message here is that we cannot tell.
  - **Two signals feed one expression.** `stale` is
    `this.liveStale || !navigator.onLine`. The browser's `offline` event fires
    the instant the interface drops; Firestore can take several seconds to decide
    it has lost the server. Neither alone is both prompt and reliable. **Owners
    are excluded from it entirely** — an owner has no listener (they never watch
    their own document), and `goLive()` / `stopLive()` already toast
    `mc_needs_network`.
  - **Disconnected with nobody live shows a text-only bar, no button.** Following
    applies to a broadcast we cannot see. A *hidden* bar would be the app quietly
    claiming the class is not live, which is exactly what it does not know.
  - **The snapshot callback became a named method, `onLiveSnapshot(mc, state,
    meta)`.** The real listener cannot run from this machine at all (App Check),
    so a snapshot arriving from the cache is unreachable outside production
    unless it can be called directly. `watch()` is now one line.
  - **`liveKey()` skips a redundant re-apply.** `includeMetadataChanges` makes
    the same position arrive twice as routine — once from the cache, once from
    the server — and re-applying it would re-run `gotoPath()` and
    `Analysis.refresh()` for nothing. It is used **only** to skip work, never to
    decide what to draw.
  - **Offline replaces the WHOLE Masterclass section on the Bases tab**, even
    when a list is already in memory from before the connection went. Every row
    leads to a screen that cannot load its chapters or its members, so leaving
    them tappable would trade one honest message for three broken ones.
    `renderList()` now has **five** states, and the offline check is FIRST —
    ahead of signed-out. `mc_needs_network` already said "your local databases
    still work offline", which is why it was reused rather than a new string
    written.
  - **`load()` returns early when offline.** A Firestore read with no network
    never resolves and never rejects, so it would sit on the `await` forever and
    leave the section stuck on "Loading…" *behind* the offline message. The
    `online` listener is the retry, **and it only refetches when the Bases tab is
    actually open** — a reconnect while somebody is solving puzzles costs no
    reads.
  - **Only ONE new string, `mc_reconnecting`.** Everything the plan's Task 7
    listed already existed: its `mc_live`, `mc_following` and `mc_back_to_live`
    are `mc_live_on`, `mc_live_following` and `mc_follow_resume`, and
    `mc_member_added` shipped in commit 5 deliberately **without** the plan's ✓.
    The plan's Task 7 string block is stale — do not paste it in.
  - **`fetchMasterclass()` is STILL unused, and stage 1 ends that way.** Commits
    4 and 6 both predicted it would earn a caller and it did not. Commit 7 has no
    use for it either: rereading the parent is a document read that changes
    nothing on screen. **Do not add a call for tidiness.** Stage 2 or nothing.
  - **One more real defect fixed: the stale member count never actually
    corrected itself.** Commit 5's note (and the comment in the code) claimed the
    owner's Bases row was fixed "next time they open the class". It was not —
    `bumpCount()` was only ever called from `addMembers()` and
    `removeMember()`, so after a member **left**, the number stayed one too high
    until the owner happened to add or remove somebody. `loadMembers()` now calls
    it, and `bumpCount()` **returns without writing when the count is already
    right**, so opening a class costs zero writes in the normal case and exactly
    one when it has drifted. **The documented behaviour is now the real
    behaviour.**
  - **Firestore has no on-disk cache to go stale with** — `getFirestore(app)` is
    called plain, with no `enableIndexedDbPersistence` and no
    `persistentLocalCache`. Confirmed, not assumed: after a reload while offline
    the only IndexedDB database matching /firestore|firebaseLocalStorage/ is
    `firebaseLocalStorageDb`, which is **Auth's** store, not Firestore's. So a
    viewer who reloads offline sees the offline message, never stale content.
  - Verified over CDP at 375px in light and dark, in **both languages**: nine bar
    states drawn apart (viewer following / browsing / stale-following /
    stale-browsing / stale-nobody-live / hidden-nobody-live / offline-event-only,
    owner idle and owner live, both while offline and both correctly NOT grey), a
    300-character bar text keeping the button at **355** with `scrollWidth` 375,
    a cached null keeping the position, a server null ending it, `applyLive()`
    called once for cache-then-server and again only on a real move, a snapshot
    for a class already left being dropped, `closeLive()` clearing the flag, all
    six list states, and a **reload while offline** loading the shell from
    `chess-training-center-v70` with the offline message showing and the local
    base list still working. Zero page errors.
  - **NOT YET VERIFIED AGAINST PRODUCTION.** It goes out with the deferred
    commits 5 + 6 + 7 two-account run — the numbered checklist is in
    `docs/MASTERCLASS-LIVE-CHECKLIST.md`, written 2026-08-17. **Step 0 of that
    run is re-adding the friend**: `blockUser()` removed the Zugzwang ↔
    miguelafuentesm friendship and the invite picker only shows friends.
  - **Stage 1 is code-complete. There is no commit 8.** Stage 2 (the editor role,
    link sharing) is sketched in the plan and needs a plan of its own.

- **Masterclass — commit 6 of 7 is done (2026-08-17, `9be6cb4`). The live
  board: the owner broadcasts the position they are on and members follow it.**
  `sw.js` v68 → **v69**. **`firestore.rules` CHANGED and must be deployed.**
  Tests went 122 → **124 passing, 0 failing**.
  - **The rules change commit 5 owed is done.**
    `masterclasses/{mcId}/live/{docId}` now has
    `allow delete: if mcIsOwner(mcId);`. The block had one `allow write`, and
    every clause in it reads `after()` — `request.resource.data`, which is
    **null on a delete** — so the rule *errored* and denied, and **nobody could
    remove `live/state` at all**. The emulator trace shows it exactly:
    `evaluation error at L336 for 'delete'`, then the new clause at L352
    answering properly. Tests **36** (owner can delete) and **37** (viewer
    cannot). `deleteMasterclass()` has been attempting this delete since commit
    3 and starts working the moment the rules are deployed.
  - `js/firebase.js` gained `LIVE_THROTTLE_MS` (1000), `pushLiveState()`,
    `stopLiveState()` and `watchLiveState()` — **the only `onSnapshot`
    listener in the whole app.**
  - **The throttle is load-bearing.** Firestore's sustained write limit on a
    SINGLE document is about one per second and this document is written on
    every move. Writes are coalesced on a **leading edge** — the first move of
    a quiet minute goes out at once, only a burst is merged, and the newest
    pending state wins. A trailing-only throttle would put a second of lag on
    every move.
  - **`stopLiveState()` cancels the queued write BEFORE deleting.** Without
    that, an owner who moves and immediately taps Stop deletes the document and
    then the pending flush writes it straight back, and the class looks live
    with nobody driving.
  - **Position travels as a PATH of child indices ("0.0.1"), never a
    `Node.id`.** `Node.id` in `js/tree.js` comes from a module-level counter
    that starts at 0 on page load, so the ids the teacher and the student get
    for the same PGN depend on what each opened earlier. A path is a property
    of the PGN itself. **`nodePath()` and `gotoPath()` are exported from
    `js/masterclass.js`** so the round trip can be exercised directly — one of
    them runs on the teacher's machine and the other on the student's, so a
    test that calls only one proves nothing.
  - **The FEN is the fallback, and "neither resolves" means stay put.** A
    wrong node is worse than not moving, because the follower cannot tell.
  - **`Analysis.refresh()` is the single broadcast hook.** Every board change
    on that screen goes through it, so a move, an arrow key, a click in the
    moves list and a variation jump all broadcast without four separate hooks.
  - **Broadcasting is never automatic** — the owner switches it on. Only the
    owner drives in stage 1; the control is hidden from members even though the
    rules would refuse them anyway, because a button that can only fail is
    worse than no button. `'editor'` sits on the member side of that line until
    stage 2.
  - **A follower's default is Following ON**, so opening a class that is live
    puts you in the lesson. On reconnect or on "Back to live" the viewer jumps
    to where the teacher is **NOW** — the missed moves are deliberately not
    replayed. It is a lesson, not a video.
  - **The bar is drawn in TWO places from one piece of state**: `#mc-live-bar`
    on the Masterclass screen and a new `#ana-mc-live` above the Analysis
    board, because once you are following you are on the Analysis screen and
    Stop following has to be reachable. `Masterclass.renderLive()` fills both;
    `Analysis.updateBaseNav()` calls it.
  - **The listener is self-healing.** `closeLive()` runs on ←, Leave, Delete,
    sign-out and opening another class, but the tab bar can take you off the
    screen without passing through any of them — so a snapshot that finds
    nobody looking ends the subscription itself.
  - 11 new bilingual strings (`mc_live_off`, `mc_live_start`, `mc_live_on`,
    `mc_live_open_chapter`, `mc_live_stop`, `mc_live_following`, `mc_live_now`,
    `mc_follow_stop`, `mc_follow_resume`, `mc_live_ended`) and two CSS rules on
    `.mc-live-bar`.
  - Verified over CDP at 375px in light and dark, in **both languages**: all
    six bar states drawn apart (owner idle / live-no-chapter / live-with-
    chapter, viewer nobody-live / following / browsing), the path round trip
    across **two independently parsed copies** of the same PGN including a
    variation branch and the root, a bogus path returning false, following into
    a variation, following on down the same tree **without re-parsing it**,
    Stop following holding still while the teacher moved, Back to live snapping
    to the current position, the FEN fallback, "neither resolves" not moving,
    a state arriving before the chapter list, `closeLive()` twice, a forced
    300-character bar text still keeping the button at 355, `scrollWidth`
    exactly 375 everywhere, and **zero page errors**.
  - **NOTHING IN THIS COMMIT HAS TOUCHED REAL FIRESTORE.** Live follow needs
    two accounts *and* a friendship, and Adrian has decided to run commits 5
    and 6 together **after commit 7**. `blockUser()` removed the Zugzwang ↔
    miguelafuentesm friendship, so **step 0 of that run is re-adding the
    friend** — a member can only be invited from the friends list.
  - **`fetchMasterclass()` is STILL unused after all.** Commit 4 predicted
    commit 6 would earn it. It did not: the live document is its own listener,
    the parent is not reread, and rereading it would be a document read that
    changes nothing on screen. Stage 2 or nothing — do not add a call for
    tidiness.

- **Masterclass — commit 5 of 7 is done (2026-08-17, `e2cba06`). Members are
  real: the owner invites friends, everyone sees who is in the class, the owner
  removes and a member leaves.** `sw.js` v67 → **v68**. `firestore.rules`,
  `firestore.indexes.json` and every test are untouched — **still 122 passing,
  0 failing**, and nothing was deployed. **No rules change was needed**: the
  members block already allows the owner to add and remove and a member to
  leave.
  - `js/firebase.js` gained `MAX_MEMBERS` (30), `addMembers()`,
    `fetchMembers()`, `removeMember()`, `leaveMasterclass()` and
    `setMemberCount()`.
  - **`addMembers()` counts failures and never names them.** The create rule
    refuses anyone who has blocked the owner, so inviting five friends when one
    has blocked you adds four and reports four. Naming the one that failed
    would make a block detectable — the same guarantee
    `sendFriendRequest()`'s single neutral toast gives. **Do not "improve" this
    into a real error message.** The two new toast strings
    (`mc_member_added`, `mc_member_added_one`) deliberately carry **no ✓**, so
    the same message still reads honestly at zero.
  - **`setMemberCount()` must send `updatedAt` as well as `memberCount`.** The
    parent update rule requires `after().updatedAt == request.time` *and*
    `keys().hasOnly(['ownerUid','name','createdAt','updatedAt','memberCount'])`,
    so a write carrying `memberCount` alone is **denied**, not merely untidy.
  - **A member who LEAVES cannot fix the count**, and this is not a bug to
    chase: only the owner may write the parent document. The number on the
    owner's Bases row goes stale by one until they next open the class, where
    `bumpCount()` corrects it. That is what "advisory" means here — the member
    list is the truth. **⚠ The "next time they open the class" half of this was
    NOT TRUE when it was written and was fixed in commit 7 (`50d0f43`)** —
    `bumpCount()` was only called from `addMembers()` and `removeMember()`. It is
    called from `loadMembers()` now, guarded so it writes only when the count
    really disagrees.
  - **No name or avatar is ever copied onto a member document.** A member
    document is `{uid, role, addedBy, addedAt}` and nothing else; names,
    usernames and avatars are read live from `/leaderboard` through the
    existing `fetchLeaderboardByUids()`, the same batch read the friends list
    and the request lists use. The picker reads `Friends.friends` — the list
    `fetchFriendUids()` already fills — rather than running a query of its own.
    `js/masterclass.js` now imports `js/friends.js`; that is a plain edge, not a
    second cycle, and `js/app.js` imports friends.js one line before
    masterclass.js so it has finished evaluating.
  - **The owner's own row gets no Remove and the owner's ⋯ menu gets no
    Leave.** The delete rule refuses both — a class with no owner-member is
    unreachable — so the buttons could only ever fail.
  - **The picker is checkboxes plus one Add button.** The plan's "one tap on a
    single row adds that one friend" half was **dropped deliberately**: one tap
    meaning two different things on the same target is a mis-tap that writes to
    somebody else's class. Tapping a row still toggles its box, because the row
    is a `<label>`. Friends already in the class are dimmed, lose their
    checkbox and gain an "Already a member" chip.
  - **With no friends yet the picker shows one line pointing at Profile →
    Friends** (`mc_no_friends`) instead of an empty dialog. Adrian's decision,
    and it is deliberately **not** a jump: `Friends.open()` exists at
    `js/friends.js:94` and would work, but it calls `showScreen('friends')`,
    which throws away the Masterclass screen being set up.
  - `membersLoaded` / `membersFailed` mirror the chapter list exactly:
    "loading", "offline" and "empty" are three different screens, and a class
    always has at least its owner, so "No members yet" on a dropped connection
    would be visibly wrong.
  - 8 new bilingual strings (`mc_member_added`, `mc_member_added_one`,
    `mc_remove_member_confirm`, `mc_invite_title`, `mc_invite_add`,
    `mc_already_member`, `mc_no_friends`) and one new CSS block, `.mc-pick`.
  - Verified over CDP at 375px in light and dark, in **both languages**: the
    loading / offline / empty states drawn apart, the role chip in owner,
    editor and viewer, an escaped `<b>xss</b>` name, a 45-character display
    name truncating with the row's right edge at 355, a member with no public
    document rendering as `?`, a viewer with no ➕ buttons and no ⋯ on any row,
    the picker with an "Already a member" row and with no friends at all,
    `document.scrollWidth` exactly 375 everywhere, and zero console errors.
  - **NOT YET VERIFIED AGAINST PRODUCTION, and deliberately deferred.** Adrian
    decided on 2026-08-17 to run this **together with commit 6, after commit
    7** — one two-account session instead of three. It needs a friendship
    before it can start: `blockUser()` removed the Zugzwang ↔ miguelafuentesm
    one during the Friends run, so **the second account has to be re-added as a
    friend first** or the invite picker has nobody in it. Nothing in this commit
    has ever reached real Firestore.
  - ~~**Commit 6 MUST add `allow delete: if mcIsOwner(mcId);`**~~ **DONE
    2026-08-17 in `9be6cb4`**, with tests 36 and 37 — see the commit 6 entry at
    the top.

- **Masterclass — commit 4 of 7 is done (2026-08-16, `2d2f47c`). Chapters are
  real: added from a base or from the board, opened in Analysis, deleted by the
  owner.** `sw.js` v66 → **v67**. `firestore.rules`, `firestore.indexes.json`
  and every test are untouched — **still 122 passing, 0 failing**, and nothing
  was deployed. **No rules change was needed**: the chapters block already
  allows create and delete for the owner.
  - `js/firebase.js` gained `MAX_CHAPTERS` (50), `MAX_CHAPTER_BYTES` (100000),
    `addChapter()`, `fetchChapters()` and `deleteChapter()`.
  - **The oversize check runs BEFORE the auth check**, deliberately: it is
    validation of the input, not of the session, so a >100 KB PGN always throws
    the same `chapter-too-big` and the UI can show a readable message instead of
    a bare permission-denied. It uses `new Blob([pgn]).size` (bytes) while the
    rule counts characters, so the client bound is the stricter of the two and
    can never let through something the rules would refuse.
  - **`fetchMasterclass()` is STILL unused, and that is the right answer.** The
    plan expected commit 4 to reread the class after a chapter write moved
    `updatedAt`. Nothing on any screen renders `updatedAt`, and bumping the
    parent would be a second write per chapter for a field nobody reads — so
    the parent is not bumped and the class document is not reread. Commit 6
    (live follow) is where it earns its place. Do not add a bump "for
    tidiness"; it costs a write every time.
  - **`chooseBase()` in `js/app.js` is now exported** — one word, no behaviour
    change, same as `askText()` in commit 2. The plan's "around line 1591" was
    stale; it is at `js/app.js:245`. Masterclass calls it as
    `chooseBase(false)`: a chapter is taken *from* a base, so offering to
    create an empty one would only ever lead to "No games yet".
  - **The game picker shows the 50 most recently touched games and says so**
    (`PICK_GAMES` in `js/masterclass.js`, `mc_pick_recent`). A base can hold
    thousands, and a modal with one button per game would be unusable. Anything
    older is still reachable — open it from Bases and use "From the current
    board".
  - **There is deliberately no "share the whole base" entry.** Costed in the
    plan: 5,000 games is 5,000 writes and 5,000 reads per student.
  - **A chapter opens in the existing Analysis screen**, not a second board:
    `Analysis.loadTree(parsePgn(ch.pgn), { baseId: null, gameId: null,
    fromMasterclass: mcId })`. The plan's "verify the ⋯ menu writes nothing
    with a null baseId" was checked and it is clean — `💾 Save to database` is
    the only IndexedDB writer there and with no `baseId` it *asks* which base to
    copy into, so it never writes with a null one. `🗑 Delete game` only appears
    with a `historyId`.
  - New `#ana-mc-nav` / `#ana-mc-back` in `index.html` (`← Masterclass`), shown
    by `Analysis.updateBaseNav()` on `ctx.fromMasterclass`, which also re-lights
    the **Bases** tab. `Masterclass.backFromChapter()` redraws from memory
    rather than refetching; with nothing in memory (page reloaded while the
    chapter was open) it falls through to the Bases tab.
  - **Chapter rows reuse `.fr-row.tappable`** — the friends-list grid, which
    truncates the title and keeps the ⋯ on screen at 375px. `.list-item` would
    have wrapped a long title onto a second line. One new CSS rule,
    `.mc-chapter-n`, for the position number.
  - `chaptersLoaded` / `chaptersFailed` mirror the class list: the count label
    reads "Loading…" until the fetch lands, so a class with ten chapters never
    flashes "0 capítulos", and a failed fetch says "needs a connection" instead
    of "No chapters yet".
  - 10 new bilingual strings (`mc_from_base`, `mc_from_board`, `mc_choose_game`,
    `mc_pick_recent`, `mc_delete_chapter`, `mc_delete_chapter_confirm`,
    `mc_chapter_too_big`).
  - Verified over CDP at 375px in light and dark, in **both languages**: the
    loading / empty / offline states, 50 real rows, an escaped `<b>xss</b>`
    title, a long title truncating with the ⋯ still on screen, a viewer with no
    ⋯ and no ➕, the two-entry sheet, the base picker, the 51-game picker
    showing 50 plus its hint, both title prompts, the cap toast at 50, the
    oversize message, the delete confirm, a chapter opening on the right FEN
    with the right moves list, `← Masterclass` returning with the tab lit on
    Bases, `document.scrollWidth` exactly 375 everywhere, and no console error
    but the App Check 403.
  - **VERIFIED AGAINST PRODUCTION 2026-08-16 — Adrian ran the whole checklist
    on chesstrainingcenter.app and everything passed.** This is the first
    Masterclass code that has ever touched real Firestore. Proved live:
    `addChapter()` from a database AND from the current board (both wrote, both
    appeared), `fetchChapters()` surviving a full reload with the chapters in
    the order they were added, opening a chapter on the right position with a
    walkable moves list, `← Masterclass` returning with the tab bar still lit
    on Bases, and `deleteChapter()` removing a row. In both languages, light
    and dark. **So the chapter rules, the `updatedAt == request.time` clause and
    the `hasOnly` key set are all confirmed against the deployed rules, not just
    the emulator.**
  - **Still never executed live, and do not claim otherwise:** the >100 KB
    oversize path (`mc_chapter_too_big`), the 50-chapter cap toast, the 50-game
    picker truncation hint, and what a **viewer** sees — that last one needs the
    second account and is commit 5's job.
  - **Pushed and deployed 2026-08-16.** `origin/main` is level with local
    `main`; the live `sw.js` reads `chess-training-center-v67` and the live
    `js/masterclass.js` carries this code. Commits 1–4 all went out in the same
    push — the "not pushed" lines on the three entries below are historical.

- **Masterclass — commit 3 of 7 is done (2026-08-16, `fa5b0d7`). The list, the
  create and the delete are real Firestore calls.** `sw.js` v65 → **v66**.
  `firestore.rules`, `firestore.indexes.json` and `tests/rules/masterclass.test.js`
  are untouched — **still 122 passing, 0 failing.**
  - `js/firebase.js` gained `MAX_MASTERCLASSES`, `createMasterclass()`,
    `fetchMyMasterclasses()`, `fetchMasterclass()` and `deleteMasterclass()`,
    plus `addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot` on
    the firebase-firestore import. **`onSnapshot` and `fetchMasterclass()` are
    deliberately unused** — commit 6 and commit 4 use them, and naming one more
    symbol from an already-downloaded module costs nothing.
  - **TWO bugs in the plan's `deleteMasterclass()` were found and fixed, and
    both were MEASURED against the emulator with a throwaway probe test, not
    reasoned about. Do not copy the plan's version back out.**
    1. **`live/state` cannot be deleted by anybody.** The `live` block has one
       `allow write` and every clause reads `after()`, i.e.
       `request.resource.data`, which is **null on a delete** — so the rule
       errors and denies. The plan had this delete *inside the batch*, and a
       batch is atomic, so **deleting a Masterclass would have failed outright,
       every single time.** It is now a separate quiet call placed *before* the
       parent delete, so it starts working by itself the day **commit 6 adds
       `allow delete: if mcIsOwner(mcId);` to that block** — commit 6 must do
       that, with a test.
    2. **The owner's own membership document cannot be deleted either.**
       Refused while the class exists (test 22 — that would orphan a class
       nobody can read), and refused afterwards too, because `mcOwnerUid()`
       does a `get()` on the parent that is now gone and the null dereference
       denies. **So exactly one document survives a delete: the owner's own
       `{uid, role, addedBy, addedAt}`.** Nobody else can read it (both read
       rules need the deleted parent) and `fetchMyMasterclasses()` skips it, so
       it is not a leak of anyone else's data — but it is real, expected
       leftover, and the Firestore console will show it. Closing it needs one
       more clause in `firestore.rules`. **Every OTHER member's document and
       every chapter are deleted, and they go first** — that is the part that
       matters for privacy.
  - **`MC_LIMIT` is gone.** The cap is `MAX_MASTERCLASSES`, imported from
    `js/firebase.js` — one constant, one place. It is still **advisory,
    UI-side only**, and it counts the classes you **OWN** (`Masterclass.owned()`),
    not the ones you have been added to.
  - **`fetchMyMasterclasses()` returns rows keyed `id`, not `mcId`.** The
    rename happens at the fetch boundary so only one shape exists above it. The
    plan's `mcId` is superseded.
  - **`#mc-new` stays live when signed out and toasts `mc_needs_signin`** —
    Adrian's call. The plan's "signed out → hide `#mc-new`" line is superseded.
    A button that explains itself teaches what the feature needs.
  - The list is **lazy**, exactly like Friends: `Auth.onChange` only
    invalidates it and `Base.showList()` → `openList()` refetches. The four
    list states — signed out / loading / offline / genuinely empty — are drawn
    apart, and the `.mc-role` chip (`mc_role_owner|editor|viewer`) is now on
    the row. An unrecognised role draws no chip rather than an empty pill.
  - Verified over CDP at 375px in light and dark, in **both languages**: all
    four empty states, the role chip in all three roles plus an unknown one, an
    escaped `<b>xss</b>` name, the cap toast at 5 owned and the name prompt at
    4, the owner ⋯ sheet reaching the delete confirm and the member sheet
    showing Leave instead, `scrollWidth` exactly 375 everywhere, and no console
    error but the App Check 403.
  - ~~**Nothing in this commit has ever reached real Firestore.**~~ **PARTLY
    SETTLED 2026-08-16** by the commit-4 live run. `fetchMyMasterclasses()` —
    the collection-group query and its COLLECTION_GROUP index — really works
    against production: the class list drew a real owned class and it opened.
    `createMasterclass()` must have run too, since a class exists to open.
    **`deleteMasterclass()` has still never been called live**, so the
    one-leftover-membership-document behaviour above is still reasoned from the
    emulator, not watched in the Firestore console.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Masterclass — commit 2 of 7 is done (2026-08-16, `6236198`). Screens and
  strings only, nothing talks to Firestore.** `sw.js` v64 → **v65**.
  - New `js/masterclass.js` (the `js/friends.js` pattern: one exported object,
    `init()` wiring buttons, `render*()` rebuilding from state), a Masterclass
    section above the base list inside `#base-list-view`, a new
    `#screen-masterclass`, a `.mc-*` CSS block and **27** bilingual `mc_*`
    strings.
  - **"Masterclass" is untranslated in Spanish and must stay that way** — not
    *Clase magistral*, not *Masterclase*. The word appears verbatim in the
    `es:` values.
  - **NO sample data, deliberately.** Friends commit 2 shipped a `SAMPLE` array
    and commit 3 had to delete it; every list here draws its real empty state,
    so nothing invented can reach the site. `Masterclass.classes`, `.chapters`
    and `.members` are all `[]` until commits 3, 4 and 5 fill them.
  - **`askText()` in `js/app.js` is now exported.** One word, no behaviour
    change. The plan's Task 2 "Interfaces" line already listed it as an import
    and it was not exported — commits 3 and 4 need a text prompt too, so it was
    exported rather than duplicated.
  - **`#mc-live-bar` is in the markup and hidden until commit 6**, so the
    screen was laid out with the space it will occupy. Do not delete it.
  - **`MC_LIMIT = 5` is ADVISORY, UI-side only** — the comment in the file says
    so. Same for the 50-chapter and 30-member caps when they land. They cannot
    be enforced in rules without a server counter.
  - **The tab bar stays lit on Bases** while `#screen-masterclass` is open —
    `open()` re-lights it after `showScreen()`, the same trick
    `Analysis.updateBaseNav()` uses for a game opened from a base. `←` calls
    `showScreen('base')`, which runs `Base.refresh()` → `showList()` →
    `Masterclass.openList()`.
  - **`mc_chapters` / `mc_members` are lower case** (*capítulos*, *members*) —
    they are only ever rendered after a number, exactly like `games` in the
    base list directly underneath. They were capitalised in the plan; that was
    changed here after seeing "3 Miembros" next to "0 partidas" at 375px.
  - **The ⋯ menu and the New Masterclass prompt are inert on purpose.** The
    ⋯ sheet picks the right item from the role (delete for an owner, leave for
    a member) and both actions are empty — the writes land in commits 3 and 5.
    `newClass()`'s two guards (signed out → `mc_needs_signin`, offline →
    `mc_needs_network`) are real and permanent; the `askText()` prompt opens
    and the name goes nowhere until commit 3 writes the document.
  - `firestore.rules`, `firestore.indexes.json` and every test are untouched —
    **still 122 passing, 0 failing.**
  - Verified over CDP at 375px in light and dark, in both languages: section
    above an unchanged base list, screen opens and closes, `←` returns with the
    tab lit on Bases, `document.scrollWidth` exactly 375 on both screens,
    singular and plural labels correct, long class name truncates with `←` and
    `⋯` both still on screen, and the only console error is the App Check 403.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Masterclass — commit 1 of 7 is done (2026-08-16, `feca228`). Rules and
  tests only, nothing the browser loads changed, `sw.js` stays at v64.** The
  plan is `docs/superpowers/plans/2026-08-16-masterclass-stage-1.md` (committed
  in the same commit; it was untracked before).
  - `firestore.rules` gained the Masterclass block as a **sibling** of the
    Friends blocks: `masterclasses/{mcId}`, its `members`, `chapters` and
    `live/{docId}` subcollections, plus the `mcPath` / `mcOwnerUid` /
    `mcIsOwner` / `mcIsMember` helpers. `signedIn()`, `me()`, `after()` and
    `num()` were reused, not redefined.
  - `tests/rules/masterclass.test.js` — 35 new tests, numbered to match the
    plan's list. **`npm run test:rules` is at 122 passing**, zero failing, on
    two consecutive runs.
  - **Deployed 2026-08-16 — rules AND indexes.** `firebase
    firestore:indexes` read back from the live project shows the `members` /
    `uid` field override with `COLLECTION_GROUP` scope, so the collection-group
    query in commit 3 will not hit `failed-precondition`. Edit the file and
    deploy, never the console.
  - **Two things in the plan's Task 1 are WRONG and were fixed here — do not
    copy them back out of the plan:**
    1. The recursive rule `match /{path=**}/members/{memberUid}` must test
       **`resource.data.uid == me()`**, not `memberUid == me()`. On a
       collection-group *list* the document-id wildcard is not bound, so
       reading it raises `Null value error` and denies the query. This is
       precisely what the redundant `uid` field on every member document is
       for; do not delete it as duplication.
    2. The new test suite runs under its own emulator `projectId`
       (`chess-training-center-mc`). `node --test` runs the test **files** in
       parallel and `clearFirestore()` wipes the whole project, which was
       deleting `friends.test.js`'s seeded documents mid-test and failing two
       existing Friends tests for the wrong reason. `existing.test.js` never
       clears, which is why this never bit before.
  - **The 50-chapter, 30-member and 5-Masterclass caps are advisory, UI-side
    only.** They cannot be enforced in rules without a server-maintained
    counter. The rules-enforced bound is the 100,000-byte chapter PGN limit.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Friends — the two-account run finally happened (2026-08-16). The system
  is verified against production.** Adrian ran it on the live site as
  `Zugzwang` (`hxxaE1n6T1WzxLvIGTMby1RfkZs1`) with `miguelafuentesm`
  (`f3trpsGqDXXXcV9OQsUw0TGlbjh1`). **Every "Owed: the two-account run" note
  below is now settled — read this entry instead of them.**
  - **Proved against live Firestore:** `usernameLower` publishing; the prefix
    search; `sendFriendRequest()` writing exactly four fields;
    `acceptFriendRequest()` creating the friendship and deleting the request;
    `fetchFriendUids()` + `fetchLeaderboardByUids()` filling the Friends list;
    the friends leaderboard with my own row ringed, all four category tabs;
    and `blockUser()`, `unblockUser()`, `fetchBlockedUids()` — block wrote
    `blocks/{me}/blocked/{them}`, removed the friendship and the request I had
    sent, the Blocked screen listed them, and Unblock cleared it.
  - **THE FRIENDS SYSTEM IS CLOSED — 2026-08-20. Stop testing it.** Adrian ran
    the last four checks himself against production and reported all four
    working and correct in Firestore: `rejectFriendRequest()`,
    `cancelFriendRequest()`, `unfriend()` and the blocked sender's side (a
    blocked account presses ➕, gets the neutral "Solicitud enviada ✓" toast,
    and no `friendRequests` document is created). The third account, not
    `miguelafuentesm`, was the other side.
  - **What that rests on:** Adrian's own confirmation. No session watched these
    four in the console step by step, so there are no document ids recorded for
    them and no separate 375px / light-and-dark / both-languages pass for
    `unfriend()` or the blocked-sender check. Deliberate stopping point, not an
    oversight. **Do not reopen this and do not re-run them.** If something
    surfaces in real use, Adrian will say so and it gets debugged then.
  - **Still true and worth keeping:** `unfriend()`'s rule had already been
    proved independently — `blockUser()` runs the identical delete on the
    identical friendship document under the identical rule, watched succeeding
    — and the blocked-sender rule is covered by the rules test suite.
  - **One thing left open, and it is a MASTERCLASS problem, not a Friends
    one:** Adrian **cannot** sign into `miguelafuentesm`, and Zugzwang ↔
    miguelafuentesm are **not** friends. Step 0 of the Masterclass live run
    needs both. Nothing in the Friends system is waiting on it.
  - **One real bug was found and fixed — `5326426`, `sw.js` → v63.**
    `renderFind()` in `js/friends.js` decided the search row's button from
    `Friends.sent` alone, i.e. the uids clicked in *this page session*. It
    never checked the friends list or the outgoing requests, which
    `paintAddFriend()` has checked since commit 7 — so **an existing friend
    came back from a search as a live ➕ that really did send another
    request.** It now resolves the same four states from the same three
    lists, and `search()` awaits `loadFriends()` when it has never run.
    Verified at 375px, light and dark, both languages, all four states.
  - **The "createdAt changed on a second send" scare was not a rules bug and
    there is no rules drift.** Accepting deletes the request document, so a
    later ➕ press was a fresh create, not a denied overwrite. Do not
    re-investigate it.
  - **Commit 9 (unique usernames) is NOT DOING**, decided here. Prefix search
    already distinguishes duplicates by avatar, display name, username and
    ELO; commit 9 changes signup, adds a new failure path on a new user's
    first screen, and does not fix existing duplicates — and there are 0
    duplicate usernames live. The plan's commit 9 section carries the full
    reasoning. Do not re-cost it.
  - `Velociraptorblue` and `foTtAx0VzRXgPgkkyRdESxJ0LN02` have no
    `usernameLower` and are correctly unsearchable until their next sign-in.
    That is the documented behaviour, not a bug.

- **The 26 streak icons are animated — CSS only, no new art (2026-08-16,
  `85c45ba`).** `sw.js` v63 → **v64**. The deliberately deferred half of the art
  rebuild is now done.
  - **The art is still 26 flat PNGs and `streaks/` is still 488 KB.** Adrian
    chose CSS over per-frame art: a frame set would have been ~130 more files
    and 2–3 MB, undoing the 2.5 MB → 488 KB rebuild in an offline-first PWA.
    **Do not revisit this as "we should do it properly" — it was costed and
    decided.**
  - Two keyframes in `css/style.css`, in a new **"idle flame motion"** block in
    the streak ladder section: `streak-flicker` (3.1s, `scaleY` off a
    `transform-origin: 50% 100%` base) and `streak-emberglow` (4.7s, brightness
    + `drop-shadow`). **The two periods are unrelated on purpose** so they never
    line up and the loop never reads as a metronome. Changing one to match the
    other is a regression.
  - **Only three of the four slots animate**, by Adrian's choice: the 64px
    `.streak-now-icon`, the 64px `.kael-quote-streak`, and the 34px image on the
    **`.current`** ladder row. **The 20px header badge is untouched** and still
    only moves on tier-up (`@keyframes streak-pop`) — a permanent pulse in the
    always-visible status strip was rejected. Locked tiers never animate; the
    selectors all carry `:not(.locked)` because the animated `filter` would
    otherwise wipe their `grayscale(1)`.
  - **A third animation, `streak-embers`, is the heat haze on the 64px Profile
    slot only** — a blurred copy of the same already-cached PNG drifting up
    behind the icon. It is fed by a `--streak-icon` custom property set inline
    by `renderStreakLadder()` in `js/app.js`, alongside a new `.has-flame`
    class; both are withheld at day 0. At 34px it would be invisible, which is
    why the ladder rows do not get it.
  - **The haze URL must stay absolute (`document.baseURI`).** A relative URL
    inside a custom property is resolved by Chrome against *the stylesheet that
    reads it*, not the document, so `streaks/x.png` became `css/streaks/x.png`
    and 404'd. This was caught in verification, not guessed.
  - **The haze is masked to a circle**, as cheap insurance: the blurred copy
    fills its whole 64px box, so without a mask it could take on a square edge
    at peak opacity. A radial mask has no corners.
  - **There is NO alpha-residue defect in the art — this was measured, after a
    first look at a 4× screenshot suggested otherwise.** Across all 26 PNGs the
    outer 20px ring averages 2–6/255 alpha and the dead corners sit at 2/255;
    composited on white that is a 253/255 grey, i.e. one to two levels. What
    reads as a faint box at high zoom is the ember and bloom field, which is
    intended art per `docs/STREAK-ART-SPEC.md`. **Do not "fix" this by redoing
    the alpha recovery** — there is nothing there to remove.
  - **One `prefers-reduced-motion` guard covers all three**, with selectors
    identical to the animation rules so specificity matches. Verified: reduced
    motion sets `animation: none` on all four elements and the Kael popup falls
    back to its static 8px `drop-shadow`.
  - Verified over CDP at 375px in light and dark, in **both languages**: 6
    distinct transforms, filters and haze opacities sampled over 2.5s (it really
    moves), haze image HTTP 200 at the same URL the `<img>` resolves to (one
    cached file, not two), boxes exactly 20/34/64, `scrollWidth` 375,
    `streak-pop` still fires, zero page errors.
  - Two stale CSS comments corrected on the way — both still claimed the art was
    fixed-height / `width: auto`, which stopped being true when it went square.

- **Streak icons rebuilt from zero — 38 tiers became 26, ending at 5 years
  (2026-08-16).** New art generated by Adrian; spec and the 38→26 prompt brief
  are in `docs/STREAK-ART-SPEC.md`. `sw.js` v61 → **v62**.
  - **Every icon is now square, 256×256, transparent.** The old set was 160px
    tall with widths from 134 to 354 (aspect 0.84–2.21), which is why the three
    CSS rules used `height: Npx; width: auto`. They now set **both** width and
    height: `.streak-icon-img` (20px, 28px on `.tier-up`), `.streak-tier-row img`
    (34px), `.streak-now-icon` and `.kael-quote-streak` (64px).
  - **`streaks/` went from 2.5 MB to 488 KB** — 17 KB average, 23.5 KB largest.
    Still not precached in `sw.js` `ASSETS`, exactly as before; and note
    `CACHE_FIRST` does **not** match `/streaks/`. The version bump is what
    clears the old art, via the `activate` handler's cache sweep.
  - **`STREAK_TIERS` in `js/app.js` was rewritten**: 26 rungs, 1 day → 1800
    days, icons `flame1-6`, `pawn1-6`, `knight1-4`, `bishop1-4`, `rook1-3`,
    `queen1-3`. The 12 retired names (`pawn7-9`, `knight5-8`, `bishop5`,
    `rook4-5`, `queen4-5`) are gone from disk and unreferenced.
  - **No storage key was touched.** The icon name is never persisted — only
    `streakCount`, `streakLastDate` and `bestStreak` are. **`js/badges.js` has
    its own, completely unrelated `STREAK_TIERS`** (7/30/90/180/270/365/730/
    1825/3650 days) whose `streak_<days>` and `daily_<days>` ids **are** storage
    in `earnedBadges`. Two constants, same name, different files. **Do not merge
    them** — rewriting one must never touch the other.
  - This also settles one of the open naming questions below: the year rungs now
    read "1 year / 2 years / … / 5 years" instead of "12 months / 240 months".
  - Verified over CDP at 375px in light and dark: all 26 load, none broken, all
    square at 256×256, boxes exactly 20/34/64, ladder order correct, zero page
    errors — in all three places the art appears (header badge, Profile "Streak
    progress" card, Kael tier-up popup).
  - The source JPEGs live in `C:\Users\Adrian\StreakArt\`, deliberately outside
    the repo. The conversion (black backdrop → alpha, align, 256px, quantise)
    is `docs/STREAK-ART-SPEC.md` §3; if the set is ever extended, the two traps
    are a flood fill leaking through glow that reaches the canvas edge, and a
    dark navy piece linked to the edge by a thin dark channel.

- **Friend search is now a PREFIX search (2026-08-16).** Typing `Zug` finds
  `Zugzwang`. `searchByUsername()` in `js/firebase.js` uses
  `where('usernameLower','>=',needle)` + `where('usernameLower','<',needle +
  '\uf8ff')`, `limit(5)` unchanged, and a new exported `SEARCH_MIN_CHARS = 2`
  refuses one-letter searches. `sw.js` v60 → **v61**.
  - **No composite index was needed and none was added.** Both bounds are on the
    same field, so the automatic single-field index serves it. This was
    **confirmed against production over the Firestore REST API**, not assumed:
    `zug` → HTTP 200, one row (Zugzwang), no index error.
    `firestore.indexes.json` is untouched.
  - **The "exact match is deliberate" note in the plan's Commit 3 section is
    superseded** and now says so at the top. Its anti-enumeration reasoning was
    wrong: `/leaderboard` is world-readable and `fetchLeaderboard()` already
    returns 200 whole rows to anyone, so prefix search leaks nothing new.
  - **Under 2 characters is not a search, so "No player found" does not
    appear** — `Friends.searched` stays false. The standing hint under the box
    (`friends_search_hint`) was rewritten from "You need their exact username."
    to "Type at least 2 letters of their username." **The "2" is hard-coded in
    that string; if `SEARCH_MIN_CHARS` changes, change both languages with it.**
  - **The five results are the alphabetically first five.** Someone with a very
    common prefix has to be typed out further. `limit(5)` was kept deliberately.
  - **The real query still has never run from this machine** — App Check blocks
    the localhost client from Firestore entirely. It was proved over REST
    instead. The gate, the row rendering and the no-match logic were verified in
    the browser at 375px.

- **Friends system — commit 1 of 9 is done (2026-08-15). Rules only, no
  feature code.** The plan is
  `docs/superpowers/plans/2026-08-14-friends-system.md`; read its "What
  actually happened" note before writing any Friends code.
  - `firestore.rules` now covers `friendships`, `friendRequests` and
    `blocks/{uid}/blocked/{other}`, and `usernameLower` was added to the
    `leaderboard` write allowlist so commit 3 needs no second rules change.
  - `tests/rules/friends.test.js` — 56 new tests. **`npm run test:rules` is at
    86 passing**, every allow and every deny.
  - **Deployed 2026-08-15** and checked — the leaderboard still loads. Live
    rules and `firestore.rules` match, so commits 3–7 need no further rules
    work. Edit the file and deploy, never the console.
  - `sw.js` deliberately not bumped — nothing the browser loads changed.

- **Friends system — commit 2 of 9 is done (2026-08-15, `1831639`). Screens
  only, no Firestore.** New `js/friends.js`, `#screen-friends` (Friends /
  Requests / Find), `#screen-friends-leaderboard`, the two-up button row on
  Profile, an inert `➕ Add friend` on the public profile, and 32 new bilingual
  strings. `sw.js` v53 → **v54**.
  - **`js/friends.js` ships with `sample: true` and six invented players.**
    That is how the screens were judged. **Commit 3 deletes `SAMPLE` and the
    flag** and puts the real search behind them.
  - Read the "Commit 2 — DONE" note in the plan before commit 3: rows with
    action buttons stack them on a second line on purpose, and the new
    leaderboard clips its own watermark while `#screen-leaderboard` still
    does not.
  - Committed on local `main`, **not pushed**.

- **Friends system — commit 3 of 9 is done (2026-08-15). Search and send.**
  `SAMPLE` and the `sample` flag are **deleted** — no invented players can
  reach the site. `usernameLower` is now published inside
  `updatePublicLeaderboardDoc`, and `js/firebase.js` gained
  `searchByUsername()` and `sendFriendRequest()`. The Find tab does a
  case-insensitive username match against `/leaderboard` (**exact when this was
  written; a prefix match since 2026-08-16 — see the top entry**) and writes
  `friendRequests/{from_to}` with exactly four fields. `sw.js` v54 → **v55**.
  `firestore.rules` untouched; one new test, **87 passing**.
  - **Every send outcome shows the same `Solicitud enviada ✓` toast** —
    created, already asked, blocked or offline. That is the block-privacy
    guarantee, not an oversight. Do not "fix" it into a real error message.
  - **Nobody is findable until their public doc is rewritten with
    `usernameLower`,** which happens on their next sign-in. Confirmed over the
    REST API: today no `/leaderboard` document has the field, and the query
    itself runs server-side with no index error.
  - ~~**Owed: the two-account run.**~~ **DONE 2026-08-16 — see the top entry.**
    Search and send are verified against production. The line above about no
    `/leaderboard` document having `usernameLower` is also stale: two now do.
- **Friends system — commit 4 of 9 is done (2026-08-15). Requests go live.**
  `js/firebase.js` gained six exports — `fetchIncomingRequests()`,
  `fetchOutgoingRequests()`, `fetchLeaderboardByUids()`,
  `acceptFriendRequest()`, `rejectFriendRequest()`, `cancelFriendRequest()` —
  and the Requests tab now renders real rows with working buttons. The gold
  pill on the Profile Friends button shows the real incoming count.
  `sw.js` v55 → **v56**. `firestore.rules` untouched, nothing deployed, still
  **87 tests passing**.
  - **Two composite indexes must be created before either query can run.** They
    are written out in the "Commit 4" section of the plan. This session could
    not sign in, so the auto-generated console links do not exist yet — create
    them by hand from the table, or open Requests once on the real site and
    click the link Firestore prints.
  - **`fetchLeaderboardByUids()` landed early**, in commit 4 rather than 5,
    because request rows need names and avatars too. Commit 5 must reuse it.
  - **The outgoing list has no status filter on purpose** — a rejected request
    must look exactly like a pending one to whoever sent it.
  - ~~**Owed: the two-account run.**~~ **PARTLY DONE 2026-08-16 — see the top
    entry.** `acceptFriendRequest()` has run against production and the
    friendship document exists. **`rejectFriendRequest()` and
    `cancelFriendRequest()` have now run too, on the real site — Adrian
    confirmed both correct in Firestore on 2026-08-20.** Commit 4 is closed;
    see the top entry.

- **Friends system — commit 5 of 9 is done (2026-08-15). The Friends list.**
  One new export, `fetchFriendUids()`, does
  `where('members','array-contains',me)` on `friendships` and returns the other
  member of each pair. `fetchLeaderboardByUids()` was **reused** from commit 4
  for names, avatars and puzzle ELO. `sw.js` v57 → **v58**. `firestore.rules`
  untouched, nothing deployed, still **87 tests passing**.
  - **No index is needed for this query.** `array-contains` on its own is served
    by the automatic single-field index, and there is deliberately no `orderBy`
    — the list is sorted by name in JavaScript instead.
  - **`PublicProfile.open(entry, backTo = 'leaderboard')`.** A friend row passes
    `'friends'`; the leaderboard's call site was not touched and gets the
    default. `PublicProfile.init` now reads `this.backTo` at click time.
  - **The friends list is lazy** — `Auth.onChange` only invalidates it, it
    refetches when the tab opens. Loading at boot would be up to 100 document
    reads for someone who never opens Friends.
  - **The 100-friend cap awaits the list before deciding.** At the cap the
    button comes back and the uid is not marked spent. The cap toast is about
    *my* list, so it does not break the neutral-toast rule for blocks.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The `array-contains` query has run against production and the
    Friends list rendered a real friend. The two composite indexes are
    created and deployed.

- **Friends system — commit 6 of 9 is done (2026-08-15). The friends
  leaderboard.** `#screen-friends-leaderboard` now builds real rows from
  `Friends.friends` — **no new query and no new export in `js/firebase.js`**.
  `rankTier` was exported from `js/leaderboard.js` and reused, along with the
  `.lb-row` markup, so the two boards stay one thing. `sw.js` v58 → **v59**.
  `firestore.rules` untouched, nothing deployed.
  - **My own row is on the board, ringed** (`.lb-me`, a 2px `--accent` inset
    ring that beats `.tier-podium`'s gold one). `loadFriends()` fetches my own
    public document in the same batch as the friends' and parks it on
    `Friends.me`. **`me` is not in `Friends.friends`** — the Friends list is
    unchanged.
  - **A stale month reads as no score, it does not remove the row.** The global
    board drops rows whose `rushMonthKey` is not this month; this one shows the
    fallback instead, because a friend vanishing from a five-person board looks
    broken. Deliberate difference — do not "align" it without asking.
  - **`#leaderboard-period` has a bug this commit only fixed on its own
    screen**: leaving a Rush board for an ELO board resets `season` but leaves
    the switch lit on "This month". `#flb-period` now moves back with it;
    `#leaderboard-period` still does not.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The board was opened on the live site with a real friend: two
    rows, my own ringed, all four category tabs. **Not covered:** the 30+
    friend chunk boundary — Adrian has one friend.

- **Friends system — commit 7 of 9 is done (2026-08-15). Add, unfriend,
  block.** `js/firebase.js` gained four exports — `unfriend()`, `blockUser()`,
  `unblockUser()`, `fetchBlockedUids()`. `➕ Add friend` on a public profile is
  live in all four states, `⋯` on a friends row opens Remove friend / Block, and
  a new `#screen-friends-blocked` lists the people you have blocked with
  Unblock. `sw.js` v59 → **v60**. `firestore.rules` untouched, nothing
  deployed, still **87 tests passing**.
  - **No "are we friends" query was added.** The ➕ button's four states are
    facts about *my* lists, so they are read from `Friends.friends`,
    `Friends.outgoing` and `Friends.sent` — opening a public profile costs no
    new document read. A `get()` on a `friendships` document that does not
    exist is itself a permission error, so the obvious implementation would
    have thrown on every stranger.
  - **Blocking rejects their pending request instead of deleting it.** Deleting
    would make their outgoing row vanish, which they could correlate with being
    blocked; `'rejected'` leaves it reading "Request sent" forever. A request I
    sent *them* is deleted — that is just cancelling my own. The block document
    is written **first** and is the only step whose failure is reported.
  - **`PublicProfile.onOpen` is a hook, not an import** — `js/friends.js`
    already imports `js/leaderboard.js`, and it is awaited before
    `showScreen()`, which is what "resolved before the screen renders" means.
  - **One new string**, `friends_blocked_empty`. Everything else existed.
  - ~~**Owed, still: the two-account run.**~~ **MOSTLY DONE 2026-08-16 — see
    the top entry.** `blockUser()`, `unblockUser()` and `fetchBlockedUids()`
    have all executed against production, in a **one-account** run: blocking
    is a write by my own account, so it needed nobody else signed in.
    **`unfriend()` and the blocked sender's side were closed out by Adrian on
    2026-08-20** against production, using the third account — see the top
    entry for exactly what that record rests on. `unfriend()`'s rule was
    already proved anyway: `blockUser()` runs the identical delete on the
    identical friendship document under the identical rule, watched
    succeeding. **Commit 7 is closed. The whole Friends system is closed.**
- **Friends system — commit 8 of 9 is done (2026-08-15, `c3b1e4f`). Comment
  only.** The note above `VISIBILITY_SECTIONS` in `js/leaderboard.js` used to
  claim a `friends` level could be added by adding a line to that table. It
  cannot — `/leaderboard/{uid}` is world-readable, so the table only decides
  what the screen draws and the real boundary is `updatePublicLeaderboardDoc()`
  in `js/firebase.js`, which always publishes `PUBLIC_ALWAYS_KEYS` and
  **deletes** `PUBLIC_DETAIL_KEYS` while the profile is private. The new
  comment points at "Future options" item 1 in the plan.
  - **No code line changed and `sw.js` stays at v60** — nothing a user can see
    is different, and a bump would make every returning user redownload the
    app for nothing. Same reasoning commit 1 used.
  - ~~**Owed, still: the two-account run.**~~ **Settled 2026-08-16 — see the
    top entry.** The two composite indexes are created and deployed.
  - ~~**Next task: commit 9 — unique usernames.**~~ **NOT DOING**, decided
    2026-08-16. The reasoning is in the top entry and in full in the plan's
    commit 9 section. Do not re-cost it.


- **👣 Walk through is now on the Endings studies too (2026-08-15).** Adrian
  asked for it after saying he did not like the existing rated practice either.
  Same mode, all 265 studies, over each study's own `moves` line with its
  `comment` as the legend. **No endgame data changed.**
  - **It is now ONE implementation — `createWalker(cfg)` in `js/app.js`.** Basic
    Checkmates was rewritten onto it and re-verified against the same tests it
    passed the day before, with identical output. **Do not fork it again**: the
    two screens are supposed to feel the same, and two copies would drift. A
    screen supplies element ids plus `onStart` / `onFinish`.
  - **The player does not always move first.** In a `result: 'loss'` study the
    player takes the winning side, so the book plays the losing move first (19
    of 265). `playerFirst()` decides whether the player's plies are the even or
    the odd indices; `step()` auto-plays anything that is not theirs.
  - **It cannot move `endgameElo`.** It runs while `Endgame.mode` is still
    `'study'`, and its branch in `userMove` sits **above** the
    `mode !== 'practice'` guard, so `finishPractice` — the only writer of the
    rating — is unreachable. Asserted byte-identical with a seeded rating.
  - **It does credit the streak**, like the Checkmates one. That is looser than
    the documented endgame trigger ("an endgame must be converted"), because
    👁 Show me can walk the whole line for you. Deliberate, for consistency
    with the mode Adrian already approved — **say so if you want it removed**;
    it is one line in `createWalker.finish()`.
  - `sw.js` → **v57** (v56 was taken by Friends commit 4 mid-session).

- **Learn tab — 👣 Walk through, a guided move-by-move mode (2026-08-14).**
  Shows the next move of the lesson's line as an arrow, clears it, then asks the
  player to play that same move. Correct → the opponent's scripted reply plays
  itself and the next move is shown. On to the end of the line.
  - **Live on all five Basic Checkmates.** The Rules lessons have no `demo`, so
    the button never appears there, and their code path is unchanged.
  - **No new lesson data.** It runs off `demo.moves`, which already existed. A
    legal move list always alternates and all five mates start with White, so
    "is this my move?" is just `walkIdx % 2 === 0`. `js/learning-data.js` was
    not touched.
  - **Legend, not per-move text — Adrian's call.** `lesson.text` stays under the
    board the whole way as the standing plan. The honest limitation: a fixed
    legend cannot explain move 12. Per-move notes were costed at 270 bilingual
    strings of generated chess commentary and deliberately not written. **The
    upgrade path needs no rework** — add an optional
    `lesson.walk = { notes: [...] }` indexed against `demo.moves`.
  - Wrong move: unlimited retries, no lockout; the arrow comes back by itself on
    the second miss. `👁 Show me` plays the move for you, `◀` steps back one of
    your moves and re-shows it. Reuses `learn-practice-status`, the existing
    correct/wrong sounds and `.shake` — nothing new was invented.
  - **`walkBusy` is load-bearing.** Both nav buttons are dead from a move being
    played until the next is shown. Without it, pressing 👁 Show me inside the
    600 ms reply gap plays the opponent's move as yours and flips the mode onto
    the wrong side for the rest of the line. The invariant: **when the mode is
    waiting on you, `walkIdx` is even.**
  - **Writes no rating** — not `puzzleElo`, `endgameElo`, `openingElo`,
    `blindfoldElo`, nor the radar; asserted byte-identical in the browser. It
    **does** credit the streak on finishing a line (`Streak.recordActivity()`),
    approved by Adrian. That is a new streak trigger — if the rules list on
    Profile is revised, revise it with this.
  - One pre-existing bug fixed on the way: `engineReply()` handed the board back
    unconditionally in its `finally`, so a late engine move could re-enable it
    after the player had left the lesson. Now guarded on `this.practicing`.
  - Design: `docs/superpowers/specs/2026-08-14-learn-walkthrough-design.md`.
    `sw.js` v52 → **v53**. **Committed on local `main`, not pushed.**

- **Streak rules rewritten — what counts as "using the app today" (2026-08-14).**
  Adrian picked "any one activity, but the bar goes up" over tying the flame to
  the daily missions. **The two counters stay separate on purpose**: 🔥 = you
  turned up, 🎯 = you did the full workout. Do not merge them without asking.
  - **Boards need 10 moves of your own** (`STREAK_MIN_MOVES`, shared helper
    `noteStreakMove`): Play, Openings, Analysis. It fires **on the tenth move,
    not at `finish()`** — a long game you walk away from used to bank nothing.
  - **Everywhere else you have to succeed**: solve the puzzle (a wrong answer
    used to count), Puzzle Rush needs 3+ solved, an endgame must be converted.
    Blindfold already required a solve.
  - **Two new triggers**: Analysis (any engine line, or 10 moves) and Learn
    lessons that have a practice section. Databases and Profile never count.
  - **Both streak bugs fixed.** `todayStr()` is now the local calendar day, not
    `toISOString()` — the day used to roll over at 7pm in Panama. And a broken
    streak now writes its 0 to `streakCount`; it used to live in memory only,
    so the stale number kept syncing to the public profile. `bestStreak` is
    deliberately untouched by both. `monthStr()` is **still UTC** — it is the
    leaderboard season key and changing it would move season boundaries.
  - The rules are explained in the app, under the streak ladder on Profile
    (`Profile.streakHowHtml`, `streak_how_*` in `js/i18n.js`, `.streak-how-*`
    in `css/style.css`). **If a trigger changes, that list changes with it.**
  - Verified over CDP at 375px in light and dark, both languages: 9 moves bank
    nothing and the 10th banks the day; a dead streak writes 0 while
    `bestStreak` survives; and at 21:30 Panama on the 14th (UTC already the
    15th) a streak from the 13th still reads 7 instead of being wiped.

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

### English copy review — COMPLETE (2026-08-08). All ten batches done.

Every English string in the app now reads like a native speaker who knows chess.
`docs/STYLE-EN.md` is the rulebook and `docs/EN-REVIEW-PLAN.md` is the full
record — every batch, every decision Adrian made, and everything deliberately
left alone. **Read both before touching any English text again.**

**Nothing has been pushed.** 24 commits sit on local `main`, from the style guide
through batch 10 and its follow-up, plus one unrelated crash fix (`58e8e09`).
`sw.js` is at **v49**. Push straight to `main` — the commits are already linear
there, individually revertable, and every batch was verified in a real browser at
375px before it landed. Check the live site after the *deploy* finishes, not
after the push.

#### What the review left behind — four items, all deliberate

These are recorded, not pending. None of them is a copy problem, which is why no
batch fixed them.

1. ~~**The plural bug — "1 games".**~~ **FIXED 2026-08-08, `sw.js` v47 → v48.**
   `tn(key, n)` in `js/i18n.js` picks between `key` (plural) and a new `key_one`
   (singular) and does the `{n}` substitution, so `adv_matches` no longer needs
   `.replace('{n}', …)` at its call site. Two forms only — English and Spanish
   split at exactly one for these nouns, so `Intl.PluralRules` was not needed.
   Five new keys (`games_one` *partida*, `imported_one` *partida importada ✓*,
   `history_moves_one` *jugada*, `adv_matches_one` *{n} partida encontrada*,
   `lessons_count_one` *lección*); no key was renamed. Ten call sites converted:
   `js/app.js` 254, 1519, 2097, 2130, 2298, 2886, 4332, 4338, 4359 and
   `js/history.js:247`. **`history_moves_one` and `lessons_count_one` are
   defensive and cannot be reached at 1** — `HISTORY_MIN_PLIES` rejects games
   that short, and both lesson categories have many lessons. Verified over CDP
   at 375px in light and dark, in both languages: the import toast, the
   advanced-search chip, the Databases list, the save-to-database sheet, the
   Openings book select and the Learn counts, each at n=1 and n=2+.
2. ~~**The Spanish repair list — 20 items.**~~ **DONE 2026-08-08 in its own
   session, `sw.js` v48 → v49.** 18 of 20 fixed across four commits (`14b33c0`
   factual, `6fc00a8` the *motor* sweep, `850d7cd` the Puzzles naming decision,
   `3a6b28d` the rest). The three factual errors are gone — h1 is now *clara*,
   p6 says *se defienden solos*, and r10/r11/r12 say *Torre contra dos peones* —
   each verified against the entry's own FEN first. Adrian's two calls: the
   Puzzles feature is **Puzzles** in Spanish everywhere (six sites, including
   `tab_puzzles`, which the list had missed), and `log_rating` is **`ELO {n}`**.
   No `en:` value was touched, the DICT key count is 530 before and after, and
   `history_bot_name` stayed frozen. **Two items were deliberately left alone**,
   with the reason recorded in place in `docs/EN-REVIEW-PLAN.md`: item 8 (badge
   voice — the English has the identical mixed voice, so fixing only Spanish
   would create a new mismatch) and one bullet of item 17 (the `…` → `...`
   sweep — `…` is correct Spanish typography and STYLE-EN §3 governs English
   only). Both are one-liners if Adrian ever wants them.
3. **Three layout bugs no copy edit can fix.** Worst: the endgame study title bar
   has about **206px** of room and **173 of the 265 names are longer**, so they
   truncate — even `An Example from New York, 1924` gets cut. Also: the puzzle
   radar clips its longest theme labels ("Discovered atta"), and the Leaderboard's
   decorative watermark pushes `document.scrollWidth` to 405. **Shortening the
   words would not fix any of the three** — it would only move the cut.
4. **Four naming questions and six dead strings.** The naming calls are Adrian's:
   the `Opening Explorer` badge sharing a name with the Analysis panel;
   `Daily Mission` vs `Daily Missions`; `STREAK_TIERS` counting to `240 months`
   where English says 20 years; and "icon" vs "avatar", where the two buttons say
   icon and everything else says avatar. The dead strings (`no_bases_yet`,
   `rush_open`, `rush_result_title`, `rush_wrong_end`, `game_review_move`,
   `game_review_accuracy`) are defined but never rendered — removing a key is a
   code change, and they cost nothing. **Leave all of these as they are** unless
   Adrian raises one.

**`HANDOFFS.md` was rewritten on 2026-08-28 and is current again.** Tasks A–D
are all done and are kept there only for reference; the queue is now task 1
(three Bases/move-list bugs Adrian reported on 2026-08-28), task 2 (menu
navigation replacing the tab bar), task 3 (limits, counters, backup and
restore) and task 4 (the Read tab). **Ignore the A–D table below** — it is left
in place as a record of what the work order used to say.

One conversation each:

| | Task | Work order items |
|---|---|---|
| **A** | Artwork integration | #2 — *blocked on 2 questions* |
| **B** | Learn reorganisation + tab reorder | #8 + #12 — must ship together |
| **C** | Swipe nav + Opening Explorer variations | #10 + #11 |
| **D** | Button work | #3, #6, #7 |

Lower priority, not in the work order:
1. ~~Export Firestore security rules to `firestore.rules`~~ — **was already
   done and this note was stale.** `firestore.rules` has been committed and
   maintained since `aaa51b0`. Verify a claim like this with `git ls-files`
   before acting on it.
2. ~~Test the Firestore WRITE rules.~~ **DONE 2026-08-14.** 30 rules tests now
   run against the local Firestore emulator — `npm run test:rules`, no network,
   no production data touched. They cover both existing collections: who may
   read/write `/users`, and for the world-readable `/leaderboard`, the field
   allowlist (real name, email and date of birth are all rejected), the
   private-profile guarantee, forged and out-of-range scores, and oversized
   text. Tests live in `tests/rules/`. `package.json` is dev tooling only —
   **the app still has no build step and loads nothing from `node_modules`.**
   Needs Java 11+; `npm run test:rules` finds the JDK itself.
   - **The deployed console rules were diffed against `firestore.rules` on
     2026-08-14: identical, character for character.** No drift. The file is
     the truth, the tests test what is actually running, and
     `npm run rules:deploy` is currently a no-op. Re-diff after any console
     edit — and from now on edit the file and deploy, never the console.
   - The suspected discrepancy turned out to be a **stale comment, not a rules
     problem**: `js/firebase.js` claimed leaderboard deletes were
     permission-denied, which stopped being true when the delete rule landed in
     `fa39468`. Comment corrected; the tolerant error handling around it was
     left alone on purpose.
3. ~~Restrict the Firebase web API key by HTTP referrer in Google Cloud
   Console.~~ **DONE 2026-08-20 by Adrian — see the top entry. Do not re-open
   it and do not ask him to re-check it.**
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
7. New "Read" tab — PDF reader. **Planned 2026-08-28; the agreed design and the
   staging are in `HANDOFFS.md` under task 3.** `READ-TAB-PROMPT.md` is the
   original brief and is superseded by that. It comes AFTER the menu and the
   limits page, deliberately: the menu removes the 8-tab crowding problem, and
   the limits page is where the book count and the storage quota get listed.
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
