# Chess app — where things stand (updated 2026-10-07)

## STANDING RULE (Adrian, 2026-10-08): finish the job by pushing

A session ends with `git push` to `main`, WITHOUT asking, once the work is verified and
committed. Every older line in this file that says "NOT pushed - ask Adrian" is history,
not the rule. The full wording, and the cases where a session must stop and ask instead,
are in `CLAUDE.md` under "Finish by pushing".

## Already done and pushed — do NOT redo these

- **KAEL STREAK WIDGET + WIDGETS LINK THEMSELVES (2026-10-15, web v227, app 1.0.6 / code 8).**
  Supersedes the copy-and-paste parts of the two widget entries below (Profile code box,
  Paste screen, "lost code" state): ADRIAN DECIDED no user should ever copy a code.
  ANDROID (C:\Users\Adrian\chess-app-android, local git, commits d726770 Kael widget,
  ba0e698 auto-link): `StreakWidgetKael.java` = an empty subclass, its own receiver;
  everything lives in StreakWidget (PROVIDERS = both classes, one fetch redraws both).
  `xml/streak_widget_kael_info.xml` 2x2 (110dp), resizes horizontally to maxResizeWidth
  420dp; layouts `widget_kael` (Kael over flame+count+days), `widget_kael_wide` (Kael left,
  flame 56dp + count 48sp right) from KAEL_WIDE_DP = 240 (measured: 2 Pixel cells ~180dp,
  3 ~275dp), `widget_kael_empty(_wide)` = waving kael-welcome + message. Art in
  drawable-nodpi: widget_kael_lit / _atrisk / _zero / _welcome, from
  chess-app-art\kael\final (the -512 files, kael-welcome.png), trimmed to the figure, max
  512px, alpha <= 3 cleared (~1 MB total). Kael: lit = played today, atrisk = count > 0 not
  played yet, zero = 0.
  LINKING: StreakWidget.code() makes the phone's own 32-hex code (SecureRandom, prefs
  "streak_widget"). LauncherActivity.getLaunchingUrl (CTC PATCH, re-apply after any
  `bubblewrap update`) appends `?ctcWidget=<code>` ONLY on a plain launch (never a share /
  Open with) and ONLY while a widget is placed and has no lastDate yet (codeForLaunch), and
  then sets two AlarmManager re-reads at +1 and +5 min. 404 = back to "not linked" (count and
  date dropped, code kept), so the next launch hands it over again. Not linked: "Open CTC and
  sign in to see your streak here" (es: "Abre CTC e inicia sesión para ver tu racha aquí"),
  tap opens CTC. REMOVED: StreakWidgetConfigActivity, activity_widget_config, widget_button,
  widget_styles, widget_accent/btn_text colours, the config strings, android:configure.
  WEB (js/firebase.js, v227 a1e84a1): widgetFromUrl reads ctcWidget at module load and takes
  it out of the address (history.replaceState); kv `widgetPending` (local) until signed in;
  adoptWidget() after pullOrBootstrap adds it to synced `widgetTokens` (newest first, max 5,
  a dropped code's doc deleted) and deletes the old single `widgetToken` doc. publishWidget
  writes every code, each on its own. deleteAccount deletes all of them. Profile's
  widgetHtml/bindWidget, the widget_* strings and .streak-widget CSS are gone. Rules unchanged.
  KNOWN LIMIT: if a second account signs in on a phone whose code another account already
  owns, its write is refused by the rules and the widget keeps showing the first account.
  Anyone who sends a CTC link with a chosen ctcWidget could read that person's count and
  last date (nothing else); Adrian was told and accepted.
  VERIFIED: `node tools/emu-verify-widget-link.mjs` 19/19 (real firebase.js + rules on the
  emulator: address cleaned, doc fields, sync, signed-out pending then sign-in, every code
  updated, take-over refused, cap 5); test:tree 475, test:rules 582, test:precache.
  API 36.1 emulator: all states (lit / atrisk / zero / 1 day / not linked / no code) x
  light/dark x es/en x 1x1, Kael 2x2, Kael 4x2 (24 screenshots); RELEASE build: widget tap
  launches `https://chesstrainingcenter.app/?ctcWidget=<code>` full-screen (no address bar),
  linked launch = plain URL, 404 resets, "Open with" a PGN still lands in Bases.
  PLAY: 8 (1.0.6) uploaded to Closed testing - Alpha (replaces 7), submitted for review
  2026-10-15. NOT YET VERIFIED: the install on Adrian's phone and a real signed-in link.

- **SAVED GAMES AND CHAPTERS REMEMBER WHICH WAY THE BOARD FACED (2026-10-15, v229).**
  Field `orientation` 'w'|'b' (optional; missing = 'w').
  BASES (IndexedDB): Analysis.saveToBase() stores `this.board.orientation`. New
  Analysis.openSavedGame(full, at) parses first, then setOrientation, then loadTree; used by
  Base.openGame, gotoAdjacentGame (arrows) and the 🔎 search-result open. A record with no
  field opens White at the bottom (before: whatever the last board faced). Not in the PGN:
  sharing/exporting a base as .pgn loses it.
  CHAPTERS (Firestore): addChapter/updateChapter (js/firebase.js) always write orientation;
  saveToChapter takes it from the board (title/order still from the stored row);
  addFromBoard passes the board's, addFromBase the base game's, renameChapter passes the
  stored one back (setDoc replaces the doc, it would be lost). openChapter() sets it before
  loadTree, so owner, student, homework (openForHomework) and a live follower (applyLive,
  on a chapter change only) all open it the teacher's way — Adrian chose that. A teacher
  flipping mid-broadcast is NOT mirrored (live/state has no orientation).
  firestore.rules chapters: hasOnly gains 'orientation' + `(!('orientation' in after()) ||
  after().orientation in ['w','b'])`; tests 53-56 in tests/rules/masterclass.test.js.
  DECIDED: flipping alone marks nothing changed — there is no change tracking; both 💾
  buttons are always offered, so flip + Save stores it.
  VERIFIED: test:rules 586/586, test:tree 475, test:precache OK. `node
  tools/emu-verify-orientation.mjs <outDir>` (new) 80/80, es/en x light/dark at 375 px, the
  app's own code against the Firestore emulator: base new/updated/old/arrows, chapter
  new/updated via 💾/rename/old, student by hand/homework/live follower; zero console
  errors; screenshots show Black at the bottom. NOT VERIFIED: a write to the real project
  (App Check 403 on localhost) — rules:deploy is Adrian's, before the push.

- **"SKIP THIS PUZZLE?" QUESTION ON PUZZLES (2026-10-15, v228).** The one click handler on
  `#puzzle-status` (Puzzles.init) now calls `Puzzles.askSkip()` before `nextPuzzle()` when
  the bar is not `.done` (= not solved and solution not shown); `nextPuzzle()` itself is
  untouched, so auto-advance, theme changes, homework start/exit and loading never ask.
  askSkip(): modal() with Kael `icons/kael/kael-encouraging.png`, `skip_confirm_q`, one of
  `skip_motiv_1..5` at random, tick `skip_dont_show` (+ `skip_dont_show_hint`), buttons
  `#skip-keep` "Keep trying" (primary, focused; a tap beside the box = keep) and `#skip-go`
  "Skip". Ticking sets kv `puzzleSkipConfirm` false. A second tap while open does nothing;
  if the puzzle changed while it was open, Skip does not skip again. Settings: new seg
  `#set-skip-confirm` under Sound, reusing sound_on/sound_off words. `puzzleSkipConfirm`
  (default true) is in SYNCED_KEYS (js/firebase.js) — Adrian chose sync, like soundEnabled.
  Applies to normal puzzles, the daily puzzle (DailyMissions.goPuzzle) and homework.
  NOT in Rush/Duel (own screens), NOT in Blindfold (Adrian: leave it), Sealed Moves has no
  skip (its Next exists only when done). Rating unaffected: markFailed already charged it.
  VERIFIED: `node tools/cdp-verify-skip-confirm.mjs <outDir>` (new) 66/66 at 375x667,
  es/en x light/dark: untouched asks, Keep/tap-beside keep, Skip loads exactly one; after
  a wrong move asks; solved / gold bar / solution shown / auto-advance / theme change do
  not ask; daily and homework ask; tick turns it off, Settings On brings it back, Off stops
  it. Zero console errors. tools/cdp-verify-puzzle-next.mjs now switches the question off
  first (its skip step would otherwise stop at it). test:tree 475/475, test:precache OK.
  NOT VERIFIED: the setting syncing between two real signed-in devices (App Check 403).

- **SIGN OUT MOVED FROM THE PROFILE TAB INTO SETTINGS (2026-10-15, v226).** Same move as
  Delete account (2026-09-01). `#profile-signout-btn` is gone from index.html and its two
  lines from `Profile.init`/`renderAccount` in js/app.js. openSettings()'s account block
  (shown only when `Auth.user`) now holds Sign out (`t('sign_out')`, plain `.btn`, full
  width, 8px gap) ABOVE Delete account; it closes the sheet, then `Auth.signOut()` after
  120 ms, like delBtn. Profile keeps `#profile-auth-btn` for signed-out users. The tour and
  tools/ never referred to the old button.
  VERIFIED: `node tools/emu-verify-signout.mjs <outDir>` (new; Firestore emulator + stand-in
  auth as `?uid=`, like emu-verify-pulso-ui) 32/32 at 375 px, es/en x light/dark: signed
  out no account block + Sign in on Profile; signed in Sign out above Delete account, not
  red, same width; tapping it closes the sheet, signs out once, Profile back to Sign in.
  Zero console errors. test:tree 475/475, test:precache OK.
  NOT VERIFIED: a real Firebase sign-out (App Check 403 on localhost); a real finger tap.

- **KAEL'S FACES WHILE HE SPEAKS (2026-10-15, v225).** A quote item may carry `mood`;
  `KaelQuotes.setFace(img, mood)` (js/app.js, next to KaelQuotes.show) swaps the picture to
  `icons/kael/kael-<mood>.png` and back to kael-bust when he stops. On Home: Home.say sets the
  ring (`#screen-home .home-kael-pic` only, NOT the simul banner's), endSay resets it. Off Home:
  show() sets `#kael-fab img`, hide() resets it in its 400 ms timer (after he has slid out).
  Unknown or no mood = bust. MOODS = happy, proud, encouraging, idea, thinking.
  WIRED: one mission done -> happy, all three -> proud (DailyMissions.complete), streak tier up
  -> encouraging (Streak.celebrateTier), not-an-opening -> thinking, lesson hint -> idea.
  FIXED PICTURES: calc and coord intros (90px) -> kael-thinking, history empty (96px) -> kael-wink;
  puzzle check-in and the GameReview portrait stay the bust.
  ADRIAN DECIDED (2026-10-15): the 32px calc line and the 42px tour circle KEEP the bust; the
  badge card (js/badge-card.js, its own card since before v224, no Kael on it) stays as is, so
  "badge -> proud" from the plan has nowhere to go and was dropped.
  ART: `tools/kael-art.py` MOODS table + face_crop(): the faces are 3/4 views whose ears and
  muzzle fall outside a circle, so each is cut to the smallest circle around his light skin
  above a per-face chin line (plus the glove for encouraging/idea/thinking, so the thumb, the
  finger and the chin hand show), x1.2 room for the gold ring. Shipped: happy/proud/encouraging/
  idea 144px (~27-30 KB), thinking 270px (46 KB), wink 288px whole drawing, not cut (62 KB).
  The other 5 faces (laughing, surprise, sad, facepalm, sleepy) are NOT shipped: nothing uses
  them. Adrian saw the pictures as files before they shipped.
  V224 DEFECT FIXED HERE: v224 redrew kael-bust/kael-welcome under the same names without
  renaming the art cache, so installed phones kept the OLD painterly Kael. sw.js: ART_CACHE
  'ctc-art-2'; ART_WAS = only 'ctc-art-1' (copies everything across) EXCEPT ART_REDRAWN (the
  two portraits, downloaded fresh). Next time art is redrawn under an old name: bump ART_CACHE
  and list the files in ART_REDRAWN.
  VERIFIED: `node tools/cdp-verify-kael-art.mjs <outDir>` 149/149 (each mood on Home and on the
  corner, back to the bust each time, the real callers, both intros, history, ES/EN x
  light/dark at 375, 4x close-ups; plus a seeded ctc-art-1 -> ctc-art-2 upgrade with the real
  sw.js); test:precache, test:tree 475/475, test:rules pass. Lesson hint and not-an-opening
  are verified by the shared show() path, not by playing a lesson.

- **NEW MODERN KAEL ART IN THE APP (2026-10-14, v224).** Adrian's 18 new drawings (1024 JPEG
  `.jfif` on #00FF00, in `C:\Users\Adrian\chess-app-art\kael\`, OUTSIDE the repo, canon in its
  KAEL-PROMPTS.md) replace the old painterly Kael. ONE TOOL: `python -I tools/kael-art.py`.
  It keys all 18 to transparent 1024 PNGs in `chess-app-art\kael\final\` (widget lit/atrisk/zero
  also as `-512.png`; `kael-widget-atrisk` is flipped, it was drawn mirrored; "model sheet" ->
  `kael-model-sheet.png`, reference only) and writes the 4 shipped files, sized from the largest
  display x 3: `icons/kael/kael-bust.png` 390x390 (99.8 KB), `icons/kael/kael-welcome.png`
  390x450 trimmed to the figure (107 KB), `icons/notif/daily.png` 192 (52 KB, from kael-notif),
  `icons/notif/daily-wide.jpg` 960x480 on the navy radial (44 KB). KEY: alpha from g-max(r,b)
  (28..110), green clamped to max(r,b), alpha median+1px erode; ship sizes median-smoothed and
  colour-rounded to fit ~100 KB (a 256-colour palette was tried: visible dither, rejected).
  File names unchanged, so NO code/CSS change: measured, the bust's head sits fully inside the
  inscribed circle (only the cloak's bottom corners are cut), the muzzle tip 92 px (of 1024)
  inside the edge. The old bust was opaque; the circles' own #f2eee6 ground now shows behind.
  `tools/resize-notif.mjs` now makes ONLY badge.png (it used to redraw daily* from the old
  Notification/Daily reminder.png, which is still on disk and would have put the old art back).
  VERIFIED: new `tools/cdp-verify-kael-art.mjs` 40/40 (level picker + tour offer = welcome; tour
  circle 42px, Home ring 44px, #kael-fab 48px, calc line 32px, calc intro 90px, history empty
  96px, a 130px portrait as GameReview uses, the invite's daily.png 110px; ES/EN x light/dark at
  375, 4x close-ups of each circle), cdp-verify-remind 44/44, test:precache, test:tree 475/475,
  test:rules pass. The faces went into the app in v225 (entry above);
  "worried" was never drawn.

- **HOME-SCREEN STREAK WIDGET, ANDROID PART (2026-10-14, app 1.0.6 / versionCode 8).**
  [2026-10-15: the Paste screen and the "lost code" state below are GONE - see the Kael
  widget entry above.] Built
  in `C:\Users\Adrian\chess-app-android`, which NOW HAS LOCAL GIT (no remote; android.keystore,
  local.properties, *.aab/*.apk and build/ are in .gitignore): baseline commit 4e4e2a3, widget
  commit 27783ca. Backup of the pre-widget folder: `C:\Users\Adrian\chess-app-android-backup-2026-10-14`.
  No web change, no rules change, no sw.js bump.
  FILES (all hand-added, NOT from Bubblewrap; `bubblewrap update` would wipe the manifest part):
  `StreakWidget.java` (AppWidgetProvider: REST GET inside goAsync(), 4 s timeouts,
  HttpURLConnection + org.json, no new library; caches count/lastDate in SharedPreferences
  "streak_widget"), `StreakWidgetConfigActivity.java` (Paste button, ^[0-9a-f]{32}$, Open CTC,
  Cancel), layouts `widget_streak` (1x1), `widget_streak_wide` (2x1, Android 12+ picks by size,
  older by OPTION_APPWIDGET_MIN_WIDTH >= 100dp), `widget_streak_empty`, `activity_widget_config`;
  `xml/streak_widget_info.xml` (updatePeriodMillis 1800000, resize horizontal, reconfigurable);
  `values/` + `values-es/widget_strings.xml`, `values/` + `values-night/widget_colors.xml` and
  `widget_styles.xml` (the web's light/dark tokens); manifest: receiver + config activity +
  INTERNET permission. LauncherActivity's "Open with" patch untouched.
  RULES IT APPLIES (same as Streak/isYesterday in js/app.js, phone's local day): lastDate >= today
  -> lit flame + count; == yesterday -> grey + count; older -> grey 0; no code -> "Open CTC and
  copy the widget code" (tap opens the Paste screen). 404 -> the code is forgotten, the cached
  count stays on screen grey, a tap opens Paste with "this code no longer works". Network
  errors keep the cache, so the day still turns over offline.
  ART: `res/drawable-nodpi/widget_flame.png` = streaks/flame1.png with its alpha-2 canvas
  cleared (it showed as a faint square on the light widget); `widget_flame_grey.png` = greyed
  copy. NEW FLAME ART REPLACES EXACTLY THESE TWO FILES (redo the alpha clean-up and the grey).
  TWO TRAPS FOUND: (1) text set only in a RemoteViews layout XML is inflated in the LAUNCHER's
  locale, so "no code" stayed English under a Spanish app locale; it is now set from code.
  (2) the browser API key's referrer lock does NOT block this read: a GET with no Referer
  returned 404/200 normally (measured).
  BUILD: `gradlew.bat assembleRelease bundleRelease` (PowerShell, JAVA_HOME = the bubblewrap
  JDK 17) OK; signed with the upload key (4D:50...) -> `app-release-signed-1.0.6.apk`,
  `app-release-bundle-1.0.6.aab` in the Android folder (password read by a script, never shown).
  VERIFIED on the API 36.1 emulator: all four states + "1 day/día" singular, 1x1 and 2x1,
  light and dark, English and Spanish (40 screenshots, cached states offline in airplane
  mode on a debug build); Paste: empty clipboard, non-code text, fake code (-> 404 path),
  Adrian's real code on the RELEASE build -> 14 days grey, matching the doc (lastDate
  2026-10-13 at 01:37 on the 14th); tap opens CTC full-screen; "Open with" a PGN still lands
  in Bases. The emulator proves NOTHING about the Play-signed install.
  NOT DONE: Play Console upload of 1.0.6 and the test on Adrian's phone.

- **HOME-SCREEN STREAK WIDGET, WEB PART (2026-10-14, v223).** [2026-10-15, v227: the
  Profile "Copy widget code" / "Make a new code" UI and the single `widgetToken` are GONE;
  codes now come from the app - see the Kael widget entry above.] Option "d" of the 2026-10-13
  investigation. The Android widget is built (entry above).
  DATA: `streakWidget/{code}`, code = 32 lowercase hex (16 random bytes), fields exactly
  owner, count, lastDate ('YYYY-MM-DD', the app's local day), updatedAt (server time).
  No streak yet -> lastDate '1970-01-01' (reads as "long ago": grey 0); the rules refuse null.
  RULES (firestore.rules, tests in tests/rules/streakwidget.test.js): get open to anyone with
  the code, list shut, create/update only by the signed-in owner (an existing doc's owner
  can't be swapped), the four keys only, count 0..30000, date pattern, updatedAt ==
  request.time; delete by owner (or a code never written).
  WEB (js/firebase.js): kv key `widgetToken` in SYNCED_KEYS; the sync hook calls
  publishWidget() on streakCount / streakLastDate / widgetToken, writes chained so the
  last asked lands last. getWidgetCode() (makes the code on first use, rewrites the doc),
  replaceWidgetCode() (deletes the old doc first). Auth.deleteAccount deletes the doc.
  UI (js/app.js Profile.widgetHtml/bindWidget, under "How the flame works"): Copy widget
  code (clipboard; on refusal the code is shown to select by hand), Make a new code
  (askConfirm), one line of help; signed out: a sign-in line. Strings widget_* in i18n.js.
  The widget reads https://firestore.googleapis.com/v1/projects/chess-training-center/databases/(default)/documents/streakWidget/{code}?key=<apiKey in js/firebase.js>
  — no login. App Check is NOT enforced for Firestore (measured 2026-10-13); IF IT EVER IS,
  THE WIDGET BREAKS.
  VERIFIED: test:rules 582/582, test:tree 475, test:precache. The app's own code against the
  Firestore + Auth emulators (firebase.js served pointed at them, a real emulator sign-in):
  doc written with exactly the four fields and count/date after a day earned, old doc gone
  after "Make a new code", unauthenticated GET 200 / LIST 403, doc gone after deleteAccount.
  375 px, es/en, light/dark, signed-out and copy-refused states, no sideways scroll.
  NOT VERIFIED LIVE: a write to the real project (App Check 403 on localhost); a real
  clipboard on a phone. Two devices that both make a first code at once: the later one
  wins in the account, the earlier doc is left orphaned (harmless, holds a count only).

- **BUTTONS USE THE APP'S FONT (2026-10-13, v222).** One rule in css/style.css, right
  under `body`: `button { font-family: inherit; }`. Size and weight untouched.
  WHAT WAS WRONG (measured by script on 42 screens and pop-ups, es and en): 64 kinds of
  button were `Arial`, not only `.btn`: plain class-less buttons (Settings choices, Play's
  colour, the Analysis symbols, ½-½), `.list-item`, `.tool-btn`, `.icon-btn`, `.pal-btn`,
  `.nav-back`, `.fr-more`, `.sheet-btn`, `.pw-toggle`, `.google-btn`, `.auth-link`,
  `.calc-chip`, `.annotate-btn`, `.read-fs-btn` and more. Ten kinds already inherited.
  On Android Arial and the app's font are both Roboto: this changes nothing on a phone.
  ADRIAN'S DECISION (2026-10-13, do not re-open): one rule for every button, not `.btn` only.
  SIZES: the old note that Segoe UI is wider than Arial was wrong for these labels: most get
  NARROWER (middle -2.8%, widest gain 3.7px on "½-½"); "My Masterclasses" no longer wraps.
  Buttons get 1-8px TALLER (Segoe UI's line height): mostly +5 (list rows) and +3 (`.btn`
  37 -> 40). No label newly cut, wrapped, off screen or past its row.
  VERIFIED: tools/cdp-verify-fonts.mjs 916 of 916 (the 420 box checks + 496 button checks:
  at every stop and on ten main screens and the student page, each button measured with the
  one rule switched off in the stylesheet and as shipped), 375 px, es/en, light/dark,
  screenshots looked at. students9 171, students8 133, students7 73, test:tree, test:precache.
  NOT REACHED: a real phone or an iPhone; signed-in-only pop-ups.

- **THE BOXES YOU TYPE IN USE THE APP'S FONT (2026-10-13, v221).** Two lines in
  css/style.css: `.input` and `.comment-box textarea` now carry `font-family: inherit`.
  WHAT WAS WRONG (measured, not guessed): Chrome gives a `<textarea>` and an
  `<input type="date">` `monospace`, and every other input and `<select>` `Arial`; nothing in
  the stylesheet said otherwise. So the homework note and date, the date of birth, the two
  history-filter dates and the Analysis comment box were in the typewriter font, and every
  other box was in Arial (on Android Arial and the app's font are both Roboto, so only the
  typewriter ones show on a phone). The v219 prompt said the title was in the app's font: it
  was Arial.
  ADRIAN'S DECISION (2026-10-13, do not re-open): every `.input` box AND the Analysis comment
  box, not the assign sheet alone.
  SIZES: font-size untouched (15px). With Segoe UI the boxes are a little taller in Chrome on
  Windows: one-line boxes 39 -> 42px, selects 41 -> 44, date 42 -> 44, the note 58 -> 62, the
  comment box 76 -> 82. No box is wider, no text is newly cut.
  VERIFIED: tools/cdp-verify-fonts.mjs 420 of 420 at 375 px, es and en, light and dark. It
  opens every such box (sign in, create account, the name pop-up, database list, game list,
  advanced search, trainer and its game picker, library and one opening, leaderboard,
  history filter, settings' reminder hour, the comment box, game details, the simul opening
  sheet, the assign sheet in its four kinds) and measures each one twice in the same page:
  with the rule rolled back (`font-family: revert`) and as shipped. students9 171 of 171
  (166 + 5 font checks), students8 133, students7 73, test:tree, test:precache.
  NOT REACHED: a real phone (headless Chrome on Windows only); the Friends search (hidden
  signed out, its font read where it hides); the password pop-up of "delete account" and the
  complete-your-profile pop-up (signed-in only, same `.input`).
  FOUND, NOT FIXED: every `.btn` button is `Arial` too, for the same reason (a `<button>`
  does not inherit the font and `.btn` sets none). Invisible on Android, visible on a
  computer. The trainer's database `<select>` cuts its "first create a database…" line at
  375 px, as it did before.

- **ENDINGS: EACH ENDGAME SHOWS HOW LONG AGO IT WAS LAST SOLVED (2026-10-13, v220).**
  In Learn > Endings > a category, every row has a dot: green = solved today or up to 60 days
  ago, orange = 61 to 90, red = 91 or more (until solved again), an EMPTY GREY RING = never.
  The days are on the right ("hoy", "12 d"), so colour is never the only signal. A line above
  the list explains the four. The six category rows add "· ● N en verde" / "N green".
  ADRIAN'S DECISIONS (2026-10-13, do not re-open): the colour rule above; design A (the dot)
  out of four shown; ANY practice that ends in success counts, wrong moves or not; the
  category rows show the green count; the legend says the days ("hasta 60 días · 61 a 90 ·
  91 o más · sin hacer"). "al día" was NOT used for the count: it reads as "per day".
  HOW: js/endgame-fresh.js (pure: `daysSince`, `freshState`, `mergeSolved`, `solvedNewer`).
  New synced key `endgameSolvedAt` = { endgameId: 'YYYY-MM-DD' }, the player's own calendar
  day, written ONLY by `Endgame.recordSolved` from `finishPractice(true)`; the walk-through
  and a failed practice never get there. `Endgame.solvedAt` is the copy in memory
  (`loadSolved`, called by `ensureLoaded` and after a sign-in). `openCategory` draws the dots
  and `#endgame-legend`; `showCategories` the count; `refreshLists` now also redraws the
  list of a category. A day in the future (another phone's clock) counts as today.
  SYNC: every other synced key is REPLACED by the account's copy on sign-in, which would lose
  one phone's work here. So js/firebase.js `DAY_MAP_KEYS`: on sign-in the phone's map and the
  account's are merged, the newer day winning per endgame, and a phone only SENDS the entries
  it has newer (setDoc merge writes those fields only). Sign-out wipes it with the rest of
  the kv store. No firestore.rules change (the users document has no field allowlist).
  Nothing was invented: everyone starts all grey.
  VERIFIED: tools/cdp-verify-endfresh.mjs 62 of 62 at 375 px, es and en, light and dark,
  screenshots looked at. REALLY TAPPED: menu, Learn, Endings, the category, the row, Walk
  through, Practice, Resign and its Yes, Back. The chess moves go through
  `Endgame.userMove`. SEEDED: the dates of 60, 61, 90, 91, 75 and 240 days ago. tests/unit/
  endgame-fresh.test.js (6: days 0, 1, 60, 61, 90, 91, 400, never, a future day, the merge).
  students8 133 of 133, test:tree 475, test:precache OK.
  NOT PROVED: the sync between two real phones (headless Chrome has no Firebase user); the
  merge rule is unit-tested and the redraw after a sign-in is checked by changing the stored
  dates under the open list.

- **STUDENTS: 🤖 POSITION - WHAT I TYPED STAYS THROUGH THE BOARD EDITOR (2026-10-13, v219).**
  On the assign sheet's Position, the title, the note, the due date and the computer's level
  are back in the sheet when I return from the board editor, from "Use for the homework" and
  from Cancel alike. No new words, no new style, no rules change.
  ADRIAN'S DECISIONS (2026-10-13, do not re-open): the LEVEL is kept; the COLOUR is kept only
  while the side to move is the one it was, and a new side to move is proposed as before.
  HOW: js/students.js `hwForm` (uid -> {title, note, due, color, level, turn}), beside `hwPos`,
  memory only, never written to the cache. `.hw-ps-set` closes the sheet with
  `{ setup: true, form }`; `teacherHwBlock`'s `give()` stores it; `assignSheet()` reads it
  ONCE when it opens on 'position' (the way back from the editor is the only way in on that
  kind) and deletes it on every open, so a sheet opened from the button always starts clean
  and nothing survives a Send. Reset in `onAuth` with the rest. js/app.js is untouched.
  VERIFIED: tools/cdp-verify-students9.mjs 166 of 166 (its 148 plus 18: the title and the
  note REALLY TYPED after a tap on the field, the date and the level set by script as native
  pickers; through Use, through Cancel, side to move changed, after Send, editor left another
  way, account changed; 375 px, es and en, light and dark, screenshots looked at). students8
  133 of 133, students7 73 of 73, test:tree 469, test:precache OK.
  SEEN, NOT TOUCHED: in the sheet the note (a textarea) and the date show in the browser's
  monospace face, the title in the app's face; headless Chrome on Windows, not checked on a
  phone. Still not kept: what was typed when Send itself fails (the sheet has already closed),
  for every kind, as before.

- **STUDENTS: 🤖 POSITION HOMEWORK - A POSITION OF MINE, PLAYED AGAINST THE COMPUTER, DONE WHEN THE GAME ENDS (2026-10-13, v218).**
  Session 3 of 3 of Adrian's plan: the plan is finished. The sheet has four buttons, two by
  two: 🧩 Puzzles, 📖 Chapter, ♟ Endgame, 🤖 Position. FIRESTORE.RULES CHANGED: the rules
  are deployed by Adrian before the push.
  ADRIAN'S DECISIONS (2026-10-13, do not re-open): (a) the sheet SENDS ME TO THE BOARD EDITOR
  and brings me back; no "give to a student" on the Analysis board; (b) NO CLOCK, NO UNDO in
  a homework game; (c) a game left in the middle does not count and STARTS AGAIN from the
  position (no resume); (d) DONE IS DONE: no playing it again as homework, I see the one game
  that finished it; (e) two by two, and the words as they are in js/i18n.js (`hw_pos_*`,
  `hw_what_position*`).
  WHAT IS STORED: kind `'position'`, params `{ fen, color: 'w'|'b', level: 0-7 }`. On the
  finishing write the student's phone adds `game: { outcome: 'win'|'loss'|'draw', end, moves }`
  - `end` is js/history.js's endReasonOf name (no timeout: there is no clock), `moves` is UCI
  with one space between, at most 800 plies (4,800 characters, `MAX_HW_GAME_CHARS` in
  js/firebase.js); a longer game sends `moves: ''` and the result still goes. Resigning
  before any move finishes it too ("Lost · Resignation · 0 moves", no game to open).
  THE RULES: `hwParamsOk` has a 'position' arm (the FEN regex is hwPzOk's), `hwGameOk(g)` is
  new (ONE regex for the moves), `game` is in the update's affectedKeys and is taken only on
  the write that moves status to 'done' - and a position can be finished ONLY WITH its game,
  so an app too old to know the kind cannot tick it off with "Mark done" (it gets "try
  again"). `saveHomeworkProgress` therefore never drops `game` on its retry.
  THE CODE: js/students.js `hwPosition(h)` (the params, checked), `hwGame(h)`,
  `hwPositionDetail(h)` (teacher only: `hwProgressHtml(h, forTeacher)`), `hwOpenGame(h, p)`,
  `hwOpenPosition(h)`, `hwPositionDone(id, game)`, `hwPositionBack(uid, fen)`; `hwPos` is
  uid → the FEN waiting to be sent (memory only). `openPage(p, r, { assign })` and
  `teacherHwBlock(..., assign)` reopen the sheet on a kind. The sheet resolves to
  `{ setup: true }` for the editor, as `{ go }` leaves for Puzzles. js/app.js:
  `Setup.open(fen, forHw)` (the uid; then the one exit is `#setup-homework`, and
  `Setup.done('homework')` refuses a position where the game is already over),
  `Play.startHomework({ id, fen, color, level })`, `Play.hwId`, `Play.begin(..., hwId)`,
  `Play.openHomeworkGame(...)`; `Play.finish` reports through `Students.hwPositionDone`;
  Back clears `hwId`. `Play.saveToHistory` now reads the game's fields BEFORE its first
  await (a homework game starts over an unfinished one in the same breath).
  VERIFIED: test:rules 566 of 566 (550 before, 16 new), test:tree 469, test:precache OK,
  tools/cdp-verify-students9.mjs (new) 148 of 148 with real taps and Stockfish answering,
  students8 133 of 133 and students7 73 of 73 (one expectation changed on purpose in each:
  "three buttons" is four; in students8 "fit on one line" is "same height, nothing cut"),
  students4 and 5 print what they print on a clean copy of main except the kinds list, which
  now ends in "position". 375 px, light and dark, Spanish and English, screenshots looked at.
  NOT CHECKED ON A REAL PHONE: all of it (headless Chrome has no Firebase user: "sent" is
  what the sheet hands to assignHomework, the write is proved by test:rules).
  KNOWN LIMITS: what is typed in title, note or date BEFORE "Set up the position" is lost on
  the way back (the hint says to set the position first); the editor's top bar still reads
  "Analysis"; the student's own done card does not show the result (the teacher's does).
  A TRAP FOR THE NEXT TOOL RUN: ports 8791 and 8792 were another session's servers on
  2026-10-13 - a scratch server for students4/5 must print that it is listening before its
  output is believed.

- **STUDENTS: ♟ ENDGAME HOMEWORK - ONE STUDY OF THE LEARN TAB, DONE WHEN A PRACTICE OF IT ENDS IN SUCCESS (2026-10-13, v217).**
  Session 2 of 3 of Adrian's plan. The sheet now has three buttons: 🧩 Puzzles, 📖 Chapter,
  ♟ Endgame. 🤖 Position (session 3) is NOT BUILT. FIRESTORE.RULES CHANGED: the rules were
  deployed by Adrian before the push.
  ADRIAN'S DECISIONS (2026-10-13, do not re-open): (a) ANY success counts, wrong moves on the
  way included - the practice takes a wrong move back and waits for the right one, so reaching
  the end already means every move was found; only resigning, or being mated after leaving the
  line, fails. It counts however he got to the study, from the card or through the Learn tab.
  (b) the words: "♟ Final" / "♟ Endgame"; pickers "Tipo de final" + "Final" / "Endgame type" +
  "Endgame"; card "Final: {name} — resuélvelo en Practicar" / "Endgame: {name} — solve it in
  Practice", for the teacher "… — hecho cuando lo resuelve en Practicar" / "… — done when they
  solve it in Practice"; button "Abrir" / "Open". (c) he ALSO sees tries and mistakes (he
  chose this over "done + time" knowing it needs two new stored numbers).
  WHAT IS STORED: kind `'endgame'`, params `{ endgameId }` (the `id` of js/endgames-data.js,
  `[A-Za-z0-9_-]{1,40}`). Two new progress fields, endgame only: `tries` (practices STARTED,
  increment(), only grows, ≤ 1000) and `mistakes` (wrong moves of the practice that solved it,
  0–999, accepted only on the write that moves status to 'done'). No Results button: nothing
  to list. The four older kinds are untouched ('text' and 'list' still stored and still work).
  WHERE: js/students.js - `assignSheet` (`.hw-eg` with two selects `.hw-egc` / `.hw-egs`; the
  second shows name — subtitle, because 54 of the 265 names repeat), `hwEndgame(h)` (null = the
  app no longer has that id: the card says so and gets "Mark done", through `markTextDone`),
  `hwEndgameDetail(h)` (" · 3 tries · 1 mistake", in `hwProgressHtml`, so both sides see it),
  `hwOpenEndgame(h)` (as Home's discovery card: showScreen('endgame'), category, openPosition),
  `hwEndgameTry(id)` and `hwEndgameDone(id, success, mistakes)`, `hwOnTask` (seconds count
  while that study is open in Learn). js/app.js - two lines only: `Endgame.startPractice()`
  calls `Students.hwEndgameTry`, `Endgame.finishPractice()` calls `Students.hwEndgameDone`.
  The walkthrough reaches neither, so it is neither a try nor a solve. js/firebase.js -
  `saveHomeworkProgress` takes `addTries` / `mistakes`; if a write with them is refused it is
  sent again without them (the count matters more than the detail). css: `.hw-sheet .hw-kind`
  is three columns - SESSION 3 MAKES IT FOUR BUTTONS, look at 375 px again (2 x 2 probably).
  TWO TEACHERS, SAME ENDGAME: one solve finishes both homeworks.
  VERIFIED: test:rules 550 of 550 (535 on main before + 15 new; about 90 s), test:tree 469,
  test:precache 59 files. NEW tools/cdp-verify-students8.mjs: 133 of 133, real taps, 375 px,
  ES/EN, light/dark, pictures looked at - what is sent has kind and id; the card lands on
  exactly that study; the walkthrough to its last move leaves it open with no try; a resigned
  practice leaves it open with one try; a practice with one wrong move finishes it (2 tries,
  1 mistake, "Homework done!"); a clean one reached through the Learn tab finishes another;
  an unknown id is ticked off; a Task, a List, a Puzzles and a Chapter sent before still show
  and still complete. tools/cdp-verify-students7.mjs 73 of 73 with ONE expectation changed on
  purpose ("the sheet has two buttons" is now three). students4 and students5 print what they
  print on main (differences: the random puzzle on the board, the kinds list now with
  'endgame', the cache name).
  NOT PROVED IN A BROWSER: the write itself (headless Chrome has no Firebase user) - the app
  builds the patch in `saveHomeworkProgress` and test:rules proves that shape is accepted.
  The Chapter in students8 is stood in for (`Masterclass.openForHomework` replaced, its last
  move reported by calling `hwChapterStep`). The two pickers are native selects: their values
  were set by script, CDP cannot tap an OS list. NOT CHECKED ON A REAL PHONE: the rook list
  (121 entries) in the phone's own picker.
  SEEN, NOT TOUCHED (existing behaviour): after a practice ends, failed or not, "Practice vs
  the engine" stays hidden - to try again he goes Back and opens the study again. A closed
  picker cuts a long endgame name short at 375 px; the open list shows it whole.

- **COORDINATES: WITH A RESULT UP, ITS LINE SAYS THE BEST OF WHAT IS NOW CHOSEN (2026-10-13, v216).**
  THE FAULT: after a run the best card (`#coord-best-row`) is hidden, because card and result
  together do not fit above "Otra vez" at 375x667; so moving the slider or changing the
  exercise said nothing about that length's best until the section was left and reopened.
  ADRIAN'S DECISION, from pictures of three options: (a) the result's line follows the choices
  - CHOSEN; (b) the card back as one row - measured: "Otra vez" ended at 694 of 667, and fitted
  only with the big score cut from 44 to 30 px, then exactly at 667 and 2 px under on a new
  best; (c) the result goes away at the first touch - the slider jumps 83 px up from under the
  finger and the score is lost. Do not re-open.
  WHAT CHANGED: js/coord-ui.js only. `finish()` keeps the run's `key` (`coordBestKey(mode,
  seconds)`) in `this.last`. `paintSetup()`: while the exercise and length chosen are the
  run's own (`chosen === last.key`) the line is exactly as at v214 (`coord_result_best` /
  `coord_result_best_n`); on any other it ends with the new `coord_result_best_at`
  ("Tu mejor marca en {t}: {n}" / "Your best in {t}: {n}"), `—` where there is no best. It
  repaints while the slider moves (`oninput`), as the rest of the set-up does. The clock /
  no-clock choice does not change the line: the best is by exercise and length, as the card.
  The gold card of a new best stays gold while the line follows: it is about the run.
  Nothing moves: "Otra vez" ends at 647 (649 on a new best) of 667, as before. No css, no html.
  VERIFIED: test:tree 469, test:precache 59 files, tools/cdp-verify-coord.mjs 287 of 287 (239
  + 48 new: slider really dragged with a result up, both exercises really tapped, a dash where
  there is no best, back on the run's choices the run's line, the longest line with three
  figures everywhere, "Otra vez" on screen each time), 375x667, ES/EN, light/dark, pictures
  looked at.
  THE TOOL, TWO THINGS TO KNOW: its `slide()` and `tap()` bring what they touch to the middle
  of the screen (main can scroll about 52 px there), so the new `line()` puts the page back
  at the top before it measures. And A FULL-TRACK DRAG AT THE USUAL PACE IS A FLICK: headless
  Chrome then gives no `click` to the next tap (pointerup arrives, click does not; same on the
  plain set-up at v214, so not from this change). `slide(frac, pace)` takes a slower pace for
  the long drags that are followed by a tap. NOT CHECKED ON A REAL PHONE: whether a very fast
  flick of the slider followed at once by a tap loses that tap there too.

- **STUDENTS: THE ASSIGN SHEET OFFERS PUZZLES AND CHAPTER; LIST IS INSIDE PUZZLES; TASK IS GONE (2026-10-13, v215).**
  Session 1 of 3 of Adrian's plan (decided 2026-10-13): everything he can assign is something
  in the app that the app itself checks. The sheet will end with four buttons: 🧩 Puzzles,
  📖 Chapter, ♟ Endgame (session 2, NOT BUILT), 🤖 Position (session 3, NOT BUILT).
  WHAT CHANGED: `assignSheet(p, r, kind0)` in js/students.js draws two buttons (`.hw-kind`:
  puzzles, chapter) and, inside Puzzles, a second switch `.hw-mode` with `data-v="puzzles"`
  ("Por tema y nivel" / "By theme and level", the old form, the default) and `data-v="list"`
  ("Elegidos por mí" / "Chosen by me", the old List block: the draft, Remove per row, n/20).
  Its look is the gold outline of `.seg.lib-first`, so the two rows do not read as one.
  THE STORED KINDS DID NOT CHANGE: "chosen by me" sends `kind: 'list'` exactly as before, and
  homework already sent as 'list' or 'text' shows, is played / ticked and reaches the finished
  strip as before. firestore.rules was NOT touched and still allows the same four kinds.
  `kind0` accepts 'puzzles', 'chapter', 'list'; anything else (the old 'text') opens Puzzles.
  EMPTY "chosen by me": the hint `hw_list_empty` says how to add puzzles and a button
  `.hw-ls-go` (`hw_list_go`) closes the sheet AND the student's page and goes to the Puzzles
  tab (the sheet resolves `{ go: 'puzzles' }`; `teacherHwBlock(p, r, closePage)` does the rest).
  `.hw-send-list` on the student's page stays and opens Puzzles > chosen by me.
  ADRIAN'S TWO DECISIONS (asked 2026-10-13): the labels above; Task removed NOW, not kept until
  session 3. So until sessions 2 and 3 ship there is no way to set work outside the app.
  i18n: new `hw_mode_theme`, `hw_mode_list`, `hw_list_go`; reworded `hw_list_empty`,
  `hw_list_n` ("Problemas elegidos (n/m)"); removed, after grepping, `hw_kind_text`,
  `hw_kind_list`, `hw_f_task`, `hw_need_title`. KEPT because the student's side still reads
  them: `hw_mark_done`, `hw_mark_done_confirm`.
  VERIFIED: 469 unit tests (469 before, none added), precache 59 files, new
  tools/cdp-verify-students7.mjs 73 of 73 with real taps at 375 px, ES and EN, light and dark
  (it serves the folder itself and uses Chrome ports 9100-9189). tools/cdp-verify-students4
  and 5 print the same as on main except, on purpose: students4 no longer sends a Task from the
  sheet (it reads the two buttons and the empty "go to Puzzles" instead; its shot 4c is now
  the empty "chosen by me"), students5 reaches the draft through Puzzles > chosen by me.
  HOW TO RUN 4 / 5 / 6: they need a server that DOES serve sw.js for their last, offline step
  (with sw.js refused they stop there with "caches is not defined"; that is the server, not
  the app). They open on the right tab by themselves (the seeds call `showScreen`).
  NOT VERIFIED: the write to Firestore itself (headless Chrome has no user) — what is checked
  is what the sheet hands to `assignHomework`, which is field for field what it was.
  REPORTED, NOT FIXED: (1) "Give to a student" in the puzzle review still wears the old List
  icon 🎯, as does "🎯 Send puzzle list (n)"; (2) the toast after "Give to a student" sits over
  that same button for 3.5 s; (3) tools/cdp-verify-students4 reads its bad-band toast with
  `.toast`, which matches nothing (the element is `#toast`), so that value prints as missing.

- **COORDINATES: A RUN FROM 30 SECONDS TO 3 MINUTES, AND AN EMPTY BOARD (2026-10-13, v214).**
  Two things Adrian could not do in the coordinates trainer (Learn tab), both now choices on
  its set-up screen and both remembered on the device (kv `coordPrefs`: `seconds`, `pieces`).
  THE LENGTH: a slider under the two Time buttons, 0:30 to 3:00 in steps of 30 s (six stops),
  in the look of Blindfold's (`.blind-time`, gold). The first button reads "Reloj: 1:30" and
  changes as the slider moves; it is saved when the finger lets go. "Sin reloj" STAYS; with it
  chosen the slider is dimmed, and moving the slider chooses the clock again.
  THE PIECES: "Con piezas / Sin piezas" (EN "With pieces / Empty board"), `Board.setPiecesHidden`.
  The right / wrong flashes and the lit square of "name" are on the squares, so they still work.
  THE RULES stay in js/coord.js: `COORD_SECONDS` 30 (shortest and default), `COORD_SECONDS_MAX`
  180, `COORD_SECONDS_STEP` 30, `COORD_LENGTHS`, `coordSeconds(v)` (anything else becomes the
  nearest stop, junk becomes 30), `coordNewRun({ seconds })` puts the length in the run
  (`run.seconds`, 0 with no clock), `coordBar(run, msLeft)` is the bar. The deadline and the
  bar both read `run.seconds`.
  ADRIAN'S FOUR DECISIONS (asked with pictures, 2026-10-13): steps of 30 s; "no clock" stays;
  ONE BEST PER LENGTH; the streak still asks for 10 right answers whatever the length.
  THE BESTS: `coordBestKey(mode, seconds)`. The 30-second keys are the old ones
  (`coordBestFind`, `coordBestName`), so nobody lost a best; ten new ones,
  `coordBestFind60` ... `coordBestName180`, each listed by name in SYNCED_KEYS (js/firebase.js).
  NO RULES CHANGE: /users/{uid} has no field allowlist (firestore.rules says why). The card
  reads "Tu mejor marca en 1:30" and follows the slider.
  ONE THING DONE TO MAKE IT FIT 375x667, NOT ASKED FOR BY NAME: with a result on the screen
  the best card is hidden and the result's line says it instead ("... · Tu mejor marca: 11",
  or "¡Nueva mejor marca!"). Without that "Otra vez" was 58 px below the screen. The groups on
  this screen also sit 6 px closer (`#coord-setup .option-group`). Measured: Start ends at
  640 of 667 on first open (550 before), "Otra vez" at 649 (638 before).
  VERIFIED: 469 unit tests (462 on main at v213 + 7 new in tests/unit/coord.test.js, now 23), precache 59
  files, tools/cdp-verify-coord.mjs 239 of 239 (143 before, all still there, + 24 new x 4):
  the slider really dragged to both ends and to 1:30, the real 30 seconds waited out once
  with every choice untouched, the 1:30 run checked by the DEADLINE THAT WAS SET and by the bar
  at half with 45 s left, the empty board, both flashes, the reload. ES/EN, light/dark, 375 px,
  pictures opened and looked at.
  THE TOOL moved to ports 9100-9189 / 8700-8789 (it shared emu-verify-simul's ranges), and it
  now switches off Kael's missions reminder (`DailyMissions.reminded = true`): that bubble
  comes once, 45 s after the page loads, over the lower choices, and swallowed a tap.
  SEEN, NOT CHANGED: after a run, the best of ANOTHER length is not on the screen until the
  section is opened again (the result stays up while the choices are changed, as before).
  One run of the tool logged a report-only "Framing 'https://www.google.com/'" CSP line: it is
  the App Check widget on localhost, not this code.

- **ANALYSIS: A GAME TAPPED IN THE SEARCH RESULTS OPENS ON THE SEARCHED POSITION (2026-10-13, v213).**
  Before, it opened on its last move like every other game. Now the board shows the same
  position before and after the tap, inside that game. Both lists: my own base and the Internet.
  HOW: `Analysis.loadTree(tree, ctx, at)` has a third, optional argument, the FEN that was on
  the board at the tap (read BEFORE the game is fetched). Only the two result taps pass it
  (`renderGameResults` for a base, `openMasterGame` for the Internet). `nodeAt(tree, fen)` in
  js/explore-index.js finds the node by POSITION (`fenKey`), never by move number: first on the
  main line (root included), else the first in a side variation, else null and the game opens
  on its last move with nothing said. Checked before choosing this: the index DOES match
  positions inside side variations, and a position can come back in one game.
  UNCHANGED, ADRIAN'S DECISION: the previous / next game arrows (`gotoAdjacentGame`) and the
  Bases tab's own list (`Base.openGame`) still open on the last move; so does everything else.
  No words, no style, no i18n.
  VERIFIED: test:tree 462 (5 new, nodeAt), test:precache 59. tools/cdp-verify-livesearch.mjs
  276 of 276 = 69 checks x en/es x light/dark at 375 px, real taps: from the start position,
  six moves in (engine on: it restarts on that position), by another move order, one Internet
  result, then ▶ plays the GAME's next move; Bases tab and its next-game arrow still on the
  last move. Screenshots opened: en-light and es-dark.
  FOUND: that tool was BROKEN on main (2 checks, then a crash, in each of its 4 runs) since
  the app starts on Home: it never went to the Analysis tab. Fixed in the tool (`CLEAN`); with
  only that fix main passed 204 of 204. One old check changed its expectation on purpose
  ("🔎 from the moves" now finds 2 games at 2...d6, not 1 at the mate).
  NOT VERIFIED: the Internet tap against the real Lichess (no account in the test browser;
  the tool answers Lichess itself with one made-up game, as cdp-verify-lichess.mjs does).
  NOT BUILT: keyboard arrow keys. The app has no arrow-key handling anywhere (grep `Arrow`
  in js/ finds only the board's drawn arrows), so there was nothing to keep working.

- **KAEL'S BUBBLE STAYS WHERE IT IS (2026-10-13, decision only, docs only, no version bump).**
  Adrian looked at pictures of three options and chose to LEAVE IT. Do not re-open this
  unless he asks. Nothing in the app changed; the `hush()` / "hide the bubble first" lines in
  tools/cdp-verify-blind-calc-next.mjs and tools/cdp-verify-blind-theme.mjs are still needed.
  MEASURED at 375x667, Spanish, light and dark alike, bubble shown through the real
  `KaelQuotes.show` / `DailyMissions.remindIfIncomplete`: the bubble is x 123-363, bottom at
  599, 82 to 136 px tall over the 201 quotes (median 100); the fab while he speaks is
  x 315-363, y 607-655. It covers 61-68% of `#play-start` (494-543, with the screen scrolled
  to its end) and `#play-history-btn`, 68% of `#trainer-start` (540-589), 52-68% of
  `#rush-start` (487-539), 40-68% of `#blind-go` (478-530), with the word on the button under
  it; 21-27% of `#puzzle-board`, 22-30% of `#blind-board`; on Sealed Moves it covers no
  control, only the writing area. WHEN HE SPEAKS UNASKED: the gold mission reminder once per
  opening, 45 s after start, 12 s, on whatever screen is up (not Home); Blindfold's greeting
  0.9 s after the first puzzle of an opening loads, 5 s, one time in four; praise / first
  mistake 4.5 s, one in four and never within 90 s of the last bubble; badges, streak tiers
  and missions done 4-5.5 s after the solve that earned them; the Simul line 15 s. A tap on
  him: 6 s. THE OPTIONS HE TURNED DOWN: (B) the corner moves to the top of the screen while
  he speaks (`#kael-corner.speaking { top: 6px; left: 10px; right: 10px; flex-direction:
  row-reverse }`), which frees every start button and board and covers the menu, the avatar
  and the first row of mode tabs instead; (C) unasked bubbles dropped while a start panel is
  up or Blindfold is memorising. SEEN IN PASSING, NOT TOUCHED: the quotes in
  js/quotes-data.js `QUOTES` are English only (`item.q`), so a Spanish player gets Kael's
  quotes in English.

- **BLINDFOLD: THE WHOLE SCREEN FITS 375x667 (2026-10-13, v212).** No spec; Adrian chose
  both from pictures of the real app (three options each, "leave it" included).
  - **The row under the board** (`#blind-actions`: Peek, Show solution, share) was 9 px
    under the screen in Spanish and 26 px in English, its buttons 37-40 px tall. Now: the
    board gives up width on SHORT phones only, `#blind-board { max-width: max(240px,
    min(560px, calc(100dvh - 346px))) }` in `css/style.css`: 321 px instead of 355 at
    375x667 (squares 44 to 40 px), full width from about 700 px of height up. The row is
    one line, 44 px buttons, `padding-right: 52px` for Kael (his corner slides in to
    x=315 when he speaks), share a 44 px square. Row at 602-646 (619-663 when the bonus
    line takes two lines). Rejected: hiding the mode chips during play.
  - **The start panel** (`#blind-start`): Go was 33 px under the screen on a first visit
    and 78 px under once the "last puzzle" line was there. Now `blind_explain` is ONE line
    in both languages (the "1 to 20" is the slider's to show), the slider's grey note is
    hidden on the start panel only (`#blind-start #blind-time-hint`; it still shows in
    the game), the rating card is one line, the gaps are smaller. Go at 509-561 on a first
    visit, 533-585 with a one-line "last puzzle", 552-604 with a two-line one (a miss):
    always above Kael's corner (y=607). Rejected: a floating Go. `blind_list_explain` is
    untouched (List mode already fitted: Go at 534-586).
  - **No JS changed**: css/style.css, one string in js/i18n.js, three tools.
  - **Verified:** `tools/cdp-verify-blind-calc-next.mjs` 116 of 116 (92 + 24 new: Go and
    the row on screen with nothing scrolled, 44 px, clear of Kael, all nine points
    reachable, and every tap on Go, Peek, Show solution, share and the List switch is now
    made WITHOUT scrolling; share is counted through a stub); cdp-verify-blind 154 of 154
    (its help-text check no longer asks for "1 to 20"); cdp-verify-blind-theme 54 of 54
    (its tapEl now hides Kael's bubble first); cdp-verify-puzzle-next 50 of 50; test:tree
    457 pass 0 fail; test:precache OK (59 files). ES and EN, light and dark, screenshots
    looked at.
  - **Found, not fixed (not this task):** Kael's speech bubble comes up at random at
    y=515-599, x=123-363, over whatever is at the bottom of the screen: the lower ranks of
    the board, and now Go (the other set-up screens anchor their start button at the same
    height by the same CSS rule, so probably theirs too: not measured). It goes by itself
    after its time and a tap on it closes it (`KaelQuotes`, js/app.js).
- **HOME: THE THREE SLOTS ARE ALWAYS THERE (2026-10-13, v211).** Spec:
  `docs/superpowers/specs/2026-10-12-home-tab-design.md`, decision a item 3 (rewritten).
  The block between "Hoy" and "Descubre" is now "Tu entrenamiento" / "Your training" and
  ALWAYS shows homework, book, game, for everybody; it is never hidden. An empty slot is an
  invitation: the same `.home-row`, class `invite`, `data-invite` saying which, and a navy
  `.home-row-go` button where the arrow is; the whole row takes the tap and opens Students,
  Read or Play. `homeBlock()` in `js/home.js` returns `{ rows }` (three, always); `kind`,
  `bestStreak`, "Continuar" and the first-time "Empieza por aquí" block (lesson, play, tour)
  are GONE, with their i18n keys (Adrian's four decisions, asked with pictures). The empty
  homework slot has five reasons, first that fits: `signedout`, `pending` (a teacher's
  invitation waits: "{name} quiere ser tu profesor"), `idle` (a teacher, nothing open),
  `teaching` (students of my own, no teacher: "Tus alumnos"), `noteacher`. Words: `home_next`,
  `home_inv_*` in `js/i18n.js`. An invitation becomes the real row on Home's next draw
  (`Home.refresh`, `Students.onHomework`); nothing new listens.
  - **Measured at 375 px:** each row is 61 px; "Descubre" now starts at y=657 for everybody
    (415 when the section was hidden): off the first screen at 375x667, its top showing at
    375x812. Moving it above the three rows was put to Adrian with pictures on 2026-10-13:
    he keeps this order ("Tu entrenamiento" above, "Descubre" below). Closed, no code
    change; the measurements of the other two orders are in the spec's section 6.
  - **Verified:** `test:tree` 457 (homeBlock: every combination), `test:precache` 59 files,
    `tools/cdp-verify-home.mjs` all checks, ES/EN, light/dark, 375x667 (+ one picture at
    812), screenshots opened. Signed in is `Auth.user` set BY HAND and Students' lists set
    by hand: no real account, no real teacher, no real phone.
  - **The tool's ports:** `cdp-verify-home.mjs` draws its random ports from the same ranges
    as `emu-verify-simul.mjs`; with that one running, pass `CDP_PORT=9212 WEB_PORT=9062`.
  - **Still owed, not touched:** a saved SIMUL game still shows in the game slot with the
    engine's robot icon (owed since v205).

- **BLINDFOLD AND SEALED MOVES: THE NEXT BUTTON (2026-10-13, v210).** No spec; Adrian chose
  from measured pictures (today and two mock-ups of each screen, 375 x 667, light and dark).
  - **Measured before (Spanish, same in dark).** Blindfold: `#blind-next` was 37 px tall and
    100 wide in the row UNDER the board, at 733-770 px while solving and 750-787 after a
    solve: off a 667 px screen, 115-132 px of scrolling away. The board itself ended at 723
    (56 px off) and, during the opening look, at 793 (126 px off, almost three ranks), because
    the four-line explanation and a 70 px countdown row stood over it. Kael covered nothing.
    Sealed Moves: `#calc-next` was already 44 x 197 at 609-653, on screen, beside Kael.
  - **Adrian's three answers.** (a) Blindfold: option C, the Puzzle design AND the board made
    to fit. (b) Sealed Moves: same place, gold, with the arrow; NOT moved into Kael's line
    (mocked: the text wrapped and the board lost 8 px) and NO skip added. (c) Blindfold's Next
    stays a skip while the puzzle is in play, as it always was.
  - **Blindfold, built.** index.html: `#blind-status` now holds `#blind-status-text`, then
    `#blind-countdown` (moved in from its own row), then `#blind-next` (out of
    `#blind-actions`), `<span data-i18n="next_puzzle">` plus " ➡". css/style.css: the
    `#puzzle-status` rules are shared (`#puzzle-status, #blind-status` and so on);
    `#blind-status .blind-countdown` is the 30 px number; `#screen-blind.playing > p.hint`
    hides the explanation. js/app.js `Blind`: `setStatus` writes the span (the one direct
    write in `nextPuzzle` goes through it now); `setDone(on)` toggles `.done`, false in
    `nextPuzzle`, true in the solve branch of `userMove` and in `showSolution`; `go()` and
    `showStart()` put and take `.playing` on `#screen-blind`; ONE click handler on the bar
    in `init`, as on Puzzles. Do not add an onclick to `#blind-next` itself.
    Now: the board ends at 628 px (ES) to 645 (EN, a two-line bonus) memorising, solving and
    solved; Next is 44 px tall at 154-198.
  - **Sealed Moves, built.** `#calc-next` holds the span and " ➡"; css `#calc-next` is gold
    (`var(--gold)`, `#0b1526`). Nothing in js/calc-ui.js changed. `js/i18n.js` untouched.
  - **Verified.** `node tools/cdp-verify-blind-calc-next.mjs <outDir>` (new; ports 9100s and
    8700s): 92 of 92 in ES and EN, light and dark: words, 44 px, colours, button and whole
    board on screen with nothing scrolled while memorising, solving and solved, Kael not over
    it, a real tap loads exactly one exercise; a wrong move, a skip, a peek, the solution,
    auto-next, List mode; hand in then next, a failed hand-in, the solution, auto-next.
    cdp-verify-puzzle-next 50 of 50 (Puzzles unchanged), cdp-verify-blind 154 of 154,
    cdp-verify-blind-theme 54 of 54, test:tree and test:precache pass.
  - **Tools repaired on the way.** cdp-verify-blind, -blind-theme and -calc moved to ports
    9100s / 8700s (they sat on the simul tool's). cdp-verify-blind had been failing on main
    since v180: it seeded `Puzzles.autoNext` (Blindfold has its own) and expected the old
    "Change mode or time" wording; both corrected, and it reads `#blind-status-text`.
  - **Still owed / reported, not fixed.** (1) cdp-verify-calc is 276 of 280 on untouched
    main too: "a plain solve pays +1, less than the perfect +1" fails in all four runs (both
    round to +1 for the puzzle it picks). A tool or rating-rounding question, its own task.
    (2) In Blindfold, Peek and Show solution are still half under the fold at 375 x 667 (the
    row is at about 636-676). (3) The start panel's Go button is at 648-700, 33 px under a
    667 px screen. (4) cdp-verify-premove and cdp-verify-swipe-modes were not re-run; they
    find `#blind-next` and `#blind-countdown` by id, which are kept.

- **SIMULS, CONVERSATION 8 OF 8: WATCHING, THE LINK, KAEL (2026-10-13, v209).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 8, the
  LAST one: the spec's plan is finished. `firestore.rules` untouched (the read rule
  already let everyone in `cls` read a board). `js/simul-ui.js`, one function in
  `js/firebase.js`, the words, three elements in `index.html`, the tool.
  - **Adrian's four answers** (asked with four measured pictures; he took all four
    recommendations). (a) "Otros" is a THIRD BUTTON in the row under the student's board
    (`#simul-others`), which opens a sheet listing the other boards; not a strip of tiles
    (75 px, and it would listen to every board all game). (b) A student watching a
    classmate is TOLD when their own board wants them and goes back themselves: the move
    sound, and the way back (`#simul-mine`) turns primary and says "● Te toca · Volver a
    mi tablero" with the row to itself. Nothing jumps. (A toast was built and taken
    out: at 375x667 it lay exactly on that button and swallowed the tap for 3.5 s.) (c) Somebody with no
    invitation reads one of two sentences in Students (`#stu-simul-note`): their own
    teacher's link, "No tienes ninguna invitación de Marta ahora…"; anybody else's, "Este
    enlace es de una simultánea para los alumnos de un profesor. No eres alumno suyo en la
    app." No name for a stranger, no read, nothing about whether a simul exists. (d) Kael
    speaks in a CARD IN THE PAGE (Home's `.home-kael` bubble): at the top of the teacher's
    setup the first time, above a student's first invitation in Students, each with
    "Entendido"; where the banner arrives he says one line where he always speaks (his
    bubble on Home, his corner elsewhere, which is at the bottom and the banner at the
    top) and a tap opens the explanation. "¿Cómo funciona?" stays afterwards for both.
  - **Watching** (`SimulUI.wOpen / wBoard / wStop`): the student's own board stays
    `sOpen`; a watched board is drawn over it by the same `renderGame(boards, own)`. A
    watched board has no `me`: it is shown from its STUDENT's side (`pov`), nothing on it
    is live, `onBoard()` returns it so every writer stops at `!g.me`, and `referee`,
    `claimFlags` and `keep` never see it (they walk `sBoards`/`tBoards` only). The line
    above says "Luis · Juega Marta" or the result in the third person (`watchLine`); the
    line below says "Estás mirando el tablero de Luis. Solo se puede mirar." (or "Solo
    mirar · Tu profesor juega sin: …"). `wants()` is what my own board asks of me:
    'move', 'draw', 'over' (an ending I have not seen), or nothing.
  - **What it costs, MEASURED** (the tool's counters, Ana's phone): opening the list is
    ONE READ FOR EVERY BOARD THAT NAMES HER in `cls`: this simul's, her own included, and
    boards of OLDER simuls that still name her (they are read and not listed: same
    teacher AND same `invitedAt` as her own board is "this simul"). 5 reads with three
    boards and two old ones, 12 with ten boards and the same two; plus 1 read a classmate for the public
    profile row (`fetchLeaderboardByUids`, kept in `SimulUI.mates` while the app stays
    open); then 1 read a move on any of them while the sheet is open. `watchSimulClass`
    runs ONLY while the sheet is open. Watching one board is `watchSimulBoard(id, cb)`
    (new, `js/firebase.js`: one document, no part of the section's memory): 1 read to
    open, 1 a move. Closed, nothing.
  - **The link** (`SimulUI.follow`, `boot()` after `PulsoUI.boot()`): `?simul=<teacherUid>`
    is read once and taken out of the address. It waits until Students has ASKED THE
    SERVER who my teachers are (`Students.cachedAt` later than the app's start: what the
    phone remembers may be old) and my listener has heard from the server
    (`SimulUI.sLoaded`). Invited: the card in Students, or the board if the game is on;
    the link never joins. No invitation / not their student: (c) above. Signed out:
    Students' "sign in", followed after it. The teacher's own: their waiting room and
    "Este es tu propio enlace". With a Duel link in the same address Duel keeps the
    screen: an invitation is the banner there, a dead link is a toast.
  - **"📤 Avisarles"** in the waiting room, under Start (`tell`, as `PulsoUI.tell`): the
    share sheet, or the text copied: "Marta te invita a una simultánea en Chess Training
    Center. Tienes 10 minutos para unirte: https://chesstrainingcenter.app/?simul=<uid>".
  - **Kael is remembered** in `localStorage` `simulKael` (`{t,s,b}`: teacher, student, his
    one line at the banner). Not synced: a second phone explains once more.
  - **A change to what was there**: a student's row is no longer hidden when their game
    is over if the simul has other boards (it keeps "Otros"); five old checks that said
    "the row is gone" now say "nothing to play with on it".
  - **Measured at 375x667**, a clock, the opening beside the title and a handicap line:
    the row is 544-579 px (draw 92-170, resign 180-278, others 288-365), no word cut, and
    the page exactly fills the screen's room: THERE IS NO SPARE HEIGHT LEFT on the
    student's board. While a draw offer is answered "Otros" is its sign alone. The list
    with nine classmates is a sheet from 100 px to the bottom, rows of 57 px, scrolling
    inside itself.
  - **The tool**: round 9, before 6c. 1,141 checks (913 before), about 50 minutes for the
    four passes (its own time limit is now 60). Its Firestore stand-in counts one
    document's listener and counts `getDoc` apart (`gets`); its Auth stand-in can start
    signed out (`&out=1`, then `window.__signIn()`); `phone.open(query)` opens the app on
    a link with no reload; `load()` marks Kael as heard so rounds 1-8 are as they were.
    A refusal by the rules is asked for: a signed-in user who was not invited cannot read
    a board nor ask for the boards that name Ana.
  - **Not asked for**: none built. HANDOVER's "Still to do" had no simul line to strike.
    **Still owed**: nobody has run a simul on a real phone or against the real database
    (v203 to v209), the link has not been opened from WhatsApp, and the three readings
    of conversation 6 are still unasked. Kael's "next mission" bubble over a live simul
    board is still its own task.
- **PUZZLE TAB: THE NEXT BUTTON (2026-10-13, v208).** No spec; Adrian chose from four
  measured mock-ups. The small arrow at the end of `#puzzle-actions` is gone. `#puzzle-next`
  now lives INSIDE `#puzzle-status` (index.html), at its right end, beside a new
  `#puzzle-status-text` span that `Puzzles.setStatus` writes to. While a puzzle is in play it
  is a navy `.btn.primary` reading "Siguiente ➡" / "Next ➡" (it skips). Once the puzzle is
  over (solved, or the solution shown) `Puzzles.setDone(true)` puts `.done` on the bar: the
  whole bar turns gold and all of it is the tap target; `loadPuzzle()` takes it back.
  - **Adrian's four answers.** (a) Option D, the status bar, not a button under the board.
    (b) The word is "Siguiente" / "Next", so the existing `next_puzzle` key is reused and
    `js/i18n.js` is untouched. (c) Blindfold and Calculation: LATER, their own task.
    (d) Skip stays a button, in the same place as Next, navy until the puzzle is over.
  - **Why not under the board (measured, 375 x 667, Spanish).** After a solve the board ended
    at 666 of 667 px, so a button under it sat at 674-722, off the screen; and on a taller
    phone Kael's praise bubble covers half of it. The top row with words cost 9 px and pushed
    the board 8 px off. The bar costs nothing: it gave up its own padding and 2 px of margin
    (`#puzzle-status` in css/style.css), and the board now ends at 646 while solving and 665
    after a solve.
  - **One click handler, on the bar** (`Puzzles.init`): a tap on the button bubbles to it, so
    two `nextPuzzle()`s can never run. Do not add an onclick to `#puzzle-next` itself.
  - **Verified.** `node tools/cdp-verify-puzzle-next.mjs <outDir>` (new; ports 9100s and
    8700s, clear of the simul tool): 50 of 50 in ES and EN, light and dark: words, 44 px,
    button and whole board on screen before and after a real solve, colours, a real tap loads
    exactly one puzzle; a wrong move, the solution shown, auto-next, a theme, the daily puzzle,
    a band homework and a hand-picked list. test:tree 453 and test:precache 59 pass.
  - **Not done, on purpose.** `#blind-next` and `#calc-next` are unchanged (later task).
    `tools/cdp-verify-premove.mjs` was not re-run (it finds `#puzzle-next` by id, which is
    kept). Reported, not fixed: in Spanish the "+84" rating badge wraps `#puzzle-progress`'s
    row onto a second line after a solve and moves the board down 27 px; and in homework mode
    the `#puzzle-hw` bar already puts the bottom of the board below a 667 px screen.
- **SIMULS, CONVERSATION 7 OF 8: OPENING AND HANDICAP (2026-10-13, v207).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 7.
  `firestore.rules` and `js/firebase.js` untouched (`sendSimulInvite` already took a
  `fen` and an `op` per board). This is `js/simul-ui.js`, five small pure functions in
  `js/simul.js`, the words and the tool. No "Otros tableros", no link, no first-time
  explanation: 8.
  - **Adrian's four answers** (asked with measured mock-ups; he took all four
    recommendations). (a) The opening picker and the handicap board each open in a
    SHEET, not inline: inline, three ticked students put Invite at 2,427 px; with
    sheets the setup is 837 px tall with three students and no clock (987 px with a
    clock chosen). (b) A handicap FOLLOWS the teacher's colour: it is kept as White's
    squares (`SimulUI.handi`, uid -> ['a1','d1']) and mirrored for a board where the
    teacher is Black (`handicapSquares`), so the queen stays the queen and a1 becomes
    a8; "same for all" is right across White and Black boards for the same reason.
    (c) The student reads it in words under the board (`#simul-less`: "Tu profesor
    juega sin: torre de a1"); the teacher, who has no height to spare, gets the missing
    pieces as small pictures in the line above the board (`.simul-less-ico`, a tap says
    it in words; past four pieces it is a count), and the opening's name sits beside the
    Simultáneas title on both phones (`#simul-theme`, a tap says the moves). (d) Opening
    and handicaps are kept while the app stays open, like colour and clock; nothing is
    saved to the phone.
  - **What it cost at 375x667: nothing.** Measured by the tool in all four passes, with
    and without a clock: strip from 119 px, status 194-225, board 231-586, End ends at
    666 px, exactly as before. The marker's "−" is drawn by the stylesheet (`data-n`),
    so `#simul-status`'s text is what it was.
  - **Setup** (`renderSetup`): a ticked student's second line says "Tablero completo" or,
    in gold, "Sin: dama, torre de a1", beside a "Ventaja" button; an "Apertura" row
    under the students shows the name and the moves in words. `plan(roster)` is the one
    place that works out what would be sent (colour, start position, the opening
    replayed on it) and both the setup and `invite()` use it. A board that does not hold
    is said above Invite, which stays off: "En el tablero de Luis no se puede jugar O-O
    sin la torre de h1." The piece is named only when giving that ONE piece back would
    cure it (`problem`); otherwise "con esa ventaja". A line that ends the game on a
    handicap board is said too.
  - **The opening sheet** (`openingSheet`): one board (`Board`, 272 px) to play the moves
    on, "Deshacer", "Sin apertura", and under it the named openings, searchable, each
    name ONCE at the fewest moves that earn it (`ecoNames`); a tap loads the moves onto
    the board and the teacher can play on from there. A move that would end the game is
    refused and said; at 20 moves a side the board stops. A line with no name in the
    list is "Tus jugadas" in the setup and its moves ("1. a3") on the game screen.
  - **The handicap sheet** (`handicapSheet`): the Setup Position board (`editorMode`),
    from the teacher's side of THAT board; a tap takes one of their pieces off, a tap on
    the empty square puts it back, the king is refused. "Tablero completo", "Igual para
    todos" (every ticked student). All of it fits 375x667 without scrolling.
  - **A FINDING: `replayOpening` (by SAN) is the wrong tool on a handicap board.** The
    full board spells a move "Nbd2"; on a board without the g1 knight the library reads
    that as no move at all, so a playable line would be refused. `replayOpeningOn(fen,
    op, sans)` replays by squares instead (`op` as the full board packed it) and gives
    the same answers; `openingSans(fen, op)` reads a stored opening back as the full
    board spells it, which is what `classifyOpening` needs. Both unit-tested.
  - **Who moves first**: nothing new was needed. With an odd number of opening moves
    the student moves first where the teacher is White; with a clock the student's
    clock is the one running at move 0 on both phones and the teacher's stands still
    (the tool reads both twice, two seconds apart).
  - **Saved games**: `record()` was already right. A handicap + opening game opens in
    Analysis from the handicap position with the opening from move 1 on both phones,
    and History still names the opening.
  - **The tool**: round 8, before 6c. 913 checks (713 before), about 40 minutes for the
    four passes. A trap it met: a builder passed to `modal()` runs BEFORE its box is in
    the page, so `$('id')` finds nothing there; look inside the box.
  - **Not asked for, said plainly**: none built. **Still owed**: nobody has set an
    opening or a handicap on a real phone (v207); the emulator proves the rules, not
    the live project. The three readings of conversation 6 are still unasked.
- **SIMULS, CONVERSATION 6 OF 8: THE CLOCK (2026-10-13, v206).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 6.
  `firestore.rules`, `js/simul.js` and `js/firebase.js` untouched: the clock was already
  in the rules and the functions; this is the screens (`js/simul-ui.js`), their words
  and the tool. No opening, no handicap: 7. No "Otros tableros", no link: 8.
  - **Adrian's four answers.** (a) Where the clocks go: "Opponent clock on top, teacher
    clock under" (his own words, neither of my two proposals). So `#simul-clock-them` is
    at the end of the line above the board (`#simul-top` wraps `#simul-status`) and
    `#simul-clock-me` is the first thing in the row under it (`#simul-ctl`). The same on
    a student's board. (b) A tile shows the clock RUNNING on its board: the teacher's own
    in gold while it is their move there, the student's in grey otherwise, "½ " in front
    while a draw is offered. (c) Under a minute of the teacher's own time on a board that
    is not on screen: the tile turns red (`.low`) and scrolls into view, and one toast
    per move says "Te queda menos de 1 minuto en el tablero de Luis." No sound, no jump.
    (d) The extra minutes start at the suggestion and follow the ticks until the teacher
    touches − or +: 2 minutes a board to the nearest 5 (1 board 0, 2-3 → 5, 4-6 → 10,
    7-8 → 15, 9-10 → 20).
  - **What it cost at 375x667: nothing.** With a clock the status line is 31 px high
    whatever it says (a long sentence takes two 13 px lines in the same box), and the
    switch's words shorten to "Auto" (`.simul-ctl.timed`) to make room for the clock in
    the row. Measured by the tool: strip from 119 px, End ends at 666 px, nothing
    scrolled. With no clock the screen is exactly as it was.
  - **Setup** (`renderSetup`): under the colour, "Sin reloj" and 10+5, 15+10, 30+20, 60+30
    (`#simul-tc`, from `SIMUL.CLOCKS`), a line saying what the control means, and, with a
    clock, "Tu tiempo extra": − / "+5 min" / + (`SimulUI.clock`, `SimulUI.extra`; null
    means "the suggestion"). No clock is the choice until the teacher makes one. The
    invitation's banner and card say "Reloj 15+10 (tu profesor: 5 min más)" or "Sin reloj"
    after the colour (`clockLine`).
  - **The clocks** are painted every second OUTSIDE the keyed block of `renderGame` (text
    and three classes: `run`, `low` under 20 s as in Play, `unsure`), from `timeLeft()`
    against `simulServerNow()`. `sync()` now asks for the server clock while any timed
    game is live. A phone that has not measured yet shows the clock faded and claims
    nothing.
  - **The flag** (`claimFlags`, from `sync()`): either phone claims 300 ms after it thinks
    the flag fell (an early claim is refused by the rules) and tries again after 3 s if
    the game is still live; the second phone's refusal is silent. Result line "Ana se
    quedó sin tiempo. Ganaste." / "Se te acabó el tiempo. Gana Ana."; tile "⏱ Ganada" /
    "⏱ Perdida"; the loser's clock reads 0:00. A move the phone knows is late, or one the
    rules refuse on a clock while the time is gone (the phone waits a second for the
    listener's copy before deciding), is said as "Se te acabó el tiempo antes de que
    llegara esa jugada." and comes off the board.
  - **History**: a timed game carries `timeControl` and the PGN `[TimeControl "600+5"]`,
    and the card shows "Simultánea · 10+5". A game lost on time is kept as ending when the
    flag fell (the last move's stamp plus what the loser had left), not at the last move.
  - **Readings of mine Adrian has still not been asked about** (the rules enforce all
    three): a move at the exact instant the time runs out is too late; a flag is a loss
    whatever the other side has left; the draw-offer limit is 10 moves by each side.
  - **Limits, said plainly.** The teacher's phone claims a student's flag only while the
    Simultáneas screen is open; if the teacher is elsewhere and the student's app is
    closed, a fallen flag waits until one of them comes back. Light mode: the running
    clock is gold on pale gold, as Play's is. **A defect found and NOT fixed here** (not
    asked for; offered as a separate task): Kael's "next mission" reminder comes 45 s
    after the app opens and can cover the corner of a live simul board and its buttons
    for 12 s; `KaelQuotes.show()` is silent over Rush and Duel but not over a simul. The
    tool switches the reminder off for itself (`app.DailyMissions.reminded = true`).
  - **Tool.** Round 7 of every pass: the setup, three invitations at 15+10 / 30+20 / 60+30
    with +5 / +15 / no extra minutes and one with no clock (stored base, inc, tMs, sMs),
    a simul at 10+5: both clocks on both phones against `timeLeft()`, a move settled to
    the millisecond, Luis's phone 7 s fast and reloaded, the low-time warning, a flag on
    each side waited out for real (the stored time seeded low, then 5-6 s waited), a move
    made with no signal that arrives after time, what each phone kept. A stopped tap now
    leaves a picture (`STOPPED-<who>.png`). About 32 minutes.
  - **Verified:** `test:tree` 453, `test:rules` 535, `test:precache` 59 files and 142 art,
    the tool 713 of 713 (573 before, 35 new in each pass) with no console errors, 244
    screenshots (about 14 opened and looked at: the setup, both boards, the low tile, the
    flags, the card, History; es/en, light/dark). NOT checked: a real phone, the live
    database, more than three real boards, a clock over 100 minutes on the teacher's row
    (60+30 with 60 extra: measured only in a mock-up, 74 px wide), sound.

- **SIMULS, CONVERSATION 5 OF 8: ENDINGS AND KEEPING THE GAMES (2026-10-13, v205).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 5.
  `firestore.rules` untouched (every ending was already in the rules). Conversation 4
  (`571179c`) was pushed at the start of this one, after Adrian said so. No clock: 6.
  - **Adrian's four answers ("follow your recommendations").** (a) A game "not finished"
    IS saved to History, a void board is NOT. (b) A student away from the board is told:
    a banner and a card "Tu partida con Ana terminó", "Entendido" / "Ver el tablero", for
    an hour. (c) Back on a board in play still asks nothing. (d) History shows the
    opponent's name where the engine's level is, with "Simultánea" on the card's last line.
  - **The row under the board** (`#simul-ctl`, `renderGame`): `#simul-draw`, `#simul-resign`,
    `#simul-accept`, `#simul-decline` join the switch and skip. A student's row (`.solo`)
    is draw + resign with their words. The teacher's row has no room for another line at
    375x667, so there the two are signs only (½ and Play's flag, aria-label and title carry
    the word) and the switch's text became "Salto automático" / "Auto-jump". An offer from
    the other side puts Accept / Decline in the row in place of draw, resign and the
    switch; the status says "Te ofrece tablas"; the student's tile says "¿Tablas?".
    `SimulUI.resign()` asks first (`askConfirm`, the name escaped) and fixes the board
    before the question; `offer()`; `answerDraw()`. All through `write()`: they need a
    signal. The draw button is never `disabled`: when `mayOfferDraw` says no it is `.off`
    and a tap says why (an offer standing, or how many moves to go).
  - **Words.** `resultLine`: resign ("Ana se rindió. Ganaste." / "Te rendiste. Gana Ana.")
    and agreed ("Tablas de mutuo acuerdo."); `tileResult`: "Se rindió" / "Me rendí". Flag
    still falls through to `simul_res_over` (conversation 6).
  - **Told when away.** `stateOf` has a state `'over'`: a `done` board with a start, not
    yet seen (`simulSeen`, id -> invitedAt, the same mark "late" and "expired" use), for an
    hour of THIS PHONE'S time since it first saw the ending (`localStorage` `simulEnded`,
    id -> [startAt, ms]): no stamp is stored for an ending. A student looking at the
    finished board is marked as told.
  - **Keeping.** `SimulUI.keep()` runs in every `sync()`: a `done` board of mine with at
    least one move, not void, not about to be voided, is saved ONCE (`localStorage`
    `simulSaved`, `'me|id'` -> startAt; `keeping` while the save travels). `record()`
    builds the tree from `g.fen` and `positionOf(g).opening` + `.sans`, so a handicap and an
    opening (conversation 7) need no change here. `buildRecord()` in `js/history.js` takes
    `source`, `opponent`, `ended` ({ result, outcome, endReason }) and `endedAt`; a record
    with `opponent` has no `level` (the level filter leaves it out). New end reason
    `agreed`. `playedAt` is the simul's start, `endedAt` the last move's stamp.
  - **Said plainly.** The teacher's phone keeps a game only while the Simultáneas screen is
    open (its listener is off elsewhere): one that ended meanwhile is kept on return, and
    NEVER if that student is invited again first. A game resigned with no move on the
    board is not kept. A simul abandoned for 3 hours is never "done", so never kept.
    Home's "Continuar" card shows a kept simul game with the engine's robot icon.
  - **A defect of conversation 4, fixed.** A student still looking at a finished board
    when the teacher invited again saw neither banner nor card (the banner skips the board
    on screen). `render()` now sends them to Students when their board holds no game.
  - **Tool.** Round 6 of every pass, three simuls: 6a draw offered / declined / too soon /
    gone on a move / accepted, a resignation by each side, the banner for a student who was
    away, what each phone kept, the same after a reload of all four phones, the game
    opened in Analysis from History (Eva's board seeded with no black queen and 1. e4 e5 as
    its opening: the saved game starts there); 6b a threefold repetition played by taps,
    the other three automatic draws seeded on it, End simul with two boards open; 6c the
    start seeded 2 h 59 min old (nothing changes) then 3 h 1 min (picker back, a new
    invitation accepted over three live boards). `SIMUL_PASS=es-light` runs one pass.
    About 25 minutes.
  - **Verified:** `test:tree` 453, `test:rules` 535, `test:precache` 59 files and 142 art,
    the tool 573 of 573 with no console errors, 188 screenshots (about 17 opened and looked
    at, es/en, light/dark). At 375x667 the teacher's row is one line and "End the simul"
    still ends at 666 px with nothing scrolled. NOT checked: a real phone, the live
    database, a draw-offer refusal by the RULES from a changed app (the rules tests cover
    it; the tool proves the app's own refusal), stalemate / 50 moves / bare kings reached
    by real play (their words were shown on a seeded reason).

- **SIMULS, CONVERSATION 4 OF 8: THE GAME (2026-10-13, v204).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 4.
  **`firestore.rules` changed (one helper): the push waited for Adrian's
  `npm.cmd run rules:deploy`.** No clock, no resign, no draw offer, nothing saved to
  History: conversations 5 and 6.
  - **Adrian's three answers.** (a) The student's board is a MODE of `#screen-simul`
    (`SimulUI.sOpen` = the board's id), not a screen of its own. (b) The teacher's phone
    stops listening when they leave the screen and reloads on return, as before;
    `SimulUI.sel` (the board they were on) survives `closeTeacher()`. (c) Leaving the board
    asks nothing: leaving is not resigning.
  - **Where.** `#simul-game` in `index.html` (static: `#simul-strip`, `#simul-status`,
    `#simul-board`, `#simul-ctl` with `#simul-auto` and `#simul-skip`, `#simul-end`,
    `#simul-new`); `SimulUI.renderGame / drawBoard / userMove / referee / look` in
    `js/simul-ui.js`. ONE `Board` for every game. `view()` 'started' now draws the game,
    and STAYS after the last board ends until the teacher taps "Nueva simultánea"
    (`close()`, `localStorage` `simulClosed` = that simul's startAt); "End the simul" closes
    it too. The student gets in by "Ir al tablero" on the banner and the card
    (`openBoard`). `PulsoUI.busy()` now includes `SimulUI.inGame()`: no banner over a board.
  - **The honest part (3k).** `shownPosition(g)` and `voidable(g)` in `js/simul.js` (pure,
    unit-tested): a board is replayed before it is shown; a move that cannot be played is
    not played (the board stands as it was before it). `SimulUI.referee()` voids, once,
    and ONLY on the phone that received the move (the side to move), so `by` names who
    refused it; a student's phone does it on any screen, the teacher's only while its
    screen is open (its listener is off elsewhere).
  - **THE RULE THAT WAS MISSING.** A false "checkmate" ends the game in the same write as
    the move, and void was allowed only on a LIVE board, so 3k's "caught the same way"
    could not be written. Added `simulFalseEndOk`: a game a move ended (mate, stalemate,
    repetition, fifty, material) may be voided by the player who did NOT make that move
    (`who == simulTurn(old)`), writing exactly `reason: 'void', winner: null, by`.
    `voidSimul()` in `js/firebase.js` sends that shape for a finished board. 5 new rule
    tests (`test:rules` 535). Open, as section 6 already says: a changed app can void a
    game it really lost.
  - **My move.** Shown at once, `simulMove` NOT awaited; if the server will not take it the
    listener puts the stored game back and the board follows (`drawn` is what the board
    shows; anything that is not "one move more on the same board" is put there without a
    slide). A write unconfirmed for 2 s says "Enviando tu jugada…"; with no signal a note
    says the move will be sent. Firestore keeps its queue in memory only: a move made
    offline and followed by a RELOAD before the signal returns is lost (the board then
    shows the truth).
  - **Auto-jump.** 600 ms after the teacher's move, to `nextBoard()` of the other boards;
    a switch (`localStorage` `simulAuto`) and ⏭. No pre-moves on these boards.
  - **NOT built, for conversation 5 to decide:** a student who is away from the board when
    their game ends is told nothing (the banner just goes; `stateOf` has no state for a
    finished game). The result is on the board only while they are on it. A latecomer has
    no tile in the strip. Kael's corner overlaps the right end of the bottom button at
    375x667 (it does on every screen); nothing is hidden under it.
  - **Tool.** `node tools/emu-verify-simul.mjs [outDir]`: FOUR phones now (Eva, on
    127.0.0.3, a student only in round 5). Round 2: a move each way, a move made offline,
    the teacher ends the simul meanwhile, the refused move comes off the board. Round 3:
    a seeded impossible move voided by the teacher's phone, a seeded false mate voided by
    the student's. Round 5, teacher at 375x667: three boards to mate by taps, skip, jump
    to the longest-waiting, the switch, a reload of both phones, an offline move sent on
    return, a ten-tile strip measured. About 15 minutes.
  - **Verified:** `test:tree` 453, `test:rules` 535, `test:precache` 59 files and 142 art,
    the tool 409 of 409 with no console errors, 124 screenshots (about 15 opened and
    looked at, across es/en and light/dark; the rest only measured by the tool). At
    375x667 the strip starts at 119 px and "End the simul" ends at 666 px with nothing
    scrolled, though the page can still slide about 70 px (the app's bottom padding).
    NOT checked: a real phone, the live database, sound, more than three real boards.

- **SIMULS, CONVERSATION 3 OF 8: INVITATION AND WAITING ROOM (2026-10-12, v203).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 3.
  `firestore.rules` untouched. Conversation 2 (`682b795`) was pushed at the start of this
  one, after Adrian said the rules were deployed. No board yet: that is conversation 4.
  - **Where.** `js/simul-ui.js` (new, `SimulUI`, in `sw.js`). Three places on screen: the
    Simultáneas screen (`#screen-simul`, the TEACHER's: picker, colour, invite, waiting
    room, Start, "has started", End), a banner on every screen for the STUDENT
    (`#simul-banner`, Duel's banner styles) and the same thing as a card in Students
    (`#stu-simul`, where the banner is not shown). Entry: `#stu-simul-open` in Students,
    only for `Students.hasStudents()`. All writes are the functions of conversation 2.
  - **What it costs.** The student's listener runs only when `Students.hasTeacher()` is
    true, which is read from the lists Students already keeps on the phone (`studentsCache`):
    no read to find out, and nobody without a teacher listens. `Students.paintDot()` calls
    `SimulUI.links()` on every change of those lists. The teacher's listener runs only while
    the Simultáneas screen is open (`SimulUI.onScreen()`, called by `showScreen`). A student
    who accepted a teacher on ANOTHER phone gets invitations here only after Students'
    own boot check has run (at most 6 hours) or they open Students once.
  - **States a student sees** (`SimulUI.stateOf`): invited (Join / Not now, the colour, the
    time left), joined ("Esperando a que Ana empiece"), live ("ha empezado"), late (it
    started without me), expired. The last two are said for one hour after the invitation,
    until OK is tapped; "not now" and OK are remembered on the phone (`localStorage`
    `simulSeen`, id to invitedAt). The database cannot tell "declined" from "left out": the
    phone that declined remembers, so a decline made on another phone reads as "started
    without you" there.
  - **BUILT WITHOUT BEING ASKED, two things, both for Adrian to keep or drop:** (1) "End
    the simul" on the teacher's started view (`endSimul()`, with a question first). Without
    it, pressing Start today would leave every joined student in a game nobody can play or
    close for 3 hours, and the teacher unable to invite them again. (2) The line "the
    boards are not in this version of the app yet" (`simul_board_soon`) on both phones
    after Start. Conversation 4 replaces it with the board.
  - **Not built, and a real gap:** the teacher cannot take an invitation back. If nobody
    joins they wait out the 10 minutes ("Invite again" appears then). No function for it
    exists in `js/firebase.js`.
  - **Tool.** `node tools/emu-verify-simul.mjs [outDir]`: the 61 checks of conversation 2,
    then the whole app on three phones (`openPhone`, `screens`), four rounds in each of
    es/en x light/dark at 375 px: expiry (invitedAt seeded 11 minutes old), a latecomer,
    both join and Start, "not now". 241 checks, 68 screenshots, about 5 minutes. Chrome now
    runs with background-timer throttling off: without it the two phones not in front
    miss their once-a-second tick.
  - **Verified:** `test:tree` 449, `test:rules` 530, `test:precache` 59 files and 142 art,
    the tool 241 of 241, no console errors; all 68 screenshots looked at. NOT checked: a
    real phone, the live database (nobody has run a simul against it), 375x667.

- **SIMULS, CONVERSATION 2 OF 8: THE DATABASE, NO SCREEN (2026-10-12, v202).** Spec
  `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan item 2. **The
  rules changed: the push waited for Adrian's `npm.cmd run rules:deploy`.** The emulator
  proves the rules, not the live project.
  - **`firestore.rules`, the Simul block** (`match /simulGames/{gameId}`, the last block in
    the file): one helper per row of the spec's table 3k — `simulInviteOk`,
    `simulCanReplace`, `simulLinkOk`, `simulTurn`, `simulClockOk`, `simulMoveOk`,
    `simulDrawOk`, `simulEndOk`, `simulLobbyOk`, `simulReinviteOk`, and `simulUpdateOk`,
    which works out the changed keys ONCE and picks the branch by status.
    `tests/rules/simul.test.js`: 88 tests (`test:rules` is now 530).
  - **THE CLOCK IS EXACT IN RULES. The fallback of spec section 6 is not needed.**
    `request.time.toMillis() - resource.data.at.toMillis()` and the settle equation are
    accepted and exact: a writer who is 1 ms generous or mean with either clock is refused;
    a move 1 ms inside the time is taken and none at or past the limit ever is (the test
    aims writes at the limit and reads the server's stamp back); the tool's 80-move game
    ends with the stored clocks equal to a plain clock to the millisecond.
  - **Three things the emulator taught, all handled, none in the spec:**
    1. **A string slice that ends at 0 is an ERROR in rules, not `''`** (`mv[0:0]`), so
       the first move of every game was refused. `simulMoveOk` has
       `old.mv.size() == 0 || …`. Only the five new characters are matched against the
       move pattern: the cost of a move does not grow with the game (tested on a
       1,000-character `mv`).
    2. **The SDK's `Timestamp.toMillis()` returns a FRACTION** for a stamp finer than a
       millisecond (9623.998…); the rules' `toMillis()` is a whole number. A clock settled
       from fractions is a number the rule never accepts. `simulMs()` in `js/firebase.js`
       CUTS (`seconds * 1000 + floor(nanoseconds / 1e6)`); never use `toMillis()` on a
       simul stamp. `prevAt` is written back as the server's own Timestamp
       (`simulStamps`), not rebuilt from milliseconds: the rule compares it whole.
    3. **A request may evaluate 1,000 expressions**, the emulator enforces it, and a diff
       of 23 fields per branch went over it on refused writes. Hence the one diff in
       `simulUpdateOk`. Add a branch there, not a second `diff()`.
  - **`js/firebase.js`, the Simul section** (after Pulso): `watchSimulTeacher`,
    `watchSimulStudent`, `watchSimulClass`; `sendSimulInvite(boards, clock, extraS)` (one
    batch: all boards or none, one stamp), `joinSimul`, `declineSimul`, `startSimul` (one
    batch: "this simul" is the teacher's boards that share the newest `invitedAt`),
    `simulMove`, `offerSimulDraw`, `answerSimulDraw`, `resignSimul`, `claimSimulFlag`,
    `voidSimul`, `endSimul`; `syncSimulClock` / `simulServerNow` (Duel's measurement: one
    phone, one clock). Every writer resolves to `{ ok: true, … }` or `{ ok: false, reason }`
    (`'refused'` = the rules said no); none touches the DOM. A board from a listener has
    `id`, `me` (`'t'`, `'s'`, null when only watching), stamps in whole ms, `pending`.
  - **`tools/emu-verify-simul.mjs`** (`node tools/emu-verify-simul.mjs`, about 20 s, 61
    checks): a teacher and two students, three simuls, the real `js/firebase.js` in
    headless Chrome against the emulator. **Each phone MUST be on its own address
    (`localhost`, `127.0.0.1`, `127.0.0.2`):** on one address three phones that listen and
    write use all 6 of Chrome's connections to the emulator and the next write waits 45 s.
    That is a limit of the tool, not of the app.
  - **MEASURED COST** (counted in the tool: accepted writes, documents the server
    delivered to a listener): a move is **1 write and 2 reads**, exactly as counted.
    Invite + join + start is **3 writes and 6 reads a board, plus 1 rule lookup** (the
    spec had 3 reads: each write is echoed to both phones). Ten boards of 40 moves:
    **about 840 writes and 1,690 reads** (spec: 840 and 1,700). A classmate watching adds
    1 read a move a board. `watchSimulClass` is billed for every board it holds on every
    move: conversation 8 should open it for the list only.
  - **Decided here, for Adrian to overrule:** Start is refused once the invitation is
    older than 10 minutes, joined students included (the teacher invites again). A
    student cannot un-join. An offer of a draw cannot be taken back by the one who made
    it. With no clock the teacher gets no extra time (`tMs` 0).
  - **Not built, and nothing calls for it yet:** a function that deletes a board (the rule
    allows it when no game is in play; ending a coaching link or deleting an account
    leaves the board behind).

- **SIMULS, CONVERSATION 1 OF 8: THE RULES OF A BOARD, NO SCREEN (2026-10-12, no version
  bump).** Spec `docs/superpowers/specs/2026-10-11-students-simul-design.md`, build plan
  item 1. `js/simul.js` (pure: imports `vendor/chess.js`, `js/tree.js`, `js/pulso.js`) and
  `tests/unit/simul.test.js` (77 tests). No screen imports it yet, so it is NOT in `sw.js`
  (`test:precache` only walks from `js/app.js`); the conversation that first imports it
  from a screen lists it and bumps the cache.
  - **The document's field names are fixed here** (the comment block at the top of
    `js/simul.js` is the contract for the rules): `t`, `s`, `cls`, `status`, `invitedAt`,
    `startAt`, `at`, `prevAt`, `fen` (start position with the handicap, BEFORE the opening,
    White always to move), `op` (the opening, packed), `tc` (teacher's colour), `base`,
    `inc` (seconds; `base` 0 = no clock), `tMs`, `sMs`, `mv`, `n`, `draw`, `tDr`, `sDr`,
    `winner` (`'t'`, `'s'`, `'draw'`, null), `reason`, `by`.
  - **A move is five characters**, `[a-h][1-8][a-h][1-8][qrbn-]` (`SIMUL.MOVE_PATTERN`): a
    dash when it is not a promotion, no separators. `tryMove()` refuses a promotion letter
    on a move that is not one (the library would let it ride).
  - **The clock is exact** (spec 3d, proven here in arithmetic, not yet in rules): `tMs` /
    `sMs` are always ONE MOVE BEHIND. A move writes `prevAt = old at`, `at = server stamp`,
    and settles the move before it: `left - (at - prevAt) + inc` for the one who moved
    last; the first move settles nothing. In time means `server time - at < mover's stored
    time`; at equal the flag is down. `refereeMove()` in the test file is the move rule to
    copy into `firestore.rules`. 300 random games agree to the millisecond with a plain
    clock that charges each move as it is made.
  - **Found, and the spec's section 2 corrected:** `vendor/chess.js` does not merely keep a
    castling right whose rook is missing; once the squares between are empty it CASTLES
    (king two squares, no rook). `buildStart()` removes the right and `checkStart()`
    refuses a position that carries one (`reason: 'castling'`).
  - **My reading, for Adrian to overrule:** "one draw offer per player per 10 moves" is
    counted as 10 moves by each side (20 single moves, `n - tDr >= 20`). A move made at
    the exact instant the time runs out is too late. A flag is a loss even when the other
    side has only a king (the database cannot count pieces).
  - **Verified:** `test:tree` 449 pass (372 + 77); `test:precache` 57 files, 142 art;
    `test:rules` 442 pass, untouched. All 150-odd `OPENINGS_ECO` lines replay through
    `replayOpening()` on the ordinary start position.
  - **NOT verified:** that `firestore.rules` can express the move check (`toMillis()`
    arithmetic on stored stamps); that is conversation 2, against the emulator.
  - **Next:** conversation 2 (the `simulGames` rules block, `tests/rules/simul.test.js`,
    the `js/firebase.js` functions, `tools/emu-verify-simul.mjs`). Adrian deploys the
    rules before that push.

- **COORDINATES: A TRAINER IN THE LEARN TAB (2026-10-12, v201).** No spec file: the idea is
  Lichess's coordinate trainer (name a square, find a square, against the clock), looked at
  in headless Chrome before building. None of its code, text, sounds, layout or artwork is
  used. Adrian's decisions: a training tool, NO leaderboard now or later, nothing published,
  not a rating, `firestore.rules` untouched.
  - **Files:** rules in `js/coord.js` (imports nothing; `tests/unit/coord.test.js`, 16
    tests), screen in `js/coord-ui.js` (`CoordUI`), both precached. The view is `#coord-view`
    inside `#screen-endgame`, with two faces: `#coord-setup` and `#coord-run`. It is the
    seventh entry of `VIEWS`; the Learn list's row is `#learn-coord-item`, added last in
    `Endgame.renderSections()`.
  - **Two exercises:** `find` (a name in the gold card `#coord-ask`, tap the square; the
    next name is shown beside it) and `name` (a square lit `.sq.coord-lit`, answered on two
    rows of keys `#coord-keys`, a letter then a number; no phone keyboard).
  - **Clock:** 30 seconds (`COORD_SECONDS`) or none. A deadline (`CoordUI.deadline`), not a
    count of ticks. It starts on Start, with no count-in. "Terminar" ends a run early and
    its points still count.
  - **Side:** White, Black or random (the default). The line under the board says which.
  - **Score:** one point per right answer. A wrong answer loses nothing, the same square
    stays asked, the square flashes red with `puzzle-wrong`; the lost time is the penalty.
  - **The board's own a-h / 1-8 labels** are one layer (`.coords`, `js/board.js`), hidden
    with `#coord-board .coords { display: none }`.
  - **Kept:** the best timed score of each exercise, kv `coordBestFind` / `coordBestName`,
    in `SYNCED_KEYS` and in nothing published. On sign-in the account's value replaces the
    device's, as for every synced key (no "keep the higher" rule). Device only: kv
    `coordPrefs` (the three choices) and localStorage `coordIntroDone` (Kael's one-time
    explanation).
  - **Streak:** a TIMED run with `COORD_STREAK_MIN` (10) right answers calls
    `Streak.recordActivity()`. An untimed run never does.
  - **During a run:** the screen takes exactly the height there is
    (`#screen-endgame.coord-on`, the Sealed Moves method), Kael's corner is put away
    (`body.coord-running`), and `CoordUI.running` holds back the badge card and the
    reminder invitation, as `Rush.running` does.
  - **Leaving:** `showScreen()` to any other screen and `Endgame.showView()` to any other
    view call `CoordUI.stop()`: the run is dropped, nothing recorded. Android Back leaves
    the Learn tab, as from every Learn view (only whole screens are in the Back history).
  - **Verified:** `test:tree` 372 pass; `test:precache` 57 files, 142 art;
    `node tools/cdp-verify-coord.mjs <outDir>` 143 of 143 at 375px, ES and EN, light and
    dark, squares tapped at the place their name says for the side below, the real 30
    seconds waited once (30.2 s), the best kept after a reload; screenshots opened.
  - **NOT verified:** the best reaching a second device (the tool is signed out), and the
    feel on a real phone (the sound on every answer, tapping speed).

- **HOME TAB, CONVERSATION 3 OF 3: "CONTINUAR", "EMPIEZA POR AQUÍ", AND HOME DRAWN AGAIN
  (2026-10-12, v200).** Spec `docs/superpowers/specs/2026-10-12-home-tab-design.md`, build
  plan item 3. The spec's plan is finished with this.
  - **The block:** `#home-next` (heading `#home-next-head`, rows `#home-next-list`) between
    `#home-today` and `#home-discover`; `data-kind` is `continue`, `start` or `none` (hidden).
    Rows are `.list-item.home-row` with `data-type`.
  - **The rule:** `homeBlock({ homework, seen, book, game, bestStreak })` in `js/home.js`,
    unit-tested. "Continuar": homework still open (the newest not seen yet, else the newest
    open; `count` = how many are open), the book last opened, the last game, in that order,
    only those that exist. Nothing to continue AND `bestStreak` 0: "Empieza por aquí"
    (lesson, play, tour). Practised and nothing half-way: no block, no heading.
  - **Drawing:** `Home.drawNext()`, a step after `Home.render()`: `db.listBookSummaries()`,
    `db.pageHistory({ count: 1 })`, `bestStreak`, and `Students.homework` / `hwSeen` as they
    are in memory. No server read. The block is replaced only when its text changed
    (`Home.nextHtml`), so coming back to Home moves nothing.
  - **Words:** the rows use each screen's own. Homework: its title, then "Deberes · De
    {teacher} · para el {date} · {n} abiertos" (`Students.hwSub`), pill `hw_card_new`
    ("nuevo", the pill the Students screen already has; the prompt said "Nueva"). Book: its
    name, "Leer · Pág. 84 de 320" (`read_page_of`). Game: "Tú – Bot Club · 1-0", then end
    reason, moves, when (`History.namesFor`, `displayResult` now exported, `formatWhen`).
    Icons are the menu's own drawings, read from `#tabbar`.
  - **Where each row goes** (`Home.goNext`): homework -> Students. Book ->
    `Read.openOnEnter(id)` (new, one line: it names the book `Read.onEnter()` opens) then
    `showScreen('read')`. Game -> `History.openGame(rec)`, which is Analysis with the moves
    loaded: what Play's history does. Lesson -> Learn with
    `Endgame.Lessons.openCategory(LEARNING_CATEGORIES[0])` ("Reglas"). Play -> Play's setup
    page with level 1 pressed, no game started; a game already on the board is left alone.
    Tour -> `Tour.start(tourCtx())`.
  - **Home drawn again:** `Home.refresh()` = `render()` + `drawNext()` + `drawBoards()`.
    Called from `showScreen('home')`, from `Auth.onChange` in `main()`, from the
    `visibilitychange` listener in `main()`, and from `Streak.checkDay()` when the day really
    moved. `checkDay()` now also runs `DailyMissions.init()` (the missions used to stay on
    yesterday's "n / 3" until one was completed) and is called once a minute, so midnight
    with Home open and untouched turns the page too. Homework has its own signal:
    `Students.paintDot()` ends with `this.onHomework?.()`, set in `Home.init()`, because
    Students reads its saved lists after `main()`'s own account listener has run.
    "Descubre" keeps its pick through all of these.
  - **Found and fixed on the way:** every screen scrolls in the same `<main>` and
    `showScreen()` never reset it (only a swipe did). Home is now long, so a row or
    "Descubre" tapped far down it opened the next screen already scrolled, its Back button
    off the top. `showScreen()` now puts `<main>` at its top when Home is left. Other
    screens keep the old behaviour.
  - **Checked:** `node tools/cdp-verify-home.mjs <outDir>` 314 of 314 (the 210 of before
    plus this conversation's), 375 x 667, ES and EN, light and dark, no console errors,
    screenshots looked at. It takes about 15 minutes now: start it detached and read its
    log. `test:tree` 356, `test:precache` OK. SEEDED there, not created by
    using the app: the game (`History.buildRecord` + `saveGame`), the book (`Read.importFile`
    with a fixture PDF, page set by hand), the homework (`Students.homework` set by hand).
    A sign-out is `Auth._notify()` with nobody signed in; a new day is the page's `Date`
    moved one day on and the app's own listener fired. NOT checked: a real account, a real
    homework from a real teacher, a real sign-in bringing a homework, a real phone.
  - **ASK ADRIAN:** with three "Continuar" rows on a 375 x 667 screen, "Descubre" starts
    at y=657 of 667: only its top edge shows, the card is below the first screenful (the
    spec's first risk). With "Empieza por aquí" it is the same. Moving it above "Continuar" is his
    call. "Once each time the app is opened" for "Descubre" is still unanswered.
  - **Known, not fixed:** the three items under conversation 2 below, unchanged.

- **HOME TAB, CONVERSATION 2 OF 3: THE TWO BOARDS (2026-10-12, v199).**
  Spec `docs/superpowers/specs/2026-10-12-home-tab-design.md`, build plan item 2.
  - **One small board for all three places:** `miniBoardHtml(placement, { flipped, last })`
    in `js/board.js`, css `.mini-board` (the size is the user's: `.lib-mini` 88px on the
    Openings cards, `.home-board` 118px on Home). The old private one in
    `js/opening-lib-ui.js` is gone.
  - **Puzzle board in "Hoy":** `#home-puzzle-board` (a button: a tap is `goPuzzle()`),
    `#home-puzzle-side` ("Juegan blancas/negras"). `Home.drawBoards()` runs after
    `Home.render()` from `showScreen('home')`, `relabel()` and the piece-set switch;
    `Home.loadPuzzle()` waits for a painted frame, then asks `puzzleOfDay(elo,
    { onlyItsBand: true })`. That option returns nothing when the band's own file cannot be
    had, instead of a stand-in from other bands: a stand-in changes as bands load, so the
    board would not be the puzzle the button opens. No file = no board, no box, the row is
    title and button as in v198.
  - **Which position:** the one AFTER the puzzle's first move (the opponent's), seen from the
    player's side, with that move's two squares tinted: what the Puzzles screen shows once
    settled. `Home.puzzle` is `{ id, placement, side, last }`.
  - **"Descubre":** `#home-discover`. `Home.pick` is thrown once per app open
    (`discoverPick(Math.random(), ENDGAMES.length)` in `js/home.js`, half endgames, half
    openings), nothing stored. `Home.goDiscover()`: an endgame opens Learn with that study
    (`Endgame.category` set first, so the study's Back leads to its list); an opening calls
    the new `OpeningLib.studyLine(name, moves)`, which shows the Library, puts the line on
    the preview board and asks the library's own Study question. The board is tappable too.
  - **`HOME_OPENINGS`** in `js/home.js`: 32 openings as `[full name, moves]`; a unit test
    checks each is a real line of the library under that exact name. White at the bottom
    for all of them, like the Library's cards.
  - **Checked:** `node tools/cdp-verify-home.mjs <outDir>` 210 of 210 at 375 x 667, ES and
    EN, light and dark, screenshots looked at. The tool's server can hold and refuse the
    puzzle files; each kind of card is forced with `Home.pick` and then really tapped.
    `test:tree` 344, `test:precache` OK. NOT checked: a real phone, signed in, the service
    worker.
  - **ASK ADRIAN:** "once each time the app is opened" is still a reading of his "switch
    aleatory", not his words.
  - **Known, not fixed:** every player under 1800 gets a puzzle from `puzzles-0.json`, which
    is not in the offline list in `sw.js`: a new user offline sees no board. The tour's last
    step still says Kael is "always down in the corner". In dark mode `.btn.primary` is the
    light blue it is everywhere else, not the navy of the picture.
  - **Next:** conversation 3, "Continuar" and "Empieza por aquí".

- **HOME TAB, CONVERSATION 1 OF 3: THE SCREEN, AND THE APP OPENS ON IT (2026-10-12, v197, v198).**
  Spec `docs/superpowers/specs/2026-10-12-home-tab-design.md`, build plan item 1.
  - **Screen:** `#screen-home` in `index.html` (first `<section>` in `<main>`): Kael's line
    (`.home-kael`, `#home-kael-line`) and the "Hoy" card (`#home-today`: `#home-today-chip`,
    `#home-puzzle-btn`, and `#daily-missions-list`, which MOVED here from Profile). No board,
    no "Continuar", no "Descubre": conversations 2 and 3.
  - **`js/home.js` (new, pure, 11 unit tests in `tests/unit/home.test.js`):** `kaelRule` (the
    five rules, first that fits: welcome / alldone / pending / counted / start), `kaelLine`,
    `missionsDone`, `dayPart`, `greetName`. No sentence names both the streak and the missions.
    "Never used the app" = streak 0, `bestStreak` 0, nothing done today, `bestDailyMissionStreak` 0.
  - **`js/app.js`:** `Home` (`init`, `render`), beside `DailyMissions`; both are now exported
    (the verify tool calls them). `'home'` in `SCREENS` and `MENU_AREA`; `HOME_SCREEN = 'home'`;
    `activeScreen` STARTS as `'home'` so the `showScreen('home')` ending `main()` adds no history
    entry. `showScreen` sets `body.on-home` and calls `Home.render()`. `DailyMissions.render()`
    draws only the play and opening rows, fills `#profile-missions-count`, and calls
    `Home.render()`; `Streak.render()` and `relabel()` redraw Home too.
    `remindIfIncomplete()` returns at once on Home (and stays unspent).
  - **Menu:** `<button data-screen="home">` is the first of NINE `#tabbar button`s (house icon,
    `tab_home`: Inicio / Home). Title, swipe order and Back all follow from that and
    `HOME_SCREEN`; no other navigation code changed.
  - **Profile:** the missions card is one row, `#profile-missions-row` ("Misiones de hoy: n / 3",
    `#daily-missions-streak` still on it), which opens Home.
  - **Kael on Home, DECIDED BY ADRIAN the same day (v198): "just in the home, all the Kael
    interactions will be in the home itself."** `body.on-home #kael-corner` is slid off the edge,
    opacity 0, not tappable, speaking or not. `KaelQuotes.show()` on Home hands the message to
    `Home.say(item, duration)`, which puts it in `#home-kael-line` (class `.saying`; `.actionable`
    and tappable when it has an `onTap`) in place of his usual line; `Home.endSay()` puts the line
    back. `KaelQuotes.html(item)` is the one builder for both bubbles. `Home.render()` never
    writes over a message. Entering Home closes a corner bubble still open; leaving Home ends a
    message there. This replaces the spec's a2 recommendation (slide in when he speaks).
  - **His random quote on opening** (`KaelQuotes.showRandom()` at the end of `main()`) is skipped
    while Home is in view: Adrian's answer, "turning it off on home only".
  - **Tour (`js/tour.js`):** `STEPS` is exported; `welcome` is on Home, new step `homeToday`
    rings `#home-today`, `profMiss` is gone (33 steps), `finish()` ends on Home. Not changed:
    the last step still says Kael is "always down in the corner", which is not true on Home.
  - **`js/pulso-ui.js` `follow()`:** "still on the opening screen" is now `'home'`, was `'analysis'`.
  - **A Lichess return** only shows a toast, so it now lands on Home (was Analysis, the default).
  - **Checked** with `node tools/cdp-verify-home.mjs <outDir>` (new; 141 checks, about four
    minutes): 375px, ES and EN, light and dark, pictures opened. Fresh profile opens on Home;
    the tour really tapped through all 33 steps; menu, swipe both ways, Back three tabs deep;
    a shared PGN lands on Databases, a `?duel=` link on Duel. `test:tree` 338 pass, `test:precache` OK.
  - **Called, not done by hand, in that tool:** `DailyMissions.complete()` from the mission's own
    screen, `remindIfIncomplete()` (not the real 45-second wait), `KaelQuotes.show()`, and
    `Auth.user` set by hand for the greeting by name. Nothing signed in and no real phone.

- **HOME TAB: DESIGN ONLY (2026-10-12, no version bump). Conversation 1 is built: entry above.** The spec is
  `docs/superpowers/specs/2026-10-12-home-tab-design.md`; beside it the mock-up page
  (`2026-10-12-home-tab-mockup.html`) and two pictures of the chosen design. Three designs
  were drawn and photographed at 375px; **Adrian chose A ("Hoy")** and replaced its row of
  eight section buttons with a second board, "Descubre": an endgame ("do you know this
  endgame?") or an opening ("play it against the engine?").
  - **Home, top to bottom:** Kael's one line; the "Hoy" card (puzzle of the day with a small
    board, the other two missions); "Continuar" (open homework, last book, last game; a
    new user gets "Empieza por aquí" instead); "Descubre".
  - **Recommended and shown to him, not objected to:** Home is the first menu button and
    first in the swipe; the app always opens on Home; Back ends on Home; the missions move
    from Profile to Home (Profile keeps one row); the tour starts on Home; Home reads only
    what is on the phone and loads the puzzle file after it is drawn.
  - **Changed by Adrian the same day:** "Descubre" has no switch and shows an endgame or an
    opening at random; Kael's corner is not shown on Home (he is already at the top).
  - **Still his to confirm:** that the random pick is thrown once each time the app opens
    (my reading), and that Kael still slides in on Home when he really has something to say.
  - **Found while reading, not fixed:** `puzzleOfDay()` gives every player under 1800 a
    puzzle from `puzzles-0.json` (ratings up to 799), and that file is not in the offline
    list in `sw.js` (only `puzzles-3.json` is). Written up in the spec's risks.
  - **Build plan:** three conversations (the screen and navigation; the two boards;
    Continuar). None started.

- **PROFILE ICON IN THE TOP BAR, SETTINGS IN THE MENU (2026-10-12, v196).** The two swapped
  places. Adrian's decisions: the icon is the user's own avatar; a gold dot on it for a
  waiting friend request; Profile is reached by the icon only, not by swiping.
  - **Top bar:** `#btn-settings` is GONE. `#btn-profile` (44 x 44, `.icon-btn`) holds
    `#btn-profile-pic`, painted by `Avatars.paintTopbar()` in `js/avatars.js` (called from
    `Avatars.refresh()`, from `main()` and from the `Auth.onChange` in `main()`). Signed out or
    new, it is the white pawn, the default Profile already showed. `.on` (a gold ring) is set
    in `showScreen` for every screen whose `MENU_AREA` is `profile`; `.has-dot` is set by
    `Friends.paintCount()` beside the pill on Profile. The teacher-invite dot was never on
    Profile: it stays on Students and on the menu button.
  - **Menu:** `<a id="menu-settings" class="sheet-link">` is the last row, after
    `#menu-limits`. An `<a>`, not a `<button>`, for the reason in the comment above
    `#menu-limits`: `#tabbar button` is now exactly the EIGHT destinations. One loop in
    `js/app.js` wires both sheet rows.
  - **No Profile button in the drawer any more.** `updateTabMenu()` writes the title for
    Profile and its sub-screens itself (`PROFILE_ICO`). `TAB_ORDER` ends at Students, so a
    swipe on Profile goes nowhere and Back returns to where the icon was tapped.
  - **Tour:** the Profile step rings `#btn-profile`; the Settings step is
    `'#tabbar #menu-settings'` (the `#tabbar` in the selector is what opens the drawer).
    Texts `tour_prof_tab_b`, `tour_settings_b`, `tour_skipped_toast` say the new places.
  - **A defect found and fixed on the way:** `.tour-tap` and `.tour-scroll` have their own
    `display`, so `hidden` never hid them: an empty gold pill on every step without a tap, and
    a "keep scrolling" arrow that stayed up after the radar step. One CSS rule.
  - **Checked:** `tools/cdp-verify-profile-icon.mjs` (new, 193 checks: 375px, ES and EN,
    light and dark, real taps and swipes; its first lines say what was called or seeded).
    The check tools that pressed the old places now press the new ones (tabheads,
    swipe-modes, movelist, lichess, remind, remind-invite, offline-art); only tabheads,
    swipe-modes and puzzle-modes were RUN. tabheads' "blind rating badge shown" check had
    been failing since Blindfold got its start panel; it now checks the badge is filled in.
  - **NOT seen:** a signed-in user's avatar arriving from the cloud, and a real friend
    request lighting the dot (the tools are signed out; the dot was seeded).

- **PLAY: A CLOCK, OR NONE (2026-10-12, v195).** A game against the engine can be played
  with a time control. No clock stays the default and plays exactly as before.
  - **The clock** is `js/play-clock.js`: PURE, imports nothing, starts no timer, is handed the
    time as an argument. `createClock / startClock / pressClock / stopClock / timeLeft / flagged`,
    plus `formatClock` (rounds UP, so 0:00 is only ever a fallen flag), `thinkTime`, `bareKing`,
    `flagOutcome`, `TIME_CONTROLS`, `controlById`, `controlLabel`, `LOW_MS`. 19 tests in
    `tests/unit/play-clock.test.js` (test:tree 308 -> 327). The time left is worked out from WHEN
    the running clock started (`Date.now()`), never counted down tick by tick: that is what makes
    a locked phone honest. Do not turn it into a `timeLeft--` counter like Rush's.
  - **Adrian's decisions (2026-10-12), all built:** (a) a fixed list only, 3+2, 5+0, 5+3, 10+0,
    10+5, 15+10, no free choice; (b) the engine has a real clock on the same control and can lose
    on time; it keeps its level's `movetime` and thinks for less only when a twentieth of its
    clock is smaller than that (about 20 s left); (c) NO Undo in a timed game (button hidden,
    `Play.undo` refuses); (d) the clock keeps running in the background or with the phone
    locked, measured from real time; (e) a win on time COUNTS for the "beat the engine" badge
    ("win is win"); (f) both clocks in one row above the board, the engine's left, the player's
    right, the running one framed in gold; under 20 s red; no new sound. A flag with the other
    side on a bare king is a draw.
  - **In `Play` (js/app.js):** `timeControl`, `clock`, `flag`, `clockTimer`; `begin(color, fen,
    timeControl)`; `showClocks`, `renderClocks`, `tickClock` (200 ms, and once on
    `visibilitychange`), `checkFlag`, `pressClock`, `thinkMs`. `tickClock` only DRAWS while the
    page is hidden or another tab of the app is open: the game is ended when the player is back
    in front of it, not behind another screen. "Play from here" (Analysis) uses the time control
    picked on the setup screen, as it already used the level.
  - **The saved game:** `timeControl: { base, inc }` (seconds) only on a timed game, an OPTIONAL
    field, `HISTORY_VERSION` unchanged; `endReason: 'timeout'` (its text was already in i18n);
    the PGN gets `[TimeControl "300+3"]`. `resultOf` / `endReasonOf` / `buildRecord` in
    `js/history.js` take `flag`. The history card's last line starts with "5+3".
  - **Checked:** `node tools/cdp-verify-play-clock.mjs <outDir>` (new; real Stockfish; 34 checks):
    no clock as before, only the side to move counts down, the increment, a pre-move fires and
    costs nothing, 4 s with the page FROZEN are taken off the clock, the flag ends the game and
    the record and PGN say so, Analyse opens it, the engine's flag is a win and sets
    `engineLevelsBeaten`. 375px, light and dark, Spanish and English: pictures opened and looked
    at. test:precache OK (54 files, +1). firestore.rules untouched.
  - **NOT tested on a real phone:** locking the screen and switching apps. The headless tool
    freezes the page instead. Known and NOT new: a game in progress lives only in memory, so if
    Android closes the app in the background the game (timed or not) is gone and is not saved.
  - **Left as it was:** the history card still shows the opening name on its second line and
    the end reason ("Tiempo agotado") only when the game has no named opening.

- **OPENING LIBRARY, CONVERSATION 2: STUDY AND THE REST OF THE PREVIEW (2026-10-12, v194).**
  The preview now has **Study**, **Open in Analysis** and **Continues with**, and a study game
  left half-way comes back. With this the spec's build plan (section 5) is finished.
  - **The book** (`buildBook` in `js/opening-lib.js`, still PURE: the Chess class and `fenKey`
    are handed in as arguments): the line on screen plus every library line that begins with its
    moves, as a Map `fenKey -> { san: count }`, the shape `Trainer.buildBook` makes. By POSITION,
    so a transposition stays in the book. A count is the number of named lines through a move,
    not popularity, and the sheet says exactly that ("the library's named lines that pass
    through here (10 variations)"). The lines are merged into a tree first, so the Sicilian's
    400 lines play each shared move once.
  - **"Continues with"** (`continuations`): the NEXT named lines after the moves on the board,
    by moves. "Next" means no other named line lies between, so 1.e4 c5 shows a few dozen rows
    and not 399; a tap opens that line (the name follows, the page returns to its top, the
    preview's Back still goes to where the preview was first opened from). A row shows the
    moves it adds (`numberedFrom`: "2.Na3", "5...a6 6.Be3") and how many named lines lie under it.
  - **The trainer seam.** `Trainer.start()` builds the database book and calls the new
    `Trainer.begin({ color, level, host, played })`; the Back button is `Trainer.leave()`.
    `host` is null for My databases (same form, same game, same back as before). The Library
    passes `{ back(), changed() }`: `changed` runs after every move and at the game's end.
    While a study game runs `#screen-trainer[data-view]` is `study` (CSS hides the Library and
    the form); `OpeningLib.view` and kv `trainerView` do not change. `setView()` leaves a study
    game first, so the guided tour still finds the setup form.
  - **Decided by Adrian here:** colour and level are chosen on a **sheet** over the preview
    (colour pre-set to the opening's `side`, level starting from the form's), not on a row; the
    restore is a **gold "Continue" bar** at the top of the Library ("Continue: name · move N",
    with an X), for study games only. Games from My databases are still not saved.
  - **The saved game** is kv `libStudy` (`{ line, color, level, sans, inBook }`), device only,
    NOT in `SYNCED_KEYS` (a test fails if it is ever added). Written after every move, removed
    when the game ends or is resigned; Back mid-game keeps it; a new study replaces it; a game
    with no move yet saves nothing. The line is stored by its MOVES, so a rebuilt library that
    no longer has it simply shows no bar.
  - **The rating** is untouched: `recordOpeningResult` classifies the moves played. Checked: a
    lost Ruy Lopez study game moved "Ruy Lopez, Morphy Defense" and nothing else; a keyless
    line (1.a3 a5) was studied and credited nothing.
  - **Carried, still Adrian's to confirm or change:** the guided tour does not mention the
    Library; the 308 repeated names are separate rows; the preview shows White at the bottom for
    every opening (a study game turns the board to the colour played).
  - Checks: `test:tree` 302 to 308 (6 new in `tests/unit/opening-lib.test.js`: the shape, the
    counts, a transposition, a one-line opening, a keyless line, "Continues with");
    `test:precache` 53, unchanged (no new file); `tools/cdp-verify-opening-lib.mjs` 165 to 242
    of 242 at 375 x 667, ES and EN, light and dark, screenshots looked at, including a study
    game started with the network off; `tools/cdp-verify-trainer-guard.mjs` still passes.
    `js/openings-eco.js`, `js/play-book.js`, `js/opening-library.js` and `firestore.rules`
    unchanged. **Not measured: a real phone.** On a desktop under Node, building the book when
    Study is tapped took 117 ms for 1.e4 c5 (410 lines) and 448 ms for the bare 1.e4 (2,032
    lines, the largest there is); "Continues with" took 3 ms at most. If the Study sheet opens
    slowly on a phone for 1.e4 or 1.d4, that is where to look.

- **OPENING LIBRARY, CONVERSATION 1: BROWSE AND PREVIEW (2026-10-12, v193).**
  The Openings tab now opens on a **Library | My databases** switch. Study is NOT built:
  conversation 2 of the spec (`docs/superpowers/specs/2026-10-12-opening-library-design.md`).
  - **Files.** `js/opening-lib.js` (PURE, imports nothing, runs under Node: `buildCards`,
    `filterCards`, `buildSearchIndex`, `searchLines`, `openingRows`, `buildNameIndex`, `nameAt`,
    `fold`, `numbered`, `fullName`, `firstMoveGroup`). `js/opening-lib-ui.js` (the screen:
    `OpeningLib`, statically imported by `js/app.js`; it imports `js/opening-library.js` with a
    dynamic `import()` the first time the Library shows). Markup in `#screen-trainer`:
    `#trainer-views` (the switch), `#trainer-library` with `#lib-list`, `#lib-opening`,
    `#lib-preview`. Styles under "Openings: the library" in `css/style.css`. Words: `lib_*` in
    `js/i18n.js`. Dev tool: `tools/cdp-verify-opening-lib.mjs`.
  - **How the two sides share the tab.** `#screen-trainer[data-view]` is `library` or `mine`
    and CSS hides the other side; `#trainer-setup` and `#trainer-game` keep their own
    `.hidden`, which `Trainer` still owns. The only edits inside `Trainer`: `start()` hides
    `#trainer-views` and `#trainer-back` shows it again. `showScreen('trainer')` calls
    `OpeningLib.onEnter()` after `Trainer.refreshBases()`.
  - **The remembered view** is kv `trainerView` (`'library'` or `'mine'`), device only: a test
    reads `SYNCED_KEYS` and fails if it is ever added there.
  - **A card's first moves** (`openingMoves` in `js/opening-lib.js`): the opening's own line,
    the SHORTEST when several move orders carry the bare name (Queen's Gambit Declined:
    1.d4 d5 2.c4 e6); 13 openings have no line of their own (King's Gambit Declined is only
    ever a named variation) and show what more than half of their lines begin with
    (1.e4 e5 2.f4). The first-move chips go by those moves: 53 / 65 / 32, not the spec's
    50 / 67 / 33, which counted each opening's first line in the data.
  - **The small board** is one CSS background for the 64 squares plus one `<img>` a piece
    (`miniBoardHtml`). Lists are drawn a page at a time (`paged`: 16 cards, 60 rows) as their
    end nears the screen, so the Sicilian's 400 rows and the 150 boards are never built up
    front. Measured in headless Chrome ON A DESKTOP: all 150 cards scrolled in about 0.5 s
    (4,932 piece images), slowest scroll frame 26 ms; the Sicilian's page opens in 5 to 15 ms,
    all 400 rows in about 0.4 s. **A real phone was not measured.**
  - **The preview's name** is `nameAt`: the longest named line the moves so far begin with,
    across the WHOLE library, so the Najdorf reads King's Pawn Game after 1.e4, Sicilian
    Defense after 1...c5, and so on. By moves, not by position: a transposition is not
    followed. The name block has a fixed height, so the board never moves (checked at every
    move). The move list is one running text, not `renderMoveList`'s rows: with rows the list
    fell off a 375 x 667 screen; now board, buttons and list fit with nothing scrolled.
  - **Decided here, Adrian to confirm or change:**
    1. **The guided tour.** Its Openings steps ring `#trainer-base`, `#trainer-color`,
       `#trainer-level`, `#trainer-start`. While `Tour.running` the tab shows My databases
       (not remembered); after the tour it is the Library again. The tour does not mention the
       Library yet.
    2. **The first-move chips are a second `.seg`, lit in gold, tap again to let go.** The
       app's `.filter-chip` is a banner with a button, not a chip.
    3. **White or Black on a card is a small king** of the current piece set on a board-coloured
       square: a filled and an empty square swap meaning between light and dark.
    4. **The 308 names with more than one move order are separate rows, not merged.** In the
       screenshots they read as the same name twice with different moves under it; merging
       would hide real lines. Left as the spec had it.
    5. **My databases with a database chosen now scrolls 15px at 375 x 667** (the switch is
       48px; Start is fully on screen without scrolling).
  - Checks: `test:tree` 292 to 302 (9 in `tests/unit/opening-lib.test.js`, 1 in
    `precache.test.js`), `test:precache` 51 to 53 (the two new static files);
    `tools/cdp-verify-opening-lib.mjs` 165 of 165 at 375 x 667, ES and EN, light and dark,
    screenshots looked at: start-up does not ask for `js/opening-library.js`, nor does a
    launch that opens on My databases; a game from an own database still starts; and
    OFFLINE through the real service worker (server taken away after one visit) the Library
    opens and a Ruy Lopez line plays through. `js/openings-eco.js`, `js/play-book.js`,
    `js/opening-library.js` and `firestore.rules` unchanged.

- **OPENING LIBRARY: DESIGN AND DATA, NO SCREEN YET (2026-10-12, still v192, nothing the app loads changed).**
  Spec: `docs/superpowers/specs/2026-10-12-opening-library-design.md`, decisions a to g all
  made by Adrian. The screen is NOT built: section 5 of the spec is the plan (two conversations).
  - **Source: github.com/lichess-org/chess-openings only (CC0), commit `a6189a3`.** Adrian:
    "my main goal is to have all the opening and defense names, even with few moves is ok.
    Afterwards we can extend some openings accordingly." Rated games (29.2 GB a month), the
    evaluated positions (22.4 GB) and the broadcast games (CC BY-SA, not CC0) were measured
    and not downloaded; the table is in the spec, section 1.
  - **Built:** `tools/opening-library-src/` (the five source files, 395 KB, plus SOURCE.md),
    `tools/build-opening-library.mjs` (no network, no engine; run twice, same file),
    `js/opening-library.js` (GENERATED, 323 KB, about 53 KB gzipped; grep it, never read it
    whole), `tests/unit/opening-library.test.js` and `tests/unit/opening-names-v192.json`.
  - **The numbers:** 150 openings (70 White, 80 Black), 3,865 lines, 3,177 names, average
    4.9 moves, longest 18. 110 of the 115 existing names are used as keys; 49 lines (1.a3,
    1.h3, 1.h4 and the like) have no key because `classifyOpening` does not name them.
  - **`js/openings-eco.js` is untouched**: the Play book, saved-game names and ratings did not
    move, so no engine measurement was owed or run. A test now pins the 115 names of v192.
  - **Decided:** all 150 as cards (small board, name, colour, first moves, number of
    variations; NO difficulty, description or download count), search over every name,
    Both/White/Black, first-move chips, biggest first; preview is a board with back/next and
    the name updating; study is the existing trainer with the line and everything under it as
    its book; opening names in English in both languages; a Library | My databases switch,
    Library first, last view remembered.
  - **Not in the app yet:** `js/opening-library.js` is imported by nothing and is not in
    `ASSETS`. The session that builds the screen adds it (and bumps the cache).
  - Checks: `test:tree` 286 to 292, `test:precache` still 51, `firestore.rules` unchanged.

- **PLAY: EVEN STEPS BETWEEN THE LEVELS, AND THE OPENINGS TRAINER GETS THE SECOND LOOK (2026-10-12, v192).**
  v191 (next entry) left the steps uneven: level 4 hardly above level 3, level 5 far above
  level 4. Measured first (960 trial games in three runs), Adrian approved "all as
  recommended", built, measured again. No screen changed.
  - **"Two games in three" at every step does NOT fit.** From level 1 to level 8 is about
    seven steps of four games in five. Two-in-three steps would need level 1 about as
    strong as the old level 5. The aim became: level 1 and level 8 stay, the six between
    are spaced evenly. Told to Adrian before he approved.
  - **The new settings, `js/play-book.js`** (one new test pins them; 25 in the file):
    `VETO` refuse 280, 215, 170, 125, 90 cp (was 280, 240, 190, 160, 120); `through` 0.5,
    0.45, 0.2, 0, 0 (was 0.5, 0.45, 0.25, 0.15, 0: level 4 is no longer let off with a
    dropped piece); `margin` 90, 80, 65, 45, 35; `PLAY_MARGIN` { 5: 45, 6: 20 } (was 90
    and 35). `LEVELS` in js/engine.js did not change: no level thinks longer.

    AFTER (v192), `node tools/measure-game.mjs <dir>`, the default 312 games, 24 a pairing.
    Compare with the v191 table in the next entry (its steps: 65, 85, 58, 92, 83, 92, 94%):

    | level | cp/move | moves losing 100+ | games with a 300+ drop | vs level below | vs level 8 | ms/move |
    |---|---|---|---|---|---|---|
    | 1 | 61.3 | 22.6% | 33% | - | 0-0-24 | 350 |
    | 2 | 50.0 | 16.3% | 24% | 75% | 0-0-24 | 349 |
    | 3 | 36.3 | 10.5% | 15% | 92% | 0-0-24 | 348 |
    | 4 | 26.5 | 4.9% | 0% | 77% | 0-0-24 | 340 |
    | 5 | 20.8 | 2.1% | 0% | 75% | 0-1-23 | 347 |
    | 6 | 13.1 | 1.0% | 3% | 90% | 0-3-21 | 473 |
    | 7 | 7.7 | 0.3% | 2% | 83% | 0-11-13 | 758 |
    | 8 | 3.8 | 0.1% | 0% | 77% | - | 1092 |

    Steps now 75 to 92% (were 58 to 94%). Level 7 drew 11 of 24 against level 8 (was 3).
    No level allowed a mate in one. Every level from 2 to 7 is HARDER than in v191, levels
    4 and 6 the most (cp/move 37 to 27 and 19 to 13).
  - **READ THE NOISE BEFORE TUNING AGAIN.** 24 games give a step to about +-10 points. Level
    1 never changed and read 65, 65, 75 and 61 cp/move in four runs; level 2 with the SAME
    settings scored 79%, 88% and 75% against level 1; the step 2 to 3 read 94%, 75% and
    92% at the same cp/move. So the 92% and 90% above are not proof those steps are too
    big. cp/move (thousands of moves) is the steadier guide: aim at 61, 50, 36, 26, 18, 12,
    7.5, 4 and judge a step only from several runs together. A 12-games-a-pairing run
    misled this session about the middle levels: do not use fewer than 24.
  - **Level 7 and thinking time (decision b):** level 7 with level 8's 1200 ms scored the
    same against level 8 as with 800 ms (3 draws in 12 both). Time buys nothing there; the
    margin does (35 to 20 cp: 3 draws in 24, then 11 in 24). "rel. Elo" is still an order
    and a distance, NOT a rating; a desktop PC, an upper bound for a phone.
  - **The Openings trainer (decision c): out of its book it now calls `playMove` too**
    (`Trainer.computerMove` in js/app.js, grep "out of book → engine"), where it played
    the limiter alone. It was not measured in the trainer itself: the same call was
    measured in v189/v190 (270 to 430 cp gone in 12 moves, a queen or a mate in 10 to 20%
    of games). `Trainer.guardSearch`, `Trainer.scoreAfter`, `Trainer.closeGuard`; the
    second engine `Trainer.guardEngine` exists only once a game has left its book, never
    at the top level, and is let go on game over, the back button, "to Analysis" and a
    new game. `closeGuard` STOPS the engine before terminating it: `Engine.terminate()`
    drops a search without answering, which would leave `computerMove` waiting for ever.
    (`Play.closeOpening` terminates outright; `Play.begin` resets `thinking`, so Play
    does not freeze, but its abandoned `engineMove` never finishes.)
  - **tools/measure-game.mjs:** a trial side (`VARIANTS`) now runs its two searches at the
    same time, as the app does. **New: `node tools/cdp-verify-trainer-guard.mjs`**: a
    trainer game past a four-ply book at levels 1, 4, 6 and 8, replies in their time, the
    second engine held and let go, and leaving mid-thought then starting again.
  - **Verified:** test:tree 286 (was 285), test:precache OK 51; `measure-opening.mjs` with
    `APP_BOOK=1`: behind@12 114, 100, 92, 70, 40, 39, 11, -36 cp (v191: 103, 97, 78, 70,
    45, 37, 23, -32; that code did not change, 24 games' noise); `cdp-verify-play-opening.mjs`,
    `ONE=1 cdp-verify-offline-engine.mjs` and `cdp-verify-trainer-guard.mjs` ALL PASSED.
    Replies on this PC: 310 to 320 ms at levels 1 to 5, now and then 615; 510, 760, 1210.
  - **Still open:** strength, reply time and the memory of the second engine on a REAL
    PHONE, now in the trainer as well as in Play: never measured.

- **PLAY: THE WHOLE GAME - MEASURED, THEN A SECOND LOOK AT EVERY MOVE (2026-10-12, v191).**
  The opening was fixed in v190 (next entry); from its 13th move the engine still played
  the raw strength limiter. Measured first, Adrian approved "all as recommended", built.
  - **The tool: `node tools/measure-game.mjs <outDir>`** (headless Chrome, the app's own
    `js/engine.js` and `js/play-book.js`). WHOLE games, both sides taking their moves as
    `Play.engineMove()` does. Default: every level against the next one up and against
    level 8 (which IS full strength), 24 games a pairing, 312 games, 50 to 80 minutes.
    A separate full-strength judge (300 ms) scores every non-book move. A game stops once
    decided (8 plies at 900+ cp). `GAMES`, `SLOTS`, `PAIRS=lv1-lv2,...`, `TAG`; `OLD=1`
    plays the rest of the game as before this entry (the limiter alone); `VARIANTS=<json>`
    adds trial sides (see `__trial` in the tool). Mistakes are counted after a side's 12th
    move and only while the game was open (mover between -600 and +600 before the move).
    **"rel. Elo" is fitted from these games only: an ORDER and a distance, NOT a rating.
    A desktop PC: an upper bound for a phone. No phone was measured.**

    BEFORE (v190, the limiter alone after move 12):

    | level | cp/move | moves losing 100+ | games with a 300+ drop | games with a 600+ throw | vs level below | vs level 8 |
    |---|---|---|---|---|---|---|
    | 1 | 83.5 | 21.5% | 50% | 21% | - | 0-0-24 |
    | 2 | 72.2 | 20.4% | 43% | 11% | 58% | 0-0-24 |
    | 3 | 57.8 | 17.4% | 50% | 10% | 65% | 0-1-23 |
    | 4 | 55.8 | 17.4% | 31% | 10% | 67% | 0-0-24 |
    | 5 | 51.2 | 15.2% | 35% | 14% | 67% | 0-0-24 |
    | 6 | 46.6 | 12.4% | 39% | 14% | 71% | 0-0-24 |
    | 7 | 35.6 | 9.1% | 21% | 2% | 79% | 0-0-24 |
    | 8 | 3.5 | 0% | 0% | 0% | 100% | - |

    AFTER (v191):

    | level | cp/move | moves losing 100+ | games with a 300+ drop | games with a 600+ throw | vs level below | vs level 8 | ms/move |
    |---|---|---|---|---|---|---|---|
    | 1 | 64.9 | 23.2% | 33% | 0% | - | 0-0-24 | 346 |
    | 2 | 60.3 | 21.3% | 29% | 1% | 65% | 0-0-24 | 348 |
    | 3 | 41.1 | 13.5% | 13% | 1% | 85% | 0-0-24 | 351 |
    | 4 | 36.8 | 9.6% | 14% | 0% | 58% | 0-1-23 | 350 |
    | 5 | 24.2 | 4.6% | 1% | 0% | 92% | 0-1-23 | 344 |
    | 6 | 19.1 | 1.8% | 1% | 0% | 83% | 0-1-23 | 473 |
    | 7 | 10.9 | 0.4% | 0% | 0% | 92% | 0-3-21 | 755 |
    | 8 | 3.7 | 0% | 0% | 0% | 94% | - | 1088 |

    Worst before: level 1, a rook up, promoted to a KNIGHT on move 29 and was mated in two;
    level 6 ("Expert 2200-2500"), level game, took a rook with its queen on move 44 and
    was lost at once; level 4, level game, walked its king into a mate in three on move 37.
    Levels 3 to 6 were nearly one player. After: no mate in one allowed by any level in
    312 games; the two 600+ moves left are the guard's 300 ms search and the judge
    disagreeing.
  - **A trial run (192 games) chose the design.** The guard alone for the whole game is
    far too strong at the bottom (its "level 1" gave away 24 cp a move and outplayed the
    old level 7) but is the only thing that closes the gap to level 8. Refusing the
    limiter's bad moves keeps the varied play. EVERY fix makes every level stronger: the
    old levels lose to the new ones about 11 games in 12.
  - **What was built, `playMove` in `js/play-book.js`** (10 new tests, 24 in the file):
    - Levels 1 to 5 (`VETO`): the limiter chooses AND, at the same time on the second
      engine, a full-strength search lists the 4 best moves. The limiter's move stands
      unless it costs more than `refuse` (280, 240, 190, 160, 120 cp). A costlier move is
      still played `through` of the time (0.5, 0.45, 0.25, 0.15, 0) while it costs under
      `THROUGH_MAX` (600): a piece goes, a queen or a mate does not. Otherwise
      `pickGuarded` replaces it. A move the search did not list is scored by one more
      search (`Play.scoreAfter`), so that reply can take twice the level's time.
    - Levels 6 and 7 (`PLAY_MARGIN` 90 and 35 cp): the guard for the whole game; the
      limiter is not asked.
    - Level 8: unchanged, and it alone lets the second engine go after move 12.
    - `Play.engineMove()` calls it after `openingMove`, also from a set-up position
      (`startFromFen`), and falls back to the limiter if the second engine fails.
      **`Play.openEngine` now lives to the end of the game** (was: 12 moves). Its memory
      was NOT measured.
  - **The level buttons no longer show a rating.** `range` is gone from `LEVELS`; the
    buttons read the name and "Nivel N" / "Level N" (`level_n` in i18n). No honest Elo can
    be measured offline and the old numbers were wrong from level 4 up.
    `node tools/cdp-verify-play-levels.mjs <outDir>` checks it at 375px, light and dark,
    Spanish and English (all four pictures opened and looked at).
  - **Not changed:** Endings and the lessons (they never used the limiter: full strength,
    `THINK_MS`), and the Openings trainer out of its book, which still calls
    `engine.bestMove(fen, {movetime, elo})`, the limiter alone, by Adrian's decision.
  - **Verified:** test:tree 285 (was 275), test:precache OK 51; `measure-opening.mjs` with
    `APP_BOOK=1`: behind@12 103, 97, 78, 70, 45, 37, 23, -32 cp, the same as v190 within
    the noise of 24 games (level 4 read 50 then, 70 now; that code did not change);
    `cdp-verify-play-opening.mjs` (updated: second engine kept after move 12, top level
    lets it go, set-up position checked by it) and `ONE=1 cdp-verify-offline-engine.mjs`
    ALL PASSED. Replies on this PC: 310 to 315 ms at levels 1 to 5, now and then 615.
  - **Still open:** (1) the steps are uneven: 2 to 3 and 4 to 5 are big (85%, 92%), 3 to 4
    is small (58%), and 7 to 8 is still 3 draws in 24; the settings are from ONE run.
    (2) Strength, reply time and memory on a real phone: not measured. (3) The Openings
    trainer still has the old behaviour.

- **PLAY: THE ENGINE'S OPENING - MEASURED, THEN A BOOK AND A GUARD (2026-10-11, v190).**
  Adrian: "Many users have report that the engine is playing worst than the ELO stablished."
  Measured first, he approved "all as recommended", then built. No screen changed.
  - **The cause, measured: the strength limiter (`UCI_LimitStrength` / `UCI_Elo`), NOT the
    thinking time and NOT the lite build.** Full strength at 60 ms plays a clean opening;
    Elo 1320 with 1500 ms is as bad as with 300.
  - **The tool: `node tools/measure-opening.mjs <outDir>`** (headless Chrome, the app's own
    `js/engine.js`). 24 games per row, 12 as each colour, the level's first 12 moves; the
    opponent plays `js/openings-eco.js` lines (seeded dice) and then full-strength moves; a
    SEPARATE full-strength engine scores before and after every move (400 ms). `APP_BOOK=1`
    takes the move from `js/play-book.js` as `Play.engineMove()` does; `TAG`, `ONLY`,
    `GAMES`, `SLOTS`. About 18 minutes for all 16 rows. cp = centipawns, 100 = a pawn.
    "behind" = median score against the level after its 12th move; "lost/game" = the sum
    of what its moves cost; "lost by 12" = games 200+ cp down; "slip<=5" = a 50+ cp move
    in its first five.

    BEFORE (commit c5ba6f3, v189):

    | row | behind@12 | lost/game | 100+cp moves/game | lost by 12 | slip<=5 | 1st move ms |
    |---|---|---|---|---|---|---|
    | Level 1 (1300-1450) | 376 | 427 | 1.2 | 88% | 33% | 523 |
    | Level 2 (1450-1600) | 373 | 403 | 0.8 | 71% | 29% | 501 |
    | Level 3 (1600-1800) | 255 | 283 | 0.5 | 54% | 25% | 478 |
    | Level 4 (1800-2000) | 279 | 320 | 0.6 | 67% | 58% | 477 |
    | Level 5 (2000-2200) | 262 | 316 | 0.8 | 71% | 42% | 480 |
    | Level 6 (2200-2500) | 197 | 274 | 0.5 | 46% | 54% | 692 |
    | Level 7 (2500-2800) | 250 | 300 | 0.7 | 67% | 46% | 981 |
    | Level 8 (2800+) | -33 | 35 | 0 | 0% | 0% | 1377 |
    | Full strength, 300 ms | -4 | 45 | 0 | 0% | 0% | 485 |
    | Full strength, 500 ms | -25 | 39 | 0 | 0% | 0% | 662 |
    | Full strength, 800 ms | -24 | 33 | 0 | 0% | 0% | 971 |
    | Elo 1320 with 1500 ms | 318 | 367 | 0.9 | 75% | 46% | 1659 |
    | Elo 2000 with 1500 ms | 203 | 269 | 0.5 | 50% | 25% | 1672 |
    | Elo 1320 with 60 ms | 313 | 362 | 0.8 | 71% | 25% | 235 |
    | Elo 2000 with 60 ms | 286 | 322 | 0.7 | 67% | 33% | 213 |
    | Full strength, 60 ms | 7 | 57 | 0 | 0% | 0% | 241 |

    AFTER (v190, `APP_BOOK=1`, the eight levels):

    | row | behind@12 | lost/game | 100+cp moves/game | lost by 12 | slip<=5 | 1st move ms |
    |---|---|---|---|---|---|---|
    | Level 1 | 116 | 166 | 0 | 4% | 13% | 302 |
    | Level 2 | 94 | 132 | 0.1 | 0% | 8% | 301 |
    | Level 3 | 90 | 130 | 0 | 0% | 13% | 301 |
    | Level 4 | 50 | 100 | 0 | 0% | 4% | 302 |
    | Level 5 | 63 | 104 | 0 | 0% | 4% | 302 |
    | Level 6 | 31 | 82 | 0 | 0% | 4% | 301 |
    | Level 7 | 27 | 67 | 0 | 0% | 0% | 302 |
    | Level 8 | -40 | 32 | 0 | 0% | 0% | 302 |

    Worst before: level 4 hung a knight on move 2 (1.e4 Nf6 2.e5 a5); level 2 got its queen
    trapped by move 9 (1.Nf3 Nf6 2.c4 c5 3.e3 e6 4.d4 d5 5.Bd3 dxc4 6.Qa4+ Bd7 7.Bc2 b5);
    level 5 answered 1.Nf3 with 1...a5 and lost its queen on move 9. Worst after: one 179 cp
    move at level 1 (the guard's 300 ms score and the judge's disagreed), nothing else over
    134.
  - **What was built. `js/play-book.js`** (new, imports only `openings-eco.js`, 14 unit
    tests in `tests/unit/play-book.test.js`): `openingMove({ sans, level, topMoves })` for
    the engine's first `OPENING_MOVES` (12) moves of a game from `START_FEN`. (1) BOOK:
    `pickBookMove` plays a move of `openings-eco.js`, weighted by how many lines play it;
    a move only one line plays is skipped while a better-trodden one exists (no 1.g4).
    (2) GUARD, out of book: a FULL-strength search for the 4 best moves (`GUARD_LINES`)
    and `pickGuarded` plays one within the level's margin (`GUARD_MARGIN` 90, 80, 65, 50,
    40, 30, 20 cp; the top level has none), the better ones more often, and only the best
    once the engine stands below `GUARD_FLOOR`. (3) After move 12, or from a set-up
    position (`startFromFen`), the limited engine exactly as before.
  - **`Engine.topMoves(fen, { movetime, count })`** in `js/engine.js` (new, additive;
    `bestMove` and `evaluateBest` are untouched, so Endings, the lessons and the Openings
    trainer get what they got). **Play keeps a SECOND engine for it, `Play.openEngine`**
    (`openingSearch` / `closeOpening`), because this build needs a fresh worker whenever
    MultiPV changes; it is let go after the opening, on finish, on back and on a new game.
    `Play.begin` starts the main engine in the background so move 13 does not wait for it.
    `REPLY_MS.playBook` = 300 is the wait before a book move. `engineMove` now also drops a
    reply that arrives after a new game has begun (`this.chess !== chess`).
  - **Verified:** test:tree 275 (was 261); test:precache 51 files (was 50, `play-book.js`);
    `node tools/cdp-verify-play-opening.mjs` (new): 15 replies in a row at levels 1, 1, 5
    and 8, every wait within the level's time (313-330 ms at 300; one ~440-460 ms move when
    the guard's worker starts), the engine's first move after 313-315 ms (was 477-523), the
    opening engine gone after move 12, a set-up position left to the limited engine;
    `ONE=1 tools/cdp-verify-offline-engine.mjs` all passed (Play answers offline after an
    update).
  - **NOT done, NOT measured:** (a) **everything from move 13 on is the old limiter**, which
    is what gave pieces away; whether a level is worth its `range` text over a WHOLE game is
    unknown, and the `range` texts were left alone on purpose (Adrian's decision d) until
    that is measured. (b) A real phone: every number above is a desktop upper bound; the
    "60 ms" rows only imitate one. (c) The guard margins are a first setting, not tuned
    beyond this one run. (d) Starting a new game through `Play.begin()` while the game
    review of the last one is still grading collides on the shared engine (seen only in the
    harness, by calling `begin` under the open review; not reachable by hand as far as
    checked, not fixed).

- **SIMULS IN STUDENTS: THE SPEC IS WRITTEN, NOTHING IS BUILT (2026-10-11, documents only,
  no version bump).** `docs/superpowers/specs/2026-10-11-students-simul-design.md`: a teacher
  plays up to 10 of their own active students at once. All twelve decisions carry Adrian's
  answers; the ones he changed from the recommendation: the handicap is ANY pieces, any
  number, set per student (not only a rook); an opening and a handicap may be combined when
  the line is still legal; students can watch the other boards at any time.
  - **Facts found, different from what the prompt assumed:** `Play` has NO clock (the only
    shared clock is Duel's `clockOffset` / `syncPulsoClock`); there is no human-against-human
    game anywhere (15 `match` blocks in `firestore.rules`, none a game), so this is the
    app's first; `vendor/chess.js` accepts a start position with pieces missing but does
    NOT object to a castling right whose rook is gone, so the app must remove it.
  - **Design in one line:** one document per pair, `simulGames/{teacherUid}_{studentUid}`,
    reused; one write a move; each move settles the previous move's clock from two server
    stamps; each phone checks the other's move and a bad one voids the board.
  - **Cost, counted not measured:** about 840 writes and 1,700 reads for a 10-board simul of
    40-move games, so roughly 20 a day for the whole app on the free plan. Conversation 2
    of the plan measures it.
  - **Next:** conversation 1 was built on 2026-10-12 (entry near the top of this list).

- **LEADERBOARDS: FIVE BOARDS IN TWO ROWS, SEALED MOVES ELO NOW PUBLIC (2026-10-11, v189).
  COMMITTED; the push waits for Adrian's `npm.cmd run rules:deploy` (the rules changed).**
  - **Adrian's decision, which overrides the v187 entry below and spec 3d:** the boards are
    Puzzle ELO, Blindfold ELO, Sealed Moves ELO, Puzzle Rush 3 min and 5 min. Nothing else.
    He turned down boards for Opening/Endgame ELO, streak, best streak and Duel; the
    coordinate trainer gets none either. Do not propose them again unasked.
  - **Layout he approved from screenshots:** no ELO/Points switch. `.seg.lb-modes`
    (`css/style.css`, the same six-column grid as `.seg.puzzle-modes`): the three ELO boards
    on the top row, the two Rush boards under them, `.seg.lb-period` (All time / This month)
    under those on Rush boards only. Same markup in `#leaderboard-mode` and `#flb-mode`.
    Short button texts `lb_puzzle_elo`, `lb_blindfold_elo`, `lb_calc_elo`, `lb_rush_3min`,
    `lb_rush_5min` (`js/i18n.js`); tightest label has 23px to spare when bold at 375px.
  - **Publishing:** `calcElo` is in `PUBLIC_ALWAYS_KEYS` (`js/firebase.js`), so it goes out
    for private profiles too, like `puzzleElo` and `blindfoldElo`. It is saved only from the
    first rated puzzle, so until then a player is not on that board. The history, attempt
    count and solved map stay unpublished. `firestore.rules` `/leaderboard/{uid}`: `calcElo`
    in `hasOnly`, `num(0, 4000)`. Seven new tests in `tests/rules/existing.test.js`
    (test:rules 442 pass). No index needed: one-field sorts use the automatic index.
  - **`js/leaderboard.js`:** `LEADERBOARD_FIELDS.calcElo` has `fallback: null`; `lbValue()`
    prints a dash for it and the friends board sorts those rows last. `lbPeriodSync()` is
    shared by both screens and fixes the old global-board bug where the switch stayed lit on
    "This month" after leaving a Rush board. Firestore leaves a document with no value for
    the sort field out of an `orderBy` query, so the global board lists only rated players.
  - **Verified:** `node tools/cdp-verify-leaderboards.mjs <outDir>`, 141 of 141, at 375px,
    ES and EN, light and dark, every button really tapped on both screens, screenshots
    opened. test:tree 261 pass, test:precache OK (50 and 142).
  - **NOT verified (the tools are signed out and App Check refuses them):** that `calcElo`
    really lands on the public document, and real rows coming back for any board. First
    signed-in look at the Sealed board on a phone settles both.
  - **Not done, not asked:** the public profile still shows four ELO cards, no Sealed Moves
    one. Seen in the screenshots and not checked against the old version: on the friends
    leaderboard the watermark logo is drawn over the rows.

- **SEALED MOVES: ITS OWN PRIVATE RATING, NO REPEATS, THE LOG, "OPEN IN ANALYSIS" AND KAEL'S
  FIRST-TIME EXPLANATION (2026-10-10, v187). Conversation 3 of 3, the last, of
  `docs/superpowers/specs/2026-10-10-calculation-mode-design.md`. The mode is complete.**
  - **The rating arithmetic is now ONE function:** new `js/elo.js` (`eloAfter({elo, rating,
    win, attemptCount, factor = 1})`, `eloK`, `eloExpected`, `ELO_FLOOR`), imports nothing.
    `Puzzles.recordResult()` calls it for the rating and for each theme's; its numbers are
    unchanged (`tests/unit/elo.test.js` holds it to the old inline formula over 672 cases,
    and the calc tool pays four results live and compares). Blindfold keeps its own
    `js/blind-elo.js` (K 32, paid by seconds).
  - **What a result pays, pure, in `js/calc.js` (41 tests now):** `calcStartElo(puzzleElo)`
    (minus 200, floor 600), `calcPay({elo, rating, attemptCount, verdict, hinted})`: failed
    loses what Puzzles loses; solved gains what Puzzles gains; perfect 1.25 times that; a
    solve with a hint HALF and never the bonus. The factor multiplies the whole gain, the
    fast first ten (K 192) included. `calcFresh(list, solved)` and `calcAnalysisTree()`.
  - **Keys:** `calcElo`, `calcEloHistory`, `calcAttemptCount`, `calcSolved` ({id: 1} solved,
    {id: 2} perfect, never lowered), all four in `SYNCED_KEYS`. No rules change. `calcElo` is
    NOT saved until the first puzzle is paid: until then the rating shown is the puzzle
    rating minus 200, read again at every Next. `CalcUI.reload()` re-reads them in
    `Auth.onChange`, beside the Puzzles ones. Still not a domain: off the radar, the
    leaderboard, the profile cards and the teacher's view.
  - **When it is paid (decision a):** at the hand-in that ends the puzzle, in full. The one
    exception: a perfect solve that has variations for the engine is paid as a PLAIN solve
    at once and gets the bonus when the engine has found nothing wrong (`CalcUI.settle()`,
    which re-pays from the same starting rating, so the puzzle is counted once). The number
    can go up a second later, never down. A corrected variation keeps the plain amount. A
    variation the engine could not check (no engine, the player left or tapped Next first)
    does NOT cost the bonus, the same benefit of the doubt the verdict already gave.
  - **Where it is shown (decision b):** `#calc-rating`, at the right end of Kael's line: the
    Puzzles pills a size smaller, the change over the rating. Measured at 375x667: 48x36px,
    the line stays 36px, tree 132px, board 259px, so it costs no height. It narrows Kael's
    text by 56px: the long result sentences are three lines there (51px) and the board is
    then 244px. A tap opens the rating's sheet (`CalcUI.openProgress()`): rating, solved and
    perfect counts, this session's dots, "See the chart" (`openEloHistoryModal`, share off).
  - **The log:** `PuzzleLog` has a `calc` list. There is no row for a strip under this
    board, so the strip (`#calc-log`) is drawn inside the rating's sheet; a dot reopens its
    puzzle as in Puzzles. A perfect solve's dot has a star. `PuzzleLog.add()` now returns
    its entry, so the bonus can bring the dot up to date.
  - **Open in Analysis (decision c):** `#calc-analyze` (the Puzzles icon), between the gear
    and Next, only after the hand-in. `Analysis.loadTree()` gets the puzzle's line as the
    main line with everything the player wrote differently as variations.
  - **Picking:** around the mode's own rating plus its difficulty; solved puzzles are left
    out while an unsolved one is in the pool (the same 300-point window as before).
  - **Also:** a solve counts for the daily streak, as in every other puzzle mode (a failed
    one does not). Time on the screen is puzzles time (`AREA` in `js/activity.js`). Kael's
    explanation shows the first time the mode is opened on a device (`localStorage`
    `calcIntroDone`, like the tour's flag; `icons/kael/kael-bust.png`). The difficulty text
    in the settings sheet now names this mode's rating.
  - **Verified:** test:tree 261 of 261, test:precache OK (50 files, `js/elo.js` is the one
    more, and 142), `tools/cdp-verify-calc.mjs` 280 of 280 (it sets the puzzle rating to
    1460 and checks every amount against `calcPay`), `tools/cdp-verify-puzzle-modes.mjs`
    70 of 70, `tools/cdp-verify-swipe-modes.mjs` 193 of 193 (run this time, against a local
    server with /sw.js refused). The two mode tools and the swipe tool now mark the
    explanation as seen. Screenshots at 375, light
    and dark, ES and EN, opened and looked at. `firestore.rules` untouched, test:rules not
    run.
  - **NOT verified:** sync. The tools are signed out, so nothing was written to or read from
    Firestore: that the four keys are in `SYNCED_KEYS` and are re-read in `Auth.onChange`
    was checked by reading the code only. Nobody has tried the mode on a real phone yet.
  - **Adrian saw the screenshots and said yes (2026-10-10)** to a, b and c as built, to the
    log living in the rating's sheet, and to solves counting for the streak. Closed.
  - **v188, same day:** Adrian found the envelope on the mode chip too small beside the
    other symbols. It was the plain text glyph; `mode_calc` now has U+FE0F after it, so the
    emoji is drawn, the size of the others. Label still whole at 375 and 360
    (puzzle-modes 70 of 70). Seen in headless Chrome on Windows only: a phone draws its
    own envelope.
  - **Not built, on purpose:** share (left for later by Adrian), the timer (dropped).

- **SEALED MOVES: THE ENGINE ON SIDE VARIATIONS, ITS OWN THEME / DIFFICULTY / AUTO-NEXT, AND
  THE HINT (2026-10-10, v186). Conversation 2 of 3 of
  `docs/superpowers/specs/2026-10-10-calculation-mode-design.md`.**
  - **The engine, read before the rule was written:** `Engine.evaluate()` gives centipawns
    from WHITE's side, with a mate folded into about 10000 (9999 for a mate on the board).
    New `Engine.evaluateBest(fen, movetime)` → `{score, best, ok}` is the same search with
    the engine's move as well; `evaluate()` now calls it. `ok` is false when the engine
    died or was stopped before it had a score. The app's ONE engine is handed over by
    `CalcUI.init(engine)`; it is still not exported.
  - **Rule and list, pure, in `js/calc.js` (30 tests):** `calcSideOk(best, after, turn)`
    (within 100 of the engine's best, or +300 or more for the player, a mate passing as
    winning) and `calcToJudge(tree, marks, cap = 8)` → `{judge, over}`: the player's own
    moves off the main line, top to bottom. What follows a WRONG own move on the main line
    is not a variation and is not judged.
  - **At hand-in (`CalcUI.judge()`):** the result is drawn first, then each listed move:
    a mate is right with no engine; else one 250 ms search of the position it was played
    in, right at once if it is the engine's own move, else a second 250 ms search of the
    position after it and the rule. Wrong = red, the engine's move beside it (`.calc-fix`,
    "✓ Cc6"), `perfect` becomes `solved`, never failed. Waiting chips are dashed and pulse
    (`checking`). The engine refused, silent for 20 s on the first search or 4 s on a later
    one, or any `showScreen()`: the rest stay grey. The opponent's replies in a variation
    are never judged and are now drawn plain (`reply`), so grey means only "a move of yours
    that was not checked".
  - **Its own settings:** kv `calcTheme` ('random' or an array of theme ids),
    `calcDifficulty`, `calcAutoNext`; not synced (the Blindfold pair is not either).
    `Puzzles.openOptions()` took two more optional arguments, `theme: {label, pick}` (a
    first row that opens the picker) and `hints` (the two small texts), so nothing was
    copied. A new theme brings a puzzle at once, as in Puzzles. Auto-next waits for the
    engine, and does NOT fire after a failed puzzle, when a variation was corrected, or
    while a chip is being looked at on the board.
  - **Layout, measured at 375x667:** no new row. The action row is ⌫ 🔍 💡 ⚙ at 42x44 and
    "Entregar" at 97px, Kael's 58px still free; after the hand-in it is ⚙ and "Siguiente".
    The tree is still 132px and the board 259px. The icons are the Puzzles ones (🔍 hint,
    💡 solution). Adrian saw the screenshots and said yes to this placement (2026-10-10).
  - **Decided by Adrian the same day, for conversation 3:** (b) a solve with a hint pays
    HALF the normal rating gain and no perfect bonus; it is not a failed puzzle. (c) time
    in this mode IS counted in `js/activity.js`, as puzzles time. From spec 3g: the log
    and an "open in Analysis" button go into conversation 3; the timer is dropped; share
    is left for later. He also accepted the auto-next rule below as built.
  - **Hint (`CalcUI.hint()`):** only for the selected EMPTY step of the main line (the
    path to it is the puzzle's line): flashes the from-square on the frozen board and Kael
    says the square, because the piece may not be standing there on the board. Sets
    `CalcUI.hinted`, which costs "perfect". Anywhere else it is refused with a toast and
    costs nothing. KNOWN: a refusal tells the player that the line they wrote has left the
    puzzle's. Whether a hint should also cost rating is decision b, for conversation 3.
  - **Verified:** test:tree 249 of 249, test:precache OK (49 and 142, no new file),
    `tools/cdp-verify-calc.mjs` 148 of 148 twice (it now takes about four minutes and
    really runs Stockfish; for "the engine cannot start" its own server refuses the engine
    file), `tools/cdp-verify-puzzle-modes.mjs` 70 of 70, no console errors. Screenshots at
    375, light and dark, ES and EN, opened and looked at. NOT run: cdp-verify-swipe-modes.
  - **Not built, for conversation 3:** `calcElo` and friends, `SYNCED_KEYS`, picking by its
    own rating, not repeating solved ones, Kael's first-time explanation. Still picks
    around `puzzleElo` (`CalcUI.elo`). Analyse, share, timer and log from spec 3g are not
    built either.

- **SEALED MOVES / JUGADAS SELLADAS, THE FIFTH PUZZLE MODE: THE CORE (2026-10-10, v185).
  Conversation 1 of 3 of `docs/superpowers/specs/2026-10-10-calculation-mode-design.md`.**
  Every id, key and file says `calc`; only the words on screen are the name.
  - **Built:** `js/calc.js` (the rules, imports only `js/tree.js`, 23 tests in
    `tests/unit/calc.test.js`) and `js/calc-ui.js` (`CalcUI`, the screen). `#screen-calc` in
    `index.html`; the fifth button on all five mode rows, three over two
    (`.seg.puzzle-modes` is now a six-column grid). The board is a `Board` with
    `interactive: false`: `CalcUI.tap()` reads the taps itself and checks them against the
    position the answer tree holds for the selected chip, not the one on the board.
  - **Rules as built:** the main line is the puzzle's own, graded with no engine; a
    different move that mates on the spot is right. ONE move of the player's own per
    position (a second, different one is refused with "delete it to change it"); any
    number of opponent replies, each its own row. Hand in: a wrong own move = failed (tree
    coloured, the puzzle's line shown, the board follows the tapped chip); right but short
    = Kael writes the puzzle's reply in with an empty slot, hand in again; whole line =
    solved, and perfect only on the first hand-in. Solution = failed. Side variations are
    drawn grey, "not checked" - the engine is conversation 2.
  - **Measured, not guessed:** "✉ Jugadas selladas" / "✉ Sealed Moves" fits its button
    whole (33px to spare at 375, 23px at 320), so the short label was not needed. With
    three buttons on top "⚡ Puzzle Rush", lit, had 0.4px to spare at 375 and none at 360,
    so the mode buttons are 13px type under 400 wide and 12px under 350. At 375x667 the
    tree keeps exactly three rows (132px) and nothing scrolls but the tree; the board
    gives way to make the room and is 259px there (full width on a taller phone).
  - **Not built, on purpose:** no rating, nothing saved, nothing synced; puzzles are picked
    around the PUZZLE rating (`puzzleElo`); no theme/difficulty/auto-next/hint; time in the
    mode is not counted in `js/activity.js` (Duel's is not either).
  - **Checked:** `test:tree` 242, 0 failures; `test:precache` OK, 49 imported files (47 +
    the two new ones), 142 art. New `tools/cdp-verify-calc.mjs` 76 of 76 (ES/EN, light/dark,
    375x667, every square, chip and button really tapped): one-move and three-move puzzles
    perfect, one failed, one finished through Kael's slot, a variation grey.
    `tools/cdp-verify-puzzle-modes.mjs` 70 of 70 (now five screens, and 360 wide added);
    `tools/cdp-verify-swipe-modes.mjs` 193 of 193 (the mode swipes as Puzzles does; its
    board keeps every touch). That swipe tool had been failing 4 Blindfold checks a pass
    since Blindfold got its start panel - it now presses Start, and needs a server:
    it does not serve the app itself. `test:rules` not run: no rules change.

- **MOVE FEEL: FASTER REPLIES, PIECES THAT SLIDE, NEW BOARD SOUNDS (2026-10-10, v181).**
  - **v183, SAME DAY: THE BOARD SOUNDS ARE NOW CC0 RECORDINGS ADRIAN CHOSE BY EAR.
    HE LISTENED TO EVERY FILE BEFORE IT WENT IN ("perfect, put them in") - CLOSED, do not
    propose another listening run.** Five files: `move` (simone_ds, freesound 366065, the
    knock at 18.72 s), `capture` (el_boss, 546120), `check` (el_boss, 546119), `castle`
    (the move knock twice), `promote` (Noted451, 530437, the hit at 4.35 s). Every source
    page was opened and shows Creative Commons 0. **The full table - file, source link,
    uploader, licence, what was cut and by how many dB - is `docs/sound-sources.md`; keep
    it in step with `sounds/`.** (v184: capture lowered again, now 12 dB under the others' peak - he heard v183 on his phone and chose it from two files. Then `check.wav` lowered to the capture's level, commit after 12b5579, pushed WITHOUT a version bump because another session held an uncommitted v185 in `sw.js`: phones get the new check sound with the next version, whoever ships it.) All at the same peak except capture, lower at his
    request. Cut from the public preview MP3s, not the original uploads. `sounds/` is 11
    files, 277 KB. `BOARD_SOUNDS` lists all five again, so check, castle and promotion
    have their own sound (one per move: check > promotion > castle > capture > move).
    `sounds-candidates/` (his audition folder, with the previews) is git-ignored.
    Checked: `cdp-verify-move-feel.mjs` 41/41 (each kind of move asks for its own sound,
    all 11 decode), `test:tree` 219, `test:precache` OK, `test:rules` 435, 0 failures.
    NOT tested: the sounds inside the app on his phone (he heard the files, not the app,
    which plays them at 60%); a capture that gives check plays the quiet check snap.
  - **v182, SAME DAY: THE FIVE NEW BOARD SOUNDS WERE WITHDRAWN. Adrian listened on his
    phone: "everything sounds horrible".** `sounds/move.wav` and `sounds/capture.wav` are
    back to the 3869b65 files; `check.wav`, `castle.wav`, `promote.wav` are deleted and out
    of the precache list (8 files, 141 KB again). A check, a castle and a promotion sound
    as a plain move or capture, as before v181: `BOARD_SOUNDS` in `js/move-feel.js` lists
    the kinds that have a file, and the board falls back for the rest - add a name there
    (plus the file, `SOUND_NAMES` and `sw.js`) when a good sound exists.
    `tools/make-sounds.mjs` now writes to a folder you name, never into `sounds/`.
    Faster replies, the slide, Web Audio playback and the precaching all STAY.
    Everything below about the five new sounds describes v181 only.
    Checked: `cdp-verify-move-feel.mjs` 41/41, `test:tree` 219, `test:precache` OK,
    `test:rules` 435, 0 failures. **ANSWERED ("the sounds are ok now") - see v183 above.** Was open: whether the six OLD sounds
    (puzzle right/wrong, win, lose, draw, Kael) also sounded bad in v181 - if yes, the
    Web Audio playback is the suspect, not the files; and where better board sounds come
    from (his own recording, or CC0 files he approves one by one). Code-made is ruled out.
  Spec, with Adrian's answers (a yes, b yes, c made by code, d yes, e yes):
  `docs/superpowers/specs/2026-10-10-move-feel-and-sounds-design.md`.
  - **The rules live in `js/move-feel.js`** (imports nothing; 10 unit tests in
    `tests/unit/move-feel.test.js`): `REPLY_MS` (one named wait per screen), `THINK_MS`,
    `SLIDE_MS` 200 + `SLIDE_EASING`, `moveSoundKind()` (one sound per move: check >
    promotion > castle > capture > move), `moveTraits()`, `castleRookMove()`, `SOUND_NAMES`.
    No screen carries a bare number any more; engine levels are `LEVELS` in `js/engine.js`.
  - **Wait from my move to the reply, measured before -> after** (`node
    tools/cdp-measure-reply.mjs`, headless Chrome, move CALLED through `board.onMove`):
    Puzzles reply 412-415 -> 270-278 ms (set 250); Puzzles opening move 604-613 -> 400-427
    (400); Rush reply 308-312 -> 154-170 (150); Rush solved -> next puzzle's opening move
    655-680 -> 476-487 (250 + 200); Blindfold reply 412-414 -> 415-416 (400, KEPT on
    purpose: its replies are heard, not seen); Openings book reply 461 -> 264-277 (250,
    timed with a SEEDED book: a fresh profile has no base); Endgames book reply 414-416 ->
    263-278 (250); Endgames engine reply 702 -> 402 (400); Play vs engine by level 0/2/4/7:
    304/504/803/2003 -> 303/304/303/1203. The measured numbers sit 15-28 ms above the set
    ones (was ~12 ms before); not chased. NOT timed live: Duel (needs two players; it is
    Rush's code through `Object.create(Rush)`, `NEXT_MS = REPLY_MS.rushNext`), Lessons
    engine reply (500 -> 300, read), Endgames opponent-first study (700 -> 400, read),
    Blindfold opening move (500, unchanged).
  - **Engine thinking time was cut and its effect on strength was NOT measured.** `LEVELS`
    movetime 300,400,500,600,800,1000,1500,2000 -> 300,300,300,300,300,500,800,1200. The
    Elo each level is told to play at is unchanged; a level may still play a little weaker.
  - **The slide** is `Board._slide()` in `js/board.js`, run AFTER `render()`: the piece is
    already on its new square and is only drawn offset from it (Web Animations), so the
    position never depends on the animation. Before v181 there was NO piece animation
    (the `.28s` rule near line 315 of the stylesheet is the side drawer). Skipped for a
    dragged piece (`_dropped`), with hidden pieces (Blindfold), on "reduce motion", and on
    a jump that is not a move out of the position on the board. Castling slides the rook
    too. A new position finishes any slide still running: in Rush/Duel the 150 ms reply
    arrives 50 ms before a TAPPED piece ends its slide, by design (lichess Storm does the
    same). No CSS was changed and there is no new Settings switch.
  - **Sounds: 11 files in `sounds/`, 247 KB (was 8 files, 141 KB), all .wav.**
    Licence and source of every one: **all made by code inside this project, nothing
    downloaded, nothing recorded, so no third-party licence applies.**
    `move`, `capture`, `check`, `castle`, `promote` (mono, 16-bit, 44.1 kHz): made by
    `tools/make-sounds.mjs` on 2026-10-10 (seeded, so `node tools/make-sounds.mjs` re-makes
    the same files; retune there). `puzzle-correct`, `puzzle-wrong`, `game-win`,
    `game-lose`, `game-draw`, `kael-pop`: unchanged from commit 3869b65 (2026-07-07), whose
    message says "Synthesized"; the script that made those was not kept.
    Checked and ruled out: lichess's standard move/capture sounds are listed as NON-FREE in
    its COPYING.md. No pre-move sound (Adrian's answer). Check sounds in Blindfold too.
  - **`js/sound.js` plays through Web Audio** (all 11 decoded at start, `Sound.preload()`),
    with the old `<audio>` path as the fallback while the context is not running.
  - **The sounds are precached now** (`ASSETS` in `sw.js`). Before v181 they were in no
    list: stored on first play, wiped at every update. A unit test fails if `sounds/`,
    `SOUND_NAMES` and the precache list ever differ.
  - **Verified:** `node tools/cdp-verify-move-feel.mjs <outDir>` 41/41 - a TAPPED e2-e4
    slides (200 ms, pawn drawn one square short at half time), a DRAGGED d2-d4 does not,
    the engine's reply slides, the rook slides on castling, each kind of move asks for its
    sound once, all 11 files decode, a pre-move queued during the shorter wait fires
    (Puzzles and Rush), Next during the wait leaves the new puzzle untouched (Puzzles), a
    solved Rush puzzle hands over cleanly, reduce-motion = no slide; Play, Puzzles, Rush,
    Blindfold, Endgames, Openings at 375 px x ES, EN x light, dark, 25 pictures looked at.
    `test:tree` 209 -> 219 pass, `test:precache` OK (46 -> 47 files, 142 art), `test:rules`
    435 -> 435 pass, 0 failures throughout.
  - **NOT tested:** what any sound SOUNDS like (no tool can; Adrian listens on his phone);
    Web Audio on a real phone, incl. after the app comes back from the background; the
    slide's smoothness on a real phone; Duel live; the Openings game with a real base;
    every move in the pictures except e2-e4 and d2-d4 was called, not tapped.

- **BLINDFOLD HAS ITS OWN THEME AND SETTINGS BUTTONS (2026-10-10, v180).**
  Spec, with Adrian's answers: `docs/superpowers/specs/2026-10-10-blindfold-theme-and-settings-design.md`.
  - **What it does.** On the Blindfold start panel, under the rating and above
    See position | List, one row: a wide theme button that says what is chosen
    ("🎯 Tema: Aleatorio", "🎯 Tema: Horquilla", "🎯 Temas: 3 elegidos") and the ⚙ square.
    They open the SAME two sheets the Puzzles screen uses (`Puzzles.openThemePicker(opts)`,
    `Puzzles.openOptions(opts)` now take whose values to show and where to store them).
  - **Everything is separate from Puzzles (Adrian's answer).** `Blind.themeFilter` (in
    memory only, like the Puzzles one), `Blind.difficulty` (kv `blindfoldDifficulty`),
    `Blind.autoNext` (kv `blindfoldAutoNext`). Neither kv is synced, same as the Puzzles
    pair. Before v180 Blindfold read `Puzzles.difficulty` and `Puzzles.autoNext`; it starts
    again at Normal / off for everyone.
  - **Which puzzles qualify** is `js/blind-pick.js` (imports nothing; 9 unit tests):
    themed puzzles within 300 points; under 10 of them, widen 100 at a time up to 600 and
    play what is there; none at all, a puzzle at the level without the theme and one toast
    (`blind_theme_none`), once per theme choice. A thin theme also loads rating files
    further out (`ensureForRating(target, 3)`) before settling. Rating and pay unchanged.
  - **Measured (30,000 puzzles):** targets 800-2300, every theme has 10+ within 300. With
    the widening to 600 no real theme comes out empty at any rating, so the toast is a
    safety net (a rating file that failed to load), not something a player normally sees.
  - **During a puzzle** nothing new: the old button is relabelled "⚙ Cambiar ajustes" /
    "⚙ Change settings" and still opens the start panel after the current puzzle.
  - **Verified** with `tools/cdp-verify-blind-theme.mjs` (54/54): 375px, light and dark,
    Spanish and English, See position and List, start panel and game, 16 screenshots opened
    and looked at; the taps and what was seeded are listed at the top of the tool.
    test:tree 200 -> 209, test:precache 45 -> 46 files, test:rules 435 (unchanged).
  - **Seen once, not chased:** on one run a tap on Go was reported as covered by another
    element (Kael's corner bubble is the likely one); it did not happen again in two runs.

- **KAEL INVITES THE USER TO THE DAILY REMINDER, ONCE (2026-10-09, v178).**
  Spec, with Adrian's answers ("all yes"): `docs/superpowers/specs/2026-10-09-reminder-invitation-design.md`.
  - **What it does.** A signed-in user whose reminder is plainly off gets Kael's dialog
    ("Today is done. If you have not trained by {h} tomorrow, shall I remind you?") with
    `Sí, avísame | Ahora no`. After finishing something (puzzle, Rush, Blindfold, endgame,
    lesson) it comes about 2 s later; when the day was credited by the 10th move on a live
    board (Play, Openings, Analysis) it waits for the next screen change. It also waits for a
    Rush run, a Pulso match, the streak celebration, a badge card, another dialog, and offline.
  - **How often.** Once; once more 7 days or more after a "Not now"; never a third time. A
    "Yes" closes it for good whatever the phone answers, and so does using the Settings switch
    by hand. Remembered on this device only: kv `remindAskCount`, `remindAskLast` (NOT synced,
    nothing in the cloud or the rules knows about it).
  - **The picture (v179, Adrian's request after seeing it on his phone).** The dialog shows
    Kael as the notification does, `icons/notif/daily.png`, in the usual `kael-portrait` tile.
    The first build had a 🦉 emoji, copied from the Blindfold hint warning; Kael is a horse.
  - **Who never sees it.** Every `Notifications.state()` except `off`: on, denied, signed-out,
    unsupported, failed, ios-needs-install.
  - **The phone's question** is asked only by `Notifications.enable()`, called inside the Yes
    tap. If it is refused, or the Brave road fails, Kael shows the existing `remind_denied` /
    `remind_failed` text with one button.
  - **Where.** `js/remind-invite.js` (new, imports nothing, in the precache list):
    `shouldInvite`, `MAX_ASKS`, `ASK_AGAIN_MS`. `RemindInvite` in `js/app.js` (`owe`, `soon`,
    `maybe`, `kael`); `Streak.recordActivity({ midGame })`; one call at the end of `showScreen`.
    Strings: `remind_invite_*` in `js/i18n.js`.
  - **Checked.** `test:tree` 191 -> 200 pass, 0 fail; `test:precache` OK (44 -> 45 files, 142
    art); `test:rules` 435 pass, 0 fail (rules untouched). `node tools/cdp-verify-remind-invite.mjs
    <outDir>`: 62 pass, 0 fail, screenshots at 375px in ES/EN, light/dark, opened and looked at.
  - **NOT proved by tools, owed from Adrian's phone:** that the phone's real permission
    question appears after "Yes" and not before, and that a reminder then arrives. Headless
    Chrome cannot show that question; its answer was supplied through CDP.

- **BLINDFOLD "LIST MODE": A SECOND WAY TO PLAY, ASKED FOR BY A TESTER (2026-10-09, v177).**
  Spec, with Adrian's answers: `docs/superpowers/specs/2026-10-09-blindfold-list-mode-design.md`.
  - **What it does.** The Blindfold start panel has a two-button switch, `👁 Ver posición |
    📋 Lista` (`👁 See position | 📋 List`), remembered on this device under `blindfoldMode`
    (NOT a synced key — nothing in the cloud or the rules knows about the mode). In list mode
    the position is never on the board: the player reads `Blancas: Rg1, Dd3, Ta1, … a2, b2`
    and `Negras: …` (Adrian's own format: one line a side, K Q R B N then bare pawn squares,
    letters in the app language), with "Last move: Black played Rxe5" above it, for up to
    60 s or until "✓ Estoy listo". Then the empty board, solved as before. A peek brings the
    LIST back for 30 s (same ready button), never the pieces; two peeks, same Kael warning.
  - **Pay.** Always as a 2-second look, however long the list was read: `BLIND_LIST_PAY_SECONDS`
    in `js/blind-elo.js`, passed to the unchanged `blindEloResult`. Same `'blindfold'` rating.
    The result line says "Lista: +14 normal, +14 extra"; list-mode dots in the strip carry 📋.
  - **Where.** `js/blind-list.js` (new, imports nothing, in the precache list):
    `blindPieceList`, `blindSanLocal`. `Blind` in `js/app.js`: `mode`, `listOnDone`,
    `showList`, `fillList`, `closeList`. The seconds picker is hidden in list mode (CSS class
    `list` on `.blind-time`).
  - **Mode 1 wording that changed:** the "Change time" button now reads "⚙ Cambiar modo o
    tiempo / ⚙ Change mode or time" (and its two follow-up lines say "start panel"); Kael's
    first-peek warning says "this puzzle's extra points". Nothing else in mode 1 changed.
  - **Checked:** test:tree 184 → 191 pass, 0 fail (7 new); test:precache OK, 43 → 44 imported
    files, 142 art files; test:rules 435 pass, 0 fail before and after (rules untouched).
    `node tools/cdp-verify-blind.mjs <outDir>`: 154/154 — the 74 mode-1 checks unchanged in
    what they pay and time, plus 80 list checks (`… <outDir> list` runs those alone) at 375px
    in ES and EN, light and dark, real finger taps; screenshots opened: the switch, the list,
    the longest list (32 pieces, seeded for the picture only), the list peek, the result line.
  - **Not measured:** whether a minute with a list is easier or harder than a 2-second look.
    The pay is that one constant.

- **DAILY STREAK REMINDER: PHONE TEST PASSED; GITHUB SKIPPED MOST HOURS, SO A CLOUDFLARE TIMER NOW STARTS THE JOB EVERY HOUR — DEFECT FIXED (2026-10-09, v176).**
  A real reminder reached Adrian's phone (Samsung, the TWA, account Zugzwang, 9-day streak,
  trained 8 Oct, not yet 9 Oct). **Every run that delivered was started BY HAND** (Actions
  page, Run workflow, "Count only" unticked). Only HANDOVER.md changed this session.
  - **Proved on the phone:** Settings shows "Daily reminder" under Privacy and above Lichess,
    reads On and stays On after two restarts. Hour set to 9:00; manual run #4 (14:43 UTC =
    09:43 Panama, green, 20 s): the notification arrived stamped 09:43. Text correct, English:
    "Your streak is waiting" / "Keep your 9-day streak alive: train today." The art is his
    (Kael); the app icon shows on the left. A tap opened the app and the notification went.
    Hour moved to 10:00; manual run #5 (15:05 UTC): a second reminder arrived. Run #6, one
    minute later in the same hour: nothing arrived — correct, `hoursToHandle` never repeats an
    hour.
  - **NOT proved, Adrian chose to stop here ("notification is working fine"):** (1) the buzz
    on the first reminder — his phone was on silent; (2) that the same-day repeat is silent —
    a WhatsApp message landed at the same moment, so the sound could not be attributed;
    (3) that training clears a showing reminder (`Notifications.clearDaily`) — not tried.
    The job's JSON line was not read for any run (the logs need a login); delivery is the proof.
  - **THE DEFECT, and the fix.** `cron: '17 * * * *'`, yet between the push of `782a8de`
    (8 Oct) and 15:10 UTC on 9 Oct GitHub started only TWO scheduled runs: #2 at 01:14 UTC and
    #3 at 07:27 UTC (one more, #7, came at 15:19 after a push). A run covers its own hour and
    the two before, so with 6-hour gaps most chosen hours were never sent.
    **Fix, Adrian's yes, free, no card: a Cloudflare Worker presses "Run workflow" hourly.**
    Worker `ctc-reminder-clock` in his Cloudflare account (free plan, the account that holds
    the domain's DNS), cron trigger `5 * * * *` (UTC), one secret `GITHUB_TOKEN` = a
    fine-grained GitHub token named `ctc-reminder-clock`, this repository only, Actions read
    and write, **no expiration**. It POSTs the workflow's `dispatches` endpoint with
    `dry_run: 'false'`; its public address answers 404. **Proved:** run #8 started at 16:05:49
    UTC as `workflow_dispatch`, green, with nobody pressing anything.
    `tools/reminder/cloudflare-clock.js` is a COPY of the Worker's code for the record —
    nothing deploys it; editing it changes nothing until it is pasted into Cloudflare again.
    **The workflow, `plan.mjs`, `send.mjs` and `due.mjs` were NOT changed.** GitHub's own
    schedule stays as a backup; the remembered hour stops doubles. Because of this the runs
    now show as "workflow_dispatch", not "schedule" — that is correct, not a fault.
    If reminders stop: Cloudflare, Workers & Pages (reach it by "Manage Workers" from the
    domain's Workers Routes page, or Compute in the account menu), the Worker's Observability
    tab shows "GitHub answered <status>"; 401/403 means the token was revoked or lost access.
    **Proved end to end the same day:** runs #8, #9, #10 started themselves at 16:05, 17:05,
    18:05 UTC with the Send step run; Adrian moved his hour to 14:00 and the reminder reached
    his phone at 14:05 Panama from the 19:05 UTC timer run, nothing pressed. (He first
    reported "no notification" at 13:00: his hour was still 10:00, already sent that day.)
  - **His request, BUILT the same day (v176):** the art looked too small. `icons/notif/daily.png`
    (192x192) already fills its square; the thumbnail size is the phone's. `showNotification`
    in `sw.js` now also passes `image: 'icons/notif/daily-wide.jpg'` (960x480, 44 KB, Kael on
    navy, made by `tools/resize-notif.mjs` from `Notification/Daily reminder.png`), which
    Android shows when the notification is EXPANDED. The collapsed thumbnail is unchanged and
    cannot be made bigger. `test:tree` 184/0, `test:precache` OK (43, 142), `test:rules` 435/0,
    before and after; the harness is now 44/44 (two new checks), 14 screenshots, the four
    signed-out Settings ones (375px, ES/EN, light/dark) opened and looked at — no screen changed.
    **Not yet seen on his phone.** Running the tool also rewrites `daily.png` with different
    bytes: `git checkout -- icons/notif/daily.png` afterwards.
  - **Play Store data safety: DONE by Adrian 2026-10-09.** Before: the form was complete with
    Personal info 4 of 9 (Name, Email address, User IDs, Other info), App activity 1 of 5 (App
    interactions), App info and performance 1 of 3 (Crash logs); **Device or other IDs was not
    declared.** Now: Device or other IDs — collected, not shared, not ephemeral, optional
    ("Users can choose"), purpose App functionality only. Saved, and "Submit 1 change for
    review" pressed; Managed publishing is off, so it goes live when Google approves.
    Where it lives now: `https://play.google.com/console/app/app-content/summary` (there is no
    "Policy" menu and no search box any more — do not send him to either).

- **DAILY STREAK REMINDER, TASK 4 OF 4: THE GATE IS GONE, THE SWITCH IS LIVE FOR EVERYONE — THE PHONE TEST IS STILL OWED (2026-10-08, `ace1290`, v175).**
  **Out of the plan's order, by Adrian's decision.** The plan said: remove the gate only after
  a real reminder reached his phone. He could not be due on 2026-10-08 (he had trained), and
  on his phone the Settings block was not showing at all even after opening `?remind=1`
  (cause never found: the live site served v174 correctly and nothing in the code strips the
  parameter; a sign-out wiping the local store is the likely start of it). He chose to remove
  the gate first and test the next day. `firestore.rules` and the indexes were not touched.
  - **What changed:** `js/notifications.js` lost the `preview` field, the two `remindPreview`
    lines in `init()`, the early return in `section()`, and `profileRow()` now just removes
    `hidden`. Grep `preview` in that file: no hits. The kv key `remindPreview` is no longer
    read; old devices keep a harmless leftover. `tools/cdp-verify-remind.mjs` no longer uses
    `?remind=1`; its first block now checks that a FRESH profile shows the Profile row and the
    Settings block and asks for no permission.
  - **Verified:** `test:tree` 184 pass, 0 fail; `test:precache` OK (43 imported, 142 art);
    `test:rules` 435 pass, 0 fail — same before and after. The harness: 42/42 PASS, 0 console
    errors, 14 screenshots (not 8); the 8 signed-out ones (Settings and Profile, 375px, ES and
    EN, light and dark) were opened and looked at.
  - **NOT PROVED — do not write this up as done:** no real reminder has reached any phone.
    On 2026-10-08 the only run of the job was the manual dry run (#1, 20:37 UTC, matched 0);
    no scheduled run had happened yet. Still owed, by Adrian, on a day he has not yet trained:
    (1) the switch reads On and stays On on his phone at v175; (2) he sets the hour (current
    hour if before minute 10, else the next), closes the app, and a reminder arrives after the
    minute-17 run — did it buzz, picture, text, does a tap open the app, does training clear
    it; (3) hour moved forward by one: the repeat arrives without a buzz. If nothing arrives
    in 45 minutes, read the run's JSON line (Task 3 entry below says what each number means).
    **If the test fails, put the gate back first (revert `ace1290`, bump the cache), then find
    out why.**
  - **Play Store data safety: NOT DONE, answer unknown.** Adrian still has to open Play
    Console, App content, Data safety and declare "Device or other IDs": collected, not
    shared, optional, purpose App functionality — and say what was there before. With the gate
    gone this matters for every user who switches the reminder on.
  - **Known limits (unchanged, see the Task 3 entry):** GitHub may start a run 10 to 30
    minutes late and **pauses the schedule after 60 days with no commit**; a red run emails
    Adrian; 00:00 in a half-hour zone is not sent; one late or missed reminder after a clock
    change; signing out turns the switch off on that device; Brave ships with "Use Google
    services for push messaging" OFF and the app shows "Could not turn it on" for ANY failure
    to switch on. `docs/superpowers/plans/2026-08-17-notifications.md` is marked superseded.

- **DAILY STREAK REMINDER, TASK 3 OF 4: THE HOURLY JOB IS LIVE AND REALLY SENDS (2026-10-08, `bb0c088`, no cache bump — v174).**
  `.github/workflows/streak-reminder.yml` runs at minute 17 of every hour on GitHub Actions.
  **No shipped file changed, `firestore.rules` and the indexes were not touched, nothing costs
  money.** The gate (`?remind=1`) is still on, so Adrian is the only user who can be reminded.
  Task 4 (his phone, the Play data-safety form, then removing the gate) is what remains.
  - **What exists:** `tools/reminder/due.mjs` (pure: `ENDPOINT_OK`, `MAX_SUBS`, `usableSub`,
    `localParts`, `isDue`, `hoursToHandle`, `hourIso`), `tools/reminder/plan.mjs` (decides the
    hours, remembers the new one BEFORE sending), `tools/reminder/send.mjs` (reads who is due,
    sends), `tools/reminder/package.json` + lockfile (`web-push` 3.6.7, `@google-cloud/firestore`
    9.3.1, exact, `npm audit` 0 advisories on 2026-10-08), and three test files:
    `tests/unit/reminder-due.test.js`, `reminder-hours.test.js`, `reminder-safety.test.js`.
    `test:tree` went 147 -> 184 pass, 0 fail; `test:rules` 435 pass; `test:precache` OK.
  - **The secrets:** `GCP_SA_KEY` (service account `streak-reminder`, role Cloud Datastore
    Viewer only — Adrian created it in the Google Cloud console with no billing prompt) and
    `VAPID_PRIVATE_KEY`. Both exist in GitHub only. Neither was ever on this PC for testing.
  - **The dry run Adrian read out (run #1, 2026-10-08 20:37 UTC, green):**
    `***"dryRun":true,"hours":1,"matched":0,"due":0,"subs":0,"sent":0,"gone":0,"failed":0,"skipped":0,"errorCodes":***`
    **The `***` are not an error.** GitHub hides anything in a public log that matches a line of
    a secret, and the key file's first and last lines are a lone `{` and `}`, so every curly
    bracket in the job's output is starred. Read it as `{...,"errorCodes":{}}`. An error would
    still be readable: `"errorCodes":***"firestore:7":1***`. The query ran with no error, so
    **no composite index is needed**.
  - **NOT YET SEEN, owed to Task 4:** a run with `matched: 1` (Adrian sets his hour to the
    current hour and runs the dry run again), and **whether a real reminder reached his phone**
    — he has not answered yet. Ask him first thing.
  - **Where the job differs from the plan's draft, all deliberate:**
    1. **Half-hour time zones.** The app stores the UTC hour rounded DOWN (`utcHourFor` in
       `js/remind-time.js`: 19:00 in India -> 13 UTC), so the only run that asks about such a
       user happens at 18:47 their time. The plan's rule ("the local hour is the chosen hour or
       up to two after") called that not due, and no later run ever asked again: India, Iran,
       Newfoundland etc. would never have been reminded. `isDue` now works in minutes: the
       chosen local time must fall in the UTC hour running now or one of the two before it,
       same local day. Whole-hour zones behave exactly as the spec says (never early, up to
       two hours late). **Adrian was told and did not object; it is a job-only change.**
    2. `usableSub()` and `MAX_SUBS` moved into `due.mjs` so the two Task 1 audit items (five
       subscriptions per user; skip an empty key) have unit tests.
    3. `reminder-safety.test.js` READS `send.mjs`, `plan.mjs` and the workflow and fails on a
       Firestore write call, an unlisted log line, a new trigger, an unpinned action, a secret
       outside the Send step, or `npm install`. **If you add a log line you must add it to that
       test's list — that is the point.**
    4. `send.mjs` catches a crash and prints fixed words (Node would print the error message,
       which can hold an endpoint), and each push has a 15 second timeout.
    5. The workflow has FOUR pinned `uses:` lines, not three (the cache action is used twice).
       Hashes re-checked with `git ls-remote --tags` on 2026-10-08: unchanged.
  - **Known limits, accepted:** a reminder set for 00:00 in a half-hour zone is not sent (the
    run falls on the previous local day). After a clock change, a user who has not opened the
    app since may miss one reminder or get it an hour late — `Notifications.refresh()` corrects
    the stored hour at the next app open. GitHub may start a run 10 to 30 minutes late and
    **pauses the schedule after 60 days with no commit to the repo** (it emails first). A red
    run emails Adrian. Each run leaves a tiny cache entry (`reminder-state-…`); GitHub evicts
    old ones itself.
  - **Reading a run's line:** `matched` = users whose stored hour is this one with the switch
    on; `due` = of those, streak alive and today not credited; `subs` = usable subscriptions;
    `sent` / `gone` (404, 410: dead subscription) / `failed` (with the status under
    `errorCodes`; 401 or 403 = the signing key halves do not match); `skipped` = bad endpoint
    or empty key. `firestore:7` = the role is missing; `firestore:9` = an index is wanted.

- **DAILY STREAK REMINDER, TASK 2 OF 4: THE APP SIDE IS LIVE BEHIND `?remind=1` (2026-10-08, `a6ec42e`, v174).**
  The switch, the hour picker, the Profile row and the service worker's push handler.
  **Nothing is sent yet** — the hourly job is Task 3, the phone test and removing the gate
  are Task 4. `firestore.rules` was not touched.
  - **The gate:** the Settings block and the Profile row are drawn only on a device whose
    local key `remindPreview` is true; opening the app once with `?remind=1` sets it.
    **Signing out wipes the whole local kv store (it always did), so it wipes the gate
    too: open `?remind=1` again after a sign-out.**
  - **What exists:** `js/notifications.js` (the `Notifications` object: `init`, `state`,
    `enable`, `disable`, `setHour`, `refresh`, `clearDaily`, `section`, `profileRow`);
    `js/remind-time.js` (pure: `utcHourFor`, `hourLabel`, `keyBytes`, `sameBytes`) with
    `tests/unit/remind-time.test.js`; in `js/firebase.js` `saveReminderPrefs`, `savePushSub`,
    `deletePushSub`, `prunePushSubs`, `dropThisDevicePush`, `pushSubIdOf`; in `sw.js` the
    `push` and `notificationclick` listeners, `REMIND_TEXT`, and the `ctc-notif` cache
    (kept out of the version wipe); `js/vapid-public.js` (`VAPID_PUBLIC_KEY`, generated);
    `icons/notif/daily.png` (192px, 51.8 KB) and `icons/notif/badge.png` (96px white knight
    on transparent — `logo-mark.png` HAS transparency, so the badge was kept).
  - **Wired in `js/app.js`:** `openSettings()` after `privHint`; `Profile.renderStreakLadder()`
    last line; boot, after the FIRST `await Streak.init();`; the `visibilitychange`
    listener; the boot `Auth.onChange(async …)` after ITS `await Streak.init();` (the other
    `Auth.onChange(` is Profile's one-liner and was left alone); `Streak.recordActivity()`
    after `this.lastDate = today;`. `index.html`: `#profile-remind-row` under the ladder.
  - **Clean-up:** `Auth.signOut()` calls `dropThisDevicePush()` first; `Auth.deleteAccount()`
    lists and deletes every `pushSubs` document before `users/{uid}`, then drops this
    device's subscription before `deleteUser`.
  - **Privacy wording:** the spec's four paragraphs are in `js/legal-data.js` (sections 1
    and 8, ES and EN); `LAST_UPDATED` is `2026-10-08`.
  - **The signing key:** made once by `tools/reminder/make-vapid-keys.mjs`. The public half
    is committed. The private half was written to `C:\Users\Adrian\ctc-vapid-private.txt`,
    never read or printed by the session; Adrian pastes it into the GitHub secret
    `VAPID_PRIVATE_KEY` and deletes the file. **Never run that script again** (it refuses
    while `js/vapid-public.js` exists): a new pair kills every stored subscription.
  - **Where the plan's draft was changed, and why:**
    (1) `dropThisDevicePush()` gives the Firestore delete 4 seconds — a delete waits
    forever offline and would have frozen sign-out.
    (2) `Notifications.store()` throws if nothing was stored, so the switch can never read
    On without a document (found by the headless tool).
    (3) `subscription()` replaces a subscription only when the browser REPORTS a different
    key; a browser that reports none is left alone instead of re-subscribing on every open.
    (4) The push handler also survives a readable non-object payload (`null`).
    (5) The On/Off words reuse `sound_on` / `sound_off`; `remind_on` / `remind_off` were
    not added. (6) One id helper (`pushSubIdOf` in `js/firebase.js`), not two copies.
    (7) `tools/resize-notif.mjs` drops the two lowest colour bits: 62.4 KB → 51.8 KB, the
    spec asks for under 60. (8) One CSS line, `#remind-seg button:disabled`, dims the
    locked pair like the app's other locked buttons. (9) The public key lives in
    `js/vapid-public.js` (the plan), not inside `js/notifications.js` (the spec's wording).
  - **Tests:** `test:tree` 142 → 147 pass, 0 fail (the 5 in `remind-time.test.js`);
    `test:precache` OK, 40 → 43 imported files, 142 art files; `test:rules` 435 pass,
    0 fail, unchanged.
  - **Headless:** `node tools/cdp-verify-remind.mjs <outDir>` — 42/42 PASS, 0 console
    errors. It serves `sw.js` (the other cdp tools 404 it). Covers: the gate; the block and
    the row in ES/EN, light/dark at 375px; the Profile row opening Settings on the block;
    a failed switch-on going back to Off with the Brave hint; pushes in EN and ES, n = 1,
    4 and 11; same-day repeat silent; `not json` and `null` still show a notification;
    `recordActivity()` closing the reminder; sign-out clean-up, then the switch reads Off.
    **Not covered, needs a real login:** a document actually written to `pushSubs` under
    the live rules, and a real delivery. Headless Chrome DOES hand out a subscription, so
    "On" there is painted from memory with `Auth.user` set by hand; nothing is written.
  - **Screens opened and looked at (375px):** `settings-` and `profile-` × `es-light`,
    `es-dark`, `en-light`, `en-dark` (the 8 signed-out ones), plus `settings-on-es-dark`,
    `settings-failed-en-light`, `profile-on-en-light`.
  - **Adrian's phone, first try (2026-10-08, plan Step 14):** he pasted `VAPID_PRIVATE_KEY`
    into GitHub and deleted the file. On his phone (Brave) the switch went back to Off
    with the hint "Could not turn it on. In Brave: Settings, Privacy, …". **That hint is
    shown for ANY failure inside `Notifications.enable()`** (subscribe refused, the
    Firestore write refused or timed out, offline), so the Brave switch is the likely
    cause, not a proven one. He was asked to turn on Brave's "Use Google services for
    push messaging", restart Brave and try again.
  - **Second try, same day: IT WORKS.** With Brave's switch on, the app's switch stays On
    and the hint reads "One reminder a day, only if you have not trained yet." `on` is
    only set after `savePushSub` and `saveReminderPrefs` both succeeded, so his account
    now has a `pushSubs` document accepted by the live rules and `notifPrefs.daily: true`
    at 19:00. So the Brave switch WAS the cause, and Brave on his phone has it off by
    default. Step 14 is closed; nothing has been sent yet (Task 3).

- **DAILY STREAK REMINDER, TASK 1 OF 4: THE `pushSubs` RULES ARE LIVE (2026-10-08, `ac3062e`).**
  Rules only. No app code, no `sw.js` change, no job. Tasks 2, 3 and 4 are still to build.
  - **What exists:** `match /users/{userId}/pushSubs/{subId}` in `firestore.rules`, directly
    after the `fcmTokens` block. Owner-only read, list, create, update, delete; exactly six
    fields (`endpoint`, `p256dh`, `auth`, `createdAt`, `platform`, `lang`); id is 64
    lowercase hex; `createdAt == request.time`; endpoint allowlist (Google, Apple, Mozilla,
    Windows). Tests in `tests/rules/pushsubs.test.js`.
  - **Deployed:** Adrian ran `npm.cmd run rules:deploy` and said it deployed, 2026-10-08.
  - **Tests:** `npm.cmd run test:rules` went 399 → 435 pass, 0 fail. The new file adds 36
    tests (the plan said 23: its 23 are there unchanged, plus 13 for disguised hosts such
    as `https://fcm.googleapis.com@evil…`, overwriting with a bad address, and non-text keys).
  - **Checked in the emulator, both as the plan assumed:** `matches()` tests the whole
    string (no-path address and a 65-character id are refused, so the trailing `/.*` is
    needed); `createdAt == request.time` accepts `serverTimestamp()` and refuses a number
    or a device-made date. The plan's rules block went in unchanged.
  - **Audit (firebase-security-rules-auditor), nothing fixed, two notes:** empty `p256dh` /
    `auth` strings are storable (harms only that user's own reminder); rules cannot cap
    how many documents an account stores, so **the job's `limit(5)` per user in plan
    Task 3 is the control and must not be dropped.**
  - The `fcmTokens` block and `tests/rules/notifications.test.js` were not touched.

- **DAILY STREAK REMINDER: DESIGNED, NOT BUILT (2026-10-08). Spec + plan only, no feature code.**
  Spec `docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md`, plan
  `docs/superpowers/plans/2026-10-08-daily-streak-reminder.md` (four tasks, one session each).
  - **It is free and needs no card.** The parked `2026-08-17-notifications.md` says there
    is no way round Blaze; that is WRONG for this feature. Do not follow its Task 2 or
    Tasks 4 to 7. Its rules (Task 1, `fcmTokens`) stay live and unused.
  - **Adrian's decisions:** standard Web Push, NOT Firebase messaging (`getToken()` is
    officially deprecated, read from Firebase's page 2026-10-08); live streak only; off
    until switched on, picker starts at 19:00; switch in Settings after Privacy plus one
    row on the Profile streak card; a service-account key (keyless is the fallback).
  - **The sender** is an hourly GitHub Actions job with a read-only service account
    (`streak-reminder`, Cloud Datastore Viewer only). It writes nothing to Firestore and
    remembers the last hour it handled in the Actions cache, so a late or repeated run
    never sends twice.
  - **Costs Adrian one rules deploy** (new `users/{uid}/pushSubs`), in session 1.
  - **Not answered yet:** whether the Cloud console lets Adrian create a key for the
    `streak-reminder` account. It is asked again in plan Task 3 Step 8; nothing before
    that depends on it.
  - Rules suite on the day: 399 pass, 0 fail, nothing touched.

- **ENDGAME EXPLANATIONS SAY "BLOQUEADOS", NOT "TRABADOS" (v173, 2026-10-08).** Adrian:
  "trabados" makes no sense; the title of the same endgame says "Peones bloqueados".
  The six Spanish explanations in `js/endgames-data.js` that used it now say
  "bloqueados". Text only; no key, id or English text changed.

- **THE HEADER FLAME IS GREY UNTIL TODAY IS CREDITED (v172, 2026-10-08).** Adrian: "when
  a new day starts, there is no difference in the flame". Now a live streak that has
  not been credited today shows the same art in grey with YESTERDAY'S number; the first
  thing that counts turns it to colour and the number goes up by one, with no reload.
  - **The rule** is `Streak.isPending()` in `js/app.js`: count above 0 and
    `streakLastDate` is not today (local midnight, `todayStr()`). It is worked out on
    every paint. NOTHING new is stored and no key was renamed - do not add a "grey" flag.
  - **Header**: `Streak.render()` sets `.streak-badge.pending` (css/style.css:
    `grayscale(1)` + opacity .75 on the art, the number in `var(--muted)`). Streak 0 and
    a streak broken by a missed day are UNCHANGED (coloured art at half strength, `.zero`).
  - **Turning to colour**: `Streak.recordActivity()` - the one function every mode
    credits through - passes `lit` to `render()`, which plays the existing `streak-pop`
    bounce once (`.streak-badge.lit`; off under reduce-motion). A tier-up on the same
    action wins and looks as it always did.
  - **Midnight with the app open**: `Streak.checkDay()` compares today with
    `Streak.paintedFor` and re-runs `init()` if the day moved. It is called when the app
    comes back to the front (`visibilitychange` in the boot code) and at the top of
    `showScreen()`. No timer, by Adrian's choice - an app that sits in front untouched
    over midnight changes on the next screen change. Two midnights -> 0, and the 0 is saved.
  - **Profile** (Adrian: yes, same rule): `renderStreakLadder()` gives the 64px flame
    `locked pending` (grey, still, no haze, opacity .75). "Day 5", the bar and the
    ladder rows are unchanged - the earned tier row stays in colour on purpose.
  - **No new text** (Adrian's choice). The only wording change: the header tooltip was
    the fixed Spanish "Racha diaria" for everyone; it is now `streak_daily`
    (Racha diaria / Daily streak) through `data-i18n-aria`.
  - **Checked**: `node tools/cdp-verify-streak-grey.mjs <outDir>` 33 of 33, 0 console
    errors - yesterday credited -> grey 5; one puzzle really tapped -> colour 6; already
    credited -> colour on load; missed day and no streak -> as before; the clock pushed
    forward one and two days with the app open; 375px, light AND dark, ES AND EN,
    screenshots looked at. `test:tree` 142 pass, `test:precache` OK. No
    `firestore.rules` change.

- **THE DUEL "AVISARLE / TELL THEM" SHARE CARRIES A LINK, AND THE CHALLENGER COMES BACK
  TO THE WAITING SCREEN (v171, 2026-10-08). PUSHED AND LIVE (283dd7a, pushed by Adrian;
  the live `sw.js` says v171). NOT YET TRIED ON A REAL PHONE - the two-phone WhatsApp
  test is still owed.** Adrian reported (1) the share was plain
  text with no link, (2) after pressing it he was in WhatsApp and could not get back to
  the challenge.
  - **The message** (`pulso_tell_text`, `PulsoUI.tell()`): "Ana te reta a un Duelo en
    Chess Training Center. Tienes 5 minutos: https://chesstrainingcenter.app/?duel=<uid>"
    (EN likewise). The link is INSIDE the text (some apps drop a link passed beside it)
    and is the constant `LINK` in `js/pulso-ui.js`, never `location.origin`. `?duel=`,
    not `?pulso=`, because the address is visible in WhatsApp. All it carries is the
    challenger's uid, which `/leaderboard` already shows anyone.
  - **Opening it** (`PulsoUI.init()` reads and removes `?duel=` at once, keeping any
    other query; `PulsoUI.follow()` acts once the app is up, `Auth.known` is true and the
    listener has heard from the server). Adrian's decision: the link NEVER accepts - it
    opens the Duel screen and the existing gold banner (Not now / Accept) is the
    challenge. Invited friend, challenge open -> Duel screen + banner. Challenger's own
    link -> waiting screen. Ran out / cancelled -> lobby line `pulso_link_expired`. Not
    friends -> `pulso_link_strangers` (name read from `/leaderboard`). Signed out -> the
    Duel screen's existing "sign in" button; the link is kept in memory and followed
    after sign-in. Own link too late -> `pulso_gone`. A uid nobody has -> the lobby,
    nothing said. Not a uid at all -> ignored, Analysis as always. The line is
    `PulsoUI.notice`, shown in `#pulso-note`, cleared on the next entry to the screen.
  - **The challenger** : when the app STARTS with my own challenge still open and the
    screen is still Analysis, `follow()` goes to the Duel screen (which rebuilds the
    waiting screen). Once per launch (`fresh`), never later.
  - **Report (2) was NOT reproduced** (needs a phone). What the code showed: every start
    ended on `showScreen('analysis')` and nothing led back to Duel. Fixed by design.
    While WhatsApp is in front the app cannot pull the user back; they return with Back /
    recent apps, or by tapping their own link.
  - **New in other files:** `Auth.known` in `js/firebase.js` (false until Firebase has
    answered; `Auth.onChange` alone is not enough - "nobody is signed in" can arrive
    before a module is listening). `PulsoUI.boot()` is called in `js/app.js` right after
    the start-up `showScreen('analysis')`. `watchPulso`'s `{ fromCache }` is now used
    (`PulsoUI.loaded`). Still ONE listener. **`firestore.rules` unchanged - no rules
    deploy.** `CACHE` v170 -> v171.
  - **Known limits.** Whether the https link opens the installed TWA or a Brave tab is
    Android's doing - unverified. If the v170 boot guard reloads a failed start, the link
    is already out of the address and is lost. `tell()` uses the name already on the
    waiting screen; if it has not loaded it shares "?".
  - **Verified:** `test:tree` 142/0, `test:rules` 399/0, `test:precache` OK,
    `tools/emu-verify-pulso.mjs --quick` 48/48, `tools/emu-verify-pulso-ui.mjs` 285 of
    285 (the old 232, minus the old share-text check, plus 54), no console errors; 375px
    light/dark ES/EN screenshots looked at. The tool has a new `--links` flag (only the
    link scenes, about 3 minutes) and a `?later=` signed-out phone with
    `window.__signIn()`. `navigator.share` is a stand-in there; the sign-in form is not
    filled in.

- **THE START-UP CAN NO LONGER END ON THE SPLASH (v170, 2026-10-08). PUSHED AND
  LIVE 2026-10-08 — live `sw.js` says v170 and the live page carries the boot guard; the
  `boot-watchdog` branch and the `chess-app-boot` worktree are removed. Sentry has had
  no "Boot failed (" data before this date.** Users reported the app "stays white and
  never opens". Adrian's answers: the logo IS on the pale screen (so it is `#splash`),
  closing and reopening does NOT fix it, Play Store app; start date unknown.
  - **THE FIELD CAUSE IS NOT PROVEN.** Nobody has looked at Sentry for 2026-10-07/08 yet.
    What was proven is that six different faults each left the bare splash up for good,
    with nothing on screen and nothing reported, on the committed v168:
    main() rejecting (made here by the app's IndexedDB refusing to open - the only one of
    the six that would ALSO survive reopening on a real phone); an IndexedDB open that
    never answers; a module that 404s; `js/app.js` with its connection cut; the
    v159 -> today update where the new file `js/pulso.js` fails; the same where it never
    answers. A seventh (update where the changed `js/firebase.js` fails) did NOT give a
    bare splash: the old worker served the old file, the link error reached
    `window.onerror` and the old "Something went wrong" overlay came up.
  - **The fix, three parts.** (1) A boot guard inside the dependency-free inline script
    at the top of `index.html` (`bootFail`, `showBootPanel`, `freshStart`,
    `window.__bootFail`, `window.__bootDone`): a definite failure before the app has
    started -> ONE automatic reload per app session (`sessionStorage` `ctcBootRetry`),
    then the panel `#boot-fail` (ES/EN from `localStorage.lang`, light/dark) and a Sentry
    event "Boot failed (reason): ...". Still on the splash after 20 s (`BOOT_LIMIT`) ->
    the panel in its "taking too long" wording with NO reload, and it removes itself if
    the app does finish - a slow first launch or update is not thrown away. (2)
    `js/app.js`: `main().catch` calls `window.__bootFail('main', e)`, the line that hides
    the splash calls `window.__bootDone()`, and the module `<script>` tag has an
    `onerror` (a failed module download fires there and nowhere else). (3) `sw.js`
    `networkFirst()`: in a launch that has already been given new files, a file whose
    download fails is tried once more and then the request FAILS (`again()`,
    `Response.error()`) instead of the old cached copy being served next to a new
    `js/app.js`; a file with no cached copy gets one retry. `CACHE` v169 -> v170.
  - **The panel's Reload button is more than a reload (`freshStart`)** - because a plain
    reload reopens the same stored copy, and reopening was reported not to help. It makes
    one real request; if the network answers it deletes the `chess-training-center-v*`
    cache and unregisters the service worker, then reloads (main() registers the worker
    again). With no network it only reloads. It never touches IndexedDB, localStorage,
    the engine cache or the art cache.
  - **The one Sentry issue Adrian pasted (2026-10-08, 1 event, 0 users, Safari 26 on a
    Mac) is a DIFFERENT fault, also fixed here:** `TypeError: Cannot read properties of
    undefined (reading 'mw')` thrown inside Google's `www.gstatic.com/recaptcha/...
    recaptcha__en.js` (App Check loads it in `js/firebase.js`). It is Google's code and
    cannot be fixed from here; what WAS ours is that the crash guard treated it as an app
    crash and put the full-screen "Something went wrong" panel over a working app
    (reproduced against the live v169). `notOurs()` in `index.html` now also skips any
    error whose file is on another site (everything the app runs is self-hosted), and
    Sentry's `denyUrls` drops the reCAPTCHA ones. It is NOT the white screen: wrong
    device, and that panel is dark with a button, not the splash.
  - **What this does NOT do:** if a phone's IndexedDB really is broken, the app still
    cannot start - it now says so and reports it, instead of a silent splash. Starting
    without the database would be a real change to the app and was not attempted. The
    worker fix only acts from the NEXT update on: the v169 -> v170 step is still served
    by the v169 worker; the guard covers it because it lives in the new `index.html`.
    NOT changed: the install step still skips an asset that fails (`c.add().catch`) and
    still uses the browser's HTTP cache - no evidence either one has bitten.
  - **Verified:** new `tools/cdp-verify-boot.mjs <outDir>` (own server, real worker, the
    version before served out of git at 4e90e53, about 4 minutes): 12 scenarios, every one
    ends as the app or the panel and, once the fault is lifted, the button opens the app
    (the reCAPTCHA one ends as the app on its first load, no panel, no overlay);
    a normal launch opens in 1.7 s warm / 1.6 s first visit, the same as before the fix,
    with no panel and 0 console errors. `SHOTS=1` takes only the panel screenshots
    (both wordings, ES/EN, light/dark, 375 px - all eight looked at; the navy mark sits on
    a light tile in dark mode). `test:tree` 142/0; `test:precache` OK (40 files, 142 art);
    `cdp-verify-puzzle-modes.mjs` 40 of 40; `emu-verify-pulso-ui.mjs` 232 of 232, no console errors.
  - **Built in a separate worktree** (`C:\Users\Adrian\chess-app-boot`, branch
    `boot-watchdog`) because another session was editing `index.html` and `sw.js` in the
    main folder at the time (the Duelo rename, v169); rebased onto it.

- **PULSO IS NOW CALLED "DUELO" (ES) / "DUEL" (EN) ON SCREEN (v169, 2026-10-08).
  PUSHED AND LIVE (9986b16): Adrian said yes; the live `sw.js` is v169 and the live
  `js/i18n.js` has `pulso_name` and no visible "Pulso" left. ONLY THE VISIBLE WORD
  CHANGED.** Adrian
  found "Pulso" unclear in English (chess.com calls its version Puzzle Battle), first
  asked for "Challenge", then chose Duel / Duelo himself. Name check: no chess.com,
  Lichess or Chessable mode is called Duel; one small third-party app describes a
  "puzzle duel" in its store text; "Challenge" was rejected because both big sites use
  it for inviting a friend to a game and our own button already says it.
  - **Nothing internal was renamed and nothing must be:** the Firestore collection
    `pulso/`, `firestore.rules`, every `pulso_*` i18n key, every `#pulso-*` id and
    `.pulso-*` class, `js/pulso*.js`, `icons/pulso/`, `PulsoUI`, `PulsoMatch`, the screen
    name `'pulso'`, `data-v="pulso"` and the shared file name `pulso.png`. In code,
    comments, tools and this file the mode is still "Pulso".
  - Changed: 9 values in `js/i18n.js` (`mode_pulso`, `pulso_challenge_menu`,
    `pulso_offline`, `pulso_tell_text`, `pulso_invite`, `pulso_leave_confirm`,
    `pulso_won_pull`, `pulso_tally`) plus ONE new key `pulso_name` (Duelo / Duel); the
    lobby word is now `data-i18n="pulso_name"` with `text-transform: uppercase` instead
    of a hard-coded PULSO; the share card's subtitle uses `t('pulso_name')`; `sw.js`
    `CACHE` v168 -> v169; the expected words in `tools/emu-verify-pulso-ui.mjs`.
  - **Verified:** `test:tree` 142/0, `test:precache` OK, `cdp-verify-puzzle-modes.mjs`
    40 of 40 (the chip reads "⚔ Duelo" / "⚔ Duel", not cut short at 320 px),
    `emu-verify-pulso-ui.mjs` 232 of 232, no console errors. Lobby looked at in ES light
    (375 and 320) and EN dark.

- **THE FOUR PUZZLE-MODE CHIPS ARE TWO ROWS OF TWO (v168, 2026-10-07). PUSHED AND LIVE
  (907b674): Adrian said yes; chesstrainingcenter.app serves `sw.js` v168, the grid rule
  in `css/style.css`, four strips without `scroll`, and the new `SWIPE_SAFE`.** Adrian's ask after seeing Pulso live: the strip of
  Puzzles / Blindfold / Puzzle Rush / Pulso scrolled sideways and showed only a sliver of
  Pulso. Now `.seg.puzzle-modes` is a 2-column grid (CSS, next to `.seg.scroll`): four
  equal pills, 175 x 40 at 375 px, 147 x 40 at 320 px, same order, no label cut short.
  - The four strips in `index.html` lost the class `scroll`; `.puzzle-modes` was added to
    `SWIPE_SAFE` in `js/app.js` so a sideways drag on the chips still does not switch
    tabs; the "bring the lit chip into view" `requestAnimationFrame` in `PulsoUI.open()`
    is gone (nothing scrolls). `sw.js` `CACHE` v167 -> v168.
  - **Cost, told to Adrian:** the second row is 46 px. On a 375 x 667 phone the Puzzles
    screen's ⏮ ◀ ▶ ⏭ row under the board is now cut by the bottom edge (it just fitted
    before); the board still fits. Blindfold, Rush and Pulso have room to spare.
  - **Verified:** new `tools/cdp-verify-puzzle-modes.mjs <outDir>` (its own server, half a
    minute) 40 of 40 - all four screens, ES/EN, light/dark at 375 x 667 plus ES light at
    320, every chip really tapped; `test:tree` 142/0; `test:precache` OK;
    `emu-verify-pulso-ui.mjs` 232 of 232, no console errors.
  - **Two old tools are OUT OF DATE, not broken by this:** `cdp-verify-swipe-modes.mjs`
    (145 pass, 16 fail) and `cdp-verify-tabheads.mjs` (297 pass, 4 fail). Every failure is
    a Blindfold check written before v136 gave Blindfold a start panel with "Go" - they
    expect the countdown and the rating badge the moment the screen opens. All their
    mode-chip checks pass. NOTE both take the app's URL first: `node tools/<tool>.mjs
    http://localhost:<port> <outDir>` against a running dev server; an outDir alone dies
    with "Cannot set properties of null (setting 'scrollTop')".

- **PULSO SESSION 7 OF 7: ADRIAN'S ART IS IN THE APP (v167, 2026-10-07). PUSHED AND
  LIVE: Adrian said yes, 53f4c6d..35bc875 went to main (sessions 2 to 7, plus the badge
  card v162 and the quiet Kael v165). Checked on chesstrainingcenter.app after the
  deploy: `sw.js` is v167 with `pulso` in `ART_RE` and the seven names in `ART`; all
  seven PNGs come back 200 `image/png`, byte for byte the local files; `index.html` has
  no `streaks/flame3.png` left. The only thing left is ONE REAL MATCH ON TWO PHONES,
  which only Adrian can do - he has the steps.**
  Changed: `index.html`, `css/style.css`, `js/pulso-match.js` (4 lines in `paintResult`),
  `js/pulso-ui.js` (1 line in `renderLobby`), `sw.js`, `tools/check-precache.mjs`,
  `tools/emu-verify-pulso-ui.mjs`; new `icons/pulso/` (7 PNGs) and
  `tools/build_pulso_art.py`. `firestore.rules` is untouched since 53f4c6d - no rules
  deploy. No word added, nothing about how a match, the result or the rematch behave.
  - **Where the art comes from:** Adrian generates each picture on a flat MAGENTA
    backdrop, any size, JPEG is fine (same method as the badges). The seven sources are
    in `C:\Users\Adrian\Downloads\pulso` (NOT in the repo). `python
    tools/build_pulso_art.py C:\Users\Adrian\Downloads\pulso` keys the magenta out, crops
    to what is visible, fits each to its size and writes `icons/pulso/*.png`; it picks a
    source by a word in its file name (hero, win, lose, draw, empty, marker, hot). Over
    120 KB a file is reduced to 256 colours (hero, win, lose, draw were). Sizes: hero
    640x400 60 KB, win/lose/draw 512x512 46/48/58 KB, empty 320x320 119 KB, markers
    128x128 15/19 KB. Three things the script had to learn: the badges' `ART_FLOOR` of 26
    left a pink rim on light pages (6 here, plus a de-spill); the generator leaves stray
    pixels in the corners that stretch the crop box (the mask is thinned before the box
    is taken); and the two markers are cropped with ONE shared box so they keep the same
    footprint and base line. **Redrawing a file under the same name needs an `ART_CACHE`
    bump in `sw.js`** (see the comment there).
  - **The four places:** lobby hero = `.pulso-hero-art` (320x200). Empty lobby =
    `.pulso-empty-art` (160 px) in the SAME slot: `renderLobby` puts class `no-friends`
    on `#pulso-lobby` when the note is `pulso_no_friends`, and CSS swaps the two. Result
    = `#pulso-result-art` (200 px), its `src` set in `PulsoMatch.paintResult`: `draw` if
    `m.winner === 'draw'`, `win` if it is `PulsoUI.uid`, else `lose` (so "friend left" is
    a win and "you left" a loss). Marker = TWO stacked `<img>` in `#pulso-flame`, the
    second with class `hot`; CSS shows it on `.hot-me` / `.hot-them` by opacity, so the
    swap loads nothing and cannot jump. The 1.4 scale and the 14-degree tilt are kept
    (the tilt says whose streak it is).
  - **Verified:** `test:tree` 142/0, `test:rules` 399/0, `test:precache` OK and now 142
    art files (was 135), `emu-verify-pulso.mjs --quick` 48 of 48,
    `emu-verify-pulso-ui.mjs` **232 of 232** (the old 198 + 34 new), no console errors.
    New in that tool: a fourth user, Dora (127.0.0.3), who has no friends; the hero and
    the empty picture in every language/scheme; the plain marker, the hot one and plain
    again; and after EVERY result screen which of win/lose/draw is shown, loaded, 200 px,
    with the whole screen re-measured on a 375 x 667 phone (it fits, Back included).
    Screenshots looked at: lobby, empty lobby, bar plain and hot, win, lose, draw, light
    and dark, ES and EN. The faint square of the stand-in flame is gone.
  - **`cdp-verify-rush.mjs` did NOT come back 64 of 64, and it is not this session's
    doing** (nothing Rush reads was touched). Three runs: 63/64, 44/44 then stopped,
    63/64. (a) "pickNext: 38-40 different puzzles out of 40 at every position" got 37 at
    the fourth position (target rating 1065) twice - a dice check sitting right on its
    threshold there. (b) Once, after the three-strikes ending in ES/dark, a Kael bubble
    was over `#rush-exit` when the tool went to tap it. Both want a look in a Rush
    session of their own.
  - **Told Adrian, his to judge:** the lose picture runs off its frame, so the cloak ends
    in a straight cut on the right; the draw picture's flame has a faint pink glow on the
    light page (painted that way on the magenta); the hot marker's sparks are a few dots
    at 40 px - the white core is what tells the two apart.
  - Spec section 8's "share card" use of the hero is NOT built (the share card is still
    `shareStatCard` with text only), and section 6's "Challenge to a Pulso" in the Friends
    row menu and on a public profile is still not built. Neither was in scope.

- **PULSO SESSION 6 OF 7 DONE: THE RESULT SCREEN, REMATCH FROM BOTH SIDES, THE TALLY ON
  THE FRIEND'S PROFILE, SHARE CARD, DAILY-STREAK CREDIT (v166, 2026-10-07). COMMITTED
  LOCALLY, NOT PUSHED - ask Adrian. Sessions 2 to 6 are all unpushed (origin/main was
  still 53f4c6d). Only session 7 (Adrian's art + release) is left.**
  Changed: `js/pulso-match.js`, `js/pulso-ui.js`, `js/leaderboard.js`, `index.html`,
  `css/style.css`, three `export`s in `js/app.js` (`shareStatCard`, `Streak`,
  `STREAK_MIN_RUSH_SOLVED`), `sw.js` (`CACHE` v165 -> v166, no new file).
  `firestore.rules`, `js/pulso.js`, `js/firebase.js` and `js/i18n.js` are untouched - no
  word was added.
  - **The result screen is the match pane with class `ended`** on `#pulso-game`: CSS hides
    the head, the board and the status line; `#pulso-result` (picture, `#pulso-end-line`,
    `#pulso-end-sub`) shows above the bar and `#pulso-end` (`#pulso-end-tally`,
    `#pulso-rematch-note`, `#pulso-rematch`, `#pulso-rematch-cancel`, `#pulso-share`,
    `#pulso-end-back`) below it. The bar and the two score lines are the match's own
    elements, left frozen; the scores gain "· N ✗" once it has ended. Because it lives on
    the match pane, `PulsoMatch.id` stays set and Kael stays quiet over it.
  - **`PulsoMatch.result` is the last `'done'` copy of the document** and the whole screen
    is drawn from it - a rematch puts the document back to `'invited'` with every counter
    at 0. `show()` keeps the pane while `result` is set, whatever the document does, and
    drops it only on Back, or when the document goes `'live'` with a `startAt` that is not
    the result's (a new match: `stop()` then `begin()`).
  - **Rematch needed no rule change and no new write.** Revancha = `PulsoUI.challenge()`
    (the ordinary challenge over the finished document); the result screen reads
    `PulsoUI.wait` for "Esperando a {n}…" + Cancel (`PulsoUI.cancel()`), and for
    "{n} no respondió" / "{n} dijo que ahora no" (existing words) with the button asking
    again. The friend's side: `PulsoMatch.wanted(live)` -> class `wants` (gold) and
    `pulso_rematch_wants`; tapping it is `PulsoUI.accept(m)` - `accept` now takes the
    match, default `incoming()`. `paintBanner()` holds the banner AND the gold dot back
    while that match's result screen is up; Back lets the banner through.
  - **"…en {t}" is measured on the phone:** `PulsoMatch.took` = shared clock minus
    `startAt + 6 s` at the paint that first sees the flame at an end (or `'done'`). The
    document has no end time. Measured 31 s said against 31.1 s on the tool's watch.
  - **Tally:** `PulsoUI.tallyLine(friendUid, always)` -> `pulso_tally`. On the result
    screen always; on the public profile (`#pubprofile-pulso`, set in
    `PublicProfile.open()`) only when the two have a finished match. It is read from
    `PulsoUI.matches`, so nobody else can be shown it. Draws (`dr`) are stored but not
    shown anywhere - the words have no place for them.
  - **Streak:** `PulsoMatch.credit(m)` calls `Streak.recordActivity()` once per match when
    I solved `STREAK_MIN_RUSH_SOLVED` or more - on the result screen, and in `leave(then)`
    for a forfeit that goes straight to another screen. Nothing else is written: no ELO,
    no Rush best, no badge count. (`recordActivity` itself runs `Badges.checkNew()`, as it
    does for every other activity - a streak badge can follow from the streak.)
  - **Share:** `PulsoMatch.card()` -> `shareStatCard({ ⚔, the ending's title,
    "Pulso · mine–theirs" }, 'pulso.png')`.
  - **VERIFIED:** `tools/emu-verify-pulso-ui.mjs` extended, **198 of 198**, about 12 min,
    no console errors. All seven endings read on both phones (the forfeit-to-another-tab
    case only on the phone that stayed, by design). Really tapped: Revancha, the gold
    button, Cancel, Back, the banner's Accept / Not now, 📤, the friend's row in Friends.
    Seeded: the clock of the four rematch matches (startAt moved 186 s back), the 6-minute
    old rematch, opening the Friends screen (a call), `navigator.share` (a stand-in that
    records the file). Carolina is a third tab on 127.0.0.2. Screenshots looked at: won,
    lost, draw, friend left, waiting, gold button, declined, profile - ES/EN, light/dark.
    Also: test:tree 142/142, test:rules 399/399, test:precache OK (40 files),
    cdp-verify-rush 64/64, emu-verify-pulso --quick 48/48.
  - **Known, left:** the picture on the result screen is the stand-in flame for every
    ending (pulso-win/lose/draw.png are session 7) and it shows its faint square in light
    mode; if both tap Revancha in the same second the slower one gets the "could not be
    sent" toast and then the gold button; "Challenge to a Pulso" in the Friends row menu
    and on the profile is still not built and is in no session.

- **PULSO SESSION 5 OF 7 DONE: THE MATCH ITSELF - COUNTDOWN, BAR, SOLVE/MISTAKE, CLOCK,
  LEAVE, A ONE-LINE ENDING. NO RESULT SCREEN, NO REMATCH (v164, 2026-10-07). COMMITTED
  LOCALLY, NOT PUSHED - ask Adrian. Sessions 2 to 5 are all unpushed (origin/main was
  still 53f4c6d); pushed now, a match can be played end to end and ends on one line of
  text with a Back button.**
  New `js/pulso-match.js` (`PulsoMatch`), `#pulso-game` in `index.html` in place of
  `#pulso-holding`, a "Pulso: the match" block at the end of `css/style.css`.
  `sw.js`: `js/pulso-match.js` in `ASSETS`, `CACHE` v163 -> v164. `firestore.rules` and
  `js/pulso.js` are untouched. `pulso_holding` / `pulso_holding_sub` removed from
  `js/i18n.js`; no word was added (the "Tú"/"You" on the bar is the existing
  `history_you`, "time's up" is `rush_time_up`).
  - **Why a new file:** same reason as `js/pulso-ui.js` - `js/app.js` is too big to read.
    `js/app.js` got: the import, a guard at the top of `showScreen`, `PulsoMatch.stop()`
    beside `Rush.stop()`, and `PulsoMatch.holds()` in the badge card's `isBusy`.
  - **How it sits on Rush:** `PulsoMatch.game = Object.assign(Object.create(Rush), {...})`
    with `prefix: 'pulso'`, its own copy of every field the engine keeps, and three hooks:
    `pickNext` (= `list[at()]`, the list is `resolveList(m.pz, PUZZLES)`), `onSolve`,
    `onMistake` (both -> `PulsoMatch.attempt(solved, run)`). `Rush.loadNext/userMove/
    applyUci/live/stop` are used as they are. `Rush.countIn/tick/updateHud/start/finish`
    are NOT used: the countdown and the clock are painted from `pulsoServerNow()` in
    `PulsoMatch.paint()` (5 times a second while a match is up), not counted.
  - **Who decides the pane:** `PulsoUI.render()` asks `PulsoMatch.show()`; true = the
    `game` pane. `show()` begins a match that is `PulsoUI.inPlay`, and keeps the one it
    has while its document is `live` or `done` (so a phone cut off at the end keeps its
    stopped board until it hears the result). Back (`#pulso-end-back`) -> `stop()`.
  - **Every number on the screen is the document's.** The bar is
    `markerPos(myPull, theirPull)` -> the CSS variable `--p` on `#pulso-bar` (0 = the
    friend's end, 1 = mine, right). `hot-me` / `hot-them` = that side's streak is 2+.
    The puzzle index is solved + mistakes from the document (`at()`), which is also how
    a reloaded phone rejoins.
  - **Moves:** `pulsoMove(id, solved)` is never awaited and its refusal is a
    `console.warn`. 350 ms after a solve, 1200 ms after a mistake, no strikes;
    "No quedan puzzles" at 60.
  - **Ending the match:** `PulsoUI.close()` calls `finishPulso` for every live match on
    every listener delivery and every 3 s from `sync()` - on any screen, so a phone that
    never opened the board still closes it. Not while `navigator.onLine` is false. The
    board stops at startAt + 186 s ("¡Se acabó el tiempo!"); the result is written from
    189 s. The ending line shows only once the server has confirmed `done` (or for my
    own Leave). `PulsoMatch.endLine()` picks the word; session 6's result screen should
    replace `#pulso-end`, not `endLine()`.
  - **Leave:** `showScreen` calls `PulsoMatch.leaving(name)` first; while a match
    `holds()` it opens `askConfirm(pulso_leave_confirm)` and returns without changing
    screen (a back gesture's history entry is pushed back). Yes ->
    `finishPulso(id, {left: true})`, not awaited.
  - **THE CLOCK PROBLEM CARRIED FROM SESSION 3 IS FIXED** without touching the rules:
    new `syncPulsoClock()` in `js/firebase.js`. A phone with no measurement writes
    `clockAt: serverTimestamp()` to its OWN `users/{uid}` (private, no field allowlist)
    and reads it back from the server - 1 write + 1 read, at most once per session,
    started by `PulsoUI.sync()` only while a challenge or a match is open. So the
    friend's phone measures when the banner arrives and a reloaded phone when the
    listener delivers the live match. Also new: a measurement whose write took over 3 s
    is thrown away (`PULSO_CLOCK_MAX_MS`), in `measurePulsoClock()` too. Measured with
    Luis's `Date.now` 7 s fast: offset -7001 ms before accepting, -6992 ms after a
    reload mid-match, the two phones 3 to 15 ms apart.
  - **Verified:** `test:tree` 142 pass; `test:rules` 399 pass; `test:precache` OK, 40
    files; `tools/emu-verify-pulso.mjs --quick` 48 of 48; `tools/cdp-verify-rush.mjs`
    64 of 64; `tools/emu-verify-pulso-ui.mjs` **137 of 137** (was 65), zero console
    errors, about 9 minutes. It now plays five matches between the two tabs - see the
    top of that file for what each one is, what is tapped and what is seeded. The full
    3:09 clock is really waited once (es-dark: ended 189.7 s after the start).
  - **KAEL IS QUIET DURING RUSH AND PULSO (v165, same day, Adrian asked).**
    `KaelQuotes.show(item, duration, asked)` in `js/app.js` returns without showing
    anything while `Rush.running` or `PulsoMatch.id` is set (the match pane is up,
    ending included); what he would have said is dropped, not saved up. `asked = true`
    is only the player tapping Kael himself. `Rush.start()` and `PulsoMatch.begin()`
    call `KaelQuotes.hide()` so nothing is left over the board. Checked in
    `tools/emu-verify-pulso-ui.mjs`, now **142 of 142**; Rush tool still 64 of 64.
  - **Known, left alone:** the stand-in flame shows a faint square in light mode
    (Adrian's art, session 7). The bar's "felt" flash on a pull (`hit-me`/`hit-them`,
    150 ms) is built but no check measures it.
  - **For session 6:** nothing credits the daily streak yet; the lobby tally already
    updates (it is read from `aW`/`bW`); `#pulso-end` is the placeholder; a rematch is
    just `sendPulsoChallenge` over the `done` document - `PulsoMatch.show()` drops the
    old match as soon as the document turns `invited`.

- **PULSO SESSION 4 OF 7 DONE: LOBBY, CHALLENGE, WAITING SCREEN, INCOMING BANNER - NO
  MATCH SCREEN (v163, 2026-10-07). COMMITTED LOCALLY, NOT PUSHED - ask Adrian, and
  RECOMMEND NOT PUSHING until the match exists (session 5): pushed now, players would
  see a Pulso chip that ends at a "the match arrives in the next version" card.**
  New `js/pulso-ui.js` (`PulsoUI`), `screen-pulso` and `#pulso-banner` in `index.html`,
  a Pulso chip on all the puzzle-mode strips, the `pulso_*` words in `js/i18n.js`, a
  Pulso block at the end of `css/style.css`, new dev tool
  `tools/emu-verify-pulso-ui.mjs`. `sw.js`: `js/pulso-ui.js` in `ASSETS`, `CACHE` v162
  -> v163 (v162 was taken by the badge card the same day). `firestore.rules`,
  `js/firebase.js` and `js/pulso.js` are untouched.
  - **Why a new file:** `js/app.js` is too big to read; `js/pulso-ui.js` imports from it
    the way `js/friends.js` does (a cycle - app.js bindings only inside functions).
    `js/app.js` got 9 lines: the import, `'pulso'` in `SCREENS`, `MENU_AREA` and
    `SWIPE_AS_HOME`, `PulsoUI.onEnter()` in `showScreen`, `PulsoUI.open()` in
    `openPuzzleMode`, `PulsoUI.init()` in `main()`.
  - **The listener:** `watchPulso` is started in ONE place, `PulsoUI.onAuth()`, when the
    signed-in uid changes, and stopped there on sign-out. Measured: 1 listener open, 1
    ever opened, after walking every strip; 0 after sign-out.
  - **How the screen is decided:** `PulsoUI.sync()` runs after every change and once a
    second while a challenge or match is open. Pane = `holding` if a match is live and
    under 196 s old, else `waiting` if `PulsoUI.wait` is set, else `lobby`.
    `PulsoUI.wait = { uid, seen, ended }`; `ended` is `'no_answer'` (5 minutes, plus 1 s
    so "Challenge again" is never sent before the rules agree) or `'declined'`.
    `PulsoUI.incoming()` is the challenge the banner shows. The banner is hidden, and a
    gold dot (`.pulso-dot`) put on the menu button and the Puzzles entry instead, while
    `PulsoUI.busy()`: a Rush run, a game against the engine with moves played, or a live
    Masterclass.
  - **Accept:** "Preparando…" -> `loadBands()` -> `resolveList()` -> only then
    `acceptPulso()`. A missing puzzle declines and toasts `pulso_update_needed`. Both
    phones jump to `screen-pulso` when a match they saw as `invited` turns `live`.
  - **For session 5:** `#pulso-holding` is the placeholder the match screen replaces.
    The jump to the match belongs where `onMatches()` now calls `showScreen('pulso')`.
    `showScreen` does not yet stop anything for Pulso. All the spec's match and result
    words are already in `js/i18n.js` (`pulso_streak_on` ... `pulso_rematch_wants`);
    `pulso_holding` and `pulso_holding_sub` can go when the holding card does.
  - **Words added that the spec's list did not have:** `mode_pulso` is "⚔ Pulso" (the
    other chips all carry an icon), `pulso_how_1..5`, `pulso_loading`, `pulso_row_tally`,
    `pulso_in_play` (unused so far), `pulso_tell_copied`, `pulso_declined`,
    `pulso_again`, `pulso_failed`, `pulso_gone`, `pulso_holding`, `pulso_holding_sub`.
  - **Checked:** `node tools/emu-verify-pulso-ui.mjs <outDir>` - the whole app in two
    headless-Chrome tabs (two origins, so two storages) against the Firestore emulator
    with the real rules, a stand-in sign-in that does call `onAuthStateChanged`, real
    touch events: **65 of 65**, no console errors. Covers the three strips, challenge ->
    banner on another screen -> accept -> both holding, cancel, decline, challenge
    again, a seeded 6-minute-old invitation, no banner over a Rush run, a list with
    unknown puzzles, offline lobby, sign-out; ES/EN x light/dark at 375 px with
    screenshots looked at. Also `test:tree` 142/0, `test:rules` 399/0, `test:precache`
    OK (39 files), `emu-verify-pulso.mjs --quick` 48/48, `cdp-verify-rush.mjs` 64/64.
  - **Known limits, not fixed:** (1) at 375 px the Pulso chip is the fourth and only a
    sliver of it shows on the Puzzles, Rush and Blindfold strips until the strip is
    swiped; (2) the friend's phone judges the 5 minutes by its own clock (it has no
    offset until it accepts), so a phone whose clock is minutes wrong may hide a live
    banner - the rules still referee the accept; (3) the host is told "said not now"
    when the friend's phone declined for the update-needed reason; (4) the stand-in
    flame shows a faint square in light mode (the PNG's background is not fully clear);
    (5) the "Challenge to a Pulso" item in the Friends row menu and on a public profile
    (spec section 6) is not built - no session of the plan lists it.

- **BADGE EARNED: ITS OWN CONGRATULATION CARD, NOT KAEL'S BUBBLE (v162, 2026-10-07).
  COMMITTED LOCALLY, NOT PUSHED - ask Adrian.** New `js/badge-card.js` (`BadgeCard`), a
  `.badge-card` block in `css/style.css` (after the Kael corner), `Badges.checkNew` in
  `js/badges.js` now calls `BadgeCard.enqueue(...)` instead of `KaelQuotes.show`,
  `BadgeCard.init({ isBusy, open })` in the init list in `js/app.js` (after
  `KaelQuotes.init()`), `Streak.celebratingUntil`, new string `badge_congrats`, `sw.js`
  (`js/badge-card.js` in `ASSETS`, `CACHE` v161 -> v162), new dev tool
  `tools/cdp-verify-badge.mjs`.
  - **Why Adrian never saw a notice (REPRODUCED, `node tools/cdp-verify-badge.mjs <dir>
    repro` on the old code):** on the first solved puzzle of the day the badge appeared in
    Kael's bubble for 0.4 s and was then replaced by the streak celebration ("1 día") and
    never shown again. `Puzzles.recordResult` calls `Badges.checkNew()` with no delay; the
    5400 ms delay only existed on the second call, from `Streak.recordActivity`, which by
    then found the badge already saved. On any later solve it did show for 5 s, but as an
    ordinary-looking bubble in the bottom corner.
  - **How it works now:** `BadgeCard` keeps a queue and a `seen` set (two `checkNew()`
    calls racing over one solve cannot show a badge twice). One card at a time: 0.45 s
    settle, 4.6 s on screen, 0.38 s gap. Before showing it asks `isBusy()` and, if busy,
    looks again every 0.4 s - busy means `Rush.running` (count-in included) or
    `Date.now() < Streak.celebratingUntil` (set for 5.4 s in `Streak.celebrateTier`). So
    the `delayMs` argument of `checkNew` is no longer what protects the streak
    celebration; it is only a minimum wait. Tap = `showScreen('profile')` and scroll to
    `#trophy-case`. Reduce motion = opacity only (CSS media query). The sound is the same
    `kael-pop` the bubble played, through `Sound.play`, so the sound switch still rules.
  - **`BadgeCard.position` is `'top'`; `'bottom'` (above Kael) is also in the CSS** as
    `.pos-bottom`, kept until Adrian picks. Bottom sits on top of Kael's bubble when he
    talks (screenshot taken) - top was recommended.
  - **TESTED (headless Chrome over CDP, 375x812, 32/32 checks, 0 console errors):** one
    badge earned by really tapping the solving moves, ES/EN x light/dark, screenshots
    mid-entrance / bounce / shine / settled; a Kael quote arriving meanwhile leaves the
    card alone; leaves by itself after 4.6 s; tap opens the trophy case; three badges from
    one solve come one after another, none lost, none twice; first solve of the day =
    streak celebration first, card 5.2 s later; reduce motion; both positions.
    `test:precache` OK, `test:tree` 142/142.
  - **SEEDED, not played:** in the Rush check the mid-run badge is a pending
    `first_engine` released by calling `Badges.checkNew()` during the run (nothing in the
    app can earn a badge mid-run today), and the run is ended by setting `Rush.score = 20`
    and `Rush.timeLeft = 2`. The card stayed off for the 3.5 s watched and appeared on the
    result screen.
  - **NOT tested:** a real phone; the sound (headless, sound off); every one of the ten
    `checkNew()` call sites - only the puzzle, Rush-finish and streak ones were run, the
    rest are read (they all go through the same `checkNew`).
  - **Known limits:** a card still queued when the app is closed is not shown later (the
    badge itself is saved and is in the trophy case). At the top the card covers the
    header (menu, streak, settings) for 4.6 s; a tap there opens the trophy case.
  - **For the Pulso sessions:** `isBusy` only knows `Rush.running`. When Pulso gets a
    screen with its own timed run, add its "running" flag to `isBusy` in `js/app.js` or a
    badge card can drop over a live match.

- **PULSO SESSION 3 OF 7 DONE: THE PUZZLE SEQUENCE AND THE DATA LAYER, NO SCREENS (v161,
  2026-10-07). COMMITTED LOCALLY, NOT PUSHED - ask Adrian.** New `js/pulso.js`, new
  `tests/unit/pulso.test.js`, a Pulso section in `js/firebase.js` (after the block
  functions, before Masterclass), new dev tool `tools/emu-verify-pulso.mjs`, and `sw.js`
  (`js/pulso.js` added to `ASSETS` because `js/firebase.js` now imports it; `CACHE`
  v160 -> v161). Nothing in `index.html`, `js/i18n.js`, `js/app.js` or
  `firestore.rules`. Nothing a player can see.
  - **`js/pulso.js` (pure, imports only `js/puzzles.js` for `BANDS`/`bandOf`):** `PULSO`
    (the numbers: 60 puzzles, 5-character ids, 10 steps, 6 s countdown, 180 s play, 3 s
    grace, 196 s abandoned, 5 min invite), `targetRating(i)`, `bandOfIndex(i)`,
    `bandsNeeded()` (= bands 1 to 6), `buildList(puzzles, rnd)` (60 ids or `null`),
    `packIds`/`unpackIds`/`idAt`, `puzzleAt(pz, i, puzzles)`, `resolveList(pz, puzzles)`
    (all 60 or `null` - the "one of you needs to update the app" check),
    `applySolve(c)`/`applyMistake(c)` on `{S, M, K, P}`, `stepOk(o, n)` and
    `timeWinner(m)` (the rules' `pulsoStepOk` and `pulsoTimeWinner` copied line for
    line), `markerPos(myPull, theirPull)` (clamped to -10..10), `decideResult(m, timeUp)`
    (`{winner: 'a'|'b'|'draw', reason: 'pull'|'time'}` or `null`), `clockOffset`.
  - **`js/firebase.js`:** `watchPulso(cb)` (ONE listener, `members array-contains`,
    `limit(100)`, `includeMetadataChanges`; `cb(matches, {fromCache})`; each match is the
    stored fields plus `id`, `me` (`'a'`/`'b'`), `friend` (uid), `invitedAt`/`startAt` in
    ms of server time, `pending`), `sendPulsoChallenge(friendUid, pz)`,
    `cancelPulso(pairId)`, `declinePulso` (the same function), `acceptPulso(pairId)`,
    `pulsoMove(pairId, solved)`, `finishPulso(pairId, {left})`, `pulsoClockOffset()`,
    `pulsoServerNow()`. **No function reads a document**: `pulsoMove` and `finishPulso`
    work from the copy the listener keeps, so they do nothing until `watchPulso` runs.
  - **Three things the next sessions must know:**
    1. **The challenge is one merge write for both cases** (first ever / rematch), with
       `aW/bW/dr: increment(0)` so an existing tally is not touched. Writing plain `0`
       there is refused on a rematch (it would wipe the score). Proved on the emulator.
    2. **Do not `await pulsoMove()` during play** - it settles only when the server
       answers. `finishPulso()` may be called on every snapshot and on the clock; it
       returns `false` when there is nothing to record or the rules said no.
    3. **The clock offset exists only on a phone that sent a challenge or accepted one
       in this app session.** After a reload in the middle of a match it is `null` and
       `pulsoServerNow()` falls back to the phone's own clock. Session 5 has to decide
       what a reloaded phone does (recommended: carry on with the phone's clock; the
       rules still refuse anything early or late, so the worst case is a retry).
  - **Spec against deployed rules: no disagreement found.** Every clock number, the +2
    from the third solve in a row, `S + M <= 60`, the tie-break and the 196 s all match.
    Two choices made where the spec was silent: a puzzle whose id exists but sits in a
    different band counts as missing; a pull can go below zero (the rules allow it).
  - **Verified.** `test:tree` 142 pass / 0 fail (104 + 38 new). `test:rules` 399 / 0.
    `test:precache` OK (37 files). **`node tools/emu-verify-pulso.mjs`: 55 of 55** - the
    real `js/firebase.js`, unmodified, in three headless-Chrome tabs (alice, bob, carol)
    against the Firestore emulator with the real `firestore.rules`; the script serves
    stand-ins for three SDK files so the app's own code talks to the emulator signed in
    as `?uid=`. It covers: a list built from the real puzzle files and found by the other
    phone (60/60 within 50 points), first challenge, cancel, challenge the other way,
    decline, accept, moves from both (five sent back to back), a full pull with both
    phones reporting it (one taken, one quietly refused), a rematch keeping the tally,
    leaving, and a match left to run out the REAL 3 minutes (a draw, tally 1-1-1), plus
    eight writes the rules refused (not friends, host accepting, second challenge,
    stranger cancel, stranger accept, accept after cancel, move in the countdown, move
    after the grace). `--quick` skips the 3-minute match (48 checks, about 40 s).
    `node tools/cdp-verify-rush.mjs`: 64 of 64 at 375 px, ES/EN x light/dark; console
    errors are the same two kinds as before (App Check 403, the 404 for `sw.js` the
    script blocks) - zero new. NOT run on a real phone, and never against the live
    project.
  - **Known and left:** a move made within a few milliseconds of another could start
    from numbers one snapshot old and be refused; no finger is that fast and the
    back-to-back test passes. Nothing was done about it.
  - **Still owed:** sessions 4 to 7 of the plan and Adrian's seven art files.

- **PULSO SESSION 2 OF 7 DONE: RUSH'S ENGINE IS REUSABLE, RUSH ITSELF UNCHANGED (v160,
  2026-10-07). COMMITTED LOCALLY, NOT PUSHED - ask Adrian.** Only `js/app.js` (inside
  `export const Rush`) and the `CACHE` line of `sw.js` (v159 -> v160) changed. No Pulso
  screen, no `js/pulso.js`, nothing in `firestore.rules` or `js/firebase.js`.
  - **The lookup:** `Rush.prefix` (`'rush'`) and `Rush.el(name)` = `$(prefix + '-' +
    name)`. All 31 `$('rush-...')` inside Rush now read `this.el('...')`. A second mode
    sets `prefix: 'pulso'` and the same engine drives `pulso-board`, `pulso-status`,
    `pulso-countdown` and so on.
  - **The three hooks:** `Rush.onSolve(run)` (score +1, log dot, HUD, next puzzle after
    0.35 s), `Rush.onMistake(run)` (strike, log dot, HUD, sound, struck out at 3, the
    "n left" line, next puzzle after 1.2 s) and `Rush.pickNext()` (already a method,
    untouched). The code was moved, not rewritten; `userMove()` keeps the board handling
    and calls the hooks. `run` is the token a hook passes to `live(run)` before any
    delayed step.
  - **Left as they were, on purpose:** the three `rush-` uses outside Rush - the
    count-in touch rule (`'#rush-countdown'`), the board-id list (`'rush-board'`) and
    `PuzzleLog.containers` (`rush: 'rush-log'`). None needed changing for Rush. **Session
    4/5 must ADD the Pulso twins beside them** (`#pulso-countdown`, `pulso-board`, and a
    `pulso` log entry only if Pulso shows a strip). Also still Rush-only inside the
    object, for Pulso to replace rather than reuse: `start`, `openIntro`, `updateHud`
    (draws the strikes and uses the CSS class `rush-strike`), `tick`, `finish`,
    `bestKey`/`showBest`/`recordSeasonScore`, `share`, and the two `PuzzleLog` calls
    that name `'rush'`. `loadNext()` assumes `pickNext()` returns a puzzle - a mode whose
    list can run out must stop before calling it.
  - **Verified, new tool `tools/cdp-verify-rush.mjs`** (headless Chrome, 375 px, real
    finger taps on the chip, Start, every chess move, Play again, Back). Per ES/EN x
    light/dark it plays run A (count-in, N solves, one mistake, clock runs out, new best
    saved) and run B (three mistakes, struck out, best unchanged): **64 of 64 checks
    pass.** The first combination waited the full real 3 minutes; the other three had
    `timeLeft` set to 4 once the run was played. The same script run against the code as
    committed before this change (`BASE=1`) gave a record identical line for line except
    which colour was to move. Console errors: the same two kinds before and after (App
    Check 403; a 404 for `sw.js`, which the script blocks on purpose) - zero new.
    `pickNext` measurement, 40 runs x 10 puzzles, 15,000 loaded: 38-40 different out of
    40 at every position, furthest rating 50 from target, 0 repeats. (The old code scored
    37 at one position in its own run - that figure wobbles by a puzzle or so from run
    to run; the picking code is byte-for-byte the same.) `test:rules` 399 pass / 0 fail,
    `test:tree` 104 pass / 0 fail, `test:precache` OK. Screenshots were looked at for
    count-in (EN dark), after a mistake (ES light) and the time-up result (ES dark).
    One promotion puzzle in the new-code run was answered through `Rush.userMove()`
    instead of the promotion picker. NOT played on a real phone.
  - **Still owed:** sessions 3 to 7 of the plan and Adrian's seven art files.

- **PULSO SESSION 1 OF 7 DONE: THE RULES AND THEIR TESTS (2026-10-07). PUSHED BY
  ADRIAN (origin/main = 53f4c6d) AND THE RULES ARE DEPLOYED (`rules:deploy` run
  2026-10-07 on his say-so, "released rules firestore.rules to cloud.firestore").**
  `firestore.rules` has a new `pulso/{pairId}` block (after the Friends blocks, before
  Masterclass) and `tests/rules/pulso.test.js` has 86 tests for it. Adrian answered the
  four decisions with the spec's recommended options (3 minutes; a mistake = 1 step back
  and the streak ends; no strikes; private tally), so **the spec was not changed**.
  What the rules do, exactly as spec section 5 points 1-8: only the two members read;
  the first challenge and every later one need the friendship document to exist (the
  ONLY place it is looked up - a move never looks it up, because a lookup is billed as a
  read); cancel/decline; accept only by the non-host inside 5 minutes with a
  server-stamped `startAt`; a move is one solve OR one mistake on your own four counters,
  between `startAt + 6 s` and `startAt + 189 s`, never past 60 attempts; a result is
  checked against the stored numbers (`pull` / `time` / `left`) and must add exactly 1
  to the matching tally field; no delete. Helper functions: `pulsoChallengeOk`,
  `pulsoCanRechallenge`, `pulsoStepOk`, `pulsoMoveOk`, `pulsoTimeWinner`,
  `pulsoTallyOk`, `pulsoEndOk`. Reused, not copied: `signedIn`, `me`, `after`,
  `pairIdOk`.
  - **One thing the rules language forced:** a rules function takes at most 7 arguments,
    so `pulsoStepOk(o, n)` takes the four counters as two LISTS, `[solved, mistakes,
    streak, pull]` before and after. Nothing in the spec had to change. The
    1,000-expression limit was not hit.
  - **Time-based tests:** the emulator's clock cannot be moved, and it did not need to
    be - every time rule compares "now" with a timestamp stored in the document, so the
    tests seed a document whose `invitedAt` / `startAt` is already in the past.
  - **Verified:** `npm.cmd run test:rules` - 399 pass, 0 fail (313 that existed before +
    86 new). The new tests were run BEFORE the rule existed (27 "allowed" cases failed,
    as they must), and afterwards 28 clauses were weakened one at a time in a scratch
    copy of the rules - the tests caught all 28. Nothing was checked at 375 px,
    light/dark or ES/EN because this session built no screen.
  - **Things the rules deliberately allow (all in the spec, none a bug):** a player may
    forfeit during the countdown; after the bar reaches an end the friend can still pull
    back until the result write lands ("the tie goes to the defender"); a match nobody
    closed can be replaced 10 seconds after its end and then counts for nobody; a
    declined challenge can be sent again at once. A counter is self-reported like every
    other in this app - the rules stop impossible numbers, they cannot prove a puzzle
    was solved (spec section 9).
  - **Still owed:** sessions 2 to 7 of the plan (section 10) and Adrian's seven art
    files (section 8). Any LATER change to the pulso rules needs its own deploy. The entry
    below is the design summary and is still accurate except for its "no `pulso` block
    in `firestore.rules`" and "four decisions are waiting" lines.

- **PULSO IS DESIGNED, NOT BUILT (2026-10-07). SPEC COMMITTED LOCALLY, NOT PUSHED.**
  Pulso = a live 1-v-1 puzzle tug-of-war between two friends. The whole design is in
  `docs/superpowers/plans/2026-10-pulso.md`; **no app code exists yet** - there is no
  `js/pulso.js`, no `pulso` block in `firestore.rules`, no `screen-pulso`. The name was
  searched and is free in chess. Design in one breath: bar of 10 steps each side, solve
  +1, +2 once you have 2 in a row, mistake -1, no strikes, 3 minutes, level bar = fewer
  mistakes wins; the challenger stores 60 puzzle ids in ONE document `pulso/{pairId}`
  reused for every match of that pair; each player writes only their own four counters
  and the rules check the result claim, so there is no server; a friend only learns of a
  challenge if their app is open (one always-on listener + a "Tell them" share button).
  One typical match is about 47 writes / 95 reads against 20,000 / 50,000 a day.
  **Four decisions are waiting on Adrian** (section 2 of the spec: match length, cost of
  a mistake, three strikes, whether the tally shows on a friend's profile) - the spec's
  numbers are the recommended options and must be changed if he picks otherwise.
  Build plan is seven sessions (section 10); session 1 is the rules and their tests.
  Art list for Adrian is section 8 (seven files in a new `icons/pulso/`).

- **PUZZLE RUSH NO LONGER SERVES THE SAME PUZZLES EVERY RUN (v159, 2026-10-07).
  COMMITTED LOCALLY, NOT PUSHED - ask Adrian.** Adrian's report: "the puzzle rush
  problems are always the same". Cause, in `Rush.pickNext` (`js/app.js`): each puzzle
  was one of the 5 CLOSEST to the target rating (900 + 55 per point scored), and ties
  were broken by file order - so the same 5 puzzles at every step of every run. Now:
  any puzzle within 50 points of the target, chosen evenly; the window doubles only
  while it holds fewer than 30. The difficulty ramp and no-repeat-within-a-run are
  unchanged. Measured by calling the app's real `Rush.pickNext()` in headless Chrome,
  40 simulated runs x 10 puzzles, 15,000 puzzles loaded: before, exactly 5 different
  puzzles at every position; after, 38-40 different out of 40 at every position,
  ratings within about 50 of the target, 0 repeats inside a run. NOT played by hand.

- **STREAK LINE REWORDED (v159, 2026-10-07). COMMITTED LOCALLY, NOT PUSHED - ask Adrian.**
  "7 days to 15 days" read as two day-counts. Adrian chose option A of four: the line
  under "Day N" on Profile is now "Next flame in {n} days" / "Próxima llama en {n} días",
  and with one day left "Next flame tomorrow" / "Próxima llama mañana"
  (`streak_next_goal`, `streak_next_goal_one` in `js/i18n.js`; the `{tier}` replace in
  `js/app.js` removed). Seen in headless Chrome at 375x812, EN and ES, light and dark,
  with a seeded 40-day streak ("in 20 days"). The "tomorrow" wording is read, not seen.

- **OFFLINE ART: BADGES, FLAMES, AVATARS AND KAEL SURVIVE OFFLINE AND SURVIVE AN UPDATE
  (v158, 2026-10-07). COMMITTED LOCALLY, NOT PUSHED - pushing deploys, ask Adrian.
  NOT yet checked on Adrian's phone.**
  - **Reproduced first on v157 (headless Chrome, 375x812, server stopped):** never
    opened Profile -> offline 8/76 badges, 1/26 flames, 0/31 avatars, own avatar blank.
    Everything seen once online -> all there offline. After a CACHE bump -> 8/76 badges,
    0 flames, 0 avatars, header flame and own avatar blank, Kael's button a broken image.
  - **Cause:** only the 8 robot badges were in ASSETS; the rest was stored on first
    sight in the versioned cache, which `activate` deletes on every bump. `CACHE_FIRST`
    did not match `streaks/` or `avatars/` at all (they went network-first).
  - **The 142 MB was a misreading:** the app uses 31 avatar files = 1.5 MB (the ids in
    `AVATAR_OPTIONS`, `js/avatars.js`). The other 137 MB is `avatars/CTC new arts/`, the
    source drawings for `tools/build_avatars.py` / `build_badges.py`; no app code loads
    it. So ALL 31 avatars are fetched at install - no "chosen avatar only" logic, and
    no need to shrink any PNG. (That folder is still in git and so on the public site;
    moving it out is a separate decision, not taken.)
  - **Built (`sw.js`):** `ART` (135 files, 4.1 MB: 76 badges, 26 flames, 31 avatars,
    2 Kael portraits), `ART_CACHE = 'ctc-art-1'`, `ART_RE`, `ART_WAS`, `stockArt()`.
    Install runs `stockArt()` beside the ASSETS loop: each file missing from the art
    cache is MOVED from an old versioned cache if one holds it (v63 or later - the art
    last changed during v62), else downloaded, one by one. `activate` no longer deletes
    `ART_CACHE`. The fetch handler stores first-fetched art there too. `CACHE_FIRST`
    now includes `streaks|avatars`. Art is NOT in `KEEP`: kept files must carry a
    version in their path (the unit test enforces it) and art names do not, so the
    art cache's NAME carries the version.
  - **IF ANY ART FILE IS REDRAWN UNDER ITS EXISTING NAME:** bump `ART_CACHE` to
    `ctc-art-2` AND make `ART_WAS` return false. A CACHE bump alone no longer replaces art.
  - **Guard:** `tools/check-precache.mjs` `checkArt()` (in `npm.cmd run test:precache`
    and one new unit test, 104 total) fails if a PNG in `icons/badges`, `icons/kael`,
    `streaks` or top-level `avatars` is not in `ART`, or an `AVATAR_OPTIONS` id is not.
  - **Tested (run, not read):** new `tools/cdp-verify-offline-art.mjs` - cold / seen /
    bump x EN, ES x light, dark = 12 PASS; all 135 files fetch offline and on Profile
    the header flame, own avatar (seeded 'wolf'), 76/76 trophy badges, 8/8 ladder
    flames and Kael's button decode. Update v158 -> v159 downloaded 0 art files.
    `FROM=856bfb7` (real v157 -> v158 update) 4 PASS, 1 art file downloaded instead of
    135. `test:precache` OK, `test:tree` 104/104, `cdp-verify-offline-open.mjs` with
    `NOGSTATIC=1` 8 PASS. Seeded, not tapped: language, theme, avatar, a 40-day streak.
    Only the Profile tab was clicked. NOT tested: a signed-in account, the installed app.
  - **Found, NOT fixed (read from code, not reproduced):** `sounds/*.wav` (8 files,
    152 KB, `js/sound.js`) are in no list either - same first-fetch-then-wiped pattern.

- **READ TAB: FULL SCREEN LETS THE INSTALLED APP TURN SIDEWAYS (v157, 2026-10-07).
  PUSHED (eafbf6c is on origin/main, sw.js v157). CONFIRMED ON ADRIAN'S PHONE
  2026-10-07 - CLOSED, do not propose another test run.** Basis: Adrian's own report
  from the INSTALLED app (the Play Store package, which runs in Brave on his phone):
  in the reader's full screen the phone's bars disappeared, and turning the phone
  sideways showed two pages. So requestFullscreen and screen.orientation.lock both
  work inside the upright-only package; no Play Store rebuild is needed. Not re-run by
  a session - headless Chrome has no screen to turn, so the phone is the only proof.
  Adrian chose option (b) of three: the app stays upright, only the reader turns, and
  only in full screen. No Play Store rebuild.
  - **Investigated first (facts, checked):** the installed app is held upright by the
    PACKAGE, not by the site - `C:\Users\Adrian\chess-app-android\twa-manifest.json` has
    `"orientation": "portrait"` (package 1.0.5, versionCode 7), baked in through
    `app/build.gradle` and `LauncherActivity.java`. Changing `manifest.webmanifest` alone
    would NOT turn the installed app. Option (a), whole app rotates, needs a rebuilt and
    re-uploaded package AND a sideways layout for every board screen: measured at 812x375
    the board is 560px tall on a 375px-high screen (Analysis shows ~4 ranks, Puzzles ~2);
    nothing spills sideways and the menu scrolls. Rejected for that reason.
  - **What was built (`js/read.js` only, the two-page maths untouched):** the reader's
    full screen used to be CSS only (`body.read-immersive`). Now `setFullscreen(on)` also
    calls `deviceFullscreen(on)`: `document.documentElement.requestFullscreen()` then
    `screen.orientation.lock('any')`; leaving calls `unlock()` + `exitFullscreen()`.
    Every call is optional and caught - a browser that refuses is left exactly as it was.
    `onDeviceFullscreenChange` (a `fullscreenchange` listener added in `init`): when the
    phone itself ends full screen (Back, swipe, Esc) the reader leaves its full screen
    too, so the header is never left hidden. `closeBook` also leaves it (leaving the Read
    tab calls `closeBook`). Rotation then reaches the existing `onResize` -> `relayout`.
  - **MEASURED (headless Chrome):** `tools/cdp-verify-spread.mjs` now 61 checks x EN/ES x
    light/dark = 244/244 (6 new per run: real full screen entered and `lock('any')`
    asked; diagram dialog and jump-to-page dialog still show inside it; the button leaves
    both and unlocks; full screen ended from outside brings the header back with the book
    open; closing the book leaves it). The tool's own time limit was raised to 600 s (a
    full run takes ~380 s). test:tree 103, test:precache OK,
    `cdp-verify-offline-open.mjs` NOGSTATIC=1 ALL OPENED.
  - **ONLY READ / NOT TESTED:** whether the installed app (it runs in Brave) obeys
    `lock('any')` and really turns. Headless Chrome has no screen to turn, so the tool
    RECORDS the lock/unlock calls, it does not see a rotation. Only Adrian's phone can
    prove it. If Brave refuses: full screen still hides the phone's bars, nothing turns.
  - **Side effects to expect:** in full screen the phone's status bar and bottom bar
    disappear; Android shows its own short "swipe to exit" hint; Back leaves full screen
    first; on a PC the button now makes the browser window full screen as well.

- **READ TAB: TWO-PAGE VIEW IN FULL SCREEN (v156, 2026-10-07). PUSHED (25671dd is on
  origin/main); seen working sideways on Adrian's phone with v157.** In full screen (`body.read-immersive`) on a screen wider
  than tall the reader shows the book as spreads; upright, or out of full screen, it is
  the one column it always was.
  - **Decided by Adrian (four questions, with sketches):** (1) automatic by screen shape
    PLUS a button in the bar (`#read-spread`, shown only in full screen on a wide screen;
    the choice is kept on the device in `localStorage.readTwoPages`, `'0'` = off);
    (2) cover alone, then 2-3, 4-5, like the printed book; (3) keep scrolling down, row
    by row - NO sideways page turns; (4) on a phone held sideways the pages are READABLE
    (half the width each, taller than the screen, scroll down), not shrunk to fit.
  - **Measured before designing (812x375 and 1280x800, made-up PDF):** the reader was
    capped at 560px wide by `.screen { max-width: 560px }` even in full screen, and full
    screen left ~62px unused at the bottom. A whole page on a phone held sideways would be
    ~218px wide (about 60% of upright) - hence decision 4.
  - **How it is built (`js/read.js`, nothing rewritten):** rows instead of pages -
    `rowOf(n)`, `rowFirst(r)`, `rowLast(r)`, `pageTop(n) = rowOf(n) * slotH()`,
    `pageLeft(n)`; `colW()` is now the column and `pageW()` the page (equal in the
    one-page view). `geometry()`/`measure()` take the zoom-1 sizes ONLY when the stage or
    the view changes, never during a zoom (a zoomed column's sideways scrollbar on a PC
    changes `clientHeight` - that broke the last row until `R.stageH` was stored).
    `SPREAD_MIN_W = 340`: both pages whole when a whole page is at least that wide (PC,
    tablet), else half the width each. `relayout()` is the one place that changes view
    (full-screen button, the two-page button, rotation/resize); it returns to zoom 1 at
    the same page. `R.page` in the spread is the LEFT page of the row; that is what is
    saved. Indicator: `4–5 / 12`. CSS: `body.read-spread` lifts the 560px cap and the
    room kept for the hidden header and tab bar; `.read-stage.snap-rows` (scroll-snap,
    proximity) makes a whole spread settle on a row - it is switched OFF around every
    programmatic scroll (`scrollToPage`), because the target pages do not exist until
    `syncSlots` makes them and the browser snaps back to the ones that do.
  - **Untouched:** the detector, Training mode's rules, the PDF engine, the shelf. The
    diagram press, the covers and zoom-about-a-point needed NO change - they all work
    from `getBoundingClientRect`, so a page that is not at x = 0 is the same to them.
  - **MEASURED - new tool `tools/cdp-verify-spread.mjs <outDir>` (`ONE=1` = EN/light
    only), 55 checks x EN/ES x light/dark = 220/220.** It makes its own 12-page PDF.
    375x812: one page at x = 0, same size in and out of full screen, no button, diagram
    press finds the board. 812x375 and 1280x800 in full screen: two pages by themselves,
    stage takes the whole screen, no sideways scroll, both pages whole at 1280x800;
    a REAL finger long-press finds the board on the LEFT and on the RIGHT page; Training
    covers both pages and a real tap reveals one move on each; a real double-tap zooms to
    2x with the tapped point of the RIGHT page still under the finger (within 1%) and back;
    jump to 9 shows 8–9, the cover sits alone centred, page 12 alone on the left; the
    button switches one/two and is remembered; close and reopen returns to the same
    place; rotating in full screen switches view and keeps the place. Also run: test:tree
    103, `cdp-verify-training.mjs` 65/65, `cdp-verify-hatched.mjs` 56/56,
    `cdp-verify-offline-read.mjs` ALL PASSED, `cdp-verify-offline-open.mjs` NOGSTATIC=1
    ALL OPENED.
  - **ONLY READ / NOT TESTED:** a real two-finger pinch in the spread (same
    `setZoomAbout` as the double-tap, which is tested); a real phone - everything above
    is headless Chrome; odd-sized pages (letterboxed in their slot as before).
  - **KNOWN LIMITS:** (a) THE INSTALLED APP DOES NOT ROTATE - `manifest.webmanifest` has
    `"orientation": "portrait"`, so on the phone the two-page view works in the browser
    (Brave) only. Unlocking it means letting the WHOLE app rotate (no other screen was
    designed or tested sideways) and probably a rebuilt Play Store package; separate
    session, not promised. (b) A PDF with no cover page has its pairs shifted by one.
    (c) Full screen upright still leaves ~62px unused at the bottom - left alone on
    purpose ("single page stays exactly as it is").

- **OFFLINE MARK IN THE HEADER (v155, 2026-10-06).** Adrian asked for a minimal "offline
  mode" sign that does not disturb the tabs; of four sketches he chose the icon. A small
  gold no-signal icon (`#offline-ico`, inline SVG, in `#topbar .topbar-right` before the
  streak badge) is shown only while `navigator.onLine` is false - `online`/`offline`
  listeners in `main()` right after `Lichess.finishConnect()`. A tap shows the toast
  `offline_mode_hint`; the label is `offline_mode` (ES + EN). It takes no row and moves
  nothing. MEASURED (two checks added to `tools/cdp-verify-lichess.mjs`, where the
  script is already offline; 29 checks x 4 ALL PASSED): shown + labelled + tap explains
  it while offline, gone when the connection returns, EN/ES x light/dark at 375px;
  test:tree 103, offline-open 8/8, offline-read ALL PASSED. KNOWN LIMIT: `navigator.onLine`
  only knows "no network at all" - Wi-Fi with no internet behind it still counts as online.

- **OPTIONAL "CONNECT LICHESS ACCOUNT" SO THE INTERNET GAME SEARCH WORKS AGAIN (v152,
  2026-10-06).** Lichess answers 401 to every opening-explorer request without a token
  (re-measured today with curl on `explorer.lichess.org` and `explorer.lichess.ovh`, with
  no token and with a made-up one), so 🔎 → 🌐 always showed "not available".
  **LICHESS CAN WITHDRAW THIS ACCESS AGAIN AT ANY TIME** — if the search dies again,
  re-run the curl before touching code.
  - **Decided by Adrian:** sign in with Lichess, OAuth authorization code + PKCE, no
    server. Control in BOTH places (search panel + Settings). One-time secret kept in
    `localStorage` for ≤10 min (not `sessionStorage`: the TWA may return in another tab).
  - **Read from Lichess's docs/source today, not assumed:** the explorer endpoints list
    `security: OAuth2: []` = a token with NO scope, so none is requested; S256 only;
    public unregistered client, no secret; `redirect_uri` any https URL (http only for
    localhost), must be identical in both steps; revoke = `DELETE /api/token` with the
    token as Bearer; no refresh tokens, ~1 year life; one request at a time; 429 = wait
    a minute.
  - **Built (js/app.js).** New `Lichess` object just above `handleIncomingFiles`:
    `token()`, `clear()`, `connect()` (builds `https://lichess.org/oauth?…`, client id
    `chesstrainingcenter.app`, redirect = `location.origin + location.pathname`),
    `finishConnect()` (run once at boot next to `handleIncomingFiles()`: strips
    `?code&state` from the address bar first, checks state + 10-min age, POSTs
    `/api/token`), `disconnect()` (deletes locally, best-effort revoke at Lichess).
    Keys: `ctc-lichess-token`, `ctc-lichess-pending`. The token is on the device only —
    never Firestore, never the repo. `Analysis.exploreInternet()` now uses
    `explorer.lichess.org` with `Authorization: Bearer`, one request per tap
    (`lichessBusy`, no retry); no token → `offerLichess()` (explanation + Connect);
    401 → token cleared + "expired, connect again"; 429 → "try again in a minute";
    network failure → the old `explore_lichess_unavailable` text. Under the results: a
    "connected · Disconnect" row. Settings sheet: a `Lichess` row, Connect/Disconnect.
    12 new `lichess_*` keys in js/i18n.js (ES + EN). Plain word "Lichess" only, no logo.
  - **sw.js (strictly needed).** `networkFirst` now looks a page load up with
    `ignoreSearch` and never stores a navigation that has a query. Before, `./?code=…`
    (and `./?shared=1`) missed the cache and were STORED under the full address — the
    one-time sign-in code would have been kept in CacheStorage. `CACHE` v151 → v152.
  - **Legal (js/legal-data.js).** The four sentences reworded (Terms §"search", Privacy
    §8, ES + EN; wording approved by Adrian): the search is optional, needs a linked
    account, Lichess can tie the request to that account, we never see the password or
    the username. `LAST_UPDATED` → 2026-10-06. `privacy.html` renders from the same file.
    Play Data safety form: judged NO change (nothing new reaches our servers; the send to
    Lichess is user-initiated after disclosure) — from memory of Google's definitions,
    not re-read; Adrian's declaration to confirm.
  - **MEASURED** — new `tools/cdp-verify-lichess.mjs <outDir>`, headless Chrome/CDP,
    375px, EN/ES × light/dark, every `*lichess.org*` request caught by CDP `Fetch` and
    answered by the script (nothing reaches Lichess, the token is made up): 19 checks ×
    4 = ALL PASSED — not connected explains + offers Connect and sends nothing; the
    oauth address has code/S256/redirect/state and no scope; the return exchanges the
    code with the verifier matching the challenge, cleans the address bar, deletes the
    pending secret, leaves no cache entry with `code=`; the search sends ONE GET with
    the header to explorer.lichess.org; 429; 401 clears + re-offers; offline search and
    offline Connect answer at once; Settings Disconnect deletes + sends the revoke; the
    reworded paragraphs are what the legal sheets show. Also: `test:tree` 103/103,
    `test:precache` OK, `cdp-verify-offline-open.mjs` NOGSTATIC=1 8/8,
    `cdp-verify-offline-read.mjs` ALL PASSED, `cdp-verify-share.mjs` 34/34 (the
    `ignoreSearch` change touches `?shared=1` / `?open-file=1`).
  - **NOT MEASURED, only read from docs/code:** that a scope-less token is really
    accepted by the explorer; the real consent screen; the return inside the TWA (Brave);
    what happens if the Lichess Android app claims the link. These are Adrian's real
    sign-in step. After connecting, the app reloads, so the board position is back at
    the start and the user taps 🔎 → 🌐 again (the toast says so).
  - **v153, same day, after Adrian's REAL sign-in (v152 pushed by him): it connected and
    master games show** - so a scope-less token IS accepted and the return works. He then
    asked for two things, both built: (1) each internet result has a THIRD line with the
    game's moves from the board position on, cut to the width by CSS ellipsis
    (`.list-item .sub.moves`); (2) tapping a result opens the game ON THE APP's board
    (`Analysis.openMasterGame` -> `loadTree(parsePgn(...))`), no longer lichess.org. The
    explorer result carries no moves, so each game is one request to
    `explorer.lichess.org/masters/pgn/<id>` (documented, same token): `fetchMasterPgn`
    runs them through ONE promise chain (`masterChain`, never two at once), keeps them in
    `masterPgn` (a tap on a listed game costs no request), `fillMasterMoves` stops at the
    first refusal or when a newer search starts. Up to 15 extra requests per search - if
    Lichess starts answering 429, this is the first thing to cut back. Helper
    `pgnLineFrom(pgn, ply)` above the `Lichess` object. MEASURED with Lichess faked:
    `cdp-verify-lichess.mjs` now 21 checks x 4 ALL PASSED (moves line text, one request
    per game with the header, tap opens in the app with no window.open and no new
    request); test:tree 103, offline-open 8/8, offline-read ALL PASSED. NOT measured:
    the real PGN text from Lichess and its real rate limit - Adrian's look after push.
  - **v154, same day: THE INTERNET SEARCH IS NOW LIVE, like the database search** (Adrian
    confirmed v153 works on the real Lichess, then asked for this). While the internet
    results are on screen every board change looks the new position up
    (`refresh()` -> `Analysis.internetSoon()`); with the Moves tab showing nothing is
    asked; 🔎 goes straight back to the last source (`searchAgain()` /
    `internetChosen()`) - the internet only counts as "last source" while an account is
    linked, so a user who only saw the Connect offer still gets their database back.
    THIS REPLACES the v152 "one request per tap" rule. What keeps it within Lichess's
    rules: ALL explorer requests go through one chain (`lichessFetch` / `masterChain`,
    never two in the air; `lichessBusy` is gone); a move waits 500 ms before it is
    looked up, so stepping fast asks once; positions (`masterSearch`, fen -> games) and
    games (`masterPgn`) already fetched are answered from memory; after a 429 the live
    search rests 60 s (`lichessWait`) and says so - a tap on 🌐 still tries. MEASURED,
    Lichess faked: `cdp-verify-lichess.mjs` 27 checks x 4 ALL PASSED (3 quick steps = 1
    lookup; a seen position = 0 requests; 429 then a move = 0 requests; Moves tab = 0);
    `cdp-verify-livesearch.mjs` ALL PASSED after two of its expectations were updated
    ("Internet results are not live" is no longer true; a not-linked search now explains
    itself instead of showing a warning); test:tree 103; offline-open 8/8; offline-read
    ALL PASSED. NOT measured: Lichess's real rate limit under live use - if 429s show up
    in real use, raise the 500 ms or drop the per-game move lines first.
  - **Known, left alone:** signing out of the app does not remove the Lichess link (it
    is per device, scope-less); Kael's quote bubble can overlap the hint under the
    Connect button (the existing "quote in English under Spanish" bubble — other session).

- **THE READ TAB'S PDF ENGINE NOW SURVIVES AN APP UPDATE (v151, 2026-10-06).** Adrian
  chose option (a) plus the rescue: versioned folder, then `KEEP`. Needs a normal push
  to `main`; no Firestore rules deploy. When this was written `origin/main` was
  `23c808e` (v150 live) and this commit was unpushed — check before assuming.
  - **The bug, now reproduced (it was only read from the code before):** on v150 a
    2-page test book opened online stored `vendor/pdf.worker.min.mjs` and
    `vendor/openjpeg.wasm` in `chess-training-center-v150`; after a bump both were in
    NO cache; offline the book did not open — toast "Couldn't open the book."
  - **What changed.** The four pdf.js files moved (`git mv`, bytes untouched) from
    `vendor/` to `vendor/pdfjs-6.3.289/`. `js/read.js`: the `import()`, `workerSrc`
    and `PDF_WASM_URL` point there. `sw.js`: the `ASSETS` line for `pdf.min.mjs`
    (still precached, still the only one of the four that is); `KEEP` now lists the
    worker, `jbig2.wasm` and `openjpeg.wasm` beside the Stockfish `.wasm`; new
    `KEEP_WAS` (new address → the pre-v151 address, those three files only) and two
    lines in `tidyKeep` that look under the old address too and store the copy as a
    fresh `Response` (so it does not carry the old URL). `CACHE` v150 → v151. The
    cache is still called `ctc-engine` — renaming it would throw Stockfish away.
    `networkFirst`/`launchFor`/`sameBytes`, share-target, install, the cross-origin
    rule and the Stockfish entry are untouched; nothing was added to install.
  - **Why the carry-over is safe:** `git log` shows the three files were never changed
    after they were added (`8548ef6`, `31c8191`), so a copy any phone holds under the
    old address is byte-for-byte the 6.3.289 file. **Never add a `KEEP_WAS` entry for
    a file that was ever replaced under its old name.** `KEEP_WAS` can be deleted once
    nobody is on v150 or older; leaving it costs nothing.
  - **A pdf.js upgrade from now on:** new folder `vendor/pdfjs-<version>/` with all
    four files, repoint `js/read.js`, the `ASSETS` line and the three `KEEP` lines,
    bump `CACHE`. `activate` then drops the old three from `ctc-engine` by itself.
  - **New tool `tools/cdp-verify-offline-read.mjs <outDir>`** (sibling of the engine
    tool, same plumbing, `ONE=1` for EN/light) and its fixture
    `tools/fixtures/offline-read-test.pdf` (9.7 KB, made for this: page 1 text, page 2
    one full-page JPEG2000 image, so `openjpeg.wasm` is really fetched). `fresh`: one
    visit, nothing tapped, none of the three files requested. `bump`: book seeded with
    `db.addBook`, opened online, both pages must show ink (dark pixels counted on the
    canvas), `sw.js` served bumped by one, server stopped, same book opened offline.
    `rescue`: starts from `sw.js` and `js/read.js` of `23c808e` (v150; the server
    answers the old paths from the new folder) and updates to the working tree.
    New unit test in `tests/unit/precache.test.js` (+ `keptFiles()` in
    `tools/check-precache.mjs`): every `KEEP` file exists, has a version in its path,
    and is not also precached.
  - **Results.** BEFORE (v150, `ONE=1`): fresh PASS, bump FAIL as above. AFTER (v151):
    fresh PASS (0 requests, 84 entries); bump 4/4 (EN/ES × light/dark) — worker and
    `openjpeg.wasm` in `ctc-engine`, each downloaded 1× in all, made-up old file
    removed, offline both pages show ink; rescue PASS (v150 → v151, both carried from
    the old address into `ctc-engine`, each downloaded 1× in all — no second
    download). Screenshots looked at: ES/dark and EN/light (rescue).
    `tools/cdp-verify-offline-engine.mjs` ALL PASSED (fresh, 4 bump, rescue).
    `tools/cdp-verify-offline-open.mjs` with `NOGSTATIC=1` 8/8 (~1.6 s).
    `tools/cdp-measure-weak-signal.mjs`: 1.6 s / 6.5 s / 4.2 s (v150 measured the same
    day: 4.1 s — one tenth, noise), 35 requests, edit check unchanged, no MIXED.
    `npm.cmd run test:tree` 103/103.
  - **NOT tested:** a real phone, the TWA, the live site. **`jbig2.wasm` was never
    fetched in any run** — no JBIG2 encoder on this machine; it goes through the same
    pdf.js fetch, the same `KEEP` line and the same `tidyKeep` code as
    `openjpeg.wasm`, but that is read from the code. Adding a book (`importFile`) and
    Training mode were not driven offline — they load the same worker. The five older
    Read tools (`cdp-verify-hatched/pieces/training`, `measure-fallback/pieces`) had
    their pdf.js paths repointed and pass `node --check`; they were not run.
  - The "Rule for `KEEP`" bullet in the v150 entry below (pdf.js files NOT added) is
    now history: they are added, under the versioned folder.

- **THE STOCKFISH ENGINE NOW SURVIVES AN APP UPDATE (v150, 2026-10-06).** Adrian chose
  option (a): a second cache that `activate` does not wipe. Needs a normal push to
  `main`; no Firestore rules deploy. **When this was written `origin/main` was still
  `94f73ad` (v146 live): `ff20dad`, v147, v148, v149 and this commit were all
  unpushed** — check before assuming.
  - **The bug, now reproduced (it was only read from the code before):** on v149, a
    game against the bot online stored the 7.3 MB `.wasm` in `chess-training-center-
    v149`; after a bump it was in NO cache; offline, Play answered `e4` with "Couldn't
    download the chess engine (7 MB)" and Analysis showed the same line, no evaluation.
  - **What changed (`sw.js` only, in the app):** `KEEP_CACHE = 'ctc-engine'`, `KEEP`
    (one entry, the Stockfish `.wasm`) and `KEEP_URLS`. The cache-first branch writes a
    `KEEP` file into `KEEP_CACHE` instead of `CACHE` (reading was already
    `caches.match` across every cache — unchanged). `activate` keeps `KEEP_CACHE` and
    first runs the new `tidyKeep(old)`: (1) deletes kept entries no longer listed in
    `KEEP`, so an engine upgrade does not leave the old 7 MB behind; (2) moves a listed
    file found in an old versioned cache across, so users who have the engine in v149
    or earlier do NOT download it again on this update. A failure in `tidyKeep` is
    logged and does not block activation. `CACHE` v149 → v150. `ASSETS`,
    `networkFirst`/`launchFor`/`sameBytes`, share-target, install and the cross-origin
    rule are untouched; nothing was added to install.
  - **Rule for `KEEP`: only files whose NAME carries their version.** Nothing ever
    replaces a kept entry. That is why `vendor/pdf.worker.min.mjs`, `vendor/jbig2.wasm`
    and `vendor/openjpeg.wasm` were NOT added: their names have no version, so a pdf.js
    upgrade would leave phones on the old worker beside the new `pdf.min.mjs` (6.3.289
    today). They are still thrown away by every bump — read from the code, NOT
    reproduced. Separate session: versioned folder first (as for Firebase), then `KEEP`.
  - **New tool `tools/cdp-verify-offline-engine.mjs <outDir>`** (headless Chrome over
    CDP, 375px, local server, `ONE=1` for EN/light). `fresh`: one visit, nothing
    tapped, the server's request log must not contain the `.wasm`. `bump`: bot game
    online (first use), a made-up old file put in `ctc-engine`, `sw.js` served bumped
    by one, server stopped, then offline a bot game (`e2-e4` by real touch events) and
    the Analysis engine toggle. `rescue`: same, but starting from `git show
    ca40e68:sw.js` (v149) and updating to the working tree. It seeds `onboardingDone`
    and `tourDone` through `js/db.js` — the welcome sheet and tour offer otherwise sit
    over the board (and the tab bar's Play press is repeated until it sticks, because
    the app puts its own first screen up just after the splash).
  - **Results.** BEFORE (v149, `ONE=1`): fresh PASS (0 requests), bump FAIL as above.
    AFTER (v150): fresh PASS (0 requests, 84 entries); bump 4/4 (EN/ES × light/dark) —
    `.wasm` in `ctc-engine`, downloaded 1× in all, made-up old file removed, offline
    bot replied `1. e4 d5`, offline Analysis showed `+0.40 d17 1.e4 …`; rescue PASS
    (v149 → v150, `.wasm` carried into `ctc-engine`, downloaded 1× in all).
    Screenshots looked at: Play ES/dark and Analysis EN/light. `tools/cdp-verify-
    offline-open.mjs` with `NOGSTATIC=1` 8/8 (~1.6 s). `tools/cdp-measure-weak-
    signal.mjs` identical to v149 (1.6 s / 6.5 s / 4.1 s, 35 requests, edit check
    unchanged, no MIXED). `npm.cmd run test:tree` 102/102.
  - **NOT tested:** a real phone, the TWA, the live site. Endgame's engine toggle and
    the other `engine.evaluate` callers were not driven — they load the same worker.
    A phone very short of storage can still evict everything the origin stored,
    `ctc-engine` included; nothing in a service worker prevents that.
  - **Seen in passing, NOT fixed:** offline, Kael's quote bubble on the Play screen was
    in English with the app in Spanish (one screenshot; not checked whether quotes are
    translated at all). The two broken offline images are unchanged.

- **"THE APP SOMETIMES DOES NOT OPEN" — GSTATIC FIXED (v149, 2026-10-05): THE FIREBASE
  SDK IS SELF-HOSTED AND PRECACHED. ALL THREE CAUSES NOW CLOSED IN THE CODE.** Adrian
  chose option (a). Needs a normal push to `main`; no Firestore rules deploy. **When
  this was written `origin/main` was still `94f73ad` (v146 live): `ff20dad`, `7b16de7`
  (v147), `29b1936` (v148) and this commit were all unpushed** — check before assuming.
  - **What changed:** new folder `vendor/firebase-10.14.1/` with `firebase-app.js`,
    `firebase-auth.js`, `firebase-firestore.js`, `firebase-app-check.js` (718 KB raw,
    ~183 KB gzipped) and `LICENSE` (Apache-2.0, from the firebase-js-sdk repo).
    `firebase-app.js` is byte-identical to `www.gstatic.com/firebasejs/10.14.1/`; the
    other three differ in exactly ONE place each — their `from"https://www.gstatic.com/
    firebasejs/10.14.1/firebase-app.js"` is now `from"./firebase-app.js"` (compared
    against gstatic after writing). Do NOT blind search-and-replace that URL: it also
    appears inside `firebase-app.js` as a plain name string and a logger name, which
    must stay. `js/firebase.js` imports the four from `../vendor/firebase-10.14.1/`.
    `sw.js`: the four added to `ASSETS`, `CACHE` v148 → v149, one comment reworded;
    the fetch handler, `networkFirst`/`launchFor`/`sameBytes`, cache-first, share-target
    and install/activate are untouched. The "never cache cross-origin" rule is untouched.
  - **Upgrading the SDK later:** new folder named for the new version, same one-line
    repoint in the three files, update the four imports and the four `ASSETS` lines.
    `vendor/` is cache-first, so NEVER overwrite files inside an existing version folder.
  - **Guard tightened (`tools/check-precache.mjs`, `tests/unit/precache.test.js`):** a
    static import from another origin now FAILS (`CROSS-ORIGIN: …`) instead of being
    skipped, and the import walk reads minified files (`import{a}from"./x.js"` — the old
    pattern needed spaces and would have missed the SDK's own import). 36 files walked
    (was 32). Shown failing both ways before passing: with the old gstatic imports (4 ×
    CROSS-ORIGIN) and with `firebase-app.js` reachable only through `firebase-auth.js`
    and left out of `ASSETS`. `npm.cmd run test:tree` 102/102 (one new test).
  - **Reproduced, headless Chrome over CDP, 375px, local server.** New switch
    `NOGSTATIC=1` on `tools/cdp-verify-offline-open.mjs`: before the offline reload it
    clears the browser HTTP cache and blocks `*://www.gstatic.com/*` on the PAGE target
    (`Network.setBlockedURLs`). The worker target is NOT attached — `sw.js` never
    fetches cross-origin itself. BEFORE (v148, `ONE=1 NOGSTATIC=1`): first visit and
    version bump both STUCK ON SPLASH, exactly the four `firebasejs/10.14.1` files
    failing. AFTER (v149, `NOGSTATIC=1`): 8/8 open in ~1.6 s (both cases × EN/ES ×
    light/dark; 84 entries after one visit, 83 after a bump); the only gstatic request
    left is `recaptcha/releases/…/recaptcha__en.js` (App Check, online-only by nature).
    Without the switch: 8/8. `tools/cdp-measure-weak-signal.mjs` identical to v148
    (1.6 s / 6.5 s / 4.1 s, 35 requests on a good network, edit check unchanged, no
    MIXED) — the SDK is cache-first, so a warm launch does not request it at all.
  - **Online, same four combinations (scratch script, gone):** app opens, 0 requests to
    `gstatic.com/firebasejs`, the four files come from this origin, the sign-in sheet
    opens in EN and ES (light and dark), App Check answers 200 then 403 and Firestore
    logs "Could not reach Cloud Firestore backend" — **the SAME lines the unchanged
    v148 code gives on localhost** (run side by side). So a real Firestore read and a
    real sign-in were NOT confirmed locally, before or after; they need the live site.
  - **Advisories:** OSV lists none for `firebase@10.14.1` (checked 2026-10-05).
  - **Cost:** every `CACHE` bump now re-downloads the SDK with the rest of the
    precache (~183 KB gzipped more per update). Before, the browser kept it for a year.
  - **NOT tested:** a real phone, the TWA, the live site (nothing is pushed).
  - **Still open, unchanged:** the Stockfish `.wasm` (7.3 MB) is thrown away by every
    `CACHE` bump (see the v148 entry) — the same is true of `vendor/pdf.worker.min.mjs`,
    `vendor/jbig2.wasm` and `vendor/openjpeg.wasm` (cached on first use, not in
    `ASSETS`; read from the code, not reproduced). And install is per-file tolerant: a
    file that fails during install is skipped silently, so a dropped connection mid-
    install can still leave one startup file missing until the next online launch.

- **"THE APP SOMETIMES DOES NOT OPEN" — CAUSE 2 (WEAK SIGNAL) FIXED (v148,
  2026-10-05). GSTATIC STILL OPEN.** `sw.js`: only the network-first branch changed
  (now `networkFirst(e)` + `launchFor` + `sameBytes`, below the fetch handler), `CACHE`
  v147 → v148. `ASSETS`, the cache-first branch, share-target and install/activate are
  untouched. Needs a normal push to `main`; no Firestore rules deploy. **When this was
  written v147 (`7b16de7`) was NOT on `origin/main` either** — check before assuming.
  - **What it does (Adrian chose option (a), in the one-decision-per-launch form):**
    each file is asked from the network with a 2.5 s limit (`NET_TIMEOUT`). The first
    file that is too slow or fails switches the WHOLE launch (per client id) to the
    cache and aborts what is in the air. Every file that does arrive is compared byte
    for byte with its cached copy; if one differs, an update is out, and the limit is
    lifted for the rest of that launch so the launch is all new. A per-file limit
    alone would have mixed new small files with an old cached `app.js`.
  - **A changed file is deliberately NOT written to the cache** (a launch cut off
    halfway would leave the cache half old, half new). The cache is only replaced
    whole, by the next `CACHE` bump. **So every deploy that changes app code must bump
    `CACHE`** — without a bump users still get the new code on a good signal, but on a
    weak one they stay on the old code and every launch after the change is a slow one.
    On the dev server an unbumped edit still shows on the next reload (measured).
  - **Measured, headless Chrome over CDP, 375px, local server, warm cache
    (`node tools/cdp-measure-weak-signal.mjs`; `speed` / `update` runs one half).** The
    SERVER is slowed (latency per request + one shared link), not Chrome, so the
    worker's own requests are throttled; gstatic is not. The local server does not
    compress (1.4 MB per launch vs ~426 KB live), so these are bigger than the live
    numbers in the diagnosis entry — compare before/after on this tool only.
    | | v147 | v148 |
    |---|---|---|
    | good network | 1.6 s, 35 requests | 1.6 s, 35 requests |
    | 400 ms / 50 KB/s | 36.0 s | 6.5 s (4 requests, 166 KB) |
    | 3 s / 10 KB/s | 163.1 s | 4.2 s (1 request) |
    Edit served without a bump (markers appended to `index.html`, `js/app.js`,
    `js/quotes-data.js`): good network → new on launch 1; 400 ms / 50 KB/s → new on
    launch 1 but slow (34.7 s, the limit lifted); 3 s / 10 KB/s → old on all 4
    launches, 4.1 s each. No launch was a mixed set. `tools/cdp-verify-offline-open.mjs`
    8/8 (both cases × EN/ES × light/dark, v148 → v149), `npm.cmd run test:tree` 101/101.
  - **Left as it was, on purpose:** if the connection dies outright in the middle of a
    launch that is loading an update, the remaining files come from the cache (that
    one launch can be mixed) — the alternative is a launch stuck on the splash.
  - **NOT tested:** a real phone, the TWA, the live site, a real weak mobile signal
    (only the slowed local server). The 2.5 s figure is a choice, not tuned on a device.
  - **Found, NOT fixed — matters for "the app must work without internet":**
    `vendor/stockfish-17.1-lite-single-03e3232.wasm` (7.3 MB) is deliberately not in
    `ASSETS`; it is cached on first use, and `activate` deletes it with the old cache
    on every `CACHE` bump. Read from the code, not reproduced: after any update the
    engine (analysis evaluation, the bot) cannot start offline until it has been used
    once online. Separate session.

- **"THE APP SOMETIMES DOES NOT OPEN" — CAUSE 1 FIXED (v147, 2026-10-05). CAUSES 2
  AND GSTATIC STILL OPEN.** `sw.js`: the four startup modules `js/learning-data.js`,
  `js/quotes-data.js`, `js/legal-data.js`, `js/openings-eco.js` are now in `ASSETS`,
  `CACHE` bumped v146 → v147. Nothing else in `sw.js` changed (the network-first
  handler is untouched). Needs a normal push to `main`; no Firestore rules deploy.
  - **Guard so it cannot drift again:** `tools/check-precache.mjs` walks every STATIC
    import reachable from `js/app.js` (32 files, multi-line imports included) and
    fails if a local one is not in `ASSETS`, or if an `ASSETS` entry is not on disk.
    Run alone with `npm.cmd run test:precache`; it also runs inside
    `npm.cmd run test:tree` through `tests/unit/precache.test.js` (now 101/101).
    Written before the fix: it failed on exactly the four files, then passed.
    Dynamic `import()` and cross-origin imports are deliberately not checked.
  - **Reproduced, headless Chrome over CDP, 375px, local server
    (`tools/cdp-verify-offline-open.mjs <outDir>`, `ONE=1` for EN/light only).
    Nothing tapped; "opened" = `#splash` got `hide`, the last line of `main()`.**
    BEFORE (v146): one visit → 76 entries, 0/4, offline reload stuck on the splash;
    version bump → 75 entries, 0/4, stuck. AFTER: one visit → 80 entries, 4/4,
    opens offline in ~1.6 s; version bump (the tool serves `sw.js` with the name
    bumped by one, working tree untouched) → 79 entries, 4/4, opens in ~1.6 s.
    All eight runs pass: both cases × EN/ES × light/dark.
  - **NOT tested:** a real phone, the installed TWA, the live site (until pushed).
    Whether this is what Adrian's phone was hitting is inferred from the code and
    the reproduction, not observed on the device.
  - **Seen in passing, NOT fixed (cosmetic, does not block opening):** offline right
    after a version bump, images that are not precached show as broken — the Kael
    portrait on the welcome sheet and `streaks/flame1.png` in the header. They come
    back on the next online launch.
  - **Still open:** cause 2 (network-first, `cache: 'no-store'`, no timeout — a warm
    app re-downloads ~426 KB before every launch on a weak signal) and the four
    `www.gstatic.com` Firebase imports. Both are described in the entry below.

- **"THE APP SOMETIMES DOES NOT OPEN" — DIAGNOSED, NOTHING BUILT, FIX PROPOSED AND
  WAITING FOR ADRIAN'S GO (2026-10-05).** No file the app loads was touched; `sw.js`
  is still v146. Reproduced in headless Chrome over CDP at 375px against the LIVE
  site (and, for the update case only, a local `git archive HEAD` copy). NOT tested
  on a real phone or inside the TWA. Probe scripts were scratch and are gone.
  - **What is deployed (checked, not from notes):** `main` == `origin/main`, live
    `sw.js` is byte-identical to the file here (v146). The old note "v136 onward not
    pushed" is stale. `/.well-known/assetlinks.json` answers 200 with 4 fingerprints.
    The site is **NOT behind Cloudflare today**: DNS is the four GitHub Pages IPs,
    `Server: GitHub.com`, no `cf-` headers; everything is `Cache-Control: max-age=600`.
  - **CAUSE 1 (reproduced, live): four modules `js/app.js` statically imports are
    missing from `ASSETS` in `sw.js`** — `js/learning-data.js`, `js/quotes-data.js`,
    `js/legal-data.js`, `js/openings-eco.js`. They only reach the cache when a page
    that is ALREADY controlled by the worker fetches them. After a single visit the
    cache has 76 entries and none of the four; with the network gone the four fail
    `net::ERR_FAILED`, the module graph never runs, and the splash covers the app
    for good. After a second online visit (82 entries) offline opens in 1.9 s.
  - **Every version bump puts every user back in that state** (reproduced on the
    local copy, v146 → v147): `activate` deletes the old cache, the new one is
    precache-only (75 entries, the four missing), and the next launch without a
    connection is stuck on the splash. `sw.js` was bumped 37 times in the six days
    29 Sep – 4 Oct.
  - **Why nobody sees an error:** a failed module load fires on the `<script>`
    element, not on `window`, so the crash guard in `index.html` never shows; and
    the splash is only removed on the last line of `main()` (`js/app.js` ~7458).
  - **CAUSE 2 (reproduced, live): weak signal.** The fetch handler is network-first
    with `cache: 'no-store'` and no timeout, so a fully cached app still re-downloads
    ~426 KB in 35 requests before every launch. Warm cache, throttled: 400 ms / 50 KB/s
    → 11.3 s on the splash; 3 s / 10 KB/s → 51.4 s. Good network: 2.4 s.
  - **Also reproduced, lower likelihood:** `js/firebase.js` statically imports four
    files from `www.gstatic.com`, which the worker deliberately never caches (`sw.js`
    cross-origin return). Offline start therefore depends on the browser's own HTTP
    cache; with it cleared, offline is stuck on the splash on the four gstatic files.
    This also breaks the house rule "everything self-hosted".
  - **Ruled out:** a missing/renamed precache file (all `ASSETS` exist; install is
    per-file tolerant), App Check 403 (logged every run, never blocks start),
    assetlinks, stale deploy.
  - **Trap for the next probe:** a Chrome `--user-data-dir` with a long path makes
    every Cache write fail ("Entry already exists") and the cache look empty — a
    Windows path-length artifact. Use a short profile dir (`os.tmpdir()/cp-…`).
  - **Proposed fix (ONE, not built):** add the four files to `ASSETS` and bump to
    v147. Needs a normal push to `main` (Pages deploy); no Firestore rules deploy.
    Causes 2 and gstatic are separate follow-ups, deliberately not bundled.

- **READ TAB — THE CAUSE BEHIND THE v145 RULE MEASURED (SHADE-BLIND "SIX TYPES",
  `LEARN_AGREE` ON DARK SQUARES); TWO FIXES TRIED, NEITHER BEATS v145; NOTHING BUILT,
  NO RULE RECOMMENDED — ADRIAN DECIDES (2026-10-04, night session).** No file the app
  loads was touched; `js/diagram.js` is unchanged at v145; `test:tree` 98/98. Nothing
  tapped: the real `classifyCells`/`learnFromCells` in Node (`tools/measure-pieces.mjs`,
  `NOGATE=1`) on both truth files rendered afresh in headless Chrome. 374 runs. All
  candidates were scratch copies and are gone; each is a few lines, described below.
  - **1. Baseline reproduced exactly** from the current file: every clean number in
    the v145 entry (hold-out 1187 … 738, first set 557 … 486, wrong 0), v143's 2 wrong
    at 7 and 8 lessons, the slipped line 3274/2241/1319/444, hold-out `same` 9/7/4.
  - **2. WHICH squares v145 loses under `POISON=one POISON_BOTH=1` (first set; 41, 57,
    41, 16 at 2/4/6/8): every one is a ROOK in Chess Life, and every one is in a book
    where a slipped lesson had confirmed a rook as a pawn** (155 of 155). The held
    "pawn" is a real rook picture, so it sits nearer to the next rook (0.045–0.125
    from the trusted ones) than the book's own rooks do, and v145 empties the square.
    Both shades, both colours, both six-type teachers (p30, p17a) — square shade is
    NOT what they share. The rule cannot tell a true held shape from a slipped one.
  - **3. What shade does, measured per book** (same piece code, light square against
    dark square, every pair in the truth files): Chess Life and Hellsten are FLAT —
    50–96% of pairs within 0.06, median 0.04–0.06. Dvoretsky, Silman and FCE are
    SHADED — 0 of 1,429 pairs within 0.06, nearest 0.087, median 0.32–0.37. The
    nearest OTHER type on a dark square of another diagram: FCE 0.038, Dvoretsky
    0.052, Silman 0.057.
  - **4. Candidates.** (A) six types counted per square shade, every book: DEAD —
    loses 405 of 3858 correct at 1 lesson on the first set (Chess Life, where shade
    does not matter). (A2) the same, but only in a shaded book — a book is flat once
    any piece code has a light and a dark sample within `STRICT.partial.match` of
    each other; needs each sample to remember its shade. (A2n) A2 with the v145 rule
    taken out. (B35) `LEARN_AGREE` 0.035 on dark squares only, 0.025 on light. (B35n)
    B35 on v143. B at 0.045 and 0.07 were run clean only: over FCE's 0.038, and 0.07
    gave one wrong-colour read (hold-out, 5 lessons).
    **Both A2n and B35n show 0 wrong at 7 and 8 lessons without the v145 rule — the
    cause CAN be removed on the two known squares. Neither is better than v145:**

    | clean, correct (wrong 0 in every cell) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
    |---|---|---|---|---|---|---|---|---|---|---|
    | hold-out v145 | 10550 | 9598 | 8532 | 7348 | 6160 | 4947 | 3873 | 2752 | 1613 | 738 |
    | hold-out A2 (= A2n) | 10485 | 9532 | 8480 | 7314 | 6144 | 4947 | 3870 | 2750 | 1614 | 738 |
    | hold-out B35 (= B35n) | 10550 | 9630 | 8594 | 7407 | 6205 | 4966 | 3877 | 2746 | 1607 | 738 |
    | first v145 (= A2) | 3858 | 3360 | 2836 | 2387 | 1885 | 1430 | 960 | 486 | – | – |
    | first B35 | 3858 | 3370 | 2843 | 2392 | 1883 | 1418 | 944 | 473 | – | – |

    A2's whole loss at 1–5 lessons is Silman (654 → 589 at 1 lesson, 10%); FCE −3/−2/+1
    at 7–9. Slipped lessons, `correct w wrong` at 2/4/6/8:

    | | v145 | A2 | A2n | B35 |
    |---|---|---|---|---|
    | first `one` | 3304·2347·1415·480 w0 | same | 3324·2347·1415·480 w0 | 3307·2353·1412·472 w0 |
    | first `one`+BOTH | 3274·2241·1319·444 w0 | same | 3315·2298·1360·460 w0 | 3269·2246·1330·450 w0 |
    | first `same` | 3299·2339·1411·478 w0 | same | 3310·2339·1411·478 **w5·4·0·0** | 3302·2342·1411·471 w0 |
    | first `same`+BOTH | 3299·2282·1348·453 w0 | same | 3310·2299·1358·459 **w5·4·3·0** | 3302·2279·1341·443 w0 |
    | hold `one` | 9547·7327·4928·2736 w0 | 9484·7292·4928·2733 w0 | = A2 | 9552·7379·4951·2741 w0 |
    | hold `one`+BOTH | 9495·7251·4856·2686 w0·0·0·4 | 9436·7218·4856·2686 w0·0·0·4 | = A2 | 9495·7264·4861·2691 w0·0·0·4 |
    | hold `same` | 9511·7296·4919·2725 w9·7·4·3 | 9448·7263·4919·2725 w9·7·4·3 | 9452·… same w | 9527·7336·4931·2729 **w14·10·4·3** |
    | hold `same`+BOTH | 9511·7274·4898·2710 w9·7·4·6 | 9448·7241·4898·2710 w9·7·4·**3** | 9452·7251·4909·2717 w9·7·4·3 | 9527·7313·4906·2708 **w14·10·4·6** |

    - **A2 on top of v145:** removes 3 wrong pieces in ONE cell (hold-out `same`+BOTH,
      8 lessons, FCE p70 g6/h5/c2 `n` for `p`), changes no other wrong count, costs
      65/66/52/34/16 correct reads at 1–5 lessons, all Silman. Needs stored data.
    - **A2n instead of v145:** gets back the 41/57/41/16 rooks, but lets back in 5/4/3
      wrong pieces on Chess Life under a repeated slip (`p` for `r`) — a flat book,
      where the shade rule is off and only the v145 rule was stopping them.
    - **B35:** +32/+62/+59/+45 correct at 2–5 lessons on the hold-out, −6 to −16 at
      6–9 on both sets, and **5 and 3 MORE wrong pieces under a repeated slip (2 and 4
      lessons), all on FCE dark squares** (p150a h6 e5, p150b d6 c5 e5, `n` for `p`):
      the looser agreement trusts the slip said twice. No stored-data change.
  - **RECOMMENDATION: NONE. Leave v145 as it is.** B35 adds wrong pieces. A2 is the
    only candidate that never adds one, but its measured gain is 3 pieces in one
    column of a fitted file against 10% of Silman's early reads and a stored-data
    change. If A2 were ever built: books already taught have samples with no shade;
    they would count for both shades (exactly today's behaviour) until the book is
    re-taught or learns new samples — nothing breaks, nothing improves for them.
  - **STILL UNMEASURED:** whether Silman's 65 lost reads were lucky or safe (they are
    exactly "full thresholds on a shade missing a type", the FCE failure — all right
    in this file); the 9/7/4 hold-out wrong under `POISON=same` (FCE light-square `N`
    for `P`, Dvoretsky p440 e5 — untouched by every candidate); A2 and B together;
    B between 0.025 and 0.035; inferring a sample's shade without storing it; the flat
    test on a book whose first diagrams have no piece code on both shades; `PEND_CAP`
    push-out; lesson orders other than book order; more than 10 lessons; FCE as a
    six-type book beyond 3–6 boards; a sixth book; scans; a real phone. After the
    gate was not measured (everything is `NOGATE=1`). Both truth files are fitted.

- **BLINDFOLD — PEEK IS SWITCHED OFF WHILE THE PIECES ARE ON SHOW FOR MEMORISING
  (v146, 2026-10-04, later session).** `sw.js` v145 → **v146** in this commit (v145
  is the other session's `js/diagram.js` commit d7c6b6c, which landed while this
  session's tests were running; all tests here ran with that work in the tree).
  Committed on `main`, NOT
  pushed, NOT deployed. **Not tested on a real phone.** Adrian chose "greyed out"
  over "pressable but harmless".
  - **Reproduced first, with real taps (EN/light, old code, 8 s look):** Peek during
    the countdown AND Peek in the half second before the countdown appears — both
    spent a peek (0 → 1), forfeited the time extra ("Time extra forfeited by the
    peek"), and ~5.0 s after the tap hid the pieces and turned the board live with
    the countdown still on screen (≈500 samples each, 5 ms apart).
  - **Fix.** `js/app.js`, `Blind.memorising`: set true in `nextPuzzle` (before
    `updatePeekBtn`), false in `hidePieces` (which now calls `updatePeekBtn`) and in
    `cleanup()`. `Blind.peek` returns at once while it is true; `updatePeekBtn`
    disables the button. `Blind.token`, `js/board.js`, `js/blind-elo.js` untouched.
  - **Verified, headless CDP at 375px.** `taps` mode EN/ES x light/dark **125/125**
    (was 97; +7 per combination at the end of `tapsBlind`: the two early-Peek cases,
    3 checks each, and "Peek on a live puzzle still works" — one peek spent, extra
    given up, 5 s shown with the board locked, then hidden and live). Peek after
    the puzzle is over: still green. `cdp-verify-blind.mjs` **75/75**. `test:tree`
    **98/98** (two of those are the other session's uncommitted diagram tests).
  - **NOT GREEN: full pre-move suite 83/84, twice** (CPU 100% then ~45% — League of
    Legends running, not another session). Run 1: one Puzzles case, `lagMs` 5.5
    against a limit of 5. Run 2: `BLINDFOLD reply / tap / straddle` — the first move
    was never taken (`played:false`). Blindfold part alone, twice more: 50/52 (a
    Puzzles `deadMs` of 1; and the countdown case served a puzzle whose first move
    is a promotion, which that case cannot use and reports as a FAIL), then
    **52/52**. The not-taken move did not repeat in those two runs. **Not
    explained** — a guess, not checked: `blindNext()` accepts `timeLocked` as proof
    the new puzzle arrived, and an unscored old puzzle is also time-locked.
  - **REALLY TAPPED:** Next, Peek (at a point re-measured after the countdown number
    appears — it pushes the button down), Go, every chess move. **SEEDED:** the 8 s
    (and 2 s) memorising time through the slider's own events, hint warning marked
    seen, autoNext off. Puzzles are the app's own.

- **READ TAB — IN A SIX-TYPE BOOK A HELD SHAPE OF ANOTHER TYPE NEARER THAN THE WINNER
  EMPTIES THE SQUARE (v145, 2026-10-04). BUILT; ADRIAN APPROVED THE COMMIT AFTER
  SEEING THE SLIPPED-LESSON COST BELOW.** Committed on `main`, NOT pushed, NOT
  deployed, not tested on a real phone. `sw.js` v144 → **v145** in this commit, put
  in through the index only: the working copy already said v146 (another session's
  bump for its own uncommitted `js/app.js` work — theirs, not in this commit). The
  next free number is **v147** unless that session has moved again — grep first.
  - **The change** — one line in `classifyCells` (`js/diagram.js`), beside the v143
    line, BRACES INCLUDED (without them the `else` binds to the inner `if` and the
    rule is a silent no-op):
    `if (types.size < 6) { …v143… } else { for (const ty of Object.keys(byHeld)) if (ty !== type && byHeld[ty] < d1) d2 = d1; }`
    `modelOf`, `nearest`, `learnFromCells`, `PEND_CAP` 8, `LEARN_AGREE` 0.025 and
    every `STRICT` number are unchanged. It can only empty a square.
  - **Tests** (`tests/unit/diagram.test.js`, now 33; `test:tree` 98/98): three new —
    nearer held shape of another type empties (failed on v143: read `p`); nearer
    held shape of the SAME type does nothing; held shape of another type FURTHER
    than the winner but inside `lead` does nothing. Each was run against the wrong
    form it guards (no braces / `ty !== type` dropped / the dead `byHeld < d2`
    form) in a scratch copy and failed there. The v143 test "the same held shape
    does nothing in a book that knows all six types" was REMOVED: its made-up held
    shape sat nearer than the winner, so it asserted the opposite of this rule.
  - **Clean lessons, before the gate — reproduced exactly.** Hold-out wrong: v143
    0 at 0–6, 2 at 7, 2 at 8, 0 at 9–10; built 0 at 0–10; correct identical at
    every count (1187, 10550, 9598, 8532, 7348, 6160, 4947, 3873, 2752, 1613, 738).
    First set wrong 0 everywhere; correct 3860 → 3858 at 1 lesson, same elsewhere.
  - **SLIPPED LESSONS — measured for the first time. The rule costs correct pieces
    when a wrong confirmation is being held.** Correct pieces v143 showed that the
    rule empties (`NOGATE=1`; v143 correct in brackets):

    | | set | 2 | 4 | 6 | 8 |
    |---|---|---|---|---|---|
    | `POISON=one` | first | 20 (3324) | 0 | 0 | 0 |
    | | hold-out | 1 | 0 | 0 | 0 |
    | `POISON=one POISON_BOTH=1` | first | 41 (3315) | 57 (2298) | 41 (1360) | 16 (460) |
    | | hold-out | 1 | 1 | 0 | 0 |
    | `POISON=same` | first | 11 | 0 | 0 | 0 |
    | | hold-out | 5 | 0 | 0 | 3 |
    | `POISON=same POISON_BOTH=1` | first | 11 | 17 | 10 | 6 |
    | | hold-out | 5 | 10 | 11 | 7 |

    Worst: a slip in EVERY lesson on Chess Life, 1.2–3.5% of correct pieces. One
    slip in the first lesson: 20 at 2 lessons, nothing from 4 on. Wrong pieces
    under slips, v143 → built: first set `same` 5 → 0 (2 lessons), 4 → 0 (4),
    `same`+BOTH 3 → 0 (6); hold-out at 8 lessons `one` 3 → 0, `same` 7 → 3,
    `same`+BOTH 8 → 6, `one`+BOTH 4 → 4. Hold-out `same` at 2/4/6 lessons: 9/7/4
    wrong under BOTH versions — the rule does nothing for those. No wrong-colour
    reads. Totals only: WHICH squares are lost was not listed.
  - **Verified:** `cdp-verify-pieces` 55/55 (375px, EN/ES × light/dark; really
    tapped: long-press, Clear board, a square, Open; seeded: the book and its
    templates). `cdp-verify-hatched` 92/92 (last argument 17). `cdp-verify-stage2`
    green on the preview server's real port (it failed twice with "Failed to fetch
    dynamically imported module" while 14 measurement runs had the machine
    saturated, and passed once they finished — run it on an idle machine).
  - **STILL UNMEASURED:** the rule once the useful held shape has been pushed out by
    `PEND_CAP`; which squares the slipped runs lose and whether the gate changes
    the count; the 4–9 wrong pieces the hold-out still places under `POISON=same`
    (old, not caused by this rule); lesson orders other than book order; more than
    10 lessons; FCE as a six-type book beyond 3–6 boards; another shaded-square
    book at six types; a sixth book; scans; a real phone. Both truth files are
    fitted, neither is unseen.
  - **NOT FIXED — the cause.** "Six types known" is counted without regard to
    square shade, and `LEARN_AGREE` 0.025 is too tight for FCE's dark squares
    (the same pawn differs 0.030–0.066 between diagrams, so it stays held). This
    rule only covers the case where the true piece is held and nearer.

- **BLINDFOLD — PEEK DOES NOTHING ONCE THE PUZZLE IS OVER; NO CHECK GLOW WHILE THE
  PIECES ARE HIDDEN (v144, 2026-10-04).** `sw.js` v143 → **v144** in this commit
  (another session had already bumped the working copy to v145 for its own
  `js/diagram.js` work — that bump is theirs and is not in this commit). Committed
  on `main`, NOT pushed, NOT deployed. **Not tested on a real phone.**
  - **Reproduced first, with real taps (EN/light, old code):** Peek after Show
    solution had finished, Peek after solving by hand, and Peek while the solution
    was still playing — all three spent a peek and 5 s later hid the pieces again;
    the two Show-solution cases also turned the locked board live. The check glow
    was lit on every sample taken with the pieces hidden (54 of 54).
  - **Fix.** `js/app.js`: new `Blind.isOver()` (= `this.logged`, set by a solve and
    by Show solution, cleared only by `nextPuzzle`); `Blind.peek` returns at once
    when it is true; `Blind.updatePeekBtn` disables the button then, and is now
    also called on a solve and at the start of `showSolution`. `Blind.token` and
    `cleanup()` untouched. `js/board.js` (Adrian said yes): `render` adds `.check`
    only when `!this.piecesHidden`. `js/blind-elo.js` untouched.
  - **Verified, headless CDP at 375px.** `taps` mode EN/ES x light/dark **97/97**
    (was 61; +9 per combination in `tapsBlind`). `cdp-verify-blind.mjs` **75/75**.
    `test:tree` **96/96**. Peek during a live puzzle still works (existing "Peek
    inside the reply window" case: 5 s, then hidden and live).
  - **NOT GREEN: full pre-move suite 79/84, twice — and 78/84 on an untouched copy
    of the previous commit run the same hour.** A different handful fails each run,
    every one a timing limit missed by a hair (`lagMs < 5`, `deadMs < 1`) in
    Puzzles, Rush and Blindfold alike. The CPU sat at 100% throughout (another
    session was working in this checkout). Machine noise, not this change — but
    84/84 was NOT seen today. Re-run it on a quiet machine before trusting it.
  - **REALLY TAPPED:** every chess move, Peek, Show solution, Next, Go.
    **SEEDED:** the 2 s memorising time, the hint warning marked seen, autoNext
    off. Puzzles are the app's own; Next is tapped until one fits the case.
  - **Seen, left alone (not in scope):** after a hand solve the Blindfold board
    stays live (taps select pieces, no move is taken) — the Puzzles tab does the
    same. **Read from the code, NOT run:** Peek during the memorising countdown is
    not guarded — it spends a peek, forfeits the extra, and its 5 s timer hides
    the pieces and opens the board while a longer countdown is still on screen.

- **READ TAB — THE "PAWN SHOWN AS A ROOK PAST 6 LESSONS" DEFECT DIAGNOSED; ONE RULE
  PROPOSED AND MEASURED; NOTHING BUILT — ADRIAN DECIDES (2026-10-04, later session).**
  No file the app loads was touched by this session; `js/diagram.js` is unchanged.
  `test:tree` 96/96. Nothing tapped: real `classifyCells`/`learnFromCells` in Node on
  squares measured afresh in headless Chrome (both truth files re-rendered). All
  scripts were scratch and are gone; the rule is one line, quoted below.
  (Another session had `js/app.js`, `js/board.js`, `sw.js` → v144 and
  `tools/cdp-verify-premove.mjs` uncommitted in the tree at the time — not this work.)
  - **1. Reproduced exactly.** Hold-out, `LEARN=7` and `8`, `NOGATE=1`: FCE
    p350→p150a **h6** and p150b **d6**, `r` for `p`. First set: 0.
  - **2. THE CAUSE — the rook samples are REAL rooks, learned from clean lessons.
    What is missing is the pawn.** Traced sample by sample:
    - Nearest to h6 / d6: `r` from **p200a g5** (0.071 / 0.074) and `r` from
      **p200b h8** (0.080 / 0.096) — both true black rooks on dark squares.
    - The book's trusted pawn samples at that point (P ×4, p ×2) ALL come from
      LIGHT squares. The nearest of them is **0.51 / 0.46** away. In FCE the dark
      square's shading dominates the measured shape: everything standing on a
      dark square is within ~0.10 of everything else on one, and ~0.5 from the
      same piece on a light square.
    - The book HAD been shown black pawns on dark squares four times in three
      lessons (p250 b6 and a7, p70 f6, p100a g7). They sit 0.021–0.045 from h6/d6
      — much nearer than the rook. All were still HELD, never trusted: between
      diagrams the same dark-square pawn differs by 0.030–0.066, which is over
      `LEARN_AGREE` 0.025, so two diagrams never "agree". (p250 a7 was itself
      refused as a contradiction of the rook.)
    - So: p350 teaches no pawn; light-square pawns get learned; the book then
      counts as knowing all six TYPES; `STRICT.full` (match 0.13) switches on;
      and a dark-square pawn, which the book effectively has never learned, is
      inside 0.13 of a rook with the next trusted type (king, 0.135–0.145) a full
      `lead` behind. "Six types known" is counted per type, but in this book a
      shape is only known per square shade.
  - **3. Exposure (v143, clean lessons, before the gate, six-type books only).**

    | correct reads at d1 > 0.06 / all correct | 7 | 8 | 9 | 10 |
    |---|---|---|---|---|
    | hold-out | 35 / 2096 (1.7%) | 19 / 1599 | 9 / 1085 | 2 / 523 |
    | first set (ChessLife only) | 97 / 750 (12.9%) | 50 / 378 | no reads | no reads |

    **The number that matters more: FCE has almost never been read as a six-type
    book.** At 7 lessons 1 plan of 30 reaches six types (3 boards read), at 8
    three plans (6 boards), at 9 six plans (6 boards). In that one plan at 7
    lessons, 2 of 19 pieces shown were wrong. Dvoretsky and Hellsten never reach
    six types in either file. So `STRICT.full` is measured on Chess Life (where
    square shade does not matter: 41 of 41 "pawn-type known only on the other
    shade" reads were right) and next to nothing else. In FCE, pieces whose type
    was known only from the other shade: 15 at 7 lessons — 0 right, 2 wrong, 13
    left empty.
  - **4. THE ONE RULE PROPOSED — "in a six-type book, a held shape of another type
    that is NEARER than the winner empties the square".** In `classifyCells`,
    beside the v143 line (braces matter — an `else` without them binds to the
    inner `if`, which silently made the first measurement a no-op):
    `if (types.size < 6) { …v143 line… } else { for (const ty of Object.keys(byHeld)) if (ty !== type && byHeld[ty] < d1) d2 = d1; }`
    This is NOT the dead "held-shape rule applied to six-type books" (that one
    fires when a held shape is within `lead` of the winner and lost 97–156
    pieces); this fires only when the held shape beats the winner outright. It can
    only empty a square. Measured from a scratch copy, both sets, 0–10 lessons:

    | hold-out, lessons | 0–6 | 7 | 8 | 9 | 10 |
    |---|---|---|---|---|---|
    | v143 wrong | 0 | **2** | **2** | 0 | 0 |
    | rule wrong | 0 | 0 | 0 | 0 | 0 |
    | correct lost | 0 | 0 | 0 | 0 | 0 |
    | correct (both) | 73.9–82.5% | 83.5% | 84.0% | 84.1% | 87.6% |

    First set: wrong 0 / 0 at every count; correct lost **2 at 1 lesson** (3860 →
    3858), 0 at every other count (no reads at 9–10).
  - **HOW THIN:** very. It removes exactly the two squares it was designed on, in
    one lesson order of one book, and nothing else in either file moved (bar 2
    pieces). It only helps when the true piece was confirmed at least once on
    that shade AND is still held — `p` held was at the `PEND_CAP` of 8 in this
    plan, so one more held pawn could have pushed the useful one out. It does
    nothing for a dark-square piece never confirmed at all. It treats the
    symptom; the cause (shade-blind "six types", and `LEARN_AGREE` too tight for
    FCE's dark squares) stands.
  - **Considered, NOT measured as a rule:** "use `partial` on a shade that lacks
    one of the six types". Estimated only: it would catch both squares but drop
    56 of 750 correct at 7 lessons on the first set (114 of 1481 at 5) for
    nothing gained there, and needs every sample to remember its square shade
    (a stored-data change).
  - **STILL UNMEASURED:** the rule under `POISON=` (a slipped held shape can now
    empty right squares in a six-type book); the rule once the useful held shape
    has been pushed out; `LEARN_AGREE` per shade or looser for FCE dark squares
    (0.035 for all is dead); lesson orders other than book order; FCE as a
    six-type book beyond 3–6 boards; any other book with shaded dark squares at
    six types; more than 10 lessons; a sixth book; scans; a real phone. Both
    truth files are fitted, neither is unseen.

- **READ TAB — "A HELD SHAPE OF ANOTHER TYPE IS A RIVAL" BUILT (v143); AND A NEW
  DEFECT FOUND PAST 6 LESSONS, NOT FIXED (2026-10-04).** `sw.js` v142 → **v143**.
  Changed: `js/diagram.js` (`modelOf` returns `held`, `nearest` returns `byHeld`,
  one line in `classifyCells`, only while `types.size < 6`; `learnFromCells`
  untouched), `tests/unit/diagram.test.js` (+3, 31 tests). Committed on `main`,
  NOT pushed, NOT deployed. **Not tested on a real phone.**
  - **Tests.** `test:tree` 96/96. Of the three new tests only the first can fail
    on the old code (it did: read `p`, expected empty). The other two are guards:
    each was checked to fail against the wrong form it guards (rule applied to a
    six-type book; rival not excluding the chosen type), on throwaway copies.
  - **Re-measured, both sets rendered afresh in headless Chrome, clean lessons,
    before the gate — matches the entry below exactly.**

    | hold-out, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | v139 wrong | 0 | 0 | 0 | 1 | 1 | 1 | 1 |
    | v143 wrong | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
    | v139 correct | 73.9% | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | v143 correct | 73.9% | 75.2% | 77.3% | 78.9% | 79.8% | 81.0% | 82.5% |

    | first set, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | v139 / v143 wrong | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
    | v139 correct | 77.0% | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | v143 correct | 77.0% | 76.3% | 77.5% | 78.4% | 80.5% | 81.4% | 82.3% |

    `POISON=same` (v143, wrong before the gate, 2/3/4/6 lessons): hold-out
    9 / 8 / 7 / 4, slips accepted 5/5/5/3 of 118; first set 5 / 4 / 4 / 0, 1/1/1/0
    of 52. **The rule still does NOT fix the repeated slip.** `POISON=one` (1, 3)
    and `POISON=one POISON_BOTH=1` (3, 6): 0 wrong on both sets.
  - **`PEND_CAP` full — measured, nothing decided.** The cap is not a rare event:
    held shapes are pushed out from 2 lessons on (hold-out, summed over all
    plans: 38 drops at 2 lessons, 224 at 4, 450 at 6, 866 at 10). Compared against
    a copy that never drops (`PEND_CAP` 1000) at 1–10 lessons: **wrong pieces
    identical at every lesson count on both sets**; correct pieces within 3 on the
    hold-out, and the real cap 8 is BETTER on the first set (1430 vs 1416 at 6
    lessons). **f8 does not come back**: 0 at 7, 8, 9, 10 lessons (v139 still had
    it at 7 and 8), and not even with the cap forced down to 2.
  - **NEW DEFECT, IN v139 AND v143 ALIKE, NOT FIXED: a black pawn SHOWN as a black
    rook at 7 and 8 lessons.** FCE taught from p350, lessons
    p200a+p200b+p250+p300+p380+p70+p100a(+p100b): p150a **h6** and p150b **d6**,
    `r` for `p`, d1 0.071 / 0.074, lead 0.073 / 0.061, clear 0.064 / 0.057. The
    book knows all six types by then, so `STRICT.full` applies (match 0.13, lead
    0.06) and the new rule is not in play. **The gate does not catch it — these
    two are shown to the user.** One lesson order out of 11; in the other orders
    the same squares read `p` or empty. 0 at 9 and 10 lessons (few reads: 162,
    66). First set: 0 at 7 lessons. Why the pawn sits nearer a rook sample than
    any pawn sample: NOT looked at. Nobody had run more than 6 lessons before.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-pieces`
    **55/55**, `cdp-verify-hatched` **92/92** (last argument 17),
    `cdp-verify-stage2` exit 0 first try (preview server on 8743). REALLY TAPPED:
    what those tools tap (long-presses, Clear board, a square, Open). SEEDED: the
    books and their templates, as before. **No browser check exercises the new
    rule itself** — it is covered by the unit tests and the Node measurement on
    squares measured in Chrome.
  - **STILL UNMEASURED:** the rook-for-pawn defect above (cause, and how often in
    other orders/books); `SLIP_TO=` other types; the same slip on different
    square shades; lessons in another order than book order; more than 10
    lessons, and 7+ on Silman (7 diagrams — too few); a Chess Life issue other
    than 2026-09; a sixth book; scans or photos; a real phone. Both truth files
    are fitted, neither is unseen.
  - Run: `LEARN=7 REUSE=1 NOGATE=1 LIST=1 DUMP=<file> node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`

- **READ TAB — THE "UNLEARNED PIECE READ AS A LEARNED ONE" HOLE MEASURED; ONE RULE
  PROPOSED AND MEASURED; NOTHING BUILT — ADRIAN WAS NOT THERE TO CHOOSE
  (2026-10-04).** Tool only: `tools/measure-pieces.mjs` gained `DUMP=<file>` (one
  JSON line per square that holds or was given a piece: truth, placed before the
  gate `raw`, after it `shown`, nearest type, d1, lead, clear, the codes the book
  held). **The app is unchanged, `sw.js` not bumped by this session.** `test:tree`
  93/93. Nothing tapped: real `classifyCells`/`learnFromCells` in Node on the
  squares measured in headless Chrome by the v139 session (features reused).
  The baseline reproduces the v141 entry below exactly (75.4 / 77.5 / 79.2 / 80.2 /
  81.5 / 83.1 on the hold-out; same slip 5 of 118, 9 / 9 / 7 / 5 wrong).
  - **1. How often (v139, clean lessons, before the gate).** "Unlearned" = the
    book holds no trusted sample of that piece TYPE in either colour.

    | hold-out, lessons | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|---|
    | unlearned pieces read | 162 | 1404 | 1076 | 860 | 674 | 471 | 325 |
    | of them within `match` 0.06 of a learned type | 13 | 127 | 116 | 99 | 86 | 73 | 59 |
    | READ AS ANOTHER TYPE, before the gate | 0 | 0 | 0 | **1** | **1** | **1** | 0 (*) |
    | after the gate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

    (*) at 6 lessons the same square is still read wrong: the book has by then
    learned the WHITE bishop, so the type counts as learned, but the white shape
    is no help against a black bishop (lead still 0.072). First set: 0 at every
    lesson count (48–312 unlearned pieces, at most 2 within 0.06).
    It is ONE square on ONE board every time — FCE p150b f8, black bishop read as
    a pawn, d1 0.053–0.058, lead 0.067–0.072, clear 0.054–0.059.
  - **The finding that matters: `match` is not what protects.** About 1 unlearned
    piece in 10 on the hold-out sits inside 0.06 of a learned type (10 distinct
    squares; Dvoretsky rooks at 0.054–0.057 from a pawn, an FCE rook at 0.041).
    They are stopped by `lead` and `clear`, several by under 0.01. So "a tighter
    match while the book is incomplete" is the wrong tool: 0.05 would drop 89
    correct pieces at 3 lessons on the hold-out (65 on the first set) and still
    leave 14 unlearned pieces inside it. Estimated from the dump, NOT run.
  - **2. THE ONE RULE PROPOSED — "a held shape of another type is a rival".** While
    the book knows fewer than six piece types, the shapes waiting in `t.pending`
    count against a read: if a held shape of ANOTHER type is nearer than
    `lead` beyond the trusted match, the square is left empty. A held shape can
    then only empty a square, never place a piece — the same footing as an empty
    sample. It works on f8 because a black bishop had already been confirmed in the
    lessons and was waiting (which lesson squares: not checked). Scratch copy only (`modelOf` + `nearest` +
    one line in `classifyCells`, about 6 lines); not in the repo.
    Clean lessons, before the gate, wrong pieces / pieces read correctly:

    | hold-out, lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | v139 wrong | 0 | 0 | 1 | 1 | 1 | 1 |
    | rule wrong | 0 | 0 | 0 | 0 | 0 | 0 |
    | v139 correct | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | rule correct | 75.2% | 77.3% | 78.9% | 79.8% | 81.0% | 82.5% |
    | correct pieces lost | 26 | 32 | 31 | 35 | 35 | 33 |

    | first set, lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | v139 / rule wrong | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
    | v139 correct | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | rule correct | 76.3% | 77.5% | 78.4% | 80.5% | 81.4% | 82.3% |
    | correct pieces lost | 5 | 6 | 8 | 6 | 5 | 4 |

    In books still short of six types alone the cost is 0.3–1.0 point (hold-out
    70.7% → 70.2% at 3 lessons). 0 lessons: identical (nothing is held yet).
  - **The same rule applied to EVERY book (also those that know all six) was
    measured first and is worse — do not build that form:** also 0 wrong, but it
    loses 97–156 correct pieces per column (first set 76.4% → 74.3% after one
    lesson, below "nothing learned"), nearly all in Chess Life, where the hole
    cannot occur.
  - **`POISON=same` — THE RULE DOES NOT FIX THE REPEATED SLIP.** The prompt's
    guess that it is the same hole is wrong. Wrong pieces before the gate, v139 →
    rule: hold-out 9 → 9 (2 lessons), 9 → 8 (3), 7 → 7 (4), 5 → 4 (6); first set
    5 / 4 / 4 / 0 unchanged. Slipped pairs accepted: unchanged (5 of 118, 1 of 52)
    — the rule is in the reader, not in learning. `POISON=one` (1 and 3 lessons)
    and `POISON=one POISON_BOTH=1` (3 and 6): v139's lone wrong piece goes 1 → 0,
    nothing new appears, cost 0.1–0.3 point.
  - **3. Recommendation given to Adrian: build it** (the narrow form). The gate
    caught f8 only because a pawn cannot stand on the back rank; the same misread
    on any other rank would not trip the gate (not observed, reasoned). Cost about half a point of correct
    reads. **Stated plainly: the evidence is one square in one book, and the rule
    is fitted on both truth files.** Leaving it is also defensible: 0 wrong with
    the gate on everything measured.
  - **What the rule cannot do:** it needs the unlearned piece to have been
    confirmed at least once. A piece the user has never confirmed in that book is
    still held off only by `lead` and `clear` (99 such near pieces at 3 lessons on
    the hold-out, none placed).
  - **4. STILL UNMEASURED:** a slip to other wrong types (`SLIP_TO=` not run); the
    same slip on different square shades; lessons in another order than book
    order; more than 6 lessons; the rule with `PEND_CAP` full (old held shapes
    are dropped, so a rival can disappear); a Chess Life issue other than
    2026-09; a sixth book; scans or photos; a real phone.
  - Run: `LEARN=3 REUSE=1 DUMP=<file> node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`

- **NOTHING DELAYED OUTLIVES ITS PUZZLE — SHOW SOLUTION, THE REPLY, BLINDFOLD'S
  COUNTDOWN, A RUSH RUN'S TIMERS (2026-10-04).** `sw.js` v141 → **v142** (v141
  is another session's Read work). Changed `js/app.js` only (`js/board.js` and
  `js/blind-elo.js` untouched); `tools/cdp-verify-premove.mjs` gained a `taps`
  mode. Web-only. Committed on `main`, NOT pushed. **Not tested on a real phone.**
  - **Reproduced with real taps before anything was changed (EN/light, 9 of 16
    checks failed).** What really failed:
    1. **Show solution + Next, Puzzles and Blindfold** — the new puzzle was
       played out to its last move for the player, uncharged.
    2. **Next inside the 0.4 s reply** — Puzzles: the old reply landed on the new
       puzzle (its opening move shown twice in the history; mild). Blindfold:
       the board went **live with the new puzzle's pieces on show**, for the
       whole memorising countdown.
    3. **Peek inside the 0.4 s reply (Blindfold)** — the board went live during
       the 5 s peek: a move could be made in sight of the pieces.
    4. **Show solution inside the 0.4 s reply, both** (not on the list, same
       shape) — the reply made the board live while the solution was playing.
    5. **Show solution during Blindfold's memorising countdown** (not on the
       list) — the countdown ran on and hid the pieces mid-solution.
    6. **Rush, left and restarted inside a second** — restart inside the
       count-in: two clocks, 6 s lost in 4 s, and the orphan clock never stops.
       Wrong move, then restart inside 1.2 s: the old run swapped the new run's
       first puzzle. **Honest limit:** this took four taps (menu, Puzzles, Rush
       chip, Start) in 0.3–0.4 s, machine speed; the windows are 1.0 s and 1.2 s.
       A hand will rarely manage it. Fixed because the stuck double clock is
       ugly when it does happen.
  - **The fix — one idea, three places.** Each mode holds a throwaway object;
    whatever is about to wait keeps a reference and gives up if it has been
    replaced when it wakes.
    - `Puzzles.token`: replaced in `loadPuzzle()` and at the start of
      `showSolution()`. Checked after the `sleep(400)` in `userMove` and after
      each `sleep(700)` in `showSolution`. So Show solution also takes over from
      a pending reply and from an earlier tap on itself.
    - `Blind.token`: replaced in `cleanup()` (Next, start panel, leaving).
      `showSolution()` now calls `cleanup()` first — that is what stops the
      countdown and a peek. After the reply `board.interactive =
      board.piecesHidden`, so a peek keeps the board locked and its own 5 s
      timer hands it back. **Peek does not replace the token** — the reply must
      still land during a peek.
    - `Rush.run`: replaced in `start()`. `Rush.live(run)` = still running AND
      the same run; every Rush `setTimeout` and both count-in steps use it.
    - It is an object, not the puzzle, on purpose: a homework list with one
      puzzle left reloads **the same puzzle object**, and Blindfold can draw the
      same one twice, so `this.current === solvedPuzzle` would not have caught
      those. Auto-next still uses the puzzle identity; left alone.
  - **Charging unchanged:** `markFailed()` still runs before the loop. Measured:
    the abandoned puzzle is charged once (attempts +1), the new one not at all.
  - **Measured, `node tools/cdp-verify-premove.mjs <outDir> taps`, 375 px, EN/ES
    × light/dark:** 61/61 after the fix (15 cases per language/theme).
    `stale` mode passes; the pre-move suite still 84/84, `cdp-verify-blind.mjs`
    75/75, `test:tree` 93/93. `ONE=1` keeps `taps` to EN/light,
    `ONLY=tapsPuzzles|tapsBlind|tapsRush` to one mode.
  - **Tapped vs seeded:** every chess move and every button is a real touch.
    SEEDED: which puzzle the Puzzles cases start on (`loadPuzzle`), Blindfold's
    2 s memorising time, the hint warning marked seen, `autoNext` off.
    Blindfold and Rush puzzles are the app's own. Rush's restart taps land the
    instant each button is on top, with no human pause.
  - **Harness facts:** on a phone the tab bar is a drawer — tap `#tabmenu-btn`
    first. The test profile's ratings sink to the 600 floor after a few loads,
    where a loss is recorded but the number cannot drop; "charged" is judged on
    the attempt count.
  - **READ FROM THE CODE, NOT RUN, NOT FIXED:** Peek pressed *after* a Blindfold
    solution has played would hide the pieces again 5 s later (`peek()` does
    not look at whether the puzzle is over).
  - **STILL ADRIAN'S CALL, untouched:** Blindfold shows the red check glow with
    the pieces hidden (see the pre-move entry below).

- **PRE-MOVE — ALWAYS AVAILABLE IN PUZZLES, RUSH AND BLINDFOLD (2026-10-04).**
  `sw.js` v139 → **v140**. Changed `js/board.js`, `js/app.js`; new
  `tools/cdp-verify-premove.mjs`. Web-only. Committed on `main`, NOT pushed.
  **Not tested on a real phone — Adrian's word closes it.**
  - **Adrian's report, reproduced with real touches before anything was changed:**
    9 of 11 cases failed. Only a move made *entirely inside* the 0.4 s reply
    window worked. Three separate causes, all confirmed by the failing run:
    1. **The opening move was a dead window** — `Puzzles.loadPuzzle` and
       `Rush.loadNext` never armed pre-move. Measured dead time 600 ms (Puzzles),
       300 ms (Rush); a drag in it scrolled the page (`pointercancel`).
    2. **A move that straddled the opponent's move was thrown away** — first
       tap (or drag start) while waiting, second tap (or drop) after his move
       landed. `Board.setPosition()` cleared the selection, so the second half
       had nothing to move. This is the one a human hits most: 0.4 s is shorter
       than a tap-tap.
    3. **A recapture could not be queued at all** — a pre-move was only taken if
       it was legal in the position *before* the opponent moved, so retaking on a
       square my own piece stood on reselected that piece instead, and a pawn
       capture of a piece that had not arrived yet was refused.
  - **The fix (`js/board.js`, shared by every pre-move board):**
    - `setPosition()` keeps `selected` across the opponent's move **only while a
      pre-move is armed** and the piece is still there. Every other position
      change calls `clearPremove()` first, so new puzzle / undo / history still
      drop it. Do not make this unconditional.
    - New module function `premoveReach(piece, from, to)`: a pre-move is accepted
      on the piece's geometry (where it could go on an empty board), and that
      test now comes **before** the "tap my own piece = reselect" branch.
      `firePremove()` is unchanged and still applies the real legality test.
    - **With the pieces hidden (Blindfold) any square is accepted.** Deliberate:
      a tint that appeared only for reachable squares would tell you what the
      hidden piece is. The destination dots were already off when hidden.
  - **The fix (`js/app.js`):** `Puzzles.loadPuzzle` arms on appear and fires
    after the opening move (the timer is now `this.openTimer`, cleared on a
    second load and by Show solution); `Rush.loadNext` the same, skipped under
    the count-in (`Rush.start` now sets `countingIn` **before** `loadNext()` —
    it used to arm for the first puzzle); `Blind` built with `premove: true`,
    armed/fired around its 0.4 s reply, cleared in `cleanup()` (Next, start
    panel, leaving the screen), on a solve, Show solution and Peek. Leaving
    Puzzles (`showScreen`) and `Rush.stop()` clear it too. `Play`, `Rush` and
    `Endgame` are now `export`ed — for the harness only.
  - **Where pre-move is deliberately OFF** — Blindfold's memorising countdown,
    **Blindfold's 5 s Peek** (same reason: the pieces are on show — this one was
    not on Adrian's list, he has been told), Rush's count-in (the overlay eats
    the touch anyway), after a puzzle is finished, and while stepping back
    through a puzzle's history.
  - **No timing was changed.** 0.4 s / 0.3 s / 0.6 s are as they were.
  - **Measured, `tools/cdp-verify-premove.mjs`, 84 checks, 375 px, EN/ES ×
    light/dark, real touches (`Input.dispatchTouchEvent`):** dead time inside
    both waiting windows 0.1–0.3 ms in all three modes (it is the same
    JavaScript task, so no touch can fall in it); a queued move is on the board
    0.7–1.9 ms after the opponent's; tap-tap and drag, inside and straddling,
    plain and recapture-type; a wrong pre-move charged exactly the hand-move
    loss (Puzzles and Blindfold ELO to 1e-6, one Rush strike); an illegal one
    dropped free; Next / Show solution / Peek / leaving clear it; no scroll and
    no `pointercancel` on a drag, `touch-action: none` on the piece. Play driven
    for real (d4 queued while the engine thinks); Trainer and Endgame boards
    checked on a **seeded** position (rook retakes on its own queen's square).
    `node tools/cdp-verify-premove.mjs <outDir> repro` runs the 12 Puzzles
    cases alone. `test:tree` 93/93. The header of the tool lists what is
    tapped, clicked and seeded.
  - **Harness facts:** Kael's bubble and toasts cover the buttons under the
    board for seconds — `clearView()` waits them out; `tapEl()` retries. A
    button point worked out before a 0.4 s window is the only way to tap inside
    it.
  - **FOUND HERE, FIXED IN v142 (see the entry above) — Show solution outlives
    its puzzle (pre-existing, not a pre-move bug).** `Puzzles.showSolution()` loops on `this.current` with a
    0.7 s sleep per move. Press Next before it finishes and the loop carries on
    **in the new puzzle**, playing its moves for you, uncharged. Confirmed:
    `node tools/cdp-verify-premove.mjs <outDir> stale` (8-move solution, new
    4-move puzzle ends at `moveIdx` 4 untouched). `Blind.showSolution()` and the
    `await sleep(400)` reply in `Puzzles.userMove` / `Blind.userMove` have the
    same shape and are **read from the code, not run**.
  - **SEEN, NOT FIXED — Blindfold shows the red check glow with the pieces
    hidden** (pre-existing). `Board.render()` adds `.check` to the king's square
    whether or not `piecesHidden` is set, so a check gives away where that king
    stands. Visible in the harness screenshot `blind-premove-tint-hidden.png`.
    Whether that is wanted is Adrian's call.

- **READ TAB — v139 "TWO DIAGRAMS MUST AGREE" MEASURED OVER 1–6 LESSONS AND WITH
  THE SAME SLIP MADE TWICE; ADRIAN CHOSE (a)+(c): THE RULE STAYS, THE DIALOG NOW
  SAYS SO (2026-10-04).** Two commits on `main`, NOT pushed, NOT deployed.
  `sw.js` v140 → **v141** (v140 is another session's pre-move work).
  - **(c) built:** "Check the position" (review mode only, not "Teach me the
    pieces") shows one small line under the piece palette — i18n
    `read_review_learn`: EN "A correction counts once a second diagram of this
    book agrees." / ES "Una corrección cuenta cuando un segundo diagrama de este
    libro coincide." `js/read.js` (`teachPieces`), `js/i18n.js`,
    `css/style.css` (`.read-teach-learn`). It is static text: it does not say
    how many shapes are waiting. "Clear board" leaves it in place.
  - **(b) three diagrams NOT built** — Adrian's choice, on the numbers below.
  - **Verified for (c):** `test:tree` 93/93 (no unit test added: the change is
    one line of dialog text). Headless CDP at 375px, EN/ES × light/dark:
    `cdp-verify-pieces` **55/55** (47 + 2 new per language/theme: the line is
    there in the right language and inside the dialog, and it survives "Clear
    board"; both need the new element, so they fail on v139 by construction — not
    run against v139). REAL long-press and taps; SEEDED: the book and templates.
    `cdp-verify-hatched` **92/92** (last argument 17). `cdp-verify-stage2` exit 0
    on the second run and on a run without the change; the FIRST run failed at
    `teachOpen` ("no board there" after the long-press) — a one-off, not
    reproduced, cause not found. es/dark screenshot looked at by eye.
  - **The measurement** — `tools/measure-pieces.mjs` gained: `LEARN=N` (any N), `NOLEARN=1` (same reads,
  no lessons), `POISON=same` (+ `SLIP_TO=`), `JSON_OUT=`/`TAG=`.
  - **Learning speed — pieces read correctly, before the gate, clean lessons.**
    Each column is the same reads for all three lines. Hold-out (5 books; Silman
    drops out at 6):

    | lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | nothing learned | 75.4% | 75.6% | 75.8% | 76.2% | 76.7% | 77.4% |
    | v138 (learn at once) | 80.5% | 82.6% | 83.5% | 83.9% | 84.6% | 85.6% |
    | **v139 (two diagrams)** | 75.4% | 77.5% | 79.2% | 80.2% | 81.5% | 83.1% |
    | three diagrams (scratch only) | – | – | 76.6% | 78.1% | – | 80.7% |

    First set (from 3 lessons only Chess Life + Hellsten, from 5 only Chess Life):

    | lessons | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | nothing learned | 76.4% | 76.2% | 76.1% | 76.0% | 76.0% | 76.0% |
    | v138 | 82.2% | 84.0% | 85.8% | 87.5% | 87.3% | 87.1% |
    | **v139** | 76.4% | 77.6% | 78.6% | 80.7% | 81.6% | 82.6% |
    | three diagrams (scratch only) | – | – | 76.5% | 76.7% | – | 77.7% |

    v139 keeps 0 / 27 / 44 / 52 / 61 / 70 % of v138's gain on the hold-out after
    1..6 lessons (first set 0 / 18 / 26 / 41 / 50 / 59 %). Held shapes do pile up
    (hold-out 10 → 26 per book after 1 → 6 lessons; capped at 8 per piece code).
  - **v139 IS NOT 0 WRONG WITH 3+ CLEAN LESSONS: 1 wrong piece before the gate on
    the hold-out** (of 900 reads; 0 on the first set). FCE taught from p350, lessons
    p100a+p100b+p150a: the black pawn is learned, the black bishop is not yet, and
    the bishop on f8 of p150b sits 0.053–0.058 from a pawn sample (`partial.match`
    0.06). The gate refuses that board (pawn on the back rank), so the user sees an
    empty board, not the pawn: **0 wrong with the gate**. It is a reader-threshold
    hole (an untaught type that looks like a taught one), not a slip. Not fixed.
    `POISON=one POISON_BOTH=1` at 3 and 6 lessons: the same 1, nothing more.
  - **The same slip twice (`POISON=same`: same piece, same square shade, same wrong
    type in the first two lessons; later lessons clean) BITES, rarely.** Wrong
    pieces before the gate, and how many slipped lesson pairs the book accepted:

    | | accepted | 2 lessons | 3 | 4 | 6 |
    |---|---|---|---|---|---|
    | hold-out v139 | 5 of 118 | 9 | 9 | 7 | 5 |
    | hold-out v138 | 24 of 118 | 26 | 22 | 12 | 6 |
    | first set v139 | 1 of 52 | 5 | 4 | 4 | 0 |
    | first set v138 | 6 of 52 | 4 | 2 | 0 | 0 |
    | three diagrams, both sets | 0 | – | 0 | – | 0 |

    Every accepted case is a book whose teaching diagram did not hold the TRUE
    piece type (FCE p350: no pawns, a pawn called a knight → 7 pawns read as
    knights; Chess Life p17a: no rooks; Dvoretsky: no bishop). Where the type was
    taught, the contradiction guard already throws the slip out. Slipped in EVERY
    lesson: v139 9 wrong at 3 lessons, 5 at 6 (hold-out); three diagrams 0 at 3
    but 4 at 6 — no count of agreeing diagrams stops a mistake made every time.
  - **"Three diagrams" was measured on a scratch copy only (not in the repo).**
    It also removes the stray clean wrong piece, at about half of v139's learning.
  - **Everything here is fitted/seen on both truth files; neither is unseen.**
  - **STILL UNMEASURED:** a slip to other wrong types than pawn→knight /
    anything→pawn (`SLIP_TO=` exists, not run); the same slip on DIFFERENT square
    shades; lessons in an order other than book order; more than 6 lessons; any
    Chess Life issue other than 2026-09; a sixth book; scans or photos; a real phone.
  - **Measurement verified:** the changed tool reproduces v139's 77.5%
    (hold-out, 2 lessons). Nothing tapped: real `classifyCells`/`learnFromCells` in Node on squares measured in
    headless Chrome by the v139 session (features reused).
  - Run: `LEARN=4 POISON=same NOGATE=1 REUSE=1 node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (2–6 minutes each at 3–6 lessons).

- **READ TAB — ONE WRONGLY CONFIRMED PIECE NO LONGER TEACHES THE BOOK A WRONG
  SHAPE: A NEW SHAPE COUNTS ONLY AFTER TWO DIFFERENT DIAGRAMS AGREE (2026-10-04).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v138 → **v139**.
  `js/diagram.js` (`learnFromCells` only; `classifyCells`, `STRICT` and board
  FINDING untouched), `tests/unit/diagram.test.js` (24 → 28),
  `tools/measure-pieces.mjs` (`LEARN=2`, `POISON_BOTH=1`),
  `tools/cdp-verify-pieces.mjs` (2 checks reworded for the new rule).
  - **Adrian was not there to choose; option (a) of the prompt was built**, (b)
    measured as numbers only, (c) not needed.
  - **The rule:** a piece shape the book does not already hold is put in
    `t.pending[code]` (`{ v, s }`, 8 per code) and READS NOTHING. When a later,
    DIFFERENT diagram confirms the same shape under the same code (within
    `LEARN_AGREE` 0.025, tried slid ±2 like the reader), both become samples, and
    the same shape held under any OTHER type is dropped. "Different diagram" =
    a different set of occupied squares in the confirmed position, so the same
    diagram confirmed twice is still one. Empty squares are learned at once, as
    before (a wrong empty sample can only leave a square empty).
  - **Starting numbers reproduced first (v138, `POISON=one`):** hold-out 40 wrong
    before the gate / 27 with it (Dvoretsky 22, FCE 17, Silman 1); first set 6 / 6
    (Hellsten).
  - **After (before the gate, both sets): wrong pieces 0, wrong colour 0 in EVERY
    mode** — base, `LEARN=1`, `LEARN=2`, and `POISON=swap|colour|forgot|one` with
    one lesson, with two lessons (first one wrong) and with BOTH lessons wrong
    (`POISON_BOTH=1`). v138 with both lessons slipped: 52 wrong on the hold-out.
  - **What correct learning loses — this is the price.** Pieces read correctly,
    against the same reads with nothing learned:

    | | hold-out, 1 lesson | hold-out, 2 lessons | first set, 1 lesson | first set, 2 lessons |
    |---|---|---|---|---|
    | nothing learned | 75.4% | 75.6% | 76.4% | 76.2% |
    | v138 (learn at once) | 80.5% | 82.6% | 82.2% | 84.0% |
    | **v139 (two diagrams)** | 75.4% | 77.5% | 76.4% | 77.6% |
    | option (b), not built | 75.9% | 76.1% | 78.6% | 79.6% |

    One lesson now teaches NOTHING about pieces; two lessons keep about a quarter
    of what v138 gained. **Visible in the app:** a diagram you corrected and
    opened, pressed again, comes back exactly as the first time (v138 read it
    whole). The corrections are not lost — they are waiting for a second diagram.
  - **Option (b) does not do what it promised** (as built for the numbers: a piece
    is shown only if a TAUGHT sample of that type is also within `match`):
    `POISON=one` still placed 18 wrong pieces on the hold-out (Dvoretsky), 32 with
    both lessons slipped. A slip files the rook under "pawn", and the pawn WAS
    taught. Kept as `b.js` in a scratchpad only; not in the repo.
  - **Looser variants tried and rejected** (0 wrong too, but +0.1 to +0.5 points
    only): agreement with an already trusted sample; `LEARN_AGREE` 0.035.
  - **`LEARN_AGREE` 0.025 WAS FITTED ON BOTH TRUTH FILES.** Across the five books
    the nearest square of another TYPE on another diagram was never closer than
    0.038 (FCE; Dvoretsky 0.052), while the same piece on another diagram was
    within 0.02 / 0.03 for (hold-out) Dvoretsky 97% / 97%, Hellsten 92% / 96%,
    Chess Life 62% / 81%, FCE 54% / 85%, Silman 31% / 70% of squares.
    Neither file is unseen for it.
  - **Old books:** a book taught or corrected on v137/v138 has learned samples and
    no `pending`; it reads and learns as before (unit test). What v138 already
    learned from a slip STAYS — only "Re-learn the pieces" clears it.
  - **STILL UNMEASURED:** three or more lessons in a row (how fast v139 catches
    up, whether held slips pile up); the SAME slip made on two diagrams (a rook
    called a pawn twice — the rule then accepts it, by design); the same diagram
    at two zoom levels counted as one (it is, by occupied squares — not tapped);
    two different diagrams with the same occupied squares (counted as one,
    harmless); any Chess Life issue other than 2026-09; a sixth book; scans or
    photos; a real phone.
  - **Verified:** `test:tree` **93/93** (65 + 28; 5 of the 28 FAIL on the v138
    code — the 3 new slip tests and the 2 reworked learning tests — checked
    against `git show HEAD:js/diagram.js`). Headless CDP at 375px, EN/ES ×
    light/dark: `cdp-verify-pieces` **47/47** (REAL long-press and REAL taps,
    incl. correcting the board and Open; SEEDED: the book and its templates) —
    it now checks that Open HOLDS 10 shapes with the samples unchanged (31 → 31)
    and that the same diagram pressed again reads exactly as before, nothing
    wrong. `cdp-verify-hatched` **92/92** (last argument 17),
    `cdp-verify-stage2` green (exit 0). The two truth sets are NOT tapped: real
    `classifyCells`/`learnFromCells` in Node on squares measured in headless Chrome.
  - Run: `LEARN=2 POISON=one POISON_BOTH=1 NOGATE=1 REUSE=1 node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (a `LEARN` run takes about a minute even with `REUSE=1`, not seconds).

- **READ TAB — THE STRICT PIECE READER MEASURED ON DIAGRAMS IT HAD NEVER SEEN;
  THREE HOLES FOUND AND CLOSED (2026-10-03).** Committed on `main`, NOT pushed,
  NOT deployed. `sw.js` v137 → **v138**. `js/diagram.js` (3 small changes, board
  FINDING untouched), `tests/unit/diagram.test.js` (21 → 24), `tools/measure-pieces.mjs`
  (`POISON=one`, wrong-colour squares now listed), new
  `tools/fixtures/piece-truth-holdout.json`.
  - **The hold-out set:** 52 new diagrams, true positions read BY EYE from `find`
    crops — Chess Life 12 (pages 18–32, none of 17/20/22/30/36), Dvoretsky 12
    (knights, rooks, queens, bishops: pages 272–940), Hellsten 10 (middlegame-like,
    up to 26 pieces), Silman 7 (queens, rooks, knights; two diagram sizes), FCE 11
    (never measured before). 132 reads, **1,607 real pieces**. Kept SEPARATE from
    `piece-truth.json` (which holds **23** diagrams, not 19 as v137 wrote).
  - **Measured with the SHIPPED v137 numbers first, before touching anything:**

    | book | real | correct | WRONG | wrong colour | left empty |
    |---|---|---|---|---|---|
    | Chess Life | 567 | 521 | 0 | 0 | 46 |
    | Dvoretsky | 275 | 172 | **1** | 0 | 102 |
    | Hellsten | 282 | 266 | 0 | 0 | 16 |
    | Silman | 248 | 134 | 0 | 0 | 114 |
    | FCE | 235 | 98 | 0 | 0 | 137 |

    That is before the whole-board gate. WITH the gate: 0 wrong — the one wrong
    piece was a white pawn on rank 1, so the gate refused that board (shown empty).
  - **Hole 1 — the wrong piece** (Dvoretsky p580, g1): a hollow white rook on a
    HATCHED square, in a book taught its rook on a plain square. The hatching
    drowns the piece: the square was exactly as close to "empty hatched square"
    (0.055) as to "pawn on a hatched square" (0.055), and the rule had no margin
    there (`clear: 0`), so the tie went to the pawn. Fix: `STRICT.*.clear` 0 →
    **0.01**. With `LEARN=1` (correct lessons) v137 made the same mistake 14 times.
  - **Hole 2 — a correct lesson turned a black king white** (Silman p400b, e4,
    `LEARN=1`): Silman's black king is drawn half hollow, so its fill says nothing;
    the book then held a white king on a light square and a black one only on a
    dark square, and "shape decides the colour" was really the square deciding.
    Fix: shape may settle the colour only if BOTH colours of that piece match well
    (`Math.max(dw, db) <= S.match`).
  - **Hole 3 — v137's "a wrong lesson never places a wrong piece" was false off the
    first set:** `POISON=swap` (kings confirmed as queens, bishops as pawns) gave
    Dvoretsky 76, Silman 2, FCE 238 wrong pieces. A book that has not met the queen
    cannot contradict "this king is a queen". But that lesson has no kings, and the
    dialog already refuses to Open without them (`read_teach_need_kings`) — the
    tool was testing what the app cannot do. `learnFromCells` now enforces it
    itself: no king of each colour → nothing learned.
  - **After the three fixes (v138), before the gate, BOTH sets:** wrong pieces **0**,
    wrong colour **0**, in base, `LEARN=1`, and `POISON=swap|colour|forgot`.
    Cost in real pieces left empty: hold-out 415 → 420 (Dvoretsky +3, Silman +1,
    FCE +1), first set 165 → 166 (Chess Life +1). Read correctly on the hold-out:
    Chess Life 92%, Hellsten 94%, Dvoretsky 62%, Silman 54%, FCE 41%.
  - **STILL OPEN, measured, NOT fixed — one slip in a confirmed board
    (`POISON=one`, new):** ONE piece confirmed as the wrong type (a rook as a
    pawn), kings in place, so the app accepts it. Hold-out: **40 wrong pieces** in
    1,164 reads (Dvoretsky 22, FCE 17, Silman 1; 27 after the gate); first set 6
    (Hellsten). Chess Life: 0. It only bites when the book was never taught that
    piece on that kind of square — then nothing contradicts the slip, the book
    files a rook under "pawn", and later rooks on hatched squares come back as
    pawns. No threshold fixes this (in hatched books the square outweighs the
    piece: a king is 0.14 from the same king on the other shade, a rook 0.055 from
    a pawn on the same shade). It needs a design choice — see the handover prompt.
  - **How far "zero wrong" can be trusted:** with a book taught once and no
    corrections, on these five books: 0 wrong in 2,330 real pieces after the fix,
    and v137 itself had 1 in 1,607 on diagrams it had never seen. But the hold-out
    is no longer unseen for `clear`, the colour rule and the kings rule — they
    were chosen ON it. The next honest test needs new diagrams again.
  - **Unmeasured:** any Chess Life issue other than 2026-09 (the hold-out pages are
    the same issue, same font, as the first set); any sixth book; scans or photos
    (all five are born-digital PDFs); a book taught before v137 (one averaged shape
    per piece); a real phone (speed and screen); more than one lesson per book.
  - **Verified:** `test:tree` **89/89** (65 + 24; the 3 new tests FAIL on the v137
    code, checked against `git show HEAD:js/diagram.js`). Headless CDP at 375px,
    EN/ES × light/dark: `cdp-verify-pieces` **47/47** (REAL long-press, REAL taps;
    SEEDED: the book and its templates, as before), `cdp-verify-hatched` **92/92**
    (with puzzle page 17; without that last argument it reports 82/82),
    `cdp-verify-stage2` green (exit 0; its one `confident:false` is the
    degrades-honestly case). The hold-out itself is NOT tapped: it is the real
    `classifyCells`/`learnFromCells` run in Node on square measurements taken in
    headless Chrome from the real pages.
  - Run: `node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth-holdout.json`
    (~3 min the first time; `REUSE=1` afterwards is seconds).

- **READ TAB — "CHECK THE POSITION" SHOWS ONLY PIECES IT IS SURE OF, AND LEARNS
  FROM CORRECTIONS (2026-10-03).** Committed on `main`, NOT pushed, NOT deployed.
  `sw.js` v136 → **v137**. `js/diagram.js` (everything from `buildTemplatesFromGrid`
  down; board FINDING untouched — the diff starts at line 778), `js/read.js`
  (`onLongPress`, `teachPieces`), `js/i18n.js` (3 strings), `css/style.css` (2 rules).
  New: `tools/measure-pieces.mjs`, `tools/cdp-verify-pieces.mjs`,
  `tools/fixtures/piece-truth.json`, `tests/unit/diagram.test.js` (21 tests).
  - **Adrian's report:** Chess Life p20 came back with ~50 pieces, nearly all rooks
    and queens. "I prefer an empty square to a wrong piece, every time."
  - **Diagnosis, measured before any fix** (true positions read BY EYE from crops,
    19 diagrams, 4 books): NOT the board rectangle (p20's three boards are found
    exactly). The real pieces were matched fine; the extra ~30 per board were
    GHOSTS ON EMPTY SQUARES. An empty square has no ink, so its normalised edge
    map is just its border lines, which look like a rook, and the old test
    (`d1 < distance to the averaged empty pattern`) let them through. Second
    cause behind it: a later board never lands on the taught one's exact pixels,
    and a one-pixel slide made a king read as a queen (19 wrong types → 1 once
    the cell is also tried slid ±2 feature cells). Third: a book never taught a
    queen read every queen as a king (endgame books are taught from K+R+P).
  - **The rule now** (`classifyCells`, thresholds in `STRICT`): nearest TYPE over
    every stored sample and every slide; shown only if match ≤ 0.13, next type
    ≥ 0.06 further, fill decisively white/black (or, fill unclear, the shape
    leads one colour by the same margin). A book not yet taught all six types
    uses match ≤ 0.06. Anything else → EMPTY, and marked (dashed) only if the
    square carries a piece's worth of ink. The loosest zero-wrong values measured
    were 0.15/0.05 and 0.07; the shipped ones sit a step inside.
  - **Templates are SAMPLES now (ver 4), not one average per piece** — measured
    better (partial books: 220 vs 189 correct at zero wrong). ver-3 books keep
    working (read as a list of one) and are upgraded on their first lesson.
    `boardCells` / `templatesFromCells` / `classifyCells` are pure, so the tool
    measures the real code in Node from cached square features (`REUSE=1`).
  - **Whole-board gate** `boardSanity`: two kings of a colour, >16 of a colour,
    >8 pawns, a pawn on rank 1/8, more promoted pieces than missing pawns →
    EMPTY board + "I could not read this diagram reliably…". On the measured set
    it never fires (0 wrong before the gate); it is the net for a mis-taught book.
  - **Clear board** button in the dialog (string `clear_board` already existed).
  - **Learning** (Adrian chose: build it, SILENT). Open in review mode calls
    `learnFromCells`: the confirmed board's squares are added as samples. Guards:
    a square that contradicts what the book knows well is not learned (known
    piece called another type / left empty, known empty called a piece, fill
    decisively the other colour); inked squares left empty that match no known
    empty are skipped (arrows, forgotten pieces); more than 3 contradictions →
    nothing learned; the first teaching's samples are the anchor and never
    rotate out (12 learned per list rotate behind them). "Re-learn the pieces"
    is still the full reset.
  - **Numbers** (`measure-pieces.mjs`, every diagram read with every teaching
    diagram of its book, 723 real pieces): v136 → v137 —
    wrong pieces placed **456 → 0** (Chess Life 425, Dvoretsky 3, Hellsten 12,
    Silman 16 → all 0), wrong colour only **6 → 0**, correct 627 → 558, real
    pieces left empty 22 → 165 (Chess Life 138/579, Dvoretsky 9/66, Hellsten
    16/72, Silman 2/6). With ONE confirmed correction per book (`LEARN=1`):
    still 0 wrong; read correctly Chess Life 76% → 81%, Dvoretsky 86% → 95%,
    Hellsten 78% → 92%. With that confirmation deliberately WRONG
    (`POISON=swap|colour|forgot`): still **0 wrong pieces** — a bad lesson costs
    more empty squares, never a wrong piece.
  - **Honest limit:** 100% cannot be promised. The thresholds were chosen ON these
    19 diagrams; a book outside the set can still produce a wrong piece, and the
    gate only catches impossible boards. What is promised is the direction: when
    unsure, empty.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-pieces`
    **47/47** — REAL long-press on Chess Life p20, REAL taps on a square, Clear
    board, Open; then (EN/light) the board corrected by 2 REAL taps, Open, and the
    same diagram pressed again reads 10 of 10 (9 before). SEEDED: the book
    (`db.addBook`) and its templates (`buildTemplatesFromGrid` on the p30 diagram
    with its true position — not tapped in "Teach me the pieces"); the refused
    board uses templates seeded wrong on purpose. `cdp-verify-hatched` **92/92**,
    `cdp-verify-stage2` green (two checks there now read `templates.samples`),
    `cdp-verify-training` **65/65**, `test:tree` **86/86** (65 + 21).
    `measure-fallback.mjs` NOT re-run: no line of board finding changed.
  - **The CDP long-press trap, now written down:** in headless Chrome, lifting the
    finger "taps" what the dialog put under it and drops a pawn on that square.
    Read the dialog WHILE THE FINGER IS DOWN (`cdp-verify-pieces` does).
  - Run: `node tools/measure-pieces.mjs find <outDir> 50 "<pdf>:20,30"` (crops to
    read by eye), `node tools/measure-pieces.mjs measure <outDir> tools/fixtures/piece-truth.json`
    (env `REUSE=1`, `NOGATE=1`, `LIST=all`, `LEARN=1`, `POISON=…`, `STRICT='{…}'`,
    `DIAGRAM=<file>`), `node tools/cdp-verify-pieces.mjs <outDir> "<Chess Life.pdf>"`.
    The books are in `C:\Users\Adrian\ChessPuzzleImport\` (Chess Life in
    `D:\2. Chess\2. Material\2. CBH and PDF\`).
  - **Open:** a book taught before v137 (Adrian's Chess Life) still has ONE
    averaged shape per piece until it learns — "Re-learn the pieces" once gives it
    the full benefit. One read takes 56 ms on this PC after teaching, 169 ms after
    nine lessons; NOT timed on a phone. Hatched books (Dvoretsky, Silman): only
    3 + 3 diagrams measured, no rook/queen/knight among them. Not tested on a
    real phone.

- **BLINDFOLD — START PANEL WITH GO, TIME LOCKED WHILE A PUZZLE RUNS, PAID-AT
  LINE, CHANGE TIME BUTTON (2026-10-03).** Committed on `main`, NOT deployed.
  `sw.js` v135 → **v136**. No `firestore.rules` change, no new storage keys,
  `js/blind-elo.js` untouched (its 12 tests unchanged).
  - **Why:** Adrian lowered the slider to 2 s during a 10 s countdown and could
    not tell afterwards which time he was paid for. The maths was already right
    (`secondsThis`); the screen did not say so.
  - **Start panel** `#blind-start` (index.html; styled like `#rush-intro`):
    ELO card, the slider, `#blind-pays` (what the time pays, as a rule — % extra
    under 10 s), `#blind-last-paid`, `#blind-go`. The board lives in
    `#blind-game`. `Blind.open()` → `Blind.showStart()`; `Blind.go()` starts the
    first puzzle. **Shown EVERY time Blindfold opens** (Adrian's choice). There
    is ONE `.blind-time` box; `showStart()`/`go()` move it between the two panels.
  - **Lock:** `Blind.timeLocked` is true from `nextPuzzle` until `recordResult`
    (solve, first wrong move, Show solution). The range is `disabled`, the box
    gets `.locked`, the label gets 🔒, the hint reads "Locked until this puzzle
    is scored", and `oninput` refuses the change even if an event gets through.
  - **Paid-at line:** after scoring `#blind-bonus` no longer empties — it shows
    `Blind.paidLine`, e.g. "2 s look: +52 normal, +9 extra", "… no extra (you
    peeked)", or "2 s look: −10 — a miss costs the same at any time". The two
    parts are rounded so they add up to `lastDelta` (the badge / log number).
  - **Change time** `#blind-change-time` (Adrian's choice, for auto-next's 1.4 s
    gap): between puzzles it opens the start panel at once; during a puzzle it
    changes nothing and sets `Blind.changeArmed`, so the next `nextPuzzle()`
    (Next or auto-next) opens the panel instead. `nextPuzzle()` also returns
    early while the start panel is up, so a late auto-next starts nothing.
  - **Bug found and fixed (was real):** two quick taps on Next left two 500 ms
    timers pending → two countdowns, and the orphaned one then hid the pieces
    every second for good (measured: 4 hides in 5 s; now 1). The timer is now
    `Blind.startTimer`, cleared in `cleanup()` and before it is set.
  - **Verified:** `npm.cmd run test:tree` 65/65. `tools/cdp-verify-blind.mjs`
    rewritten for the Go step: **75/75** at 375px, EN/ES × light/dark — Go
    measured at 1, 10 and 20 s. Its header lists what was really tapped
    (Go, Next, Change time, moves, a finger on the slider locked and unlocked),
    what was called (other slider changes: events dispatched, not a drag) and
    what was seeded (attempt count 10; `Puzzles.autoNext` set in memory).
    `node tools/cdp-verify-blind.mjs <dir> double-next` runs only the Next repro.
  - **Not done:** not tested on a real phone; a real finger DRAG of the slider
    is not reproducible over CDP. The paid line is not re-translated if the
    language is switched while it is on screen (it is rebuilt on the next puzzle).

- **BLINDFOLD — CHOOSE THE MEMORISING TIME (1-20 s), TIME EXTRA, NEW PEEK RULE,
  FAST START (2026-10-03).** Committed on `main`, NOT pushed, NOT deployed.
  `sw.js` v134 → **v135**. No `firestore.rules` change, so NO rules deploy.
  - **All the rating maths is in the new `js/blind-elo.js`** (imports nothing;
    `blindEloResult`, `blindExtraPreview`, `blindExtraFactor`,
    `blindLongLookFactor`, `clampBlindSeconds`). `Blind.recordResult` only calls it.
    Numbers Adrian approved (table shown to him first), for a puzzle at the
    player's own level after the first ten — normal points 16:
    1 s +34 · 2 s +32 · 5 s +26 · 10 s +16 · 15 s +12 · 20 s +8; loss always −16.
    - Under 10 s: extra = normal × (10 − s) ÷ 8, clean wins only. The extra is
      always sized off K 32, never the fast-start K.
    - Over 10 s: a win pays 75% at 15 s, 50% at 20 s (linear). Losses unchanged.
    - **Peek cancels ONLY the extra.** A win after a peek pays the full normal
      points (it used to pay K 12 instead of K 32). A loss after a peek is the
      full normal loss too (it used to be softened). At 10 s or more a peek is
      free — Adrian's choice.
    - **Fast start:** K 192 for the first 10 blindfold puzzles, then K 32 — the
      confirmed cause of "Blindfold ELO rises slower than Puzzles". After the
      first ten Blindfold was already FASTER per puzzle (32 vs Puzzles' 24).
      Counted from this update for EVERYONE (Adrian's choice: the app never
      counted blindfold puzzles, so existing users get ten fast ones too).
  - **Leaderboard effect, simulated** (same player, 100 puzzles, vs playing at
    10 s): always 1 s ≈ +130, 2 s ≈ +120, 5 s ≈ +85, 15 s ≈ −50, 20 s ≈ −115.
    It is reached inside 100 puzzles and does not grow after (same at 1,000);
    50% or 70% solved ends in the same place.
  - **Screen:** `#blind-bonus` (gold line under the turn/ELO row: the extra on
    offer and that a peek forfeits it, or the 10 s / over-10 s message; empty once
    the puzzle is scored) and `.blind-time` (label + native range 1-20 under the
    buttons). `Blind.seconds` is the choice, `Blind.secondsThis` is what the
    CURRENT puzzle was shown for — a change mid-puzzle applies from the next one.
  - **New kv keys:** `blindfoldSeconds`, `blindfoldAttemptCount`, both added to
    `SYNCED_KEYS` in `js/firebase.js`. `/users/{uid}` has deliberately NO
    `hasOnly()` allowlist (firestore.rules line 23), so no rules change was
    needed — the handover prompt's "needs the allowlists at ~101 and ~601" was
    wrong: those are `/leaderboard` and `/studentReports`, and neither key goes there.
  - `KAEL_HINT_WARNING` (EN + ES) and `blind_explain` rewritten for the new rule.
    Users who already dismissed the old warning will not see the new one
    (`blindfoldHintWarningSeen` is already true for them) — the gold line tells them.
  - `Blind` is now `export`ed from `js/app.js` (like `Puzzles`) so the harness can
    read the puzzle's solution.
  - **Tests:** `tests/unit/blind-elo.test.js` (12) — `npm run test:tree` is now
    **65** (was 53), all green. `tools/cdp-verify-blind.mjs <outDir>` — 40/40 at
    375px, EN/ES × light/dark. REALLY TAPPED: the Blindfold button, Next, Peek,
    Kael's "Got it", Show solution, every chess move. CALLED: the slider (value
    set + input/change events), the reload. CLICKED: the Puzzles tab. SEEDED: the
    attempt count set to 10 before the peek/loss checks. Countdowns measured:
    1.02 s, 1.99 s, 3.0 s, 10.01 s, 20.00 s.
  - **Not done:** not tested on a real phone; the slider was never dragged by a
    finger. `countdownTimer` is still a setInterval cleared with clearTimeout
    (works; left alone on purpose).

- **READ TAB — SLID BOARDS JUDGED BY EYE, THE FAINT-CAPTION SLIDE FIXED (2026-10-03).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v133 → **v134**.
  `js/diagram.js` (`slidBlock` only, ~10 lines), `tools/measure-fallback.mjs`
  (counts slides itself). Follows the v133 entry below and CORRECTS it.
  - **The v133 counting rule was wrong.** "Of two grids one square apart, the
    less-pressed is the slid one" points the wrong way on the two pages that
    matter. Judged by eye from crops (15 slid grids, 12 opened, all genuine slides,
    none a second real board):
    **FCE p120** — the grid 123.8,647.8 that v133 called slid is the REAL board;
    the slid one is 124,604 (one rank up, into the text line), given by 77 presses
    against 71 for the true one. **Chess Life p52** — board 459,864.3 slid one rank
    DOWN into its blue "POSITION AFTER…" caption on 35 presses, incl. presses
    INSIDE the board; the true board came back only from its top rank (5).
    Chess Life p29 (8 presses, two ranks down), p45 (two boards, 6 + 6), p10 (2),
    p39 (6); Silman p20 (2); FCE pp. 20, 60, 180 (two boards), 220, 280 (59).
    Also: slides of TWO squares exist, which the 1.6-square rule never counted.
  - **True count on v133** (133 pages, 40-px grid, ~129,000 presses): slid presses
    Chess Life 63, Dvoretsky 0, Hellsten 0, Silman 2, FCE 136 = **201** (v133's
    entry said 20 / 0 / 0 / 2 / 122).
  - **Why:** a caption or text row can alternate light/dark by chance, but
    FAINTLY (FCE p120: all 7 pairs, by ~20 shades against the board's ~50; p52:
    the caption scored 3, the same as the true top rank with its two pieces).
    `slidBlock` only counted WHETHER each pair alternates (±1 past 3 shades).
  - **The fix:** each line also gets `w` — every pair as a share of the block's own
    light/dark step (median neighbour difference), capped at 1. Slid if the v133
    test says so OR `beyond.w >= 4 && outer.w <= beyond.w - 2.5`.
  - **After, every press compared one by one:** slid **201 → 7**. Of the 199 that
    stopped sliding, 137 now give the true board, 62 "no board". **No press that
    gave a true board lost it or changed board.** 116 presses that gave "no board"
    now give the true one (Hellsten 60, Chess Life 33, Dvoretsky 12, Silman 9,
    FCE 2). Inside a real board, gave it: Chess Life 3,301 → 3,321 of 3,415;
    FCE 2,579 → 2,627 of 2,627; Dvoretsky 1,968 of 1,972, Hellsten 1,432 of 1,432,
    Silman 837 of 837 unchanged. probe ≠ `detectBoard`: 0 in both runs, no ERR.
  - **Left, deliberately not chased (7 presses, all OUTSIDE the board):** Chess
    Life p10, 2 presses, two ranks down (unchanged); Chess Life p53, 5 presses in
    the text below board 96.3,825 give it one rank down — NEW, those presses gave
    "no board" before. The one "unconfirmed" crop (Chess Life p51, 27 presses) is
    the real board the tone search never finds (see v132), not a false one.
  - **The tool now:** per book — slid grids, slid presses (tone / fallback), and
    "inside a real board: gave it / presses". SLID = of two grids that overlap on
    a page (corners under 7 squares apart), the one with LESS checker contrast
    (summed light/dark difference over the 112 pairs, each capped at 60). "fb
    confirmed" now means matching a tone-search board that is NOT slid. Crops:
    `slid-*.jpg` for every slid grid, tone search included (slid red, the board it
    slid off green, small boards enlarged), `unconfirmed-*.jpg` for the rest.
    `env DIAGRAM=<file>` measures a candidate copy of `diagram.js` without
    touching the real one. A full run takes ~37 min with 4 workers; the progress
    dots do not show through a PowerShell redirect — check the node process.
  - **Verified (headless CDP, 375px, EN/ES × light/dark):** `cdp-verify-hatched`
    **92/92** (REAL long-presses on Dvoretsky/Hellsten/Chess Life p30 and a p17
    puzzle board; the p17 title-row and beside-the-board checks are CALLED),
    `cdp-verify-stage2` green (its one `confident:false` is the honest-degradation
    check, as intended), `cdp-verify-training` **65/65**, `test:tree` **53/53**.
    The 129k-press grids are CALLED, not pressed. SEEDED: books via `db.addBook()`.
    FCE p120 and Chess Life p52 were NOT long-pressed in the app, only measured.
    Not tested on a real phone.

- **READ TAB — DIAGRAM READER NO LONGER RETURNS A BOARD SLID ONE SQUARE (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v132 → **v133**.
  `js/diagram.js` (new `slidBlock` + `isSlid`, used by `placeByTone`, `accept`
  and the fallback's gate; the fallback gets the second `placeByTone` look the
  tone search already had), `tools/measure-fallback.mjs` (replays the same
  steps), `tools/cdp-verify-hatched.mjs` (optional puzzle page). Follows v132.
  - **The v132 "16 slid presses" was an undercount.** The tone search slides too,
    and `measure-fallback.mjs` counts a fallback board as "confirmed" when it
    matches ANY tone-search board — including a slid one. Counted properly (two
    grids on one page overlapping by under 1.6 squares; the less-pressed is the
    slid one — a RULE, not judged by eye; only four crops from pp. 17/19/26 were
    looked at), before the fix, 40-px grid, 133 pages, ~129,000 presses:
    Chess Life 718 slid presses, Dvoretsky 251, Hellsten 70, Silman 158, FCE 837.
  - **When:** a press just OUTSIDE a board (title or caption row, or beside it)
    gave the board slid a rank/file so that it held the finger.
    **Why:** `placeByTone` prefers the block holding the finger unless another
    scores 5% higher. A row of plain paper whose shade lies between the two
    square shades (Chess Life p17: paper 241, squares 254/194) votes with every
    square of the rank beside it, so the slid block loses only the 7 pairs ALONG
    that row, and title letters win some back: 106–109 of 112 vs the true 112.
  - **The fix:** a block is slid if an outer rank/file does not alternate along
    its own line (its 7 pairs) while the line just beyond the OPPOSITE side does
    (≥ 5, and ≥ 3 more than the outer one) — the real rank it dropped. Slid blocks
    are skipped in `placeByTone`; a finished board that still shows it is refused
    (a press further than two squares out has no better block in reach).
  - **After (same pages, same grid; cross-check probe vs real `detectBoard`
    0 differences):** slid presses Chess Life 718 → 20, Dvoretsky 251 → 0,
    Hellsten 70 → 0, Silman 158 → 2, FCE 837 → 122. Presses INSIDE a real board
    that give it: Chess Life 3,549 → 3,548 of 3,653; Dvoretsky 2,004 → 2,004;
    Hellsten 1,445 → 1,445; Silman 856 → 856; FCE 2,952 → 2,955. Real boards via
    the fallback: Chess Life 247 → 266, Hellsten 68 → 69, Dvoretsky 8 → 8. About
    390 formerly slid presses now give the true board, the rest "no board".
    **Cost:** ~510 presses OUTSIDE a board (mostly over a square away) that used to
    reach the true board now give nothing (Adrian accepted this).
  - **Verified (headless CDP, 375px):** `cdp-verify-hatched` with Chess Life p30
    and puzzle page 17 **92/92** (the new title-row check FAILS on the v132
    `diagram.js`: 91/92) — REAL long-presses on Dvoretsky/Hellsten/the p30 board
    and inside a p17 puzzle board in EN/ES × light/dark; the title-row and
    beside-the-board presses on p17 are CALLED (`detectBoard` on the reader's own
    canvas), not pressed. `cdp-verify-stage2` green, `cdp-verify-training`
    **65/65**, `test:tree` **53/53**. The 129k-press grids are CALLED. SEEDED:
    books via `db.addBook()`.
    Run: `node tools/cdp-verify-hatched.mjs <outDir> "<Dvoretsky.pdf>" 395 "<Hellsten.pdf>" 102 "<Chess Life.pdf>" 30 17`.
  - **Open, NOT looked at by eye:** FCE p120 — one grid (123.8,647.8, 41.6-px
    squares, 120 presses, unchanged by the fix) that the counting rule calls slid;
    it may be a real board beside another. Chess Life pp. 29, 45, 52 (14 presses)
    and p10 (2). `measure-fallback.mjs`'s own "confirmed" column still has the
    undercount described above. Not tested on a real phone.

- **READ TAB — DIAGRAM READER'S OLD FALLBACK NO LONGER TAKES TEXT FOR A BOARD (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v131 → **v132**. Only
  `js/diagram.js` changed (the fallback block at the end of `detectBoard`), plus a
  new dev tool `tools/measure-fallback.mjs`. Follows the v131 entry below.
  - **Measured first, decided with Adrian.** `measure-fallback.mjs` renders pages
    as the reader does (1065-px canvas), presses every 40 px over WHOLE pages and
    replays `detectBoard` step by step (its cross-check against the real
    `detectBoard` read 0 differences on every run). A fallback board equal to one
    the tone search found on that page counts as real; every other one is saved as
    a crop and was judged by eye. 147 pages, ~144,000 presses (Chess Life all 68,
    Dvoretsky 21, Hellsten 15, Silman 15, FCE 14 x2 files — they are the same book):
    the fallback found a REAL board the tone search missed from that spot on
    **388** presses (Chess Life 247, Hellsten 131, Dvoretsky 8, Silman 2 — incl. a
    Chess Life p51 board the tone search never finds from ANY press) and a FALSE one
    on **223**. Dropping it would have lost the 388.
  - **The fix:** the fallback's answer must pass the same plain-checker test the
    tone search uses (`checkerVotes` ≥ 80 of 112), else the next window size is
    tried. Every real fallback find scored ≥ 80; every grid over text or photos
    scored under 80, most under 15. **After (same probe, same pages): real 388 →
    388, false 223 → 16.** The 16 left are NOT text: they are real puzzle boards on
    Chess Life pp. 17, 19, 26 found SLID one rank or one file (votes 100–109, so
    the gate cannot catch them). Hellsten, Dvoretsky, Silman, FCE: 0 false.
  - **Line-only boards (no shading) are no longer found at all** — the tone search
    never found them, and now the fallback refuses them too. None exist in any of
    the six books; on text a no-shading board and a text block score the same (≈0),
    so a line-only exception would let the text back in (Adrian chose this).
  - **Verified (headless CDP, 375px):** `cdp-verify-stage2` green (synthetic boards
    are shaded; blank area and text still give no board), `cdp-verify-hatched`
    with Chess Life p30 **82/82** — REAL long-presses at five spots on the magazine
    board and on Dvoretsky/Hellsten in EN/ES × light/dark; `cdp-verify-training`
    **65/65**; `test:tree` **53/53**. The 144k-press grids are CALLED
    (`detectBoard` internals on a rendered canvas), not pressed. SEEDED: books via
    `db.addBook()` in the verifiers.
  - Run: `node tools/measure-fallback.mjs <outDir> 40 12 "<pdf>:all" "<pdf>:20-420/20"`
    with env `GATE=80` (current code) or `GATE=0` (the v131 fallback). ~60 s per
    page per worker; the scans need the `wasmUrl` it passes.
  - **Open:** the 16 slid puzzle-board presses above (Chess Life puzzle pages lay
    boards on one lattice; the p17/p66 "1–3 px off" limit in the v131 entry is the
    same family). Not tested on a real phone.

- **READ TAB — DIAGRAM READER ON MAGAZINE BOARDS (CHESS LIFE) (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v130 → **v131**. Only
  `js/diagram.js` changed (plus `tools/cdp-verify-hatched.mjs`, which now takes
  an optional magazine page). Follows the v130 entry below.
  - **Adrian's report:** in `D:\2. Chess\2. Material\2. CBH and PDF\Chess Life
    Magazine 2026-09 Septmber.pdf` a long-press on a diagram under the red
    players' lines gave a board grid shifted up over the red text and the rule
    (6 ranks of board + text). Boards there: small (22–27 px squares at 1065 px),
    pale grey dark squares, two text columns, photos close by.
  - **Measured on the whole issue (68 pages, 8x8 presses per diagram), v130 →
    v131: presses missed 37% → 3%; false boards on ~16,700 presses over text and
    photos 18 → 35 (0.1% → 0.2%). The remaining ones are integer grids from the
    OLD window search (the fallback), which now runs on presses the tone search
    rightly turns down — a follow-up could drop or tighten that fallback.** Dvoretsky + Hellsten re-checked: still 0
    missed, one grid per board.
  - **Causes and fixes (all in the tone search, `detectFromBand`):**
    a. `findComb` replaces `findGrid` there: a tooth scores by how far it stands
       above the profile half a square either side. Text is busy everywhere, and a
       comb at twice the square size half on the next text column won by height.
    b. `boardRows`: the board's top and bottom from the files just found, so the
       rank search is not swamped by the bold move lines above and below.
    c. `placeByTone` counts neighbour-pair VOTES (not summed brightness), judges a
       square by its corners (`cellTone`; a black piece on a light square made the
       cell mean darker than a dark square), and only looks within two squares of
       the finger, preferring the block that holds it (on p17's 12 puzzle boards a
       neighbouring board fits the same lattice).
    d. `accept(…, shaded)`: the tone search must show a plain checker pattern
       (`checkerVotes` ≥ 80 of 112; every real board in the issue scored 89–112,
       every false one ≤ 68), line contrast relaxed to 1.1 (crowded small boards
       came out ~1.2). Line-only boards fail this and go to the window search, as
       before.
  - **Verified:** `tools/cdp-verify-hatched.mjs` with Chess Life p30 (the page in
    Adrian's screenshot, printed 28): the grid found is the drawn board to within
    3 px, ≥240/256 inner points give it; REAL long-presses at five spots on the
    board open the dialog in EN/ES × light/dark; Dvoretsky/Hellsten checks as in
    the v130 entry. `cdp-verify-stage2` green, `cdp-verify-training` 65/65,
    `test:tree` 53/53.
  - **Known limits:** on p30, 16 of 256 inner points (top-right corner, under the
    black rook/knight) still miss; boards on p17/p66 (puzzle pages) sometimes give
    a grid 1–3 px off from a few presses; the scans (Silman/FCE) give a board
    shifted one square for presses JUST OUTSIDE a board (inside presses are fine).
    Not tested on a real phone.

- **READ TAB — DIAGRAM READER FINDS A HATCHED BOARD WHEREVER IT IS PRESSED (2026-10-02).**
  Committed on `main`, NOT pushed, NOT deployed. `sw.js` v129 → **v130**. One
  shipped file changed, `js/diagram.js` (already in sw ASSETS); one new dev tool,
  `tools/cdp-verify-hatched.mjs`. Closes the "FOUND, NOT FIXED" bullet at the end
  of the Training-mode entry below.
  - **How bad it was (measured before the fix, headless Chrome, 375px, page canvas
    1065 px):** a 16x16 grid of presses inside each board. Dvoretsky, 9 pages /
    11 boards: **about 4 presses in 10 missed** (p160's board was never found from
    anywhere; lower boards on p205/p350 found only from a couple of strips). The
    boards it did find were often a little off (squares read as 48 px instead of
    47, so the far side drifted 8 px; some 48x56). Hellsten, 4 pages: 14% missed
    (the bottom rank and lower corners). A press on BLANK white margin came back as
    a tiny "board" (findGrid's gate compared 0 with 0 and passed).
  - **Cause, two parts:** (1) hatching is all edges, so every row and column of a
    hatched board is busy and the square boundaries barely stand out — `findGrid`
    (almost always on the horizontal lines) passed or failed depending on how much
    white margin the window happened to include, i.e. on finger height; (2) the
    window is centred on the finger, so a press near a board's edge needs a
    board-sized window, which is then half full of the text next to the diagram.
  - **The fix (`js/diagram.js`):** `detectBoard` now first runs
    `detectFromBand` on a **tone map** (`toneMap`: the page box-blurred twice,
    radius `W/355` ≈ 3 px at 1065 — hatching, wood grain and scan speckle average
    to flat grey). Files from a low band of rows through the finger (whole page
    width); ranks from only those columns; then `placeByTone` picks which 8x8 block
    of the lattice is the board by the strength of its light/dark alternation (the
    comb can sit up to 7 squares off), `fitBoard` re-finds the grid from exactly
    that block and `refineAxis` fits period and origin to a fraction of a pixel on
    the 7 INNER lines. The same guards as before (`accept`: squareness,
    `lineContrast` ≥ 1.35 both axes, `validateCheckerboard`). The old tap-centred
    window search (`detectInWindow`) is kept as the **fallback** (Adrian chose
    this), but its result is now checked against the tone pattern: if the pattern
    says the board is elsewhere on that lattice, the fitted board is returned, or
    nothing. `findGrid` now rejects a window with no edges at all (blank paper).
    Board coordinates can now be fractional; `cellRect`/`cropBoardCanvas` already
    took floats.
  - **After the fix (same probe, same pages):** Dvoretsky 16 pages / 19 boards +
    Hellsten 4 pages / 7 boards = **6,656 presses on 26 boards, 0 missed, and every
    board gives ONE grid from all 256 points** (Dvoretsky 47x47 exact, matching the
    470-px picture = 10 squares incl. border; Hellsten 41.5 = 332/8 exact).
    **False boards on presses OFF the boards (text and margins), 13 pages, final
    code: 2 of 2,966** (both Hellsten p60, both from the old fallback, a
    pre-existing kind). Before the fix the same pages gave 254 on Dvoretsky
    (nearly all blank white margin) and 26 on Hellsten. A 2x-zoom
    render (2130 px) gave the same result. The two
    SCANNED books (Silman, Fundamental Chess Endings — also hatched) went from
    almost nothing found to every diagram found on the 6 scan pages tried, one grid
    per board in nearly all presses (3 of 132 presses on FCE p200 gave a grid 1 px
    off in period).
  - **Verified** — `tools/cdp-verify-hatched.mjs` (headless, 375px, EN/ES ×
    light/dark, **56/56**): Dvoretsky p395 + Hellsten p102. REALLY PRESSED with CDP
    touch input (finger held 1.1 s, dialog read while the finger is still down): on
    Dvoretsky at 20%, 28% and 70% of the page height — the heights that were missed
    — with Training off AND on → the diagram dialog opens with the board; on plain
    text (50%) → "Couldn't find a board there" / "No encontré un tablero ahí" and no
    dialog; on the bottom rank of a Hellsten board → dialog. The Training button
    REALLY TAPPED. CALLED, not pressed: `detectBoard` on the reader's own page
    canvas — 16x16 inside each of the four boards, all 256 give the same grid;
    280-point grid over the rest of both pages → no board. CLICKED with
    `element.click()`: Read tab, shelf cards, Back. SCROLLED by setting `scrollTop`.
    SEEDED: the two books via `db.addBook()`. Run:
    `node tools/cdp-verify-hatched.mjs <outDir> "<Dvoretsky.pdf>" 395 "<Hellsten.pdf>" 102`.
    Also green: `node tools/cdp-verify-stage2.mjs http://localhost:<port>` (all
    checks, incl. the blank-area and no-board-on-text ones),
    `tools/cdp-verify-training.mjs` **65/65**, `npm.cmd run test:tree` **53/53**.
  - **Book templates:** a book already calibrated on the phone was taught from
    the OLD, slightly-off grid. If Dvoretsky reads pieces worse than before, clear
    its templates (the reader's re-teach option) and teach it once more.
  - **Not tested:** a real phone and finger; reading the PIECES on a real
    Dvoretsky board after this change (only finding the board was checked;
    stage-2 reading is checked on synthetic boards); time on a slow phone (a miss
    costs ~40 ms in desktop headless, ~1.5x the old path); memory at deep zoom
    (the tone map adds two page-sized float arrays, ~60 MB at the 2400-px cap).
  - **Dev-only probe** (pages 30–395 of Dvoretsky, Hellsten 60/102/150/200, the
    scans) was throwaway, not committed; the committed tool covers p395 and p102.

- **READ TAB — TRAINING MODE: "!" MOVES ARE COVERED, TAP TO REVEAL (2026-10-02).**
  Committed on `main` (`cd92abb`), NOT pushed, NOT deployed. Main is ONE commit
  ahead of origin: origin is at `a32e801`, so the tab-swipe entry below saying
  "NOT pushed" is out of date — v127 and v128 are on origin. No rules change. `sw.js` v128 → **v129**; one new shipped
  file, `js/read-training.js`, added to the sw ASSETS.
  - **What it does:** a new button in the reader header (crossed-out eye, left of
    full-screen). On: every move marked "!" or "!!" on the page is hidden under a
    navy block; one tap on a block reveals that one move. For training alone with
    a book. Off: nothing is added to the page at all.
  - **Decided with Adrian:** "!" and "!!" only — "!?", "?!", "?", "??" stay
    visible. The block hides the move, its mark and any sign glued to it
    ("Rd2!+–", "g5+!=", "Ke3!ʘ"); the move NUMBER stays ("34." then a block), and
    so does a closing bracket or comma. On/off is remembered PER BOOK. A revealed
    move stays revealed until its page is scrolled well away, the mode is turned
    off, or the book/Read tab is left — then it is covered again; nothing about
    reveals is stored. Prose with an exclamation mark ("error!") is never covered.
  - **Scanned books cannot do this** (no text in the file, and no OCR — it would
    break the self-hosted / light-first-launch rules). On a scan the button is
    dimmed; tapping it says, in one line, that the book is a scan.
  - **Adrian's five PDFs in `ChessPuzzleImport\` (30 pages sampled each):**
    Dvoretsky and Hellsten have real text (about 5–8 "!" moves a page) → Training
    works. Silman and both copies of Fundamental Chess Endings are pure scans →
    dimmed button. **CORRECTION to the 2026-08-31 entry below:** Dvoretsky is NOT
    "a true scan with 0 embedded fonts" — its text is real, visible, positioned
    text (only the diagrams are pictures).
  - **How it works (`js/read.js`, section "Training mode"):** the pages are still
    pictures. With Training on, `buildCovers(slot)` asks pdf.js for the page's
    text — `page.getTextContent()`, the first and only use of it in the app — and
    hands it to `findCovers()` in `js/read-training.js`, which returns boxes as
    fractions of the page. They are drawn as `.train-cover` divs in a
    `.train-covers` layer inside the page's slot, sized in %, so zoom, pinch,
    rotation and the crisp re-render carry them with no extra work. Built once per
    slot (that is what keeps a reveal until the page is left); removed in
    `releaseSlot`. Taps: `handleTap` asks `coverAtClient()` first — a hit removes
    the cover and uses the tap up (`lastTap = 0`), so it is never half a
    double-tap. The covers take no pointer events; the long-press path is untouched.
  - **The rule itself (`js/read-training.js`, imports nothing):** pdf.js returns
    text in chunks that ignore words — one chunk holds several moves ("f4! g5!
    7."), and one move is split across two (the figurine in its own font, then
    "f4!"). So chunks are laid out as one character stream, words are cut from it,
    and `coverSpan()` decides. It never reads piece letters (figurines come back
    as private characters, e.g. U+E026): it needs a square (`e4`) or castling
    before the mark. A move's place inside a chunk is measured with the book's own
    embedded font, which pdf.js registers in `document.fonts` under the chunk's
    `fontName` once the page has rendered.
  - **Stored on the book record (IndexedDB `books`):** `training` (true/false) and
    `hasText` (true/false, worked out once per book by `checkHasText()` from the
    open page plus five spread through the book; a page counts at 150+ characters).
    New fields only; nothing renamed.
  - **Name trap:** `.read-cover` is the SHELF's cover thumbnail. The training
    blocks are `.train-cover` for that reason.
  - **Strings:** `read_training`, `read_training_on`, `read_training_off`,
    `read_training_scan` (EN + ES).
  - **Verified** by `tools/cdp-verify-training.mjs` (headless Chrome, 375px, EN/ES
    × light/dark, **65/65**; it serves the repo and the books itself, no preview
    port). Books: Hellsten p102 (figurine), Dvoretsky p395, Silman p60 (scan).
    Run: `node tools/cdp-verify-training.mjs <outDir> <figurine.pdf> 102 <text.pdf> 395 <scan.pdf>`.
    Checked: off = no layer and a screenshot byte-identical to before it was ever
    on; covers = the "!"/"!!" moves counted separately under Node (12 and 7); every
    cover has print under it and both edges in white space, read from the page's
    own pixels — at 1x, after double-tap zoom, after pinch (2.6x), after scrolling
    six pages away and back, sideways (812x375) and upright again, in full screen.
    REALLY TAPPED with touch input (CDP `Input.dispatchTouchEvent`): the Training
    button, every reveal, the taps beside and away from a cover, reveal-then-quick-
    tap (no zoom), double-tap zoom, the pinch, long-press on a cover (not a
    reveal), long-press on a diagram with Training off and on (dialog opens).
    CLICKED with `element.click()`: the Read tab, shelf cards, Back, full-screen,
    the Puzzles tab. CALLED: scrolling (`scrollTop` set), rotation (emulated
    screen resized). SEEDED: the three books, put on the shelf with
    `db.addBook()` and a starting page. `npm.cmd run test:tree` 53/53 (8 new in
    `tests/unit/read-training.test.js`).
  - **Known limits:** a move broken across two lines is not covered; rotated text
    is ignored. The padding on a block can rest on the dot of the move number. A
    tap within 12px of a block counts as a tap on it (blocks are ~4mm wide on a
    phone), so a double-tap that starts that close to one reveals instead of
    zooming.
  - **Not tested:** a real phone and a real finger; any book other than those
    three; a book whose text is an invisible OCR layer over a scan (none on hand —
    blocks there would only be as accurate as the OCR).
  - **FIXED 2026-10-02 (entry above)** — was: **FOUND, NOT FIXED (pre-existing, nothing to do with Training):** the diagram
    reader misses Dvoretsky's hatched boards at some finger heights. Probing
    `detectBoard` directly on p395 at 375px: inside the first board it finds the
    board at 8%, 12%, 16% and 24% of the page height but NOT at 20% or 28%; in the
    second board it misses at 70%. Hellsten's boards were found at every spot
    tried. On a phone this is "Couldn't find a board there" on a press that is
    plainly on the diagram.

- **TAB SWIPE WORKS IN PUZZLE RUSH AND BLINDFOLD (2026-10-02).** Committed on
  `main`, NOT pushed, NOT deployed (main is now two commits ahead of origin
  `5cdeae6`). Behaviour only — no rules change, no data change, no new text.
  `sw.js` v127 → **v128**.
  - **What it does:** a sideways swipe on Puzzle Rush or Blindfold now goes to
    the same neighbours as Puzzles — Openings one way, Play the other. Swiping
    back towards Puzzles from either side lands on plain Puzzles, as the drawer
    does. Android Back after a swipe returns to the Rush / Blindfold screen that
    was left, the same as after a drawer tap.
  - **Leaving mid-run is the drawer's behaviour, unchanged:** a Rush run is
    dropped (clock stopped, no result card, no score saved, no dialog); a
    Blindfold puzzle is abandoned (countdown and peek timers cancelled, no
    rating change, no dialog). The swipe goes through the same `showScreen()`.
  - **Added on purpose, beyond the bare fix:** the Blindfold board and the Rush
    board (and Rush's 5…1 count-in lying over it) keep EVERY touch — a drag that
    starts anywhere on them never switches tabs, not even from an empty square.
    On the Puzzles board an empty square still swipes, as before. Reason: with
    hidden pieces nobody can tell an empty square from their own piece, and a
    slipped swipe in Rush would silently end the run. To swipe away from those
    two screens, start the drag above or below the board.
  - **Left alone on purpose:** Leaderboard, Friends, Blocked, Friends
    leaderboard, a public profile, Masterclass and Set up position still have
    no swipe neighbours — each is left by its Back button.
  - **Code:** `js/app.js` only — `SWIPE_AS_HOME` (rush, blind) and
    `neighbourTab()`, which looks those two up under their home tab through the
    existing `MENU_AREA`; `boardOwnsTouch()` (the two board ids); `SWIPE_SAFE`
    (`#rush-countdown`). The mode chips were already covered (`.seg.scroll`).
  - **Verified** by `tools/cdp-verify-swipe-modes.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **161/161**), preview `chess-app75` = port 9190.
    REALLY SWIPED with touch input (CDP `Input.dispatchTouchEvent`): every tab
    swipe, every drag on the chips, every drag on a board (a piece, an empty
    square, hidden Blindfold pieces after the countdown, the Rush count-in).
    CLICKED with `element.click()`, not a finger: ☰ and drawer destinations,
    the mode chips, Rush Start, Leaderboard, Friends. CALLED, not tapped:
    `history.back()` stands in for Android Back; `showScreen()` opened Blocked,
    Friends leaderboard, a public profile, Masterclass and Set up position, with
    no data behind them. SEEDED: nothing. `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real phone (a real finger is less straight than the
    test's), a signed-in account, and an OPEN base — the fresh test profile has
    no bases, so only the Bases list was swiped; its code path was not touched.

- **TAB HEADERS: NO SECOND TITLE (2026-10-02).** Committed on `main`, NOT
  pushed, NOT deployed (main was level with origin at `5cdeae6` before this).
  Looks only — no rules change, no data change. `sw.js` v126 → **v127**.
  - **What it does:** the top bar already names the tab, so the ten top-level
    tabs no longer repeat it in a second title underneath (Bases, Play, Read,
    Openings, Puzzles, Puzzle Rush, Blindfold, Learn, Profile, Students).
    Every tab's first content now starts 10px under the top bar, the same as
    Analysis.
  - **Where each stranded control went:** Bases — **New base** and **Import
    PGN** share one row, counter at the right edge. Read — the storage line
    sits left of **Add book**. Puzzles — the rating and +/− badges joined the
    progress/timer row. Blindfold — the rating badge sits right of the
    "White to move" line. Students — ⟳ moved to the right end of the "My
    students" heading (so it is not shown signed out, where there is nothing
    to reload).
  - **Kept on purpose:** every sub-screen title, because there the top bar only
    names the parent tab — an open base, a Masterclass, Game History, the Rush
    result, Learn's lists/lessons/endings, Leaderboard, Friends, Blocked,
    Friends leaderboard, a public profile, Set up position.
  - **Screen readers:** `#app-title` in the top bar is now the page's one
    `<h1>` (it was a `<span>`). Rush and Blindfold keep their title as an
    invisible `<h2 class="sr-only">`, because the top bar says only "Puzzles".
  - **Code:** `index.html` head rows; `css/style.css` — `.tab-head`,
    `.tab-head-btns`, `.tab-lead`, `.badge-group`, `.sr-only`, `.blind-head`,
    and a first-visible-section rule for `#stu-body`. Three strings that
    nothing else used were deleted from `js/i18n.js`: `play_title`,
    `read_title`, `trainer_title` (`docs/EN-REVIEW-PLAN.md` still lists them).
    `puzzles_title`, `rush_title`, `blind_title` stay — still used.
  - **Older fault fixed on the way:** with an empty bookshelf the Read tab
    scrolled sideways by 30px — its watermark had no positioned parent and
    hung off the page. `#read-shelf` joined the watermark-container rule and
    got a `min-height` so the watermark is not cut short.
  - **Verified** by `tools/cdp-verify-tabheads.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **301/301**), preview `chess-app74` = port 9189.
    REALLY CLICKED: ☰ and every drawer destination, the three puzzle-mode
    chips, New base, Import PGN, Add book, ⟳, Leaderboard, Friends, a base,
    Game History, Learn down to a lesson and an ending position, every Back,
    and the whole guided tour started from Settings (33 steps, every target
    found and ringed, finished). SEEDED: nobody was signed in — the signed-in
    Students tab was faked the same way as the hardest-topics check, with
    `Students.load` swapped for a counter to see ⟳ call it once; Blocked,
    Friends leaderboard, Masterclass and a public profile were opened by
    calling `showScreen()`, the last two with no data, so only the heading's
    place in the row was checked there. `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real phone, a signed-in account, the Rush result card
    (untouched markup, not opened), and the +10/−10 badge appearing after a
    solved puzzle (present in the page, not triggered).
  - **Found here, FIXED since (v128, entry above):** swiping sideways to the neighbouring tab
    does nothing in Puzzle Rush and Blindfold. `neighbourTab()` in `js/app.js`
    looks the screen up in `TAB_ORDER`, which holds only the drawer's nine
    screens; `rush` and `blind` are not in it, so it returns null.

- **STUDENTS: HARDEST TOPICS + WEAK-SPOT MARKS (2026-10-01).** Committed on
  `main`, NOT pushed, NOT deployed. No rules change, no change to what a
  student shares, no IndexedDB change. `sw.js` v125 → **v126**.
  - **What it does:** (1) on a student's page, the puzzle themes that are a
    weak spot get a gold edge, a tint and a ▼ (with a "Weak spot" label for
    screen readers), and a line under the grid says what the mark means.
    (2) At the top of the Students tab, "Hardest topics for your students" /
    "Temas más difíciles para tus alumnos": the themes that are a weak spot for
    the most students — rank, "3 of 4 students", a bar, and the names.
  - **Adrian's two decisions:** scope A (existing data only — NOT real mistake
    counts); and "weak" = judged against the student's OWN puzzle rating, not
    simply the three lowest.
  - **The rule, exactly:** a named theme is a weak spot when its rounded rating
    is **75 or more below the student's rounded puzzle rating**, the lowest
    **3** at most (`WEAK_GAP`, `WEAK_MAX`). The class block counts students per
    weak theme, lists only themes shared by **two or more**, most students
    first, ties broken by the bigger total shortfall, top 5 (`HARD_SHOWN`).
    Only students with a puzzle rating AND at least one named theme take part;
    the note says "N of M students share themes". Fewer than two such students:
    a plain sentence with the count, no ranking. No accepted student: no block.
  - **Honest limit — it is ratings, not mistakes.** Checked in the code:
    nothing a student shares counts mistakes or attempts per theme
    (`buildStudentReport`, js/firebase.js). A theme gets a rating only once one
    puzzle of it is tried, and in a student's first 10 puzzles one result moves
    a theme about 100 points — so a mark on a brand-new student can be one
    unlucky puzzle. The app cannot tell "tried once" from "tried 200 times".
  - **Code (`js/students.js`):** `namedThemes(themes)` (the one meta-tag
    filter, now shared), `weakThemes(r)`, `renderHard()` (called from
    `render()`), and `themesBlock(r)` — it now takes the whole summary, not
    just `puzzleThemeElo`. Markup `#stu-hard` in `index.html`; CSS
    `.stu-theme.weak`, `.stu-hard-*`; 8 strings `stu_weak_*` / `stu_hard_*`.
    The Assign-homework sheet's weakest-first chips are untouched.
  - **Verified** by `tools/cdp-verify-hardtopics.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, **169/169**), preview `chess-app73` = port 9188.
    SEEDED: nobody was signed in — the teacher uid, the coaching links and
    seven students' summaries were written straight into the live `Students`
    object, `Students.load` was replaced by a no-op, and the tab was opened by
    calling `showScreen('students')`, not by a tap. REALLY CLICKED: every
    student card, "Show all", and Close. The expected ranking was counted by
    hand in the script's comments (fork 3, pin 2, skewer 2 of 4 sharing
    students; two one-student themes left out) and the page matched it; also
    checked: exactly −75 is marked and −74 is not, a 4th theme at −75 is left
    out by the cap, meta-tags never show, a student sharing nothing, a student
    with only meta-tags, a student with no summary, one student only, two
    students with nothing in common, no accepted student, no sideways scroll.
    `npm.cmd run test:tree` 45/45.
  - **Not tested:** a real signed-in teacher with real students, and a real
    phone. Offered and NOT built: per-theme first-try misses from homework
    results (data already arrives, no rules change), and scope B (count real
    failures per theme on the student's device — needs a summary + rules
    change and a rules deploy).

- **OPENINGS: ONE CHOSEN GAME PLAYS TO ITS LAST MOVE (2026-10-01).** Committed
  on `main`, NOT pushed, NOT deployed. No rules change, no IndexedDB change, no
  new control, no new string. `sw.js` v124 → **v125**.
  - **What it does:** with "Practice one game only" on, the book is now the
    WHOLE game — main line and every variation, however late — so the computer
    stays "in book" to the final move. The count next to the toggle is the
    game's real length (the 45-half-move Immortal Game says 45, it said 41).
  - **Adrian's decision, taken as his stated default:** the WHOLE-database book
    is unchanged — still the first 500 games, 40 half-moves deep. It is an
    openings book; nobody asked for it to go deeper.
  - **Code (`js/app.js`, `Trainer.buildBook`):** one line —
    `const maxDepth = gameId ? 1000 : 40;` and `walk()` tests `depth > maxDepth`.
    1000 half-moves is only a safety stop for a damaged PGN (the longest
    tournament game ever played is 538). This supersedes the "Known, not new"
    40-ply note in the entry below.
  - **Build time, measured** (headless Chrome on this PC, median of 9): a
    300-half-move game builds in ~19 ms, of which ~17 ms is reading the PGN —
    which the app did in full even under the old limit. The Immortal Game
    ~5 ms. So the deeper walk itself costs about 2 ms; nothing to feel.
  - **Verified** by `tools/cdp-verify-onegame.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, now **47/47**). SEEDED straight into IndexedDB: the
    four old bases plus "Verify Long" — the Immortal Game with one extra
    variation on its last black move (22...Ne7 23.Qxe7#), and a 300-half-move
    SYNTHETIC game of seeded-random legal moves. Really clicked: toggle, game
    rows, Black, Start, Back; the select was set and fired `change`. The
    player's moves went in through `Trainer.userMove`, not taps. Results:
    Immortal alone 45 positions, and played to the end as Black the computer
    made all 23 White moves from the book, badge "in book" on 23.Be7#; the late
    variation counts 46, offers both 22...Nxf6 and 22...Ne7, and answers
    22...Ne7 with 23.Qxe7# from the book; the 300-half-move game counts 295
    (5 positions repeat — cross-checked against a count made with chess.js at
    seed time, not hand-counted); whole base still 81, 51 after the Opera Game
    is deleted; toggle off/on, switching games, changing database, reload and
    offline all still pass. `npm.cmd run test:tree` 45/45.
  - **Script trap, fixed:** a play-out helper that read `Trainer.chess` straight
    after clicking Start saw the PREVIOUS game for one tick and moved on it.
    `playOutAsBlack` now waits 300 ms first.
  - **Not tested:** a real phone, real finger taps on the board, and a real
    imported long game (both long games here were seeded).

- **OPENINGS: PRACTISE ONE CHOSEN GAME (2026-10-01).** Committed on `main`,
  NOT pushed, NOT deployed. No rules change, no IndexedDB schema change.
  `sw.js` v123 → **v124**.
  - **What it does:** under the database select on the Openings tab, a toggle
    "Practice one game only" / "Solo una partida" (off by default = the whole
    database, exactly as before). On: a row shows the chosen game; tapping it
    opens a sheet with a search box and the base's games (same rows and
    200-at-a-time paging as the Bases tab; search matches White, Black, event
    and date). The book is then built from that ONE game, variations and
    comments included, and the count next to the toggle is that game's.
  - **Adrian's two decisions:** one game only (not several ticked games); the
    last database / toggle / game ARE remembered, on this device only — kv key
    `trainerPick` `{baseId, oneGame, gameId}`, deliberately not in
    `SYNCED_KEYS` because game ids are local.
  - **Code (`js/app.js`, `Trainer`, now exported for the verify script):**
    `bookBaseId` is GONE, replaced by `bookKey` = `"baseId|gameId"` (gameId
    empty = whole base) — that was the cache trap. `buildBook(baseId, gameId)`,
    `syncGame()`, `renderPick()`, `savePick()`, `baseChanged()`,
    `toggleOneGame()`, `pickGame()`. `gameRowHtml(g)` is the one game-row
    markup, shared by `Bases.renderGames()` and the picker.
  - **Rules it follows:** changing the database clears the game (the toggle
    stays on and asks for one); a one-game database picks its game by itself;
    toggling off and on keeps the game; Start with nothing chosen opens the
    picker instead of starting; a remembered game that has since been deleted
    drops back to the whole database rather than swapping in another game.
  - **Layout trap, measured:** the toggle shares ONE line with the "N book
    moves" count (`.trainer-one-row`). A row of its own made the group 48px
    taller and Kael's card then covered part of the tour's `trainerSet` frame
    (`#trainer-base` → `#trainer-level`) at 375x812. Now the default screen is
    the same height as before and the card clears the level buttons by 1px —
    there is NO spare room; anything added inside that frame breaks the step.
    The Spanish label is short for the same reason.
  - **Verified** by `tools/cdp-verify-onegame.mjs` (headless Chrome, 375px,
    EN/ES × light/dark, 42/42): SEEDED straight into IndexedDB — four bases
    (Morphy's Opera Game, Anderssen's Immortal Game, a Queen's Gambit study
    with two variations and two comments; a one-game base; 450 synthetic
    games). Really clicked: the toggle, the game rows, Start, Back; the search
    box got real input events; the select was set and fired `change`. The
    player's own moves went in through `Trainer.userMove`, not taps. Results:
    whole base 81 positions; Opera 33; Immortal 41; study 11; as Black against
    game A the computer played 1.e4 2.Nf3 six times of six, against game B
    1.e4 2.f4 six of six; leaving the game's moves hands over to the engine;
    reload and offline reload (service worker) keep the choice.
    `npm.cmd run test:tree` 45/45.
  - **Known, not new:** the book builder stops 40 plies deep (the 45-ply
    Immortal Game counts 41), so the tail of a long game is never played from
    the book — more visible now that one long game can be the whole book.
    Restarting the tour from Settings WITH a game chosen makes the frame taller
    than the space left, and the card then covers the database select; a
    first-time user never sees that state.
  - **Not tested:** a real phone, and real finger taps on the board.

- **LIVE SEARCH: ONE CHANGED GAME NO LONGER RE-READS THE BASE (2026-10-01).**
  Committed on `main`, NOT pushed, NOT deployed. No rules change. **No
  IndexedDB schema change** (`DB_VER` stays 5 — one more hand-written key in
  the existing `posIndex` store, so there is no upgrade step). `sw.js` v122 →
  **v123**. This closes the "Not done, follows from this" bullet of the entry
  below.
  - **What it does:** after one game is added, edited, moved or deleted, the
    search reads THAT game, not the base's whole game list. Before / after
    (`tools/measure-livesearch.mjs`, real app, headless Chrome, this PC;
    x4 ≈ a phone):

    | Base | Games | Next search after 1 game added, before x1 / x4 | after x1 / x4 | 2nd start after 1 game added, before x1 / x4 | after x1 / x4 | 2nd start, no change (must not regress) x1 / x4 |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` | 27,129 | 0.5 s / 1.5 s | **0.02 s / 0.05 s** | 0.5 s / 1.6 s | **0.07 s / 0.22 s** | 0.05 s / 0.19 s (was 0.05 / 0.20) |
    | `2024 - 27 UPDATES.pgn` | 177,139 | 3.4 s / 10.0 s | **0.04 s / 0.12 s** | 3.7 s / 11.2 s | **0.39 s / 1.4 s** | 0.37 s / 1.5 s (was 0.34 / 1.6) |

    The tool now prints which path ran: "base NOT walked, 1 listed game(s)
    re-read". A second start after a change now costs the same as one with no
    change (it is the reopening of the stored blocks, nothing else). First ever
    build unchanged (140 s / 660 s on the 177k base).
  - **How:** next to each base's `rev` counter there is now a short list of
    WHICH games were written: key `[baseId,'log']` = `{ since, ids }` — the ids
    of every game of that base written after the counter stood at `since`.
    `gamesWrite()` writes it in the SAME transaction as the game and the `rev`
    bump. `touch(baseId, gameId)` names a game; `touch(baseId)` alone (a write
    too big to name) drops the list.
  - **The rule that keeps it correct:** `Analysis.explore.at` = the base's
    counter when the index was last right (from `built` on disk after a start,
    then kept in memory). `syncExplore()` reads `{ rev, log }` in one
    transaction (`db.posIndexChanges`), then:
    1. `rev === at` → nothing was written to THIS base; return (a write to
       another base now costs nothing).
    2. `log && log.since <= at` → the list vouches for everything since →
       `PositionIndex.patch(ids, getGame)` looks at those ids only.
    3. anything else (no list, a list that starts too late, index never built
       or unreadable) → the full `listGameSummaries` + `sync()` walk, exactly
       as before. **The walk is still the fallback and must stay.**
    `markPosIndexBuilt(baseId, rev, { stored })` empties the list in the same
    transaction ONLY if the counter still equals `rev`; a game written during
    the sync stays listed. `patch()` is safe to repeat (a listed id whose
    `updatedAt` already matches costs one look), so a list that was not
    emptied, or a sync cut short, is harmless.
  - **Cap:** `LOG_MAX = 200` ids (`js/db.js`). A write of more than 200 games
    at once (`addGamesBatch` — the importer sends 500 a batch) names nothing
    and drops the list → one walk on the next search, as before; the list
    starts again with the next single write. A small import (≤ 200 games in a
    batch) IS named and read game by game.
  - **Memory-only index (`noStore`, device short of space):** same path — the
    list lives with the games' counter, not with the stored blocks, and
    `markPosIndexBuilt(..., { stored: false })` empties it without writing
    `built`. `clearPosIndex` keeps `rev` and `log`.
  - **Files:** `js/db.js` (`gamesWrite`, `addAll`, `gameSummary`,
    `posIndexChanges` — replaces `posIndexRev` —, `markPosIndexBuilt`,
    `loadPosIndex` now also returns `log`), `js/explore-index.js`
    (`PositionIndex.patch`), `js/app.js` (`Analysis.syncExplore()` only;
    `explore` gained `at`). **Any new code that writes games must still go
    through `gamesWrite()` and should name the game to `touch()`.**
  - **Verified:** `npm.cmd run test:tree` = **45** green (new tests 18–21:
    `patch()` for add / edit / delete, block filling, unchanged or unknown ids,
    and patch-then-full-sync agreeing). `tools/cdp-verify-livesearch.mjs` — ALL
    PASSED at 375px, EN/ES × light/dark, now **51 checks each**, 0 page errors.
    The tool now counts walks (`sync`) and list checks (`patch`) separately.
    Old checks 8, 12, 13 now assert **0 walks**. New (all writes SEEDED through
    `js/db.js`): 14 a write to another base costs nothing; 15 two games
    imported at once → 2 read, 0 walks; 16 a game moved to another base leaves
    this one, and after a restart the other base — whose index was not open
    when it was written — finds it by reading 2 games, 0 walks; 17 a 250-game
    batch → ONE walk that re-reads only the 250, no list kept, and the next
    single game is read alone again; 18 no room (`roomForIndex` FORCED false):
    stored copy dropped, add and delete still found with 0 walks, and after a
    restart with room the base is walked once and stored again; 19 (was 14)
    base deleted → no `log` left either.
  - **NOT tested:** a real full phone (the branch where saving a block fails),
    as before; two tabs of the app open at once (reasoned through: the second
    tab's list would start after the first tab's `at`, so it falls back to the
    walk — not run).

- **LIVE SEARCH: THE POSITION INDEX IS NOW KEPT ON DISK (2026-10-01).**
  Committed on `main`, NOT pushed, NOT deployed. No rules change.
  **IndexedDB schema change: `DB_VER` 4 → 5** (one new empty store, `posIndex`;
  nothing is backfilled, so the upgrade is instant — a real v4 database with a
  game in it was upgraded in place in the preview pane and searched fine).
  `sw.js` v121 → **v122**. This closes the "OPEN DECISION" in the entry below.
  - **What it does:** the index is built once per base and reopened on later
    app starts. Before / after, first search of a base **after an app start**
    (`tools/measure-livesearch.mjs`, real app, headless Chrome, this PC;
    slowdown 4 ≈ a phone):

    | Base | Games | Before x1 / x4 | After (2nd start) x1 / x4 | 2nd start after 1 game was added x1 / x4 | First ever build x1 / x4 | On disk |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` | 27,129 | 20.9 s / 83.7 s | **0.05 s / 0.20 s** | 0.5 s / 1.6 s | 18.3 s / 89.7 s | 15.1 MB, 14 blocks |
    | `2024 - 27 UPDATES.pgn` | 177,139 | 137 s / 677 s | **0.34 s / 1.6 s** | 3.7 s / 11.2 s | 140 s / 680 s | 121.1 MB, 89 blocks |

    On a normal second start the base is NOT read at all (the tool counts it:
    "none — the base was not read"). The first ever build costs the same as
    before; saving it adds under a second.
  - **Adrian's decision (he left the call to me: keep the app's capacity,
    keep it fast, and above all do not bother the user):** the index is ALWAYS
    stored, for every base, with NO question, setting or message. The safety
    valve is silent: `Analysis.roomForIndex()` checks free space before each
    sync, and with under 300 MB free (or if a save fails) the stored copy of
    that base is dropped and the search works in memory exactly as in v121.
    Why not a size cut-off: the index is ~40–60% on top of a base already on
    the phone (browser estimate: 177k base 222 MB + index ~136 MB; Panama
    41.5 MB + ~16 MB), and the big base is where it matters most.
  - **Layout — blocks of 2,000 games** (`BLOCK` in `js/explore-index.js`), not
    a record per game. Measured on the 177k base before choosing: blocks reopen
    in 0.39 s / 1.28 s (x1 / x4) and save in 0.6 s; a record per game reopens in
    2.1 s / 4.1 s and saves in 12.7 s. A block = `{ summaries, counts, hashes }`
    (the games' summaries, and their position lists laid end to end).
  - **`js/explore-index.js`:** `PositionIndex.load(blocks)`; `sync()` takes
    `onBlock(n, block)` — called for each block whose games changed, as soon as
    it is complete (null = block now empty), so a long first build is saved as
    it goes and a build cut short carries on from the saved blocks. An edited
    game stays in its block; a new game fills the last block, then opens a new
    one. Entries gained a `block` number. Tests 14–17 cover this
    (`npm.cmd run test:tree` = **41** green).
  - **`js/db.js`:** store `posIndex`, hand-written keys `[baseId,'block',n]`,
    `[baseId,'rev']`, `[baseId,'built']`. **`gamesWrite()`** — every write to
    the games store (`addGame`, `updateGame`, `deleteGame`, `addGames`,
    `addGamesBatch`, `deleteBase`) now goes through it and bumps that base's
    `rev` counter IN THE SAME TRANSACTION. The stored index is trusted only
    when `built === rev`; otherwise the per-game `updatedAt` check runs as
    before. **Any new code that writes games MUST use `gamesWrite()`**, or a
    stored index will be trusted when it is stale. New: `loadPosIndex`,
    `posIndexRev`, `savePosBlock`, `markPosIndexBuilt`, `clearPosIndex`.
    `deleteBase` deletes the base's index with its games (and no longer loads
    every game's PGN just to delete them). `clearAllLocalData` clears the new
    store. `tx()` now rejects on abort (a full device aborts with no error
    event — it used to hang).
  - **`js/app.js`:** only `Analysis.syncExplore()` changed, plus
    `roomForIndex()` and `stopStoringIndex()`. `Analysis.explore` gained
    `opened` / `noStore`.
  - **Verified:** `tools/cdp-verify-livesearch.mjs` — ALL PASSED at 375px,
    EN/ES × light/dark, now **41 checks each**, 0 page errors. New checks 11–14
    (page really reloaded = a new app start; the delete/edit are SEEDED through
    `js/db.js`): restart → same results with 0 index builds; game deleted +
    restart → gone, noticed by one check that re-read 0 games; game edited →
    found by re-reading 1 game, and still right after another restart with 0
    builds; base deleted → none of its index left, the other base's intact.
    The no-room path was run by hand in the pane (`roomForIndex` forced false):
    stored copy dropped, search still right, stored again once there is room.
    NOT tested: a real full device (the save-fails branch itself).
  - **Not done, follows from this — NOW DONE, see the entry above ("ONE
    CHANGED GAME NO LONGER RE-READS THE BASE"):** with the app open, adding or
    editing ONE game made the next search re-read the base's game list
    (`db.listGameSummaries()` — 0.5 s / 1.5 s Panama, 3.4 s / 10.0 s on the 177k
    base), and so did the first start after any change.

- **LIVE DATABASE SEARCH ON THE ANALYSIS TAB (2026-10-01).** Committed on
  `main`, NOT pushed, NOT deployed. No rules change, no IndexedDB schema
  change. `sw.js` v120 → **v121**.
  - **Adrian's decisions:** the Internet (Lichess) search is NOT live — it
    stays one-shot; there is NO off switch — the search only works while the
    results list is on screen, and the base stays remembered until another is
    picked or the app is closed (leaving the Analysis tab keeps it).
  - **Behaviour:** first 🔎 = as before (Database / Internet, then which base).
    With the results showing, every board change updates the list. 🔎 with the
    MOVES showing = straight back to the results, same base, current position,
    no chooser. 🔎 with the RESULTS showing = the chooser (the base in use is
    ticked ✓). The "Games" switch does the same as 🔎. Status line:
    `📚 <base name> · N games`; over 200 matches draws the first 200 and says so.
  - **New module `js/explore-index.js`** (imports only `vendor/chess.js`,
    precached in `sw.js`). `PositionIndex`: each game is read ONCE and kept as a
    sorted `Float64Array` of 53-bit position hashes (8 bytes a position, no FEN
    text, no PGN). `sync(summaries, getPgn)` re-reads only games that are new
    or whose `updatedAt` changed; `find(fen)` is a binary search per game.
    `fenKey()` now lives here — its definition is GONE from `js/app.js`, which imports it.
  - **`pgnPositions()` — the fast reader.** `parsePgn()` costs 3–4 ms a game
    (measured: `chess.move(san)` writes the SAN of every candidate move).
    `pgnPositions()` matches the SAN by its squares using chess.js internals
    (`_moves`, `_makeMove`, `_undoMove`, `_isKingAttacked`) — ~10x faster. It is
    held to `parsePgn()`'s exact positions by tests 12–13 in
    `tests/unit/explore-index.test.js`. **If `vendor/chess.js` is ever
    upgraded, run `npm.cmd run test:tree` — those tests say whether it still
    holds.** `Analysis.treeHasFen` is GONE.
  - **`db.gamesRev`** (`js/db.js`): a counter bumped by every write to the games
    store. `Analysis.searchLive()` compares it with the index's and re-syncs
    only when they differ — a normal move touches no database at all.
  - **In `js/app.js` (`Analysis`):** state `explore` / `exploreSource` /
    `exploreSeq`; `gamesShowing()`, `exploreLive()`, `searchLive()`,
    `syncExplore()`. The hook is ONE line at the end of `refresh()`.
    `loadTree()` now calls `showMovesTab()` first, so any newly opened game
    (a Masterclass chapter included) starts on its moves with the search parked.
    The remembered base is in `Analysis.explore`, deliberately NOT in `ctx`.
  - **Verified** with `tools/cdp-verify-livesearch.mjs` (headless CDP, 375px,
    EN/ES × light/dark, 33 checks each, all pass, 0 page errors). SEEDED: two
    bases of real games written through `js/db.js`, the game added mid-run, and
    the Masterclass `ctx`. REALLY CLICKED: 🔎, every sheet/chooser button, every
    move on the board, ⏮ ◀ ▶, the result that is opened, the Moves switch.
    Search off / moves showing / Masterclass chapter: the search is called 0
    times (counted). `npm.cmd run test:tree` = 37 green.
  - **Measured** with `tools/measure-livesearch.mjs <url> <file.pgn> [slowdown]`
    (real app, headless Chrome, this PC) on a 2,000-game TEST file of short
    games: first search 0.7 s (was 6.0 s before the fast reader), 3.5 s at a
    4x "phone" slowdown; index 0.6 MB; a move 3 ms; one game added 31 ms.
    That test file flattered it. **Adrian's real bases, measured 2026-10-01**
    (same tool, files under `D:\2. Chess\`, slowdown 1 = this PC, 4 ≈ a phone):

    | Base | Games | First search x1 | First search x4 | Index | A move x1 / x4 | After 1 game added x1 / x4 |
    |---|---|---|---|---|---|---|
    | `Base Panama.pgn` (22 MB) | 27,128 | 20.9 s | 83.7 s | 15.0 MB | 15 ms / 45 ms | 0.6 s / 1.4 s |
    | `Opening Encyclopedia 2024 games.pgn` (65 MB) | 37,328 | 47.0 s | 230 s | 37.3 MB | 9 ms / 45 ms | 1.1 s / 2.5 s |
    | `2024 - 27 UPDATES.pgn` (181 MB) | 177,138 | 137 s | 677 s | 120.5 MB | 20 ms / 100 ms | 3.4 s / 10.2 s |

    What the numbers say: the first search costs 0.8–1.3 ms a game on the PC
    (the Encyclopedia's games are longer: 131 positions a game against 72–89),
    x4 on a phone-like CPU — so EVERY real base is far past the ~10 s line, and
    it is paid again on every app start. The index is 8 bytes a position,
    exactly as designed. Moves stay fast once it is built. Adding ONE game is
    not free on a big base (0.6–10 s): that is `db.listGameSummaries()` re-reading
    the whole base's list, not parsing. Which of the three Adrian keeps in the
    app was not established — he asked for all three.
  - **DECIDED AND BUILT (see the entry above):** the index is stored on disk,
    built once per base, not once per app start.
  - **Not done, on purpose:** a result still opens at the END of the game, as before.
  - **Pre-existing, untouched:** offline, the Internet search shows the raw
    English "⚠️ Failed to fetch" in both languages.

- **MOVE LIST REDESIGN — ONE MOVE PAIR PER ROW + VARIATION COLOUR
  (2026-10-01).** Committed on `main`, NOT pushed, NOT deployed. No rules
  change, nothing to deploy but the push itself. `sw.js` v119 → **v120**.
  - **Adrian's decisions:** ALL THREE lists get the layout (Analysis, Play,
    Opening) — not Analysis only; the colour SYNCS between devices; comments
    always on their own line; nested variations each on their own indented line.
  - **New module `js/movelist.js`** (imports only `js/tree.js`, precached in
    `sw.js`). `moveListItems(tree)` decides what shares a row — pure, no DOM,
    covered by `tests/unit/movelist.test.js` (9 tests, `npm.cmd run test:tree`
    = 24 green). `renderMoveList(el, tree, current)` draws it.
    `Analysis.renderLine`, `numberedHistory` and `nagMoveClass` are GONE from
    `js/app.js` — do not look for them. Play and Opening pass
    `treeFromHistory(...)` to the same renderer.
  - **Markup:** main line = `div.mv-row` (grid: `.mv-num`, White `.mv`, Black
    `.mv`); a row cut by a comment or variation shows White alone and Black
    continues as `12…` in the Black column. Variation = `div.variation.dN`
    with a left bar; inside it each "number + White + Black" is one
    `span.mv-unit` with `white-space: nowrap`, "(" inside the first unit and
    ")" inside the last — that is the whole fix for lines ending on "(" or a
    lone White move. Comment = `div.mv-comment`. Every `.mv` and comment still
    carries `data-node`, so the click handler, long-press menu and the
    own-`scrollTop` keep-in-view code are untouched.
  - **One honest exception:** a variation whose LAST move is White's, or a
    White move directly followed by a comment / sub-variation, ends its line on
    a White move. Unavoidable; the checker counts these separately.
  - **Setting:** Settings → "Variation color" / "Color de las variantes"
    (Grey / Blue / Gold). `Themes.setVariationColor` in `js/appearance.js`,
    kv key `variationColor`, body class `varcol-*`, CSS var `--var-col`. Added
    to `SYNCED_KEYS` in `js/firebase.js`; like board colour, a value pulled from
    another device shows on the next app start. Measured contrast on the list
    background, light / dark: grey 4.83 / 8.73, blue 5.85 / 7.05, gold 5.54 /
    9.87 (light-mode gold is a darker `#8a6100`; the normal gold fails on
    white). Comments were ~2:1 in light mode — now `#2f6b2f`, 6.43.
  - **Verified** with `tools/cdp-verify-movelist.mjs` (headless CDP, 375px,
    EN/ES × light/dark, plus the nested game at 320–430px): character-by-
    character measurement, zero lines ending on "(", a symbol, or a White move
    with a reply; no sideways scroll; and a control run with the glue removed
    that the checker correctly fails. REAL mouse events: tap a main-line move,
    tap a move 3 levels deep, tap a comment, long-press menu, ▶ ×150 / ◀ ×60
    (current move never left the list, page never scrolled), the Settings
    buttons + reload, a Play game vs Stockfish, Opening-trainer moves.
    SEEDED: the games loaded into Analysis, the Masterclass chapter (handed to
    `Masterclass.openChapter`; Firestore unreachable), the one-game opening
    database. NOT tested: the colour arriving from a second signed-in device,
    and a live broadcast.

- **STUDENTS STAGE 6 — FINISHED-HOMEWORK NOTICE + PER-PUZZLE RESULTS
  (2026-09-30).** Committed on `main`, NOT pushed, NOT deployed. **Adrian
  must run `npm.cmd run rules:deploy` AND `npm.cmd run indexes:deploy`
  BEFORE `git push`** (new rule field + one new index). `sw.js` v118 →
  **v119**. A stage on top of the "complete" plan; still no push, no Cloud
  Functions, no email (Blaze stays off).
  - **Adrian's decisions:** a WRONG puzzle does NOT count toward `done` (only
    first-try solves, as before) — it only shows in the results. The teacher
    check runs at app open AND on returning to the app after 15+ minutes.
  - **(A) Notice.** `Students.checkFinished()` → `fetchFinishedHomework(since)`
    = ONE query `teacherUid == me, completedAt > since, orderBy completedAt,
    limit 20` (index `homework (teacherUid, completedAt)` in
    `firestore.indexes.json`; only finished homework has `completedAt`, so no
    status filter). **Cost: 0 reads with no accepted student** (decided from
    the cached roster, `hasStudents()`), **1 read when nothing is new, 1 per
    finished homework otherwise.** Runs from `onAuth` (boot), `visibilitychange`
    → visible, `online`, throttled to 15 min (`FIN_CHECK_MS`), and forced by
    `load()` (opening Students). First check on a phone looks back 14 days.
    `finSeenAt` = newest `completedAt` ms + 1 (from `doneMs`, taken off the
    Timestamp before caching). Results go into `hwGiven`, so the sheet opens
    with no further read. `finNew` (in `studentsCache`) feeds the gold dot
    (unseen lines) and the "🔔 Finished homework" strip `#stu-fin` on top of
    Students (all four kinds). A line opens the results sheet and leaves the
    strip; "Clear" drops all; both also settle that student's roster "new"
    chip (`doneSeen`). Limit: a phone with no cached roster lights only after
    its first Students visit.
  - **(B) Results.** New field `results` on `homework`: one string per
    ATTEMPT, `<packed puzzle>|<1 first try / 0 not>|<seconds>`
    (`packResult` / `unpackResult` in `js/firebase.js`) — the whole puzzle, so
    the teacher's phone needs no rating band. Kinds `puzzles` and `list`.
    Written by `Students.hwResult(puzzle, ok)`, called from **`Puzzles.log()`**
    (the one place every ending passes: solved, solved after a mistake/hint,
    solution shown, left after a wrong move; `exitHomework` now logs a failed
    unlogged puzzle too). A puzzle skipped untouched is not an attempt. In the
    solve branch `hwSolved` moved to AFTER `log()` so the finishing save
    carries the last result. Seconds are the run's practising seconds on that
    puzzle (`run.pzSec`, same `Activity.current()` rule as the total), not the
    wall clock. A list puzzle that comes back appears twice (✗ then ✓).
    Bundled with the existing saves (`addResults` → `arrayUnion`; also every 5
    results). Caps `MAX_HW_RESULTS` 300 / `MAX_HW_RESULTS_CHARS` 120,000 —
    past them detail stops, the count goes on. **If a save with results is
    refused, `saveHomeworkProgress` retries once without them** (cap filled by
    a second phone, or stage 6 rules not deployed yet): the count is never
    lost for the sake of the detail.
  - **Rules:** `results` joins the student's allowed diff. `hwResultsOk`:
    kinds puzzles/list only, list of 1–300, the OLD list must be a PREFIX of
    the new one (no drop, no reorder — auditor finding, fixed; an empty range
    errors in rules, hence the `size() == 0` arm), and **the list is JOINED
    with ';' and matched ONCE** against `(entry;)*entry` — a handful of
    expressions for any length, so 300 fit the 1,000-expression limit; joined
    size ≤ 120,000 bounds the document far under 1 MB. Create still refuses
    the field. **Emulator-proven only**: production's regex engine has not
    seen a 100 KB match yet — the retry above is the safety net.
  - **Tests:** `tests/rules/homework.test.js` 57 → 68; **313/313** total;
    `test:tree` 15/15. Auditor 5/5 after the prefix fix.
  - **Teacher view:** `Students.resultsSheet(h, p)` — "Results" button on
    every puzzles/list row of the student page, and from the strip. Totals
    (first try, missed, accuracy, average time), every attempt in order with
    ✓/✗, rating, two themes, time; a line opens the position in
    `PuzzleLog.show()` (the log's replay, split out of `review()`;
    `PuzzleLog` is now exported). Old homework → "No detail recorded";
    text/chapter → "no puzzles to show".
  - **Verified** (`tools/stu6-seed.js` + `tools/cdp-verify-students6.mjs`,
    headless CDP, 375px, EN/ES × light/dark, 0 console errors): **REALLY
    PLAYED** through `Puzzles.userMove`: a 3-puzzle homework — right, wrong +
    skipped, wrong + then solved, right, right → done 3/3, status done,
    results ✓ ✗ ✗ ✓ ✓ with 3–6 s each, total 28 s; a 3-puzzle list — #1 wrong
    and left, #2 ✓, #3 ✓, #1 came back ✓ → 4 results; the teacher sheet drawn
    from those played results (60 %, rows, position opens); the strip line →
    sheet → line gone; Clear → strip hidden, dot off; `checkFinished` did not
    run with no students, ran with one, and the second call was throttled;
    offline boot serves v119 and the sheet + position open offline.
    **SEEDED:** every Firestore-backed thing — the links, the homework, the
    two strip lines, the 14-attempt results in the screenshots, the old
    homework without results. The played results reached the teacher sheet
    inside one page, not through Firestore. The query itself is covered by
    the rules test only. **No two-account flow ran live** (App Check), and
    the seed stubs `Students.load` (it would wipe the seed on screen entry).

- **STUDENTS STAGE 5 — HOMEWORK PART 2: CHAPTERS + PUZZLE LISTS
  (2026-09-30).** Committed on `main`, NOT pushed. **RULES CHANGED: Adrian
  must run `npm.cmd run rules:deploy` BEFORE `git push`.** Stage 4's rules
  were never deployed either (Adrian confirmed) — this ONE deploy covers
  stages 4 and 5. `sw.js` v116 → **v117**. **The Students plan is complete**
  (stage 5 was its last stage; `list` was NOT split off).
  - **Rules** (`homework` block): kinds now `puzzles|text|chapter|list`.
    `chapter` params exactly `{mcId, chapterId}`, both `[A-Za-z0-9_-]{1,128}`
    (auditor: a `/` would re-aim the lookup), and `hwChapterOk` requires the
    class to be OWNED by the teacher and the chapter to exist (2 reads, chapter
    kind only). `list` = `{puzzles: 1–20 PACKED STRINGS}`
    `id|fen|uci uci…|rating|theme theme…`, one regex per puzzle (`hwPzOk`).
    **Why strings, not maps:** measured in the emulator, every field read of a
    list element costs ~12 of the 1,000 expressions a write may evaluate; a
    map with its 5 fields checked failed at FIVE puzzles. The regex is 2 reads
    and stricter (every move UCI, every theme a word). All 30,000 library
    puzzles pack. Target: chapter 1, list = `puzzles.size()`. Update diff adds
    `doneIds`: list only, `hwDoneIdsOk` (≤ 20 short strings), ≤ list length,
    only grows (`hasAll(old)`), keyed on the DIFF so `deleteField()` cannot
    shrink it (auditor). Deliberately NOT tied to `done` (two phones).
  - **Tests:** `tests/rules/homework.test.js` 38 → 57; **302/302** total.
    Includes 20 of the LONGEST legal puzzles fitting the expression budget.
    Auditor: 4/5 → both findings fixed and tested.
  - **`js/firebase.js`:** `MAX_LIST_PUZZLES` (20), `packPuzzle` /
    `unpackPuzzle` (same regex as the rule), `ensureViewer(mcId, uid,
    memberCount)` → 'member' | 'added' | 'full' | 'failed' (1 read; adds as
    viewer + bumps memberCount; refuses at MAX_MEMBERS 30 instead of going to
    31), `saveHomeworkProgress(…, addIds)` → `arrayUnion`.
  - **Chapter:** assign sheet tab "📖 Chapter" = my OWNED classes → chapters
    (`<select>`s; reuses `Masterclass.chapters` when that class is open, else
    `fetchChapters`). Sending calls `ensureViewer` first. Student card "Open"
    → `Masterclass.openForHomework(mcId, chapterId)` ('ok'|'gone'|'failed'),
    which opens the class, then the chapter, and **rewinds to the start**
    (`Analysis.loadTree` lands on the END — a naive hook counted on open).
    The run is armed only after that. `Masterclass.onBoardChange` (the
    `Analysis.refresh` choke point) calls `Students.hwChapterStep`, which
    finishes it at the last move of the MAIN line (`atMainLineEnd`: no
    children and every node is `children[0]`; a variation's end does not
    count). 'gone' → `hwGone` → card says "This chapter is no longer
    available" + Mark done (rules allow it: target 1, no class lookup).
  - **List (Adrian's choice: collect, then send):** PuzzleLog review shows
    "🎯 Give to a student" when I have an active student →
    `Students.addToDraft(p)` (student sheet if > 1). Duplicates and > 20 are
    refused, and nothing is written. The draft is `hwDraft` in `studentsCache`
    (this phone only). The student page shows "🎯 Send puzzle list (n)"; the
    sheet's "🎯 List" tab lists the draft with Remove. Sending clears it.
    Runner = Puzzles homework mode with `hw.list` + `hw.doneIds`: `pool()` is
    the list, `hwMatches` is by id and not yet done, and `nextPuzzle` takes the
    next unsolved one in the teacher's order (wrapping, so a missed first try
    comes back). The same first-try hook → `hwSolved` also records the id.
  - **Also fixed:** `Puzzles.ensureLoaded()` now shares one in-flight load
    (`loading` / `loadOnce`). `showScreen('puzzles')` and `startHomework`
    both started a load, which ran two `nextPuzzle()`s and made a list skip
    its first puzzle.
  - `hwBegin`/`hwEnd`/`hwOnTask` generalise the run (puzzles, list and
    chapter). Seconds count while on the task and `Activity.current()` is set.
  - **Verified:** `test:rules` 302/302, `test:tree` 15/15. Headless CDP
    (`tools/stu5-seed.js` + `tools/cdp-verify-students5.mjs`), 375px, EN/ES ×
    light/dark: the student's chapter/list/gone cards, the teacher page +
    Send list, the assign sheet's Chapter and List tabs, and the list runner
    bar. **REAL:** a list puzzle solved through `Puzzles.userMove` → 1/3 +
    doneIds; the next puzzle is list #2; Give to a student from the log review
    → draft 2→3, again → "already in their list"; the chapter stepped with
    Analysis's own ▶/⏮/⏭ buttons: open → not counted, ▶ → not counted, a
    variation's end → not counted, main-line end → done + toast + run cleared;
    both sheet specs read from their promises. **SEEDED:** all
    Firestore-backed state (homework, classes, chapters, draft). The open step
    ran `openForHomework`, which honestly returned 'failed' with no Firebase
    user, and then its post-network half was replayed. No two-account flow ran
    live (App Check). 0 console errors; offline boot serves v117.

- **STUDENTS STAGE 4 — HOMEWORK PART 1 (2026-09-30).** Committed on `main`,
  NOT pushed. **RULES CHANGED: Adrian must run `npm.cmd run rules:deploy`
  BEFORE `git push`** — without the homework rules every assign/save is
  refused. `sw.js` v115 → **v116**.
  - **Rules** (`firestore.rules`, end of the Students block): `homework/{id}`.
    Create = teacher only, `get(coaching/{me}_{student}).status == 'active'`,
    kinds `puzzles` {themes ≤ 5 strings ≤ 40, minRating ≤ maxRating in
    0–4000, count int 1–100} and `text` {} ONLY (`chapter`/`list` refused
    until stage 5 adds their clauses), title 1–80, note ≤ 500, dueDate
    `YYYY-MM-DD`, starts open/0/0, `createdAt == request.time`. Update =
    student only, `diff().affectedKeys()` ⊆ done/seconds/status/completedAt,
    counters only go up (the app sends `increment()`, so two phones add up),
    done ≤ target, seconds ≤ 360000, 'done' only when the target is reached
    exactly and never reopened, `completedAt == request.time` exactly once.
    Delete = teacher always; student only when the link is not active
    (`existsAfter`/`getAfter`, so End deletes link + homework in ONE batch).
    Read = `.get('teacherUid'|'studentUid','') == me`.
  - **Tests:** new `tests/rules/homework.test.js` (38). **283/283** total.
    `firebase-security-rules-auditor` scored 4/5: fixed its finding (a text
    task could be 'done' with done 0 → `hwTargetReached`); the other finding
    (no rule can cap homework count per student) is the plan's advisory cap.
  - **`js/firebase.js`:** `MAX_OPEN_HOMEWORK` (10, advisory), `HW_COUNTS_KEY`
    ('hwCounts' kv → the summary's `hwOpen`/`hwDone`, totals across ALL the
    student's teachers — one summary doc), `assignHomework`,
    `fetchHomeworkFor(studentUid)`, `fetchMyHomework`, `deleteHomework`,
    `saveHomeworkProgress(id, {addDone, addSeconds, finish})`.
    `removeStudent` and `endCoaching` now delete that pair's homework in the
    same batch; `blockUser` deletes it both ways; `deleteAccount` deletes
    homework given/received after the links.
  - **Start = "homework mode" on Puzzles (Adrian's choice).**
    `Puzzles.homework` sits on top of `themeFilter`/`difficulty` and never
    writes them: `pool()` = rating band + any of the themes, `nextPuzzle` aims
    at the player's level clamped into the band, `startHomework` loads every
    band the homework spans. Gold bar `#puzzle-hw` (title, n/count, progress,
    Exit) replaces the theme button while it runs. `Puzzles` is now exported.
  - **Counting hook** (plan 3.2): the first-try branch in `Puzzles.userMove`
    (right after `db.kvSet('puzzlesSolved', …)`) calls
    `Students.hwSolved(id)` only in homework mode and only if `hwMatches`.
    Seconds: a 1 s timer while a homework runs counts when Puzzles is on
    screen in homework mode AND `Activity.current() === 'puzzles'`.
    **Bundled saves:** every 5 puzzles, on leaving Puzzles, app hidden /
    pagehide, Exit, completion. Completion → status done, toast, mode exits,
    `hwCounts` + summary publish.
  - **Students screen:** "Homework" section (student) with open cards
    (Start / Continue, or Mark done + an honest "nobody checks it" confirm for
    text) and "Done (n)" folded. Roster card: "📘 Homework: x open · y done"
    + a gold "new" chip when hwDone rose since I last opened that page.
    Student page (teacher): Homework list with progress + time + Delete, and
    ➕ Assign → the assign sheet (Puzzles/Task, count, band defaulted from
    their rating, theme chips weakest-first with their rating, max 5, title
    auto-filled if empty, note, due date). Last list per student cached
    (`hwGiven` in `studentsCache`) so offline shows it.
  - **Gold dot** now also: open homework I haven't seen (cleared when the
    Students screen shows it), and (teacher) a student's hwDone rose — the
    teacher part only lights from cached summaries (teachers still cost 0
    reads at boot). Consent list no longer says "coming soon".
  - **Cost:** a student with a teacher = +1 query at app open (≈1 read per
    homework); a teacher pays only when opening a student page.
  - **Verified:** `npm.cmd run test:rules` 283/283. **Counting hook REAL** in
    the browser pane: a seeded homework (Fork, 1200–1500, count 3; no Firebase
    user so nothing was written), Start → Puzzles in homework mode, 3 matching
    puzzles solved through `Puzzles.userMove` (the board's own onMove path):
    1/3, 2/3, a wrong-first-move puzzle did NOT count, 3/3 finished → mode off,
    bar hidden, theme button back, themeFilter 'random' + difficulty 0
    untouched, 27 s counted, `hwCounts` {open 0, done 1},
    `previewStudentReport()` carried hwOpen 0 / hwDone 1. **Screens SEEDED**
    (`tools/stu4-seed.js` + `tools/cdp-verify-students4.mjs`, headless CDP
    375px, EN/ES × light/dark): homework cards, done list, roster line + new
    chip, teacher list on the student page, assign sheet (puzzles + task),
    Puzzles bar. `<img onerror>` / `<script>` names and notes render as text.
    The assign sheet's output was read from its promise (count 12, 2 themes,
    due date → correct spec; min > max refused). 0 console errors; offline
    boot via CDP serves v116. **No two-account flow ran live** (App Check).
  - **Stage 5 next:** `chapter` + `list` kinds.

- **STUDENTS STAGE 3 — ACTIVE TIME + THE STUDENT PAGE (2026-09-29).**
  Committed on `main`, NOT pushed (`git push` deploys the site). No rules
  change (stage 1 already allowed `activeTime`); stage 1 rules still need
  `npm.cmd run rules:deploy` if not done. `sw.js` v114 → **v115**,
  `js/activity.js` added to `ASSETS`.
  - **New `js/activity.js`** (`Activity`, `AREAS`, `sumActive`, `dayStr`,
    `daysAgo`, `IDLE_MS`): 1 s tick; a second counts only when visible AND
    pointer/key input in the last 120 s AND the screen maps to an area
    (puzzles/rush/blind → puzzles, endgame → endgames, trainer → openings,
    masterclass, analysis/base → analysis, play, read → reading; setup,
    profile, friends, leaderboards, students count nothing). kv `activeTime`
    = `{localDate: {area: seconds}}`, flushed at most once a minute + on
    `visibilitychange: hidden` / `pagehide`, pruned to 60 days. NOT in
    `SYNCED_KEYS`. On an account switch (sign-out wipes kv) the in-memory copy
    is reloaded so old minutes are not written back. Started from `app.js`
    boot: `Activity.init(() => activeScreen)` — activity.js imports nothing
    from app.js.
  - **`Students.tick()`** now samples `Activity.current()` — the stage 2
    `lastInput` listeners and `IDLE_MS` are gone (one idle detector).
    `publish()` and `accept()` call `Activity.flush(true)` first.
  - **Summary:** `buildStudentReport()` (`js/firebase.js`) now sends
    `activeTime`, last 30 days (≤ 30 keys; rules allow 31), whole seconds,
    shape-checked. New export `previewStudentReport()` = the same summary
    built locally, nothing written.
  - **`openEloHistoryModal(hist, titleKey, { share = true })`** in `js/app.js`
    is now exported and takes the history ARRAY; the four Profile callers pass
    `await db.kvGet(key, [])`. Students pass the summary's history with
    `share: false` (the share card says "my record").
  - **Roster card:** "⏱ X of practice this week" line; the whole card is
    tappable (role=button, Enter works) when a summary exists; ⋯ → Remove
    still works (stopPropagation).
  - **Student page** (`Students.openPage`, a modal): name + "updated X ago";
    4 rating tiles, each opens the chart; streak/best/solved/attempts; practice
    time: 7-day and 30-day totals, 14 bars of minutes per day (HTML/CSS, gold,
    student's own dates), 30-day area rows; puzzle themes weakest first, 8 then
    "Show all (n)" — **only themes the app names** (`theme_*` i18n exists):
    `puzzleThemeElo` also rates meta-tags like `endgame`/`short`/`crushing`,
    which were showing as raw keys; Remove student + Close. At 375px it is
    ~1.6 screens of one scroll, charts live behind the tiles (the Profile
    pattern), so no layout decision was needed.
  - **Student's own side:** a gold-outlined row at the top of "My teachers"
    (only with an ACTIVE teacher): "Your practice: X this week — Tap to see
    what your teachers see" → the same page built by `previewStudentReport()`
    with "This is exactly what your teachers see", no Remove. Consent list
    line for minutes no longer says "coming soon" (homework still does).
  - **Verified:** `npm.cmd run test:rules` 245/245. **Activity counting was
    REAL** in the browser pane (Puzzles): a real key press → counted 10 s in
    10 s, kv flushed once then throttled; no input → stopped at exactly 120 s
    after the last input (memory 120, kv 62 from the 1-minute flush). **Hiding
    was SIMULATED** (the pane keeps background tabs 'visible'; overrode
    `visibilityState` + fired the event): kv got the unflushed seconds, counting
    stopped. Profile with input counted nothing; Endgame counted `endgames`.
    `previewStudentReport()` trimmed a 45-day-old day and a junk key.
    **Screens were SEEDED** (`tools/cdp-verify-students3.mjs` + a seed body:
    `Students.load()` first, THEN `Object.assign(Students, …)` + `render()`,
    or load() wipes the seed with empty lists) and shot in headless CDP at
    375px, EN/ES × light/dark: roster with minutes, student page top/bottom,
    Show all, chart from the student's history (no Share), own view.
    `<img onerror>` name renders as text. Profile chart still opens from kv
    (with Share). Offline boot via CDP: SW v115 serves, `Activity.loaded`,
    0 console errors.
  - **Stage 4 next:** homework rules + tests, `puzzles`/`text` kinds.

- **STUDENTS STAGE 2 — THE STUDENTS SCREEN (2026-09-29).** Committed on
  `main`, NOT pushed (`git push` deploys the site). **Stage 1 rules must be
  deployed first** (`npm.cmd run rules:deploy`) or every action on the screen
  is refused. No rules change this stage. `sw.js` v113 → **v114**.
  - **New `js/students.js`** (`Students`): 9th drawer entry
    `data-screen="students"` after Read (`SCREENS`, `MENU_AREA`, `TAB_ORDER`
    pick it up); `#screen-students` in `index.html`. Sections: **My teachers**
    (only when I have a link as student: pending invite card with the full
    consent list — 6 items incl. minutes/homework marked "coming soon" + a
    "Never: …" line + "you can end it any time" — Accept/Decline; active →
    End; declined → Clear) and **My students** (always: `n/30` cap counter,
    ➕ Invite (friends picker, Masterclass-picker shape, chips for
    student/invited/declined), 🎓 My Masterclasses → Bases tab, roster cards
    with 4 ratings + puzzle ▲/▼ 7-day change from `puzzleEloHistory` + streak /
    solved / "updated X ago", ⋯ → Remove student; pending → Withdraw; declined →
    note only, rules refuse the teacher deleting it). Every destructive action
    and Decline go through `askConfirm`, names escaped. Signed out: one line +
    sign-in button (`openAuthModal` is now exported from `js/app.js`).
  - **Consent list fit at 375px** (≈290 px tall), so nothing was cut and no
    decision was needed.
  - **Invites** always toast "Invitation sent ✓", whatever `inviteStudent`
    throws (not friends / blocked). Accept only via `acceptTeacher` (the one
    batch); `max-teachers` → readable toast.
  - **Publishing:** accept (the batch), app open when the cached lists say I
    have an active teacher (fetches my teacher links once and passes them to
    `publishStudentReport(links)` — new optional param, saves a query), then
    every 15 min of practice (30 s tick; counts only while visible AND touched
    in the last 2 min; area-blind until stage 3's `js/activity.js`).
  - **Cost deviation from the plan, on purpose:** a user with NO links is
    still asked for a pending invite once per **6 hours** (1 read when empty),
    so the gold dot can appear without opening the screen. The plan's "0 extra
    reads" would mean an invite is invisible until the student happens to open
    Students. Teachers cost nothing at boot; the roster loads on open.
  - **Gold dot** (`.has-dot`) on the drawer entry AND on ☰ when an invite waits
    for my answer. Homework dots are stage 4.
  - **Offline:** cached lists (kv key `studentsCache`, keyed to the uid; also
    the has-teacher/has-students flag) with "Offline — showing saved data";
    every action is refused with a toast instead of being queued. Sign-out
    already wipes the whole kv store (`db.clearSyncedProfileData`), and
    `Students.onAuth` resets memory + the dot.
  - **`blockUser()`** now quietly deletes `coaching/{me}_{them}` and
    `coaching/{them}_{me}` (a declined link where I'm teacher stays — rules),
    then `publishStudentReport()` to prune the summary.
  - Limits sheet: "Students per teacher 30", "Teachers per student 3",
    imported `MAX_STUDENTS`/`MAX_TEACHERS`. EN + ES strings (`stu_*`,
    `tab_students`, `cap_students`, `cap_teachers`).
  - **Verified:** `npm.cmd run test:rules` 245/245. Browser pane 375px, light
    AND dark, EN AND ES. **Signed-out line, drawer, Limits rows, offline boot
    = real. Everything signed-in was SEEDED** (`Object.assign(Students, …)` +
    `render()` via `import('/js/students.js')`): pending/active/declined on
    both sides, a `<img onerror>` name (renders as text, also in the confirm),
    the picker, Withdraw/Remove confirms, offline banner + refused Accept, the
    kv cache round-trip. The Invite toast was exercised with no Firebase user,
    so no write happened. **No two-account flow has run live** — localhost
    cannot reach Firestore (App Check); the writes are proven by the stage 1
    emulator tests. Offline boot via headless CDP: SW v114 serves the app,
    only the expected App Check network error.
  - **Stage 3 next:** `js/activity.js`, minutes on the card, student page.

- **STUDENTS STAGE 1 — CONSENT RULES + DATA LAYER, NO UI (2026-09-29).**
  Committed on `main`, NOT pushed, **rules NOT deployed** — Adrian runs
  `npm.cmd run rules:deploy` (harmless without UI). No `sw.js` bump (no new
  file, nothing visible). Changed `firestore.rules` (new "Students" block),
  `js/firebase.js`, new `tests/rules/students.test.js`.
  - **Rules.** `coaching/{teacherUid}_{studentUid}`: read via
    `.get('teacherUid','')`/`.get('studentUid','')` (list-query trap); create =
    teacher only, `pending`, directional id, friends only
    (`friendPairWith()` computes the sorted pair), silent block check,
    `createdAt == request.time`; update = student only, pending → active |
    declined once, diff limited to `status`+`respondedAt`; delete = student any
    status, teacher only pending/active (never declined).
    `studentReports/{studentUid}`: read = student or `me() in
    .get('teachers',[])`; write = student only, field allowlist (no
    name/DOB/email), `teachers` ≤ 3, no duplicates, each checked by
    `linkActiveAfter()` (**getAfter**, so accept = one batch works), bounds on
    ratings/strings/histories (≤120)/counters, `activeTime` ≤ 31 keys and
    `puzzleThemeElo` ≤ 200 keys (auditor finding, fixed), `hwOpen`/`hwDone`
    0–1000 already allowed for stages 3/4. Emulator quirk: `getAfter()` on a
    missing doc ERRORS (denies) rather than returning null.
  - **Data layer (`js/firebase.js`, nothing calls it yet):** `MAX_STUDENTS`
    30 (advisory), `MAX_TEACHERS` 3 (rules-enforced), `inviteStudent`,
    `withdrawInvite` (= `removeStudent`), `removeStudent`,
    `fetchMyStudentLinks`, `fetchMyTeacherLinks`, `acceptTeacher` (one batch;
    throws `code: 'max-teachers'`), `declineTeacher`, `endCoaching` (one batch:
    delete link + prune/delete summary), `publishStudentReport` (rebuilds
    teachers from ACTIVE links, deletes the summary when none), 
    `fetchStudentReports` (one array-contains query). Internal helpers
    `buildStudentReport` (last 120 history entries, `puzzlesSolvedCount` only),
    `activeTeacherUids`. `Auth.deleteAccount()` now also deletes
    `studentReports/{me}` and every coaching link (declined links where I am
    teacher are refused by design and skipped with a warning).
  - **Verified:** `npm.cmd run test:rules` 245/245 pass (students 71, all
    other suites unchanged). App boots online and offline (SW) with no
    `js/firebase.js` errors. **The data-layer functions are proven by the
    emulator tests of the writes they make, not live** — localhost cannot
    reach Firestore (App Check). No screenshots: nothing visible changed.
  - **Owed to stage 2:** `blockUser()` must also end coaching links (plan 3.5;
    the rules do not), sign-out clears the local "has teacher/students" flag.

- **STUDENTS TAB — PLAN ONLY, NOTHING BUILT (2026-09-29).** Staged plan at
  `docs/plans/2026-09-29-students.md`; no feature code, no rules change, no
  `sw.js` bump. Decided with Adrian: a NEW directional link
  `coaching/{teacherUid}_{studentUid}` (pending → active/declined, invite
  friends only, block-silent), a student-written summary
  `studentReports/{studentUid}` readable only by the ≤ 3 teachers listed in it
  (rules check each has an ACTIVE link via `getAfter()`), and `homework/{id}`
  (4 kinds) in stage 4. Masterclass is reused for chapters and the live board, not
  duplicated. Masterclass covers about a third of the ask, not 80%: it has no
  consent step (owners add friends without a yes), no progress view and no
  homework. 9th drawer entry `data-screen="students"` after `read`. Caps 30
  students (advisory) / 3 teachers (rules-enforced). Active-time tracking is
  new (`js/activity.js`, local key `activeTime`, deliberately NOT in
  `SYNCED_KEYS`); the app stored no time before. Free-tier cost ≈ 40 reads per
  teacher open with 20 students; 0 extra for users without teachers/students.
  No push (Spark plan): students see homework on next open. **Next: stage 1**
  (consent rules + tests + `js/firebase.js` data layer, no UI).

- **"OPEN WITH" STILL FAILED ON ADRIAN'S PHONE — CAUSE: BRAVE IS HIS DEFAULT
  BROWSER (2026-09-30).** `sw.js` v117 → **v118**. Web side committed on
  `main` (NOT pushed). No Android change yet.
  - **Facts from Adrian:** Play shows 1.0.5 (code 7) live; phone App info says
    1.0.5; files come from **WhatsApp**; one CTC entry in the lists; Share →
    CTC opens the app and shows a failure toast (so the share-target POST DID
    reach the service worker and redirect to `?shared=1`, but no file was
    stashed); **default browser = Brave**.
  - **Why it passes on the emulator and fails on the phone:** the helper
    (`androidbrowserhelper` 2.6.2) runs the TWA in the *default* browser when
    it supports TWAs. Emulator = Chrome 150 → works cold AND warm (re-tested
    today through the Files app UI: PDF → Read, PGN → base "OpenWithLines";
    Chrome gets the share as `START_DELIVERED_TO_TOP`). Phone = Brave → the
    share arrives without its file. The AAB was checked: the
    LauncherActivity patch and the octet-stream filter ARE in the uploaded
    build, so it is not a stale build.
  - **Not yet confirmed on the phone.** The test: set Chrome as default
    browser, force-stop CTC, share/open a PDF from WhatsApp. Works → Brave
    confirmed; the fix is to pin the TWA provider to Chrome in
    `LauncherActivity` (override `createTwaLauncher()`, pass
    `com.android.chrome` when installed) → 1.0.6 / code 8, same keystore.
    **Caveat:** in Brave the app's local storage (IndexedDB, un-synced
    progress, sign-in) lives in Brave's profile; pinning to Chrome starts
    from Chrome's profile — decide with Adrian first.
  - **Web hardening (done):** `handleIncomingFiles()` `?open-file=1` no
    longer jumps to Read. It stays where boot lands (Analysis), shows
    `share_receiving`, and after 2.5 s with no file shows `share_open_failed`
    for 6 s. `routeIncomingFile` still picks the screen when a file arrives.
  - **Verified:** `node tools/cdp-verify-share.mjs http://localhost:9182`
    (new dev tool; fixture `tools/fixtures/TestBook.pdf`) — headless Chrome
    375px, EN/ES × light/dark: open-file with no file (no Read trap, toasts),
    shared PDF → Read, PGN → base, octet-stream PGN → base, junk →
    `share_unsupported`, offline boot, no console errors: **34/34 PASS**.
    Emulator (Chrome) Open-with warm: PDF + PGN OK. **Nothing verified in
    Brave** (the emulator has no Google account for the Play Store).
  - **UPDATE same day — BRAVE THEORY DISPROVED.** Adrian set Chrome as
    default, force-stopped CTC, opened from WhatsApp: **still fails in
    Chrome too.** He also declined pinning to Chrome (keep Brave). So do NOT
    implement the `createTwaLauncher()` Chrome pin. Remaining difference
    between emulator (works) and phone (fails): the file *source* — emulator
    tests used the Files app, the phone uses WhatsApp (its own FileProvider
    URIs + grants), plus phone vendor/Android version. Toast = the POST
    reached the SW with no file → Chrome most likely could not read the
    content:// URI (grant not passed on) or dropped it. Next step: real
    phone over USB, `adb logcat` while sharing from WhatsApp; also compare
    sharing the same PDF from the phone's Files app.
  - **ROOT CAUSE FOUND (same day): `assetlinks.json` LACKED THE PLAY APP
    SIGNING KEY.** Sharing from Samsung "My Files" failed too (not
    WhatsApp), and Adrian confirmed CTC on the phone shows a **web address
    bar** = the TWA is NOT verified. `.well-known/assetlinks.json` listed
    only the upload key (`4D:50:F8…`, the local keystore — what the
    emulator build is signed with, hence "works on emulator"). Play re-signs
    the store build with Google's app signing key
    (`AC:D4:2E:68:11:44:E2:B2:9A:B8:8D:42:FF:7A:6A:30:75:3B:6A:87:76:63:0C:E5:DC:97:95:79:1E:ED:53:FC`,
    from Play Console → App integrity → Play app signing). An unverified
    TWA is a plain Custom Tab, so the browser drops the shared file.
    **Fix: both fingerprints now in `assetlinks.json`** (web-only, no new
    AAB, stays 1.0.5 / code 7). Keep BOTH — the upload key is needed for
    emulator/sideloaded builds. Verified: live file returns both
    fingerprints. **NOT yet verified on the phone** — Adrian must
    force-stop CTC (and maybe clear the browser's cache / wait: browsers
    cache the asset-links check) and confirm the address bar is gone and
    Share / Open with works. The address bar must have been there on every
    Play install since launch.
  - **CORRECTION (same day): the `AC:D4…` fingerprint was the
    POST-QUANTUM app signing key.** Play Console now shows two app signing
    keys; phones verify against the **classical** one:
    `CD:C1:9C:AD:D3:64:0C:7F:47:0B:C6:B5:E3:9B:A4:03:F3:84:86:BF:77:10:AF:10:BC:5B:B9:9E:9D:3C:FD:D0`.
    `assetlinks.json` now lists all three (upload `4D:50…`, classical
    `CD:C1…`, post-quantum `AC:D4…`). Phone confirmation still pending.
  - **SECOND CORRECTION (same day): address bar still there with those
    three.** The current app signing key shows "Install base 0.0%"; the
    Play page's own **Digital Asset Links JSON** box gives a FOURTH
    fingerprint — the one Google says to use (presumably the original
    signing key from 26 Jul 2026, still first in the rotation lineage):
    `31:65:2A:79:91:5C:30:D8:29:54:2D:C6:FA:9C:0F:88:FE:4E:24:E6:16:A5:F3:16:9F:A0:94:1B:3D:F6:C3:AB`
    (confirmed against Adrian's pasted text). Now in
    `assetlinks.json` with the other three. **Lesson: take the fingerprint
    from the "Digital Asset Links JSON" box, not the key tiles.**
  - **CONFIRMED ON ADRIAN'S PHONE (2026-09-30): "perfect. now is
    working"** after the `31:65…` fingerprint went live (Play build 1.0.5,
    Brave as default browser). Basis: his report; he did not itemise
    address bar / PDF / PGN separately. **CLOSED.** No Android change, no
    new AAB, `LauncherActivity` untouched, no Chrome pin. Only
    `.well-known/assetlinks.json` changed (4 fingerprints: upload `4D:50…`,
    Play snippet `31:65…`, classical `CD:C1…`, post-quantum `AC:D4…`).

- **"OPEN WITH" / SHARE A PDF OR PGN FROM ANOTHER APP NOW REACHES CTC
  (2026-09-29).** `sw.js` v112 → **v113**. Web side committed on `main` (NOT
  pushed); Android side is TWA **1.0.5 (versionCode 7)**, built and signed but
  not yet on Adrian's phone. Three root causes, all fixed:
  - **The service worker never cached network responses.** Both fetch branches
    in `sw.js` did `caches.open(CACHE).then(c => c.put(req, res.clone()))` —
    the clone ran after the page had already consumed the body ("Response body
    is already used"), so every put failed silently. Now `res.clone()` is taken
    synchronously before `return res`, in both the cache-first and the
    network-first branch.
  - **Files were judged by name/MIME, which lie.** Many apps send a `.pgn` as
    `application/octet-stream` or with a junk name. `routeIncomingFile()` in
    `js/app.js` now sniffs the first 4 KB: `%PDF-` in the first 1 KB → PDF;
    otherwise, if there are no NUL bytes, a PGN tag (`[Event "…"]`) or move text
    (`1. e4`) → PGN; anything else → refused with `share_unsupported`.
    `manifest.webmanifest` `share_target` accept gains
    `application/octet-stream` (share target ONLY — not `file_handlers`, so CTC
    doesn't offer to open every unknown file).
  - **"Open with" never delivered the file.** In a TWA on Chrome 150,
    `launchQueue` does NOT receive files (the claim further down that it might
    is wrong). Fix is in the Android project `C:\Users\Adrian\chess-app-android`
    (NOT a git repo): `app/src/main/java/com/chesstrainingcenter/app/LauncherActivity.java`
    rewrites an incoming `ACTION_VIEW` intent into `ACTION_SEND` with the URI as
    `EXTRA_STREAM` (`setIntent(share)`), so it goes through the share-target
    POST that already works. `octet-stream` added to the SEND intent filter and
    the `shareTarget` resValue; `twa-manifest.json` synced; version 1.0.5 / 7.
    **minSdkVersion raised 21 → 24** (`app/build.gradle` + `twa-manifest.json`):
    Play Console rejected the first 1.0.5 AAB — "Play automatic protection
    requires a minimum SDK version of 24". Rebuilt as the same 1.0.5 / code 7
    (the rejected upload never consumed the code).
    Signed with the same keystore (fingerprint checked). New outputs
    `app-release-signed.apk` / `app-release-bundle.aab`; the old ones kept as
    `*-1.0.4.*`.
  - **⚠ NEVER run `bubblewrap update` without re-applying the
    LauncherActivity patch** (and the octet-stream filter). Bubblewrap
    regenerates the Java and the Android manifest from `twa-manifest.json` and
    will silently wipe it — "Open with" goes back to landing on an empty Read
    shelf.
  - **Verified:** Android emulator (Chrome 150) — "Open with" a PDF → Read
    shelf; a PGN → new base "OpenWithLines"; an octet-stream file is offered
    in the share sheet. Headless CDP at 375px, EN/ES, light/dark: 19/19 PASS,
    including offline boot.
  - **Not verified / limits:** no test on Adrian's real phone yet. iOS has no
    share target at all. App Check 403s in the console are expected.

- **STUDENTS SEE THE TEACHER'S ARROWS DURING A LIVE MASTERCLASS
  (2026-09-29).** `sw.js` v111 → **v112**. Changed `firestore.rules`,
  `js/masterclass.js`, `js/board.js`, `js/firebase.js`, `js/app.js`,
  `tests/rules/masterclass.test.js`. Committed, NOT pushed. **The rules must
  be deployed separately (`npm.cmd run rules:deploy`)** — until they are,
  every broadcast write carries a field the live rule refuses, so the WHOLE
  live board (moves too, not just arrows) stops reaching students.
  - **Payload.** One new field on `masterclasses/{id}/live/state`:
    `shapes: {a, s}`, two strings packed by `packShapes()` in
    `js/masterclass.js` — `a` is colour letter + from + to per arrow
    (`"Ge2e4Rd7d5"`), `s` colour letter + square (`"Yd4"`), no separators.
    Colours G/Y/R = the board's green/yellow/red. `unpackShapes()` reverses it
    and drops anything malformed. Rides the existing 1 write/s throttle in
    `pushLiveState()`; no second writer, no second document.
  - **Rules.** `shapes` added to the `hasOnly` list; optional (a client cached
    from before this still writes without it); when present it must be a map
    with exactly keys `a` and `s`, each matching
    `([GYR][a-h][1-8][a-h][1-8]){0,32}` / `([GYR][a-h][1-8]){0,32}` — the regex
    IS the 32 + 32 cap. Client cuts at the same 32 (`SHAPE_CAP`). Delete rule
    untouched. Rules tests 48–52 added (owner writes empty/full-to-cap; viewer
    refused; 33 arrows or 33 squares refused; 9 wrong-typed/malformed payloads
    refused; delete still works) — full suite passes, 0 failures.
  - **Teacher side.** `Masterclass.onBoardChange()` now sends
    `packShapes(tree.current.shapes)`. Drawing does not pass through
    `Analysis.refresh()`, so the board's `onShapesChange` (Analysis.init in
    `js/app.js`) also calls `onBoardChange()` — which still returns at once
    unless I own the class AND am broadcasting. Shapes are per-move, as
    before, so moving on sends that move's shapes (usually none) and clears
    the class's.
  - **Student side — kept SEPARATE from the student's own drawing.** New
    `board.liveShapes` + `setLiveShapes()` in `js/board.js`, painted by the
    existing `_renderShapes()` under the student's own `this.shapes`; the
    toggles never touch it, so an incoming update cannot wipe what the student
    drew. `Masterclass.liveShapesFor(tree)` returns the teacher's shapes only
    when following AND the board's FEN equals the teacher's `st.fen` (browse to
    another move → hidden; come back → shown). `Analysis.refresh()` calls it;
    `paintLiveShapes()` repaints on snapshot, Stop/Resume following and
    `closeLive()`.
  - **The liveKey trap.** `liveKey()` is unchanged (position only). A separate
    `shapesKey()` comparison in `onLiveSnapshot()` repaints on a shapes-only
    change WITHOUT re-running `applyLive()` / `gotoLine()` / the engine.
  - **Verified over CDP (headless Chrome, own static server), 375px, EN/ES ×
    light/dark, 60/60,** by calling `Masterclass.onLiveSnapshot()` directly —
    the real Firestore listener cannot run from localhost (App Check). Seeded
    a viewer class + one chapter. Checked: shapes paint; student's own arrow
    coexists and survives a teacher update; shapes-only change applies with
    zero `applyLive()` calls; a snapshot with no `shapes` clears; move +
    shapes moves and paints; browsing away hides/back shows; Stop/Resume
    following clears/restores; cached null keeps them, server null clears;
    owner drawing while not broadcasting leaves the live state alone; pack cap
    32 + bad colours/squares dropped; scrollWidth 375. **Not tried with a real
    teacher and student over Firestore.** Script was scratch, not committed.

- **YOU CAN CHOOSE THE PUZZLE-RADAR THEMES FROM SOMEONE ELSE'S PROFILE
  (2026-09-29).** `sw.js` v110 → **v111**. Changed `index.html`, `js/app.js`,
  `js/leaderboard.js`. Committed, NOT pushed.
  - **What.** New `#pubprofile-radar-pick` button ("⚙ Themes"/"⚙ Temas", key
    `radar_choose`) beside the "Puzzles by theme" heading on the public
    profile, same markup as `#radar-pick` on my own profile. It sits inside a
    `.pubprofile-detail` card, so a charts-off (private) friend never shows it.
  - **How.** `openRadarPicker(onSave)` in `js/app.js` is now **exported** and
    takes an optional callback, called after `Profile.refresh()` on Apply.
    `PublicProfile` (`js/leaderboard.js`) keeps the friend's `themeElo` from
    the last `open()` and has `drawPuzzleRadar()`, which both `open()` and the
    picker's callback use — the chart redraws in place, no screen change.
  - **One shared selection** (`kv 'radarThemes'`) for my chart and everyone
    else's, as before; the UI says nothing about it. Unrated theme → 1200.
  - **Verified over CDP, 375px, EN/ES × light/dark, 36/36**, with a SEEDED
    friend (fake entry passed to `PublicProfile.open()`; Firestore not
    reachable from localhost): button visible for a public friend; cancel
    (backdrop) stores nothing and leaves the chart alone; picker opens at
    13/13 with every unchecked box disabled; Apply redraws the friend's chart
    immediately with the friend's values (unrated = 1200); my own profile's
    puzzle chart shows the same themes after `Profile.refresh()`; a
    `profileVisibility:'private'` friend shows the private note and the
    button is not rendered; scrollWidth 375. Not tried with a real friend
    over Firestore.
  - **Pre-existing, not changed:** at 13 spokes the longest radar labels clip
    at 375px ("Discovered atta…") — same on my own profile. The first-run
    Kael "Welcome" sheet is a modal too, so test scripts must target the
    LAST `.modal-box`, not the first.

- **IMPORTING A PGN FROM THE BASES LIST NO LONGER MAKES YOU INVENT A NAME
  (2026-09-29).** `sw.js` v109 → **v110**. Changed `index.html`, `js/app.js`.
  Committed, NOT pushed. Before this, the only way into the Bases list was
  New → type a name → open the (empty) base → Import — even if all you had
  was a file.
  - **The fix.** New button `base-import-new` ("Import PGN") sits on the
    Bases LIST view (`index.html` inside `#base-list-view`, next to
    `base-new`), wired to its own hidden `<input type=file id=pgn-file-new>`.
    Its `change` handler in `Base.init()` (`js/app.js`, right after the
    existing `pgn-file` listener) enforces `MAX_DATABASES` with the same
    `database_limit_toast`, then does
    `db.createBase(file.name.replace(/\.[^.]+$/, '') || t('my_games'))` →
    `this.openBase(id)` → `this.importFile(file)` — the exact naming/flow
    `routeIncomingFile()` (~line 6699) already uses for a PGN arriving via
    Share or "Open with", just reachable from inside the app too. Zero
    prompts; a colliding name is allowed (base names were never unique;
    Rename is one tap away). `base-new` (empty database, asks for a name)
    and `base-import` (import into an already-open base) are untouched.
  - **Layout.** The new button lives on its own `.row.wrap` line below the
    `Bases N/10` / `New database` header row, not crammed into that row's
    flex slot — two buttons sharing that slot wrapped awkwardly at 375px
    (title floating between two stacked buttons). Matches the pattern the
    open-base view already uses for its `base-actions` row.
  - **Verified over CDP** (Browser pane doesn't composite on this machine —
    see the CDP-fallback note lower in this file) **at 375px, EN/ES ×
    light/dark**: plain import → base named after the file, game inside,
    zero prompts; `My.Games v2.pgn` (dot + space) → base "My.Games v2";
    `GAME.PGN` (capitals) → base "GAME"; seeded to 10 bases then imported →
    same toast (`Limit of 10 databases reached.` / `Límite de 10 bases de
    partidas alcanzado.`), base count unchanged at 10; Rename still renames;
    opening a base and using the OLD `base-import`/`pgn-file` path still adds
    into that same base (game count 1→2, not replaced). Script (a Python
    `websockets` CDP driver + a path-guarded static server) was scratch,
    deleted after the run — not part of this commit.
  - **Not changed.** `base-new`, `base-rename`, `base-import` (open-base
    path), the base-picker sheet's "＋ New base", `chooseBase()`.

- **PUZZLE ELO IS CHARGED AT THE MISTAKE, AND THE CHANGE IS SHOWN (2026-09-11).**
  `sw.js` v108 → **v109**. Changed `js/app.js`, `index.html`, `css/style.css`.
  Committed, NOT pushed. A tester found it: the rating only moved when a puzzle
  *ended*, so after a wrong move you could tap Next and walk away from the loss
  — failing and skipping was the cheapest way to hold a rating.
  - **The fix.** New `Puzzles.markFailed()` (and the same on `Blind`) sets
    `failedThis` and calls `recordResult(false)` straight away. Every route that
    means "no longer a clean solve" goes through it: the wrong-move branch of
    `userMove`, `hint()`, and `showSolution()`. `recordResult` was already
    guarded by `eloRecorded`, so the later `recordResult(!this.failedThis)` on a
    solve is a no-op — a mistake is charged exactly once and solving afterwards
    pays nothing back. `nextPuzzle()`'s `log(false)` is unchanged.
  - **The number on screen.** `recordResult` now records `lastDelta`
    (`Math.round(elo) - Math.round(before)`, so it always matches the badge's
    own rounding). `Puzzles.showEloDelta()` paints new `#puzzle-elo-delta`
    beside the ELO badge — `.elo-delta.up` green, `.down` red, `.flat` muted for
    a 0 — with an `aria-label`; `clearEloDelta()` runs in `loadPuzzle`, so it
    clears with the next puzzle. Shared helper `eloDeltaText(d)`.
  - **The strip below the board.** `PuzzleLog.add(mode, puzzle, solved, delta)`
    stores the delta and each `.plog-dot` shows it instead of its index; the
    position is still in the `title`/`aria-label` (`Puzzle 3 — Missed — Puzzle
    ELO -89`), and tapping still opens the same review. Rush passes no delta (a
    run is scored as one), so those dots keep their numbers. `.plog-dot` went
    from a fixed 22px circle to a `min-width` pill — the first ten rated
    attempts use K=192 and really do produce three-digit swings.
  - **Verified over CDP with real taps, 375px, EN/ES × light/dark, 11/11 each**
    (scratchpad script, deleted). The script identifies the puzzle on the board
    by matching the DOM placement against the live `PUZZLES` export, so it plays
    the real solution: clean solve 1200 → 1280 with a green `+80` on the tab and
    on the dot; wrong move 1280 → 1159 the moment it lands, red `-121`, and
    tapping Next left it at 1159 (charged once) with a red `-121` dot; mistake
    then full solve → no payback; hint → charged at once; solution button →
    charged once, not twice; delta cleared on the next puzzle; `scrollWidth` 375
    with the badge ending at x=365; Blindfold mistake 1200 → 1193 and Next kept
    it. ES dark needed a re-run: the first pass registered no Blindfold move at
    all (test flakiness around the 10s countdown, not app behaviour).
  - **Not changed.** The K values, the theme ELO maths, `Streak.recordActivity()`
    and `DailyMissions` (still win-only), and Rush.

- **TAB SWIPE ALSO WORKS FROM ON TOP OF A BOARD (2026-09-11).** `sw.js` v107 →
  **v108**. `js/app.js` swipe section only. Adrian reported he could not change
  tab when the swipe started on a board: `.board` was in `SWIPE_SAFE`, so every
  board (most of the screen on Analysis / Puzzles / Play) was a dead zone.
  Committed, NOT pushed.
  - **Rule now.** `.board` is out of `SWIPE_SAFE`; new `boardOwnsTouch(el)`
    (called from `swipeBlocked`) keeps the touch for the board only when landing
    there means something, because `board.js` acts on **pointerdown** (`_tap`):
    a `.sq.grabbable` piece; any square while the board has a `.sq.selected`
    (the touch would be a move/reselect) or a `.sq.premove` (any tap cancels
    it); `.board.drawing` / `.board.dragging`; and `#setup-board` (editor taps).
    Everything else — an empty square, a piece that is not yours to move — does
    nothing on the board, so a sideways drag there swipes tabs.
  - **Capture phase.** The swipe `pointerdown` listener is now registered with
    `capture: true` so `boardOwnsTouch` reads `.selected` / `.premove` BEFORE
    board.js's own pointerdown changes them (otherwise a tap-tap move onto an
    empty square would both play the move and start a swipe).
  - **Verified over CDP (`Input.dispatchTouchEvent`), 375px, EN/ES ×
    light/dark, 13/13 each** (scratchpad script, deleted): Analysis empty e4 →
    follows the finger (both sections visible, header unchanged) and lands on
    Endgame with +1 history entry; opponent piece e7 → swipes; own e2 → ghost,
    no swipe; e2 selected then drag from e4 → move `1.e4` played, no swipe;
    `.drawing` → no swipe; a `.premove` square present → no swipe; vertical drag
    from empty d5 (Analysis padded so `<main>` can scroll) → scrolled 417–518px,
    no swipe; Puzzles own piece → ghost, no swipe; Puzzles empty square → Play;
    Play (game started) empty square → Read; Setup editor board → no drag styles
    at all; `scrollWidth` 375 on all tabs (Read 405, known). `.drawing` and
    `.premove` were set by adding the classes by hand, not through the UI.

- **KAEL PARKS IN THE LOWER-RIGHT CORNER AGAIN (2026-09-10).** `sw.js` v106 →
  **v107**. One CSS value: `#kael-corner`'s idle `transform` is back to
  `translateX(34px)` (was `translateX(0)` since `49d29f2` put him in the old
  bottom bar and `c7c7c17` left him fully in place when the bar went). He keeps
  `bottom: calc(12px + safe-area)`; `#kael-corner.speaking` (added/removed in
  `js/app.js` around the quote bubble) still slides him to `translateX(0)` at
  full opacity. No JS changed. Committed, NOT pushed. Verified over CDP, 375px,
  EN/ES × light/dark (scratchpad script, deleted): idle `#kael-fab` spans
  349→397, so a 26px sliver shows, 12px off the bottom, opacity .55, and
  `elementFromPoint` on the sliver hits `#kael-fab`; tapping the sliver adds
  `.speaking` → 315→363, all 48px visible, opacity 1. `scrollWidth` 375 idle
  and on all 8 tabs (Read 405, the known watermark) — the parked FAB adds no
  horizontal scroll.

- **SWIPE BETWEEN TABS FOLLOWS THE FINGER (2026-09-10).** `sw.js` v105 →
  **v106**. Changed `js/app.js` (swipe section only) and `css/style.css`.
  Web-only; **committed, NOT pushed** (nor are `c7c7c17`, `67cac4e`,
  `b3e9295`) — `git push` deploys them all.
  - **Behaviour.** Once a touch drag passes `SWIPE_LOCK` (10px) it picks an
    axis: vertical → handed back to page scrolling; horizontal → the current
    `section#screen-*` follows the finger (`translate3d` in rAF) and the
    neighbouring tab (`neighbourTab(screen, dir)`, drawer order `TAB_ORDER`)
    slides in beside it, one `<main>` width away. Dragging back past the start
    swaps in the other neighbour. Release (`pointerup`): commits if
    |dx| > `SWIPE_COMMIT` (35%) of the width unless flicked back, or on a flick
    > `SWIPE_FLICK` (0.5 px/ms, velocity over the last 100ms only) of at least
    `SWIPE_FLICK_MIN` (30px); otherwise springs back. Both ways animate
    `SWIPE_MS` (250ms) ease-out; `pointercancel` springs back.
  - **How the neighbour is shown without switching.** `paintDrag()` removes
    `.hidden` from only that section and lifts it with inline
    `position: fixed` + `overflow: hidden`, sized to the current section's
    left/width and `<main>`'s visible box (top = main top + padding). Fixed, not
    absolute: making `<main>` a containing block would have moved the Read /
    Leaderboard `img.watermark` (the only ICB-positioned element in `<main>`,
    measured). When `settleDrag()`'s timer ends, `endDrag()` strips the inline
    props (`DRAG_PROPS`) and, on commit, `showScreen(next)` runs **once** and
    `main.scrollTop = 0` in the same task, so the neighbour lands without a
    jump and the history entry, side effects and title all happen as for a menu
    tap. The title changes only then.
  - **Kept.** Pointer events on document (not touch), `SWIPE_SAFE` /
    `swipeBlocked`, the `menuOpen` guard, sub-screens have no neighbour. Edge
    swipe (start ≤ 28px from an edge, moving inward) is still release-decided
    back via `goBackTab()` with the old 60px / 2:1 / 700ms rule, not tracked.
    `prefers-reduced-motion`: no tracked drag, same release rule, instant
    `goAdjacentTab()` → `showScreen`. At the first/last tab and on sub-screens
    the screen rubber-bands (`rubberBand()`, max a third of the width) and
    springs back. New pointerdowns are ignored while `settling` (250ms).
  - **Removed.** `slideScreenIn()` and the `screen-from-right/left` keyframes
    + `.from-right/.from-left` CSS (the old 26px slide-in). The 700ms cut-off
    no longer applies to the tracked drag.
  - **Verified over CDP, 375px, EN/ES × light/dark, 29/29 checks each**
    (scratchpad script, deleted). Input was `Input.dispatchTouchEvent` with touch
    emulation, which goes through Chrome's gesture pipeline: a vertical drag
    natively scrolled `<main>` (~1,350px) and produced a `pointercancel`, and
    forced-overflow strips scrolled natively, so `touch-action` WAS in play here
    (unlike page-synthesised PointerEvents). Still headless, not a phone.
    Checked: mid-drag at 50% both sections visible, header + `history.length`
    unchanged, `scrollWidth` 375; past threshold + release → Endgame/Learn
    (Aprender) lands, title name + SVG = lit tab, +1 history entry, no inline
    styles left; header unchanged while still settling; short drag → back, no
    entry; drag out, across to the other neighbour and back → nothing changed;
    fast 85px flick commits; far drag flicked back springs back; Analysis
    (first), Profile (last), Rush both ways → one section, rubber band 77px,
    springs back; drawer open → ignored; left-edge swipe → back; e2-e4 drag on
    Analysis moves; sideways drag from a grabbable piece on Puzzles and Play
    shows `.drag-ghost` and never swipes; `#hist-chips` / `#puzzle-actions`
    (forced to overflow) scroll and never swipe; `#ana-moves` and
    `#read-stage` (reader unhidden by hand, no book) never swipe; all 8 tabs
    375 after, Read 405 (known watermark). Reduced motion (emulated): no drag
    styles mid-drag, instant switch Endgame → Bases, +1 entry. Performance at
    4× CPU throttle, warm app, dragging toward Analysis / Puzzles / Play:
    frame max 14.6 / 20.9 / 16.8ms, no long animation frames, idle max 15.1ms.
  - **Known, not chased.** While Read is dragged (or is the neighbour) its
    ICB-positioned watermark is re-anchored to the moving section until the
    switch ends — same pre-existing watermark bug. A neighbour never visited
    this session shows whatever its DOM holds before `showScreen`'s loaders
    run (e.g. Puzzles before `ensureLoaded`).

- **MENU MOVED TO THE TOP — LEFT DRAWER + TAB ICON/NAME TITLE (2026-09-10).**
  `sw.js` v104 → **v105**. Changed `index.html`, `css/style.css`, `js/app.js`,
  `js/i18n.js`, `js/tour.js`. Web-only; **committed, NOT pushed** (neither are
  `b3e9295` / `67cac4e` before it) — `git push` deploys all three.
  **Reverses HANDOFFS.md task 2's "bottom sheet, NOT a left drawer — do not
  re-open"**: Adrian changed his mind on 2026-09-10. That line is stale.
  - **What changed.** The bottom bar `#tabmenu` is gone. `#tabmenu-btn` (☰, an
    inline SVG) now sits in `#topbar`'s left corner, where the CTC logo and the
    hard-coded "Chess Training Center" were. `#topbar` is a
    `1fr minmax(0, max-content) 1fr` grid, so `#app-title` (`#app-title-ico` +
    `#app-title-name`) is truly centred between ☰ and streak + ⚙️ and a long
    name ellipsises. `nav#tabbar` is now a full-height drawer, `min(80vw,320px)`,
    sliding in from the left (`translateX(calc(-100% - 48px))` closed, so the
    shadow never peeks). It opens ONLY from the ☰ tap — no edge-drag, on
    purpose (Android back / the app's edge swipe).
  - **Kept exactly, and why it still works.** The eight `#tabbar
    button[data-screen]` are unchanged in order with Profile the LAST button, so
    `TAB_ORDER`, swipe nav, `.on`, the click handlers and the tour targets are
    untouched. `openMenu`/`closeMenu`/`navigateFromMenu`/the `popstate`
    handler were not edited. The bottom group is `hr.drawer-sep`
    (`margin-top:auto`), then `a#menu-limits`, then Profile — Limits moved
    *before* Profile in the DOM, which is safe because it is an `<a>`, not a
    button.
  - **Icons.** All nine `.tab-ico` (8 tabs + Limits) are now hand-drawn inline
    SVG, `currentColor`, stroke 2, round caps/joins — no emoji left in the
    drawer or the title. `updateTabMenu()` (same name, still exported, still
    called by `relabel()`, `Analysis.updateBaseNav()`,
    `Masterclass.lightBasesTab()`) takes the lit button — or the `MENU_AREA`
    fallback button — and copies its label AND `cloneNode`s its SVG into the
    title, so the icon inherits `--text`. Drawer: icon `--muted`, label
    `--text`, lit row gold. New i18n key `menu_open` (Menu/Menú) is the ☰
    button's accessible name.
  - **Two small behaviour additions.** (1) The swipe `pointerdown` listener
    ignores gestures while `menuOpen`, so a horizontal drag over the open
    drawer can't change tabs behind it. (2) `Tour.handleScroll()` uses zero
    safe margins for a target inside `#tabbar`: Profile sits at the drawer's
    foot (bottom 786 of 800), inside the old 72px bottom margin, and the tour
    drew a "Keep scrolling" arrow over the drawer. Seen in a screenshot, fixed,
    re-measured.
  - **Kael** now floats bottom-right over the screen
    (`bottom: calc(12px + safe-area)`), faded .55 at rest; `main`'s
    `padding-bottom` is 72px so the last row scrolls clear. Measured over all 8
    tabs: he covers nothing tappable at scroll-bottom; on Play at scroll-top he
    sits over the lower part of the level list and `#play-start`, which scroll
    clear. `#read-reader`'s `height: calc(100dvh - 120px …)` was left alone —
    it now ends ~62px above the bottom, exactly Kael's corner.
  - **Verified over CDP, 375px, EN/ES × light/dark** (scratchpad script, deleted):
    title name + SVG equal the lit tab on all 8 tabs plus a Base game (Bases),
    a Masterclass chapter (Bases), the leaderboard (Profile/Perfil) and Rush
    (Puzzles), and after a live language switch in Settings; title SVG
    `color`, every shape's computed `stroke` and the name all equal a
    `var(--text)` probe — rgb(245,247,250) dark, rgb(26,32,44) light; zero
    emoji in title and drawer; icon + name group centred to 0px. Drawer sampled
    sliding −348 → 0, 300px wide, lit row gold, visual order ends
    read → divider → Limits → Profile, Profile 14px off the bottom; tap on the
    backdrop closes without navigating. `history.back()` with the drawer open
    closed only the drawer; a tapped destination left exactly one entry (one
    more back returned to the previous tab, menu shut). Guided tour walked with
    real taps: all 7 tab steps ring the button inside the fully open drawer and
    advance. Swipe with drawer open: ignored; closed: Read → Profile.
  - **Not caused by this, do not chase here:** `scrollWidth` is **405** on Read
    and the Leaderboard — `img.watermark` (right edge 405). Measured identical
    on a `git archive HEAD` copy of the pre-change code, so it is the
    pre-existing watermark bug already listed under "Still to do" → layout
    bugs; every other screen is 375.
  - **Stale elsewhere:** HANDOFFS.md task 2 (see above); CLAUDE.md still says
    `js/app.js` is 232 KB (it is ~281 KB). Finger-following swipe between tabs
    was PART 2 — done the same day, see the entry above.

- **PRE-MOVE — THE OTHER FOUR BOARDS MEASURED, NOT ASSUMED (2026-09-07).**
  **No code changed.** No `sw.js` bump, nothing new to deploy. This was a
  verification pass over the four pre-move boards commit `b3e9295` also touches
  but never re-checked: `play-board`, `puzzle-board`, `rush-board`,
  `endgame-board`. They were believed fixed because they share Trainer's code
  shape. They are now measured, and the fix holds on all four.
  - **Why the earlier "drag works" evidence was worthless.** The pre-move
    commit's own run drove drags over CDP, and a CDP-dispatched pointer event
    ignores `touch-action` entirely. A scripted drag therefore succeeds on a
    board where a real finger would be handed to page scrolling. Every claim
    about these four boards rested on that probe.
  - **What was asserted instead — an invariant, not a drag.** For each board:
    the set of `.sq.grabbable` squares, the set of pieces whose computed
    `touchAction === 'none'`, and the set of `.sq` elements with the same, must
    all equal exactly the squares the FEN says are occupied by the side the user
    may move right now. The expected set is read straight off `board.fen` and
    shares no code with `_movableColor()` or `render()` — the things under test.
  - **Sampled at three moments per board**: (a) opponent/engine thinking with
    the pre-move armed — expect the user's own side, not the side to move;
    (b) the instant the opponent's move lands and the board goes live — expect
    the side to move; (c) with a pre-move actually queued through the real
    `_tap()` funnel. **84 assertions, 0 failures**, at 375 px in EN and ES ×
    light and dark. Every board reached all three moments in all four combos.
  - **The harness was proved able to fail before the result was believed.**
    With the re-render branch inside `_syncPremoveClass()` temporarily removed,
    the same run failed 9 of 17 assertions — grabbable and `touch-action` stuck
    on the *opponent's* 16 pieces on Play, on the wrong side in Rush and
    Endgame. `js/board.js` was restored from a byte copy afterwards; `git diff`
    is clean.
  - **Harness facts worth not rediscovering** (the script was a scratchpad
    throwaway and is deliberately not committed — do not build a reusable one):
    the screen objects are not exported, so live `Board` instances are collected
    by wrapping `Board.prototype.render` to record `this` and keying by
    `el.id` — wrap it *permanently and early*, because these boards are built
    lazily on first visit, so the one-shot `setPieceSet(getPieceSet())` trick
    only catches boards that already exist. `board.onMove(mv)` is the way into a
    screen's real `userMove()` without the screen object. Rush allows only three
    strikes, so brute-forcing a puzzle's answer ends the run — identify the
    puzzle instead by matching `board.fen` against `PUZZLES` from
    `/js/puzzles.js` with `moves[0]` applied, then play `moves[1]`. A puzzle
    whose answer is the mate never re-arms, so each pass needs its own puzzle
    with `moves.length >= 4`. `path.join()` on Windows returns backslashes, so a
    static server's `startsWith(ROOT)` guard 404s everything and Chrome shows a
    chrome-error page that looks exactly like the app failing to boot — use
    `path.relative()`.

- **PRE-MOVE — TRAINER + BLIND DRIVEN IN A BROWSER, TWO BUGS FIXED (2026-09-07).**
  `sw.js` bumped v103 → **v104**. Changed `js/board.js`, `js/app.js`. Web-only,
  `git push` deploys it. The pre-move commit below shipped `Trainer` **reasoned
  about but never run**, and left `Blind` opted out but sharing the edited
  `Board`. Driving both over CDP turned up two real defects.
  - **BUG 1 — `.sq.grabbable` was left on the OPPONENT's pieces (`js/board.js`).**
    `.grabbable` is derived from `_movableColor()`, which flips while a pre-move
    is armed. `armPremove()` / `firePremove()` / the `interactive` setter all
    went through `_syncPremoveClass()`, which toggled the board class **and
    nothing else** — no re-render — so the squares kept whatever side the last
    position change had drawn. Measured on `trainer-board` while it was White's
    move and the board was `.live`, the pieces carrying `touch-action: none`
    were `a7,a8,b7,b8,c7,c8,d7,d8,e5,e8,f7,f8,g7,g8,h7,h8` — every one of them
    Black's. **Consequence is phone-only:** `.board.live .sq.grabbable img` is
    what claims the touch gesture, so with it on the wrong pieces the browser
    read a drag of your own piece as a page scroll — both during the pre-move
    window and on your own turn after every computer move. Tap-tap always
    worked, which is what hid it.
    - **This was not Trainer-specific.** Same code shape in `Play`, `Puzzles`,
      `Rush` and `Endgame` practice — one shared cause, fixed once in `Board`.
    - **Why the previous session's run missed it:** CDP-dispatched pointer
      events ignore `touch-action` entirely, so a scripted drag succeeds on a
      board where a real finger would fail. The class list is the only honest
      probe. If you ever verify drag again, assert on
      `getComputedStyle(img).touchAction`, not on whether the drag worked.
    - **Fix:** `_syncPremoveClass()` now re-renders when the pre-move state
      actually flips, tracked in a new field `_premoveWasActive`. Guarded on
      `this.squares` because the constructor sets `interactive` — and so reaches
      `_syncPremoveClass()` — before `_buildSquares()` has run. Do not remove
      that guard, and do not "simplify" it into an unconditional render: the
      setter is called several times per move.
  - **BUG 2 — a pre-move outlived the game it was queued in (`js/app.js`).**
    `$('trainer-back')` did not `clearPremove()`, though `Play`'s back button
    does. Queue a pre-move, press Back, press Start: the abandoned
    `computerMove()` still runs its `finally`, and a guess that happens to be
    legal in the fresh position plays itself as move 1. Reproduced exactly —
    a queued `b1c3` came back as **`1. Nc3 d5` in a brand-new game**. One line
    added to the Back handler; after it, `leftPremove: null` and the new game
    starts empty.
  - **Trainer, all four scenarios green** (375×812, touch emulation, EN **and**
    ES, light **and** dark): a pre-move queued inside the 450 ms **book** reply
    fires (`1. e4 e5 2. Nf3`); one queued during the **engine** reply fires, and
    **by drag** (`3. Bc4`); `gotoHistory` back cancels a queued pre-move
    (`armed`, `premove` and `.premoving` all cleared, engine then replies
    normally); and branching a **variation** from an earlier position fires no
    stale pre-move (`1. d4 d5`). Trainer's two `return`-from-inside-the-`try`
    success paths and its `setLiveInteractive`/`posHistory`/`atLive` machinery
    all behave — no change was needed there.
  - **Blind is untouched and still correctly opted out**: `premoveAllowed`
    false, `.premoving` never appears on `blind-board`, `piecesHidden` holds
    (0 visible pieces before *and* after a move), **no destination dots leak**
    while a hidden piece is selected, and the puzzle's real solution move lands
    through the normal funnel → `"Correct! Keep going."`. Drag on a hidden
    board also still works and leaves no `.drag-ghost` behind.
  - **`learn-board` and `setup-board` re-checked** for the same shared-`Board`
    reason: the lesson practice move grades correctly (`"Correct! 🎉"`,
    grabbable on the side to move), and the Setup **editor** still places a
    piece (`8/8/8/8/3Q4/8/8/8`). Both have `premoveAllowed` false, so the new
    re-render branch is a strict no-op for them — `_premoveActive()` is always
    false, so the state never flips.
  - **No committed harness was added** — a throwaway CDP driver (own static
    server, headless Chrome, `Runtime.evaluate`) did the work and was deleted.
    Two things it needs that are easy to lose: the screen objects are **not**
    exported from `app.js`, so live `Board`s are collected by wrapping
    `Board.prototype.render`, calling `setPieceSet(getPieceSet())` to force
    every board to draw, then unwrapping and keying by `el.id`; and a drag ends
    in `document.elementFromPoint()`, so `.modal-back` must be removed first or
    the onboarding modal swallows the drop.
  - Language is `localStorage['lang']`; colour mode is the IndexedDB kv key
    **`colorMode`** (`'system'|'light'|'dark'`), not `'theme'`. `Blind` is
    reached by the Puzzles tab then `.puzzle-modes button[data-v="blind"]`, and
    it makes you sit through a **10-second memorise countdown** before the board
    goes interactive — budget for it.

- **PRE-MOVE (2026-09-07).** `sw.js` bumped v102 → **v103**. Changed
  `js/board.js`, `js/app.js`, `css/style.css`. Web-only, no Android rebuild —
  `git push` deploys it. No new i18n strings and no new setting: a pre-move is
  self-selecting, you only get one by deliberately moving out of turn.
  - **All of it lives in `Board`**, because one `Board` class serves every tab.
    New state next to `_dragStart`: `premoveAllowed` (opt-in via
    `new Board(el, { premove: true })`), `premoveArmed`, and `premove`
    (`{from,to,promotion}`), kept **separate from `selected`** — `setPosition()`
    nulls `selected`, and outliving the opponent's move is the whole point.
  - New Board API, four methods: `armPremove()` (a screen calls it when it hands
    the turn over), `clearPremove()`, `firePremove()` (called the moment the
    opponent's move has landed and control is back), and the internals
    `_premoveActive()`, `_syncPremoveClass()`, `_movableColor(turn)`,
    `_flippedChess()`.
  - `firePremove()` routes the queued move through the **normal `onMove`
    funnel**, so it is graded, sounded and drawn exactly like a move made by
    hand. Nothing downstream knows it was a pre-move.
  - `_tap()` is still the single funnel for tap **and** drag. In pre-move mode it
    reads the movable side as flipped and generates targets from
    `_flippedChess()` — the FEN with the side-to-move field swapped and the ep
    square dropped. **That position can be genuinely illegal** (the side not to
    move may be giving check) and chess.js throws; the fallback is "no
    destination dots, but the pre-move is still accepted", because
    `firePremove()` re-checks it against the real position anyway.
  - **`.board.premoving` was the trap.** `.sq.grabbable`'s `touch-action: none`
    was scoped to `.board.live`, and a board waiting for the opponent is not
    live — so on a **phone** the drag gesture went to page scrolling and
    pre-move by drag silently did nothing while looking perfect on a desktop.
    `css/style.css:415` now lists `.board.premoving` alongside `.board.live`.
  - **`classList.toggle(name, undefined)` toggles, it does not clear.** The
    constructor sets `interactive` (which calls `_syncPremoveClass()`) *before*
    `premoveAllowed` exists, so an unforced `_premoveActive()` returned
    `undefined` and left `.premoving` stuck on every board. `_premoveActive()`
    is wrapped in `!!` for exactly this. Do not remove it.
  - Promotion is asked **at queue time** (`_askPromotion` inside `_tap`), like
    every other site. The dialog is awaited, so `_tap` re-checks
    `_premoveActive()` after it closes and drops the queue if the opponent moved
    meanwhile.
  - **Wired into five screens, all in `js/app.js`:** `Play` (arm in
    `engineMove`, fire in its `finally` — every success path returns from inside
    the `try`, so after the block is unreachable), `Endgame` practice (arm+fire
    in `playBookReply`, arm in `engineReply` and fire in its `finally`),
    `Puzzles` (arm before the 400 ms `sleep`, fire after
    `setLiveInteractive(true)`), `Rush` (arm before the 300 ms `setTimeout`,
    fire inside it) and `Trainer` (arm in `computerMove`, fire in its
    `finally`). `clearPremove()` on: Play back/undo/`finish`/`begin`,
    `Trainer.gotoHistory`/`finishMsg`, `Puzzles.loadPuzzle`/`gotoHistory`/solve,
    `Rush.loadNext`/`finish`, `Endgame.undo`/`finishPractice`.
  - **Deliberately NOT wired:** `Analysis`, `Setup`, the Masterclass/`learn`
    board, the PuzzleLog mini-boards, and **`Blind`** (blindfold puzzles) — you
    would be aiming at a square you cannot see, in a rated mode.
  - **Decision Adrian made: a wrong pre-move is graded exactly like a real
    move** — puzzle ELO, a Rush strike, a practice mistake. A pre-move that has
    become *illegal* is discarded and graded as nothing, because it never
    happened. The alternative (never penalise) would make pre-move a free extra
    guess and inflate every rating. Measured in the verification run: a legal
    but wrong pre-move took puzzle ELO 1312.4 → 1205.6.
  - **How it was verified.** No committed harness covers Play or Puzzles, so a
    throwaway CDP driver (headless Chrome, own static server, deleted after) ran
    at 375×812 with touch emulation, in light **and** dark, EN **and** ES:
    tap-tap and **drag** pre-moves in Play at level 8 (2 s think time) firing the
    instant the engine's move landed, with the sound counter proving it went
    through the normal path; a pre-move promotion (dialog at queue time, `wQ.svg`
    on g8, `g8=Q+` in the move list); a pre-move that becomes illegal being
    discarded in silence with the board still playable; Puzzles (solution queued
    and fired, wrong one graded, `puzzle-nav-prev` cancelling a queued
    pre-move); Learn practice (study `p1`); Rush (score up, no strike); and
    normal moves still working on the Analysis board, which does not opt in.
    Zero console errors beyond the usual App Check 403.
  - **Test trap worth knowing:** a drag ends in `document.elementFromPoint()`, so
    any open overlay (the first-run onboarding modal) swallows the drop and the
    drag looks broken when it is not. Direct `dispatchEvent` taps are unaffected,
    which makes it look like a drag-only bug. Clear `.modal-back` first.

- **GUIDED TOUR — READ TAB STEPS (2026-09-07).** `sw.js` bumped v101 → **v102**
  (both changed files are precached). Changed `js/tour.js`, `js/i18n.js`,
  `.gitignore`. Web-only, no Android rebuild — `git push` deploys it.
  - Two new steps in the `STEPS` array, **between Play and Profile**, so the tour
    keeps walking the tab bar in its real left-to-right order: `readTab` (a tap
    step on `#tabbar button[data-screen="read"]`, `waitFor: '#screen-read'`) and
    `readAdd` (rings `#read-add` on the shelf). The `profTab` step's `screen`
    moved from `'play'` to `'read'` to match. The tour is now 33 steps.
  - **The Read step deliberately demos nothing.** A brand-new account has no
    books, so the reader, pinch-zoom and long-press-a-diagram do not exist during
    the tour (rule 2 in tour.js's header). `#read-add` is the only always-present
    control, so it gets the ring and everything else is described in the body
    text — `tour_read_add_b`, ES + EN, next to the other `tour_*` keys in i18n.js.
  - **`resetRead()`** (new helper next to `resetBase`) presses the reader's own
    `#read-back`, because `Read.onEnter()` reopens the last-read book and would
    otherwise hide the shelf. `onEnter()` is async, so it presses twice — once
    inline and once on a 500 ms timer with `Tour.internal` set, or the tour's own
    click blocker swallows the second press.
  - Verified over CDP at 375×812 in light **and** dark, ES **and** EN: the full
    tour walks end to end (33/33), the ring lands on `#read-add` every time, the
    card is not clipped in either language (ES 328 px, EN 307 px tall, Back/Next
    and Skip all on screen), Back/Next round-trips through the two Read steps, and
    the tour still finishes with `tourDone: 'completed'`. Also verified in the
    awkward state the plain walk never reaches — a book left OPEN when the user
    last left the Read tab — where `resetRead()` puts the shelf back.
  - **Existing users do not get this automatically:** `tourDone` is already set
    for them, so they only see it via ⚙️ Settings → Replay the guided tour. A
    one-time Read intro behind a new kv flag was considered and rejected as not
    worth a new persistent flag.
  - **Harness fixture trap (cost this session ~15 min):** both
    `tools/cdp-verify.mjs` and `tools/cdp-verify-stage2.mjs` fetch
    `/__test-book.pdf` from the dev server. That file is generated, not
    committed, and without it BOTH harnesses fail at the "open" step
    (`readerVisible: false`) in a way that looks exactly like an app regression.
    It is now in `.gitignore` with the regeneration command. Run this first:
    `node tools/make-test-pdf.mjs 5 > __test-book.pdf`. With it present, both
    harnesses are fully green on this change.
  - Cosmetic, **pre-existing, not caused by this change**: in headless CDP
    screenshots the tour card renders at `opacity: 0` (its entry animation never
    plays without a compositor) and the "Keep scrolling" hint paints even though
    `hint.hidden === true` in the DOM. Both appear identically on untouched steps
    (e.g. step 14, Import PGN). Judge the card from the measured rects, not the
    pixels.

- **READ TAB — FULL-SCREEN (IMMERSIVE) READING + OPEN-WITH ROUTING (2026-09-01).**
  `sw.js` bumped v99 → **v100**. Web-only (index.html, css/style.css, js/read.js,
  js/app.js, js/i18n.js) — the TWA loads the live site, so this needs only a
  `git push`, NO Android rebuild. Context: the TWA rebuild (1.0.4/code 6) got the
  share + file intent filters working (CTC now shows in WhatsApp Share and
  "Open with"), but tapping "Open with CTC" opened the app on Analysis with no
  book, and Adrian wanted a full-screen reading mode.
  - **Full-screen:** new ⛶ button in the reader bar (`#read-fullscreen`) toggles
    `body.read-immersive`, whose CSS hides `#topbar` + `#tabbar` so the page fills
    the screen; the reader's own bar stays (so the same button + Back always exit).
    `closeBook()` clears the class. Verified over CDP (toggle on → both hidden,
    off → restored, leaving the book clears it).
  - **Open-with routing (`handleIncomingFiles`):** now, when launched via the file
    handler (`?open-file=1`), it switches to the Read shelf immediately and, if the
    File Handling API delivers the file through `launchQueue`, routes it (PDF →
    Read shelf, PGN → new collection). If no file arrives within 2.5s (some
    phone/Chrome builds open the app but don't pass the file), it toasts
    `share_open_failed` pointing the user to Share instead. **[STALE 2026-09-29:
    answered — launchQueue does NOT deliver files in a TWA on Chrome 150; the
    1.0.5 LauncherActivity patch routes "Open with" through the share target.]**
    **UNVERIFIED on device** whether the TWA actually passes the file via launchQueue — if it
    doesn't, "Open with" lands on the Read shelf + shows that toast, and Share →
    CTC (which POSTs the file and DOES work) is the reliable path.

- **SHARE TARGET — "Share → CTC" opens PDF/PGN from other apps (WhatsApp etc.)
  (2026-09-01).** Committed on `main`. `sw.js` bumped v97 → **v98**. Changed
  `manifest.webmanifest`, `sw.js`, `js/app.js`, `js/i18n.js`. This is LAYER 1
  (share sheet) of Adrian's "set CTC as an option to open PDF/PGN" request; the
  Play-Store "Open with" is layer 2, noted below.
  - **How it works:** `manifest.webmanifest` gains a `share_target` (POST,
    multipart, `params.files` name `file`, accept `application/pdf`/`.pdf` +
    `application/x-chess-pgn`/`application/vnd.chess-pgn`/`.pgn`). There is no
    server, so `sw.js` IS the endpoint: a POST whose path ends `/share-target` is
    intercepted, the file stashed in a separate cache `ctc-shared-inbox` (kept out
    of the `activate` version-wipe), then it redirects to `./?shared=1`.
    `handleSharedFile()` in `js/app.js` (run at the end of `main()`) reads the
    stash, clears the URL flag, and routes: **PDF → `Read.importFile` (Read
    shelf); PGN → `db.createBase(<filename>)` + `Base.openBase` + `Base.importFile`
    (a new collection named after the file).** New i18n `share_unsupported`.
  - **Verified over CDP** (POST a file to the SW endpoint, then load `?shared=1`):
    a shared PDF lands in the Read shelf; a shared PGN creates a base "Opening
    Lines" with its games. Both harnesses still green (offline boot + caching
    unaffected by the POST handler).
  - **REQUIRES the app be INSTALLED** (Add to Home Screen, or the Play Store TWA)
    — a share target can't attach to a plain browser tab. Android/Chrome only
    (iOS Safari doesn't support Web Share Target). PGN via the SHARE sheet only
    appears if the sender labels it `.pgn`/a chess-pgn MIME; some senders send
    octet-stream and won't match — layer 2 fixes that.
  - **LAYER 2 web-side DONE (2026-09-01, follow-up):** `manifest.webmanifest` now
    also has `file_handlers` (PDF + PGN → action `./?open-file=1`), and `js/app.js`
    handles the File Handling API: `handleIncomingFiles()` (renamed from
    handleSharedFile, still called at the end of `main()`) sets a
    `window.launchQueue` consumer that reads an opened file and feeds the SAME
    `routeIncomingFile()` the share sheet uses. `sw.js` bumped to **v99**. This is
    what makes CTC eligible for "Open with" / "Set as default". launchQueue can't
    be exercised headlessly (no OS file-open), so it's UNVERIFIED on device.
    **KEY CLARIFICATION for Adrian:** this does NOT need a *published/approved*
    Play Store app — it needs the **TWA rebuilt** (so its Android manifest carries
    the share + file intent filters) and reinstalled; an internal-testing build or
    a sideloaded signed APK is enough. The plain web Share Target does not reach
    the TWA; the TWA is a separate Android app.
  - **[STALE — superseded 2026-09-29, see top entry. The intent filters shipped
    in TWA 1.0.4; "Open with" was then fixed in 1.0.5 via a LauncherActivity
    patch. Do NOT follow the steps below, and do NOT run `bubblewrap update`.]**
    **LAYER 2 Android-side — still to do in the TWA/Bubblewrap project (NOT in this
    repo; only `.well-known/assetlinks.json` lives here):** run `bubblewrap update`
    to pull the new web manifest (Bubblewrap translates `share_target` +
    `file_handlers` into the Android intent filters), then `bubblewrap build`, then
    install the new APK/AAB on the phone (internal test or sideload). If
    Bubblewrap's auto-translation is incomplete, hand-add to the TWA activity's in the Bubblewrap/Android project add intent filters
    to the TWA activity:
    `<intent-filter><action VIEW/><category DEFAULT/BROWSABLE/><data mimeType="application/pdf"/></intent-filter>`
    and for PGN a filter matching the extension (no reliable MIME):
    `<data android:scheme="content"/><data android:host="*"/><data android:pathPattern=".*\\.pgn"/>` (also a `file` scheme variant). Bubblewrap
    exposes this via the `shareTarget`/`fileHandlers` fields in `twa-manifest.json`
    (or hand-edit `AndroidManifest.xml` post-`bubblewrap init`). The TWA forwards
    the opened file to the web app as a launch/share; the same `handleSharedFile`
    path consumes it. Also add `"file_handlers"` to the web manifest for
    installed-PWA "Open with" where the browser supports it. Test on a real device.

- **READ TAB — PIECE COLOUR FIX + CONFIRM-AND-CORRECT REVIEW STEP + REOPEN BOOK
  AT PAGE (2026-09-01).** Committed on `main`. `sw.js` bumped v96 → **v97**.
  Changed `js/diagram.js`, `js/read.js`, `js/i18n.js`, `js/app.js`. Adrian
  confirmed the queens fix works (teach 1st → later diagrams auto-read); the
  remaining complaints were wrong piece COLOURS/types in Setup, having to bounce
  back to Read to compare/correct, and Read reopening on the shelf.
  - **(A) Piece colour (`js/diagram.js`):** edge/shape matching can't tell a
    hollow white piece from a solid black one of the same type, so colours got
    swapped. Added a square-INDEPENDENT `colorScore` in `cellFeature` = where the
    cell CENTRE (the piece body) sits within the cell's own min→max luminance
    (0 = dark centre/black, 1 = light centre/white); using the cell's own range
    cancels the square shade. `buildTemplatesFromGrid` learns each colour's
    average `colorScore` → `colorRef` (only when the two separate by > 0.15).
    `classifyBoard` takes the TYPE from the shape and re-cases the COLOUR from
    `colorScore` — but CONSERVATIVELY: only when the fill is decisively past the
    midpoint (`band = (white-black)*0.25`), else it trusts the shape. A first,
    non-conservative version + a square-relative luminance version both REGRESSED
    Stage-2 (`calibConfirm`/`laterDiagramOk`) — the conservative center-vs-range
    signal is the one that passed. Do NOT revert to a raw or square-relative
    luminance colour signal.
  - **(B) Confirm-and-correct review step (`js/read.js`):** `teachPieces` now
    takes `opts = { review, initialGrid }`. In review mode it PRE-FILLS the board
    with the classified position, shows it beside the source crop, and "Open"
    (`read_review_open`) hands the corrected position to Setup WITHOUT rebuilding
    templates; Cancel just returns to the reader. `onLongPress`'s classify path
    now always goes through this instead of `openInSetup(res.fen)` — so any
    misread (colour/type/edge phantom) is fixed in place against the image rather
    than by bouncing back to Read. New i18n `read_review_title/body/open`.
  - **(C) Reopen book at page (`js/read.js` + `js/app.js`):** `showScreen` used to
    `Read.closeBook()` on leaving Read and `Read.refresh()` (shelf) on entering.
    Now leaving calls `closeBook(true)` which remembers `lastBookId`, and entering
    calls new `Read.onEnter()` which reopens that book at its saved page (the
    reader's Back button still clears it → shelf). Verified over CDP:
    leave→return reopens at the same page (`REOPENED_AT_PAGE: true`).
  - **Verified over CDP:** both harnesses green; the review modal renders
    pre-filled with the read position + source image + palette + Open/Cancel;
    reopen-at-page works. **STILL owed (device):** Adrian to confirm colours are
    right now and the review flow feels good. The edge-phantom over-detection on
    some diagrams remains (the review step is how the user removes the extras);
    a real detection-precision pass (sub-pixel grid) is still a separate follow-up.

- **READ TAB — LONG-PRESS NO LONGER DIES AFTER A FEW USES + FIXES THE "CRAZY
  ZOOM" (leaked phantom pointer) (2026-09-01).** Committed on `main`. `sw.js`
  bumped v95 → **v96**. One-spot change in `js/read.js` (`onDown`'s long-press
  timer). Adrian confirmed the queens fix works (first diagram teaches, later
  diagrams auto-read correctly); the remaining reader breakage was this:
  - **Root cause:** a long-press fires `onLongPress`, which opens a modal
    (calibrate / tap-to-teach) or navigates to Setup WHILE THE FINGER IS STILL
    DOWN. The eventual `pointerup`/`pointercancel` then lands off `#read-stage`,
    so `onUp` never runs and the pointer entry is never removed from the
    `pointers` Map. The leaked phantom pointer means the NEXT `onDown` sees
    `pointers.size === 2` → `startPinch()` and returns → the long-press never
    arms, and any move runs `doPinch()` → the reader zooms in/out on its own.
  - **Fix:** the moment the long-press fires, reset the gesture state
    (`pointers.clear(); longState = null; pinch = null;`) before calling
    `onLongPress(x, y)` with the captured coords. The current gesture is
    consumed anyway, so this is safe.
  - **Proven over CDP** (repeated long-press with NO pointerup between, i.e. the
    finger lifts off-stage): BEFORE the fix attempt 1 opened the modal and
    attempts 2/3/4 did NOT (matches "after the 3rd time it does nothing"); AFTER,
    all four open. Both harnesses still green.
  - **Adrian's other question — "why decode the whole PDF?":** the continuous-
    scroll reader renders a BUFFER of pages around the view as you scroll (not the
    whole book, and long-press samples only the pressed page). It is still heavier
    than the old one-page reader. Not changed here; if it feels heavy on device, a
    follow-up is to shrink the buffer / throttle `renderSlot`. STILL owed: confirm
    on a real phone that long-press now survives repeated use and the zoom is calm.

- **READ TAB — "IS THIS THE STARTING POSITION? → YES" NO LONGER POISONS
  CALIBRATION (the real cause of the board-full-of-queens) (2026-09-01).**
  Committed on `main`. `sw.js` bumped v94 → **v95**. Changed `js/read.js` and
  `js/i18n.js`. THIS is the actual root cause of Adrian's "completely wrong
  suggestion", not the CV occupancy (that fix stands): the first long-press in a
  book calls `calibrate()`, which asks "Is this the starting position?". Tapping
  **Yes** built the piece-font by assuming the 32 opening pieces on their start
  squares. On an ENDGAME diagram (where the answer is always No) that maps piece
  labels onto empty/other squares → garbage templates saved on the book → every
  later diagram classifies to a shelf of queens. Adrian kept tapping Yes (the
  question read like "confirm this position"), and it also dumped him into Setup
  with the plain start position ("no pieces placed").
  - **Fix (`calibrate()` in `js/read.js`):** the Yes branch now VERIFIES before
    trusting the answer — it builds the start-templates, classifies the same board
    with them, and only accepts if it reads back as EXACTLY the start
    (`chk.confident && chk.fen.split(' ')[0] === START_FEN.split(' ')[0]`).
    Otherwise it toasts `read_calib_not_start` and falls through to `teachPieces`
    (tap-to-teach) instead of saving garbage. Verified over CDP: a wrong Yes on
    Hellsten p20 → `looksLikeStart:false`, guard fires; Stage-2 `calibConfirm`
    (a real synthetic start) still saves templates and `placementOk`.
  - **UX (`js/i18n.js`):** reworded `read_calib_title`/`read_calib_body` to say
    explicitly "only if the diagram is the standard opening with all 32 pieces —
    almost no endgame diagram is"; the "No" button is now **"Place by hand" /
    "Colocar a mano"**; added `read_calib_not_start`.
  - **IMPORTANT for existing books:** a book Adrian already mis-calibrated has the
    GARBAGE templates SAVED (ver 3, so not auto-discarded). It must be re-learned:
    the book card's ⋯ menu → "Re-learn the pieces" (`read_recalib`, clears
    templates), or delete + re-add the book. Then the next long-press re-runs the
    guarded calibrate. This is a per-book manual step; there is no auto-heal.
  - **Still open / next:** the first long-press per endgame book now correctly
    routes to tap-to-teach, which means placing the first diagram's pieces by hand
    (fine for a simple K+P study, tedious for a 30-piece middlegame). If Adrian
    wants to skip that, the follow-up is auto-detecting the start (drop the
    question entirely) or a universal font. Also STILL unverified on a real
    phone: whether the long-press even fires reliably on the native-scroll reader
    (see the entry below) — Adrian must confirm on-device.

- **READ TAB — AUTO-ZOOM FIXED + LONG-PRESS MADE MORE FORGIVING; SENTRY NO LONGER
  FIRES ON LOCALHOST/HEADLESS (2026-09-01).** Committed on `main`. `sw.js` bumped
  v93 → **v94**. Changed `js/read.js` and `index.html`. Context: the continuous-
  scroll reader rebuild (`b28357e`) introduced reader regressions the user hit on
  the DEPLOYED phone app; and headless test runs were polluting the real Sentry
  project (HeadlessChrome events tagged `production`, e.g. an old `kvGet`
  NotFoundError).
  - **Auto-zoom / self-zoom (CONFIRMED + FIXED):** `onResize` reset `R.zoom = 1`
    and re-laid-out on EVERY window resize. Mobile browsers fire `resize` on every
    address-bar show/hide during a scroll (a HEIGHT-only change), so the reader
    kept zooming and jumping on its own. Fixed: `onResize` now tracks
    `lastInnerW` and returns early unless the WIDTH actually changed (rotation /
    real resize). Reproduced over CDP: a same-width `resize` reset a 2× zoom to 1×
    before, and preserves it after (`zoomResetByResize: false`). This reflow was
    also firing mid-long-press, which likely contributed to "can't select".
  - **Long-press "can't select":** the rebuilt reader scrolls with the phone's
    NATIVE `touch-action: pan-y`, which competes with the stationary hold (native
    scroll steals the touch / drift cancels it) — the old reader owned all touches
    with `touch-action: none`, so long-press was reliable there. Couldn't fully
    reproduce headlessly (synthetic pointers don't trigger native scroll — clean
    and jittered holds both fire in the harness). Made it more forgiving:
    `LONG_SLOP = 16` (was reusing `TAP_SLOP = 10`) so natural hold drift doesn't
    cancel, plus the onResize fix removes the mid-hold reflow. **This may not fully
    fix it on a real finger** — if it persists, the proper fix is a gesture rework
    (e.g. own the touch during a pending hold and hand-roll scroll for that drag,
    trading some native momentum) and MUST be tested on Adrian's device. Do NOT
    claim it fixed without device confirmation.
  - **Sentry gate:** `index.html` no longer uses a static `<script src>` for the
    Sentry loader. An inline gate injects it ONLY when NOT on localhost /
    127.0.0.1 / a private LAN IP / `.local` / a Headless UA. Verified headless:
    `window.Sentry` is undefined, no sentry script, zero sentry network requests.
    The DSN/config are unchanged for the real deployed site.
  - Both committed harnesses still green (`tools/cdp-verify.mjs` Stage 1 —
    painted/offline/tab-unchanged; its `turn`/`swipe` fields read `undefined`
    because the scroll rebuild changed page-turning and those checks are now stale,
    NOT from this change; `tools/cdp-verify-stage2.mjs` Stage 2 all true).
  - NOTE for the next session: the old `kvGet`-at-`db.js:251` Sentry error was
    from an OLDER build (line numbers don't match current `db.js`, where 251 is
    inside the playHistory cursor) and a transient headless DB state — not a
    current live crash. The reader's `turn`/`swipe` harness checks are stale vs
    the scroll reader and should be updated.

- **BOTTOM MENU BAR TIGHTENED TO ONE ROW — ☰ LEFT, SCREEN NAME CENTRED, KAEL
  RIGHT, DIVIDER GONE (2026-09-01).** Committed on `main`, NOT pushed/deployed
  yet (Cloudflare Pages; commits not pushed). **Pure CSS** — only `css/style.css`
  changed among precached files, so `sw.js` bumped v92 → **v93** (v92 was the
  concurrent "Move Delete account…" commit `6dbb881`; the v93 bump is what covers
  THIS css change). NO html/js touched, so tap-to-open and every `#tabmenu` /
  `#kael` behaviour is byte-identical in logic (verified: menu still opens).
  - **What changed (all in `css/style.css`):** `#tabmenu` was a centred gold pill
    (`☰ Análisis`) with a `border-top` divider above it, and Kael floated as a
    separate FAB *above* the bar. Now `#tabmenu` is one slim row: `#tabmenu-btn`
    is a full-width transparent grid (`grid-template-columns:1fr auto 1fr`) with
    the ☰ pinned left and `#tabmenu-label` centred, `margin-right:44px` reserving
    Kael's spot. The `border-top` divider is REMOVED. The row rests at
    `opacity:.58` ("faded while you use a tab so the screen feels fuller") and
    returns to `opacity:1` on `body.menu-open` / `:focus-within`. `#kael-corner`
    `bottom` moved 62px → `calc(2px + safe)` so Kael sits ON the row's right, and
    its idle `transform` changed `translateX(34px)` → `translateX(0)` so Kael
    rests fully in place but faded (own `opacity:.55`) instead of parking as a
    sliver off the edge — he's in the chrome strip below the board now, so the old
    "keep him off the board" park was no longer needed. `.speaking` (slide-in +
    full opacity + quote bubble) is unchanged.
  - **The label centre sits ~20px left of dead-centre on purpose** — the
    `margin-right:44px` Kael reserve. It reads centred between the ☰ and Kael
    in-app; do NOT "fix" it by dropping the reserve or Kael and the label collide.
  - **Verified over headless Chrome (CDP), throwaway probes since deleted** (scratch
    server + `_shot_tmp.mjs`/`_check_tmp.mjs`, removed, NOT committed). 375px, **ES
    and EN, light and dark** — before/after screenshots shown to Adrian. Functional
    check: `#tabmenu` height **42px** (was ~53px incl. the 1px divider → ~11px /
    ~20% shorter), `documentElement.scrollWidth == 375` (**no horizontal
    overflow**), resting opacity `.58` → `1` on menu open, tapping `#tabmenu-btn`
    still opens the slide-up sheet, geometry ☰(cx 24)·label(cx 165)·Kael(cx 339)
    on one vertical band.
  - **Reader NOT touched** (no `js/read.js` / `js/diagram.js` / reader DOM change),
    so the two CDP reader harnesses were **not re-run** per the standing rule —
    this is global bottom-chrome CSS that does not exercise reader logic.
  - **Only `css/style.css` + `sw.js` (v93) were staged here.** The concurrent
    session's `HANDOFFS.md`, `docs/superpowers/plans/2026-08-14-friends-system.md`
    and `tools/stage2-shots/` were left untouched.

- **DELETE ACCOUNT MOVED FROM THE PROFILE TAB INTO SETTINGS (2026-09-01).**
  Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped v91 → **v92**.
  Changed `index.html`, `js/app.js`, `js/i18n.js`, `js/legal-data.js`.
  - The destructive "Delete account" control no longer shows on the Profile tab.
    Removed `#profile-delete-account-btn` from `index.html` and its two wirings in
    `Profile` (the `init()` onclick and the `renderAccount()` show/hide toggle) —
    both had to go or `$('profile-delete-account-btn')` would be null and throw.
  - It now lives in the Settings sheet (`openSettings()` in `js/app.js`), appended
    after the Legal section under a new `account_section` label ("Cuenta"/"Account")
    as a full-width `.btn.danger`, and ONLY when `Auth.user` (nothing to delete when
    signed out). It calls `close(null)` first, THEN `Profile.deleteAccountFlow()`
    after 120ms, so the flow's confirm + reauth dialogs don't stack on the modal —
    same pattern as the tour button. The flow itself (`Profile.deleteAccountFlow`,
    `Auth.deleteAccount`) is unchanged.
  - Terms §18 wording updated in BOTH languages (`js/legal-data.js`): "desde
    Perfil"/"from Profile" → "desde Ajustes"/"from Settings", so the legal text
    still names where deletion lives. (Privacy policy already said "…and from
    Settings", left as-is.)
  - Verified over headless Chrome, 375px: Profile tab has no delete button; the
    Settings sheet builds with zero console errors and shows no delete entry when
    signed out; with a faked `Auth.user` it shows the red "Eliminar cuenta" button
    under a "Cuenta" label. No harness run — this is Profile/Settings UI, outside
    the reader harnesses.

- **BOARD — MOVE/SELECT HIGHLIGHT TINTS THE SQUARE, NOT THE PIECE (2026-08-31).**
  Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped v90 → **v91**.
  CSS-only, `css/style.css` (precached). The last-move / selected highlight is a
  full-square `::before` tint (`.sq.lastmove::before` = `var(--hl)`,
  `.sq.lastmove-outbook::before` = gold, `.sq.selected::before`); because the
  piece `<img>` was non-positioned it painted BELOW the positioned pseudo-element,
  so the tint sat over the figurine. Fix: `.sq img` gets `position: relative;
  z-index: 1` (piece above the tint); the move-target dot/ring
  (`.sq.dest::after`, `.sq.capture-dest::after`) get `z-index: 2` so a capture
  ring still frames the enemy piece on the target square. Verified over headless
  Chrome, 375px, light + dark: highlighted squares tint the square only, pieces
  render clean on top. Shared board component, so this applies in every tab.
  `.sq.check` (a background gradient) was already under the piece — untouched.

- **READ TAB — CONTINUOUS VERTICAL SCROLL (replaced one-page-at-a-time)
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped
  v89 → **v90** (index.html/css/js/read.js/i18n.js all precached). Design doc:
  `docs/superpowers/specs/2026-08-31-reader-continuous-scroll-design.md`.
  - **What changed:** the reader is now a native vertical scroller. `#read-stage`
    (still in `SWIPE_SAFE`) is `overflow:auto` and holds `#read-col`, a column
    sized to the whole book so the scrollbar is honest; only the pages near the
    viewport (+1 buffer each side) get a `<canvas>`, recycled from a small pool as
    you scroll (`R.slots` Map + `R.pool`). Memory stays flat on a 194-page book.
    Layout is in base (zoom-1) units × `R.zoom`: `layout()`, `colW/slotH/pageH/
    pageTop/totalH`, `syncSlots()`, `ensureSlot/releaseSlot/renderSlot`. Slot
    height comes from **page 1's aspect ratio** (uniform; odd pages letterbox).
  - **Kept working (all proven by the harnesses + a CDP pinch/visual probe):**
    pinch-zoom is now whole-column (`setZoomAbout` resizes the column and adjusts
    scrollLeft/Top about the pinch midpoint; `touch-action` flips to `pan-x pan-y`
    when zoomed so a finger pans horizontally; pages re-render crisp after the
    zoom settles — `scheduleReRender`). `renderSlot` keeps the old **OVERSAMPLE
    1.5** (capped at 2400 device px) so diagram detection sees the resolution it
    was tuned for. Long-press → diagram now finds the page slot under the finger
    (`slotAtClient`) and samples THAT canvas via `getBoundingClientRect` (maps
    correctly at any zoom). Progress: the top-most visible page is saved; reopen
    scrolls the saved page to the top.
  - **Nav bar:** the ◀ ▶ arrows and horizontal-swipe page-turn are GONE (scroll
    replaces them). The page indicator `#read-page-ind` is now a **tap-to-jump**
    button (`jumpToPage` → `askText` → `scrollToPage`). New i18n keys `read_jump`,
    `read_jump_title`. `read_prev`/`read_next` strings are now unused (harmless).
  - **Removed from the old single-canvas model:** `#read-canvas`, the global
    `#read-blank` (now per page slot), `renderPage`, `clampAndApply`, `R.tx/ty/
    baseW/baseH/renderTask/renderToken`, `nextPage/prevPage`, `SWIPE_TURN`.
  - **Harnesses updated** (they asserted the old single-canvas + transform + ◀▶
    model): `tools/cdp-verify.mjs` (open/turn/memory/swipe now drive the scroller)
    and `tools/cdp-verify-stage2.mjs` (long-press steps use `__pageCanvasAt` +
    rect mapping; `lpNoBoard` long-presses the page's TEXT, a real "not a board"
    region — dead-centre white space can trip a min-gap noise grid in
    `detectBoard`, unchanged pre-existing CV behaviour, out of scope here). BOTH
    green. Run: serve the repo + `/__test-book.pdf`, then
    `node tools/cdp-verify.mjs <url>` / `...stage2.mjs <url>`.

- **READ TAB — DIAGRAM READER FIXED ON BOLDLY-HATCHED BOARDS (was a shelf of
  phantom queens) (2026-08-31).** Committed on `main`, NOT pushed/deployed yet.
  `sw.js` bumped v88 → **v89**. Changed `js/diagram.js` and `js/read.js` (both
  already in sw ASSETS); no new files. This is the fix for Adrian's report that
  long-pressing a diagram in "Excelling at Chess Calculation" (Aagaard, a
  194-page JBIG2 scan in `ChessPuzzleImport\`, and the WA0033 copy) gave a
  completely wrong board — a black queen on almost every square.
  - **Root cause (found by CDP probe, not guessed):** detection was CORRECT (the
    grid overlay sat dead on the board). The bug was OCCUPANCY. `cellFeature`'s
    `lumStd` (luminance spread) decided empty-vs-piece, and a **boldly diagonally
    hatched empty square** spreads luminance ~100 — as wide as a real piece — so
    every hatched empty read as occupied, then its busy texture matched the
    busiest template (queen). The learned `emptyThresh` (~100) couldn't separate
    them. Proven the OLD code ALSO exploded on Dvoretsky p30 (a `k` on every
    hatched square), so `lumStd` occupancy was fragile, not Aagaard-specific — it
    only ever worked when calibration happened to learn a lucky threshold.
  - **The fix (`js/diagram.js`):** `buildTemplatesFromGrid` now also builds a
    **per-colour empty-square template** (`empties[0]`/`empties[1]`, the averaged
    edge-feature of the labelled empty squares of each colour) and bumps the
    template record to **ver 3**. `classifyBoard` decides occupancy by
    `d1 >= cosDist(feat, emptyTemplate[parity])` — a cell is empty unless it sits
    strictly closer to some piece template than to its colour's empty pattern.
    This reads a hatched EMPTY as empty (it hugs the empty pattern) AND keeps a
    dark piece on a dark hatched square (nearly uniform → `lumStd` would miss it,
    but `d1≈0 ≪ dEmpty`). `lumStd`/`emptyThresh` are RETAINED as the ver-2
    fallback for legacy templates or a colour with < 2 empties. **Do NOT
    reintroduce a margin or a lumStd-OR:** a margin toward "occupied" brings the
    queens back; a lumStd-OR floor silently drops dark-pieces-on-hatch; a learned
    absolute `occThresh` was tried and was worse — all three were measured and
    rejected. Plain `d1 >= dEmpty` is the one that never silently drops a real
    piece.
  - **`js/read.js`:** `openBook` now DISCARDS `book.templates` when `ver < 3`
    (one line), so a book calibrated before this fix re-learns with the new method
    on the next long-press instead of reusing its broken ver-2 read. New
    calibrations (`buildTemplates` start-position, or tap-to-teach) are ver 3.
  - **Verified over headless Chrome (CDP), 375px, throwaway probes since deleted,
    no book copied into the repo** (streamed from `ChessPuzzleImport\`): Aagaard
    p13 left diagram now reads a structurally correct position — **2 queens (the
    real d7/g3 queens), was ~21** — `confident:false` so the app shows its
    "check the board" warning. Dvoretsky p30 (hatched): garbage → the 5 real
    pieces correct. Hellsten p20 (wood): unregressed. Synthetic Stage-2 still
    reads a clean board EXACTLY and `confident:true`. Both committed harnesses
    green (`tools/cdp-verify.mjs`, `tools/cdp-verify-stage2.mjs`).
  - **KNOWN RESIDUAL (not chased, honest-degradation covers it):** on some
    diagrams a few PHANTOM pieces still appear, clustered on the board's edge
    columns — a pre-existing DETECTION-ALIGNMENT quantisation (cell rounded to an
    int px drifts a few px across 8 cells, so edge cells catch the board border).
    This is NOT the occupancy rule and must not be patched there. It reads
    `confident:false`, so the user reviews/edits in Setup or re-teaches. A proper
    fix is sub-pixel grid refinement in `findGrid`/`detectInWindow` — a separate
    task (see the two OTHER open reader tasks Adrian raised this session, below).

- **READ TAB — "THIS PAGE CAN'T BE DISPLAYED" FALLBACK + TWO JBIG2 BOOKS CONFIRMED
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` bumped
  v87 → **v88**. Changed `js/read.js`, `js/i18n.js`, `index.html`, `css/style.css`
  — all already in sw ASSETS, no new files, no wasm touched (the v87 JBIG2 wiring
  is left exactly as-is).
  - **What it does:** a content page that renders blank because its scanned image
    uses an encoding pdf.js still can't decode (a *future* JBIG2/JPEG2000-class
    book we haven't vendored a wasm for) now shows a clear bilingual in-reader
    message instead of a silent white page. New i18n keys `read_blank_title` /
    `read_blank_body` (ES + EN), new overlay `#read-blank` inside `#read-stage`,
    styled with the reader's own tokens (`--panel2` / `--text` / `.hint`) — NOT a
    new visual style.
  - **The heuristic (Adrian chose "blank + any failed image"):** after a page
    renders, `maybeFlagUndecodable()` shows the notice ONLY when BOTH hold: (1)
    `isCanvasBlank()` — the canvas downscaled to 64px wide has ≤2 non-white
    thumbnail pixels, so a page number or a line of text keeps a page off the
    "blank" list; AND (2) `pagePaintsImage()` — the page's operator list contains
    an image-paint op (`paintImageXObject`/`…Repeat`/`paintInlineImageXObject`/
    `paintJpegXObject`) that was supposed to paint but didn't decode. A genuinely
    blank page (a chapter break) has NO image op → stays silently blank, no
    message. Because the check runs only on an all-white canvas, it can NEVER
    cover text the reader could otherwise have shown. `getOperatorList()` is
    fetched only for blank pages, so a normal page pays nothing. The notice is
    hidden at the top of every `renderPage` so a page turn clears it.
  - **Verified over headless Chrome (CDP), 375px, throwaway probe since deleted,
    no book copied into the repo** — real PDFs streamed from `ChessPuzzleImport\`
    by a scratchpad server only for the run. The two previously-untested JBIG2
    books now render: **"00. Fundamental_chess_endings…encyclopaedia…" →
    173,278 non-white px** and **"2. Fundamental Chess Endings - Frank Lamprecht"
    → 173,278 px** (identical size + page count + pixel count — they are the same
    FCE scan under two filenames; both render, no message). Controls unregressed:
    Silman 80,532 px, Dvoretsky 703,258, Hellsten 389,151 — all draw, none show
    the message. Fallback discriminator proven on a synthetic 3-page PDF: a
    full-page undecodable image (garbage DCTDecode) → blank + **message shown**
    (ES default AND EN after toggle); a truly blank page with no image → blank
    but **no message**; a text page → not blank, no message. Theme check: overlay
    background follows `--panel2` in light (`rgb(237,240,246)`) and dark
    (`rgb(33,43,57)`), message shown in both. Both committed harnesses re-run
    **green** (`tools/cdp-verify.mjs` Stage 1; `tools/cdp-verify-stage2.mjs` Stage
    2 — the change is inert for Stage 2, whose test book has only text pages).

- **READ TAB — LINE-ONLY WHITE BOARD VERIFIED, NO CODE CHANGE NEEDED (2026-08-31).**
  Doc-only commit; `js/diagram.js` and `sw.js` are UNCHANGED (still v86). This
  closes the last untested board style: thin black grid lines on pure white, NO
  shading and NO hatching.
  - **No real line-only book exists on this device to test on.** Of Adrian's five
    endgame PDFs only two render at all in the app's pdf.js (v6.3.289): Dvoretsky
    (hatched scan) and Hellsten (shaded vector) — both already verified, neither
    line-only. The three that *would* show line-only diagrams — Silman, Lamprecht
    (`2. Fundamental…`), and the `00.` encyclopedia — are **JBIG2-scanned and
    render BLANK** (see the separate defect entry below). So a REAL line-only test
    stays theoretical; this was verified on a **faithful synthetic** line-only
    board instead (pure-white squares + 1–2px black grid lines + the app's own
    figurine SVGs + surrounding book text), which exercises the exact CV paths in
    question. Throwaway CDP probes, deleted after (pattern per the scanned-book
    entry below).
  - **Result: line-only is one of the EASIEST styles, not a weak one.** Detected at
    the right cell size with a pixel-aligned 9×9 overlay (eyeballed), taught from
    the start, and read back to the **exact** start AND a midgame FEN,
    `confident=true`, `maxD1=0`. Text on the page → NO board. Verified clean (1px),
    thick (2px), and scan-noisy (±10 luminance) variants.
  - **The three flagged failure points were each checked and none is a bug:**
    1. *Empty `lumStd` / grid-line bleed via INSET=0.07.* With 1px lines empties
       have `lumStd≈0` (no bleed); with 2px lines some bleed lifts the worst empty
       to ~28.6, but the learned `emptyThresh` rises with it (27→44) and still sits
       well below the flattest piece (~54–60), so occupancy stays correct. Real,
       but self-correcting — not a defect.
    2. *Thin-line teeth / `lineContrast`.* A black-on-white line is a FULL-contrast
       edge — taller and sharper than a shade flip — so `findGrid`'s comb locks
       hard and `lineContrast` clears 1.35 easily. Thin lines are not weak here.
    3. *`validateCheckerboard`'s flat branch.* Confirmed it is exactly what admits
       this style: empty-square brightness spread was 0–0.3 (< 26) in every
       variant → `return true`. The parity test is never reached (correctly — a
       line-only board has no parity to separate).
  - **Honest degradation holds:** the scan-noisy midgame classified with clean
    templates came back `confident=false` (1 uncertain), never a confident wrong
    board — the Setup-plus-flip fallback covers it. **Recommendation was: do NOT
    add any tweak.** Detection already reads line-only correctly or flags itself;
    a threshold change would only risk the two real styles for a case that already
    passes. Left as-is by design.
  - **Both committed CDP harnesses re-run green** (`tools/cdp-verify.mjs` Stage 1;
    `tools/cdp-verify-stage2.mjs` Stage 2 — every check true; the only `false`s are
    the intended `confident:false` honest-degradation check and `cardOverflow:false`).
    No source changed, so the reader/i18n/375px/light/dark surface is identical to
    v86.

- **READ TAB — JBIG2 / JPEG2000 SCANNED PDFs NOW RENDER (WAS BLANK), FIXED (2026-08-31).**
  `sw.js` cache bumped v86 → **v87**. Changed `js/read.js`; added two vendored
  wasm files. NOT a diagram-detection bug — the pages simply never drew.
  - **Symptom (before):** Silman, `2. Fundamental Chess Endings - Frank Lamprecht.pdf`,
    and `00. Fundamental_chess_endings…encyclopaedia….pdf` opened in the Read tab
    and showed **pure white pages** (0 non-white pixels on content pages). Each is a
    single full-page JBIG2-encoded scan. Cause: pdf.js v6 fetches an image-decoder
    wasm from inside its worker (`${wasmUrl}jbig2.wasm`) and `loadPdfjs()` never set
    `wasmUrl`, so decode failed (`Jbig2Error: JBig2 failed to initialize`). JPEG2000
    scans fail the same way via `openjpeg.wasm`.
  - **The fix:** vendored **`vendor/jbig2.wasm` (~102 KB)** and **`vendor/openjpeg.wasm`
    (~246 KB)** — the exact v6.3.289 decoder wasm, extracted from the `pdfjs-dist-6.3.289.tgz`
    already in the local npm cache (no download). Added a module const
    `PDF_WASM_URL = new URL('../vendor/', import.meta.url).href` in `js/read.js` and
    pass `wasmUrl: PDF_WASM_URL` in **both** `getDocument()` calls (open + add-cover).
    The worker fetches the wasm itself; `vendor/` is CACHE_FIRST so it is stored on
    first book-open and then works offline — **deliberately NOT in `sw.js` ASSETS**,
    same pattern as the 1.3 MB pdf worker (keeps first launch light for non-Read
    users). sw.js got only a documenting comment + the v87 bump.
  - **Chose wasm over the two `*_nowasm_fallback.js` (~583 KB) and `qcms_bg.wasm`
    (ICC, 94 KB):** the JS fallbacks only fire if WebAssembly itself fails (never in
    the TWA) — dead weight; qcms is a *separate* console warning, not the blank-page
    cause. Adrian confirmed "two wasm only".
  - **Verified over headless Chrome (CDP), throwaway probe since deleted, no book
    copied into the repo** — the real PDFs were streamed from `ChessPuzzleImport\`
    by a scratchpad server only for the run. Page 30, 375px:
    **Silman JBIG2 → 79,129 non-white px (was 0), Jbig2Error gone**; Dvoretsky
    (692,774 px) and Hellsten (386,511 px) **still render — no regression**. Both
    committed harnesses re-run green (`tools/cdp-verify.mjs` Stage 1 — painted, page
    turns, offline boot, theme light+dark, swipe; `tools/cdp-verify-stage2.mjs`
    Stage 2 — every check true bar the intended honest-degradation `confident:false`).

- **READ TAB — DIAGRAM DETECTION ON A GENUINELY SCANNED BOOK (2026-08-31).**
  Committed on `main` (`7d4a8ba`), NOT pushed/deployed yet. `sw.js` cache bumped
  v85 → **v86**. ONE-LINE change in `js/diagram.js` (already in sw ASSETS); no new
  files. Closes the last open gap from the entry below (scanned raster/JPEG book
  was untested).
  - **Tested on a real SCAN** — `ChessPuzzleImport\1. Dvoretsky's Endgame Manual
    - 5th Edition.pdf` (JPEG pages, **0 embedded fonts** — a true scan, unlike the
    vector-rendered Hellsten). Its dark squares are **diagonally hatched**, not
    solid-shaded, which is what exposed the bug.
  - **The fix (one gate):** `findGrid`'s weakest-tooth gate was `mn < mean * 1.3`.
    A hatched board's internal white↔hatch HORIZONTAL boundaries are systematically
    lower-contrast than a solid board's, so across a shelf of endgame diagrams the
    weakest horizontal tooth ran only **1.16–1.27× the mean** (vertical ~1.4×). The
    1.3× gate rejected the CORRECT grid on nearly every real page — pages 1-8/1-10
    never detected at any window; 1-6 detected only by luck at a larger window.
    **Relaxed to `mean * 1.15`.** Text is still excluded by the two strong
    downstream filters — `lineContrast ≥ 1.35` AND needing a grid on BOTH axes (a
    text column has no periodic vertical lines). Re-verified: real scanned body
    text on the same pages → NO board. Do NOT raise the gate back toward 1.3.
  - **Occupancy needed NO change.** `cellFeature`'s `lumStd` cleanly separated the
    hatched empty squares (lumStd ~47) from pieces (~60–116) on real pixels;
    learned `emptyThresh` came out 53–57, comfortably between. The flagged lumStd
    risk did not materialise.
  - **Verified over CDP on real scanned pixels** (throwaway probes, since deleted):
    three diagrams — 1-6 `8/8/5pk1/5r2/R7/5K2/8/8`, 1-8 `8/8/8/4p1p1/8/5P2/6K1/3k4`,
    1-10 `8/4k3/3p4/3P4/2P5/8/8/5K2` — each detected with a **pixel-aligned grid
    overlay**, taught from the true position and read back to the **EXACT FEN,
    confident=true**. Cross-diagram (teach a set missing a piece type → read one
    that has it) → confident=false (honest). Real body-text taps → null.
  - **Skew/noise: recommendation is DON'T add a rotation search.** Stress on a real
    diagram: ≤0.5° skew reads correct/confident; **1–2° is still found but flagged
    `confident:false`** (high maxD1 ~0.5–0.6) — never a confident wrong board;
    heavy per-pixel noise → no board (honest null). Real scans have no meaningful
    skew anyway (Dvoretsky is axis-aligned). The honest-degradation path (Setup +
    the flip button) already covers skew cheaply; a rotation search would add cost
    to the hot path for a case that already fails safe. Left as-is by design.
  - **Both committed CDP harnesses stay green** (`tools/cdp-verify.mjs` Stage 1;
    `tools/cdp-verify-stage2.mjs` Stage 2, all checks). The synthetic harnesses are
    unchanged — no new file. The change is pure CV (thresholds), no UI/i18n, so the
    375px / light / dark / both-language reader surface is identical to v85 (which
    was verified in both themes); the calibration/teach modals are untouched.

- **READ TAB — STAGE 2 HARDENED ON A REAL BOOK + TAP-TO-TEACH + SETUP FLIP
  (2026-08-31).** Committed on `main`, NOT pushed/deployed yet. `sw.js` cache
  bumped to `chess-training-center-v85`. No new files — all changes live in
  `js/diagram.js`, `js/read.js`, `js/app.js`, `js/i18n.js`, `css/style.css`,
  `index.html`, already in the sw ASSETS. This closes the two open gaps from the
  first Stage-2 entry below (never run on a real scan; tap-to-teach not built).
  - **Verified against a REAL printed book** (Adrian's endgame library,
    `ChessPuzzleImport\3. Hellsten … Mastering endgame strategy.pdf`, 484 pp,
    wood-texture shaded boards with a-h/1-8 coordinate labels on all four sides).
    Done over CDP with throwaway probes that were DELETED after (per the standing
    instruction) — the committed harness `tools/cdp-verify-stage2.mjs` stays
    synthetic (no copyrighted book ships), and it was extended with the
    tap-to-teach and flip checks (13 checks, all green). Stage 1
    `tools/cdp-verify.mjs` still green. **The real end-to-end was proven live:
    open the real book → render p20 → long-press the real diagram → detection on
    the live reader canvas → calibration modal → "No" → tap-to-teach modal showing
    the real cropped board.**
  - **Detector fixes in `js/diagram.js` (`detectBoard`), all because a real page is
    two dense text columns, not one clean diagram:**
    1. **Tap-centred, COARSE-TO-FINE window** (`detectInWindow`, fractions
       `[0.16..0.48]` of the short side, smallest first). The old single 0.46
       window spanned the whole page, so the edge profiles were dominated by text
       and the column gutter and the comb never locked. A small window around the
       tap excludes the neighbouring column; it grows only if nothing validates.
    2. **Clip rejection**: a board touching the window edge is discarded (it was
       truncated → wrong period/origin), forcing the search to grow.
    3. **99th-percentile cap** in `findGrid`: flattens one lone off-board spike (a
       gutter / table rule) so periodicity, not a single tall edge, sets the fit.
       Was 0.96 first — too low, it clipped the board's OWN lines when a diagram
       fills the window and broke detection; 0.99 only tames extreme outliers.
    4. **`lineContrast` gate**: grid lines must carry ≥1.35× the edge energy of the
       cell centres. A real board's boundaries dominate; a coincidental grid in
       text is as busy between its lines as on them. This is what kills text false
       positives (a bare squareness/parity test let them through).
  - **Classifier fix — the big one for real books:** occupancy (empty vs a piece)
    was decided by mean gradient ENERGY, which on wood grain gives an empty square
    almost as much energy as a sparse piece → a real board read as ALL EMPTY. Now
    `cellFeature` also returns `lumStd` (luminance std over the cell core) and
    occupancy uses THAT — texture is low-amplitude in luminance, a piece is a big
    blob far from the square shade, so lumStd separates them cleanly. The
    threshold is still learned at calibration (`buildTemplatesFromGrid`, robust
    95th-empty / 5th-piece percentiles), `templates.ver` bumped 1→2. Piece-vs-piece
    matching is unchanged (still the edge-map `feat`). **Result on real pages:
    templates taught from one diagram read OTHER diagrams in the same book to the
    exact FEN** (proven: p30-top taught → p30-bottom and p20 both read correct),
    honestly flagged `confident:false` when the cross-page match loosens.
  - **Tap-to-teach fallback (`js/read.js` `teachPieces`)** — the "No, not the
    start" branch no longer opens an empty board. It shows the detected board
    cropped tight (`cropBoardCanvas(…, 0)`, new `padFrac` arg) under an 8×8 tap
    overlay + a 12-piece palette (+ eraser). The user taps each piece; "Aprender y
    abrir" calls `buildTemplatesFromGrid(img, board, userGrid)` (same features,
    user layout instead of `START_GRID`), saves the templates on the book, and
    opens that exact position in Setup. Won't submit without both kings; Cancel
    falls back to the old blank-editor escape hatch. New CSS `.read-teach-*`, new
    strings `read_teach_*` (both languages). Verified in light AND dark at 375px.
  - **Orientation answer = flip in Setup (NOT label OCR).** New "Girar tablero"
    button (`#setup-flip`, `Setup.flip()` in js/app.js) rotates the placement 180°
    so a Black-at-bottom read is one tap to fix instead of a full re-entry; helps
    every Setup user. `.setup-tools` is now a 3-column grid; string `flip_board`.
    Verified: correct rotation (K/Q swap, colours change ends) and self-inverse.
    Coordinate-label OCR was deliberately rejected — fragile, and against the
    no-ML design, for a rare case a one-tap flip already covers.
  - **Known limits (unchanged, honest fallback covers them):** turn defaults to
    White and castling to `-` (a scan can't prove either — set in Setup); a
    flipped board still reads upside-down and is fixed with the new flip button;
    tap-to-teach only learns the piece types the user actually taps (a later
    diagram with an untaught type reads uncertain, not confidently wrong). Tested
    on ONE real book (Hellsten, vector-rendered wood boards); a genuinely SCANNED
    (raster/JPEG-noise) book or a line-only white board is plausible but untested —
    if one misreads, the lumStd threshold and the parity/flat branch of
    `validateCheckerboard` are the first places to look.

- **READ TAB — STAGE 2: DIAGRAM → BOARD (2026-08-30).** Committed on `main`, NOT
  pushed/deployed yet. `sw.js` cache bumped to `chess-training-center-v84`.
  Verified in headless Chrome over CDP with a NEW harness,
  `tools/cdp-verify-stage2.mjs` (the in-app pane never composites — same reason
  Stage 1 uses CDP). Long-press a chess diagram on a PDF page → read the position
  → open it on the real board. **All 12 automated checks pass.**
  - **New module `js/read.js`'s companion `js/diagram.js`** — pure image work, NO
    DOM and NO import from app.js, so it is unit-testable with a plain ImageData.
    Exports `detectBoard`, `buildTemplates`, `classifyBoard`, `gridToFen`,
    `cropBoardCanvas`, `START_GRID`. **Do NOT fold it into read.js or app.js.**
    Added to `sw.js` ASSETS.
  - **How it reads a board, NO ML and nothing leaves the phone:**
    1. `detectBoard()` finds the 8×8 grid by a **joint comb-correlation search**
       over (square-size, origin) on the vertical/horizontal edge profiles around
       the tap — it slides a 9-tooth comb and keeps the period+phase whose teeth
       all land on profile support. **This replaced a first attempt at "longest
       run of evenly-spaced peaks", which locked onto piece-internal strokes
       (found spacing 15 instead of 44). Do not go back to peak-picking.**
       A checkerboard/flat-paper parity test rejects tables and text blocks.
    2. Classification compares **edge maps** (per-square gradient-magnitude,
       blurred + L2-normalized), NOT raw pixels — an edge map is flat over the
       single-shade square background, so a piece reads the same on a light or a
       dark square. Empty = low edge energy (`emptyThresh`, learned at calibration).
    3. **Calibration is once per book**: the first long-press shows the cropped
       board and asks "¿Es la posición inicial?" One "yes" captures all 12 piece
       templates from `START_GRID` and stores them via
       `db.updateBookMeta(id, {templates})` — a NEW field on the book record, NO
       `DB_VER` bump (still 4), device-only like the Blob.
  - **Where it opens: the existing Setup screen (`Setup.open(fen)` in app.js),
    always — never straight to Analysis.** Setup is the editable board with
    Análisis/Jugar buttons, so a confident read and an unsure read take the SAME
    honest path: the user eyeballs and can fix any square before playing. This is
    the honest-degradation requirement met structurally. `Setup` is now imported
    into read.js; leaving Read for Setup runs `showScreen()`'s leave hook, which
    closes the book. **Verified end-to-end: calibrate → lands in Setup with the
    start position, templates persisted.**
  - **When unsure it says so:** `classifyBoard` returns `confident` = (no square
    with a weak/ambiguous match AND exactly one king each side). `confident=false`
    fires a "check the board" toast but STILL opens Setup with the best guess.
    **Proved live:** templates from one figurine set classifying a diagram drawn
    in the app's OTHER piece set → board still found, `confident=false`,
    `maxD1` 0.112 vs 0.005 for a matching book, FEN still returned. A start and a
    real Ruy-Lopez midgame in the SAME style both read to the **exact** FEN and
    `confident=true`.
  - **Long-press without breaking Stage 1's gestures:** a stationary single
    pointer held 500 ms (`LONGPRESS_MS`) fires, armed only while the gesture is
    still `undecided`; the first swipe/pan movement, a second finger (pinch), or a
    lift disarms it, and `longFired` swallows the trailing tap/​page-turn.
    **Verified the Stage 1 harness still green: page turn, swipe-suppression
    (turns page, tab unchanged), page memory all pass.** Double-tap and pinch
    are untouched (they cancel the timer).
  - **Escape hatch:** the book's ⋯ menu gains "Volver a aprender las piezas" once
    calibrated (`read_recalib`) — clears `templates`, so the next long-press
    re-asks. The right fix when the first "yes" was wrong or the style was misread.
  - **9 new bilingual `read_diagram_*` / `read_calib_*` / `read_recalib*` strings**
    (js/i18n.js), one CSS block `.read-calib-img` (white mat so a light-square
    board stays readable in dark mode — verified in both themes over CDP
    screenshots).
  - **Known limits (do not chase, honest fallback covers them):** turn defaults to
    White and castling to `-` (a scan can't prove either — user sets them in
    Setup); board orientation assumes White-at-bottom (a flipped diagram reads
    upside-down → user fixes in Setup). Detection tuned/verified on synthetic
    diagrams drawn with the app's own figurine SVGs on a shaded board — a faithful
    per-book template scenario, but NOT yet run against a scan of a real printed
    book. Stage 1 still owes its real-finger pinch check on the phone.

- **READ TAB — STAGE 1: PDF READER (2026-08-30).** Committed on `main`, NOT
  pushed/deployed yet. `sw.js` cache bumped to `chess-training-center-v83`.
  Verified in headless Chrome over CDP (the in-app pane never composites, so
  rAF never fires and PDF.js's chunked render stalls there — real Chrome is
  fine; see `tools/cdp-verify.mjs`). Stage 1 is the reader ONLY — NO diagram
  detection (that is Stage 2, unstarted; do not stub it).
  - **New module `js/read.js`** (do NOT fold into app.js). Exports
    `init()`, `refresh()` (draw the shelf), `closeBook()` (destroy the PDF +
    free memory), and `importFile(file)` (the import path, shared by the picker
    and tests). PDF.js is `import()`-ed lazily on first open/add.
  - **PDF.js** = Mozilla pdfjs-dist 6.3.289, Apache-2.0, LEGACY MINIFIED build,
    self-hosted: `vendor/pdf.min.mjs` (precached in sw.js) + the ~1.3 MB
    `vendor/pdf.worker.min.mjs` (NOT precached — cached on first use, like the
    Stockfish wasm; vendor/ is CACHE_FIRST). Shipped WITHOUT cmaps/ and
    standard_fonts/ — add only if a real book renders wrong. Apache-2.0 notice
    added to the open-source section of `js/legal-data.js` (both languages).
  - **Storage:** `js/db.js` is now `DB_VER = 4` — added a `books` store
    (index `openedAt`) via the stepwise `if (e.oldVersion < 4)` pattern
    (in-place upgrade verified: v3 data survives). New db fns:
    `listBookSummaries()` (shelf list, strips the Blob), `addBook()`,
    `getBook()`, `updateBookMeta()`, `deleteBook()`. Book record =
    `{id,name,blob,size,cover(dataURL),pageCount,page,addedAt,openedAt}`.
    `'books'` added to `clearAllLocalData()`; deliberately NOT in
    `clearSyncedProfileData()` (sign-out must not delete an un-uploaded library).
  - **HARD RULE kept:** books NEVER go to Firebase. Firestore sync is
    allowlist-based (`SYNCED_KEYS`, kv-only), so a separate `books` store cannot
    sync. No "back up my books" button — do not add one.
  - **App wiring (js/app.js):** `'read'` added to `SCREENS`, to `MENU_AREA`,
    and to `showScreen()` (refresh on enter, `Read.closeBook()` on leave).
    `Read.init()` in `main()`. `relabel()` refreshes the shelf on language
    switch. capRows() has a Books row (`cap_books`/`cap_books_val` = "limited by
    storage"). `#read-stage` added to `SWIPE_SAFE` so a page-turn gesture can
    never trigger `goAdjacentTab` (verified: swipe turns the page, tab stays).
  - **Menu:** `🔖` "Leer"/"Read" destination in `#tabbar`, between Play and
    Profile; `TAB_ORDER` picks it up automatically.
  - **Quota:** up-front `navigator.storage.estimate()` check refuses a book that
    won't fit (names both numbers, saves nothing — verified); mid-write
    `QuotaExceededError` is caught (single-record tx rolls back). First import
    calls `navigator.storage.persist()` once (kv flag `booksPersistAsked`); a
    quiet shelf line shows only while `persisted()` is false. Shelf shows
    "N books · size · free".
  - **Reader gestures** (all custom, `#read-stage` is `touch-action:none`):
    one finger turns pages / pans a zoomed or tall page, two fingers pinch-zoom
    (max 4×), double-tap toggles 1×/2×. Page position saved (throttled) and
    flushed on close — reopen returns to the same page (verified across close
    AND an offline reload).
  - **Dev tools (not shipped to the app):** `tools/make-test-pdf.mjs`
    (generates a valid N-page test PDF) and `tools/cdp-verify.mjs` (the headless
    verification harness). Serve the app and run
    `node tools/cdp-verify.mjs http://localhost:<port>` after copying a test PDF
    to `__test-book.pdf` in the app root.

- **CAP COUNTERS + A LIMITS & STORAGE PAGE + BACKUP/RESTORE ALL BASES
  (2026-08-30).** Committed (`4d9d6b2`) on `main`, NOT pushed/deployed yet.
  `sw.js` cache bumped to `chess-training-center-v82`. Browser-verified at 375px
  in light AND dark. Three parts, all reusing existing helpers — do NOT rebuild.
  - **Part A — live counters.** `paintCapCounter(id, used, cap)` (exported from
    js/app.js) paints a `used/cap` pill, gold (`.cap-counter.low`) when one slot
    is left or none. `Base.renderBases()` paints `#base-count` from
    `basesCache.length`/`MAX_DATABASES`; `Masterclass.renderList()`
    (js/masterclass.js) paints `#mc-count` from `owned().length`/
    `MAX_MASTERCLASSES`, passing `null` (blank pill) while signed out/offline/
    unloaded so it never shows a false 0/5. Counters live in `.head-with-count`
    wrappers in index.html.
  - **Part B — Limits & storage page.** Reached from a NEW footer row in
    `#tabbar`: `#menu-limits`, an `<a role="button">` — deliberately NOT a
    `<button>`, so every `#tabbar button` selector (TAB_ORDER, swipe, `.on`,
    click, tour) still matches exactly the seven destinations (verified: still
    7). It calls `closeMenu(false)` then `openLimitsSheet()`. The page
    (`openLimitsSheet` + `capRows()` in js/app.js) lists all nine caps, each
    read from the enforcing constant, never retyped: `MAX_DATABASES`,
    `MAX_MASTERCLASSES`, `MAX_CHAPTERS`, `MAX_CHAPTER_BYTES` (shown as
    `round(/1000)` KB = 100 KB), `MAX_MEMBERS`, `MAX_SEARCH_RESULTS` (NEW
    module const, lifted from the local `const LIMIT = 2000` in the advanced
    filter), `MAX_ENGINE_LINES`, `MAX_RADAR_THEMES`, `Rush.MAX_STRIKES`. Plus a
    plain-language storage paragraph (`storage_body`) and the two Part C
    buttons. All new strings are in js/i18n.js (`limits_*`, `cap_*`,
    `storage_*`, `backup_*`, `restore_*`), both languages.
  - **Part C — backup/restore all bases, FILES ONLY (no Firebase).**
    `backupAllBases()` writes every base + its games to one JSON
    (`{app,type:'bases-backup',version:1,bases:[{name,games:[…]}]}`) — base
    names preserved, local `id`/`baseId` stripped — through `shareTextFile()`
    (NEW generic share/download helper; `sharePgnText()` now delegates to it).
    `restoreBackup(file)` validates the JSON, then guards BOTH required cases:
    a name already present is a duplicate → `askDupChoice` (skip / bring as
    copies, copies get a ` (copia)` suffix); creating past `MAX_DATABASES` →
    `askCapChoice` (fill only what fits / cancel). Recreates via
    `db.addGamesBatch` (js/db.js) in 500-game chunks — never one giant
    transaction — and is cancellable mid-run. `pickBackupFile()` makes its own
    hidden `<input type=file accept=json>` on demand. Verified: happy path,
    copy+cap, skip, and the three bad-file toasts.

- **THE BOTTOM TAB BAR IS NOW A MENU BUTTON + SLIDE-UP SHEET (2026-08-29).**
  Committed (`858b927`), NOT pushed/deployed yet. `sw.js` cache bumped to
  `chess-training-center-v80`. Browser-verified at 375px in light AND dark, in
  both languages, and the guided tour was walked through the change.
  - The old `#tabbar` (seven always-on buttons) is replaced by one centred
    `#tabmenu-btn` (index.html) that shows `☰` + the current screen's name.
    Tapping it opens `#tabbar`, which is now styled as a bottom sheet (2-col
    grid, icon over label); a `#tabsheet-backdrop` catches outside taps.
  - **The seven destination buttons still live in `#tabbar`, unchanged (same
    `data-screen`, same order).** That is deliberate and load-bearing: `TAB_ORDER`
    (js/app.js) and swipe nav, `showScreen`'s `.on` highlight, the click
    handlers, and every `#tabbar button[data-screen=…]` guided-tour target all
    keep working without being touched. Do NOT "tidy" those buttons out of the
    DOM or into JS-built markup — it silently breaks all four.
  - **Menu ↔ history** (js/app.js `openMenu`/`closeMenu`/`navigateFromMenu` +
    the `popstate` handler): opening pushes one history entry so Android back
    closes the menu and nothing else; a programmatic close consumes that entry
    (`history.back()`), and a tapped destination defers its `showScreen` through
    the same back (`pendingNav`) so the entry is replaced, never stacked. The
    label is set by `updateTabMenu()`, called from `showScreen` and `relabel`.
  - **The guided tour** (js/tour.js) opens the menu for its six tab-tap steps
    via `ctx.openMenu()`/`ctx.closeMenu()` — `tourCtx()` binds them with
    `push:false`, so tour highlighting never touches history. The ring lands on
    the destination inside the open sheet; tap → navigate → advance, verified.
  - `tab_base` renamed to `'Bases'` in EN too (js/i18n.js); one new key
    `nav_destinations` for the sheet's aria-label. `prefers-reduced-motion`
    disables the slide/fade (css/style.css).

- **MENU BUTTON LABEL NOW FOLLOWS THE LIT TAB, NOT THE RAW SCREEN (2026-08-29).**
  Committed on `main`, NOT pushed/deployed. `sw.js` cache bumped to
  `chess-training-center-v81`. Fixes the cosmetic mismatch where opening a game
  from a Base or from Play history left the button reading "Analysis" while the
  sheet highlighted "Bases"/"Play" (activeScreen stays `'analysis'` but
  `updateBaseNav()`/Masterclass override the `.on` highlight).
  - `updateTabMenu()` (js/app.js) now reads its label from the currently-lit
    `#tabbar button.on [data-i18n]` when one exists, falling back to the
    `MENU_AREA` map only when no tab is lit (rush/blind/leaderboard/friends/
    public-profile light none). It is now `export`ed.
  - A single `updateTabMenu()` call was added at the end of
    `Analysis.updateBaseNav()` (covers the inBase/inMc/inHist `.on` overrides and
    the no-override case), and one in `Masterclass.lightBasesTab()`
    (js/masterclass.js, which already imports from app.js — no new import cycle).
  - Verified in the browser pane at 375px, both languages: base game → "Bases",
    Play-history game → "Play"/"Jugar", Masterclass chapter → "Bases", the
    leaderboard fallback → "Profile"/"Perfil", and all seven normal tabs still
    light and label correctly. TAB_ORDER/swipe, menu↔history, and the tour were
    not touched.

- **THE THREE BASES/MOVE-LIST BUGS ARE FIXED (2026-08-28) — HANDOFFS task 1.**
  All four sub-bugs were reproduced, fixed and browser-verified at 375px in
  light AND dark, then the fake test base was deleted. `sw.js` cache bumped to
  `chess-training-center-v79`. Committed, not pushed/deployed yet.
  - **Bug 1 — ◀ ▶ game arrows always failed.** `Analysis.gotoAdjacentGame()`
    called `parsePgn(g.pgn)` on a *summary* (no PGN text), so it always threw
    `import_failed`. Now `async` and fetches the full record the way
    `Base.openGame()` does (`g.pgn ? g : await db.getGame(g.id)`), guarding a
    record that genuinely has no PGN. `js/app.js` `Analysis.gotoAdjacentGame`.
  - **Bug 2 — arrows now follow the visible list, not the whole base.** New
    single source of truth `Base.visibleGames()` returns the games as displayed
    (advanced filter → quick-search box). `Base.renderGames()`,
    `Analysis.gotoAdjacentGame()` and `Analysis.updateBaseNav()` all read it, so
    the arrows, the grey-out maths and the on-screen list can never disagree.
  - **Bug 3 — search/filter no longer thrown away on ← Back.** `Base.openBase()`
    only clears `game-search` + `filter` when the base id actually CHANGES.
    Returning to the SAME base keeps them and RE-RUNS the filter via
    `applyFilter(this.filter)` against the freshly loaded `gamesCache` (never the
    stale `filterResults` array — verified a game deleted meanwhile drops out of
    the restored chip). Switching to a different base still clears — verified.
  - **Bug 4 — board no longer jumps on games with long comments.** Root cause on
    this build: `renderMoves()`'s `curEl.scrollIntoView({block:'nearest'})`
    scrolled the `<main>` scroll container (283px measured), which carries the
    board — not `document.scrollingElement`. Replaced with a container-only
    scroll: adjust `#ana-moves`'s own `scrollTop` by how far the current move
    sits outside its box; `<main>` is never touched. The two other `renderMoves`
    (Play, Trainer) already used `scrollTop`/`scrollHeight` and were left alone.

- **THE FIRESTORE WRITE RULES ARE VERIFIED (2026-08-20). This was listed as an
  open unknown "for months" and it was already closed — the note saying only the
  READ rules had ever been tested is STALE. Do not re-open it, and do not plan a
  live write test.** No production write was made and none is needed: the whole
  thing runs on the local Firestore emulator via `npm.cmd run test:rules`, which
  loads `firestore.rules` from disk into an empty local database. The suite was
  RUN, not read: **169 tests, 169 passing, 0 failing.**
  - **The four write claims that were asked for are each proved by a named,
    passing test — no new tests were written, because all four already existed:**
    1. *A signed-in user CAN write their own `/users/{uid}`* —
       `existing.test.js` "the owner can write their own document", plus
       `notifications.test.js` "creating the user document for the first time
       succeeds" (the create path, where `resource` is null, is a separate case
       and is covered separately).
    2. *A signed-in user CANNOT write someone else's* —
       `existing.test.js` "another signed-in user CANNOT write it" and
       `notifications.test.js` "a stranger CANNOT write someone else's user
       document".
    3. *An anonymous client cannot write either* —
       `notifications.test.js` "a signed-out visitor CANNOT read or write a user
       document" (it asserts BOTH, in one test) and `existing.test.js`
       "a signed-out visitor CANNOT write".
    4. *The leaderboard cannot be written with a forged rating or someone else's
       uid* — `existing.test.js` "another user CANNOT write someone else's
       entry", "CANNOT write an impossible puzzle ELO", "CANNOT write a negative
       puzzle ELO", "CANNOT write an impossible Rush score", "CANNOT write a
       puzzle ELO as a string", and "CAN write a believable top score" as the
       matching allow-case.
  - **Well beyond the four**, the same green run also covers the field allowlist
    (email, real name and date of birth are each refused on the public
    document), the private-profile guarantee, the 60-character text bounds, the
    `lastNudgeDate` / `lastWarnDate` function-owned fields, the whole
    `fcmTokens` block, and every Friends and Masterclass clause.
  - **No rule was weakened and no rule was found to be wrong.** Nothing in
    `firestore.rules` was edited, so there was no rules commit and **no rules
    deploy for this**.
  - **The file that was tested IS what is live.** The emulator only ever proves
    the file on disk, so this was checked separately rather than assumed:
    `firestore.rules` is committed and clean, its last change is `a59db0e`
    (2026-08-20, the notifications rules), and the note at the top of
    `docs/superpowers/plans/2026-08-17-notifications.md` records that commit as
    **built and deployed** the same day. So live and file agree as of
    2026-08-20 and no `rules:deploy` is owed.
  - **Firebase has no "download the live rules" CLI command** — `firebase
    firestore:*` has no rules subcommand and `gcloud` is not installed on this
    machine. The only ways to read the deployed text are the Firebase console's
    **Firestore → Rules** tab and the REST Rules API. If drift is ever suspected,
    re-running `cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy` is
    idempotent and settles it.

- **THE FIREBASE WEB API KEY IS RESTRICTED BY HTTP REFERRER — Adrian did it in
  Google Cloud Console on 2026-08-20 and confirmed the site still works. BOTH
  pre-launch security items are now closed. Do not re-open either one and do not
  ask him to re-check them.**
  - **The key was ALREADY partly restricted before this** — a session had
    assumed it was wide open, and it was not. Four entries were already on it,
    almost certainly written by Firebase itself at project creation:
    `http://localhost/*`, `https://chess-training-center.firebaseapp.com/*`,
    `https://chess-training-center.web.app/*` and
    `https://chesstrainingcenter.app/*`. **Check the console before claiming a
    Google-side setting is unset.**
  - Adrian added three more: `https://www.chesstrainingcenter.app/*`,
    `http://localhost:8811/*` and `http://127.0.0.1:8811/*`. Seven entries
    total. **`8811` is the dev port from `.claude/launch.json`** — if that port
    ever changes, this list has to change with it.
  - **Both `localhost` forms are listed deliberately, and the plain
    `http://localhost/*` was NOT removed.** Whether a portless entry also covers
    port 8811 was not established either way, so the explicit ones were added
    rather than guessed at. Do not "tidy" the duplicate away.
  - **`chess-training-center.firebaseapp.com/*` is the lockout trap. Never
    remove it.** `js/firebase.js:107` uses `signInWithPopup`, and that popup is
    served from `chess-training-center.firebaseapp.com/__/auth/handler`, which
    calls Google's identity API *from that domain* with the same key. Without it
    **Google sign-in breaks for everybody, live site and Android TWA both**,
    while the rest of the app looks perfectly fine — so it would not be caught
    by a casual look.
  - **The TWA needs no entry of its own.** A Trusted Web Activity is Chrome
    rendering `chesstrainingcenter.app`, so its requests already carry that
    origin. The Android package name `com.chesstrainingcenter.app` belongs in
    `.well-known/assetlinks.json`, which is already correct — it is not a
    referrer and does not go on this page.
  - **"API restrictions" (the second section on that page) was deliberately left
    on "Don't restrict key".** Only *Application restrictions* was touched.
    Restricting the API list is a different control and getting it wrong takes
    down sign-in and Firestore.
  - **To undo, if it ever misbehaves:** same page, set **Application
    restrictions** to **None**, Save, wait 5 minutes. No data is affected and it
    can be flipped back and forth freely.
  - **What this rests on: Adrian's own confirmation ("all done, looks good so
    far") after applying it.** No session watched a post-change Google sign-in,
    and there was no separate 375px / light-and-dark / both-languages pass for
    it — there is nothing visual to check. Deliberate stopping point, not an
    oversight. If something surfaces in real use he will say so.
  - **Do not sell this as a data-security fix.** A Firebase web API key is a
    public project identifier, not a secret; it is *meant* to ship in
    `js/firebase.js` and every Firebase web app exposes one. This restriction
    limits quota abuse from other people's sites. What protects the data is
    `firestore.rules` (169 passing tests — see the entry below) plus App Check.
    "The key is visible in the source" is not a vulnerability and must not be
    written up as one.

- **MASTERCLASS IS CLOSED — Adrian stopped work on it on 2026-08-20.** He said
  he does not want to touch Masterclass any more and that **there is no real bug
  so far**. **This note overrides everything written below about BUG A (a
  follower cannot leave the stored chapter PGN) and BUG B (Stop does not remove
  `live/state`), and everything in `docs/MASTERCLASS-LIVE-CHECKLIST.md`.** Those
  write-ups stay in the repo as a record of what was observed, but they are
  **not a work queue**. Do not plan them, do not patch them, do not put
  Masterclass in a handover prompt as the next task, and do not offer it as a
  suggestion. Only reopen it if Adrian raises Masterclass himself.

- **Dated keys follow the player's own calendar day, not UTC (2026-08-20,
  `ef52616`, deployed and confirmed live by Adrian).** `monthStr()` built the
  monthly-leaderboard season key from `toISOString()`, which rolls over at 19:00
  Panama time, so on the last evening of a month a Rush score was filed under the
  NEXT month and the player's own row vanished from the "This month" board while
  their local calendar still said the old month. It now slices `todayStr()`,
  which was already local. The three PGN `Date` headers had the same bug and now
  reformat `todayStr()` too. **`todayStr()`, `streakCount`, `streakLastDate` and
  `bestStreak` were deliberately NOT touched** — they were already local and
  correct; do not "fix" them. `toISOString()` is now gone from `js/` apart from
  one mention inside the explanatory comment at `js/app.js:1098`. `sw.js` v76 →
  **v77**. No `firestore.rules` change, so **no rules deploy for this**.
  - **Both halves of the deploy were verified**, not assumed: the live
    `sw.js` flipped v76 → v77 about 40s after the push, and live
    `js/app.js` was fetched and checked to contain the new `monthStr()` and all
    three rewritten `Date` headers.
  - **Adrian confirmed on production, signed in as himself, that his own Rush row
    appears on the "This month" board. That closes this work — do not re-test it.**

- **Masterclass — the first production run happened on 2026-08-19 and STOPPED
  PART-WAY THROUGH PART C. Stage 1 is code-complete but NOT proven.** Two real
  first-contact failures, both written up in full in
  `docs/MASTERCLASS-LIVE-CHECKLIST.md`, whose "Ever run live?" table has been
  rewritten to say what actually happened rather than what was planned.
  - **Proved live and working:** `addMembers()`, `setMemberCount()` and
    **`pushLiveState()`** — the live document is written with correct
    `chapterId`, `path`, `fen`, `drivenBy` and a server `updatedAt`, and it
    updates as the owner moves. `watchLiveState()` delivered its first snapshot
    and the follower was carried to the right chapter by itself.
  - **BUG A — a follower cannot leave the stored chapter PGN.** The live
    document carries a POINTER (`path`, child indices) into a PGN both sides are
    assumed to share, but the moves the owner plays *during* a lesson are never
    saved to the chapter, so they do not exist in the follower's parsed copy.
    `gotoPath()` returns false, `findFen()` fails too because it searches that
    same incomplete tree, and `applyLive()` deliberately does nothing. **The
    follower's board freezes silently after the first jump.** Confirmed twice
    over: production held `path: "0.0.0.0.0.0"` against a chapter PGN that stops
    at `Bb5` (five plies), and a local reproduction produced the identical path
    and the identical FEN with `pathResolved: false`.
    **This needs its own plan** — the live document has to carry the MOVES, which
    means a `firestore.rules` change with a size cap plus tests, a payload that
    grows through a lesson against the 1-per-second throttle, and an
    `applyLive()` that EXTENDS the follower's tree rather than walking it. Do not
    patch it in a debugging session; that is how the two bugs in the original
    plan's `deleteMasterclass()` got written.
  - **BUG B — Stop does not remove `live/state`.** The owner pressed Stop, the
    document survived, and the follower stayed on "Following the class". The
    `allow delete: if mcIsOwner(mcId);` clause **is** deployed (checked in the
    console's Rules tab), so it is not commit 6's missing rule. Prime suspect is
    a real race: `pushLiveState()` fires `setDoc()` without awaiting it, and
    `stopLiveState()` can cancel a *pending* write but not one already in flight,
    so the last move's write can land after the delete and recreate the document.
    The alternative is a refusal Adrian could not see — he was on a phone.
    **Run the member side in a desktop incognito window and read the console
    before writing any fix.**
  - **Everything from step 19 on is still NEVER RUN**: the rest of Part C,
    the whole of Part C2 (the Reconnecting bar and the offline section — the
    entire commit 7 connection layer), and the whole of Part D
    (`removeMember()`, `leaveMasterclass()`, `deleteMasterclass()` and the step
    36 console check).

- **Auth — a profile is not complete without a username (2026-08-19, deployed
  and verified live).** `Auth.needsProfileCompletion` was gated on `firstName`
  alone, so every account created before usernames existed — and every Google
  sign-in, which supplies a display name and nothing else — passed the gate
  forever and was never asked. `updatePublicLeaderboardDoc()` deletes
  `usernameLower` when there is no username, so the effect was an account
  visible everywhere in the app **except friend search**, which is the one place
  it has to be findable. This is why `Impervious` could not be found by
  `searchByUsername()`. The gate now requires both, and the dialog prefills the
  first name, last name and date of birth already held — every field in it is
  required, so an account that only lacked a username would otherwise have been
  blocked by an empty first-name box. **Google display names are deliberately
  NOT adopted as usernames**: they are not unique, and they are usually a real
  full name, which would make real names searchable by anyone typing three
  letters. `sw.js` v70 → **v71**. No rules change, so no rules run. Confirmed
  fixed by Adrian against production the same day.

- **Masterclass — commit 7 of 7 is done (2026-08-17, `50d0f43`). Stage 1 is
  CODE-COMPLETE.** Connection state: the Reconnecting bar, the offline
  Masterclass section, and one real bug fixed on the way. `sw.js` v69 →
  **v70**. `firestore.rules`, `firestore.indexes.json` and every test are
  untouched — **still 124 passing, 0 failing**, and **nothing needs
  deploying but the site itself.**
  - **`watchLiveState()` now passes `{ includeMetadataChanges: true }`, and that
    flag is LOAD-BEARING.** `onSnapshot` by default only raises an event when the
    document **data** changes. Losing the server is a *metadata*-only change, so
    an idle viewer whose connection dropped would never have been called back
    and **the Reconnecting bar would never have appeared at all.** The plan's
    Task 7 did not mention this. The flag costs **no document reads** — the extra
    events are raised locally from the same snapshot, and Firestore bills reads,
    not callbacks. **Do not remove it as noise.**
  - **A cached `null` is no longer believed, and this was a real bug.** The error
    path in `watchLiveState()` hands the callback
    `(null, { fromCache: true })`, and the old code read that as "the teacher
    stopped": it **wiped the last known position off the viewer's board and
    toasted "The class stopped broadcasting" every time their signal dropped.**
    A disappearance is now only accepted when `fromCache` is false, i.e. when the
    server said it. A cached null draws Reconnecting and changes nothing else.
  - **The Reconnecting bar REPLACES the live text in the same two containers**
    (`#mc-live-bar` and `#ana-mc-live`) — not a second line, not a takeover.
    Adrian's decision, and the reasoning is load-bearing: the bar sits directly
    above the board on Analysis at 375px, so a second line would push the board
    down and back up on every wobble, and taking the bar over entirely would
    remove **Stop following** at the one moment a viewer most wants a way out of
    a frozen board. Geometry and button position are byte-identical between the
    two looks; only the colour and the text change.
  - **Grey, not gold** — `.mc-live-bar.mc-live-stale` swaps `--gold-bg` /
    `--gold` for `--panel2` / `--muted`. Gold in this app means something is
    happening; the whole message here is that we cannot tell.
  - **Two signals feed one expression.** `stale` is
    `this.liveStale || !navigator.onLine`. The browser's `offline` event fires
    the instant the interface drops; Firestore can take several seconds to decide
    it has lost the server. Neither alone is both prompt and reliable. **Owners
    are excluded from it entirely** — an owner has no listener (they never watch
    their own document), and `goLive()` / `stopLive()` already toast
    `mc_needs_network`.
  - **Disconnected with nobody live shows a text-only bar, no button.** Following
    applies to a broadcast we cannot see. A *hidden* bar would be the app quietly
    claiming the class is not live, which is exactly what it does not know.
  - **The snapshot callback became a named method, `onLiveSnapshot(mc, state,
    meta)`.** The real listener cannot run from this machine at all (App Check),
    so a snapshot arriving from the cache is unreachable outside production
    unless it can be called directly. `watch()` is now one line.
  - **`liveKey()` skips a redundant re-apply.** `includeMetadataChanges` makes
    the same position arrive twice as routine — once from the cache, once from
    the server — and re-applying it would re-run `gotoPath()` and
    `Analysis.refresh()` for nothing. It is used **only** to skip work, never to
    decide what to draw.
  - **Offline replaces the WHOLE Masterclass section on the Bases tab**, even
    when a list is already in memory from before the connection went. Every row
    leads to a screen that cannot load its chapters or its members, so leaving
    them tappable would trade one honest message for three broken ones.
    `renderList()` now has **five** states, and the offline check is FIRST —
    ahead of signed-out. `mc_needs_network` already said "your local databases
    still work offline", which is why it was reused rather than a new string
    written.
  - **`load()` returns early when offline.** A Firestore read with no network
    never resolves and never rejects, so it would sit on the `await` forever and
    leave the section stuck on "Loading…" *behind* the offline message. The
    `online` listener is the retry, **and it only refetches when the Bases tab is
    actually open** — a reconnect while somebody is solving puzzles costs no
    reads.
  - **Only ONE new string, `mc_reconnecting`.** Everything the plan's Task 7
    listed already existed: its `mc_live`, `mc_following` and `mc_back_to_live`
    are `mc_live_on`, `mc_live_following` and `mc_follow_resume`, and
    `mc_member_added` shipped in commit 5 deliberately **without** the plan's ✓.
    The plan's Task 7 string block is stale — do not paste it in.
  - **`fetchMasterclass()` is STILL unused, and stage 1 ends that way.** Commits
    4 and 6 both predicted it would earn a caller and it did not. Commit 7 has no
    use for it either: rereading the parent is a document read that changes
    nothing on screen. **Do not add a call for tidiness.** Stage 2 or nothing.
  - **One more real defect fixed: the stale member count never actually
    corrected itself.** Commit 5's note (and the comment in the code) claimed the
    owner's Bases row was fixed "next time they open the class". It was not —
    `bumpCount()` was only ever called from `addMembers()` and
    `removeMember()`, so after a member **left**, the number stayed one too high
    until the owner happened to add or remove somebody. `loadMembers()` now calls
    it, and `bumpCount()` **returns without writing when the count is already
    right**, so opening a class costs zero writes in the normal case and exactly
    one when it has drifted. **The documented behaviour is now the real
    behaviour.**
  - **Firestore has no on-disk cache to go stale with** — `getFirestore(app)` is
    called plain, with no `enableIndexedDbPersistence` and no
    `persistentLocalCache`. Confirmed, not assumed: after a reload while offline
    the only IndexedDB database matching /firestore|firebaseLocalStorage/ is
    `firebaseLocalStorageDb`, which is **Auth's** store, not Firestore's. So a
    viewer who reloads offline sees the offline message, never stale content.
  - Verified over CDP at 375px in light and dark, in **both languages**: nine bar
    states drawn apart (viewer following / browsing / stale-following /
    stale-browsing / stale-nobody-live / hidden-nobody-live / offline-event-only,
    owner idle and owner live, both while offline and both correctly NOT grey), a
    300-character bar text keeping the button at **355** with `scrollWidth` 375,
    a cached null keeping the position, a server null ending it, `applyLive()`
    called once for cache-then-server and again only on a real move, a snapshot
    for a class already left being dropped, `closeLive()` clearing the flag, all
    six list states, and a **reload while offline** loading the shell from
    `chess-training-center-v70` with the offline message showing and the local
    base list still working. Zero page errors.
  - **NOT YET VERIFIED AGAINST PRODUCTION.** It goes out with the deferred
    commits 5 + 6 + 7 two-account run — the numbered checklist is in
    `docs/MASTERCLASS-LIVE-CHECKLIST.md`, written 2026-08-17. **Step 0 of that
    run is re-adding the friend**: `blockUser()` removed the Zugzwang ↔
    miguelafuentesm friendship and the invite picker only shows friends.
  - **Stage 1 is code-complete. There is no commit 8.** Stage 2 (the editor role,
    link sharing) is sketched in the plan and needs a plan of its own.

- **Masterclass — commit 6 of 7 is done (2026-08-17, `9be6cb4`). The live
  board: the owner broadcasts the position they are on and members follow it.**
  `sw.js` v68 → **v69**. **`firestore.rules` CHANGED and must be deployed.**
  Tests went 122 → **124 passing, 0 failing**.
  - **The rules change commit 5 owed is done.**
    `masterclasses/{mcId}/live/{docId}` now has
    `allow delete: if mcIsOwner(mcId);`. The block had one `allow write`, and
    every clause in it reads `after()` — `request.resource.data`, which is
    **null on a delete** — so the rule *errored* and denied, and **nobody could
    remove `live/state` at all**. The emulator trace shows it exactly:
    `evaluation error at L336 for 'delete'`, then the new clause at L352
    answering properly. Tests **36** (owner can delete) and **37** (viewer
    cannot). `deleteMasterclass()` has been attempting this delete since commit
    3 and starts working the moment the rules are deployed.
  - `js/firebase.js` gained `LIVE_THROTTLE_MS` (1000), `pushLiveState()`,
    `stopLiveState()` and `watchLiveState()` — **the only `onSnapshot`
    listener in the whole app.**
  - **The throttle is load-bearing.** Firestore's sustained write limit on a
    SINGLE document is about one per second and this document is written on
    every move. Writes are coalesced on a **leading edge** — the first move of
    a quiet minute goes out at once, only a burst is merged, and the newest
    pending state wins. A trailing-only throttle would put a second of lag on
    every move.
  - **`stopLiveState()` cancels the queued write BEFORE deleting.** Without
    that, an owner who moves and immediately taps Stop deletes the document and
    then the pending flush writes it straight back, and the class looks live
    with nobody driving.
  - **Position travels as a PATH of child indices ("0.0.1"), never a
    `Node.id`.** `Node.id` in `js/tree.js` comes from a module-level counter
    that starts at 0 on page load, so the ids the teacher and the student get
    for the same PGN depend on what each opened earlier. A path is a property
    of the PGN itself. **`nodePath()` and `gotoPath()` are exported from
    `js/masterclass.js`** so the round trip can be exercised directly — one of
    them runs on the teacher's machine and the other on the student's, so a
    test that calls only one proves nothing.
  - **The FEN is the fallback, and "neither resolves" means stay put.** A
    wrong node is worse than not moving, because the follower cannot tell.
  - **`Analysis.refresh()` is the single broadcast hook.** Every board change
    on that screen goes through it, so a move, an arrow key, a click in the
    moves list and a variation jump all broadcast without four separate hooks.
  - **Broadcasting is never automatic** — the owner switches it on. Only the
    owner drives in stage 1; the control is hidden from members even though the
    rules would refuse them anyway, because a button that can only fail is
    worse than no button. `'editor'` sits on the member side of that line until
    stage 2.
  - **A follower's default is Following ON**, so opening a class that is live
    puts you in the lesson. On reconnect or on "Back to live" the viewer jumps
    to where the teacher is **NOW** — the missed moves are deliberately not
    replayed. It is a lesson, not a video.
  - **The bar is drawn in TWO places from one piece of state**: `#mc-live-bar`
    on the Masterclass screen and a new `#ana-mc-live` above the Analysis
    board, because once you are following you are on the Analysis screen and
    Stop following has to be reachable. `Masterclass.renderLive()` fills both;
    `Analysis.updateBaseNav()` calls it.
  - **The listener is self-healing.** `closeLive()` runs on ←, Leave, Delete,
    sign-out and opening another class, but the tab bar can take you off the
    screen without passing through any of them — so a snapshot that finds
    nobody looking ends the subscription itself.
  - 11 new bilingual strings (`mc_live_off`, `mc_live_start`, `mc_live_on`,
    `mc_live_open_chapter`, `mc_live_stop`, `mc_live_following`, `mc_live_now`,
    `mc_follow_stop`, `mc_follow_resume`, `mc_live_ended`) and two CSS rules on
    `.mc-live-bar`.
  - Verified over CDP at 375px in light and dark, in **both languages**: all
    six bar states drawn apart (owner idle / live-no-chapter / live-with-
    chapter, viewer nobody-live / following / browsing), the path round trip
    across **two independently parsed copies** of the same PGN including a
    variation branch and the root, a bogus path returning false, following into
    a variation, following on down the same tree **without re-parsing it**,
    Stop following holding still while the teacher moved, Back to live snapping
    to the current position, the FEN fallback, "neither resolves" not moving,
    a state arriving before the chapter list, `closeLive()` twice, a forced
    300-character bar text still keeping the button at 355, `scrollWidth`
    exactly 375 everywhere, and **zero page errors**.
  - **NOTHING IN THIS COMMIT HAS TOUCHED REAL FIRESTORE.** Live follow needs
    two accounts *and* a friendship, and Adrian has decided to run commits 5
    and 6 together **after commit 7**. `blockUser()` removed the Zugzwang ↔
    miguelafuentesm friendship, so **step 0 of that run is re-adding the
    friend** — a member can only be invited from the friends list.
  - **`fetchMasterclass()` is STILL unused after all.** Commit 4 predicted
    commit 6 would earn it. It did not: the live document is its own listener,
    the parent is not reread, and rereading it would be a document read that
    changes nothing on screen. Stage 2 or nothing — do not add a call for
    tidiness.

- **Masterclass — commit 5 of 7 is done (2026-08-17, `e2cba06`). Members are
  real: the owner invites friends, everyone sees who is in the class, the owner
  removes and a member leaves.** `sw.js` v67 → **v68**. `firestore.rules`,
  `firestore.indexes.json` and every test are untouched — **still 122 passing,
  0 failing**, and nothing was deployed. **No rules change was needed**: the
  members block already allows the owner to add and remove and a member to
  leave.
  - `js/firebase.js` gained `MAX_MEMBERS` (30), `addMembers()`,
    `fetchMembers()`, `removeMember()`, `leaveMasterclass()` and
    `setMemberCount()`.
  - **`addMembers()` counts failures and never names them.** The create rule
    refuses anyone who has blocked the owner, so inviting five friends when one
    has blocked you adds four and reports four. Naming the one that failed
    would make a block detectable — the same guarantee
    `sendFriendRequest()`'s single neutral toast gives. **Do not "improve" this
    into a real error message.** The two new toast strings
    (`mc_member_added`, `mc_member_added_one`) deliberately carry **no ✓**, so
    the same message still reads honestly at zero.
  - **`setMemberCount()` must send `updatedAt` as well as `memberCount`.** The
    parent update rule requires `after().updatedAt == request.time` *and*
    `keys().hasOnly(['ownerUid','name','createdAt','updatedAt','memberCount'])`,
    so a write carrying `memberCount` alone is **denied**, not merely untidy.
  - **A member who LEAVES cannot fix the count**, and this is not a bug to
    chase: only the owner may write the parent document. The number on the
    owner's Bases row goes stale by one until they next open the class, where
    `bumpCount()` corrects it. That is what "advisory" means here — the member
    list is the truth. **⚠ The "next time they open the class" half of this was
    NOT TRUE when it was written and was fixed in commit 7 (`50d0f43`)** —
    `bumpCount()` was only called from `addMembers()` and `removeMember()`. It is
    called from `loadMembers()` now, guarded so it writes only when the count
    really disagrees.
  - **No name or avatar is ever copied onto a member document.** A member
    document is `{uid, role, addedBy, addedAt}` and nothing else; names,
    usernames and avatars are read live from `/leaderboard` through the
    existing `fetchLeaderboardByUids()`, the same batch read the friends list
    and the request lists use. The picker reads `Friends.friends` — the list
    `fetchFriendUids()` already fills — rather than running a query of its own.
    `js/masterclass.js` now imports `js/friends.js`; that is a plain edge, not a
    second cycle, and `js/app.js` imports friends.js one line before
    masterclass.js so it has finished evaluating.
  - **The owner's own row gets no Remove and the owner's ⋯ menu gets no
    Leave.** The delete rule refuses both — a class with no owner-member is
    unreachable — so the buttons could only ever fail.
  - **The picker is checkboxes plus one Add button.** The plan's "one tap on a
    single row adds that one friend" half was **dropped deliberately**: one tap
    meaning two different things on the same target is a mis-tap that writes to
    somebody else's class. Tapping a row still toggles its box, because the row
    is a `<label>`. Friends already in the class are dimmed, lose their
    checkbox and gain an "Already a member" chip.
  - **With no friends yet the picker shows one line pointing at Profile →
    Friends** (`mc_no_friends`) instead of an empty dialog. Adrian's decision,
    and it is deliberately **not** a jump: `Friends.open()` exists at
    `js/friends.js:94` and would work, but it calls `showScreen('friends')`,
    which throws away the Masterclass screen being set up.
  - `membersLoaded` / `membersFailed` mirror the chapter list exactly:
    "loading", "offline" and "empty" are three different screens, and a class
    always has at least its owner, so "No members yet" on a dropped connection
    would be visibly wrong.
  - 8 new bilingual strings (`mc_member_added`, `mc_member_added_one`,
    `mc_remove_member_confirm`, `mc_invite_title`, `mc_invite_add`,
    `mc_already_member`, `mc_no_friends`) and one new CSS block, `.mc-pick`.
  - Verified over CDP at 375px in light and dark, in **both languages**: the
    loading / offline / empty states drawn apart, the role chip in owner,
    editor and viewer, an escaped `<b>xss</b>` name, a 45-character display
    name truncating with the row's right edge at 355, a member with no public
    document rendering as `?`, a viewer with no ➕ buttons and no ⋯ on any row,
    the picker with an "Already a member" row and with no friends at all,
    `document.scrollWidth` exactly 375 everywhere, and zero console errors.
  - **NOT YET VERIFIED AGAINST PRODUCTION, and deliberately deferred.** Adrian
    decided on 2026-08-17 to run this **together with commit 6, after commit
    7** — one two-account session instead of three. It needs a friendship
    before it can start: `blockUser()` removed the Zugzwang ↔ miguelafuentesm
    one during the Friends run, so **the second account has to be re-added as a
    friend first** or the invite picker has nobody in it. Nothing in this commit
    has ever reached real Firestore.
  - ~~**Commit 6 MUST add `allow delete: if mcIsOwner(mcId);`**~~ **DONE
    2026-08-17 in `9be6cb4`**, with tests 36 and 37 — see the commit 6 entry at
    the top.

- **Masterclass — commit 4 of 7 is done (2026-08-16, `2d2f47c`). Chapters are
  real: added from a base or from the board, opened in Analysis, deleted by the
  owner.** `sw.js` v66 → **v67**. `firestore.rules`, `firestore.indexes.json`
  and every test are untouched — **still 122 passing, 0 failing**, and nothing
  was deployed. **No rules change was needed**: the chapters block already
  allows create and delete for the owner.
  - `js/firebase.js` gained `MAX_CHAPTERS` (50), `MAX_CHAPTER_BYTES` (100000),
    `addChapter()`, `fetchChapters()` and `deleteChapter()`.
  - **The oversize check runs BEFORE the auth check**, deliberately: it is
    validation of the input, not of the session, so a >100 KB PGN always throws
    the same `chapter-too-big` and the UI can show a readable message instead of
    a bare permission-denied. It uses `new Blob([pgn]).size` (bytes) while the
    rule counts characters, so the client bound is the stricter of the two and
    can never let through something the rules would refuse.
  - **`fetchMasterclass()` is STILL unused, and that is the right answer.** The
    plan expected commit 4 to reread the class after a chapter write moved
    `updatedAt`. Nothing on any screen renders `updatedAt`, and bumping the
    parent would be a second write per chapter for a field nobody reads — so
    the parent is not bumped and the class document is not reread. Commit 6
    (live follow) is where it earns its place. Do not add a bump "for
    tidiness"; it costs a write every time.
  - **`chooseBase()` in `js/app.js` is now exported** — one word, no behaviour
    change, same as `askText()` in commit 2. The plan's "around line 1591" was
    stale; it is at `js/app.js:245`. Masterclass calls it as
    `chooseBase(false)`: a chapter is taken *from* a base, so offering to
    create an empty one would only ever lead to "No games yet".
  - **The game picker shows the 50 most recently touched games and says so**
    (`PICK_GAMES` in `js/masterclass.js`, `mc_pick_recent`). A base can hold
    thousands, and a modal with one button per game would be unusable. Anything
    older is still reachable — open it from Bases and use "From the current
    board".
  - **There is deliberately no "share the whole base" entry.** Costed in the
    plan: 5,000 games is 5,000 writes and 5,000 reads per student.
  - **A chapter opens in the existing Analysis screen**, not a second board:
    `Analysis.loadTree(parsePgn(ch.pgn), { baseId: null, gameId: null,
    fromMasterclass: mcId })`. The plan's "verify the ⋯ menu writes nothing
    with a null baseId" was checked and it is clean — `💾 Save to database` is
    the only IndexedDB writer there and with no `baseId` it *asks* which base to
    copy into, so it never writes with a null one. `🗑 Delete game` only appears
    with a `historyId`.
  - New `#ana-mc-nav` / `#ana-mc-back` in `index.html` (`← Masterclass`), shown
    by `Analysis.updateBaseNav()` on `ctx.fromMasterclass`, which also re-lights
    the **Bases** tab. `Masterclass.backFromChapter()` redraws from memory
    rather than refetching; with nothing in memory (page reloaded while the
    chapter was open) it falls through to the Bases tab.
  - **Chapter rows reuse `.fr-row.tappable`** — the friends-list grid, which
    truncates the title and keeps the ⋯ on screen at 375px. `.list-item` would
    have wrapped a long title onto a second line. One new CSS rule,
    `.mc-chapter-n`, for the position number.
  - `chaptersLoaded` / `chaptersFailed` mirror the class list: the count label
    reads "Loading…" until the fetch lands, so a class with ten chapters never
    flashes "0 capítulos", and a failed fetch says "needs a connection" instead
    of "No chapters yet".
  - 10 new bilingual strings (`mc_from_base`, `mc_from_board`, `mc_choose_game`,
    `mc_pick_recent`, `mc_delete_chapter`, `mc_delete_chapter_confirm`,
    `mc_chapter_too_big`).
  - Verified over CDP at 375px in light and dark, in **both languages**: the
    loading / empty / offline states, 50 real rows, an escaped `<b>xss</b>`
    title, a long title truncating with the ⋯ still on screen, a viewer with no
    ⋯ and no ➕, the two-entry sheet, the base picker, the 51-game picker
    showing 50 plus its hint, both title prompts, the cap toast at 50, the
    oversize message, the delete confirm, a chapter opening on the right FEN
    with the right moves list, `← Masterclass` returning with the tab lit on
    Bases, `document.scrollWidth` exactly 375 everywhere, and no console error
    but the App Check 403.
  - **VERIFIED AGAINST PRODUCTION 2026-08-16 — Adrian ran the whole checklist
    on chesstrainingcenter.app and everything passed.** This is the first
    Masterclass code that has ever touched real Firestore. Proved live:
    `addChapter()` from a database AND from the current board (both wrote, both
    appeared), `fetchChapters()` surviving a full reload with the chapters in
    the order they were added, opening a chapter on the right position with a
    walkable moves list, `← Masterclass` returning with the tab bar still lit
    on Bases, and `deleteChapter()` removing a row. In both languages, light
    and dark. **So the chapter rules, the `updatedAt == request.time` clause and
    the `hasOnly` key set are all confirmed against the deployed rules, not just
    the emulator.**
  - **Still never executed live, and do not claim otherwise:** the >100 KB
    oversize path (`mc_chapter_too_big`), the 50-chapter cap toast, the 50-game
    picker truncation hint, and what a **viewer** sees — that last one needs the
    second account and is commit 5's job.
  - **Pushed and deployed 2026-08-16.** `origin/main` is level with local
    `main`; the live `sw.js` reads `chess-training-center-v67` and the live
    `js/masterclass.js` carries this code. Commits 1–4 all went out in the same
    push — the "not pushed" lines on the three entries below are historical.

- **Masterclass — commit 3 of 7 is done (2026-08-16, `fa5b0d7`). The list, the
  create and the delete are real Firestore calls.** `sw.js` v65 → **v66**.
  `firestore.rules`, `firestore.indexes.json` and `tests/rules/masterclass.test.js`
  are untouched — **still 122 passing, 0 failing.**
  - `js/firebase.js` gained `MAX_MASTERCLASSES`, `createMasterclass()`,
    `fetchMyMasterclasses()`, `fetchMasterclass()` and `deleteMasterclass()`,
    plus `addDoc, collectionGroup, serverTimestamp, writeBatch, onSnapshot` on
    the firebase-firestore import. **`onSnapshot` and `fetchMasterclass()` are
    deliberately unused** — commit 6 and commit 4 use them, and naming one more
    symbol from an already-downloaded module costs nothing.
  - **TWO bugs in the plan's `deleteMasterclass()` were found and fixed, and
    both were MEASURED against the emulator with a throwaway probe test, not
    reasoned about. Do not copy the plan's version back out.**
    1. **`live/state` cannot be deleted by anybody.** The `live` block has one
       `allow write` and every clause reads `after()`, i.e.
       `request.resource.data`, which is **null on a delete** — so the rule
       errors and denies. The plan had this delete *inside the batch*, and a
       batch is atomic, so **deleting a Masterclass would have failed outright,
       every single time.** It is now a separate quiet call placed *before* the
       parent delete, so it starts working by itself the day **commit 6 adds
       `allow delete: if mcIsOwner(mcId);` to that block** — commit 6 must do
       that, with a test.
    2. **The owner's own membership document cannot be deleted either.**
       Refused while the class exists (test 22 — that would orphan a class
       nobody can read), and refused afterwards too, because `mcOwnerUid()`
       does a `get()` on the parent that is now gone and the null dereference
       denies. **So exactly one document survives a delete: the owner's own
       `{uid, role, addedBy, addedAt}`.** Nobody else can read it (both read
       rules need the deleted parent) and `fetchMyMasterclasses()` skips it, so
       it is not a leak of anyone else's data — but it is real, expected
       leftover, and the Firestore console will show it. Closing it needs one
       more clause in `firestore.rules`. **Every OTHER member's document and
       every chapter are deleted, and they go first** — that is the part that
       matters for privacy.
  - **`MC_LIMIT` is gone.** The cap is `MAX_MASTERCLASSES`, imported from
    `js/firebase.js` — one constant, one place. It is still **advisory,
    UI-side only**, and it counts the classes you **OWN** (`Masterclass.owned()`),
    not the ones you have been added to.
  - **`fetchMyMasterclasses()` returns rows keyed `id`, not `mcId`.** The
    rename happens at the fetch boundary so only one shape exists above it. The
    plan's `mcId` is superseded.
  - **`#mc-new` stays live when signed out and toasts `mc_needs_signin`** —
    Adrian's call. The plan's "signed out → hide `#mc-new`" line is superseded.
    A button that explains itself teaches what the feature needs.
  - The list is **lazy**, exactly like Friends: `Auth.onChange` only
    invalidates it and `Base.showList()` → `openList()` refetches. The four
    list states — signed out / loading / offline / genuinely empty — are drawn
    apart, and the `.mc-role` chip (`mc_role_owner|editor|viewer`) is now on
    the row. An unrecognised role draws no chip rather than an empty pill.
  - Verified over CDP at 375px in light and dark, in **both languages**: all
    four empty states, the role chip in all three roles plus an unknown one, an
    escaped `<b>xss</b>` name, the cap toast at 5 owned and the name prompt at
    4, the owner ⋯ sheet reaching the delete confirm and the member sheet
    showing Leave instead, `scrollWidth` exactly 375 everywhere, and no console
    error but the App Check 403.
  - ~~**Nothing in this commit has ever reached real Firestore.**~~ **PARTLY
    SETTLED 2026-08-16** by the commit-4 live run. `fetchMyMasterclasses()` —
    the collection-group query and its COLLECTION_GROUP index — really works
    against production: the class list drew a real owned class and it opened.
    `createMasterclass()` must have run too, since a class exists to open.
    **`deleteMasterclass()` has still never been called live**, so the
    one-leftover-membership-document behaviour above is still reasoned from the
    emulator, not watched in the Firestore console.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Masterclass — commit 2 of 7 is done (2026-08-16, `6236198`). Screens and
  strings only, nothing talks to Firestore.** `sw.js` v64 → **v65**.
  - New `js/masterclass.js` (the `js/friends.js` pattern: one exported object,
    `init()` wiring buttons, `render*()` rebuilding from state), a Masterclass
    section above the base list inside `#base-list-view`, a new
    `#screen-masterclass`, a `.mc-*` CSS block and **27** bilingual `mc_*`
    strings.
  - **"Masterclass" is untranslated in Spanish and must stay that way** — not
    *Clase magistral*, not *Masterclase*. The word appears verbatim in the
    `es:` values.
  - **NO sample data, deliberately.** Friends commit 2 shipped a `SAMPLE` array
    and commit 3 had to delete it; every list here draws its real empty state,
    so nothing invented can reach the site. `Masterclass.classes`, `.chapters`
    and `.members` are all `[]` until commits 3, 4 and 5 fill them.
  - **`askText()` in `js/app.js` is now exported.** One word, no behaviour
    change. The plan's Task 2 "Interfaces" line already listed it as an import
    and it was not exported — commits 3 and 4 need a text prompt too, so it was
    exported rather than duplicated.
  - **`#mc-live-bar` is in the markup and hidden until commit 6**, so the
    screen was laid out with the space it will occupy. Do not delete it.
  - **`MC_LIMIT = 5` is ADVISORY, UI-side only** — the comment in the file says
    so. Same for the 50-chapter and 30-member caps when they land. They cannot
    be enforced in rules without a server counter.
  - **The tab bar stays lit on Bases** while `#screen-masterclass` is open —
    `open()` re-lights it after `showScreen()`, the same trick
    `Analysis.updateBaseNav()` uses for a game opened from a base. `←` calls
    `showScreen('base')`, which runs `Base.refresh()` → `showList()` →
    `Masterclass.openList()`.
  - **`mc_chapters` / `mc_members` are lower case** (*capítulos*, *members*) —
    they are only ever rendered after a number, exactly like `games` in the
    base list directly underneath. They were capitalised in the plan; that was
    changed here after seeing "3 Miembros" next to "0 partidas" at 375px.
  - **The ⋯ menu and the New Masterclass prompt are inert on purpose.** The
    ⋯ sheet picks the right item from the role (delete for an owner, leave for
    a member) and both actions are empty — the writes land in commits 3 and 5.
    `newClass()`'s two guards (signed out → `mc_needs_signin`, offline →
    `mc_needs_network`) are real and permanent; the `askText()` prompt opens
    and the name goes nowhere until commit 3 writes the document.
  - `firestore.rules`, `firestore.indexes.json` and every test are untouched —
    **still 122 passing, 0 failing.**
  - Verified over CDP at 375px in light and dark, in both languages: section
    above an unchanged base list, screen opens and closes, `←` returns with the
    tab lit on Bases, `document.scrollWidth` exactly 375 on both screens,
    singular and plural labels correct, long class name truncates with `←` and
    `⋯` both still on screen, and the only console error is the App Check 403.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Masterclass — commit 1 of 7 is done (2026-08-16, `feca228`). Rules and
  tests only, nothing the browser loads changed, `sw.js` stays at v64.** The
  plan is `docs/superpowers/plans/2026-08-16-masterclass-stage-1.md` (committed
  in the same commit; it was untracked before).
  - `firestore.rules` gained the Masterclass block as a **sibling** of the
    Friends blocks: `masterclasses/{mcId}`, its `members`, `chapters` and
    `live/{docId}` subcollections, plus the `mcPath` / `mcOwnerUid` /
    `mcIsOwner` / `mcIsMember` helpers. `signedIn()`, `me()`, `after()` and
    `num()` were reused, not redefined.
  - `tests/rules/masterclass.test.js` — 35 new tests, numbered to match the
    plan's list. **`npm run test:rules` is at 122 passing**, zero failing, on
    two consecutive runs.
  - **Deployed 2026-08-16 — rules AND indexes.** `firebase
    firestore:indexes` read back from the live project shows the `members` /
    `uid` field override with `COLLECTION_GROUP` scope, so the collection-group
    query in commit 3 will not hit `failed-precondition`. Edit the file and
    deploy, never the console.
  - **Two things in the plan's Task 1 are WRONG and were fixed here — do not
    copy them back out of the plan:**
    1. The recursive rule `match /{path=**}/members/{memberUid}` must test
       **`resource.data.uid == me()`**, not `memberUid == me()`. On a
       collection-group *list* the document-id wildcard is not bound, so
       reading it raises `Null value error` and denies the query. This is
       precisely what the redundant `uid` field on every member document is
       for; do not delete it as duplication.
    2. The new test suite runs under its own emulator `projectId`
       (`chess-training-center-mc`). `node --test` runs the test **files** in
       parallel and `clearFirestore()` wipes the whole project, which was
       deleting `friends.test.js`'s seeded documents mid-test and failing two
       existing Friends tests for the wrong reason. `existing.test.js` never
       clears, which is why this never bit before.
  - **The 50-chapter, 30-member and 5-Masterclass caps are advisory, UI-side
    only.** They cannot be enforced in rules without a server-maintained
    counter. The rules-enforced bound is the 100,000-byte chapter PGN limit.
  - Committed on local `main`; **pushed and deployed 2026-08-16** with commit 4.

- **Friends — the two-account run finally happened (2026-08-16). The system
  is verified against production.** Adrian ran it on the live site as
  `Zugzwang` (`hxxaE1n6T1WzxLvIGTMby1RfkZs1`) with `miguelafuentesm`
  (`f3trpsGqDXXXcV9OQsUw0TGlbjh1`). **Every "Owed: the two-account run" note
  below is now settled — read this entry instead of them.**
  - **Proved against live Firestore:** `usernameLower` publishing; the prefix
    search; `sendFriendRequest()` writing exactly four fields;
    `acceptFriendRequest()` creating the friendship and deleting the request;
    `fetchFriendUids()` + `fetchLeaderboardByUids()` filling the Friends list;
    the friends leaderboard with my own row ringed, all four category tabs;
    and `blockUser()`, `unblockUser()`, `fetchBlockedUids()` — block wrote
    `blocks/{me}/blocked/{them}`, removed the friendship and the request I had
    sent, the Blocked screen listed them, and Unblock cleared it.
  - **THE FRIENDS SYSTEM IS CLOSED — 2026-08-20. Stop testing it.** Adrian ran
    the last four checks himself against production and reported all four
    working and correct in Firestore: `rejectFriendRequest()`,
    `cancelFriendRequest()`, `unfriend()` and the blocked sender's side (a
    blocked account presses ➕, gets the neutral "Solicitud enviada ✓" toast,
    and no `friendRequests` document is created). The third account, not
    `miguelafuentesm`, was the other side.
  - **What that rests on:** Adrian's own confirmation. No session watched these
    four in the console step by step, so there are no document ids recorded for
    them and no separate 375px / light-and-dark / both-languages pass for
    `unfriend()` or the blocked-sender check. Deliberate stopping point, not an
    oversight. **Do not reopen this and do not re-run them.** If something
    surfaces in real use, Adrian will say so and it gets debugged then.
  - **Still true and worth keeping:** `unfriend()`'s rule had already been
    proved independently — `blockUser()` runs the identical delete on the
    identical friendship document under the identical rule, watched succeeding
    — and the blocked-sender rule is covered by the rules test suite.
  - **One thing left open, and it is a MASTERCLASS problem, not a Friends
    one:** Adrian **cannot** sign into `miguelafuentesm`, and Zugzwang ↔
    miguelafuentesm are **not** friends. Step 0 of the Masterclass live run
    needs both. Nothing in the Friends system is waiting on it.
  - **One real bug was found and fixed — `5326426`, `sw.js` → v63.**
    `renderFind()` in `js/friends.js` decided the search row's button from
    `Friends.sent` alone, i.e. the uids clicked in *this page session*. It
    never checked the friends list or the outgoing requests, which
    `paintAddFriend()` has checked since commit 7 — so **an existing friend
    came back from a search as a live ➕ that really did send another
    request.** It now resolves the same four states from the same three
    lists, and `search()` awaits `loadFriends()` when it has never run.
    Verified at 375px, light and dark, both languages, all four states.
  - **The "createdAt changed on a second send" scare was not a rules bug and
    there is no rules drift.** Accepting deletes the request document, so a
    later ➕ press was a fresh create, not a denied overwrite. Do not
    re-investigate it.
  - **Commit 9 (unique usernames) is NOT DOING**, decided here. Prefix search
    already distinguishes duplicates by avatar, display name, username and
    ELO; commit 9 changes signup, adds a new failure path on a new user's
    first screen, and does not fix existing duplicates — and there are 0
    duplicate usernames live. The plan's commit 9 section carries the full
    reasoning. Do not re-cost it.
  - `Velociraptorblue` and `foTtAx0VzRXgPgkkyRdESxJ0LN02` have no
    `usernameLower` and are correctly unsearchable until their next sign-in.
    That is the documented behaviour, not a bug.

- **The 26 streak icons are animated — CSS only, no new art (2026-08-16,
  `85c45ba`).** `sw.js` v63 → **v64**. The deliberately deferred half of the art
  rebuild is now done.
  - **The art is still 26 flat PNGs and `streaks/` is still 488 KB.** Adrian
    chose CSS over per-frame art: a frame set would have been ~130 more files
    and 2–3 MB, undoing the 2.5 MB → 488 KB rebuild in an offline-first PWA.
    **Do not revisit this as "we should do it properly" — it was costed and
    decided.**
  - Two keyframes in `css/style.css`, in a new **"idle flame motion"** block in
    the streak ladder section: `streak-flicker` (3.1s, `scaleY` off a
    `transform-origin: 50% 100%` base) and `streak-emberglow` (4.7s, brightness
    + `drop-shadow`). **The two periods are unrelated on purpose** so they never
    line up and the loop never reads as a metronome. Changing one to match the
    other is a regression.
  - **Only three of the four slots animate**, by Adrian's choice: the 64px
    `.streak-now-icon`, the 64px `.kael-quote-streak`, and the 34px image on the
    **`.current`** ladder row. **The 20px header badge is untouched** and still
    only moves on tier-up (`@keyframes streak-pop`) — a permanent pulse in the
    always-visible status strip was rejected. Locked tiers never animate; the
    selectors all carry `:not(.locked)` because the animated `filter` would
    otherwise wipe their `grayscale(1)`.
  - **A third animation, `streak-embers`, is the heat haze on the 64px Profile
    slot only** — a blurred copy of the same already-cached PNG drifting up
    behind the icon. It is fed by a `--streak-icon` custom property set inline
    by `renderStreakLadder()` in `js/app.js`, alongside a new `.has-flame`
    class; both are withheld at day 0. At 34px it would be invisible, which is
    why the ladder rows do not get it.
  - **The haze URL must stay absolute (`document.baseURI`).** A relative URL
    inside a custom property is resolved by Chrome against *the stylesheet that
    reads it*, not the document, so `streaks/x.png` became `css/streaks/x.png`
    and 404'd. This was caught in verification, not guessed.
  - **The haze is masked to a circle**, as cheap insurance: the blurred copy
    fills its whole 64px box, so without a mask it could take on a square edge
    at peak opacity. A radial mask has no corners.
  - **There is NO alpha-residue defect in the art — this was measured, after a
    first look at a 4× screenshot suggested otherwise.** Across all 26 PNGs the
    outer 20px ring averages 2–6/255 alpha and the dead corners sit at 2/255;
    composited on white that is a 253/255 grey, i.e. one to two levels. What
    reads as a faint box at high zoom is the ember and bloom field, which is
    intended art per `docs/STREAK-ART-SPEC.md`. **Do not "fix" this by redoing
    the alpha recovery** — there is nothing there to remove.
  - **One `prefers-reduced-motion` guard covers all three**, with selectors
    identical to the animation rules so specificity matches. Verified: reduced
    motion sets `animation: none` on all four elements and the Kael popup falls
    back to its static 8px `drop-shadow`.
  - Verified over CDP at 375px in light and dark, in **both languages**: 6
    distinct transforms, filters and haze opacities sampled over 2.5s (it really
    moves), haze image HTTP 200 at the same URL the `<img>` resolves to (one
    cached file, not two), boxes exactly 20/34/64, `scrollWidth` 375,
    `streak-pop` still fires, zero page errors.
  - Two stale CSS comments corrected on the way — both still claimed the art was
    fixed-height / `width: auto`, which stopped being true when it went square.

- **Streak icons rebuilt from zero — 38 tiers became 26, ending at 5 years
  (2026-08-16).** New art generated by Adrian; spec and the 38→26 prompt brief
  are in `docs/STREAK-ART-SPEC.md`. `sw.js` v61 → **v62**.
  - **Every icon is now square, 256×256, transparent.** The old set was 160px
    tall with widths from 134 to 354 (aspect 0.84–2.21), which is why the three
    CSS rules used `height: Npx; width: auto`. They now set **both** width and
    height: `.streak-icon-img` (20px, 28px on `.tier-up`), `.streak-tier-row img`
    (34px), `.streak-now-icon` and `.kael-quote-streak` (64px).
  - **`streaks/` went from 2.5 MB to 488 KB** — 17 KB average, 23.5 KB largest.
    Still not precached in `sw.js` `ASSETS`, exactly as before; and note
    `CACHE_FIRST` does **not** match `/streaks/`. The version bump is what
    clears the old art, via the `activate` handler's cache sweep.
  - **`STREAK_TIERS` in `js/app.js` was rewritten**: 26 rungs, 1 day → 1800
    days, icons `flame1-6`, `pawn1-6`, `knight1-4`, `bishop1-4`, `rook1-3`,
    `queen1-3`. The 12 retired names (`pawn7-9`, `knight5-8`, `bishop5`,
    `rook4-5`, `queen4-5`) are gone from disk and unreferenced.
  - **No storage key was touched.** The icon name is never persisted — only
    `streakCount`, `streakLastDate` and `bestStreak` are. **`js/badges.js` has
    its own, completely unrelated `STREAK_TIERS`** (7/30/90/180/270/365/730/
    1825/3650 days) whose `streak_<days>` and `daily_<days>` ids **are** storage
    in `earnedBadges`. Two constants, same name, different files. **Do not merge
    them** — rewriting one must never touch the other.
  - This also settles one of the open naming questions below: the year rungs now
    read "1 year / 2 years / … / 5 years" instead of "12 months / 240 months".
  - Verified over CDP at 375px in light and dark: all 26 load, none broken, all
    square at 256×256, boxes exactly 20/34/64, ladder order correct, zero page
    errors — in all three places the art appears (header badge, Profile "Streak
    progress" card, Kael tier-up popup).
  - The source JPEGs live in `C:\Users\Adrian\StreakArt\`, deliberately outside
    the repo. The conversion (black backdrop → alpha, align, 256px, quantise)
    is `docs/STREAK-ART-SPEC.md` §3; if the set is ever extended, the two traps
    are a flood fill leaking through glow that reaches the canvas edge, and a
    dark navy piece linked to the edge by a thin dark channel.

- **Friend search is now a PREFIX search (2026-08-16).** Typing `Zug` finds
  `Zugzwang`. `searchByUsername()` in `js/firebase.js` uses
  `where('usernameLower','>=',needle)` + `where('usernameLower','<',needle +
  '\uf8ff')`, `limit(5)` unchanged, and a new exported `SEARCH_MIN_CHARS = 2`
  refuses one-letter searches. `sw.js` v60 → **v61**.
  - **No composite index was needed and none was added.** Both bounds are on the
    same field, so the automatic single-field index serves it. This was
    **confirmed against production over the Firestore REST API**, not assumed:
    `zug` → HTTP 200, one row (Zugzwang), no index error.
    `firestore.indexes.json` is untouched.
  - **The "exact match is deliberate" note in the plan's Commit 3 section is
    superseded** and now says so at the top. Its anti-enumeration reasoning was
    wrong: `/leaderboard` is world-readable and `fetchLeaderboard()` already
    returns 200 whole rows to anyone, so prefix search leaks nothing new.
  - **Under 2 characters is not a search, so "No player found" does not
    appear** — `Friends.searched` stays false. The standing hint under the box
    (`friends_search_hint`) was rewritten from "You need their exact username."
    to "Type at least 2 letters of their username." **The "2" is hard-coded in
    that string; if `SEARCH_MIN_CHARS` changes, change both languages with it.**
  - **The five results are the alphabetically first five.** Someone with a very
    common prefix has to be typed out further. `limit(5)` was kept deliberately.
  - **The real query still has never run from this machine** — App Check blocks
    the localhost client from Firestore entirely. It was proved over REST
    instead. The gate, the row rendering and the no-match logic were verified in
    the browser at 375px.

- **Friends system — commit 1 of 9 is done (2026-08-15). Rules only, no
  feature code.** The plan is
  `docs/superpowers/plans/2026-08-14-friends-system.md`; read its "What
  actually happened" note before writing any Friends code.
  - `firestore.rules` now covers `friendships`, `friendRequests` and
    `blocks/{uid}/blocked/{other}`, and `usernameLower` was added to the
    `leaderboard` write allowlist so commit 3 needs no second rules change.
  - `tests/rules/friends.test.js` — 56 new tests. **`npm run test:rules` is at
    86 passing**, every allow and every deny.
  - **Deployed 2026-08-15** and checked — the leaderboard still loads. Live
    rules and `firestore.rules` match, so commits 3–7 need no further rules
    work. Edit the file and deploy, never the console.
  - `sw.js` deliberately not bumped — nothing the browser loads changed.

- **Friends system — commit 2 of 9 is done (2026-08-15, `1831639`). Screens
  only, no Firestore.** New `js/friends.js`, `#screen-friends` (Friends /
  Requests / Find), `#screen-friends-leaderboard`, the two-up button row on
  Profile, an inert `➕ Add friend` on the public profile, and 32 new bilingual
  strings. `sw.js` v53 → **v54**.
  - **`js/friends.js` ships with `sample: true` and six invented players.**
    That is how the screens were judged. **Commit 3 deletes `SAMPLE` and the
    flag** and puts the real search behind them.
  - Read the "Commit 2 — DONE" note in the plan before commit 3: rows with
    action buttons stack them on a second line on purpose, and the new
    leaderboard clips its own watermark while `#screen-leaderboard` still
    does not.
  - Committed on local `main`, **not pushed**.

- **Friends system — commit 3 of 9 is done (2026-08-15). Search and send.**
  `SAMPLE` and the `sample` flag are **deleted** — no invented players can
  reach the site. `usernameLower` is now published inside
  `updatePublicLeaderboardDoc`, and `js/firebase.js` gained
  `searchByUsername()` and `sendFriendRequest()`. The Find tab does a
  case-insensitive username match against `/leaderboard` (**exact when this was
  written; a prefix match since 2026-08-16 — see the top entry**) and writes
  `friendRequests/{from_to}` with exactly four fields. `sw.js` v54 → **v55**.
  `firestore.rules` untouched; one new test, **87 passing**.
  - **Every send outcome shows the same `Solicitud enviada ✓` toast** —
    created, already asked, blocked or offline. That is the block-privacy
    guarantee, not an oversight. Do not "fix" it into a real error message.
  - **Nobody is findable until their public doc is rewritten with
    `usernameLower`,** which happens on their next sign-in. Confirmed over the
    REST API: today no `/leaderboard` document has the field, and the query
    itself runs server-side with no index error.
  - ~~**Owed: the two-account run.**~~ **DONE 2026-08-16 — see the top entry.**
    Search and send are verified against production. The line above about no
    `/leaderboard` document having `usernameLower` is also stale: two now do.
- **Friends system — commit 4 of 9 is done (2026-08-15). Requests go live.**
  `js/firebase.js` gained six exports — `fetchIncomingRequests()`,
  `fetchOutgoingRequests()`, `fetchLeaderboardByUids()`,
  `acceptFriendRequest()`, `rejectFriendRequest()`, `cancelFriendRequest()` —
  and the Requests tab now renders real rows with working buttons. The gold
  pill on the Profile Friends button shows the real incoming count.
  `sw.js` v55 → **v56**. `firestore.rules` untouched, nothing deployed, still
  **87 tests passing**.
  - **Two composite indexes must be created before either query can run.** They
    are written out in the "Commit 4" section of the plan. This session could
    not sign in, so the auto-generated console links do not exist yet — create
    them by hand from the table, or open Requests once on the real site and
    click the link Firestore prints.
  - **`fetchLeaderboardByUids()` landed early**, in commit 4 rather than 5,
    because request rows need names and avatars too. Commit 5 must reuse it.
  - **The outgoing list has no status filter on purpose** — a rejected request
    must look exactly like a pending one to whoever sent it.
  - ~~**Owed: the two-account run.**~~ **PARTLY DONE 2026-08-16 — see the top
    entry.** `acceptFriendRequest()` has run against production and the
    friendship document exists. **`rejectFriendRequest()` and
    `cancelFriendRequest()` have now run too, on the real site — Adrian
    confirmed both correct in Firestore on 2026-08-20.** Commit 4 is closed;
    see the top entry.

- **Friends system — commit 5 of 9 is done (2026-08-15). The Friends list.**
  One new export, `fetchFriendUids()`, does
  `where('members','array-contains',me)` on `friendships` and returns the other
  member of each pair. `fetchLeaderboardByUids()` was **reused** from commit 4
  for names, avatars and puzzle ELO. `sw.js` v57 → **v58**. `firestore.rules`
  untouched, nothing deployed, still **87 tests passing**.
  - **No index is needed for this query.** `array-contains` on its own is served
    by the automatic single-field index, and there is deliberately no `orderBy`
    — the list is sorted by name in JavaScript instead.
  - **`PublicProfile.open(entry, backTo = 'leaderboard')`.** A friend row passes
    `'friends'`; the leaderboard's call site was not touched and gets the
    default. `PublicProfile.init` now reads `this.backTo` at click time.
  - **The friends list is lazy** — `Auth.onChange` only invalidates it, it
    refetches when the tab opens. Loading at boot would be up to 100 document
    reads for someone who never opens Friends.
  - **The 100-friend cap awaits the list before deciding.** At the cap the
    button comes back and the uid is not marked spent. The cap toast is about
    *my* list, so it does not break the neutral-toast rule for blocks.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The `array-contains` query has run against production and the
    Friends list rendered a real friend. The two composite indexes are
    created and deployed.

- **Friends system — commit 6 of 9 is done (2026-08-15). The friends
  leaderboard.** `#screen-friends-leaderboard` now builds real rows from
  `Friends.friends` — **no new query and no new export in `js/firebase.js`**.
  `rankTier` was exported from `js/leaderboard.js` and reused, along with the
  `.lb-row` markup, so the two boards stay one thing. `sw.js` v58 → **v59**.
  `firestore.rules` untouched, nothing deployed.
  - **My own row is on the board, ringed** (`.lb-me`, a 2px `--accent` inset
    ring that beats `.tier-podium`'s gold one). `loadFriends()` fetches my own
    public document in the same batch as the friends' and parks it on
    `Friends.me`. **`me` is not in `Friends.friends`** — the Friends list is
    unchanged.
  - **A stale month reads as no score, it does not remove the row.** The global
    board drops rows whose `rushMonthKey` is not this month; this one shows the
    fallback instead, because a friend vanishing from a five-person board looks
    broken. Deliberate difference — do not "align" it without asking.
  - **`#leaderboard-period` has a bug this commit only fixed on its own
    screen**: leaving a Rush board for an ELO board resets `season` but leaves
    the switch lit on "This month". `#flb-period` now moves back with it;
    `#leaderboard-period` still does not.
  - ~~**Owed, still: the two-account run.**~~ **DONE 2026-08-16 — see the top
    entry.** The board was opened on the live site with a real friend: two
    rows, my own ringed, all four category tabs. **Not covered:** the 30+
    friend chunk boundary — Adrian has one friend.

- **Friends system — commit 7 of 9 is done (2026-08-15). Add, unfriend,
  block.** `js/firebase.js` gained four exports — `unfriend()`, `blockUser()`,
  `unblockUser()`, `fetchBlockedUids()`. `➕ Add friend` on a public profile is
  live in all four states, `⋯` on a friends row opens Remove friend / Block, and
  a new `#screen-friends-blocked` lists the people you have blocked with
  Unblock. `sw.js` v59 → **v60**. `firestore.rules` untouched, nothing
  deployed, still **87 tests passing**.
  - **No "are we friends" query was added.** The ➕ button's four states are
    facts about *my* lists, so they are read from `Friends.friends`,
    `Friends.outgoing` and `Friends.sent` — opening a public profile costs no
    new document read. A `get()` on a `friendships` document that does not
    exist is itself a permission error, so the obvious implementation would
    have thrown on every stranger.
  - **Blocking rejects their pending request instead of deleting it.** Deleting
    would make their outgoing row vanish, which they could correlate with being
    blocked; `'rejected'` leaves it reading "Request sent" forever. A request I
    sent *them* is deleted — that is just cancelling my own. The block document
    is written **first** and is the only step whose failure is reported.
  - **`PublicProfile.onOpen` is a hook, not an import** — `js/friends.js`
    already imports `js/leaderboard.js`, and it is awaited before
    `showScreen()`, which is what "resolved before the screen renders" means.
  - **One new string**, `friends_blocked_empty`. Everything else existed.
  - ~~**Owed, still: the two-account run.**~~ **MOSTLY DONE 2026-08-16 — see
    the top entry.** `blockUser()`, `unblockUser()` and `fetchBlockedUids()`
    have all executed against production, in a **one-account** run: blocking
    is a write by my own account, so it needed nobody else signed in.
    **`unfriend()` and the blocked sender's side were closed out by Adrian on
    2026-08-20** against production, using the third account — see the top
    entry for exactly what that record rests on. `unfriend()`'s rule was
    already proved anyway: `blockUser()` runs the identical delete on the
    identical friendship document under the identical rule, watched
    succeeding. **Commit 7 is closed. The whole Friends system is closed.**
- **Friends system — commit 8 of 9 is done (2026-08-15, `c3b1e4f`). Comment
  only.** The note above `VISIBILITY_SECTIONS` in `js/leaderboard.js` used to
  claim a `friends` level could be added by adding a line to that table. It
  cannot — `/leaderboard/{uid}` is world-readable, so the table only decides
  what the screen draws and the real boundary is `updatePublicLeaderboardDoc()`
  in `js/firebase.js`, which always publishes `PUBLIC_ALWAYS_KEYS` and
  **deletes** `PUBLIC_DETAIL_KEYS` while the profile is private. The new
  comment points at "Future options" item 1 in the plan.
  - **No code line changed and `sw.js` stays at v60** — nothing a user can see
    is different, and a bump would make every returning user redownload the
    app for nothing. Same reasoning commit 1 used.
  - ~~**Owed, still: the two-account run.**~~ **Settled 2026-08-16 — see the
    top entry.** The two composite indexes are created and deployed.
  - ~~**Next task: commit 9 — unique usernames.**~~ **NOT DOING**, decided
    2026-08-16. The reasoning is in the top entry and in full in the plan's
    commit 9 section. Do not re-cost it.


- **👣 Walk through is now on the Endings studies too (2026-08-15).** Adrian
  asked for it after saying he did not like the existing rated practice either.
  Same mode, all 265 studies, over each study's own `moves` line with its
  `comment` as the legend. **No endgame data changed.**
  - **It is now ONE implementation — `createWalker(cfg)` in `js/app.js`.** Basic
    Checkmates was rewritten onto it and re-verified against the same tests it
    passed the day before, with identical output. **Do not fork it again**: the
    two screens are supposed to feel the same, and two copies would drift. A
    screen supplies element ids plus `onStart` / `onFinish`.
  - **The player does not always move first.** In a `result: 'loss'` study the
    player takes the winning side, so the book plays the losing move first (19
    of 265). `playerFirst()` decides whether the player's plies are the even or
    the odd indices; `step()` auto-plays anything that is not theirs.
  - **It cannot move `endgameElo`.** It runs while `Endgame.mode` is still
    `'study'`, and its branch in `userMove` sits **above** the
    `mode !== 'practice'` guard, so `finishPractice` — the only writer of the
    rating — is unreachable. Asserted byte-identical with a seeded rating.
  - **It does credit the streak**, like the Checkmates one. That is looser than
    the documented endgame trigger ("an endgame must be converted"), because
    👁 Show me can walk the whole line for you. Deliberate, for consistency
    with the mode Adrian already approved — **say so if you want it removed**;
    it is one line in `createWalker.finish()`.
  - `sw.js` → **v57** (v56 was taken by Friends commit 4 mid-session).

- **Learn tab — 👣 Walk through, a guided move-by-move mode (2026-08-14).**
  Shows the next move of the lesson's line as an arrow, clears it, then asks the
  player to play that same move. Correct → the opponent's scripted reply plays
  itself and the next move is shown. On to the end of the line.
  - **Live on all five Basic Checkmates.** The Rules lessons have no `demo`, so
    the button never appears there, and their code path is unchanged.
  - **No new lesson data.** It runs off `demo.moves`, which already existed. A
    legal move list always alternates and all five mates start with White, so
    "is this my move?" is just `walkIdx % 2 === 0`. `js/learning-data.js` was
    not touched.
  - **Legend, not per-move text — Adrian's call.** `lesson.text` stays under the
    board the whole way as the standing plan. The honest limitation: a fixed
    legend cannot explain move 12. Per-move notes were costed at 270 bilingual
    strings of generated chess commentary and deliberately not written. **The
    upgrade path needs no rework** — add an optional
    `lesson.walk = { notes: [...] }` indexed against `demo.moves`.
  - Wrong move: unlimited retries, no lockout; the arrow comes back by itself on
    the second miss. `👁 Show me` plays the move for you, `◀` steps back one of
    your moves and re-shows it. Reuses `learn-practice-status`, the existing
    correct/wrong sounds and `.shake` — nothing new was invented.
  - **`walkBusy` is load-bearing.** Both nav buttons are dead from a move being
    played until the next is shown. Without it, pressing 👁 Show me inside the
    600 ms reply gap plays the opponent's move as yours and flips the mode onto
    the wrong side for the rest of the line. The invariant: **when the mode is
    waiting on you, `walkIdx` is even.**
  - **Writes no rating** — not `puzzleElo`, `endgameElo`, `openingElo`,
    `blindfoldElo`, nor the radar; asserted byte-identical in the browser. It
    **does** credit the streak on finishing a line (`Streak.recordActivity()`),
    approved by Adrian. That is a new streak trigger — if the rules list on
    Profile is revised, revise it with this.
  - One pre-existing bug fixed on the way: `engineReply()` handed the board back
    unconditionally in its `finally`, so a late engine move could re-enable it
    after the player had left the lesson. Now guarded on `this.practicing`.
  - Design: `docs/superpowers/specs/2026-08-14-learn-walkthrough-design.md`.
    `sw.js` v52 → **v53**. **Committed on local `main`, not pushed.**

- **Streak rules rewritten — what counts as "using the app today" (2026-08-14).**
  Adrian picked "any one activity, but the bar goes up" over tying the flame to
  the daily missions. **The two counters stay separate on purpose**: 🔥 = you
  turned up, 🎯 = you did the full workout. Do not merge them without asking.
  - **Boards need 10 moves of your own** (`STREAK_MIN_MOVES`, shared helper
    `noteStreakMove`): Play, Openings, Analysis. It fires **on the tenth move,
    not at `finish()`** — a long game you walk away from used to bank nothing.
  - **Everywhere else you have to succeed**: solve the puzzle (a wrong answer
    used to count), Puzzle Rush needs 3+ solved, an endgame must be converted.
    Blindfold already required a solve.
  - **Two new triggers**: Analysis (any engine line, or 10 moves) and Learn
    lessons that have a practice section. Databases and Profile never count.
  - **Both streak bugs fixed.** `todayStr()` is now the local calendar day, not
    `toISOString()` — the day used to roll over at 7pm in Panama. And a broken
    streak now writes its 0 to `streakCount`; it used to live in memory only,
    so the stale number kept syncing to the public profile. `bestStreak` is
    deliberately untouched by both. `monthStr()` is **still UTC** — it is the
    leaderboard season key and changing it would move season boundaries.
  - The rules are explained in the app, under the streak ladder on Profile
    (`Profile.streakHowHtml`, `streak_how_*` in `js/i18n.js`, `.streak-how-*`
    in `css/style.css`). **If a trigger changes, that list changes with it.**
  - Verified over CDP at 375px in light and dark, both languages: 9 moves bank
    nothing and the 10th banks the day; a dead streak writes 0 while
    `bestStreak` survives; and at 21:30 Panama on the 14th (UTC already the
    15th) a streak from the 13th still reads 7 instead of being wiped.

- **Game History (Stockfish games) — COMPLETE, all 4 tasks.** Every game you
  play against the engine is saved automatically and can be browsed, filtered
  and replayed. Reach it from **Play → 📜 Game History**.
  - New module **`js/history.js`** — record building, the history screen, and
    replay. New IndexedDB store `playHistory` (DB v2 → **v3**).
  - Replay opens the normal Analysis board with a `historyId` context, so the
    tab bar stays lit on Play and there is a back / prev / next bar plus a
    one-line headline. `⋯ → 👁 View PGN` shows the game text; games can be
    exported or deleted from the card long-press or from `⋯`.
  - Plan: `docs/superpowers/plans/2026-08-07-stockfish-game-history.md`.
    Commits `a8705f7`, `9a90522`, `d302722`, `a86947e`.
  - **`js/app.js` now exports things.** It used to export nothing. `toast`,
    `modal`, `askConfirm`, `sheet`, `segInit`, `segValue`, `sharePgnText` and
    `Analysis` are exported so `js/history.js` can import them instead of
    copying them. app.js and history.js import each other — the cycle is
    deliberate and safe, but `js/history.js` must never touch an app.js
    binding at module top level. See "The module boundary" in the plan.
  - Deliberately left out: resuming an unfinished game, board thumbnails,
    clocks, cloud sync. The record shape already supports all four.

- **Play tab level picker — robot cards.** The eight engine levels are now a
  2-column grid of cards on the Play tab: the existing
  `icons/badges/beat_engine_N.png` robot, the level name, and the strength
  range it covers (Beginner 1300-1450 … Maximum 2800+).
  - `LEVELS` in `js/engine.js` gained a **display-only `range`** field. `elo`,
    `movetime` and the persisted level index are untouched.
  - `buildLevelSeg(el, def, rich)` — only the two Play call sites pass `rich`,
    so **the Trainer tab keeps the compact `3·Casual` strip**. If you ever
    make Trainer rich too, its setup screen gets much taller.
  - New `.lvgrid` block in `css/style.css`, reusing `--panel2`, `--gold`,
    `--gold-bg`, `--muted`, `--radius`. No new strings were needed: the names
    already come from `level_names`, and the ranges are just numbers.
  - Honest caveat Adrian accepted: **1320 is Stockfish's `UCI_Elo` floor**, so
    the level labelled "Beginner" cannot actually be made weaker than a decent
    club player. The ranges are presented as-is anyway.
  - Commit `ca9e87a`.

- **`sw.js` is at `chess-training-center-v30`.** The `v11` written here
  earlier was stale for a long time — trust the file, not this note, and bump
  it whenever `index.html`, any `js/*.js` or `css/style.css` changes, or
  returning users get served stale files.
  - `icons/badges/beat_engine_0..7.png` are now precached in `ASSETS`, because
    they render on a core screen. The rest of `icons/badges/` is not — it is
    only cached after first fetch by the `CACHE_FIRST` handler.

**`refactor/split-app-js` is merged into `main` and deployed** (merge
`0e46dff`). Both the module split and the robot cards are live.

- **Work order #1 — both Sentry errors.** One was a real null-dereference:
  tapping the Openings board before pressing Start crashed the app. The other
  (`myUndefinedFunction`) came from a browser extension, not this codebase; the
  crash guard and Sentry now ignore extension-attributed errors.
- **#4 — trash button removed** from Board Setup (13 → 12 buttons).
- **#5 — board scrolling fixed.** `.board` had `touch-action: none`, so the
  board swallowed every gesture. Now `pan-y`.
- **#9 — "Jaques mate" → "Jaque mates"** in the Spanish Learn tab.
- **Kael's corner no longer swallows taps** (commit `242dc7f`) — he is quieter,
  hides off-screen when silent, and the bubble is see-through. This was the
  urgent touchscreen bug; it is FIXED.
- Endgame tab: 265 endgames, bilingual, live.

## Still to do

### English copy review — COMPLETE (2026-08-08). All ten batches done.

Every English string in the app now reads like a native speaker who knows chess.
`docs/STYLE-EN.md` is the rulebook and `docs/EN-REVIEW-PLAN.md` is the full
record — every batch, every decision Adrian made, and everything deliberately
left alone. **Read both before touching any English text again.**

**Nothing has been pushed.** 24 commits sit on local `main`, from the style guide
through batch 10 and its follow-up, plus one unrelated crash fix (`58e8e09`).
`sw.js` is at **v49**. Push straight to `main` — the commits are already linear
there, individually revertable, and every batch was verified in a real browser at
375px before it landed. Check the live site after the *deploy* finishes, not
after the push.

#### What the review left behind — four items, all deliberate

These are recorded, not pending. None of them is a copy problem, which is why no
batch fixed them.

1. ~~**The plural bug — "1 games".**~~ **FIXED 2026-08-08, `sw.js` v47 → v48.**
   `tn(key, n)` in `js/i18n.js` picks between `key` (plural) and a new `key_one`
   (singular) and does the `{n}` substitution, so `adv_matches` no longer needs
   `.replace('{n}', …)` at its call site. Two forms only — English and Spanish
   split at exactly one for these nouns, so `Intl.PluralRules` was not needed.
   Five new keys (`games_one` *partida*, `imported_one` *partida importada ✓*,
   `history_moves_one` *jugada*, `adv_matches_one` *{n} partida encontrada*,
   `lessons_count_one` *lección*); no key was renamed. Ten call sites converted:
   `js/app.js` 254, 1519, 2097, 2130, 2298, 2886, 4332, 4338, 4359 and
   `js/history.js:247`. **`history_moves_one` and `lessons_count_one` are
   defensive and cannot be reached at 1** — `HISTORY_MIN_PLIES` rejects games
   that short, and both lesson categories have many lessons. Verified over CDP
   at 375px in light and dark, in both languages: the import toast, the
   advanced-search chip, the Databases list, the save-to-database sheet, the
   Openings book select and the Learn counts, each at n=1 and n=2+.
2. ~~**The Spanish repair list — 20 items.**~~ **DONE 2026-08-08 in its own
   session, `sw.js` v48 → v49.** 18 of 20 fixed across four commits (`14b33c0`
   factual, `6fc00a8` the *motor* sweep, `850d7cd` the Puzzles naming decision,
   `3a6b28d` the rest). The three factual errors are gone — h1 is now *clara*,
   p6 says *se defienden solos*, and r10/r11/r12 say *Torre contra dos peones* —
   each verified against the entry's own FEN first. Adrian's two calls: the
   Puzzles feature is **Puzzles** in Spanish everywhere (six sites, including
   `tab_puzzles`, which the list had missed), and `log_rating` is **`ELO {n}`**.
   No `en:` value was touched, the DICT key count is 530 before and after, and
   `history_bot_name` stayed frozen. **Two items were deliberately left alone**,
   with the reason recorded in place in `docs/EN-REVIEW-PLAN.md`: item 8 (badge
   voice — the English has the identical mixed voice, so fixing only Spanish
   would create a new mismatch) and one bullet of item 17 (the `…` → `...`
   sweep — `…` is correct Spanish typography and STYLE-EN §3 governs English
   only). Both are one-liners if Adrian ever wants them.
3. **Three layout bugs no copy edit can fix.** Worst: the endgame study title bar
   has about **206px** of room and **173 of the 265 names are longer**, so they
   truncate — even `An Example from New York, 1924` gets cut. Also: the puzzle
   radar clips its longest theme labels ("Discovered atta"), and the Leaderboard's
   decorative watermark pushes `document.scrollWidth` to 405. **Shortening the
   words would not fix any of the three** — it would only move the cut.
4. **Four naming questions and six dead strings.** The naming calls are Adrian's:
   the `Opening Explorer` badge sharing a name with the Analysis panel;
   `Daily Mission` vs `Daily Missions`; `STREAK_TIERS` counting to `240 months`
   where English says 20 years; and "icon" vs "avatar", where the two buttons say
   icon and everything else says avatar. The dead strings (`no_bases_yet`,
   `rush_open`, `rush_result_title`, `rush_wrong_end`, `game_review_move`,
   `game_review_accuracy`) are defined but never rendered — removing a key is a
   code change, and they cost nothing. **Leave all of these as they are** unless
   Adrian raises one.

**`HANDOFFS.md` was rewritten on 2026-08-28 and is current again.** Tasks A–D
are all done and are kept there only for reference; the queue is now task 1
(three Bases/move-list bugs Adrian reported on 2026-08-28), task 2 (menu
navigation replacing the tab bar), task 3 (limits, counters, backup and
restore) and task 4 (the Read tab). **Ignore the A–D table below** — it is left
in place as a record of what the work order used to say.

One conversation each:

| | Task | Work order items |
|---|---|---|
| **A** | Artwork integration | #2 — *blocked on 2 questions* |
| **B** | Learn reorganisation + tab reorder | #8 + #12 — must ship together |
| **C** | Swipe nav + Opening Explorer variations | #10 + #11 |
| **D** | Button work | #3, #6, #7 |

Lower priority, not in the work order:
1. ~~Export Firestore security rules to `firestore.rules`~~ — **was already
   done and this note was stale.** `firestore.rules` has been committed and
   maintained since `aaa51b0`. Verify a claim like this with `git ls-files`
   before acting on it.
2. ~~Test the Firestore WRITE rules.~~ **DONE 2026-08-14.** 30 rules tests now
   run against the local Firestore emulator — `npm run test:rules`, no network,
   no production data touched. They cover both existing collections: who may
   read/write `/users`, and for the world-readable `/leaderboard`, the field
   allowlist (real name, email and date of birth are all rejected), the
   private-profile guarantee, forged and out-of-range scores, and oversized
   text. Tests live in `tests/rules/`. `package.json` is dev tooling only —
   **the app still has no build step and loads nothing from `node_modules`.**
   Needs Java 11+; `npm run test:rules` finds the JDK itself.
   - **The deployed console rules were diffed against `firestore.rules` on
     2026-08-14: identical, character for character.** No drift. The file is
     the truth, the tests test what is actually running, and
     `npm run rules:deploy` is currently a no-op. Re-diff after any console
     edit — and from now on edit the file and deploy, never the console.
   - The suspected discrepancy turned out to be a **stale comment, not a rules
     problem**: `js/firebase.js` claimed leaderboard deletes were
     permission-denied, which stopped being true when the delete rule landed in
     `fa39468`. Comment corrected; the tolerant error handling around it was
     left alone on purpose.
3. ~~Restrict the Firebase web API key by HTTP referrer in Google Cloud
   Console.~~ **DONE 2026-08-20 by Adrian — see the top entry. Do not re-open
   it and do not ask him to re-check it.**
4. ~~Puzzle difficulty does not scale with ELO~~ — **NOT A BUG ANY MORE. Fixed
   on 31 Jul in `7bfc92e`; verified empirically 7 Aug, no code changed.** The
   old cause was that puzzle bands were fetched once at startup, so a rating
   that climbed during a session kept drawing from the band it started in.
   `nextPuzzle()` now calls `ensureForRating(target)` every puzzle
   (`js/app.js:3514`). Measured by seeding `puzzleElo` 2050 with the
   calibration window spent, then reading the rating the status line prints:
   Normal served avg **2065** (1999–2122), Harder (+500) served avg **2494**
   (2457–2549). Theme filters cannot starve it either — the rarest motif
   (`doubleBishopMate`) still has 17 puzzles within ±100 of 2050, so the
   ±100→±1200 widening never fires. If this is ever reported again, suspect a
   **stale service-worker cache** first: the number in parentheses under the
   board is the puzzle's own rating, so it is checkable on the device in two
   seconds. Do not "fix" the picker, the K-factor or `DIFFICULTY_LEVELS` —
   fast calibration (K=192 for the first 10 attempts, `js/app.js:3409`) is
   already there too.
5. **Dead write: `userLevel`.** Kael's onboarding asks the player's strength
   and shows real ELO ranges on the cards (Expert is labelled "ELO 1901-2300"),
   then saves the answer as `userLevel` (`js/app.js:498`) — and nothing in
   `js/` ever reads it. So a strong new player tells the app they are 2000 and
   still starts at `puzzleElo` 1200. The fix is to seed `puzzleElo` from the
   chosen tier at first run only. Adrian was told and chose to leave it for
   now; it does nothing for him (he is past onboarding and already rated
   correctly), it only helps new strong users. **Must stay first-run only —
   never rewrite an existing user's stored `puzzleElo`.**
6. History dates older than yesterday show the month in the *device's*
   language, not the app's — `formatWhen()` in `js/history.js` calls
   `toLocaleDateString(undefined, …)`. In Spanish on an English phone you get
   "Aug 5 13:16". Passing `getLang()` instead of `undefined` fixes it. Cosmetic
   and pre-existing to Task 2; not fixed because it was outside Task 4.
7. New "Read" tab — PDF reader. **Planned 2026-08-28; the agreed design and the
   staging are in `HANDOFFS.md` under task 3.** `READ-TAB-PROMPT.md` is the
   original brief and is superseded by that. It comes AFTER the menu and the
   limits page, deliberately: the menu removes the 8-tab crowding problem, and
   the limits page is where the book count and the storage quota get listed.
8. **Repo is 137 MB, and 138 MB of the working tree is
   `avatars/CTC new arts/`** — the full-size source PNGs, several over 3 MB
   (`frame-obsidian.png` 3.6 MB, `flamegold.png` 3.2 MB). Nothing loads them at
   runtime, but GitHub Pages serves this repo, so every one is publicly
   downloadable at the site root, and git history is permanent. This is the
   opposite of the `.gitignore` policy that keeps `icons/Streak Flames/` out.
   Deciding what to do needs Adrian: leaving it is harmless day to day, and the
   only real fix (history rewrite, or moving the sources out of the repo) is
   disruptive. **Ask before touching this — do not rewrite history unprompted.**

## Token rules — paste these into every new chess session

```
Working on C:\Users\Adrian\chess-app. Read HANDOVER.md first.
- js/app.js is 235 KB (~57,000 tokens). NEVER read it whole. Grep for the
  symbol, then read with offset/limit. Check the small modules first —
  Sound, Themes, ColorMode, Avatars, Badges, Leaderboard and PublicProfile
  are no longer in app.js.
- Never read puzzles/*.json (5.1 MB) or graphify-out/graph.json (292 KB).
  Read graphify-out/GRAPH_REPORT.md instead — it is 8 KB.
- js/endgames-data.js (212 KB) is data. Grep only.
- One task per conversation. Tell me to /clear when this one is finished.
- Finish by pushing to main without asking, unless I still have something to
  decide (see CLAUDE.md, "Finish by pushing").
```

## Structural debt — splitting js/app.js (IN PROGRESS)

The dedicated session happened on 2026-08-07. **`js/app.js` went from 255 KB to
235 KB (~8%).** Five modules are out, each its own commit, each verified in a
real browser before the next one started. Branch `refactor/split-app-js`.

This was a **pure refactor**: every block was moved verbatim. No behaviour, no
visuals, no storage keys changed.

### New file layout

| File | Holds | Size |
|---|---|---|
| `js/sound.js` | `Sound` | 0.7 KB |
| `js/appearance.js` | `Themes`, `ColorMode` | 2.0 KB |
| `js/avatars.js` | `AVATAR_OPTIONS`, `avatarHtml()`, `Avatars` | 2.6 KB |
| `js/badges.js` | `BADGE_DEFS`, `badgeLabel()`, `Badges` | 7.9 KB |
| `js/leaderboard.js` | `LEADERBOARD_FIELDS`, `rankTier()`, `Leaderboard`, `VISIBILITY_SECTIONS`, `canSee()`, `withLocalDetail()`, `PublicProfile` | 9.0 KB |
| `js/engine.js` | gained `LEVELS` (was in app.js) | — |

### How the split works — read this before extracting the next one

`js/app.js` is still the entry module and now exports 18 things: `$`, `toast`,
`modal`, `askConfirm`, `sheet`, `esc`, `segInit`, `segValue`, `showScreen`,
`monthStr`, `radarThemes`, `sharePgnText`, `activeScreen`, `RADAR_MIN`,
`KaelQuotes`, `Analysis`, `Setup`, `Profile`.

Child modules import those back from app.js, so app.js and every child form an
import cycle. **The cycle is safe only while the child never touches an app.js
binding at module top level** — inside methods and event handlers is fine,
because both modules have finished evaluating by then. A
`Cannot access '...' before initialization` error means exactly that mistake.

`LEVELS` moving to `js/engine.js` is the worked example. `BADGE_DEFS` is built
at module top level and maps over `LEVELS`, so reading it from app.js across
the cycle would have crashed the app. Anything a child needs **at top level**
must live in a module that does not import app.js back.

`activeScreen` is an exported `let`. ES module bindings are live, so children
see `showScreen()` reassign it. Do not copy it into a local variable.

### Still in js/app.js — 18 of the 23 objects

`Onboarding 439`, `KaelQuotes 513`, `Streak 814`, `DailyMissions 912`,
`Analysis 1212`, `Base 1852`, `Play 2310`, `GameReview 2593`, `Trainer 2702`,
`PuzzleLog 3092`, `Puzzles 3198`, `Rush 3681`, `Blind 3948`, `Endgame 4240`,
`Setup 4888`, `Profile 5212`. (Line numbers as of this commit.)

Next best candidates, in order: `PuzzleLog` and `GameReview` (both fairly
self-contained), then `Streak` + `DailyMissions` together, then `Onboarding`.
`Analysis`, `Play`, `Puzzles` and `Endgame` are the big ones and are heavily
cross-wired — leave those until last.

### The rules that made this safe (keep following them)

1. One module per commit. Verify before starting the next.
2. Move code **verbatim**. Do not tidy it on the way out.
3. Every new `js/*.js` goes in the `ASSETS` array in `sw.js` **and** the cache
   version gets bumped. `sw.js` is now at **`chess-training-center-v30`**.
4. Never rename a storage key: `'endgame'`, `puzzleElo`, `endgameElo`,
   `openingElo`, `blindfoldElo`, `earnedBadges`, avatar ids, badge ids, and
   the `LEVELS` index (persisted in `engineLevelsBeaten`).

### How this was verified

There is no test framework, so verification means driving the real app. The
Claude browser pane still will not composite, so a small CDP driver against
headless Chrome was used instead (scripts in the session scratchpad;
`~/.claude/launch.json` entry `chess-app46`, port 9159). After each extraction:
boot with zero new console errors, all 7 tabs open, Play → start → 64 squares
and 32 pieces, Game History → card renders → replay opens Analysis with the
tab bar still lit on Play, Profile radar + 64 trophy cells, 375px in light and
dark, and an offline reload with the network cut.

**Observed, not fixed** (out of scope for a pure refactor):
- `js/learning-data.js`, `js/quotes-data.js`, `js/legal-data.js` and
  `js/openings-eco.js` are imported by app.js but are **not** in the `sw.js`
  `ASSETS` array. Offline still works because the network-first handler caches
  them after the first load, but a user whose very first launch goes offline
  mid-install would not have them precached. Pre-existing, unrelated to the
  split.
- The only console error during every run is a `403` from
  `content-firebaseappcheck.googleapis.com`. It is App Check rejecting an
  unregistered origin (`127.0.0.1:9159`) and appears identically before and
  after the refactor.

## Housekeeping

Nothing outstanding. `avatars/CTC new arts/` and `tools/` **are** committed —
the old note here claimed otherwise and was wrong for a long time. Verify a
claim like that with `git ls-files <path>` before repeating it.
