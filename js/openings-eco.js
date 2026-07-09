// Compact opening classifier: a curated list of well-known openings and
// their main named variations, matched against played SAN moves by longest
// prefix. Not exhaustive ECO coverage — deep enough to recognize the
// openings players actually study, shallow enough to keep in one file.
// Order doesn't matter; classifyOpening() always finds the longest match.

export const OPENINGS_ECO = [
  // ── King's Pawn: open games ──────────────────────────
  { moves: ['e4'], name: 'King\'s Pawn Opening' },
  { moves: ['e4','e5'], name: 'Open Game' },
  { moves: ['e4','e5','Nf3'], name: 'King\'s Knight Opening' },
  { moves: ['e4','e5','Nf3','Nc6'], name: 'King\'s Knight Opening' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5'], name: 'Ruy Lopez' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6'], name: 'Ruy Lopez, Morphy Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4'], name: 'Ruy Lopez, Morphy Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6'], name: 'Ruy Lopez, Closed' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O'], name: 'Ruy Lopez, Closed' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7'], name: 'Ruy Lopez, Closed' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','a6','Bxc6'], name: 'Ruy Lopez, Exchange Variation' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','Nf6'], name: 'Ruy Lopez, Berlin Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','Nf6','O-O','Nxe4'], name: 'Ruy Lopez, Berlin Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','f5'], name: 'Ruy Lopez, Schliemann Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','g6'], name: 'Ruy Lopez, Smyslov Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','d6'], name: 'Ruy Lopez, Steinitz Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4'], name: 'Italian Game' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5'], name: 'Italian Game, Giuoco Piano' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3'], name: 'Italian Game, Giuoco Piano' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Bc5','b4'], name: 'Italian Game, Evans Gambit' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6'], name: 'Italian Game, Two Knights Defense' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6','Ng5'], name: 'Two Knights Defense, Fried Liver Attack' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6','d3'], name: 'Italian Game, Giuoco Pianissimo' },
  { moves: ['e4','e5','Nf3','Nc6','d4'], name: 'Scotch Game' },
  { moves: ['e4','e5','Nf3','Nc6','d4','exd4'], name: 'Scotch Game' },
  { moves: ['e4','e5','Nf3','Nc6','d4','exd4','Nxd4'], name: 'Scotch Game' },
  { moves: ['e4','e5','Nf3','Nc6','Nc3'], name: 'Three Knights Opening' },
  { moves: ['e4','e5','Nf3','Nc6','Bb5','Nge7'], name: 'Ruy Lopez, Cozio Defense' },
  { moves: ['e4','e5','Nc3'], name: 'Vienna Game' },
  { moves: ['e4','e5','Nc3','Nf6'], name: 'Vienna Game' },
  { moves: ['e4','e5','Nc3','Nc6','f4'], name: 'Vienna Gambit' },
  { moves: ['e4','e5','Bc4'], name: 'Bishop\'s Opening' },
  { moves: ['e4','e5','f4'], name: 'King\'s Gambit' },
  { moves: ['e4','e5','f4','exf4'], name: 'King\'s Gambit Accepted' },
  { moves: ['e4','e5','f4','Bc5'], name: 'King\'s Gambit Declined, Classical' },
  { moves: ['e4','e5','Nf3','Nf6'], name: 'Petrov\'s Defense' },
  { moves: ['e4','e5','Nf3','Nf6','Nxe5'], name: 'Petrov\'s Defense' },
  { moves: ['e4','e5','Nf3','f5'], name: 'Latvian Gambit' },
  { moves: ['e4','e5','Nf3','d6'], name: 'Philidor Defense' },

  // ── Sicilian Defense ──────────────────────────────────
  { moves: ['e4','c5'], name: 'Sicilian Defense' },
  { moves: ['e4','c5','Nf3'], name: 'Sicilian Defense' },
  { moves: ['e4','c5','Nf3','d6'], name: 'Sicilian Defense' },
  { moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3'], name: 'Sicilian, Najdorf-type (Open)' },
  { moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'], name: 'Sicilian Defense, Najdorf Variation' },
  { moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','g6'], name: 'Sicilian Defense, Dragon Variation' },
  { moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','e6'], name: 'Sicilian Defense, Scheveningen Variation' },
  { moves: ['e4','c5','Nf3','Nc6'], name: 'Sicilian Defense' },
  { moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','Nf6','Nc3','e5'], name: 'Sicilian Defense, Sveshnikov Variation' },
  { moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','g6'], name: 'Sicilian Defense, Accelerated Dragon' },
  { moves: ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','e6','Nc3','Qc7'], name: 'Sicilian Defense, Taimanov Variation' },
  { moves: ['e4','c5','Nf3','e6'], name: 'Sicilian Defense, Kan/Taimanov setups' },
  { moves: ['e4','c5','Nf3','e6','d4','cxd4','Nxd4','a6'], name: 'Sicilian Defense, Kan Variation' },
  { moves: ['e4','c5','Nc3'], name: 'Sicilian Defense, Closed' },
  { moves: ['e4','c5','Nf3','Nc6','Bb5'], name: 'Sicilian Defense, Rossolimo Variation' },
  { moves: ['e4','c5','Nf3','d6','Bb5+'], name: 'Sicilian Defense, Moscow Variation' },
  { moves: ['e4','c5','c3'], name: 'Sicilian Defense, Alapin Variation' },
  { moves: ['e4','c5','b4'], name: 'Sicilian Defense, Wing Gambit' },
  { moves: ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','Qb6'], name: 'Sicilian Defense, Najdorf, Poisoned Pawn' },

  // ── Other e4 defenses ─────────────────────────────────
  { moves: ['e4','e6'], name: 'French Defense' },
  { moves: ['e4','e6','d4','d5'], name: 'French Defense' },
  { moves: ['e4','e6','d4','d5','Nc3'], name: 'French Defense, Classical/Winawer' },
  { moves: ['e4','e6','d4','d5','Nc3','Bb4'], name: 'French Defense, Winawer Variation' },
  { moves: ['e4','e6','d4','d5','Nc3','Nf6'], name: 'French Defense, Classical Variation' },
  { moves: ['e4','e6','d4','d5','Nd2'], name: 'French Defense, Tarrasch Variation' },
  { moves: ['e4','e6','d4','d5','e5'], name: 'French Defense, Advance Variation' },
  { moves: ['e4','e6','d4','d5','exd5'], name: 'French Defense, Exchange Variation' },
  { moves: ['e4','c6'], name: 'Caro-Kann Defense' },
  { moves: ['e4','c6','d4','d5'], name: 'Caro-Kann Defense' },
  { moves: ['e4','c6','d4','d5','Nc3'], name: 'Caro-Kann Defense, Classical/Main Line' },
  { moves: ['e4','c6','d4','d5','Nc3','dxe4','Nxe4'], name: 'Caro-Kann Defense, Classical Variation' },
  { moves: ['e4','c6','d4','d5','Nd2'], name: 'Caro-Kann Defense, Karpov Variation' },
  { moves: ['e4','c6','d4','d5','e5'], name: 'Caro-Kann Defense, Advance Variation' },
  { moves: ['e4','c6','d4','d5','exd5'], name: 'Caro-Kann Defense, Exchange Variation' },
  { moves: ['e4','d5'], name: 'Scandinavian Defense' },
  { moves: ['e4','d5','exd5','Qxd5'], name: 'Scandinavian Defense, Main Line' },
  { moves: ['e4','d5','exd5','Nf6'], name: 'Scandinavian Defense, Modern Variation' },
  { moves: ['e4','d6'], name: 'Pirc Defense' },
  { moves: ['e4','d6','d4','Nf6','Nc3','g6'], name: 'Pirc Defense' },
  { moves: ['e4','g6'], name: 'Modern Defense' },
  { moves: ['e4','Nf6'], name: 'Alekhine\'s Defense' },
  { moves: ['e4','Nf6','e5','Nd5'], name: 'Alekhine\'s Defense' },
  { moves: ['e4','Nc6'], name: 'Nimzowitsch Defense' },
  { moves: ['e4','b6'], name: 'Owen Defense' },
  { moves: ['e4','a6'], name: 'St. George Defense' },

  // ── Queen's Pawn openings ─────────────────────────────
  { moves: ['d4'], name: 'Queen\'s Pawn Opening' },
  { moves: ['d4','d5'], name: 'Closed Game' },
  { moves: ['d4','d5','c4'], name: 'Queen\'s Gambit' },
  { moves: ['d4','d5','c4','dxc4'], name: 'Queen\'s Gambit Accepted' },
  { moves: ['d4','d5','c4','e6'], name: 'Queen\'s Gambit Declined' },
  { moves: ['d4','d5','c4','e6','Nc3','Nf6','Bg5'], name: 'Queen\'s Gambit Declined, Classical' },
  { moves: ['d4','d5','c4','e6','Nc3','Bb4'], name: 'Queen\'s Gambit Declined, Ragozin Defense' },
  { moves: ['d4','d5','c4','e6','Nc3','c5'], name: 'Queen\'s Gambit Declined, Tarrasch Defense' },
  { moves: ['d4','d5','c4','c6'], name: 'Slav Defense' },
  { moves: ['d4','d5','c4','c6','Nf3','Nf6','Nc3','e6'], name: 'Semi-Slav Defense' },
  { moves: ['d4','d5','c4','c6','Nf3','Nf6','Nc3','dxc4'], name: 'Slav Defense, Main Line' },
  { moves: ['d4','d5','c4','dxc4','Nf3','Nf6','e3'], name: 'Queen\'s Gambit Accepted, Main Line' },
  { moves: ['d4','d5','Nf3'], name: 'Queen\'s Pawn Game' },
  { moves: ['d4','d5','Bf4'], name: 'London System' },
  { moves: ['d4','Nf6','Nf3','d5','Bf4'], name: 'London System' },
  { moves: ['d4','d5','Nc3'], name: 'Veresov Opening' },
  { moves: ['d4','Nf6'], name: 'Indian Defense' },
  { moves: ['d4','Nf6','c4'], name: 'Indian Defense' },
  { moves: ['d4','Nf6','c4','e6'], name: 'Indian Defense' },
  { moves: ['d4','Nf6','c4','e6','Nc3','Bb4'], name: 'Nimzo-Indian Defense' },
  { moves: ['d4','Nf6','c4','e6','Nf3','b6'], name: 'Queen\'s Indian Defense' },
  { moves: ['d4','Nf6','c4','e6','Nc3','Bb4','e3'], name: 'Nimzo-Indian Defense, Rubinstein Variation' },
  { moves: ['d4','Nf6','c4','e6','Nc3','Bb4','Qc2'], name: 'Nimzo-Indian Defense, Classical Variation' },
  { moves: ['d4','Nf6','c4','g6'], name: 'King\'s Indian / Grünfeld setup' },
  { moves: ['d4','Nf6','c4','g6','Nc3','Bg7','e4'], name: 'King\'s Indian Defense' },
  { moves: ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6'], name: 'King\'s Indian Defense, Classical' },
  { moves: ['d4','Nf6','c4','g6','Nc3','d5'], name: 'Grünfeld Defense' },
  { moves: ['d4','Nf6','c4','g6','Nc3','d5','cxd5','Nxd5','e4'], name: 'Grünfeld Defense, Exchange Variation' },
  { moves: ['d4','Nf6','c4','c5'], name: 'Benoni Defense' },
  { moves: ['d4','Nf6','c4','c5','d5','e6'], name: 'Benoni Defense, Modern' },
  { moves: ['d4','Nf6','c4','e5'], name: 'Budapest Gambit' },
  { moves: ['d4','Nf6','c4','e6','g3'], name: 'Catalan Opening' },
  { moves: ['d4','Nf6','Nf3','g6'], name: 'King\'s Indian / Grünfeld (delayed c4)' },
  { moves: ['d4','f5'], name: 'Dutch Defense' },
  { moves: ['d4','f5','g3'], name: 'Dutch Defense, Leningrad setup' },
  { moves: ['d4','f5','c4','Nf6','g3'], name: 'Dutch Defense' },
  { moves: ['d4','e6'], name: 'Queen\'s Pawn, French-type setup' },
  { moves: ['d4','c5'], name: 'Queen\'s Pawn, Old Benoni' },
  { moves: ['d4','g6'], name: 'Queen\'s Pawn, Modern setup' },
  { moves: ['d4','d6'], name: 'Queen\'s Pawn, Pirc-type setup' },

  // ── Flank openings ────────────────────────────────────
  { moves: ['c4'], name: 'English Opening' },
  { moves: ['c4','e5'], name: 'English Opening, Reversed Sicilian' },
  { moves: ['c4','c5'], name: 'English Opening, Symmetrical Variation' },
  { moves: ['c4','Nf6'], name: 'English Opening' },
  { moves: ['c4','e6'], name: 'English Opening' },
  { moves: ['c4','c6'], name: 'English Opening, Caro-Kann Defense setup' },
  { moves: ['Nf3'], name: 'Réti Opening' },
  { moves: ['Nf3','d5'], name: 'Réti Opening' },
  { moves: ['Nf3','Nf6'], name: 'Réti Opening' },
  { moves: ['g3'], name: 'King\'s Fianchetto Opening' },
  { moves: ['b3'], name: 'Nimzo-Larsen Attack' },
  { moves: ['f4'], name: 'Bird\'s Opening' },
  { moves: ['b4'], name: 'Polish Opening (Sokolsky)' },
  { moves: ['Nc3'], name: 'Van Geet Opening' },
  { moves: ['g4'], name: 'Grob\'s Attack' },
  { moves: ['c3'], name: 'Saragossa Opening' },
];

// Normalizes a SAN move for matching (strips check/mate markers, keeps
// castling/promotion notation as-is since chess.js already normalizes those).
function normSan(san) {
  return san.replace(/[+#]$/, '');
}

// Finds the longest OPENINGS_ECO entry whose move sequence is a prefix of
// the given SAN history. Returns null if nothing matches (i.e. the very
// first move isn't a recognized opening move — practically never happens
// for legal first moves, but kept for safety) or the position has gone far
// past known theory with no closer match available.
export function classifyOpening(sanHistory) {
  const normalized = sanHistory.map(normSan);
  let best = null;
  for (const entry of OPENINGS_ECO) {
    if (entry.moves.length > normalized.length) continue;
    let ok = true;
    for (let i = 0; i < entry.moves.length; i++) {
      if (entry.moves[i] !== normalized[i]) { ok = false; break; }
    }
    if (ok && (!best || entry.moves.length > best.moves.length)) best = entry;
  }
  return best ? best.name : null;
}
