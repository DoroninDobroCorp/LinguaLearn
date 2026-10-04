const BASE_PATH = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL)
  ? (import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`)
  : '/spanish/';

export const MNEMONIC_CARTOONS = {
  50: {
    id: '50',
    number: 50,
    word: 'cincuenta',
    phonetics: 'син-КУЭН-та',
    title: 'Синий Кентавр',
    emoji: '🦄',
    badgeColor: 'bg-blue-600 text-white',
    gradient: 'from-blue-600 to-indigo-700',
    url: `${BASE_PATH}cartoons/cincuenta-centauro.html`,
    catchphrase: 'Синий Кентавр скачет на 50!',
    tip: '50 = CINCUENTA. Ассоциация: СИНИЙ КЕНТАВР мчит с числом 50 на боку! син-КУЭН-та → Синий Кентавр.',
    ruleNote: 'Десяток от cinco (5). Запомни: cinco -> cincuenta.',
  },
  500: {
    id: '500',
    number: 500,
    word: 'quinientos',
    phonetics: 'кинь-ЕН-тос',
    title: 'Кинь, Ентос!',
    emoji: '🎯',
    badgeColor: 'bg-amber-600 text-white',
    gradient: 'from-amber-500 to-orange-600',
    url: `${BASE_PATH}cartoons/quinientos-entos.html`,
    catchphrase: '«Кинь, Ентос! Кинь, Ентос! Пятьсот песо!»',
    tip: '500 = QUINIENTOS. ГЛАВНАЯ ЛОВУШКА! Формы «cincocientos» НЕ существует! Представь: чувак по имени Ентос просит бросить 500 монет: «Кинь, Ентос!».',
    ruleNote: 'Особое исключение в сотнях: 500 -> quinientos (НЕ cincocientos!).',
  },
};

const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'
];

const TENS = [
  '', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'
];

const TWENTIES = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
  'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'
];

const HUNDREDS = {
  100: 'cien',
  200: 'doscientos',
  300: 'trescientos',
  400: 'cuatrocientos',
  500: 'quinientos', // Irregular!
  600: 'seiscientos',
  700: 'setecientos', // Irregular! (sete, not siete)
  800: 'ochocientos',
  900: 'novecientos', // Irregular! (nove, not nueve)
};

/**
 * Converts any integer between 0 and 1000 into accurate Spanish orthography.
 */
export function numberToSpanish(n) {
  const num = Math.round(Number(n));
  if (num === 0) return 'cero';
  if (num === 1000) return 'mil';
  if (num < 0 || num > 1000) return String(num);

  // 1 to 19
  if (num < 20) {
    return UNITS[num];
  }

  // 20 to 29 (compound single word)
  if (num >= 20 && num <= 29) {
    return TWENTIES[num - 20];
  }

  // 30 to 99
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    if (unit === 0) return TENS[ten];
    return `${TENS[ten]} y ${UNITS[unit]}`;
  }

  // Exactly 100
  if (num === 100) {
    return 'cien';
  }

  // 101 to 999
  const hundredDigit = Math.floor(num / 100) * 100;
  const remainder = num % 100;

  const hundredWord = hundredDigit === 100 ? 'ciento' : HUNDREDS[hundredDigit];

  if (remainder === 0) {
    return hundredWord;
  }

  return `${hundredWord} ${numberToSpanish(remainder)}`;
}

/**
 * Generates an intuitive phonetic guide for Russian learners.
 */
export function getSpanishNumberPhonetics(num) {
  const n = Math.round(Number(num));
  if (n === 50) return 'син-КУЭН-та';
  if (n === 500) return 'кинь-ЕН-тос';
  if (n === 5) return 'СИН-ко';
  if (n === 15) return 'КИН-се';
  if (n === 16) return 'дьеси-СЕЙС';
  if (n === 20) return 'БЕЙН-тэ';
  if (n === 21) return 'бейнти-У-но';
  if (n === 22) return 'бейнти-ДОС';
  if (n === 30) return 'ТРЕЙН-та';
  if (n === 40) return 'куа-РЕН-та';
  if (n === 60) return 'се-СЕН-та';
  if (n === 70) return 'се-ТЕН-та';
  if (n === 80) return 'о-ЧЕН-та';
  if (n === 90) return 'но-БЕН-та';
  if (n === 100) return 'сьен';
  if (n === 700) return 'сете-СЬЕН-тос';
  if (n === 900) return 'нове-СЬЕН-тос';
  if (n === 1000) return 'миль';

  const text = numberToSpanish(n);
  return text
    .replace(/quinientos/g, 'кинь-ЕН-тос')
    .replace(/cincuenta/g, 'син-КУЭН-та')
    .replace(/doscientos/g, 'дос-СЬЕН-тос')
    .replace(/trescientos/g, 'трес-СЬЕН-тос')
    .replace(/cuatrocientos/g, 'куатро-СЬЕН-тос')
    .replace(/seiscientos/g, 'сейс-СЬЕН-тос')
    .replace(/setecientos/g, 'сете-СЬЕН-тос')
    .replace(/ochocientos/g, 'очо-СЬЕН-тос')
    .replace(/novecientos/g, 'нове-СЬЕН-тос')
    .replace(/ciento/g, 'сьен-то')
    .replace(/cien\b/g, 'сьен')
    .replace(/mil\b/g, 'миль')
    .replace(/treinta/g, 'ТРЕЙН-та')
    .replace(/cuarenta/g, 'куа-РЕН-та')
    .replace(/sesenta/g, 'се-СЕН-та')
    .replace(/setenta/g, 'се-ТЕН-та')
    .replace(/ochenta/g, 'о-ЧЕН-та')
    .replace(/noventa/g, 'но-БЕН-та')
    .replace(/veintidós/g, 'бейнти-ДОС')
    .replace(/veintitrés/g, 'бейнти-ТРЕС')
    .replace(/veintiséis/g, 'бейнти-СЕЙС')
    .replace(/veinticuatro/g, 'бейнти-КУА-тро')
    .replace(/veinticinco/g, 'бейнти-СИН-ко')
    .replace(/veintisiete/g, 'бейнти-СЬЕ-те')
    .replace(/veintiocho/g, 'бейнти-О-чо')
    .replace(/veintinueve/g, 'бейнти-НУЭ-ве')
    .replace(/veintiuno/g, 'бейнти-У-но')
    .replace(/veinte/g, 'БЕЙН-тэ')
    .replace(/\bdiez\b/g, 'дьес')
    .replace(/\bonce\b/g, 'ОН-се')
    .replace(/\bdoce\b/g, 'ДО-се')
    .replace(/\btrece\b/g, 'ТРЕ-се')
    .replace(/\bcatorce\b/g, 'ка-ТОР-се')
    .replace(/\bquince\b/g, 'КИН-се')
    .replace(/\bdieciséis\b/g, 'дьеси-СЕЙС')
    .replace(/\bdiecisiete\b/g, 'дьеси-СЬЕ-те')
    .replace(/\bdieciocho\b/g, 'дьеси-О-чо')
    .replace(/\bdiecinueve\b/g, 'дьеси-НУЭ-ве')
    .replace(/\buno\b/g, 'У-но')
    .replace(/\bdos\b/g, 'дос')
    .replace(/\btres\b/g, 'трес')
    .replace(/\bcuatro\b/g, 'КУА-тро')
    .replace(/\bcinco\b/g, 'СИН-ко')
    .replace(/\bseis\b/g, 'сейс')
    .replace(/\bsiete\b/g, 'сьЕ-те')
    .replace(/\bocho\b/g, 'О-чо')
    .replace(/\bnueve\b/g, 'нуЭ-ве')
    .replace(/ y /g, ' и ');
}

/**
 * Returns grammatical commentary or mnemonic alert for any number.
 */
export function getSpanishNumberExplanation(num) {
  const n = Math.round(Number(num));
  if (n === 50) {
    return '🦄 МНЕМОНИКА: 50 = cincuenta. «Синий Кентавр» скачет с номером 50! Посмотри мультик выше со звуком.';
  }
  if (n === 500) {
    return '🎯 МНЕМОНИКА: 500 = quinientos. Опасная ловушка! Слова cincocientos НЕТ. Запомни фразу: «Кинь, Ентос!» (500 монет).';
  }
  if (n === 5) {
    return 'Базовое число: cinco. Корень для quince (15), cincuenta (50) и quinientos (500).';
  }
  if (n === 15) {
    return 'Особая форма: quince [КИН-се]. Не diez y cinco!';
  }
  if (n >= 16 && n <= 19) {
    return 'Числа 16–19 пишутся слитно через dieci-! В dieciséis ставится графическое ударение (tilde) на é.';
  }
  if (n >= 21 && n <= 29) {
    return 'Все числа от 21 до 29 пишутся СЛИТНО в одно слово с префиксом veinti-! В veintidós, veintitrés, veintiséis ставится ударение.';
  }
  if (n >= 31 && n <= 99 && n % 10 !== 0) {
    return 'От 31 до 99 составные числа пишутся в ТРИ слова через союз «y» (например: treinta y uno).';
  }
  if (n === 100) {
    return 'Ровно 100 — это всегда cien. Но начиная со 101 форма меняется на ciento!';
  }
  if (n === 700) {
    return '⚠️ Исключение в сотнях: setecientos. Буква «i» выпадает: siete -> sete-cientos (НЕ sietecientos).';
  }
  if (n === 900) {
    return '⚠️ Исключение в сотнях: novecientos. Дифтонг «ue» меняется на «o»: nueve -> nove-cientos (НЕ nuevecientos).';
  }
  if (n === 1000) {
    return 'Ровно 1000 — просто mil. Артикль «un» перед mil не ставится (не un mil, а просто mil).';
  }
  if (n > 100 && n % 100 === 50) {
    return 'В этом числе есть 50 (cincuenta)! Вспомни синего кентавра!';
  }
  if (n > 500 && n < 600) {
    return 'В этом числе есть 500 (quinientos)! Вспомни «Кинь, Ентос!».';
  }
  return null;
}

// Exactly the 19 round numbers specified by the user
export const ROUND_NUMBERS_10_TO_1000 = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  200, 300, 400, 500, 600, 700, 800, 900, 1000
];

export const NUMBER_PRESETS = [
  {
    id: 'round',
    label: 'Круглые (10..1000)',
    emoji: '🎯',
    description: '10, 20, 30, 40, 50, 60... 100, 200... 1000 — ровно 19 ключевых круглых чисел',
    count: 19,
  },
  {
    id: 'cartoons',
    label: 'Звезды 50 и 500',
    emoji: '🎬',
    description: '50, 500 и их семейство (5, 15, 150, 250, 505, 550, 555) с мультиками-подсказками',
    count: 12,
  },
  {
    id: 'range_1_20',
    label: '1–20 (Базовые)',
    emoji: '🌱',
    description: 'Фундамент счета: uno..diez, особые 11–15 и слитные 16–19 с ударениями',
    count: 20,
  },
  {
    id: 'range_21_99',
    label: '21–99 (Десятки)',
    emoji: '🔢',
    description: 'Слитные 20-е (veinticinco) и раздельные 30–99 через «y» (cuarenta y dos)',
    count: 79,
  },
  {
    id: 'range_100_999',
    label: '100–999 (Сотни)',
    emoji: '🏛️',
    description: 'Сотни: ciento, quinientos (500), setecientos (700), novecientos (900)',
    count: 900,
  },
  {
    id: 'range_1_1000',
    label: '1–1000 (Все числа)',
    emoji: '🎲',
    description: 'Случайный микс любого числа от 1 до 1000',
    count: 1000,
  },
];

const CARTOONS_FAMILY = [
  5, 15, 50, 50, 50, 150, 250, 350, 450, 500, 500, 500, 505, 550, 555, 750, 950
];

/**
 * Generates a drill question with 4 options and distractor analysis.
 */
export function generateNumberQuestion(presetId = 'round', mode = 'number_to_word', targetOverride = null) {
  let targetNum = targetOverride;

  if (targetNum === null || targetNum === undefined) {
    if (presetId === 'round') {
      const idx = Math.floor(Math.random() * ROUND_NUMBERS_10_TO_1000.length);
      targetNum = ROUND_NUMBERS_10_TO_1000[idx];
    } else if (presetId === 'cartoons') {
      const idx = Math.floor(Math.random() * CARTOONS_FAMILY.length);
      targetNum = CARTOONS_FAMILY[idx];
    } else if (presetId === 'range_1_20') {
      targetNum = Math.floor(Math.random() * 20) + 1;
    } else if (presetId === 'range_21_99') {
      targetNum = Math.floor(Math.random() * 79) + 21;
    } else if (presetId === 'range_100_999') {
      targetNum = Math.floor(Math.random() * 900) + 100;
    } else {
      targetNum = Math.floor(Math.random() * 1000) + 1;
    }
  }

  const spanishWord = numberToSpanish(targetNum);
  const phonetics = getSpanishNumberPhonetics(targetNum);
  const explanation = getSpanishNumberExplanation(targetNum);

  // Distractors generation
  const distractorNums = new Set();

  // Smart traps for special numbers
  if (targetNum === 500) {
    distractorNums.add(50);
    distractorNums.add(505);
    distractorNums.add(5000);
  } else if (targetNum === 50) {
    distractorNums.add(15);
    distractorNums.add(5);
    distractorNums.add(60);
    distractorNums.add(500);
  } else if (targetNum === 60) {
    distractorNums.add(70);
    distractorNums.add(6);
    distractorNums.add(16);
  } else if (targetNum === 70) {
    distractorNums.add(60);
    distractorNums.add(7);
    distractorNums.add(17);
  } else if (targetNum === 700) {
    distractorNums.add(70);
    distractorNums.add(600);
    distractorNums.add(800);
  } else if (targetNum === 900) {
    distractorNums.add(90);
    distractorNums.add(800);
    distractorNums.add(1000);
  }

  // Add close / related numbers
  const candidates = [
    targetNum + 1, targetNum - 1,
    targetNum + 10, targetNum - 10,
    targetNum + 100, targetNum - 100,
    targetNum + 5, targetNum - 5,
  ];

  for (const cand of candidates) {
    if (cand >= 1 && cand <= 1000 && cand !== targetNum) {
      distractorNums.add(cand);
    }
  }

  // If in round mode, pick distractors from ROUND_NUMBERS_10_TO_1000
  if (presetId === 'round') {
    ROUND_NUMBERS_10_TO_1000.forEach((rn) => {
      if (rn !== targetNum) distractorNums.add(rn);
    });
  }

  // Fill up if needed
  while (distractorNums.size < 10) {
    const r = Math.floor(Math.random() * 1000) + 1;
    if (r !== targetNum) distractorNums.add(r);
  }

  // Shuffle distractors and pick 3
  const shuffledDistractorNums = Array.from(distractorNums)
    .filter((n) => n !== targetNum && n >= 1 && n <= 1000)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  // Build options based on mode
  let options = [];
  let correctAnswer = '';
  let questionDisplay = '';

  if (mode === 'number_to_word') {
    questionDisplay = String(targetNum);
    correctAnswer = spanishWord;

    const optWords = [spanishWord];

    // For 500, optionally inject the classic trap "cincocientos"
    if (targetNum === 500) {
      optWords.push('cincocientos (неправильно!)');
      shuffledDistractorNums.slice(0, 2).forEach((num) => {
        optWords.push(numberToSpanish(num));
      });
    } else if (targetNum === 700) {
      optWords.push('sietecientos (неправильно!)');
      shuffledDistractorNums.slice(0, 2).forEach((num) => {
        optWords.push(numberToSpanish(num));
      });
    } else {
      shuffledDistractorNums.forEach((num) => {
        optWords.push(numberToSpanish(num));
      });
    }

    options = optWords.sort(() => 0.5 - Math.random());
  } else if (mode === 'word_to_number') {
    questionDisplay = spanishWord;
    correctAnswer = String(targetNum);
    const optNums = [String(targetNum), ...shuffledDistractorNums.map(String)];
    options = optNums.sort(() => 0.5 - Math.random());
  } else if (mode === 'audio_to_number') {
    questionDisplay = '🔊 Послушай и выбери число';
    correctAnswer = String(targetNum);
    const optNums = [String(targetNum), ...shuffledDistractorNums.map(String)];
    options = optNums.sort(() => 0.5 - Math.random());
  }

  const hasCartoon = targetNum === 50 || targetNum === 500;
  const cartoonId = targetNum === 50 ? '50' : targetNum === 500 ? '500' : null;

  return {
    targetNum,
    spanishWord,
    phonetics,
    explanation,
    mode,
    presetId,
    questionDisplay,
    correctAnswer,
    options,
    hasCartoon,
    cartoonId,
    mnemonic: cartoonId ? MNEMONIC_CARTOONS[cartoonId] : null,
  };
}
