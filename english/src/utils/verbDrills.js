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
  { id: 'i', label: 'I', answerAliases: ['i'] },
  { id: 'you', label: 'You', answerAliases: ['you'] },
  { id: 'he_she_it', label: 'He / She / It', answerAliases: ['he', 'she', 'it', 'he/she/it'] },
  { id: 'we', label: 'We', answerAliases: ['we'] },
  { id: 'they', label: 'They', answerAliases: ['they'] },
];

export const DRILL_PRONOUN_MODES = {
  all: {
    label: 'Все лица (I, you, he/she/it, we, they)',
    filter: () => true,
  },
  third_person: {
    label: '3-е лицо ед. ч. (He / She / It: -s/-es)',
    filter: (p) => p.id === 'he_she_it',
  },
  plural: {
    label: 'Множественное число (We, They, You)',
    filter: (p) => p.id === 'we' || p.id === 'they' || p.id === 'you',
  }
};

export const ENGLISH_IRREGULAR_VERBS = [
  { base: 'be', past: 'was/were', pp: 'been', ing: 'being', s: 'is', translation: 'быть / являться' },
  { base: 'have', past: 'had', pp: 'had', ing: 'having', s: 'has', translation: 'иметь' },
  { base: 'do', past: 'did', pp: 'done', ing: 'doing', s: 'does', translation: 'делать' },
  { base: 'go', past: 'went', pp: 'gone', ing: 'going', s: 'goes', translation: 'идти / ехать' },
  { base: 'get', past: 'got', pp: 'got/gotten', ing: 'getting', s: 'gets', translation: 'получать / становиться' },
  { base: 'make', past: 'made', pp: 'made', ing: 'making', s: 'makes', translation: 'создавать / делать' },
  { base: 'know', past: 'knew', pp: 'known', ing: 'knowing', s: 'knows', translation: 'знать' },
  { base: 'think', past: 'thought', pp: 'thought', ing: 'thinking', s: 'thinks', translation: 'думать' },
  { base: 'take', past: 'took', pp: 'taken', ing: 'taking', s: 'takes', translation: 'брать' },
  { base: 'see', past: 'saw', pp: 'seen', ing: 'seeing', s: 'sees', translation: 'видеть' },
  { base: 'come', past: 'came', pp: 'come', ing: 'coming', s: 'comes', translation: 'приходить' },
  { base: 'give', past: 'gave', pp: 'given', ing: 'giving', s: 'gives', translation: 'давать' },
  { base: 'find', past: 'found', pp: 'found', ing: 'finding', s: 'finds', translation: 'находить' },
  { base: 'tell', past: 'told', pp: 'told', ing: 'telling', s: 'tells', translation: 'рассказывать / говорить' },
  { base: 'become', past: 'became', pp: 'become', ing: 'becoming', s: 'becomes', translation: 'становиться' },
  { base: 'leave', past: 'left', pp: 'left', ing: 'leaving', s: 'leaves', translation: 'покидать / уходить' },
  { base: 'feel', past: 'felt', pp: 'felt', ing: 'feeling', s: 'feels', translation: 'чувствовать' },
  { base: 'put', past: 'put', pp: 'put', ing: 'putting', s: 'puts', translation: 'класть / ставить' },
  { base: 'bring', past: 'brought', pp: 'brought', ing: 'bringing', s: 'brings', translation: 'приносить' },
  { base: 'begin', past: 'began', pp: 'begun', ing: 'beginning', s: 'begins', translation: 'начинать' },
  { base: 'keep', past: 'kept', pp: 'kept', ing: 'keeping', s: 'keeps', translation: 'сохранять / продолжать' },
  { base: 'hold', past: 'held', pp: 'held', ing: 'holding', s: 'holds', translation: 'держать' },
  { base: 'write', past: 'wrote', pp: 'written', ing: 'writing', s: 'writes', translation: 'писать' },
  { base: 'stand', past: 'stood', pp: 'stood', ing: 'standing', s: 'stands', translation: 'стоять' },
  { base: 'hear', past: 'heard', pp: 'heard', ing: 'hearing', s: 'hears', translation: 'слышать' },
  { base: 'let', past: 'let', pp: 'let', ing: 'letting', s: 'lets', translation: 'позволять' },
  { base: 'mean', past: 'meant', pp: 'meant', ing: 'meaning', s: 'means', translation: 'означать / иметь в виду' },
  { base: 'set', past: 'set', pp: 'set', ing: 'setting', s: 'sets', translation: 'устанавливать' },
  { base: 'meet', past: 'met', pp: 'met', ing: 'meeting', s: 'meets', translation: 'встречать' },
  { base: 'run', past: 'ran', pp: 'run', ing: 'running', s: 'runs', translation: 'бежать / управлять' },
  { base: 'pay', past: 'paid', pp: 'paid', ing: 'paying', s: 'pays', translation: 'платить' },
  { base: 'sit', past: 'sat', pp: 'sat', ing: 'sitting', s: 'sits', translation: 'сидеть' },
  { base: 'speak', past: 'spoke', pp: 'spoken', ing: 'speaking', s: 'speaks', translation: 'говорить' },
  { base: 'lie', past: 'lay', pp: 'lain', ing: 'lying', s: 'lies', translation: 'лежать' },
  { base: 'lead', past: 'led', pp: 'led', ing: 'leading', s: 'leads', translation: 'вести / руководить' },
  { base: 'read', past: 'read', pp: 'read', ing: 'reading', s: 'reads', translation: 'читать' },
  { base: 'grow', past: 'grew', pp: 'grown', ing: 'growing', s: 'grows', translation: 'расти / выращивать' },
  { base: 'lose', past: 'lost', pp: 'lost', ing: 'losing', s: 'loses', translation: 'терять' },
  { base: 'fall', past: 'fell', pp: 'fallen', ing: 'falling', s: 'falls', translation: 'падать' },
  { base: 'send', past: 'sent', pp: 'sent', ing: 'sending', s: 'sends', translation: 'отправлять' },
  { base: 'build', past: 'built', pp: 'built', ing: 'building', s: 'builds', translation: 'строить' },
  { base: 'understand', past: 'understood', pp: 'understood', ing: 'understanding', s: 'understands', translation: 'понимать' },
  { base: 'draw', past: 'drew', pp: 'drawn', ing: 'drawing', s: 'draws', translation: 'рисовать / привлекать' },
  { base: 'break', past: 'broke', pp: 'broken', ing: 'breaking', s: 'breaks', translation: 'ломать / разбивать' },
  { base: 'spend', past: 'spent', pp: 'spent', ing: 'spending', s: 'spends', translation: 'тратить / проводить время' },
  { base: 'cut', past: 'cut', pp: 'cut', ing: 'cutting', s: 'cuts', translation: 'резать' },
  { base: 'rise', past: 'rose', pp: 'risen', ing: 'rising', s: 'rises', translation: 'подниматься' },
  { base: 'drive', past: 'drove', pp: 'driven', ing: 'driving', s: 'drives', translation: 'водить автомобиль' },
  { base: 'buy', past: 'bought', pp: 'bought', ing: 'buying', s: 'buys', translation: 'покупать' },
  { base: 'wear', past: 'wore', pp: 'worn', ing: 'wearing', s: 'wears', translation: 'носить одежду' },
  { base: 'choose', past: 'chose', pp: 'chosen', ing: 'choosing', s: 'chooses', translation: 'выбирать' },
];

