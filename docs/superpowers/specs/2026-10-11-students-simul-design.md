# Simultáneas / Simuls — a teacher plays several students at once (design)

Date: 2026-10-11. Status: **ALL 8 conversations are built (2026-10-13). 8 is
watching, the link and the first-time explanation (v209): "Otros" on a
student's row opens the list of the other boards of the same simul and one of
them can be watched live, read only, the student told when their own board
wants them; `?simul=<teacherUid>` is followed for an invited student, one with
no invitation, somebody else's student, signed out, the teacher, and beside a
Duel link; "Avisarles" in the waiting room; Kael explains once to a teacher and
once to a student, in the page. Adrian's four answers for 8 and the measured
reads are in HANDOVER.md; no rule changed. Nothing in section 4 is left.
7 is opening and handicap (v207): one thematic opening for the
simul, from the searchable list or played on a board, and a handicap per
student tapped off a board, "same for all"; each opens in a sheet. Every board
is checked before inviting and a line that cannot be played names the student,
the move and the piece. Adrian's four answers for 7 (sheets, the handicap
follows the colour, words for the student and pictures for the teacher, kept
while the app stays open) are in HANDOVER.md; no rule changed.
6 is the clock (v206): "no clock" or one of the four controls
and the teacher's extra minutes in the setup, both clocks on both screens, the
running clock on every tile, the flag claimed by either phone, a move that
arrives after time taken off the board, the control kept with the saved game.
Adrian's four answers for 6 (where the clocks go, the tiles, the warning, the
suggestion pre-filled) are in HANDOVER.md; no rule changed.
5 is endings and keeping the games (v205): resign, the draw
offer, the student told when away, every finished game saved once to each
phone's History; Adrian's answers are in HANDOVER.md. 2 is the database: the Simul block in `firestore.rules`,
`tests/rules/simul.test.js`, the Simul section of `js/firebase.js`
and `tools/emu-verify-simul.mjs`. 3 is the invitation and the waiting room,
`js/simul-ui.js` (v203): the Simultáneas screen for the teacher, a banner and
a card for the student, colour only. 4 is the game (v204): the student's board
and the teacher's board with the strip, on that same screen; no clock, no
resigning, nothing saved yet. Adrian's three answers for 4: the student's board
is a mode of the same screen; the teacher's phone stops listening when they
leave the screen and reloads on return; leaving the board asks nothing. One
rule was added in 4: a game that a move ended (mate, an automatic draw) can be
voided by the phone that did not make that move, which is what 3k's "a false
checkmate is caught the same way" needs.** The clock of 3d IS exact in
rules, to the millisecond; the fallback of section 6 is not needed. Measured
cost of ten 40-move boards: about 840 writes and 1,690 reads (a move is 1 write
and 2 reads; invite, join and start are 3 writes and 6 reads a board, plus one
rule lookup). The details are in HANDOVER.md.

Conversation 1 was `js/simul.js`, the pure rules, with
`tests/unit/simul.test.js`. The stored field names are now fixed, in the comment block at
the top of `js/simul.js`: `t`, `s`, `cls`, `status`, `invitedAt`, `startAt`,
`at`, `prevAt`, `fen`, `op`, `tc`, `base`, `inc`, `tMs`, `sMs`, `mv`, `n`,
`draw`, `tDr`, `sDr`, `winner`, `reason`, `by`. A move is five characters,
`[a-h][1-8][a-h][1-8][qrbn-]`. The clock of 3d is exact in arithmetic
(`settle()`, and `refereeMove()` in the test file is the rule to write);
conversation 2 proved that `firestore.rules` can express it. Three
readings of mine that Adrian has not been asked about: the draw-offer limit
counts 10 moves by each side (20 single moves); a move at the exact instant the
time runs out is too late; a flag is a loss whatever the other side has left.

What follows is the design as written on 2026-10-11. The code was read at
commit `568857c` (cache v188); while this was being written another session
committed `c5ba6f3` (Leaderboards, v189), which touches nothing described
here. Internal working name and stored names:
`simul`. Section 3 holds Adrian's answers, given the same day in five groups.

