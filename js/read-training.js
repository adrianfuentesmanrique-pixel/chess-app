// Read tab — Training mode: which moves on a page get covered, and where.
//
// Imports nothing, so the rule that decides what is hidden runs under plain Node
// (tests/unit/read-training.test.js). js/read.js draws the boxes this returns.
//
// The rule: a move marked "!" or "!!" is covered — the move, its mark and any
// evaluation sign glued to it ("Rd2!+–", "g5+!="). The move NUMBER stays visible
// ("34." then a block), and so does closing punctuation. "!?" and "?!" are not
// covered, nor is prose ("error!").

// Leading brackets/quotes and a move number: "34.", "16...", "(7…", "…".
const NUM = /^[(\[{“"'‘]*(?:\d+\s*(?:\.{1,3}|…))?(?:\.{2,3}|…)?/;
// Figurine books print the piece from a custom font, so the piece comes back as
// an arbitrary character — never match on "N", "B", "R". The square (or
// castling) is plain text in every book, and it is what tells a move from prose.
const SQUARE = /[a-h][1-8]|[O0]-[O0]/;
const TRAIL = /[)\]}.,;:”"'’]/;

// tok is one whitespace-delimited word. Returns the [start, end) character range
// to cover, or null if the word is not a "!" / "!!" move.
export function coverSpan(tok) {
  const start = NUM.exec(tok)[0].length;
  const body = tok.slice(start);
  const sq = SQUARE.exec(body);
  if (!sq) return null;
  const mark = /[!?]+/.exec(body.slice(sq.index));
  if (!mark || (mark[0] !== '!' && mark[0] !== '!!')) return null;
  let end = tok.length;
  while (end > start && TRAIL.test(tok[end - 1])) end--;
  return { start, end };
}

// viewport transform × item transform (both [a, b, c, d, e, f]).
function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// tc: pdf.js getTextContent() result. vp: the page viewport at scale 1.
// measure(text, fontName, fallbackFamily) -> width in any consistent unit; only
// ratios are used. Returns boxes as fractions of the page: { l, t, w, h }.
//
// pdf.js hands text back in chunks that ignore word boundaries: one chunk can
// hold several moves ("f4! g5! 7."), and one move is usually split across two
// (the figurine in its own font, then "f4!"). So the chunks are first laid out
// as one stream of characters, each remembering its chunk, and words are cut
// from that stream.
export function findCovers(tc, vp, measure) {
  const placed = [];
  const chars = [];          // { ch, it, i } — it === null is a word break
  let prev = null, brk = false;
  for (const item of tc.items) {
    if (typeof item.str !== 'string') continue;
    if (!item.str) { if (item.hasEOL) brk = true; continue; }
    const tx = mul(vp.transform, item.transform);
    const fs = Math.hypot(tx[2], tx[3]);
    // Upright text only; a rotated caption is never a move to solve.
    if (!fs || tx[0] <= 0 || Math.abs(tx[1]) > 0.01 * tx[0]) { brk = true; continue; }
    const st = tc.styles[item.fontName] || {};
    const it = { str: item.str, x: tx[4], base: tx[5], w: item.width, fs,
                 font: item.fontName, family: st.fontFamily || 'serif',
                 asc: Math.min(st.ascent || 0.85, 0.85),
                 desc: Math.min(Math.abs(st.descent || 0.25), 0.25) };
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      if (brk || Math.abs(it.base - prev.base) > 0.4 * fs || gap > 0.2 * fs || gap < -0.5 * fs) {
        chars.push({ ch: ' ', it: null, i: 0 });
      }
    }
    brk = !!item.hasEOL;
    for (let i = 0; i < it.str.length; i++) chars.push({ ch: it.str[i], it, i });
    placed.push(it);
    prev = it;
  }

  const frac = (it, i) => {
    if (i <= 0) return 0;
    if (i >= it.str.length) return 1;
    const full = measure(it.str, it.font, it.family);
    return full > 0 ? measure(it.str.slice(0, i), it.font, it.family) / full : i / it.str.length;
  };

  const boxes = [];
  let a = 0;
  while (a < chars.length) {
    if (!chars[a].ch.trim()) { a++; continue; }
    let b = a;
    while (b < chars.length && chars[b].ch.trim()) b++;
    const span = coverSpan(chars.slice(a, b).map(c => c.ch).join(''));
    if (span) {
      let l = Infinity, r = -Infinity, t = Infinity, bot = -Infinity;
      for (let k = a + span.start; k < a + span.end; k++) {
        const { it, i } = chars[k];
        // A hair of padding, so no sliver of a piece or letter shows at the
        // edge. It may touch the dot of the move number; hiding wins over neat.
        const pad = 0.06 * it.fs;
        l = Math.min(l, it.x + frac(it, i) * it.w - pad);
        r = Math.max(r, it.x + frac(it, i + 1) * it.w + pad);
        t = Math.min(t, it.base - it.asc * it.fs);
        bot = Math.max(bot, it.base + it.desc * it.fs);
      }
      boxes.push({ l: l / vp.width, t: t / vp.height, w: (r - l) / vp.width, h: (bot - t) / vp.height });
    }
    a = b;
  }
  return boxes;
}

// Non-space characters on a page — how a scan (none) is told from a text book.
export function textChars(tc) {
  let n = 0;
  for (const item of tc.items) if (typeof item.str === 'string') n += item.str.replace(/\s/g, '').length;
  return n;
}
