// Conversation coach (B1+) reference data: weak-spot taxonomy, conversation
// topics, role-play situations and partner personas. Everything here is static;
// per-learner state lives in coachStore.js.

// Typical B1 trouble spots for Russian speakers learning Rioplatense Spanish.
// `elicit` tells the conversation partner how to create a natural need for the
// structure without turning the chat into a lesson.
export const SPOT_TAXONOMY = [
  { key: 'preterito-vs-imperfecto', title_ru: 'Pretérito или imperfecto', title_es: 'Pretérito indefinido vs. imperfecto', category: 'grammar', elicit: 'pedile que te cuente una anécdota concreta del pasado (qué pasó, cómo era el lugar, qué sentía)' },
  { key: 'preterito-irregulares', title_ru: 'Неправильные глаголы в прошедшем', title_es: 'Pretéritos irregulares (tuve, hice, pude, dije, fui)', category: 'grammar', elicit: 'preguntale qué hizo ayer o el fin de semana, a dónde fue, qué tuvo que hacer' },
  { key: 'ser-estar', title_ru: 'Ser или estar', title_es: 'Ser vs. estar', category: 'grammar', elicit: 'preguntale cómo es alguien o algo y cómo está hoy, describir lugares y estados de ánimo' },
  { key: 'hay-estar', title_ru: 'Hay или está', title_es: 'Hay vs. estar (existencia y ubicación)', category: 'grammar', elicit: 'preguntale qué hay en su barrio y dónde está cada cosa' },
  { key: 'subjuntivo-deseo', title_ru: 'Subjuntivo после «хочу, чтобы» / «надеюсь, что»', title_es: 'Subjuntivo con deseo e influencia (quiero que, espero que, ojalá)', category: 'grammar', elicit: 'preguntale qué espera de algo, qué le pide a sus hijos, qué le gustaría que pase' },
  { key: 'subjuntivo-emocion-opinion', title_ru: 'Subjuntivo после эмоций и «no creo que»', title_es: 'Subjuntivo con emoción, valoración y duda (me molesta que, no creo que, es importante que)', category: 'grammar', elicit: 'preguntale qué le molesta, qué le parece raro de la Argentina, si cree que algo va a cambiar' },
  { key: 'subjuntivo-temporal', title_ru: 'Subjuntivo после cuando / hasta que / en cuanto', title_es: 'Subjuntivo en oraciones temporales de futuro (cuando llegue, en cuanto pueda)', category: 'grammar', elicit: 'preguntale qué va a hacer cuando terminen las vacaciones, cuando sus hijos crezcan' },
  { key: 'si-hipotetico', title_ru: 'Условные: «Если бы…» (si + imperfecto de subjuntivo)', title_es: 'Condicionales irreales: si tuviera…, haría…', category: 'grammar', elicit: 'hacele preguntas hipotéticas: ¿qué harías si…?, ¿dónde vivirías si pudieras elegir?' },
  { key: 'condicional', title_ru: 'Condicional (haría, podría, me gustaría)', title_es: 'Condicional simple', category: 'grammar', elicit: 'preguntale qué le gustaría hacer, qué recomendaría, qué haría en tu lugar' },
  { key: 'futuro-planes', title_ru: 'Будущее и планы', title_es: 'Futuro: ir a + infinitivo y futuro simple', category: 'grammar', elicit: 'preguntale por sus planes para la semana, el verano, el año que viene' },
  { key: 'por-para', title_ru: 'Por или para', title_es: 'Por vs. para', category: 'grammar', elicit: 'preguntale para qué hace algo, por qué lugar pasea, cuánto pagó por algo' },
  { key: 'articulos', title_ru: 'Артикли (el/la, un/una, без артикля)', title_es: 'Uso de artículos determinados e indeterminados', category: 'grammar', elicit: 'pedile que describa su casa, su rutina, sus gustos (me gusta el café, tengo un perro)' },
  { key: 'genero-concordancia', title_ru: 'Род и согласование', title_es: 'Género y concordancia (el problema, la mano, adjetivos)', category: 'grammar', elicit: 'pedile descripciones de personas, objetos y lugares con adjetivos' },
  { key: 'preposiciones', title_ru: 'Предлоги (a, en, de, con…)', title_es: 'Preposiciones y régimen verbal (ir a, pensar en, soñar con, casarse con)', category: 'grammar', elicit: 'preguntale a dónde va, en qué piensa, con quién sale, de qué depende algo' },
  { key: 'a-personal', title_ru: 'Предлог «a» перед людьми', title_es: 'A personal (visité a mi madre)', category: 'grammar', elicit: 'preguntale a quién visitó, a quién conoce, a quién extraña' },
  { key: 'pronombres-objeto', title_ru: 'Местоимения lo/la/le, se lo', title_es: 'Pronombres de objeto directo e indirecto y su posición', category: 'grammar', elicit: 'preguntale qué hizo con algo que compró o recibió (¿se lo diste?, ¿lo probaste?)' },
  { key: 'verbos-gustar', title_ru: 'Gustar, encantar, doler, molestar', title_es: 'Verbos tipo gustar', category: 'grammar', elicit: 'preguntale qué le gusta, qué le encanta, qué le molesta, qué le duele después del gimnasio' },
  { key: 'verbos-pronominales', title_ru: 'Возвратные глаголы (acordarse, quedarse, irse)', title_es: 'Verbos pronominales y reflexivos', category: 'grammar', elicit: 'preguntale a qué hora se levanta, si se acuerda de algo, si se quedó en casa' },
  { key: 'perifrasis', title_ru: 'Перифразы (acabar de, volver a, seguir + gerundio)', title_es: 'Perífrasis verbales', category: 'grammar', elicit: 'preguntale qué acaba de hacer, qué sigue haciendo desde que llegó, qué dejó de hacer' },
  { key: 'conjugacion-presente', title_ru: 'Спряжение в настоящем (в т.ч. vos)', title_es: 'Conjugación en presente, incluido el voseo', category: 'grammar', elicit: 'preguntale por su rutina y la de su familia' },
  { key: 'imperativo', title_ru: 'Повелительное наклонение (vení, decime, no te preocupes)', title_es: 'Imperativo afirmativo y negativo (voseo)', category: 'grammar', elicit: 'pedile una receta, un consejo o indicaciones para llegar a un lugar' },
  { key: 'estilo-indirecto', title_ru: 'Косвенная речь (dijo que…)', title_es: 'Estilo indirecto y concordancia de tiempos', category: 'grammar', elicit: 'preguntale qué le dijo alguien (el médico, la maestra, una amiga)' },
  { key: 'doble-negacion', title_ru: 'Двойное отрицание (no… nada, nunca)', title_es: 'Negación (no… nada / nadie / nunca)', category: 'grammar', elicit: 'preguntale qué no hizo nunca, si no conoce a nadie en algún lugar' },
  { key: 'comparativos', title_ru: 'Сравнения (más… que, tan… como)', title_es: 'Comparativos y superlativos', category: 'grammar', elicit: 'pedile que compare su ciudad de origen con Buenos Aires, dos épocas, dos opciones' },
  { key: 'orden-palabras', title_ru: 'Порядок слов', title_es: 'Orden de palabras', category: 'grammar', elicit: 'pedile opiniones y explicaciones más largas' },
  { key: 'calcos-ruso', title_ru: 'Кальки с русского', title_es: 'Calcos del ruso', category: 'usage', elicit: 'charla natural sobre la vida diaria' },
  { key: 'vocabulario-preciso', title_ru: 'Точный выбор слова', title_es: 'Precisión léxica', category: 'vocabulary', elicit: 'charla sobre temas concretos (trabajo, salud, trámites)' },
  { key: 'conectores', title_ru: 'Связки (aunque, sin embargo, o sea, entonces)', title_es: 'Conectores del discurso', category: 'usage', elicit: 'pedile que explique pros y contras de algo, o que cuente una historia con varias partes' },
  { key: 'registro', title_ru: 'Вежливость и уместность (vos/usted)', title_es: 'Registro y cortesía', category: 'usage', elicit: 'en situaciones formales (médico, banco, escuela)' },
];

