// Sealed Moves ("calc"), the fifth puzzle mode: the screen. The rules are
// js/calc.js; this file only decides what is on the screen.
// Spec: docs/superpowers/specs/2026-10-10-calculation-mode-design.md.
//
// The visible name is "Jugadas selladas" / "Sealed Moves". Every id, key and
// file says `calc`, and stays `calc` if the name ever changes.
//
// In its own file because js/app.js is already too big to read in one go.
//
// THE BOARD NEVER MOVES while the player writes. It is a Board that is not
// interactive, so board.js takes no tap on it; the taps are read here and
// checked against the position the answer tree holds for the selected chip,
// which is NOT the position on the board. After the hand-in is final the board
// shows the position of whichever chip is tapped.
//
// SIDE VARIATIONS are checked by the engine once the hand-in is final, never
// before: the result is on the screen first and each chip is recoloured as its
// answer arrives (judge()). The engine is the app's one Engine, handed over by
// js/app.js; showScreen() stops it on every change of screen, so an answer that
// comes back after the player has left is thrown away and the rest stay grey.
//
// THEME, DIFFICULTY AND AUTO-NEXT are the mode's own (kv calcTheme,
// calcDifficulty, calcAutoNext), set through the Puzzles picker and options
// sheet. Nothing here reads or writes the Puzzles ones.
//
// ITS OWN RATING (kv calcElo, calcEloHistory, calcAttemptCount, calcSolved; all
// four synced). Private: it is shown here and nowhere else in the app. Until the
// first puzzle is paid it is the puzzle rating minus 200, read again each time,
// and it is saved only from that first payment on. The arithmetic is js/calc.js
// calcPay. WHEN IT IS PAID: at the hand-in that ends the puzzle, in full, except
// that a perfect solve with variations still to be checked is paid as a plain
// solve there and gets the perfect bonus once the engine has found nothing wrong
// (settle()). So the number on screen can go up a second later, never down.
// A variation the engine could not check does not cost the bonus.
//
// Imports from js/app.js (cycle): every app.js binding used here is touched
// inside a function only, never at module top level.
import { Chess } from '../vendor/chess.js';
import { t, getLang } from './i18n.js';
import { Board } from './board.js';
import * as db from './db.js';
import { PUZZLES, ensureForRating } from './puzzles.js';
import { blindPick, BLIND_PICK_MIN } from './blind-pick.js';
import { blindSanLocal } from './blind-list.js';
import { Sound } from './sound.js';
import { REPLY_MS } from './move-feel.js';
import { uciLineToSan } from './engine.js';
import { calcMainLine, calcNewTree, calcIsMine, calcEnter, calcGrade, calcVerdict, calcAddReply, calcRows, calcSideOk, calcToJudge,
  calcStartElo, calcPay, calcFresh, calcAnalysisTree } from './calc.js';
import { $, toast, modal, esc, showScreen, activeScreen, Puzzles, PuzzleLog, Streak, Analysis, recordEloHistory, eloDeltaText, openEloHistoryModal } from './app.js';

// The engine's time on one search. A judged move takes two at most: the
// position it was played in, then the position after it.
const JUDGE_MS = 250;
const AUTO_NEXT_MS = 1600;
// The engine file is 7 MB and is fetched the first time it is used.
const within = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('engine timeout')), ms))]);

// "16." before a White move, "16…" before a Black one, read off the position
// the move is played in.
const numOf = fenBefore => {
  const p = fenBefore.split(' ');
  return p[5] + (p[1] === 'w' ? '.' : '…');
};
const sanOf = san => blindSanLocal(san, getLang());
const colourWord = c => t(c === 'w' ? 'white' : 'black');

