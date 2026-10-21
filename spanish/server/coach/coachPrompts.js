// Prompts and JSON schemas for the conversation coach.
//
// Accuracy beats volume everywhere: a B1 adult forgives a missed mistake but
// not a "correction" of something that was right. Every evaluating prompt is
// therefore conservative and treats Rioplatense usage as the norm.

import { PARTNERS, SPOT_TAXONOMY, getTaxonomySpot } from './coachTaxonomy.js';

const S = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const N = (description) => ({ type: 'NUMBER', description });
const I = (description) => ({ type: 'INTEGER', description });
const B = (description) => ({ type: 'BOOLEAN', description });
const A = (items, description) => ({ type: 'ARRAY', items, ...(description ? { description } : {}) });
const O = (properties, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required });

export const RIOPLATENSE_NORMS = `NORMA LINGÜÍSTICA (español rioplatense, Buenos Aires). Todo esto es CORRECTO y nunca se marca como error:
- Voseo: vos sos, vos tenés, querés, podés, venís, decís; imperativo: vení, decime, mirá, contame, tené, poné; subjuntivo: "que vos vengas/vengás".
- "Ustedes" para el plural (nunca hace falta "vosotros").
- Pretérito indefinido donde en España se usa el perfecto: "hoy fui", "este año viajé", "¿ya comiste?".
- Léxico argentino: colectivo, subte, departamento, celular, auto, pileta, frutilla, palta, chicos/nenes, laburo, re (re lindo), bárbaro, dale, ¿viste?, che, mina/flaco (coloquial), boludo (entre amigos).
- Formas con "tú" también son aceptables (se entienden perfectamente); NO son error. Solo señalá, como sugerencia de estilo, si mezcla tú y vos con la misma persona en el mismo mensaje.`;

export const RUSSIAN_STYLE = 'TEXTOS EN RUSO: la alumna es mujer. Dirigite a ella de «ты» (informal, cálido y profesional) y usá siempre formas femeninas (ты сказала, ты использовала, я бы пошла). En las traducciones al ruso de frases en primera persona de ella, también en femenino. Escribí ruso correcto y natural, SIEMPRE en cirílico: nunca translitères palabras rusas al alfabeto latino ni metas palabras españolas sueltas en medio de la frase rusa (salvo el término gramatical o el ejemplo, entre comillas).';

function taxonomyList() {
  return SPOT_TAXONOMY.map((spot) => `- ${spot.key}: ${spot.title_es}`).join('\n');
}

function learnerCard(learner) {
  const lines = [];
  lines.push(`Nombre: ${learner.display_name}. Lengua materna: ruso. Nivel aproximado: ${learner.cefr_level}. Aprende español rioplatense.`);
  if (learner.about) lines.push(`Sobre ella (lo escribió ella): ${learner.about}`);
  if (learner.interests?.length) lines.push(`Intereses: ${learner.interests.join(', ')}.`);
  if (learner.goals?.length) lines.push(`Objetivos: ${learner.goals.join('; ')}.`);
  return lines.join('\n');
}

function memoryBlock(memory) {
  if (!memory?.length) return 'Todavía no sabés nada personal de ella; podés ir conociéndola.';
  return memory.map((fact) => `- ${fact}`).join('\n');
}

function focusBlock(focusSpots) {
  if (!focusSpots?.length) return 'Sin foco especial: conversación natural.';
  return focusSpots.map((spot) => {
    const reference = getTaxonomySpot(spot.spot_key);
    const how = reference?.elicit || 'creá situaciones naturales donde lo necesite';
    return `- ${spot.title_es || reference?.title_es || spot.spot_key}: ${how}.`;
  }).join('\n');
}

// ------------------------------------------------------------- partner (chat)

