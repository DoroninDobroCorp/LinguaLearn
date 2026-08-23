/**
 * Spanish Grammar & Vocabulary Exercise Generation Engine
 * Creates rich, contextual grammar exercises testing the selected CEFR topic
 * while embedding the student's vocabulary (mastered / active).
 */

const AR_VERBS = [
  { inf: 'hablar', root: 'habl', tr: 'говорить' },
  { inf: 'caminar', root: 'camin', tr: 'ходить / гулять' },
  { inf: 'trabajar', root: 'trabaj', tr: 'работать' },
  { inf: 'estudiar', root: 'estudi', tr: 'учиться' },
  { inf: 'comprar', root: 'compr', tr: 'покупать' },
  { inf: 'escuchar', root: 'escuch', tr: 'слушать' },
  { inf: 'mirar', root: 'mir', tr: 'смотреть' },
  { inf: 'buscar', root: 'busc', tr: 'искать' },
  { inf: 'ayudar', root: 'ayud', tr: 'помогать' },
];

const ER_IR_VERBS = [
  { inf: 'comer', root: 'com', tr: 'есть', type: 'er' },
  { inf: 'beber', root: 'beb', tr: 'пить', type: 'er' },
  { inf: 'aprender', root: 'aprend', tr: 'учить / изучать', type: 'er' },
  { inf: 'comprender', root: 'comprend', tr: 'понимать', type: 'er' },
  { inf: 'vivir', root: 'viv', tr: 'жить', type: 'ir' },
  { inf: 'escribir', root: 'escrib', tr: 'писать', type: 'ir' },
  { inf: 'abrir', root: 'abr', tr: 'открывать', type: 'ir' },
];

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanWord(w) {
  return (w || '').trim().replace(/^(el|la|los|las|un|una)\s+/i, '');
}

