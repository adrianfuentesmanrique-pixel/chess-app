# Opening library — a built-in tree of named openings in the Openings tab (design)

Date: 2026-10-12. Status: **BUILT, both conversations of section 5.
Conversation 1, "Browse and preview" (cache v193): the Library | My databases
switch, the cards, the search, an opening's variations, the preview board.
Conversation 2 (cache v194): Study (colour and level on a sheet, then the
existing trainer with the library's book), "Continues with", "Open in
Analysis", and a study game left half-way brought back by a "Continue" bar.**
What conversation 2 settled is in HANDOVER.md, first entry: "Continues with"
lists the NEXT named lines only, the book lives in `js/opening-lib.js` with the
Chess class handed in, the saved game is the device-only kv `libStudy`. What
conversation 1
settled that this text did not foresee is in HANDOVER.md, first entry: the
card's first moves for openings with several or no lines of their own (so the
first-move chips count 53 / 65 / 32, not the 50 / 67 / 33 of section 2), the
guided tour showing My databases, the move list as running text. Written
against commit `323af4b` (cache v192).

Adrian's words: "give the app its own opening tree and show it in the Openings
tab ... nothing big, just the main moves of each line ... 10 to 20 moves maximum
depending of the opening." And, after seeing the sources: "let's use only 1. my
main goal is to have all the opening and defense names, even with few moves is
ok. Afterwards we can extend some openings accordingly."

Decided by Adrian before this design and not reopened: our own tree, shipped
inside the app, fully offline, no call to Lichess or any other server while the
app runs; small; it lives in the Openings tab as openings pre-set for study.

---

## 1. The sources, measured (2026-10-12)

Sizes of the big files were read from the server's headers; nothing but source 1
was downloaded.

| # | Source | Licence | Size | Depth | What the lines are |
|---|---|---|---|---|---|
| 1 | github.com/lichess-org/chess-openings | CC0 | 395 KB, 3,865 lines, 3,177 names, 150 openings | average 4.9 moves, longest 18; 224 lines reach move 10; 25 of 150 openings have a line that deep | Real named theory, but short: a line stops where its name is earned |
| 2 | database.lichess.org rated games | CC0 | September 2026: 29.2 GB, 89.6 million games | as deep as counted | What strong players play, if only high-rated games are counted; noisy in rare lines |
| 3 | Our engine extending our own 140 lines | ours | none | any | What the engine likes, not theory. Misleading as a study tool |
| 4 | database.lichess.org evaluated positions | CC0 | 22.4 GB | engine lines | Same as 3 |
| 5 | database.lichess.org broadcast (master) games | **CC BY-SA 4.0** | 18 to 31 MB a month, 1.26 million games | as deep as counted | What masters play. Credit and share-alike apply to what is derived from it; not checked by a lawyer |

**Decision a — DECIDED BY ADRIAN: source 1 only.** All the names matter more
than depth. Extending chosen openings is a later job (section 6); when it
comes, sources 2 and 5 are the honest candidates and the table above is where
to start.

## 2. The data (built)

- `tools/opening-library-src/a.tsv … e.tsv`: unmodified copies of source 1 at
  commit `a6189a3`, with `SOURCE.md`. Dev input, never loaded by the app.
- `tools/build-opening-library.mjs`: no network, no engine. Plays every line on
  a board, groups it by opening (the name before the colon), tags it with the
  app's own name for those moves, writes `js/opening-library.js`. Run twice,
  same file (sha1 `966d1f1e`).
- `js/opening-library.js` (generated, 323 KB, about 53 KB gzipped):
  `OPENING_LIBRARY = [{ name, side, lines: [[eco, variation, moves, key]] }]`
  and `LIBRARY_KEYS`. The format is documented at the top of the file.
- `tests/unit/opening-library.test.js` (6 tests; `test:tree` 286 to 292): every
  line legal from the starting position and written as the board writes it;
  every key an existing opening name and equal to `classifyOpening(moves)`;
  every one of the 115 names of v192 still there (pinned in
  `tests/unit/opening-names-v192.json`); the file on disk is what the tool writes.

The numbers:

- 150 openings: 70 named for a White move, 80 for a Black move. By first move:
  1.e4 50, 1.d4 67, everything else 33.