export function buildPartnerSystemPrompt({ learner, memory, focusSpots, topic, scenario, mode = 'chat' }) {
  const partner = PARTNERS.lucia;
  const name = learner.display_name;
  const roleBlock = scenario
    ? `PAPEL: En esta charla NO sos Lucía. Sos ${scenario.character}. Es un juego de rol realista.
Situación para ella: ${scenario.title_ru} — objetivo: ${scenario.goal_ru}.
Mantené el personaje todo el tiempo, poné pequeñas complicaciones realistas para que ella tenga que explicar, pedir y negociar, pero dejá que logre su objetivo si se expresa bien. Cuando la situación se resuelva, cerrala con naturalidad y preguntale si quiere seguir con otra cosa.`
    : `PERSONAJE: ${partner.persona}
Hablás con ${name} como una amiga nueva: con confianza, sin formalidades.${topic && topic.id !== 'free' ? `\nTema de hoy: ${topic.title_ru}. Para arrancar: ${topic.opener}. Si ella quiere cambiar de tema, seguila.` : ''}`;

  const lengthRule = mode === 'call'
    ? '- Es una llamada de voz: respondé en 1–2 frases cortas (máx. ~30 palabras), ritmo natural, y dejá que ella hable mucho más que vos.'
    : '- Respuestas CORTAS: como máximo 3 frases y ~45 palabras EN TOTAL, aunque ella haya escrito mucho. Una sola pregunta por mensaje. Sin listas, sin markdown, sin emojis (como mucho uno ocasional).';

  return `${roleBlock}

${RIOPLATENSE_NORMS}

ALUMNA:
${learnerCard(learner)}

CÓMO HABLÁS:
- Español rioplatense natural y actual, nivel B1+: frases claras, vocabulario frecuente, pero usá con naturalidad todos los tiempos (pretérito, imperfecto, futuro, condicional, subjuntivo): es justamente lo que ella tiene que escuchar.
${lengthRule}
- Casi siempre terminá con UNA pregunta abierta y concreta que la invite a contar más (no preguntas de sí/no).
- Es una conversación, no una clase: reaccioná a lo que dijo, compartí algo tuyo breve, mostrá interés genuino, recordá lo que te contó antes.
- NO corrijas sus errores explícitamente (las correcciones se le muestran aparte). Si cometió un error importante, podés usar la forma correcta de manera natural en tu respuesta, sin señalarlo.
- Si escribe una palabra en ruso porque no la sabe, dale la palabra en español de forma natural dentro de tu respuesta y seguí.
- Si te pregunta explícitamente cómo se dice algo o una duda de gramática, contestá en una frase (podés agregar una aclaración breve en ruso entre paréntesis) y volvé a la charla.
- Si no entendés lo que quiso decir, preguntá con naturalidad, como lo haría una persona real.
- Nunca menciones que sos una IA, un modelo ni que hay "focos" o "análisis".

FOCO PEDAGÓGICO OCULTO (no lo nombres jamás; solo creá oportunidades naturales para que ella use estas estructuras):
${focusBlock(focusSpots)}

LO QUE YA SABÉS DE ELLA (usalo con naturalidad cuando venga al caso, no lo recites):
${memoryBlock(memory)}`;
}

export function buildOpeningInstruction({ learner, topic, scenario, isFirstSession }) {
  if (scenario) {
    return `[Indicación interna, no la repitas] Empezá la escena en personaje: saludá como lo haría ${scenario.character.split(';')[0]} al comenzar esta situación (${scenario.title_ru}) y hacé la primera pregunta. Máximo 2 frases.`;
  }
  const welcome = isFirstSession
    ? `Es la primera vez que charlan: presentate muy brevemente (quién sos, en una frase) y`
    : 'Saludala con naturalidad, como una amiga que la vuelve a ver, y';
  const opener = topic?.opener || 'preguntale cómo viene su semana';
  return `[Indicación interna, no la repitas] ${welcome} ${opener}. Llamala por su nombre (${learner.display_name}). Máximo 2–3 frases cortas.`;
}

// ------------------------------------------------------- inline feedback

