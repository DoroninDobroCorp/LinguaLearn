import { normalizeAnswer } from './answerMatching.js';

export const DRILL_RUN_MODES = {
  infinite: {
    label: 'Бесконечный',
    taskLimit: null,
  },
  ten: {
    label: '10 заданий',
    taskLimit: 10,
  },
};

export const PRONOUNS = [
  { id: 'yo', label: 'yo', answerAliases: ['yo'] },
  { id: 'tu', label: 'tú', answerAliases: ['tú', 'tu'] },
  { id: 'vos', label: 'vos', answerAliases: ['vos'] },
  { id: 'el', label: 'él / ella / usted', answerAliases: ['él', 'el', 'ella', 'usted'] },
  { id: 'nosotros', label: 'nosotros / nosotras', answerAliases: ['nosotros', 'nosotras'] },
  { id: 'vosotros', label: 'vosotros / vosotras (Испания)', answerAliases: ['vosotros', 'vosotras'] },
  { id: 'ellos', label: 'ellos / ellas / ustedes', answerAliases: ['ellos', 'ellas', 'ustedes'] },
];

export const DRILL_PRONOUN_MODES = {
  all: {
    label: 'Все (tú, vos, vosotros)',
    filter: () => true,
  },
  standard_latam: {
    label: 'Лат. Америка (tú + vos)',
    filter: (p) => p.id !== 'vosotros',
  },
  rioplatense: {
    label: 'Только vos (Аргентина)',
    filter: (p) => p.id !== 'tu' && p.id !== 'vosotros',
  },
  tu_standard: {
    label: 'Только tú (без voseo)',
    filter: (p) => p.id !== 'vos' && p.id !== 'vosotros',
  },
  tu: {
    label: 'Tú',
    filter: (p) => p.id === 'tu',
  },
  vos: {
    label: 'Vos',
    filter: (p) => p.id === 'vos',
  },
  second_person_only: {
    label: 'Только 2-е лицо (tú / vos)',
    filter: (p) => p.id === 'tu' || p.id === 'vos',
  },
};

export const REGULAR_VERBS = [
  { infinitive: 'hablar', ending: 'ar', translation: 'говорить' },
  { infinitive: 'trabajar', ending: 'ar', translation: 'работать' },
  { infinitive: 'estudiar', ending: 'ar', translation: 'учиться' },
  { infinitive: 'comprar', ending: 'ar', translation: 'покупать' },
  { infinitive: 'viajar', ending: 'ar', translation: 'путешествовать' },
  { infinitive: 'necesitar', ending: 'ar', translation: 'нуждаться' },
  { infinitive: 'buscar', ending: 'ar', translation: 'искать' },
  { infinitive: 'escuchar', ending: 'ar', translation: 'слушать' },
  { infinitive: 'esperar', ending: 'ar', translation: 'ждать' },
  { infinitive: 'llamar', ending: 'ar', translation: 'звать' },
  { infinitive: 'comer', ending: 'er', translation: 'есть' },
  { infinitive: 'beber', ending: 'er', translation: 'пить' },
  { infinitive: 'aprender', ending: 'er', translation: 'учить' },
  { infinitive: 'comprender', ending: 'er', translation: 'понимать' },
  { infinitive: 'vender', ending: 'er', translation: 'продавать' },
  { infinitive: 'vivir', ending: 'ir', translation: 'жить' },
  { infinitive: 'escribir', ending: 'ir', translation: 'писать' },
  { infinitive: 'abrir', ending: 'ir', translation: 'открывать' },
];

export const REGULAR_ENDINGS = {
  ar: {
    yo: 'o',
    tu: 'as',
    vos: 'ás',
    el: 'a',
    nosotros: 'amos',
    vosotros: 'áis',
    ellos: 'an',
  },
  er: {
    yo: 'o',
    tu: 'es',
    vos: 'és',
    el: 'e',
    nosotros: 'emos',
    vosotros: 'éis',
    ellos: 'en',
  },
  ir: {
    yo: 'o',
    tu: 'es',
    vos: 'ís',
    el: 'e',
    nosotros: 'imos',
    vosotros: 'ís',
    ellos: 'en',
  },
};

export const FOUR_KEY_VERB_KEYS = ['ser', 'estar', 'tener', 'ir'];

