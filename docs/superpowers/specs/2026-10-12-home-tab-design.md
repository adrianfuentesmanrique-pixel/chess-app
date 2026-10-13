# Inicio / Home — the screen the app opens on (design)

Date: 2026-10-12. Status: **design only, nothing built.** Written against commit
`5c607ff` (cache v196). Internal name `home`; the screen is `#screen-home`.

Adrian's words: "Create designs for the home tab and select the best one." And,
after seeing them: "I like A but instead of setting in the lower part all
sections (that i feel repetitive), we can set up another board that will show
between two things: 1 endgame and ask the question like, do you know this
endgame? learn in the learning tab! or something like that. 1 opening position,
and ask the user if he want to play this opening against the engine. another
interactive space, beside the puzzle of the day, where the user can visually see
another board."

---

## 1. What it is

*One page that answers "what do I do today?" the moment the app opens: Kael says
one line, the puzzle of the day and the other two missions sit in one card,
below it whatever you left half-way, and at the bottom a second board to
discover: an endgame or an opening.*

Today the app opens on Analysis, an empty board. A new user has to open the menu
to find out there are puzzles, lessons and a daily streak.

## 2. The three designs that were drawn

All three were built as a standalone page and photographed with headless Chrome
at 375px, light and dark, Spanish and English, for a regular user and for a
brand-new signed-out one. The pictures were opened and looked at.

| | What it was | Why it was not chosen |
|---|---|---|
| **A, "Hoy"** | One column: Kael's line, one gold card with the puzzle and the missions, "Continuar", then all eight sections as small buttons | **Chosen**, with the eight buttons replaced by the second board (Adrian) |
| B, "Tablero" | A navy puzzle banner, three numbers, then a tile for each of the eight sections | Mostly repeats the menu; for a new user the tiles are only descriptions |
| C, "Kael te guía" | Large Kael artwork with a week of streak dots, a full-size puzzle board, a sideways row of cards | The big board pushes everything else off the first screen; a sideways row competes with the swipe between tabs |

Kept in this folder for the build sessions:

- `2026-10-12-home-tab-mockup.html`: the page that draws all of them. Open it in
  a browser with `?d=final&theme=light&lang=es&state=active` (also `theme=dark`,
  `lang=en`, `state=new`; `d=a`, `b`, `c`, or no `d` for the first three).
- `2026-10-12-home-tab-light.png`: the chosen design, Spanish, regular user.
- `2026-10-12-home-tab-dark.png`: the chosen design, English, brand-new user.

**What in the pictures is made up:** the puzzle position, "Marta", "Mi sistema",
every rating, "nivel 4", "38 jugadas", "mates básicos", "Nivel 1, sin reloj".
They show the shape, not the app's data. The endgame (La regla del cuadrado,
`p1`) is real.

**One sentence in the pictures is wrong and must not be built:** "Te faltan 2
misiones para que la racha llegue a 13." The streak and the missions are two
separate things in the code (`Streak` counts real practice; `DailyMissions` has
its own counter). See decision a, item 1.

---

## 3. Decisions

### a. What is on Home, top to bottom — DECIDED BY ADRIAN (design A, changed by him)

1. **Kael's line.** His bust (`icons/kael/kael-bust.png`, in a gold ring) and one
   sentence in a speech bubble. Not tappable. The sentence is chosen by the
   first rule that fits:
   - never used the app (streak 0, no missions done ever): a welcome that points
     at the puzzle;
   - all three missions done today: well done;
   - a live streak not yet counted today (`Streak.isPending()`): "your N days
     are waiting, today does not count yet";
   - streak already counted today: "N days, today counts";
   - otherwise: start a streak today.
   With a display name it greets by name and time of day; signed out, without.
2. **The "Hoy" card** (gold border).
   - Header: "Hoy" and a chip "1 / 3" (missions done today).
   - A small board with the puzzle of the day, its title, "Juegan blancas/negras"
     and a gold **Resolver** button. Tapping the board or the button does exactly
     what the first mission does today: `DailyMissions.goPuzzle()`. When that
     mission is done the button reads "Resuelto ✓" and is quiet, not gold.
   - Under it, the other two missions as the same rows Profile shows today
     (`.daily-mission-row`): play a game against the engine → Play; practise an
     opening → Openings.
3. **"Continuar"**, only the rows that exist, three at most, in this order:
   - homework from a teacher that is still open (`Students.homework`, status
     `open`) → the Students screen. A gold "Nueva" pill if not seen yet;
   - the book last opened (`db.listBookSummaries()`, newest `openedAt`) → Read,
     opening that book at its page;
   - the last game against the engine (`db.pageHistory({ count: 1 })`) → that
     game, opened the way Play's history opens it.
   With no rows at all the heading is not drawn either (see b).
