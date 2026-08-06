# Read tab — prompt to paste into the Chess conversation

Paste everything inside the code block below.

---

```
I want to add a new tab to the app: "Read". Plan it with me first — do NOT write
any code yet. I want to agree the approach, then build it in stages.

WHAT IT DOES
1. The user saves their own PDF chess books into the app and reads them in a
   built-in PDF reader.
2. While reading, the user can long-press a chess diagram on the page. The app
   reads that position and opens it in the existing Analysis tab, on a real
   board, ready to play with.

DECISIONS ALREADY MADE — do not re-open these, but tell me if you think one is
actually wrong:

- PDF rendering: Mozilla's PDF.js (53.6K stars, Apache-2.0). Self-hosted in
  vendor/ exactly like chess.js and the Stockfish wasm already are, so the
  reader keeps working offline.

- Storage: the user's books go in IndexedDB, through the existing js/db.js.
  That means bumping DB_NAME 'mi-ajedrez' from DB_VER 1 to 2 and adding a books
  store, alongside the current bases / games / kv stores.

- Books must NEVER be uploaded to Firebase. If a user saves a copyrighted chess
  book and it lands in my Firebase Storage, I am hosting pirated material under
  my own name with a Play Store listing attached. Each book stays on the device
  that opened it. I store nothing. This is a hard rule.

- Diagram to FEN: NO machine learning, NO cloud API, nothing leaves the phone.
  A diagram in a PDF is not a photograph — it is clean, square, axis-aligned,
  and every piece of the same type inside one book is pixel-identical. So:
    a) find the 8x8 grid from its lines,
    b) slice it into 64 squares,
    c) classify each square by template matching.
  To get the templates, calibrate once per book: the first time the user
  long-presses a diagram, show it and ask "is this the starting position?".
  Most chess books open with one. That single confirmation captures all 12
  piece images in that book's own style, and every later diagram in that book
  then matches almost perfectly. Store the templates with the book record.
  If the user says it is not the starting position, fall back to asking them to
  tap the pieces once to teach it, or let them correct the position by hand on
  the board afterwards.

CONSTRAINTS
- Offline-first PWA heading to the Play Store as a TWA. Everything self-hosted.
  No CDN, no external API, no placeholder images.
- Audit against the app's existing design language (Kael, navy and gold, the
  existing tab bar). Do not invent a new visual style for this tab.
- Mobile-first. Judge every screen at phone size.
- I am not a programmer. Explain choices in plain language and keep the
  instructions monkey-proof.
- Books are large. Tell me what happens when the phone runs out of storage
  quota, before it happens to a user.

WHAT I WANT BACK, IN THIS ORDER
1. Anything above you think is a mistake, and why.
2. The build split into stages that each work on their own — I would rather have
   a working PDF reader with no diagram detection than a half-built version of
   both. Tell me which stage delivers the most value first.
3. For the diagram-to-FEN part specifically: where you expect it to fail, and
   what the user sees when it does. It must degrade into "here is the board,
   fix it yourself" and never into a wrong position presented as correct.
4. Whether any of this breaks the Play Store build or the service worker
   (currently chess-training-center-v11).
5. An honest estimate of how big this feature is compared to what is already in
   the app.
```