const IRREGULAR_VERBS = {
  ser: {
    infinitive: 'ser',
    translation: 'быть (по сути)',
    forms: {
      yo: 'soy',
      tu: 'eres',
      vos: 'sos',
      el: 'es',
      nosotros: 'somos',
      vosotros: 'sois',
      ellos: 'son',
    },
  },
  estar: {
    infinitive: 'estar',
    translation: 'быть (находиться, состояние)',
    forms: {
      yo: 'estoy',
      tu: 'estás',
      vos: 'estás',
      el: 'está',
      nosotros: 'estamos',
      vosotros: 'estáis',
      ellos: 'están',
    },
  },
  tener: {
    infinitive: 'tener',
    translation: 'иметь',
    forms: {
      yo: 'tengo',
      tu: 'tienes',
      vos: 'tenés',
      el: 'tiene',
      nosotros: 'tenemos',
      vosotros: 'tenéis',
      ellos: 'tienen',
    },
  },
  ir: {
    infinitive: 'ir',
    translation: 'идти, ехать',
    forms: {
      yo: 'voy',
      tu: 'vas',
      vos: 'vas',
      el: 'va',
      nosotros: 'vamos',
      vosotros: 'vais',
      ellos: 'van',
    },
  },
};

export const SER_ESTAR_CONTEXTS = [
  { pronounId: 'yo', sentence: 'Yo ___ estudiante.', translation: 'Я студент.', verb: 'ser', reason: 'occupation -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ de Madrid.', translation: 'Я из Мадрида.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ en la oficina ahora.', translation: 'Я в офисе сейчас.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ cansado.', translation: 'Я устал.', verb: 'estar', reason: 'temporary condition -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ muy feliz hoy.', translation: 'Я очень счастлив сегодня.', verb: 'estar', reason: 'emotion -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ muy inteligente.', translation: 'Ты очень умный.', verb: 'ser', reason: 'permanent characteristic -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ cansado hoy.', translation: 'Ты уставший сегодня.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ de Colombia.', translation: 'Ты из Колумбии.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ en el supermercado.', translation: 'Ты в супермаркете.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ de Buenos Aires.', translation: 'Ты из Буэнос-Айреса.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ ocupado ahora.', translation: 'Ты занят сейчас.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ un buen amigo.', translation: 'Ты хороший друг.', verb: 'ser', reason: 'identity -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ listo para salir.', translation: 'Ты готов выходить.', verb: 'estar', reason: 'readiness -> estar' },
  { pronounId: 'el', sentence: 'Él ___ médico.', translation: 'Он врач.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'el', sentence: 'Él ___ enfermo esta semana.', translation: 'Он болен на этой неделе.', verb: 'estar', reason: 'health/condition -> estar' },
  { pronounId: 'el', sentence: 'Ella ___ de España.', translation: 'Она из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'el', sentence: 'El café ___ caliente.', translation: 'Кофе горячий.', verb: 'estar', reason: 'temperature -> estar' },
  { pronounId: 'el', sentence: 'La sopa ___ fría.', translation: 'Суп холодный.', verb: 'estar', reason: 'condition -> estar' },
  { pronounId: 'el', sentence: 'El hotel ___ en el centro.', translation: 'Отель в центре.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'El auto ___ rojo.', translation: 'Машина красная.', verb: 'ser', reason: 'color/description -> ser' },
  { pronounId: 'el', sentence: 'La mesa ___ de madera.', translation: 'Стол из дерева.', verb: 'ser', reason: 'material -> ser' },
  { pronounId: 'el', sentence: 'La puerta ___ abierta.', translation: 'Дверь открыта.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La puerta ___ cerrada.', translation: 'Дверь закрыта.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La reunión ___ a las tres.', translation: 'Встреча в три часа.', verb: 'ser', reason: 'event time -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ amigos desde niños.', translation: 'Мы друзья с детства.', verb: 'ser', reason: 'relationship -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ listos para salir.', translation: 'Мы готовы выходить.', verb: 'estar', reason: 'readiness -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ en Barcelona.', translation: 'Мы в Барселоне.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ profesores.', translation: 'Мы преподаватели.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ de España.', translation: 'Вы из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ en casa.', translation: 'Вы дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ simpáticos.', translation: 'Вы приятные.', verb: 'ser', reason: 'trait -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ cansados.', translation: 'Вы устали.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ en la playa.', translation: 'Они на пляже.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Mis padres ___ muy pacientes.', translation: 'Мои родители очень терпеливые.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'ellos', sentence: 'Ellos ___ argentinos.', translation: 'Они аргентинцы.', verb: 'ser', reason: 'nationality -> ser' },
  { pronounId: 'ellos', sentence: 'Las ventanas ___ limpias.', translation: 'Окна чистые.', verb: 'estar', reason: 'condition -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ ocupados.', translation: 'Они заняты.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La película ___ aburrida.', translation: 'Фильм скучный.', verb: 'ser', reason: 'inherent quality -> ser' },
  { pronounId: 'el', sentence: 'El niño ___ aburrido ahora.', translation: 'Мальчику сейчас скучно.', verb: 'estar', reason: 'temporary feeling -> estar' },
  { pronounId: 'el', sentence: 'El concierto ___ en el teatro.', translation: 'Концерт в театре.', verb: 'ser', reason: 'event venue -> ser' },
  { pronounId: 'el', sentence: 'El teatro ___ cerca del parque.', translation: 'Театр рядом с парком.', verb: 'estar', reason: 'building location -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ de Argentina.', translation: 'Я из Аргентины.', verb: 'ser', reason: 'origin -> ser' }
];

export const DRILL_TYPES = {
  regular: {
    label: 'Правильные глаголы',
    level: 'A1',
    rules: [
      '-ar: yo -o, tú -as, vos -ás, él -a, nosotros -amos, vosotros -áis (Испания), ellos/ustedes -an.',
      '-er: yo -o, tú -es, vos -és, él -e, nosotros -emos, vosotros -éis (Испания), ellos/ustedes -en.',
      '-ir: yo -o, tú -es, vos -ís, él -e, nosotros -imos, vosotros -ís (Испания), ellos/ustedes -en.',
    ],
  },
  fourKeyVerbs: {
    label: '4 главных глагола (Все)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ser (быть): yo soy, tú eres, vos sos, él es, nosotros somos, vosotros sois (Испания), ellos/ustedes son.',
      'estar (находиться): yo estoy, tú estás, vos estás, él está, nosotros estamos, vosotros estáis (Испания), ellos/ustedes están.',
      'tener (иметь): yo tengo, tú tienes, vos tenés, él tiene, nosotros tenemos, vosotros tenéis (Испания), ellos/ustedes tienen.',
      'ir (идти, ехать): yo voy, tú vas, vos vas, él va, nosotros vamos, vosotros vais (Испания), ellos/ustedes van.',
    ],
  },
  ser: {
    label: 'Ser (быть)',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'ser (неправильный): yo soy, tú eres, vos sos, él/ella/usted es, nosotros somos, vosotros sois (Испания), ellos/ustedes son.',
    ],
  },
  estar: {
    label: 'Estar (находиться)',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'estar (неправильный): yo estoy, tú estás, vos estás, él/ella/usted está, nosotros estamos, vosotros estáis (Испания), ellos/ustedes están.',
    ],
  },
  tener: {
    label: 'Tener (иметь)',
    topic: 'Tener (to have) and tener expressions',
    level: 'A1',
    rules: [
      'tener (неправильный): yo tengo, tú tienes, vos tenés, él/ella/usted tiene, nosotros tenemos, vosotros tenéis (Испания), ellos/ustedes tienen.',
    ],
  },
  ir: {
    label: 'Ir (идти)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ir (неправильный): yo voy, tú vas, vos vas, él/ella/usted va, nosotros vamos, vosotros vais (Испания), ellos/ustedes van.',
    ],
  },
  serEstar: {
    label: 'Ser vs Estar в контексте',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'Формы Ser: soy / eres / sos / es / somos / sois (Испания) / son.',
      'Формы Estar: estoy / estás / está / estamos / estáis (Испания) / están.',
      'Ser — для постоянных качеств, профессии, происхождения, времени событий.',
      'Estar — для местоположения, временных состояний, настроения, самочувствия.',
    ],
  },
};

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function conjugateRegularVerb(verb, pronounId) {
  const root = verb.infinitive.slice(0, -2);
  const ending = REGULAR_ENDINGS[verb.ending][pronounId];
  return `${root}${ending}`;
}

