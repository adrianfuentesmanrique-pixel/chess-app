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
// in vendor/ exactly like chess.js and the Stockfish wasm. It is imported
// lazily the first time a book is opened or added, so a launch by someone who
// never opens Read pays none of its ~500 KB parse cost. Shipped without the
// cmaps/ and standard_fonts/ folders — chess books are Latin text with
// figurine fonts; add them only if a real book renders wrong.
import * as db from './db.js';
import { t, tn } from './i18n.js';
import { $, esc, toast, modal, askConfirm, askText, sheet, Setup } from './app.js';
import { START_FEN } from './tree.js';
import { detectBoard, buildTemplates, classifyBoard, cropBoardCanvas } from './diagram.js';

const MAX_ZOOM = 4;
const SWIPE_TURN = 60;      // px of horizontal travel that counts as a page turn
const TAP_SLOP = 10;        // px a "tap" may move before it stops being a tap
const DBLTAP_MS = 300;
const LONGPRESS_MS = 500;   // stationary hold that opens a diagram (Stage 2)
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

// ── PDF.js, loaded on demand ────────────────────────────────────────────────
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('../vendor/pdf.min.mjs');
  // The worker is a separate ~1.3 MB file; resolve it next to this module so it
  // works whatever path the app is served from. It is NOT precached by the
  // service worker (same reasoning as the Stockfish wasm) — vendor/ is
  // cache-first, so it is stored on first use and then available offline.
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
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
    const doc = await pdfjs.getDocument({ data: buf }).promise;
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
const R = {
  id: null, doc: null, page: 1, pageCount: 1,
  renderTask: null, renderToken: 0,
  baseW: 0, baseH: 0,     // canvas CSS size at zoom 1 (fit to stage width)
  zoom: 1, tx: 0, ty: 0,
  saveTimer: null,
  templates: null,        // per-book piece templates, calibrated on first use
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
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    R.id = id; R.doc = doc; R.pageCount = doc.numPages;
    R.templates = book.templates || null;   // Stage 2: piece templates ride on the book record
    R.page = Math.min(Math.max(1, book.page || 1), R.pageCount);
    await renderPage(R.page);
  } catch (err) {
    console.error('[read] open failed', err);
    toast(t('read_open_failed'));
    closeBook();
  } finally {
    setLoading(false);
  }
}