- 3,865 lines, 3,177 names (308 names have more than one move order).
- 23 openings have 50 or more lines (Sicilian 400, Ruy Lopez 235, French 211,
  Queen's Gambit Declined 211); 40 openings are a single line.
- 110 of the app's 115 names are used as keys. 49 lines have no key: they begin
  1.a3, 1.a4, 1.d3, 1.e3, 1.f3, 1.h3, 1.h4, 1.Na3 or 1.Nh3, which
  `classifyOpening` does not name.

**The names in `js/openings-eco.js` are storage keys** (kv `openingElo`; the app
deletes the rating of a name not in `VALID_OPENING_NAMES`). The library does not
add, rename or remove one. A library name ("Sicilian Defense: Najdorf Variation,
English Attack") is a label and a search text only.

## 3. Decisions

### b. How many, and how they are browsed — DECIDED

All 150 openings, one card each, modelled on the repertoire app Adrian showed
(a screenshot of its "Download Repertoires" list). **A card shows only what the
data knows**: a small board, the opening's name, White or Black, its first
moves, the number of variations. No difficulty, no description, no download
count, no bookmark: Adrian's words, "let's put just the data we know based on
the openings itself."

- Search box over all 3,177 names (accent-blind: "grunfeld" finds Grünfeld).
  With text in the box the list becomes matching variations, not cards.
- Both / White / Black, the existing `.seg`.
- First-move chips 1.e4 / 1.d4 / Other, the existing `.filter-chip`.
- Order: most variations first, then by name. The 40 one-line curiosities sink.
- Tapping a card opens that opening's variations as a list (`.list-item`, name
  and moves in `.sub.moves`) in tree order, with its own filter box.

### c. One line or a tree — FOLLOWS FROM a

Each opening is the tree formed by its own named lines. Nothing to choose.

### d. Preview and study — DECIDED

**Preview**: a board inside the Openings tab, the line played through with back
and next, the move list under it. The name shown is the deepest library name
reached at the move on the board, so it changes on the move that earns it.
Below, the named variations that continue from the position on the board; a tap
walks further. "Open in Analysis" hands the line to `Analysis.loadTree`.

**Study**: a button on the preview. Colour (pre-set to the opening's `side`) and
level, as in today's setup, then the existing trainer with a book made of the
line on screen plus every library line that continues it. After the book the
trainer behaves as at v192 (second engine, `Trainer.guardSearch`). The rating is
credited as today: `Trainer.recordOpeningResult` classifies the moves actually
played. The 49 keyless lines can be studied and credit nothing, like such a game
today.

### e. Names in Spanish — DECIDED: English everywhere

Opening and variation names are shown in English in both languages, as the rest
of the app already does. The screen's own words (Library, My databases, Search,
Study, variations …) are in both languages like every other screen.

### f. Play book, saved-game names, ratings — DECIDED: no

The library is its own file. `OPENINGS_ECO`, `js/play-book.js`, the names of
saved games and the ratings are untouched, so no engine measurement is owed.
The 49 keyless lines stay keyless.

### g. Where it sits — DECIDED

A two-button switch at the top of the Openings tab: **Library | My databases**.
Library is first and is what a new user sees. My databases is today's
`#trainer-setup` form, unchanged. The last view used is remembered on the device.

```
375px
┌───────────────────────────────────┐
│ ┌───────────────┬───────────────┐ │
│ │ ● Library     │ My databases  │ │   .seg, two equal buttons
│ └───────────────┴───────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ 🔍 Search openings            │ │   .input
│ └───────────────────────────────┘ │
│ [Both] [White] [Black]            │   .seg
│ (1.e4) (1.d4) (Other)             │   .filter-chip
│ ┌───────────────────────────────┐ │
│ │ ┌─────┐ Sicilian Defense      │ │   card: board 88px
│ │ │board│ ■ Black               │ │
│ │ │     │ 1.e4 c5               │ │
│ │ └─────┘ 400 variations        │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ┌─────┐ Ruy Lopez             │ │
│ │ │board│ □ White               │ │
│ │ │     │ 1.e4 e5 2.Nf3 Nc6 3.… │ │
│ │ └─────┘ 235 variations        │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘

an opening                            a preview
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│ ‹  Sicilian Defense               │ │ ‹  Sicilian Defense               │
│ ┌───────────────────────────────┐ │ │ Najdorf Variation, English Attack │
│ │ 🔍 Filter variations          │ │ │ ┌───────────────────────────────┐ │
│ └───────────────────────────────┘ │ │ │                               │ │
│ Sicilian Defense                  │ │ │             board             │ │
│ 1.e4 c5                           │ │ │                               │ │
│ ───────────────────────────────── │ │ └───────────────────────────────┘ │
│ Alapin Variation                  │ │      ⏮    ◀    ▶    ⏭            │
│ 1.e4 c5 2.c3                      │ │ 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 │
│ ───────────────────────────────── │ │ Nf6 5.Nc3 a6 6.Be3                │
│ Alapin Variation, Barmen Defense  │ │ Continues with                    │
│ 1.e4 c5 2.c3 d5 3.exd5 Qxd5 4.d4… │ │  · … English Attack, Anti-English │
│ ───────────────────────────────── │ │ [ Study ]   [ Open in Analysis ]  │
└───────────────────────────────────┘ └───────────────────────────────────┘
```

## 4. How it is built

- **A new pure module, `js/opening-lib.js`** (hand-written, runs under Node,
  unit-tested): the cards (side, first moves, count, order, first-move group),
  the search, the lines under a line, the name at a move, and the book: a Map
  from `fenKey(fen)` to `{ san: count }`, the exact shape `Trainer.buildBook`
  makes, so transpositions work in the trainer as they do today.
- **The data is loaded when the Library is first shown**, with a dynamic
  `import('./opening-library.js')`, not at start-up: 323 KB should not be parsed
  on every launch. `tools/check-precache.mjs` does not follow dynamic imports,
  so `js/opening-library.js` and `js/opening-lib.js` go into `ASSETS` in `sw.js`
  by hand, with a test that says so. Offline is the rule.
- **The small board on a card does not exist yet.** There is no thumbnail
  renderer in the app (checked: `js/board.js` exports `Board`, `parsePlacement`
  and the piece set only). It is a new static 8 by 8 drawing in the current
  piece set, drawn only for cards near the screen: 150 boards are 9,600 squares.
- **Study needs one seam in the trainer.** `Trainer.start()` reads
  `#trainer-base` and refuses without a database; `#trainer-back` returns to
  `#trainer-setup`. The library sets `Trainer.book`, `bookComments` and `bookKey`
  itself and enters after that point, and back returns to the preview.
  `tools/cdp-verify-trainer-guard.mjs` already shows a book seeded that way.
- **The book's weights are counts of named lines, not popularity.** In a study
  game the opponent picks a move more often the more named variations pass
  through it. That is a fair stand-in ("more theory, more often") and it is not
  a claim about what players choose.
- Nothing is synced and nothing is stored but the last view (a device-only kv).
  `firestore.rules` does not change.

## 5. Build plan — two conversations

1. **Browse and preview.** `js/opening-lib.js` with its tests; the Library | My
   databases switch with the remembered view; the cards with the small board,
   search, colour seg and first-move chips; an opening's variation list; the
   preview board with back and next, the move list and the name that updates.
   Both languages for the screen's own words; `ASSETS`, the test for it, and the
   version bump.
2. **Study and the rest of the preview.** The trainer seam and the Study button
   with colour and level; "Continues with"; "Open in Analysis"; a game left
   half-way and restored; whatever conversation 1 found slow on a long list.

Every session that changes a screen checks it at 375px, light AND dark, Spanish
AND English, with screenshots actually opened and looked at.

## 6. Not in scope

Deeper lines for chosen openings (Adrian: "afterwards we can extend some
openings accordingly"; it needs its own source decision, section 1). Difficulty,
descriptions, download counts, bookmarks. Spanish opening names. The Play
engine's book. New rating names for the 49 keyless lines. A user's own
repertoire built from library lines.

## 7. Open risks, said plainly

- **A study game leaves the book early.** The lines average 4.9 moves; after
  that it is the engine, not theory. The screen must not suggest otherwise: the
  existing "out of book (engine)" badge already says it.
- **`side` is a rule of thumb**: the colour of the move that earns the opening's
  name. The Alapin sits under Black's Sicilian though it is White's choice, and
  the King's Gambit Accepted counts as Black's. The user picks the study colour
  anyway.
- **The list carries curiosities** ("Creepy Crawly Formation", "Sodium Attack")
  beside the main openings. Ordering by size keeps them at the bottom; nothing
  marks an opening as sound or unsound, because the data does not know.
- **308 names appear with more than one move order.** They are listed as
  separate rows; whether that reads as clutter is for the first screenshots.
- **The Sicilian is 400 rows.** Long-list speed on a real phone is unmeasured.
