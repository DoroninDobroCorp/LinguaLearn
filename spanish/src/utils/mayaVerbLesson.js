// Kids lessons for Maya:
// Version 1: Argentine "vos" verb tails with pictures & explainer video.
// Version 2: All Argentine pronouns (yo, vos, él/ella, nosotros/nosotras, ustedes, ellos/ellas) with pictures & NO video.

export const MAYA_SCENES = [
  {
    id: 'play',
    src: '/spanish/images/maya-verbs/ar-actions.png',
    alt: 'Девочка играет в мяч, ест медиалуну и рисует дом',
    verbs: ['jugar', 'comer', 'dibujar'],
  },
  {
    id: 'class',
    src: '/spanish/images/maya-verbs/listen-look.png',
    alt: 'Ребёнок слушает учительницу и смотрит на рисунок',
    verbs: ['escuchar', 'mirar', 'entender'],
  },
  {
    id: 'plaza',
    src: '/spanish/images/maya-verbs/run-jump.png',
    alt: 'Дети бегут по площадке и прыгают через скакалку',
    verbs: ['correr', 'saltar'],
  },
  {
    id: 'home',
    src: '/spanish/images/maya-verbs/help-wait.png',
    alt: 'Ребёнок помогает маме накрыть на стол и ждёт у окна',
    verbs: ['ayudar', 'esperar', 'comprar', 'pintar'],
  },
];

// Argentine pronoun groups specifically for Part 2 (the rest of the pronouns: él/ella, nosotros, ustedes/ellos)
export const PART2_REMAINING_PRONOUNS = [
  {
    id: 'ella',
    pronoun: 'Él / Ella',
    meaning: 'Он / Она',
    kidRule: 'Просто убери последнюю букву -r у инфинитива: останется хвостик -a или -e!',
    arTail: '-a',
    erTail: '-e',
    arExample: 'Maya pinta con témperas. Él salta alto.',
    arExampleRu: 'Майя раскрашивает красками. Он высоко прыгает.',
    erExample: 'Ella come pizza. El perro corre.',
    erExampleRu: 'Она ест пиццу. Собака бежит.',
    gradient: 'from-purple-500 to-indigo-500',
    bgLight: 'bg-purple-50 border-purple-200 text-purple-950',
    badgeBg: 'bg-purple-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/listen-look.png',
  },
  {
    id: 'nosotros',
    pronoun: 'Nosotros / Nosotras',
    meaning: 'Мы (или только девочки — nosotras)',
    kidRule: 'Когда мы делаем что-то все вместе, у глагола дружный длинный хвостик -amos или -emos!',
    arTail: '-amos',
    erTail: '-emos',
    arExample: 'Nosotras dibujamos y ayudamos a mamá.',
    arExampleRu: 'Мы (девочки) рисуем и помогаем маме.',
    erExample: 'Nosotros comemos empanadas y corremos.',
    erExampleRu: 'Мы кушаем эмпанадас и бегаем.',
    gradient: 'from-emerald-500 to-teal-500',
    bgLight: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    badgeBg: 'bg-emerald-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/help-wait.png',
  },
  {
    id: 'ustedes',
    pronoun: 'Ustedes / Ellos / Ellas',
    meaning: 'Вы все (ustedes) и Они (ellos / ellas)',
    kidRule: 'Секрет Аргентины: слово vosotros не говорят! И для «вы все» (ustedes), и для «они» (ellos/ellas) один хвостик с буквой N: -an или -en!',
    arTail: '-an',
    erTail: '-en',
    arExample: 'Ustedes saltan a la soga. Ellas miran el sol.',
    arExampleRu: 'Вы все прыгаете через скакалку. Они смотрят на солнце.',
    erExample: 'Ustedes corren rápido. Ellos comen helado.',
    erExampleRu: 'Вы все быстро бежите. Они едят мороженое.',
    gradient: 'from-sky-500 to-blue-600',
    bgLight: 'bg-sky-50 border-sky-200 text-sky-950',
    badgeBg: 'bg-sky-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/run-jump.png',
  },
];

