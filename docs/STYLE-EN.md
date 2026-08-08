# English style guide — Chess Training Center

The rules the English copy of this app follows. Written 2026-08-07 at the start
of the English review. **Spanish is out of scope** — never edit an `es:` value.

If a later session needs to decide something this file does not cover, decide
it, apply it, and **add it here**. That is the point of the file.

---

**Adrian confirmed on 2026-08-07:** US spelling (§1), full names on quote
attributions, and Kael's reworded lines. Settled — do not reopen.

## 1. Spelling: US English

Counted across the real strings before choosing: `color` 60+, `colour` 4;
`center` 9, `centre` 2; `analyze/analysis` 30+, `analyse` 3; `defense` 2,
`defence` 0. US English already wins by a wide margin, and it is also what
Chess.com and Lichess use. So:

| Use | Not |
|---|---|
| color, colors, colored | colour |
| center, centered | centre, centred |
| analyze, analyzing, analyzed | analyse, analysing |
| defense, offense | defence, offence |
| memorize, visualize, organize | memorise, visualise |
| behavior | behaviour |
| favorite | favourite |

`practice` is both noun and verb in US English — never `practise`.
`analysis` is the noun in both; only the verb changes.

## 2. Capitalization

- **Feature names get Title Case** and are always spelled the same way — see
  §4. `Game History`, `Puzzle Rush`, `Opening Explorer`.
- **Everything else is sentence case**: buttons, headings, menu items, toasts,
  labels, placeholders. `Delete game`, not `Delete Game`. `Database name`, not
  `Database Name`.
- Chess terms are **lowercase** in running text unless they start the sentence:
  "a back-rank mate", "the middlegame", "en passant". The only capitalized
  chess words are piece and side names when used as labels — `White`, `Black`,
  `King`, `Queen` in a picker — and lowercase in a sentence ("white to move"
  is fine, but prefer "White to move" when it names the side).
- `ELO` stays uppercase everywhere (the app already does this consistently).
- `PGN`, `FEN`, `ECO`, `PWA` uppercase. `Stockfish` is a proper noun.

## 3. Punctuation

- **Oxford comma: yes.** "openings, puzzles, and endgames".
- **Em dash: spaced.** ` — ` with a space either side, not `—` closed up. The
  app already uses the spaced form nearly everywhere.
- **Apostrophes and quotes: straight ASCII** (`'` and `"`), never curly, so the
  strings stay easy to edit and match the rest of the file. Escape as needed.
- **One space** after a period. No double spaces.
- **No terminal period** on buttons, tab labels, headings, or short list
  labels. Full sentences in toasts, dialogs, tips and Kael's lines do take a
  period.
- **Exclamation marks**: allowed in Kael's praise and celebration strings, one
  per string maximum. Never in a plain UI label.
- **Ellipsis**: three ASCII dots `...`, not `…`, and only for a genuinely
  unfinished action ("Loading...").

## 4. Feature names — one form, everywhere

These are the app's own names. Do not invent variants.

| Correct | Never write |
|---|---|
| Play | Play vs Engine, Game |
| Analysis | Analyse, Analysis Board |
| Databases | Base, Bases, DB |
| Openings | Opening Trainer, Trainer, Opening Explorer* |
| Puzzles | Tactics, Tactics Trainer |
| Puzzle Rush | Rush, Puzzle rush |
| Blindfold | Blindfold Mode, Blind |
| Learn | Learning, Lessons tab |
| Rules / Basic Checkmates / Endings | the three sections inside **Learn** |
| Game History | History, Game history |
| Profile | Account |

\* **Opening Explorer** is the correct name for the *move-tree panel inside
Analysis*. It is a component, not the tab. The tab is **Openings**.

**Endgame vs Endings.** `Endings` is the name of the section inside Learn.
`endgame` (lowercase) is the chess phase and is used in running text. `Endgame`
capitalized is only correct in `Endgame ELO`, which is one of the four rating
domains. There is **no Endgame tab** — any string that says so is a bug.

## 5. Chess terminology — highest priority

