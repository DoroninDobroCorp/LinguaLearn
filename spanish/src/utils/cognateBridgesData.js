// Data and logic for Cognates, Suffix Bridges and False Friends Trainer

export const SUFFIX_RULES = [
  {
    pattern: '-tion → -ción',
    gender: 'Женский род (la...)',
    englishSuffix: '-tion',
    spanishSuffix: '-ción',
    description: 'Английские и латинские существительные на -tion переходят в -ción с ударением на ó и ВСЕГДА женского рода (la).',
    examples: [
      { en: 'information', es: 'la información', ru: 'информация' },
      { en: 'action', es: 'la acción', ru: 'действие, акция' },
      { en: 'nation', es: 'la nación', ru: 'нация, народ' },
      { en: 'station', es: 'la estación', ru: 'станция, вокзал, время года' },
      { en: 'condition', es: 'la condición', ru: 'условие, состояние' },
      { en: 'tradition', es: 'la tradición', ru: 'традиция' },
      { en: 'situation', es: 'la situación', ru: 'ситуация, положение' },
      { en: 'option', es: 'la opción', ru: 'вариант, опция' },
      { en: 'direction', es: 'la dirección', ru: 'адрес, направление' },
      { en: 'attention', es: 'la atención', ru: 'внимание' }
    ]
  },
  {
    pattern: '-ty → -dad / -tad',
    gender: 'Женский род (la...)',
    englishSuffix: '-ty',
    spanishSuffix: '-dad / -tad',
    description: 'Абстрактные существительные качества на -ty переходят в -dad / -tad и ВСЕГДА женского рода (la).',
    examples: [
      { en: 'city', es: 'la ciudad', ru: 'город' },
      { en: 'reality', es: 'la realidad', ru: 'реальность, действительность' },
      { en: 'university', es: 'la universidad', ru: 'университет' },
      { en: 'liberty / freedom', es: 'la libertad', ru: 'свобода' },
      { en: 'activity', es: 'la actividad', ru: 'деятельность, активность' },
      { en: 'society', es: 'la sociedad', ru: 'общество' },
      { en: 'possibility', es: 'la posibilidad', ru: 'возможность' },
      { en: 'capacity', es: 'la capacity', ru: 'способность, вместимость' },
      { en: 'security / safety', es: 'la seguridad', ru: 'безопасность' },
      { en: 'truth', es: 'la verdad', ru: 'правда, истина' }
    ]
  },
  {
    pattern: '-ous → -oso / -osa',
    gender: 'Прилагательное (m/f)',
    englishSuffix: '-ous',
    spanishSuffix: '-oso / -osa',
    description: 'Прилагательные на -ous переходят в -oso (муж. род) / -osa (жен. род).',
    examples: [
      { en: 'famous', es: 'famoso / famosa', ru: 'знаменитый / знаменитая' },
      { en: 'curious', es: 'curioso / curiosa', ru: 'любопытный / любопытная' },
      { en: 'dangerous', es: 'peligroso / peligrosa', ru: 'опасный / опасная' },
      { en: 'delicious', es: 'delicioso / deliciosa', ru: 'вкусный, восхитительный' },
      { en: 'nervous', es: 'nervioso / nerviosa', ru: 'нервный / взволнованный' },
      { en: 'generous', es: 'generoso / generosa', ru: 'щедрый' },
      { en: 'marvelous', es: 'maravilloso / maravillosa', ru: 'чудесный, великолепный' },
      { en: 'mysterious', es: 'misterioso / misteriosa', ru: 'таинственный, загадочный' }
    ]
  },
  {
    pattern: '-ic / -ical → -ico / -ica',
    gender: 'Прилагательное / Сущ.',
    englishSuffix: '-ic / -ical',
    spanishSuffix: '-ico / -ica',
    description: 'Прилагательные и существительные на -ic/-ical переходят в -ico/-ica с графическим ударением на третий слог с конца.',
    examples: [
      { en: 'basic', es: 'básico / básica', ru: 'базовый, основной' },
      { en: 'magic / magical', es: 'mágico / mágica', ru: 'магический, волшебный' },
      { en: 'romantic', es: 'romántico / romántica', ru: 'романтичный' },
      { en: 'public', es: 'público / pública', ru: 'общественный, публичный' },
      { en: 'automatic', es: 'automático / automática', ru: 'автоматический' },
      { en: 'economic', es: 'económico / económica', ru: 'экономичный, экономический' },
      { en: 'historic / historical', es: 'histórico / histórica', ru: 'исторический' },
      { en: 'typical', es: 'típico / típica', ru: 'типичный' }
    ]
  },
  {
    pattern: '-ly → -mente',
    gender: 'Наречие',
    englishSuffix: '-ly',
    spanishSuffix: '-mente',
    description: 'Наречия образуются добавлением суффикса -mente к женской форме прилагательного (rapida + mente = rápidamente).',
    examples: [
      { en: 'perfectfully / perfectly', es: 'perfectamente', ru: 'идеально, совершенно' },
      { en: 'rapidly / quickly', es: 'rápidamente', ru: 'быстро' },
      { en: 'finally', es: 'finalmente', ru: 'наконец, в конце концов' },
      { en: 'naturally', es: 'naturalmente', ru: 'естественно, конечно' },
      { en: 'normally', es: 'normalmente', ru: 'обычно, нормально' },
      { en: 'really / truly', es: 'realmente', ru: 'действительно, на самом деле' },
      { en: 'exactly', es: 'exactamente', ru: 'точно, именно так' },
      { en: 'simply', es: 'simplemente', ru: 'просто, всего лишь' }
    ]
  },
  {
    pattern: '-ate / -ize → -ar / -izar',
    gender: 'Глагол',
    englishSuffix: '-ate / -ize',
    spanishSuffix: '-ar / -izar',
    description: 'Глаголы латинского происхождения на -ate переходят в -ar, а на -ize переходят в -izar.',
    examples: [
      { en: 'activate', es: 'activar', ru: 'активировать' },
      { en: 'participate', es: 'participar', ru: 'участвовать' },
      { en: 'create', es: 'crear', ru: 'создавать' },
      { en: 'celebrate', es: 'celebrar', ru: 'праздновать, отмечать' },
      { en: 'organize', es: 'organizar', ru: 'организовывать' },
      { en: 'utilize / use', es: 'utilizar', ru: 'использовать' },
      { en: 'memorize', es: 'memorizar', ru: 'запоминать' }
    ]
  }
];