const SPOT_BY_KEY = new Map(SPOT_TAXONOMY.map((spot) => [spot.key, spot]));

export function getTaxonomySpot(key) {
  return SPOT_BY_KEY.get(String(key || '')) || null;
}

export function normalizeSpotKey(raw) {
  const key = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return key || 'otros';
}

export const PARTNERS = {
  lucia: {
    id: 'lucia',
    name: 'Lucía',
    voice: 'Sulafat',
    persona: 'Sos Lucía, 34 años, porteña de Villa Crespo (Buenos Aires). Sos diseñadora gráfica freelance, no tenés hijos (tenés un sobrino de 7 años, Benja), tenés un perro mestizo que se llama Tango, te encanta cocinar, ir a la feria de San Telmo, el cine argentino y viajar por el interior (Mendoza, Salta, la Patagonia). Sos cálida, curiosa y con humor; contás anécdotas propias cortas y das tu opinión: no sos una entrevistadora ni una profesora.',
  },
};

// Conversation topics. `focus` lists weak-spot keys that the topic naturally
// exercises; the partner gets them as hidden elicitation goals.
export const TOPICS = [
  { id: 'free', title_ru: 'Просто поболтать', subtitle_ru: 'Как дела, что нового, о чём угодно', emoji: '☕', opener: 'preguntale cómo viene su semana y qué novedades tiene', focus: [] },
  { id: 'weekend', title_ru: 'Как прошли выходные', subtitle_ru: 'Рассказать, что было — прошедшие времена', emoji: '🗓️', opener: 'preguntale qué hizo el fin de semana pasado', focus: ['preterito-vs-imperfecto', 'preterito-irregulares'] },
  { id: 'childhood', title_ru: 'Детство и воспоминания', subtitle_ru: 'Какой была жизнь раньше', emoji: '📷', opener: 'preguntale cómo era su vida cuando era chica, dónde vivía y qué hacía', focus: ['preterito-vs-imperfecto'] },
  { id: 'argentina', title_ru: 'Жизнь в Аргентине', subtitle_ru: 'Что удивляет, что нравится и раздражает', emoji: '🇦🇷', opener: 'preguntale qué le llamó la atención de la vida en la Argentina', focus: ['subjuntivo-emocion-opinion', 'verbos-gustar', 'comparativos'] },
  { id: 'plans', title_ru: 'Планы и мечты', subtitle_ru: 'Что впереди, чего хочется', emoji: '🧭', opener: 'preguntale qué planes tiene para los próximos meses', focus: ['futuro-planes', 'subjuntivo-temporal', 'subjuntivo-deseo'] },
  { id: 'what-if', title_ru: 'А что, если бы…', subtitle_ru: 'Гипотезы и фантазии', emoji: '✨', opener: 'hacele una pregunta hipotética divertida (¿qué harías si…?)', focus: ['si-hipotetico', 'condicional'] },
  { id: 'family', title_ru: 'Семья и дети', subtitle_ru: 'Школа, кружки, воспитание', emoji: '👨‍👩‍👧', opener: 'preguntale por su familia y cómo es un día típico con los chicos', focus: ['subjuntivo-deseo', 'pronombres-objeto', 'verbos-pronominales'] },
  { id: 'work', title_ru: 'Работа и дела', subtitle_ru: 'Профессия, проекты, коллеги', emoji: '💼', opener: 'preguntale a qué se dedica y qué es lo que más le gusta de su trabajo', focus: ['ser-estar', 'perifrasis', 'conectores'] },
  { id: 'food', title_ru: 'Еда и рецепты', subtitle_ru: 'Любимые блюда, как готовить', emoji: '🥟', opener: 'preguntale cuál es su comida favorita y cómo se prepara', focus: ['imperativo', 'articulos', 'pronombres-objeto'] },
  { id: 'culture', title_ru: 'Фильмы, сериалы, книги', subtitle_ru: 'Что смотрела, что посоветует', emoji: '🎬', opener: 'preguntale qué serie o película vio últimamente y qué le pareció', focus: ['preterito-vs-imperfecto', 'subjuntivo-emocion-opinion', 'condicional'] },
  { id: 'travel', title_ru: 'Путешествия', subtitle_ru: 'Где была, куда хочется', emoji: '✈️', opener: 'preguntale cuál fue el mejor viaje de su vida', focus: ['preterito-vs-imperfecto', 'por-para', 'si-hipotetico'] },
];