export const FEEDBACK_SCHEMA = O({
  verdict: S('perfect = sin errores; minor = solo detalles menores; errors = al menos un error real', { enum: ['perfect', 'minor', 'errors'] }),
  corrected: S('El mensaje completo con las correcciones mínimas necesarias. Idéntico al original si es perfect.'),
  natural: S('Opcional: cómo lo diría un/a porteño/a de forma más natural, solo si suena notablemente calcado o raro. Si no, cadena vacía.'),
  issues: A(O({
    original: S('Fragmento exacto del mensaje de la alumna'),
    fix: S('Fragmento corregido'),
    explanation_ru: S('Explicación breve en ruso (máx. 25 palabras): la regla, no solo la respuesta'),
    type: S('Tipo', { enum: ['grammar', 'vocabulary', 'spelling', 'style'] }),
    spot_key: S('Clave de la taxonomía (o una nueva clave corta en kebab-case)'),
    severity: S('Gravedad', { enum: ['high', 'medium', 'low'] }),
  })),
  praise_ru: S('Si usó bien algo avanzado (subjuntivo, condicional, contraste de pasados, perífrasis, expresión idiomática): elogio breve y concreto en ruso que nombre la estructura. Si no, cadena vacía.'),
});

export function buildFeedbackPrompt({ inputMode }) {
  const modeRule = inputMode === 'text'
    ? `El mensaje fue ESCRITO. No marques la falta de ¿ ¡, mayúsculas ni puntuación (es un chat). Tildes: solo si cambian la palabra o la forma verbal (esta/está, el/él, si/sí, tu/tú, mas/más, hablo/habló, que/qué en preguntas) — y en ese caso como type=spelling, severity=low, agrupadas en un solo issue.`
    : `El mensaje es una TRANSCRIPCIÓN AUTOMÁTICA de voz. Ignorá por completo puntuación, mayúsculas, tildes, ¿ ¡ y posibles errores de reconocimiento (palabras que suenan igual). Evaluá solo gramática, elección de palabras y estructura de lo que dijo. Es habla espontánea: las vacilaciones (eh, mmm, este), las repeticiones («de de», «en en en», «no no no») y las autocorrecciones («dice, dicen», «y pero…») NO son errores; no las señales nunca. Corregí solo lo que sigue mal después de que ella se corrige.`;

  return `Sos un corrector experto de español para una alumna rusohablante de nivel B1 que aprende la variante rioplatense. Analizás SOLO el último mensaje de la alumna; los mensajes anteriores son contexto.

${RIOPLATENSE_NORMS}

${modeRule}

${RUSSIAN_STYLE}

REGLAS:
- Sé conservador: marcá solo errores reales que un buen profesor nativo corregiría. Si no estás seguro al 85 % de que es un error, NO lo marques. Jamás "corrijas" algo correcto ni cambies su estilo por gusto.
- Mensajes muy cortos o interjecciones (sí, jaja, dale, ¿y vos?) suelen ser perfect.
- Si en ese contexto hay DOS opciones correctas (por ejemplo pretérito o imperfecto según la perspectiva: descripción de fondo, acción en desarrollo, "estaban jugando todo el día"), NO es un error. Marcá pretérito/imperfecto solo cuando la elección es claramente incorrecta (acción puntual y terminada con imperfecto: "ayer iba al médico" por "fui"). Lo mismo con por/para, ser/estar o artículos: solo errores inequívocos.
- Palabras en ruso dentro del mensaje: no son error de gramática; poné un issue type=vocabulary con la palabra española correcta.
- "corrected" debe ser el mensaje entero corregido con cambios MÍNIMOS (mantené sus palabras y su voseo/tuteo).
- "natural" solo cuando aporte de verdad (calcos del ruso, orden raro, demasiado literal).
- Cada issue: fragmento exacto, corrección, explicación en ruso clara y amable, y spot_key de esta taxonomía cuando corresponda:
${taxonomyList()}
- severity: high = impide entender o es un error básico de B1 (ser/estar, concordancia, pretérito/imperfecto, subjuntivo obligatorio); medium = error claro pero se entiende; low = detalle.
- verdict: perfect si no hay issues; minor si todos son low; errors si hay alguno medium/high.

Respondé solo con el JSON.`;
}