export const CalcUI = {
  board: null,
  current: null,     // the puzzle
  main: null,        // calcMainLine(current)
  tree: null,        // the player's answer; tree.current is the selected chip
  phase: 'idle',     // 'idle' | 'write' | 'done'
  ready: false,      // the opponent's first move is on the board
  pick: null,        // the square tapped first
  handIns: 0,
  helped: false,     // Kael has written a reply in
  hinted: false,     // a hint was shown: no "perfect", and a solve pays half
  verdict: null,     // 'failed' | 'solved' | 'perfect' once done
  marks: null,       // node id -> 'right' | 'wrong' | 'unchecked' | 'checking' once done
  fixes: null,       // node id -> the engine's move (SAN) beside a wrong variation move
  judging: false,    // the engine is going through the variations
  sideRight: 0,      // variation moves of the player's the engine accepted
  sideWrong: 0,      // ... and rejected
  unchecked: 0,      // ... and never judged: over the limit, or no engine
  judgeRun: 0,
  engine: null,
  // The mode's own choices. `theme` is 'random' or a Set of theme ids.
  theme: 'random',
  themeMissSaid: false,
  difficulty: 0,
  autoNext: false,
  elo: 1000,         // the mode's own rating
  rated: false,      // calcElo is saved; until then elo follows the puzzle rating
  statsRead: false,
  attemptCount: 0,
  solved: {},        // id -> 1 solved, 2 perfect
  paid: null,        // { elo, n }: the rating and the count this puzzle was paid from
  bonusOwed: false,  // paid as a plain solve; the perfect bonus waits for the engine
  delta: null,       // what this puzzle moved the rating by, once paid
  logEntry: null,
  introOpen: false,
  prefs: null,
  autoTimer: null,
  // Kael's line when it is not the plain instruction: { key, m }. Kept as a
  // key so a change of language repaints it.
  say: null,
  // Done: what the board is showing. An answer node, { line: i } for a move of
  // the puzzle's line, or null for the starting position.
  shown: null,
  token: 0,
  leadTimer: null,

  init(engine) {
    this.engine = engine;
    this.board = new Board($('calc-board'), { interactive: false, onSound: type => Sound.play(type) });
    this.board.el.addEventListener('pointerdown', e => {
      const sq = e.target.closest('.sq');
      if (sq) this.tap(sq.dataset.sq);
    });
    $('calc-tree').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) this.tapChip(b);
    });
    $('calc-delete').onclick = () => this.deleteSelected();
    $('calc-hint').onclick = () => this.hint();
    $('calc-solution').onclick = () => this.giveUp();
    $('calc-options').onclick = () => this.openOptions();
    $('calc-analyze').onclick = () => this.toAnalysis();
    $('calc-rating').onclick = () => this.openProgress();
    $('calc-submit').onclick = () => this.submit();
    $('calc-next').onclick = () => this.next();
  },

  open() { showScreen('calc'); },

  // Every way onto the screen comes through here (js/app.js showScreen). A
  // puzzle left half written is still there: nothing in this mode is timed.
  onEnter() {
    this.stopJudging();
    if (this.current) this.render();
    else this.next();
    this.intro();
  },

  // Kael explains the mode the first time it is opened on this device.
  intro() {
    let seen = true;
    try { seen = !!localStorage.getItem('calcIntroDone'); } catch { /* no storage: say nothing */ }
    if (seen || this.introOpen) return;
    this.introOpen = true;
    modal((box, close) => {
      box.innerHTML = `<div class="kael-modal-head"><img src="icons/kael/kael-bust.png" class="kael-portrait" alt="Kael" style="width:90px;"></div>
        <h3>${esc(t('calc_title'))}</h3>` + ['calc_intro_1', 'calc_intro_2', 'calc_intro_3'].map(k => `<p>${esc(t(k))}</p>`).join('');
      const ok = document.createElement('button');
      ok.className = 'btn primary big'; ok.id = 'calc-intro-ok'; ok.textContent = t('calc_intro_ok');
      ok.onclick = () => close(true);
      box.append(ok);
    }).then(() => {
      this.introOpen = false;
      try { localStorage.setItem('calcIntroDone', '1'); } catch { /* it will be said again */ }
    });
  },

  // ── its own rating ──

  async readStats() {
    const own = await db.kvGet('calcElo', null);
    this.rated = typeof own === 'number';
    this.elo = this.rated ? own : calcStartElo(await db.kvGet('puzzleElo', 1200));
    this.attemptCount = +(await db.kvGet('calcAttemptCount', 0)) || 0;
    this.solved = (await db.kvGet('calcSolved', null)) || {};
    this.statsRead = true;
  },

  // After a sign-in the saved values may have been replaced by the account's.
  async reload() {
    if (!this.statsRead) return;
    this.bonusOwed = false;
    await this.readStats();
    this.paintElo();
  },

  // Pays the puzzle on screen. Called a second time (settle) it pays the same
  // puzzle again FROM THE SAME STARTING RATING, so the bonus is exact and the
  // attempt is counted once.
  pay(verdict) {
    const p = this.current;
    const first = !this.paid;
    if (first) {
      this.paid = { elo: this.elo, n: this.attemptCount };
      this.attemptCount++;
      db.kvSet('calcAttemptCount', this.attemptCount);
    }
    this.elo = calcPay({ elo: this.paid.elo, rating: p.rating, attemptCount: this.paid.n, verdict, hinted: this.hinted });
    this.rated = true;
    // Whole points off the rounded rating, as in Puzzles, so it matches the badge.
    this.delta = Math.round(this.elo) - Math.round(this.paid.elo);
    db.kvSet('calcElo', this.elo);
    recordEloHistory('calcEloHistory', this.elo);
    const won = verdict !== 'failed', mark = verdict === 'perfect' ? 2 : 1;
    if (won && (this.solved[p.id] || 0) < mark) {
      this.solved[p.id] = mark;
      db.kvSet('calcSolved', this.solved);
    }
    const note = verdict === 'perfect' ? { icon: '★', text: t('calc_log_perfect') } : null;
    if (first) {
      this.logEntry = PuzzleLog.add('calc', p, won, this.delta, note);
      if (won) Streak.recordActivity();
    } else if (this.logEntry) {
      Object.assign(this.logEntry, { delta: this.delta, note });
      PuzzleLog.render('calc');
    }
    this.paintElo();
  },

  // The engine is done with the variations, or will not be asked any more.
  settle() {
    if (!this.bonusOwed) return;
    this.bonusOwed = false;
    if (this.verdict === 'perfect' && this.current && this.paid) this.pay('perfect');
  },

  paintElo() {
    const shown = Math.round(this.elo);
    $('calc-rating').classList.toggle('hidden', !this.statsRead);
    $('calc-elo').textContent = shown;
    const d = this.phase === 'done' ? this.delta : null, el = $('calc-elo-delta');
    el.textContent = d == null ? '' : eloDeltaText(d);
    el.className = 'elo-delta' + (d == null ? ' hidden' : d > 0 ? ' up' : d < 0 ? ' down' : ' flat');
    $('calc-rating').setAttribute('aria-label', `${t('calc_elo')}: ${shown}` + (d == null ? '' : `, ${eloDeltaText(d)}`));
  },

  // The rating's sheet: how many solved, this session's puzzles (each dot
  // reopens its puzzle), and the way to the rating's chart.
  async openProgress() {
    if (!this.statsRead) return;
    const hist = await db.kvGet('calcEloHistory', []);
    const marks = Object.values(this.solved);
    modal((box, close) => {
      box.innerHTML = `<h3>${esc(t('calc_elo'))}: ${Math.round(this.elo)}</h3>
        <p class="hint">${esc(t('calc_progress_private'))}</p>
        <p id="calc-progress-counts">${esc(t('calc_progress_counts').replace('{s}', marks.length).replace('{p}', marks.filter(m => m === 2).length))}</p>
        <p class="hint">${esc(t(PuzzleLog.logs.calc.length ? 'calc_progress_session' : 'calc_progress_none'))}</p>
        <div id="calc-log" class="plog"></div>`;
      const chart = document.createElement('button');
      chart.className = 'btn big'; chart.id = 'calc-progress-chart'; chart.textContent = t('calc_progress_chart');
      chart.onclick = () => { close(null); openEloHistoryModal(hist, 'calc_elo', { share: false }); };
      const done = document.createElement('button');
      done.className = 'btn big'; done.textContent = t('close');
      done.onclick = () => close(null);
      box.append(chart, done);
      // The box is not in the page until this builder returns.
      setTimeout(() => PuzzleLog.render('calc'));
    });
  },

  // The puzzle's line with everything that was written, on the Analysis screen.
  toAnalysis() {
    if (this.phase !== 'done' || !this.current) return;
    const tree = calcAnalysisTree(this.current, this.tree);
    tree.setHeader('Event', t('calc_title'));
    this.engine.stop();
    Analysis.loadTree(tree, { baseId: null, gameId: null, fromGameReview: true });
  },

  async next() {
    const mine = ++this.token;
    clearTimeout(this.autoTimer);
    await this.loadPrefs();
    if (!this.rated) await this.readStats();
    const target = this.targetRating();
    try { await ensureForRating(target); } catch { /* play what is already loaded */ }
    if (mine !== this.token) return;
    const themes = this.theme === 'random' ? null : this.theme;
    let pick = blindPick(PUZZLES, target, themes);
    if (themes && (pick.fallback || pick.list.length < BLIND_PICK_MIN)) {
      // A thin theme: bring in the rating files further out before settling.
      try { await ensureForRating(target, 3); } catch { /* play what is already loaded */ }
      if (mine !== this.token) return;
      pick = blindPick(PUZZLES, target, themes);
    }
    if (pick.fallback && !this.themeMissSaid) { this.themeMissSaid = true; toast(t('blind_theme_none')); }
    // Not the one just shown, and not a solved one while an unsolved one is left.
    const list = calcFresh(pick.list.filter(p => p !== this.current), this.solved);
    for (let i = 0; i < 20 && list.length; i++) {
      if (this.load(list[Math.floor(Math.random() * list.length)])) return;
    }
    this.say = { key: 'calc_none' };
    this.render();
  },

  // ── the mode's own theme, difficulty and auto-next ──

  loadPrefs() {
    return this.prefs ||= (async () => {
      this.difficulty = +(await db.kvGet('calcDifficulty', 0)) || 0;
      this.autoNext = !!(await db.kvGet('calcAutoNext', false));
      const th = await db.kvGet('calcTheme', 'random');
      this.theme = Array.isArray(th) && th.length ? new Set(th) : 'random';
    })();
  },

  // What the options sheet shows and what next() aims at.
  targetRating() { return Math.max(600, Math.min(3000, this.elo + this.difficulty)); },

  themeLabel() {
    const tf = this.theme;
    return tf === 'random' ? t('blind_theme_btn').replace('{x}', t('blind_theme_any'))
      : tf.size === 1 ? t('blind_theme_btn').replace('{x}', t('theme_' + [...tf][0]))
      : t('blind_theme_btn_many').replace('{n}', tf.size);
  },

  // One ⚙ for all three: the action row has no room for a theme button.
  async openOptions() {
    await this.loadPrefs();
    Puzzles.openOptions({
      owner: this, keys: { difficulty: 'calcDifficulty', autoNext: 'calcAutoNext' },
      hints: { difficulty: 'calc_difficulty_hint', autoNext: 'calc_auto_next_hint' },
      theme: {
        label: this.themeLabel(),
        pick: () => Puzzles.openThemePicker({ filter: this.theme, apply: f => this.setTheme(f) }),
      },
    });
  },

  // As in Puzzles, a new theme brings a puzzle of that theme at once.
  setTheme(f) {
    this.theme = f;
    this.themeMissSaid = false;
    db.kvSet('calcTheme', f === 'random' ? 'random' : [...f]);
    this.next();
  },

  // Puts one puzzle up. False when its moves do not play.
  load(puzzle) {
    const main = calcMainLine(puzzle);
    if (!main) return false;
    this.settle();   // the puzzle being left is owed its bonus if nothing was found wrong
    this.token++;
    this.judgeRun++;
    clearTimeout(this.leadTimer);
    clearTimeout(this.autoTimer);
    Object.assign(this, {
      current: puzzle, main, tree: calcNewTree(main), phase: 'write', ready: false,
      handIns: 0, helped: false, hinted: false, verdict: null, marks: null, fixes: null, judging: false,
      sideRight: 0, sideWrong: 0, unchecked: 0, say: null, shown: null,
      paid: null, bonusOwed: false, delta: null, logEntry: null,
    });
    this.setPick(null);
    this.board.setOrientation(main.turn);
    this.board.setPosition(puzzle.fen);
    // The opponent's move is seen being played, then stays highlighted.
    this.leadTimer = setTimeout(() => {
      this.board.setPosition(main.fen, main.lead);
      this.ready = true;
    }, REPLY_MS.puzzleOpening);
    this.render();
    return true;
  },

  // ── writing ──

  setPick(sq) {
    if (this.pick) this.board.squares[this.pick].classList.remove('calc-pick');
    this.pick = sq;
    if (sq) this.board.squares[sq].classList.add('calc-pick');
  },

  refuse(key) {
    this.setPick(null);
    const turn = this.tree.current.fen.split(' ')[1];
    toast(t(key).replaceAll('{c}', colourWord(turn)));
    const el = this.board.el;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  },

  // A tap on the frozen board. Everything is read from the position the tree
  // holds for the selected chip: the player taps where the piece stands in
  // their head, not where the board still shows it.
  async tap(sq) {
    if (this.phase !== 'write' || !this.ready) return;
    const at = this.tree.current;
    let chess;
    try { chess = new Chess(at.fen); } catch { return; }
    const piece = chess.get(sq);
    const own = !!piece && piece.color === chess.turn();
    if (!this.pick) {
      if (own) this.setPick(sq); else this.refuse('calc_no_piece');
      return;
    }
    if (this.pick === sq) { this.setPick(null); return; }
    const from = this.pick;
    const legal = chess.moves({ square: from, verbose: true }).find(m => m.to === sq);
    if (!legal) {
      if (own) this.setPick(sq); else this.refuse('calc_illegal');
      return;
    }
    let promotion;
    if (legal.promotion) {
      promotion = await this.board._askPromotion(chess.turn());
      // Next, a chip or the hand-in may have been tapped while it was open.
      if (this.phase !== 'write' || this.tree.current !== at) { this.setPick(null); return; }
    }
    this.setPick(null);
    const res = calcEnter(this.tree, at, { from, to: sq, promotion });
    if (res.error) { this.tree.goto(at); toast(t('calc_say_taken')); return; }
    this.say = null;
    this.render();
  },

  tapChip(b) {
    if (b.dataset.line !== undefined) {
      const i = +b.dataset.line, m = this.main.line[i];
      this.shown = { line: i };
      this.board.setPosition(m.fen, { from: m.from, to: m.to });
      this.render();
      return;
    }
    const node = this.tree.findById(+b.dataset.node);
    if (!node) return;
    if (this.phase === 'write') {
      this.setPick(null);
      this.tree.goto(node);
      this.say = null;
    } else if (this.shown === node) {
      // A second tap on the chip being shown puts the puzzle's position back.
      this.shown = null;
      this.board.setPosition(this.main.fen);
      this.board.lastMove = this.main.lead;
      this.board.render();
    } else {
      this.shown = node;
      this.board.setPosition(node.fen, { from: node.from, to: node.to });
    }
    this.render();
  },

  deleteSelected() {
    const node = this.tree.current;
    if (this.phase !== 'write' || node === this.tree.root) return;
    this.setPick(null);
    this.tree.deleteNode(node);   // leaves the chip before it selected
    this.say = null;
    this.render();
  },

  // Which piece moves, for the selected empty step of the main line. It costs
  // the "perfect" mark. Off the main line there is nothing to point at: the
  // puzzle has no move for a position it never reaches.
  hint() {
    if (this.phase !== 'write' || !this.ready) return;
    const at = this.tree.current, line = this.main.line, path = [];
    for (let n = at; n.parent; n = n.parent) path.unshift(n);
    const step = path.length % 2 === 0 && path.length < line.length && !at.children.length &&
      path.every((n, i) => n.san === line[i].san);
    if (!step) { toast(t('calc_hint_none')); return; }
    const from = line[path.length].from;
    this.hinted = true;
    this.setPick(null);
    const sq = this.board.squares[from];
    sq.classList.add('hintsq');
    setTimeout(() => sq.classList.remove('hintsq'), 1500);
    this.say = { key: 'calc_hint_say', x: from };
    this.render();
  },

  // ── hand-in ──

  submit() {
    if (this.phase !== 'write' || !this.tree.root.children.length) return;
    this.setPick(null);
    this.handIns++;
    const grade = calcGrade(this.tree, this.main.line);
    const verdict = calcVerdict(grade, { handIns: this.handIns, helped: this.helped || this.hinted });
    if (verdict !== 'unfinished') { this.finish(verdict, grade); return; }
    // Right so far. Kael writes the puzzle's reply in where the player did not
    // consider it; where the reply is there, he only points at the empty slot.
    const reply = calcAddReply(this.tree, grade.missing);
    if (reply) this.helped = true;
    const at = reply || grade.missing.after;
    this.tree.goto(at);
    this.say = { key: reply ? 'calc_kael_reply' : 'calc_kael_owed', m: at };
    this.render();
  },

  // The Solution button: a failed puzzle, with whatever was written graded.
  giveUp() {
    if (this.phase !== 'write') return;
    this.finish('failed', calcGrade(this.tree, this.main.line), true);
  },

  finish(verdict, grade, gaveUp = false) {
    this.setPick(null);
    Object.assign(this, { phase: 'done', verdict, marks: grade.marks, fixes: new Map(), shown: null });
    if (verdict !== 'failed') this.say = { key: 'calc_' + verdict };
    else if (gaveUp || !grade.wrong) this.say = { key: 'calc_gave_up' };
    else this.say = { key: 'calc_failed', m: grade.wrong };
    Sound.play(verdict === 'failed' ? 'puzzle-wrong' : 'puzzle-correct');
    // A perfect solve with variations to check is paid as a plain solve now;
    // the bonus follows in settle() when the engine has found nothing wrong.
    this.bonusOwed = verdict === 'perfect' && calcToJudge(this.tree, grade.marks).judge.length > 0;
    this.pay(this.bonusOwed ? 'solved' : verdict);
    this.render();
    // The result is read from the top: the puzzle's line, then the first move.
    $('calc-tree').scrollTop = 0;
    this.judge();
  },

  // ── side variations: the engine, after the result ──

  // The result is already on the screen and does not wait for any of this.
  // Each move of the player's own off the main line is judged in turn
  // (js/calc.js: which ones, and the rule) and its chip recoloured as the
  // answer arrives. A wrong one gets the engine's move beside it and turns a
  // perfect solve into a solved one; it never fails the puzzle. No engine, an
  // engine that stops answering, or the player gone: the rest stay grey.
  async judge() {
    const run = ++this.judgeRun, marks = this.marks, fixes = this.fixes;
    const { judge, over } = calcToJudge(this.tree, marks);
    this.unchecked = judge.length + over.length;
    if (judge.length) {
      for (const n of judge) marks.set(n.id, 'checking');
      this.judging = true;
      this.render();
      const live = () => run === this.judgeRun && activeScreen === 'calc';
      let wait = 20000;
      try {
        for (const n of judge) {
          let ok = n.san.endsWith('#');
          if (!ok) {
            const at = n.parent.fen;
            const best = await within(this.engine.evaluateBest(at, JUDGE_MS), wait);
            wait = 4000;
            if (!live() || !best.ok) break;
            const bestSan = uciLineToSan(at, [best.best])[0];
            ok = bestSan === n.san;
            if (!ok) {
              const after = await within(this.engine.evaluateBest(n.fen, JUDGE_MS), wait);
              if (!live() || !after.ok) break;
              ok = calcSideOk(best.score, after.score, at.split(' ')[1]);
              if (!ok && bestSan) fixes.set(n.id, bestSan);
            }
          }
          marks.set(n.id, ok ? 'right' : 'wrong');
          this.unchecked--;
          if (ok) this.sideRight++; else this.sideWrong++;
          if (!ok && this.verdict === 'perfect') { this.verdict = 'solved'; this.say = { key: 'calc_solved' }; }
          this.render();
        }
      } catch { /* the engine could not start, or stopped answering */ }
      if (run !== this.judgeRun) return;   // stopJudging() or load() has tidied up
      this.stopJudging();
      this.render();
    }
    if (activeScreen !== 'calc') return;
    if (this.autoNext && this.verdict !== 'failed' && !this.sideWrong) {
      const solved = this.current;
      // Not while a move is being looked at on the board.
      this.autoTimer = setTimeout(() => {
        if (activeScreen === 'calc' && this.current === solved && this.phase === 'done' && !this.shown) this.next();
      }, AUTO_NEXT_MS);
    }
  },

  // Whatever the engine has not answered stays grey.
  stopJudging() {
    this.judgeRun++;
    this.judging = false;
    if (this.marks) for (const [id, m] of this.marks) if (m === 'checking') this.marks.set(id, 'unchecked');
    this.settle();
  },

  // ── drawing ──

  label(node) { return numOf(node.parent.fen) + ' ' + sanOf(node.san); },

  // The plain instruction for the selected chip.
  plainSay() {
    const at = this.tree.current;
    if (at === this.tree.root && !at.children.length) {
      return `${colourWord(this.main.turn)} ${t('to_move_short')}. ${t('calc_say_first')}`;
    }
    if (at !== this.tree.root && calcIsMine(at)) return t('calc_say_reply').replace('{m}', this.label(at));
    if (at.children.length) return t('calc_say_taken');
    return t('calc_say_mine').replace('{m}', this.label(at));
  },

  render() {
    const sayEl = $('calc-say-text');
    if (!this.main) {
      sayEl.textContent = this.say ? t(this.say.key) : '';
      $('calc-tree').textContent = '';
      for (const id of ['calc-delete', 'calc-hint', 'calc-solution', 'calc-submit']) $(id).classList.add('hidden');
      $('calc-next').classList.toggle('hidden', !this.say);
      $('calc-analyze').classList.add('hidden');
      this.paintElo();
      return;
    }
    const done = this.phase === 'done';
    let say = this.say ? t(this.say.key).replace('{m}', this.say.m ? this.label(this.say.m) : '').replace('{x}', this.say.x || '') : this.plainSay();
    if (done) {
      const note = this.judging ? 'calc_checking' : this.sideWrong ? 'calc_side_wrong'
        : this.unchecked ? 'calc_unchecked_note' : this.sideRight ? 'calc_side_right' : null;
      if (note) say += ' ' + t(note);
    }
    sayEl.textContent = say;
    $('calc-say').className = 'calc-say' + (done ? (this.verdict === 'failed' ? ' bad' : ' good') : '');

    const el = $('calc-tree');
    el.textContent = '';
    const chip = (node, cls = '') => {
      const b = document.createElement('button');
      const sel = done ? this.shown === node : this.tree.current === node;
      // Grey is for a move of the player's that was not checked. The
      // opponent's replies in a variation are never judged, so they stay plain.
      const mark = done ? this.marks.get(node.id) || 'unchecked' : '';
      b.className = 'calc-chip' + cls + (sel ? ' sel' : '') + (node.kael ? ' kael' : '') +
        (mark ? ' ' + (mark === 'unchecked' && !calcIsMine(node) ? 'reply' : mark === 'checking' ? 'unchecked checking' : mark) : '');
      b.dataset.node = node.id;
      b.textContent = sanOf(node.san);
      return b;
    };
    const num = fenBefore => {
      const s = document.createElement('span');
      s.className = 'calc-num';
      s.textContent = numOf(fenBefore);
      return s;
    };
    // The puzzle's own line, over the answer, once the puzzle is failed.
    if (done && this.verdict === 'failed') {
      const row = document.createElement('div');
      row.className = 'calc-row calc-line';
      const head = document.createElement('b');
      head.textContent = t('calc_line_label');
      row.appendChild(head);
      let before = this.main.fen;
      this.main.line.forEach((m, i) => {
        if (i === 0 || before.split(' ')[1] === 'w') row.appendChild(num(before));
        const b = document.createElement('button');
        b.className = 'calc-chip right' + (this.shown && this.shown.line === i ? ' sel' : '');
        b.dataset.line = i;
        b.textContent = sanOf(m.san);
        row.appendChild(b);
        before = m.fen;
      });
      el.appendChild(row);
    }
    for (const r of calcRows(this.tree)) {
      if (!r.own && done && !r.reply) continue;
      const row = document.createElement('div');
      row.className = 'calc-row';
      row.style.paddingLeft = Math.min(r.depth, 6) * 14 + 'px';
      if (r.reply) {
        const arm = document.createElement('span');
        arm.className = 'calc-arm';
        arm.textContent = '↳';
        row.append(arm, num(r.reply.parent.fen), chip(r.reply));
      }
      if (r.own) {
        row.append(num(r.at.fen), chip(r.own));
        const fix = done && this.fixes.get(r.own.id);
        if (fix) {
          const better = document.createElement('span');
          better.className = 'calc-fix';
          better.textContent = '✓ ' + sanOf(fix);
          better.setAttribute('aria-label', t('calc_fix').replace('{m}', sanOf(fix)));
          row.appendChild(better);
        }
      } else if (!done) {
        const b = document.createElement('button');
        b.className = 'calc-chip calc-slot' + (this.tree.current === r.at ? ' sel' : '') + (r.at.kael ? ' kael' : '');
        b.dataset.node = r.at.id;
        b.textContent = '?';
        b.setAttribute('aria-label', t('calc_slot'));
        row.append(num(r.at.fen), b);
      }
      el.appendChild(row);
    }
    // The selected chip, or the slot waiting after it, is kept in sight.
    const sel = el.querySelector('.calc-slot.sel') || el.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });

    $('calc-delete').classList.toggle('hidden', done);
    $('calc-hint').classList.toggle('hidden', done);
    $('calc-solution').classList.toggle('hidden', done);
    $('calc-submit').classList.toggle('hidden', done);
    $('calc-next').classList.toggle('hidden', !done);
    $('calc-analyze').classList.toggle('hidden', !done);
    this.paintElo();
    $('calc-delete').disabled = this.tree.current === this.tree.root;
    $('calc-submit').disabled = !this.tree.root.children.length;
  },
};
