// Learning tab content: chess rules + basic checkmate technique.
// Each lesson has a diagram (FEN + optional arrows/highlighted squares,
// verified legal via chess.js) and bilingual explanatory text.

export const LEARNING_CATEGORIES = [
  {
    id: 'rules',
    title: { es: 'Reglas básicas', en: 'Basic Rules' },
    lessons: [
      {
        id: 'board',
        title: { es: 'El tablero', en: 'The Board' },
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        shapes: { squares: [], arrows: [] },
        text: {
          es: 'El tablero tiene 8x8 = 64 casillas alternando entre claras y oscuras. Las columnas se nombran de la "a" a la "h" (de izquierda a derecha desde el lado blanco) y las filas del 1 al 8 (desde el lado blanco hacia el negro). Cada casilla se identifica combinando ambas, por ejemplo "e4". Regla mnemotécnica: la casilla h1 (esquina inferior derecha vista desde blancas) siempre es oscura.',
          en: 'The board has 8x8 = 64 squares alternating light and dark. Files (columns) are named "a" to "h" (left to right from White\'s side) and ranks (rows) 1 to 8 (from White\'s side toward Black\'s). Each square is named by combining both, e.g. "e4". Memory tip: the square h1 (bottom-right corner from White\'s view) is always dark.',
        },
      },
      {
        id: 'pawn',
        title: { es: 'El peón', en: 'The Pawn' },
        fen: 'k7/8/8/8/8/3p4/4P3/K7 w - - 0 1',
        shapes: { squares: [], arrows: [{ from: 'e2', to: 'e3', color: 'green' }, { from: 'e2', to: 'e4', color: 'green' }, { from: 'e2', to: 'd3', color: 'red' }] },
        text: {
          es: 'El peón avanza una casilla hacia adelante (dos casillas si está en su posición inicial), pero nunca hacia atrás. A diferencia de su movimiento, captura en diagonal una casilla hacia adelante — nunca puede capturar moviéndose recto. Al llegar a la última fila, se corona (ver lección de Coronación).',
          en: 'A pawn moves one square forward (two squares if it hasn\'t moved yet), and never backward. Unlike its movement, it captures one square diagonally forward — it can never capture by moving straight ahead. When it reaches the last rank, it promotes (see the Promotion lesson).',
        },
        practice: { from: 'e2' },
      },
      {
        id: 'knight',
        title: { es: 'El caballo', en: 'The Knight' },
        fen: 'k7/8/8/3N4/8/8/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: ['b6', 'c7', 'e7', 'f6', 'f4', 'e3', 'c3', 'b4'].map(to => ({ from: 'd5', to, color: 'green' })) },
        text: {
          es: 'El caballo se mueve en forma de "L": dos casillas en una dirección (horizontal o vertical) y luego una casilla perpendicular. Es la única pieza que puede saltar sobre otras piezas, propias o rivales.',
          en: 'The knight moves in an "L" shape: two squares in one direction (horizontal or vertical), then one square perpendicular to that. It\'s the only piece that can jump over other pieces, friend or foe.',
        },
        practice: { from: 'd5' },
      },
      {
        id: 'bishop',
        title: { es: 'El alfil', en: 'The Bishop' },
        fen: 'k7/8/8/3B4/8/8/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: ['a8', 'g8', 'h1', 'a2'].map(to => ({ from: 'd5', to, color: 'green' })) },
        text: {
          es: 'El alfil se mueve en diagonal, cualquier número de casillas, sin poder saltar sobre otras piezas. Cada alfil queda confinado toda la partida a las casillas de un solo color (claras u oscuras) según donde empezó.',
          en: 'The bishop moves diagonally, any number of squares, and cannot jump over other pieces. Each bishop stays confined for the whole game to squares of one color (light or dark) depending on where it started.',
        },
        practice: { from: 'd5' },
      },
      {
        id: 'rook',
        title: { es: 'La torre', en: 'The Rook' },
        fen: 'k7/8/8/3R4/8/8/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: ['d8', 'd1', 'a5', 'h5'].map(to => ({ from: 'd5', to, color: 'green' })) },
        text: {
          es: 'La torre se mueve en línea recta, en horizontal o vertical, cualquier número de casillas, sin saltar sobre otras piezas. Junto con el rey, participa en el enroque (ver lección de Enroque).',
          en: 'The rook moves in a straight line, horizontally or vertically, any number of squares, without jumping over other pieces. Along with the king, it takes part in castling (see the Castling lesson).',
        },
        practice: { from: 'd5' },
      },
      {
        id: 'queen',
        title: { es: 'La dama', en: 'The Queen' },
        fen: 'k7/8/8/3Q4/8/8/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: ['d8', 'd1', 'a5', 'h5', 'a8', 'g8', 'h1', 'a2'].map(to => ({ from: 'd5', to, color: 'green' })) },
        text: {
          es: 'La dama combina los movimientos de la torre y el alfil: se mueve en línea recta o en diagonal, cualquier número de casillas. Es la pieza más poderosa del tablero.',
          en: 'The queen combines the rook\'s and bishop\'s movement: it moves in a straight line or diagonally, any number of squares. It\'s the most powerful piece on the board.',
        },
        practice: { from: 'd5' },
      },
      {
        id: 'king',
        title: { es: 'El rey', en: 'The King' },
        fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
        shapes: { squares: [], arrows: ['c5', 'd5', 'e5', 'e4', 'e3', 'd3', 'c3', 'c4'].map(to => ({ from: 'd4', to, color: 'green' })) },
        text: {
          es: 'El rey se mueve una casilla en cualquier dirección. Es la pieza más importante: si está en jaque (amenazado de captura) y no puede evitarlo, es jaque mate y la partida termina. El rey nunca puede moverse a una casilla atacada por el rival.',
          en: 'The king moves one square in any direction. It\'s the most important piece: if it\'s in check (threatened with capture) and can\'t escape it, that\'s checkmate and the game ends. The king can never move to a square attacked by the opponent.',
        },
        practice: { from: 'd4' },
      },
      {
        id: 'captures',
        title: { es: 'Cómo capturan las piezas', en: 'How Pieces Capture' },
        fen: 'k7/8/8/8/4p3/2N5/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: [{ from: 'c3', to: 'e4', color: 'red' }] },
        text: {
          es: 'Cualquier pieza captura moviéndose a una casilla ocupada por una pieza rival, siguiendo su propio patrón de movimiento — la pieza capturada se retira del tablero. La única excepción es el peón, que se mueve recto pero captura en diagonal.',
          en: 'Any piece captures by moving to a square occupied by an enemy piece, following its own normal movement pattern — the captured piece is removed from the board. The one exception is the pawn, which moves straight but captures diagonally.',
        },
        practice: { from: 'c3', requireCapture: true },
      },
      {
        id: 'castling',
        title: { es: 'El enroque', en: 'Castling' },
        fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
        shapes: { squares: [], arrows: [{ from: 'e1', to: 'g1', color: 'yellow' }, { from: 'h1', to: 'f1', color: 'yellow' }, { from: 'e1', to: 'c1', color: 'yellow' }, { from: 'a1', to: 'd1', color: 'yellow' }] },
        text: {
          es: 'El enroque es el único movimiento donde se mueven dos piezas a la vez: el rey se mueve dos casillas hacia una torre, y esa torre salta al otro lado del rey. Solo es posible si ni el rey ni esa torre se han movido antes, no hay piezas entre ellos, y el rey no está en jaque ni pasa por (ni termina en) una casilla atacada.',
          en: 'Castling is the only move where two pieces move at once: the king moves two squares toward a rook, and that rook jumps to the other side of the king. It\'s only legal if neither the king nor that rook has moved before, there are no pieces between them, and the king isn\'t in check nor passes through (or lands on) an attacked square.',
        },
        practice: { from: 'e1', requireCastle: true },
      },
      {
        id: 'castling_illegal',
        title: { es: 'Cuándo NO se puede enrocar', en: 'When You Can\'t Castle' },
        fen: 'r3k2r/8/8/4R3/8/8/8/4K3 b kq - 0 1',
        shapes: { squares: [{ sq: 'e8', color: 'red' }], arrows: [{ from: 'e5', to: 'e8', color: 'red' }] },
        text: {
          es: 'Aquí las negras conservan el derecho a enrocar (ni el rey ni las torres se han movido), pero no pueden hacerlo: el rey está en jaque por la torre blanca en e5. Un rey en jaque debe resolverlo primero — moverse, capturar o bloquear — antes de poder enrocar. Lo mismo ocurre si el rey tendría que pasar por una casilla atacada, o si hay una pieza entre el rey y la torre.',
          en: 'Here Black still has the right to castle (neither the king nor the rooks have moved), but can\'t: the king is in check from the white rook on e5. A king in check must deal with it first — move, capture, or block — before castling becomes possible again. The same applies if the king would have to pass through an attacked square, or if a piece sits between the king and the rook.',
        },
      },
      {
        id: 'en_passant',
        title: { es: 'Captura al paso', en: 'En Passant' },
        fen: 'k7/3p4/8/4P3/8/8/8/K7 b - - 0 1',
        setupMove: 'd7d5',
        shapes: { squares: [], arrows: [{ from: 'e5', to: 'd6', color: 'red' }] },
        text: {
          es: 'Si un peón rival avanza dos casillas desde su posición inicial y queda justo al lado de uno de tus peones (en la misma fila), puedes capturarlo "al paso" como si solo hubiera avanzado una casilla — pero únicamente en la jugada inmediatamente siguiente. Observa cómo el peón negro acaba de avanzar dos casillas de golpe.',
          en: 'If an enemy pawn advances two squares from its starting position and lands right beside one of your pawns (on the same rank), you may capture it "en passant" as if it had only moved one square — but only on the very next move. Watch the black pawn just push two squares in one go.',
        },
        practice: { fen: 'k7/8/8/3pP3/8/8/8/K7 w - d6 0 1', from: 'e5', to: 'd6' },
      },
      {
        id: 'promotion',
        title: { es: 'Coronación', en: 'Promotion' },
        fen: 'k7/4P3/8/8/8/8/8/K7 w - - 0 1',
        shapes: { squares: [], arrows: [{ from: 'e7', to: 'e8', color: 'green' }] },
        text: {
          es: 'Cuando un peón alcanza la última fila (la 8ª para blancas, la 1ª para negras), se corona: se convierte en dama, torre, alfil o caballo, a elección del jugador (casi siempre dama, por ser la pieza más fuerte). Puede haber más de una dama en el tablero al mismo tiempo.',
          en: 'When a pawn reaches the last rank (the 8th for White, the 1st for Black), it promotes: it becomes a queen, rook, bishop, or knight, the player\'s choice (almost always a queen, since it\'s the strongest piece). You can have more than one queen on the board at the same time.',
        },
        practice: { from: 'e7', to: 'e8' },
      },
    ],
  },
  {
    id: 'mates',
    title: { es: 'Jaques mate básicos', en: 'Basic Checkmates' },
    lessons: [
      {
        id: 'kq_vs_k',
        title: { es: 'Dama y rey contra rey', en: 'Queen + King vs King' },
        fen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
        shapes: { squares: [{ sq: 'h8', color: 'red' }], arrows: [] },
        text: {
          es: 'Técnica: usa la dama para ir arrinconando al rey rival hacia el borde del tablero, manteniéndote siempre a "distancia de caballo" para evitar el ahogado (que el rey no tenga jaque pero tampoco movimientos legales). Cuando el rey rival esté en el borde, acerca tu propio rey para apoyar a la dama y dar mate, como en el diagrama: la dama controla la fila y columna, y tu rey protege la casilla junto a ella.',
          en: 'Technique: use the queen to gradually confine the enemy king toward the edge of the board, staying a "knight\'s move" away to avoid stalemate (king not in check but with no legal moves). Once the enemy king is on the edge, bring your own king up to support the queen and deliver mate, as in the diagram: the queen controls the rank and file, and your king protects the square next to her.',
        },
        practice: { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', vsEngine: true },
      },
      {
        id: 'k2r_vs_k',
        title: { es: 'Dos torres y rey contra rey (mate de escalera)', en: 'Two Rooks + King vs King (Ladder Mate)' },
        fen: 'R6k/1R6/8/8/8/8/8/4K3 b - - 0 1',
        shapes: { squares: [{ sq: 'h8', color: 'red' }], arrows: [] },
        text: {
          es: 'Técnica conocida como "mate de escalera": una torre corta una fila mientras la otra da jaque en la fila siguiente, obligando al rey a retroceder; luego se alternan como en una escalera hasta llegar al borde del tablero, sin que el rey propio necesite intervenir.',
          en: 'Known as the "ladder mate": one rook cuts off a rank while the other gives check on the next rank, forcing the king back; they alternate like rungs on a ladder until the king is pushed to the edge — your own king doesn\'t even need to help.',
        },
        practice: { fen: '4k3/8/8/8/8/8/8/R3K2R w - - 0 1', vsEngine: true },
      },
      {
        id: 'kr_vs_k',
        title: { es: 'Torre y rey contra rey', en: 'Rook + King vs King' },
        fen: 'k6R/8/1K6/8/8/8/8/8 b - - 0 1',
        shapes: { squares: [{ sq: 'a8', color: 'red' }], arrows: [] },
        text: {
          es: 'Técnica: la torre corta al rey rival en una fila o columna mientras tu propio rey avanza para "empujarlo" (oponerse directamente) hacia el borde. Cuando el rey rival queda en el borde y el tuyo lo controla de cerca, la torre da jaque mate a lo largo de esa fila o columna, como en el diagrama.',
          en: 'Technique: the rook confines the enemy king to a rank or file while your own king advances to "shoulder" it (oppose it directly) toward the edge. Once the enemy king is on the edge and your king controls it closely, the rook delivers mate along that rank or file, as in the diagram.',
        },
        practice: { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', vsEngine: true },
      },
      {
        id: 'k2b_vs_k',
        title: { es: 'Dos alfiles y rey contra rey', en: 'Two Bishops + King vs King' },
        fen: '7k/5K2/5BB1/8/8/8/8/8 b - - 0 1',
        shapes: { squares: [{ sq: 'h8', color: 'red' }], arrows: [] },
        text: {
          es: 'Técnica: los dos alfiles, uno de casillas claras y otro de oscuras, avanzan juntos en diagonales paralelas formando una "barrera" que empuja al rey rival hacia cualquier esquina del tablero (a diferencia del rey+torre, funciona en cualquier esquina). Tu rey se acerca para dar el mate final, como en el diagrama.',
          en: 'Technique: the two bishops, one on light squares and one on dark, advance together on parallel diagonals forming a "barrier" that pushes the enemy king toward any corner of the board (unlike king+rook, this works in any corner). Your king comes in to deliver the final mate, as in the diagram.',
        },
        practice: { fen: '4k3/8/8/8/8/8/8/2B1K1B1 w - - 0 1', vsEngine: true },
      },
      {
        id: 'kbn_vs_k',
        title: { es: 'Alfil, caballo y rey contra rey', en: 'Bishop + Knight + King vs King' },
        fen: '8/8/8/3B4/6N1/8/5K2/7k b - - 0 1',
        shapes: { squares: [{ sq: 'h1', color: 'red' }], arrows: [] },
        text: {
          es: 'El mate más difícil de los básicos: el rey rival debe ser llevado obligatoriamente a la esquina del mismo color que tu alfil (si tu alfil es de casillas claras, debes llevarlo a una esquina clara). El caballo y el rey colaboran para ir cerrando el cerco mientras el alfil vigila las casillas de escape, hasta lograr el mate en esa esquina exacta.',
          en: 'The hardest of the basic mates: the enemy king must be driven specifically to the corner matching your bishop\'s color (if your bishop is light-squared, you must drive it to a light corner). The knight and king work together to close the net while the bishop watches the escape squares, until mate is delivered in that exact corner.',
        },
        practice: { fen: '4k3/8/8/8/8/8/8/2B1K1N1 w - - 0 1', vsEngine: true },
      },
    ],
  },
];
