/**
 * English Grammar Theory & Interactive Rule Data
 * Provides structured educational rule explanations, SVG infographics,
 * conjugation tables, dialectal notes (British vs American), and AI tutor prompts
 * for the foundational A1 English topics.
 */

export const ENGLISH_TOPIC_THEORIES = {
  // Topic ID 1: Verb "to be" (am/is/are)
  1: {
    topicId: 1,
    topicName: 'Verb "to be" (am/is/are)',
    level: 'A1',
    category: 'Grammar',
    russianTitle: 'Глагол "to be" (быть / являться / находиться)',
    summaryRu: 'Глагол "to be" — основа английского языка. Он используется для описания состояния, профессии, возраста, национальности и местоположения. В отличие от русского языка, в настоящем времени он никогда не опускается.',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
      <rect width="700" height="240" rx="14" fill="#0f172a" />
      <text x="350" y="28" fill="#38bdf8" font-size="16" font-weight="bold" text-anchor="middle">THE VERB "TO BE" IN PRESENT SIMPLE</text>
      
      <!-- Box 1: I am -->
      <rect x="30" y="55" width="200" height="155" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
      <rect x="30" y="55" width="200" height="35" rx="10" fill="#0284c7"/>
      <text x="130" y="78" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">1st Person (I)</text>
      <text x="130" y="115" fill="#38bdf8" font-size="22" font-weight="900" text-anchor="middle">I AM</text>
      <text x="130" y="145" fill="#94a3b8" font-size="13" text-anchor="middle">Сокращение: I\'m</text>
      <text x="130" y="175" fill="#e2e8f0" font-size="12" font-weight="bold" text-anchor="middle">I am a student.</text>

      <!-- Box 2: He / She / It is -->
      <rect x="250" y="55" width="200" height="155" rx="10" fill="#1e293b" stroke="#a855f7" stroke-width="2"/>
      <rect x="250" y="55" width="200" height="35" rx="10" fill="#7e22ce"/>
      <text x="350" y="78" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">3rd Person Singular</text>
      <text x="350" y="115" fill="#c084fc" font-size="22" font-weight="900" text-anchor="middle">HE / SHE / IT IS</text>
      <text x="350" y="145" fill="#94a3b8" font-size="13" text-anchor="middle">He\'s / She\'s / It\'s</text>
      <text x="350" y="175" fill="#e2e8f0" font-size="12" font-weight="bold" text-anchor="middle">She is happy.</text>

      <!-- Box 3: You / We / They are -->
      <rect x="470" y="55" width="200" height="155" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
      <rect x="470" y="55" width="200" height="35" rx="10" fill="#047857"/>
      <text x="570" y="78" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">Plural & You</text>
      <text x="570" y="115" fill="#34d399" font-size="22" font-weight="900" text-anchor="middle">YOU / WE / THEY ARE</text>
      <text x="570" y="145" fill="#94a3b8" font-size="13" text-anchor="middle">You\'re / We\'re / They\'re</text>
      <text x="570" y="175" fill="#e2e8f0" font-size="12" font-weight="bold" text-anchor="middle">They are friends.</text>
    </svg>`,
    sections: [
      {
        title: '1. Формы глагола to be в настоящем времени',
        content: 'Глагол to be имеет три формы в Present Simple: **am** (для I), **is** (для he, she, it), и **are** (для you, we, they). В разговорной речи почти всегда используются краткие формы: *I am -> I\'m, She is -> She\'s, We are -> We\'re*.'
      },
      {
        title: '2. Отрицания и Вопросы',
        content: 'Отрицание образуется добавлением частицы **not**: *is not = isn\'t, are not = aren\'t, I am not = I\'m not*. Для вопроса глагол to be выносится на первое место перед подлежащим: *Are you ready? Is he at home?*'
      }
    ],
    tables: [
      {
        title: 'Спряжение глагола to be',
        headers: ['Местоимение', 'Утверждение', 'Краткая форма', 'Отрицание', 'Вопрос'],
        rows: [
          ['I', 'I am', 'I\'m', 'I\'m not', 'Am I?'],
          ['You', 'You are', 'You\'re', 'You aren\'t', 'Are you?'],
          ['He / She / It', 'He is', 'He\'s', 'He isn\'t', 'Is he?'],
          ['We', 'We are', 'We\'re', 'We aren\'t', 'Are we?'],
          ['They', 'They are', 'They\'re', 'They aren\'t', 'Are they?']
        ]
      }
    ],
    examples: [
      { en: 'I am a software engineer.', ru: 'Я инженер-программист.', note: 'Профессия' },
      { en: 'She is at the office today.', ru: 'Она сегодня в офисе.', note: 'Местоположение' },
      { en: 'They are very friendly people.', ru: 'Они очень дружелюбные люди.', note: 'Качество' },
      { en: 'Are you ready for the meeting?', ru: 'Ты готов к встрече?', note: 'Вопрос' }
    ],
    dialectNotes: 'В британском и американском английском формы глагола совпадают. В неформальном американском сленге часто встречается разговорное *ain\'t* (вместо am not / isn\'t / aren\'t), но в грамотной речи оно не используется.',
    commonMistakes: [
      'Пропуск глагола to be: ❌ *I student* -> ✅ *I am a student*. В английском предложение не может существовать без глагола-связки!',
      'Путаница между it\'s (сокращение it is) и its (притяжательное "его/ее для предметов"): ❌ *Its cold* -> ✅ *It\'s cold*.'
    ],
    tutorQuickPrompts: [
      'Объясни разницу между краткой и полной формой глагола to be',
      'Приведи 5 примеров вопросов с глаголом to be',
      'Проверь меня: дай 3 предложения с пропусками'
    ]
  },

  // Topic ID 2: Present Simple (positive)
  2: {
    topicId: 2,
    topicName: 'Present Simple (positive)',
    level: 'A1',
    category: 'Grammar',
    russianTitle: 'Present Simple: Утвердительные предложения',
    summaryRu: 'Present Simple выражает постоянные действия, привычки, расписание и научные факты. Главное правило — окончание -s/-es для 3-го лица единственного числа (he, she, it).',
    visualSvg: `<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
      <rect width="700" height="220" rx="14" fill="#0f172a" />
      <text x="350" y="28" fill="#10b981" font-size="16" font-weight="bold" text-anchor="middle">PRESENT SIMPLE: POSITIVE SENTENCES</text>
      
      <!-- Group 1: I, You, We, They -->
      <rect x="40" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
      <text x="185" y="85" fill="#38bdf8" font-size="16" font-weight="bold" text-anchor="middle">I / YOU / WE / THEY</text>
      <text x="185" y="118" fill="#ffffff" font-size="20" font-weight="900" text-anchor="middle">VERB (Base Form)</text>
      <text x="185" y="150" fill="#94a3b8" font-size="13" text-anchor="middle">work / live / play / eat</text>
      <text x="185" y="172" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">"We work in London."</text>

      <!-- Group 2: He, She, It -->
      <rect x="370" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
      <text x="515" y="85" fill="#f59e0b" font-size="16" font-weight="bold" text-anchor="middle">HE / SHE / IT</text>
      <text x="515" y="118" fill="#fbbf24" font-size="20" font-weight="900" text-anchor="middle">VERB + -S / -ES</text>
      <text x="515" y="150" fill="#94a3b8" font-size="13" text-anchor="middle">works / lives / plays / watches</text>
      <text x="515" y="172" fill="#fbbf24" font-size="12" font-weight="bold" text-anchor="middle">"She works in London."</text>
    </svg>`,
    sections: [
      {
        title: '1. Правило окончания -s / -es',
        content: 'Для местоимений *he, she, it* к глаголу добавляется **-s** (*work -> works*). Если глагол оканчивается на *-ss, -sh, -ch, -x, -o*, добавляется **-es** (*watch -> watches, go -> goes*). Если оканчивается на согласную + y, y меняется на **-ies** (*study -> studies*).'
      }
    ],
    tables: [
      {
        title: 'Примеры добавления окончаний в 3-м лице',
        headers: ['Тип глагола', 'Базовая форма (I/You/We/They)', '3-е лицо (He/She/It)', 'Пример предложения'],
        rows: [
          ['Стандартный', 'speak', 'speaks', 'He speaks fluent English.'],
          ['На -ch / -sh / -ss', 'watch', 'watches', 'She watches the news.'],
          ['На согласную + y', 'fly / study', 'flies / studies', 'He studies medicine.'],
          ['Исключение have', 'have', 'has', 'She has a car.']
        ]
      }
    ],
    examples: [
      { en: 'I drink coffee every morning.', ru: 'Я пью кофе каждое утро.', note: 'Привычка' },
      { en: 'He lives in New York.', ru: 'Он живет в Нью-Йорке.', note: 'Постоянное состояние' },
      { en: 'The train leaves at 8:00 AM.', ru: 'Поезд отправляется в 8:00.', note: 'Расписание' }
    ],
    dialectNotes: 'В английском языке маркеры частоты (always, usually, often, sometimes, never) обычно ставятся ПЕРЕД основным глаголом (*She always arrives early*), но ПОСЛЕ глагола to be (*She is always on time*).',
    commonMistakes: [
      'Забывание окончания -s у 3-го лица: ❌ *He like pizza* -> ✅ *He likes pizza*.',
      'Добавление окончания -s к другим лицам: ❌ *They works here* -> ✅ *They work here*.'
    ],
    tutorQuickPrompts: [
      'Когда добавляется -es вместо -s?',
      'Приведи примеры со словами always, often, rarely',
      'Дай мне 3 упражнения на глаголы 3-го лица'
    ]
  },

  // Topic ID 3: Present Simple (negative & questions)
  3: {
    topicId: 3,
    topicName: 'Present Simple (negative & questions)',
    level: 'A1',
    category: 'Grammar',
    russianTitle: 'Present Simple: Отрицания и Вопросы (do / does)',
    summaryRu: 'Для образования отрицаний и вопросов в Present Simple используются вспомогательные глаголы DO (I/you/we/they) и DOES (he/she/it). Основной главол при этом всегда возвращается в базовую форму без окончания -s!',
    visualSvg: `<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
      <rect width="700" height="220" rx="14" fill="#0f172a" />
      <text x="350" y="28" fill="#f43f5e" font-size="16" font-weight="bold" text-anchor="middle">NEGATIVES & QUESTIONS: DO / DOES</text>
      
      <!-- Negatives -->
      <rect x="40" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#f43f5e" stroke-width="2"/>
      <text x="185" y="85" fill="#fb7185" font-size="15" font-weight="bold" text-anchor="middle">NEGATIVES (don\'t / doesn\'t)</text>
      <text x="185" y="115" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">I / We -> DON\'T + Base</text>
      <text x="185" y="140" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">He / She -> DOESN\'T + Base</text>
      <text x="185" y="170" fill="#94a3b8" font-size="12" text-anchor="middle">"She doesn\'t like tea." (no -s!)</text>

      <!-- Questions -->
      <rect x="370" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
      <text x="515" y="85" fill="#38bdf8" font-size="15" font-weight="bold" text-anchor="middle">QUESTIONS (Do / Does)</text>
      <text x="515" y="115" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">DO + you/they + Base?</text>
      <text x="515" y="140" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">DOES + he/she + Base?</text>
      <text x="515" y="170" fill="#94a3b8" font-size="12" text-anchor="middle">"Does he live here?"</text>
    </svg>`,
    sections: [
      {
        title: '1. Отрицания: don\'t и doesn\'t',
        content: 'Отрицание строится по схеме: **Подлежащее + don\'t / doesn\'t + базовый глагол**. Запомните: как только появляется *doesn\'t*, глагол теряет окончание -s (*She doesn\'t know*, а НЕ *She doesn\'t knows*).'
      },
      {
        title: '2. Вопросы: Do и Does',
        content: 'Общие вопросы строятся выносом **Do / Does** на первое место: *Do you speak English? Does she work here?*. Специальные вопросы добавляют вопросительное слово в начало: *Where do you live? Why does he study Spanish?*'
      }
    ],
    tables: [
      {
        title: 'Схема вопросов и ответов',
        headers: ['Вопрос', 'Краткий утвердительный ответ', 'Краткий отрицательный ответ'],
        rows: [
          ['Do you like coffee?', 'Yes, I do.', 'No, I don\'t.'],
          ['Does he speak Spanish?', 'Yes, he does.', 'No, he doesn\'t.'],
          ['Do they work on Sundays?', 'Yes, they do.', 'No, they don\'t.']
        ]
      }
    ],
    examples: [
      { en: 'I don\'t understand this rule.', ru: 'Я не понимаю это правило.', note: 'Отрицание с I' },
      { en: 'He doesn\'t watch television.', ru: 'Он не смотрит телевизор.', note: 'Отрицание с he' },
      { en: 'Do you live in this city?', ru: 'Ты живешь в этом городе?', note: 'Общий вопрос' },
      { en: 'Where does she work?', ru: 'Где она работает?', note: 'Специальный вопрос' }
    ],
    dialectNotes: 'В разговорной речи do not и does not почти всегда сокращаются до don\'t и doesn\'t.',
    commonMistakes: [
      'Сохранение окончания -s при наличии doesn\'t: ❌ *He doesn\'t works* -> ✅ *He doesn\'t work*.',
      'Забывание вспомогательного глагола в вопросах: ❌ *You live here?* -> ✅ *Do you live here?*'
    ],
    tutorQuickPrompts: [
      'Почему в "Does she like" нет окончания -s?',
      'Как составить специальный вопрос со словом Why?',
      'Дай мне 3 упражнения на перевод вопросов'
    ]
  },

  // Topic ID 4: Articles (a/an/the)
  4: {
    topicId: 4,
    topicName: 'Articles (a/an/the)',
    level: 'A1',
    category: 'Grammar',
    russianTitle: 'Артикли (a / an / the / нулевой артикль)',
    summaryRu: 'Артикль указывает на определенность или неопределенность предмета. "A / An" используется с исчисляемыми существительными в единственном числе при первом упоминании. "The" используется, когда предмет конкретный или уникальный.',
    visualSvg: `<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
      <rect width="700" height="220" rx="14" fill="#0f172a" />
      <text x="350" y="28" fill="#eab308" font-size="16" font-weight="bold" text-anchor="middle">ARTICLES: A / AN vs THE</text>
      
      <!-- A / AN -->
      <rect x="40" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#eab308" stroke-width="2"/>
      <text x="185" y="85" fill="#facc15" font-size="15" font-weight="bold" text-anchor="middle">INDEFINITE (A / AN)</text>
      <text x="185" y="115" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">A + согласный звук (a book)</text>
      <text x="185" y="140" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">AN + гласный звук (an apple)</text>
      <text x="185" y="170" fill="#94a3b8" font-size="12" text-anchor="middle">Один из многих / первое упоминание</text>

      <!-- THE -->
      <rect x="370" y="55" width="290" height="135" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
      <text x="515" y="85" fill="#60a5fa" font-size="15" font-weight="bold" text-anchor="middle">DEFINITE (THE)</text>
      <text x="515" y="115" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">Конкретный, известный предмет</text>
      <text x="515" y="140" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">Уникальные объекты (the sun, the sky)</text>
      <text x="515" y="170" fill="#94a3b8" font-size="12" text-anchor="middle">"Pass me the salt, please."</text>
    </svg>`,
    sections: [
      {
        title: '1. Разница между A и AN',
        content: 'Выбор между **a** и **an** зависит от **звука**, с которого начинается следующее слово: перед согласным звуком ставится **a** (*a car, a house, a university* — звук [j]), перед гласным звуком ставится **an** (*an apple, an hour* — немая h).'
      },
      {
        title: '2. Определенный артикль THE',
        content: '**The** используется, когда собеседникам точно понятно, о каком именно предмете идет речь, либо предмет уже упоминался ранее: *I bought a book. The book was amazing*.'
      }
    ],
    tables: [
      {
        title: 'Сравнение употребления артиклей',
        headers: ['Артикль', 'Когда использовать', 'Примеры'],
        rows: [
          ['a', 'Ед. число, исчисляемое, перед согласным звуком', 'a dog, a computer, a city'],
          ['an', 'Ед. число, исчисляемое, перед гласным звуком', 'an egg, an idea, an orange'],
          ['the', 'Любое число, конкретный или уникальный предмет', 'the teacher, the moon, the cars'],
          ['(нулевой)', 'Множественное число в общем смысле, неисчисляемые', 'I love music. Cats are nice.']
        ]
      }
    ],
    examples: [
      { en: 'I saw a dog in the park.', ru: 'Я увидел собаку в парке.', note: 'A dog (какая-то), in the park (в конкретном парке)' },
      { en: 'She is an honest person.', ru: 'Она честный человек.', note: 'An honest (немая h)' },
      { en: 'The sun rises in the east.', ru: 'Солнце восходит на востоке.', note: 'Уникальный объект' }
    ],
    dialectNotes: 'В американском и британском английском правила артиклей едины.',
    commonMistakes: [
      'Ориентация на букву вместо звука: ❌ *a hour* -> ✅ *an hour* (звук [aʊər]), ❌ *an university* -> ✅ *a university* (звук [j]).',
      'Использование "a" со множественным числом: ❌ *a cars* -> ✅ *cars* или *the cars*.'
    ],
    tutorQuickPrompts: [
      'Почему перед "university" ставится "a", а не "an"?',
      'Когда артикль вообще не ставится?',
      'Дай мне 3 предложения на тренировку артиклей'
    ]
  },

  // Topic ID 5: Plural nouns (-s/-es)
  5: {
    topicId: 5,
    topicName: 'Plural nouns (-s/-es)',
    level: 'A1',
    category: 'Grammar',
    russianTitle: 'Множественное число существительных (-s / -es / исключения)',
    summaryRu: 'В большинстве случаев множественное число образуется добавлением окончания -s к существительному. Однако есть правила для шипящих (-es), гласной y (-ies), и группа неправильных существительных (men, women, children).',
    visualSvg: `<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl shadow-lg font-sans">
      <rect width="700" height="220" rx="14" fill="#0f172a" />
      <text x="350" y="28" fill="#a855f7" font-size="16" font-weight="bold" text-anchor="middle">PLURAL NOUNS IN ENGLISH</text>
      
      <!-- Regular -s -->
      <rect x="30" y="55" width="200" height="135" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
      <text x="130" y="85" fill="#38bdf8" font-size="15" font-weight="bold" text-anchor="middle">REGULAR: +S</text>
      <text x="130" y="115" fill="#ffffff" font-size="14" text-anchor="middle">book -> books</text>
      <text x="130" y="140" fill="#ffffff" font-size="14" text-anchor="middle">car -> cars</text>
      <text x="130" y="165" fill="#94a3b8" font-size="12" text-anchor="middle">Стандартное правило</text>

      <!-- Ending in -es / -ies -->
      <rect x="250" y="55" width="200" height="135" rx="10" fill="#1e293b" stroke="#a855f7" stroke-width="2"/>
      <text x="350" y="85" fill="#c084fc" font-size="15" font-weight="bold" text-anchor="middle">+ES / +IES</text>
      <text x="350" y="115" fill="#ffffff" font-size="14" text-anchor="middle">box -> boxes</text>
      <text x="350" y="140" fill="#ffffff" font-size="14" text-anchor="middle">city -> cities</text>
      <text x="350" y="165" fill="#94a3b8" font-size="12" text-anchor="middle">После -sh, -ch, -x, -s, -y</text>

      <!-- Irregular -->
      <rect x="470" y="55" width="200" height="135" rx="10" fill="#1e293b" stroke="#ec4899" stroke-width="2"/>
      <text x="570" y="85" fill="#f472b6" font-size="15" font-weight="bold" text-anchor="middle">IRREGULAR</text>
      <text x="570" y="115" fill="#ffffff" font-size="14" text-anchor="middle">man -> men</text>
      <text x="570" y="140" fill="#ffffff" font-size="14" text-anchor="middle">child -> children</text>
      <text x="570" y="165" fill="#94a3b8" font-size="12" text-anchor="middle">Запоминаются наизусть</text>
    </svg>`,
    sections: [
      {
        title: '1. Правила окончаний',
        content: 'Обычно добавляется **-s**: *cat -> cats, table -> tables*. После шипящих и свистящих звуков (*-s, -ss, -sh, -ch, -x*) добавляется **-es**: *bus -> buses, watch -> watches*. Если слово оканчивается на согласную + y, y меняется на **-ies**: *baby -> babies*.'
      },
      {
        title: '2. Неправильные существительные',
        content: 'Некоторые частые существительные образуют множественное число не по правилу: *man -> men, woman -> women, child -> children, person -> people, foot -> feet, tooth -> teeth*.'
      }
    ],
    tables: [
      {
        title: 'Основные неправильные формы множественного числа',
        headers: ['Единственное число', 'Множественное число', 'Перевод'],
        rows: [
          ['man', 'men', 'мужчина -> мужчины'],
          ['woman', 'women', 'женщина -> женщины'],
          ['child', 'children', 'ребенок -> дети'],
          ['person', 'people', 'человек -> люди'],
          ['tooth', 'teeth', 'зуб -> зубы'],
          ['foot', 'feet', 'ступня -> ступни']
        ]
      }
    ],
    examples: [
      { en: 'There are two boxes on the table.', ru: 'На столе две коробки.', note: 'Окончание -es' },
      { en: 'The children are playing in the garden.', ru: 'Дети играют в саду.', note: 'Неправильная форма children' },
      { en: 'Many people visit this museum every day.', ru: 'Многие люди посещают этот музей каждый день.', note: 'People (люди)' }
    ],
    dialectNotes: 'Форма "people" всегда согласуется с глаголом во множественном числе (*People are friendly*).',
    commonMistakes: [
      'Добавление -s к неправильным формам: ❌ *childrens* -> ✅ *children*, ❌ *peoples* -> ✅ *people*.',
      'Забывание замены y на -ies: ❌ *citys* -> ✅ *cities*.'
    ],
    tutorQuickPrompts: [
      'Назови топ-7 самых частых неправильных существительных',
      'В каких случаях к словам на -f добавляется -ves?',
      'Проверь меня: дай 5 слов для образования множественного числа'
    ]
  }
};

export function getGrammarTheoryGuide(topicId) {
  const numericId = Number(topicId);
  return ENGLISH_TOPIC_THEORIES[numericId] || null;
}