Where plain English and correct chess English disagree, chess English wins.
Follow FIDE, Chess.com, Lichess and ChessBase usage.

Locked spellings and forms:

checkmate (one word) · stalemate · castling / castle kingside / castle
queenside · en passant (two words, no hyphen, not italic) · promotion ·
underpromotion · fork · pin · skewer · discovered attack · double check ·
zugzwang · opposition · tempo (pl. tempi) · initiative · blunder · mistake ·
inaccuracy · candidate move · principal variation · evaluation · opening ·
middlegame (one word) · endgame (one word) · variation · repertoire · file ·
rank · diagonal · passed pawn · isolated pawn · doubled pawns · back-rank mate
(hyphenated) · grandmaster (one word, lowercase unless a title)

Also:
- "**mate in 2**", not "mate in two" or "#2" in prose.
- "**a draw**" / "**the game is drawn**"; "tables" is a Spanish calque (*tablas*)
  and is always wrong in English.
- **Name the outcome when a label states how a game ended.** Adrian settled this
  on 2026-08-08: a beginner reading "Threefold repetition" or "Insufficient
  material" cannot tell whether they won, lost or drew. Every drawing ending
  therefore leads with the word: **Draw by threefold repetition**, **Draw by the
  fifty-move rule**, **Draw by insufficient material**, **Draw by stalemate**.
  Endings that are already unambiguous stay bare — `Checkmate`, `Resignation`,
  `Time forfeit`, `Unfinished`. This governs the `history_end_*` keys and any
  future set of end-reason labels.
- "**resign**", never "surrender" or "give up".
- "**move**" for a full move, "**ply**" only if the UI truly means half-moves.
- "the **board**", not "the table" (another calque from *tablero*).
- "**piece**" excludes pawns in strict usage; if a string means everything on
  the board, say "pieces and pawns" or "material".
- "**White**/**Black**" name the players; "white/black" as adjectives for
  squares and pieces.

## 6. One word per concept

| Use | Not |
|---|---|
| New game | Create game, Start game |
| Delete | Remove, Erase |
| Save | Store, Keep |
| Cancel | Close (when it aborts an action) |
| Close | Dismiss, Exit (when it just closes a view) |
| Exit | Close, Leave (when it leaves a *mode* you were inside) |
| Back | Return, Go back |
| Import / Export | Load / Download |
| Settings | Preferences, Options |
| Hint | Clue, Tip (Tip = a teaching note, not a puzzle nudge) |
| Level | Difficulty (Difficulty = the puzzle slider only) |
| Streak | Run |

**Three exceptions settled by Adrian 2026-08-08, do not reopen:**

- **`Start game` on the Play tab stays.** The "New game" rule above still holds
  everywhere else, but `new_game` is already a different button on the Databases
  screen, where it creates an empty game record. One label for two unrelated
  actions would be worse than the exception. `start_game` is the button that
  begins a game against the engine, on Play and on Openings.
- **`Share database (PGN)` stays "Share", not "Export".** On a phone that button
  really does open the system share sheet, so Share is the honest word. `Import
  PGN` and `📤 Export PGN` are unaffected — Export remains the house word for
  writing a file.
- **A draw must say it is a draw.** See §5.

**Settings covers per-feature sheets too — settled by Adrian 2026-08-08 (batch
7), do not reopen.** The Settings row above is not limited to the app-wide
Settings screen. A sheet that holds one feature's own preferences is named
`<Feature> settings`, never `Options`: the gear on the Puzzles tab opens
**`Puzzle settings`**, which is both its screen-reader label and the sheet's
heading. "Options" is out of the vocabulary.

**A relative scale must be worded relatively — settled by Adrian 2026-08-08
(batch 7), do not reopen.** If a control's steps are offsets from something the
user already has, the labels say so. The puzzle difficulty steps are ±500 and
±250 ELO around the player's own rating, so they read **Much easier / Easier /
Normal / Harder / Much harder** — not `Easiest … Harder`, which sounds absolute
and does not even pair up. Superlatives (`Easiest`, `Hardest`) are only correct
when the ends of the scale really are fixed.