Adrian's words: "those simultaneous matches can be with or without clock, with
the possibility to select color, thematic opening, or even handicap for the
students (1 rook less for the instructor)."

---

## 1. What it is

A teacher opens Students, picks up to ten of their own students, chooses the
settings and sends an invitation. The students who join wait in a waiting room;
when the teacher presses Start, every joined student gets a real game of chess
against the teacher, all at the same time. The teacher's phone shows one board
at full size with a strip of the others above it and moves from board to board.
Each student sees an ordinary game against their teacher, and can look in on
the other boards.

## 2. What exists today (every line read in the code on 2026-10-11)

- **There is no human-against-human chess game anywhere in the app. This
  feature is the first, and that is most of the work.** `firestore.rules` has
  fifteen `match` blocks: `users` (+ `fcmTokens`, `pushSubs`), `leaderboard`,
  `friendships`, `friendRequests`, `blocks`, `pulso`, `masterclasses` (+
  `members`, `chapters`, `live`), `coaching`, `studentReports`, `homework`.
  None holds a game. `pulso/{pairId}` stores eight puzzle counters and a list of
  puzzle ids, not moves. `masterclasses/{mcId}/live/state` is one-way: only the
  owner writes it.
- **Play has no clock.** `Play` in `js/app.js` (grep `export const Play`) is a
  game against the engine with colour, level, resign, undo and "analyse"; it
  has no clock code of any kind. The prompt for this session assumed it had
  one. The only shared clock in the app is Duel's: `clockOffset()` in
  `js/pulso.js`, and `syncPulsoClock()` / `pulsoServerNow()` in
  `js/firebase.js`, which measure "server time minus this phone's time" from a
  stamped write. A chess clock is new work, built on that method.
- **The teacher–student link**: `coaching/{teacherUid}_{studentUid}`, created
  by the teacher as `pending`, made `active` or `declined` only by the student
  (`firestore.rules`, Students block; `inviteStudent`, `acceptTeacher` in
  `js/firebase.js`). `MAX_STUDENTS = 30` is advisory (the app enforces it, the
  database cannot count); `MAX_TEACHERS = 3` is enforced by the database.
- **The Students screen does not listen; it fetches.** `Students.load()` in
  `js/students.js` fetches the lists and keeps them for a while; there is no
  `onSnapshot` in that file. The app's one always-on listener is Duel's
  `watchPulso()`.
- **Duel is the model for the plumbing**, not for the game: one shared document
  per pair, reused for every match (`pulso/{pairId}`); the rules are the
  referee, there is no server; every time is `request.time`; an invitation
  expires after 5 minutes; a match nobody closed can be replaced after 196
  seconds; a banner on whatever screen you are on (`pulso-banner` in
  `js/pulso-ui.js`); a "Tell them" link, `https://chesstrainingcenter.app/?duel=<uid>`.
- **Openings**: `js/openings-eco.js` exports `OPENINGS_ECO`, about 150 entries
  shaped `{ moves: ['e4','e5',…], name }`, and `classifyOpening()`. Names are in
  English only.
- **Game tree and saved games**: `GameTree` in `js/tree.js` takes any start
  position and writes it into the PGN (`[SetUp "1"]`, `[FEN …]`). Play saves
  its games to the phone through `buildRecord()` / `saveGame()` in
  `js/history.js` and opens them with `Analysis.loadTree()`. `buildRecord()`
  is written for engine games: it stores `source: 'stockfish'`, `level`,
  `levelElo` and has no field for a human opponent.
- **A start position with pieces missing works. I ran it** against
  `vendor/chess.js` and `GameTree`: no a1 rook, no h1 rook, no a8 rook, no
  queen + rook + pawn together, king and pawns only, and a bare king are all
  accepted, give legal moves, and survive PGN out and back in.
  **One trap found:** the chess library does *not* object to a castling right
  whose rook is missing (`…/1NBQKBNR w KQkq` is accepted as written). It never
  offers the impossible castling move, but the wrong right would travel into
  the saved game. The app must remove it itself.
  **Corrected 2026-10-12:** "never offers" was only true because the b1 knight
  was in the way. With the squares between empty the library castles towards
  the empty corner (the king jumps, no rook moves). `buildStart()` removes the
  right and `checkStart()` refuses a position that still has it; both are
  tests in `tests/unit/simul.test.js`.
