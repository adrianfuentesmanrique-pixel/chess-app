# Daily streak reminder — design

Written 2026-10-08 at commit `6261ff0` (cache v173). Approved by Adrian the same day.
**Nothing here is built.** The plan that builds it is
`docs/superpowers/plans/2026-10-08-daily-streak-reminder.md`.

This replaces the parked `docs/superpowers/plans/2026-08-17-notifications.md` for the
daily reminder only. That plan's banner says there is no way round Blaze; that is
wrong for this feature. Its Task 2 (Cloud Functions) and Tasks 4 to 7 must not be
followed.

## 1. Goal

A phone notification, at most once a day, at an hour the user picks, sent only when
the user's streak is alive and today is not yet credited.

**Hard rule: it costs nothing and needs no card anywhere.** Firebase stays on Spark.
If any step asks for billing or a card, the session stops and tells Adrian first.

Out of scope: friend-request, Duel and Masterclass notifications, the "2 hours
before" warning, and the daily-mission reminders. They need an instant sender and
come later, if this one works on Adrian's phone.

## 2. Decisions (Adrian, 2026-10-08)

| Question | Decision |
|---|---|
| Sending route | **Standard Web Push** (`PushManager.subscribe` + the `web-push` npm library in the job). Not Firebase Cloud Messaging. |
| Who gets it | **Live streak only**: last credited day is yesterday, today not credited. A dead or zero streak hears nothing. |
| Default | **Off** until the user switches it on. The picker starts at **19:00** local. |
| Placement | The control is in **Settings**, after Privacy. The **Profile** streak card has one row that opens it. |
| Credential | A **service-account key** in a GitHub encrypted secret. Keyless is the documented fallback (section 9) and is used only if the console refuses to create a key. |
| Art | Adrian's finished `Notification/Daily reminder.png`, used as it is, only reduced in size. |

### Why Web Push and not `getToken()`

Read from Firebase's own web page on 2026-10-08: "Access the registration token
(deprecated)" and the method "will be removed in a future release". The replacement
(`register()` / `onRegistered()`) does not exist in the pinned 10.14.1. Web Push is
the browser standard underneath both: no SDK file to vendor, no end date, and the
job's account needs no permission to send anything through Firebase.

The cost is one rules change (a new subcollection), which Adrian deploys.

## 3. What the user sees

### The notification

| | Spanish | English |
|---|---|---|
| Title | Tu racha te espera | Your streak is waiting |
| Body, n = 1 | Mantén viva tu racha de 1 día: entrena hoy. | Keep your 1-day streak alive: train today. |
| Body, n > 1 | Mantén viva tu racha de {n} días: entrena hoy. | Keep your {n}-day streak alive: train today. |

`{n}` is the current streak count. Icon: `icons/notif/daily.png`. Tapping it opens
the app (focuses an open copy if there is one). Language is the app language of the
device at the moment the switch was turned on or last refreshed.

It arrives within about half an hour after the chosen hour: the job runs hourly at
minute 17 and GitHub may start a scheduled run late. Time zones on a half hour
(India, UTC+5:30) get it up to 30 minutes **before** the chosen hour. That is a
known limit, not a bug.

When today is credited (`Streak.recordActivity()`), any reminder still on screen is
closed.

### Settings (`openSettings()` in `js/app.js`), after the Privacy block

- Label "Recordatorio diario" / "Daily reminder".
- An On/Off `.seg` pair, built like every other pair in that sheet.
- An hour picker: a native `<select class="input">` (the class the existing
  `#trainer-base` select in `index.html` uses) with 24 options, `00:00` to `23:00`.
  Enabled only while the switch is On.
- One `.hint` line under it. Its text depends on the state (table below).

**The permission prompt appears only when the user taps On.** Never at start-up,
never on a timer.

### Profile streak card

One full-width row under `#profile-streak-ladder`: "Recordatorio diario: desactivado"
/ "Daily reminder: off", or "Recordatorio diario: 19:00" / "Daily reminder: 19:00".
Tapping it opens Settings scrolled to the reminder block.

### States

| State | Switch | Hint line (EN / ES) |
|---|---|---|
| Signed out | Off, disabled | Sign in to use reminders. / Inicia sesión para usar los recordatorios. |
| Browser cannot do it | Off, disabled | This browser cannot show notifications. / Este navegador no puede mostrar notificaciones. |
| iPhone, not installed | Off, disabled | Add the app to your Home Screen first. / Primero añade la app a tu pantalla de inicio. |
| Permission blocked | Off | Notifications are blocked. Allow them in your phone's settings for this app. / Las notificaciones están bloqueadas. Permítelas en los ajustes del teléfono para esta app. |
| Subscribing failed | Off | Could not turn it on. In Brave: Settings, Privacy, "Use Google services for push messaging". / No se pudo activar. En Brave: Ajustes, Privacidad, "Usar servicios de Google para mensajes push". |
| Off | Off | One reminder a day, only if you have not trained yet. / Un recordatorio al día, solo si aún no has entrenado. |
| On | On | One reminder a day, only if you have not trained yet. / Un recordatorio al día, solo si aún no has entrenado. |

