// Curated endgame study positions, grouped by material category.
// `practice: true` positions have a known `expected` result ('win'|'draw' for
// the side to move) and can be graded when played out against the engine.
// Positions without `practice` are for browsing/study only.

export const ENDGAME_CATEGORIES = ['pawn', 'rook', 'queen', 'bishop', 'knight', 'minor'];

export const ENDGAMES = [
  // ── PAWN ──────────────────────────────────────────────
  {
    id: 'p1', category: 'pawn',
    name: { es: 'Oposición: les toca mover a las blancas', en: 'Opposition: White to move' },
    fen: '8/8/8/4k3/4P3/4K3/8/8 w - - 0 1',
    practice: true, expected: 'draw',
    comment: {
      es: 'Posición clave de la teoría de finales de peones. Con las blancas para mover, pierden la oposición: si avanzan el rey, el rey negro les cierra el paso; si avanzan el peón, el rey negro lo captura. Tablas.',
      en: 'A key position in pawn endgame theory. With White to move, White loses the opposition: advancing the king lets Black\'s king block the way; advancing the pawn lets Black capture it. Draw.',
    },
  },
  {
    id: 'p2', category: 'pawn',
    name: { es: 'Oposición: les toca mover a las negras', en: 'Opposition: Black to move' },
    fen: '8/8/8/4k3/4P3/4K3/8/8 b - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'La misma posición, pero ahora mueven las negras. Al tener que ceder la oposición, el rey blanco entra por d6 o f6 y escolta el peón hasta coronar. Ganan las blancas.',
      en: 'The same position, but now Black must move. Forced to give way, White\'s king marches in via d6 or f6 and escorts the pawn home. White wins.',
    },
  },
  {
    id: 'p3', category: 'pawn',
    name: { es: 'La regla del cuadrado', en: 'The rule of the square' },
    fen: '8/8/8/8/6k1/8/P7/K7 w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'Traza un cuadrado desde el peón hasta la casilla de coronación: si el rey rival no puede entrar en ese cuadrado, nunca alcanzará al peón. Aquí el rey negro está demasiado lejos.',
      en: 'Draw a square from the pawn to its queening square: if the enemy king cannot step into it, it will never catch the pawn. Here Black\'s king is much too far away.',
    },
  },

  // ── ROOK ──────────────────────────────────────────────
  {
    id: 'r1', category: 'rook',
    name: { es: 'Regla de Tarrasch: la torre detrás del peón propio', en: "Tarrasch's rule: rook behind your own pawn" },
    fen: 'r7/4k3/8/3P4/4K3/8/8/3R4 w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: '"Las torres deben colocarse detrás de los peones pasados, propios o del rival" — Tarrasch. Aquí la torre blanca empuja el peón mientras la torre negra, delante, estorba a su propio rey.',
      en: '"Rooks belong behind passed pawns, your own or your opponent\'s" — Tarrasch. Here White\'s rook pushes the pawn forward while Black\'s rook, stuck in front, gets in its own king\'s way.',
    },
  },
  {
    id: 'r2', category: 'rook',
    name: { es: 'Regla de Tarrasch: la torre detrás del peón rival', en: "Tarrasch's rule: rook behind the opponent's pawn" },
    fen: '8/8/4k3/8/p7/8/4K3/R7 w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'La misma idea, en defensa: la torre por detrás del peón pasado rival lo bloquea de por vida y termina ganándolo.',
      en: 'The same idea in defense: the rook posted behind the enemy passed pawn blockades it for good and eventually wins it.',
    },
  },
  {
    id: 'r3', category: 'rook',
    name: { es: 'Cortar al rey rival', en: "Cutting off the enemy king" },
    fen: '8/8/8/3k4/8/4R3/3P4/3K4 b - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'La torre en la columna "e" impide que el rey negro cruce a defender el flanco del peón. Con el rey rival cortado, el peón blanco avanza sin oposición.',
      en: 'The rook on the e-file stops Black\'s king from crossing over to defend the pawn\'s side. With the enemy king cut off, White\'s pawn marches on unopposed.',
    },
  },

  // ── QUEEN ─────────────────────────────────────────────
  {
    id: 'q1', category: 'queen',
    name: { es: 'Dama contra peón a punto de coronar', en: 'Queen vs a pawn about to promote' },
    fen: '8/8/8/8/2k5/8/4p3/6QK w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'Contra un peón central o de caballo, la dama siempre gana: da jaques que ganan tiempo y fuerza al rey rival a estorbar su propio peón. (Con peones de torre o alfil el resultado puede ser tablas — ¡otra lección para otro día!)',
      en: 'Against a central or knight pawn, the queen always wins: checks gain tempo and force the enemy king to block its own pawn. (Rook and bishop pawns are a famous exception that can draw — a lesson for another day!)',
    },
  },
  {
    id: 'q2', category: 'queen',
    name: { es: 'Dama contra torre', en: 'Queen vs Rook' },
    fen: '8/8/4k3/8/8/4r3/8/4K1Q1 w - - 0 1',
    comment: {
      es: 'Con cuidado y paciencia, la dama gana casi siempre contra una torre solitaria — pero hay que evitar los trucos de tablas por ahogado o jaque perpetuo. Estúdiala con el motor encendido.',
      en: 'With care and patience, the queen almost always beats a lone rook — but watch out for stalemate and perpetual-check tricks. Study it with the engine switched on.',
    },
  },
  {
    id: 'q3', category: 'queen',
    name: { es: 'Dama y peón contra dama', en: 'Queen and pawn vs Queen' },
    fen: '3q2k1/8/3P4/3Q4/8/6K1/8/8 w - - 0 1',
    comment: {
      es: 'Un peón muy avanzado y apoyado por la dama, con el rey rival lejos, suele decidir la partida. La técnica exacta puede ser larga: explórala con el motor.',
      en: 'A far-advanced pawn backed by the queen, with the enemy king far away, is usually decisive. The exact technique can be long: explore it with the engine.',
    },
  },

  // ── BISHOP ────────────────────────────────────────────
  {
    id: 'b1', category: 'bishop',
    name: { es: 'Alfiles de distinto color: la fortaleza de tablas', en: 'Opposite-colored bishops: the drawing fortress' },
    fen: '8/1b6/4k3/8/3P4/4K3/8/5B2 w - - 0 1',
    comment: {
      es: 'Con alfiles de distinto color, un solo peón de más rara vez basta para ganar: el defensor bloquea la casilla de coronación con su alfil y el rey, creando una fortaleza célebre en la teoría de finales.',
      en: 'With opposite-colored bishops, one extra pawn is rarely enough to win: the defender blocks the queening square with the bishop and king, forming one of endgame theory\'s most famous fortresses.',
    },
  },
  {
    id: 'b2', category: 'bishop',
    name: { es: 'Alfiles del mismo color: la ventaja se nota', en: 'Same-colored bishops: the edge tells' },
    fen: '8/6b1/4k3/8/3P4/4K3/3B4/8 w - - 0 1',
    comment: {
      es: 'Sin el "color opuesto" de por medio, no hay fortaleza posible: el bando con el peón de más suele convertir su ventaja con normalidad.',
      en: 'Without the opposite-color trick available, no fortress is possible: the side with the extra pawn usually converts the advantage normally.',
    },
  },
  {
    id: 'b3', category: 'bishop',
    name: { es: 'El alfil "malo" y el peón de torre', en: 'The "wrong" bishop and the rook pawn' },
    fen: '7k/5K2/7P/8/2B5/8/8/8 w - - 0 1',
    practice: true, expected: 'draw',
    comment: {
      es: 'Peón de torre + alfil que NO controla la casilla de coronación (h8) = tablas si el rey defensor llega al rincón, sin importar cuánto material sobre. Una de las excepciones más famosas del ajedrez.',
      en: 'A rook pawn plus a bishop that does NOT control the queening square (h8) = a draw once the defending king reaches the corner, no matter how much material is up. One of chess\'s most famous exceptions.',
    },
  },

  // ── KNIGHT ────────────────────────────────────────────
  {
    id: 'n1', category: 'knight',
    name: { es: 'Caballo y peón de más', en: 'Knight with an extra pawn' },
    fen: '8/8/4k3/8/3P4/5N2/4K3/8 w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'Los finales de caballo se parecen a los de peones: sin torres ni damas, un peón pasado y bien apoyado suele decidir la partida.',
      en: 'Knight endgames behave a lot like pawn endgames: without rooks or queens, a well-supported passed pawn usually decides the game.',
    },
  },
  {
    id: 'n2', category: 'knight',
    name: { es: 'Dos caballos no dan mate solos', en: 'Two knights cannot force mate alone' },
    fen: '4k3/8/8/8/8/8/3NKN2/8 w - - 0 1',
    practice: true, expected: 'draw',
    comment: {
      es: 'Dato curioso y muy útil: rey y dos caballos NO pueden forzar el jaque mate contra un rey solitario (¡salvo rarísimas excepciones con peones rivales en la posición!). Tablas garantizadas.',
      en: 'A useful bit of trivia: king and two knights CANNOT force checkmate against a bare king (barring rare exceptions with extra pawns on the board). A guaranteed draw.',
    },
  },
  {
    id: 'n3', category: 'knight',
    name: { es: 'Caballo activo y centralizado', en: 'An active, centralized knight' },
    fen: '8/8/3k4/8/3N4/3P4/4K3/8 w - - 0 1',
    practice: true, expected: 'win',
    comment: {
      es: 'Un caballo bien plantado en el centro, apoyando su propio peón pasado, vale tanto como una pieza mayor en este tipo de finales.',
      en: 'A knight planted firmly in the center, supporting its own passed pawn, punches above its weight in this kind of endgame.',
    },
  },

  // ── MINOR PIECES (Bishop vs Knight) ──────────────────
  {
    id: 'm1', category: 'minor',
    name: { es: 'Alfil vs Caballo: posiciones abiertas', en: 'Bishop vs Knight: open positions' },
    fen: '8/8/4k1n1/8/2B5/4K3/8/8 w - - 0 1',
    comment: {
      es: 'Regla general: en posiciones abiertas y con peones en ambos flancos, el alfil suele ser algo mejor que el caballo por su alcance a distancia. (Esta posición concreta, sin peones, es tablas por material insuficiente — lo interesante aquí es la idea general.)',
      en: 'General rule: in open positions with pawns on both flanks, the bishop is usually a touch better than the knight thanks to its long range. (This exact position, with no pawns left, is a draw by insufficient material — the point here is the general principle.)',
    },
  },
  {
    id: 'm2', category: 'minor',
    name: { es: 'El "alfil malo" encerrado por sus propios peones', en: 'A "bad bishop" boxed in by its own pawns' },
    fen: '8/8/4k3/3n4/2P1P3/3BK3/8/8 w - - 0 1',
    comment: {
      es: 'Un alfil que tiene sus propios peones en casillas de su mismo color pierde movilidad — se le llama "alfil malo". Aquí el caballo negro, bien centralizado, compite de tú a tú pese a ser la pieza "menor".',
      en: 'A bishop whose own pawns sit on its color loses mobility — this is called a "bad bishop". Here Black\'s centralized knight competes on equal terms despite usually being considered the weaker piece.',
    },
  },
  {
    id: 'm3', category: 'minor',
    name: { es: 'La pareja de alfiles', en: 'The bishop pair' },
    fen: '8/4k3/6b1/8/3n4/3B1B2/4K3/8 w - - 0 1',
    comment: {
      es: 'Dos alfiles cubren las casillas de ambos colores y se complementan muy bien en el final, especialmente en posiciones abiertas — una ventaja estructural conocida como "la pareja de alfiles".',
      en: 'Two bishops cover both square colors and complement each other beautifully in the endgame, especially in open positions — a structural edge known as "the bishop pair".',
    },
  },
];
