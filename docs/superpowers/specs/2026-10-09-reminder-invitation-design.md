# Kael's invitation to the daily reminder — design

Date: 2026-10-09. Status: **approved by Adrian 2026-10-09 ("all yes"), built in v178.** One change to (a) made while building, marked below.
Builds on `2026-10-08-daily-streak-reminder-design.md`; nothing in that spec changes.

## Why
The daily reminder is live for every signed-in user (v175/v176) but it is only a
switch inside Settings. Few people open Settings, so few will turn it on. Kael
asks once, in the app, at a moment when the question makes sense.

## What Adrian asked for
- A user without the reminder is invited to turn it on without finding Settings.
- Not annoying: asked once, maybe once more later, then never.
- The phone's own permission question appears only after a Yes to Kael.

## Facts from the code (checked at caded51)
- `Notifications.state()` in `js/notifications.js` returns one of
  `ios-needs-install`, `unsupported`, `signed-out`, `denied`, `failed`, `on`, `off`.
- `Notifications.enable()` is the only way to turn the reminder on. It asks the
  phone for permission and must run inside a tap. It returns the new state.
- `Streak.recordActivity()` runs when the day is credited. In Play, Openings and
  Analysis that is **on the 10th move, in the middle of a game** — so a dialog
  shown at that instant would cover a live board.
- `users/{uid}` already accepts reminder fields, but a new "asked" field there
  is not needed (see c). No change to `firestore.rules` or the indexes.

## Design

### a. When
`recordActivity()` marks the invitation as *owed* for this app session, only
when the day was newly credited. Then:
- **The day was credited by finishing something** (a puzzle solved, a Rush run,
  a Blindfold puzzle, an endgame, a lesson): Kael asks about two seconds later.
- **The day was credited by a move on a live board** (the 10th move in Play,
  Openings or Analysis): Kael waits for the next screen change (`showScreen`).

Changed while building, after Adrian's "all yes": the first draft waited for a
screen change in every case. A user who only solves puzzles never changes
screen after the day is credited, so that user would never have been asked.

In both cases it also waits while a Rush run, a Pulso match, the streak
celebration, a badge card or another dialog is on screen, and while the device
is offline (offline, `enable()` would fail with a misleading hint).

If the session ends first, nothing is recorded as asked; the next credited day
owes it again. Never on app open.

### b. Wording (Kael's modal, same look as the Blindfold hint warning)
`{h}` is the reminder hour as Settings shows it (default 7:00 PM).

| | Spanish | English |
|---|---|---|
| Text | Hoy ya cumpliste. Si mañana a las {h} aún no has entrenado, ¿te aviso? Un solo aviso al día, para que no pierdas tu racha. | Today is done. If you have not trained by {h} tomorrow, shall I remind you? One reminder a day, so you do not lose your streak. |
| Yes | Sí, avísame | Yes, remind me |
| No | Ahora no | Not now |
| Turned on (toast) | Hecho. Te aviso a las {h}. Puedes cambiar la hora en Ajustes. | Done. I will remind you at {h}. You can change the hour in Settings. |
| Not now (toast, first time only) | Está bien. Lo encuentras en Ajustes cuando quieras. | All right. It is in Settings whenever you want it. |

Tapping outside the dialog counts as "Not now".

### c. How often, and where it is remembered
On this device only (the same local store as `remindOn`): `remindAskCount` and
`remindAskLast` (a timestamp).
- Count 0: ask.
- Count 1 and at least 7 days since the last ask: ask once more.
- Count 2: never again.
- "Yes" sets the count to 2 whatever happens next. Using the Settings switch by
  hand also sets it to 2: that user knows where it is.

Per device is right because the switch itself is per device. A user with a
phone and a tablet is asked once on each.

### d. Who never sees it
Only state `off` is invited. So never: `on`, `denied` (the phone's question is
already blocked), `signed-out`, `unsupported`, `failed`, `ios-needs-install`.
An iPhone user who has not added the app to the Home Screen sees nothing: they
cannot say yes to anything yet. Once they install, their state becomes `off`
and they are invited like anyone else.

### e. Yes, but then it does not turn on
`enable()` reports which case it was:
- `denied` (the phone's question was refused): Kael dialog with one OK button,
  existing text `remind_denied`.
- `failed` (the Brave case): Kael dialog with one OK button, existing text
  `remind_failed`.
- `off` (the phone's question was swiped away, not refused): the "It is in
  Settings whenever you want it" toast.
None of these is asked again; Settings stays the way back in.

### f. Existing users
Yes. Nothing distinguishes new from existing: anyone in state `off` with count 0
is invited the next time a day is credited.

## Files
- New `js/remind-invite.js`: the rule `shouldInvite({...})`, imports nothing.
  Unit tests beside the other tree tests. Added to the precache list in `sw.js`.
- `js/app.js`: mark owed in `recordActivity()`, try to show in `showScreen()`,
  the dialog itself.
- `js/notifications.js`: the Settings switch sets the count to 2.
- `js/i18n.js`: the new `remind_invite_*` strings, Spanish and English.
- `sw.js`: `CACHE` v177 -> v178.

## What tools can prove, and what only a phone can
Tools: the rule (unit tests), the dialog at 375px in both themes and languages,
that it is absent when the reminder is on and absent a third time.
Phone only: that the system permission question appears after "Yes" and not
before, and that the reminder then arrives.