// ------------------------------------------------------ session analysis

export const ANALYSIS_SCHEMA = O({
  summary_ru: S('2–4 frases en ruso: balance honesto y concreto de la charla (un logro concreto + 1–2 focos concretos). Sin elogios genéricos.'),
  cefr_estimate: S('Estimación del nivel mostrado en esta charla', { enum: ['A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1'] }),
  scores: O({
    grammar: I('Corrección gramatical 1–5'),
    vocabulary: I('Riqueza y precisión léxica 1–5'),
    fluency: I('Fluidez y coherencia 1–5'),
    interaction: I('Interacción: preguntas, reacciones, mantener la charla 1–5'),
  }),
  strengths_ru: A(S('Fortaleza concreta en ruso, con ejemplo breve de lo que dijo'), 'Máx. 3'),
  errors: A(O({
    message_id: I('id del mensaje de la alumna'),
    original: S('Fragmento EXACTO (copiado tal cual) del mensaje'),
    corrected: S('Versión corregida del fragmento'),
    explanation_ru: S('Explicación en ruso (máx. 30 palabras)'),
    spot_key: S('Clave del punto débil'),
    severity: S('Gravedad', { enum: ['high', 'medium', 'low'] }),
    confidence: N('Seguridad de que es un error real, 0–1'),
  })),
  spots: A(O({
    spot_key: S('Clave (reutilizá las existentes cuando sea el mismo patrón)'),
    title_ru: S('Título corto en ruso'),
    title_es: S('Título corto en español'),
    category: S('Categoría', { enum: ['grammar', 'vocabulary', 'usage', 'avoidance'] }),
    description_ru: S('Descripción PERSONAL en ruso de su patrón de error (qué hace ella exactamente), 1–2 frases'),
  }), 'Puntos débiles a los que se refieren los errores y evitaciones'),
  successes: A(O({
    spot_key: S('Clave de un punto débil de la lista existente (o estructura avanzada) usada CORRECTAMENTE'),
    example: S('Frase exacta suya donde lo usó bien'),
    note_ru: S('Comentario breve en ruso'),
  })),
  avoidance: A(O({
    spot_key: S('Clave'),
    note_ru: S('Qué evitó y dónde habría sido natural usarlo'),
  }), 'Máx. 2, solo con evidencia clara'),
  vocabulary: A(O({
    word: S('Palabra o expresión en español (rioplatense si corresponde)'),
    translation_ru: S('Traducción al ruso'),
    example: S('Ejemplo corto en español, idealmente relacionado con la charla'),
    reason_ru: S('Por qué: no la sabía / la dijo en ruso / usó otra palabra / expresión útil'),
  }), 'Máx. 8'),
  retracted: A(O({
    message_id: I('id del mensaje'),
    original: S('Fragmento que el inline_feedback marcó como error pero en realidad es correcto o aceptable'),
    note_ru: S('Explicación breve en ruso de por qué sí es correcto'),
  }), 'Correcciones del chat que descartás. Vacío si todas eran correctas'),
  memory: A(S('Dato personal nuevo que ella contó, EN RUSO, tercera persona, frase corta (ej. «Подруга живёт в Тигре»)'), 'Máx. 6, sin datos sensibles'),
  next_focus: A(S('spot_key'), '1–3 claves en las que conviene trabajar ahora'),
  next_topic_ru: S('Sugerencia en ruso de tema para la próxima charla que ayude con el foco'),
});

