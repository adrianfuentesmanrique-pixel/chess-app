# Learn tab: lichess-style stages — plan

Agreed with Adrian on 2026-10-15, from the mockups in `tools/learn-mockups/`
(not committed: open `/tools/learn-mockups/?f=<frame>` on the dev server).

## What was decided

| | Decision |
|---|---|
| a. Topics | Three new sections, in this order: **Fundamentos** (Jaque, Salir del jaque, Mate en uno, Ahogado, Valor de las piezas, Proteger tus piezas, Tablas), **Táctica básica** (horquilla, clavada, pincho, ataque descubierto), **Principios de apertura** (centro, desarrollo, enroque). Shown between Rules/Basic Checkmates and Endings. Rules, Basic Checkmates, Endings, Coordinates stay exactly as they are. |
| b. Play | A stage = one topic. Kael introduces it in a bottom sheet ("¡Vamos!"), then 4–8 short levels. A goal bar on top: "Nivel n de N", the goal in one line, one box per level (tap to replay). Stars per level: first try ★★★, one mistake ★★, more ★. The "Pista" button draws the answer and the level then gives ★. |
| c. Feedback | Right: green square, `puzzle-correct` sound, the goal bar turns green and its stars fill in one by one, Kael says a short line, the next level starts by itself after ~1.6 s. Wrong: the move is undone, `puzzle-wrong`, red square + board shake, the bar turns red and says WHY ("Eso no es jaque"). Stage finished: sheet with proud Kael, stars total, "Siguiente: …" and "Repetir". Only `transform`/`opacity` animate; with *reduce motion* nothing moves, the text is the same. |
| d. Progress | A list per section: ✓ done / ▶ next (gold outline) / number to come, with the stage's stars. Stored **on this phone only**: `db.kvSet('learnProgress', …)`. NOT in `SYNCED_KEYS`, nothing in Firestore (a later yes from Adrian could add it — one line in `js/firebase.js`). |

## Hard rules (every session)

- Nothing here touches `endgameElo`, the radar, badges, or any rated key. `'endgame'` and `screen-endgame` keep their names.
- Every level position is legal for chess.js and every level has a `solution` that the unit test proves meets its goal.
- Finishing a level counts for the streak (`Streak.recordActivity()`), like lesson practice today.
- Bilingual: every text `{ es, en }`. Our own words, our own positions — nothing copied from lichess.
- New JS files go into `ASSETS` in `sw.js` (`npm.cmd run test:precache` fails otherwise).

## Files

| File | Job |
|---|---|
| `js/stages.js` | Pure logic, no DOM: `levelVerdict(level, move, chessAfter)`, `levelStars(mistakes, hinted)`, progress helpers. Unit-tested. |
| `js/stages-data.js` | `STAGE_SECTIONS`: sections → stages → levels. Data only. |
| `js/stages-ui.js` | `StagesUI`: the stage list, the intro/finish sheets, the level screen. Uses `Board`, `Sound`, `Streak`, `Endgame.showView`, `db`. Like `js/coord-ui.js`. |
| `index.html` | Two views inside `#screen-endgame`: `#stage-list-view`, `#stage-view`. |
| `js/app.js` | `VIEWS` gets the two ids; `Endgame.renderSections()` lists each section after Basic Checkmates; `StagesUI.init()` beside `CoordUI.init()`. |
| `js/i18n.js` | `stage_*` keys. |
| `css/style.css` | `.stage-*` styles, `prefers-reduced-motion` block. |
| `tests/unit/stages.test.js` | Logic + every level of the data. |

### Level shape

```js
{ fen, goal, solution: 'uci', how?, say?: { es, en } }
```

`goal`: `check` (the move gives check) · `mate` (checkmate) · `escape` (the player starts in check; `how` = `king` | `capture` | `block` says which way) — slice 1.
Later slices add: `stalemate`, `best` (take the most valuable piece), `save` (a threatened piece; a wrong move is answered by the scripted `punish` move), `draw`, `line` (several moves with scripted replies — tactics), `choose` (any move from `good: []` — openings).

### Progress shape

`learnProgress = { [stageId]: [stars per level] }` — 0 = not done; the best result is kept.

## Sessions

1. **Slice 1 (2026-10-15):** the engine (`stages.js`, `stages-ui.js`, views, styles, storage) + Fundamentos stages 1–3: Jaque (6 levels), Salir del jaque (6: two each by king, capture, block), Mate en uno (8). The section lists only built stages.
2. **Slice 2:** Fundamentos 4–7: Ahogado (5, goal `stalemate`), Valor de las piezas (6, `best`), Proteger tus piezas (6, `save` + `punish` with a red arrow, as mockup `c-wrong`), Tablas (4, `draw`: insufficient material, stalemate trap). **Done v235.** Adrian chose (2026-10-16): no repetition demo, Kael's intro explains repetition in words.
3. **Slice 3:** Táctica básica — goal `line` (play move, the opponent's reply plays itself, play the follow-up); 6 levels per motif. **Done v238.** Adrian chose (2026-10-16): only the scripted move solves a level; a first move that wins the same with the same tactic (listed in `also`) is told "that wins too, find the other one", never punished.
4. **Slice 4:** Principios de apertura — goal `choose`; ~5 levels per principle; Kael explains why the other moves are worse.  **Done v239.** Adrian chose (2026-10-16): a level may list tempting wrong moves in `bad` with Kael's reason; any other wrong move gets the stage's `wrongText`; red + reset, never punished.

Each slice: verify at 375 px, light and dark, ES and EN; `npm.cmd run test:tree`; `npm.cmd run test:precache`; HANDOVER entry; bump `sw.js`; push.
