// Stockfish 17.1 (single-threaded WASM) wrapper.
// Two modes: continuous analysis (onLine callback) and one-shot bestMove.
import { Chess } from '../vendor/chess.js';

const SF_PATH = 'vendor/stockfish-17.1-lite-single-03e3232.js';

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.onLine = null;        // callback: array of {multipv, depth, scoreText, scoreNum, pvSan}
    this.analysing = false;
    this.analysisFen = null;
    // null (not 2) so the very first analyse() call never thinks MultiPV
    // "changed" and triggers a pointless respawn before a worker even exists.
    this.multiPV = null;
    this._bestMoveResolve = null;
    this._readyResolve = null;
    this._lines = [];
  }

  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try { this.worker = new Worker(SF_PATH); } catch (e) { reject(e); return; }
      // onerror must recover, not just reject the (long-since-settled) ready
      // promise — this build's WASM can fault later (e.g. reconfiguring
      // MultiPV on an already-searching worker), and without this, any
      // pending _stopSearch()/isready wait hangs forever on a dead worker.
      this.worker.onerror = (e) => { this._handleCrash(); reject(e); };
      this.worker.onmessage = (e) => this._handle(String(e.data));
      this._uciokResolve = resolve;
      this.worker.postMessage('uci');
    });
    return this.ready;
  }

  _handleCrash() {
    this.ready = null;
    this.worker = null;
    this.analysing = false;
    this.multiPV = null;
    if (this._readyResolve) { this._readyResolve(); this._readyResolve = null; }
    if (this._bestMoveResolve) { const r = this._bestMoveResolve; this._bestMoveResolve = null; r(null); }
  }

  // Fully kill the current worker. Used when reconfiguring MultiPV, since
  // this build can fault internally when MultiPV is changed on a worker
  // that's already been searching — a fresh instance sidesteps that
  // entirely instead of trying to reconfigure a live one.
  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
    this.analysing = false;
    this._readyResolve = null;
    this._bestMoveResolve = null;
    this._uciokResolve = null;
  }

  _send(cmd) { this.worker.postMessage(cmd); }

  _handle(line) {
    if (line === 'uciok') {
      this._send('setoption name Threads value 1');
      this._send('isready');
      return;
    }
    if (line === 'readyok') {
      if (this._uciokResolve) { this._uciokResolve(); this._uciokResolve = null; }
      if (this._readyResolve) { this._readyResolve(); this._readyResolve = null; }
      return;
    }
    if (line.startsWith('info ') && line.includes(' pv ')) {
      this._parseInfo(line);
      if (this._evalCapture) this._evalCapture(line);
      return;
    }
    if (line.startsWith('bestmove')) {
      const mv = line.split(' ')[1];
      if (this._bestMoveResolve) { const r = this._bestMoveResolve; this._bestMoveResolve = null; r(mv === '(none)' ? null : mv); }
      return;
    }
  }

  _parseInfo(line) {
    if (!this.analysing || !this.onLine) return;
    const depth = intAfter(line, 'depth');
    const multipv = intAfter(line, 'multipv') || 1;
    if (depth === null || depth < 6) return;
    let scoreNum = 0, scoreText = '';
    const mMate = line.match(/score mate (-?\d+)/);
    const mCp = line.match(/score cp (-?\d+)/);
    const whiteToMove = this.analysisFen.split(' ')[1] === 'w';
    if (mMate) {
      let n = +mMate[1];
      if (!whiteToMove) n = -n;
      scoreNum = n > 0 ? 10000 - Math.abs(n) : -10000 + Math.abs(n);
      scoreText = (n > 0 ? '+M' : '-M') + Math.abs(n);
    } else if (mCp) {
      let cp = +mCp[1];
      if (!whiteToMove) cp = -cp;
      scoreNum = cp;
      scoreText = (cp >= 0 ? '+' : '−') + (Math.abs(cp) / 100).toFixed(2);
    } else return;
    const pvUci = line.split(' pv ')[1].trim().split(/\s+/).slice(0, 10);
    const pvSan = uciLineToSan(this.analysisFen, pvUci);
    this._lines[multipv - 1] = { multipv, depth, scoreText, scoreNum, pvSan, firstUci: pvUci[0] };
    this.onLine(this._lines.filter(Boolean));
  }

  // Continuous analysis of a position.
  async analyse(fen, multiPV = 2) {
    if (this.multiPV !== null && this.multiPV !== multiPV) this.terminate();
    await this.init();
    await this._stopSearch();
    this.analysing = true;
    this.analysisFen = fen;
    this.multiPV = multiPV;
    this._lines = [];
    this._send('setoption name UCI_LimitStrength value false');
    this._send('setoption name Skill Level value 20');
    this._send(`setoption name MultiPV value ${multiPV}`);
    this._send(`position fen ${fen}`);
    this._send('go infinite');
  }

  async stop() {
    this.analysing = false;
    await this._stopSearch();
  }

  _stopSearch() {
    return new Promise(resolve => {
      if (!this.worker) { resolve(); return; }
      // 'stop' makes an in-progress search emit its bestmove; isready/readyok
      // is only exchanged once the engine has fully processed everything
      // queued before it (UCI guarantees command ordering), so this is a
      // reliable way to know the engine is idle and ready for new commands —
      // unlike guessing with a fixed timeout, which can race an in-flight search.
      this._readyResolve = resolve;
      this._send('stop');
      this._send('isready');
    });
  }

  // One-shot: centipawn evaluation of a position, from White's perspective
  // (mate scores are folded into a large finite number, same convention as
  // the live analysis scores). Used to grade played moves after the fact.
  async evaluate(fen, movetime = 250) {
    // A position with no legal moves has nothing for "go" to search — Stockfish
    // just replies bestmove (none) without ever sending a score line, so the
    // caller would silently get 0 back for what might be a decisive checkmate.
    // Resolve those directly instead of asking the engine.
    try {
      const c = new Chess(fen);
      if (c.isCheckmate()) {
        // side to move is the one who got mated, so the mover of the last
        // move (the other color) delivered it — a maximal score in their favor.
        return c.turn() === 'w' ? -9999 : 9999;
      }
      if (c.isDraw() || c.isStalemate()) return 0;
    } catch { /* fall through to engine search for anything unparsable */ }
    if (this.multiPV !== null && this.multiPV !== 1) this.terminate();
    await this.init();
    await this._stopSearch();
    this.analysing = false;
    const whiteToMove = fen.split(' ')[1] === 'w';
    let lastScore = 0;
    this._evalCapture = (line) => {
      const mMate = line.match(/score mate (-?\d+)/);
      const mCp = line.match(/score cp (-?\d+)/);
      if (mMate) {
        let n = +mMate[1];
        if (!whiteToMove) n = -n;
        lastScore = n > 0 ? 10000 - Math.abs(n) : -10000 + Math.abs(n);
      } else if (mCp) {
        let cp = +mCp[1];
        if (!whiteToMove) cp = -cp;
        lastScore = cp;
      }
    };
    this.multiPV = 1;
    this._send('setoption name MultiPV value 1');
    this._send('setoption name UCI_LimitStrength value false');
    this._send(`position fen ${fen}`);
    return new Promise(resolve => {
      this._bestMoveResolve = () => { this._evalCapture = null; resolve(lastScore); };
      this._send(`go movetime ${movetime}`);
    });
  }

  // One-shot: best move at a given strength. elo null = full strength.
  async bestMove(fen, { movetime = 1000, elo = null } = {}) {
    if (this.multiPV !== null && this.multiPV !== 1) this.terminate();
    await this.init();
    await this._stopSearch();
    this.analysing = false;
    this.multiPV = 1;
    this._send('setoption name MultiPV value 1');
    if (elo) {
      this._send('setoption name UCI_LimitStrength value true');
      this._send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
    } else {
      this._send('setoption name UCI_LimitStrength value false');
    }
    this._send(`position fen ${fen}`);
    return new Promise(resolve => {
      this._bestMoveResolve = resolve;
      this._send(`go movetime ${movetime}`);
    });
  }
}

function intAfter(line, key) {
  const m = line.match(new RegExp(` ${key} (\\d+)`));
  return m ? +m[1] : null;
}

export function uciLineToSan(fen, uciMoves) {
  const chess = new Chess(fen);
  const out = [];
  for (const u of uciMoves) {
    try {
      const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(mv.san);
    } catch { break; }
  }
  return out;
}

export function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] };
}

// Format a PV with move numbers: "12.Nf3 d5 13.e4"
export function pvWithNumbers(fen, sanMoves) {
  const parts = fen.split(' ');
  let num = parseInt(parts[5], 10);
  let white = parts[1] === 'w';
  const out = [];
  sanMoves.forEach((san, i) => {
    if (white) out.push(`${num}.${san}`);
    else { out.push(i === 0 ? `${num}…${san}` : san); num++; }
    white = !white;
  });
  return out.join(' ');
}