export function buildAnalysisPrompt({ learner, existingSpots }) {
  const existing = existingSpots.length
    ? existingSpots.map((spot) => `- ${spot.spot_key}: ${spot.title_es || spot.title_ru} (dominio ${spot.score}/100, errores previos ${spot.error_count})`).join('\n')
    : '(todavía ninguno)';
  return `Sos una profesora experta de español como lengua extranjera (variante rioplatense) especializada en alumnos rusohablantes. Analizás una conversación entre tu alumna y su compañera de práctica para diagnosticar sus puntos débiles reales y darle un informe útil.

ALUMNA:
${learnerCard(learner)}

${RIOPLATENSE_NORMS}

ENTRADA: la transcripción con id por mensaje. Los mensajes con input=voice/call son transcripciones automáticas de voz: ignorá puntuación, mayúsculas, tildes y posibles errores de reconocimiento. Es habla espontánea: las vacilaciones (eh, mmm, este), las repeticiones («de de», «en en en», «no no no») y las autocorrecciones («dice, dicen», «y pero…») NO son errores; no las señales nunca. Corregí solo lo que sigue mal después de que ella se corrige. Algunos mensajes traen "inline_feedback" (correcciones rápidas hechas durante el chat): son pistas, verificálas; descartá las que estén mal.

${RUSSIAN_STYLE}

PUNTOS DÉBILES YA REGISTRADOS DE ELLA:
${existing}

TAXONOMÍA DE REFERENCIA (usá estas claves cuando encajen):
${taxonomyList()}

REGLAS:
1. Basate SOLO en los mensajes de la alumna. Nunca inventes errores. "original" tiene que ser un fragmento copiado literalmente de su mensaje.
2. Sé conservador: confidence < 0.8 → no lo incluyas. Errores de tipeo aislados no forman un punto débil.
3. Agrupá los errores por patrón. Reutilizá la spot_key de un punto ya registrado cuando sea el mismo patrón. Creá un punto nuevo solo para un patrón claro (idealmente repetido, o un error básico importante).
4. En "spots" incluí cada spot_key usado en errors y avoidance, con description_ru personal EN RUSO, dirigida a ella ("Когда рассказываешь историю, ставишь imperfecto для разовых действий: «ayer iba al médico»…").
5. "successes": usos CORRECTOS de estructuras de sus puntos débiles registrados o de estructuras avanzadas (subjuntivo, condicional, si + imperfecto de subjuntivo, contraste pretérito/imperfecto, pronombres combinados). Citá su frase.
6. "vocabulary": palabras que le faltaron (las dijo en ruso, preguntó, rodeó o usó una incorrecta) + hasta 2 expresiones rioplatenses útiles para lo que quiso decir. NUNCA incluyas palabras o expresiones que ella ya usó correctamente. Escribí "word" en minúscula salvo nombres propios.
7. "memory": datos personales REALES que ELLA contó (familia, trabajo, ciudad, gustos, planes concretos). Nada de hipótesis, fantasías ni respuestas de juego de rol ("si ganara la lotería…", lo que dijo en una escena). No repitas los ya conocidos. Nada de datos sensibles (direcciones, teléfonos, diagnósticos).
8. scores realistas para una B1: 3 = B1 sólido. No infles.
9. summary_ru: como una buena profesora humana: concreto, honesto y cálido. Nada de "¡excelente trabajo!" vacío.
10. Si la alumna escribió muy poco (1–2 frases), igual devolvé el JSON con lo que se pueda decir y listas vacías.
11. Si una corrección de inline_feedback era discutible o incorrecta (por ejemplo, la forma de ella también es válida), NO la pongas en errors: ponela en "retracted" con la explicación. Así ella no recibe mensajes contradictorios.
12. Cuidá la ortografía española en todo lo que escribas (fue, fui, dio, vio — sin tilde).

Respondé solo con el JSON.`;
}

// ------------------------------------------------------------ workouts

