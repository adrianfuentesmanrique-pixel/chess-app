# Blindfold: theme and settings buttons — design

Date: 2026-10-10. Status: **built and shipped in v180.**

## Adrian's answers (2026-10-10) — these override the recommendations below

- **a. Everything separate.** Blindfold has its own theme, its own difficulty
  (kv `blindfoldDifficulty`) and its own auto-next (kv `blindfoldAutoNext`).
  Both start fresh at Normal / off. Not synced, like the Puzzles pair.
- **b. The row goes under the rating, above See position | List** — "you can
  change the theme and then select which function you will use." Start panel
  only; the in-game button is relabelled "⚙ Cambiar ajustes".
- **c. Same sheet** as the normal puzzles, showing Blindfold's own values.
- **d, e. Agreed as recommended.**

Found while building: with the widening to 600 points, no real theme is ever
empty at any rating, so the "no puzzles of this theme" message in (d) is a
safety net only. The sections below are the proposal as it was put to Adrian.

## What Adrian asked for

"Add in the blindfold the buttons of selecting the theme, and the settings for
the difficulty selection. Same idea as the normal puzzles, but being only 2
buttons, do the best design according to the space available."

## What exists today (checked against the code at e45dca2, v179)

- Normal puzzles: `#puzzle-theme-btn` opens `Puzzles.openThemePicker()`,
  `#puzzle-options` (⚙) opens `Puzzles.openOptions()`.
- The settings sheet holds exactly two things: **Difficulty** (five levels,
  kv `puzzleDifficulty`) and **Auto-next** (kv `puzzleAutoNext`).
- Blindfold already obeys both: `Blind.targetRating()` is
  `Blind.elo + Puzzles.difficulty`, and a solved blindfold puzzle auto-advances
  when `Puzzles.autoNext` is on. It simply has no button to change them.
- Blindfold ignores the theme. It picks at random from every loaded puzzle
  within 300 points of the target; if there are none it picks from everything
  loaded.
- `Puzzles.themeFilter` lives in memory only: it goes back to Random when the
  app is reopened.
- During a blindfold puzzle there is already a button "⚙ Change mode or time"
  that brings back the start panel (after the current puzzle is scored).

## Measured: are there enough puzzles per theme?

30,000 puzzles, 45 themes. For every theme and every target rating from 600 to
3000, counted the puzzles of that theme within 300 points, among the three
rating files the app has loaded at that rating.

- **Targets 800 to 2300: every theme has at least 10.** No problem.
- **Mate in 5** has none at 600 and under 10 at 700.
- **From 2400 up**, the rare mating patterns thin out (under 10), and at
  2700–3000 several have none: Boden's, double bishop, smothered, Anastasia,
  balestra, swallow's tail, mate in 1, and at 3000 a few more.

So a short list is rare, but it is real at both ends of the scale.

## Decisions (recommendation first)

### a. Shared or separate
**Recommended: difficulty and auto-next stay shared; the theme is Blindfold's
own.**
- Difficulty and auto-next are shared today. Splitting them would silently
  change what current players get.
- A theme is a training choice for one screen. "Mate in 1" is a natural
  blindfold theme and a poor one for normal puzzles; picking it in Blindfold
  should not change the Puzzles screen behind the player's back.
- Like the normal puzzles, the blindfold theme is not remembered after the app
  is closed.

### b. Where the two buttons go
**Recommended: on the start panel only, in one row under the
See position | List switch.**

```
  ELO a ciegas  1340
 [ 👁 Ver posición ][ 📋 Lista ]
 [ 🎯 Tema: Aleatorio        ][⚙]
  Tiempo para memorizar: 10 s
  ──────●──────────────
  (what it pays)
 [        ▶ Empezar          ]
```

- The theme button is wide and **shows what is chosen**: "🎯 Tema: Aleatorio",
  "🎯 Tema: Horquilla", "🎯 Temas: 3". Long names are cut with "…".
- ⚙ is the same square icon button the normal puzzles use.
- Same classes as the normal puzzles row (`btn ellipsis`, `btn ico`). No new
  style.
- During the game: no new buttons. The row there is already full at 375px
  (Peek, Solution, Share, Next), and changing the theme mid-puzzle has the same
  problem changing the time has. The existing button is relabelled
  "⚙ Cambiar ajustes" / "⚙ Change settings" and keeps doing what it does:
  the start panel opens after the current puzzle.

### c. What ⚙ opens
**Recommended: the same sheet as the normal puzzles.** Both of its settings
are ones Blindfold already uses, so nothing in it would be ignored. One line
must change: "Aiming for puzzles near N" has to show the **blindfold** number
(blindfold rating + difficulty) when it is opened from Blindfold.

### d. Chosen theme has too few puzzles at the player's level
**Recommended: widen quietly, and say so only when the theme cannot be
served at all.**
1. Themed puzzles within 300 points. If there are at least 10, pick from them.
2. Otherwise widen 100 points at a time, up to 600, until there are 10.
3. If there are still fewer than 10 but at least one, play those.
4. If there are none, play a normal puzzle at the player's level and show one
   short message: "No hay puzzles de este tema a tu nivel. Va uno aleatorio."
   The theme stays chosen.

Widening is fair: the pay is always worked out from the real rating of the
puzzle that came up.

### e. Rating and pay with a theme chosen
**Recommended: unchanged.** Same blindfold rating, same pay. The per-theme
ratings of the normal puzzles are not touched by Blindfold.

## Build outline (after the answers)

- `js/blind-pick.js` — new, imports nothing: the rule in (d), as a pure
  function over a list of puzzles. Unit tests beside the other rule tests.
- `js/app.js` — `Blind.themeFilter`; the two buttons; `openThemePicker` and
  `openOptions` take the small differences as arguments (whose theme, what to
  do on Apply, which target number to show) instead of being copied.
- `index.html`, `css/style.css`, `js/i18n.js` — the row and its labels.
- `sw.js` — cache v180, `js/blind-pick.js` in the precache list.
- No change to `firestore.rules` or the indexes; nothing new is synced.

## Verify

`test:tree`, `test:precache`, `test:rules` before and after. Start panel and
game at 375px, light and dark, Spanish and English, See position and List.
A theme chosen in Blindfold changes which puzzles come up; the normal puzzles
screen behaves as before.
