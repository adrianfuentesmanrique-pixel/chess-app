# The four remaining chess tasks — one conversation each

Written by the retired chess session, captured here verbatim so they survive.
Run each in its OWN fresh conversation. Do not run two in one session.

Before starting **A**, answer the two open questions at the bottom of this file.

---

## A — Artwork integration (work order #2)

```
In C:\Users\Adrian\chess-app, integrate the artwork in `avatars/CTC new arts`
(44 badge files, 31 avatars). `tools/build_badges.py` already has the 64-badge →
symbol map and a Pillow compositor; finish it. Key out the magenta backgrounds,
trim, scale, composite symbol onto frame, write 512px PNGs to `icons/badges/`.
Map `theme_discoveredCheck` to the `discovered` symbol — Adrian wants all
discoveries sharing one icon. TIER RULE (confirmed, see the table further down
this file): five families — puzzle, flame, robot, target, lightning — each have
silver/obsidian/gold symbols, and there are FOUR frames: bronze, silver,
obsidian, gold. It is a matrix of 3 symbols x 4 frames = 12 tiers per family.
The frame cycles through all four before the symbol advances: silver+bronze,
silver+silver, silver+obsidian, silver+gold, then obsidian+bronze ... up to
gold+gold as the top tier. All artwork is present — nothing is missing.
Endgame piece badges: render from the app's own
`pieces/*.svg` via the browser pane (no cairo locally). For avatars: the app
circle-crops them in CSS, so strip any baked-in ring; add the missing `queen_b`;
update `AVATAR_OPTIONS` in js/app.js. Verify light AND dark mode, then commit
and push.
```

---

## B — Learn reorganisation + tab reorder (work order #8 and #12)

These two MUST ship together. The final tab list has no Endgame tab, because
Endgame becomes Learn.

**Direction reversed on Adrian's call (2026-08-05).** The original plan moved
265 endgames into Learn. Instead, move Learn's content INTO Endgame and rename
the tab. Verified reasons:
- `endgames-data.js` is **212,037 bytes**; `learning-data.js` is **19,708** —
  the Learn side is **10.8x smaller**, so far less code moves.
- The Endgame screen carries the fragile machinery: lazy loading
  (`Endgame.ensureLoaded()`), engine integration (`Endgame.engineOn`, and
  `engine.stop()` when leaving the screen at js/app.js:1041), ELO tracking
  (`endgameElo`), and a radar-chart domain key. Keeping it as the host means
  none of that has to be re-plumbed.
- **Existing users keep their endgame ELO and progress.** That is the real win.

```
In C:\Users\Adrian\chess-app, merge the Learn tab into the Endgame tab and
rename the result "Learn". Do NOT move the 265 endgame positions anywhere.

DO NOT read js/app.js in full — it is 232 KB. Grep for the symbols below and
read with offset/limit.

DIRECTION
The Endgame screen survives and becomes the host. Move the contents of the
Learning object (js/app.js around line 4307) and LEARNING_CATEGORIES
(js/learning-data.js — categories 'rules' and 'mates') into it. Then retire
screen-learn and the Learning object.

THE THREE SECTIONS, in this order
1. Rules            <- from LEARNING_CATEGORIES 'rules'
2. Basic Checkmates <- from LEARNING_CATEGORIES 'mates'
3. Endings          <- the existing endgame categories, unchanged

HARD RULE — rename only what the user sees
The internal key 'endgame' must NOT be renamed anywhere. It appears in the
SCREENS array (js/app.js:1032), in show/hide logic (lines 1041, 1045, 4826,
5607), in `endgameElo` (lines 4009, 4290, 4293, 5138, 5257, 5263, 5265) and as
a radar-chart domain in drawRadar('endgame', ...) at line 5286. It is one of
four ELO domains (puzzle/opening/endgame/blindfold). Renaming it would wipe
every existing user's endgame rating and break the profile radar chart.
So: screen id stays `screen-endgame`, storage keys stay 'endgame', only the
visible tab label and its i18n strings become "Learn" / "Aprender".

HARD RULE 2 — ONLY "Endings" may touch endgame progress
Rules and Basic Checkmates must have ZERO effect on the endgame ELO, the radar
chart, ELO history, or any badge or feature fed by them. Adrian was explicit
about this.

How the current code makes that easy — do not break it:
- `endgameElo` is a dictionary keyed by ENDGAME_CATEGORIES. The radar chart
  reads exactly `ENDGAME_CATEGORIES.map(c => endgameElo[c] ?? 1200)`
  (js/app.js:5288, and again at :5555 for public profiles). The profile average
  at :5265 and :5534 also filters through ENDGAME_CATEGORIES.
- The only writes are `db.kvSet('endgameElo', this.elo)` at :4290 and
  `recordEloHistory('endgameEloHistory', avg)` at :4293, both inside the
  Endgame object's own completion path.
- The Learning object persists NO progress at all. Its `progressEvals` is
  in-lesson state only, never saved.

THE TRAP: when merging two screens it is tempting to unify the two category
lists into one array. DO NOT. If a Rules or Checkmates category ever lands in
ENDGAME_CATEGORIES, it immediately appears on the radar chart and drags the
endgame ELO average. Keep ENDGAME_CATEGORIES containing ONLY the ending
categories, exactly as it is today, and keep LEARNING_CATEGORIES separate.
Sections 1 and 2 must never reach the `db.kvSet('endgameElo', ...)` /
`recordEloHistory` path.

Keep Learning's behaviour exactly as it is now — no persisted progress. This
task only relocates its UI. If you think Rules/Checkmates should track their own
separate progress, ASK Adrian first; do not add it unprompted.

ALSO
- Below "Minor Piece Endgames" in the Endings section, add this quote in
  elegant typography matching the app's navy-and-gold language:
  "In order to improve your game, you must study the endgame before everything
  else." - Jose Raul Capablanca
  Bilingual ES/EN via the existing data-i18n system.
- Reorder the bottom tab bar to exactly: Analysis, Learn, Bases, Openings,
  Puzzles, Play, Profile. There is no separate Endgame tab afterwards.
- Keep icons, active-tab state, routing and transitions working.
- Check for orphans afterwards: any leftover reference to screen-learn, the
  Learning object, or a 'learn' entry in SCREENS.

VERIFY BEFORE COMMITTING
- All three sections open and render at 375px width, light and dark mode.
- Endgame practice mode still works and still records ELO.
- An existing profile still shows its endgame rating on the radar chart.
- ISOLATION CHECK: note the radar chart's endgame value, then complete a lesson
  in Rules and one in Basic Checkmates. The endgame ELO, the radar chart and
  the ELO history must be completely unchanged. Show me the before and after.
- Confirm ENDGAME_CATEGORIES still contains only ending categories.
Then commit and push.
```

---

## C — Swipe navigation + Opening Explorer variations (work order #10 and #11)

```
In C:\Users\Adrian\chess-app, two navigation features. (1) Opening Explorer: let
the user step back to any earlier move and play a different move from there,
creating a variation, after which the app keeps following the selected opening
database from the new position. Don't break existing database behaviour.
(2) Add swipe navigation: horizontal swipes move between adjacent tabs; an
inward edge swipe goes back to the previously visited tab rather than closing
the app. Treat Analysis as home — maintain a tab history stack so Analysis →
Learn → Openings → back → Learn → back → Analysis works, and only the Android
system back on Analysis exits. Must not interfere with board piece dragging
(`.board` uses touch-action pan-y and pointer capture during drags) or with
horizontally scrolling strips (`.seg.scroll`, `.plog`). Verify in the browser
pane, then commit and push.
```

---

## D — Button work (work order #3, #6, #7)

The old session offered to do these itself, but it has been retired. Run it here.

```
In C:\Users\Adrian\chess-app, three button changes.
(3) Redesign the Edit Board buttons to look cleaner and more modern, consistent
with the app's existing navy-and-gold design language — do not invent a new
style.
(6) In the Play tab, remove the text labels from the action buttons and keep
only their icons. Replace the "New Game" button with a Back button in the
upper-left corner behaving like standard navigation.
(7) Apply the same pattern to the Openings tab: remove "New Game", add a Back
button in the upper-left corner.
Keep every existing behaviour working. Verify in the browser pane at 375px in
both light and dark mode, then commit and push.
```

---

## ANSWERED — the tier rules (Adrian, confirmed 2026-08-05)

Folder verified: **49 PNGs**, all gaps filled. `doublecheck.png` present. All
five tier families have a complete `silver` / `obsidian` / `gold` set. There are
now **four** frames, not three — `frame-obsidian.png` is new.

### It is a MATRIX, not a ladder

**3 symbol styles × 4 frames = 12 tiers per family.** The frame cycles through
all four before the symbol advances.

| Tier | Symbol | Frame |
|---|---|---|
| 1 | silver | bronze |
| 2 | silver | silver |
| 3 | silver | obsidian |
| 4 | silver | gold |
| 5 | obsidian | bronze |
| 6 | obsidian | silver |
| 7 | obsidian | obsidian |
| 8 | obsidian | gold |
| 9 | gold | bronze |
| 10 | gold | silver |
| 11 | gold | obsidian |
| 12 (top) | **gold** | **gold** |

Symbol order is **silver → obsidian → gold**, gold highest. Confirmed directly
by Adrian. Start at tier 1 and use only as many tiers as that family's
achievement count needs.

### The five families, all complete

| Family | Symbol files |
|---|---|
| puzzle | puzzlesilver · puzzleobsidian · puzzlegold |
| flame | flamesilver · flameobsidian · flamegold |
| robot | robotsilver · robotobsidian · robotgold |
| target | targetsilver · targetobsidian · targetgold |
| lightning | lightningsilver · lightningobsidian · lightninggold |

Frames: `frame-bronze.png` · `frame-silver.png` · `frame-obsidian.png` ·
`frame-gold.png`

### Sanity check before you build

5 families × 12 tiers = 60, and there are 64 achievements — so roughly 4 badges
are one-off, non-tiered designs. Read `BADGE_DEFS` in `js/app.js` and confirm
the real counts per family match this shape before compositing anything. If a
family needs fewer than 12, take the tiers from the bottom of the table upward.
Report the actual counts back to Adrian.