Feature detection only (`'Notification' in window`, `'serviceWorker' in navigator`,
`'PushManager' in window`). "iPhone, not installed" is the one case that needs a
device check: an iOS device where the page is not running standalone.

Whenever turning it on fails, the switch goes back to Off.

### Preview gate

Until Adrian's phone has received a real reminder, the Settings block and the
Profile row are drawn only on a device where the local key `remindPreview` is true.
Opening the app once with `?remind=1` sets it. Session 4 removes the gate. No
visitor sees a switch that does nothing.

## 4. Data

### On `users/{uid}` (all four already allowed by the live rules)

| Field | Type | Meaning |
|---|---|---|
| `remindHourLocal` | int 0–23 | The hour the user picked. |
| `notifyHourUtc` | int 0–23 | The UTC hour that local hour falls in today, worked out on the device. This is what the job queries on. |
| `timeZone` | string ≤ 64 | IANA name from `Intl.DateTimeFormat().resolvedOptions().timeZone`. |
| `notifPrefs.daily` | bool | The switch. |

Written together in one merge write. One hour per account: the last device to
change it wins. `notifyHourUtc` and `timeZone` are recomputed every time the app
opens and written only if they changed, which keeps daylight-saving and travel
drift to one day.

Not used by this feature and left alone: `warnHourUtc`, `notifPrefs.warn / friends /
live`, `lastNudgeDate`, `lastWarnDate`, and the whole `fcmTokens` subcollection and
its rules. They are inert and stay.

### New: `users/{uid}/pushSubs/{subId}` — the rules change

One document per subscribed device.

| Field | Rule |
|---|---|
| `endpoint` | string ≤ 2048, must match the push-service allowlist below |
| `p256dh` | string ≤ 256 |
| `auth` | string ≤ 64 |
| `createdAt` | `== request.time` |
| `platform` | one of `android`, `ios`, `desktop`, `other` |
| `lang` | `es` or `en` |

`subId` is the SHA-256 of the endpoint as 64 lowercase hex characters, computed on
the device; the rule checks the shape (`^[0-9a-f]{64}$`), not the hash. Read, list,
create, update and delete are owner-only. No one else can read a subscription.

**Endpoint allowlist** (in the rules and again in the job, which is the one that
counts):

```
^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/
```

Why: the job sends an HTTP request to whatever address is stored. Without the list,
a user could store any address and make the job call it.

### Dead and extra subscriptions

The job cannot delete anything. The app does the cleaning:

- Every app open with the switch On: re-subscribe (the browser returns the existing
  subscription if it is still good), write the document if its id is new, and delete
  this device's previous document if the endpoint changed.
- Keep the 5 newest documents for the account; delete older ones.
- If the subscription was made with a different signing key than the one in the
  code, unsubscribe and subscribe again.
- Switching Off: unsubscribe in the browser, delete this device's document, and set
  `notifPrefs.daily` to false only if no documents remain.
- Signing out: unsubscribe and delete this device's document **before**
  `signOut(auth)`, so the next account on that phone does not get the last one's
  reminders.
- Deleting the account: delete every `pushSubs` document before `users/{uid}`.

A dead subscription that the app never got to clean costs nothing after one day: a
user who stops opening the app stops being due, and the job reads subscriptions only
for users who are due.

## 5. App side

- New file `js/notifications.js` (the only new module). Everything Firestore goes
  through small helpers added to `js/firebase.js`, as everywhere else in the app.
- `sw.js` gains a hand-written `push` handler and a `notificationclick` handler.
  **No Firebase messaging file is added anywhere.** No `firebase-messaging-sw.js`.
- The signing **public** key is a constant in `js/notifications.js`. It is not a
  secret.
- Payload, encrypted by the push service standard: `{"t":"daily","lang":"es","n":11}`.
  The texts live in `sw.js`, not in the job, so wording changes ship with the app
  and no personal text travels.
- Every path through the `push` handler calls `showNotification()` inside
  `waitUntil()`, including a payload that cannot be parsed. A handler that shows
  nothing makes the browser show its own "site updated in the background" notice.
- Second guard against a repeat: the handler remembers the local date of the last
  `daily` it showed (in a cache named `ctc-notif`, which `activate` must not wipe).
  A second one on the same date is shown with `silent: true` and the same `tag`, so
  it replaces the first and never buzzes.
