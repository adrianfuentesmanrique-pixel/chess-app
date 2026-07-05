// Chess Training Center — main application.
import { Chess, validateFen } from '../vendor/chess.js';
import { t, getLang, setLang, applyStatic } from './i18n.js';
import { GameTree, parsePgn, splitPgn, START_FEN, nagText } from './tree.js';
import { Board, parsePlacement, setPieceSet, getPieceSet } from './board.js';
import { Engine, uciToMove, pvWithNumbers } from './engine.js';
import * as db from './db.js';
import { PUZZLES } from './puzzles-data.js';

const $ = id => document.getElementById(id);
const engine = new Engine();

// ═════════════════════ small UI helpers ═════════════════════

let toastTimer = null;
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function modal(contentBuilder) {
  return new Promise(resolve => {
    const root = $('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal-box';
    back.appendChild(box);
    const close = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    contentBuilder(box, close);
    root.appendChild(back);
  });
}

function askText(title, initial = '') {
  return modal((box, close) => {
    box.innerHTML = `<h3>${title}</h3>`;
    const inp = document.createElement('input');
    inp.className = 'input'; inp.value = initial;
    const row = document.createElement('div'); row.className = 'row';
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('ok');
    const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('cancel');
    ok.onclick = () => close(inp.value.trim() || null);
    ca.onclick = () => close(null);
    inp.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
    row.append(ok, ca);
    box.append(inp, row);
    setTimeout(() => inp.focus(), 50);
  });
}

function askConfirm(msg) {
  return modal((box, close) => {
    box.innerHTML = `<p>${msg}</p>`;
    const row = document.createElement('div'); row.className = 'row';
    const ok = document.createElement('button'); ok.className = 'btn danger'; ok.textContent = t('yes');
    const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('no');
    ok.onclick = () => close(true); ca.onclick = () => close(false);
    row.append(ok, ca);
    box.append(row);
  });
}

// Bottom-sheet menu; items = [{label, action, danger}]
function sheet(items) {
  return modal((box, close) => {
    box.classList.add('sheet');
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'sheet-btn' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.onclick = () => { close(null); it.action(); };
      box.appendChild(b);
    }
    const ca = document.createElement('button');
    ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
    ca.onclick = () => close(null);
    box.appendChild(ca);
  });
}

async function chooseBase(allowCreate = true) {
  let bases = await db.listBases();
  if (!bases.length) {
    const id = await db.createBase(t('my_games'));
    bases = [{ id, name: t('my_games'), count: 0 }];
  }
  return modal((box, close) => {
    box.innerHTML = `<h3>${t('choose_base')}</h3>`;
    for (const b of bases) {
      const btn = document.createElement('button');
      btn.className = 'sheet-btn';
      btn.textContent = `${b.name} (${b.count ?? 0} ${t('games')})`;
      btn.onclick = () => close(b.id);
      box.appendChild(btn);
    }
    if (allowCreate) {
      const nb = document.createElement('button');
      nb.className = 'sheet-btn';
      nb.textContent = '＋ ' + t('new_base');
      nb.onclick = async () => {
        const name = await askText(t('base_name'));
        if (name) { const id = await db.createBase(name); close(id); } else close(null);
      };
      box.appendChild(nb);
    }
    const ca = document.createElement('button');
    ca.className = 'sheet-btn cancel'; ca.textContent = t('cancel');
    ca.onclick = () => close(null);
    box.appendChild(ca);
  });
}

async function sharePgnText(filename, text) {
  const file = new File([text], filename, { type: 'application/x-chess-pgn' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  // fallback: download
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(t('saved'));
}

function headersFromPgn(pgnText) {
  const h = {};
  const re = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m;
  while ((m = re.exec(pgnText)) !== null) h[m[1]] = m[2];
  return h;
}

// ═════════════════════ tabs ═════════════════════

const SCREENS = ['analysis', 'base', 'play', 'trainer', 'puzzles', 'setup'];
let activeScreen = 'analysis';

function showScreen(name) {
  activeScreen = name;
  for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.screen === name));
  if (name !== 'analysis') Analysis.pauseEngine();
  if (name === 'base') Base.refresh();
  if (name === 'trainer') Trainer.refreshBases();
  if (name === 'puzzles') Puzzles.ensureLoaded();
}

document.querySelectorAll('#tabbar button').forEach(b =>
  b.addEventListener('click', () => showScreen(b.dataset.screen)));

// segment control helper
function segInit(el, onChange) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    if (onChange) onChange(b.dataset.v);
  });
}
function segValue(el) { return el.querySelector('button.on')?.dataset.v; }

// engine levels
const LEVELS = [
  { elo: 1320, movetime: 300 }, { elo: 1450, movetime: 400 },
  { elo: 1600, movetime: 500 }, { elo: 1800, movetime: 600 },
  { elo: 2000, movetime: 800 }, { elo: 2200, movetime: 1000 },
  { elo: 2500, movetime: 1500 }, { elo: null, movetime: 2000 },
];
function buildLevelSeg(el, def = 2) {
  el.innerHTML = '';
  const names = t('level_names');
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.dataset.v = i;
    b.textContent = (i + 1) + '·' + names[i];
    if (i === def) b.classList.add('on');
    el.appendChild(b);
  });
}

// ═════════════════════ ANALYSIS ═════════════════════

