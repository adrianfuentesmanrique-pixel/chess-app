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
   recipe (`~/.claude/launch.json`, add a NEW port — last used **9160**).
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
- [ ] **2 — `js/tour.js`** — Kael's guided tour, 31 `en:` strings. Screens: the
      whole tour overlay, every tab.
- [ ] **3 — `js/learning-data.js`** — Learn lessons, 59 `en:` strings. Screens:
      Learn → Rules, Basic Checkmates.
- [ ] **4 — `js/app.js` badges + `js/badges.js`** — 72 `en:` + the three
      `label: lang =>` functions. Screens: Profile → trophies, badge toasts.
      `js/app.js` is 235 KB — grep for the symbol, then read with offset/limit.
      Never read it whole.
- [ ] **5 — `js/i18n.js` lines 3–91** — Tabs, Generic, Analysis. Highest-risk
      batch for the 375px rule: this is where the bottom tab bar lives.
- [ ] **6 — `js/i18n.js` lines 92–161** — Databases, Play, Game History.
      Do **not** change `history_you`, `history_bot_name`, `history_event`
      (baked into saved PGNs — see STYLE-EN §10).
- [ ] **7 — `js/i18n.js` lines 162–275** — Openings, Puzzles, puzzle theme
      display names, named mating patterns. Theme **ids** must never change.
- [ ] **8 — `js/i18n.js` lines 276–435** — Endgame ELO, Profile, profile
      privacy. Watch the four ELO domain keys.
- [ ] **9 — `js/i18n.js` lines 436–585** — Kael onboarding, guided tour
      strings, Settings, Game Review. Cross-check against batch 2 so tour text
      in both files agrees.
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
