// Blindfold "List" mode: the position written out instead of shown.
// Imports nothing, so it runs under plain Node (tests/unit/blind-list.test.js)
// as well as in the app.
//
//   White: Kg1, Qd3, Ra1, Rf1, Bc3, Nf3, a2, b2, c2
//   Black: Kg8, a6, b7, c5
//
// King, queen, rooks, bishops, knights, then the pawns as bare squares. Inside
// one kind the squares run a→h, then by rank. Letters follow the app language.

const LETTERS = {
  en: { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: '' },
  es: { k: 'R', q: 'D', r: 'T', b: 'A', n: 'C', p: '' },
};
const ORDER = 'kqrbnp';
const lettersFor = lang => LETTERS[lang] || LETTERS.en;

// { w: ['Kg1', 'Qd3', …, 'a2'], b: [...] } for the board part of a FEN.
export function blindPieceList(fen, lang) {
  const letters = lettersFor(lang);
  const found = { w: [], b: [] };
  String(fen).split(' ')[0].split('/').forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
      const kind = ch.toLowerCase();
      found[ch === kind ? 'b' : 'w'].push({ kind, file, rank: 8 - r });
      file++;
    }
  });
  const write = list => list
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.file - b.file || a.rank - b.rank)
    .map(p => letters[p.kind] + 'abcdefgh'[p.file] + p.rank);
  return { w: write(found.w), b: write(found.b) };
}

// A move as chess.js writes it (English letters) in the app language:
// "Rxe5" → "Txe5". Castling and pawn moves have no piece letter to change.
export function blindSanLocal(san, lang) {
  const letters = lettersFor(lang);
  return String(san).replace(/[KQRBN]/g, ch => letters[ch.toLowerCase()]);
}