// All Argentine pronoun groups for reference
export const ARGENTINE_PRONOUN_CARDS = [
  {
    id: 'yo',
    pronoun: 'Yo',
    meaning: 'Я',
    kidRule: 'Когда говоришь про себя — почти всегда ставь хвостик -o!',
    arTail: '-o',
    erTail: '-o',
    arExample: 'Yo dibujo una casa.',
    arExampleRu: 'Я рисую дом.',
    erExample: 'Yo como una medialuna.',
    erExampleRu: 'Я кушаю медиалуну.',
    gradient: 'from-amber-400 to-orange-500',
    bgLight: 'bg-amber-50 border-amber-200 text-amber-950',
    badgeBg: 'bg-amber-500 text-white',
    sceneImage: '/spanish/images/maya-verbs/ar-actions.png',
  },
  {
    id: 'vos',
    pronoun: 'Vos',
    meaning: 'Ты (в Аргентине)',
    kidRule: 'В Буэнос-Айресе вместо tú говорят vos и ставят ударный хвостик -ás или -és!',
    arTail: '-ás',
    erTail: '-és',
    arExample: 'Vos dibujás muy lindo.',
    arExampleRu: 'Ты очень красиво рисуешь.',
    erExample: 'Vos comés un alfajor.',
    erExampleRu: 'Ты кушаешь альфахор.',
    gradient: 'from-rose-500 to-pink-500',
    bgLight: 'bg-rose-50 border-rose-200 text-rose-950',
    badgeBg: 'bg-rose-500 text-white',
    sceneImage: '/spanish/images/maya-verbs/hero.png',
  },
  {
    id: 'ella',
    pronoun: 'Él / Ella',
    meaning: 'Он / Она',
    kidRule: 'Просто убери последнюю букву -r у глагола: получится хвостик -a или -e!',
    arTail: '-a',
    erTail: '-e',
    arExample: 'Maya pinta con témperas. Él salta alto.',
    arExampleRu: 'Майя раскрашивает красками. Он высоко прыгает.',
    erExample: 'Ella come pizza. El perro corre.',
    erExampleRu: 'Она ест пиццу. Собака бежит.',
    gradient: 'from-purple-500 to-indigo-500',
    bgLight: 'bg-purple-50 border-purple-200 text-purple-950',
    badgeBg: 'bg-purple-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/listen-look.png',
  },
  {
    id: 'nosotros',
    pronoun: 'Nosotros / Nosotras',
    meaning: 'Мы (или только девочки — nosotras)',
    kidRule: 'Когда мы делаем что-то все вместе, у глагола дружный длинный хвостик -amos или -emos!',
    arTail: '-amos',
    erTail: '-emos',
    arExample: 'Nosotras dibujamos y ayudamos a mamá.',
    arExampleRu: 'Мы (девочки) рисуем и помогаем маме.',
    erExample: 'Nosotros comemos empanadas y corremos.',
    erExampleRu: 'Мы кушаем эмпанадас и бегаем.',
    gradient: 'from-emerald-500 to-teal-500',
    bgLight: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    badgeBg: 'bg-emerald-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/help-wait.png',
  },
  {
    id: 'ustedes',
    pronoun: 'Ustedes / Ellos / Ellas',
    meaning: 'Вы все (ustedes) и Они (ellos / ellas)',
    kidRule: 'Секрет Аргентины: слово vosotros тут не используют! И для «вы все» (ustedes), и для «они» (ellos/ellas) один хвостик с буквой N: -an или -en!',
    arTail: '-an',
    erTail: '-en',
    arExample: 'Ustedes saltan a la soga. Ellas miran el sol.',
    arExampleRu: 'Вы все прыгаете через скакалку. Они смотрят на солнце.',
    erExample: 'Ustedes corren rápido. Ellos comen helado.',
    erExampleRu: 'Вы все быстро бежите. Они едят мороженое.',
    gradient: 'from-sky-500 to-blue-600',
    bgLight: 'bg-sky-50 border-sky-200 text-sky-950',
    badgeBg: 'bg-sky-600 text-white',
    sceneImage: '/spanish/images/maya-verbs/run-jump.png',
  },
];

