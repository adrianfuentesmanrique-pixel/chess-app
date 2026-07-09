// Terms & Conditions and Privacy Policy content, bilingual.
// Drafted to cover the app's actual mechanics: local-first storage, optional
// Firebase-backed accounts, AI-generated visual assets, chess content adapted
// from public/educational sources, an embedded open-source (GPLv3) chess
// engine, and a third-party (Lichess) API integration. Still a baseline for
// review by a lawyer licensed in your jurisdiction before relying on it
// commercially — no template can account for your specific business
// structure, but this covers the categories a reviewer would expect to see.

const LAST_UPDATED = '2026-07-09';

export const LEGAL_TERMS = {
  es: {
    title: 'Términos y Condiciones',
    updated: `Última actualización: ${LAST_UPDATED}`,
    sections: [
      {
        h: '1. Aceptación de los términos',
        p: `Al crear una cuenta o usar Chess Training Center ("la App", "nosotros"), aceptas estos Términos y Condiciones y nuestra Política de Privacidad. Si no estás de acuerdo, no debes crear una cuenta ni usar la App. Si usas la App en nombre de un menor a tu cargo, aceptas estos términos también en su representación.`,
      },
      {
        h: '2. Qué es la App',
        p: `Chess Training Center es una aplicación de entrenamiento de ajedrez: análisis de partidas con motor, puzzles tácticos, práctica de finales y aperturas, y seguimiento de progreso (ELO estimado, rachas, logros). Es una herramienta educativa y de entretenimiento; no sustituye la instrucción de un entrenador certificado ni constituye asesoría profesional de ningún tipo.`,
      },
      {
        h: '3. Propiedad intelectual de la App',
        p: `El código fuente, el diseño, la marca "Chess Training Center", el logotipo, el personaje "Kael" y la estructura original de la App son propiedad nuestra o de nuestros licenciantes, y están protegidos por leyes de derechos de autor y propiedad intelectual. Te otorgamos una licencia limitada, personal, no exclusiva y no transferible para usar la App con fines personales y no comerciales. No puedes copiar, descompilar, redistribuir, ni explotar comercialmente la App o su código sin autorización previa por escrito.`,
      },
      {
        h: '4. Sobre el contenido de ajedrez que incluye la App',
        p: `Las posiciones, jugadas y secuencias de ajedrez en sí (incluidas aperturas clasificadas, finales técnicos y posiciones tácticas) son datos funcionales y de dominio público: las reglas del ajedrez y las partidas jugadas no están protegidas por derechos de autor. Cuando el contenido educativo de la App se basa en obras publicadas (por ejemplo, técnica de finales derivada de literatura ajedrecística reconocida), los comentarios y explicaciones que ves fueron reescritos y resumidos de forma independiente por nosotros (con asistencia de herramientas de inteligencia artificial) — no son copias literales del texto original — con fines educativos y de comentario, dentro de lo permitido por el uso legítimo ("fair use" / cita con fines educativos) aplicable en tu jurisdicción. No reclamamos titularidad sobre la teoría de ajedrez subyacente, solo sobre nuestra expresión y presentación específica de esa teoría dentro de la App.`,
      },
      {
        h: '5. Contenido e imágenes generadas por inteligencia artificial',
        p: `Parte del contenido visual de la App (insignias de logros, iconos de perfil, ilustraciones del personaje "Kael", elementos decorativos) fue generado o asistido por herramientas de inteligencia artificial. El estatus de derechos de autor de contenido generado por IA varía según la jurisdicción y puede no ser objeto de protección exclusiva de autor en algunos países. Usamos este contenido de buena fe para fines ilustrativos dentro de la App. Si consideras que alguna imagen se parece indebidamente a una obra protegida de tu autoría, contáctanos por el procedimiento descrito en la sección 8.`,
      },
      {
        h: '6. Componentes de código abierto y de terceros',
        p: `La App utiliza software de terceros bajo sus propias licencias de código abierto, incluyendo el motor de ajedrez Stockfish (con licencia GNU GPL v3 — puedes obtener su código fuente en stockfishchess.org) y la biblioteca chess.js. Estos componentes conservan los derechos de sus respectivos autores y se distribuyen conforme a sus licencias originales, independientemente de los términos que rigen el resto de la App. El uso del motor de ajedrez integrado está sujeto además a la sección 11 (uso aceptable).`,
      },
      {
        h: '7. Cuentas de usuario',
        p: `Puedes usar la App sin cuenta (tus datos se guardan solo en tu dispositivo, en almacenamiento local del navegador) o crear una cuenta con correo/contraseña o con Google, lo que permite sincronizar tu progreso entre dispositivos mediante Firebase. Eres responsable de mantener segura tu contraseña y de toda actividad realizada desde tu cuenta. Debes proporcionar datos verídicos al registrarte. El nombre de usuario que eliges al crear la cuenta queda fijo de forma permanente y no puede cambiarse posteriormente.`,
      },
      {
        h: '8. Edad mínima y consentimiento parental',
        p: `La App está pensada para un público general. Si eres menor de edad según las leyes de tu país de residencia, necesitas el consentimiento verificable de un padre, madre o tutor legal para crear una cuenta y para el procesamiento de tus datos personales. No dirigimos la App específicamente a niños menores de 13 años y no recopilamos intencionalmente datos personales de esa franja de edad sin dicho consentimiento; si tenemos motivos para creer que se recopiló información de un menor sin autorización, la eliminaremos.`,
      },
      {
        h: '9. Contenido que subes y avisos de derechos de autor',
        p: `Si importas tus propias partidas (archivos PGN), comentarios o anotaciones, ese contenido sigue siendo tuyo. Nos das una licencia limitada para almacenarlo y mostrártelo a ti (y, si activas funciones públicas como el leaderboard, a otros usuarios en forma limitada) únicamente para operar la App. Declaras que tienes derecho a compartir ese contenido y que no infringe derechos de terceros. Si crees que contenido dentro de la App infringe tus derechos de autor, contáctanos con: (a) identificación de la obra protegida, (b) ubicación del contenido cuestionado dentro de la App, (c) tus datos de contacto, y (d) una declaración de buena fe de que el uso no está autorizado. Investigaremos y, de proceder, retiraremos el contenido.`,
      },
      {
        h: '10. Función "Explorar" y servicios externos',
        p: `La búsqueda de partidas por posición puede enviar la posición actual del tablero (en formato FEN, sin datos que te identifiquen) al servicio público de Lichess para mostrarte partidas relacionadas. Este servicio es operado por un tercero independiente (Lichess), tiene su propia disponibilidad y términos, y no lo controlamos ni garantizamos su funcionamiento continuo — puede no estar disponible en todo momento.`,
      },
      {
        h: '11. Membresía "Miembro" y pagos',
        p: `Algunas funciones están marcadas como exclusivas para usuarios "Miembro". En la versión actual, el estado de Miembro se activa manualmente o mediante una prueba gratuita dentro de la App; no se procesan pagos reales ni se almacenan datos de tarjetas de pago en esta versión. Si en el futuro se habilita el cobro de una suscripción a través de un procesador de pagos externo, actualizaremos estos términos, te lo comunicaremos con antelación razonable, y en ningún caso se te cobrará sin tu consentimiento explícito previo.`,
      },
      {
        h: '12. Uso aceptable',
        p: `No debes: usar la App para actividades ilegales; intentar acceder a cuentas ajenas o a datos de otros usuarios sin autorización; interferir con el funcionamiento del servicio o intentar vulnerar su seguridad; realizar ingeniería inversa de la App salvo lo permitido por ley; ni usar el motor de ajedrez integrado, sus análisis o su fuerza de juego para hacer trampa en partidas de ajedrez de terceros fuera de la App (por ejemplo, en otras plataformas o partidas presenciales).`,
      },
      {
        h: '13. Sin garantías',
        p: `La App se ofrece "tal cual" y "según disponibilidad". Aunque nos esforzamos por que la información (reglas, análisis del motor, ELO estimado, clasificación de aperturas) sea correcta, no garantizamos que esté libre de errores o interrupciones. El motor de ajedrez y las estimaciones de precisión son herramientas de apoyo al entrenamiento, no una evaluación profesional certificada ni un sustituto del criterio de un entrenador humano.`,
      },
      {
        h: '14. Limitación de responsabilidad e indemnización',
        p: `En la medida permitida por la ley, no seremos responsables de daños indirectos, incidentales, especiales o consecuentes, pérdida de datos, pérdida de progreso, o cualquier perjuicio derivado del uso o la imposibilidad de uso de la App, incluidos los que resulten de servicios de terceros integrados (Firebase, Lichess). Aceptas indemnizarnos frente a reclamaciones de terceros derivadas de tu incumplimiento de estos términos o del contenido que subas.`,
      },
      {
        h: '15. Terminación',
        p: `Podemos suspender o cerrar cuentas que incumplan estos términos, con o sin previo aviso, especialmente en casos de uso fraudulento, abuso del servicio o infracción de derechos de terceros. Puedes dejar de usar la App en cualquier momento; consulta la sección 17 para eliminar tu cuenta.`,
      },
      {
        h: '16. Ley aplicable',
        p: `Estos términos se rigen, salvo que la ley de protección al consumidor de tu país de residencia disponga otra cosa de forma imperativa, por las leyes de la República de Panamá, sin perjuicio de sus normas de conflicto de leyes.`,
      },
      {
        h: '17. Cambios a estos términos',
        p: `Podemos actualizar estos términos de vez en cuando. Si los cambios son importantes, te lo notificaremos dentro de la App antes de que entren en vigor. El uso continuado después de un cambio implica que lo aceptas.`,
      },
      {
        h: '18. Cierre de cuenta',
        p: `Puedes dejar de usar la App y solicitar la eliminación de tu cuenta y tus datos en cualquier momento desde Perfil.`,
      },
      {
        h: '19. Contacto',
        p: `Si tienes preguntas sobre estos términos, incluidos avisos de derechos de autor, puedes contactarnos desde la sección de soporte de la App.`,
      },
    ],
  },
  en: {
    title: 'Terms & Conditions',
    updated: `Last updated: ${LAST_UPDATED}`,
    sections: [
      {
        h: '1. Acceptance of terms',
        p: `By creating an account or using Chess Training Center ("the App", "we", "us"), you agree to these Terms & Conditions and our Privacy Policy. If you do not agree, please do not create an account or use the App. If you use the App on behalf of a minor in your care, you accept these terms on their behalf as well.`,
      },
      {
        h: '2. What the App is',
        p: `Chess Training Center is a chess training app: engine-assisted game analysis, tactical puzzles, endgame and opening practice, and progress tracking (estimated ELO, streaks, achievements). It is an educational and entertainment tool; it does not replace instruction from a certified coach and is not professional advice of any kind.`,
      },
      {
        h: '3. Our intellectual property',
        p: `The App's source code, design, the "Chess Training Center" brand and logo, the "Kael" character, and the App's original structure are owned by us or our licensors and are protected by copyright and other intellectual property laws. We grant you a limited, personal, non-exclusive, non-transferable license to use the App for personal, non-commercial purposes. You may not copy, decompile, redistribute, or commercially exploit the App or its code without our prior written permission.`,
      },
      {
        h: '4. About the chess content in the App',
        p: `Chess positions, moves, and move sequences themselves (including classified openings, endgame technique, and tactical positions) are functional, public-domain data — the rules of chess and the games that have been played are not subject to copyright. Where the App's educational content is based on published works (for example, endgame technique derived from recognized chess literature), the commentary and explanations you see were independently rewritten and summarized by us (with the assistance of AI tools) — not verbatim reproductions of the original text — for educational and commentary purposes, within the fair use / educational-quotation allowances applicable in your jurisdiction. We claim no ownership over the underlying chess theory, only over our own specific expression and presentation of it within the App.`,
      },
      {
        h: '5. AI-generated content and imagery',
        p: `Some of the App's visual content (achievement badges, profile icons, illustrations of the "Kael" character, decorative elements) was generated or assisted by artificial intelligence tools. The copyright status of AI-generated content varies by jurisdiction and may not be subject to exclusive authorship protection in some countries. We use this content in good faith for illustrative purposes within the App. If you believe an image improperly resembles a protected work of yours, contact us using the process described in Section 9.`,
      },
      {
        h: '6. Open-source and third-party components',
        p: `The App uses third-party software under its own open-source licenses, including the Stockfish chess engine (licensed under the GNU GPL v3 — its source code is available at stockfishchess.org) and the chess.js library. These components remain the property of their respective authors and are distributed under their original licenses, independent of the terms governing the rest of the App. Use of the built-in chess engine is additionally subject to Section 12 (acceptable use).`,
      },
      {
        h: '7. User accounts',
        p: `You can use the App without an account (your data is stored only on your device, in local browser storage), or create an account with email/password or Google, which lets you sync your progress across devices via Firebase. You are responsible for keeping your password secure and for all activity under your account. You must provide accurate information when registering. The username you choose when creating your account is set permanently and cannot be changed afterward.`,
      },
      {
        h: '8. Minimum age and parental consent',
        p: `The App is intended for a general audience. If you are a minor under the laws of your country of residence, you need the verifiable consent of a parent or legal guardian to create an account and for the processing of your personal data. We do not knowingly direct the App at children under 13 or knowingly collect personal data from that age group without such consent; if we have reason to believe information was collected from a minor without authorization, we will delete it.`,
      },
      {
        h: '9. Content you upload and copyright notices',
        p: `If you import your own games (PGN files), comments, or annotations, that content remains yours. You grant us a limited license to store it and show it back to you (and, if you opt into public features like the leaderboard, to other users in limited form) solely to operate the App. You represent that you have the right to share that content and that it does not infringe third-party rights. If you believe content within the App infringes your copyright, contact us with: (a) identification of the protected work, (b) the location of the content in question within the App, (c) your contact information, and (d) a good-faith statement that the use is unauthorized. We will investigate and, where warranted, remove the content.`,
      },
      {
        h: '10. "Explore" feature and external services',
        p: `Searching for games by position may send the current board position (in FEN format, with no data that identifies you) to Lichess's public service to show you related games. This service is operated by an independent third party (Lichess), has its own availability and terms, and we do not control or guarantee its continued operation — it may not be available at all times.`,
      },
      {
        h: '11. "Member" membership and payments',
        p: `Some features are marked exclusive to "Member" users. In the current version, Member status is enabled manually or through an in-app free trial; no real payments are processed and no payment card data is stored in this version. If paid subscriptions through an external payment processor are enabled in the future, we will update these terms, notify you with reasonable advance notice, and you will never be charged without your prior explicit consent.`,
      },
      {
        h: '12. Acceptable use',
        p: `You may not: use the App for unlawful activity; attempt to access other users' accounts or data without authorization; interfere with the service's operation or attempt to compromise its security; reverse-engineer the App except as permitted by law; or use the built-in chess engine, its analysis, or its playing strength to cheat in third-party chess games outside the App (for example, on other platforms or in over-the-board play).`,
      },
      {
        h: '13. No warranties',
        p: `The App is provided "as is" and "as available." While we try to keep information (rules, engine analysis, estimated ELO, opening classification) accurate, we don't guarantee it is error-free or uninterrupted. The chess engine and accuracy estimates are training-support tools, not a certified professional evaluation or a substitute for a human coach's judgment.`,
      },
      {
        h: '14. Limitation of liability and indemnification',
        p: `To the extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages, data loss, loss of progress, or other harm arising from your use or inability to use the App, including harm arising from integrated third-party services (Firebase, Lichess). You agree to indemnify us against third-party claims arising from your breach of these terms or from content you upload.`,
      },
      {
        h: '15. Termination',
        p: `We may suspend or close accounts that violate these terms, with or without prior notice, particularly in cases of fraudulent use, abuse of the service, or infringement of third-party rights. You may stop using the App at any time; see Section 17 to delete your account.`,
      },
      {
        h: '16. Governing law',
        p: `These terms are governed, except where your country of residence's mandatory consumer-protection law provides otherwise, by the laws of the Republic of Panama, without regard to its conflict-of-law rules.`,
      },
      {
        h: '17. Changes to these terms',
        p: `We may update these terms from time to time. If changes are significant, we will notify you inside the App before they take effect. Continued use after a change means you accept it.`,
      },
      {
        h: '18. Closing your account',
        p: `You can stop using the App and request deletion of your account and data at any time from Profile.`,
      },
      {
        h: '19. Contact',
        p: `If you have questions about these terms, including copyright notices, you can reach us from the App's support section.`,
      },
    ],
  },
};

