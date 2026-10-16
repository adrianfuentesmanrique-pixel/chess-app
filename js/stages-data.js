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
      {
        id: 'stalemate',
        title: { es: 'Ahogado', en: 'Stalemate' },
        intro: {
          es: 'Ahogado es cuando el rival no tiene ninguna jugada legal y su rey NO está en jaque. No es victoria: la partida queda en tablas. Aquí vas a provocarlo a propósito, para aprender a verlo venir y no regalar medio punto cuando vas ganando.',
          en: 'Stalemate is when your opponent has no legal move and their king is NOT in check. It is not a win: the game is a draw. Here you will cause it on purpose, so you learn to see it coming and never throw away a won game.',
        },
        goalText: { es: 'Deja al rey negro ahogado', en: 'Stalemate the black king' },
        levels: [
          { fen: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', goal: 'stalemate', solution: 'c1c7',
            say: { es: 'Sin jaque y sin casillas: ahogado. Con Dc8 habría sido mate.', en: 'No check and no squares: stalemate. Qc8 would have been mate.' } },
          { fen: '7k/5K2/8/6P1/8/8/8/8 w - - 0 1', goal: 'stalemate', solution: 'g5g6' },
          { fen: '8/R7/8/8/8/8/8/5K1k w - - 0 1', goal: 'stalemate', solution: 'a7a2',
            say: { es: 'La torre cierra la segunda fila y el rey blanco el resto.', en: 'The rook shuts the second rank and the white king does the rest.' } },
          { fen: 'k7/P7/8/2K5/8/8/8/8 w - - 0 1', goal: 'stalemate', solution: 'c5b6',
            say: { es: 'Con un peón de torre es muy fácil ahogar sin querer. ¡Cuidado en tus finales!', en: 'With a rook pawn it is very easy to stalemate by accident. Watch out in your endings!' } },
          { fen: '7k/7p/7P/8/8/3Q4/8/K7 w - - 0 1', goal: 'stalemate', solution: 'd3g3',
            say: { es: 'Dd8 era mate. Con dama, antes de mover, cuenta las jugadas que le quedan al rival.', en: 'Qd8 was mate. With a queen, count your opponent\'s moves before you play.' } },
        ],
      },
      {
        id: 'piece_value',
        title: { es: 'Valor de las piezas', en: 'Piece values' },
        intro: {
          es: 'No todas las piezas valen lo mismo. Peón 1, caballo 3, alfil 3, torre 5, dama 9. El rey no tiene precio: si lo pierdes, pierdes la partida. En cada nivel puedes comer varias piezas: elige la que más vale.',
          en: 'Not all pieces are worth the same. Pawn 1, knight 3, bishop 3, rook 5, queen 9. The king is priceless: lose it and you lose the game. In each level you can take several pieces: pick the most valuable one.',
        },
        goalText: { es: 'Come la pieza que más vale', en: 'Take the most valuable piece' },
        levels: [
          { fen: '7k/3q1p2/2n5/4N3/8/8/8/6K1 w - - 0 1', goal: 'best', solution: 'e5d7',
            say: { es: 'Dama 9, caballo 3, peón 1: la dama, sin duda.', en: 'Queen 9, knight 3, pawn 1: the queen, easily.' } },
          { fen: '6k1/8/8/3q1r2/4P3/8/8/6K1 w - - 0 1', goal: 'best', solution: 'e4d5',
            say: { es: 'Un peón que vale 1 se come una dama que vale 9. ¡Gran negocio!', en: 'A pawn worth 1 takes a queen worth 9. What a deal!' } },
          { fen: '7k/r7/5n2/8/3B4/8/1p6/6K1 w - - 0 1', goal: 'best', solution: 'd4a7' },
          { fen: '7k/8/3r4/8/6b1/1n6/8/3Q2K1 w - - 0 1', goal: 'best', solution: 'd1d6' },
          { fen: '3r2k1/5ppp/8/8/3R2n1/8/5PPP/6K1 w - - 0 1', goal: 'best', solution: 'd4d8',
            say: { es: 'Torre por torre, y además es mate del pasillo.', en: 'Rook for rook, and it is a back-rank mate too.' } },
          { fen: 'r5k1/8/8/1q6/8/2N5/6B1/6K1 w - - 0 1', goal: 'best', solution: 'c3b5',
            say: { es: 'La torre de la esquina se ve antes, pero la dama vale casi el doble.', en: 'The rook in the corner catches the eye, but the queen is worth almost twice as much.' } },
        ],
      },
      {
        id: 'protect',
        title: { es: 'Proteger tus piezas', en: 'Protect your pieces' },
        intro: {
          es: 'Antes de mover, mira qué ataca el rival. Una pieza atacada se salva así: moviéndola a una casilla segura, comiendo al atacante, poniendo algo en medio, o protegiéndola, si el atacante vale lo mismo o más que ella. Si te equivocas, el rival se la come.',
          en: 'Before you move, look at what your opponent attacks. An attacked piece is saved by moving it to a safe square, taking the attacker, putting something in between, or guarding it, if the attacker is worth as much or more. Get it wrong and your opponent takes it.',
        },
        goalText: { es: 'Tu pieza está atacada: ponla a salvo', en: 'Your piece is attacked: keep it safe' },
        levels: [
          { fen: '7k/8/8/4b3/8/8/P7/R5K1 w - - 0 1', goal: 'save', target: 'a1', punish: 'e5a1', solution: 'a1d1' },
          { fen: '6k1/8/8/4p3/3N4/8/8/6K1 w - - 0 1', goal: 'save', target: 'd4', punish: 'e5d4', solution: 'd4f5',
            say: { es: 'Un peón que ataca a una pieza siempre gana: hay que apartarse.', en: 'A pawn attacking a piece always wins: you have to step away.' } },
          { fen: '3r2k1/8/8/8/3N4/8/2P5/6K1 w - - 0 1', goal: 'save', target: 'd4', punish: 'd8d4', solution: 'c2c3',
            say: { es: 'Ahora, si la torre come, el peón se come la torre: 5 por 3.', en: 'Now if the rook takes, the pawn takes the rook back: 5 for 3.' } },
          { fen: '6k1/8/8/8/8/2n5/1P2Q3/6K1 w - - 0 1', goal: 'save', target: 'e2', punish: 'c3e2', solution: 'b2c3',
            say: { es: 'Comer al atacante también es proteger.', en: 'Taking the attacker protects too.' } },
          { fen: '6k1/5ppp/p4n2/1p6/2B5/8/5PPP/6K1 w - - 0 1', goal: 'save', target: 'c4', punish: 'b5c4', solution: 'c4b3',
            say: { es: 'Ojo con las casillas trampa: en b5, d5, e6 y f7 el alfil también se pierde.', en: 'Mind the trap squares: on b5, d5, e6 and f7 the bishop is lost too.' } },
          { fen: '6k1/1b6/8/8/8/8/4PP2/3K3R w - - 0 1', goal: 'save', target: 'h1', punish: 'b7h1', solution: 'f2f3',
            say: { es: 'Tapar la diagonal también protege.', en: 'Blocking the diagonal protects too.' } },
        ],
      },
      {
        id: 'draw',
        title: { es: 'Tablas', en: 'Draw' },
        intro: {
          es: 'Tablas es un empate. Pasa por ahogado, o cuando a nadie le quedan piezas para dar mate: rey contra rey, o rey y un solo alfil o caballo contra rey. También por repetición: si la misma posición sale tres veces, son tablas. Si vas perdiendo, unas tablas son un buen rescate. Busca la jugada que las consigue.',
          en: 'A draw is a tied game. It happens by stalemate, or when nobody has enough left to mate: king against king, or king and a single bishop or knight against a king. Also by repetition: if the same position comes up three times, it is a draw. When you are losing, a draw is a fine rescue. Find the move that gets it.',
        },
        goalText: { es: 'Consigue tablas en una jugada', en: 'Reach a draw in one move' },
        levels: [
          { fen: '7k/8/8/3r4/4K3/8/8/8 w - - 0 1', goal: 'draw', solution: 'e4d5',
            say: { es: 'Rey contra rey: nadie puede dar mate. Tablas.', en: 'King against king: nobody can mate. Draw.' } },
          { fen: 'k7/8/7p/8/8/8/8/2B1K3 w - - 0 1', goal: 'draw', solution: 'c1h6',
            say: { es: 'Un alfil solo no puede dar mate, y al negro ya no le queda nada.', en: 'A lone bishop cannot mate, and Black has nothing left.' } },
          { fen: 'k7/p2r4/P4N2/8/8/8/8/7K w - - 0 1', goal: 'draw', solution: 'f6d7',
            say: { es: 'Ibas perdiendo una torre: el ahogado te salva medio punto.', en: 'You were a rook down: stalemate saves you half a point.' } },
          { fen: '8/8/8/8/8/5K2/7p/7k w - - 0 1', goal: 'draw', solution: 'f3f2',
            say: { es: 'El peón no puede coronar y el rey negro no tiene jugadas: ahogado.', en: 'The pawn cannot promote and the black king has no moves: stalemate.' } },
        ],
      },
    ],
  },
];