**Close vs Exit — settled by Adrian 2026-08-08, do not reopen.** `Close` shuts
something that sits *on top of* the screen: a dialog, a sheet, a panel. `Exit`
leaves a *mode* the whole screen was in and puts you back where you came from —
`Exit database`, `Exit game`. Both stay in the vocabulary; they are not
synonyms.

**The engine, not the computer.** The opponent Stockfish provides is the
**engine**, everywhere, in every string: `Engine on`, `The engine didn't
respond`, `Play against the engine from here`, `Game vs engine`. Never "the
computer", "the machine", "the bot" or "the AI" in running text. (`{lvl} bot` in
`history_bot_name` is the one exception and is frozen by §10 anyway.)

## 7. Voice

- Second person, present tense. "You solved it", not "Puzzle was solved".
- Active voice. Short sentences. No corporate register.
- **Kael** (the mentor character) is warm and encouraging, never scolding, and
  speaks in one or two sentences. He may use exclamation marks and contractions.
- The rest of the UI does not use exclamation marks and prefers contractions
  only where they read naturally ("don't", "it's").
- Never blame the user. "That wasn't it — try again", not "Wrong answer".

## 8. Placeholders and emoji — mechanical, do not touch

- Tokens like `{lvl}` and `{n}` are replaced in code by `.replace('{lvl}', …)`.
  **Keep the token spelled exactly**, including braces. It may move within the
  sentence; it may not change.
- Many strings start with an emoji: `📜 Game History`, `⚙ Filters`,
  `👁 View PGN`, `🗑 Delete game`, `📤 Export PGN`, `📋 Copy PGN`, `🎯 Practice`,
  `🙈 Blindfold`. **Keep the emoji and the single space after it.**
- Never rename a DICT key. Only the value after `en:` changes.
- Never touch storage/domain keys: `'endgame'`, `puzzleElo`, `endgameElo`,
  `openingElo`, `blindfoldElo`, `earnedBadges`, avatar ids, badge ids.
- Puzzle theme ids (`fork`, `pin`, `discoveredAttack`, `zugzwang`,
  `backRankMate` …) are Lichess dataset identifiers. Their **display names** in
  i18n may be improved; the **ids** must never change.

## 9. Length — the 375px rule

This is a mobile-first PWA judged at 375px. Better English is often longer
English, and longer labels break layouts.

- Bottom tab labels: **10 characters max**, one word.
- Segmented control (`.seg`) options: **12 characters max**.
- Buttons that sit in a `.row` pair: **16 characters max** including the emoji.
- List lines using `.ellipsis` may be long — they truncate by design.
- If the better wording is longer than the budget, keep the shorter wording and
  note it in the batch report rather than silently overflowing the layout.

**The character counts are a proxy; a real measurement beats them — settled by
Adrian 2026-08-08 (batch 7).** They exist so nobody has to boot a browser for an
obvious call. When a longer string is required by another rule, measure the
rendered width at 375px and report the number: if it genuinely fits, the budget
yields. That is how `⚡ Rush` became **`⚡ Puzzle Rush`** (13 characters in a
12-character segmented control) — §4 forbids the bare "Rush", and the three
buttons measure 349px of the 355px strip, so nothing scrolls. **That strip now
has about 5px of slack: treat all three mode labels as frozen.** Never widen a
control on a string-length guess — measure first, or keep the short wording.

## 10. Strings that are written into saved files

`history_you` ("You"), `history_bot_name` ("{lvl} bot") and `history_event`
("Game vs engine") are baked into the White / Black / Event headers of every
PGN saved in Game History. Changing them does not rewrite games already saved,
so a user's history would show both wordings side by side. **Leave them alone**
unless Adrian explicitly asks.

## 11. Out of scope

`js/legal-data.js` (`LEGAL_TERMS`, `LEGAL_PRIVACY`) is the Terms of Service and
the Privacy Policy. Rewording them can change what Adrian is legally committing
to, and the privacy policy describes real data practices. **Do not edit.**
Typos only, and only after showing Adrian the exact before/after and getting a
yes.

The brand name **Chess Training Center** never changes — including its US
spelling of "Center".