export function conjugateVerb(drillType, verb, pronounId) {
  if (drillType === 'regular') {
    return conjugateRegularVerb(verb, pronounId);
  }

  const irregularKey = drillType === 'fourKeyVerbs' ? (verb.infinitive || 'ser') : drillType;
  return IRREGULAR_VERBS[irregularKey].forms[pronounId];
}

export function createVerbDrillQuestion(drillType = 'regular', pronounMode = 'all') {
  const pronounFilter = DRILL_PRONOUN_MODES[pronounMode]?.filter || (() => true);
  const eligiblePronouns = PRONOUNS.filter(pronounFilter);
  const activePronouns = eligiblePronouns.length > 0 ? eligiblePronouns : PRONOUNS;

  if (drillType === 'serEstar') {
    const eligibleContexts = SER_ESTAR_CONTEXTS.filter((ctx) => activePronouns.some((p) => p.id === ctx.pronounId));
    const pool = eligibleContexts.length > 0 ? eligibleContexts : SER_ESTAR_CONTEXTS;
    const example = pool[getRandomInt(pool.length)];
    const pronoun = PRONOUNS.find((item) => item.id === example.pronounId) ?? PRONOUNS[0];
    const correctAnswer = IRREGULAR_VERBS[example.verb].forms[example.pronounId];
    const displayAnswer = example.sentence.replace('___', correctAnswer);

    return {
      id: `serEstar-${example.pronounId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      verb: 'ser / estar',
      prompt: example.sentence,
      instruction: 'Выберите ser или estar и напишите правильную форму',
      translation: example.translation,
      reason: example.reason,
      pronounId: example.pronounId,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer,
      displayAnswer,
    };
  }

  if (drillType === 'fourKeyVerbs') {
    const selectedKey = FOUR_KEY_VERB_KEYS[getRandomInt(FOUR_KEY_VERB_KEYS.length)];
    const verb = IRREGULAR_VERBS[selectedKey];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: selectedKey,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(selectedKey, verb, pronoun.id),
    };
  }

  const pronoun = activePronouns[getRandomInt(activePronouns.length)];
  const verb = drillType === 'regular'
    ? REGULAR_VERBS[getRandomInt(REGULAR_VERBS.length)]
    : IRREGULAR_VERBS[drillType];

  return {
    id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    drillType,
    verb: verb.infinitive,
    translation: verb.translation,
    pronounId: pronoun.id,
    pronoun: pronoun.label,
    pronounAliases: pronoun.answerAliases,
    ending: verb.ending ?? null,
    correctAnswer: conjugateVerb(drillType, verb, pronoun.id),
  };
}

export function getVerbDrillProgressTopic(question) {
  if (question?.drillType === 'regular') {
    return question.ending === 'ar'
      ? 'Present tense regular -ar verbs'
      : 'Present tense regular -er/-ir verbs';
  }

  if (question?.drillType === 'fourKeyVerbs') {
    return question.subDrillType === 'tener'
      ? 'Tener (to have) and tener expressions'
      : question.subDrillType === 'ir'
      ? 'Present tense irregular verbs (ir/hacer/decir)'
      : 'Ser vs Estar (basic)';
  }

  return DRILL_TYPES[question?.drillType]?.topic ?? 'Ser vs Estar (basic)';
}

export function getVerbDrillAcceptedAnswers(question) {
  if (!question) return [];

  const rawCorrect = question.correctAnswer ?? '';
  const normalizedCorrect = normalizeAnswer(rawCorrect);
  const results = new Set([normalizedCorrect]);

  const rawAliases = question.pronounAliases ?? [];
  const normalizedAliases = rawAliases.map(normalizeAnswer).filter(Boolean);

  for (const alias of normalizedAliases) {
    results.add(`${alias} ${normalizedCorrect}`.trim());
  }

  if (question.prompt && question.prompt.includes('___')) {
    const fullSentence = question.prompt.replace('___', rawCorrect);
    results.add(normalizeAnswer(fullSentence));
  }

  return Array.from(results).filter(Boolean);
}

export function isVerbDrillAnswerCorrect(userAnswer, question) {
  if (!userAnswer) return false;

  const normalizedUser = normalizeAnswer(userAnswer);
  if (!normalizedUser) return false;

  if (typeof question === 'string') {
    return normalizedUser === normalizeAnswer(question);
  }

  const accepted = getVerbDrillAcceptedAnswers(question);
  return accepted.includes(normalizedUser);
}

export function getVerbDrillDisplayAnswer(question) {
  if (!question) return '';
  if (question.displayAnswer) return question.displayAnswer;
  const primaryPronoun = question.pronounAliases?.[0] ?? question.pronoun ?? '';
  return `${primaryPronoun} ${question.correctAnswer}`.trim();
}

export function isVerbDrillFinished(runModeOrStats, statsOrIndex) {
  let mode = 'infinite';
  let completed = 0;

  if (typeof runModeOrStats === 'string') {
    mode = runModeOrStats;
    completed = typeof statsOrIndex === 'number' ? statsOrIndex : statsOrIndex?.completed ?? 0;
  } else if (typeof runModeOrStats === 'object') {
    completed = runModeOrStats.completed ?? 0;
    mode = typeof statsOrIndex === 'string' ? statsOrIndex : 'infinite';
  }

  const limit = DRILL_RUN_MODES[mode]?.taskLimit;
  if (!limit) return false;
  return completed >= limit;
}