4. **"Descubre": the second board — ADDED BY ADRIAN.** One card, one board, one
   question, one button. It shows one of two things:
   - **An endgame:** the position of one of the 265 studies, its name, "¿Conoces
     este final?" and its subtitle. Button **Aprenderlo** → the Learn screen with
     that study open (`Endgame.openPosition(pos)`).
   - **An opening:** the position after its first moves, its name, "¿La juegas
     contra el motor?" and the moves. Button **Jugarla** → Openings, with the
     library's own Study question for that line (colour and level,
     `OpeningLib.study()`), so there is one way to start such a game, not two.
   - **Which one, and which position — my reading of "show between two things",
     to be confirmed:** they alternate by the calendar: an endgame one day, an
     opening the next. The position is picked from the date, like the puzzle of
     the day, so it is the same all day and changes at midnight. Two small chips
     in the card's corner, "Final | Apertura", let the user look at the other
     one; the choice is not remembered.
   - It is not a mission and does not touch the streak by itself.

Nothing else. **Not on Home:** the eight section buttons (Adrian: repetitive;
the menu is one tap away), the four rating cards, friend requests (the gold dot
on the avatar already says it), practice time, Rush bests, leaderboards.

### b. What a brand-new, signed-out user sees — RECOMMENDED, shown to Adrian with the designs

Home is never a page of empty boxes, because nothing on it needs an account:

- Kael's welcome line.
- The "Hoy" card, complete: the puzzle of the day and "0 / 3". The puzzle and
  the missions work signed out.
- In place of "Continuar", **"Empieza por aquí"** with three rows: your first
  lesson (Learn), play against Kael at the lowest level (Play), and the guided
  tour (`Tour.start`). This block shows while there is nothing to continue
  **and** the user has never finished a day of practice (`bestStreak` is 0).
  Someone who has practised but has nothing half-way simply sees no middle block.
- "Descubre", complete: the endgames ship with the app.

The streak in the top bar shows 0, greyed, as it does today.

### c. The menu, the swipe and Back — RECOMMENDED, shown to Adrian with the designs

- **Home is a button in the menu, the first one**, above Analysis, with a house
  icon. The title in the top bar reads "Inicio" / "Home".
- **Swipe order:** Home is first. A swipe from Home goes to Analysis; a swipe
  back from Analysis returns to Home.
- **Android Back:** it keeps walking back through the screens visited, as today,
  and the last stop is Home; one more Back leaves the app. In the code this is
  one constant: `HOME_SCREEN` in `js/app.js` is `'analysis'` today and the back
  stack starts from it.
- Checked: `TAB_ORDER` is read from `#tabbar button`, and the comment above
  `#menu-limits` in `index.html` says that selector must match exactly the
  destination buttons. Home becomes the ninth such button, a real destination,
  so the rule holds; the comment's "eight" becomes "nine".

### d. Where the app opens — RECOMMENDED, shown to Adrian with the designs

**Always on Home**, not on the last tab used. `main()` in `js/app.js` ends with
`showScreen('analysis')`; that one call becomes `showScreen('home')`.

Things that open the app for a reason still win, as they do today, because they
run after that call: a file shared into the app (`handleIncomingFiles`), a
Lichess connection coming back (`Lichess.finishConnect`), a Pulso/Duel link
(`PulsoUI.boot`). The other `showScreen('analysis')` calls in `js/app.js` and the
one in `js/tour.js` are not "the app opening"; the build session reads each one
and leaves alone those that really mean Analysis.

### e. The daily missions — RECOMMENDED, shown to Adrian with the designs

**They move to Home.** Profile's "Misiones diarias" card shrinks to one row:
"Misiones de hoy: 1 / 3" with an arrow, which opens Home. The mission counter
(`🔥 n`, `#daily-missions-streak`) stays on that Profile row; Home shows only
"1 / 3", so the top bar's streak and the missions' own counter are never side
by side with two different numbers.

Checked: `DailyMissions.render()` draws into `#daily-missions-list`, and the
tour's step `profMiss` points at that same id on Profile. Both move together.

Kael's reminder 45 seconds after opening (`DailyMissions.remindIfIncomplete`)
says what Home already shows. It is skipped while Home is the screen in view.

### f. The first-run tour — RECOMMENDED, shown to Adrian with the designs

- The tour **starts on Home** with its welcome, then one new step that rings the
  "Hoy" card ("this is your day: one puzzle, one game, one opening").
- Then it goes on to Analysis and the rest exactly as today.
- The step `profMiss` (missions on Profile) is removed; the new Home step
  replaces it.
- The tour ends on Home (`ctx.showScreen('analysis')` near the end of
  `js/tour.js` becomes Home).
- The level picker shown on the very first launch (`Onboarding`) comes before
  Home is seen, as it comes before Analysis today.

### g. What opening Home costs — RECOMMENDED, shown to Adrian with the designs

**Home is drawn from what is already on the phone, and it does not wait for
anything.** No Firestore read, no engine.

| Item | Where it comes from | Cost |
|---|---|---|
| Kael's line, "1 / 3", missions | `Streak`, `DailyMissions`, already loaded in `main()` | none |
| Homework | `Students.homework`, kept in `studentsCache` on the phone; the Students module already asks the server on its own schedule | none added |
| Book, last game | the phone's own database | two small local reads |
| Endgame board | `ENDGAMES`, already in memory (imported at start) | none |
| **Puzzle board** | `puzzleOfDay()` needs one whole puzzle file, about 0.5 MB | **loaded after Home is drawn**; the card shows its title and button first and the board fills in. Offline without the file, the board stays out and the button still works as today |
| **Opening board** | the library is 323 KB and is loaded only when the Openings library is opened | **Home does not load it.** A short list of about 30 well-known openings (name and moves) lives in the Home module; the position is worked out with the chess rules already loaded. The library is loaded only on "Jugarla" |

