// Read tab — a PDF reader for chess books the user already owns.
//
// Stage 1 is the reader ONLY: a shelf of imported PDFs and a page-by-page
// viewer with pinch-zoom that remembers where you stopped. No diagram
// detection of any kind (that is Stage 2).
//
// HARD RULE: books never leave the device. The PDF Blob lives in the IndexedDB
// `books` store (js/db.js), which Firestore sync (SYNCED_KEYS in firebase.js,
// kv-only) is structurally unable to reach. There is deliberately no "back up
// my books" path — a copyrighted book in my Firebase Storage would be pirated
// material hosted under my own name with a Play Store listing attached.
//
// PDF rendering is Mozilla's PDF.js (Apache-2.0, pdfjs-dist 6.3.289), vendored
// in vendor/pdfjs-6.3.289/ (the folder carries the version, as for the
// Firebase SDK — an upgrade is a NEW folder, never new files under the old
// names: the service worker keeps the worker and the wasm across updates and
// never replaces a kept file). It is imported
// lazily the first time a book is opened or added, so a launch by someone who
// never opens Read pays none of its ~500 KB parse cost. Shipped without the
// cmaps/ and standard_fonts/ folders — chess books are Latin text with
// figurine fonts; add them only if a real book renders wrong.
import * as db from './db.js';
import { t, tn } from './i18n.js';
import { $, esc, toast, modal, askConfirm, askText, sheet, Setup } from './app.js';
import { getPieceSet } from './board.js';
import { START_FEN } from './tree.js';
import { detectBoard, buildTemplates, buildTemplatesFromGrid, classifyBoard,
         boardCells, learnFromCells, cropBoardCanvas, gridToFen } from './diagram.js';
import { findCovers, textChars } from './read-training.js';

const MAX_ZOOM = 4;
const TAP_SLOP = 10;        // px a "tap" may move before it stops being a tap
const LONG_SLOP = 16;       // a finger held for the long-press drifts more than a tap; be
                            // forgiving so natural jitter doesn't cancel the diagram open
const DBLTAP_MS = 300;
const LONGPRESS_MS = 500;   // stationary hold that opens a diagram (Stage 2)
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

// ── PDF.js, loaded on demand ────────────────────────────────────────────────
// Folder that holds the image-decoder wasm (jbig2.wasm, openjpeg.wasm). pdf.js
// v6 fetches `${wasmUrl}<name>.wasm` from inside its worker to decode scanned
// pages; without it a JBIG2- or JPEG2000-encoded scan (many endgame books are
// full-page scans of exactly that kind) decodes to nothing and the reader shows
// a pure-white page. Must end in '/'. Passed per getDocument() call below —
// unlike workerSrc there is no global setter for it. Like the worker, the wasm
// is NOT precached; it is stored on first use, in the cache that outlives an
// app update (KEEP in sw.js).
const PDF_WASM_URL = new URL('../vendor/pdfjs-6.3.289/', import.meta.url).href;
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('../vendor/pdfjs-6.3.289/pdf.min.mjs');
  // The worker is a separate ~1.3 MB file; resolve it next to this module so it
  // works whatever path the app is served from. It is NOT precached by the
  // service worker (same reasoning as the Stockfish wasm) — it is stored on
  // first use, in the cache that outlives an app update (KEEP in sw.js), so a
  // book already on the phone still opens offline after one.
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs-6.3.289/pdf.worker.min.mjs', import.meta.url).href;
  pdfjsLib = lib;
  return lib;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtBytes(n) {
  n = Math.max(0, n || 0);
  if (n < 1024) return n + ' B';
  const kb = n / 1024; if (kb < 1024) return Math.round(kb) + ' KB';
  const mb = kb / 1024; if (mb < 1024) return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  const gb = mb / 1024; return (gb < 10 ? gb.toFixed(1) : Math.round(gb)) + ' GB';
}

async function estimateStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.code === 22 ||
                   /quota/i.test(err.message || ''));
}

function debounce(fn, ms) {
  let timer;
  return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
}

// A plain full-screen "working…" overlay for the brief moment an import renders
// its cover. Not modal() — nothing awaits a close; we remove it ourselves.
function showBusy(msg) {
  const w = document.createElement('div');
  w.className = 'read-busy';
  w.innerHTML = `<div class="read-busy-card"><div class="read-spinner"></div><p>${esc(msg)}</p></div>`;
  document.body.appendChild(w);
  return w;
}

// ── shelf ───────────────────────────────────────────────────────────────────
export async function refresh() {
  // Only the shelf shows here; if a book is somehow open when the shelf is
  // asked to redraw (e.g. a language switch), leave the reader alone.
  const grid = $('read-grid');
  if (!grid) return;
  const books = await db.listBookSummaries();
  grid.innerHTML = '';
  $('read-empty').classList.toggle('hidden', books.length > 0);
  for (const b of books) grid.appendChild(bookCard(b));

  // Storage line: "3 books · 61 MB · 2.1 GB free".
  const totalBooks = books.reduce((s, b) => s + (b.size || 0), 0);
  const est = await estimateStorage();
  const parts = [tn('read_books_count', books.length)];
  if (totalBooks) parts.push(fmtBytes(totalBooks));
  if (est && est.quota != null) {
    parts.push(t('read_free').replace('{n}', fmtBytes(est.quota - est.usage)));
  }
  $('read-storage').textContent = parts.join('  ·  ');

  // Quiet, ambient line only while storage is NOT persistent and there is
  // something to lose. Not a toast, not repeated — one line on the shelf.
  let notPersisted = false;
  if (books.length && navigator.storage && navigator.storage.persisted) {
    try { notPersisted = !(await navigator.storage.persisted()); } catch {}
  }
  $('read-persist-warn').classList.toggle('hidden', !notPersisted);
}

function bookCard(b) {
  const card = document.createElement('div');
  card.className = 'read-card';
  card.tabIndex = 0;

  const cover = document.createElement('div');
  cover.className = 'read-cover';
  if (b.cover) {
    const img = document.createElement('img');
    img.src = b.cover; img.alt = ''; img.loading = 'lazy';
    cover.appendChild(img);
  } else {
    cover.textContent = '📄';
  }

  const meta = document.createElement('div');
  meta.className = 'read-meta';
  const title = document.createElement('div');
  title.className = 'read-card-title'; title.textContent = b.name;
  const sub = document.createElement('div');
  sub.className = 'read-card-sub';
  sub.textContent = t('read_page_of').replace('{p}', b.page || 1).replace('{n}', b.pageCount || '?');
  meta.append(title, sub);

  const menu = document.createElement('button');
  menu.className = 'read-card-menu';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', t('read_more'));
  menu.onclick = (e) => { e.stopPropagation(); bookMenu(b); };

  card.append(cover, meta, menu);
  card.onclick = () => openBook(b.id);
  card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(b.id); } };
  return card;
}