async function renderPage(n) {
  if (!R.doc) return;
  n = Math.min(Math.max(1, n), R.pageCount);
  R.page = n;

  // Rapid page turns must not paint an earlier page over a later one: a token
  // marks the newest request, and any awaited step from a stale one bails out.
  const token = ++R.renderToken;
  if (R.renderTask) { try { R.renderTask.cancel(); } catch {} R.renderTask = null; }

  const page = await R.doc.getPage(n);
  if (token !== R.renderToken) return;

  const stage = $('read-stage');
  const stageW = stage.clientWidth || 320;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const OVERSAMPLE = 1.5;    // headroom so pinch-zoom stays crisp without re-render
  const vp0 = page.getViewport({ scale: 1 });
  const renderScale = (stageW / vp0.width) * dpr * OVERSAMPLE;
  const vp = page.getViewport({ scale: renderScale });

  const canvas = $('read-canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  // At zoom 1 the page fits the stage width exactly; height follows the ratio.
  R.baseW = stageW;
  R.baseH = stageW * (vp0.height / vp0.width);
  canvas.style.width = R.baseW + 'px';
  canvas.style.height = R.baseH + 'px';

  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  R.renderTask = task;
  try {
    await task.promise;
  } catch (e) {
    if (e && e.name !== 'RenderingCancelledException') console.warn('[read] render', e);
    return;
  }
  if (token !== R.renderToken) return;
  R.renderTask = null;

  R.zoom = 1; R.tx = 0; R.ty = 0;
  clampAndApply();
  updatePageInd();
  saveProgress();
}

function clampAndApply() {
  const stage = $('read-stage');
  const canvas = $('read-canvas');
  if (!stage || !canvas) return;
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const cw = R.baseW * R.zoom, ch = R.baseH * R.zoom;
  R.tx = cw <= sw ? (sw - cw) / 2 : Math.min(0, Math.max(sw - cw, R.tx));
  R.ty = ch <= sh ? (sh - ch) / 2 : Math.min(0, Math.max(sh - ch, R.ty));
  canvas.style.transformOrigin = '0 0';
  canvas.style.transform = `translate(${R.tx}px, ${R.ty}px) scale(${R.zoom})`;
}

function updatePageInd() {
  $('read-page-ind').textContent = R.page + ' / ' + R.pageCount;
}

// Throttled so a fast walk through the book doesn't hammer IndexedDB; the exact
// page is flushed synchronously on close.
function saveProgress() {
  clearTimeout(R.saveTimer);
  R.saveTimer = setTimeout(() => {
    if (R.id) db.updateBookMeta(R.id, { page: R.page, openedAt: Date.now() });
  }, 400);
}

function nextPage() { if (R.page < R.pageCount) renderPage(R.page + 1); }
function prevPage() { if (R.page > 1) renderPage(R.page - 1); }

function setLoading(on) {
  $('read-loading').classList.toggle('hidden', !on);
}

// Closes the open book and frees its memory. A rendered PDF page and the
// PDFDocument hold real memory, so this runs both from the Back button and from
// showScreen() when the user leaves the Read screen entirely.
export function closeBook() {
  clearTimeout(R.saveTimer);
  if (R.id) db.updateBookMeta(R.id, { page: R.page });   // flush final position
  if (R.renderTask) { try { R.renderTask.cancel(); } catch {} R.renderTask = null; }
  if (R.doc) { try { R.doc.destroy(); } catch {} R.doc = null; }
  R.id = null; R.templates = null;
  const canvas = $('read-canvas');
  if (canvas) { canvas.width = 0; canvas.height = 0; canvas.style.transform = ''; }
  document.body.classList.remove('reading');
  const reader = $('read-reader'), shelf = $('read-shelf');
  if (reader) reader.classList.add('hidden');
  if (shelf) shelf.classList.remove('hidden');
}

// ── gestures ────────────────────────────────────────────────────────────────
// The stage owns every touch (CSS touch-action:none): one finger turns pages or
// pans a zoomed/tall page, two fingers pinch-zoom, a double-tap toggles zoom.
// #read-stage is in the app's SWIPE_SAFE list, so none of this ever reaches the
// tab-swipe navigation — turning a page can't jump to another tab.
const pointers = new Map();
let gesture = null;     // single-finger gesture in progress
let pinch = null;       // two-finger gesture in progress
let lastTap = 0, lastTapX = 0, lastTapY = 0;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function onDown(e) {
  if (!R.doc) return;
  try { $('read-stage').setPointerCapture(e.pointerId); } catch {}
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    startPinch();
  } else if (pointers.size === 1) {
    gesture = { mode: 'undecided', startX: e.clientX, startY: e.clientY,
                lastX: e.clientX, lastY: e.clientY, t: Date.now(), longFired: false };
    // A stationary single finger held past the threshold opens the diagram under
    // it. It is armed only while the gesture is still 'undecided' and one finger
    // is down; the first sign of a swipe, pan or a second finger disarms it, so
    // page turn / pinch / double-tap are all untouched.
    gesture.longTimer = setTimeout(() => {
      if (gesture && gesture.mode === 'undecided' && pointers.size === 1) {
        gesture.longFired = true;
        onLongPress(gesture.lastX, gesture.lastY);
      }
    }, LONGPRESS_MS);
  }
}

function cancelLong() {
  if (gesture && gesture.longTimer) { clearTimeout(gesture.longTimer); gesture.longTimer = null; }
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) { doPinch(); return; }
  if (!gesture) return;

  const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
  gesture.lastX = e.clientX; gesture.lastY = e.clientY;
  const totX = e.clientX - gesture.startX, totY = e.clientY - gesture.startY;

  if (gesture.mode === 'undecided') {
    if (Math.abs(totX) < 8 && Math.abs(totY) < 8) return;
    cancelLong();                                        // moved → not a long-press
    if (R.zoom > 1) gesture.mode = 'pan';               // zoomed: drag pans
    else if (Math.abs(totX) > Math.abs(totY)) gesture.mode = 'swipe';  // page turn
    else gesture.mode = 'pan';                           // vertical scroll of a tall page
  }
  if (gesture.mode === 'pan') { R.tx += dx; R.ty += dy; clampAndApply(); }
}

