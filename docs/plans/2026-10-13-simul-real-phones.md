# The first simul on real phones — checklist

Date: 2026-10-13. App version under test: v209 (commit `c85ccbc`).
Spec: `docs/superpowers/specs/2026-10-11-students-simul-design.md`.
Nothing here has run outside the emulator before today.

How to use it: one step at a time. Adrian does the step and says what he sees;
the result column is filled in as we go with PASS, FAIL or SKIPPED and his words.
"Should" lines are what the build notes say the screen does, not something
anybody has seen on a phone yet.

## Who is who

| Name here | Device | Account |
|---|---|---|
| TEACHER | phone A (the installed Play Store app) | an account that already has both students below as ACTIVE students in Students |
| STUDENT 1 | phone B | a student of TEACHER |
| STUDENT 2 | a browser tab on the PC (chesstrainingcenter.app, signed in) | a second student of TEACHER |

Two simuls are played. Simul 1 has NO clock (the basics, watching, draw,
resign, End). Simul 2 has the 10+5 clock (the clocks, closing the app, no
signal, a flag).

## Before the first step

| # | Check | Result |
|---|---|---|
| P1 | Repo: `main` level with `origin/main`, last commit `c85ccbc`, live `sw.js` says v209 | PASS (checked by Claude, 2026-10-13) |
| P2 | The live database has the repo's rules (Adrian ran `rules:deploy` after v204, or runs it now) | PASS: he was not sure, ran `rules:deploy` on 2026-10-13 and said "deployed" (output not shown to Claude) |
| P3 | Every device runs v209. The app shows no version number anywhere, so: with internet on, open the app, wait 30 seconds, close it completely, open it again. Then Puzzles must show "Siguiente ➡" inside the status bar (v208), and on TEACHER Students → "♟ Simultáneas" must show "¿Cómo funciona?" (v209) | TEACHER phone: PASS ("yes both good": Siguiente is in the bar, the Simultáneas screen opens). STUDENT 1 and STUDENT 2: not yet checked |
| P4 | TEACHER's Students list shows STUDENT 1 and STUDENT 2 as active | FAIL (setup, not a defect): the picker lists ONE student, Velociraptorblue. A second student is needed for steps 13 to 15 |

## Simul 1 — no clock