function bookMenu(b) {
  const items = [
    {
      label: '✏️ ' + t('rename'),
      action: async () => {
        const name = await askText(t('read_rename_title'), b.name);
        if (name) { await db.updateBookMeta(b.id, { name }); refresh(); }
      },
    },
  ];
  // Only shown once this book has been calibrated. Clearing the templates makes
  // the next long-press re-ask "is this the starting position?" — the escape
  // hatch when the first answer was wrong, or the book's style was misread.
  if (b.templates) {
    items.push({
      label: '♟ ' + t('read_recalib'),
      action: async () => {
        await db.updateBookMeta(b.id, { templates: null });
        if (R.id === b.id) R.templates = null;
        toast(t('read_recalib_done'));
      },
    });
  }
  items.push({
    label: '🗑 ' + t('delete'),
    danger: true,
    action: async () => {
      const ok = await askConfirm(t('read_delete_confirm').replace('{name}', esc(b.name)));
      if (ok) { await db.deleteBook(b.id); toast(t('read_deleted')); refresh(); }
    },
  });
  sheet(items);
}

// ── import ──────────────────────────────────────────────────────────────────
function importBook() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (file) await importFile(file);
  });
  input.click();
}

// Try once, ever, to make storage persistent so Android does not evict books
// under pressure. Guarded by a kv flag so we ask exactly once; the shelf's
// live persisted() check (not this flag) drives the warning line.
async function ensurePersist() {
  if (await db.kvGet('booksPersistAsked', false)) return;
  await db.kvSet('booksPersistAsked', true);
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch {}
  }
}

// Imports one chosen PDF File: type check, up-front quota check, then store.
// Exported so the picker (importBook) and tests can share the one code path.
export async function importFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) { toast(t('read_not_pdf')); return; }

  // Quota check BEFORE anything is read or written: if the book will not fit,
  // refuse with both numbers named and save nothing.
  const est = await estimateStorage();
  if (est && est.quota != null) {
    const free = est.quota - est.usage;
    if (file.size > free) {
      await modal((box, close) => {
        box.innerHTML =
          `<h3>${esc(t('read_full_title'))}</h3>` +
          `<p class="hint">${esc(t('read_full_body')
            .replace('{size}', fmtBytes(file.size))
            .replace('{free}', fmtBytes(free)))}</p>`;
        const row = document.createElement('div'); row.className = 'row';
        const ok = document.createElement('button');
        ok.className = 'btn primary'; ok.textContent = t('close');
        ok.onclick = () => close(null);
        row.append(ok); box.append(row);
      });
      return;
    }
  }

  await ensurePersist();

  const overlay = showBusy(t('read_adding'));
  try {
    const buf = await file.arrayBuffer();
    const pdfjs = await loadPdfjs();
    // A genuinely broken / non-PDF file rejects here — caught below.
    const doc = await pdfjs.getDocument({ data: buf, wasmUrl: PDF_WASM_URL }).promise;
    const pageCount = doc.numPages;
    const cover = await renderCover(doc);
    try { doc.destroy(); } catch {}

    const rec = {
      name: file.name.replace(/\.pdf$/i, '').trim() || t('read_untitled'),
      blob: file, size: file.size, cover, pageCount,
      page: 1, addedAt: Date.now(), openedAt: Date.now(),
    };

    try {
      await db.addBook(rec);
    } catch (err) {
      // A book is 5–50 MB, so the quota can be exhausted mid-write even though
      // the up-front check passed (another tab wrote, the estimate was stale).
      // The add is a single-record transaction, so IndexedDB rolls the partial
      // write back on abort — nothing lingers, and the other books are
      // untouched. We only have to tell the user.
      if (isQuotaError(err)) toast(t('read_full_mid'));
      else { console.error('[read] addBook failed', err); toast(t('read_add_failed')); }
      return;
    }
    toast(t('read_added'));
    await refresh();
  } catch (err) {
    console.error('[read] import failed', err);
    toast(t('read_bad_pdf'));
  } finally {
    overlay.remove();
  }
}

async function renderCover(doc) {
  try {
    const page = await doc.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = 240 / vp0.width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;   // no cover is fine — the card falls back to 📄
  }
}

// ── reader ──────────────────────────────────────────────────────────────────
const GAP = 8;            // px between pages at zoom 1
const BUFFER = 1;         // extra rows rendered above and below the viewport
// Two-page view: a spread shows both pages WHOLE when a whole page is still at
// least this wide (a PC, a tablet). Below that (a phone held sideways, where a
// whole page would be ~220px) each page takes half the width instead and the
// row is taller than the screen — readable, and you scroll down for the rest.
const SPREAD_MIN_W = 340;
const SPREAD_KEY = 'readTwoPages';   // '0' = the user switched two-page view off
const R = {
  id: null, doc: null, page: 1, pageCount: 1,
  zoom: 1,
  p1ratio: 1.3,                 // page-1 height/width, drives every slot's height
  basePageW: 0, basePageH: 0,   // one page's CSS size at zoom 1 (fit to stage)
  baseColW: 0, stageH: 0,       // the column's CSS width, and the stage's height, at zoom 1
  spread: false,                // two-page view: rows of two pages, the cover alone
  lastSingle: 0,                // the page shown when two-page view took over
  slots: new Map(),             // page number -> slot object (see makeSlotEl)
  pool: [],                     // detached .read-page elements for reuse
  scrollRaf: 0, reRenderTimer: null,
  saveTimer: null,
  templates: null,              // per-book piece templates, calibrated on first use
  training: false,              // Training mode: "!" moves are covered (per book)
  hasText: null,                // false = a scan (no text to cover); null = not checked yet
};

async function openBook(id) {
  const book = await db.getBook(id);
  if (!book) { toast(t('read_missing')); refresh(); return; }

  $('read-shelf').classList.add('hidden');
  $('read-reader').classList.remove('hidden');
  document.body.classList.add('reading');
  $('read-book-title').textContent = book.name;
  $('read-page-ind').textContent = '';
  setLoading(true);

  // Float this book to the top of the shelf next time.
  db.updateBookMeta(id, { openedAt: Date.now() });

  try {
    const pdfjs = await loadPdfjs();
    const buf = await book.blob.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, wasmUrl: PDF_WASM_URL }).promise;
    R.id = id; R.doc = doc; R.pageCount = doc.numPages;
    // Piece templates ride on the book record. Drop anything older than ver 3:
    // ver-2 templates carry no empty-square patterns, so classifyBoard would fall
    // back to the luminance-spread occupancy test that misreads hatched boards
    // (a shelf of phantom queens). Discarding them makes the next long-press
    // re-learn the book with the current method instead of reusing a broken read.
    R.templates = (book.templates && book.templates.ver >= 3) ? book.templates : null;
    R.training = !!book.training;
    R.hasText = typeof book.hasText === 'boolean' ? book.hasText : null;
    syncTrainBtn();
    R.zoom = 1;
    // Page-1 aspect ratio sets every slot's height so the column (and scrollbar)
    // is the whole book's height without pre-measuring all pages. Chess books are
    // uniform; an odd-sized page is letterboxed in its slot — see the design doc.
    const p1 = await doc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    R.p1ratio = vp1.height / vp1.width || 1.3;
    R.page = clampPage(book.page || 1);
    $('read-stage').style.touchAction = 'pan-y';
    setSpread(false);   // a book always opens in the one-page view (full screen is off)
    measure();
    layout();
    // Resume: put the saved page at the top of the view, then render what shows.
    $('read-stage').scrollTop = pageTop(R.page);
    syncSlots();
    updatePageInd();
    // Wait for the first page to paint before dropping the spinner.
    await (R.slots.get(R.page)?.render);
    checkHasText();   // not awaited: only decides whether the Training button is live
  } catch (err) {
    console.error('[read] open failed', err);
    toast(t('read_open_failed'));
    closeBook();
  } finally {
    setLoading(false);
  }
}