Home is not listed in `AREA` in `js/activity.js`, so time spent looking at it
counts as no practice. That is right and stays so.

---

## 4. Build plan — three conversations

1. **Home exists and the app opens on it.** `#screen-home` in `index.html`;
   `home` in `SCREENS` and `MENU_AREA`; the first menu button; `HOME_SCREEN`;
   `main()` opens Home; swipe and Back as in c. Kael's line (the five rules).
   The "Hoy" card with the puzzle's title and button but **no board yet**, the
   chip, and the two mission rows; `DailyMissions.render()` draws there.
   Profile's card becomes the one row. The tour as in f, because moving the
   missions breaks its `profMiss` step otherwise. The 45-second reminder skipped
   on Home. A new `js/home.js` for the parts that are pure (which sentence Kael
   says, given streak and missions), with unit tests. Both languages. Precache
   list and version bump. A `tools/cdp-verify-home.mjs` modelled on
   `tools/cdp-verify-calc.mjs`.
   *Checks:* opens on Home fresh and after a reload; menu order; swipe both
   ways; Back from three tabs deep ends on Home, then leaves; a shared file
   still lands on Analysis; the tour runs end to end; a mission done on its own
   screen shows as done on Home and on Profile's row; `npm.cmd run test:tree`
   and `npm.cmd run test:precache` pass.
2. **The two boards.** The puzzle board in the "Hoy" card, loaded after the
   screen is drawn, with the offline case; "Resuelto ✓" once solved. The
   "Descubre" card: the pick by date (pure, unit-tested: alternation, the same
   all day, different tomorrow), the endgame side, the short opening list (a
   unit test checks every entry is a real line of the library), the two chips,
   both buttons landing in the right place.
   *Checks:* Home's first paint does not request a puzzle file or the opening
   library (read the network list); with the network off the page still draws;
   "Aprenderlo" opens that exact study; "Jugarla" opens the Study question for
   that exact line; the puzzle on Home is the one `goPuzzle()` then loads.
3. **Continuar and Empieza por aquí.** The three rows and their rules, the
   new-user block, redrawing when the account changes (`Auth.onChange` in
   `main()`), when the day changes (`Streak.checkDay`), and when the user comes
   back to Home from another tab.
   *Checks:* a brand-new profile shows "Empieza por aquí"; with a book, a game
   and a homework all three rows show in order and each opens the right thing;
   deleting the book removes its row; signed out, no homework row and no error.

Every session that changes a screen checks it at 375px, light AND dark, Spanish
AND English, with screenshots actually opened and looked at.

## 5. Not in scope

The eight section buttons, rating cards, leaderboards, friends, practice-time
charts or Rush bests on Home; a news or "what's new" block; a Home that the user
can rearrange; remembering the last tab; a different Home for teachers; making
the "Descubre" card a mission; changing what counts for the streak; any
Firestore rule or index.

## 6. Open risks, said plainly

- **"Descubre" sits at the bottom, below the first screenful** when all three
  "Continuar" rows show on a small phone (in the picture the card starts right
  at the 667px line). A user who never scrolls will not see it. If that matters,
  the fix is to put it above "Continuar"; that is Adrian's call after seeing it
  on a phone.
- **The alternation rule and the two chips are my reading** of "show between two
  things". He may have meant something else (both on one card to flip between,
  or a random one each time the app opens).
- **The puzzle of the day is easier than expected, and that is how it is built
  today, not something Home changes.** Read in `puzzleOfDay()`: every player
  rated under 1800 gets a puzzle from the lowest file (`puzzles-0.json`, ratings
  up to 799). That file is also **not** among the files stored for offline use
  (`sw.js` stores only `puzzles-3.json`), so a new user with no connection gets a
  different puzzle from whatever is loaded. Putting the puzzle on the front page
  makes both more visible. Whether to store that file offline (about 0.5 MB more
  at install) or change the bands is a separate decision.
- **Opening names are in English only.** The library says so itself ("name: the
  opening, in English"). In Spanish the card will read "Italian Game". Fine for
  most names, odd for a few.
- **Two Kaels on one screen:** his bust beside the line at the top, and the
  floating button in the corner that every screen has. The first build session
  looks at the screenshot and decides whether the corner one hides on Home.
- **Homework on Home is only as fresh as the Students module's own check.**
  Home adds no server read, so a homework given a minute ago may not show until
  that check runs. That is the price of "opens instantly and offline".
- **Home adds one more step before the board** for the user who only ever
  analyses. Always opening on Home was chosen over remembering the last tab;
  if regular users complain, that decision is the one to revisit.
- **`js/app.js` is large and another session may be in it.** Conversation 1
  touches `showScreen`, the menu and `main()`: it re-reads them as they are
  that day.
