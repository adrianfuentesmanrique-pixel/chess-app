# Chess app — where things stand (updated 2026-08-31)

## Already done and pushed — do NOT redo these

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