- **An opening replayed on a handicap position**: the Italian (`e4 e5 Nf3 Nc6
  Bc4`) without the b1 knight plays through; the Ruy Lopez to `O-O` without the
  h1 rook stops as illegal at `O-O`; any line with `Nf3` without the g1 knight
  stops at `Nf3`. So "is this line still playable" is a plain replay, and it
  gives a clear yes or no.
- **No instant notification exists.** `js/notifications.js` and
  `tools/reminder/` send one daily reminder by Web Push from an hourly job. The
  project is on Firebase's free plan (Spark): no Cloud Functions, no server.
- **Two-account testing**: `tools/emu-verify-pulso-ui.mjs` starts the Firestore
  emulator with the real `firestore.rules`, serves the app with stand-ins for
  three SDK files (a fake signed-in user taken from `?uid=`, the real Firestore
  SDK pointed at the emulator), opens one player on `http://localhost` and the
  other on `http://127.0.0.1` so each has its own storage, and taps with real
  touch events. A third tab on `127.0.0.2` is used there too.

---

## 3. Decisions

Adrian answered on 2026-10-11. Each is marked with his answer. Where a detail
under a decision was mine and he was not asked, it says **PROPOSED**; those are
for him to overrule when he reads this.

### a. How many boards, and who — AGREED as recommended

- **Up to 10 boards.** `MAX_SIMUL_BOARDS = 10` in one place.
- **Only the teacher's own active students** (`coaching` link `active`). The
  database checks the link when the board is created, so nobody without one
  can be pulled into a game.
- PROPOSED: a teacher runs one simul at a time. A student invited by two
  teachers at once sees the invitations one after the other; the app does not
  let them play two simul games at the same moment.

### b. Starting and joining — AGREED as recommended: waiting room, latecomers out

1. **Teacher**: Students → "Simultáneas". Tick students (active ones only, at
   most 10), choose the settings (c to g), press Invite.
2. **Student**: a banner on whatever screen they are on, and a card in
   Students: "Tu profesor Ana te invita a una simultánea", with what the game
   will be (colour, clock, opening, what the teacher plays without) and two
   buttons, Join and Not now.
3. **Waiting room**: the teacher sees each invited student as waiting, joined
   or declined. A joined student sees "Esperando a que Ana empiece".
4. **Start**: the teacher presses Start when they like. Every joined student's
   game begins at that instant. **A student who has not joined by then is left
   out**; their invitation closes and says so.
5. **The invitation expires 10 minutes after it was sent** (server time) if
   Start was never pressed.
6. PROPOSED: Start needs at least one joined student. A simul with one student
   is allowed: it is then simply a game with the teacher.

### c. The teacher's screen at 375px — AGREED: auto-jump to the board waiting longest

```
┌───────────────────────────────┐ 375px
│ ← Simultáneas      7 tableros │
│ [Ana●][Luis●][Eva ][Leo ][Sol●]▸│  ● = waiting for my move
│ ┌───────────────────────────┐ │
│ │                           │ │
│ │   Ana's board             │ │
│ │   (waiting 1:40)          │ │
│ │                           │ │
│ └───────────────────────────┘ │
│ Ana ⏱ 8:12      Yo ⏱ 14:03   │
│ [½ Tablas] [🏳 Rendirse] [⏭] │
└───────────────────────────────┘
```

- One board at full size. Above it a strip of small tiles, one per board,
  that scrolls sideways when they do not fit.
- A tile shows the student's avatar and name, a gold mark when it is the
  teacher's turn there, the student's clock when there is one, and the result
  once the game is over.
- **After the teacher moves, the app jumps to the board where a student has
  been waiting longest for the teacher's move** (the oldest move time among the
  boards where it is the teacher's turn). If no board is waiting, it stays.
- Tapping a tile opens that board. ⏭ skips to the next waiting board without
  moving. A switch turns the auto-jump off.
- The build session measures this at 375×667 rather than trusting the drawing:
  the strip, the board, both clocks and the buttons must all be on screen
  without scrolling.
- Navy and gold, the existing Students cards and chips, Kael for the
  explanations. No new visual style.
