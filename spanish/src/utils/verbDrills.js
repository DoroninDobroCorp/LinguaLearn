import { normalizeAnswer } from './answerMatching.js';

export const DRILL_RUN_MODES = {
  infinite: {
    label: 'Infinity',
    taskLimit: null,
  },
  ten: {
    label: '10 tasks',
    taskLimit: 10,
  },
};

export const PRONOUNS = [
  { id: 'yo', label: 'yo', answerAliases: ['yo'] },
  { id: 'tu', label: 'tú', answerAliases: ['tú', 'tu'] },
  { id: 'vos', label: 'vos', answerAliases: ['vos'] },
  { id: 'el', label: 'él / ella / usted', answerAliases: ['él', 'el', 'ella', 'usted'] },
  { id: 'nosotros', label: 'nosotros / nosotras', answerAliases: ['nosotros', 'nosotras'] },
  { id: 'ellos', label: 'ellos / ellas / ustedes', answerAliases: ['ellos', 'ellas', 'ustedes'] },
];

export const DRILL_PRONOUN_MODES = {
  all: {
    label: 'All (tú + vos)',
    filter: () => true,
  },
  tu: {
    label: 'Standard (tú)',
    filter: (p) => p.id !== 'vos',
  },
  vos: {
    label: 'Rioplatense (vos)',
    filter: (p) => p.id !== 'tu',
  },
  second_person_only: {
    label: 'Tú & Vos only',
    filter: (p) => p.id === 'tu' || p.id === 'vos',
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
  { infinitive: 'vivir', translation: 'жить', ending: 'ir' },
  { infinitive: 'escribir', translation: 'писать', ending: 'ir' },
];

const REGULAR_ENDINGS = {
  ar: {
    yo: 'o',
    tu: 'as',
    vos: 'ás',
    el: 'a',
    nosotros: 'amos',
    ellos: 'an',
  },
  er: {
    yo: 'o',
    tu: 'es',
    vos: 'és',
    el: 'e',
    nosotros: 'emos',
    ellos: 'en',
  },
  ir: {
    yo: 'o',
    tu: 'es',
    vos: 'ís',
    el: 'e',
    nosotros: 'imos',
    ellos: 'en',
  },
};

export const FOUR_KEY_VERB_KEYS = ['ser', 'estar', 'tener', 'ir'];

const IRREGULAR_VERBS = {
  ser: {
    infinitive: 'ser',
    translation: 'быть',
    forms: {
      yo: 'soy',
      tu: 'eres',
      vos: 'sos',
      el: 'es',
      nosotros: 'somos',
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
      ellos: 'van',
    },
  },
};

export const SER_ESTAR_CONTEXTS = [
  { pronounId: 'yo', sentence: 'Yo ___ estudiante.', translation: 'Я студент.', verb: 'ser', reason: 'identity/profession -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ en casa.', translation: 'Я дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ cansado hoy.', translation: 'Я сегодня устал.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ de Rusia.', translation: 'Я из России.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ estudiante.', translation: 'Ты студент.', verb: 'ser', reason: 'identity/profession -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ en casa.', translation: 'Ты дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ cansado hoy.', translation: 'Ты сегодня устал.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ de España.', translation: 'Ты из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ médico.', translation: 'Ты врач.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ listo para salir.', translation: 'Ты готов выйти.', verb: 'estar', reason: 'temporary readiness -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ muy amable.', translation: 'Ты очень добрый.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ en la oficina.', translation: 'Ты в офисе.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ médico.', translation: 'Ты врач.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ listo para salir.', translation: 'Ты готов выйти.', verb: 'estar', reason: 'temporary readiness -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ muy amable.', translation: 'Ты очень добрый.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ en la oficina.', translation: 'Ты в офисе.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'Ella ___ profesora.', translation: 'Она преподаватель.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'el', sentence: 'Ella ___ enferma.', translation: 'Она больна.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'el', sentence: 'Él ___ argentino.', translation: 'Он аргентинец.', verb: 'ser', reason: 'nationality -> ser' },
  { pronounId: 'el', sentence: 'Él ___ en el aeropuerto.', translation: 'Он в аэропорту.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'Usted ___ muy puntual.', translation: 'Вы очень пунктуальны.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'el', sentence: 'Usted ___ ocupado ahora.', translation: 'Вы сейчас заняты.', verb: 'estar', reason: 'current state -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ amigos.', translation: 'Мы друзья.', verb: 'ser', reason: 'relationship/identity -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ en Buenos Aires.', translation: 'Мы в Буэнос-Айресе.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotras ___ contentas hoy.', translation: 'Мы сегодня довольны.', verb: 'estar', reason: 'temporary emotion -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ de Buenos Aires.', translation: 'Мы из Буэнос-Айреса.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'ellos', sentence: 'Ustedes ___ argentinos.', translation: 'Вы аргентинцы.', verb: 'ser', reason: 'nationality -> ser' },
  { pronounId: 'ellos', sentence: 'Ustedes ___ preparados.', translation: 'Вы подготовлены.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'ellos', sentence: 'Ustedes ___ muy simpáticos.', translation: 'Вы очень приятные.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'ellos', sentence: 'Ustedes ___ cerca del teatro.', translation: 'Вы рядом с театром.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ estudiantes.', translation: 'Они студенты.', verb: 'ser', reason: 'identity -> ser' },
  { pronounId: 'ellos', sentence: 'Ellos ___ en la plaza.', translation: 'Они на площади.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Ellas ___ cansadas.', translation: 'Они устали.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'el', sentence: 'La puerta ___ abierta.', translation: 'Дверь открыта.', verb: 'estar', reason: 'condition/state -> estar' },
  { pronounId: 'el', sentence: 'La puerta ___ de madera.', translation: 'Дверь из дерева.', verb: 'ser', reason: 'material -> ser' },
  { pronounId: 'el', sentence: 'El café ___ caliente.', translation: 'Кофе горячий.', verb: 'estar', reason: 'current condition -> estar' },
  { pronounId: 'el', sentence: 'El café ___ colombiano.', translation: 'Кофе колумбийский.', verb: 'ser', reason: 'origin/type -> ser' },
  { pronounId: 'el', sentence: 'El libro ___ sobre la mesa.', translation: 'Книга на столе.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'El libro ___ interesante.', translation: 'Книга интересная.', verb: 'ser', reason: 'description -> ser' },
  { pronounId: 'el', sentence: 'La clase ___ a las ocho.', translation: 'Урок в восемь.', verb: 'ser', reason: 'event time -> ser' },
  { pronounId: 'el', sentence: 'La clase ___ en el aula dos.', translation: 'Урок в аудитории два.', verb: 'ser', reason: 'event location -> ser' },
  { pronounId: 'el', sentence: 'La sopa ___ fría.', translation: 'Суп холодный.', verb: 'estar', reason: 'current condition -> estar' },
  { pronounId: 'el', sentence: 'La sopa ___ de verduras.', translation: 'Суп овощной.', verb: 'ser', reason: 'composition/type -> ser' },
  { pronounId: 'el', sentence: 'El banco ___ cerca del mercado.', translation: 'Банк рядом с рынком.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'El banco ___ grande.', translation: 'Банк большой.', verb: 'ser', reason: 'description -> ser' },
  { pronounId: 'el', sentence: 'La película ___ aburrida.', translation: 'Фильм скучный.', verb: 'ser', reason: 'description/opinion -> ser' },
  { pronounId: 'el', sentence: 'El niño ___ aburrido сейчас.', translation: 'Мальчику сейчас скучно.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'ellos', sentence: 'Mis padres ___ en casa.', translation: 'Мои родители дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Mis padres ___ muy pacientes.', translation: 'Мои родители очень терпеливые.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'el', sentence: 'La reunión ___ mañana.', translation: 'Встреча завтра.', verb: 'ser', reason: 'event time -> ser' },
  { pronounId: 'el', sentence: 'La reunión ___ confirmada.', translation: 'Встреча подтверждена.', verb: 'estar', reason: 'state/result -> estar' },
];

export const DRILL_TYPES = {
  regular: {
    label: 'Normal verbs',
    level: 'A1',
    rules: [
      '-ar: yo -o, tú -as, vos -ás, él/ella/usted -a, nosotros -amos, ellos/ustedes -an.',
      '-er: yo -o, tú -es, vos -és, él/ella/usted -e, nosotros -emos, ellos/ustedes -en.',
      '-ir: yo -o, tú -es, vos -ís, él/ella/usted -e, nosotros -imos, ellos/ustedes -en.',
    ],
  },
  fourKeyVerbs: {
    label: '4 Key Verbs (All)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ser (быть): yo soy, tú eres, vos sos, él/ella/usted es, nosotros somos, ellos/ustedes son.',
      'estar (быть, находиться): yo estoy, tú estás, vos estás, él/ella/usted está, nosotros estamos, ellos/ustedes están.',
      'tener (иметь): yo tengo, tú tienes, vos tenés, él/ella/usted tiene, nosotros tenemos, ellos/ustedes tienen.',
      'ir (идти, ехать): yo voy, tú vas, vos vas, él/ella/usted va, nosotros vamos, ellos/ustedes van.',
    ],
  },
  ser: {
    label: 'Ser',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'ser is irregular: yo soy, tú eres, vos sos, él/ella/usted es, nosotros somos, ellos/ustedes son.',
    ],
  },
  estar: {
    label: 'Estar',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'estar is irregular: yo estoy, tú estás, vos estás, él/ella/usted está, nosotros estamos, ellos/ustedes están.',
    ],
  },
  tener: {
    label: 'Tener',
    topic: 'Tener (to have) and tener expressions',
    level: 'A1',
    rules: [
      'tener is irregular: yo tengo, tú tienes, vos tenés, él/ella/usted tiene, nosotros tenemos, ellos/ustedes tienen.',
    ],
  },
  ir: {
    label: 'Ir',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ir is irregular: yo voy, tú vas, vos vas, él/ella/usted va, nosotros vamos, ellos/ustedes van.',
    ],
  },
  serEstar: {
    label: 'Ser vs Estar',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'Write the correct present-tense form: soy/eres/sos/es/somos/son or estoy/estás/está/estamos/están.',
      'Use ser for identity, origin, profession, material, inherent descriptions, and event time/place.',
      'Use estar for location, temporary states, emotions, readiness, and current conditions.',
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
      instruction: 'Choose ser or estar and write the correct form',
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
