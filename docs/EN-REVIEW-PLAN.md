# English copy review — batch plan

Goal: every English string in the app reads as though written by a native
English speaker who knows chess. Spanish is out of scope.

Read `docs/STYLE-EN.md` before touching anything. **One batch per commit.**

## How to run a batch

1. Read `docs/STYLE-EN.md`.
2. Edit only `en:` values in the batch's line range. Never rename a key.
3. Boot the app, zero new console errors, toggle the language both ways.
4. Spot-check at **375px in light and dark mode** on the screens that batch
   touched — nothing overflows, truncates badly, or pushes the layout.
   The Claude browser pane does not composite; use the headless-Chrome CDP
   recipe (`~/.claude/launch.json`, add a NEW port — last used **9181** for the
   static server and **9182** for the Chrome debugger; take the next free pair).
   **Check the port is actually free first — batch 10 was told to use 9179/9180
   and 9180 is permanently occupied by `lghub_updater.exe` (Logitech G Hub),
   which answers HTTP but 404s `/json/version`, so the CDP connect just times out
   with no hint why.** `netstat -ano | grep :PORT` before launching. Chrome also
   wants `--no-sandbox` here.
   Three gotchas: `websocket-client` must be created with `suppress_origin=True`
   or Chrome answers the CDP handshake with 403; the app boots in Spanish, so
   set `localStorage.lang = 'en'` and reload before reading any copy; and
   — found in batch 8 — `colorMode`, `onboardingDone` and `tourDone` live in
   **IndexedDB**, not `localStorage`. Set those with
   `import('./js/db.js').then(d => d.kvSet('onboardingDone', true))`, or the
   Kael welcome modal covers every screenshot. Only `lang` is in `localStorage`.
   Batch 9 adds the flip side: to *see* the onboarding modal you must delete the
   IndexedDB database, and **it is called `mi-ajedrez`** (`DB_NAME` in
   `js/db.js`), not anything CTC-shaped —
   `indexedDB.deleteDatabase('mi-ajedrez')` then reload. Deleting the wrong name
   fails silently and you just get the post-onboarding app again.
   For light/dark, `Emulation.setEmulatedMedia` with `prefers-color-scheme` also
   works, because the default `colorMode` is `system`.
5. Confirm the DICT key count is unchanged (see the command below).
6. Bump the cache version in `sw.js` — **read** the current number, do not
   assume it.
7. Commit that batch alone.
8. Report to Adrian: a one-line summary, a count of plain typo/grammar fixes,
   then two lists — **judgement calls** needing his yes, and **not touched and
   why**.

Key-count check (run before and after; the numbers must match):

```bash
grep -c "^\s*[a-z_A-Z0-9]*: {" js/i18n.js
```

## Batches

- [x] **1 — `js/quotes-data.js`** — Kael's quotes, praise, mistake, blindfold,
      hint warning, alt-move and game-review lines, plus the historical quote
      list. *Done 2026-08-07.*
- [x] **2 — the guided tour** — Kael's 31 tour steps plus the tour chrome.
      Screens: the whole tour overlay, every tab. *Done 2026-08-07.*
      **`js/tour.js` holds no `en:` strings** — it is step data and layout code
      that calls `t('tour_…')`. The strings are `js/i18n.js:456–538`, all 66 of
      them (`tour_*`). Batch 9 must therefore skip `tour_*`; its remaining
      scope is Kael onboarding, Settings and Game Review.
      **Amended by batch 9 — this freeze note was becoming misleading.** It held
      for 61 of the 66 keys. Batches 2, 5 and 8 each logged a `tour_*` string
      that no batch owned, so Adrian released **five** of them to batch 9, which
      fixed them: `tour_board_b`, `tour_base_games_b` and `tour_play_ana_b` (all
      three called the Analysis screen "the study board"), `tour_puz_more_b`
      ("puzzle rating" → **Puzzle ELO**, and "options" → **settings**), and
      finally `tour_engine_b`, released last when Adrian answered the
      product-truth question in the batch-9 follow-up — "the best move**s**" →
      **"the best move"**. **Those five are done. The other 61 `tour_*` keys are
      still frozen.**
- [x] **3 — `js/learning-data.js`** — Learn lessons, 59 `en:` strings. Screens:
      Learn → Rules, Basic Checkmates. *Done 2026-08-08.*
- [x] **4 — `js/app.js` badges + `js/badges.js`** — 72 `en:` + the three
      `label: lang =>` functions. Screens: Profile → trophies, badge toasts.
      `js/app.js` is 235 KB — grep for the symbol, then read with offset/limit.
      Never read it whole. *Done 2026-08-08.*
      **Every badge `en:` name lives in `js/badges.js`** (23 of them) — `js/app.js`
      holds no badge strings. The only badge-adjacent `en:` values in app.js are
      the 38 `STREAK_TIERS` labels (`js/app.js:767–804`), which this batch read
      and left alone. The trophy grid is **64 cells**, 3 columns at 375px.
- [x] **5 — `js/i18n.js` lines 3–91** — Tabs, Generic, Analysis. Highest-risk
      batch for the 375px rule: this is where the bottom tab bar lives.
      *Done 2026-08-08.* **The seven tab labels were already correct and were
      not touched.** Measured, not guessed: at 375px the bar is exactly full —
      six buttons of 53.1px plus `Databases` at 56.6px = 375.2px, and the widest
      label (`Databases`, 52.6px) has about 2px of clearance each side. **No tab
      label can grow by a single character in either language.**
- [x] **6 — `js/i18n.js` lines 92–161** — Databases, Play, Game History.
      Do **not** change `history_you`, `history_bot_name`, `history_event`
      (baked into saved PGNs — see STYLE-EN §10). *Done 2026-08-08.* All three
      frozen keys were left untouched. **The Play level cards have room to
      spare**: measured at 375px the cards are 173.5px wide and the longest
      name, `Strong club`, renders at 77.8px on one 16px line — under half the
      card. A level name could grow to roughly 14 characters before wrapping.
- [x] **7 — `js/i18n.js` lines 162–275** — Openings, Puzzles, puzzle theme
      display names, named mating patterns. Theme **ids** must never change.
      *Done 2026-08-08.* No theme id was touched. **The 47-row theme picker has
      room to spare**: rows are 343px wide at 375px and the longest display name
      (`Removing the defender`) renders at 155.5px on one line. **The badge cell
      does not**: `.badge-name` is a 96px box with `-webkit-line-clamp: 2`, so
      every `Master: <theme>` label longer than about 15 characters already uses
      both lines — measured, the new label wraps to exactly 2 lines (26.3px),
      the same as the old one and as the longest existing theme badge.
- [x] **8 — `js/i18n.js` lines 276–435** — Endgame ELO, Profile, profile
      privacy. Watch the four ELO domain keys. *Done 2026-08-08.* **All four ELO
      domain labels were already correct and none was touched** — `Puzzle ELO`,
      `Opening ELO`, `Endgame ELO`, `Blindfold ELO`, exactly STYLE-EN §4. No
      storage key was renamed. **The Profile ELO cards have room to spare**:
      measured at 375px the `.profile-elo-row` is 355px, each `.elo-card` is
      113px, and the label span inside is 93px on one 17px line — the widest,
      `Blindfold ELO`, does not wrap. **The 64-cell trophy grid has zero
      truncation**: unclamping `-webkit-line-clamp` on all 64 `.badge-name`
      boxes changed no height, so nothing is being cut, including
      `Converted: Minor pieces` and `Master: Removing the defender`.
- [x] **9 — `js/i18n.js` lines 436–570** — Kael onboarding, Settings, Game
      Review. *Done 2026-08-08.* **Skip every `tour_*` key — batch 2 already did
      them**, except the four Adrian released to this batch (see batch 2 above).
      *Range corrected by batch 8: the DICT closes at line 570, and 571–585 is
      the `t()` / `applyI18n()` helper code, not strings.* The real sub-ranges
      are **436–455 Kael onboarding**, **456–539 `tour_*` (skip)**,
      **540–558 Settings**, **559–569 Game review**. This is the **last i18n.js
      batch** — after it only `js/endgames-data.js` (batch 10) remains, so any
      i18n.js loose end not closed here needs its own follow-up commit.
- [x] **10 — `js/endgames-data.js`** — **607** `en:` values, 212 KB, **on its
      own**. *Done 2026-08-08.* Never read the file whole. Procedure:
      1. Throwaway script in the scratchpad extracts every `en:` value with its
         line number into a plain review file.
      2. Review that file.
      3. Apply with targeted edits; verify a sample in the app.
      **The "872" written here was wrong and cost nobody a session only because
      batch 9 measured it first.** A naive `en: '` grep also matches inside
      `fen: '`, and there are 265 FEN strings. The real English content is
      **265 `name` + 77 `subtitle` + 265 `comment` = 607**. Any extraction script
      must exclude `fen:`. `id`, `category`, `fen`, `moves` and `result` are
      mechanical data — `category` in particular feeds the `cat_*` labels, the
      Profile radar and the "Converted: …" badges, so its values are storage keys.
      The six `cat_*` labels are **not** in this file; batch 8 finished them.

## Excluded — do not edit

- `js/legal-data.js` (`LEGAL_TERMS`, `LEGAL_PRIVACY`) — legal text. Typos only,
  and only with Adrian's explicit yes on the exact before/after.
- `index.html` — already clean. The brand name "Chess Training Center" must not
  change.
- Every `es:` value. Spanish errors get reported, never fixed.

## Findings log

Things noticed that were **not** fixed, for Adrian to decide.

### From batch 1 (quotes-data.js)

- **"Endgame tab" does not exist.** `js/i18n.js:450` tells the user to focus on
  "the Openings, Puzzles, and Endgame tabs". The tab is called **Learn**, and
  the endgame material lives in its **Endings** section. Fix in batch 9.
- **Duplicate quotes.** The quote list contains near-duplicates, e.g.
  "The purpose of study is understanding, not memorization." vs "The purpose of
  study is understanding."; "Creativity wins games." appears twice;
  "No game was ever won by resigning." vs "Nobody ever won a chess game by
  resigning."; "Every chess master was once a beginner." vs "Every master was
  once a beginner." Deleting entries is a data change, not copy-editing — left
  alone.
- **Spanish (reported, not fixed):** none found in this batch. The Spanish
  Kael lines read correctly.

### From batch 2 (the guided tour)

Waiting on Adrian's yes:

- **"the study board" vs "Analysis".** Three tour lines call the Analysis screen
  "the study board" (`tour_board_b`, `tour_base_games_b`, `tour_play_ana_b`).
  STYLE-EN §4 names the feature **Analysis**, and "study board" appears nowhere
  else in the app, so a new user is told a name the UI never repeats. Changing
  it means picking a house phrase ("your analysis board"?) that §4 does not yet
  have. Left alone — this is a naming decision, not a typo.
- **"puzzle rating" vs "Puzzle ELO".** `tour_puz_more_b` says "Your puzzle
  rating sits up top". The thing it points at is literally labelled
  **Puzzle ELO: 1200** on screen, and `Puzzle ELO` is one of the four rating
  domains. "Your puzzle ELO sits up top" would match. Left for batch 8, which
  owns the ELO domain labels, so the wording gets decided once.