// Only regular verbs already in Maya's deck. querer/tener/doler stay out of this regular-tails lesson.
export const MAYA_REGULAR_VERBS = [
  {
    infinitive: 'dibujar',
    translation: 'рисовать',
    ending: 'ar',
    stem: 'dibuj',
    emoji: '✏️',
    photo: 'dibujar',
    yo: 'Yo dibujo una casa.',
    yoRu: 'Я рисую дом.',
    vos: 'Vos dibujás una casa.',
    vosRu: 'Ты рисуешь дом.',
    ella: 'Maya dibuja una casa.',
    ellaRu: 'Майя рисует дом.',
    nosotros: 'Nosotras dibujamos flores.',
    nosotrosRu: 'Мы рисуем цветы.',
    ustedes: 'Ustedes dibujan en el cuaderno.',
    ustedesRu: 'Вы все рисуете в тетради.',
    ellos: 'Ellos dibujan con lápiz.',
    ellosRu: 'Они рисуют карандашом.',
  },
  {
    infinitive: 'pintar',
    translation: 'раскрашивать',
    ending: 'ar',
    stem: 'pint',
    emoji: '🎨',
    photo: 'pintar',
    yo: 'Yo pinto con témperas.',
    yoRu: 'Я раскрашиваю красками.',
    vos: 'Vos pintás con témperas.',
    vosRu: 'Ты раскрашиваешь красками.',
    ella: 'Maya pinta con témperas.',
    ellaRu: 'Майя раскрашивает красками.',
    nosotros: 'Nosotros pintamos el dibujo.',
    nosotrosRu: 'Мы раскрашиваем рисунок.',
    ustedes: 'Ustedes pintan de color azul.',
    ustedesRu: 'Вы все красите в синий цвет.',
    ellos: 'Ellas pintan flores rojas.',
    ellosRu: 'Они раскрашивают красные цветы.',
  },
  {
    infinitive: 'comer',
    translation: 'кушать',
    ending: 'er',
    stem: 'com',
    emoji: '🥐',
    photo: 'comer',
    yo: 'Yo como una medialuna.',
    yoRu: 'Я кушаю медиалуну.',
    vos: 'Vos comés una medialuna.',
    vosRu: 'Ты кушаешь медиалуну.',
    ella: 'Maya come una medialuna.',
    ellaRu: 'Майя кушает медиалуну.',
    nosotros: 'Nosotros comemos pizza rica.',
    nosotrosRu: 'Мы кушаем вкусную пиццу.',
    ustedes: 'Ustedes comen galletitas.',
    ustedesRu: 'Вы все кушаете печенье.',
    ellos: 'Ellos comen un alfajor.',
    ellosRu: 'Они кушают альфахор.',
  },
  {
    infinitive: 'correr',
    translation: 'бегать',
    ending: 'er',
    stem: 'corr',
    emoji: '🏃',
    photo: 'correr',
    yo: 'Yo corro en la plaza.',
    yoRu: 'Я бегаю на площадке.',
    vos: 'Vos corrés en la plaza.',
    vosRu: 'Ты бегаешь на площадке.',
    ella: 'Maya corre en la plaza.',
    ellaRu: 'Майя бегает на площадке.',
    nosotros: 'Nosotros corremos rápido.',
    nosotrosRu: 'Мы быстро бегаем.',
    ustedes: 'Ustedes corren en el recreo.',
    ustedesRu: 'Вы все бегаете на перемене.',
    ellos: 'Ellos corren con el perro.',
    ellosRu: 'Они бегают с собакой.',
  },
  {
    infinitive: 'escuchar',
    translation: 'слушать',
    ending: 'ar',
    stem: 'escuch',
    emoji: '👂',
    photo: 'escuchar',
    yo: 'Yo escucho a la seño.',
    yoRu: 'Я слушаю учительницу.',
    vos: 'Vos escuchás a la seño.',
    vosRu: 'Ты слушаешь учительницу.',
    ella: 'Maya escucha a la seño.',
    ellaRu: 'Майя слушает учительницу.',
    nosotros: 'Nosotros escuchamos música.',
    nosotrosRu: 'Мы слушаем музыку.',
    ustedes: 'Ustedes escuchan el cuento.',
    ustedesRu: 'Вы все слушаете сказку.',
    ellos: 'Ellas escuchan a mamá.',
    ellosRu: 'Они слушают маму.',
  },
  {
    infinitive: 'mirar',
    translation: 'смотреть',
    ending: 'ar',
    stem: 'mir',
    emoji: '👀',
    photo: 'mirar',
    yo: 'Yo miro el pizarrón.',
    yoRu: 'Я смотрю на доску.',
    vos: 'Vos mirás el pizarrón.',
    vosRu: 'Ты смотришь на доску.',
    ella: 'Maya mira el pizarrón.',
    ellaRu: 'Майя смотрит на доску.',
    nosotros: 'Nosotros miramos las estrellas.',
    nosotrosRu: 'Мы смотрим на звёзды.',
    ustedes: 'Ustedes miran por la ventana.',
    ustedesRu: 'Вы все смотрите в окно.',
    ellos: 'Ellos miran los pajaritos.',
    ellosRu: 'Они смотрят на птичек.',
  },
  {
    infinitive: 'comprar',
    translation: 'покупать',
    ending: 'ar',
    stem: 'compr',
    emoji: '🏪',
    photo: 'comprar',
    yo: 'Yo compro un alfajor.',
    yoRu: 'Я покупаю альфахор.',
    vos: 'Vos comprás un alfajor.',
    vosRu: 'Ты покупаешь альфахор.',
    ella: 'Maya compra un alfajor.',
    ellaRu: 'Майя покупает альфахор.',
    nosotros: 'Nosotros compramos helado.',
    nosotrosRu: 'Мы покупаем мороженое.',
    ustedes: 'Ustedes compran en el quiosco.',
    ustedesRu: 'Вы все покупаете в киоске.',
    ellos: 'Ellas compran figuritas.',
    ellosRu: 'Они покупают наклейки.',
  },
  {
    infinitive: 'saltar',
    translation: 'прыгать',
    ending: 'ar',
    stem: 'salt',
    emoji: '🦘',
    photo: 'saltar',
    yo: 'Yo salto a la soga.',
    yoRu: 'Я прыгаю через скакалку.',
    vos: 'Vos saltás a la soga.',
    vosRu: 'Ты прыгаешь через скакалку.',
    ella: 'Maya salta a la soga.',
    ellaRu: 'Майя прыгает через скакалку.',
    nosotros: 'Nosotras saltamos juntas.',
    nosotrosRu: 'Мы прыгаем вместе.',
    ustedes: 'Ustedes saltan bien alto.',
    ustedesRu: 'Вы все прыгаете очень высоко.',
    ellos: 'Ellos saltan en la plaza.',
    ellosRu: 'Они прыгают на площадке.',
  },
  {
    infinitive: 'esperar',
    translation: 'ждать',
    ending: 'ar',
    stem: 'esper',
    emoji: '⏳',
    photo: 'esperar',
    yo: 'Yo espero un minuto.',
    yoRu: 'Я жду минутку.',
    vos: 'Vos esperás un minuto.',
    vosRu: 'Ты ждёшь минутку.',
    ella: 'Maya espera un minuto.',
    ellaRu: 'Майя ждёт минутку.',
    nosotros: 'Nosotros esperamos el turno.',
    nosotrosRu: 'Мы ждём свою очередь.',
    ustedes: 'Ustedes esperan en la puerta.',
    ustedesRu: 'Вы все ждёте у двери.',
    ellos: 'Ellos esperan el auto.',
    ellosRu: 'Они ждут машину.',
  },
  {
    infinitive: 'ayudar',
    translation: 'помогать',
    ending: 'ar',
    stem: 'ayud',
    emoji: '🤝',
    photo: 'ayudar',
    yo: 'Yo ayudo a mamá.',
    yoRu: 'Я помогаю маме.',
    vos: 'Vos ayudás a mamá.',
    vosRu: 'Ты помогаешь маме.',
    ella: 'Maya ayuda a mamá.',
    ellaRu: 'Майя помогает маме.',
    nosotros: 'Nosotros ayudamos en casa.',
    nosotrosRu: 'Мы помогаем дома.',
    ustedes: 'Ustedes ayudan a la abuela.',
    ustedesRu: 'Вы все помогаете бабушке.',
    ellos: 'Ellas ayudan al amigo.',
    ellosRu: 'Они помогают другу.',
  },
  {
    infinitive: 'jugar',
    translation: 'играть',
    ending: 'ar',
    stem: 'jug',
    emoji: '⚽',
    photo: 'jugar',
    stemNote: 'В vos и nosotros корень jug- (jugás, jugamos), а в остальных — jueg- (juego, juega, juegan).',
    yo: 'Yo juego a la pelota.',
    yoRu: 'Я играю в мяч.',
    vos: 'Vos jugás a la pelota.',
    vosRu: 'Ты играешь в мяч.',
    ella: 'Maya juega a la pelota.',
    ellaRu: 'Майя играет в мяч.',
    nosotros: 'Nosotros jugamos en la plaza.',
    nosotrosRu: 'Мы играем на площадке.',
    ustedes: 'Ustedes juegan con amigos.',
    ustedesRu: 'Вы все играете с друзьями.',
    ellos: 'Ellos juegan al fútbol.',
    ellosRu: 'Они играют в футбол.',
  },
  {
    infinitive: 'entender',
    translation: 'понимать',
    ending: 'er',
    stem: 'entend',
    emoji: '💡',
    photo: 'entender',
    stemNote: 'В vos и nosotros корень entend- (entendés, entendemos), а в остальных — entiend- (entiendo, entiende, entienden).',
    yo: 'Yo entiendo el juego.',
    yoRu: 'Я понимаю игру.',
    vos: 'Vos entendés el juego.',
    vosRu: 'Ты понимаешь игру.',
    ella: 'Maya entiende el juego.',
    ellaRu: 'Майя понимает игру.',
    nosotros: 'Nosotros entendemos la tarea.',
    nosotrosRu: 'Мы понимаем задание.',
    ustedes: 'Ustedes entienden español.',
    ustedesRu: 'Вы все понимаете по-испански.',
    ellos: 'Ellas entienden todo.',
    ellosRu: 'Они всё понимают.',
  },
];