export const FALSE_FRIENDS_GUIDE = [
  {
    spanish: 'embarazada',
    realMeaningRu: 'Беременная',
    looksLikeEn: 'embarrassed (смущённый)',
    correctEnglishEquivalent: 'pregnant',
    howToSayTheFakeMeaning: 'Смущённая / неловко = avergonzada / apenada',
    example: 'Ella está embarazada de cinco meses (Она на пятом месяце беременности).'
  },
  {
    spanish: 'éxito',
    realMeaningRu: 'Успех, триумф, удача',
    looksLikeEn: 'exit (выход)',
    correctEnglishEquivalent: 'success / hit',
    howToSayTheFakeMeaning: 'Выход = salida',
    example: 'El nuevo proyecto fue un gran éxito (Новый проект имел огромный успех).'
  },
  {
    spanish: 'actualmente',
    realMeaningRu: 'В настоящее время, сейчас, в наши дни',
    looksLikeEn: 'actually (на самом деле)',
    correctEnglishEquivalent: 'currently / nowadays',
    howToSayTheFakeMeaning: 'На самом деле / вообще-то = en realidad / de hecho',
    example: 'Actualmente vivo en Madrid (В настоящее время я живу в Мадриде).'
  },
  {
    spanish: 'actual',
    realMeaningRu: 'Текущий, современный, настоящий (по времени)',
    looksLikeEn: 'actual (реальный, фактический)',
    correctEnglishEquivalent: 'current / present-day',
    howToSayTheFakeMeaning: 'Реальный / фактический = real / verdadero',
    example: 'La situación actual del país (Текущая ситуация в стране).'
  },
  {
    spanish: 'librería',
    realMeaningRu: 'Книжный магазин',
    looksLikeEn: 'library (библиотека)',
    correctEnglishEquivalent: 'bookstore',
    howToSayTheFakeMeaning: 'Библиотека = biblioteca',
    example: 'Compré este libro en la librería del centro (Я купил эту книгу в книжном магазине в центре).'
  },
  {
    spanish: 'carpeta',
    realMeaningRu: 'Папка, скоросшиватель, портфель для документов',
    looksLikeEn: 'carpet (ковёр)',
    correctEnglishEquivalent: 'folder / binder',
    howToSayTheFakeMeaning: 'Ковёр = alfombra',
    example: 'Guarda los documentos en la carpeta azul (Сохрани документы в синей папке).'
  },
  {
    spanish: 'constipado',
    realMeaningRu: 'Простуженный, с насморком / заложенным носом',
    looksLikeEn: 'constipated (страдающий запором)',
    correctEnglishEquivalent: 'having a cold',
    howToSayTheFakeMeaning: 'Страдающий запором = estreñido',
    example: 'No voy al trabajo porque estoy muy constipado (Я не иду на работу, потому что сильно простужен).'
  },
  {
    spanish: 'realizar',
    realMeaningRu: 'Выполнять, осуществлять, делать, воплощать',
    looksLikeEn: 'realize (осознавать, понимать)',
    correctEnglishEquivalent: 'to carry out / perform / accomplish',
    howToSayTheFakeMeaning: 'Осознавать / понимать = darse cuenta de / comprender',
    example: 'Vamos a realizar una investigación (Мы проведём исследование).'
  },
  {
    spanish: 'recordar',
    realMeaningRu: 'Помнить, вспоминать, напоминать',
    looksLikeEn: 'record (записывать аудио/видео)',
    correctEnglishEquivalent: 'to remember / recall',
    howToSayTheFakeMeaning: 'Записывать аудио/видео = grabar',
    example: 'No recuerdo su número de teléfono (Я не помню его номер телефона).'
  },
  {
    spanish: 'sensible',
    realMeaningRu: 'Чувствительный, ранимый, восприимчивый',
    looksLikeEn: 'sensible (разумный, здравомыслящий)',
    correctEnglishEquivalent: 'sensitive',
    howToSayTheFakeMeaning: 'Разумный / здравомыслящий = sensato / razonable',
    example: 'Es una persona muy sensible a la música (Он очень тонко чувствует музыку).'
  },
  {
    spanish: 'pretender',
    realMeaningRu: 'Намереваться, стремиться, претендовать',
    looksLikeEn: 'pretend (притворяться)',
    correctEnglishEquivalent: 'to aim / intend / claim',
    howToSayTheFakeMeaning: 'Притворяться = fingir',
    example: 'No pretendo ofenderte (Я не намереваюсь тебя обидеть).'
  },
  {
    spanish: 'asistir',
    realMeaningRu: 'Присутствовать, посещать (мероприятие, уроки)',
    looksLikeEn: 'assist (помогать)',
    correctEnglishEquivalent: 'to attend',
    howToSayTheFakeMeaning: 'Помогать = ayudar',
    example: 'Voy a asistir a la conferencia mañana (Я буду присутствовать на конференции завтра).'
  },
  {
    spanish: 'aviso',
    realMeaningRu: 'Предупреждение, объявление, уведомление',
    looksLikeEn: 'advice (совет)',
    correctEnglishEquivalent: 'notice / warning / announcement',
    howToSayTheFakeMeaning: 'Совет = consejo',
    example: 'Hay un aviso importante en la entrada (На входе висит важное объявление).'
  },
  {
    spanish: 'largo',
    realMeaningRu: 'Длинный (по размеру/времени)',
    looksLikeEn: 'large (большой)',
    correctEnglishEquivalent: 'long',
    howToSayTheFakeMeaning: 'Большой = grande',
    example: 'Fue un viaje muy largo (Это была очень длинная поездка).'
  },
  {
    spanish: 'molestar',
    realMeaningRu: 'Беспокоить, мешать, раздражать',
    looksLikeEn: 'molest (домогаться)',
    correctEnglishEquivalent: 'to bother / disturb',
    howToSayTheFakeMeaning: 'Домогаться = acosar / agredir',
    example: 'Perdón por molestar a esta hora (Извините, что беспокою в такой час).'
  },
  {
    spanish: 'sano',
    realMeaningRu: 'Здоровый (полезный для здоровья / не больной)',
    looksLikeEn: 'sane (здравомыслящий)',
    correctEnglishEquivalent: 'healthy',
    howToSayTheFakeMeaning: 'Здравомыслящий / в здравом уме = cuerdo / sensato',
    example: 'Comer fruta es muy sano (Есть фрукты — это очень полезно для здоровья).'
  },
  {
    spanish: 'ropa',
    realMeaningRu: 'Одежда',
    looksLikeEn: 'rope (верёвка)',
    correctEnglishEquivalent: 'clothes / clothing',
    howToSayTheFakeMeaning: 'Верёвка = cuerda',
    example: 'Compré ropa nueva para el verano (Я купил новую одежду на лето).'
  },
  {
    spanish: 'sopa',
    realMeaningRu: 'Суп',
    looksLikeEn: 'soap (мыло)',
    correctEnglishEquivalent: 'soup',
    howToSayTheFakeMeaning: 'Мыло = jabón',
    example: 'La sopa de verduras está deliciosa (Овощной суп очень вкусный).'
  },
  {
    spanish: 'pariente',
    realMeaningRu: 'Родственник (любой родственник)',
    looksLikeEn: 'parent (родитель)',
    correctEnglishEquivalent: 'relative',
    howToSayTheFakeMeaning: 'Родители (мама и папа) = padres',
    example: 'Muchos parientes vinieron a la fiesta (Многие родственники пришли на праздник).'
  }
];