const Analysis = {
  tree: new GameTree(),
  board: null,
  engineOn: false,
  ctx: { baseId: null, gameId: null },   // where this game lives, if saved
  restartTimer: null,

  init() {
    this.board = new Board($('ana-board'), {
      onMove: (mv) => { if (this.tree.play(mv)) this.refresh(); },
      onShapesChange: (shapes) => { this.tree.current.shapes = shapes; },
    });
    $('ana-first').onclick = () => { this.tree.toStart(); this.refresh(); };
    $('ana-prev').onclick = () => { this.tree.prev(); this.refresh(); };
    $('ana-next').onclick = () => { this.tree.next(); this.refresh(); };
    $('ana-last').onclick = () => { this.tree.toEnd(); this.refresh(); };
    $('ana-flip').onclick = () => this.board.flip();
    $('ana-engine-toggle').onclick = () => this.toggleEngine();
    $('ana-comment').onclick = () => this.editComment();
    $('ana-more').onclick = () => this.moreMenu();
    $('ana-annotate-toggle').onclick = () => $('ana-annotate').classList.toggle('hidden');
    $('ana-annotate-clear').onclick = () => this.board.clearShapes();
    $('ana-annotate').querySelectorAll('.annotate-btn[data-color]').forEach(b => {
      b.onclick = () => {
        const active = b.classList.contains('active');
        $('ana-annotate').querySelectorAll('.annotate-btn[data-color]').forEach(x => x.classList.remove('active'));
        if (active) { this.board.setDrawColor(null); }
        else { b.classList.add('active'); this.board.setDrawColor(b.dataset.color); }
      };
    });
    $('ana-comment-save').onclick = () => {
      this.tree.current.comment = $('ana-comment-text').value.trim();
      $('ana-comment-box').classList.add('hidden');
      this.renderMoves();
    };
    $('ana-comment-cancel').onclick = () => $('ana-comment-box').classList.add('hidden');
    $('ana-moves').addEventListener('click', e => {
      const span = e.target.closest('[data-node]');
      if (!span) return;
      const node = this.tree.findById(+span.dataset.node);
      if (node) { this.tree.goto(node); this.refresh(); }
    });
    this.refresh();
  },

  loadTree(tree, ctx = { baseId: null, gameId: null }) {
    this.tree = tree;
    this.ctx = ctx;
    this.tree.toStart();
    this.tree.toEnd();
    this.refresh();
    showScreen('analysis');
  },

  refresh() {
    const cur = this.tree.current;
    const last = cur.san ? { from: cur.from, to: cur.to } : null;
    this.board.setPosition(this.tree.fen(), last);
    this.board.setShapes(cur.shapes);
    this.renderMoves();
    if (this.engineOn) this.restartEngine();
  },

  renderMoves() {
    const el = $('ana-moves');
    el.innerHTML = '';
    if (this.tree.root.comment) {
      const c = document.createElement('span');
      c.className = 'mv-comment'; c.textContent = this.tree.root.comment + ' ';
      el.appendChild(c);
    }
    this.renderLine(el, this.tree.root, true, 0);
    const curEl = el.querySelector('.mv.current');
    if (curEl) curEl.scrollIntoView({ block: 'nearest' });
  },

  renderLine(container, fromNode, forceNum, depth) {
    let node = fromNode.children[0];
    let parent = fromNode;
    let needNum = forceNum;
    while (node) {
      const { num, whiteMoves } = this.tree.moveNumberFor(node);
      const span = document.createElement('span');
      span.className = 'mv' + (node === this.tree.current ? ' current' : '');
      span.dataset.node = node.id;
      let label = '';
      if (whiteMoves) label = num + '.';
      else if (needNum) label = num + '…';
      needNum = false;
      label += node.san + node.nags.map(nagText).join('');
      span.textContent = label + ' ';
      container.appendChild(span);
      if (node.comment) {
        const c = document.createElement('span');
        c.className = 'mv-comment';
        c.dataset.node = node.id;
        c.textContent = node.comment + ' ';
        container.appendChild(c);
        needNum = true;
      }
      for (let i = 1; i < parent.children.length; i++) {
        const varEl = document.createElement('span');
        varEl.className = 'variation d' + Math.min(depth + 1, 3);
        varEl.appendChild(document.createTextNode('( '));
        this.renderLine(varEl, { children: [parent.children[i]] }, true, depth + 1);
        varEl.appendChild(document.createTextNode(') '));
        container.appendChild(varEl);
        needNum = true;
      }
      parent = node;
      node = node.children[0];
    }
  },

  // --- engine ---
  async toggleEngine() {
    this.engineOn = !this.engineOn;
    $('ana-engine').classList.toggle('hidden', !this.engineOn);
    $('ana-engine-toggle').classList.toggle('on', this.engineOn);
    if (this.engineOn) {
      $('ana-engine-lines').innerHTML = `<div class="engine-line">${t('loading')}</div>`;
      engine.onLine = lines => this.showLines(lines);
      this.restartEngine();
    } else {
      engine.stop();
    }
  },

  restartEngine() {
    clearTimeout(this.restartTimer);
    const fen = this.tree.fen();
    this.restartTimer = setTimeout(async () => {
      const n = +(await db.kvGet('engineLines', 2));
      engine.onLine = lines => this.showLines(lines);
      engine.analyse(fen, n).catch(err => {
        $('ana-engine-lines').innerHTML = `<div class="engine-line">⚠️ ${err.message || err}</div>`;
      });
    }, 200);
  },

  pauseEngine() { if (this.engineOn) engine.stop(); },

  showLines(lines) {
    if (!this.engineOn || activeScreen !== 'analysis') return;
    const el = $('ana-engine-lines');
    el.innerHTML = '';
    for (const ln of lines) {
      const div = document.createElement('div');
      div.className = 'engine-line';
      div.innerHTML = `<b class="${ln.scoreNum >= 0 ? 'good' : 'bad'}">${ln.scoreText}</b> <span class="depth">d${ln.depth}</span> ${pvWithNumbers(this.tree.fen(), ln.pvSan)}`;
      div.onclick = () => { if (ln.firstUci && this.tree.play(uciToMove(ln.firstUci))) this.refresh(); };
      el.appendChild(div);
    }
  },

  editComment() {
    const box = $('ana-comment-box');
    box.classList.remove('hidden');
    $('ana-comment-text').value = this.tree.current.comment || '';
    $('ana-comment-text').focus();
  },

  async moreMenu() {
    const items = [
      { label: '📝 ' + t('game_details'), action: () => this.editDetails() },
      { label: '💾 ' + t('save_to_base'), action: () => this.saveToBase() },
      { label: '📤 ' + t('share_game'), action: () => sharePgnText(gameFilename(this.tree.headers), this.tree.toPgn()) },
      { label: '📋 ' + t('copy_pgn'), action: () => { copyText(this.tree.toPgn()); } },
      { label: '📋 ' + t('copy_fen'), action: () => { copyText(this.tree.fen()); } },
      { label: '🆕 ' + t('new_game'), action: () => this.loadTree(new GameTree()) },
      { label: '🧩 ' + t('setup_position'), action: () => Setup.open(this.tree.fen()) },
      { label: '🤖 ' + t('play_from_here'), action: () => Play.startFromFen(this.tree.fen()) },
    ];
    if (this.tree.current.san) {
      items.push({ label: '⬆️ ' + t('promote_var'), action: () => { this.tree.promote(this.tree.current); this.renderMoves(); } });
      items.push({ label: '🗑 ' + t('delete_move'), action: () => { this.tree.deleteNode(this.tree.current); this.refresh(); }, danger: true });
    }
    sheet(items);
  },

  editDetails() {
    const H = this.tree.headers;
    modal((box, close) => {
      box.innerHTML = `<h3>${t('game_details')}</h3>`;
      const fields = [
        ['White', t('white')], ['Black', t('black')],
        ['Event', t('event')], ['Date', t('date')],
      ];
      const inputs = {};
      for (const [k, label] of fields) {
        const l = document.createElement('label'); l.textContent = label; l.className = 'fld-label';
        const i = document.createElement('input'); i.className = 'input';
        i.value = H[k] && H[k] !== '?' ? H[k] : '';
        if (k === 'Date') i.placeholder = '2026.07.05';
        inputs[k] = i;
        box.append(l, i);
      }
      const l = document.createElement('label'); l.textContent = t('result'); l.className = 'fld-label';
      const sel = document.createElement('select'); sel.className = 'input';
      for (const r of ['*', '1-0', '0-1', '1/2-1/2']) {
        const o = document.createElement('option'); o.value = r; o.textContent = r;
        if ((H['Result'] ?? '*') === r) o.selected = true;
        sel.appendChild(o);
      }
      box.append(l, sel);
      const row = document.createElement('div'); row.className = 'row';
      const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('ok');
      ok.onclick = () => {
        for (const [k] of fields) this.tree.setHeader(k, inputs[k].value.trim());
        this.tree.setHeader('Result', sel.value);
        close(null);
      };
      const ca = document.createElement('button'); ca.className = 'btn'; ca.textContent = t('cancel');
      ca.onclick = () => close(null);
      row.append(ok, ca);
      box.appendChild(row);
    });
  },

  async saveToBase() {
    let { baseId, gameId } = this.ctx;
    if (!baseId) {
      baseId = await chooseBase();
      if (!baseId) return;
    }
    const H = this.tree.headers;
    const rec = {
      baseId,
      white: H['White'] ?? '?', black: H['Black'] ?? '?',
      event: H['Event'] ?? '', date: H['Date'] ?? '',
      result: H['Result'] ?? '*',
      pgn: this.tree.toPgn(),
      updatedAt: Date.now(),
    };
    if (gameId) { rec.id = gameId; await db.updateGame(rec); }
    else { const id = await db.addGame(rec); this.ctx = { baseId, gameId: id }; }
    toast(t('saved'));
  },
};

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast(t('copied'))).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast(t('copied'));
  });
}

