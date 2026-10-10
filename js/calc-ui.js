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
// NOT HERE YET (conversations 2 and 3 of the spec's build plan): the engine
// check of side variations (they are drawn grey, "not checked"), the mode's own
// theme / difficulty / auto-next / hint, and its own rating. Puzzles are picked
// around the PUZZLE rating, and nothing is saved.
//
// Imports from js/app.js (cycle): every app.js binding used here is touched
// inside a function only, never at module top level.
import { Chess } from '../vendor/chess.js';
import { t, getLang } from './i18n.js';
import { Board } from './board.js';
import * as db from './db.js';
import { PUZZLES, ensureForRating } from './puzzles.js';
import { blindPick } from './blind-pick.js';
import { blindSanLocal } from './blind-list.js';
import { Sound } from './sound.js';
import { REPLY_MS } from './move-feel.js';
import { calcMainLine, calcNewTree, calcIsMine, calcEnter, calcGrade, calcVerdict, calcAddReply, calcRows } from './calc.js';
import { $, toast, showScreen } from './app.js';

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
  verdict: null,     // 'failed' | 'solved' | 'perfect' once done
  marks: null,       // node id -> 'right' | 'wrong' | 'unchecked' once done
  side: 0,           // how many chips are off the main line, once done
  // Kael's line when it is not the plain instruction: { key, m }. Kept as a
  // key so a change of language repaints it.
  say: null,
  // Done: what the board is showing. An answer node, { line: i } for a move of
  // the puzzle's line, or null for the starting position.
  shown: null,
  token: 0,
  leadTimer: null,

  init() {
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
    $('calc-solution').onclick = () => this.giveUp();
    $('calc-submit').onclick = () => this.submit();
    $('calc-next').onclick = () => this.next();
  },

  open() { showScreen('calc'); },

  // Every way onto the screen comes through here (js/app.js showScreen). A
  // puzzle left half written is still there: nothing in this mode is timed.
  onEnter() {
    if (this.current) this.render();
    else this.next();
  },

  async next() {
    const mine = ++this.token;
    const target = Math.max(600, Math.min(3000, +(await db.kvGet('puzzleElo', 1200)) || 1200));
    try { await ensureForRating(target); } catch { /* play what is already loaded */ }
    if (mine !== this.token) return;
    const list = blindPick(PUZZLES, target, null).list.filter(p => p !== this.current);
    for (let i = 0; i < 20 && list.length; i++) {
      if (this.load(list[Math.floor(Math.random() * list.length)])) return;
    }
    this.say = { key: 'calc_none' };
    this.render();
  },

  // Puts one puzzle up. False when its moves do not play.
  load(puzzle) {
    const main = calcMainLine(puzzle);
    if (!main) return false;
    this.token++;
    clearTimeout(this.leadTimer);
    Object.assign(this, {
      current: puzzle, main, tree: calcNewTree(main), phase: 'write', ready: false,
      handIns: 0, helped: false, verdict: null, marks: null, side: 0, say: null, shown: null,
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

  // ── hand-in ──

  submit() {
    if (this.phase !== 'write' || !this.tree.root.children.length) return;
    this.setPick(null);
    this.handIns++;
    const grade = calcGrade(this.tree, this.main.line);
    const verdict = calcVerdict(grade, { handIns: this.handIns, helped: this.helped });
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
    Object.assign(this, { phase: 'done', verdict, marks: grade.marks, side: grade.side, shown: null });
    if (verdict !== 'failed') this.say = { key: 'calc_' + verdict };
    else if (gaveUp || !grade.wrong) this.say = { key: 'calc_gave_up' };
    else this.say = { key: 'calc_failed', m: grade.wrong };
    Sound.play(verdict === 'failed' ? 'puzzle-wrong' : 'puzzle-correct');
    this.render();
    // The result is read from the top: the puzzle's line, then the first move.
    $('calc-tree').scrollTop = 0;
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
      for (const id of ['calc-delete', 'calc-solution', 'calc-submit']) $(id).classList.add('hidden');
      $('calc-next').classList.toggle('hidden', !this.say);
      return;
    }
    const done = this.phase === 'done';
    let say = this.say ? t(this.say.key).replace('{m}', this.say.m ? this.label(this.say.m) : '') : this.plainSay();
    if (done && this.side) say += ' ' + t('calc_unchecked_note');
    sayEl.textContent = say;
    $('calc-say').className = 'calc-say' + (done ? (this.verdict === 'failed' ? ' bad' : ' good') : '');

    const el = $('calc-tree');
    el.textContent = '';
    const chip = (node, cls = '') => {
      const b = document.createElement('button');
      const sel = done ? this.shown === node : this.tree.current === node;
      b.className = 'calc-chip' + cls + (sel ? ' sel' : '') + (node.kael ? ' kael' : '') +
        (done ? ' ' + (this.marks.get(node.id) || 'unchecked') : '');
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
      if (r.own) row.append(num(r.at.fen), chip(r.own));
      else if (!done) {
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
    $('calc-solution').classList.toggle('hidden', done);
    $('calc-submit').classList.toggle('hidden', done);
    $('calc-next').classList.toggle('hidden', !done);
    $('calc-delete').disabled = this.tree.current === this.tree.root;
    $('calc-submit').disabled = !this.tree.root.children.length;
  },
};