export const VOS_TAIL = {
  ar: 'ás',
  er: 'és',
  ir: 'ís',
};

export const YO_TAIL = {
  ar: 'o',
  er: 'o',
  ir: 'o',
};

export const ELLA_TAIL = {
  ar: 'a',
  er: 'e',
  ir: 'e',
};

export const NOSOTROS_TAIL = {
  ar: 'amos',
  er: 'emos',
  ir: 'imos',
};

export const USTEDES_TAIL = {
  ar: 'an',
  er: 'en',
  ir: 'en',
};

export const ENDING_CARDS = [
  {
    id: 'ar',
    label: '-AR',
    examples: ['jugar', 'dibujar', 'mirar'],
    tail: 'ás',
    sample: 'jugás',
    sampleRu: 'ты играешь',
    swatch: 'from-rose-400 to-orange-300',
    ring: 'ring-rose-300',
  },
  {
    id: 'er',
    label: '-ER',
    examples: ['comer', 'correr', 'entender'],
    tail: 'és',
    sample: 'comés',
    sampleRu: 'ты кушаешь',
    swatch: 'from-sky-400 to-cyan-300',
    ring: 'ring-sky-300',
  },
  {
    id: 'ir',
    label: '-IR',
    examples: [],
    tail: 'ís',
    sample: '—',
    sampleRu: 'таких слов у Майи пока нет',
    swatch: 'from-emerald-400 to-lime-300',
    ring: 'ring-emerald-300',
    note: 'У Майи таких глаголов пока нет. Хвостик показываем один раз, чтобы три цвета были на месте. В игре его не спрашиваем.',
  },
];