- **`tour_engine_b` overstates the engine slightly.** "it will show you the best
  moves and who stands better" — Stockfish shows one best line by default here.
  Accurate copy would be "the best move". A product-truth call, not grammar.
  **RESOLVED — Adrian said yes on 2026-08-08 and the batch-9 follow-up applied
  exactly that wording.** Batch 2 was right; it just took two more reports to get
  the decision. See the batch-9 section.

Not touched, deliberately:

- **`js/i18n.js:215` `adv_either: 'Ignore colours'`** — British spelling, but it
  is in the Openings block (lines 162–275), which is **batch 7**. Left so each
  batch stays one commit.
- **Kael's tour lines were reworded in batch 1 already** (`js/quotes-data.js`).
  Nothing in this batch contradicts them.

**Spanish (reported, never fixed):**

- `tour_learn_tab_b` / `tour_learn_sec_t` say **"Jaques mates básicos"**. Work
  order #9 changed the Learn tab to **"Jaque mates"**. Both are defensible
  Spanish, but the app now shows the tour one way and the tab another.
- `tour_puz_modes_b`: "Táctica normal, a ciegas, o Rush contrarreloj" — Spanish
  does not normally take a comma before **o** in a simple list.
- `tour_base_games_b`: "Cualquier partida que toques se abre en el tablero de
  análisis. **Ahora está vacía**" — "vacía" agrees with *partida*, but the
  empty thing is the *base*. Reads as if the game is empty.

### From batch 3 (learning-data.js)

Fixed beyond copy, flagged for Adrian:

- **The `board` lesson taught a false fact.** It said "the square h1 ... is
  always **dark**". h1 is a **light** square ("white on the right"). Changed to
  "light" — shipping a wrong chess fact in the very first rules lesson is worse
  than staying literally inside a copy edit. **The Spanish says the same wrong
  thing** — see below.

Waiting on Adrian's yes:

- **Lesson-title casing.** Every lesson title is Title Case (`The Board`,
  `How Pieces Capture`, `En Passant`, `When You Can't Castle`). STYLE-EN §2 puts
  headings in sentence case, but §2 also allows capitalized piece names as
  labels, and §4 already gives `Rules` / `Basic Checkmates` Title Case as
  section names. Left as-is: it is internally consistent, and switching all 18
  titles is a visible sweep, not a typo fix.
- **`kr_vs_k`: "shoulder" → "take the opposition".** The old text said the king
  advances to '"shoulder" it (oppose it directly)'. Shouldering is a real term
  but describes king races; the technique shown here is the **opposition**,
  which STYLE-EN §5 locks. Now "advances to take the opposition (stand directly
  in front of it) and push it toward the edge". This is the one edit that
  changes teaching vocabulary rather than grammar.

Not touched, deliberately:

- **The `Bishop + Knight + King vs King` title truncates** in the lesson header
  at 375px ("Bishop + Knight + King vs …"). Pre-existing; any shorter title is a
  naming decision, and STYLE-EN §9 says keep the short wording and report it.
- **`practice`, `demo`, `fen`, `shapes`, `setupMove`** — mechanical data, not
  copy.
- **Section titles `Rules` and `Basic Checkmates`** — feature names fixed by
  STYLE-EN §4.

**Spanish (reported, never fixed):**

- **`board`: "la casilla h1 ... siempre es oscura" is wrong** — h1 is a light
  square, so it needs "clara". Until it changes, the two languages teach
  opposite things; worth doing soon.
- `castling_illegal`: "Lo mismo ocurre si el rey **tendría** que pasar por una
  casilla atacada" — conditional after "si"; Spanish wants "tuviera que".
- `promotion`: "se corona: se convierte en dama, torre, alfil o caballo" — no
  comma before "o" in a simple Spanish list is correct here, but *corona* and
  *convierte* repeat the same idea back to back. Style, not an error.

### From batch 4 (the badges)

Fixed: `rush_10` and `rush_30` said **"Rush: 10 in a row" / "Rush: 30 in a row"**.
STYLE-EN §4 reserves **Puzzle Rush** and forbids the bare "Rush", and the
lowercase tail was the only one of the 23 badge names not in Title Case — the
sibling badges read `First Puzzle Rush` and `Daily Mission: 1 Week`. Now
**"Puzzle Rush: 10 in a Row" / "Puzzle Rush: 30 in a Row"**. The ids are
untouched, so nobody loses a badge. Verified at 375px: both wrap to two lines
inside the 92px cell and the `-webkit-line-clamp: 2` on `.badge-name` does not
cut them; the toast still fits on one line.

Waiting on Adrian's yes:

- **A badge is called `Opening Explorer`** (`opening_3`, three openings
  trained). STYLE-EN §4 gives that exact name to the **move-tree panel inside
  Analysis**, so the app now uses one name for two unrelated things. Renaming
  the badge is safe (`id: 'opening_3'` never changes) but picking the
  replacement — `Opening Repertoire`? `Three Openings Trained`? — is a naming
  decision, not a typo. Left alone.
- **`Daily Mission: 1 Week` and friends are singular.** The badge is earned by a
  *streak* of daily missions, so a week of them is plural: `Daily Missions:
  1 Week`. `daily_1` ("First Daily Mission") stays singular either way. Left
  alone because the Spanish is singular too and the pair should move together.
- **`STREAK_TIERS` counts in months forever** (`js/app.js:767–804`) — the ladder
  runs `1 month` … `240 months`. A native speaker says **20 years**, not
  240 months, somewhere past the two-year mark. Changing only the English would
  split the two languages, and where the switch happens is a design call.

Not touched, deliberately:

- **`trophy_case` ('Achievements') and `badge_earned` ('Achievement
  unlocked!')** — `js/i18n.js:370–371`, inside the Profile block, which is
  **batch 8**. Both already read correctly.
- **The three `label: lang =>` functions.** Their English prefixes — `Master: `,
  `Converted: `, `Beat ` — are correct as they stand. What follows each prefix
  comes from `t('theme_…')`, `t('cat_…')` and `t('level_names')`, all of which
  belong to **batches 7 and 8**. Editing them here would split one commit across
  two batches.
- **The 38 `STREAK_TIERS` labels** beyond the months point above — `1 day`,
  `7 days`, `3 months` are all correct English.
- **Badge Title Case.** All 23 names are Title Case, like batch 3's lesson
  titles. STYLE-EN §2 puts headings in sentence case, but these are trophy
  names, they are internally consistent, and re-casing 23 of them is a visible
  sweep rather than a copy fix.

**Spanish (reported, never fixed):** see items 7 and 8 in the repair list below.

### From batch 5 (i18n.js 3–91 — Tabs, Generic, Analysis)

Fixed (5 plain fixes): `endings_quote_author` English had the accents stripped
(`Jose Raul Capablanca`) while batch 1 already settled on **José Raúl
Capablanca** in `js/quotes-data.js` — restored, so the two files now agree.
`loading`, `comment_hint` and `explore_searching` used the typographic `…`;
STYLE-EN §3 requires three ASCII dots. `explore_need_base` read "You need to
upload a database first to explore", where "first to explore" parses two ways —
now "before you can explore".

**The `Analysis` naming carry-over from batch 2 is settled.** The whole Analysis
block was read: it contains **no self-referential name at all**. Nothing in it
says "board", "study board" or "analysis board" — the screen's only name
anywhere in the app is the tab label `Analysis` (`tab_analysis`). So there is no
house phrase to invent: STYLE-EN §4 already has the answer, and the three tour
lines (`tour_board_b`, `tour_base_games_b`, `tour_play_ana_b`) should simply say
**Analysis**. *Conflict to resolve first:* batch 2 is closed and the batch-2 note
tells batch 9 to **skip every `tour_*` key**, so as the plan stands nobody owns
this edit. It needs either a batch-9 exception for these three keys or a small
follow-up commit.

Answered by Adrian on 2026-08-08 and applied in a follow-up commit — **these
are settled, do not reopen them in batch 6:**

- **The opponent is the engine, never the computer.** `play_from_here` was
  "Play the computer from here"; it is now **"Play against the engine from
  here"**, matching `engine_on`, `engine_timeout` and `history_event`. Adrian
  asked for the more professional register explicitly. Written into STYLE-EN §6
  as a rule, so **batch 6 applies it to the Play block without asking again** —
  every "computer"/"machine"/"bot" in running text becomes "engine".
  (`history_bot_name` "{lvl} bot" is frozen by §10 and is the one exception.)
- **`exit_base` / `exit_game` keep "Exit".** Adrian chose to leave both. STYLE-EN
  §6 now carries the distinction that was missing: **Close** shuts something
  sitting on top of the screen (dialog, sheet, panel); **Exit** leaves a *mode*
  the whole screen was in. They are not synonyms and both stay.
- **`delete_move`** is now **"Delete move (and everything after)"**, replacing
  "(and what follows)".

Closed without a decision needed:

- **`no_bases_yet` is a dead string.** "No databases yet. One called \"My
  games\" will be created." is defined in `js/i18n.js` and referenced **nowhere
  else in the repo** — grepped across `js/`, `index.html` and the manifest.
  `chooseBase()` (`js/app.js:230`) silently creates a database named
  `t('my_games')` and goes straight to the picker, so the sentence never
  reaches a screen. Its passive voice therefore costs nothing. Left in place
  rather than deleted: removing a key is a code change, not a copy edit, and
  it is a plausible thing to want later. Flagged here so nobody spends time
  polishing invisible copy.

Not touched, deliberately:

- **The seven tab labels.** All already match STYLE-EN §4 and all are inside the
  10-character budget: `Analysis` 8, `Learn` 5, `Databases` 9, `Openings` 8,
  `Puzzles` 7, `Play` 4, `Profile` 7. Measured at 375px in light and dark, in
  both languages: nothing clipped, no horizontal scroll, and the bar is exactly
  full at 375px — see the batch-5 note above. **Treat every tab label as frozen.**
- **`start_position` "Start position"** — chess English normally says
  **starting position** (FIDE, Lichess). Measured instead of guessed: it is a
  half-width `.btn util` in the two-up `.setup-tools` grid, 173.5px wide, and
  "Starting position" wraps to a second line (button height 43px → 60px), which
  breaks the equal-height tiers the comment in `index.html` is explicit about.
  STYLE-EN §9 says keep the shorter wording and report it. Reported.
- **`ok: 'OK'`** — §2 wants sentence case on buttons, but OK is an initialism.
- **`endings_quote`** — a Capablanca quotation, not app copy. "before everything
  else" is the standard English rendering; left verbatim.
- **`event`, `date`, `result`** — these label PGN header fields, so the wording
  tracks the PGN spec rather than house style.
- **`invalid_position: 'Invalid position: '`** — the trailing space is
  structural; the error text is appended to it.

**Spanish (reported, never fixed):** see item 9 in the repair list below.

### From batch 6 (i18n.js 92–161 — Databases, Play, Game History)

Fixed (8 plain fixes):

- **The engine sweep, per STYLE-EN §6** — three strings said "the computer":
  `play_title` 'Play the computer' → **'Play against the engine'**,
  `you_resigned` → **'You resigned. The engine wins.'**, `checkmate_loss` →
  **'Checkmate. The engine wins.'** No "machine", "bot" or "AI" remained in the
  range. `history_you`, `history_bot_name` and `history_event` were left
  untouched (STYLE-EN §10) — so a saved PGN still says `{lvl} bot` in its Black
  header while the live screens say engine. That is deliberate.
- `search` 'Search…' and `thinking` 'Thinking…' used the typographic `…`;
  STYLE-EN §3 requires three ASCII dots. Same fix batch 5 made to `loading`.
- `checkmate_win` was **'Checkmate! You win! 🎉'** — two exclamation marks, and
  STYLE-EN §3 allows one per string. Now **'Checkmate — you win! 🎉'** with the
  spaced em dash §3 asks for.
- `hist_color` was **'Colour'** — the only British spelling left in the range.
  Now **'Color'**, per STYLE-EN §1. (The Spanish value is already `Color`.)
- `database_limit_toast` was **'{n}-database limit reached.'** The hyphenated
  compound reads like a compiler message; now **'Limit of {n} databases
  reached.'** The `{n}` token is unchanged.

Measured at 375px in light and dark, with eight seeded history games covering
every `history_end_*` reason: `document.scrollWidth` is exactly 375 on every
screen, nothing is clipped, and there were zero console errors.
`Play against the engine` fits on one line (355px box, 27px tall). The three
result strings each fit the status bar on one 42px line. The level cards are
173.5px wide and every name renders on one 16px line.

Answered by Adrian on 2026-08-08 and applied in a follow-up commit — **all
three are settled, written into STYLE-EN, and must not be reopened:**

- **`export_base` keeps "Share database (PGN)".** It calls the same
  `sharePgnText()` as `📤 Export PGN`, but on a phone it really does open the
  system share sheet, so Share is the honest word. Export stays the house word
  for writing a file. STYLE-EN §6.
- **`start_game` keeps "Start game".** STYLE-EN §6 otherwise forbids it in
  favour of **New game**, but `new_game` is already a different button on the
  Databases screen that creates an empty game record, and one label for two
  unrelated actions is worse than the exception. Written into §6 as a named
  exception, so batch 7 does not have to re-decide it when it reaches the
  Openings copy of the same button.
- **The end-reason labels now name the outcome.** Adrian's point: "some of them
  didn't mean that the game has been lost — threefold, fifty move, insufficient
  material are all draw games, need to be clear about it." So the four drawing
  endings lead with the word:
  `history_end_repetition` → **'Draw by threefold repetition'**,
  `history_end_fiftyMove` → **'Draw by the fifty-move rule'**,
  `history_end_insufficient` → **'Draw by insufficient material'**,
  `history_end_stalemate` → **'Draw by stalemate'**.
  Stalemate was not in Adrian's list but is a draw and gets the same treatment —
  flagged to him as the one label added beyond what he named.
  `history_end_resign` also became the noun **'Resignation'**, matching its
  siblings and the Spanish `Abandono`. Endings that were already unambiguous
  stay bare: `Checkmate`, `Time forfeit`, `Unfinished`, `Draw`. The rule is now
  STYLE-EN §5. **The Spanish needs the same treatment** — see item 10 in the
  repair list.

Not touched, deliberately:

- **`history_you`, `history_bot_name`, `history_event`** — frozen by STYLE-EN
  §10; they are written into saved PGN headers.
- **`level_names`** — all eight are correct English and correctly sentence-cased
  per §2 (`Strong club`, not `Strong Club`).
- **Singular/plural is broken in two strings, and copy cannot fix it.**
  `games` renders as `${count} games` (`js/app.js:254`) and `imported` as
  `${n} games imported ✓` (`js/app.js:2298`), so a database with one game reads
  **"My games (1 games)"** and importing one game says **"1 games imported"**.
  The same applies to `history_moves` — a 1-move game would say "1 moves",
  though in practice `HISTORY_MIN_PLIES` makes that unreachable. Fixing this
  needs a plural helper in code, not a new string, so it is out of a copy
  batch's scope.
- **`undo_move` is '↩ Undo' and is used as an `aria-label`** on the Play toolbar
  (`index.html:283`), so a screen reader announces the arrow character before
  the word. It is a visible button label on the Endgame screen, where the arrow
  is right. Splitting it into two keys is a code change, and the Endgame screen
  belongs to a later batch.
- **`cbh_note`** — passive ("cannot be read directly"), but it is a statement
  about a file format, not about the user, and the active rewrite is longer for
  no gain.
- **`resign` 'Resign'** — locked by STYLE-EN §5.
- **`trainer_explain` says "The computer plays moves from that base"** — the
  same §6 violation as `play_title`, but it is `js/i18n.js:164`, inside the
  Openings block, which is **batch 7**. Left so each batch stays one commit.
  **Batch 7 must sweep it.**

**Spanish (reported, never fixed):** see item 9 in the repair list below — this
batch added three more `máquina` hits to it.

### From batch 7 (i18n.js 162–275 — Openings, Puzzles, themes, mating patterns)

Fixed (7 plain fixes):

- **The engine sweep, per STYLE-EN §6 — the carry-over from batch 6 is done.**
  `trainer_explain` said "The computer plays moves from that base"; it is now
  **"The engine plays the moves it finds there"**. That also removes the last
  "base" used to mean a database in this range (STYLE-EN §4 — the feature is
  **Databases**), without repeating the word twice in one sentence. The whole
  range was then grepped for "computer", "machine", "bot" and "AI": **no other
  hit**.
- `adv_either` was **'Ignore colours'** — the British spelling batch 2 spotted
  and left. Now **'Ignore colors'** per STYLE-EN §1. Measured in the advanced
  search sheet: a 343px `.theme-pick-row`, text 92.9px, one line, both themes.
- `correct` was **'Correct! Keep going…'** — typographic ellipsis, and STYLE-EN
  §3 allows `...` only for a genuinely unfinished action. Now **'Correct! Keep
  going.'**
- `no_book_hint` was **'No book move for this position anymore.'** — "anymore"
  tacked onto a verbless line reads like a fragment. Now **'This position is no
  longer in the book.'**, which also reuses the vocabulary of `in_book` /
  `out_of_book` right above it.
- `not_an_opening_msg` capitalized **"your Opening profile"**. There is no
  feature by that name in STYLE-EN §4, so §2 puts it in sentence case: **"your
  opening profile"**.
- `auto_next_hint` opened **"On solving, the next puzzle loads by itself."** —
  a dangling gerund and not the second person STYLE-EN §7 asks for. Now **"When
  you solve a puzzle, the next one loads by itself."**
- `theme_capturingDefender` was **'Defense destruction'** — a calque of the
  Spanish *Destrucción de la defensa*, and not a phrase English chess writing
  uses. STYLE-EN §5 says chess English wins. Now **'Removing the defender'**.
  The **id is untouched**, so no puzzle filter and no earned badge changes.

Measured at 375px in light and dark, with zero new console errors (the only one
is the known App Check `403`): `document.scrollWidth` is exactly 375 on the
Openings setup screen, the Puzzles tab, the Puzzle Rush and Blindfold strips,
the puzzle options modal, the 47-row theme picker and the advanced search sheet.
`trainer_explain` still occupies three lines (56.5px) in its 355px hint box.

Answered by Adrian on 2026-08-08 and applied in a follow-up commit — **all three
are settled, written into STYLE-EN, and must not be reopened:**

- **`mode_rush` is now '⚡ Puzzle Rush'.** STYLE-EN §4 forbids the bare "Rush"
  (batch 4 fixed exactly this in the badge names), but §9 caps a `.seg` option at
  12 characters and this is 13. Adrian chose the feature name. **Measured on all
  three screens that carry the strip** (Puzzles, Puzzle Rush, Blindfold), light
  and dark: the three buttons plus the 6px gaps come to **349–350.5px of the
  355px container**, `scrollWidth === clientWidth`, so nothing scrolls and
  `document.scrollWidth` stays 375. **That leaves under 5px of slack — all three
  mode labels are now frozen**, and §9 gained the rule that a measurement beats
  the character proxy. The Spanish `mode_rush` needs the same change — item 11 in
  the repair list is now live rather than conditional.
- **The difficulty ladder is now relative.** `Easiest / Easy / Normal / Hard /
  Harder` sounded absolute, but the steps are offsets from the player's own ELO
  (−500, −250, 0, +250, +500) and "Easiest"/"Harder" were not even a matching
  pair. Now **Much easier / Easier / Normal / Harder / Much harder**, which also
  matches the Spanish (*Muy fácil … Muy difícil*) that was already right.
  `diff_normal` is unchanged. That seg is `.seg scroll` and **already scrolled
  before this change** (343px visible, 362px of content); it now holds 450px and
  still scrolls cleanly, with the page itself at 375. The rule is STYLE-EN §6.
- **`puzzle_options` is now 'Puzzle settings'.** STYLE-EN §6 lists "Options"
  under **Settings**. The key is both the gear button's `aria-label`
  (`index.html:393`) and the sheet's own `<h3>`, so a screen reader used to
  announce a bare "Options" with no context; both now say Puzzle settings, on one
  25px line. §6 was extended to say the Settings rule covers per-feature sheets,
  not just the app-wide Settings screen. The Spanish `Opciones` needs the same
  treatment — item 13 in the repair list.

Not touched, deliberately:

- **`puzzle_elo` ('Puzzle ELO'), `js/i18n.js:275`** — the last line of this
  range, but the plan gives the four ELO domain labels to **batch 8**, and batch
  2 deferred a "puzzle rating vs Puzzle ELO" wording question there too. Read
  and left so the wording gets decided once, in batch 8.
- **`start_game` ('Start game')** — the Openings setup screen uses the same key
  as the Play tab (`index.html:341`). Settled by Adrian and written into
  STYLE-EN §6 as a named exception.
- **`level_names` on the Openings setup screen** — the keys belong to batch 6,
  which cleared them. Measured here anyway because Openings passes `rich=false`
  to `buildLevelSeg()` and gets the compact `1·Beginner` strip instead of the
  Play tab's robot cards: the strip is `.seg wrap`, the widest option
  (`5·Strong club`) is 111.3px, and it wraps to three tidy rows with **zero**
  horizontal overflow. The 12-character §9 budget does not bite because the
  container wraps rather than scrolls.
- **`theme_intermezzo` ('In-between move')** — Lichess calls this theme
  *Intermezzo* and *Zwischenzug* is the other standard name, but "In-between
  move" is correct English, is the plainest of the three for a beginner, and
  fits. A naming preference, not an error.
- **`adv_event` ('Tournament')** — the underlying PGN header is `Event`, which
  batch 5 left alone for that reason. Here it labels a search box, where
  "Tournament" is what the user is actually typing. Left as the friendlier word;
  flagged only so nobody "fixes" it into `Event` later.
- **`in_book` / `out_of_book` ('📖 In book' / '🧠 Out of book (engine)')** —
  "in book" and "out of book" are the standard chess phrasing and the emoji plus
  spacing are frozen by §8.
- **`adv_matches` ('{n} games found')** — the same singular/plural bug batch 6
  logged for `games` and `imported`: one hit reads "1 games found". Fixing it
  needs a plural helper in code, not a new string.
- **The 47 theme display names other than `capturingDefender`** — all read as
  correct chess English and all match the Lichess motif they come from. Every
  **id** is untouched, per STYLE-EN §8.

**Spanish (reported, never fixed):** item 9 in the repair list already covers
`trainer_explain`'s *máquina*; its English half is now done. Two new items —
**11** and **12** — added below.

### From batch 8 (i18n.js 276–435 — Endgame ELO, Profile, profile privacy)

**The three items earlier batches deferred here are resolved:**

- **The house term is `Puzzle ELO`, and the four domain labels are final.**
  `puzzle_elo` (`js/i18n.js:275`, batch 7's last line, edited here by explicit
  exception) was read and **left as `Puzzle ELO`** — it already matched
  STYLE-EN §4 and its three siblings, and it is the string the user actually
  sees under the puzzle board (`Puzzle ELO: 1200`, 134.6px on one 27px line)
  and on the Profile card. So the answer to **batch 2's "puzzle rating vs
  Puzzle ELO"** question is: the app says **Puzzle ELO**, and `tour_puz_more_b`
  ("Your puzzle rating sits up top") is the string that is wrong, not the
  label. **Not edited — `tour_*` is frozen** (batch 2 closed it; batch 9 is
  told to skip it). It joins the three "study board" lines batch 5 logged in
  the same orphaned state: **nobody currently owns `tour_board_b`,
  `tour_base_games_b`, `tour_play_ana_b` or `tour_puz_more_b`.** They need one
  small follow-up commit after batch 10, or a named batch-9 exception.
- **`trophy_case` ('Achievements') and `badge_earned` ('Achievement
  unlocked!') are confirmed, unchanged.** Batch 4 was right: both read
  correctly, `Achievements` is the standard word for a trophy case and is
  sentence case per §2, and `badge_earned` earns its one exclamation mark under
  §3 as a celebration string. `badge_earned` is prefixed with `🏆 ` in code
  (`js/badges.js:116`), which §8 leaves alone.

Fixed (16 plain fixes):

- **The engine sweep, per STYLE-EN §6.** `mission_play` was **'Play a game
  against the computer'** → **'Play a game against the engine'**. The whole
  range was then grepped for "computer", "machine", "bot" and "AI": **no other
  hit**. (`practice_start` already said "🎯 Practice vs the engine".)
- **Six typographic ellipses → three ASCII dots** (STYLE-EN §3, the same fix
  batches 5–7 made): `practice_opponent_first`, `checking_move`, `importing`,
  `search_player`, `puzzles_loading`, `blind_watch_now`. All six are genuinely
  unfinished actions or search placeholders, so `...` is the right form rather
  than deletion.
- `privacy_hint` had **two punctuation errors in one sentence**: a missing
  comma after the fronted clause and a missing Oxford comma (§3). Now "When
  private, they only see your avatar, your name, and your ELO ratings."
- `delete_account_done` said **"Thanks for using the App!"** — "App" is
  capitalized mid-sentence and is not a feature name in §4. Now **"the app"**.
  (The brand name was not substituted in: it would be a longer string in a
  toast, and §2 does not require it.)
- `delete_account_confirm` said the account data "will be permanently
  **erased**". §6 puts **Delete** in the vocabulary and **Erase** out of it, and
  the button right above says `Delete account`. Now "permanently **deleted**".
- `delete_account_failed` was **'Could not delete the account.'** — the only
  uncontracted failure message in the file; its neighbours are "Couldn't load
  puzzles." and "Couldn't download the chess engine". Now **"Couldn't delete
  your account. Please try again."**, which also stops calling the user's own
  account "the account".
- `card_blind_title` was **'Blindfold Puzzle solved!'** — a share-card sentence,
  not a heading, so §2 sentence case applies to the common noun. Now
  **'Blindfold puzzle solved!'**
- **The bare "Rush" sweep, per STYLE-EN §4** — five strings, the same rule
  batch 4 applied to the badge names and batch 7 to `mode_rush`:
  `rush_3min` **'Rush 3′'** → **'Puzzle Rush 3 min'**, `rush_5min` likewise;
  `rush_result_title` **'Rush Result'** → **'Puzzle Rush result'** (also §2 —
  it is a heading, not a feature name); `rush_open` **'⚡ Rush'** →
  **'⚡ Puzzle Rush'**; and `rush_strikes_out` / `rush_wrong_end` ended with the
  garden-path fragment **"Run over."**, now **"Your run is over."**
  The `′` prime in `rush_3min` / `rush_5min` went with it: the Puzzle Rush
  duration control on the same feature already says a plain **`3 min` / `5 min`**
  (hardcoded in `index.html:430–431`, not an i18n key), so the leaderboard now
  matches the app's own vocabulary. `rush_title` was already **'Puzzle Rush'**
  and `rush_explain` already avoided the bare word — neither was touched.

Measured at 375px in light and dark, zero console errors, and the language
toggled both ways with every Spanish value unchanged. `document.scrollWidth` is
exactly 375 on the Profile tab, the Puzzles tab, the Puzzle Rush setup screen,
the Blindfold screen and the Learn → Endings category list.

- **The leaderboard mode strip got *better*, not worse.** It is a wrapping
  `.seg`, not a scrolling one, so the longer labels cost nothing:
  `Puzzle ELO` 104.2px, `Puzzle Rush 3 min` and `Puzzle Rush 5 min` 144.7px
  each, `Blindfold ELO` 113.6px, `scrollWidth === clientWidth === 355`. Before
  the change it wrapped 3 + 1 (`Blindfold ELO` alone on row two); it now wraps
  **2 + 2**, which is tidier. **This is not the frozen strip** — the frozen
  one from batch 7 §9 is the three-option `mode_*` strip on Puzzles / Puzzle
  Rush / Blindfold, which this batch did not touch.
- **The endgame radar is fine.** Its six axis labels are the `cat_*` values on a
  327px canvas; all six, `Minor pieces` included, render complete and unclipped.
- `👁 Hint (2)` is 100.3px on one 40px line in the three-button Blindfold
  action row.

Answered by Adrian on 2026-08-08 and applied in a follow-up commit — **both are
settled, written into STYLE-EN §6, and must not be reopened:**

- **`blind_no_peeks_toast` no longer advertises a tier that does not exist.** It
  read "You've used your **free** peeks. Become a **Member** for unlimited
  peeks!" — but there is no membership tier. `Blind.peek()` (`js/app.js:4132`)
  stops at a flat 2, `peeksUsed` is reset in `nextPuzzle()` (`js/app.js:4071`)
  so the limit is **per puzzle, not per session**, and `js/app.js:25` records
  that the gating will need to exist "again". This was the **only** string in
  either language that mentioned a Member. It now states the real rule:
  **"That's both peeks for this puzzle — solve it from memory."** STYLE-EN §6
  gained the rule that UI copy never implies a tier the app cannot sell.
- **`blind_peek_btn` is `Peek`, not `Hint`.** It was `'Hint (peek)'` and code
  wraps it as `` `👁 ${t(...)} (${left})` `` (`js/app.js:4124`), so the button
  rendered **`👁 Hint (peek) (2)`** — two bracketed asides in a row, the second
  of which is the count. Batch 8 dropped the parenthetical; Adrian then chose
  the honest word over the house word. §6 makes **Hint** the term for a puzzle
  nudge, but this control does not nudge — it reveals the hidden pieces, and the
  code and the toast both call it a peek. Now **`👁 Peek (2)`**. §6 carries it as
  a **named exception**: Hint still governs every actual nudge.

Confirmed by Adrian on 2026-08-08 — applied in batch 8 itself, no follow-up
edit needed:

- **`rush_strike_left` / `rush_strike_last` no longer say "Wrong!"** They were
  `'Wrong! {n} left'` and `'Wrong! Last chance'`; STYLE-EN §7 says never blame
  the user and gives "That wasn't it — try again" as the model, so they are now
  **"That wasn't it — {n} left"** and **"That wasn't it — last chance"**. Flagged
  rather than filed as a plain fix because Puzzle Rush is a timed mode where a
  three-word toast may genuinely beat a five-word one. **Adrian confirmed the
  longer, non-blaming version on 2026-08-08. Settled.**
- **`cat_minor` ('Minor pieces') stays plural — confirmed by Adrian
  2026-08-08.** It is the only plural among the six endgame
  categories** — its siblings are `Pawn`, `Rook`, `Queen`, `Bishop`, `Knight`.
  Singular is the right attributive form ("rook endgames"), and the badge
  built from these reads **"Converted: Minor pieces"** next to "Converted:
  Pawn". `Minor piece` would make the set consistent. Left alone: "minor
  pieces" is the standard chess phrase for the bishop-and-knight pair, nothing
  overflows either way (62.4px vs 57.8px on the radar, no truncation in the
  trophy cell), and changing it splits the two languages, since the Spanish
  `cat_*` are all plural (*Peones*, *Torres*) — it is the **English** set that
  is internally inconsistent, and the Spanish set is not.

Not touched, deliberately:

- **The four ELO domain labels and their storage keys.** See above. `puzzleElo`,
  `openingElo`, `endgameElo`, `blindfoldElo` and `'endgame'` are untouched.
- **`rush_open` and `rush_result_title` are dead strings, and `rush_wrong_end`
  with them.** Grepped across `js/` and `index.html`: no `t()` call and no
  `data-i18n` attribute for any of the three. The Puzzle Rush entry point is
  `mode_rush` (batch 7) and `#rush-duration` is hardcoded markup. They were
  swept anyway — a §4 violation sitting in the file is free to fix and there is
  no layout risk in a string nothing renders — but nobody should spend time
  polishing them further. Same treatment batch 5 gave `no_bases_yet`, except
  that one was left verbatim because it had no rule violation in it.
- **`blind_title` ('Blindfold Puzzles').** Title Case on a screen heading, which
  §2 would normally lowercase — but **Blindfold** and **Puzzles** are both §4
  feature names, and the sibling screen's heading is `rush_title` ('Puzzle
  Rush'). Internally consistent; re-casing it is a naming call, not a typo.
- **`choose_avatar` / `edit_avatar` say "icon", `privacy_hint` says "avatar".**
  The keys, the code (`AVATAR_OPTIONS`, `avatarHtml()`) and the privacy text all
  say avatar; the two buttons the user actually presses say **icon**. The two
  buttons agree with each other, so nothing looks broken on screen, but the app
  has two words for one thing. Picking one is a naming decision.
- **`practice_start` ('🎯 Practice vs the engine')** — 26 characters in a `.row`
  where §9 budgets 16. It is the existing shipped wording, it is correct under
  §6, and the row is `flex` with two 44px tool buttons beside it, so the button
  simply takes what is left. Not shortened.
- **`radar_axis_endgame` ('Endgame') and `radar_endgame` ('Endgame by
  material').** §4 restricts capitalized `Endgame` to `Endgame ELO`, but both of
  these are label-initial, where the capital is positional, and their siblings
  are the feature names `Openings` and `Puzzles`. Neither claims an Endgame tab.
- **`lb_all_time` ('All time')** — "all-time" is the adjectival form, but this is
  a standalone filter option, and Chess.com and Lichess both write it open.
- **`passwords_dont_match` ('Passwords do not match.')** — §7 prefers
  contractions "only where they read naturally"; both forms do here, and this
  one is a validation message where the fuller form is fine.
- **`event`-style and PGN-adjacent strings** — none in this range.
- **The singular/plural bug batches 6 and 7 logged is here too**, in
  `import_count` ('{n} imported · {s} skipped') and `games_shown`
  ('Showing {n} of {total}'). Both survive `n = 1` because neither inflects a
  noun — flagged only to record that the range was checked.

**Two layout findings that are NOT this batch's copy and were not fixed:**

- **The puzzle radar clips its longest theme labels.** On the 327px
  `#chart-puzzle` canvas, `Master:`-free axis text is drawn outside the plot
  area and runs off both edges: **"Removing the defender"** loses its leading
  R, **"Discovered attack"** renders as "Discovered atta", **"Double check"** as
  "Double chec". These are batch 7's `theme_*` names, and two of the three are
  names batch 7 never changed, so this is **pre-existing and not caused by any
  copy edit** — batch 7 measured the 47-row theme *picker*, where they fit, but
  not the radar. It is a chart-layout bug (Chart.js label padding), not a
  wording bug: shortening the names would only move the cliff. Worth a small
  CSS/Chart.js fix later. The **endgame** radar is unaffected.
- **The Leaderboard screen reports `document.scrollWidth` 405, not 375.** The
  overflow is `IMG.watermark`, the decorative logo, whose right edge lands at
  405px; no text is involved and no interactive element is off-screen. Present
  in both languages and both themes, and unrelated to this batch.

**Spanish (reported, never fixed):** items 9, 11 and 12 below all grew; two new
items, **14** and **15**, added.

### From batch 9 (i18n.js 436–570 — Kael onboarding, Settings, Game Review)

**The five items earlier batches deferred here are all resolved.**

- **There is no Endgame tab, and `kael_reco_middle` no longer claims one** —
  batch 1's finding, assigned here. It read "I'd focus on the Openings, Puzzles,
  and Endgame tabs"; per STYLE-EN §4 the endgame material is the **Endings**
  section inside **Learn**. Now **"I'd focus on the Openings and Puzzles tabs,
  plus Endings in the Learn tab"**. This is the string both the *intermediate*
  and the *expert* tiers see (`kaelRecoText()`, `js/app.js:443`), so it is the
  most-read of the three recommendations.
- **The four released `tour_*` keys are done.** `tour_board_b`,
  `tour_base_games_b` and `tour_play_ana_b` all called the Analysis screen "the
  study board", a name the UI never repeats; batch 5 established that the
  screen's only name anywhere in the app is **Analysis**. They now say
  **Analysis** — bare, because §4's *Never write* column forbids "Analysis
  Board", so "your Analysis board" was not available as a house phrase.
  `tour_puz_more_b` now says **Puzzle ELO**, the label the screen actually shows,
  settled by batch 8.
- **`tour_engine_b` — reported for the second time in batch 9, then ANSWERED by
  Adrian on 2026-08-08 and fixed in the batch-9 follow-up.** It promised "the
  best move**s** and who stands better", but `MAX_ENGINE_LINES` is **2** and the
  stored default `engineLines` is 2, so the panel shows two lines at most;
  `js/app.js:28-32` explains why it cannot be 3 (the bundled single-threaded
  Stockfish "lite" WASM build takes a fatal `unreachable` trap at MultiPV 3 — a
  binary limitation, not a bug in this repo), and the constant is at
  `js/app.js:33`. Verified in the Settings sheet: the **Engine lines** segmented
  control offers exactly **1** and **2**. The plural was defensible at 2 lines
  and simply wrong at 1, which is a setting the user can choose. Now **"the best
  move"**. This was a product-truth call, not grammar, which is why batch 2
  raised it, batch 9 re-raised it, and neither touched it without Adrian's yes.
  **The Spanish needed nothing** — it already read *"cuál es la mejor jugada"*,
  singular, so the English was the only wrong half and no repair-list item was
  opened. Verified at 375px in light and dark, both languages: the tour card is
  355px, the body 325px on two 42px lines, `document.scrollWidth` 375, nothing
  clipped, zero console errors. `sw.js` v44 → **v45**.

Fixed (5 plain fixes):

- `game_review_analyzing` was **'Analyzing the game…'** — the typographic
  ellipsis, the same STYLE-EN §3 fix batches 5–8 made. Now
  **'Analyzing the game...'**. It is a genuinely unfinished action (one engine
  evaluation per position), so `...` is right rather than deletion. **This was
  the only `…` in the whole range** — the range was grepped for the character.
- `kael_reco_beginner` had its adverbial stranded: "I recommend the Learn tab — I
  explain the rules of chess step by step **there**". Now **"— that's where I
  explain the rules step by step, from the board to basic checkmates."** ("of
  chess" also went: the sentence is already about chess.)
- `level_beginner_desc` was **"I'm new to chess or just know the basic rules."** —
  two clauses with different verbs sharing one subject. Now **"I'm new to chess,
  or I just know the basic rules."**
- `level_expert_desc` was **'I have good understanding and mid-high level
  skills.'** — a missing article and "mid-high level skills", which is not
  English. Now **'I have a good understanding of the game and fairly advanced
  skills.'**
- `tour_base_games_b`'s second sentence had an ambiguous pronoun in English, the
  same fault item 3 of the repair list logs against the Spanish: "Any game you
  tap opens… **It's** empty right now" reads as if the *game* is empty, when the
  empty thing is the database. Now **"Your database is empty right now"**.

Judgement calls applied, flagged for Adrian — **all five confirmed by Adrian on
2026-08-08. Settled, no follow-up edit needed, do not reopen them in batch 10:**

- **`kael_welcome_body` lost its corporate register.** It was "**To tailor your
  experience**, I'd like to understand your level **a bit**" — STYLE-EN §7 bans
  corporate register in Kael's voice, and "understand your level a bit" is hedged
  twice. Now **"First, let me get a sense of how strong you are so I can point
  you in the right direction."** This is the first sentence a new user ever reads,
  so it is worth a look rather than a silent edit.
- **`kael_reco_master` no longer says "full access".** It read "You have **full
  access to everything** here", which is access-tier vocabulary in an app that
  has no tiers — the same rule Adrian settled in batch 8 (STYLE-EN §6, never
  advertise a tier that does not exist). Nothing is gated, so nothing needs the
  word "access". Now **"Everything here is open to you — enjoy it however you
  like."**
- **`kael_reco_middle`'s opener was a calque.** "**Good level!**" is a literal
  rendering of the Spanish *Buen nivel!* and is not something an English speaker
  says. Now **"That's a good place to be!"** Same job, one exclamation mark (§3).
- **`tour_puz_more_b` also lost the word "options"**, which is out of the
  vocabulary per STYLE-EN §6 and which batch 7 already removed from the gear this
  sentence points at (`puzzle_options` is now **Puzzle settings**). The line now
  says "hint, solution, and **settings** are right here". Same string, same
  sweep, so it went in with the Puzzle ELO fix rather than being left to
  contradict the button beside it.
- **`game_review_title` stays Title Case as 'Game Review', and §4 gained a row
  for it.** §2 puts headings in sentence case and batch 8 lowercased
  `rush_result_title` to "Puzzle Rush result" on exactly that basis — but that
  string was *feature name + common noun*, whereas "Game Review" **is** the
  feature name, with its own module object (`GameReview`) and its own screen,
  exactly like `Game History`. STYLE-EN invites a session to decide what the file
  does not cover, so §4 now lists **Game Review** with `Review` / `Game review`
  in the *Never write* column.

Measured at 375px in light and dark, in a fresh profile with the onboarding
modal restored, and with the language toggled both ways (every Spanish value
unchanged — the Spanish Settings sheet was read back in full):
`document.scrollWidth` is exactly **375** on all three screens, **nothing is
clipped anywhere** (every descendant checked for `scrollWidth > clientWidth`),
and there were **zero console errors, zero unhandled rejections, and zero
`console.error` calls** across a full boot → onboarding → level pick → Settings
run. The known App Check `403` did not even appear, because this profile never
reached Firebase.

- **The Settings sheet is the roomiest screen in the review.** The sheet is 375px
  wide with a 343px content column. All **nine** `.fld-label` rows render on one
  17px line, and **all seven `.seg` strips have zero overflow**
  (`scrollWidth === clientWidth`) in both themes — including the three-option
  Appearance strip (`☀️ Light` 81.5px and siblings). No Settings string needed a
  single character changed, so none of this was at risk; measured anyway because
  a long sheet of label + control rows is where §9 usually bites.
- **The Game Review table is not tight.** `.gr-table` is 343px: the label column
  is **216.5px** and the two count columns **63.2px** each. Every one of the five
  rows renders on **one** line (31.5–32px), longest label `💎 Brilliant`. The
  `.gr-cpl` line ("Centipawn loss: 312") is one 17px line, and the two
  `.gr-actions` buttons are 167.5px each. Nothing in this range comes close to
  the column. Measured on the real markup in the real `modal()` with the real
  `t()` values, since `GameReview` is not exported and reaching it for real needs
  a full game against the engine.
- **The one string that changed a layout is `level_beginner_desc`, and it
  changed it for the better.** In the 267px `.kael-level-desc` box (13px/17.55px
  system-ui) the old text was **17.5px** — one line — and the comma version is
  **35.1px**, two lines, so the Beginner card grows about 17.6px. That is not an
  overflow: the cells are auto-height, nothing truncates, and **Expert and Master
  already wrapped to two lines** (35.1px, unchanged before and after the much
  longer new Expert text). The grid ends up *more* uniform than it was, with only
  `Intermediate` on one line. The modal already scrolls at 375×812 regardless.

Not touched, deliberately:

- **The entire Settings block (`js/i18n.js:541–558`) is correct as it stands** —
  18 keys, zero edits. `settings` is already **'Settings'**, not "Options", so
  STYLE-EN §6's app-wide-Settings rule was already satisfied and the batch-7
  per-feature rule had nothing to sweep here. `board_theme` is already the US
  **'Board color'** (§1), `mode_light` / `mode_dark` / `mode_system` keep their
  emoji and single space (§8), `sound_on` / `sound_off` ('On' / 'Off') are the
  right register, and `about` ("Chess Training Center — your analysis and
  training app.") has the spaced em dash §3 asks for and the brand name §11
  freezes. `piece_alt` ('Alternative') vs `piece_classic` ('Classic') is a
  naming preference, not an error.
- **`game_review_move` ('Move') and `game_review_accuracy` ('Accuracy') are dead
  strings.** Grepped across `js/` and `index.html` for `t('…')`, `data-i18n`,
  `data-i18n-ph`, `data-i18n-aria` and dynamic `'game_review_' +` construction:
  **no call site for either**. The Game Review markup labels its accuracy column
  with the player's name and its table rows with `cat_*`, so neither key ever
  reaches a screen. Both happen to be correct English, so unlike batch 8's
  `rush_open` there was nothing to sweep. Same treatment batch 5 gave
  `no_bases_yet`: flagged so nobody polishes invisible copy.
- **`game_review_cpl` ('Centipawn loss') is right, and deliberately not
  "Average centipawn loss".** Checked the code: `cplW` / `cplB` accumulate the
  **total** centipawn loss and are printed with `Math.round()`
  (`js/app.js:2686`) — the average is used only to compute the accuracy figure
  above it. Chess.com and Lichess show *average* CPL and label it ACPL, so the
  temptation is to add "Average"; that would make the label a lie. Left exact.
- **The five `cat_*` move-quality names.** `Brilliant`, `Best`, `Good`,
  `Mistake`, `Blunder` are the standard set and §5 locks *blunder* and *mistake*.
  Worth recording that the **bands** are `grClassify()`'s, not the industry's:
  ≤10cp best, ≤50 good, ≤200 **mistake**, >200 blunder. Lichess calls 50–100cp
  an **inaccuracy**, which STYLE-EN §5 also locks, so this app files every
  inaccuracy under "Mistake" and has no sixth category. That is a **threshold**
  question in `js/app.js`, not a copy question — renaming the label would not fix
  it and adding a category is a code change. Flagged, not touched.
- **`kael_welcome_title` ('Welcome!'), `kael_continue` ('Continue'),
  `kael_level_question`, `kael_start_btn` ("Let's start!"),
  `level_*_name` (Beginner / Intermediate / Expert / Master) and
  `level_intermediate_desc` / `level_master_desc`** — all correct.
  The four tier names double as the `<b>` on the level card and as the heading of
  the recommendation step, and all four render on one 20px line in a 267px box.
- **The `ELO 1901-2300` ranges on the level cards are not i18n strings** — they
  are built in `js/app.js:499` from `LEVEL_TIERS`, so they were out of scope for
  a copy batch. Note that HANDOVER's open item 5 (**`userLevel` is a dead
  write**) is still true: this whole onboarding flow saves the answer and nothing
  reads it. Batch 9 changed only the wording, so a strong new player still starts
  at `puzzleElo` 1200.
- **The other 61 `tour_*` keys**, per the amended batch-2 note.

**Loose ends after the English review — the honest list, kept in one place.**
Written at the end of batch 9 (the last `js/i18n.js` batch) and **extended by
batch 10, the last batch of all**, rather than restarted. Everything here needs
its own follow-up; none of it is part of the ten batches:

1. ~~**`tour_engine_b`**~~ — **CLOSED.** It was the only unresolved item on
   `js/i18n.js`; Adrian answered it on 2026-08-08 and the batch-9 follow-up fixed
   it (see the batch-9 section above). **Nothing in `js/i18n.js` is now waiting
   on a decision.** Everything below is recorded, not pending.
2. **Dead strings, deliberately left in place:** `no_bases_yet` (batch 5),
   `rush_open`, `rush_result_title`, `rush_wrong_end` (batch 8),
   `game_review_move`, `game_review_accuracy` (this batch). Removing a key is a
   code change, not a copy edit.
3. **The singular/plural bug** in `games`, `imported`, `history_moves`,
   `adv_matches`, `import_count` — needs a plural helper in code (batches 6–8).
4. **Layout bugs that no copy edit can fix.** Batch 8: the puzzle radar clipping
   its longest `theme_*` labels, and the Leaderboard's decorative `IMG.watermark`
   pushing `document.scrollWidth` to 405. **Batch 10 adds the biggest one:** the
   endgame detail header `#endgame-pos-title .ttl` is an `h2.ellipsis` with about
   **206px** of room and **173 of the 265 endgame names overflow it**, the widest
   needing 700px. Batch 3 logged the same fault on one lesson title. No wording
   fits 206px, so this is a CSS job (let the `h2` wrap, or drop the name to a
   second line under the back-button row) — not copy.
5. **Naming questions still open** from earlier batches: the `Opening Explorer`
   badge name (batch 4), `Daily Mission` vs `Daily Missions` (batch 4),
   `STREAK_TIERS` counting in months to 240 (batch 4), and "icon" vs "avatar" in
   `choose_avatar` / `edit_avatar` (batch 8). **The casing strand that ran
   through batches 3, 4 and 10 is CLOSED** — Adrian chose Title Case for content
   titles on 2026-08-08, batch 10 converted the 113 endgame names that did not
   comply, the lesson titles and badge names already did, and STYLE-EN §2 now
   carries the rule. All 230 agree. **Batch 10's one remaining non-copy
   leftover:** the four Cochrane entries are stored out of sequence (Parts 1, 2,
   4, 3), which is array order, not copy.
6. **The whole Spanish repair list below** — now **20** items, untouched by
   design, plus the note that the endgame attribution strings are deliberately
   identical in both languages.

**Spanish (reported, never fixed):** item 13 answered — the Spanish Settings
screen calls itself **"Ajustes"**. Items 9 and 13 grew; one new item, **17**,
added.

### From batch 10 (js/endgames-data.js — the 265 endgame studies)

**The last batch. 607 English values: 265 names, 77 subtitles, 265 comments.**
Screens: Learn → Endings → a category → the position list → one position's
detail screen. Nothing was read whole; a scratchpad script extracted every
`en:` value with its line number, that file was reviewed, and the edits were
applied as counted sweeps.

**Chess claims fixed — each one verified against that entry's own `fen` and
`moves` before touching it. These are the important lines in this report:**

- **`p6` said two pawns "defend each other", which they cannot.** The comment
  read "Two pawns separated by one file **defend each other** without help from
  the king." The fen is `8/8/8/5k2/5P1P/8/8/K7` — pawns on **f4 and h4**. A pawn
  on f4 covers e5 and g5; a pawn on h4 covers g5. Neither defends the other, and
  the rest of the comment describes the real idea ("covering one lets the other
  run"). Now **"defend themselves"**, which is the standard statement of this
  ending. **The Spanish says the same wrong thing** — repair-list item 18.
- **`r10`, `r11` and `r12` were named "Rook versus pawn" and all three have
  two pawns on the board.** The fens are `8/8/P7/1P5k/8/8/7K/5r2` (a6 + b5),
  `r3k3/8/3PP3/3K4/8/8/8/8` (d6 + e6) and `8/8/5KP1/5P2/8/2k4r/8/8` (f5 + g6),
  and every one of the three comments is explicitly about **two connected
  pawns** ("Two connected pawns on the sixth rank are stronger than a rook").
  The singular is a slip, not a genre label — `r1` really is one pawn. Now
  **"Rook versus two pawns — kings distant / — both kings active / — defending
  king only"**. The three Spanish names have the identical error
  (*Torre contra peón*) — repair-list item 19.

Fixed (plain typo / grammar / house-style, **82 occurrences in 8 named sweeps**):

- **US spelling, STYLE-EN §1 — 51 occurrences.** `defence`/`Defence` 26 →
  defense, `manoeuvre(s)` 11 → maneuver(s), `colour`/`coloured` 8 → color/colored,
  `organise`/`reorganises` 3 → organize/reorganizes, `centre` 1 → center,
  `neutralise` 1 → neutralize, `favour` 1 → favor. **The brief's count of 45 was
  three words short** — it had spotted defence/manoeuvre/colour/centre but not
  the `-ise` family or `favour`. Plus the file's own header comment ("verified …
  as optimal play for both sides, so replaying it is graded against perfect
  **defence**") → defense. The app already said "maneuver" in `tour_learn_demo_b`,
  so the two files agreed on nothing before this and agree on everything now.
- **Curly apostrophes → straight ASCII, §3 — 3 of the 5.** "Réti’s Idea" (twice)
  and "King’s Activity" are English possessives and were fixed. **`L’vov` and
  `Al’Adli` were deliberately left**: both are transliterated proper nouns, both
  are byte-identical in the Spanish value, and the curly character is part of the
  transliteration, not punctuation.
- **Two names carried a terminal period, §3** (headings take none):
  `r22` "…Grigoriev's combined method**.**" and `b15` "…the promotion square of
  the knight's pawn**.**" They were the only two of the 265.
- **One prose dash, §3.** `r34` "Knight's pawns **-** punishing careless play" was
  the only name using a bare hyphen where the file's other 11 prose dashes use the
  spaced em dash (`Rook versus bishop — wrong corner`). Now ` — `.
- **"Double jump" → "two-square advance", §5.** `p1` explained the rule of the
  square with "The **double jump** a2-a4 counts as a single step". *Double jump*
  is draughts vocabulary; no chess source uses it for the two-square first move.
  The claim itself is right and was not changed.
- **Eight strings called White "he", §7.** All eight are in the `pawn` block —
  `p4`, `p9`, `p14`, `p28`, `p35`, `p37`, `p45`, `p50` — and the other **257**
  entries use "White"/"Black"/"the king" with no pronoun at all. So this is one
  early block drifting from the house voice, not a style the file holds. Rewritten
  without the pronoun ("White does not chase the pawn **but locks** the black king
  into the corner"; "the tempo count still comes out in **White's** favor").
- **Attribution formatting — 16 occurrences, and this is the one sweep that
  touches the Spanish half.** These strings are player and composer credits that
  are byte-identical in `es` and `en`, so they are not translatable copy and a fix
  cannot be applied to one language only. Two problems, both minority-vs-majority:
  - **Initials.** 24 occurrences write `M.Dvoretsky` with no space, 7 write
    `M. Dvoretsky` with one. The majority is also the chess-database convention
    (ChessBase, Dvoretsky's own *Endgame Manual*), so the **7** were closed up:
    `M. Dvoretsky 2000` ×3, `D. Ponziani 1782`, `Suetin – F. Portisch`,
    `G. Barbier, F. Saavedra 1895`. `Kir. Georgiev` was left — a three-letter
    abbreviation of a full first name is a different case.
  - **Game dashes.** 43 attributions use the ` – ` en dash (`Nunn – Friedlander`,
    `Szabó – Keres`); **two did not** — `Akopian **-** Kir. Georgiev` (hyphen) and
    `Marshall**-**Capablanca, New York (m/9) 1909` (hyphen, unspaced). Both now
    match the other 43. **The 44 en dashes themselves were NOT swept** — see
    below.
- **The subtitle template, 7 of the 77 rows.** Decided once and applied: every
  subtitle is now **`Example N — <Side> to move, <outcome>`**, where the outcome
  is the entry's own `result` field (`win` / `draw` / `loss`).
  - Five rows read "Example N — Black to move, **the side to move is lost**",
    which restates the clause before it and is the only place in 77 rows that
    does not use a one-word outcome. All five have `result: 'loss'`. Now
    **"Black to move, loss"**.
  - Two rows (`p15`, `p19`) gave the pawn squares but **no outcome at all** —
    "Example 1 — pawns on g2 and h2, Black to move". Both are `result: 'loss'`,
    and their sibling `p48` states it. Now "…, Black to move, **loss**".

**ANSWERED by Adrian on 2026-08-08 and applied in the batch-10 follow-up —
settled, written into STYLE-EN §2, do not reopen:**

- **Content titles are Title Case.** Adrian chose Title Case, "like the others
  are" — the 18 lesson titles and the 23 badge names were already Title Case, so
  the endgame names were the odd set out and the fix was to raise the 113, not
  lower the 76. **95 of the 189 translated names were rewritten** (94 already
  complied). STYLE-EN §2 now carries the rule, the Chicago word list, and the two
  chess carve-outs it needs: **board squares stay lowercase** (`Knight's Pawn —
  The g7 Defense`) and **file-pawn compounds stay lowercase** (`The g- and
  h-pawns vs. the h-pawn`) — capitalizing those would have been the obvious way
  to get this wrong. **All 230 content titles across the app now agree.**
- **The two consistency sweeps that rode on it were applied at the same time**,
  as flagged when the question was put:
  - **`versus` → `vs.`** — the names were split `vs.` 27 / `versus` 18 / bare
    `vs` 2. Majority form, and the one chess literature uses in titles.
  - **Digit ranks and counts → words** — `The 6th-rank rook's pawn` → **`The
    Sixth-Rank Rook's Pawn`**, `King against 2 passed pawns` → **`King against
    Two Passed Pawns`**. Split 24 / 12 in favor of words, and every name already
    in Title Case spelled them out.
  - The third sub-issue, **piece names capitalized mid-title**, resolved itself:
    under Title Case `A Passed Bishop's Pawn` is simply correct.
- **The trailing `*` is gone from all five names.** Nothing in the app ever
  explained it. Four were attributions that read fine without it —
  `N.Grigoriev 1936`, `Balashov – Dvoretsky, USSR ch tt, Moscow 1967`,
  `E.Lequesne, J.Berger`, `J.Enevoldsen 1949` — and the `*` was dropped in both
  languages, since it is a formatting mark on a string that is identical in both.
  The fifth had no player name at all and Adrian reworded it: `New York 1924*` →
  **`An Example from New York, 1924`**. That one turns an attribution into
  translatable prose, so **only the English was changed** and the Spanish still
  reads `New York 1924*` — repair-list item **20**.

Judgement calls **not applied** — these need Adrian's yes and are recorded in
the batch-10 report:

- ~~**Name casing: 76 Title Case vs 113 sentence case, inside one scrollable
  list.**~~ **ANSWERED — see above.** Kept here for the reasoning: Of the 189 genuinely translated names, `The Floating Square`,
  `Two Pawns to One`, `The Pawn on the Sixth Rank` are Title Case while
  `The rule of the square`, `Key squares`, `Blocked pawns` are sentence case, and
  they sit as adjacent rows in the same category. STYLE-EN §2 puts headings in
  sentence case. This is the same question batch 3 raised about the 18 lesson
  titles and batch 4 about the 23 badge names, and **both left it alone** — but
  in those two the set was internally consistent, and here it is not. Not swept:
  189 strings is a visible change, not a typo fix. **Three smaller inconsistencies
  ride on the same decision and should be settled with it, not separately:**
  ranks written as digits or words (`The pawn is on the 6th rank` vs `The Pawn on
  the Sixth Rank`); **`vs.` 29 times vs `versus` 18 times**; and piece names
  capitalized mid-name (`A passed Bishop's pawn`, `The attacking Bishop`,
  `Knight or Center Pawn`) against §2's lowercase rule.

Not touched, deliberately:

- **The 44 en dashes in `Player – Player` attributions.** Nearly all are the game
  credit convention, they are identical in the Spanish, and §3's spaced-em-dash
  rule governs prose dashes, not name pairings. The 90 em dashes in prose and
  subtitles are already the spaced form §3 asks for. Only the two attributions
  that used a *hyphen* were changed, above.
- **76 of the 265 names are byte-identical in `es` and `en`** — `M.Dvoretsky 2000`,
  `B.Horwitz, J.Kling 1851`, `G.Walker 1841`, `Capablanca – Menchik`. They are
  attributions, not translatable copy, and beyond the formatting sweep above they
  were left exactly as they stand.
- **`id`, `category`, `fen`, `moves`, `result`** — mechanical data. `category`
  values are storage keys (`'endgame'` domain, radar axes, `Converted: …` badges).
- ~~**The trailing `*` on five names.**~~ **Reported, then removed** — Adrian
  answered the same day. See the settled list above.
- **The four Cochrane entries are numbered 1, 2, 4, 3 in file order** (`r43` Part 1,
  `r44` Part 2, `r45` Part **4**, `r46` Part **3**), so the list shows them out of
  sequence. That is the **order of the array**, not a copy problem — fixing it
  means moving data, which a copy batch does not do.
- **`towards` 12 times, `toward` 0.** US usage prefers *toward*, but *towards* is
  standard American English too, it is not in STYLE-EN §1's table, and the file is
  12-for-12 consistent. Consistency beats a preference.
- **`r17`'s `(K&H)` abbreviation** — "Central or bishop pawns. Kling and Horwitz
  (K&H) defensive technique (2)" is the longest name in the file at 72 characters
  and defines an abbreviation it never uses again. Shortening it is a naming call.

**Measured at 375px in light and dark, in both languages, zero console errors
beyond the known App Check `403`:**

- **The position list is safe and nothing is clipped.** `document.scrollWidth` is
  exactly **375** on the sections list, the category list, all six position lists
  and the detail screen, in both themes. Sweeping every descendant of
  `#endgame-pos-list` for `scrollWidth > clientWidth`: **zero hits** in all six
  categories. The row's `<b>` box is **327px**; names longer than that wrap to a
  second line rather than truncating (12 of the 121 rook rows, 5 of 54 pawn, 5 of
  31 bishop, 1 of 20 knight, 0 of 29 queen and 0 of 10 minor).
- **The two subtitles this batch lengthened are the tightest strings in the
  batch, and they fit.** "Example 1 — pawns on g2 and h2, Black to move, **loss**"
  renders at **318px in the 327px box on one 15px line** — 9px of slack. The other
  five changed subtitles got *shorter*. The plain template rows measure 200.1px.
- **The detail header truncates, and it did so long before this batch.**
  `#endgame-pos-title .ttl` is an `h2.ellipsis` with about **206px** of room, and
  **173 of the 265 names already overflow it** — the widest needs 700px. This is
  batch 3's finding (a long lesson title truncating at 375px) in a much larger
  set. **None of it is caused by a batch-10 edit**: the three renamed
  `Rook versus two pawns` titles measure **372px, 412px and 440px**, and the
  rename added four characters, so the singular versions were already several
  times over the 206px box. They were deep inside the overflow group either way.
  STYLE-EN §9 says keep the wording and report the measurement. Reported — this
  is a **layout** item for the follow-up list, not a copy item: no realistic
  wording fits 206px.
- The `#endgame-comment` box is 355px wide; the longest comment in the file (248
  characters, `p27`) renders in **94px, five lines, no overflow**.

**Spanish (reported, never fixed):** two new items, **18** and **19**, added
below — both are the factual class item 1 warns about, found in the comments and
names of this file.

---

## Spanish repair list — do this AFTER the English review

Every Spanish problem found while reviewing English, gathered in one place so
none of them is lost in a per-batch section. **Nothing here has been fixed** —
the English review never edits an `es:` value. Work through this as its own
task once all ten batches are done.

Ordered worst first.

1. **`js/learning-data.js`, `board` lesson — factually wrong.**
   "la casilla h1 ... siempre es **oscura**". h1 is a light square, so it must
   read **"clara"**. Batch 3 fixed the English side, so right now the app
   teaches the opposite fact in each language. *(batch 3)*
2. **`js/i18n.js`, `tour_learn_tab_b` / `tour_learn_sec_t` — inconsistent with
   the tab.** They say **"Jaques mates básicos"**; work order #9 renamed the
   Learn section to **"Jaque mates"**. Both are defensible Spanish, but the tour
   and the tab now disagree on screen. *(batch 2)*
3. **`js/i18n.js`, `tour_base_games_b` — wrong agreement.** "Cualquier partida
   que toques se abre en el tablero de análisis. Ahora está **vacía**" —
   *vacía* agrees with *partida*, but the empty thing is the *base*. Reads as
   if the game is empty. *(batch 2)*
4. **`js/learning-data.js`, `castling_illegal` — verb mood.** "Lo mismo ocurre
   si el rey **tendría** que pasar por una casilla atacada" — conditional after
   *si*; Spanish wants **"tuviera que"**. *(batch 3)*
5. **`js/i18n.js`, `tour_puz_modes_b` — punctuation.** "Táctica normal, a
   ciegas, o Rush contrarreloj" — Spanish does not normally take a comma before
   **o** in a simple list. *(batch 2)*
6. **`js/learning-data.js`, `promotion` — style only, not an error.** "se
   corona: se convierte en dama, torre, alfil o caballo" repeats *corona* and
   *convierte* back to back. *(batch 3)*
7. **`js/badges.js`, `rush_10` / `rush_30` — feature name.** "Rush: 10 en una
   racha" uses the bare **"Rush"**, while `rush_1` right above it says
   **"Primer Puzzle Rush"**. The English side was fixed to "Puzzle Rush: …" in
   batch 4, so the two languages now name the mode differently. *(batch 4)*
8. **`js/badges.js` — mixed voice across the badge names.** Most are noun
   phrases ("Novato de la táctica", "Explorador de aperturas"), but the engine
   badges are past-tense verbs ("**Venció a** Principiante", "Venció a todos los
   niveles del motor") and so is "Convirtió: …". Not an error, but a trophy case
   reads better all in one voice. *(batch 4)*

9. **`js/i18n.js`, `play_from_here` — inconsistent name for the opponent.**
   "Jugar contra **la máquina** desde aquí", but everywhere else the Spanish
   calls it the **motor** (`engine_on` "Encender motor", `engine_timeout` "El
   motor no respondió"). **English is now settled: the opponent is always the
   engine** (STYLE-EN §6), so the Spanish should read "Jugar contra el motor
   desde aquí" and every other "máquina" in the Spanish should be swept to
   "motor" at the same time. *(batch 5)*

   **Batch 6 grepped the whole file and found the other four.** The sweep is now
   a finite, known job rather than an open search:
   - `play_title` — "Jugar contra **la máquina**" → "Jugar contra el motor".
     The English title is now "Play against the engine". *(batch 6)*
   - `you_resigned` — "Abandonaste. **La máquina** gana." → "El motor gana."
     *(batch 6)*
   - `checkmate_loss` — "Jaque mate. **La máquina** gana." → "El motor gana."
     *(batch 6)*
   - `trainer_explain` — "**La máquina** jugará las jugadas de esa base" → "El
     motor jugará…". Its English half is batch 7's to fix. *(batch 6)*

   **Batch 8 found a sixth, and it is a different word.** `mission_play` —
   "Jugar una partida contra **el ordenador**". Not *máquina* this time but
   *ordenador*, which is also Peninsular Spanish where the rest of the app is
   neutral/Latin American. Its English half is now "Play a game against the
   engine", so this should read **"Jugar una partida contra el motor"**. Sweep
   for *ordenador* and *computadora* as well as *máquina* when doing this job.
   *(batch 8)*

   **Do not touch `history_bot_name` ("Bot {lvl}") in this sweep** — it is
   written into saved PGN headers and is frozen by STYLE-EN §10 in both
   languages.

10. **`js/i18n.js`, the four drawing `history_end_*` keys — the two languages
    now disagree about clarity.** Adrian settled on 2026-08-08 that an
    end-reason label must name the outcome, because "Threefold repetition" does
    not tell a beginner whether they won, lost or drew (STYLE-EN §5). The
    English was changed in batch 6; the Spanish still reads bare:
    - `history_end_repetition` — "Triple repetición" → **"Tablas por triple
      repetición"**
    - `history_end_fiftyMove` — "Regla de 50 jugadas" → **"Tablas por la regla
      de 50 jugadas"**
    - `history_end_insufficient` — "Material insuficiente" → **"Tablas por
      material insuficiente"**
    - `history_end_stalemate` — "Ahogado" → **"Tablas por ahogado"**

    Leave `history_end_checkmate`, `history_end_resign` ("Abandono", already the
    noun the English now matches), `history_end_timeout`, `history_end_abandoned`
    and `history_end_draw` alone. Check the width at 375px when applying: these
    render in the `.hist-line2 .ellipsis` slot on the Game History card, which
    measured 319px, and the longest Spanish string here is close to that.
    *(batch 6)*

11. **`js/i18n.js` — Spanish cannot decide what the Puzzles feature is called.**
    `puzzles_title` is **"Táctica"**, but `mode_puzzles` right beside it is
    **"🧩 Puzzles"**, `blind_title` is **"Puzzles a ciegas"** and `puzzle_elo` is
    **"ELO de táctica"**. So the tab heading, the mode strip on that same screen
    and the rating badge use three different names for one feature. English
    settled on **Puzzles** everywhere (STYLE-EN §4); Spanish needs one word
    picked and applied to all four. *(batch 7)*

    Also here: `mode_rush` is **"⚡ Rush"** while `rush_title` is **"Puzzle
    Rush"**. **Adrian approved the English change on 2026-08-08** — the English
    now reads "⚡ Puzzle Rush", so the Spanish should follow to
    **"⚡ Puzzle Rush"** and the two languages stop naming the mode differently.
    Check the width when applying: the strip has under 5px of slack at 375px, and
    Spanish `🧩 Puzzles` / `🙈 A ciegas` are not the same widths as the English
    ones — measure before committing. *(batch 7)*

    **Batch 8 read the rest of the Puzzles/Rush/Blindfold block and the mess is
    bigger than it looked. A fourth Spanish word for "puzzle" is in use, and the
    bare "Rush" is in five more strings.** Whatever word gets picked has to be
    applied to all of these at once:
    - `rush_explain` — "Resuelve tantos **rompecabezas** como puedas". This is a
      *fourth* term, alongside *Táctica*, *Puzzles* and *puzzle*. The English
      says "puzzles" here and everywhere.
    - `rush_3min` / `rush_5min` — **"Rush 3′" / "Rush 5′"**. English is now
      "Puzzle Rush 3 min" / "Puzzle Rush 5 min": the bare word is gone and so is
      the `′` prime, because the duration control on that same screen already
      says a plain `3 min` / `5 min`. These two are the **leaderboard mode
      strip**, which is a *wrapping* `.seg` — it has room, unlike the frozen
      three-option strip. Spanish could take "Puzzle Rush 3 min" as-is.
    - `rush_result_title` — **"Resultado de Rush"** → "Resultado de Puzzle Rush".
    - `rush_open` — **"⚡ Rush"** → "⚡ Puzzle Rush". Dead string in both
      languages (nothing renders it), so this one is cosmetic.
    - `rush_back_puzzles` — **"← Volver a Táctica"**, and `radar_puzzle`
      ("Táctica por tema"), `radar_axis_puzzle` ("Táctica") and `puzzles_title`
      ("Táctica") with it. These are the *Táctica* half of the problem this item
      already describes; listing them so the sweep is a finite job.
    *(batch 8)*

12. **`js/i18n.js`, `log_rating` — the Spanish labels the wrong quantity.**
    English is **"Rating {n}"** and the number is the puzzle's own rating;
    Spanish says **"Dificultad {n}"**. *Dificultad* is already the name of the
    difficulty setting (`difficulty`, "Dificultad") two screens away, so the
    session log looks as though it is reporting the slider rather than the
    puzzle. Should read **"ELO {n}"** or **"Dificultad del puzzle {n}"** — a
    wording choice, but the current word is genuinely ambiguous. *(batch 7)*

13. **`js/i18n.js`, `puzzle_options` — "Opciones" needs to name its feature.**
    Adrian settled on 2026-08-08 that a per-feature settings sheet is called
    `<Feature> settings`, not "Options" (STYLE-EN §6). The English is now
    **"Puzzle settings"**; the Spanish still reads **"Opciones"**. It is both the
    gear button's `aria-label` and the sheet's heading, so a Spanish screen
    reader announces a bare "Opciones" with no context. Should read **"Ajustes
    del puzzle"** (or whatever word the Spanish Settings screen already uses —
    check `settings_title` first and match it). *(batch 7)*

    **Batch 9 answered the open question. There is no `settings_title` key — the
    app-wide Settings screen is `settings`, and its Spanish value is
    "Ajustes".** Read back off the live sheet at 375px, which renders
    `Ajustes / Apariencia / Sonido / Idioma / Líneas del motor / Color del
    tablero / Estilo de piezas / Privacidad`. So **"Ajustes del puzzle" is the
    right wording** and it matches the house word rather than inventing one.
    (`tour_skipped_toast` already points the user at "Ajustes ⚙️" too, so three
    places will agree.) *(batch 9)*

    Also here, found in batch 9: **`tour_puz_more_b` says "pista, solución y
    opciones"** — the same *Opciones* this item is about, in the tour line that
    points at that very gear. The English half now says "settings"; the Spanish
    should use whatever word this item settles on. *(batch 9)*

14. **`js/i18n.js`, `delete_account_done` — "la App" is capitalized for no
    reason.** "Cuenta eliminada. ¡Gracias por usar **la App**!" The English had
    the identical error and batch 8 fixed it to "the app". Spanish should read
    **"¡Gracias por usar la app!"** — or name the product, "¡Gracias por usar
    Chess Training Center!", since the brand name is the same in both languages.
    Cosmetic, but it is the last thing a departing user reads. *(batch 8)*

15. **`js/i18n.js`, `blind_peek_btn` — the Spanish carries an explanation the
    English no longer has, and it is now too long for the button.** Spanish is
    **"Pista (ver piezas)"**; the English was `'Hint (peek)'` and is now
    **`'Peek'`**, because the code renders `` `👁 ${label} (${left})` `` and the
    old value produced "👁 Hint (peek) (2)" — two bracketed asides in a row. The
    Spanish produces the same double-bracket problem, **"👁 Pista (ver piezas)
    (2)"**, and it is much wider: the English button measures 107.9px in a
    three-button row on a 355px screen, and the Spanish is roughly double that.
    Adrian settled on 2026-08-08 that this control is a **peek**, not a hint
    (STYLE-EN §6, named exception), so the Spanish should follow the same logic
    and read **"Vistazo"** — which also matches `blind_no_peeks_toast`'s own
    *vistazos* — rather than "Pista", which is the Spanish word for hint and is
    presumably already used for the real puzzle hint. **Check `hint` first and
    make sure the two do not collide**, and measure the row at 375px when
    applying — the other two buttons are `show_solution` and `next`.
    *(batch 8)*

16. **`js/i18n.js`, `blind_no_peeks_toast` — the Spanish still advertises a
    membership tier that does not exist.** It reads "Ya usaste tus vistazos
    **gratis**. ¡Hazte **Miembro** para vistazos ilimitados!" There is no
    membership tier (`js/app.js:25`), and the peek limit is a flat 2 **per
    puzzle**, not per session. Adrian settled on 2026-08-08 that no string may
    imply a tier the app cannot sell (STYLE-EN §6); the English is now "That's
    both peeks for this puzzle — solve it from memory." The Spanish needs the
    same treatment, e.g. **"Ya usaste tus dos vistazos en este puzzle —
    resuélvelo de memoria."** This was the only string in either language that
    mentioned a Member, so once it is done the word is gone from the app.
    *(batch 8)*

17. **`js/i18n.js`, the Kael onboarding block — three problems, one of them a
    real punctuation error.** All found in batch 9, whose English half is done.
    - **`kael_reco_middle` is missing its opening `¡`.** It reads **"Buen
      nivel!"**; Spanish needs **"¡Buen nivel!"** Every other exclamation in the
      block is correctly paired (`¡Bienvenido!`, `¡Empecemos!`, `¡Genial para
      empezar!`, `¡Felicidades…!`), so this one is simply a slip. Worst of the
      three — it is the first thing an intermediate or expert user reads.
    - **`kael_reco_middle` also claims a tab that does not exist**, exactly like
      the English did: "las pestañas de **Aperturas, Táctica y Finales**".
      *Finales* is a **section inside Aprender**, not a pestaña. The English now
      reads "the Openings and Puzzles tabs, plus Endings in the Learn tab"; the
      Spanish needs the same split. Note this interacts with item 11 — whatever
      Spanish word wins for Puzzles has to be used here too, since this line
      currently says *Táctica*.
    - **`game_review_analyzing` keeps the typographic ellipsis**, "Analizando la
      partida**…**". STYLE-EN §3 only governs English, so this is a consistency
      point rather than an error: the English side is now `...` and the Spanish
      still has the single character. Cosmetic; batches 5–8 left the same
      mismatch in every other `…` string they fixed, so if it is worth doing it
      is worth doing as one sweep of the whole file.
    *(batch 9)*

    Not a Spanish bug, recorded so nobody "fixes" it: **`tour_board_b` says
    "tablero de estudio" while `tour_base_games_b` and `tour_play_ana_b` say
    "tablero de análisis"** — two Spanish names for one screen. The English was
    unified on **Analysis** in batch 9, so the Spanish wants one of the two
    picked. It is listed here rather than as its own numbered item because it is
    the same underlying decision as item 11 (one Spanish name per feature), and
    the Spanish "tablero de análisis" is already the correct one — only
    `tour_board_b` needs changing.

18. **`js/endgames-data.js`, `p6` comment — factually wrong, same class as item
    1.** "Dos peones separados por una columna **se defienden entre sí** sin
    ayuda del rey." They do not defend each other: the fen is
    `8/8/8/5k2/5P1P/8/8/K7`, so the pawns are on **f4 and h4** and neither covers
    the other. The correct statement is that they defend *themselves* — **"se
    defienden solos"**. Batch 10 fixed the English side, so until this is done
    the two languages teach different things about the same diagram. *(batch 10)*
19. **`js/endgames-data.js`, `r10` / `r11` / `r12` names — the title contradicts
    the board.** All three read **"Torre contra peón: …"** (singular) and all
    three positions have **two** connected pawns — a6+b5, d6+e6, f5+g6 — which is
    exactly what all three Spanish comments then describe ("Dos peones ligados en
    la sexta fila son más fuertes que una torre"). Should read **"Torre contra
    dos peones: reyes alejados / : ambos reyes activos / : solo el rey
    defensor"**. The English was fixed in batch 10. Note these three names use a
    colon where the English uses ` — `; keep the Spanish colon, it is consistent
    with its siblings. *(batch 10)*

20. **`js/endgames-data.js`, `p47` — the two languages now name the same study
    differently.** It read `New York 1924*` in both. Adrian removed the
    unexplained `*` from all five names that carried one on 2026-08-08, and this
    was the only one with no player name in it, so its English was reworded to
    **`An Example from New York, 1924`**. That turns an attribution into
    translatable prose, which the English review does not write in Spanish — so
    the Spanish still reads **`New York 1924*`**, asterisk and all. It needs the
    same treatment, e.g. **"Un ejemplo de Nueva York, 1924"**. The other four
    asterisks were dropped in both languages, correctly: those strings are
    attributions, and the `*` was a formatting mark, not copy. *(batch 10)*

    Not a Spanish bug, recorded so nobody "fixes" it: the **attribution strings
    are identical in both languages by design** (`M.Dvoretsky 2000`,
    `Capablanca – Menchik`). Batch 10's initials-and-dashes sweep therefore
    changed 16 occurrences across both halves — that was deliberate and is the
    only place in the whole English review where an `es:` value was touched.

Later batches must keep appending here.