function onUp(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;

  if (pointers.size === 0) {
    if (gesture) {
      cancelLong();
      // The long-press already fired and opened the diagram — swallow the lift so
      // it is not also read as a tap or a page turn.
      if (gesture.longFired) { gesture = null; return; }
      const moved = Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY);
      if (gesture.mode === 'swipe') {
        const tot = e.clientX - gesture.startX;
        if (Math.abs(tot) > SWIPE_TURN && Date.now() - gesture.t < 800) {
          if (tot < 0) nextPage(); else prevPage();
        }
      }
      if (moved < TAP_SLOP) handleTap(e);
    }
    gesture = null;
  } else if (pointers.size === 1) {
    // A finger lifted after a pinch — keep reading the remaining one as a pan.
    const [only] = pointers.values();
    gesture = { mode: 'pan', startX: only.x, startY: only.y,
                lastX: only.x, lastY: only.y, t: Date.now() };
  }
}

function handleTap(e) {
  const now = Date.now();
  if (now - lastTap < DBLTAP_MS && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
    toggleZoom(e.clientX, e.clientY);
    lastTap = 0;
  } else {
    lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
  }
}

function toggleZoom(clientX, clientY) {
  const r = $('read-stage').getBoundingClientRect();
  zoomTo(R.zoom > 1 ? 1 : 2, clientX - r.left, clientY - r.top);
}

function zoomTo(newZoom, px, py) {
  newZoom = Math.min(MAX_ZOOM, Math.max(1, newZoom));
  const cx = (px - R.tx) / R.zoom, cy = (py - R.ty) / R.zoom;
  R.zoom = newZoom;
  R.tx = px - cx * newZoom; R.ty = py - cy * newZoom;
  clampAndApply();
}

function startPinch() {
  cancelLong();
  const [a, b] = [...pointers.values()];
  pinch = { d0: dist(a, b) || 1, z0: R.zoom,
            mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2, tx0: R.tx, ty0: R.ty };
  gesture = null;
}

function doPinch() {
  if (!pinch) return;
  const [a, b] = [...pointers.values()];
  const r = $('read-stage').getBoundingClientRect();
  const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
  const mx0 = pinch.mx0 - r.left, my0 = pinch.my0 - r.top;
  const z = Math.min(MAX_ZOOM, Math.max(1, pinch.z0 * (dist(a, b) / pinch.d0)));
  // The content point under the initial midpoint stays under the fingers.
  const cx = (mx0 - pinch.tx0) / pinch.z0, cy = (my0 - pinch.ty0) / pinch.z0;
  R.zoom = z; R.tx = mx - cx * z; R.ty = my - cy * z;
  clampAndApply();
}

const onResize = debounce(() => {
  if (R.doc && !$('read-reader').classList.contains('hidden')) renderPage(R.page);
}, 200);

// ── diagram → board (Stage 2) ────────────────────────────────────────────────
// A long-press lands here with the finger's client coordinates. The rendered
// page canvas is exactly what we sample — the same pixels the reader draws.
async function onLongPress(clientX, clientY) {
  if (!R.doc) return;
  const canvas = $('read-canvas');
  const rect = $('read-stage').getBoundingClientRect();
  // stage px → canvas CSS px (undo the pan/zoom transform) → canvas device px
  // (the canvas is oversampled, so canvas.width is larger than its CSS width).
  const cssX = (clientX - rect.left - R.tx) / R.zoom;
  const cssY = (clientY - rect.top - R.ty) / R.zoom;
  if (cssX < 0 || cssY < 0 || cssX > R.baseW || cssY > R.baseH) return;  // off the page
  const px = cssX * (canvas.width / R.baseW);
  const py = cssY * (canvas.height / R.baseH);

  let img;
  try { img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); }
  catch { toast(t('read_diagram_none')); return; }

  const board = detectBoard(img, px, py);
  if (!board) { toast(t('read_diagram_none')); return; }

  if (!R.templates) { await calibrate(img, board, canvas); return; }

  // Templates in hand: read the position and hand it to Setup for review.
  let res;
  try { res = classifyBoard(img, board, R.templates); }
  catch (e) { console.error('[read] classify failed', e); toast(t('read_diagram_none')); return; }
  openInSetup(res.fen, res.confident);
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
    await db.updateBookMeta(R.id, { templates });
    R.templates = templates;
    // This confirmed board IS the starting position, so its FEN is known exactly.
    openInSetup(START_FEN, true);
  } else {
    // Not the start → nothing to learn from here. Open an empty editor so the
    // user can place the position by hand; the next diagram re-offers calibration.
    toast(t('read_diagram_manual'));
    openInSetup(EMPTY_FEN, false);
  }
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
  $('read-prev').onclick = prevPage;
  $('read-next').onclick = nextPage;

  const stage = $('read-stage');
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', onResize);
}