// Stem-changing forms in non-vos / non-nosotros persons for jugar and entender
const SPECIAL_PERSON_FORMS = {
  jugar: {
    yo: 'juego',
    ella: 'juega',
    el: 'juega',
    ustedes: 'juegan',
    ellos: 'juegan',
  },
  entender: {
    yo: 'entiendo',
    ella: 'entiende',
    el: 'entiende',
    ustedes: 'entienden',
    ellos: 'entienden',
  },
};

export function getPersonTailMap(person) {
  switch (person) {
    case 'yo':
      return YO_TAIL;
    case 'vos':
      return VOS_TAIL;
    case 'nosotros':
      return NOSOTROS_TAIL;
    case 'ustedes':
    case 'ellos':
      return USTEDES_TAIL;
    case 'ella':
    case 'el':
    default:
      return ELLA_TAIL;
  }
}

export function conjugateMayaVerb(verb, person = 'vos') {
  const special = SPECIAL_PERSON_FORMS[verb.infinitive]?.[person];
  if (special) {
    return special;
  }
  const tails = getPersonTailMap(person);
  return `${verb.stem}${tails[verb.ending]}`;
}

const PERSON_LABELS = {
  yo: 'я (yo)',
  vos: 'ты (vos)',
  ella: 'он / она (él / ella)',
  nosotros: 'мы (nosotros / nosotras)',
  ustedes: 'вы все (ustedes)',
  ellos: 'они (ellos / ellas)',
};