- **AS BUILT (conversation 6, Adrian's answer: "opponent clock on top, teacher
  clock under"):** the clock line of the drawing does not fit. The student's
  clock is at the end of the line above the board that says whose move it is;
  the teacher's own is at the start of the button row under the board, where
  the switch's words shorten to "Auto". It costs no height: End still ends at
  666 px of 667. A tile shows the clock that is RUNNING on its board (the
  teacher's own, in gold, when it is their move there; the student's
  otherwise), red with a red frame when the teacher has under a minute there,
  and the teacher is told once in words.

### d. Clock and the move rule — AGREED as recommended

- **Free play**: a student moves whenever it is their turn, as in any online
  game. The classic "wait until the master arrives" rule is not built.
- **The teacher chooses at setup: no clock, or one of four controls**:
  10 min + 5 s, 15 min + 10 s, 30 min + 20 s, 60 min + 30 s (minutes each, plus
  seconds added after every move). There is always an added-seconds control
  when there is a clock.
- **Every board has its own two clocks.** The teacher's clock on a board runs
  while it is the teacher's turn on that board, so with ten boards ten of the
  teacher's clocks can run at once. To make up for that **the teacher gives
  themselves extra minutes at setup**, added to their clock on every board.
  PROPOSED: 0 to 60 minutes in steps of 5, with the app suggesting 2 minutes
  per board.
- **All time is server time.** How it works, in plain words: every move is
  stamped by the server. The time a move took is the gap between two server
  stamps, so it can only be worked out once the stamp exists. Therefore **each
  move also settles the clock for the move before it**: when the student
  moves, their write records exactly how much time the teacher's last move
  cost, taken from the two stamps already stored. Neither phone's own clock is
  ever part of the number, and the database can check it exactly. What a
  screen shows between moves is a countdown against the measured server time,
  the way Duel does it.
- **Losing on time**: when the side to move has no time left by server time,
  either player's phone may claim it and the database checks the claim against
  the stored stamp. A move sent after the mover's time ran out is refused.
- This arithmetic is a design, not yet proven. Conversation 1 writes it as a
  pure function with tests; conversation 2 proves it against the emulator.

### e. Colour — AGREED as recommended: the teacher, one choice for all boards

At setup: the teacher plays **White on every board, Black on every board, or
alternating** (first board White, second Black, and so on, in the order the
students are listed). Students do not choose.

### f. Thematic opening — AGREED as recommended: from the list, or played on a board

- The teacher either **picks one of the named openings** in
  `js/openings-eco.js`, or **plays the opening moves on a small board** (up to
  20 moves by each side). No typing.
- **Every board starts from the position after those moves**, with whoever is
  to move there moving first. The opening moves are kept with the game, so the
  saved game shows them from move 1.
- The opening names stay in English in both languages, as they are everywhere
  else in the app today.

### g. Handicap — DECIDED BY ADRIAN: any pieces, any number, set per student

His answers: "the teacher can select any piece he want to give as a handicap";
any number of pieces; set per student.

- In the waiting-room setup, each student can get their own handicap or none.
  The teacher taps pieces off a small board of their own side: any pawns and
  pieces, as many as they like, **never the king**. A "same for all" button
  copies one student's handicap to every board.
- **Castling**: if the rook on a corner is removed, the teacher cannot castle
  on that side. The app removes that right from the start position itself,
  because the chess library does not (section 2). The other side is untouched.
- The student is told in words before joining and on the game screen: "Tu
  profesor juega sin: dama, torre de a1".
- **Opening and handicap together — DECIDED BY ADRIAN: yes, when the line
  allows it.** For each board with a handicap the app replays the opening
  without the missing pieces. If every move is still legal, that board starts
  from the result. If not, the teacher is told which student and which move
  ("En el tablero de Luis no se puede jugar O-O sin la torre de h1") and must
  change the opening or that handicap before inviting.
- Checked: `vendor/chess.js` and `GameTree` accept all of these positions
  (section 2).

### h. Leaving and losing connection — AGREED as recommended

- **Closing the app or losing signal is not resigning.** The game is still
  there when the player comes back, on either side.
- **With a clock**, the clock settles any absence by itself.
- **Without a clock, nothing is automatic.** Nobody loses for being slow.
  **The teacher can end the simul at any time**; boards still open are then
  recorded "not finished", with no winner. A student can resign or simply
  leave.
- **A simul nobody closed ends by itself 3 hours after Start**: from then the
  teacher can start a new one over it. This is Duel's "a match nobody closed
  can be replaced".
- PROPOSED: a Leave button asks first and then counts as resigning that board,
  as in Duel. For the teacher, "End simul" asks first and is not a
  resignation: finished boards keep their result, open ones are "not
  finished".

### i. Results — AGREED as recommended

- **Mate, stalemate, threefold repetition, the 50-move rule and not enough
  pieces** end a game automatically, decided by the chess library on the phone
  that makes the move.
- **Resign**: either side, their own board only.
- **Draw offer**: either side can offer; it stands until the other accepts,
  declines or moves. **One offer per player per 10 moves**, so a student cannot
  pester the teacher.
- **Flag**: as in d.
- **Where games are kept**: **each phone saves its own games in the existing
  game History** and opens them in Analysis exactly like a game against the
  engine. The shared online copy lasts only until that teacher's next simul
  with that student. There is no online archive.
- **No rating moves. None.** Not the four ELO domains, not Sealed Moves, no
  tally of wins.

### j. How a student learns a simul is starting — AGREED as recommended

- **A banner inside the app**, on whatever screen the student is on, the
  moment the invitation arrives, if the app is open.
- **A "Tell them" link** the teacher sends by WhatsApp, like Duel's:
  `https://chesstrainingcenter.app/?simul=<teacherUid>`, which opens the app on
  the invitation.
- **Said plainly: a student whose app is closed learns of it only if the
  teacher tells them.** A real phone notification is not in this plan
  (section 6).

### k. The database and its rules — design AGREED ("Yes, write the spec")

**One document per teacher–student pair, reused for every simul:**
`simulGames/{teacherUid}_{studentUid}`, the same id shape as the `coaching`
link. At most 30 per teacher, ever, so storage does not grow.

What it holds: the two uids; `cls` (the uids of everyone invited to this
simul, at most 10); the status (`invited`, `joined`, `live`, `done`, `out`);
server stamps for the invitation, the start and the last two moves; the start
position; the opening moves; the teacher's colour; the clock control and the
two remaining times; the moves as one string, five characters a move, only
ever added to; the move count; a pending draw offer; the result and its
reason.

**Who may do what:**

| Action | Who | What the database checks |
|---|---|---|
| Read | the teacher, the student, and anyone in `cls` | nothing else can read it |
| Create / re-invite | the teacher | the id is `me_student`; the `coaching` link is `active`; status `invited`; invitation stamped by the server; counters at zero; the old game is over, or its invitation is older than 10 minutes, or it started more than 3 hours ago |
| Join / decline | the student | `invited` → `joined` or `out`, inside the 10 minutes, nothing else changes |
| Start | the teacher | `joined` → `live` with the server's stamp; `invited` → `out` |
| Move | the side to move | status `live`; the move count goes up by one; the string grows by exactly one well-formed move and the earlier moves are unchanged; the previous move's time is settled exactly from the stored stamps; the mover had time left; a mover cannot touch the result except to end the game with this move |
| Draw offer, accept, decline | either player | one field; an accept only of the other side's offer |
| Resign | either player | the winner is the other one |
| Flag | either player | the side to move is out of time by server time |
| Void | either player | status `live` → `done`, result none, and who did it is recorded |
| End simul | the teacher | `live` → `done`, "not finished", no winner |
| Delete | the teacher or the student | never while `live` |

The `coaching` link is looked up only when a board is created, never on a
move: a lookup inside a rule is billed as a read.

**The honest part.** The database can check who is writing, whose turn it is,
that moves are only added, the clocks, and every time. **It cannot check that a
move is legal chess, or that "checkmate" is true**, and no rule can be written
that does. So:

- **Each phone checks the other side's move with the chess library before
  showing it.** A move it cannot play is not played.
- **DECIDED BY ADRIAN: such a board is marked void.** It stops, with no
  winner, recorded as "void: invalid move", and both players and the teacher's
  strip show it. Nobody gains a win from it.
- A false "checkmate" is caught the same way: the other phone looks at the
  position, sees it is not mate, and voids the board.
- What this leaves open is in section 6.

**Tests**: `tests/rules/simul.test.js`, one test per row of the table and per
refusal, in the style of `tests/rules/pulso.test.js` ("every clause here is
covered by a test"). `npm.cmd run test:rules` must pass, including the 442
that exist.

**What it costs** (counted, not measured; conversation 2 measures it with the
emulator's counters). One simul of 10 boards, each game 40 moves long (80
single moves):

| | Writes | Reads |
|---|---|---|
| Invite, join, start (10 boards) | 30 | 30 |
| Moves, 80 a board | 800 | 800 on the teacher's phone, 800 across the ten students |
| Endings | 10 | 20 |
| **One simul** | **≈ 840** | **≈ 1,700** |
| Each student watching another board all game | | + 80 each, up to + 800 |

Against the free daily allowance for the whole app (20,000 writes, 50,000
reads): **about 23 such simuls a day by writes**, about 20 by reads if every
student also watches another board the whole time. **Writes are the limit.**
The rest of the app uses the same allowance, so the real number is lower. A
student who has a teacher costs up to 3 reads per app open for the invitation
listener; a user with no teacher costs nothing.

### l. Privacy — DECIDED BY ADRIAN: students can watch the other boards, at any time

- A student has an "Otros tableros" button from the start of their game. It
  lists the other boards of the same simul and opens any of them live, read
  only.
- **What this means, said plainly**: every student in a simul sees the name
  and avatar (as their public profile row shows them), the moves, the clock
  and the result of every other student in it, including classmates who are
  not their friends in the app. With a thematic opening all boards start from
  the same position, so a student can see what a classmate played.
- **Nobody outside the simul sees anything**: not other students of the same
  teacher who were not invited, not friends, not the leaderboard, not the
  teacher's other teachers. The board document is readable only by the
  teacher, that student and the others invited to that simul.
- A student's phone listens only to the one board it is showing.
- **AS BUILT (conversation 8, Adrian's answers):** "Otros" is a third button in
  the row under the student's board (no height: a strip of tiles like the
  teacher's would have meant listening to every board all game). It opens a
  sheet listing the other boards; the phone listens to the whole class only
  while that sheet is open, then to the ONE board being watched, beside its
  own. Measured: opening the list is one read for every board that names the
  student (this simul's, their own included, and boards of older simuls that
  still do, which are not listed) plus one read a classmate for the names,
  once while the app stays open; then 1 read a move on any of them while it is
  open. Watching a board is 1 read to open and 1 a move. A student watching is
  told when their own board wants them (the move sound, and the way back
  says it) and is never moved by the app.

---

## 4. Build plan — eight conversations

The rule for all of them: **every session that changes a screen checks it at
375px, light AND dark, Spanish AND English, with screenshots actually opened
and looked at.**

**How a live game is tested.** One signed-out headless browser cannot test
this. Conversations 2 to 8 use a new tool, `tools/emu-verify-simul.mjs`, built
on the method of `tools/emu-verify-pulso-ui.mjs` (read its header first): the
Firestore emulator running the real `firestore.rules`, the app served with the
same three stand-in SDK files, a teacher on `http://localhost` and students on
`http://127.0.0.1` and `http://127.0.0.2`, real touch events. Copy the harness
into the new tool; do not rework Duel's.

1. **The rules of the game, no screen.** `js/simul.js`, pure, with unit tests
   (`npm.cmd run test:tree`): building a start position from a handicap and an
   opening (the castling fix, the replay that says which move fails); packing
   and unpacking moves; whose turn it is; the clock arithmetic of decision d;
   who may claim what; which board comes next for the teacher; the draw-offer
   limit. Checks: the tests, including every position listed in section 2.
   No screen, no database, nothing to deploy.
2. **The database.** The `simulGames` block in `firestore.rules`,
   `tests/rules/simul.test.js`, the reading and writing functions in
   `js/firebase.js`, and the first `tools/emu-verify-simul.mjs`: a teacher and
   two students play a whole game through the rules with no screen, and the
   tool prints the real count of writes and reads to set against 3k. **Adrian
   runs `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy` before the
   push.**
3. **Invitation and waiting room.** The "Simultáneas" entry in Students, the
   student picker, colour only (clock, opening and handicap come later), the
   invitation banner and card, Join / Not now, the waiting room, Start, the
   10-minute expiry. Checks: the tool with three phones; latecomer left out;
   an expired invitation; the four screenshot combinations.
4. **The game.** The student's board and the teacher's board with the strip,
   auto-jump and ⏭, moves both ways, the other phone's move checked before it
   is shown, a reload in the middle of a game, signal lost and back. No clock,
   normal start position. Checks: the tool plays three boards to mate; an
   impossible move seeded into the database is refused and the board voided.
5. **Endings and keeping the games.** Resign, draw offer and its limit, the
   automatic draws, void, End simul, the 3-hour replacement; saving to History
   on both phones (`buildRecord()` in `js/history.js` needs a human opponent:
   read `namesFor()`, `matcher()` and the History screen before changing it);
   opening in Analysis with the right start position.
6. **The clock.** The four controls, the teacher's extra minutes, both clocks
   on both screens, the tile clocks, flag. Checks: a phone whose own clock is
   wrong by 7 seconds (as Duel's tool does), a flag really waited out, a move
   sent after time refused.
7. **Opening and handicap.** The opening picker and the small board for
   playing the moves, the per-student handicap board with "same for all", the
   "this line cannot be played" message, the words the student reads.
8. **Watching, the link, and the first-time explanation.** "Otros tableros",
   the `?simul=` link opened by an invited student, by someone not invited and
   signed out, and Kael's explanation the first time for teacher and student.

Conversations 6 and 7 do not depend on each other. If the rules written in
conversation 2 turn out wrong in a later one, that conversation changes them,
re-runs `test:rules`, and Adrian deploys again; it is not planned, but it is
likely to happen once.

## 5. Not in scope

A real phone notification for the invitation; a scheduled simul; the classic
"move only when the master arrives" rule; a free-entry time control; inviting
friends who are not students; more than 10 boards; an online archive of simul
games; any rating or win tally; a student choosing their colour; chat during
the game; takebacks; a spectator who was not invited; a game between two
students; one-to-one games outside a simul as their own feature.

## 6. Open risks, said plainly

- **This is the app's first live game, and nothing in it has been played
  yet.** Eight conversations is an estimate from the size of Duel, which was a
  simpler thing.
- **A changed copy of the app can still spoil a game.** It cannot win by
  cheating, but it can send an impossible move and get the board voided, or
  void a board it is losing. The record shows who voided it and the teacher
  sees it. With no rating at stake and a teacher who knows the student, that
  is where it stays. Nothing can stop a student using an engine on another
  device.
- **The start position is written by the teacher's phone and the database
  cannot judge it.** The student's phone checks it (one king each, a real
  position) before offering Join.
- **The clock design is unproven.** If the exact settling of decision d
  cannot be written in rules, the fallback is a clock the two phones agree on
  with the database checking only the flag, which a changed app could bend by
  a few seconds a move.
- **Ten clocks running at once may simply be too hard for a teacher**, extra
  minutes or not. Only real use will say; the controls and the suggestion of 2
  minutes a board are a first guess.
- **A student whose app is closed is not told.** A class will be organised by
  WhatsApp, with the link.
- **Watching exposes every student's game to the whole group** (decision l),
  and with a thematic opening lets one student copy another. Adrian chose it
  knowing this.
- **The free allowance caps the whole app at roughly 20 ten-board simuls a
  day**, shared with everything else the app writes. Enough for a few
  teachers; not for many.
- **A phone with no signal queues its moves.** Without a clock they arrive
  late and the game goes on. With a clock a move that arrives after the time
  ran out is refused, and the screen must then say the game was lost on time,
  not leave a move on the board that never happened.
- **A student removed by the teacher, or who ends the coaching, in the middle
  of a simul**: the link is checked only when the board is created, so the
  game in play continues to its end. The build must make sure the screen does
  not break when the student disappears from the teacher's list.