// ── layout: base = zoom-1 units, multiplied by R.zoom for what's on screen ────
// The zoom-1 sizes for the stage as it is now. One-page view: the page is as wide
// as the stage. Two-page view: two pages side by side, see SPREAD_MIN_W.
function geometry() {
  const stage = $('read-stage');
  const w = stage.clientWidth || 320;
  if (!R.spread) return { colW: w, pageW: w };
  const half = (w - GAP) / 2;
  const whole = ((stage.clientHeight || 1) - 2) / R.p1ratio;   // -2: keep the page's outline in view
  return { colW: w, pageW: Math.floor(whole >= SPREAD_MIN_W ? Math.min(half, whole) : half) };
}
// Taken when the stage's size or the view changes — never during a zoom, so the
// base units setZoomAbout works in cannot shift under a pinch.
function measure() {
  if (!$('read-stage')) return;
  const g = geometry();
  R.stageH = $('read-stage').clientHeight || 1;   // at zoom 1: no sideways scrollbar eating into it
  R.baseColW = g.colW;
  R.basePageW = g.pageW;
  R.basePageH = R.basePageW * R.p1ratio;
}
function layout() {
  const stage = $('read-stage'), col = $('read-col');
  if (!stage || !col) return;
  col.style.width = colW() + 'px';
  // A whole spread is a hair shorter than the stage, so the column is padded for
  // the last row to reach the top like every other (else it is never "current").
  const h = R.spread ? Math.max(totalH(), pageTop(R.pageCount) + R.stageH) : totalH();
  col.style.height = h + 'px';
}
// Whole spreads settle on a row when the scroll comes to rest (css/style.css).
// Switched on only AFTER the pages and the scroll are in place: with it on, the
// browser would snap to wherever the old view's pages still stood.
function syncSnap() {
  const stage = $('read-stage');
  stage.classList.toggle('snap-rows', R.spread && R.zoom === 1 && R.basePageH <= R.stageH);
}
function colW()      { return R.baseColW * R.zoom; }
function pageW()     { return R.basePageW * R.zoom; }
function slotH()     { return (R.basePageH + GAP) * R.zoom; }
function pageH()     { return R.basePageH * R.zoom; }
// Rows. One-page view: a row is a page. Two-page view pairs the pages like the
// printed book — the cover alone, then 2-3, 4-5 (even pages on the left).
function rowOf(n)    { return R.spread ? n >> 1 : n - 1; }
function rowFirst(r) { return r <= 0 ? 1 : (R.spread ? 2 * r : r + 1); }
function rowLast(r)  { return clampPage(r <= 0 ? 1 : (R.spread ? 2 * r + 1 : r + 1)); }
function pageTop(n)  { return rowOf(n) * slotH(); }
function pageLeft(n) {
  if (!R.spread) return 0;
  const x0 = (R.baseColW - 2 * R.basePageW - GAP) / 2;
  const x = n === 1 ? (R.baseColW - R.basePageW) / 2 : n % 2 ? x0 + R.basePageW + GAP : x0;
  return x * R.zoom;
}
function totalH()    { return pageTop(R.pageCount) + pageH(); }
function clampPage(n) { return Math.min(Math.max(1, n | 0), R.pageCount); }

// The top-most page under the viewport's top edge — the "current" page. In the
// two-page view that is the left page of the row.
function topVisiblePage() {
  return clampPage(rowFirst(Math.floor(($('read-stage').scrollTop + 1) / slotH())));
}

// Ensure a canvas exists for every page near the viewport, recycle the rest, and
// keep the current-page indicator/progress in step with the scroll position.
function syncSlots() {
  const stage = $('read-stage');
  if (!R.doc || !stage) return;
  const sh = stage.clientHeight || 1, sh2 = slotH();
  const first = clampPage(rowFirst(Math.floor(stage.scrollTop / sh2) - BUFFER));
  const last  = rowLast(Math.floor((stage.scrollTop + sh) / sh2) + BUFFER);

  for (const n of [...R.slots.keys()]) if (n < first || n > last) releaseSlot(n);
  for (let n = first; n <= last; n++) ensureSlot(n);
  // Reposition/resize all live slots to the current zoom (covers a zoom change).
  for (const [n, slot] of R.slots) {
    slot.el.style.top = pageTop(n) + 'px';
    slot.el.style.left = pageLeft(n) + 'px';
    slot.el.style.width = pageW() + 'px';
    slot.el.style.height = pageH() + 'px';
  }
  const top = topVisiblePage();
  if (top !== R.page) { R.page = top; updatePageInd(); saveProgress(); }
}

function makeSlotEl() {
  const el = document.createElement('div');
  el.className = 'read-page';
  const canvas = document.createElement('canvas');
  const blank = document.createElement('div');
  blank.className = 'read-blank hidden';
  blank.innerHTML =
    `<div class="read-blank-inner">` +
      `<p class="read-blank-title">${esc(t('read_blank_title'))}</p>` +
      `<p class="hint">${esc(t('read_blank_body'))}</p>` +
    `</div>`;
  el.append(canvas, blank);
  return el;
}

function ensureSlot(n) {
  let slot = R.slots.get(n);
  if (slot) return slot;
  const el = R.pool.pop() || makeSlotEl();
  el.dataset.page = n;
  el.style.top = pageTop(n) + 'px';
  el.style.left = pageLeft(n) + 'px';
  el.style.width = pageW() + 'px';
  el.style.height = pageH() + 'px';
  el.querySelector('.read-blank').classList.add('hidden');
  $('read-col').appendChild(el);
  slot = { n, el, canvas: el.querySelector('canvas'), token: 0, scale: 0,
           task: null, rendered: false, render: null,
           covers: null, covering: false };   // Training mode's layer of covers
  R.slots.set(n, slot);
  slot.render = renderSlot(n);
  return slot;
}

