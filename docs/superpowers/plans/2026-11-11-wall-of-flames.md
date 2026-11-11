# Wall of Flames (Muro de Fuego) + streak-unlocked icons — approved 2026-11-11

Adrian approved the look in `docs/wall-of-flames/wall-of-flames-es.png` and
`-en.png` (375px; light then dark; button, then the screen). The mockup's CSS and
markup are in `docs/wall-of-flames/mockup-body.mjs` (a throwaway CDP script that
injected them into the real app) — reuse the CSS (`.wall-btn`, `.podium`, `.pod*`,
`.wall-me*`, `.wall-val`), do not copy the script into the app.

## Decisions (Adrian's, final)
- Name: **Muro de Fuego / Wall of Flames**. Design A: podium + list.
- Two tabs: **🔥 Ahora / Now** (current streak) and **🏆 Récord / Record** (best ever).
- **Hide broken streaks** on Now: a streak counts only if its last day is today or
  yesterday.
- Streak-unlocked icons — ONLY these five of the twelve "coming soon" ones,
  unlocked by **bestStreak** (a lost streak never takes an icon back):
  | days | icon id |
  |---|---|
  | 7 | `fire` |
  | 30 | `ice` |
  | 90 | `storm` |
  | 180 | `crystal` |
  | 360 (1 year) | `shadow` |
  The other seven (`dragon`, `phoenix`, `griffin`, `kraken`, `hydra`, `galaxy`,
  `void`) stay `locked: true` "coming soon".

## The button
In the "Streak progress" card on Profile (`index.html`, the card holding
`#profile-streak-ladder`), placed after the ladder and before
`#profile-remind-row`. Icon = the player's CURRENT streak tier art
(`streaks/<icon>.png` from `STREAK_TIERS` in `js/app.js`); gold title; subtitle
"Estás en el puesto N de M" / "You are Nth of M" (or a plain "Mira las rachas más
largas" line when signed out / not ranked); gold ›.

## The screen (a new `#screen-wall`, a near-copy of `#screen-leaderboard`)
Back + h2 with `streaks/flame1.png`; one muted line ("Las rachas más largas de
ahora mismo" / for Record "Las rachas más largas de siempre"); the seg switch;
podium (2-1-3, 1st bigger with 👑 and glow, a small tier icon on each avatar,
"N días" in gold, gold steps 1/2/3); "TU PUESTO / YOUR PLACE" label + my row
outlined (`lb-me`-style ring) — under the podium, NOT fixed to the bottom (the Kael
corner button covered it); then rank 4+ as `.lb-row` with `rankTier()` bands and a
tier icon + day count on the right. Rows open `PublicProfile.open(e)` like the
leaderboard. Signed out: the wall still shows, "your place" row is replaced by a
sign-in hint.

## Data
- `/leaderboard/{uid}` already carries `streakCount`, BUT it is in
  `PUBLIC_DETAIL_KEYS` (js/firebase.js) — deleted from the public doc when a
  profile is private. Recommendation: keep it that way; private players are simply
  not on the wall (say so in the "how it works" line if one is added).
- Add to the public doc: `streakLastDate` (string 'YYYY-MM-DD', with
  `streakCount`, same privacy list) and `bestStreak` (number; same privacy list).
- `firestore.rules` `/leaderboard/{uid}` write: add both to the `hasOnly` list
  and validate them (`num(bestStreak, 0, 30000)`; `streakLastDate` a string of
  size 10). Add emulator tests in the existing rules test file.
  → **rules change: commit, then STOP and ask Adrian to run
  `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy` before pushing.**
- Now: `fetchLeaderboard(500, 'streakCount')`, then keep rows whose
  `streakLastDate` is today or yesterday (local date, same helper the streak uses)
  — same over-fetch-then-filter pattern as the Rush "this month" board in
  `js/leaderboard.js`. Record: `fetchLeaderboard(200, 'bestStreak')`. Single-field
  orderBy → no composite index.
- My place: from the fetched list; if I am not in it, show my own number with
  "+500" style rank or no rank — decide in session, keep it honest.
- Old docs without `streakLastDate` are hidden from Now until that player opens
  the app again (their next publish adds it).

## Icons
`js/avatars.js` `AVATAR_OPTIONS`: give the five a `streakDays: n` instead of
`locked: true`; unlocked when `bestStreak >= n` (kv `bestStreak`, already synced).
Locked ones show "🔒 7 días" / "🔒 7 days" under them in the picker. Mirror how
`kael_baby`/`isTester` is gated in `renderGridInto`, and the same guard wherever an
avatar choice is saved. A toast when one unlocks is optional — ask Adrian.