function gameFilename(H) {
  const w = (H['White'] ?? 'blancas').replace(/[^\w-]+/g, '_');
  const b = (H['Black'] ?? 'negras').replace(/[^\w-]+/g, '_');
  return `${w}_vs_${b}.pgn`;
}

// ═════════════════════ DATABASE ═════════════════════

const Base = {
  currentBaseId: null,
  gamesCache: [],

  init() {
    $('base-new').onclick = async () => {
      const name = await askText(t('base_name'));
      if (name) { await db.createBase(name); this.refresh(); }
    };
    $('base-back').onclick = () => this.showList();
    $('base-import').onclick = () => $('pgn-file').click();
    $('pgn-file').addEventListener('change', e => this.importFile(e.target.files[0]));
    $('base-newgame').onclick = () => {
      const tree = new GameTree();
      Analysis.loadTree(tree, { baseId: this.currentBaseId, gameId: null });
    };
    $('base-share').onclick = () => this.shareBase();
    $('base-rename').onclick = async () => {
      const base = await db.getBase(this.currentBaseId);
      const name = await askText(t('base_name'), base.name);
      if (name) { await db.renameBase(this.currentBaseId, name); this.openBase(this.currentBaseId); }
    };
    $('base-delete').onclick = async () => {
      if (await askConfirm(t('delete_base_confirm'))) {
        await db.deleteBase(this.currentBaseId);
        this.showList();
      }
    };
    $('game-search').addEventListener('input', () => this.renderGames());
  },

  async refresh() {
    if (this.currentBaseId) return;
    this.showList();
  },

  async showList() {
    this.currentBaseId = null;
    $('base-list-view').classList.remove('hidden');
    $('base-games-view').classList.add('hidden');
    const bases = await db.listBases();
    const el = $('base-list');
    el.innerHTML = '';
    for (const b of bases) {
      const item = document.createElement('button');
      item.className = 'list-item';
      item.innerHTML = `<b>📚 ${esc(b.name)}</b><span class="sub">${b.count} ${t('games')}</span>`;
      item.onclick = () => this.openBase(b.id);
      el.appendChild(item);
    }
  },

  async openBase(id) {
    this.currentBaseId = id;
    const base = await db.getBase(id);
    if (!base) { this.showList(); return; }
    $('base-list-view').classList.add('hidden');
    $('base-games-view').classList.remove('hidden');
    $('base-games-title').textContent = base.name;
    this.gamesCache = await db.listGames(id);
    this.gamesCache.sort((a, b) => b.updatedAt - a.updatedAt);
    $('game-search').value = '';
    this.renderGames();
  },

  renderGames() {
    const q = $('game-search').value.toLowerCase();
    const el = $('game-list');
    el.innerHTML = '';
    const games = this.gamesCache.filter(g =>
      !q || `${g.white} ${g.black} ${g.event}`.toLowerCase().includes(q));
    if (!games.length) {
      el.innerHTML = `<p class="hint">${t('no_games')}</p>`;
      return;
    }
    for (const g of games) {
      const item = document.createElement('button');
      item.className = 'list-item';
      const sub = [g.event, g.date].filter(x => x && x !== '?').join(' · ');
      item.innerHTML = `<b>${esc(g.white)} – ${esc(g.black)}  <span class="result">${esc(g.result ?? '*')}</span></b><span class="sub">${esc(sub)}</span>`;
      item.onclick = () => this.openGame(g);
      item.oncontextmenu = (e) => { e.preventDefault(); this.gameMenu(g); };
      // long-press for mobile
      let timer = null;
      item.addEventListener('pointerdown', () => { timer = setTimeout(() => { timer = null; this.gameMenu(g); }, 550); });
      item.addEventListener('pointerup', () => clearTimeout(timer));
      item.addEventListener('pointermove', () => clearTimeout(timer));
      el.appendChild(item);
    }
  },

  gameMenu(g) {
    sheet([
      { label: '📤 ' + t('share_game'), action: () => sharePgnText(gameFilename({ White: g.white, Black: g.black }), g.pgn) },
      { label: '🗑 ' + t('delete'), action: async () => {
          if (await askConfirm(t('delete_game_confirm'))) { await db.deleteGame(g.id); this.openBase(this.currentBaseId); }
        }, danger: true },
    ]);
  },

  openGame(g) {
    try {
      const tree = parsePgn(g.pgn);
      Analysis.loadTree(tree, { baseId: g.baseId, gameId: g.id });
    } catch (e) {
      toast(t('import_failed'));
    }
  },

  async importFile(file) {
    if (!file) return;
    $('pgn-file').value = '';
    if (/\.cbh$/i.test(file.name)) { await modal((box, close) => { box.innerHTML = `<p>${t('cbh_note')}</p>`; const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = t('ok'); b.onclick = () => close(null); box.appendChild(b); }); return; }
    try {
      const text = await file.text();
      const chunks = splitPgn(text);
      const games = [];
      for (const ch of chunks) {
        const H = headersFromPgn(ch);
        if (!H['White'] && !/\d+\./.test(ch)) continue;
        games.push({
          baseId: this.currentBaseId,
          white: H['White'] ?? '?', black: H['Black'] ?? '?',
          event: H['Event'] ?? '', date: H['Date'] ?? '',
          result: H['Result'] ?? '*',
          pgn: ch.trim(),
          updatedAt: Date.now(),
        });
      }
      if (!games.length) { toast(t('import_failed')); return; }
      await db.addGames(games);
      toast(`${games.length} ${t('imported')}`);
      this.openBase(this.currentBaseId);
    } catch (e) {
      toast(t('import_failed'));
    }
  },

  async shareBase() {
    const base = await db.getBase(this.currentBaseId);
    const games = await db.listGames(this.currentBaseId);
    const all = games.map(g => g.pgn.trim()).join('\n\n') + '\n';
    sharePgnText(`${base.name.replace(/[^\w-]+/g, '_')}.pgn`, all);
  },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ═════════════════════ PLAY vs ENGINE ═════════════════════

const Play = {
  board: null,
  chess: null,
  playerColor: 'w',
  level: 2,
  startFen: START_FEN,
  over: false,
  thinking: false,

  init() {
    buildLevelSeg($('play-level'));
    segInit($('play-color'));
    segInit($('play-level'));
    this.board = new Board($('play-board'), { onMove: mv => this.userMove(mv) });
    $('play-start').onclick = () => {
      this.level = +segValue($('play-level'));
      let c = segValue($('play-color'));
      if (c === 'r') c = Math.random() < 0.5 ? 'w' : 'b';
      this.begin(c, START_FEN);
    };
    $('play-resign').onclick = async () => {
      if (this.over) return;
      if (await askConfirm(t('resign') + '?')) this.finish(t('you_resigned'));
    };
    $('play-new').onclick = () => { engine.stop(); $('play-game').classList.add('hidden'); $('play-setup').classList.remove('hidden'); };
    $('play-analyze').onclick = () => this.toAnalysis();
    $('play-undo').onclick = () => this.undo();
  },

  undo() {
    if (this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.setStatus(t('your_turn'));
  },

  startFromFen(fen) {
    showScreen('play');
    const turn = fen.split(' ')[1];
    this.level = +(segValue($('play-level')) ?? 2);
    this.begin(turn, fen); // you play the side to move
  },

  begin(color, fen) {
    this.playerColor = color;
    this.startFen = fen;
    this.chess = new Chess(fen);
    this.over = false;
    this.thinking = false;
    $('play-setup').classList.add('hidden');
    $('play-game').classList.remove('hidden');
    this.board.setOrientation(color);
    this.board.setPosition(fen);
    this.renderMoves();
    this.setStatus(t('your_turn'));
    if (this.chess.turn() !== color) this.engineMove();
  },

  setStatus(msg) { $('play-status').textContent = msg; },

  async userMove(mv) {
    if (this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    this.renderMoves();
    if (this.checkEnd()) return;
    this.engineMove();
  },

  async engineMove() {
    this.thinking = true;
    this.board.interactive = false;
    this.setStatus(t('thinking'));
    const lv = LEVELS[this.level];
    try {
      const uci = await engine.bestMove(this.chess.fen(), { movetime: lv.movetime, elo: lv.elo });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      this.renderMoves();
      if (this.checkEnd()) return;
      this.setStatus(t('your_turn'));
    } catch (e) {
      this.setStatus('⚠️ ' + (e.message || e));
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      this.finish(winner === this.playerColor ? t('checkmate_win') : t('checkmate_loss'));
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finish(t('draw')); return true; }
    return false;
  },

  finish(msg) {
    this.over = true;
    this.setStatus(msg);
  },

  renderMoves() {
    const el = $('play-moves');
    const hist = this.chess.history();
    el.textContent = numberedHistory(hist, this.startFen);
    el.scrollTop = el.scrollHeight;
  },

  toAnalysis() {
    const tree = treeFromHistory(this.startFen, this.chess.history());
    const names = t('level_names');
    const me = getLang() === 'es' ? 'Yo' : 'Me';
    const sf = `Stockfish (${names[this.level]})`;
    tree.setHeader('White', this.playerColor === 'w' ? me : sf);
    tree.setHeader('Black', this.playerColor === 'b' ? me : sf);
    tree.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    if (this.over && this.chess.isCheckmate()) tree.setHeader('Result', this.chess.turn() === 'w' ? '0-1' : '1-0');
    else if (this.over && this.chess.isDraw()) tree.setHeader('Result', '1/2-1/2');
    engine.stop();
    Analysis.loadTree(tree);
  },
};

function numberedHistory(sanList, startFen) {
  const parts = startFen.split(' ');
  let num = parseInt(parts[5], 10);
  let white = parts[1] === 'w';
  let out = '';
  sanList.forEach((san, i) => {
    if (white) out += `${num}. ${san} `;
    else { out += (i === 0 ? `${num}... ` : '') + san + ' '; num++; }
    white = !white;
  });
  return out.trim();
}

function treeFromHistory(startFen, sanList) {
  const tree = new GameTree(startFen === START_FEN ? undefined : startFen);
  for (const san of sanList) tree.play(san);
  return tree;
}

// ═════════════════════ OPENING TRAINER ═════════════════════

const Trainer = {
  board: null,
  chess: null,
  playerColor: 'w',
  level: 2,
  book: null,        // Map fenKey -> {san: count}
  bookBaseId: null,
  inBook: true,
  over: false,
  thinking: false,

  init() {
    buildLevelSeg($('trainer-level'));
    segInit($('trainer-color'));
    segInit($('trainer-level'));
    this.board = new Board($('trainer-board'), { onMove: mv => this.userMove(mv) });
    $('trainer-base').addEventListener('change', () => this.previewBook());
    $('trainer-start').onclick = () => this.start();
    $('trainer-new').onclick = () => { engine.stop(); $('trainer-game').classList.add('hidden'); $('trainer-setup').classList.remove('hidden'); };
    $('trainer-analyze').onclick = () => this.toAnalysis();
    $('trainer-undo').onclick = () => this.undo();
  },

  undo() {
    if (this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    if (this.chess.history().length < 2) return;
    this.chess.undo();
    this.chess.undo();
    this.over = false;
    this.board.interactive = true;
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.setStatus(t('your_turn'));
  },

  async refreshBases() {
    const bases = (await db.listBases()).filter(b => b.count > 0);
    const sel = $('trainer-base');
    const prev = sel.value;
    sel.innerHTML = '';
    if (!bases.length) {
      const o = document.createElement('option');
      o.textContent = t('no_book_bases'); o.value = '';
      sel.appendChild(o);
      $('trainer-book-info').textContent = '';
      return;
    }
    for (const b of bases) {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = `${b.name} (${b.count} ${t('games')})`;
      sel.appendChild(o);
    }
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    this.previewBook();
  },

  async buildBook(baseId) {
    if (this.book && this.bookBaseId === baseId) return this.book;
    const games = await db.listGames(baseId);
    const book = new Map();
    for (const g of games.slice(0, 500)) {
      let tree;
      try { tree = parsePgn(g.pgn); } catch { continue; }
      // walk ALL branches (variations are part of the study!)
      const walk = (node, depth) => {
        if (depth > 40) return;
        for (const child of node.children) {
          const key = fenKey(node.fen);
          let entry = book.get(key);
          if (!entry) { entry = {}; book.set(key, entry); }
          entry[child.san] = (entry[child.san] ?? 0) + 1;
          walk(child, depth + 1);
        }
      };
      walk(tree.root, 0);
    }
    this.book = book;
    this.bookBaseId = baseId;
    return book;
  },

  async previewBook() {
    const id = +$('trainer-base').value;
    if (!id) return;
    this.book = null;
    const book = await this.buildBook(id);
    $('trainer-book-info').textContent = `${book.size} ${t('book_moves')}`;
  },

  async start() {
    const id = +$('trainer-base').value;
    if (!id) { toast(t('no_book_bases')); return; }
    await this.buildBook(id);
    this.playerColor = segValue($('trainer-color'));
    this.level = +segValue($('trainer-level'));
    this.chess = new Chess();
    this.over = false;
    this.inBook = true;
    $('trainer-setup').classList.add('hidden');
    $('trainer-game').classList.remove('hidden');
    this.board.setOrientation(this.playerColor);
    this.board.setPosition(this.chess.fen());
    this.renderMoves();
    this.updateBadge(true);
    this.setStatus(t('your_turn'));
    if (this.chess.turn() !== this.playerColor) this.computerMove();
  },

  setStatus(msg) { $('trainer-status').textContent = msg; },

  updateBadge(usedBook) {
    const el = $('trainer-book-status');
    el.textContent = usedBook ? t('in_book') : t('out_of_book');
    el.className = 'book-badge ' + (usedBook ? 'in' : 'out');
  },

  async userMove(mv) {
    if (this.over || this.thinking) return;
    if (this.chess.turn() !== this.playerColor) return;
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
    this.renderMoves();
    if (this.checkEnd()) return;
    this.computerMove();
  },

  pickBookMove() {
    const entry = this.book.get(fenKey(this.chess.fen()));
    if (!entry) return null;
    const moves = Object.entries(entry);
    if (!moves.length) return null;
    const total = moves.reduce((s, [, c]) => s + c, 0);
    let r = Math.random() * total;
    for (const [san, c] of moves) { r -= c; if (r <= 0) return san; }
    return moves[0][0];
  },

  async computerMove() {
    this.thinking = true;
    this.board.interactive = false;
    const bookSan = this.pickBookMove();
    try {
      if (bookSan) {
        await sleep(450);
        let m;
        try { m = this.chess.move(bookSan); } catch { m = null; }
        if (m) {
          this.inBook = true;
          this.updateBadge(true);
          this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to }, 'green');
          this.renderMoves();
          if (this.checkEnd()) return;
          this.setStatus(t('your_turn'));
          return;
        }
      }
      // out of book → engine
      const justLeftBook = this.inBook;
      this.inBook = false;
      this.updateBadge(false);
      this.setStatus(t('thinking'));
      const lv = LEVELS[this.level];
      const uci = await engine.bestMove(this.chess.fen(), { movetime: lv.movetime, elo: lv.elo });
      if (!uci || this.over) return;
      const m = this.chess.move(uciToMove(uci));
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to }, justLeftBook ? 'yellow' : 'green');
      this.renderMoves();
      if (this.checkEnd()) return;
      this.setStatus(t('your_turn'));
    } catch (e) {
      this.setStatus('⚠️ ' + (e.message || e));
    } finally {
      this.thinking = false;
      this.board.interactive = true;
    }
  },

  checkEnd() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'b' : 'w';
      this.finishMsg(winner === this.playerColor ? t('checkmate_win') : t('checkmate_loss'));
      return true;
    }
    if (this.chess.isDraw() || this.chess.isStalemate()) { this.finishMsg(t('draw')); return true; }
    return false;
  },

  finishMsg(msg) { this.over = true; this.setStatus(msg); },

  renderMoves() {
    $('trainer-moves').textContent = numberedHistory(this.chess.history(), START_FEN);
    $('trainer-moves').scrollTop = $('trainer-moves').scrollHeight;
  },

  toAnalysis() {
    const tree = treeFromHistory(START_FEN, this.chess.history());
    tree.setHeader('Event', getLang() === 'es' ? 'Entrenamiento de apertura' : 'Opening training');
    engine.stop();
    Analysis.loadTree(tree);
  },
};