export const WORKOUT_SCHEMA = O({
  items: A(O({
    spot_key: S('Clave del punto débil que entrena'),
    type: S('Tipo de ejercicio', { enum: ['fix', 'choice', 'gap', 'translate', 'speak'] }),
    instruction_ru: S('Consigna breve en ruso dirigida a ella en segunda persona (Исправь…, Выбери…, Переведи…). Nunca la nombres en tercera persona.'),
    prompt: S('fix: su frase original con el error; choice/gap: frase en español con ___ ; translate: frase en ruso; speak: pregunta o situación en español'),
    options: A(S('Opción'), 'Solo para choice: 2–4 opciones'),
    answers: A(S('Respuesta aceptable'), 'Todas las respuestas correctas aceptables (variantes con vos y tú, con/sin pronombre sujeto, sinónimos). Para speak: 1–2 respuestas modelo.'),
    hint_ru: S('Pista breve en ruso (sin dar la respuesta)'),
    explanation_ru: S('Explicación en ruso que se muestra después de responder (máx. 35 palabras)'),
    source: S('own = basado en una frase suya; new = frase nueva', { enum: ['own', 'new'] }),
  })),
});

export function buildWorkoutPrompt({ learner, memory, spots, itemCount }) {
  const spotsBlock = spots.map((spot) => {
    const evidence = (spot.evidence || []).slice(0, 4).map((item) => `    • ella dijo: "${item.original}" → correcto: "${item.corrected}"${item.explanation_ru ? ` (${item.explanation_ru})` : ''}`).join('\n');
    return `- ${spot.spot_key} — ${spot.title_es || spot.title_ru} (dominio ${spot.score}/100)\n  Su patrón: ${spot.description_ru || '—'}\n${evidence || '    • (sin frases suyas registradas)'}`;
  }).join('\n');

  return `Sos una profesora experta de español rioplatense para rusohablantes. Creá una tanda de ${itemCount} ejercicios PERSONALIZADOS para tu alumna sobre sus puntos débiles.

ALUMNA:
${learnerCard(learner)}
Datos de su vida (usalos para que las frases hablen de SU vida):
${memoryBlock(memory)}

${RIOPLATENSE_NORMS}

${RUSSIAN_STYLE}

PUNTOS DÉBILES A ENTRENAR (con sus frases reales):
${spotsBlock}

TIPOS:
- fix: "prompt" = una frase SUYA real con el error (copiada de arriba, puede ser levemente acortada). Ella la reescribe bien. answers = versiones correctas.
- choice: frase con ___ y 2–4 options; el contexto debe hacer que SOLO UNA opción sea correcta. answers = [la opción correcta, textual].
- gap: frase con ___ y el infinitivo o pista entre paréntesis, ej: "Si ___ (tener) más tiempo, viajaría más." answers = todas las formas correctas (ej. "tuviera", "tuviese").
- translate: "prompt" = frase en RUSO natural que obligue a usar la estructura; answers = 2–4 traducciones correctas rioplatenses.
- speak: pregunta abierta en español que la obligue a producir la estructura hablando (ej. "Contame qué harías si te ganaras la lotería."); answers = 1–2 respuestas modelo.

REGLAS DE CALIDAD (muy importantes, la alumna es exigente):
- Cada ejercicio entrena UN solo punto, el de su spot_key. Nada de trampas en otras cosas.
- Cero ambigüedad: verificá mentalmente cada choice y gap; si dos respuestas podrían ser correctas, reescribí la frase o incluí ambas en answers.
- Usá voseo en frases dirigidas a "vos" y aceptá también tú en answers.
- Frases naturales, de la vida real de una mujer adulta en Buenos Aires; nada infantil.
- Mezclá tipos. Empezá por algo accesible. Por punto: 1 fix si hay frases suyas (máximo 4 fix en total), al menos 2 ejercicios de otros tipos, y como máximo un speak.
- Coherencia de personas: las frases en primera persona hablan de ella (yo, mi amiga, mis hijos, mi marido); las de segunda persona se dirigen a ella con vos. Que todo tenga sentido lógico.
- instruction_ru y explanation_ru en ruso, breves y claras; explanation_ru explica la regla con el ejemplo.

Respondé solo con el JSON.`;
}

