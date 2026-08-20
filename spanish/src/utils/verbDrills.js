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
  spain: {
    label: 'Испания (tú + vosotros)',
    filter: (p) => p.id !== 'vos',
  },
  vos: {
    label: 'Только Rioplatense (vos)',
    filter: (p) => p.id !== 'tu' && p.id !== 'vosotros',
  },
};

export const REGULAR_VERBS = [
  { infinitive: 'hablar', translation: 'говорить', ending: 'ar' },
  { infinitive: 'trabajar', translation: 'работать', ending: 'ar' },
  { infinitive: 'estudiar', translation: 'учиться', ending: 'ar' },
  { infinitive: 'comprar', translation: 'покупать', ending: 'ar' },
  { infinitive: 'llamar', translation: 'звонить, называть', ending: 'ar' },
  { infinitive: 'comer', translation: 'есть', ending: 'er' },
  { infinitive: 'beber', translation: 'пить', ending: 'er' },
  { infinitive: 'aprender', translation: 'учить, изучать', ending: 'er' },
  { infinitive: 'comprender', translation: 'понимать', ending: 'er' },
  { infinitive: 'leer', translation: 'читать', ending: 'er' },
  { infinitive: 'vivir', translation: 'жить', ending: 'ir' },
  { infinitive: 'escribir', translation: 'писать', ending: 'ir' },
  { infinitive: 'abrir', translation: 'открывать', ending: 'ir' },
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
    translation: 'быть / являться',
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
    translation: 'быть, находиться',
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

const SER_ESTAR_CONTEXTS = [
  { pronounId: 'yo', sentence: 'Yo ___ de Madrid.', translation: 'Я из Мадрида.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ en la oficina ahora.', translation: 'Я в офисе сейчас.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ muy inteligente.', translation: 'Ты очень умный.', verb: 'ser', reason: 'permanent characteristic -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ cansado hoy.', translation: 'Ты уставший сегодня.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ de Buenos Aires.', translation: 'Ты из Буэнос-Айреса.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ ocupado ahora.', translation: 'Ты занят сейчас.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'el', sentence: 'Él ___ médico.', translation: 'Он врач.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'el', sentence: 'Él ___ enfermo esta semana.', translation: 'Он болен на этой неделе.', verb: 'estar', reason: 'health/condition -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ amigos desde niños.', translation: 'Мы друзья с детства.', verb: 'ser', reason: 'relationship -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ listos para salir.', translation: 'Мы готовы выходить.', verb: 'estar', reason: 'readiness -> estar' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ de España.', translation: 'Вы из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ en casa.', translation: 'Вы дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ en la playa.', translation: 'Они на пляже.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Mis padres ___ muy pacientes.', translation: 'Мои родители очень терпеливые.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'el', sentence: 'La reunión ___ mañana.', translation: 'Встреча завтра.', verb: 'ser', reason: 'event time -> ser' },
  { pronounId: 'el', sentence: 'La reunión ___ confirmada.', translation: 'Встреча подтверждена.', verb: 'estar', reason: 'state/result -> estar' },
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
    label: 'Ser vs Estar',
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
  const stem = verb.infinitive.slice(0, -2);
  return `${stem}${REGULAR_ENDINGS[verb.ending][pronounId]}`;
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
      id: `${drillType}-${example.verb}-${example.pronounId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      verb: 'ser / estar',
      prompt: example.sentence,
      instruction: 'Выберите ser или estar и напишите правильную форму',
      translation: example.translation,
      reason: example.reason,
      pronounId: example.pronounId,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      correctAnswer,
      displayAnswer,
      acceptedAnswers: [correctAnswer, displayAnswer],
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

export function getVerbDrillDisplayAnswer(question) {
  if (question?.displayAnswer) {
    return question.displayAnswer;
  }

  if (!question?.correctAnswer) {
    return '';
  }

  const primaryPronoun = question.pronounAliases?.[0] || question.pronoun || '';
  return primaryPronoun ? `${primaryPronoun} ${question.correctAnswer}` : question.correctAnswer;
}

export function getVerbDrillAcceptedAnswers(questionOrAnswer, maybeCorrectAnswer) {
  const question = typeof questionOrAnswer === 'object'
    ? questionOrAnswer
    : { correctAnswer: maybeCorrectAnswer ?? questionOrAnswer };
  const correctAnswer = question?.correctAnswer ?? maybeCorrectAnswer;
  const answers = new Set([
    normalizeAnswer(correctAnswer),
    ...(question?.acceptedAnswers ?? []).map((acceptedAnswer) => normalizeAnswer(acceptedAnswer)),
  ]);

  for (const alias of question?.pronounAliases ?? []) {
    answers.add(normalizeAnswer(`${alias} ${correctAnswer}`));
  }

  return Array.from(answers).filter(Boolean);
}

export function isVerbDrillAnswerCorrect(answer, questionOrCorrectAnswer) {
  const normalizedAnswer = normalizeAnswer(answer);
  const acceptedAnswers = getVerbDrillAcceptedAnswers(questionOrCorrectAnswer);
  return acceptedAnswers.includes(normalizedAnswer);
}

export function isVerbDrillFinished(runMode, completedCount) {
  const limit = DRILL_RUN_MODES[runMode]?.taskLimit ?? null;
  return Number.isFinite(limit) && completedCount >= limit;
}