function fenKey(fen) { return fen.split(' ').slice(0, 4).join(' '); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═════════════════════ PUZZLES ═════════════════════

const DIFF_RANGES = { easy: [0, 1249], medium: [1250, 1599], hard: [1600, 1999], expert: [2000, 9999] };

const Puzzles = {
  board: null,
  current: null,       // puzzle object
  chess: null,
  moveIdx: 0,          // index into puzzle.moves
  solved: {},          // id -> true
  failedThis: false,
  loaded: false,

  async init() {
    this.board = new Board($('puzzle-board'), { onMove: mv => this.userMove(mv) });
    segInit($('puzzle-diff'), () => this.nextPuzzle());
    $('puzzle-next').onclick = () => this.nextPuzzle();
    $('puzzle-hint').onclick = () => this.hint();
    $('puzzle-solution').onclick = () => this.showSolution();
  },

  async ensureLoaded() {
    if (this.loaded) { return; }
    this.solved = await db.kvGet('puzzlesSolved', {});
    this.loaded = true;
    this.nextPuzzle();
  },

  pool() {
    const [lo, hi] = DIFF_RANGES[segValue($('puzzle-diff')) ?? 'easy'];
    return PUZZLES.filter(p => p.rating >= lo && p.rating <= hi);
  },

  updateProgress() {
    const pool = this.pool();
    const done = pool.filter(p => this.solved[p.id]).length;
    $('puzzle-progress').textContent = `${done}/${pool.length} ${t('solved_count')}`;
  },

  nextPuzzle() {
    const pool = this.pool();
    if (!pool.length) return;
    const fresh = pool.filter(p => !this.solved[p.id]);
    const list = fresh.length ? fresh : pool;
    this.current = list[Math.floor(Math.random() * list.length)];
    this.chess = new Chess(this.current.fen);
    this.moveIdx = 0;
    this.failedThis = false;
    this.updateProgress();
    // the first move in the list is the opponent's move — play it
    const playerColor = this.chess.turn() === 'w' ? 'b' : 'w';
    this.board.setOrientation(playerColor);
    this.board.setPosition(this.chess.fen());
    this.board.interactive = false;
    setTimeout(() => {
      const m = this.applyUci(this.current.moves[0]);
      this.moveIdx = 1;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      this.board.interactive = true;
      this.setStatus(`${t(playerColor === 'w' ? 'white' : 'black')} ${t('to_move_find')} (${this.current.rating})`);
    }, 600);
  },

  applyUci(u) {
    try { return this.chess.move(uciToMove(u)); } catch { return null; }
  },

  setStatus(msg) { $('puzzle-status').textContent = msg; },

  async userMove(mv) {
    if (!this.current || this.moveIdx >= this.current.moves.length) return;
    const expected = this.current.moves[this.moveIdx];
    const tryUci = mv.from + mv.to + (mv.promotion ?? '');
    // test the move
    let m;
    try { m = this.chess.move(mv); } catch { return; }
    const isMate = this.chess.isCheckmate();
    if (tryUci === expected || (isMate && this.moveIdx === this.current.moves.length - 1)) {
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), { from: m.from, to: m.to });
      if (this.moveIdx >= this.current.moves.length || isMate) {
        this.setStatus(t('solved'));
        if (!this.failedThis) {
          this.solved[this.current.id] = true;
          db.kvSet('puzzlesSolved', this.solved);
        }
        this.updateProgress();
        return;
      }
      this.setStatus(t('correct'));
      // opponent reply
      this.board.interactive = false;
      await sleep(400);
      const r = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), r ? { from: r.from, to: r.to } : null);
      this.board.interactive = true;
    } else {
      // wrong — undo, shake
      this.chess.undo();
      this.failedThis = true;
      this.board.setPosition(this.chess.fen());
      this.setStatus(t('wrong_try'));
      $('puzzle-board').classList.add('shake');
      setTimeout(() => $('puzzle-board').classList.remove('shake'), 500);
    }
  },

  hint() {
    if (!this.current || this.moveIdx >= this.current.moves.length) return;
    this.failedThis = true;
    const u = this.current.moves[this.moveIdx];
    const sq = this.board.squares[u.slice(0, 2)];
    if (sq) { sq.classList.add('hintsq'); setTimeout(() => sq.classList.remove('hintsq'), 1500); }
  },

  async showSolution() {
    if (!this.current) return;
    this.failedThis = true;
    this.board.interactive = false;
    while (this.moveIdx < this.current.moves.length) {
      const m = this.applyUci(this.current.moves[this.moveIdx]);
      this.moveIdx++;
      this.board.setPosition(this.chess.fen(), m ? { from: m.from, to: m.to } : null);
      await sleep(700);
    }
    this.setStatus(t('solved'));
    this.board.interactive = true;
  },
};