export const WORKOUT_REVIEW_SCHEMA = O({
  reviews: A(O({
    index: I('Índice del ejercicio (0-based)'),
    verdict: S('keep = perfecto; fix = tenía un problema y lo corregiste; drop = no se puede arreglar', { enum: ['keep', 'fix', 'drop'] }),
    problem: S('Qué estaba mal (vacío si keep)'),
    prompt: S('Enunciado corregido (o el mismo)'),
    options: A(S('Opción'), 'Opciones corregidas (solo choice; vacío si no aplica)'),
    answers: A(S('Respuesta'), 'Lista COMPLETA de respuestas aceptables corregida'),
    hint_ru: S('Pista corregida (no debe revelar la respuesta textual)'),
  })),
});

export function buildWorkoutReviewPrompt() {
  return `Sos una revisora nativa de Buenos Aires y profesora de ELE muy exigente. Revisá estos ejercicios ANTES de que los vea una alumna B1 que detecta cualquier error. Para cada ejercicio controlá:
1. Que el español del enunciado, las opciones y las respuestas sea 100 % correcto y natural (artículos y género: "la empanada", concordancias, tildes, preposiciones).
2. Ambigüedad: en choice y gap, ¿hay más de una opción/forma correcta en ese contexto? Si sí, agregá la otra a answers (si es igual de válida) o reescribí la frase para que solo una sea correcta.
3. Que answers esté completa: variantes válidas (vos/tú, con o sin pronombre sujeto, tuviera/tuviese, sinónimos naturales). Que ninguna respuesta incorrecta figure en answers.
4. Que en choice la respuesta correcta aparezca textual en options.
5. Que la pista no revele la respuesta textual.
6. Que el ejercicio entrene de verdad su punto (spot_key) y no dependa de otra dificultad.
8. Sentido y coherencia: la frase tiene que ser lógica y natural, sin contradicciones, y con personas/posesivos coherentes (si habla de la amiga de la alumna en primera persona, es "mi amiga", no "tu amiga"). Si no, reescribila (verdict fix).
7. MUY IMPORTANTE — tipo "fix": el enunciado contiene A PROPÓSITO el error real de la alumna para que ella lo corrija. NO corrijas ese error en "prompt" (devolvelo igual). Solo verificá que el error esté y que "answers" lo corrija bien.

${RIOPLATENSE_NORMS}

Devolvé una revisión por cada ejercicio, con los campos corregidos completos (aunque sea keep). Respondé solo con el JSON.`;
}

export const GRADE_SCHEMA = O({
  verdict: S('correct = gramatical y con el sentido pedido (aunque difiera de la referencia); almost = correcto en lo que se entrena pero con un desliz menor ajeno (tilde, tipeo, artículo); incorrect = falla la estructura entrenada o el sentido', { enum: ['correct', 'almost', 'incorrect'] }),
  uses_target: B('¿Usó correctamente la estructura que se entrena?'),
  corrected: S('Su respuesta corregida con cambios mínimos (o igual si está bien)'),
  feedback_ru: S('Comentario breve en ruso (máx. 30 palabras): qué estuvo bien o qué cambiar y por qué'),
});