- Icon `icons/notif/daily.png`: 192×192, the whole artwork fitted inside on a
  transparent ground, under 60 KB. `badge` is `icons/notif/badge.png`: 96×96, white
  on transparent, made from the alpha of `icons/logo-mark.png` (Android draws the
  badge as a silhouette; a colour icon there becomes a white square).

## 6. The hourly job

A scheduled GitHub Actions workflow, `.github/workflows/streak-reminder.yml`, on
`main`. Code in `tools/reminder/` with its own `package.json` and lockfile.

### Who is due

For each hour `H` it handles:

1. Query `users` where `notifyHourUtc == H` and `notifPrefs.daily == true`, selecting
   **only** `streakLastDate`, `streakCount`, `timeZone`, `remindHourLocal`. The
   answer never contains a name, an email or a date of birth.
2. For each user, in that user's `timeZone`: due if `streakCount > 0`, and
   `streakLastDate` is yesterday's local date, and the local hour now is
   `remindHourLocal`, or one or two hours after it. The server works out "alive"
   itself because `streakCount` is only zeroed when the app is opened.
3. For each due user: read the 5 newest `pushSubs`, drop any whose endpoint fails
   the allowlist, send to each with TTL 3 hours.

A missing or invalid `timeZone`, or a missing `streakLastDate`, means not due.

### Never twice

- The job remembers the last UTC hour it handled in a small file kept in the
  GitHub Actions cache (key prefix `reminder-state-`).
- A run handles every hour after that one up to now, at most the last 3 (now and the
  two before). With no remembered hour it handles the current hour only.
- The new hour is **saved before anything is sent**. If the save fails, nothing is
  sent. So a failed run loses reminders; it never repeats them.
- `concurrency` with `cancel-in-progress: false`: two runs never overlap.
- A late run, a repeated run and a manual run all find nothing new to handle.
- The device shows a same-day repeat silently (section 5).

**The job writes nothing to Firestore.** No `lastNudgeDate`. That is enough.

Remaining case, accepted: a user who has already been reminded today and then moves
the hour later gets a second, silent one.

### Reads against the free 50,000 a day

One read per opted-in user per day (at their hour), one read for each empty hourly
query (at most 24), and up to 5 per reminder sent. 500 opted-in users with half of
them due and two devices each is about 1,050 reads: 2%.

No composite index is expected: two equality filters are served by the automatic
single-field indexes. If Firestore answers that an index is required, it goes into
`firestore.indexes.json` and Adrian runs `npm.cmd run indexes:deploy`.

### Manual runs

`workflow_dispatch` has one input, `dry_run`, default `true`. A dry run handles the
current hour, sends nothing, does not move the remembered hour, and prints the
counts.

### What GitHub does

Confirmed from GitHub's documentation: a scheduled run may start late; it runs only
on the default branch; schedules are switched off after 60 days with no commit to
the repository, and GitHub emails the owner first. A workflow run is not a commit.
A failed run emails the owner by default.

## 7. Safety conditions (all four are required)

1. **Its own account, read-only.** `users/{uid}` holds `firstName`, `lastName` and
   `dateOfBirth`. The job uses a service account named `streak-reminder` with exactly
   one role: **Cloud Datastore Viewer** (`roles/datastore.viewer`). It can read
   Firestore. It cannot write, cannot delete, cannot send through Firebase, cannot
   touch Auth. The default Firebase admin key (`firebase-adminsdk-…`) is never used
   and never created. The query selects four fields, so names and dates of birth are
   not even downloaded. A job that writes nothing is enough to never send twice
   (section 6).
2. **Logs are public.** The job prints counts only: hours handled, users matched,
   due, sent, gone, failed, skipped. Never a uid, an endpoint, a key, a name or an
   email. Errors are printed as a status number or an error code only, never the
   message, because a push error message can contain the endpoint.
3. **Secrets and triggers.** Two GitHub encrypted secrets, `GCP_SA_KEY` and
   `VAPID_PRIVATE_KEY`, and nowhere else. Triggers are `schedule` and
   `workflow_dispatch` only; never `pull_request` or `pull_request_target`.
   `permissions: contents: read`. Every action is pinned to a full commit hash.
   Dependencies install with `npm ci` from a committed lockfile. The key is passed
   to the library from the environment and never written to disk.
4. **Privacy text first.** `js/legal-data.js` gains the notifications wording
   (below) in the same commit as the switch, before the preview gate is removed.
   **The Play Store data-safety form needs checking:** a push subscription is a
   "Device or other IDs" data type, collected, not shared, optional, purpose "App
   functionality". If that type is not declared today, Adrian updates the form
   before the gate comes off.

### Privacy wording

Added to the end of section 1 ("What data we collect"):