// ═════════════════════ POSITION SETUP ═════════════════════

const Setup = {
  board: null,
  grid: {},            // sq -> {color,type}
  palettePiece: null,  // {color,type} | 'trash' | null

  init() {
    this.board = new Board($('setup-board'), {
      onEditorTap: sq => this.tap(sq),
    });
    this.board.editorMode = true;
    this.buildPalette();
    segInit($('setup-turn'));
    $('setup-start').onclick = () => this.load(START_FEN);
    $('setup-clear').onclick = () => { this.grid = {}; this.sync(); };
    $('setup-cancel').onclick = () => showScreen('analysis');
    $('setup-analyze').onclick = () => this.done('analyze');
    $('setup-play').onclick = () => this.done('play');
  },

  buildPalette() {
    const pal = $('setup-palette');
    pal.innerHTML = '';
    for (const color of ['w', 'b']) {
      for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
        const b = document.createElement('button');
        b.className = 'pal-btn';
        b.dataset.piece = color + type;
        b.innerHTML = `<img src="${getPieceSet()}/${color}${type.toUpperCase()}.svg" alt="">`;
        b.onclick = () => this.pick(b, { color, type });
        pal.appendChild(b);
      }
    }
    const trash = document.createElement('button');
    trash.className = 'pal-btn'; trash.textContent = '🗑';
    trash.dataset.piece = 'trash';
    trash.onclick = () => this.pick(trash, 'trash');
    pal.appendChild(trash);
  },

  pick(btn, piece) {
    const was = btn.classList.contains('on');
    document.querySelectorAll('.pal-btn').forEach(b => b.classList.remove('on'));
    if (was) { this.palettePiece = null; return; }
    btn.classList.add('on');
    this.palettePiece = piece;
  },

  open(fen = START_FEN) {
    this.load(fen);
    showScreen('setup');
  },

  load(fen) {
    this.grid = parsePlacement(fen.split(' ')[0]);
    const parts = fen.split(' ');
    const turn = parts[1] ?? 'w';
    $('setup-turn').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === turn));
    const cast = parts[2] ?? 'KQkq';
    for (const c of ['K', 'Q', 'k', 'q']) $('cast-' + c).checked = cast.includes(c);
    this.sync();
  },

  tap(sq) {
    if (this.palettePiece === 'trash' || (this.palettePiece === null && this.grid[sq])) {
      delete this.grid[sq];
    } else if (this.palettePiece && this.palettePiece !== 'trash') {
      const p = this.palettePiece;
      const same = this.grid[sq] && this.grid[sq].color === p.color && this.grid[sq].type === p.type;
      if (same) delete this.grid[sq];
      else {
        if (p.type === 'k') { // only one king per side
          for (const [s, gp] of Object.entries(this.grid)) if (gp.type === 'k' && gp.color === p.color) delete this.grid[s];
        }
        this.grid[sq] = { color: p.color, type: p.type };
      }
    }
    this.sync();
  },

  sync() {
    this.board.setPosition(this.buildFen());
  },

  buildFen() {
    const FILES = 'abcdefgh';
    let rows = [];
    for (let r = 8; r >= 1; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.grid[FILES[f] + r];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const turn = segValue($('setup-turn')) ?? 'w';
    let cast = '';
    for (const c of ['K', 'Q', 'k', 'q']) if ($('cast-' + c).checked) cast += c;
    return `${rows.join('/')} ${turn} ${cast || '-'} - 0 1`;
  },

  done(mode) {
    const fen = this.buildFen();
    const v = validateFen(fen);
    if (!v.ok) { toast(t('invalid_position') + (v.error ?? '')); return; }
    // also require both kings
    const pieces = Object.values(this.grid);
    if (!pieces.some(p => p.type === 'k' && p.color === 'w') || !pieces.some(p => p.type === 'k' && p.color === 'b')) {
      toast(t('invalid_position') + '♔+♚');
      return;
    }
    if (mode === 'analyze') Analysis.loadTree(new GameTree(fen));
    else Play.startFromFen(fen);
  },
};