function releaseSlot(n) {
  const slot = R.slots.get(n);
  if (!slot) return;
  if (slot.task) { try { slot.task.cancel(); } catch {} slot.task = null; }
  slot.token++;                                   // invalidate any in-flight render
  clearCovers(slot);                              // the element is reused for another page
  slot.el.remove();
  slot.canvas.width = 0; slot.canvas.height = 0;  // free the bitmap
  R.slots.delete(n);
  if (R.pool.length < 8) R.pool.push(slot.el);
}

// Render page n into its slot's canvas, sized to the page's on-screen width so it
// stays crisp at the current zoom. Guarded so a recycled or superseded slot never
// paints a stale page.
async function renderSlot(n) {
  const slot = R.slots.get(n);
  if (!slot || !R.doc) return;
  const targetW = pageW();
  if (slot.rendered && Math.abs(slot.scale - targetW) < 1) return;   // already crisp
  const token = ++slot.token;
  if (slot.task) { try { slot.task.cancel(); } catch {} slot.task = null; }

  let page;
  try { page = await R.doc.getPage(n); } catch { return; }
  if (R.slots.get(n) !== slot || token !== slot.token) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp0 = page.getViewport({ scale: 1 });
  // OVERSAMPLE gives pinch headroom before a re-render and keeps the pixels at the
  // resolution diagram detection (js/diagram.js) is tuned for; capped so a deep
  // zoom can't blow up a canvas.
  const OVERSAMPLE = 1.5, MAX_DEV_W = 2400;
  let scale = (targetW / vp0.width) * dpr * OVERSAMPLE;
  if (vp0.width * scale > MAX_DEV_W) scale = MAX_DEV_W / vp0.width;
  const vp = page.getViewport({ scale });
  const canvas = slot.canvas;
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);

  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  slot.task = task;
  try { await task.promise; }
  catch (e) { if (e && e.name !== 'RenderingCancelledException') console.warn('[read] render', e); return; }
  if (R.slots.get(n) !== slot || token !== slot.token) return;
  slot.task = null; slot.rendered = true; slot.scale = targetW;
  slot.el.querySelector('.read-blank').classList.add('hidden');
  maybeFlagUndecodable(page, slot, token);
  buildCovers(slot);
}

// ── Training mode ───────────────────────────────────────────────────────────
// For training alone with a book: every move marked "!" or "!!" is covered, and
// a tap on a cover reveals that one move. The pages are pictures, so this is the
// one place the reader asks pdf.js for the page's TEXT (getTextContent) — only
// for where the words are; nothing is drawn from it. js/read-training.js decides
// which words are covered. A scanned book has no text, so the button is dimmed
// and says so (no OCR: it would break the self-hosted, light-first-launch rules).
//
// The covers live in a layer over the page's canvas and are placed in
// percentages of the page, so zoom, pinch, rotation and the crisp re-render all
// carry them along with no extra work. They are built once per slot, which is
// also what makes a revealed move stay revealed until its page is scrolled away
// (releaseSlot) or the book is closed. With Training off there is no layer.
let measureCtx = null;
function measureText(str, fontName, family) {
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  // pdf.js registers each embedded font under the name it reports for the text
  // (document.fonts), so once the page has rendered this measures with the
  // book's own font; the generic family is the fallback if it did not.
  measureCtx.font = `100px "${fontName}", ${family}`;
  return measureCtx.measureText(str).width;
}

async function buildCovers(slot) {
  if (!R.training || R.hasText === false || slot.covers || slot.covering || !slot.rendered) return;
  slot.covering = true;
  try {
    const page = await R.doc.getPage(slot.n);
    const tc = await page.getTextContent();
    if (R.slots.get(slot.n) !== slot || !R.training) return;   // recycled, or switched off meanwhile
    const layer = document.createElement('div');
    layer.className = 'train-covers';
    for (const b of findCovers(tc, page.getViewport({ scale: 1 }), measureText)) {
      const c = document.createElement('div');
      c.className = 'train-cover';
      c.style.cssText = `left:${b.l * 100}%;top:${b.t * 100}%;width:${b.w * 100}%;height:${b.h * 100}%`;
      layer.appendChild(c);
    }
    slot.el.appendChild(layer);
    slot.covers = layer;
  } catch (e) {
    console.warn('[read] covers', e);
  } finally {
    slot.covering = false;
  }
}

function clearCovers(slot) {
  if (slot.covers) { slot.covers.remove(); slot.covers = null; }
}

// A cover is only a few millimetres wide on a phone, so a tap counts if it lands
// on the cover or within a fingertip of it; the nearest one wins, so two moves
// printed side by side are still revealed one at a time.
const COVER_SLOP = 12;
function coverAtClient(clientX, clientY) {
  const slot = slotAtClient(clientX, clientY);
  if (!slot || !slot.covers) return null;
  let best = null, bestD = COVER_SLOP;
  for (const c of slot.covers.children) {
    const r = c.getBoundingClientRect();
    const dx = Math.max(r.left - clientX, 0, clientX - r.right);
    const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d <= bestD) { best = c; bestD = d; }
  }
  return best;
}

// Is this a text book? Looks at the open page and a few spread through the book;
// the answer is stored on the book record so it is asked once per book.
async function checkHasText() {
  const doc = R.doc, id = R.id;
  if (!doc || R.hasText !== null) return;
  const pages = new Set([R.page]);
  for (let i = 1; i <= 5; i++) pages.add(clampPage(Math.round(R.pageCount * i / 6)));
  let has = false;
  try {
    for (const n of pages) {
      const tc = await (await doc.getPage(n)).getTextContent();
      if (R.doc !== doc) return;
      if (textChars(tc) >= 150) { has = true; break; }
    }
  } catch (e) { console.warn('[read] text check', e); return; }
  R.hasText = has;
  db.updateBookMeta(id, { hasText: has });
  syncTrainBtn();
  if (has) for (const slot of R.slots.values()) buildCovers(slot);
}

function syncTrainBtn() {
  const btn = $('read-training');
  if (!btn) return;
  const scan = R.hasText === false;
  btn.classList.toggle('on', R.training && !scan);
  btn.classList.toggle('unavailable', scan);
  btn.setAttribute('aria-pressed', String(R.training && !scan));
  btn.setAttribute('aria-disabled', String(scan));
}

async function toggleTraining() {
  if (!R.doc) return;
  if (R.hasText === null) await checkHasText();
  if (!R.doc) return;
  if (R.hasText === false) { toast(t('read_training_scan'), 3200); return; }
  R.training = !R.training;
  db.updateBookMeta(R.id, { training: R.training });
  syncTrainBtn();
  for (const slot of R.slots.values()) R.training ? buildCovers(slot) : clearCovers(slot);
  toast(t(R.training ? 'read_training_on' : 'read_training_off'), R.training ? 3200 : 2200);
}