// Role-play situations: the partner plays a character with a concrete goal for
// the learner. Formal situations exercise register (usted) on purpose.
export const SCENARIOS = [
  { id: 'doctor', name: 'Dra. Gabriela Ruiz', title_ru: 'У врача', subtitle_ru: 'Объяснить симптомы и понять рекомендации', emoji: '🩺', character: 'la doctora Gabriela Ruiz, médica clínica en un consultorio de Palermo; trato de usted, amable y eficiente', goal_ru: 'Описать симптомы, ответить на вопросы врача и понять, что делать дальше', voice: 'Kore', focus: ['verbos-gustar', 'preterito-vs-imperfecto', 'registro'] },
  { id: 'rental', name: 'Marcelo', title_ru: 'Аренда квартиры', subtitle_ru: 'Звонок по объявлению', emoji: '🏠', character: 'Marcelo, agente de una inmobiliaria de Belgrano; habla rápido, usa vos, quiere cerrar la visita', goal_ru: 'Узнать цену, расходы (expensas), условия и договориться о просмотре', voice: 'Puck', focus: ['condicional', 'registro', 'por-para'] },
  { id: 'school', name: 'Seño Patricia', title_ru: 'Разговор с учительницей', subtitle_ru: 'Встреча по поводу ребёнка', emoji: '🏫', character: 'la seño Patricia, maestra de primaria de su hija; cálida pero preocupada porque la nena está distraída', goal_ru: 'Обсудить поведение ребёнка и договориться, что делать', voice: 'Aoede', focus: ['subjuntivo-deseo', 'estilo-indirecto', 'pronombres-objeto'] },
  { id: 'complaint', name: 'Diego', title_ru: 'Возврат и жалоба', subtitle_ru: 'Вернуть сломанную вещь в магазин', emoji: '🧾', character: 'Diego, empleado de un local de electrodomésticos; algo desganado, pone excusas', goal_ru: 'Объяснить, что случилось, и добиться замены или возврата денег', voice: 'Charon', focus: ['preterito-irregulares', 'subjuntivo-deseo', 'pronombres-objeto'] },
  { id: 'neighbor', name: 'Rubén', title_ru: 'Сосед и ремонт', subtitle_ru: 'Вежливо решить конфликт', emoji: '🔨', character: 'Rubén, el vecino del 5°B que está haciendo una obra ruidosa; buena onda pero testarudo', goal_ru: 'Вежливо попросить шуметь меньше и договориться о времени', voice: 'Fenrir', focus: ['subjuntivo-deseo', 'condicional', 'conectores'] },
  { id: 'interview', name: 'Valeria', title_ru: 'Собеседование', subtitle_ru: 'Рассказать о себе и опыте', emoji: '🤝', character: 'Valeria, responsable de Recursos Humanos de una empresa de Buenos Aires; profesional, usa usted al principio', goal_ru: 'Рассказать об опыте, сильных сторонах и задать свои вопросы', voice: 'Leda', focus: ['preterito-vs-imperfecto', 'perifrasis', 'registro'] },
  { id: 'restaurant', name: 'Facundo', title_ru: 'В ресторане', subtitle_ru: 'Заказ, особые просьбы, проблема со счётом', emoji: '🍷', character: 'Facundo, mozo de una parrilla en San Telmo; simpático y charlatán', goal_ru: 'Заказать, попросить замену и разобраться с ошибкой в счёте', voice: 'Puck', focus: ['condicional', 'articulos', 'imperativo'] },
];

export function getTopic(id) {
  return TOPICS.find((topic) => topic.id === id) || null;
}

export function getScenario(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

export const ONBOARDING_INTERESTS = [
  'Семья и дети', 'Работа и карьера', 'Кино и сериалы', 'Книги', 'Путешествия', 'Кулинария',
  'Спорт и здоровье', 'Психология', 'Мода и красота', 'Искусство и музеи', 'Музыка', 'Природа и животные',
  'Новости и общество', 'Технологии', 'Дом и интерьер', 'Аргентинская культура',
];

export const ONBOARDING_GOALS = [
  { id: 'daily', label_ru: 'Свободно общаться в быту (магазин, врач, школа)' },
  { id: 'friends', label_ru: 'Дружить и болтать с аргентинцами' },
  { id: 'work', label_ru: 'Работа: созвоны, переписка, собеседования' },
  { id: 'exam', label_ru: 'Подготовка к экзамену (DELE / CELU)' },
  { id: 'accuracy', label_ru: 'Перестать делать одни и те же ошибки' },
  { id: 'listening', label_ru: 'Лучше понимать быструю речь' },
];