// ═════════════════════ SETTINGS ═════════════════════

function openSettings() {
  modal(async (box, close) => {
    box.innerHTML = `<h3>${t('settings')}</h3>`;
    // language
    const l1 = document.createElement('label'); l1.className = 'fld-label'; l1.textContent = t('language');
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const [v, name] of [['es', 'Español'], ['en', 'English']]) {
      const b = document.createElement('button');
      b.textContent = name; b.dataset.v = v;
      if (getLang() === v) b.classList.add('on');
      seg.appendChild(b);
    }
    segInit(seg, v => { setLang(v); relabel(); });
    // engine lines
    const l2 = document.createElement('label'); l2.className = 'fld-label'; l2.textContent = t('engine_lines');
    const seg2 = document.createElement('div'); seg2.className = 'seg';
    const cur = +(await db.kvGet('engineLines', 2));
    for (const n of [1, 2, 3]) {
      const b = document.createElement('button');
      b.textContent = n; b.dataset.v = n;
      if (cur === n) b.classList.add('on');
      seg2.appendChild(b);
    }
    segInit(seg2, v => db.kvSet('engineLines', +v));
    // board color theme
    const l3 = document.createElement('label'); l3.className = 'fld-label'; l3.textContent = t('board_theme');
    const seg3 = document.createElement('div'); seg3.className = 'seg';
    const curBoardTheme = await db.kvGet('boardTheme', 'wood');
    for (const [v, key] of [['wood', 'theme_wood'], ['green', 'theme_green'], ['blue', 'theme_blue']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (curBoardTheme === v) b.classList.add('on');
      seg3.appendChild(b);
    }
    segInit(seg3, v => Themes.setBoardTheme(v));
    // piece style
    const l4 = document.createElement('label'); l4.className = 'fld-label'; l4.textContent = t('piece_style');
    const seg4 = document.createElement('div'); seg4.className = 'seg';
    const curPieceSet = await db.kvGet('pieceSet', 'pieces');
    for (const [v, key] of [['pieces', 'piece_classic'], ['pieces2', 'piece_alt']]) {
      const b = document.createElement('button');
      b.textContent = t(key); b.dataset.v = v;
      if (curPieceSet === v) b.classList.add('on');
      seg4.appendChild(b);
    }
    segInit(seg4, v => Themes.setPieceSetChoice(v));
    const about = document.createElement('p'); about.className = 'hint'; about.textContent = t('about');
    const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = t('close');
    ok.onclick = () => close(null);
    box.append(l1, seg, l2, seg2, l3, seg3, l4, seg4, about, ok);
  });
}