// A page can render cleanly yet paint nothing when its only content is a
// full-page scanned image whose encoding pdf.js can't decode (a JBIG2/JPEG2000
// class we haven't vendored a wasm for — see PDF_WASM_URL). That looks identical
// to a legitimately blank page (a chapter break), so we distinguish the two:
// show the "can't display" notice ONLY when the page came out white AND it
// actually contained an image op that was supposed to paint. A blank page with
// no image stays silently blank. Because the check runs only on a white canvas,
// it can never cover text the reader could otherwise have shown. Not awaited by
// renderSlot — the page is already on screen; this just adds a notice if needed.
async function maybeFlagUndecodable(page, slot, token) {
  let blank;
  try { blank = isCanvasBlank(slot.canvas); } catch { return; }  // getImageData can throw
  if (!blank) return;                                             // real content painted
  let hasImage;
  try { hasImage = await pagePaintsImage(page); } catch { return; }
  if (R.slots.get(slot.n) !== slot || token !== slot.token) return;   // slot recycled/superseded
  if (hasImage) slot.el.querySelector('.read-blank').classList.remove('hidden');
}

// True if the rendered page is essentially all white. Downscales the (oversized)
// canvas to a 64px-wide thumbnail first, so a page number or a line of text still
// leaves several dark thumbnail pixels — only a truly empty page reads as blank.
function isCanvasBlank(canvas) {
  const w = 64, h = Math.max(1, Math.round(64 * canvas.height / canvas.width));
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) ink++;
  }
  return ink <= 2;   // tolerate a couple of downscaled specks (JPEG ring, dust)
}

// True if the page's operator list contains any image-paint op. On a blank
// canvas that means the image was supposed to paint but didn't decode. Called
// only for blank pages, so its cost is never paid on a normal page.
async function pagePaintsImage(page) {
  const OPS = pdfjsLib && pdfjsLib.OPS;
  if (!OPS) return false;
  const imgOps = new Set([OPS.paintImageXObject, OPS.paintImageXObjectRepeat,
                          OPS.paintInlineImageXObject, OPS.paintJpegXObject].filter(v => v != null));
  const ol = await page.getOperatorList();
  for (let i = 0; i < ol.fnArray.length; i++) {
    if (imgOps.has(ol.fnArray[i])) return true;
  }
  return false;
}

function updatePageInd() {
  const last = rowLast(rowOf(R.page));   // two-page view names both pages: "4–5 / 12"
  $('read-page-ind').textContent = (last > R.page ? R.page + '–' + last : R.page) + ' / ' + R.pageCount;
}

// ── two-page view ───────────────────────────────────────────────────────────
// Only in full screen on a screen wider than tall: there the reader takes the
// whole screen (css: body.read-spread) and shows the book as spreads. It comes on
// by itself; the bar's button switches it off and on, and that choice is kept on
// this device. Upright, or out of full screen, the reader is the one column it
// always was.
function spreadPossible() {
  return document.body.classList.contains('read-immersive') && window.innerWidth > window.innerHeight;
}
function wantSpread() {
  let off = false;
  try { off = localStorage.getItem(SPREAD_KEY) === '0'; } catch {}
  return spreadPossible() && !off;
}
function setSpread(on) {
  R.spread = on;
  document.body.classList.toggle('read-spread', on);   // widens the stage: set BEFORE measuring
  syncSpreadBtn();
}
function syncSpreadBtn() {
  const b = $('read-spread');
  if (!b) return;
  b.classList.toggle('hidden', !spreadPossible());
  b.classList.toggle('on', R.spread);
  b.setAttribute('aria-pressed', R.spread ? 'true' : 'false');
}
// The view or the stage's size changed: back to zoom 1, same place in the book.
function relayout() {
  let keep = R.page;
  const was = R.spread;
  setSpread(wantSpread());
  if (R.spread && !was) R.lastSingle = keep;
  // Leaving the spread: return to the very page it took over from, if that page
  // is still one of the two on show.
  if (!R.spread && was && R.lastSingle && (R.lastSingle >> 1) === (keep >> 1)) keep = R.lastSingle;
  R.zoom = 1;
  $('read-stage').style.touchAction = 'pan-y';
  $('read-stage').classList.remove('snap-rows');
  $('read-col').style.width = '0px';   // a zoomed column's sideways scrollbar must not be measured
  measure();
  layout();
  scrollToPage(keep);
  updatePageInd();
  for (const n of R.slots.keys()) renderSlot(n);   // the page's width changed → re-render crisp
}
function toggleFullscreen() {
  document.body.classList.toggle('read-immersive');
  syncSpreadBtn();
  if (R.doc && wantSpread() !== R.spread) relayout();
}
function toggleSpread() {
  if (!R.doc || !spreadPossible()) return;
  try { localStorage.setItem(SPREAD_KEY, R.spread ? '0' : '1'); } catch {}
  relayout();
}

// Throttled so a fast scroll through the book doesn't hammer IndexedDB; the exact
// page is flushed synchronously on close.
function saveProgress() {
  clearTimeout(R.saveTimer);
  R.saveTimer = setTimeout(() => {
    if (R.id) db.updateBookMeta(R.id, { page: R.page, openedAt: Date.now() });
  }, 400);
}

// Tap the page indicator to jump anywhere in the book.
async function jumpToPage() {
  if (!R.doc) return;
  const ans = await askText(t('read_jump_title'), String(R.page));
  if (ans == null) return;
  const n = parseInt(String(ans).replace(/[^0-9]/g, ''), 10);
  if (n) scrollToPage(clampPage(n));
}

function scrollToPage(n) {
  const stage = $('read-stage');
  // Row snapping off for the move: the pages there do not exist until syncSlots
  // makes them, and the browser would snap back to the nearest ones that do.
  stage.classList.remove('snap-rows');
  stage.scrollTop = pageTop(n);
  syncSlots();
  syncSnap();
}

function setLoading(on) {
  $('read-loading').classList.toggle('hidden', !on);
}

// Closes the open book and frees its memory. Rendered PDF pages and the
// PDFDocument hold real memory, so this runs both from the Back button and from
// showScreen() when the user leaves the Read screen entirely.
// Remembers the book open when the Read tab was last left, so re-entering the tab
// can reopen it at its page instead of dumping the user back on the shelf. Set by
// closeBook(remember=true) (leaving the tab) and cleared by closeBook(false) (the
// reader's own Back button — there the user DID ask for the shelf).
let lastBookId = null;

export function closeBook(remember = false) {
  lastBookId = (remember && R.id) ? R.id : null;
  clearTimeout(R.saveTimer);
  clearTimeout(R.reRenderTimer);
  if (R.scrollRaf) { cancelAnimationFrame(R.scrollRaf); R.scrollRaf = 0; }
  if (R.id) db.updateBookMeta(R.id, { page: R.page });   // flush final position
  for (const n of [...R.slots.keys()]) releaseSlot(n);
  R.slots.clear(); R.pool = [];
  const col = $('read-col'); if (col) { col.innerHTML = ''; col.style.height = '0px'; }
  if (R.doc) { try { R.doc.destroy(); } catch {} R.doc = null; }
  R.id = null; R.templates = null; R.zoom = 1;
  R.training = false; R.hasText = null;
  R.lastSingle = 0;
  const stage = $('read-stage');
  if (stage) { stage.scrollTop = 0; stage.style.touchAction = 'pan-y'; stage.classList.remove('snap-rows'); }
  document.body.classList.remove('reading');
  document.body.classList.remove('read-immersive');   // never leave the chrome hidden
  setSpread(false);
  const reader = $('read-reader'), shelf = $('read-shelf');
  if (reader) reader.classList.add('hidden');
  if (shelf) shelf.classList.remove('hidden');
}