export const DRILL_TYPES = {
  past_simple: {
    id: 'past_simple',
    title: 'Past Simple (2-я форма глагола: V2)',
    description: 'Тренировка формы прошедшего времени для неправильных и правильных глаголов.',
    ruleSnippet: 'Для большинства неправильных глаголов форма Past Simple уникальна (go -> went, see -> saw, buy -> bought).',
  },
  past_participle: {
    id: 'past_participle',
    title: 'Past Participle (3-я форма: V3 / Present Perfect)',
    description: 'Форма причастия прошедшего времени для времен Perfect и пассивного залога.',
    ruleSnippet: 'Используется с have/has в Present Perfect: I have written, She has gone, They had taken.',
  },
  third_person_s: {
    id: 'third_person_s',
    title: 'Present Simple 3-е лицо (He / She / It: -s / -es / -ies)',
    description: 'Правила добавления окончаний -s, -es (goes, watches) и -ies (studies).',
    ruleSnippet: 'He/she/it требует окончания -s/-es. Исключение: have -> has.',
  },
  ing_form: {
    id: 'ing_form',
    title: 'Present Participle / Gerund (-ing form)',
    description: 'Удвоение согласных (running, sitting), усечение -e (making) и -ie -> -ying (lying).',
    ruleSnippet: 'Используется в Continuous (am doing) и как герундий (enjoy swimming).',
  }
};

export function createVerbDrillQuestion(typeId = 'past_simple', runMode = 'ten') {
  const verb = ENGLISH_IRREGULAR_VERBS[Math.floor(Math.random() * ENGLISH_IRREGULAR_VERBS.length)];
  let expectedAnswer = '';
  let promptText = '';
  let explanation = '';

  if (typeId === 'past_simple') {
    expectedAnswer = verb.past;
    promptText = `Напишите форму Past Simple (V2) для глагола «${verb.base}» (${verb.translation}):`;
    explanation = `Форма Past Simple для ${verb.base} — ${verb.past}.`;
  } else if (typeId === 'past_participle') {
    expectedAnswer = verb.pp;
    promptText = `Напишите форму Past Participle (V3 / Perfect) для глагола «${verb.base}» (${verb.translation}):`;
    explanation = `3-я форма (Past Participle) для ${verb.base} — ${verb.pp}.`;
  } else if (typeId === 'third_person_s') {
    expectedAnswer = verb.s;
    promptText = `Напишите форму для He/She/It (Present Simple) от глагола «${verb.base}» (${verb.translation}):`;
    explanation = `В 3-м лице Present Simple: he/she/it ${verb.s}.`;
  } else if (typeId === 'ing_form') {
    expectedAnswer = verb.ing;
    promptText = `Напишите форму с окончанием -ing для глагола «${verb.base}» (${verb.translation}):`;
    explanation = `Форма с -ing: ${verb.ing}.`;
  }

  // Generate 3 distractors for multiple choice options
  const otherVerbs = ENGLISH_IRREGULAR_VERBS.filter(v => v.base !== verb.base);
  const shuffledOthers = [...otherVerbs].sort(() => 0.5 - Math.random());
  const distractors = shuffledOthers.slice(0, 3).map(v => {
    if (typeId === 'past_simple') return v.past;
    if (typeId === 'past_participle') return v.pp;
    if (typeId === 'third_person_s') return v.s;
    return v.ing;
  });

  const options = [...new Set([expectedAnswer, ...distractors])].sort(() => 0.5 - Math.random());

  return {
    id: `vd-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    typeId,
    verb: verb.base,
    translation: verb.translation,
    prompt: promptText,
    correctAnswer: expectedAnswer,
    options,
    explanation,
  };
}

export function isVerbDrillAnswerCorrect(userAns, correctAns) {
  const normUser = normalizeAnswer(userAns);
  const normCorrect = normalizeAnswer(correctAns);
  if (normUser === normCorrect) return true;

  // Handle slash alternatives like was/were or got/gotten
  const parts = correctAns.split(/[/|]/).map(p => normalizeAnswer(p));
  return parts.includes(normUser);
}
