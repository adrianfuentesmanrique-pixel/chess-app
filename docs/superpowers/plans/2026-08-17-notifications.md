# Phone notifications — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## ⛔ PARKED — 2026-08-20. Do not start Task 2, 3, 4, 5, 6 or 7.
>
> **Adrian has decided not to put a card on this project.** Blaze is therefore
> not happening, and every remaining task in this plan depends on it. This is a
> settled decision, not an open question — do not re-pitch it, do not re-cost
> it, and do not look for a way around it. There isn't one: the web platform
> cannot schedule a notification for later without a server (Part 1 explains
> why), and the server needs Blaze.
>
> **What actually exists, and what was thrown away:**
>
> * **Commit 1 is built and deployed** — `a59db0e`, 2026-08-20. The
>   `users/{uid}/fcmTokens/{tokenId}` rules block, the field constraints on
>   `users/{uid}`, and `tests/rules/notifications.test.js`. 169 rules tests, all
>   passing. **Leave it alone.** It is inert: it permits writes to a collection
>   that nothing writes to, and it costs nothing to keep. Reverting it would
>   churn live security rules for no benefit.
> * **Commit 2 was attempted on 2026-08-20 and deliberately backed out.** The
>   `functions/` directory, the `functions` block in `firebase.json` and the
>   `functions:deploy` / `functions:logs` scripts were written, then removed
>   once the Blaze answer came back. Nothing of commit 2 is in the repo. Task 2
>   below is complete enough to rebuild it in minutes if the decision ever
>   changes — with one correction folded in, below.
> * **`.gitignore` gained `Notification/`** and that entry was kept. It is
>   useful regardless: the raw artwork sits untracked in the checkout and this
>   keeps `git status` readable.
>
> **Two facts worth not re-discovering, both established by running the commands:**
>
> 1. **Task 2 Step 1 is answered. The database is in `nam5`** (from
>    `firebase firestore:databases:get "(default)"`), which is the US
>    multi-region, so the functions region is **`us-central1`**. Do not re-run
>    the lookup and do not guess.
> 2. **The Blaze block is real and it lands at API-enablement time,** before any
>    code is built or uploaded. The exact error from
>    `firebase deploy --only functions`:
>
>    > Error: Your project chess-training-center must be on the Blaze
>    > (pay-as-you-go) plan to complete this command. Required API
>    > artifactregistry.googleapis.com can't be enabled until the upgrade is
>    > complete.
>
>    That attempt asked Google to enable `cloudfunctions`, `cloudbuild` and
>    `artifactregistry`. It failed on the third. Enabled-but-unused APIs bill
>    nothing, and a Spark project has no card to charge in any case, so there is
>    nothing to clean up and nothing to worry about.
>
> **If this is ever un-parked**, the order is: Blaze → $1 budget alert → rebuild
> Task 2 → deploy → *then* the Artifact Registry cleanup policy, which cannot be
> set before the first deploy creates the `gcf-artifacts` repository.

Written 2026-08-20. **Nothing here is built yet.** Adrian must approve before any
feature code is written. This document was produced in a session that edited no
`js/` file, no `sw.js` and no `firestore.rules`.

**Goal:** the phone buzzes at the right moment — to save a streak, to say a
friend asked for you, and to say a Masterclass just went live — and never buzzes
more than twice in a day.

**Architecture:** Firebase Cloud Messaging (FCM) web push, sent by Cloud
Functions, received by a hand-written `push` handler inside the existing
`sw.js`. **No `firebase-messaging-sw.js`, no `importScripts`, no build step.**
The functions live in a new `functions/` directory that is deployed separately
and **does not change how the site is served** — the site stays on GitHub Pages
behind Cloudflare, and `firebase.json` gains a `functions` block beside the
existing `firestore` one.

**Tech Stack:** Vanilla ES modules on the client, Firebase JS SDK 10.14.1 from
`gstatic.com` (one new import: `firebase-messaging.js`). Node 20 + Firebase
Admin SDK in `functions/`. Firestore rules tested against the local emulator via
`npm run test:rules`.

---

## What I checked, and what was stale

Every claim below was read out of the working tree at commit `9c532c2`, not
copied from HANDOVER.