// Called whenever the Read tab is shown. If the user was reading a book when they
// left (e.g. long-pressed a diagram → Setup), reopen it at its page instead of
// dropping them on the shelf; the reader's Back button (closeBook(false)) is how
// they get back to the shelf. The shelf still refreshes underneath either way.
export async function onEnter() {
  await refresh();
  if (lastBookId != null) {
    const id = lastBookId; lastBookId = null;
    await openBook(id);   // opens at the saved page; falls back to the shelf if gone
  }
}

// ── gestures ────────────────────────────────────────────────────────────────
// The stage scrolls natively (one finger, giving free inertia — the "smooth"
// bar). We layer three things on top with pointer events: pinch-zoom (two
// fingers), double-tap zoom, and long-press to read a diagram. Native scrolling
// fires pointercancel when it takes over a finger, which conveniently disarms the
// long-press. #read-stage is in the app's SWIPE_SAFE list, so none of this ever
// reaches the tab-swipe navigation — scrolling can't jump to another tab.
const pointers = new Map();
let longState = null;   // one-finger stationary hold (arms the diagram long-press)
let pinch = null;       // two-finger gesture in progress
let lastTap = 0, lastTapX = 0, lastTapY = 0;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// rAF-throttled: recompute which pages need canvases and update the indicator.
function onScroll() {
  if (R.scrollRaf) return;
  R.scrollRaf = requestAnimationFrame(() => { R.scrollRaf = 0; syncSlots(); });
}

function onDown(e) {
  if (!R.doc) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { cancelLong(); startPinch(); return; }
  if (pointers.size === 1) {
    longState = { x: e.clientX, y: e.clientY, fired: false, timer: 0 };
    // A stationary single finger held past the threshold opens the diagram under
    // it. Any real movement (a scroll) or a second finger disarms it first.
    longState.timer = setTimeout(() => {
      if (longState && pointers.size === 1 && !pinch) {
        const { x, y } = longState;
        // onLongPress opens a modal (calibrate / tap-to-teach) or navigates to
        // Setup while the finger is STILL down, so the eventual pointerup/cancel
        // lands off this stage and onUp never runs. Reset the gesture state right
        // now, before that happens — otherwise the leaked phantom pointer makes
        // the NEXT press look like a two-finger pinch: the long-press won't arm
        // and the reader zooms in and out on its own.
        pointers.clear(); longState = null; pinch = null;
        onLongPress(x, y);
      }
    }, LONGPRESS_MS);
  }
}

function cancelLong() {
  if (longState && longState.timer) { clearTimeout(longState.timer); longState.timer = 0; }
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) { e.preventDefault(); doPinch(); return; }
  if (longState) {
    const moved = Math.hypot(e.clientX - longState.x, e.clientY - longState.y);
    if (moved > LONG_SLOP) cancelLong();   // moving for real → it's a scroll, not a hold
  }
}

function onUp(e) {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) endPinch();
  if (!had) return;
  if (pointers.size === 0) {
    cancelLong();
    // If the long-press already fired, swallow this lift so it isn't also a tap.
    if (longState && !longState.fired) {
      const moved = Math.hypot(e.clientX - longState.x, e.clientY - longState.y);
      if (moved < TAP_SLOP) handleTap(e);
    }
    longState = null;
  }
}

// Native scroll (and other take-overs) cancel the finger: clear state, no tap.
function onCancel(e) {
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) endPinch();
  cancelLong();
  if (pointers.size === 0) longState = null;
}

function handleTap(e) {
  // Training mode: a tap on a cover reveals that move and is used up — it is not
  // also the first (or second) half of a double-tap zoom.
  const cover = coverAtClient(e.clientX, e.clientY);
  if (cover) { cover.remove(); lastTap = 0; return; }
  const now = Date.now();
  if (now - lastTap < DBLTAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
    toggleZoom(e.clientX, e.clientY);
    lastTap = 0;
  } else {
    lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }
}

function toggleZoom(clientX, clientY) {
  setZoomAbout(R.zoom > 1 ? 1 : 2, clientX, clientY);
}

// Set a new zoom while keeping the content point under (clientX, clientY) fixed.
// The column is a native scroller, so we resize it and adjust scrollLeft/Top.
function setZoomAbout(newZoom, clientX, clientY) {
  newZoom = Math.min(MAX_ZOOM, Math.max(1, newZoom));
  const stage = $('read-stage');
  const rect = stage.getBoundingClientRect();
  const vx = clientX - rect.left, vy = clientY - rect.top;      // point within the viewport
  const baseX = (stage.scrollLeft + vx) / R.zoom;               // same point in base units
  const baseY = (stage.scrollTop + vy) / R.zoom;
  R.zoom = newZoom;
  if (newZoom !== 1) stage.classList.remove('snap-rows');       // no row snapping while zoomed
  layout();                                                     // resize the column
  stage.scrollLeft = baseX * newZoom - vx;
  stage.scrollTop  = baseY * newZoom - vy;
  stage.style.touchAction = newZoom > 1 ? 'pan-x pan-y' : 'pan-y';
  syncSlots();
  if (newZoom === 1) syncSnap();
  scheduleReRender();
}

function startPinch() {
  const [a, b] = [...pointers.values()];
  pinch = { d0: dist(a, b) || 1, z0: R.zoom };
}

function doPinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return;
  const [a, b] = pts;
  const z = pinch.z0 * (dist(a, b) / pinch.d0);
  setZoomAbout(z, (a.x + b.x) / 2, (a.y + b.y) / 2);
}

function endPinch() { pinch = null; scheduleReRender(); }

// After a zoom settles, re-render the visible pages at the new on-screen width so
// they are crisp again (during the pinch they were just CSS-scaled bitmaps).
function scheduleReRender() {
  clearTimeout(R.reRenderTimer);
  R.reRenderTimer = setTimeout(() => {
    for (const n of R.slots.keys()) renderSlot(n);
  }, 180);
}

