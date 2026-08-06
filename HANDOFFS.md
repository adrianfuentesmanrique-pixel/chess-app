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

These two MUST ship together. The tab list has no Endgame tab because #8 moves
Endgame into Learn. Reordering alone would orphan 265 endgames.

```
In C:\Users\Adrian\chess-app, restructure the Learn tab into three sections:
Rules, Basic Checkmates, Endings. Move the entire Endgame tab (screen-endgame,
the Endgame object in js/app.js, all 265 positions from js/endgames-data.js, its
ELO tracking and badges) under Learn → Endings, preserving every behaviour
including practice mode and per-category ELO. Below "Minor Piece Endgames" add
the Capablanca quote in elegant typography matching the app: "In order to
improve your game, you must study the endgame before everything else." — José
Raúl Capablanca (bilingual ES/EN). Then reorder the tab bar to exactly:
Analysis, Learn, Bases, Openings, Puzzles, Play, Profile — Endgame is removed as
a tab since it now lives in Learn. Keep icons, active-tab state, routing and
transitions working. Verify in the browser pane at 375px, then commit and push.
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
