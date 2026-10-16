// Learn tab stages — the data. Rules of each goal: js/stages.js. Plan:
// docs/plans/2026-10-15-learn-stages.md. Our own positions and words.
//
// A level: { fen, goal, solution (uci), how?, say? }. White always moves.
// tests/unit/stages.test.js plays every solution, so a level that is illegal
// or unsolvable fails the tests. `say` is what Kael adds once it is solved.

export const STAGE_SECTIONS = [
  {
    id: 'fundamentals',
    title: { es: 'Fundamentos', en: 'Fundamentals' },
    blurb: { es: 'Jaque, salir del jaque, mate en uno…', en: 'Check, getting out of check, mate in one…' },
    stages: [
      {
        id: 'check',
        title: { es: 'Jaque', en: 'Check' },
        intro: {
          es: 'Dar jaque es atacar al rey. El rival está obligado a responder: no puede ignorarlo. En cada nivel, busca una jugada que ataque al rey negro.',
          en: 'Giving check means attacking the king. Your opponent must answer it: a check can never be ignored. In each level, find a move that attacks the black king.',
        },
        goalText: { es: 'Da jaque al rey negro', en: 'Give check to the black king' },
        levels: [
          { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', goal: 'check', solution: 'a1a8' },
          { fen: '4k3/8/8/8/8/8/8/4KB2 w - - 0 1', goal: 'check', solution: 'f1b5' },
          { fen: '3k4/8/8/8/8/8/8/4K2Q w - - 0 1', goal: 'check', solution: 'h1h4' },
          { fen: '4k3/8/8/8/4N3/8/8/4K3 w - - 0 1', goal: 'check', solution: 'e4f6',
            say: { es: 'El caballo da jaque saltando: nada se puede poner en medio.', en: 'The knight checks by jumping: nothing can be put in the way.' } },
          { fen: '8/8/8/3k4/8/4P3/8/4K3 w - - 0 1', goal: 'check', solution: 'e3e4',
            say: { es: 'Hasta un peón da jaque: ataca en diagonal hacia adelante.', en: 'Even a pawn gives check: it attacks diagonally forward.' } },
          { fen: 'r3k3/ppp5/8/8/8/8/PPP5/2KR4 w - - 0 1', goal: 'check', solution: 'd1e1',
            say: { es: 'Torre d8 también es jaque, pero el rey se la come. El mejor jaque es el que no regala nada.', en: 'Rook d8 is check too, but the king just takes it. The best check gives nothing away.' } },
        ],
      },
      {
        id: 'out_of_check',
        title: { es: 'Salir del jaque', en: 'Out of check' },
        intro: {
          es: 'Cuando te dan jaque hay tres salidas: mover el rey, comer la pieza que da jaque, o poner una pieza en medio. Cada nivel te pide una de las tres.',
          en: 'When you are in check there are three ways out: move the king, capture the checking piece, or put a piece in between. Each level asks for one of the three.',
        },
        goalText: { es: 'Sal del jaque', en: 'Get out of check' },
        levels: [
          { fen: '4k3/8/8/8/8/1B6/8/r3K3 w - - 0 1', goal: 'escape', how: 'king', solution: 'e1e2' },
          { fen: '6k1/8/8/8/7q/8/R7/7K w - - 0 1', goal: 'escape', how: 'king', solution: 'h1g1' },
          { fen: '4k3/8/8/4r3/8/2B5/8/4K3 w - - 0 1', goal: 'escape', how: 'capture', solution: 'c3e5',
            say: { es: 'Comer la pieza que da jaque: el problema desaparece y además ganas material.', en: 'Capture the checking piece: the problem is gone and you win material too.' } },
          { fen: '4k3/8/8/8/8/5n2/4P3/4K3 w - - 0 1', goal: 'escape', how: 'capture', solution: 'e2f3' },
          { fen: '4k3/8/8/8/8/8/4B3/r3K3 w - - 0 1', goal: 'escape', how: 'block', solution: 'e2d1' },
          { fen: '4k3/8/8/8/1b6/8/2P5/1N2K3 w - - 0 1', goal: 'escape', how: 'block', solution: 'c2c3',
            say: { es: 'Contra un jaque de caballo no se puede tapar: solo funciona con alfil, torre o dama.', en: 'A knight check cannot be blocked: blocking only works against a bishop, rook or queen.' } },
        ],
      },
      {
        id: 'mate_in_one',
        title: { es: 'Mate en uno', en: 'Mate in one' },
        intro: {
          es: 'Jaque mate es un jaque del que no hay salida: el rey no puede moverse, nadie puede comer al atacante y nada puede ponerse en medio. Gana la partida. En cada nivel hay un mate escondido.',
          en: 'Checkmate is a check with no way out: the king cannot move, nobody can capture the attacker and nothing can block. It wins the game. Every level hides one.',
        },
        goalText: { es: 'Da jaque mate en una jugada', en: 'Checkmate in one move' },
        levels: [
          { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', goal: 'mate', solution: 'd1d8',
            say: { es: 'Mate del pasillo: sus propios peones le cierran la salida.', en: 'Back-rank mate: its own pawns lock the king in.' } },
          { fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', goal: 'mate', solution: 'h2h8' },
          { fen: '7k/Q7/6K1/8/8/8/8/8 w - - 0 1', goal: 'mate', solution: 'a7g7',
            say: { es: 'La dama pegada al rey, protegida por tu rey: no la puede comer.', en: 'The queen right next to the king, guarded by your king: it cannot be taken.' } },
          { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', goal: 'mate', solution: 'g5f7',
            say: { es: 'Mate ahogado: el rey está rodeado por sus propias piezas.', en: 'Smothered mate: the king is boxed in by its own pieces.' } },
          { fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', goal: 'mate', solution: 'b1b8' },
          { fen: '6k1/5p1p/6p1/8/8/2B5/8/3Q2K1 w - - 0 1', goal: 'mate', solution: 'd1d8',
            say: { es: 'El alfil vigila g7 desde lejos: el rey no tiene casilla.', en: 'The bishop guards g7 from afar: the king has no square.' } },
          { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', goal: 'mate', solution: 'h5f7',
            say: { es: 'El mate del pastor: f7 solo lo defendía el rey.', en: "Scholar's mate: only the king defended f7." } },
          { fen: 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq g6 0 3', goal: 'mate', solution: 'd1h5',
            say: { es: 'Mover los peones de delante del rey en la apertura abre la puerta al mate.', en: 'Moving the pawns in front of your king early opens the door to mate.' } },
        ],
      },
    ],
  },
];