// A mobile browser fires `resize` every time its address bar slides in or out
// during a scroll — a HEIGHT-only change. Re-laying-out and resetting the zoom on
// that made the page zoom and jump on its own while you scrolled. Only a real
// WIDTH change (rotation, window resize) needs the re-layout, so ignore the rest.
let lastInnerW = window.innerWidth;
const onResize = debounce(() => {
  if (!R.doc || $('read-reader').classList.contains('hidden')) return;
  const want = wantSpread();
  if (want === R.spread) {
    if (!R.spread) {
      if (window.innerWidth === lastInnerW) { syncSpreadBtn(); return; }   // height-only (address bar) → leave zoom/scroll alone
    } else {
      // Two-page view: a whole spread is fitted to the HEIGHT too, so a height
      // change counts — but only when it really changes the page's size (on a
      // phone held sideways the pages are fitted to the width, so it does not).
      const g = geometry();
      if (g.colW === R.baseColW && g.pageW === R.basePageW) { lastInnerW = window.innerWidth; return; }
    }
  }
  lastInnerW = window.innerWidth;
  relayout();   // back to zoom 1 at the same page; re-renders crisp
}, 200);

// ── diagram → board (Stage 2) ────────────────────────────────────────────────
// A long-press lands here with the finger's client coordinates. We find the page
// slot under the finger and sample THAT page's canvas — the same pixels the
// reader draws — so the board math maps to whichever page was pressed.
async function onLongPress(clientX, clientY) {
  if (!R.doc) return;
  const slot = slotAtClient(clientX, clientY);
  if (!slot || !slot.rendered) { toast(t('read_diagram_none')); return; }
  const canvas = slot.canvas;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right ||
      clientY < rect.top  || clientY > rect.bottom) { toast(t('read_diagram_none')); return; }
  // client px → canvas device px. getBoundingClientRect already reflects the
  // current zoom and scroll, so the ratio maps correctly at any zoom.
  const px = (clientX - rect.left) * (canvas.width / rect.width);
  const py = (clientY - rect.top)  * (canvas.height / rect.height);

  let img;
  try { img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); }
  catch { toast(t('read_diagram_none')); return; }

  const board = detectBoard(img, px, py);
  if (!board) { toast(t('read_diagram_none')); return; }

  if (!R.templates) { await calibrate(img, board, canvas); return; }

  // Templates in hand: read the position, then show it PRE-FILLED on the
  // correction board next to the diagram image so the user can fix any misread
  // square (colour/type) before it opens in Setup — much faster than opening
  // Setup blind and bouncing back to the reader to compare.
  let res;
  try { res = classifyBoard(img, board, R.templates); }
  catch (e) { console.error('[read] classify failed', e); toast(t('read_diagram_none')); return; }
  // Only pieces the reader is SURE of arrive here (classifyCells); a doubtful
  // square comes empty and marked, and an impossible position comes as an empty
  // board with a line saying so — an empty square is one tap, a wrong piece three.
  await teachPieces(img, board, canvas, { review: true, initialGrid: res.grid, doubt: res.doubt, refused: !!res.refused });
}

// The page slot whose on-screen box contains the client point.
function slotAtClient(clientX, clientY) {
  for (const slot of R.slots.values()) {
    const r = slot.el.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return slot;
  }
  return null;
}

// First diagram in a book teaches its piece style. We show the cropped board and
// ask the one question that captures all 12 pieces at once: is this the start?
async function calibrate(img, board, canvas) {
  const crop = cropBoardCanvas(canvas, board);
  const answer = await askStartPosition(crop);
  if (answer === null) return;                 // cancelled — ask again next time
  if (answer === true) {
    let templates;
    try { templates = buildTemplates(img, board); }
    catch (e) { console.error('[read] calibrate failed', e); toast(t('read_diagram_none')); return; }
    // Trust "Yes" only if the board really reads back as the opening. Building the
    // piece-font assumes the 32 starting pieces sit on their start squares; on an
    // endgame diagram (where the honest answer is "No") that assumption maps piece
    // labels onto empty/other squares, poisoning the templates so every later
    // diagram comes out as a board full of queens. If it doesn't verify as the
    // start, fall back to teaching the pieces by hand instead of saving garbage.
    let looksLikeStart = false;
    try {
      const chk = classifyBoard(img, board, templates);
      looksLikeStart = chk.confident && chk.fen.split(' ')[0] === START_FEN.split(' ')[0];
    } catch (e) { console.error('[read] start-check failed', e); }
    if (!looksLikeStart) {
      toast(t('read_calib_not_start'));
      await teachPieces(img, board, canvas);
      return;
    }
    await db.updateBookMeta(R.id, { templates });
    R.templates = templates;
    // This confirmed board IS the starting position, so its FEN is known exactly.
    openInSetup(START_FEN, true);
  } else {
    // Not the start → teach the pieces from THIS diagram instead. The user taps
    // each occupied square and names the piece; that hand-built layout calibrates
    // the book's style just as a confirmed start would, and doubles as the exact
    // position to open. If they back out, fall through to a blank editor (the old
    // behaviour) so they can still place it by hand.
    await teachPieces(img, board, canvas);
  }
}