- EN: If you turn on the daily reminder, we also store the hour you chose, your
  device's time zone, and a push subscription created by your browser (an address at
  your browser's push service and two encryption keys) so the reminder can reach
  that device. Turning the reminder off, signing out or deleting your account
  removes that subscription.
- ES: Si activas el recordatorio diario, también guardamos la hora que elegiste, la
  zona horaria de tu dispositivo y una suscripción push creada por tu navegador (una
  dirección en el servicio push de tu navegador y dos claves de cifrado) para que el
  recordatorio llegue a ese dispositivo. Al desactivar el recordatorio, cerrar
  sesión o eliminar tu cuenta, esa suscripción se elimina.

Added to the end of section 8 ("External services"):

- EN: Reminders are delivered through your browser's own push service (Google for
  Chrome and most Android browsers, Apple for Safari, Mozilla for Firefox). The
  message is encrypted for your device and contains only the reminder type, your
  language and your streak number. An automated job running on GitHub decides once
  an hour who is due; it reads only the reminder hour, time zone, last streak date
  and streak number, and changes nothing.
- ES: Los recordatorios se entregan mediante el servicio push de tu propio navegador
  (Google en Chrome y la mayoría de navegadores Android, Apple en Safari, Mozilla en
  Firefox). El mensaje va cifrado para tu dispositivo y solo contiene el tipo de
  recordatorio, tu idioma y el número de tu racha. Un proceso automático que se
  ejecuta en GitHub decide una vez por hora a quién le toca; solo lee la hora del
  recordatorio, la zona horaria, la última fecha de racha y el número de racha, y no
  modifica nada.

## 8. Console steps that are Adrian's

In the order they are needed. Each is free and asks for no card.

1. **Session 1:** deploy the rules: `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy`
2. **Session 2:** add the GitHub secret `VAPID_PRIVATE_KEY` (repo, Settings, Secrets
   and variables, Actions, New repository secret) from the file the session creates
   outside the repo, then delete that file.
3. **Session 2:** on the phone, open the app once with `?remind=1`, turn the switch
   on, and say what it shows.
4. **Session 3:** in Google Cloud console, IAM & Admin, Service accounts, project
   `chess-training-center`: create `streak-reminder` with the role Cloud Datastore
   Viewer (skip if it already exists), then Keys, Add key, Create new key, JSON.
5. **Session 3:** add the GitHub secret `GCP_SA_KEY` with the whole content of that
   JSON file, then delete the file from the PC and empty it from the Recycle Bin.
6. **Session 3:** in the repo's Actions tab, run "Streak reminder" by hand with
   `dry_run` on, and read out the counts.
7. **Session 4:** in Brave on the phone: Settings, Privacy and security, turn on
   "Use Google services for push messaging", restart Brave. In Android settings,
   check notifications are allowed for the Chess Training Center app.
8. **Session 4:** Play Console, App content, Data safety: check "Device or other
   IDs" as described in section 7.

## 9. Fallback: keyless login

Only if step 4 is refused (a "disabled by policy" message). The job does not use the
Firebase Admin SDK, so Workload Identity Federation works: a pool and a GitHub
provider with the condition
`assertion.repository == 'adrianfuentesmanrique-pixel/chess-app' && assertion.ref == 'refs/heads/main'`,
bound to `streak-reminder`; the workflow adds `id-token: write` and the pinned
`google-github-actions/auth` action; `GCP_SA_KEY` is not created. If that route asks
for billing, stop: the feature waits.

## 10. Sessions

Each ends in something verified and pushed.

1. **Rules.** `pushSubs` block and its tests. Ends when Adrian has deployed and the
   suite passes.
2. **App side, behind the preview gate.** Art, `sw.js` handlers, `js/notifications.js`,
   Settings block, Profile row, sign-out and account-deletion clean-up, strings,
   privacy text, the signing key pair. Verified at 375px, light and dark, Spanish and
   English, screenshots looked at, plus a push delivered to the service worker over
   CDP.
3. **The job.** Pure "who is due" logic with unit tests, the sender, the workflow,
   Adrian's key and secret. Ends with a dry run on GitHub printing counts.
4. **The phone.** Brave switch check, the hour set to the next hour, a real reminder
   received and tapped. Then the data-safety check, the gate removed, HANDOVER.

## 11. Known limits

- Only a real phone proves a notification arrives.
- Headless Chrome cannot make a real push subscription; there the "Subscribing
  failed" state is what gets exercised. A real subscription is proved on the phone.
- App Check blocks Firestore from localhost (the 403 is expected), and the emulator
  tools report a 404 for `sw.js`.
- Brave's "Use Google services for push messaging" switch can block push entirely.
- An iPhone gets reminders only from a Home Screen install (iOS 16.4 or later).
