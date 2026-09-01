# Read tab — continuous vertical scroll (design)

**Date:** 2026-08-31
**Scope:** Rebuild `js/read.js`'s viewer from one-page-at-a-time to continuous
vertical scrolling. Shelf, import, quota, diagram detection (`js/diagram.js`),
and progress persistence are unchanged in purpose — only how pages are laid out
and navigated changes.

## Goal

Scroll continuously through a PDF instead of stepping one page at a time. Must
keep working: pinch-zoom, long-press-to-read-a-diagram (its canvas→board math
mapping to whichever page was pressed), the page-number indicator, and
resume-where-I-stopped.

## Chosen approach — A: native scroll column with recycled page canvases

`#read-stage` becomes a **native vertical scroller** (`overflow:auto`) — native
scrolling gives free, smooth inertia, which is the "scrolling is smooth" bar.
Inside it a **column** (`#read-col`) is sized to the *whole* book's height so the
scrollbar is honest, but only a small **pool of canvases** (the pages near the
viewport plus a one-page buffer each side) are rendered; canvases are recycled to
pages coming into view as you scroll. Memory stays flat regardless of page count.

### Layout geometry (base coordinates × zoom)

All layout is computed in **base units** (the zoom-1 fit-to-width frame) and
multiplied by the current zoom `Z`:

- `basePageW = stage.clientWidth` (fit page to stage width at zoom 1).
- `basePageH = basePageW * (h1 / w1)` — aspect ratio taken from **page 1**.
  Chess books are uniform; a page with a different real ratio is letterboxed
  (centered) in its slot rather than forcing per-page pre-measurement of all 194
  pages (which would defeat lazy loading). Documented limitation.
- `baseGap` = fixed gap between pages.
- `baseSlotH = basePageH + baseGap`; page N top = `(N-1) * baseSlotH`.
- On screen: `colW = basePageW * Z`, page height `= basePageH * Z`,
  page N top(px) `= (N-1) * baseSlotH * Z`, `totalH(px) = pageCount * baseSlotH * Z`.

### Rendering

- On scroll (rAF-throttled) compute the visible page range from `scrollTop` and
  stage height; render `[first-1 .. last+1]`; release canvases outside that range
  back to the pool.
- A page renders at `renderScale = (colW / vp0.width) * dpr` (dpr capped at 2),
  i.e. sized to its **on-screen** width — so pages stay crisp at the current zoom.
  Re-render visible pages (debounced) after a pinch settles to a new zoom.
- Keep the existing undecodable-scan notice (`maybeFlagUndecodable`) per page,
  shown as an overlay on that page's slot.

### Gestures (pointer events on `#read-stage`)

- **Vertical scroll:** native. `touch-action: pan-y` at zoom 1.
- **Pinch-zoom:** two pointers → take over, scale `Z` about the pinch midpoint,
  adjusting `scrollTop`/`scrollLeft` so the anchored content point stays under the
  fingers. `MAX_ZOOM` kept. When `Z>1`, `touch-action: pan-x pan-y` so one finger
  also pans horizontally (native).
- **Double-tap:** toggle zoom 1↔2 about the tap point (kept).
- **Long-press (diagram):** one stationary finger past `LONGPRESS_MS`. Resolve the
  **page canvas under the finger** (geometry from `scrollTop`+client Y, or
  `elementFromPoint`), map client→that canvas's device pixels, then run the
  existing `detectBoard`/`calibrate`/`classifyBoard` path on that page's pixels.
- **Removed:** horizontal swipe page-turn (`SWIPE_TURN`) and the ◀ ▶ single-step
  buttons — both are subsumed by scrolling.

`#read-stage` stays in the app's `SWIPE_SAFE` list, so scrolling never leaks into
the app's tab-swipe navigation (unchanged guarantee).

### Navigation bar — tap-to-jump

Replace the two arrows with a single **"Page N / M"** control (reuse
`#read-page-ind`, make it a button). Tapping it asks for a page number (existing
`askText`) and scrolls that page to the top of the view. The indicator updates
live from the top-most visible page as you scroll.

### Progress / resume

- `saveProgress()` still writes `db.updateBookMeta(id, {page})`, throttled; the
  "current page" is the top-most visible page during scroll.
- On open, after layout, `scrollTop = pageTop(savedPage)` so the saved page sits
  at the top of the view (instead of snapping a single page in).
- `closeBook()` still flushes the final page and frees the doc + canvases.

## What is NOT changing

Shelf (`refresh`, `bookCard`, `bookMenu`), import (`importFile`, quota checks,
`renderCover`, persist), diagram CV (`js/diagram.js`), Setup hand-off
(`openInSetup`), DB schema, i18n keys (only adding a jump-prompt string).

## Verification

Both committed CDP harnesses are written against the old single-canvas +
transform + ◀▶ model, so **both are updated** to drive the scroller — same
guarantees: render/paint, page indicator, resume, offline, quota refusal,
migration, no tab-swipe leak (stage 1); detect/calibrate/classify/teach/flip and
long-press→Setup on the page under the finger (stage 2). Manual checks at 375px,
light + dark, es + en: smooth scroll, pinch-zoom, long-press opens a diagram onto
the board, progress resumes on reopen. Bump `sw.js` v89→v90 (precached files
change).
