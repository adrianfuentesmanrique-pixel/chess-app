// Makes the five board sounds by code: move, capture, check, castle, promote.
// Dev tool, not shipped. Nothing is recorded or downloaded, so the files carry
// no third-party licence — they are this project's own work.
//
//   node tools/make-sounds.mjs            writes sounds/<name>.wav
//
// The same numbers always give the same files (the noise is seeded), so a
// sound can be retuned here and re-made. Mono, 16-bit, 44.1 kHz.
//
// A knock is built the way a struck piece of wood behaves: a few milliseconds
// of filtered noise for the contact, then a handful of resonances that each
// ring at their own pitch and die at their own speed — the high ones first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 44100;

function rng(seed) {   // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1;
  };
}

// Adds one knock into `buf` at `at` seconds.
//   pitch  scales every resonance (1 = a felted piece on a wooden board)
//   hard   0..1: how much contact click and high ring — a capture is harder
//   gain   overall level
function knock(buf, at, { pitch = 1, hard = 0.5, gain = 1, seed = 1 } = {}) {
  const start = Math.round(at * RATE);
  const rand = rng(seed);
  // [frequency Hz, decay seconds, level] — the body of the board first, then
  // the wood of the piece, each higher one shorter and quieter.
  const modes = [
    [155, 0.034, 0.90],
    [410, 0.024, 0.75],
    [930, 0.015, 0.42 + 0.25 * hard],
    [1720, 0.009, 0.22 + 0.30 * hard],
    [2950, 0.005, 0.08 + 0.28 * hard],
  ];
  const n = Math.round(0.2 * RATE);
  let lp = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    let s = 0;
    for (const [f, d, a] of modes) s += a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f * pitch * t);
    // the contact: noise through a one-pole low-pass, gone in ~4 ms
    lp += (0.35 + 0.4 * hard) * (rand() - lp);
    s += (0.5 + 0.9 * hard) * lp * Math.exp(-t / (0.0022 + 0.0012 * hard));
    // half a millisecond of attack so the first sample is not a click
    buf[start + i] += gain * s * Math.min(1, t / 0.0005);
  }
}

// Adds one soft struck tone — the "ting" that marks a check or a promotion.
function ting(buf, at, freq, { decay = 0.09, gain = 0.25 } = {}) {
  const start = Math.round(at * RATE);
  const n = Math.round(decay * 6 * RATE);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.003);
    buf[start + i] += gain * env * (Math.sin(2 * Math.PI * freq * t) + 0.22 * Math.sin(2 * Math.PI * freq * 2.01 * t) * Math.exp(-t / (decay * 0.4)));
  }
}

const SOUNDS = {
  // one piece put down
  move(buf) { knock(buf, 0.004, { pitch: 1, hard: 0.35, seed: 11 }); },
  // the taken piece is knocked, then the taker lands harder
  capture(buf) {
    knock(buf, 0.004, { pitch: 1.32, hard: 0.9, gain: 0.55, seed: 23 });
    knock(buf, 0.034, { pitch: 0.94, hard: 0.75, gain: 1, seed: 29 });
  },
  // king, then rook
  castle(buf) {
    knock(buf, 0.004, { pitch: 1, hard: 0.35, seed: 31 });
    knock(buf, 0.118, { pitch: 1.1, hard: 0.45, gain: 0.9, seed: 37 });
  },
  // a firm knock and one clear note over it
  check(buf) {
    knock(buf, 0.004, { pitch: 1.05, hard: 0.6, seed: 41 });
    ting(buf, 0.012, 1245, { decay: 0.075, gain: 0.30 });
  },
  // a knock, then two soft notes going up
  promote(buf) {
    knock(buf, 0.004, { pitch: 1, hard: 0.4, seed: 43 });
    ting(buf, 0.050, 784, { decay: 0.07, gain: 0.22 });
    ting(buf, 0.140, 1175, { decay: 0.065, gain: 0.24 });
  },
};
const SECONDS = { move: 0.14, capture: 0.18, castle: 0.26, check: 0.30, promote: 0.40 };
// Peak level of each file: a quiet move, a capture that is plainly louder.
const PEAK = { move: 0.72, capture: 0.92, castle: 0.72, check: 0.85, promote: 0.80 };

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

for (const [name, make] of Object.entries(SOUNDS)) {
  const buf = new Float64Array(Math.round(SECONDS[name] * RATE));
  make(buf);
  let peak = 0;
  for (const s of buf) peak = Math.max(peak, Math.abs(s));
  const fade = Math.round(0.012 * RATE);   // the tail is taken to exact silence
  for (let i = 0; i < buf.length; i++) {
    buf[i] *= PEAK[name] / peak;
    if (i >= buf.length - fade) buf[i] *= (buf.length - i) / fade;
  }
  const file = path.join(ROOT, 'sounds', name + '.wav');
  fs.writeFileSync(file, wav(buf));
  console.log(`${name}.wav  ${fs.statSync(file).size} bytes  ${SECONDS[name]} s`);
}