export const LEGAL_PRIVACY = {
  es: {
    title: 'Política de Privacidad',
    updated: `Última actualización: ${LAST_UPDATED}`,
    sections: [
      {
        h: '1. Qué datos recopilamos',
        p: `Si usas la App sin cuenta, tus datos (progreso, partidas, ajustes) se guardan solo en el almacenamiento local de tu dispositivo/navegador y no llegan a nuestros servidores. Si creas una cuenta, recopilamos: correo electrónico, nombre, apellido, nombre de usuario, fecha de nacimiento (para verificar edad mínima), y los datos de progreso que generas al usar la App (ELO estimado, rachas, partidas guardadas, logros, ajustes). Si usas Google para iniciar sesión, recibimos tu nombre, correo y foto de perfil según los permitas en tu cuenta de Google.`,
      },
      {
        h: '2. Base legal y finalidad del tratamiento',
        p: `Tratamos tus datos para ejecutar el contrato de uso de la App contigo (crear y mantener tu cuenta, sincronizar tu progreso), por interés legítimo (mejorar el servicio, prevenir fraude), y, cuando corresponda, con tu consentimiento (por ejemplo, al aceptar estos términos durante el registro, o al elegir mostrar tu perfil en el leaderboard público).`,
      },
      {
        h: '3. Qué es público',
        p: `Solo un subconjunto limitado de tu perfil (nombre de usuario, avatar, ELO de táctica/aperturas/finales/a ciegas, racha, insignia de Miembro) aparece en el leaderboard público si tienes cuenta. Tu correo, nombre y apellido reales, y fecha de nacimiento nunca se hacen públicos.`,
      },
      {
        h: '4. Dónde se almacenan los datos y transferencias internacionales',
        p: `Usamos Firebase (Google LLC) para autenticación y almacenamiento en la nube. Tus datos pueden almacenarse y procesarse en servidores ubicados fuera de tu país de residencia, incluidos Estados Unidos, conforme a las políticas de seguridad y los mecanismos de transferencia internacional de datos de Google/Firebase.`,
      },
      {
        h: '5. Cuánto tiempo conservamos tus datos',
        p: `Conservamos los datos de tu cuenta mientras esta permanezca activa. Si solicitas la eliminación de tu cuenta, borramos tus datos personales y de progreso asociados de nuestros sistemas dentro de un plazo razonable, salvo que debamos conservar cierta información por obligación legal o para resolver disputas.`,
      },
      {
        h: '6. Seguridad',
        p: `Aplicamos medidas técnicas y organizativas razonables (autenticación gestionada por Firebase, reglas de acceso a la base de datos) para proteger tus datos. Ningún sistema es completamente seguro; no podemos garantizar la seguridad absoluta de la información transmitida o almacenada.`,
      },
      {
        h: '7. Almacenamiento local y cookies',
        p: `La App usa almacenamiento local del navegador (localStorage/IndexedDB) para guardar tu progreso y preferencias, incluso sin cuenta. Este almacenamiento es técnico y necesario para el funcionamiento de la App; no usamos cookies de rastreo publicitario ni compartimos esta información con redes de publicidad.`,
      },
      {
        h: '8. Servicios externos',
        p: `La función "Explorar" puede enviar la posición actual del tablero (formato FEN, sin datos que te identifiquen) a la API pública de Lichess para buscar partidas relacionadas, solo cuando la usas activamente. El motor de ajedrez (Stockfish) se ejecuta localmente en tu dispositivo; la posición de tus partidas no se envía a servidores externos para el análisis del motor.`,
      },
      {
        h: '9. Tus derechos',
        p: `Puedes acceder, corregir, exportar o eliminar tus datos, así como cambiar qué información se muestra públicamente, en cualquier momento desde la sección Perfil de la App. Dependiendo de tu país de residencia, puedes tener derechos adicionales de protección de datos (por ejemplo, portabilidad, oposición al tratamiento, o presentar una reclamación ante la autoridad de protección de datos correspondiente); contáctanos si deseas ejercerlos y no encuentras la opción directamente en la App.`,
      },
      {
        h: '10. Menores de edad',
        p: `Pedimos la fecha de nacimiento solo para verificar la edad mínima de registro según las leyes locales. No recopilamos intencionalmente datos de niños por debajo de la edad mínima permitida sin consentimiento parental verificable. Si eres padre, madre o tutor y crees que hemos recopilado datos de tu hijo/a sin tu consentimiento, contáctanos para solicitar su eliminación.`,
      },
      {
        h: '11. Cambios a esta política',
        p: `Podemos actualizar esta política ocasionalmente. Te avisaremos dentro de la App si hay cambios importantes antes de que entren en vigor.`,
      },
      {
        h: '12. Contacto',
        p: `Si tienes preguntas sobre esta política o quieres ejercer tus derechos de protección de datos, puedes contactarnos desde la sección de soporte de la App.`,
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: `Last updated: ${LAST_UPDATED}`,
    sections: [
      {
        h: '1. What data we collect',
        p: `If you use the App without an account, your data (progress, games, settings) is stored only in your device/browser's local storage and never reaches our servers. If you create an account, we collect: email, first name, last name, username, date of birth (to verify minimum age), and the progress data you generate using the App (estimated ELO, streaks, saved games, achievements, settings). If you sign in with Google, we receive your name, email, and profile photo as permitted by your Google account settings.`,
      },
      {
        h: '2. Legal basis and purpose of processing',
        p: `We process your data to perform our contract with you for use of the App (creating and maintaining your account, syncing your progress), based on legitimate interest (improving the service, preventing fraud), and, where applicable, with your consent (for example, when you accept these terms at signup, or when you choose to show your profile on the public leaderboard).`,
      },
      {
        h: '3. What is public',
        p: `Only a limited subset of your profile (username, avatar, puzzle/opening/endgame/blindfold ELO, streak, Member badge) appears on the public leaderboard if you have an account. Your email, real first/last name, and date of birth are never made public.`,
      },
      {
        h: '4. Where data is stored and international transfers',
        p: `We use Firebase (Google LLC) for authentication and cloud storage. Your data may be stored and processed on servers located outside your country of residence, including the United States, subject to Google/Firebase's security policies and international data transfer mechanisms.`,
      },
      {
        h: '5. How long we keep your data',
        p: `We retain your account data for as long as your account remains active. If you request account deletion, we delete your associated personal and progress data from our systems within a reasonable period, except where we must retain certain information for a legal obligation or to resolve disputes.`,
      },
      {
        h: '6. Security',
        p: `We apply reasonable technical and organizational measures (Firebase-managed authentication, database access rules) to protect your data. No system is completely secure; we cannot guarantee the absolute security of information transmitted or stored.`,
      },
      {
        h: '7. Local storage and cookies',
        p: `The App uses browser local storage (localStorage/IndexedDB) to save your progress and preferences, even without an account. This storage is technical and necessary for the App to function; we do not use advertising-tracking cookies or share this information with ad networks.`,
      },
      {
        h: '8. External services',
        p: `The "Explore" feature may send the current board position (FEN format, with no data that identifies you) to Lichess's public API to look up related games, only when you actively use it. The chess engine (Stockfish) runs locally on your device; your game positions are not sent to external servers for engine analysis.`,
      },
      {
        h: '9. Your rights',
        p: `You can access, correct, export, or delete your data, and change what information is shown publicly, at any time from the App's Profile section. Depending on your country of residence, you may have additional data-protection rights (for example, portability, objection to processing, or lodging a complaint with your local data protection authority); contact us if you'd like to exercise a right you can't find directly in the App.`,
      },
      {
        h: '10. Children\'s privacy',
        p: `We ask for date of birth only to verify the minimum registration age under local law. We do not knowingly collect data from children below the allowed minimum age without verifiable parental consent. If you are a parent or guardian and believe we've collected data from your child without your consent, contact us to request its deletion.`,
      },
      {
        h: '11. Changes to this policy',
        p: `We may update this policy occasionally. We will notify you inside the App if there are significant changes before they take effect.`,
      },
      {
        h: '12. Contact',
        p: `If you have questions about this policy or want to exercise your data-protection rights, you can reach us from the App's support section.`,
      },
    ],
  },
};