export function generateSpanishExercise({ topic, exerciseType, targetWordObj, allUserWords = [] }) {
  const topicName = (topic?.name || '').toLowerCase();
  const word = cleanWord(targetWordObj.word);
  const translation = targetWordObj.translation;
  const level = topic?.level || 'A2';
  const type = exerciseType || 'multiple-choice';

  // 1. PRESENT TENSE REGULAR -AR VERBS
  if (topicName.includes('-ar') || topicName.includes('regular -ar')) {
    const v = sample(AR_VERBS);
    const subjects = [
      { pr: 'yo', form: v.root + 'o', distractors: [v.root + 'as', v.root + 'a', v.root + 'an'], label: 'yo (я)' },
      { pr: 'tú', form: v.root + 'as', distractors: [v.root + 'o', v.root + 'a', v.root + 'an'], label: 'tú (ты)' },
      { pr: `el / la ${word}`, form: v.root + 'a', distractors: [v.root + 'o', v.root + 'as', v.root + 'an'], label: `3-е лицо (${word})` },
      { pr: 'nosotros', form: v.root + 'amos', distractors: [v.root + 'an', v.root + 'as', v.root + 'a'], label: 'nosotros (мы)' },
      { pr: 'ellos / ellas', form: v.root + 'an', distractors: [v.root + 'a', v.root + 'as', v.root + 'amos'], label: 'ellos (они)' },
    ];
    const subj = sample(subjects);

    const question = `Поставьте глагол «${v.inf}» (${v.tr}) в форму Presente:\n"${subj.pr.charAt(0).toUpperCase() + subj.pr.slice(1)} ___ (${v.inf}) todos los días."`;
    const correctAnswer = subj.form;
    const options = [...subj.distractors, subj.form].sort(() => 0.5 - Math.random());
    const explanation = `Для местоимения/подлежащего «${subj.label}» у правильных глаголов на -ar (${v.inf}) в настоящем времени используется окончание «${correctAnswer.slice(v.root.length)}» → ${correctAnswer}.`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Present tense regular -ar verbs',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 2. PRESENT TENSE REGULAR -ER / -IR VERBS
  if (topicName.includes('-er') || topicName.includes('-ir') || topicName.includes('regular -er/-ir')) {
    const v = sample(ER_IR_VERBS);
    const end3 = v.type === 'er' ? 'e' : 'e';
    const end1pl = v.type === 'er' ? 'emos' : 'imos';
    const subjects = [
      { pr: 'yo', form: v.root + 'o', distractors: [v.root + 'es', v.root + 'e', v.root + 'en'], label: 'yo (я)' },
      { pr: 'tú', form: v.root + 'es', distractors: [v.root + 'o', v.root + 'e', v.root + 'en'], label: 'tú (ты)' },
      { pr: `el / la ${word}`, form: v.root + end3, distractors: [v.root + 'o', v.root + 'es', v.root + 'en'], label: `3-е лицо (${word})` },
      { pr: 'nosotros', form: v.root + end1pl, distractors: [v.root + 'en', v.root + 'es', v.root + end3], label: 'nosotros (мы)' },
    ];
    const subj = sample(subjects);

    const question = `Поставьте глагол «${v.inf}» (${v.tr}) в форму Presente:\n"${subj.pr.charAt(0).toUpperCase() + subj.pr.slice(1)} ___ (${v.inf}) con frecuencia."`;
    const correctAnswer = subj.form;
    const options = [...subj.distractors, subj.form].sort(() => 0.5 - Math.random());
    const explanation = `Для формы «${subj.label}» у глаголов на -${v.type} (${v.inf}) в настоящем времени окончание: «${correctAnswer.slice(v.root.length)}» → ${correctAnswer}.`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Present tense regular -er/-ir verbs',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 3. SER VS ESTAR
  if (topicName.includes('ser vs estar') || topicName.includes('ser') && topicName.includes('estar')) {
    const isEstarScenario = Math.random() > 0.5;
    let question, correctAnswer, options, explanation;
    if (isEstarScenario) {
      question = `Выберите правильный глагол (ser или estar):\n"El/La ${word} ___ (находится / в состоянии) aquí ahora mismo."`;
      correctAnswer = 'está';
      options = ['está', 'es', 'son', 'están'];
      explanation = `Для указания текущего местоположения («aquí») или временного состояния используется глагол estar (está).`;
    } else {
      question = `Выберите правильный глагол (ser или estar):\n"El/La ${word} ___ (постоянное свойство / качество) muy importante para nosotros."`;
      correctAnswer = 'es';
      options = ['es', 'está', 'somos', 'estamos'];
      explanation = `Для описания сущности, характеристик и постоянных свойств предмета используется глагол ser (es).`;
    }

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Ser vs Estar',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 4. PREPOSITIONS OF PLACE
  if (topicName.includes('preposition') || topicName.includes('place') || topicName.includes('местоположен') || topicName.includes('delante') || topicName.includes('debajo')) {
    const preps = [
      { es: 'delante de', ru: 'перед / впереди', distractors: ['detrás de', 'al lado de', 'lejos de'] },
      { es: 'detrás de', ru: 'позади / за', distractors: ['delante de', 'cerca de', 'al lado de'] },
      { es: 'al lado de', ru: 'рядом с / около', distractors: ['lejos de', 'detrás de', 'delante de'] },
      { es: 'cerca de', ru: 'близко к / недалеко от', distractors: ['lejos de', 'delante de', 'detrás de'] },
      { es: 'lejos de', ru: 'далеко от', distractors: ['cerca de', 'al lado de', 'delante de'] },
    ];
    const p = sample(preps);
    const question = `Вставьте подходящий предлог места (${p.ru}):\n"El objeto está ___ (${p.ru}) la ${word}."`;
    const correctAnswer = p.es;
    const options = [p.es, ...p.distractors].sort(() => 0.5 - Math.random());
    const explanation = `Предлог места «${p.es}» переводится как «${p.ru}». Полное предложение: «El objeto está ${p.es} la ${word}.»`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Prepositions of place',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 5. GENDER & ARTICLES (el/la/los/las/un/una)
  if (topicName.includes('article') || topicName.includes('gender') || topicName.includes('артикл') || topicName.includes('род')) {
    const isFeminine = word.endsWith('a') || word.endsWith('ión') || word.endsWith('dad') || ['ley', 'foto', 'mano', 'dama', 'mujer', 'gente', 'noche', 'calle'].includes(word.toLowerCase());
    const artDef = isFeminine ? 'la' : 'el';
    const artIndef = isFeminine ? 'una' : 'un';
    const useDef = Math.random() > 0.5;

    const correctAnswer = useDef ? artDef : artIndef;
    const options = useDef ? ['el', 'la', 'los', 'las'] : ['un', 'una', 'unos', 'unas'];
    const question = `Вставьте правильный артикль перед словом «${word}» (${translation}):\n"___ ${word} es muy interesante."`;
    const explanation = `Слово «${word}» относится к ${isFeminine ? 'женскому (femenino)' : 'мужскому (masculino)'} роду, поэтому используется артикль «${correctAnswer}».`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Gender and articles',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 6. DEMONSTRATIVES (este/esta/estos/estas/ese/aquel)
  if (topicName.includes('demonstrative') || topicName.includes('указател') || topicName.includes('este')) {
    const isFeminine = word.endsWith('a') || ['ley', 'dama', 'mujer', 'calle', 'noche'].includes(word.toLowerCase());
    const correctAnswer = isFeminine ? 'esta' : 'este';
    const options = ['este', 'esta', 'estos', 'estas'];
    const question = `Выберите правильное указательное местоимение «этот/эта» для слова «${word}» (${translation}):\n"___ ${word} me gusta mucho."`;
    const explanation = `Для существительных ${isFeminine ? 'женского рода (femenino)' : 'мужского рода (masculino)'} в единственном числе используется указатель «${correctAnswer}» (${correctAnswer} ${word}).`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Demonstratives',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 7. PRETERITE (INDEFINIDO)
  if (topicName.includes('preterite') || topicName.includes('indefinido') || topicName.includes('прошедш')) {
    const verb = sample(AR_VERBS);
    const question = `Поставьте глагол «${verb.inf}» (${verb.tr}) в Pretérito Indefinido (прошедшее время):\n"Ayer la persona ___ (${verb.inf}) cerca de ${word}."`;
    const correctAnswer = verb.root + 'ó';
    const options = [verb.root + 'ó', verb.root + 'é', verb.root + 'aron', verb.root + 'aste'].sort(() => 0.5 - Math.random());
    const explanation = `В Pretérito Indefinido форма 3-го лица ед. ч. (él/ella/la persona) для глаголов на -ar оканчивается на «-ó» с графическим ударением: ${correctAnswer}.`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Preterite tense',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 8. TENER & TENER EXPRESSIONS
  if (topicName.includes('tener')) {
    const question = `Поставьте глагол tener в правильную форму для подлежащего «él / ella»:\n"El/La ${word} ___ (tener) mucho que hacer hoy."`;
    const correctAnswer = 'tiene';
    const options = ['tiene', 'tengo', 'tienes', 'tenemos'];
    const explanation = `Для 3-го лица единственного числа (él / ella / el sujeto) форма глагола tener в Presente — «tiene».`;

    return {
      type,
      question,
      options: type === 'multiple-choice' ? options : undefined,
      correctAnswer,
      explanation,
      topic: topic?.name || 'Tener and expressions',
      level,
      targetWord: word,
      targetWordTranslation: translation,
    };
  }

  // 9. GENERAL / CONTEXTUAL GRAMMAR SENTENCE (Fallback for other topics)
  const lowerWord = word.toLowerCase();
  let t;

  if (['cuándo', 'cuando', 'dónde', 'donde', 'qué', 'que', 'quién', 'quien', 'cómo', 'como', 'por qué', 'porque'].includes(lowerWord)) {
    t = {
      q: `Выберите правильное вопросительное/союзное слово со значением «${translation}»:\n"¿___ vas a la oficina por la mañana?"`,
      ans: word,
      exp: `Слово «${word}» переводится как «${translation}». Полная фраза: «¿${word} vas a la oficina por la mañana?»`
    };
  } else if (lowerWord.endsWith('ar') || lowerWord.endsWith('er') || lowerWord.endsWith('ir')) {
    t = {
      q: `Вставьте подходящий инфинитив глагола со значением «${translation}»:\n"Quiero ___ español todos los días."`,
      ans: word,
      exp: `Глагол «${word}» означает «${translation}». Полная фраза: «Quiero ${word} español todos los días.»`
    };
  } else {
    const templates = [
      {
        q: `Дополните предложение словом «${translation}»:\n"En mi día a día, siempre uso el/la ___ para trabajar."`,
        ans: word,
        exp: `Слово «${word}» (${translation}) верно дополняет контекст. Полная фраза: «En mi día a día, siempre uso el/la ${word} para trabajar.»`,
      },
      {
        q: `Выберите точное испанское слово со значением «${translation}»:\n"Mi amigo me habló sobre un/una ___ muy interesante ayer."`,
        ans: word,
        exp: `Правильное слово: «${word}» (${translation}). Полное предложение: «Mi amigo me habló sobre un/una ${word} muy interesante ayer.»`,
      },
      {
        q: `Какое испанское слово переводится как «${translation}»:\n"Necesitamos encontrar el/la ___ antes de salir."`,
        ans: word,
        exp: `«${word}» означает «${translation}». Полная фраза: «Necesitamos encontrar el/la ${word} antes de salir.»`,
      },
    ];
    t = sample(templates);
  }

  const otherWords = allUserWords.map((w) => cleanWord(w.word)).filter((w) => w.toLowerCase() !== word.toLowerCase());
  const distractors = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
  while (distractors.length < 3) {
    distractors.push(['camino', 'persona', 'lugar', 'cosa', 'tiempo'][distractors.length]);
  }
  const options = [word, ...distractors].sort(() => 0.5 - Math.random());

  return {
    type,
    question: t.q,
    options: type === 'multiple-choice' ? options : undefined,
    correctAnswer: t.ans,
    explanation: t.exp,
    topic: topic?.name || 'Лексика и базовая грамматика',
    level,
    targetWord: word,
    targetWordTranslation: translation,
  };
}
