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
   recipe (`~/.claude/launch.json`, add a NEW port — last used **9164**).
   Two gotchas: `websocket-client` must be created with `suppress_origin=True`
   or Chrome answers the CDP handshake with 403, and the app boots in Spanish,
   so set `localStorage.lang = 'en'` and reload before reading any copy.
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
- [ ] **5 — `js/i18n.js` lines 3–91** — Tabs, Generic, Analysis. Highest-risk
      batch for the 375px rule: this is where the bottom tab bar lives.
- [ ] **6 — `js/i18n.js` lines 92–161** — Databases, Play, Game History.
      Do **not** change `history_you`, `history_bot_name`, `history_event`
      (baked into saved PGNs — see STYLE-EN §10).
- [ ] **7 — `js/i18n.js` lines 162–275** — Openings, Puzzles, puzzle theme
      display names, named mating patterns. Theme **ids** must never change.
- [ ] **8 — `js/i18n.js` lines 276–435** — Endgame ELO, Profile, profile
      privacy. Watch the four ELO domain keys.
- [ ] **9 — `js/i18n.js` lines 436–585** — Kael onboarding, Settings, Game
      Review. **Skip every `tour_*` key — batch 2 already did them.**
- [ ] **10 — `js/endgames-data.js`** — 872 `en:` entries, 212 KB, **on its own**.
      Never read the file whole. Procedure:
      1. Throwaway script in the scratchpad extracts every `en:` value with its
         line number into a plain review file.
      2. Review that file.
      3. Apply with targeted edits; verify a sample in the app.

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

Later batches must keep appending here.