export function buildMayaTailQuestion(verb, person = 'vos') {
  const answer = conjugateMayaVerb(verb, person);
  const spoken = verb[person] || verb.vos;
  const spokenRu = verb[`${person}Ru`] || verb.vosRu;
  const who = PERSON_LABELS[person] || PERSON_LABELS.vos;
  const tails = getPersonTailMap(person);

  let hint = `Хвостик -${tails[verb.ending]}`;
  if (person === 'yo') {
    hint = 'Для «я (yo)» хвостик -o';
  } else if (person === 'nosotros') {
    hint = `Для «мы (nosotros)» дружный хвостик -${tails[verb.ending]}`;
  } else if (person === 'ustedes' || person === 'ellos') {
    hint = `Для «вы все (ustedes)» и «они (ellos)» хвостик с N: -${tails[verb.ending]}`;
  } else if (person === 'ella') {
    hint = `Для «он / она» хвостик -${tails[verb.ending]}`;
  }

  return {
    id: `${verb.infinitive}:${person}`,
    verb,
    person,
    answer,
    spoken,
    spokenRu,
    prompt: `${who} + ${verb.infinitive}`,
    hint,
  };
}

const PEOPLE = ['yo', 'vos', 'ella'];

export function buildMayaLessonQuiz(verbs = MAYA_REGULAR_VERBS) {
  const ordered = [
    'jugar', 'comer', 'dibujar', 'pintar', 'escuchar', 'mirar',
    'entender', 'comprar', 'correr', 'saltar', 'esperar', 'ayudar',
  ].map((inf) => verbs.find((v) => v.infinitive === inf)).filter(Boolean);

  const questions = [];
  ordered.forEach((verb, index) => {
    questions.push(buildMayaTailQuestion(verb, PEOPLE[index % PEOPLE.length]));
  });
  ['jugar', 'comer', 'mirar'].forEach((infinitive) => {
    const verb = verbs.find((item) => item.infinitive === infinitive);
    if (verb) questions.push(buildMayaTailQuestion(verb, 'vos'));
  });
  return questions;
}

const PART2_PEOPLE = ['ella', 'nosotros', 'ustedes', 'ellos'];

export function buildMayaPart2Quiz(verbs = MAYA_REGULAR_VERBS) {
  // Focus exclusively on the remaining pronouns (él/ella, nosotros, ustedes, ellos)
  const pureRegulars = verbs.filter((v) => !v.stemNote);
  const questions = [];
  pureRegulars.forEach((verb, index) => {
    const person = PART2_PEOPLE[index % PART2_PEOPLE.length];
    questions.push(buildMayaTailQuestion(verb, person));
  });
  const comer = verbs.find((v) => v.infinitive === 'comer');
  const dibujar = verbs.find((v) => v.infinitive === 'dibujar');
  if (dibujar) {
    questions.push(buildMayaTailQuestion(dibujar, 'nosotros'));
    questions.push(buildMayaTailQuestion(dibujar, 'ustedes'));
  }
  if (comer) {
    questions.push(buildMayaTailQuestion(comer, 'ella'));
    questions.push(buildMayaTailQuestion(comer, 'ellos'));
  }
  return questions;
}

export const buildMayaPronounsQuiz = buildMayaPart2Quiz;

export function isMayaLessonAnswer(input, answer) {
  const fold = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zñ]/g, '');
  return fold(input) === fold(answer);
}