function relabel() {
  applyStatic();
  buildLevelSeg($('play-level'), +(segValue($('play-level')) ?? 2));
  buildLevelSeg($('trainer-level'), +(segValue($('trainer-level')) ?? 2));
  Puzzles.updateProgress?.();
}

const Themes = {
  async init() {
    const boardTheme = await db.kvGet('boardTheme', 'wood');
    document.body.classList.add('theme-' + boardTheme);
    const pieceSet = await db.kvGet('pieceSet', 'pieces');
    setPieceSet(pieceSet);
  },
  setBoardTheme(v) {
    document.body.classList.remove('theme-wood', 'theme-green', 'theme-blue');
    document.body.classList.add('theme-' + v);
    db.kvSet('boardTheme', v);
  },
  setPieceSetChoice(v) {
    setPieceSet(v);
    db.kvSet('pieceSet', v);
    Setup.buildPalette();
  },
};

// ═════════════════════ init ═════════════════════

async function main() {
  const splashStart = Date.now();
  applyStatic();
  Analysis.init();
  Base.init();
  Play.init();
  Trainer.init();
  Puzzles.init();
  Setup.init();
  await Themes.init();
  $('btn-settings').onclick = openSettings;
  showScreen('analysis');
  // make sure at least one base exists so saving is one tap
  const bases = await db.listBases();
  if (!bases.length) await db.createBase(t('my_games'));
  // register service worker for offline use
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  const elapsed = Date.now() - splashStart;
  setTimeout(() => $('splash').classList.add('hide'), Math.max(0, 600 - elapsed));
}

main();