// The 12 piece codes, grouped White then black, for the teach palette.
const TEACH_CODES = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
const CODE_TO_IMG = { K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
                      k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP' };

// Tap-to-teach fallback. Shows the detected board (cropped tight) with an 8×8
// tap overlay and a piece palette. Tapping a square with a piece selected places
// it; tapping it again clears it; the eraser (or no selection) clears. "Teach"
// builds this book's templates from whatever was placed and opens the position;
// "Cancel" opens a blank editor so the user is never stuck.
// `opts.review` reuses this same board as a confirm-and-correct step: it starts
// PRE-FILLED with a position the classifier already read (opts.initialGrid), the
// user fixes any wrong squares against the image, and "Open" hands the corrected
// position to Setup and ADDS it to the book's templates (learning, v137) without
// rebuilding them. Without `review` it is the from-scratch tap-to-teach that
// (re)builds the templates.
async function teachPieces(img, board, canvas, opts = {}) {
  const review = !!opts.review;
  const grid = opts.initialGrid ? opts.initialGrid.map(row => row.slice())
                                : Array.from({ length: 8 }, () => Array(8).fill(''));
  const result = await modal((box, close) => {
    box.innerHTML = `<h3>${esc(t(review ? 'read_review_title' : 'read_teach_title'))}</h3>` +
                    `<p class="hint">${esc(t(review ? 'read_review_body' : 'read_teach_body'))}</p>`;

    // Tight crop (no pad) so the overlay's eighths line up with the squares.
    const crop = cropBoardCanvas(canvas, board, 0);
    crop.className = '';
    const boardWrap = document.createElement('div');
    boardWrap.className = 'read-teach-board';
    const overlay = document.createElement('div');
    overlay.className = 'read-teach-grid';
    boardWrap.append(crop, overlay);

    // Review only: say what was left out, so an empty square is not taken for
    // "nothing there".
    const doubtN = opts.doubt ? opts.doubt.flat().filter(Boolean).length : 0;
    let note = null;
    if (opts.refused || doubtN) {
      note = document.createElement('p');
      note.className = 'read-teach-note';
      note.textContent = opts.refused ? t('read_review_refused') : tn('read_review_doubt', doubtN);
    }

    let selected = 'P';   // start on white pawn — the most-tapped piece
    const cells = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.setAttribute('aria-label', `${'abcdefgh'[c]}${8 - r}`);
      cell.onclick = () => {
        if (!selected || grid[r][c] === selected) grid[r][c] = '';   // eraser or toggle-off
        else grid[r][c] = selected;
        cell.classList.remove('doubt');   // the user has now decided this square
        paintCell(r, c);
      };
      if (opts.doubt && opts.doubt[r][c]) cell.classList.add('doubt');
      cells.push(cell);
      overlay.appendChild(cell);
    }
    function paintCell(r, c) {
      const cell = cells[r * 8 + c];
      cell.innerHTML = '';
      const code = grid[r][c];
      if (code) {
        const im = document.createElement('img');
        im.src = `${getPieceSet()}/${CODE_TO_IMG[code]}.svg`; im.alt = '';
        cell.appendChild(im);
      }
    }

    // Show what the classifier already read (review mode) so the user only fixes
    // the wrong squares instead of placing everything.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (grid[r][c]) paintCell(r, c);

    const pal = document.createElement('div');
    pal.className = 'read-teach-pal';
    const palBtns = [];
    const setSel = (code, btn) => {
      selected = code;
      palBtns.forEach(b => b.classList.toggle('on', b === btn));
    };
    for (const code of TEACH_CODES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pal-btn'; b.dataset.piece = code;
      b.innerHTML = `<img src="${getPieceSet()}/${CODE_TO_IMG[code]}.svg" alt="${code}">`;
      b.onclick = () => setSel(code, b);
      palBtns.push(b); pal.appendChild(b);
    }
    // Eraser — clears a square. Deselecting is also erase, but a visible button
    // keeps it monkey-proof.
    const eraser = document.createElement('button');
    eraser.type = 'button'; eraser.className = 'pal-btn';
    eraser.textContent = '🗑'; eraser.setAttribute('aria-label', t('read_teach_erase'));
    eraser.onclick = () => setSel('', eraser);
    palBtns.push(eraser); pal.appendChild(eraser);
    palBtns[TEACH_CODES.indexOf('P')].classList.add('on');   // reflect the default

    box.append(boardWrap);
    if (note) box.append(note);
    box.append(pal);
    // Review only: since v139 one corrected diagram is HELD, not trusted, so the
    // same diagram pressed again reads as before. Say so, or it looks broken.
    if (review) {
      const learn = document.createElement('p');
      learn.className = 'hint read-teach-learn';
      learn.textContent = t('read_review_learn');
      box.append(learn);
    }

    const row = document.createElement('div'); row.className = 'row';
    const done = document.createElement('button');
    done.className = 'btn primary'; done.textContent = t(review ? 'read_review_open' : 'read_teach_done');
    done.onclick = () => {
      // Need one king a side for a legal, useful position and to anchor the
      // templates. Warn without closing so the work so far is not lost.
      const flat = grid.flat();
      if (!flat.includes('K') || !flat.includes('k')) { toast(t('read_teach_need_kings')); return; }
      close(true);
    };
    const cancel = document.createElement('button');
    cancel.className = 'btn'; cancel.textContent = t('cancel');
    cancel.onclick = () => close(false);
    // One tap to wipe a bad read (or start over) instead of erasing square by square.
    const clear = document.createElement('button');
    clear.className = 'btn'; clear.textContent = t('clear_board');
    clear.onclick = () => {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        grid[r][c] = ''; cells[r * 8 + c].classList.remove('doubt'); paintCell(r, c);
      }
      if (note) note.remove();
    };
    row.append(done, clear, cancel);
    box.appendChild(row);
  });

  if (!result) {
    // Review: backing out just returns to the reader (no navigation). Teach:
    // keep the old escape hatch — a blank editor to place by hand.
    if (review) return;
    toast(t('read_diagram_manual'));
    openInSetup(EMPTY_FEN, false);
    return;
  }

  // Review: the user has just confirmed this position against the image, so the
  // book LEARNS from it (learnFromCells adds the squares as samples, refusing
  // what contradicts the book — see its comment) and the next diagram of this
  // style reads more fully. Silent; a failure here must never block the Open.
  // Teach mode (below) builds this book's templates from scratch instead.
  if (review) {
    try {
      const rep = learnFromCells(R.templates, boardCells(img, board), grid);
      if (rep.learned) await db.updateBookMeta(R.id, { templates: R.templates });
    } catch (e) { console.error('[read] learn failed', e); }
    openInSetup(gridToFen(grid), true);
    return;
  }

  let templates;
  try { templates = buildTemplatesFromGrid(img, board, grid); }
  catch (e) { console.error('[read] teach failed', e); toast(t('read_diagram_none')); return; }
  await db.updateBookMeta(R.id, { templates });
  R.templates = templates;
  // The user just told us this exact position, so open it directly — confident.
  openInSetup(gridToFen(grid), true);
}

// Modal: the board image + "Is this the starting position?" Yes / No / Cancel.
// Resolves true / false / null.
function askStartPosition(cropCanvas) {
  return modal((box, close) => {
    box.innerHTML = `<h3>${esc(t('read_calib_title'))}</h3>` +
                    `<p class="hint">${esc(t('read_calib_body'))}</p>`;
    const wrap = document.createElement('div');
    wrap.className = 'read-calib-img';
    cropCanvas.className = '';
    wrap.appendChild(cropCanvas);
    box.appendChild(wrap);
    const row = document.createElement('div'); row.className = 'row';
    const yes = document.createElement('button');
    yes.className = 'btn primary'; yes.textContent = t('read_calib_yes');
    yes.onclick = () => close(true);
    const no = document.createElement('button');
    no.className = 'btn'; no.textContent = t('read_calib_no');
    no.onclick = () => close(false);
    row.append(yes, no);
    box.appendChild(row);
  });
}

// Every read — confident or not — lands in the editable Setup screen, never
// straight onto an Analysis board. A wrong square is one tap to fix there, and
// the user always eyeballs the position before playing from it. Leaving the Read
// screen for Setup runs showScreen()'s leave hook, which closes the book for us.
function openInSetup(fen, confident) {
  if (!confident) toast(t('read_diagram_check'));
  Setup.open(fen);
}

// ── init ────────────────────────────────────────────────────────────────────
export function init() {
  $('read-add').onclick = importBook;
  $('read-back').onclick = () => { closeBook(); refresh(); };
  $('read-page-ind').onclick = jumpToPage;
  // Immersive reading: hide the app header + tab bar so the page fills the screen.
  // The reader's own bar stays, so this same button (and Back) always gets you out.
  $('read-fullscreen').onclick = toggleFullscreen;
  $('read-spread').onclick = toggleSpread;
  $('read-training').onclick = toggleTraining;

  const stage = $('read-stage');
  stage.addEventListener('scroll', onScroll, { passive: true });
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove, { passive: false });
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);
  stage.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', onResize);
}