| Claim | Verdict |
|---|---|
| `sw.js` has no `push` and no `notificationclick` handler | **True.** A grep for both across `sw.js` returns only the cache lines. |
| `sw.js` is at v70 | **Stale.** The committed value at `9c532c2` is `chess-training-center-v76`, and another session had already bumped the working tree to **v77** while this plan was being written. **Do not hardcode a number from this document — read `sw.js:1` at implementation time and bump from whatever is actually there.** |
| `js/firebase.js` imports no messaging | **True.** Lines 4–16 import `firebase-app`, `firebase-auth`, `firebase-firestore`, `firebase-app-check` from gstatic 10.14.1 and nothing else. |
| No `functions/` directory | **True.** |
| `firebase.json` has only firestore + emulators | **True.** 14 lines, no `hosting`, no `functions`. |
| `Streak` is at `js/app.js:853` | **Close — it is `js/app.js:864`.** `STREAK_TIERS` starts at 825. |
| `todayStr()` at `js/app.js:1091`, local time | **Close — `js/app.js:1102`, and it is local time.** Its comment names the Panama UTC-5 rollover explicitly. |
| `DailyMissions` around `js/app.js:912` | **Close — `js/app.js:989`.** |
| `sendFriendRequest()` writes four fields | **True.** `js/firebase.js:340` writes exactly `from`, `to`, `status`, `createdAt`. |
| Rules tests: 124 passing | **Stale — there are 134 `it()` blocks** across `existing.test.js` (30), `friends.test.js` (57), `masterclass.test.js` (47). |
| `js/app.js` is 232 KB | **Stale — it is 250 KB.** Still: never read it whole. |
| The TWA is not in this repo | **True — it is `C:\Users\Adrian\chess-app-android\`.** See "The Play Store angle" below; it is already correctly configured. |

**One discovery changes the plan and is written up in full under "The block leak,
and why the rules already close it":** the `friendRequests` create rule at
`firestore.rules:168` already contains
`!exists(/databases/$(database)/documents/blocks/$(after().to)/blocked/$(me()))`.
A blocked sender's document is **never created**, so the notification function
can never fire for one. The neutral-toast guarantee survives for free.

---

## Global Constraints

Every task implicitly includes all of these.

- **Mobile-first at 375px**, in **light AND dark**, in **both languages**.
- **Existing design language only** — Kael, navy and gold. The settings UI reuses
  the `.seg` segmented-control pattern already used eight times inside
  `openSettings()` at `js/app.js:5478`. **Do not invent a toggle-switch widget.**
- **Every new string is bilingual** — an `es:` and an `en:` in `js/i18n.js`.
  **Notification bodies are user-visible strings and are no exception.**
  "Masterclass" stays untranslated in the Spanish strings.
- **The daily-reminder text must describe the real streak rule**, which is the
  strict one. Read the comment block at `js/app.js:940–952` and the
  `streak_how_*` strings at `js/i18n.js:577–588`. The notification says *come
  and do one real thing*, never *come and tap something*.
- **Never rename a storage key.** No key in this plan collides with an existing
  one.
- **Bump `CACHE` in `sw.js`** on every commit that changes `index.html`, any
  `js/*.js`, or `css/style.css`. **Read `sw.js:1` for the current value** — it
  was `v76` at commit `9c532c2` and `v77` in another session's working tree, so
  no number in this document is safe to copy. A commit that changes only
  `firestore.rules`, `functions/`, tests or docs must **not** bump it.
- **Every new `js/*.js` file goes in the `ASSETS` array in `sw.js`** (`sw.js:6`).
- **Commands handed to Adrian start with the `cd` and use `.cmd`**, separator
  `;` — `&&` is a syntax error in his PowerShell.
- **`js/app.js` is 250 KB — never read it whole.** Grep, then read with
  offset/limit.
- **`functions/` code never trusts a client field it did not derive.** It runs
  with the Admin SDK and **bypasses Firestore rules entirely**. Every guarantee
  the rules give the client must be re-stated as code in the function.

---

## Part 1 — The architecture question, answered honestly

### The web cannot schedule a notification for later. Full stop.

There were two candidate ways to make a phone buzz at 19:00 without a server:

- **The Notification Triggers API** (`showTrigger`, `TimestampTrigger`) was an
  origin trial in Chrome 80–86 and **was never shipped**. It is not in any
  browser today. It is not a fallback; it does not exist.
- **Periodic Background Sync** (`periodicsync`) exists in Chrome on Android, but
  it is explicitly specified to give **no timing guarantee**. The browser
  decides when to run it based on battery, network and how often you open the
  app; the minimum interval it honours in practice is around 12 hours, and it
  does not run at all if the app is not installed, or on iOS, or in Firefox and
  Safari. A "22:00 streak warning" that might arrive at 04:00 the next morning
  is not a streak warning.

So the honest table is:

| # | Want | Can it be done device-side? | Verdict |
|---|---|---|---|
| 1 | Daily reminder to keep the streak alive | Only via `periodicsync`, with no control over the hour. Would fire at a wrong, unpredictable time on some devices and never on others. | **Server push.** |
| 2 | "About to lose your streak", 22:00 local | Same, and the whole value is in the exact hour. `periodicsync` cannot deliver an exact hour. | **Server push.** |
| 3 | Friend request arriving | Impossible device-side. The phone is not running and the event happened on someone else's phone. | **Server push, no alternative.** |
| 4 | Do your daily missions | Same as 1. | **Server push.** |

**There is no device-side fallback worth writing.** A notification that arrives
at an unpredictable hour on some phones and never on others is worse than none,
because Adrian would not be able to tell a bug from a browser decision. See
decision (b).

### Which server, and what it costs

Cloud Functions and Cloud Scheduler both require the Firebase **Blaze
(pay-as-you-go)** plan, which means a real card on the `chess-training-center`
project. Adrian confirmed the project is currently on **Spark, no card**.

**The expected monthly bill is $0.00.** Not "low", not "a few dollars" —
zero. Here is the working, per month, against the perpetual free allowances that
Blaze includes:

| Line item | This app's usage | Free allowance | % used |
|---|---|---|---|
| Cloud Functions invocations | 1 hourly job × 24 × 30 = **720**, plus ~100 event triggers = **~820** | 2,000,000 | 0.04% |
| Function compute | 820 runs × ~1 s × 256 MB = **~205 GB-seconds** | 400,000 GB-s | 0.05% |
| Function vCPU | 820 × ~1 s × 0.17 vCPU ≈ **140 vCPU-seconds** | 200,000 | 0.07% |
| Cloud Scheduler jobs | **1** | 3 jobs free per billing account | 33% |
| Firestore reads (see the item-2 working below) | **~1,000 / day worst case** | 50,000 / day | 2% |
| Firestore writes (token docs, pref changes) | **<50 / day** | 20,000 / day | 0.25% |
| FCM messages | **~60 / day** | unlimited and free | — |
| Network egress | a push payload is <1 KB; **<1 MB / month** | 5 GB | 0.02% |

**The single line that could ever produce a charge is Artifact Registry**, where
the container image built for each function deploy is stored. A Node 20 function
image is roughly 150 MB, the free allowance is 0.5 GB, and old images accumulate
across deploys. **Task 2 therefore includes turning on the Artifact Registry
cleanup policy**, after which this stays inside the free tier permanently. If it
ever did spill over, the rate is $0.10 per GB per month — i.e. about one cent.

**Say it plainly: at a handful of users this is free, and it stays free.** The
real risk of Blaze is not the price list, it is a runaway loop — a function that
writes a document that re-triggers itself. Task 2 mitigates that with a hard
`maxInstances` cap and a $1 budget alert, and this plan contains **no function
that writes to a collection it also listens to.**

### Knowing Adrian's local time

Items 1, 2 and 4 must fire at a sensible local hour, so the server needs each
user's timezone. Two facts make this easy:

1. `Intl.DateTimeFormat().resolvedOptions().timeZone` gives the IANA zone
   (`"America/Panama"`) in every browser this app supports.
2. **`users/{uid}` is already a per-user private document that the client
   syncs to.** `db.setSyncHook()` at `js/firebase.js:276` writes any key in
   `SYNCED_KEYS` (`js/firebase.js:29`) straight to `users/{uid}` with
   `merge: true`, and the rule at `firestore.rules:15` is
   `allow read, write: if request.auth.uid == userId` — **no rules change is
   needed to add fields there.** Adding the keys to `SYNCED_KEYS` is the entire
   mechanism.

**Decision: store the IANA zone AND two derived UTC hours.**

```
users/{uid}                       (existing document, new fields)
  timeZone        string   "America/Panama"  — for display and debugging
  notifyHourUtc   number   0–23  the UTC hour at which it is remindHourLocal here
  warnHourUtc     number   0–23  the UTC hour at which it is 22:00 here
  remindHourLocal number   0–23  default 19. Stored from day one even though
                                 stage 1 never lets the user change it.
  notifPrefs      map      { daily:bool, warn:bool, friends:bool, live:bool }
```

**Why derived hours and not just the zone.** A scheduled function that only had
`timeZone` would have to ask "which of the ~600 IANA zones is at 19:00 right
now?" and issue a query per matching zone. Storing the UTC hour collapses that
to **one equality query per hour**: `where('notifyHourUtc','==',H)`.

**The DST caveat, stated rather than hidden.** The derived hours are wrong for
up to one day after a DST change, until the user next opens the app and the
client recomputes them. Panama does not observe DST, so this never affects
Adrian; for a user in a DST zone the worst case is one reminder an hour early or
late, once or twice a year. **This is the correct trade** — the alternative is a
nightly function that recomputes every user's hours, which is more code and more
reads to fix a once-a-year one-hour skew. Recompute on every app open, in
`Notifications.init()`.

### Item 2 — how the server knows you have not banked today, and what it costs

**This is the question that looked expensive and is not.** The reason:
**`streakLastDate` is already in Firestore.** It is in `SYNCED_KEYS` at
`js/firebase.js:31`, so every time `Streak.recordActivity()` calls
`db.kvSet('streakLastDate', ...)` (`js/app.js:900`) the sync hook mirrors the
`"YYYY-MM-DD"` string into `users/{uid}`. `streakCount` is there too.

So the 22:00 job never reads a document belonging to someone who has already
banked. The query does the filtering:

```
users
  where notifPrefs.warn   == true
  where warnHourUtc       == H            ← this hour's bucket
  where streakLastDate    <  todayInThatBucket
  limit 500
```

`streakCount > 0` is **not** a fourth clause — it is filtered in code, on
documents already paid for. Two inequality-ish fields in one query would need a
wider index for no gain.

**The read working, honestly:**

- Every user in a bucket shares the same local date at the instant the job runs,
  so `todayInThatBucket` is one string the job computes once.
- Documents read = **only the users in that bucket who have not banked today**.
  At Adrian's scale that is at most the whole user base — call it 10.
- Each matched user costs **one more read** for their token subcollection.
- A query that matches nothing is still billed **one read**.

| | per run | per day (24 runs) |
|---|---|---|
| Warning query (worst case, 10 unbanked users) | 10 | 240 |
| Their token docs | 10 | 240 |
| Evening-nudge query, same shape | 10 | 240 |
| Their token docs | 10 | 240 |
| Empty-query floor on hours with nobody in the bucket | — | ~50 |
| **Total** | | **~1,010 reads/day** |

**Free tier is 50,000 reads/day. This uses 2%.**

**So the honest answer is: item 2 is not more expensive than the others.** What
it is, is **less accurate**. `streakLastDate` only reaches Firestore if the user
was signed in and online at the moment they banked. Someone who plays offline,
or signed out, will get a "you're about to lose your streak" warning they did
not earn. That is the real cost, and it is a wrong-notification cost, not a
money cost.

**The cheaper-and-simpler version, offered as asked:** drop the 22:00 job
entirely and let the single 19:00 nudge carry the warning — *"You haven't banked
today. Five hours left."* One job instead of two, one notification instead of
two, no second chance for a false positive. **This is the recommended shape for
stage 1** (see the commit map: item 2 is deliberately in stage 2, commit 5).

---

## Part 2 — Decisions, with a recommendation on each

### (a) Blaze plan — **yes.**

Without it: **items 1, 2, 3 and 4 are all impossible.** There is no partial
answer. Every one of the four needs a server to decide when to send, and the
free Spark plan cannot run one. Blaze is not optional for this feature; it is
the feature.

The bill is $0.00 (working above). Turn on a $1 budget alert anyway — not
because you expect a charge, but so a bug tells you within a day.

### (b) FCM push for everything, **no device-side fallback.**

Recommended. The two device-side mechanisms are one that does not exist and one
with no timing guarantee. Writing a `periodicsync` fallback would produce
notifications at unpredictable hours on some Android phones and silence
everywhere else, and you would not be able to tell that from a broken function.
**One mechanism, so one thing to debug.**

### (c) Reminders fire at **19:00 local**, and yes, you get to change it — later.

19:00 rather than 09:00: the notification's whole job is *"there is still time
today"*. In the morning that is true but not urgent; at 19:00 it is both true
and urgent, and it is after work and after dinner. Not later than 19:00, because
the strict streak rule needs ten real moves or a solved puzzle — you need enough
evening left to actually do it.

**`remindHourLocal` is stored from day one, defaulting to 19, but stage 1 ships
no picker.** This is the same trick the Masterclass plan used with
`role: 'viewer'`: the storage shape is right from the start, so adding a
three-option seg (`09:00 / 19:00 / 21:00`) in a later commit is a UI change with
zero migration. Shipping the picker now means designing, translating and testing
a control before anyone has used the feature once.

### (d) The ceiling is **two a day**, and one of them has to be your fault.

- At most **one scheduled notification per day** — the 19:00 nudge. The 22:00
  warning replaces it rather than adding to it: if the nudge went out at 19:00
  and you still have not banked, the 22:00 warning is the *second and last*
  thing you hear.
- **Event notifications** (friend request, friend accepted, Masterclass live)
  are not capped by a counter, because each one is caused by a real person doing
  a real thing and arriving late makes them worthless. They are capped by
  reality: a handful of users generate a handful of events.
- **A hard rule for the functions: never two scheduled sends in the same local
  day.** The 22:00 job writes `lastWarnDate` on `users/{uid}` and the 19:00 job
  writes `lastNudgeDate`; each job skips a user whose own date field is already
  today. This is three lines and it is the only thing standing between this
  feature and uninstall.

### (e) Ask for permission **at the moment the streak first has something to lose.**

Not on the splash. Not on first launch. The rule is: **ask when the answer is
obviously yes**, which means asking immediately after something good happened
that the user would want to protect.

Recommended trigger, in order:

1. **The moment `Streak.recordActivity()` takes the count from 1 to 2**
   (`js/app.js:895`). You have now got a streak rather than a day. Kael appears
   with the `Daily reminder.png` art: *"Two days. Want me to remind you before
   this one dies?"* One button says yes and calls
   `Notification.requestPermission()` inside that tap; one says not now.
2. **A permanent row in the Profile streak card**, so someone who said "not now"
   can find it without hunting through Settings.
3. **Immediately after tapping "Add friend"** for the first time — *"Want to
   know when they answer?"* This is the other moment where the answer is
   obviously yes.

Never ask more than twice in the app's lifetime. Store `notifAskedCount`; at 2,
stop asking forever and leave only the Profile row and the Settings section.

**A hard browser constraint that shapes this:** `Notification.requestPermission()`
**must be called inside a user gesture** or Safari rejects it outright and Chrome
shows nothing. It has to be a button tap, which is why every trigger above is a
button and not a timer.

---

## Part 3 — The other ideas, judged

Adrian asked for other ideas and for a cap. **Four notification types ship.
Everything else is refused, with the reason.**

### ✅ YES — a Masterclass teacher going live. Highest value of anything here.

Adrian is right that this is the most valuable one, and the reason is precise:
**it is the only notification whose value is destroyed by being late.** A streak
reminder is useful anywhere in a five-hour window. A live lesson that started
twenty minutes ago is over.

It is also **the only one that makes an already-built feature work**. Commits
5–7 of the Masterclass plan built a live board that a member can follow in real
time; today the only way a member learns a class started is by having the app
open on that screen already. That is not a feature, that is a coincidence.

Cheap, too: it is an `onDocumentCreated` trigger on
`masterclasses/{mcId}/live/state`, which is a **create**, not an update. The
document is created by `startBroadcast()` (`js/firebase.js:939`) and deleted by
`stopBroadcast()` (`js/firebase.js:962`) and by `deleteMasterclass()`
(`js/firebase.js:665`) — so its creation is exactly "went live" and its deletion
is exactly "went off air". **The per-move writes are updates and do not fire the
trigger.** No debounce needed; the data model already gave us one.

### ✅ YES — a friend accepting your request.

Nearly free: it is a second `onDocumentCreated` in the same file, on
`friendships/{pairId}`, written by `acceptFriendRequest()` at
`js/firebase.js:428`. The `members` array is a sorted pair, so the recipient is
"whichever member is not the one who created it".

More importantly it closes a real hole. `rejectFriendRequest()`
(`js/firebase.js:439`) is **silent by design** — the sender keeps seeing
"Request sent" forever. Without an accept notification, "sent" and "accepted"
look identical too, so the sender has no signal at all in either direction. This
gives the *yes* a sound while leaving the *no* silent, which is exactly the
behaviour the Friends system was designed for.

It shares the `friends` toggle with the incoming-request notification — **one
switch, not two**, because nobody wants one and not the other.

### ❌ NO — a tier-up on the streak ladder, or a badge earned offline.

Both already have a better version. `Streak.celebrateTier()` (`js/app.js:918`)
puts Kael on screen with the tier art the instant it happens, and
`Badges.checkNew()` is called on the same code path. You are **looking at the
phone** when a tier-up happens — a notification would arrive while you are
holding the device that just showed you the same thing.

"Earned while offline" is not a real case: badges and tiers are computed on
device from local state, so they cannot be earned while the app is closed. There
is nothing to notify about.

### ❌ NO — monthly leaderboard reset or final standing.

Three reasons, weakest first. It needs a second Cloud Scheduler job, which eats
the third free scheduler slot for the least valuable notification here. It
depends on `monthStr()` in `js/app.js`, **which is still UTC** — the one dated
function that never got the local-time fix — so a month-boundary notification
would fire on the wrong day for Adrian in Panama, and fixing that is somebody
else's task that this plan is explicitly not folding in. And the content is
usually bad news: most users finish outside the top three, and "you came 9th" is
a notification whose best outcome is being ignored.

If the monthly standing is ever wanted, it belongs **in the app**, on the
leaderboard screen, where someone chose to look.

### ❌ NO — a comeback nudge after several idle days.

Adrian asked whether this is kind or nagging. **It is nagging, and the app's own
design already says so.** The streak rule is deliberately strict (`js/app.js:940`
— ten real moves, or a solved puzzle, not a tap) precisely so that the flame
means something. A notification sent to someone who already lost it is not
offering them anything; the streak is gone, and the notification's only content
is *you stopped*.

There is also a structural argument: someone idle for five days did not see the
19:00 nudge on any of those five days either. **They have already ignored five
notifications.** A sixth, with a sadder message, is how an app gets its
notifications switched off — and per Adrian's own rule, a notification he turns
off is worse than one he never got, because turning it off takes the friend
requests down with it.

### The final list — four types, four toggles

| Toggle key | Fires when | Art |
|---|---|---|
| `daily` | 19:00 local, if you have not banked today | `Daily reminder.png`, `1 daily mission missing.png`, `2 daily missions missing.png` |
| `warn` | 22:00 local, if you *still* have not banked and have a live streak | `warning 2 hours before.png` |
| `friends` | someone sends you a request, **or accepts yours** | `friend request.png` |
| `live` | a Masterclass you are a member of goes live | *(none supplied — falls back to `icons/icon-192.png`)* |

Items 1 and 4 are **one notification, not two**. They fire at the same hour, to
the same person, about the same thing — "you have not done today's chess yet".
Two separate buzzes at 19:00 would be the single most annoying thing in this
plan. The nudge names whichever is outstanding, and the three art files exist
precisely to let it say which: streak not banked → `Daily reminder.png`; streak
banked but one mission left → `1 daily mission missing.png`; two left →
`2 daily missions missing.png`.

**But the missions half has a problem, and it must be said:** `DailyMissions`
state (`js/app.js:989`) lives in `dailyMissionsDone` and `dailyMissionsDate`,
and **neither key is in `SYNCED_KEYS`** — they are local-only. The server cannot
see which missions are outstanding. Task 4 therefore adds `dailyMissionsDate`
and a small `dailyMissionsDoneCount` number to `SYNCED_KEYS`. It does **not**
sync the `done` map itself: a count is enough to choose between the three art
files, and it is one number instead of an object.

---

## Part 4 — The art

Five PNGs are in `C:\Users\Adrian\chess-app\Notification\`, currently untracked
(`git status` shows `?? Notification/`). They are **1.16–1.54 MB each, around
1300×1200 pixels**. They cannot ship as they are.

| File | Size | Use |
|---|---|---|
| `Daily reminder.png` | 1216×1293, 1.54 MB | `daily`, streak not banked |
| `1 daily mission missing.png` | 1312×1199, 1.46 MB | `daily`, one mission left |
| `2 daily missions missing.png` | 1402×1122, 1.38 MB | `daily`, two missions left |
| `warning 2 hours before.png` | 1312×1199, 1.51 MB | `warn` |
| `friend request.png` | 1386×1135, 1.16 MB | `friends` |

**Decision: they become the notification `icon` (Android's "large icon"), at
256×256, not the `image`.** Two reasons. The `image` slot on Android is a wide
banner and expects roughly 2:1 — these are square and would be centre-cropped
into nonsense. And the `image` is only shown when the user expands the
notification, whereas the `icon` is what they actually see in the shade.

A 256×256 PNG of this artwork lands at roughly 40–70 KB — a factor of about
twenty-five smaller, which matters because these get fetched by a phone that is
being interrupted.

**Downscaling on this machine:** there is no ImageMagick, no Inkscape and no
cairo here. Use headless Chrome, which is already the established route for this
repo, with an **absolute** output path. Task 3 gives the exact shape. Output
goes to `icons/notif/` as `daily.png`, `mission1.png`, `mission2.png`,
`warn.png`, `friend.png`. **The originals in `Notification/` stay untracked and
out of git** — 7 MB of source art does not belong in a repo that a phone clones
over Cloudflare.

The five `icons/notif/*.png` **do not go in the `ASSETS` array.** They are
fetched by the service worker when a push arrives and cached by the existing
network-first handler (`sw.js:117`). Precaching 250 KB of art that most installs
never see would slow every first launch.

---

## Part 5 — The block leak, and why the rules already close it

The Friends system's guarantee is that **every send outcome shows the same
toast** — `friends_sent_toast` (`js/i18n.js:412`, *"Solicitud enviada ✓"*). A
blocked sender must not be able to work out that they were blocked.

Notifications are an obvious new leak surface, and it turns out the existing
rules already close it:

- `firestore.rules:168` makes `create` on `friendRequests/{reqId}` conditional
  on `!exists(blocks/{to}/blocked/{me})`. **A blocked sender's document is never
  written.** It does not exist.
- The notification function is `onDocumentCreated('friendRequests/{reqId}')`.
  No document, no trigger, no notification.
- The sender cannot observe any of this. They see the same toast they always saw,
  and they never had a way to see whether the recipient's phone buzzed.

**So the guarantee survives with no extra work — but only because the function
never adds a code path that could differ.** Three rules for Task 6, all
load-bearing:

1. **The function must not `catch` a send failure differently from a success in
   anything the sender can see.** It writes to nothing the sender reads. In
   practice: no `sendFailed` field, no counter, no status flip.
2. **It must not read the sender's `users/{uid}` document.** It only needs the
   sender's `profileName`, which is already world-readable on
   `/leaderboard/{uid}`. `users/{uid}` holds `firstName`, `lastName` and
   `dateOfBirth` (`js/firebase.js:29`), none of which may ever reach a
   notification.
3. **No defence-in-depth block re-check.** It would cost a read per request and
   guard a case the rules make impossible. Adding it would imply the rules cannot
   be trusted; if they ever cannot be, the fix belongs in `firestore.rules` with
   a test, not as a second opinion in a function.

**The residual case, stated so nobody "finds" it later:** if A sends a request,
and B blocks A *afterwards*, the notification already went. That is correct
behaviour — the request was legitimate at the time — and it reveals nothing,
because A cannot see it either way.

**And the notification's own content:** it names the sender's `profileName` and
nothing else. That name is already public on the leaderboard. No uid, no
username, no email, no count of pending requests.

The Masterclass live notification is the same discipline: it names the class,
and it goes only to documents in `masterclasses/{mcId}/members`, read with the
Admin SDK. It **must not** name the teacher's real name — `masterclasses/{mcId}`
holds `name` and `ownerUid`, and `ownerUid` is a uid, so there is nothing to
leak as long as nobody "improves" it by joining to `users/{ownerUid}`.

---

## Part 6 — Refused permission, iOS, and the Play Store

### A device that refuses permission

`Notification.permission === 'denied'` is **terminal** for that origin. The
browser will not show the prompt again, and calling `requestPermission()` again
does nothing — it resolves `'denied'` immediately, with no UI. There is no
recovery path in JavaScript.

So:

- **Never call `requestPermission()` when permission is already `'denied'`.**
  Check first, every time.
- The Profile row and the Settings section, when denied, show a **static
  explanation** rather than a dead button: *"Your phone is blocking
  notifications for this app. Turn them back on in your phone's settings."* No
  "try again" button — it would do nothing, and a button that does nothing is
  the worst possible UI.
- **`'default'` (never asked) and `'denied'` are different states and must look
  different.** Task 3 renders five states, not two.
- No token is requested and no document is written in either case.

### iOS

Web push on iOS Safari requires **iOS 16.4 or later, and the site must have been
added to the Home Screen.** A page in the Safari tab cannot receive push at all,
and `Notification` is not even defined there — so feature-detection must be
`'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in
window`, not a UA sniff.

On iOS the Settings section shows a third state: *"On iPhone, add Chess Training
Center to your Home Screen first — then notifications can be turned on."*
Detect it with `navigator.standalone === false` on an iOS device. **Do not show
this on Android**, where installation is not required.

Adrian has no iPhone, so **this path cannot be tested here**. It must be written
carefully and marked untested in the commit message rather than claimed as
working.

### The Play Store TWA

**Checked, not assumed.** The TWA lives at
`C:\Users\Adrian\chess-app-android\` — a separate directory, not in this repo,
as expected. What is actually in it:

| Thing | State |
|---|---|
| `twa-manifest.json` → `"enableNotifications": true` | **Already set.** |
| `app/src/main/AndroidManifest.xml:26` → `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` | **Already declared, and correctly placed as a direct child of `<manifest>`** — nested inside `<application>` it would be silently ignored, and it is not. |
| `app/src/main/java/com/chesstrainingcenter/app/DelegationService.java` + the `<service android:name=".DelegationService">` block at `AndroidManifest.xml:177` | **Already present.** This is the piece that lets a web push reach the Android notification tray. |
| `targetSdkVersion` (`app/build.gradle:59`) | **36** — well past the 33 at which `POST_NOTIFICATIONS` became a runtime permission. |
| `.well-known/assetlinks.json` in this repo | **Present and committed**, with the SHA-256 fingerprint of `android.keystore`. Digital Asset Links verification is what makes delegation work at all. |
| Built artifacts | `app-release-bundle.aab` and `app-release-signed.apk`, version 1.0.2 / versionCode 3, built 2026-07-27. |
| On Google Play | **No.** Adrian confirmed it has never been uploaded. |

**So there is no Android work in this plan.** The TWA was already built with
notification delegation switched on. That has a consequence worth stating: **a
rebuild is not required** — the TWA is a wrapper around the live site, so when
the push code ships to GitHub Pages, an installed TWA picks it up on its next
launch. Nothing in `chess-app-android/` is touched by any commit here.

The one thing that follows from "not on Play yet": **on Android 13+, the runtime
permission dialog is a system dialog the TWA triggers, and it can only be tested
on a real install.** Until the app is on Play — or side-loaded from
`app-release-signed.apk`, which is the faster way to test this — the Android
path is untested. Stage 1 is therefore judged on **desktop Chrome and mobile
Chrome in the browser**, and the TWA path is verified separately. That upload is
not part of this plan.

---

## The data model

```
users/{uid}                                     ← EXISTING doc, new fields only
  timeZone               string   "America/Panama"
  notifyHourUtc          number   0–23, derived from remindHourLocal
  warnHourUtc            number   0–23, derived: the UTC hour at 22:00 local
  remindHourLocal        number   0–23, default 19. No UI in stage 1.
  notifPrefs             map      { daily, warn, friends, live } all bool
  notifAskedCount        number   0–2, how many times we have asked
  lastNudgeDate          string   "YYYY-MM-DD" — written by the FUNCTION
  lastWarnDate           string   "YYYY-MM-DD" — written by the FUNCTION
  dailyMissionsDate      string   already local via todayStr(), newly synced
  dailyMissionsDoneCount number   0–3, newly synced
  (streakCount, streakLastDate already sync — js/firebase.js:31)

users/{uid}/fcmTokens/{token}                   ← NEW subcollection
  token      string    MUST equal the document id
  createdAt  timestamp serverTimestamp()
  platform   string    'android' | 'ios' | 'desktop' | 'other'
  lang       string    'es' | 'en'   — which language to send in
```

### Why each shape, so nobody "tidies" it later

- **`fcmTokens` is a subcollection, not an array field on `users/{uid}`.** Two
  phones registering at once would each write the whole array and one would lose;
  and when FCM reports a token as dead the function must delete exactly that one,
  which is a `deleteDoc` on a known path rather than a read-modify-write of an
  array. **A subcollection is not covered by the parent's rule** — Firestore
  rules do not cascade — so this needs its own `match` block. That is Task 1.
- **The token is the document id AND a field.** Same reason the Masterclass
  members collection does it: the id is what the rule checks, the field is what
  a query filters on.
- **`lang` is stored on the token, not on the user.** Language is a device
  setting in this app (`getLang()` reads local storage, and it is not in
  `SYNCED_KEYS`), so a phone in Spanish and a laptop in English are both correct
  and should each get their own language.
- **`lastNudgeDate` / `lastWarnDate` are written by the function, never the
  client.** They are the only thing enforcing decision (d)'s two-a-day ceiling.
  A client that could write them could silence itself or spam itself.
- **`notifPrefs` is a map of four booleans, not four top-level fields.** One
  `merge` write flips a toggle, and the query filters on `notifPrefs.daily`
  which Firestore indexes as a nested field perfectly well.
- **`remindHourLocal` is stored even though nothing writes it but the default.**
  Same reasoning as `role: 'editor'` in the Masterclass plan: the storage shape
  is final now, so the picker is later a UI change with no migration.
- **`timeZone` is stored even though the function only reads the derived hours.**
  Without it, a wrong reminder hour is undebuggable — you would have the symptom
  and no way to see which zone produced it.

### Caps, and which ones are real

| Cap | Value | Enforced where |
|---|---|---|
| Token string length | 4096 | **Firestore rules** |
| `notifPrefs` keys | exactly the four names | **Firestore rules** (`hasOnly`) |
| `remindHourLocal` / `notifyHourUtc` / `warnHourUtc` | integer 0–23 | **Firestore rules** |
| `lastNudgeDate` / `lastWarnDate` client-writable | never | **Firestore rules** |
| Tokens per user | 10 | UI only — advisory, pruned oldest-first by the client |
| Scheduled notifications per local day | 1, or 2 with the warning | **Function code**, via `lastNudgeDate` / `lastWarnDate` |
| Users per scheduled query | 500 (`limit`) | Function code — a paging TODO for the day this app has 500 users, which is not today |

The tokens-per-user cap is **advisory**, and the code comment must say so. It
cannot be enforced in rules without a server-maintained counter, and a counter a
client can write is not a security control.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `firestore.rules` | modify | `users/{uid}/fcmTokens/{tokenId}` block; field constraints on `users/{uid}` |
| `firestore.indexes.json` | modify | two composite indexes on `users` |
| `tests/rules/notifications.test.js` | **create** | every allow and deny for the above |
| `firebase.json` | modify | add a `functions` block beside `firestore`. **No `hosting` block — ever.** |
| `functions/package.json` | **create** | `firebase-functions`, `firebase-admin`. Node 20. |
| `functions/index.js` | **create** | all the triggers |
| `functions/messages.js` | **create** | the bilingual notification bodies — mirrors `js/i18n.js` |
| `functions/.gitignore` | **create** | `node_modules/` |
| `js/notifications.js` | **create** | permission, token lifecycle, prefs, the Settings section |
| `js/firebase.js` | modify | one gstatic `firebase-messaging` import; token save/delete; prefs write |
| `js/app.js` | modify | the Settings section call, the Profile streak-card row, the ask-at-day-2 hook |
| `js/i18n.js` | modify | new bilingual strings |
| `sw.js` | modify | `push` + `notificationclick` handlers; `js/notifications.js` into `ASSETS`; `CACHE` bump |
| `icons/notif/*.png` | **create** | five downscaled 256×256 PNGs |
| `tools/resize-notif.js` | **create** | the one-off downscaler |
| `.gitignore` | modify | `Notification/` |

`js/notifications.js` follows the `js/friends.js` pattern exactly: it imports
`$`, `toast`, `modal`, `askConfirm`, `sheet`, `esc` from `js/app.js`, and
**never touches an app.js binding at module top level** — that throws
`Cannot access '...' before initialization`. Inside methods and handlers is fine.

**`functions/messages.js` duplicates strings that also live in `js/i18n.js`, and
that is deliberate.** The functions run in Node with no access to the client
bundle, and importing a 60 KB browser module into a Cloud Function to read six
strings would be worse. The duplication is six key/value pairs; Task 4 puts a
comment at both ends naming the other file.

---

## Commit map

**This plan is seven commits, which is more than the ~6 ceiling. Stage 1 is
therefore commits 1–4, and it delivers items 1 and 4** — exactly the fallback
Adrian asked for. Commits 5–7 are stage 2 and can be approved separately after
stage 1 has been seen working on a real phone.

| # | What lands | User-visible? | `sw.js` bump | Stage |
|---|---|---|---|---|
| 1 | Rules + rules tests for `fcmTokens` and the new `users` fields. No feature code. | no | **no** | 1 |
| 2 | Blaze upgrade, `functions/` scaffold, `firebase.json` block, budget alert, cleanup policy. A hello-world function proves deploy works. | no | **no** | 1 |
| 3 | Client: permission flow, token registration, `sw.js` push + click handlers, Settings section, the art. **Send yourself a test push from the Firebase console.** | yes | yes | 1 |
| 4 | The 19:00 nudge — Cloud Scheduler job, the query, the three art variants, mission-count sync. **Items 1 and 4 are now done.** | yes | yes | 1 |
| — | **← STOP HERE and you have a working, useful feature:** the phone reminds you at 19:00, in your language, with the right art, and you can turn it off. Everything above is load-bearing for what follows. | | | |
| 5 | The 22:00 streak warning — item 2, plus the two-a-day ceiling. | yes | no | 2 |
| 6 | Friend request + friend accepted triggers — item 3. | yes | no | 2 |
| 7 | Masterclass went live — the highest-value one. | yes | no | 2 |

Commits 5–7 do not bump `sw.js`: the `push` handler from commit 3 already
renders any type, because the function sends the title, body, icon and tag in
the data payload. **That is why commit 3 must get the payload shape right** —
see Task 3, Step 2.

---

## Task 1: Firestore rules and their tests

**Files:**
- Modify: `firestore.rules` (a new `fcmTokens` block; tighten `users/{userId}`)
- Test: `tests/rules/notifications.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the collection layout every later task writes to.

**No feature code in this commit and `sw.js` is NOT bumped** — nothing the
browser loads changes. Same shape as Friends commit 1 and Masterclass commit 1,
and it is why neither has rules drift.

- [ ] **Step 1: Read the existing test setup so the new suite matches it**

Read the first ~40 lines of `tests/rules/friends.test.js` only. Copy its
`initializeTestEnvironment` / `beforeAll` / `afterEach` scaffolding verbatim. Do
not invent a different harness.

- [ ] **Step 2: Decide what to do about `users/{userId}`, and write that decision down**

The current rule is `firestore.rules:15–17`:
`allow read, write: if request.auth != null && request.auth.uid == userId`.
It is completely open for the owner and has no field allowlist, unlike
`/leaderboard/{uid}` which has a strict `hasOnly`.

**Recommendation: constrain the new fields, and do NOT add a `hasOnly` to this
document.** A `hasOnly` here would have to list every key in `SYNCED_KEYS`
(`js/firebase.js:29`, currently 38 keys) and would then break silently every
time a key is added to that array — which is a trap, not a control. And unlike
`/leaderboard`, this document is **private**: the only person who can read it is
its owner, so there is no privacy promise to enforce with a field allowlist.

What must be constrained is the two fields the *function* owns:

```
match /users/{userId} {
  allow read: if signedIn() && me() == userId;

  allow write: if signedIn() && me() == userId
    // The client may never write the send-history fields. They are the only
    // thing enforcing the two-notifications-a-day ceiling; a client that could
    // set them could silence itself or spam itself. The FUNCTIONS write these
    // with the Admin SDK, which bypasses these rules entirely.
    //
    // resource.data is NULL on a create, so diff() must be guarded. This is
    // exactly the trap that stopped anyone deleting live/state for two
    // commits (see firestore.rules, the live block's delete comment).
    && (resource == null ||
        !after().diff(resource.data).affectedKeys()
              .hasAny(['lastNudgeDate', 'lastWarnDate']))
    && (!('remindHourLocal' in after()) || hourOk(after().remindHourLocal))
    && (!('notifyHourUtc'   in after()) || hourOk(after().notifyHourUtc))
    && (!('warnHourUtc'     in after()) || hourOk(after().warnHourUtc))
    && (!('timeZone' in after()) ||
        (after().timeZone is string && after().timeZone.size() <= 64))
    && (!('notifPrefs' in after()) ||
        after().notifPrefs.keys().hasOnly(['daily','warn','friends','live']));
}
```

with a helper beside `num()` at `firestore.rules:13`:

```
function hourOk(h) { return h is int && h >= 0 && h <= 23; }
```

And the new block, placed after the `blocks` match at `firestore.rules:189` and
before the Masterclass section:

```
// One document per registered device. A SUBCOLLECTION, because rules do not
// cascade from users/{userId} — without this block nobody could write a token
// at all. Nothing here is readable by anyone but the owner; the FUNCTIONS read
// it with the Admin SDK, which does not consult these rules.
match /users/{userId}/fcmTokens/{tokenId} {
  allow read, list, delete: if signedIn() && me() == userId;
  allow create, update: if signedIn() && me() == userId
    && after().keys().hasOnly(['token','createdAt','platform','lang'])
    && after().token == tokenId
    && after().token is string && after().token.size() <= 4096
    && after().platform in ['android','ios','desktop','other']
    && after().lang in ['es','en'];
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/rules/notifications.test.js`. Each as its own `it()`, allow **and**
deny:

*Tokens*
1. owner can create `users/{me}/fcmTokens/{tok}` with `token == tok`
2. a stranger cannot create a token under someone else's uid
3. a signed-out client cannot create a token
4. `token` field not matching the document id is denied
5. a token string over 4096 chars is denied
6. an unlisted field on the token document is denied (`hasOnly`)
7. `platform` outside `['android','ios','desktop','other']` is denied
8. `lang` outside `['es','en']` is denied
9. owner can delete their own token
10. a stranger cannot delete someone else's token
11. owner can `list` their own `fcmTokens`
12. a stranger cannot `list` someone else's `fcmTokens`

*User fields*
13. owner can set `notifPrefs: {daily:true,warn:false,friends:true,live:true}`
14. `notifPrefs` with a fifth key is denied
15. `remindHourLocal: 19` allowed; `24` denied; `-1` denied; `"19"` denied
16. `notifyHourUtc` and `warnHourUtc` — the same three denials each
17. `timeZone` over 64 chars denied
18. **the client cannot write `lastNudgeDate`** — the important one
19. **the client cannot write `lastWarnDate`**
20. a client update that touches neither date field still succeeds
21. **creating the user document for the first time succeeds** (the null-`resource` guard)
22. a stranger cannot read or write `users/{other}`

Run them and **watch them fail** before touching `firestore.rules`:

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
```

- [ ] **Step 4: Write the rules until the tests pass**

- [ ] **Step 5: Verify the whole suite, not just the new file**

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
```

**134 existing + ~22 new = ~156 passing, 0 failing.** If any of the 134 now
fails, the `users` change broke something — fix it here, not later. The most
likely casualty is a test in `existing.test.js` that creates a user document
fresh, which is why case 21 exists.

- [ ] **Step 6: Deploy the rules**

Committed is not deployed. Rules have their own deploy, and Pages/Cloudflare
does not carry them:

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy
```

- [ ] **Step 7: Commit.** `sw.js` is **not** bumped — nothing the browser loads changed.

---

## Task 2: Blaze, and a functions directory that deploys

**Files:**
- Modify: `firebase.json`, `package.json`
- Create: `functions/package.json`, `functions/index.js`, `functions/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a proven deploy path. Nothing user-visible.

**The point of this commit is to separate "does deploying a function work at
all" from "is my notification logic right".** Debugging both at once is how a
Saturday disappears.

- [ ] **Step 1: Find out which region the database is in — do not guess**

A Firestore-triggered function must be in the same location as the database.

```bash
cd C:\Users\Adrian\chess-app; npx.cmd firebase firestore:databases:list --project chess-training-center
```

Write the answer into `functions/index.js` as a `REGION` constant. Every function
in this plan uses it.

**Already answered, 2026-08-20: the database is `nam5`, so `REGION` is
`'us-central1'`.** The command above prints the location but the plan's original
wording implied the region name would be usable directly — it is not. `nam5` is a
multi-region and the matching function region is `us-central1`. Skip this step.

- [ ] **Step 2: Upgrade the project to Blaze**

This is Adrian's to do, in a browser, and it needs a card:
`https://console.firebase.google.com/project/chess-training-center/usage/details`
→ Modify plan → Blaze.

**Before clicking anything, re-read the cost table in Part 1. The expected bill
is $0.00.**

- [ ] **Step 3: Set a $1 budget alert immediately**

Google Cloud console → Billing → Budgets & alerts → a budget of **$1** on this
project, alert at 50% and 100%. This will never fire. It exists so that if a
function ever loops, an email arrives within a day instead of a bill arriving
within a month.

- [ ] **Step 4: Turn on the Artifact Registry cleanup policy**

This is the only line item that can accumulate. Google Cloud console → Artifact
Registry → the `gcf-artifacts` repository → Cleanup policies → keep the **3 most
recent versions**, delete older. Without this, every deploy leaves a ~150 MB
image behind and the 0.5 GB free allowance is gone after four deploys.

- [ ] **Step 5: Create `functions/`**

`functions/package.json`: Node 20 engine, `"main": "index.js"`, dependencies
`firebase-admin` and `firebase-functions` v6 (2nd gen). `"type": "commonjs"` —
**note that this differs from the repo root's `"type": "module"`**, which is
correct and intentional: `functions/` has its own `package.json` and its own
dependency tree, entirely separate from the root's dev tooling.

`functions/.gitignore`: `node_modules/`.

`functions/index.js`: one function only, for now —

```js
const { onRequest } = require('firebase-functions/v2/https');
const REGION = '...';   // from Step 1
exports.ping = onRequest({ region: REGION, maxInstances: 2 },
  (req, res) => res.send('ok'));
```

**`maxInstances` goes on every function in this plan.** It is the cap that turns
"a bug costs money" into "a bug is slow". Scheduled and triggered functions get
`maxInstances: 2`; there is no burst to absorb at this scale.

- [ ] **Step 6: Add the functions block to `firebase.json`**

```json
"functions": [{ "source": "functions", "codebase": "default" }]
```

beside the existing `"firestore"` key. **Do not add a `"hosting"` key.** The site
is served by GitHub Pages behind Cloudflare, and a `hosting` block is how someone
accidentally changes that. JSON cannot hold a comment, so this warning goes in
the commit message and stays here.

- [ ] **Step 7: Deploy and prove it**

```bash
cd C:\Users\Adrian\chess-app\functions; npm.cmd install
```

```bash
cd C:\Users\Adrian\chess-app; npx.cmd firebase deploy --only functions --project chess-training-center
```

Open the printed URL. It says `ok`. **Then confirm the site is untouched**: load
`https://chesstrainingcenter.app` and check it still serves from Cloudflare, not
Firebase Hosting.

- [ ] **Step 8: Leave `ping` in place**

It costs nothing, and the day a deploy mysteriously fails it is the one-second
check that tells you whether the problem is your code or your account.

- [ ] **Step 9: Add functions scripts to the root `package.json`**

```json
"functions:deploy": "firebase deploy --only functions --project chess-training-center",
"functions:logs": "firebase functions:log --project chess-training-center"
```

- [ ] **Step 10: Commit.** `sw.js` is **not** bumped.

---

## Task 3: The client — permission, token, and a service worker that can show a notification

**Files:**
- Create: `js/notifications.js`, `tools/resize-notif.js`, `icons/notif/*.png`
- Modify: `js/firebase.js`, `js/app.js`, `js/i18n.js`, `sw.js`, `.gitignore`

**Interfaces:**
- Consumes: Task 1's rules.
- Produces: `Notifications.init()`, `Notifications.ask()`,
  `Notifications.section(box)`, `Notifications.disableAll()`; and a `push`
  handler in `sw.js` that can render **any** of the four types.

- [ ] **Step 1: Downscale the art**

Headless Chrome, absolute paths — there is no ImageMagick on this machine.

Write `tools/resize-notif.js` (~30 lines, committed): it writes a temporary HTML
page that draws each source PNG onto a 256×256 canvas and `toDataURL()`s it,
loads that page in headless Chrome, and writes the five outputs. Sources are
`C:\Users\Adrian\chess-app\Notification\*.png`; outputs are
`C:\Users\Adrian\chess-app\icons\notif\{daily,mission1,mission2,warn,friend}.png`.

**Confirm each output is under 100 KB** before committing. Add `Notification/`
to `.gitignore`.

- [ ] **Step 2: The `push` handler in `sw.js` — get the payload shape right now**

This is the shape every later commit depends on, so it is designed once, here.
The function sends a **data-only** message; the service worker renders it:

```js
self.addEventListener('push', e => {
  // Data-only messages: Firebase never renders these itself, we always do.
  // A push handler that does NOT call showNotification() makes Chrome show
  // its own "This site was updated in the background" instead — so every
  // path through here, INCLUDING the parse failure, must show something.
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(
    d.title || 'Chess Training Center', {
      body: d.body || '',
      icon: d.icon || 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: d.tag || 'ctc',          // same tag replaces, never stacks
      renotify: false,
      data: { url: d.url || './' },
    }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => {
      // Focus an open copy rather than opening a second one.
      for (const c of list) if ('focus' in c) {
        return c.focus().then(() => (c.navigate ? c.navigate(url) : null));
      }
      return clients.openWindow(url);
    }));
});
```

Three things in there are load-bearing and must not be "tidied":

- **`e.waitUntil()` around `showNotification()`.** Without it the worker can be
  killed before the notification is drawn and nothing appears.
- **A `showNotification()` on every path, including the `catch`.** A push handler
  that shows nothing makes Chrome substitute its own generic message, which
  looks like a bug to the user and is one to you.
- **`tag`.** Four fixed tags (`daily`, `warn`, `friends`, `live`) mean a second
  friend request replaces the first rather than stacking two.

- [ ] **Step 3: `js/notifications.js`**

`Notifications.supported()` — `'Notification' in window &&
'serviceWorker' in navigator && 'PushManager' in window`. **Feature detection,
never a UA sniff.**

`Notifications.state()` — returns one of `unsupported` / `ios-needs-install` /
`default` / `denied` / `granted`. Five states, not two. `ios-needs-install` is
an iOS device with `navigator.standalone === false`.

`Notifications.ask()` — **must be called inside a user gesture.** Returns early
if state is anything but `'default'`. On `'granted'`, calls `saveToken()`.
Increments `notifAskedCount` either way.

`Notifications.saveToken()` — calls `getToken()` (Step 4), then writes
`users/{uid}/fcmTokens/{token}`, then writes `timeZone`, `notifyHourUtc`,
`warnHourUtc`, `remindHourLocal` and default `notifPrefs` (all four true).

`Notifications.refreshHours()` — recompute the two UTC hours and write them only
if changed. Called from `init()` on **every app open**; this is what keeps DST
drift to one day.

`Notifications.disableAll()` — **this must actually unsubscribe, not just stop
rendering.** In order: `deleteToken()` from the FCM SDK, then delete the
`fcmTokens/{token}` document, then set all four `notifPrefs` to false. Deleting
the document alone would leave FCM still able to reach the device via a
subscription the server no longer knows about; calling `deleteToken()` alone
would leave a dead document the send function has to discover and clean up.
**Both, in that order.**

`Notifications.section(box)` — the Settings UI. Four `.seg` on/off pairs, one per
type, plus a **"Turn everything off"** button that calls `disableAll()`. Built
with the same `document.createElement` + `segInit()` pattern as everything else
inside `openSettings()` (`js/app.js:5478`), so its spacing and its light/dark
styling come for free. It goes **after the privacy section** (`js/app.js:5560`)
and before Legal.

- [ ] **Step 4: The one new import in `js/firebase.js`**

```js
import { getMessaging, getToken, deleteToken }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
```

Same version as the other four imports (`js/firebase.js:4–16`). `getToken()`
needs two things:

- **A VAPID key**, from Firebase console → Project settings → Cloud Messaging →
  Web Push certificates → Generate key pair. It is a public key and belongs in
  the source next to `firebaseConfig` (`js/firebase.js:19`), which already holds
  the public `apiKey`.
- **`serviceWorkerRegistration`** — pass the app's existing registration
  explicitly. **Do not let the SDK look for `firebase-messaging-sw.js`**; that
  file does not exist and will not be created. Passing the registration is what
  makes the existing `sw.js` the push target.

**Nothing from `firebase-messaging` is imported inside `sw.js`.** The `push`
handler is thirty lines of plain code and needs no SDK.

- [ ] **Step 5: The three ask-moments**

- `js/app.js:895`, inside `Streak.recordActivity()`, at the point where
  `this.count` becomes 2: a `KaelQuotes.show()` with the `daily.png` art and two
  buttons. **Not on the same code path as `celebrateTier()`** — the two share
  one Kael bubble and would fight over it.
- The Profile streak card (`index.html`, the `profile-streak-ladder` card): a
  permanent row.
- After the first `sendFriendRequest()` in `js/friends.js`.

All three check `notifAskedCount` and stop at 2 forever.

- [ ] **Step 6: Strings**

Roughly 20 keys in `js/i18n.js`, all with `es:` and `en:` — the five
notification bodies (which `functions/messages.js` will mirror), the four toggle
labels, the "turn everything off" button, the denied explanation, the iOS
add-to-home-screen explanation, and the two ask prompts.

- [ ] **Step 7: `sw.js`**

`js/notifications.js` into `ASSETS` (`sw.js:6`). **`CACHE` bumped by one from
whatever `sw.js:1` currently says** — do not copy a number out of this plan; it
was v76 at `9c532c2` and another session had it at v77 before this was written.
The `icons/notif/*.png` are **not** added to `ASSETS`.

- [ ] **Step 8: Prove it, without any function written yet**

Firebase console → Cloud Messaging → **Send test message**, pasting the token
that `saveToken()` logged. Confirm on a real Android phone: the notification
appears, the art is the right art, tapping it opens the app.

**This is the whole point of splitting commit 3 from commit 4.** If the test
push works, the browser plumbing is right, and any later failure is in the
function.

**Known limit:** App Check blocks this machine from Firestore, and the 403 in
the console is normal. **Nothing in this task can be proved from localhost** —
it is proved on the deployed site, on a phone. The Claude browser pane will not
composite here either; drive headless Chrome over CDP if a screenshot is needed.

- [ ] **Step 9: Commit**, with `sw.js` bumped by one from its current value.

---

## Task 4: The 19:00 nudge — items 1 and 4

**Files:**
- Modify: `functions/index.js`, `js/firebase.js` (`SYNCED_KEYS`), `js/app.js`
  (`DailyMissions`), `firestore.indexes.json`
- Create: `functions/messages.js`

**Interfaces:**
- Consumes: Task 3's payload shape, Task 1's fields.
- Produces: `sendDailyNudge`, an hourly scheduled function.

- [ ] **Step 1: Sync the mission count**

`dailyMissionsDate` and a new `dailyMissionsDoneCount` into `SYNCED_KEYS`
(`js/firebase.js:29`). `DailyMissions.complete()` writes the count alongside the
existing `dailyMissionsDone` map; `DailyMissions.init()` resets it to 0 on a new
day. **Do not sync the `done` map itself** — a count is all the server needs,
and it is one number instead of an object.

- [ ] **Step 2: The composite index**

`firestore.indexes.json` gains one entry on `users`:
`notifPrefs.daily` ASC, `notifyHourUtc` ASC, `streakLastDate` ASC.

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run indexes:deploy
```

- [ ] **Step 3: `functions/messages.js`**

Six strings, each with `es` and `en`. **A comment at the top naming
`js/i18n.js` as the other half, and a matching comment there.** These two files
must be changed together; nothing enforces it but the comments.

- [ ] **Step 4: `sendDailyNudge`**

`onSchedule({ schedule: '0 * * * *', region: REGION, maxInstances: 2 })`.

For hour `H` = the current UTC hour:

1. Query `users` where `notifPrefs.daily == true`, `notifyHourUtc == H`,
   `limit(500)`.
2. Compute `today` for that bucket — all users in it share a local date.
3. **Skip anyone whose `lastNudgeDate === today`** — the ceiling from decision (d).
4. For each remaining user, choose the message:
   - `streakLastDate !== today` → `daily.png`, the streak text
   - streak banked, `dailyMissionsDoneCount < 3` → `mission1.png` / `mission2.png`
   - both done → **send nothing at all**
5. Read their `fcmTokens`, send one data-only message per token, in that token's
   own `lang`.
6. **On a token error of `messaging/registration-token-not-registered`, delete
   that token document.** This is the only cleanup path for dead tokens.
7. Write `lastNudgeDate = today` on the user.

**The ordering in steps 5–7 matters:** the `lastNudgeDate` write happens *after*
a successful send, so a function that crashes mid-run retries the next hour
rather than silently marking someone as nudged.

- [ ] **Step 5: The text says the real rule**

The Spanish and English bodies must describe the strict rule from
`js/app.js:940–952` and `js/i18n.js:579–586`: **ten of your own moves, or one
solved puzzle, or a converted endgame** — not "open the app". Getting this wrong
teaches people the flame is cheap, and then they lose it and blame the app.

- [ ] **Step 6: Deploy and watch one real cycle**

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run functions:deploy
```

```bash
cd C:\Users\Adrian\chess-app; npm.cmd run functions:logs
```

Set your own `notifyHourUtc` to the next hour by hand in the Firestore console
and wait for it. **Do not declare this working from a log line — declare it
working when a phone buzzes.**

- [ ] **Step 7: Check the read count against the estimate**

Firebase console → Firestore → Usage, the day after. The estimate in Part 1 is
~1,000 reads/day. **If it is an order of magnitude higher, the query is not
using the index and is scanning** — stop and fix it before commit 5.

- [ ] **Step 8: Commit.** `sw.js` bumped, because `js/app.js` and
`js/firebase.js` changed.

**Stage 1 ends here. Items 1 and 4 are delivered.**

---

## Task 5 (stage 2): The 22:00 streak warning — item 2

- [ ] Add a second query **inside the same hourly run** rather than a second
  scheduled function — Cloud Scheduler's free tier is 3 jobs and there is no
  reason to spend a second one.
- [ ] Query: `notifPrefs.warn == true`, `warnHourUtc == H`,
  `streakLastDate < today`. Filter `streakCount > 0` **in code**, on documents
  already paid for — a second inequality field in the query buys nothing here.
- [ ] The ceiling: skip anyone whose `lastWarnDate === today`. The 19:00 nudge
  having gone out does **not** suppress this — that is the intended second and
  final buzz of the day, and the ceiling in decision (d) is two.
- [ ] Second index on `users`: `notifPrefs.warn`, `warnHourUtc`, `streakLastDate`.
- [ ] **Write the false-positive case into the code comment**: `streakLastDate`
  only reaches Firestore when the user was online and signed in as they banked,
  so an offline session produces a warning that is wrong. This is known,
  accepted, and not a bug report.

---

## Task 6 (stage 2): Friend request and friend accepted — item 3

- [ ] `onDocumentCreated('friendRequests/{reqId}')` → notify `to`, naming the
  sender's `profileName` read from the **public** `/leaderboard/{from}` document.
- [ ] `onDocumentCreated('friendships/{pairId}')` → notify whichever of
  `members` is not the creator. `members` is the sorted pair
  (`js/firebase.js:428`), so both halves are in one array.
- [ ] Both gated on `notifPrefs.friends`. **One toggle for both** — nobody wants
  one and not the other.
- [ ] **Re-read Part 5 before writing a line of this.** No block re-check, no
  field written back to `friendRequests`, no read of `users/{from}`.
- [ ] A unit test in `functions/` asserting the notification body contains only
  the public display name — no uid, no username, no email, no date of birth.

---

## Task 7 (stage 2): A Masterclass went live — the best one

- [ ] `onDocumentCreated('masterclasses/{mcId}/live/state')`. **A create, not an
  update** — `startBroadcast()` (`js/firebase.js:939`) creates it, the per-move
  writes are updates and do not fire, `stopBroadcast()` (`js/firebase.js:962`)
  deletes it. The existing data model gives the debounce for free.
- [ ] Read `masterclasses/{mcId}/members` with the Admin SDK; notify everyone
  except `drivenBy`.
- [ ] Body: the class `name` only. **Never join to `users/{ownerUid}`** — that
  document holds `firstName`, `lastName` and `dateOfBirth`.
- [ ] `url` in the payload deep-links to the class, so tapping it lands on the
  live board rather than the home screen.
- [ ] Gated on `notifPrefs.live`.

---

## Self-review notes

- **The brief said `sw.js` is at v70. It is at v76.** Every other claim in the
  brief checked out, three with line numbers off by 9–77 (`Streak` 853→864,
  `todayStr` 1091→1102, `DailyMissions` ~912→989). The test count is 134, not
  124. `js/app.js` is 250 KB, not 232 KB. None of these change the design; they
  are recorded so the next session does not rediscover them.
- **The brief's framing of item 2 as potentially expensive turned out to be
  wrong, in Adrian's favour, for a reason he could not have known:**
  `streakLastDate` has been syncing to `users/{uid}` since before Friends
  (`js/firebase.js:31`), so the server already knows who has banked. The
  expensive design — read every user's document every hour — was never
  necessary. Item 2's real cost is **accuracy**, not money, and that is written
  up rather than buried.
- **The block-leak worry was already solved by the rules**, at
  `firestore.rules:168`. This plan's contribution is a list of three things the
  function must *not* do, so it stays solved.
- **The TWA needed no work at all**, which was not the expected answer.
  `enableNotifications`, `POST_NOTIFICATIONS`, the `DelegationService` and
  `assetlinks.json` were all already in place from the July build. The Android
  angle is therefore a *testing* constraint, not a *building* one — and it
  cannot be tested until the app is installed, which it is not.
- **`monthStr()` is still UTC**, and that is one of the two reasons the monthly
  leaderboard notification is refused rather than deferred. This plan does not
  fold in the fix.
- **Nothing here depends on the Masterclass two-account production run or the
  Friends reject/cancel/unfriend live checks.** Task 7 depends on
  `startBroadcast()` and `stopBroadcast()` writing and deleting `live/state` —
  proved live on 2026-08-19 per HANDOVER — but Task 7 is stage 2, so if that
  ever turns out to be wrong, it blocks nothing in stage 1.
- **Seven commits is over the ~6 ceiling and the brief's fallback was taken:**
  stage 1 is commits 1–4 and delivers items 1 and 4 alone, exactly as asked.
- **`Notification/` (7 MB of source art) is deliberately never committed.** Only
  the five 256×256 derivatives go in.