| # | Where | Do | Should | Result |
|---|---|---|---|---|
| 1 | TEACHER | Students → "♟ Simultáneas" | The first time: Kael's card at the top explaining a simul, with "Entendido". Under it the list of students to tick | PASS: "yes, there was Kael explaining" (phone in English, dark). He had already dismissed it before the screenshot |
| 2 | TEACHER | Tap "Entendido", leave the screen, come back | The card is gone; "¿Cómo funciona?" is still there and opens the explanation | PARTLY: screenshot shows the card gone and "How does it work?" under the intro; the link has not been tapped yet |
| 3 | TEACHER | Tick both students. Leave colour as it is, "Sin reloj", no opening, no handicap | The button reads "Invitar (2)" | |
| 4 | TEACHER | Tap "Invitar (2)" | The waiting room: both students "waiting", a Start button that cannot start yet, "📤 Avisarles" under it | |
| 5 | STUDENT 2 (PC tab, app open on any screen) | Just watch | A banner arrives by itself: "Tu profesor … te invita a una simultánea", with colour and "Sin reloj". Kael says one line the first time | |
| 6 | TEACHER | Tap "📤 Avisarles" | The phone's own share sheet opens. Choose WhatsApp and send it to STUDENT 1's phone. The text names the teacher, says 10 minutes and ends in a `chesstrainingcenter.app/?simul=…` link | |
| 7 | STUDENT 1 | In WhatsApp, tap the link | SAY WHICH OPENED: the installed app or the browser. Either way it should land on the invitation card in Students, with Kael's card above it the first time. The link must NOT join by itself | |
| 8 | STUDENT 1 | (Only if 7 opened the installed app) copy the link into the browser's address bar instead; and the other way round if you can | The same card in the other place | |
| 9 | STUDENT 1 | Tap "Unirme" | "Esperando a que … empiece". On TEACHER the row turns to joined, with no reload | |
| 10 | STUDENT 2 | Tap Join on the banner | Same. TEACHER's button reads "▶ Empezar (2)" | |
| 11 | TEACHER | Tap "▶ Empezar (2)" | TEACHER: a board with a strip of two tiles above it. Both students: their board opens, or a banner "La simultánea con … ha empezado" with "Ir al tablero" | |
| 12 | All | The side with White moves on both boards; the other side answers. Play 3 moves each on both | Each move shows on the other device within a second or two. After TEACHER moves, the phone jumps by itself to the other board. The tiles show whose move it is | |
| 13 | STUDENT 1 | Tap "Otros" under the board | A sheet listing STUDENT 2's board (name and avatar). If it stays on "Cargando…", that is a finding: stop and say so | |
| 14 | STUDENT 1 | Tap that board. Then TEACHER and STUDENT 2 play a move each on it | STUDENT 1 sees the moves arrive live. Nothing on the board can be moved. The line says they are only watching | |
| 15 | TEACHER | While STUDENT 1 is still watching, play a move on STUDENT 1's own board | STUDENT 1 hears the move sound and the way-back button turns to "● Te toca · Volver a mi tablero". The app does not jump. Tapping it returns to their board | |
| 16 | STUDENT 1 | Tap the draw button (½) | TEACHER: tile says "¿Tablas?", the board says "Te ofrece tablas" with Accept / Decline. TEACHER declines. STUDENT 1 taps ½ again at once: it says why not (too soon) | |
| 17 | STUDENT 1 | Tap resign, confirm | It asks first. Then STUDENT 1: "Te rendiste. Gana …". TEACHER: tile "Se rindió" | |
| 18 | TEACHER | Tap "Terminar la simultánea", confirm (STUDENT 2's board is still open) | It asks first. STUDENT 2's board is recorded "not finished", no winner | |
| 19 | All three | Open Games → History | TEACHER: two games. STUDENT 1: one, lost by resignation. STUDENT 2: one, not finished. Each card says "Simultánea" and the opponent's name; it opens in Analysis | |

Question for Adrian during step 16 (reading 3): the limit is one draw offer per
10 moves BY EACH SIDE (20 single moves). Recommendation: keep.

## Simul 2 — 10+5 clock

| # | Where | Do | Should | Result |
|---|---|---|---|---|
| 20 | TEACHER | "Nueva simultánea". Tick both, choose 10+5, look at "Tu tiempo extra" | The extra time suggests "+5 min" for two boards. Invite | |
| 21 | Students | Both join (banner or card). The card says "Reloj 10+5 (tu profesor: 5 min más)" | TEACHER starts | |
| 22 | TEACHER + STUDENT 1 | Hold the two phones side by side and read the same clock on both | Opponent's clock above the board, mine under it. The same clock on the two phones agrees to within one second | |
| 23 | STUDENT 2 | Play two moves, then STOP moving when it is your turn and leave the tab alone | This clock is left to run out (about 10 minutes) while steps 24 to 27 happen | |
| 24 | STUDENT 1 | Settings of the phone: set the phone's own clock 5 minutes wrong (automatic time off). Reopen the app | The simul clocks still agree with TEACHER's phone to within a second. Put automatic time back on afterwards | |
| 25 | STUDENT 1 | While it is TEACHER's move, close the app completely. Wait 20 seconds. Open it again | The game is still there (banner or card → "Ir al tablero"), nobody resigned, the clock went on running by server time | |
| 26 | STUDENT 1 | Aeroplane mode on. Make a move. Aeroplane mode off | A note says the move will be sent; "Enviando tu jugada…". When the signal returns the move reaches TEACHER | |
| 27 | TEACHER | Leave Simultáneas for another tab for 20 seconds while STUDENT 1 moves, then come back | The board reloads with the move on it, on the board the teacher was on | |
| 28 | TEACHER (Simultáneas open) + STUDENT 2 | Wait for STUDENT 2's clock to reach 0:00 | Within a few seconds both say it: STUDENT 2 "Se te acabó el tiempo. Gana …", TEACHER's tile "⏱ Ganada". The clock reads 0:00 | |
| 29 | TEACHER | Resign STUDENT 1's board (flag icon), confirm | STUDENT 1: "… se rindió. Ganaste." The teacher's screen stays on the finished simul until "Nueva simultánea" | |
| 30 | All three | Games → History | The new games are there once each, cards say "Simultánea · 10+5". The lost-on-time game opens in Analysis | |

Questions for Adrian during step 28 (readings 1 and 2): a move that arrives at
the exact instant the time runs out is too late; a flag is a loss whatever the
other side has left (even against a bare king). Recommendation: keep both.

## Watch for, at any step

- Kael's "next mission" bubble over a live board about 45 seconds after the app
  opens (known, its own task): note the step it happened at.
- Anything cut off, off the screen or overlapping on the phone.
- Any English word on a Spanish phone, or the other way round.

## Findings

**Result, 2026-10-15: PASS, on Adrian's word.** After P1 to P4 and steps 1 and 2
had been recorded together (2026-10-13), Adrian ran the rest himself and
reported: "the test have being carried out, no issued founded". Steps 3 to 30 are
PASS on that report. Claude did not get step-by-step answers, so the record
does not say which link opened (app or browser) at step 7, or whether a second
student was added for steps 13 to 15 (P4 found only one). By the standing rule,
his confirmation ends the testing: no further run is proposed. No defect found,
no code changed.

**The three readings, asked on 2026-10-15:**
1. A move at the exact instant the time runs out is too late: KEPT (his choice).
2. A flag is a loss whatever the other side has left: CHANGED. Adrian chose "draw
   if they can't mate" (the over-the-board rule). Not built here: it changes
   `firestore.rules`, `js/simul.js` and the tool, so it is its own task.
3. The draw-offer limit is 10 moves by each side: KEPT (his choice).