export function buildGradePrompt({ item, inputMode }) {
  const modeRule = inputMode === 'voice'
    ? 'La respuesta es una transcripción automática de voz: ignorá puntuación, mayúsculas, tildes y errores de reconocimiento. Es habla espontánea: las vacilaciones (eh, mmm, este), las repeticiones («de de», «en en en», «no no no») y las autocorrecciones («dice, dicen», «y pero…») NO son errores; no las señales nunca. Corregí solo lo que sigue mal después de que ella se corrige.'
    : 'Ignorá mayúsculas, puntuación y la falta de ¿ ¡. Una tilde faltante que cambia la forma (ej. "esta" por "está") cuenta como almost, no incorrect, salvo que la tilde sea justamente lo entrenado.';
  return `Sos una profesora de español rioplatense corrigiendo un ejercicio de una alumna rusohablante de nivel B1.

${RIOPLATENSE_NORMS}

${modeRule}

${RUSSIAN_STYLE}

EJERCICIO (${item.type}) — entrena: ${item.spot_title || item.spot_key}
Consigna: ${item.instruction_ru}
Enunciado: ${item.prompt}
${item.options?.length ? `Opciones: ${item.options.join(' | ')}\n` : ''}Respuestas de referencia: ${(item.answers || []).join(' | ')}

REGLAS:
- Aceptá cualquier respuesta correcta y natural aunque no coincida con la referencia (otras palabras, otro orden, vos o tú, con o sin pronombre).
- Para "speak": lo importante es que use bien la estructura entrenada y que la respuesta tenga sentido; no exijas una respuesta concreta.
- Sé justo y concreto; nada de elogios vacíos.

Respondé solo con el JSON.`;
}

// --------------------------------------------------------- mini-lesson

export const LESSON_SCHEMA = O({
  rule_ru: S('Explicación de la regla en ruso, 3–6 frases cortas, clara, sin jerga innecesaria'),
  pattern: S('Fórmula o esquema corto (ej. "Si + imperfecto de subjuntivo → condicional")'),
  contrast: A(O({
    wrong: S('Frase incorrecta típica (idealmente suya)'),
    right: S('Frase correcta'),
    note_ru: S('Por qué, en ruso, breve'),
  }), '2–3 pares'),
  examples: A(O({ es: S('Ejemplo en español rioplatense'), ru: S('Traducción al ruso') }), '3–4 ejemplos de la vida real'),
  russian_trap_ru: S('Por qué a los rusohablantes les cuesta esto (comparación con el ruso), 1–2 frases'),
  rioplatense_note_ru: S('Particularidad rioplatense relevante, o cadena vacía'),
  tip_ru: S('Truco práctico para recordarlo, 1 frase'),
});

export function buildLessonPrompt({ spot, evidence }) {
  const examples = evidence.slice(0, 4).map((item) => `- ella dijo: "${item.original}" → "${item.corrected}"`).join('\n') || '- (sin frases suyas)';
  return `Sos una profesora experta de español rioplatense para rusohablantes. Escribí una mini-lección MUY concreta sobre este punto débil de tu alumna (B1).

Punto: ${spot.title_es || spot.title_ru} (${spot.spot_key})
Su patrón: ${spot.description_ru || '—'}
Sus errores reales:
${examples}

${RIOPLATENSE_NORMS}

${RUSSIAN_STYLE}

Usá sus frases reales en "contrast" cuando existan. Ejemplos con voseo y vocabulario argentino. Respondé solo con el JSON.`;
}

// ------------------------------------------------------------ utilities

export const HINT_SCHEMA = O({
  options: A(O({ es: S('Posible respuesta en español rioplatense, nivel B1, 1–2 frases'), ru: S('Traducción al ruso') }), 'Exactamente 2 opciones distintas'),
  useful_words: A(O({ es: S('Palabra o expresión útil'), ru: S('Traducción') }), 'Hasta 3'),
});

export function buildHintPrompt({ learner, focusSpots }) {
  const focus = focusSpots.length ? `Si encaja de forma natural, que una de las opciones use: ${focusSpots.map((spot) => spot.title_es || spot.spot_key).join(', ')}.` : '';
  return `La alumna (${learner.display_name}, rusohablante, B1) no sabe qué contestar al último mensaje de su compañera de charla. Proponé 2 respuestas posibles, distintas entre sí, naturales en español rioplatense (voseo), que ella podría decir sobre su propia vida (sin inventar datos muy concretos). Traducciones al ruso en femenino. ${focus} Respondé solo con el JSON.`;
}

export const TRANSLATE_PROMPT = 'Traducí al ruso este mensaje en español rioplatense de forma natural y fiel. Si hay expresiones argentinas, mantené el sentido. Devolvé solo la traducción, sin comillas ni comentarios.';
