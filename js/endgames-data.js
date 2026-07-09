// Curated endgame studies, grouped by material category — sourced and adapted
// from "100 Endgames You Must Know" (Jesus de la Villa), reworked as replayable
// practice: each position carries the book's actual move sequence (both sides),
// which the player replays move by move against the "moves" list to be graded.
// Comments are paraphrased summaries of the book's explanatory text, not verbatim.

export const ENDGAME_CATEGORIES = ["pawn","rook","queen","bishop","knight","minor"];

export const ENDGAMES = [
  // ── PAWN ──────────────────────────────────────────
  {
    id: 'p1', category: 'pawn',
    name: { es: 'The rule of the square', en: 'The rule of the square' },
    fen: '6k1/8/8/8/8/8/P7/7K w - - 0 1',
    moves: ["a2a4","g8f7","a4a5","f7e6","a5a6","e6d6","a6a7","d6c7","a7a8q"],
    comment: {
      es: 'La primera pregunta en un final de rey y peón contra rey solitario es si el peón puede coronar sin ayuda del rey. La \'regla del cuadrado\' permite responderla de un vistazo: si el rey rival no puede entrar en el cuadrado trazado desde el peón hasta su casilla de coronación, nunca lo alcanzará.',
      en: 'The first question in a king-and-pawn-vs-lone-king ending is whether the pawn can promote without help from its king. The \'rule of the square\' answers this at a glance: if the enemy king can\'t step into the square drawn from the pawn to its queening square, it will never catch it.',
    },
  },
  {
    id: 'p2', category: 'pawn',
    name: { es: 'The pawn is on the 6th rank', en: 'The pawn is on the 6th rank' },
    fen: '5k2/8/5PK1/8/8/8/8/8 w - - 0 1',
    moves: ["f6f7","f8e7","g6g7"],
    comment: {
      es: 'El primer caso realmente interesante de rey y peón contra rey ocurre cuando el rey defensor logra ocupar una casilla clave delante del peón — entonces todo depende de la posición relativa de los reyes. Aquí el peón está en la 6ª fila, a solo dos pasos de coronar.',
      en: 'The first truly interesting king-and-pawn-vs-king case happens when the defending king manages to occupy a key square in front of the pawn — then everything depends on the kings\' relative position. Here the pawn is on the 6th rank, just two steps from promoting.',
    },
  },
  {
    id: 'p3', category: 'pawn',
    name: { es: 'Key squares', en: 'Key squares' },
    fen: '5k2/8/4K3/5P2/8/8/8/8 w - - 0 1',
    moves: ["e6f6","f8e8","f6g7","e8e7","f5f6","e7e6","f6f7"],
    comment: {
      es: 'Cuando el peón aún no ha llegado a la 6ª fila, el análisis se complica, pero hay reglas muy claras: el concepto esencial es el de las \'casillas clave\'. Si el rey fuerte ocupa una de ellas, el peón corona.',
      en: 'When the pawn hasn\'t reached the 6th rank yet, the analysis gets more complex, but there are very clear rules: the essential concept is that of \'key squares\'. If the stronger king occupies one of them, the pawn promotes.',
    },
  },
  {
    id: 'p4', category: 'pawn',
    name: { es: 'Imprisoning the stronger side\'s king', en: 'Imprisoning the stronger side\'s king' },
    fen: '8/8/8/p7/8/1k6/3K4/8 w - - 0 1',
    moves: ["d2c1","b3a2","c1c2","a5a4","c2c1","a4a3","c1c2","a2a1","c2c1"],
    comment: {
      es: 'No solo plantarse en el camino del peón salva al defensor: la cercanía al borde del tablero también puede restringir drásticamente la movilidad del rey fuerte, como se ve aquí.',
      en: 'Standing in the pawn\'s path isn\'t the defender\'s only way to draw: proximity to the edge of the board can also drastically restrict the stronger king\'s mobility, as seen here.',
    },
  },
  {
    id: 'p5', category: 'pawn',
    name: { es: 'Doubled pawns', en: 'Doubled pawns' },
    fen: '8/1k6/8/1P6/1P6/1K6/8/8 w - - 0 1',
    moves: ["b3c3","b7c7","c3d4","c7b6","d4c4","b6c7","c4c5","c7b7","b5b6","b7a6","b6b7","a6b7","c5b5"],
    comment: {
      es: 'Volvemos a los finales de peones, ahora con más de un peón en el tablero. Pese al material reducido, suelen ser los más complejos de calcular — de hecho, las estadísticas muestran que son los que menos terminan en tablas.',
      en: 'Back to pawn endings, now with more than one pawn on the board. Despite the reduced material, these tend to be the hardest to calculate — statistics actually show they have the lowest draw rate of any endgame type.',
    },
  },
  {
    id: 'p6', category: 'pawn',
    name: { es: 'Isolated pawns', en: 'Isolated pawns' },
    fen: '8/8/8/5k2/5P1P/8/8/K7 w - - 0 1',
    moves: ["h4h5","f5f6","a1b2","f6g7","f4f5","g7h6","f5f6"],
    comment: {
      es: 'Dos peones separados por una columna pueden defenderse mutuamente de dos maneras: amenazando coronar si el rey captura al otro, o resistiendo hasta que el propio rey llegue a tiempo a defenderlos.',
      en: 'Two pawns separated by one file can defend each other in two ways: threatening to promote if the king captures the other one, or holding out until their own king arrives in time to defend them.',
    },
  },
  {
    id: 'p7', category: 'pawn',
    name: { es: 'Blocked pawns. Key squares', en: 'Blocked pawns. Key squares' },
    fen: 'k7/8/1p6/1P6/8/8/7K/8 w - - 0 1',
    moves: ["h2g3","a8b7","g3f4","b7c7","f4e5","c7d7","e5d5","d7c7","d5e6","c7c8","e6d6","c8b7","d6d7","b7b8","d7c6","b8a7","c6c7","a7a8","c7b6"],
    comment: {
      es: 'Cuando ambos bandos tienen un solo peón, la posición parece tablas fácil, pero no lo es: casi la mitad de estas partidas se deciden. El caso de peones bloqueados es el más útil de estudiar, porque sus reglas se pueden aplicar (con cuidado) a finales con más peones.',
      en: 'When both sides have just one pawn, the position looks like an easy draw, but it isn\'t: nearly half of these games are decisive. Blocked pawns are the most useful case to study, since the rules can be (carefully) carried over to endings with more pawns.',
    },
  },
  {
    id: 'p8', category: 'pawn',
    name: { es: 'blocked pawns', en: 'blocked pawns' },
    fen: '8/8/8/5p2/3k4/5P2/8/6K1 w - - 0 1',
    moves: ["f3f4","d4e4","g1g2","e4f4","g2f2","f4e4","f2e2","f5f4","e2f2","f4f3","f2f1","e4e3","f1e1","f3f2","e1f1","e3f3"],
    comment: {
      es: 'Ocupar una casilla clave no garantiza la victoria por sí solo — solo permite ganar el peón, y si el final de rey y peón resultante es tablas, no hay nada que hacer. Una posición sencilla en apariencia donde muchos jugadores con técnica floja se equivocan.',
      en: 'Occupying a key square doesn\'t guarantee victory on its own — it only wins the pawn, and if the resulting king-and-pawn ending is a draw, there\'s nothing more to be done. A deceptively simple position where players with shaky endgame technique often go wrong.',
    },
  },
  {
    id: 'p9', category: 'pawn',
    name: { es: 'Pawns on adjacent files', en: 'Pawns on adjacent files' },
    fen: '8/8/5p2/8/4P1k1/8/7K/8 w - - 0 1',
    moves: ["e4e5","f6e5","h2g2","g4f4","g2f2"],
    comment: {
      es: 'Cuando los peones están en columnas adyacentes, calcular la captura o defensa es sencillo si conoces un recurso concreto: a veces conviene entregar el peón para cambiar cuál casilla clave se ocupa.',
      en: 'When the pawns are on adjacent files, working out the capture or defense is easy once you know one specific resource: sometimes it pays to give up the pawn in order to shift which key square gets occupied.',
    },
  },
  {
    id: 'p10', category: 'pawn',
    name: { es: 'Passed pawns. Dual-purpose king manoeuvres', en: 'Passed pawns. Dual-purpose king manoeuvres' },
    fen: '8/6p1/7k/8/1K6/8/1P6/8 w - - 0 1',
    moves: ["b4c5","h6g6","b2b4","g6f7","b4b5","f7e7","c5c6","e7d8","c6b7","g7g5","b5b6","g5g4","b7a7","g4g3","b6b7","g3g2","b7b8q"],
    comment: {
      es: 'Cuando ambos bandos tienen peones pasados, casi siempre es una simple carrera — salvo cuando los reyes deben apoyar a su propio peón y estorbar al rival a la vez, generando jugadas de doble propósito que no son nada evidentes de calcular.',
      en: 'When both sides have passed pawns, it\'s usually just a straightforward race — except when the kings must support their own pawn while also hindering the opponent\'s, producing dual-purpose moves that are far from obvious to calculate.',
    },
  },
  {
    id: 'p11', category: 'pawn',
    name: { es: 'Rook\'s pawns and one distant passed pawn', en: 'Rook\'s pawns and one distant passed pawn' },
    fen: '8/8/3k3p/3P3P/2K5/8/8/8 w - - 0 1',
    moves: ["c4d4","d6d7","d4e5","d7e7","e5f5","e7d6","f5g6","d6d5","g6h6","d5e6","h6g7"],
    comment: {
      es: 'Tener un peón de más pesa más cuantos menos peones queden: con dos contra uno las probabilidades de ganar suben al 75% (frente al 50% de rey y peón contra rey solo) — pero bajan mucho si ambos peones bloqueados son de torre.',
      en: 'Being a pawn up matters more as fewer pawns remain on the board: with two pawns against one, winning chances rise to 75% (versus 50% for king-and-pawn vs. lone king) — but they drop sharply when both blocked pawns are rook\'s pawns.',
    },
  },
  {
    id: 'p12', category: 'pawn',
    name: { es: 'The passed pawn is central and near', en: 'The passed pawn is central and near' },
    fen: '8/p7/P7/8/8/3k4/3P4/3K4 w - - 0 1',
    moves: ["d1c1","d3d4","c1c2","d4c4","d2d3","c4d4","c2d2","d4d5","d2c3","d5c5","d3d4","c5d5","c3d3","d5d6","d3c4","d6c6","d4d5","c6d6","c4d4","d6d7","d4c5","d7c7","d5d6","c7d7","c5d5","d7d8","d5c6","d8c8","d6d7","c8d8"],
    comment: {
      es: 'Si el peón pasado está en una columna central cercana a los peones de torre bloqueados, al rey defensor le resulta más fácil generar contrajuego, y al rey fuerte le queda menos espacio para atacar el peón de torre rival.',
      en: 'If the passed pawn is on a central file near the blocked rook\'s pawns, it\'s easier for the defending king to generate counterplay, and the stronger king has less room to attack the enemy rook\'s pawn.',
    },
  },
  {
    id: 'p13', category: 'pawn',
    name: { es: 'A passed Bishop\'s pawn on the same wing', en: 'A passed Bishop\'s pawn on the same wing' },
    fen: '5k2/5P1p/4K3/8/8/8/7P/8 w - - 0 1',
    moves: ["e6f6","h7h5","h2h3","h5h4","f6g6"],
    comment: {
      es: 'Cuando el peón pasado está cerca de los peones bloqueados, conviene que ambos bandos mantengan sus peones de torre en la casilla inicial: el defensor porque así es más fácil de defender, el atacante porque conserva la opción de avanzarlo una o dos casillas en el momento justo.',
      en: 'When the passed pawn is close to the blocked pawns, both sides benefit from keeping their rook\'s pawns on their starting square: the defender because it\'s easier to defend, the attacker because it keeps the option of pushing it one or two squares at just the right moment.',
    },
  },
  {
    id: 'p14', category: 'pawn',
    name: { es: 'The defending side has moved his pawn. Triangulation', en: 'The defending side has moved his pawn. Triangulation' },
    fen: '2k5/8/p1P5/P2K4/8/8/8/8 w - - 0 1',
    moves: ["d5d4","c8d8","d4c4","d8c8","c4d5","c8c7","d5c5"],
    comment: {
      es: 'Si el bando fuerte ya movió su peón de torre, el final sigue ganado mientras el defensor también haya movido el suyo. Esta posición introduce un concepto clave de los finales de peones: las casillas correspondientes, una idea sencilla de entender pero que puede exigir un análisis muy complejo.',
      en: 'If the stronger side has already moved its rook\'s pawn, the ending is still won as long as the defender has moved theirs too. This position introduces a key pawn-endgame concept: corresponding squares — simple to grasp in theory, but sometimes requiring very deep calculation.',
    },
  },
  {
    id: 'p15', category: 'pawn',
    name: { es: 'Knight\'s and rook\'s pawn against rook\'s pawn', en: 'Knight\'s and rook\'s pawn against rook\'s pawn' },
    fen: '8/7p/5k2/8/5K2/8/6PP/8 b - - 0 1',
    moves: ["f6g6","f4g4","g6f6","g4h5","f6g7","g2g3","g7f7","h5h6","f7g8","g3g4","g8h8","g4g5","h8g8","h2h3","g8h8","h3h4","h8g8","h4h5","g8h8","g5g6","h7g6","h5g6","h8g8","g6g7"],
    comment: {
      es: 'Una posición que merece atención doble: aparece muy a menudo en la práctica (incluso grandes maestros se equivocan aquí) y sirve como excelente introducción a ideas clave de los finales de peones — planificación, tiempos de reserva, la regla de Steinitz, oposición y casillas clave.',
      en: 'A position worth double attention: it comes up very often in practice (even grandmasters stumble here), and it\'s a great introduction to key pawn-endgame ideas — planning, reserve tempi, Steinitz\'s rule, opposition, and key squares.',
    },
  },
  {
    id: 'p16', category: 'pawn',
    name: { es: 'King against 2 passed pawns', en: 'King against 2 passed pawns' },
    fen: '8/6k1/6P1/p2p3P/8/8/2K5/8 b - - 0 1',
    moves: ["a5a4","c2c3","g7h6","c3b4","d5d4","b4a4"],
    comment: {
      es: 'Con más peones en el tablero aparecen temas recurrentes que representan una ventaja específica y a menudo decisiva, junto con procedimientos estándar para convertirla en el punto entero.',
      en: 'With more pawns on the board, recurring themes appear that represent a specific, often decisive advantage — along with standard procedures for converting it into a full point.',
    },
  },
  {
    id: 'p17', category: 'pawn',
    name: { es: 'Protected passed pawns', en: 'Protected passed pawns' },
    fen: '8/8/8/1p2kPp1/6P1/4K3/8/8 b - - 0 1',
    moves: ["e5d5","e3d3","d5e5","d3c3","e5d5","c3b4","d5c6","b4a5","c6c5","f5f6","c5d6","a5b5","d6e6","b5c5","e6f6","c5d5"],
    comment: {
      es: 'Un peón pasado y protegido es siempre un gran activo, sobre todo con peones en ambos flancos: obliga al rey rival a quedarse dentro del cuadrado del peón mientras el propio rey queda libre para actuar en otro lugar.',
      en: 'A protected passed pawn is always a big asset, especially with pawns on both wings: it forces the enemy king to stay inside its square to stop promotion, while your own king is free to act elsewhere.',
    },
  },
  {
    id: 'p18', category: 'pawn',
    name: { es: 'Distant passed pawns', en: 'Distant passed pawns' },
    fen: '8/8/3k4/1p2p3/1P2K3/8/7P/8 w - - 0 1',
    moves: ["h2h4","d6e6","h4h5","e6f6","h5h6","f6g6","e4e5","g6h6","e5d5","h6g6","d5c5","g6f6","c5b5","f6e7","b5c6"],
    comment: {
      es: 'Un peón pasado alejado es valioso porque, con solo empujarlo, desvía al rey rival de la lucha principal. Por eso debe estar lejos de los reyes y del resto de debilidades del tablero.',
      en: 'A distant passed pawn is valuable because simply pushing it draws the enemy king away from the main battle. That\'s why it needs to be far from both kings and from any other weaknesses on the board.',
    },
  },
  {
    id: 'p19', category: 'pawn',
    name: { es: 'Crippled majority', en: 'Crippled majority' },
    fen: '8/1p6/4k1p1/1p6/1P2KPP1/8/8/8 w - - 0 1',
    moves: ["f4f5","g6f5","g4f5","e6f6","e4f4","f6f7","f4e5","f7e7","f5f6","e7f7","e5f5","f7e8","f5e6","e8f8","e6d6","f8f7","d6c7","f7f6","c7b7","f6e7","b7c6","e7d8","c6b5"],
    comment: {
      es: 'Un peón doblado suele ser un defecto en cualquier fase de la partida, y en los finales de peones su principal problema es que dificulta — a veces impide del todo — crear un peón pasado. Con una mayoría de peones doblada, es casi como jugar con un peón de menos.',
      en: 'A doubled pawn is usually a liability at any stage of the game, and in pawn endings its main drawback is that it makes creating a passed pawn harder — sometimes impossible. With a doubled majority, it\'s almost like playing a pawn down.',
    },
  },
  {
    id: 'p20', category: 'pawn',
    name: { es: 'Breakthroughs when the king is far', en: 'Breakthroughs when the king is far' },
    fen: '8/ppp5/8/PPP5/8/4k3/8/4K3 w - - 0 1',
    moves: ["b5b6","a7b6","c5c6","b7c6","a5a6"],
    comment: {
      es: 'Con muchos peones móviles lejos de los reyes, siempre hay que vigilar posibles rupturas de peón que, a veces con sacrificios incluidos, aseguran la coronación. El tema es obvio una vez que lo conoces, pero muchos jugadores han caído en esta trampa a lo largo de la historia.',
      en: 'With lots of mobile pawns far from the kings, always watch out for pawn breakthroughs that can force promotion, sometimes via sacrifices. The idea is obvious once you know it, but players have fallen into this trap throughout chess history.',
    },
  },
  {
    id: 'p21', category: 'pawn',
    name: { es: 'Exploiting a mistake', en: 'Exploiting a mistake' },
    fen: '8/6kp/8/7K/8/8/6PP/8 w - - 0 1',
    moves: ["g2g4","h7h6","h5h4","g7g6","h4g3","h6h5"],
    comment: {
      es: 'Continuación práctica del tema anterior: un descuido del bando defensor permite al bando fuerte encontrar la ruptura decisiva.',
      en: 'A practical follow-up to the previous idea: a slip by the defending side lets the stronger side find the decisive breakthrough.',
    },
  },
  {
    id: 'p22', category: 'pawn',
    name: { es: 'An important subvariation', en: 'An important subvariation' },
    fen: '8/8/5k1p/8/5KPP/8/8/8 b - - 0 1',
    moves: ["f6e6","f4e4","e6f6","e4d5","f6e7","d5e5","e7f7","e5f5","f7g7","f5e6","g7g6","h4h5","g6g5","e6f7","g5g4","f7g6","g4f4","g6h6","f4f5","h6g7"],
    comment: {
      es: 'Una subvariante importante del mismo tema de peones de caballo y torre contra peón de torre, que conviene tener presente.',
      en: 'An important sub-line of the same knight\'s-and-rook\'s-pawn-vs-rook\'s-pawn theme, worth keeping in mind.',
    },
  },
  {
    id: 'p23', category: 'pawn',
    name: { es: 'An important subvariation (2)', en: 'An important subvariation (2)' },
    fen: '8/7p/5k2/8/5K2/8/6PP/8 b - - 0 1',
    moves: ["h7h6","g2g4","f6g6","h2h3","g6f6","h3h4","h6h5","g4g5","f6f7","f4e5","f7g7","e5f5","g7f7","g5g6","f7g7","f5g5"],
    comment: {
      es: 'Otra subvariante clave dentro del mismo estudio de peón de caballo y torre contra peón de torre.',
      en: 'Another key sub-line within the same knight\'s-and-rook\'s-pawn-vs-rook\'s-pawn study.',
    },
  },
  {
    id: 'p24', category: 'pawn',
    name: { es: 'Exploiting a terrible mistake', en: 'Exploiting a terrible mistake' },
    fen: '8/7k/p3p1pP/6P1/8/2K5/8/8 w - - 0 1',
    moves: ["c3d4","a6a5","d4c4","e6e5"],
    comment: {
      es: 'Aquí un error grave del bando defensor permite al bando fuerte ganar de la forma más directa posible.',
      en: 'Here a serious mistake by the defending side lets the stronger side win in the most direct way possible.',
    },
  },
  {
    id: 'p25', category: 'pawn',
    name: { es: 'An important subvariation (3)', en: 'An important subvariation (3)' },
    fen: '8/ppp5/8/PPP5/8/4k3/8/4K3 w - - 0 1',
    moves: ["b5b6","c7b6","a5a6"],
    comment: {
      es: 'Una subvariante importante del tema de rupturas de peones con el rey lejos, que muestra otra forma de ejecutar la idea.',
      en: 'An important sub-line of the pawn-breakthrough-with-a-distant-king theme, showing another way to carry out the idea.',
    },
  },
  {
    id: 'p26', category: 'pawn',
    name: { es: 'Defending after a blunder', en: 'Defending after a blunder' },
    fen: '8/ppp5/8/PPP5/8/4k3/8/4K3 w - - 0 1',
    moves: ["e1d1","b7b6"],
    comment: {
      es: 'Qué hacer si el bando defensor comete un error en esta estructura de ruptura de peones — un recurso de última hora que conviene conocer.',
      en: 'What the defending side can try after a mistake in this pawn-breakthrough structure — a last-resort resource worth knowing.',
    },
  },
  // ── ROOK ──────────────────────────────────────────
  {
    id: 'r1', category: 'rook',
    name: { es: 'Rook Pawn', en: 'Rook Pawn' },
    fen: '4R3/8/7K/8/1kp5/8/8/8 w - - 0 1',
    moves: ["h6g5","c4c3","g5f4","c3c2","e8c8","b4b3","f4e3","b3b2","e3d2"],
    comment: {
      es: 'Torre contra peón es la lucha más común y compleja entre una sola pieza y un peón — de hecho, los finales de torre son los más frecuentes de toda la práctica ajedrecística, así que este es de los capítulos más largos e importantes del libro.',
      en: 'Rook vs pawn is the most common and complex single-piece-vs-pawn battle — in fact rook endings are the most frequent ending type in practice overall, which is why this is one of the longest, most important chapters in the book.',
    },
  },
  {
    id: 'r2', category: 'rook',
    name: { es: 'Defending king on the 3rd rank cut off along a rank', en: 'Defending king on the 3rd rank cut off along a rank' },
    fen: '7K/6R1/1k6/p7/8/8/8/8 w - - 0 1',
    moves: ["g7g5","a5a4","h8g7","a4a3","g5g3","a3a2","g3a3"],
    comment: {
      es: 'Cuando el rey y el peón rival aún están lejos de coronar, cortar el paso al rey es un recurso decisivo: si funciona, el resto ya no importa. Es especialmente eficaz con el rey defensor en la 3ª fila.',
      en: 'When the enemy king and pawn are still far from promoting, cutting off the king is a decisive resource: if it works, nothing else matters. It\'s especially effective with the defending king on the 3rd rank.',
    },
  },
  {
    id: 'r3', category: 'rook',
    name: { es: 'Strong king behind the pawn', en: 'Strong king behind the pawn' },
    fen: '7R/8/2K5/8/1pk5/8/8/8 w - - 0 1',
    moves: ["h8h4","c4c3","c6c5","b4b3","h4h3","c3c2","c5c4","b3b2","h3h2","c2c1","c4c3","b2b1n","c3d3","b1a3","d3c3","a3b1","c3b3","b1d2","b3c3","d2b1","c3d3","b1a3","h2a2","a3b1","a2c2","c1d1","c2g2","d1c1"],
    comment: {
      es: 'Un combate duro donde el rey fuerte empuja a su rival por detrás mientras la torre ataca desde el costado. El principal recurso defensivo es coronar a caballo, y la principal idea atacante es rodear.',
      en: 'A tough fight where the strong king pushes its counterpart from behind while the rook attacks from the side. The main defensive resource is underpromoting to a knight, and the main attacking idea is going around.',
    },
  },
  {
    id: 'r4', category: 'rook',
    name: { es: 'Stronger side\'s king on one side', en: 'Stronger side\'s king on one side' },
    fen: '8/8/8/7K/3pk3/8/8/3R4 w - - 0 1',
    moves: ["h5g4","e4e3","g4g3","d4d3","d1e1","e3d2","g3f2"],
    comment: {
      es: 'La torre necesita el apoyo del rey para controlar y capturar el peón rival, así que el rey defensor siempre debe interponerse en su camino. El recurso del \'hombro\' (shouldering) se vuelve crítico cuando el rey fuerte se acerca por el costado.',
      en: 'The rook needs its king\'s support to control and capture the enemy pawn, so the defending king should always stand in its path. The \'shouldering\' resource becomes critical when the stronger king approaches from the side.',
    },
  },
  {
    id: 'r5', category: 'rook',
    name: { es: 'The Rook in front of the pawn', en: 'The Rook in front of the pawn' },
    fen: '8/5K2/8/4pk2/4R3/8/8/8 w - - 0 1',
    moves: ["e4e2","e5e4","e2e1","f5e5","f7e7","e5f4","e7d6","f4f3","d6d5","e4e3","d5d4"],
    comment: {
      es: 'A diferencia de los finales de peones, el zugzwang casi nunca aparece con una torre en el tablero — pero decide la partida cuando la torre controla al peón desde el frente. Esta célebre composición de Réti ilustra el caso.',
      en: 'Unlike pawn endings, zugzwang rarely shows up with a rook on the board — but it decides the game when the rook controls the pawn from the front. This famous Réti composition illustrates the case.',
    },
  },
  {
    id: 'r6', category: 'rook',
    name: { es: 'Special theme with a knight\'s pawn', en: 'Special theme with a knight\'s pawn' },
    fen: '3K4/4R3/8/1p6/8/2k5/8/8 w - - 0 1',
    moves: ["e7c7","c3b3","d8d7","b5b4","d7d6","b3a2","d6c5","b4b3","c5b4","b3b2","c7a7","a2b1","b4b3","b1c1","a7c7","c1b1","c7b7","b1c1","b3a2"],
    comment: {
      es: 'Cerca del borde del tablero los peones siguen reglas propias, y el de caballo no es la excepción: hay temas de ahogado a favor del defensor, pero también una circunstancia que favorece a la torre si el rey defensor se ve forzado a la columna de torre.',
      en: 'Near the edge of the board, pawns follow their own rules, and the knight\'s pawn is no exception: there are stalemate themes favoring the defender, but also a circumstance that favors the rook if the defending king is forced onto the rook\'s file.',
    },
  },
  {
    id: 'r7', category: 'rook',
    name: { es: 'The rook\'s pawn. Pushing from the rear', en: 'The rook\'s pawn. Pushing from the rear' },
    fen: '7R/8/1K6/8/pk6/8/8/8 w - - 0 1',
    moves: ["h8h4","b4b3","b6b5","a4a3","h4h3","b3b2","b5b4","a3a2","h3h2","b2b1","b4b3","a2a1n","b3c3"],
    comment: {
      es: 'Contra un peón de torre, la presión del rey desde atrás es muy eficaz y las blancas ganan sin sutilezas — muy distinto al caso del caballo en la esquina, que ya sabemos perdido.',
      en: 'Against a rook\'s pawn, pressure from the king behind is very effective and White wins without any subtleties — very different from the knight-in-the-corner case, which we already know is lost.',
    },
  },
  {
    id: 'r8', category: 'rook',
    name: { es: 'The rook\'s pawn. Lateral push', en: 'The rook\'s pawn. Lateral push' },
    fen: '7R/8/8/8/8/8/pk1K4/8 w - - 0 1',
    moves: ["h8b8","b2a1","b8a8","a1b2","a8b8","b2a1","b8c8","a1b2"],
    comment: {
      es: 'Un peón de torre no puede salvarse coronando a caballo, pero las posibilidades de ahogado compensan esa carencia — por eso algunos jugadores confían sus esperanzas de tablas al peón de torre, aunque sea un error.',
      en: 'A rook\'s pawn can\'t save itself by underpromoting to a knight, but stalemate chances make up for that — which is why some players pin their drawing hopes on a rook\'s pawn, even though it\'s a mistake.',
    },
  },
  {
    id: 'r9', category: 'rook',
    name: { es: 'The pawn wins against the rook', en: 'The pawn wins against the rook' },
    fen: '8/2P2k2/3K4/5r2/8/8/8/8 b - - 0 1',
    moves: ["f5f6","d6d5","f6f5","d5d4","f5f4","d4d3","f4f3","d3c2","f3f2","c2b3","f2f3","b3b4","f3f4","b4b5","f4f5","b5b6","f5f6","b6b7"],
    comment: {
      es: 'Normalmente es la torre quien intenta ganar, pero hay un escenario donde el peón le complica la vida y hasta puede ganarle — el más conocido es la célebre posición Barbier-Saavedra, con temas de ahogado y subcoronación.',
      en: 'Usually it\'s the rook trying to win, but there\'s one scenario where the pawn causes real trouble and can even win outright — the best-known example is the famous Barbier-Saavedra position, involving stalemate and underpromotion themes.',
    },
  },
  {
    id: 'r10', category: 'rook',
    name: { es: 'Kings play no part', en: 'Kings play no part' },
    fen: '8/8/P7/1P5k/8/8/7K/5r2 w - - 0 1',
    moves: ["b5b6","f1b1","a6a7"],
    comment: {
      es: 'La lucha de torre contra más de un peón también es frecuente, y con dos peones conectados hay maniobras muy concretas que conviene conocer. En general, se suele sobrestimar la fuerza de los peones.',
      en: 'Rook against more than one pawn is also common, and with two connected pawns there are very specific maneuvers worth knowing. In general, players tend to overrate the strength of the pawns.',
    },
  },
  {
    id: 'r11', category: 'rook',
    name: { es: 'Both kings play a part', en: 'Both kings play a part' },
    fen: 'r3k3/8/3PP3/3K4/8/8/8/8 w - - 0 1',
    moves: ["d5e5","a8a1","e5d5","a1e1","d6d7","e8e7"],
    comment: {
      es: 'Cuando el rey y la torre trabajan juntos para detener los peones, suelen ganar. Si el rey fuerte llega delante de los peones, ya nada salva al defensor salvo la coronación misma.',
      en: 'When the king and rook work together to stop the pawns, they usually win. If the stronger king gets in front of the pawns, nothing but promotion itself can save the defender.',
    },
  },
  {
    id: 'r12', category: 'rook',
    name: { es: 'Only the defending king plays a part', en: 'Only the defending king plays a part' },
    fen: '8/8/5KP1/5P2/8/2k4r/8/8 b - - 0 1',
    moves: ["h3f3","g6g7","f3g3","f6f7","c3d4","f5f6","d4e5"],
    comment: {
      es: 'Cuando el rey apoya a sus peones y el rival está lejos, los peones pueden ganar — pero la torre tiene más recursos de los que parece: empujar un peón, cambiarlo por la torre y coronar el otro.',
      en: 'When the king supports its pawns and the opponent is far away, the pawns can win — but the rook has more resources than it looks like: push one pawn, trade it for the rook, and promote the other.',
    },
  },
  {
    id: 'r13', category: 'rook',
    name: { es: 'The rook\'s pawn. Defending king in front of the pawn', en: 'The rook\'s pawn. Defending king in front of the pawn' },
    fen: '8/8/8/8/8/6kp/8/6K1 w - - 0 1',
    moves: ["g1h1","h3h2"],
    comment: {
      es: 'Todo lo dicho hasta ahora vale para cualquier peón excepto el de torre, que merece atención especial: en un final de peones es el más difícil de coronar porque necesita el camino completamente libre, por el riesgo de ahogado en la 7ª fila.',
      en: 'Everything said so far holds for every pawn except the rook\'s pawn, which needs special attention: in a pure pawn ending it\'s the hardest to promote, since it needs a completely clear path due to the stalemate risk on the 7th rank.',
    },
  },
  {
    id: 'r14', category: 'rook',
    name: { es: 'The Philidor Position', en: 'The Philidor Position' },
    fen: '4k3/R7/8/3KP3/8/6r1/8/8 b - - 0 1',
    moves: ["g3g6","e5e6","g6g1","d5d6","g1d1","d6e5","d1e1","e5f6","e1f1"],
    comment: {
      es: 'Si el rey defensor se planta en el camino del peón, ya tiene medio camino ganado hacia las tablas. La Posición Philidor es el sistema defensivo más sencillo de todos, y funciona contra cualquier peón.',
      en: 'If the defending king plants itself in the pawn\'s path, it\'s already halfway to a draw. The Philidor Position is the simplest of all defensive systems, and it works against any pawn.',
    },
  },
  {
    id: 'r15', category: 'rook',
    name: { es: 'The Lucena Position. The bridge', en: 'The Lucena Position. The bridge' },
    fen: '3K4/3P1k2/8/8/8/8/7r/4R3 b - - 0 1',
    moves: ["h2c2","e1f1","f7g7","f1f4","c2c1","d8e7","c1e1","e7d6","e1d1","d6e6","d1e1","e6d5","e1d1","f4d4"],
    comment: {
      es: 'Si el rey defensor no logra plantarse delante del peón, la partida suele terminar en la Posición Lucena — el procedimiento ganador más frecuente de todos los finales de torre y peón contra torre, mediante la célebre maniobra del \'puente\'.',
      en: 'If the defending king fails to get in front of the pawn, play usually leads to the Lucena Position — the single most common winning procedure in rook-and-pawn-vs-rook endings, using the famous \'building a bridge\' maneuver.',
    },
  },
  {
    id: 'r16', category: 'rook',
    name: { es: 'The long side', en: 'The long side' },
    fen: '4K3/4P1k1/8/8/8/8/r7/5R2 b - - 0 1',
    moves: ["a2a8","e8d7","a8a7","d7d8","a7a8","d8c7","a8a7","c7d6","a7a6","d6c5","a6e6"],
    comment: {
      es: 'El capítulo de finales de torre es denso y se divide en secciones que giran en torno a cuatro ideas relacionadas: Philidor, Kling & Horwitz, el lado largo y Lucena. Si el defensor no alcanza Philidor o K&H, el peón llegará a la 7ª fila y aparecerá Lucena — es decir, gana el bando fuerte.',
      en: 'The rook-endings chapter is dense and splits into sections built around four related ideas: Philidor, Kling & Horwitz, the long side, and Lucena. If the defender can\'t reach Philidor or K&H, the pawn will reach the 7th rank and Lucena appears — meaning the stronger side wins.',
    },
  },
  {
    id: 'r17', category: 'rook',
    name: { es: 'The knight\'s pawn. First-rank defence', en: 'The knight\'s pawn. First-rank defence' },
    fen: '1k6/7R/8/KP6/8/8/8/2r5 w - - 0 1',
    moves: ["a5a6","c1c8","b5b6","c8f8","h7b7","b8a8","b7a7","a8b8","a7h7","f8g8"],
    comment: {
      es: 'Además de Philidor hay otras técnicas defensivas complementarias. Con el peón de caballo (igual que con el de torre) existe un recurso alternativo, incluso más sencillo.',
      en: 'Beyond Philidor there are other complementary defensive techniques. With a knight\'s pawn (just like a rook\'s pawn) there\'s an alternative, even simpler resource available.',
    },
  },
  {
    id: 'r18', category: 'rook',
    name: { es: 'Central or bishop pawns. Kling and Horwitz (K&H) defensive technique', en: 'Central or bishop pawns. Kling and Horwitz (K&H) defensive technique' },
    fen: '4k3/7R/8/3KPr2/8/8/8/8 b - - 0 1',
    moves: ["f5f1","d5d6","f1e1","d6e6","e8f8","h7h8","f8g7","h8a8","e1e2","e6d6","g7f7","a8a7","f7e8","d6e6","e8f8"],
    comment: {
      es: 'Una variante entrenable relacionada con la técnica defensiva Kling & Horwitz.',
      en: 'A trainable variation related to the Kling & Horwitz defensive technique.',
    },
  },
  {
    id: 'r19', category: 'rook',
    name: { es: 'Central or bishop pawns. Kling and Horwitz (K&H) defensive technique (2)', en: 'Central or bishop pawns. Kling and Horwitz (K&H) defensive technique (2)' },
    fen: '4k3/7R/8/3KPr2/8/8/8/8 b - - 0 1',
    moves: ["f5f1","d5d6","f1e1","d6e6","e8d8","h7h8","d8c7","e6f6","c7d7","h8h7","d7e8","f6e6","e8d8","h7h8","d8c7","h8e8","e1h1","e8f8","h1e1"],
    comment: {
      es: '¿Es la Posición Philidor el único recurso defensivo posible? No — contra un peón central o de alfil, colocar la torre detrás del peón (la técnica Kling & Horwitz) también sirve, aunque la defensa es algo más exigente.',
      en: 'Is the Philidor Position the only defensive resource available? No — against a central or bishop\'s pawn, placing the rook behind the pawn (the Kling & Horwitz technique) also works, though the defense is a bit trickier.',
    },
  },
  {
    id: 'r20', category: 'rook',
    name: { es: 'Central 6th-rank pawn. Rook with distant effectiveness', en: 'Central 6th-rank pawn. Rook with distant effectiveness' },
    fen: 'r7/3RK1k1/4P3/8/8/8/8/8 w - - 0 1',
    moves: ["d7d8","a8a7","d8d7","a7a8","d7d6","g7g6","d6d7","g6g7","d7c7","g7g6"],
    comment: {
      es: 'Uno de los finales más difíciles del capítulo: con el peón ya en la 5ª, 6ª o 7ª fila y el rey defensor sin poder ocupar una posición frontal, el único método eficaz es ocupar el lado largo con la torre.',
      en: 'One of the hardest endings in the chapter: once the pawn reaches the 5th, 6th, or 7th rank and the defending king can\'t reach a frontal position, the only effective method is to occupy the long side with the rook.',
    },
  },
  {
    id: 'r21', category: 'rook',
    name: { es: 'Central 6th-rank pawn. Rook without distant effectiveness', en: 'Central 6th-rank pawn. Rook without distant effectiveness' },
    fen: '1r6/R3K1k1/4P3/8/8/8/8/8 w - - 0 1',
    moves: ["e7d6","g7f6","d6d7","f6g7","d7e7","g7g6","a7a1","b8b7","e7d8","b7b8","d8c7","b8b2","a1e1","b2c2","c7d7","c2d2","d7e8","d2a2","e6e7"],
    comment: {
      es: 'Cuando la torre defensora no tiene efectividad a distancia y hay un peón central en la 6ª fila, el final está ganado — pero con una secuencia tan precisa que sería casi imposible encontrarla sobre el tablero sin conocerla de antemano.',
      en: 'When the defending rook has no distant effectiveness and there\'s a central pawn on the 6th rank, the ending is won — but with a sequence so precise it would be nearly impossible to find over the board without already knowing it.',
    },
  },
  {
    id: 'r22', category: 'rook',
    name: { es: 'Cutting off along one file', en: 'Cutting off along one file' },
    fen: '7r/8/4k3/8/2P5/2K5/8/3R4 b - - 0 1',
    moves: ["h8c8","c3b4","c8b8","b4c5","b8c8","c5b5","c8b8","b5a6","b8c8","d1d4","e6e5","d4d5","e5e6","a6b5","c8b8","b5a4","b8c8","a4b4","c8b8","d5b5","b8h8","b5b7","e6d6","b4b5","h8h5","b5b6","h5c5","b7d7","d6d7","b6c5","d7c7"],
    comment: {
      es: 'Aquí el peón está más atrasado, lo que hace la posición algo más fácil de entender, pero el lado largo ya no es la única esperanza del defensor: hace falta además cortar al rey rival, en fila o en columna.',
      en: 'Here the pawn is further back, which makes the position a bit easier to grasp, but the long side is no longer the defender\'s only hope: the enemy king also needs to be cut off, whether along a file or a rank.',
    },
  },
  {
    id: 'r23', category: 'rook',
    name: { es: 'Rook Bishop - The wrong corner', en: 'Rook Bishop - The wrong corner' },
    fen: '6k1/5R2/6K1/8/8/8/8/6b1 w - - 0 1',
    moves: ["f7f1","g1h2","f1h1","h2g3","h1g1","g3h2","g1g2","h2d6","g2d2","d6e7","d2c2","e7f8","c2c8"],
    comment: {
      es: 'Torre contra alfil suele ser tablas, pero hay que tener cuidado cuando el rey defensor es empujado a la esquina \'equivocada\' — la del mismo color que las casillas del alfil rival. Ahí, sin importar dónde esté el alfil, el rey queda perdido.',
      en: 'Rook vs bishop is usually a draw, but care is needed when the defending king gets pushed into the \'wrong\' corner — the one matching the color of the enemy bishop\'s squares. There, no matter where the bishop is, the king is lost.',
    },
  },
  {
    id: 'r24', category: 'rook',
    name: { es: 'Defending king cut off by 2 files. Grigoriev\'s combined method.', en: 'Defending king cut off by 2 files. Grigoriev\'s combined method.' },
    fen: '2r5/8/5k2/8/2P5/2K5/8/4R3 w - - 0 1',
    moves: ["c3b4","c8b8","b4a5","b8c8","a5b5","c8b8","b5a6","b8c8","e1c1","f6e7","a6b7","c8c5","b7b6","c5h5","c4c5","e7d8","c1d1","d8c8","d1g1","h5h8","c5c6","h8f8","g1a1","c8b8","c6c7","b8c8","a1a8"],
    comment: {
      es: 'Si con el rey cortado por una sola columna el defensor puede salvarse colocando torre y rey en el sitio justo, ¿qué pasa cortado por dos? Con un peón central o de alfil, el final se gana con el método de Grigoriev.',
      en: 'If a king cut off by just one file can still be saved by placing the rook and king correctly, what happens when it\'s cut off by two? With a central or bishop\'s pawn, the ending is won using Grigoriev\'s method.',
    },
  },
  {
    id: 'r25', category: 'rook',
    name: { es: 'King cut off along 2 files long side. Mating themes', en: 'King cut off along 2 files long side. Mating themes' },
    fen: '3r4/8/k7/8/3P4/3K4/8/1R6 w - - 0 1',
    moves: ["d3c4","d8c8","c4d5","c8d8","d5c6","d8c8","c6d7","c8c2","d4d5"],
    comment: {
      es: '¿Importa el lado largo cuando el rey está cortado por columnas? Sí, para la técnica, aunque no cambia el resultado: con dos columnas de corte hay un único escenario de lado largo, y ahí el defensor pierde por temas de mate.',
      en: 'Does the long side matter when the king is cut off by files? Yes, for technique, though it doesn\'t change the result: with a two-file cutoff there\'s exactly one long-side scenario, and there the defender loses due to mating themes.',
    },
  },
  {
    id: 'r26', category: 'rook',
    name: { es: 'Perfect Cut along a rank', en: 'Perfect Cut along a rank' },
    fen: '1r6/8/8/2R5/1P1k4/1K6/8/8 b - - 0 1',
    moves: ["b8a8","c5c6","a8b8","c6a6","d4d5","b3a4","d5c4","a6c6","c4d5","b4b5","b8a8","a4b4","a8b8","c6c7","d5d6","c7a7","d6d5","b4a5","d5c5","a7c7","c5d6","b5b6","b8a8","a5b5","a8a1"],
    comment: {
      es: 'Hay dos formas de cortar al rey; esta es la más simple y eficaz, aplicable desde la 4ª fila en adelante. Aquí la torre le impide al rey cruzar filas para llegar a la zona de coronación.',
      en: 'There are two ways to cut off the king; this is the simplest and most effective one, applicable from the 4th rank onward. Here the rook stops the king from crossing ranks to reach the promotion zone.',
    },
  },
  {
    id: 'r27', category: 'rook',
    name: { es: 'Imperfect Cut along a rank', en: 'Imperfect Cut along a rank' },
    fen: '2r5/8/7R/4k3/2P5/2K5/8/8 b - - 0 1',
    moves: ["c8b8","h6g6","b8b7","c4c5","e5d5"],
    comment: {
      es: 'El corte es \'imperfecto\' cuando el rey defensor queda cortado en fila pero se mantiene una fila por delante del peón — aquí el bando fuerte no tiene tanta ventaja, y con las negras a mover son tablas.',
      en: 'The cut is \'imperfect\' when the defending king is cut off along a rank but stays one rank ahead of the pawn — here the stronger side\'s advantage is smaller, and with Black to move it\'s a draw.',
    },
  },
  {
    id: 'r28', category: 'rook',
    name: { es: 'Apparent Cut along a rank', en: 'Apparent Cut along a rank' },
    fen: '4r3/8/8/5R2/4P1k1/4K3/8/8 b - - 0 1',
    moves: ["e8a8","f5c5","a8d8","c5d5","d8a8","e3d4","g4f4","d5f5","f4g4"],
    comment: {
      es: 'En realidad esto es defensa por el lado largo, aunque muchos jugadores confunden ambos escenarios: cortar en fila no basta para ganar contra una defensa de lado largo, y aquí se ve por qué el corte resulta inofensivo.',
      en: 'This is actually long-side defense, though many players confuse the two scenarios: cutting off along a rank isn\'t enough to win against a long-side defense, and here we see why the cut turns out harmless.',
    },
  },
  {
    id: 'r29', category: 'rook',
    name: { es: 'Pawn on the 7th rank. Attacking rook in front of the pawn', en: 'Pawn on the 7th rank. Attacking rook in front of the pawn' },
    fen: 'R7/P4k2/8/8/8/8/6K1/r7 b - - 0 1',
    moves: ["f7g7","g2f3","g7h7","f3e4","h7g7","e4d5","g7h7","d5c6","h7g7","c6b6","a1b1","b6a6","b1a1","a6b5","g7h7"],
    comment: {
      es: 'El peón de torre tiene tanta teoría propia que merece su propia sección — aparece muy a menudo, porque los peones de torre suelen sobrevivir mucho tiempo en el tablero. Las probabilidades de tablas aquí son mucho más altas.',
      en: 'The rook\'s pawn has so much of its own theory that it gets its own section — it comes up very often, since rook\'s pawns tend to survive a long time on the board. Drawing chances here are much higher than usual.',
    },
  },
  {
    id: 'r30', category: 'rook',
    name: { es: 'Pawn on the 6th rank. The Vancura Defence', en: 'Pawn on the 6th rank. The Vancura Defence' },
    fen: 'R7/5k2/P7/8/8/8/6K1/r7 b - - 0 1',
    moves: ["f7g7","g2f3","a1f1","f3e4","f1f6","e4d5","f6b6","d5c5","b6f6","c5b5","f6f5","b5b6","f5f6","b6b7","f6f7","b7b6","f7f6","b6c5","f6f5","c5d4","f5f6"],
    comment: {
      es: 'Si el peón de torre no debería llegar a la 7ª fila salvo que el rey negro no pueda pisar g7-h7, ¿qué hacer con él en la 6ª? Llevarlo ahí y mantenerlo a salvo es la idea central de la Defensa Vancura.',
      en: 'If the rook\'s pawn shouldn\'t reach the 7th rank unless Black\'s king can\'t reach g7-h7, what should it do on the 6th? Getting it there and keeping it safe is the core idea of the Vancura Defence.',
    },
  },
  {
    id: 'r31', category: 'rook',
    name: { es: 'Pawn on the 6th rank. The Vancura Defence (2)', en: 'Pawn on the 6th rank. The Vancura Defence (2)' },
    fen: 'R7/6k1/P7/8/8/5K2/8/r7 b - - 0 1',
    moves: ["a1a5","f3e4","a5b5","a8a7","g7g6","a7b7","b5a5","a6a7","g6f6","b7h7","f6g6","h7c7","g6f6","e4d4","f6e6","d4c4","e6d6"],
    comment: {
      es: 'Con la Defensa Vancura ya conocida, aplicarla es sencillo — y sin embargo muchos jugadores de título han perdido esta posición de tablas. Prueba de que, si no la conoces, no la vas a encontrar sobre el tablero.',
      en: 'Now that the Vancura Defence is known, applying it is easy — and yet plenty of titled players have lost this drawn position anyway. Proof that if you don\'t already know it, you won\'t find it over the board.',
    },
  },
  {
    id: 'r32', category: 'rook',
    name: { es: 'Exploiting a mistake', en: 'Exploiting a mistake' },
    fen: 'R7/6k1/P7/8/8/5K2/8/r7 b - - 0 1',
    moves: ["a1a2","f3e4","a2a5","e4d4","a5b5","a8a7","g7f6","a7h7","b5a5","a6a7","f6e6","d4c4","e6d6","c4b4","a5a1","b4b5","a1b1","b5a6","b1a1","a6b7","a1b1","b7c8","b1a1","c8b8","a1g1"],
    comment: {
      es: 'Qué pasa si el bando defensor se equivoca aplicando la Defensa Vancura: el bando fuerte tiene la oportunidad de castigarlo de inmediato.',
      en: 'What happens if the defending side slips up while applying the Vancura Defence: the stronger side gets the chance to punish it immediately.',
    },
  },
  {
    id: 'r33', category: 'rook',
    name: { es: 'The king is in front of the pawn and the pawn is on the 7th rank', en: 'The king is in front of the pawn and the pawn is on the 7th rank' },
    fen: 'K7/P4k2/8/8/8/8/4R3/1r6 w - - 0 1',
    moves: ["e2h2","f7e7","h2h8","e7d6","h8b8","b1a1","a8b7","a1b1","b7c8","b1c1","c8d8","c1h1","b8b6","d6c5","b6c6","c5b5","c6c8","h1h8","d8c7","h8h7","c7b8"],
    comment: {
      es: 'Ahora vemos qué ocurre cuando el rey atacante va delante de su propio peón. Si el rey fuerte apoya al peón sin taparle el paso, la torre rival lo obligará a estorbarlo mediante jaques.',
      en: 'Now let\'s see what happens when the attacking king stands in front of its own pawn. If the strong king supports the pawn without blocking it, the enemy rook will force it to get in the way through checks.',
    },
  },
  {
    id: 'r34', category: 'rook',
    name: { es: 'The rook and the king support the pawn', en: 'The rook and the king support the pawn' },
    fen: '8/1K1k4/2R5/P7/8/8/8/7r b - - 0 1',
    moves: ["h1b1","c6b6","b1c1","a5a6","c1c7","b7a8","c7c8","a8a7","c8c7","b6b7","d7c8","a7b6","c7c1","b7h7","c1b1","b6a7","b1a1"],
    comment: {
      es: 'Cortar al rey rival por menos de cuatro columnas no basta para llevar el peón a la 7ª fila y sacar al rey de la esquina — salvo que exista una configuración favorable que le dé refugio antes de que el peón llegue.',
      en: 'Cutting off the enemy king by fewer than four files isn\'t enough on its own to push the pawn to the 7th rank and drag the king out of the corner — unless there\'s a favorable setup that shelters the king before the pawn arrives.',
    },
  },
  {
    id: 'r35', category: 'rook',
    name: { es: 'Central pawns', en: 'Central pawns' },
    fen: '3k4/6R1/7r/2KP4/3P4/8/8/8 w - - 0 1',
    moves: ["g7b7","h6g6","b7b6","g6g4","d5d6","g4g1","c5c6","g1c1","c6d5","c1h1","b6b8","d8d7","b8b7","d7d8","d6d7","h1h5","d5c6","h5h6","c6c5","h6h5","d4d5","h5h6","d5d6","h6d6"],
    comment: {
      es: 'En finales de torre hay muchas posiciones donde dos peones de más no bastan para ganar — solo los finales de alfiles de distinto color son más propensos a tablas. Vale la pena conocer estas ideas: ocurren a menudo y sirven de base para finales con más peones.',
      en: 'In rook endings there are many positions where two extra pawns aren\'t enough to win — only opposite-colored bishop endings have a higher drawing tendency. These ideas are worth knowing: they come up often and serve as a foundation for endings with more pawns.',
    },
  },
  {
    id: 'r36', category: 'rook',
    name: { es: 'Rook Bishop - The right corner', en: 'Rook Bishop - The right corner' },
    fen: '7k/R7/7K/8/8/1b6/8/8 w - - 0 1',
    moves: ["a7a8","b3g8","a8a7","g8b3","h6g6","b3c4","a7h7","h8g8","h7c7","c4d3","g6h6","d3e4"],
    comment: {
      es: 'La otra esquina es una historia completamente distinta: defenderla es tan fácil que dirigirse ahí de inmediato es una idea perfectamente sana, sin apenas posibilidades de que gane el bando fuerte.',
      en: 'The other corner is a completely different story: it\'s so easy to defend that heading straight there is a perfectly sound plan, with barely any winning chances left for the stronger side.',
    },
  },
  {
    id: 'r37', category: 'rook',
    name: { es: 'Knight\'s pawns - punishing careless play', en: 'Knight\'s pawns - punishing careless play' },
    fen: '8/6p1/8/8/1R4pk/r7/6K1/8 w - - 0 1',
    moves: ["b4b8","a3a2","g2g1","h4h3","b8b3","g4g3","b3b1","a2a3","b1c1","g7g5","c1b1","g5g4","b1c1","g3g2","c1b1","a3f3","b1a1","f3f1","a1f1","g2f1q","g1f1","h3h2"],
    comment: {
      es: 'Si la defensa Kling & Horwitz es el único recurso válido y no funciona contra un peón de caballo... ¿qué pasa con DOS peones de caballo doblados? La defensa de primera fila tampoco sirve aquí, ya que el bando fuerte puede cambiar uno de los peones.',
      en: 'If Kling & Horwitz is the only valid resource and it doesn\'t work against a knight\'s pawn... what about TWO doubled knight\'s pawns? First-rank defense doesn\'t work here either, since the stronger side can trade off one of the pawns.',
    },
  },
  {
    id: 'r38', category: 'rook',
    name: { es: 'Defending king cut off on the back rank', en: 'Defending king cut off on the back rank' },
    fen: '6k1/1R6/5P1P/6K1/8/8/8/r7 b - - 0 1',
    moves: ["a1g1","g5f5","g1f1","f5e6","f1e1","e6d6","e1d1","d6e7","d1e1","e7d8","e1d1","d8e8","d1e1","b7e7","e1f1","f6f7","g8h8","e7e6"],
    comment: {
      es: 'Un segundo escenario de tablas muy famoso pero poco comprendido: con torre y peón de alfil casi todo el mundo sabe que es tablas, pero muy pocos se atreven a defenderlo bien — conocer que son tablas no basta, también hace falta paciencia.',
      en: 'A second, very famous but poorly understood drawing scenario: with a rook and bishop\'s pawn almost everyone knows it\'s a draw, but very few dare to defend it well — knowing the result isn\'t enough, it also takes patience.',
    },
  },
  {
    id: 'r39', category: 'rook',
    name: { es: 'Bishop\'s pawn on the 5th rank', en: 'Bishop\'s pawn on the 5th rank' },
    fen: '6k1/1R6/7P/5PK1/8/8/8/2r5 b - - 0 1',
    moves: ["c1g1","g5f6","g1h1","b7g7","g8f8","f6g6","h1g1","g6h7","g1f1","g7a7","f1g1","f5f6","g1g2","a7g7","g2f2","h7g6"],
    comment: {
      es: 'Las blancas amenazan avanzar el peón para alcanzar la posición del ejemplo anterior — así que toca decidir cómo reaccionar.',
      en: 'White threatens to push the pawn forward to reach the position from the previous example — so it\'s time to decide how to react.',
    },
  },
  {
    id: 'r40', category: 'rook',
    name: { es: 'The defensive procedure', en: 'The defensive procedure' },
    fen: '8/6k1/R7/1r5P/5PK1/8/8/8 w - - 0 1',
    moves: ["a6g6","g7f7","g6g5","b5b1","g5c5","f7f6","c5c6","f6g7","g4g5","b1g1","g5f5","g1a1","c6c7","g7h6","c7e7","a1b1","e7e8","h6g7","e8e5","b1a1","e5d5","a1f1","d5d4","f1a1","d4d6","a1a5","f5g4","a5a1","d6e6","a1g1","g4f5","g1a1","h5h6","g7h7","e6d6","a1a2","f5g5","a2g2","g5f6","h7h6","f6e7","h6h7","f4f5","g2e2","d6e6","e2a2","f5f6","a2a8","e7f7","h7h6","e6e1","a8a7","e1e7","a7a8","e7d7","h6h7","d7d1","a8a7","f7e6","a7a6","d1d6","a6a8","d6d4","h7g8","d4g4","g8f8"],
    comment: {
      es: 'Con los peones menos avanzados, y sobre todo si el rey defensor no ha sido empujado a la última fila, las posibilidades de tablas aumentan. Un esquema perfecto de las ideas defensivas, tomado de la partida real Gligoric-Smyslov.',
      en: 'With the pawns less advanced, and especially if the defending king hasn\'t been pushed to the back rank, drawing chances go up. A perfect outline of the defensive ideas, taken from the real game Gligoric-Smyslov.',
    },
  },
  {
    id: 'r41', category: 'rook',
    name: { es: 'Blocked connected pawns', en: 'Blocked connected pawns' },
    fen: '8/8/r5kP/6P1/1R3K2/8/8/8 w - - 0 1',
    moves: ["b4d4","a6b6","d4d8","b6b4","f4e5","b4b7","d8g8","g6h7","g8e8","h7g6","e5f4","b7b4","f4e5","b4b7"],
    comment: {
      es: 'Suena casi absurdo: dos peones conectados deberían ganar sin problema... pero si el rey defensor logra colarse entre ellos y bloquearlos, no hay mucho que hacer. Kling y Horwitz ya estudiaron esta posición con peones de torre y caballo en 1851.',
      en: 'It sounds almost absurd: two connected pawns should win easily... but if the defending king manages to slip between them and blockade them, there isn\'t much to be done. Kling and Horwitz already studied this position with rook\'s and knight\'s pawns back in 1851.',
    },
  },
  {
    id: 'r42', category: 'rook',
    name: { es: 'Attacking rook stuck in front of the 7th-rank pawn', en: 'Attacking rook stuck in front of the 7th-rank pawn' },
    fen: 'R7/P5k1/8/8/8/6P1/6K1/r7 w - - 0 1',
    moves: ["g2f3","a1a2","f3e4","a2a1","e4d5","a1a2","d5c6","a2a1","c6b6","a1b1","b6c6","b1a1","g3g4","a1a2","g4g5","a2a1","g5g6","a1a2","c6b7","a2b2"],
    comment: {
      es: 'Probablemente el escenario de tablas más conocido de todos: si un peón pasado llega a la 7ª fila con la propia torre delante, la torre queda totalmente pasiva y convertir una ventaja de dos peones en victoria se vuelve muy difícil.',
      en: 'Probably the best-known drawing scenario of all: if a passed pawn reaches the 7th rank with your own rook stuck in front of it, the rook becomes completely passive, and turning a two-pawn advantage into a win becomes very hard.',
    },
  },
  {
    id: 'r43', category: 'rook',
    name: { es: 'Vancura Defence against 2 pawns', en: 'Vancura Defence against 2 pawns' },
    fen: 'R7/6k1/8/8/P6P/6K1/8/4r3 b - - 0 1',
    moves: ["e1e4","a4a5","e4e5","g3f3","e5h5","f3g3","h5c5","a5a6","c5c6","g3f4","g7h7","f4e5","c6b6","e5d5","b6g6","d5c5","g6f6","c5b5","f6f5","b5b6","f5f6"],
    comment: {
      es: 'El escenario menos conocido de todos, aunque el más frecuente en la práctica: hay posiciones de tablas con peones de las columnas \'a\' y \'h\', la más importante siendo una extensión de la Defensa Vancura.',
      en: 'The least-known scenario of all, yet the most common one in practice: there are drawing positions with a- and h-pawns, the most important being an extension of the Vancura Defence.',
    },
  },
  {
    id: 'r44', category: 'rook',
    name: { es: 'Rook Knight - At the edge of the board', en: 'Rook Knight - At the edge of the board' },
    fen: '8/8/8/8/8/3k4/r7/3NK3 w - - 0 1',
    moves: ["d1f2","d3e3","f2d1","e3f3","d1c3","a2c2","c3d1","c2e2","e1f1","e2h2","f1e1","h2c2","e1f1"],
    comment: {
      es: 'Contra una torre, el caballo puede sufrir más que el alfil, aunque casi todas las posiciones son tablas. La clave es mantener al caballo cerca de su rey — separado de él, corre el riesgo de perderse.',
      en: 'Against a rook, the knight can suffer more than the bishop, though most positions are still drawn. The key is keeping the knight close to its king — separated from it, the knight risks getting trapped.',
    },
  },
  {
    id: 'r45', category: 'rook',
    name: { es: 'Rook Knight - In the corner', en: 'Rook Knight - In the corner' },
    fen: '8/8/8/8/8/6k1/r7/6NK w - - 0 1',
    moves: ["a8a8"],
    comment: {
      es: 'Todo cambia radicalmente cuando el rey y el caballo quedan juntos en una esquina: su movilidad se reduce tanto que la posición queda perdida de inmediato, sin importar quién mueva.',
      en: 'Everything changes radically once the king and knight end up together in a corner: their mobility shrinks so much that the position is immediately lost, no matter who is to move.',
    },
  },
  {
    id: 'r46', category: 'rook',
    name: { es: 'The king is on the edge', en: 'The king is on the edge' },
    fen: '3k4/4r3/3K4/3B4/8/8/8/5R2 w - - 0 1',
    moves: ["f1f8","e7e8","f8f7","e8e2","f7h7","e2e1","h7b7","e1c1","d5b3","c1c3","b3e6","c3d3","e6d5","d3c3","b7d7","d8c8","d7h7","c8b8","h7b7","b8c8","b7b4","c8d8","d5c4"],
    comment: {
      es: 'Torre y alfil contra torre es muy frecuente en la práctica. La teoría lo evalúa como tablas en la mayoría de los casos, pero el bando fuerte suele sacar buenos resultados porque defender es difícil y tedioso — y el cansancio provoca errores.',
      en: 'Rook and bishop vs rook is very common in tournament practice. Theory rates most positions as drawn, but the stronger side still tends to score well, because defending is difficult and tedious — and fatigue leads to mistakes.',
    },
  },
  {
    id: 'r47', category: 'rook',
    name: { es: 'The king is far from the edge. Cochrane defence Part 1', en: 'The king is far from the edge. Cochrane defence Part 1' },
    fen: '8/8/5k2/r7/4BK2/8/7R/8 b - - 0 1',
    moves: ["a5b5","h2h6","f6e7","h6a6","b5c5","e4d3","c5c7","f4e5","c7c5","e5d4","c5g5","d3e4","g5h5","a6g6","h5a5"],
    comment: {
      es: 'En la posición inicial típica de torre+alfil contra torre, el rey defensor puede estar en cualquier lugar lejos del borde. Aquí se estudia la Defensa Cochrane desde el punto de vista del defensor: con juego preciso, se puede resistir.',
      en: 'In the typical starting position of rook+bishop vs rook, the defending king can be almost anywhere, far from the edge. This studies the Cochrane Defence from the defender\'s side: with accurate play, it can hold.',
    },
  },
  {
    id: 'r48', category: 'rook',
    name: { es: 'The king is far from the edge. Cochrane defence Part 2', en: 'The king is far from the edge. Cochrane defence Part 2' },
    fen: '8/4k3/6R1/r7/3KB3/8/8/8 w - - 15 9',
    moves: ["e4d5","a5a1","d4e5","a1e1","d5e4","e1e2"],
    comment: {
      es: 'Continúa la Defensa Cochrane: el rey defensor sigue resistiendo mientras se aleja del borde del tablero.',
      en: 'The Cochrane Defence continues: the defending king keeps holding on while staying away from the edge of the board.',
    },
  },
  {
    id: 'r49', category: 'rook',
    name: { es: 'The king is far from the edge. Cochrane defence Part 4', en: 'The king is far from the edge. Cochrane defence Part 4' },
    fen: '8/8/8/r2BK1k1/8/8/8/5R2 w - - 53 28',
    moves: ["f1g1","g5h5","g1h1","h5g5","h1b1","g5h5","b1g1","a5b5","e5d4","h5h6","d5e4","b5g5","g1f1","h6g7","e4f5","g7f6","d4e4","f6e7","f1d1","g5g2","d1d7","e7f6","d7d6","f6e7","d6e6","e7f7","e6a6","g2e2","e4d5","f7e7","f5e4","e2d2","d5e5","d2e2","a6e6","e7d7","e6h6","d7e7","h6h7","e7e8","h7a7","e2e1","e5d5","e8f8","e4f5","e1e7"],
    comment: {
      es: 'Cuarta parte de la Defensa Cochrane, mostrando otra variante de cómo el defensor mantiene su rey a salvo del borde.',
      en: 'Part four of the Cochrane Defence, showing another line of how the defender keeps its king safely away from the edge.',
    },
  },
  {
    id: 'r50', category: 'rook',
    name: { es: 'The king is far from the edge. Cochrane defence Part 3', en: 'The king is far from the edge. Cochrane defence Part 3' },
    fen: '8/4k3/6R1/4K3/4B3/8/4r3/8 w - - 21 12',
    moves: ["g6g7","e7e8","g7a7","e2e1","e5d5","e8f8","e4f5","e1e7","a7a8","f8f7","a8a1","f7f6","f5c8","e7e5","d5d6","e5e2","a1f1","f6g5","c8b7","e2e3","d6d5","e3e2","d5d4","e2e7","b7d5","e7e8","f1f7","e8b8","d4e5","b8b5","f7f1","b5a5"],
    comment: {
      es: 'Tercera parte de la Defensa Cochrane, con el rey defensor todavía resistiendo lejos del borde del tablero.',
      en: 'Part three of the Cochrane Defence, with the defending king still holding on far from the edge of the board.',
    },
  },
  {
    id: 'r51', category: 'rook',
    name: { es: 'Second-rank defence', en: 'Second-rank defence' },
    fen: '8/6R1/7B/3K4/7k/8/4r3/8 b - - 0 1',
    moves: ["h4h3","h6f4","e2g2","g7h7","h3g4","d5e4","g2c2","f4e3","c2g2","h7h1","g4g3","e3f4","g3f2","h1c1","f2e2","c1c3","e2f2","c3a3","f2e2","f4g3","e2f1","a3f3","f1e2","f3e3","e2d2","e4d4","d2d1","e3a3","d1e2","d4e4","e2f1","e4f3","g2f2","f3g4","f2c2","a3e3","c2e2","e3f3","f1g2","f3f4","e2a2","f4e4","a2c2","g3d6","g2f1","d6b4","c2g2","g4h3","g2c2","b4a5","c2a2","a5b6","a2a3","h3g4","a3g3","g4f4","g3f3","f4e5","f1g2","e4e2","g2g3"],
    comment: {
      es: 'La Defensa Cochrane funciona de maravilla en las columnas centrales, pero cuando la posición inicial del rey es más delicada, existe una alternativa: la defensa de segunda fila, sencilla e inquebrantable pese a su aspecto inquietante.',
      en: 'The Cochrane Defence works beautifully on the central files, but when the king\'s starting position is trickier, there\'s an alternative: the second-rank defence — simple and unbreakable, despite how worrying it looks.',
    },
  },
  {
    id: 'r52', category: 'rook',
    name: { es: 'Exploiting a mistake (2)', en: 'Exploiting a mistake (2)' },
    fen: '8/7R/8/8/4KBk1/8/6r1/8 b - - 0 4',
    moves: ["g2c2","h7g7","g4h4","e4f5","c2c5","f4e5"],
    comment: {
      es: 'Qué pasa cuando el bando defensor se equivoca dentro de la Defensa Cochrane: el bando fuerte tiene la ocasión de aprovecharlo de inmediato.',
      en: 'What happens when the defending side slips up within the Cochrane Defence: the stronger side gets the chance to capitalize right away.',
    },
  },
  {
    id: 'r53', category: 'rook',
    name: { es: 'The defensive procedure (2)', en: 'The defensive procedure (2)' },
    fen: '8/6R1/7B/3K4/7k/8/4r3/8 b - - 0 1',
    moves: ["h4h3","h6f4","e2g2","g7h7","h3g4","d5e4","g2e2","f4e3","e2g2","h7g7","g4h3","e3g5","h3g4","g7g8","g4g3","g5f4","g3h3","g8h8","h3g4"],
    comment: {
      es: 'Cuando la posición inicial del rey es delicada, o un descuido impide usar la Defensa Cochrane, todavía queda un recurso: la defensa de segunda fila, consistente en colocar ambas piezas defensoras en la 2ª fila.',
      en: 'When the king\'s starting position is tricky, or a careless move rules out the Cochrane Defence, there\'s still one resource left: the second-rank defence, which involves placing both defending pieces on the 2nd rank.',
    },
  },
  {
    id: 'r54', category: 'rook',
    name: { es: 'Rook + 6th-rank bishop\'s pawn', en: 'Rook + 6th-rank bishop\'s pawn' },
    fen: '5k2/1R6/8/4KP2/2b5/8/8/8 w - - 0 1',
    moves: ["f5f6","c4a2","e5f4","a2c4","f4g5","c4d5","b7c7","d5a2","g5g6","a2b1","g6h6","b1a2","c7a7","a2c4"],
    comment: {
      es: 'Pese a la gran ventaja de material, hay posiciones donde torre y peón no bastan para ganarle a un alfil solitario. Fuera de esos casos, torre y peón casi siempre ganan contra una pieza menor — pero con el peón de alfil hay excepciones cerca de las esquinas.',
      en: 'Despite the huge material advantage, there are positions where a rook and pawn can\'t beat a lone bishop. Outside those cases, rook and pawn almost always win against a minor piece — but with a bishop\'s pawn there are exceptions near the corners.',
    },
  },
  {
    id: 'r55', category: 'rook',
    name: { es: 'Rook + rook\'s pawn Bishop', en: 'Rook + rook\'s pawn Bishop' },
    fen: '7k/R7/7P/6K1/8/8/2b5/8 w - - 0 1',
    moves: ["a7c7","c2d3","g5f6","d3e4","h6h7","e4h7"],
    comment: {
      es: 'Con el peón ya en la 6ª fila, la defensa es incluso más sencilla: el alfil solo necesita mantenerse en la diagonal que controla el avance del peón y capturarlo en cuanto llegue.',
      en: 'With the pawn already on the 6th rank, the defense is even easier: the bishop only needs to stay on the diagonal covering the pawn\'s path and capture it the moment it arrives.',
    },
  },
  // ── QUEEN ──────────────────────────────────────────
  {
    id: 'q1', category: 'queen',
    name: { es: 'Queen Rook + Rook\'s Pawn', en: 'Queen Rook + Rook\'s Pawn' },
    fen: '8/1k6/p5Q1/1r6/1K6/8/8/8 w - - 0 1',
    moves: ["b4c4","b7a7","g6f7","b5b7","f7f2","a7a8","f2e3","a8b8","c4c5","b8a7","c5c6","a7a8","e3e8","a8a7","e8e3","a7a8","e3d4","a8b8","d4h8","b8a7","h8d8","b7b5","d8c8","b5b6","c6c7","b6b5"],
    comment: {
      es: 'Con un peón de torre, la \'fortaleza\' clásica de la 2ª fila no funciona porque hay muy poco espacio para defender — pero esto no significa que la posición esté siempre perdida. Existe una configuración resistente con el peón en la 3ª fila, aunque incluso jugadores de máximo nivel suelen fallar al decidir dónde colocar el rey.',
      en: 'With a rook\'s pawn, the classic 2nd-rank fortress doesn\'t work because there\'s too little room to defend — but that doesn\'t mean the position is always lost. There\'s a resilient setup with the pawn on the 3rd rank, though even top-level players often get the king placement wrong.',
    },
  },
  {
    id: 'q2', category: 'queen',
    name: { es: 'Queen 7th-rank pawn', en: 'Queen 7th-rank pawn' },
    fen: '6K1/8/3Q4/8/8/8/5kp1/8 w - - 0 1',
    moves: ["d6f4","f2e2","f4g3","e2f1","g3f3","f1g1","g8g7","g1h2","f3f2","h2h1","f2h4","h1g1","g7g6","g1f1","h4f4","f1e2","f4g3","e2f1","g3f3","f1g1","g6g5","g1h2","g5h4","g2g1q","f3h3"],
    comment: {
      es: 'El enfrentamiento entre dama y peón surge a menudo tras una carrera de peones y parece sencillo de calcular, pero esconde detalles finos que incluso jugadores fuertes o grandes maestros suelen pasar por alto.',
      en: 'Queen vs pawn often comes up after a pawn race and looks easy to calculate, but it hides subtle details that even strong players and grandmasters regularly overlook.',
    },
  },
  {
    id: 'q3', category: 'queen',
    name: { es: 'Queen 7th-rank rook\'s pawn', en: 'Queen 7th-rank rook\'s pawn' },
    fen: '8/5K1P/8/8/3q4/8/8/2k5 w - - 0 1',
    moves: ["f7g8","d4d8","g8g7","d8g5","g7f7","g5h6","f7g8","h6g6","g8h8","c1d2"],
    comment: {
      es: 'Con un peón de torre o de alfil aparecen temas de ahogado: aquí las negras tienen jaques disponibles, pero forzar al rey a ponerse delante de su propio peón sería un error, ya que quedaría ahogado.',
      en: 'With a rook\'s or bishop\'s pawn, stalemate themes appear: here Black has checks available, but forcing the king in front of its own pawn would be a mistake, since it would end up stalemated.',
    },
  },
  {
    id: 'q4', category: 'queen',
    name: { es: 'Queen 7th-rank rook’s pawn', en: 'Queen 7th-rank rook’s pawn' },
    fen: '8/6KP/8/4k3/3q4/8/8/8 b - - 0 1',
    moves: ["d4d7","g7g6","d7e6","g6g7","e6e7","g7g8","e5f6","h7h8q","f6g6"],
    comment: {
      es: 'En vez de memorizar la típica línea irregular que divide el tablero en zona ganadora y zona de tablas, es mejor entender la idea de fondo: aquí el rey fuerte está lo bastante cerca como para ganar por dos procedimientos distintos.',
      en: 'Instead of memorizing the usual jagged line that splits the board into a winning zone and a drawing zone, it\'s better to understand the underlying idea: here the strong king is close enough to win by either of two standard procedures.',
    },
  },
  {
    id: 'q5', category: 'queen',
    name: { es: 'Queen 7th-rank bishop\'s pawn', en: 'Queen 7th-rank bishop\'s pawn' },
    fen: '8/5P2/3K4/8/8/1k6/8/q7 w - - 0 1',
    moves: ["d6e7","a1e5","e7d7","e5f6","d7e8","f6e6","e8f8","b3c4","f8g7","e6e7","g7g8","e7g5","g8h8","g5f6","h8g8","f6g6","g8h8"],
    comment: {
      es: 'Con un peón de alfil los recursos de ahogado también existen, pero el escenario es más complejo porque el rey defensor puede colocarse a ambos lados del peón, cambiando las posibilidades de tablas.',
      en: 'With a bishop\'s pawn, stalemate resources still exist, but the picture is more complex since the defending king can stand on either side of its pawn, which changes the drawing chances.',
    },
  },
  {
    id: 'q6', category: 'queen',
    name: { es: 'A too-frequent trick', en: 'A too-frequent trick' },
    fen: '8/8/8/3K4/8/4Q3/2p5/1k6 w - - 0 1',
    moves: ["e3b3","b1a1","b3e3","a1b1","e3e4","b1b2","e4e2","b2a1","d5c4","c2c1q","c4b3","c1b1"],
    comment: {
      es: 'Con el rey fuerte justo fuera (pero cerca) de la zona ganadora, la posición son tablas — sin embargo, hay una trampa en la que caen muchísimos jugadores, así que vale la pena conocerla aunque el resultado teórico ya esté claro.',
      en: 'With the strong king just outside (but close to) the winning zone, the position is a draw — but there\'s a trick that trips up a surprising number of players, so it\'s worth knowing even though the theoretical result is already settled.',
    },
  },
  {
    id: 'q7', category: 'queen',
    name: { es: 'Exploiting a typical mistake', en: 'Exploiting a typical mistake' },
    fen: '8/8/8/3K4/4Q3/8/1kp5/8 w KQkq - 0 1',
    moves: ["e4e2","b2b1","d5c4","c2c1q","c4b3"],
    comment: {
      es: 'Un error típico en este final de dama contra peón: una jugada aparentemente natural del rey permite un truco táctico que decide la partida a favor del bando fuerte.',
      en: 'A typical mistake in this queen-vs-pawn ending: a seemingly natural king move allows a tactical trick that decides the game in the stronger side\'s favor.',
    },
  },
  {
    id: 'q8', category: 'queen',
    name: { es: 'Exploiting a typical mistake (2)', en: 'Exploiting a typical mistake (2)' },
    fen: '8/8/8/3K4/8/8/1kp1Q3/8 b KQkq - 0 1',
    moves: ["b2c3","e2e5"],
    comment: {
      es: 'La misma idea de la posición anterior, vista desde el otro lado: aquí esa jugada del rey ya no funciona, y las negras deben buscar otro camino.',
      en: 'The same idea from the previous position, seen from the other side: here that king move no longer works, and Black must look for a different path.',
    },
  },
  {
    id: 'q9', category: 'queen',
    name: { es: 'Queen Queen', en: 'Queen Queen' },
    fen: '8/8/8/8/8/k2K4/2Q5/q7 w - - 0 1',
    moves: ["c2c5","a3a2","c5c4","a2a3","c4a6","a3b2","a6b5","b2a3","b5a5","a3b2","a5b4","b2a2","d3c2"],
    comment: {
      es: 'Estrictamente esto no es dama contra peón, pero surge tan a menudo tras una carrera de peones que merece estudiarse aquí: aunque ambos bandos coronen, la partida no es tablas automáticamente — la dama recién nacida puede quedar estorbada por su propio rey o caer en una red de mate.',
      en: 'Strictly speaking this isn\'t queen vs pawn, but it comes up often enough after a pawn race to deserve study here: even if both sides promote, the game isn\'t automatically a draw — the newly-made queen can get blocked by its own king or walk into a mating net.',
    },
  },
  {
    id: 'q10', category: 'queen',
    name: { es: 'Queen Rook + Pawn', en: 'Queen Rook + Pawn' },
    fen: '8/4k3/4p3/3r4/4K3/7Q/8/8 w - - 0 1',
    moves: ["e4f4","d5f5","f4g4","f5d5","h3h7","e7f6","h7g8","f6e7","g8g7","e7e8","g7f6","e8d7","f6f7","d7d6","f7e8","d5f5","e8d8","d6c6","d8e7","c6d5","e7c7","d5e4","c7d6","f5e5","g4g3","e4f5","g3f3","e5d5","d6f8","f5g6","f3e4","d5f5","f8e7","f5f6","e4e5"],
    comment: {
      es: 'Dama contra torre y peón es de los desequilibrios más frecuentes en la práctica, y pese a la diferencia de material, el bando defensor tiene bastantes posibilidades de tablas (cerca de un 30% en la base de datos del autor). Hay dos recursos defensivos principales: empujar el peón desde atrás con la torre, o construir una fortaleza.',
      en: 'Queen vs rook and pawn is one of the most common material imbalances in practice, and despite the difference in material, the defending side has real drawing chances (around 30% in the author\'s database). There are two main defensive resources: pushing the pawn from behind with the rook, or building a fortress.',
    },
  },
  // ── BISHOP ──────────────────────────────────────────
  {
    id: 'b1', category: 'bishop',
    name: { es: 'Same-coloured bishops: Bishop + Pawn Bishop', en: 'Same-coloured bishops: Bishop + Pawn Bishop' },
    fen: '5k2/2K5/3P4/1b5B/8/8/8/8 w - - 0 1',
    moves: ["h5f3","b5a4","f3c6","a4c6","c7c6","f8e8","c6c7"],
    comment: {
      es: 'Con un solo peón en un final de alfiles del mismo color, muchos jugadores desconocen un método defensivo clave — la oposición por detrás — a pesar de que grandes analistas como Averbakh y Centurini ya lo estudiaron a fondo antes de la era de las tablebases.',
      en: 'With just one pawn in a same-colored bishop ending, many players are unaware of a key defensive method — rear opposition — even though great analysts like Averbakh and Centurini worked it out in detail long before endgame tablebases existed.',
    },
  },
  {
    id: 'b2', category: 'bishop',
    name: { es: 'In the rear of the pawn', en: 'In the rear of the pawn' },
    fen: '4B3/2K5/3P4/2k5/8/7b/8/8 w - - 0 1',
    moves: ["e8d7","h3f1","d7g4","f1b5","g4d7","b5e2","d7c6","e2g4"],
    comment: {
      es: 'Cuando el rey defensor logra la oposición por detrás del peón, impide una maniobra esencial: el bando fuerte ya no puede ofrecer el cambio de alfiles sin estorbar a su propio peón.',
      en: 'When the defending king achieves rear opposition, it blocks an essential maneuver: the stronger side can no longer offer a bishop trade without getting in its own pawn\'s way.',
    },
  },
  {
    id: 'b3', category: 'bishop',
    name: { es: 'Additional training line', en: 'Additional training line' },
    fen: '8/K7/1P6/k4B2/8/5b2/8/8 w - - 0 1',
    moves: ["f5c8","f3e4","c8b7","e4f5","b7f3","f5c8","f3e2"],
    comment: {
      es: 'Una línea adicional para practicar la misma idea defensiva del ejemplo anterior.',
      en: 'An additional line to practice the same defensive idea from the previous example.',
    },
  },
  {
    id: 'b4', category: 'bishop',
    name: { es: 'The short diagonals', en: 'The short diagonals' },
    fen: '8/K7/1P6/k4B2/8/5b2/8/8 w - - 0 1',
    moves: ["f5c8","f3e4","c8b7","e4d3","b7f3","d3a6","f3g4"],
    comment: {
      es: 'Aquí el rey defensor está detrás del peón, como en el caso anterior, pero con un matiz clave: una de las diagonales disponibles es muy corta (menos de 4 casillas), y eso cambia por completo la evaluación.',
      en: 'Here the defending king is behind the pawn, like the previous case, but with one key twist: one of the available diagonals is very short (fewer than 4 squares), which completely changes the evaluation.',
    },
  },
  {
    id: 'b5', category: 'bishop',
    name: { es: 'Frontal defence', en: 'Frontal defence' },
    fen: '8/8/2k5/5PK1/8/2b5/7B/8 b - - 0 1',
    moves: ["c6d7","g5g6","d7e8","h2f4","c3d4","f4h6"],
    comment: {
      es: 'Un cuarto caso, poco estudiado en los libros, con errores frecuentes en la práctica — ilustrado con la partida real Kurajica-Markland, Hastings 1971/72.',
      en: 'A fourth case, rarely covered in books, with frequent mistakes in real play — illustrated with the actual game Kurajica-Markland, Hastings 1971/72.',
    },
  },
  {
    id: 'b6', category: 'bishop',
    name: { es: 'Pawns on the 6th rank', en: 'Pawns on the 6th rank' },
    fen: '4k3/8/4PP2/4K3/1b6/3B4/8/8 w - - 0 1',
    moves: ["d3b5","e8d8","e5f5","b4c5","f5g6","c5b4","g6f7","b4c5","e6e7"],
    comment: {
      es: 'Los finales de alfiles de distinto color son de los más frecuentes en la práctica, sobre todo porque el bando en apuros suele buscar refugio en ellos esperando tablas. Requieren una técnica particular donde la intuición ayuda poco — hay que conocer las reglas.',
      en: 'Opposite-colored bishop endings are among the most common in practice, largely because the side in trouble often heads for one hoping for a draw. They require a very particular technique where intuition doesn\'t help much — you need to know the rules.',
    },
  },
  {
    id: 'b7', category: 'bishop',
    name: { es: 'Pawns on the 5th rank or behind', en: 'Pawns on the 5th rank or behind' },
    fen: '8/4k3/8/4PP2/4K3/1b6/3B4/8 w - - 0 1',
    moves: ["d2g5","e7d7","e4f4","b3a2","g5h4","a2f7","f4g5","d7e7","g5h6","e7d7","h6g7","f7d5","g7f6","d5b3","e5e6","d7e8","f6e5"],
    comment: {
      es: 'Si los peones están más lejos de coronar, el bando defensor puede lograr tablas con la disposición correcta. Aquí el alfil negro empieza en la diagonal equivocada y, aunque controla una casilla clave, no puede evitar la maniobra ganadora.',
      en: 'If the pawns are farther from promoting, the defending side can hold a draw with the right setup. Here Black\'s bishop starts on the wrong diagonal and, even though it controls one key square, it can\'t stop the winning maneuver.',
    },
  },
  {
    id: 'b8', category: 'bishop',
    name: { es: 'A very special pair of pawns. The cage', en: 'A very special pair of pawns. The cage' },
    fen: '8/5kb1/8/8/6K1/3B4/4PP2/8 w - - 0 1',
    moves: ["f2f4","g7f8","e2e4","f7e7","d3c4","f8g7","e4e5","g7h6","c4b3","h6g7","g4g5","g7h8","g5g6","e7f8","g6h7","h8g7","b3c4"],
    comment: {
      es: 'Un par de peones concreto (e+f o c+d, en f4 y e5) puede dejar fuera de juego a un alfil de la diagonal larga, incluso con los peones todavía en la 2ª fila. Es poco frecuente, pero vale la pena conocerlo por lo excepcional del mecanismo.',
      en: 'One specific pawn pair (e+f or c+d, on f4 and e5) can shut a long-diagonal bishop completely out of the game, even with the pawns still on the 2nd rank. It doesn\'t come up often, but it\'s worth knowing for how unusual the mechanism is.',
    },
  },
  {
    id: 'b9', category: 'bishop',
    name: { es: 'Pawns separated by just one file', en: 'Pawns separated by just one file' },
    fen: '3k4/1K6/2PbP3/3B4/8/8/8/8 w - - 0 1',
    moves: ["d5b3","d6f4","b7b6","f4d6","b6b5","d6c7","b5c4","c7d6","c4d5","d6c7","d5e4","c7d6","e4f5","d6c7","f5f6","c7d6","f6f7","d6b4"],
    comment: {
      es: 'Cuanto más separados están los peones, mayores son las posibilidades de ganar — pero la regla es difícil de aplicar sin conocer los casos concretos. Aquí empezamos con los tres escenarios claros de tablas cuando los peones están separados por una sola columna.',
      en: 'The more separated the pawns are, the greater the winning chances — but the rule is hard to apply without knowing the specific cases. Here we start with the three clear drawing scenarios when the pawns are just one file apart.',
    },
  },
  {
    id: 'b10', category: 'bishop',
    name: { es: 'Controlling both pawns along the same diagonal', en: 'Controlling both pawns along the same diagonal' },
    fen: '8/2bB4/2P5/6k1/4K3/5P2/8/8 w - - 0 1',
    moves: ["e4d5","g5f6","d5c5","f6e7","c5b5","c7f4","b5b6","e7d8"],
    comment: {
      es: 'Cuando el alfil defensor controla ambos peones desde la misma diagonal, el procedimiento defensivo es sencillo.',
      en: 'When the defending bishop controls both pawns from the same diagonal, the defensive procedure is simple.',
    },
  },
  {
    id: 'b11', category: 'bishop',
    name: { es: 'The winning procedure', en: 'The winning procedure' },
    fen: '8/2kB4/2P5/6b1/4K3/5P2/8/8 w - - 0 1',
    moves: ["f3f4","g5h4","e4d5","h4e1","d5e6","e1h4","f4f5","c7d8","f5f6","h4g5","e6f5","g5h6","f5g6","h6f8","g6f7","f8h6","f7g8"],
    comment: {
      es: 'Con los peones separados por dos columnas ya no estamos en zona de tablas — todas las posiciones de esta sección se ganan siguiendo el mismo procedimiento.',
      en: 'With the pawns two files apart, we\'re no longer in drawing territory — every position in this section is won using the same procedure.',
    },
  },
  {
    id: 'b12', category: 'bishop',
    name: { es: 'Knight\'s and central pawn', en: 'Knight\'s and central pawn' },
    fen: '8/8/8/5B2/1p3b2/2k1p3/8/5K2 w - - 0 1',
    moves: ["f1e2","b4b3","e2d1","c3b4","f5h7","b4a3","h7g6","a3b2","g6f7","b2a2","f7e6","a2a3","e6f5","b3b2","f5b1"],
    comment: {
      es: 'No siempre ganan dos peones separados por dos columnas cuando el alfil defensor no puede controlarlos en la misma diagonal: si uno de ellos es peón de caballo o de torre, la cercanía al borde dificulta el apoyo del rey — y el resultado puede sorprender.',
      en: 'Two pawns two files apart don\'t always win just because the defending bishop can\'t cover them on one diagonal: if one of them is a knight\'s or rook\'s pawn, being close to the edge makes it harder for the king to help — and the result can be surprising.',
    },
  },
  {
    id: 'b13', category: 'bishop',
    name: { es: 'Central and rook\'s pawns', en: 'Central and rook\'s pawns' },
    fen: '8/bB6/P2k4/3P4/4K3/8/8/8 w - - 0 1',
    moves: ["e4f5","d6e7","f5e5","a7b8","e5d4","b8a7","d4c4","e7d6"],
    comment: {
      es: 'Cuando uno de los dos peones separados es de torre, el defensor tiene menos espacio que cubrir, y basta con algo de cuidado para hacer tablas. El rey atacante solo dispone de una ruta posible hacia la casilla clave b7.',
      en: 'When one of the two separated pawns is a rook\'s pawn, the defender has less space to cover, and just a little care is enough to draw. The attacking king only has one possible route to the key b7 square.',
    },
  },
  {
    id: 'b14', category: 'bishop',
    name: { es: 'Bishop\'s and knight\'s pawns', en: 'Bishop\'s and knight\'s pawns' },
    fen: '1b6/1P6/4Bk2/5P2/4K3/8/8/8 w - - 0 1',
    moves: ["e4f3","f6g5","f3e4","g5f6","e4d5","b8g3","d5c6","f6e7","c6b6","g3b8"],
    comment: {
      es: 'Con los peones separados por tres columnas las posibilidades de ganar aumentan — irónicamente, porque uno de ellos será forzosamente de caballo o de torre, lo que limita al rey defensor más que al atacante.',
      en: 'With the pawns three files apart, winning chances actually go up — ironically, because one of them is forced to be a knight\'s or rook\'s pawn, which restricts the defending king more than the attacker.',
    },
  },
  {
    id: 'b15', category: 'bishop',
    name: { es: 'The attacking Bishop controls the promotion square of the knight\'s pawn.', en: 'The attacking Bishop controls the promotion square of the knight\'s pawn.' },
    fen: '2b5/8/1P1B4/8/4kP2/8/5K2/8 b - - 0 1',
    moves: ["c8b7","f2g3","e4f5","g3h4","f5g6","h4g4","b7c8","g4f3","c8b7","f3e3","g6f5","e3d4","f5e6","d6e5","e6f5","d4c5","f5e6"],
    comment: {
      es: 'Cuando el alfil defensor controla la penúltima casilla del peón de caballo pero no su casilla de coronación, casi todo sigue igual — salvo que, si el peón ha avanzado demasiado (aquí, a la 6ª fila), aparece un bloqueo perfecto. Posición basada en la partida real Miller-Saidy.',
      en: 'When the defending bishop controls the knight\'s pawn\'s second-to-last square but not its promotion square, most ideas still hold — except that if the pawn has gone too far (here, the 6th rank), a perfect blockade appears. Based on the real game Miller-Saidy.',
    },
  },
  {
    id: 'b16', category: 'bishop',
    name: { es: 'Central and rook\'s pawns (2)', en: 'Central and rook\'s pawns (2)' },
    fen: '8/b7/P7/3Bk3/2K1P3/8/8/8 w - - 0 1',
    moves: ["c4d3","e5f4","d3e2","a7b6","e2f1","b6a7","f1g2","a7b6","g2h3","b6f2","d5b7","f4g5","b7c6","g5f4","c6d5","f2e3","h3h4","f4e5","h4h5","e5f6","d5b7","e3a7","h5h6","a7b6","h6h7","b6d4","h7g8","d4c5","b7d5","f6e5","g8f7","e5d6","f7f6","c5d4","f6f5","d4b6","d5a8","b6d4","a8b7","d4a7","e4e5","d6e7","e5e6","a7d4","b7c8","e7d8","c8d7","d8e7","f5e4","d4b6","e4d5"],
    comment: {
      es: 'Con un peón de torre, la vida es más fácil para el bando fuerte: el rey atacante tiene mucho más espacio para colarse por el flanco, ilustrando la típica maniobra de desbordar por el borde del tablero.',
      en: 'With a rook\'s pawn, life is easier for the stronger side: the attacking king has far more room to break through on the flank, illustrating the classic maneuver of outflanking along the edge of the board.',
    },
  },
  // ── KNIGHT ──────────────────────────────────────────
  {
    id: 'n1', category: 'knight',
    name: { es: 'Knight 7th-rank pawn', en: 'Knight 7th-rank pawn' },
    fen: '8/K7/8/8/8/1k6/1N1p4/8 w - - 0 1',
    moves: ["b2d1","b3c2","d1f2"],
    comment: {
      es: 'Contra un peón central en la 7ª fila, el caballo se defiende bien: si logra plantarse justo delante del peón, las tablas están garantizadas. Es de las luchas más sencillas entre pieza menor y peón — dominarla ayuda a calcular simplificaciones desde posiciones más complejas.',
      en: 'Against a central 7th-rank pawn, the knight defends comfortably: if it manages to plant itself right in front of the pawn, the draw is guaranteed. It\'s one of the simplest single-piece-vs-pawn battles — mastering it helps you calculate simplifications from more complex positions.',
    },
  },
  {
    id: 'n2', category: 'knight',
    name: { es: 'The knight\'s pawn', en: 'The knight\'s pawn' },
    fen: '8/8/8/8/4N3/1p6/7K/1k6 b - - 0 1',
    moves: ["b3b2","e4d2","b1c1","d2b3","c1d1"],
    comment: {
      es: 'Cuando el peón rival no está en una columna central, el caballo pierde margen de maniobra por la cercanía al borde del tablero. Aquí, si el peón llega a la 7ª fila, el caballo solo salva la partida plantándose delante de él — cualquier otra idea llega tarde.',
      en: 'When the enemy pawn isn\'t on a central file, the knight has less room to maneuver because of how close it is to the edge. Here, once the pawn reaches the 7th rank, the knight only saves the game by planting itself directly in front — any other idea comes too late.',
    },
  },
  {
    id: 'n3', category: 'knight',
    name: { es: 'The 6th-rank rook\'s pawn', en: 'The 6th-rank rook\'s pawn' },
    fen: '8/8/K7/4N3/8/7p/7k/8 w - - 0 1',
    moves: ["e5g4","h2g3","g4e3","g3f3","e3f1","f3f2","f1h2"],
    comment: {
      es: 'Un peón de torre es el escenario más peligroso para un caballo solitario, porque el borde del tablero le resta movilidad. Con el peón en la 6ª fila las probabilidades de tablas son similares a las de un peón central en la 7ª, pero si el caballo no llega a tiempo delante del peón, debe encontrar el circuito exacto de casillas (g4-e3-f1-h2) para salvarse.',
      en: 'A rook\'s pawn is the most dangerous scenario for a lone knight, since the edge of the board limits its mobility. With the pawn on the 6th rank the drawing chances are similar to a central 7th-rank pawn, but if the knight can\'t get in front of the pawn in time, it must find the exact square circuit (g4-e3-f1-h2) to save itself.',
    },
  },
  {
    id: 'n4', category: 'knight',
    name: { es: 'The 7th-rank rook\'s pawn', en: 'The 7th-rank rook\'s pawn' },
    fen: 'K7/8/8/5N2/8/3k3p/8/8 w - - 0 1',
    moves: ["f5g3","h3h2","a8b7","d3d4","b7c6","d4e5","c6c5","e5f4","g3h1","f4f3","c5d4","f3g2","d4e3","g2h1","e3f2"],
    comment: {
      es: 'Con el peón de torre ya en la 7ª fila, el rey rival siempre puede ahuyentar o capturar al caballo, pero aun así hay más posibilidades de tablas de las que parece — si el caballo recibe ayuda de su propio rey a tiempo.',
      en: 'With the rook\'s pawn already on the 7th rank, the enemy king can always chase away or capture the knight, but there are still more drawing chances than it looks — if the knight gets help from its own king in time.',
    },
  },
  {
    id: 'n5', category: 'knight',
    name: { es: 'King + Knight checkmate', en: 'King + Knight checkmate' },
    fen: '8/8/8/8/8/p7/2K1N3/k7 w - - 0 1',
    moves: ["e2c1","a3a2","c1b3"],
    comment: {
      es: 'Una posición excepcional: si el rey rival queda encerrado justo delante de su propio peón de torre en la 6ª o 7ª fila, el rey y el caballo pueden darle mate. Es rarísima en partidas reales, pero conocerla evita caer en ella por pura ambición de ganar más rápido.',
      en: 'An exceptional position: if the enemy king gets boxed in right in front of its own rook\'s pawn on the 6th or 7th rank, king and knight can actually deliver checkmate. It\'s extremely rare in real games, but knowing it keeps you from stumbling into it out of sheer eagerness to win faster.',
    },
  },
  {
    id: 'n6', category: 'knight',
    name: { es: 'The knight\'s dumb square', en: 'The knight\'s dumb square' },
    fen: '3k4/1n6/8/P7/8/8/7K/8 w - - 0 1',
    moves: ["a5a6","d8c8","a6a7"],
    comment: {
      es: 'Hay una casilla en cada diagonal larga (b7, g7, b2 o g2) donde el caballo queda especialmente torpe pese a no estar en el borde. Plantado ahí no solo no detiene el peón rival, sino que además le estorba el paso a su propio rey.',
      en: 'There\'s one square on each long diagonal (b7, g7, b2, or g2) where the knight ends up unusually clumsy despite not being on the edge. Stuck there, it not only fails to stop the enemy pawn — it also gets in its own king\'s way.',
    },
  },
  // ── MINOR ──────────────────────────────────────────
  {
    id: 'm1', category: 'minor',
    name: { es: 'Central pawn', en: 'Central pawn' },
    fen: '1K6/4B3/8/8/8/2n2p2/5k2/8 w - - 0 1',
    moves: ["e7c5","f2e2","c5g1","c3d1","b8c7","d1f2","g1h2","e2f1","h2e5","f2g4","e5d4","f1e2","d4g1"],
    comment: {
      es: 'Después de los finales de torre, alfil contra caballo son los más frecuentes. Con un solo peón en el tablero, el alfil suele defender con bastante facilidad — al contrario que con muchos peones, donde el desequilibrio da finales mucho más ricos en táctica.',
      en: 'After rook endgames, bishop vs knight are the most common. With just one pawn left, the bishop usually defends fairly comfortably — unlike positions with many pawns, where the imbalance produces far more tactically rich endings.',
    },
  },
  {
    id: 'm2', category: 'minor',
    name: { es: 'Exploiting a typical mistake', en: 'Exploiting a typical mistake' },
    fen: '1K6/8/8/2B5/8/2n2p2/4k3/8 w - - 0 1',
    moves: ["b8c7","c3d5","c7d6","d5e3"],
    comment: {
      es: 'Continuación del ejemplo anterior: un pequeño descuido del bando fuerte permite a las blancas encontrar el recurso exacto para salvar la partida.',
      en: 'A follow-up to the previous example: a small slip by the stronger side lets White find the exact resource to save the game.',
    },
  },
  {
    id: 'm3', category: 'minor',
    name: { es: 'The rook\'s pawn', en: 'The rook\'s pawn' },
    fen: '8/8/8/8/B6n/7p/6k1/4K3 w - - 0 1',
    moves: ["a4d7","h3h2","d7c6","g2g1","c6h1","g1h1","e1f2","h4f3","f2f1","f3d2","f1f2","d2e4","f2f1"],
    comment: {
      es: 'Los peones de torre complican la defensa del alfil, ya que una de las diagonales de contención puede ser muy corta o desaparecer al llegar el peón a la 7ª fila. Aquí las negras amenazan cerrar la única diagonal de defensa, pero las blancas cuentan con un recurso oculto para salvar la partida.',
      en: 'Rook\'s pawns make the bishop\'s defense harder, since one of the blocking diagonals can be very short or vanish once the pawn reaches the 7th rank. Here Black threatens to shut the only defending diagonal, but White has a hidden resource to save the game.',
    },
  },
  {
    id: 'm4', category: 'minor',
    name: { es: 'Drawing technique after mistake', en: 'Drawing technique after mistake' },
    fen: '2K5/3Pkn2/8/8/8/5B2/8/8 w - - 0 1',
    moves: ["f3d5","f7d6","c8c7","d6e8","c7c8","e8d6"],
    comment: {
      es: 'Cuando el bando débil se equivoca en esta estructura de alfil y peón contra caballo, sigue existiendo una técnica exacta para salvar las tablas — pero hay que conocerla.',
      en: 'Even after a slip in this bishop-and-pawn-vs-knight structure, there\'s still an exact technique to hold the draw — but you need to know it.',
    },
  },
  {
    id: 'm5', category: 'minor',
    name: { es: 'The pawn is on the 7th rank', en: 'The pawn is on the 7th rank' },
    fen: '2K5/3Pkn2/8/8/8/5B2/8/8 w - - 0 1',
    moves: ["c8c7","f7d8","f3d5"],
    comment: {
      es: 'Cuando el caballo es el bando débil, sus posibilidades de perder aumentan frente a la mayor movilidad del alfil en tablero abierto. Todo depende de si el rey defensor logra plantarse delante del peón en una casilla del color contrario al alfil — si no, el caballo deberá bloquear con ayuda de su rey, aunque abundan las posiciones de zugzwang.',
      en: 'When the knight is the weaker side, its losing chances go up against the bishop\'s greater mobility on an open board. Everything hinges on whether the defending king can stand in front of the pawn on a square opposite the bishop\'s color — if not, the knight must blockade with its king\'s help, though zugzwang traps are common.',
    },
  },
  {
    id: 'm6', category: 'minor',
    name: { es: 'Unstable position of the controlling knight', en: 'Unstable position of the controlling knight' },
    fen: '8/4K3/3P1n2/3k4/8/8/2B5/8 w - - 0 1',
    moves: ["c2b3","d5c5","b3a2","c5c6","e7e6","f6h7","a2d5","c6c5","e6e7","h7f6","d5f3","f6g8","e7e6","g8f6","f3e4"],
    comment: {
      es: 'Con el peón menos avanzado, el zugzwang no es un problema si el rey y el caballo defensores controlan la casilla delante del peón. El único peligro real aparece cuando el caballo bloqueador queda en una posición inestable — cada caso hay que calcularlo por separado, no hay una regla general.',
      en: 'With the pawn less advanced, zugzwang isn\'t a problem as long as the defending king and knight control the square in front of it. The real danger only shows up when the blockading knight ends up in an unstable spot — each case needs its own calculation, there\'s no general rule here.',
    },
  },
  {
    id: 'm7', category: 'minor',
    name: { es: 'Checkmating with B and N, subvariation', en: 'Checkmating with B and N, subvariation' },
    fen: '4k3/B7/3K4/3N4/8/8/8/8 b - - 0 1',
    moves: ["e8d8","d5e7","d8e8","d6e6","e8d8","a7b6","d8e8","b6c7","e8f8","e7f5","f8e8","f5g7","e8f8","e6f6","f8g8","f6g6","g8f8","c7d6","f8g8","g7f5","g8h8","d6c5","h8g8","f5h6","g8h8","c5d4"],
    comment: {
      es: 'Una variante secundaria dentro de la técnica de mate con alfil y caballo, útil para completar la comprensión del procedimiento.',
      en: 'A secondary branch within the bishop-and-knight mating technique, useful for rounding out your understanding of the procedure.',
    },
  },
  {
    id: 'm8', category: 'minor',
    name: { es: 'Positions 13.4 to 13.6 - Checkmating with B and N', en: 'Positions 13.4 to 13.6 - Checkmating with B and N' },
    fen: '8/8/8/8/4k3/8/6K1/6BN w - - 0 1',
    moves: ["g2g3","e4e5","g3f3","e5d5","f3f4","d5d6","f4e4","d6c6","h1g3","c6d6","g3f5","d6c6","e4e5","c6d7","e5d5","d7c7","g1c5","c7b7","d5d6","b7b8","d6c6","b8a8","f5d6","a8b8","d6b5","b8a8","b5c7","a8b8","c5d4","b8c8","d4a7","c8d8","c7d5","d8e8","c6d6","e8f7","d5e7","f7f6","a7e3","f6f7","e3g5","f7e8","e7c6","e8f7","c6e5","f7e8","d6e6","e8f8","e6d7","f8g8","d7e8","g8g7","e8e7","g7g8","g5h6","g8h7","h6f8","h7g8","e7e8","g8h8","e8f7","h8h7","e5g4","h7h8","f8g7","h8h7","g4f6"],
    comment: {
      es: 'Desde la peor configuración inicial posible, el mate de alfil y caballo requiere hasta 30 jugadas con juego perfecto. El plan: centralizar el rey y el caballo, empujar al rey rival hacia la esquina del color del alfil (la \'esquina segura\') y cerrar el cerco con el rey en la diagonal opuesta.',
      en: 'Starting from the worst possible setup, the bishop-and-knight mate can take up to 30 moves with perfect play. The plan: centralize your king and knight, push the enemy king toward the corner matching your bishop\'s color (the \'safe corner\'), then close the net with your king on the opposite diagonal.',
    },
  },
];