export const COGNATE_DRILL_QUESTIONS = [
  // --- SUB-CATEGORY 1: Suffix Transformation (-tion -> -ción) ---
  {
    id: 'cg-1',
    category: 'suffixes',
    subType: 'tion_to_cion',
    pattern: '-tion → -ción (la...)',
    prompt: 'Как будет по-испански «Информация» (англ. Information)?',
    englishClue: 'Information (-tion → -ción, женский род)',
    correctAnswer: 'la información',
    acceptableAnswers: ['la información', 'información', 'informacion', 'la informacion'],
    options: ['la información', 'el información', 'la informidad', 'el informoso'],
    explanation: 'Английские слова на -tion переводятся в -ción и ВСЕГДА женского рода с артиклем la: la información.',
    exampleSentence: 'Necesito más información sobre el curso (Мне нужно больше информации о курсе).'
  },
  {
    id: 'cg-2',
    category: 'suffixes',
    subType: 'tion_to_cion',
    pattern: '-tion → -ción (la...)',
    prompt: 'Как будет по-испански «Станция / Вокзал / Сезон года» (англ. Station)?',
    englishClue: 'Station (-tion → -ción, женский род)',
    correctAnswer: 'la estación',
    acceptableAnswers: ['la estación', 'estación', 'estacion', 'la estacion'],
    options: ['la estación', 'el estación', 'la estatad', 'el estacioso'],
    explanation: 'Station ➔ la estación (la estación de tren = вокзал; las cuatro estaciones = четыре времени года).',
    exampleSentence: 'El tren llega a la estación central (Поезд прибывает на центральный вокзал).'
  },
  {
    id: 'cg-3',
    category: 'suffixes',
    subType: 'tion_to_cion',
    pattern: '-tion → -ción (la...)',
    prompt: 'Как будет по-испански «Традиция» (англ. Tradition)?',
    englishClue: 'Tradition (-tion → -ción)',
    correctAnswer: 'la tradición',
    acceptableAnswers: ['la tradición', 'tradición', 'tradicion', 'la tradicion'],
    options: ['la tradición', 'el tradición', 'la tradicidad', 'el tradicioso'],
    explanation: 'Tradition ➔ la tradición. Существительные на -ción всегда женского рода (la tradición familiar).',
    exampleSentence: 'Es una tradición muy antigua en España (Это очень древняя традиция в Испании).'
  },

  // --- SUB-CATEGORY 2: Suffix Transformation (-ty -> -dad) ---
  {
    id: 'cg-4',
    category: 'suffixes',
    subType: 'ty_to_dad',
    pattern: '-ty → -dad / -tad (la...)',
    prompt: 'Как будет по-испански «Город» (англ. City / лат. Civitas)?',
    englishClue: 'City (-ty → -dad, женский род)',
    correctAnswer: 'la ciudad',
    acceptableAnswers: ['la ciudad', 'ciudad'],
    options: ['la ciudad', 'el ciudad', 'la ciución', 'el ciudoso'],
    explanation: 'Суффикс -ty переходит в -dad: City / Civitas ➔ la ciudad (женский род: una ciudad hermosa).',
    exampleSentence: 'Buenos Aires es una gran ciudad (Буэнос-Айрес — прекрасный большой город).'
  },
  {
    id: 'cg-5',
    category: 'suffixes',
    subType: 'ty_to_dad',
    pattern: '-ty → -dad / -tad (la...)',
    prompt: 'Как будет по-испански «Реальность / Действительность» (англ. Reality)?',
    englishClue: 'Reality (-ty → -dad, женский род)',
    correctAnswer: 'la realidad',
    acceptableAnswers: ['la realidad', 'realidad'],
    options: ['la realidad', 'el realidad', 'la realición', 'el realoso'],
    explanation: 'Reality ➔ la realidad. Все слова на -dad женского рода: en realidad = на самом деле.',
    exampleSentence: 'La realidad es muy diferente (Реальность совсем другая).'
  },
  {
    id: 'cg-6',
    category: 'suffixes',
    subType: 'ty_to_dad',
    pattern: '-ty → -dad / -tad (la...)',
    prompt: 'Как будет по-испански «Университет» (англ. University)?',
    englishClue: 'University (-ty → -dad, женский род)',
    correctAnswer: 'la universidad',
    acceptableAnswers: ['la universidad', 'universidad'],
    options: ['la universidad', 'el universidad', 'la universición', 'el universoso'],
    explanation: 'University ➔ la universidad (estudiar en la universidad).',
    exampleSentence: 'Estudio medicina en la universidad (Я изучаю медицину в университете).'
  },

  // --- SUB-CATEGORY 3: Suffix Transformation (-ous -> -oso) ---
  {
    id: 'cg-7',
    category: 'suffixes',
    subType: 'ous_to_oso',
    pattern: '-ous → -oso / -osa',
    prompt: 'Как сказать «Знаменитый / Известный» (англ. Famous)?',
    englishClue: 'Famous (-ous → -oso)',
    correctAnswer: 'famoso',
    acceptableAnswers: ['famoso', 'famosa', 'famoso / famosa'],
    options: ['famoso', 'famición', 'famidad', 'famente'],
    explanation: 'Прилагательные на -ous становятся -oso (муж. род) или -osa (жен. род): Famous ➔ famoso / famosa.',
    exampleSentence: 'Es un actor muy famoso en todo el mundo (Он очень знаменитый актёр во всём мире).'
  },
  {
    id: 'cg-8',
    category: 'suffixes',
    subType: 'ous_to_oso',
    pattern: '-ous → -oso / -osa',
    prompt: 'Как сказать «Опасный» (англ. Dangerous)?',
    englishClue: 'Dangerous (danger + -ous → peligro + -oso)',
    correctAnswer: 'peligroso',
    acceptableAnswers: ['peligroso', 'peligrosa', 'peligroso / peligrosa'],
    options: ['peligroso', 'peligración', 'peligridad', 'peligromente'],
    explanation: 'Суффикс -ous превращается в -oso: peligro (опасность) + -oso = peligroso (опасный).',
    exampleSentence: 'Es una calle muy peligrosa por la noche (Это очень опасная улица ночью).'
  },
  {
    id: 'cg-9',
    category: 'suffixes',
    subType: 'ous_to_oso',
    pattern: '-ous → -oso / -osa',
    prompt: 'Как сказать «Вкусный / Восхитительный» (англ. Delicious)?',
    englishClue: 'Delicious (-ous → -oso)',
    correctAnswer: 'delicioso',
    acceptableAnswers: ['delicioso', 'deliciosa', 'delicioso / deliciosa'],
    options: ['delicioso', 'delicición', 'delicidad', 'deliciomente'],
    explanation: 'Delicious ➔ delicioso / deliciosa (La comida está deliciosa).',
    exampleSentence: 'Esta paella está deliciosa (Эта паэлья безумно вкусная).'
  },

  // --- SUB-CATEGORY 4: Suffix Transformation (-ic -> -ico, -ly -> -mente) ---
  {
    id: 'cg-10',
    category: 'suffixes',
    subType: 'ic_to_ico',
    pattern: '-ic → -ico / -ica',
    prompt: 'Как сказать «Базовый / Основной» (англ. Basic)?',
    englishClue: 'Basic (-ic → -ico, ударение на á: básico)',
    correctAnswer: 'básico',
    acceptableAnswers: ['básico', 'basico', 'básica', 'basica'],
    options: ['básico', 'basion', 'basidad', 'basoso'],
    explanation: 'Слова на -ic становятся -ico с ударением на третий слог с конца: Basic ➔ básico.',
    exampleSentence: 'Es un vocabulario básico para viajar (Это базовый словарный запас для путешествий).'
  },
  {
    id: 'cg-11',
    category: 'suffixes',
    subType: 'ly_to_mente',
    pattern: '-ly → -mente',
    prompt: 'Как сказать «Идеально / Совершенно» (англ. Perfectly)?',
    englishClue: 'Perfect (perfecta) + -ly (-mente)',
    correctAnswer: 'perfectamente',
    acceptableAnswers: ['perfectamente'],
    options: ['perfectamente', 'perfectoso', 'la perfección', 'perfectidad'],
    explanation: 'Наречия на -ly в испанском образуются добавлением -mente к женской форме прилагательного: perfecta + mente = perfectamente.',
    exampleSentence: 'Hablo y entiendo perfectamente (Я идеально говорю и понимаю).'
  },
  {
    id: 'cg-12',
    category: 'suffixes',
    subType: 'ly_to_mente',
    pattern: '-ly → -mente',
    prompt: 'Как сказать «Быстро» (англ. Rapidly / Quickly)?',
    englishClue: 'Rápida + -mente',
    correctAnswer: 'rápidamente',
    acceptableAnswers: ['rápidamente', 'rapidamente'],
    options: ['rápidamente', 'rapididad', 'rapidición', 'rapidoso'],
    explanation: 'Rápida + -mente = rápidamente (сохраняет графическое ударение исходного прилагательного).',
    exampleSentence: 'El tiempo pasa muy rápidamente (Время проходит очень быстро).'
  },

  // --- SUB-CATEGORY 5: False Friends & Traps (Ложные друзья) ---
  {
    id: 'cg-13',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: embarazada',
    prompt: 'Что на самом деле означает испанское слово «embarazada»?',
    englishClue: 'Внимание: это НЕ embarrassed (смущённая)!',
    correctAnswer: 'Беременная',
    options: ['Беременная', 'Смущённая / неловкая', 'Занятая делами', 'Влюблённая'],
    explanation: '🚨 Ловушка №1 в испанском! Embarazada = беременная (pregnant). А «смущённая / пристыженная» по-испански будет avergonzada или apenada.',
    exampleSentence: 'Mi hermana está embarazada y espera un bebé (Моя сестра беременна и ждёт ребёнка).'
  },
  {
    id: 'cg-14',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: éxito',
    prompt: 'Что означает испанское слово «el éxito»?',
    englishClue: 'Внимание: это НЕ exit (выход)!',
    correctAnswer: 'Успех, удача, триумф',
    options: ['Успех, удача, триумф', 'Выход из здания', 'Конечная остановка', 'Побег из тюрьмы'],
    explanation: '🚨 Éxito = успех (success / hit). Слово «выход» (exit) по-испански — это salida!',
    exampleSentence: '¡Te deseo mucho éxito en tu nuevo trabajo! (Желаю тебе больших успехов на новой работе!).'
  },
  {
    id: 'cg-15',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: actualmente',
    prompt: 'Что означает испанское наречие «actualmente»?',
    englishClue: 'Внимание: это НЕ actually (на самом деле)!',
    correctAnswer: 'В настоящее время / сейчас',
    options: ['В настоящее время / сейчас', 'На самом деле / фактически', 'Актуально и модно', 'Почти наверняка'],
    explanation: '🚨 Actualmente = в настоящее время, в наши дни (currently / nowadays). «На самом деле» (actually) по-испански — это en realidad или de hecho!',
    exampleSentence: 'Actualmente vivo en Madrid (В настоящее время я живу в Мадриде).'
  },
  {
    id: 'cg-16',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: la librería',
    prompt: 'Что такое «la librería» в испанском городе?',
    englishClue: 'Внимание: это НЕ library (библиотека)!',
    correctAnswer: 'Книжный магазин',
    options: ['Книжный магазин', 'Городская библиотека', 'Книжный шкаф', 'Газетный киоск'],
    explanation: '🚨 Librería = книжный магазин (bookstore). А бесплатная городская «библиотека» (library) — это la biblioteca!',
    exampleSentence: 'Voy a la librería a comprar una novela (Я иду в книжный магазин купить роман).'
  },
  {
    id: 'cg-17',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: la carpeta',
    prompt: 'Что означает слово «la carpeta»?',
    englishClue: 'Внимание: это НЕ carpet (ковёр)!',
    correctAnswer: 'Папка для документов / скоросшиватель',
    options: ['Папка для документов / скоросшиватель', 'Напольный ковёр', 'Скатерть на столе', 'Шторы на окне'],
    explanation: '🚨 Carpeta = папка / скоросшиватель (folder / binder). А «ковёр» (carpet) по-испански — это la alfombra!',
    exampleSentence: 'Tengo todos los documentos en esta carpeta (Все документы у меня в этой папке).'
  },
  {
    id: 'cg-18',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: constipado',
    prompt: 'Что имеет в виду испанец, говоря: «Estoy muy constipado»?',
    englishClue: 'Внимание: это НЕ constipated (запор)!',
    correctAnswer: 'Я сильно простужен (у меня насморк / заложен нос)',
    options: [
      'Я сильно простужен (у меня насморк / заложен нос)',
      'У меня проблемы с пищеварением (запор)',
      'Я очень устал от работы',
      'Я сильно замёрз на улице'
    ],
    explanation: '🚨 Constipado = простуженный, с насморком (having a cold). Запор по-испански называется estreñimiento (estar estreñido).',
    exampleSentence: 'Hoy no voy a clase porque estoy constipado (Сегодня я не пойду на занятия, потому что простужен).'
  },
  {
    id: 'cg-19',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: realizar',
    prompt: 'Что означает испанский глагол «realizar»?',
    englishClue: 'Внимание: это НЕ realize (осознать/понять)!',
    correctAnswer: 'Осуществлять, выполнять, проводить (делать)',
    options: ['Осуществлять, выполнять, проводить (делать)', 'Осознавать и понимать суть', 'Реалистично рисовать', 'Сравнивать цены'],
    explanation: '🚨 Realizar = выполнять / осуществлять (to carry out, perform). А «осознать / понять» (realize) — это darse cuenta de!',
    exampleSentence: 'El equipo va a realizar el proyecto este mes (Команда выполнит проект в этом месяце).'
  },
  {
    id: 'cg-20',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: recordar',
    prompt: 'Что означает испанский глагол «recordar»?',
    englishClue: 'Внимание: это НЕ record (записывать видео/звук)!',
    correctAnswer: 'Помнить, вспоминать, напоминать',
    options: ['Помнить, вспоминать, напоминать', 'Записывать на диктофон или камеру', 'Устанавливать мировой рекорд', 'Повторять вслух'],
    explanation: '🚨 Recordar = помнить, вспоминать (to remember). А «записывать аудио/видео» (record) — это grabar!',
    exampleSentence: '¿Recuerdas dónde dejamos las llaves? (Ты помнишь, где мы оставили ключи?).'
  },
  {
    id: 'cg-21',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: sensible',
    prompt: 'Если человека называют «sensible», какой он?',
    englishClue: 'Внимание: это НЕ sensible (разумный/рассудительный)!',
    correctAnswer: 'Чувствительный, ранимый, тонко чувствующий',
    options: ['Чувствительный, ранимый, тонко чувствующий', 'Рассудительный и благоразумный', 'Бессердечный и строгий', 'Сенсационный и популярный'],
    explanation: '🚨 Sensible = чувствительный (sensitive). А «разумный / благоразумный» (sensible) — это sensato или razonable!',
    exampleSentence: 'Es un chico muy sensible y cariñoso (Он очень чувствительный и заботливый парень).'
  },
  {
    id: 'cg-22',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: asistir',
    prompt: 'Что означает фраза: «Voy a asistir a la reunión»?',
    englishClue: 'Внимание: это НЕ assist (помогать)!',
    correctAnswer: 'Я буду присутствовать на собрании (посещу его)',
    options: ['Я буду присутствовать на собрании (посещу его)', 'Я помогу организовать собрание', 'Я ассистирую директору', 'Я отменю собрание'],
    explanation: '🚨 Asistir a... = присутствовать / посещать мероприятие (to attend). А «помогать» (assist) — это ayudar!',
    exampleSentence: 'Todos los estudiantes deben asistir a la clase (Все студенты должны присутствовать на занятии).'
  },
  {
    id: 'cg-23',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: el aviso',
    prompt: 'Что такое «el aviso»?',
    englishClue: 'Внимание: это НЕ advice (совет)!',
    correctAnswer: 'Предупреждение, объявление, извещение',
    options: ['Предупреждение, объявление, извещение', 'Полезный дружеский совет', 'Авиабилет', 'Платный обзор'],
    explanation: '🚨 Aviso = объявление / предупреждение (warning / notice). «Совет» (advice) по-испански — это el consejo!',
    exampleSentence: 'Pon atención al aviso en la pantalla (Обрати внимание на объявление на экране).'
  },
  {
    id: 'cg-24',
    category: 'false_friends',
    subType: 'trap',
    pattern: '🚨 Ложный друг: la ropa',
    prompt: 'Что означает испанское слово «la ropa»?',
    englishClue: 'Внимание: это НЕ rope (верёвка)!',
    correctAnswer: 'Одежда',
    options: ['Одежда', 'Верёвка / канат', 'Халат для ванны', 'Старая тряпка'],
    explanation: '🚨 Ropa = одежда (clothes). А «верёвка» (rope) по-испански — это la cuerda!',
    exampleSentence: 'Tengo que lavar la ropa sucia (Мне нужно постирать грязную одежду).'
  }
];
