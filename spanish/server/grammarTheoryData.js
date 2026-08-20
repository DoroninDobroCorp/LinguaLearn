/**
 * Comprehensive Grammar Theory Guides for Spanish A1 (First 5 Topics)
 * Rich explanations in Russian, structured tables, visual diagrams, dialectal notes, and examples.
 */

export const GRAMMAR_THEORY_GUIDES = {
  // 1. Subject Pronouns (yo/tú/vos/él/ella/usted...) - ID 7
  7: {
    id: 7,
    topicName: 'Subject pronouns (yo/tú/vos/él/ella)',
    russianTitle: 'Личные местоимения в роли подлежащего',
    level: 'A1',
    category: 'Grammar',
    icon: '👤',
    summary: 'Личные местоимения указывают, кто выполняет действие (я, ты, он, мы, вы, они). В испанском языке они часто опускаются, так как окончание глагола уже указывает на лицо.',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <defs>
    <linearGradient id="gradYo" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#a855f7" />
    </linearGradient>
    <linearGradient id="gradTu" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <linearGradient id="gradPl" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#84cc16" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#1e293b" rx="16"/>
  
  <g transform="translate(30, 25)">
    <rect width="300" height="190" rx="12" fill="#334155" stroke="#475569" stroke-width="1.5"/>
    <text x="150" y="28" fill="#f8fafc" font-size="14" font-weight="bold" text-anchor="middle">ЕДИНСТВЕННОЕ ЧИСЛО (Singular)</text>
    
    <rect x="15" y="45" width="270" height="32" rx="8" fill="url(#gradYo)" opacity="0.9"/>
    <text x="25" y="66" fill="#fff" font-size="14" font-weight="bold">yo</text>
    <text x="270" y="66" fill="#f1f5f9" font-size="13" text-anchor="end">я (1-е лицо)</text>

    <rect x="15" y="85" width="270" height="42" rx="8" fill="url(#gradTu)" opacity="0.9"/>
    <text x="25" y="103" fill="#fff" font-size="14" font-weight="bold">tú / vos</text>
    <text x="270" y="103" fill="#f1f5f9" font-size="12" text-anchor="end">ты (неформально)</text>
    <text x="25" y="120" fill="#e2e8f0" font-size="10">vos — Аргентина, Уругвай</text>

    <rect x="15" y="135" width="270" height="42" rx="8" fill="#475569"/>
    <text x="25" y="153" fill="#38bdf8" font-size="13" font-weight="bold">él / ella / usted</text>
    <text x="270" y="153" fill="#f1f5f9" font-size="12" text-anchor="end">он / она / Вы</text>
    <text x="25" y="170" fill="#cbd5e1" font-size="10">usted — вежливое «Вы»</text>
  </g>

  <g transform="translate(370, 25)">
    <rect width="300" height="190" rx="12" fill="#334155" stroke="#475569" stroke-width="1.5"/>
    <text x="150" y="28" fill="#f8fafc" font-size="14" font-weight="bold" text-anchor="middle">МНОЖЕСТВЕННОЕ ЧИСЛО (Plural)</text>

    <rect x="15" y="45" width="270" height="36" rx="8" fill="url(#gradPl)" opacity="0.9"/>
    <text x="25" y="68" fill="#fff" font-size="13" font-weight="bold">nosotros / nosotras</text>
    <text x="270" y="68" fill="#f1f5f9" font-size="12" text-anchor="end">мы</text>

    <rect x="15" y="90" width="270" height="42" rx="8" fill="#475569"/>
    <text x="25" y="108" fill="#facc15" font-size="13" font-weight="bold">vosotros / vosotras</text>
    <text x="270" y="108" fill="#f1f5f9" font-size="12" text-anchor="end">вы (Испания)</text>
    <text x="25" y="124" fill="#cbd5e1" font-size="10">В Лат. Америке не используется</text>

    <rect x="15" y="140" width="270" height="38" rx="8" fill="#475569"/>
    <text x="25" y="163" fill="#a78bfa" font-size="13" font-weight="bold">ellos / ellas / ustedes</text>
    <text x="270" y="163" fill="#f1f5f9" font-size="12" text-anchor="end">они / Вы (все)</text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Полная таблица личных местоимений',
        content: 'В испанском местоимения делятся по родам даже во множественном числе (nosotros — мужчины/смешанная группа, nosotras — только женщины).',
        tables: [
          {
            headers: ['Лицо', 'Испанский', 'Русский перевод', 'Где используется'],
            rows: [
              ['1-е ед.', 'yo', 'я', 'Везде'],
              ['2-е ед. (неформ.)', 'tú', 'ты', 'Испания, Мексика, Колумбия и др.'],
              ['2-е ед. (voseo)', 'vos', 'ты', 'Аргентина, Уругвай, Парагвай, Центр. Америка'],
              ['3-е ед.', 'él / ella', 'он / она', 'Везде'],
              ['3-е ед. (вежл.)', 'usted (Ud.)', 'Вы (один человек)', 'Везде (согласуется с глаголом 3-го лица!)'],
              ['1-е мн.', 'nosotros / nosotras', 'мы (м/ж)', 'Везде'],
              ['2-е мн. (неформ.)', 'vosotros / vosotras', 'вы (неформально)', 'Только в Испании'],
              ['3-е мн. / 2-е мн.', 'ustedes (Uds.)', 'вы (все) / Вы (вежливо)', 'В Лат. Америке заменяет vosotros'],
              ['3-е мн.', 'ellos / ellas', 'они (м/ж)', 'Везде'],
            ]
          }
        ]
      },
      {
        title: '2. Главное правило: Опущение местоимений (Pro-drop)',
        content: 'Испанский — язык с богатыми глагольными окончаниями. В 90% случаев местоимения опускаются, потому что окончание глагола уже однозначно сообщает, кто выполняет действие:\n• Hablo español. (Говорю по-испански → понятно, что yo).\n• ¿Vivís en Buenos Aires? (Живешь в Буэнос-Айресе? → понятно, что vos).\nМестоимение ставится только для логического ударения, противопоставления или устранения двусмысленности:\n• Yo trabajo aquí, pero él estudia. (Я работаю здесь, а он учится).',
        keyTakeaway: 'Ставить "yo" перед каждым глаголом — стилистическая ошибка. Опускайте местоимение, если нет контраста!'
      },
      {
        title: '3. Диалектный акцент: Tú vs Vos (Voseo в Аргентине)',
        content: 'В Аргентине и бассейне Рио-де-ла-Плата местоимение "tú" практически не употребляется в живой речи. Вместо него всегда говорят vos с особым спряжением настоящего времени (ударение на последний слог):\n• tú tienes → vos tenés (у тебя есть)\n• tú hablas → vos hablás (ты говоришь)\n• tú eres → vos sos (ты есть / являешься)',
        dialectNotes: 'В приложении LinguaLearn приоритет отдается аргентинскому варианту (vos / ustedes), но валидация всегда принимает и общеиспанский (tú).'
      }
    ],
    examples: [
      { es: 'Hablo español y estudio medicina.', ru: 'Я говорю по-испански и изучаю медицину.', note: 'Местоимение yo опущено.' },
      { es: '¿Vos sos de Argentina?', ru: 'Ты из Аргентины? (Rioplatense)', note: 'Использование vos + sos.' },
      { es: 'Ella es médica y él es profesor.', ru: 'Она врач, а он преподаватель.', note: 'Местоимения нужны для противопоставления.' },
      { es: '¿Usted habla inglés?', ru: 'Вы говорите по-английски? (вежливо)', note: 'Usted требует глагол в 3-м лице (habla).' },
    ],
    commonMistakes: [
      {
        wrong: 'Yo hablo, yo como, yo vivo.',
        right: 'Hablo, como y vivo.',
        explanation: 'Избыточное повторение "yo" неестественно в испанском языке.'
      },
      {
        wrong: '¿Usted hablas español?',
        right: '¿Usted habla español?',
        explanation: 'Usted ВСЕГДА спрягается в 3-м лице единственного числа (как él/ella).'
      }
    ],
    tutorSuggestions: [
      'Объясни еще раз разницу между tú, vos и usted',
      'Когда обязательно нужно ставить местоимение yo, а когда нет?',
      'Приведи 5 примеров с аргентинским vos и глаголами',
      'Проверь меня: дай мне 3 предложения с пропущенными местоимениями'
    ]
  },

  // 2. Gender and Articles (el/la/los/las) - ID 4
  4: {
    id: 4,
    topicName: 'Gender and articles (el/la/los/las)',
    russianTitle: 'Род существительных и определенный артикль',
    level: 'A1',
    category: 'Grammar',
    icon: '🏷️',
    summary: 'В испанском языке все существительные имеют род: мужской (masculino) или женский (femenino). Определенный артикль (el, la, los, las) указывает на конкретный, уже известный предмет.',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <defs>
    <linearGradient id="artMasc" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="artFem" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#db2777" />
      <stop offset="100%" stop-color="#f472b6" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0f172a" rx="16"/>

  <g transform="translate(35, 20)">
    <rect width="300" height="200" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
    <rect x="0" y="0" width="300" height="38" rx="12" fill="url(#artMasc)"/>
    <text x="150" y="24" fill="#ffffff" font-size="15" font-weight="bold" text-anchor="middle">МУЖСКОЙ РОД (Masculino)</text>
    
    <text x="20" y="65" fill="#93c5fd" font-size="13" font-weight="bold">Ед. ч.: <tspan fill="#ffffff" font-size="16">el</tspan> libro (книга)</text>
    <text x="20" y="90" fill="#93c5fd" font-size="13" font-weight="bold">Мн. ч.: <tspan fill="#ffffff" font-size="16">los</tspan> libros (книги)</text>
    
    <line x1="20" y1="108" x2="280" y2="108" stroke="#334155" stroke-width="1"/>
    <text x="20" y="128" fill="#e2e8f0" font-size="12">Окончания: <tspan fill="#38bdf8" font-weight="bold">-o, -or, -aje, -ma (греч.)</tspan></text>
    <text x="20" y="150" fill="#94a3b8" font-size="11">el chico, el amor, el viaje, el problema</text>
    <text x="20" y="180" fill="#facc15" font-size="11">⚠️ Исключения: <tspan fill="#fde047">el día, el mapa, el sofá</tspan></text>
  </g>

  <g transform="translate(365, 20)">
    <rect width="300" height="200" rx="12" fill="#1e293b" stroke="#ec4899" stroke-width="1.5"/>
    <rect x="0" y="0" width="300" height="38" rx="12" fill="url(#artFem)"/>
    <text x="150" y="24" fill="#ffffff" font-size="15" font-weight="bold" text-anchor="middle">ЖЕНСКИЙ РОД (Femenino)</text>

    <text x="20" y="65" fill="#fbcfe8" font-size="13" font-weight="bold">Ед. ч.: <tspan fill="#ffffff" font-size="16">la</tspan> casa (дом)</text>
    <text x="20" y="90" fill="#fbcfe8" font-size="13" font-weight="bold">Мн. ч.: <tspan fill="#ffffff" font-size="16">las</tspan> casas (дома)</text>

    <line x1="20" y1="108" x2="280" y2="108" stroke="#334155" stroke-width="1"/>
    <text x="20" y="128" fill="#e2e8f0" font-size="12">Окончания: <tspan fill="#f472b6" font-weight="bold">-a, -ción, -sión, -dad, -tad</tspan></text>
    <text x="20" y="150" fill="#94a3b8" font-size="11">la mesa, la canción, la ciudad, la libertad</text>
    <text x="20" y="180" fill="#facc15" font-size="11">⚠️ Исключения: <tspan fill="#fde047">la mano, la foto, la moto</tspan></text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Формы определенного артикля',
        content: 'Определенный артикль согласуется с существительным в роде и числе:',
        tables: [
          {
            headers: ['Число', 'Мужской род', 'Женский род'],
            rows: [
              ['Единственное число', 'el (el auto / el libro)', 'la (la casa / la noche)'],
              ['Множественное число', 'los (los autos / los libros)', 'las (las casas / las noches)'],
            ]
          }
        ]
      },
      {
        title: '2. Как определить род существительного',
        content: '• Мужской род: слова на -o (el libro), слова греческого происхождения на -ma, -pa (el problema, el tema, el mapa), дни недели и языки (el lunes, el español).\n• Женский род: слова на -a (la mesa), слова на -ción, -sión, -dad, -tad (la canción, la ciudad, la libertad).',
        keyTakeaway: 'Слова на -ma греческого корня (el problema, el idioma, el programa, el sistema) — МУЖСКОГО рода, несмотря на окончание -a!'
      },
      {
        title: '3. Обязательные слияния (Contracciones: al и del)',
        content: 'Когда перед артиклем мужского рода el стоят предлоги a (к/в) или de (из/от/о), происходит обязательное слияние:\n• a + el = al (Voy al cine вместо Voy a el cine).\n• de + el = del (Vengo del trabajo вместо Vengo de el trabajo).\nС артиклями la, los, las слияния НЕ происходит: Voy a la playa, Vengo de las montañas.'
      }
    ],
    examples: [
      { es: 'El problema es muy difícil.', ru: 'Проблема очень сложная.', note: 'El problema — мужской род!' },
      { es: 'Me gusta la ciudad de Buenos Aires.', ru: 'Мне нравится город Буэнос-Айрес.', note: 'La ciudad — женский род (-dad).' },
      { es: 'Vamos al supermercado.', ru: 'Мы идем в супермаркет.', note: 'Слияние a + el = al.' },
      { es: 'Es el auto del profesor.', ru: 'Это машина преподавателя.', note: 'Слияние de + el = del.' },
    ],
    commonMistakes: [
      {
        wrong: 'La problema es grave.',
        right: 'El problema es grave.',
        explanation: 'Слово "problema" — мужского рода (el problema).'
      },
      {
        wrong: 'Voy a el parque.',
        right: 'Voy al parque.',
        explanation: 'Слияние "a + el = al" в испанском строго обязательно.'
      }
    ],
    tutorSuggestions: [
      'Назови топ-10 коварных исключений рода в испанском',
      'Почему el problema мужского рода, а la mano женского?',
      'Объясни слияния al и del с примерами',
      'Дай мне 5 существительных, чтобы я угадал их род'
    ]
  },

  // 3. Indefinite Articles (un/una/unos/unas) - ID 5
  5: {
    id: 5,
    topicName: 'Indefinite articles (un/una/unos/unas)',
    russianTitle: 'Неопределенный артикль и его отсутствие',
    level: 'A1',
    category: 'Grammar',
    icon: '🎲',
    summary: 'Неопределенный артикль (un, una, unos, unas) используется, когда мы впервые упоминаем предмет, говорим о каком-то одном предмете из многих или обозначаем примерное количество ("несколько / около").',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#1e1e2e" rx="16"/>

  <g transform="translate(30, 20)">
    <rect width="300" height="200" rx="12" fill="#2d2b40" stroke="#a78bfa" stroke-width="1.5"/>
    <text x="150" y="30" fill="#c4b5fd" font-size="15" font-weight="bold" text-anchor="middle">ФОРМЫ НЕОПРЕДЕЛЕННОГО АРТИКЛЯ</text>
    
    <rect x="20" y="50" width="260" height="30" rx="6" fill="#4c1d95"/>
    <text x="30" y="70" fill="#fff" font-weight="bold">un</text>
    <text x="270" y="70" fill="#ddd6fe" text-anchor="end">un amigo (друг / один друг)</text>

    <rect x="20" y="88" width="260" height="30" rx="6" fill="#831843"/>
    <text x="30" y="108" fill="#fff" font-weight="bold">una</text>
    <text x="270" y="108" fill="#fbcfe8" text-anchor="end">una chica (девушка)</text>

    <rect x="20" y="126" width="260" height="30" rx="6" fill="#312e81"/>
    <text x="30" y="146" fill="#fff" font-weight="bold">unos</text>
    <text x="270" y="146" fill="#c7d2fe" text-anchor="end">unos libros (несколько книг / ~)</text>

    <rect x="20" y="164" width="260" height="30" rx="6" fill="#701a75"/>
    <text x="30" y="184" fill="#fff" font-weight="bold">unas</text>
    <text x="270" y="184" fill="#f5d0fe" text-anchor="end">unas manzanas (несколько яблок)</text>
  </g>

  <g transform="translate(360, 20)">
    <rect width="310" height="200" rx="12" fill="#2d2b40" stroke="#f43f5e" stroke-width="1.5"/>
    <text x="155" y="30" fill="#fda4af" font-size="15" font-weight="bold" text-anchor="middle">КОГДА АРТИКЛЬ НЕ НУЖЕН (🚫)</text>
    
    <text x="20" y="65" fill="#fecdd3" font-size="13" font-weight="bold">1. Профессии после глагола SER:</text>
    <text x="35" y="85" fill="#ffffff" font-size="12">Soy profesor. <tspan fill="#94a3b8">(НЕ Soy un profesor)</tspan></text>

    <text x="20" y="115" fill="#fecdd3" font-size="13" font-weight="bold">2. Национальности и религии:</text>
    <text x="35" y="135" fill="#ffffff" font-size="12">Es argentino. <tspan fill="#94a3b8">(НЕ Es un argentino)</tspan></text>

    <text x="20" y="165" fill="#fecdd3" font-size="13" font-weight="bold">3. С глаголом TENER (в общем смысле):</text>
    <text x="35" y="185" fill="#ffffff" font-size="12">No tengo auto. / Tengo hambre.</text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Основные значения неопределенного артикля',
        content: '• Первое упоминание предмета: Hay un hotel cerca. (Поблизости есть отель).\n• Один представитель класса: Quiero comprar una computadora. (Хочу купить компьютер).\n• Во множественном числе (unos / unas) означает «несколько» или «примерно»:\n  - Tengo unos amigos en Madrid. (У меня есть несколько друзей в Мадриде).\n  - Cuesta unos 50 dólares. (Это стоит около 50 долларов).'
      },
      {
        title: '2. Когда артикль опускается (Нулевой артикль)',
        content: 'В испанском языке неопределенный артикль НЕ ставится:\n1. С профессиями, национальностями и религиями после SER: Soy médico (Я врач). Если появляется качество, артикль возвращается: Soy un médico excelente.\n2. С неисчисляемыми существительными: Tomo café por la mañana.\n3. После глагола TENER при отрицании: No tengo tiempo. No tengo auto.',
        keyTakeaway: 'После глагола SER перед профессией артикль НЕ ставится: "Soy abogado", а не "Soy un abogado".'
      }
    ],
    examples: [
      { es: 'Compré un libro muy interesante.', ru: 'Я купил интересную книгу.', note: 'Первое упоминание предмета.' },
      { es: 'Tengo unos 15 minutos libres.', ru: 'У меня есть около 15 свободных минут.', note: 'Unos в значении "примерно / около".' },
      { es: 'Juan es ingeniero.', ru: 'Хуан — инженер.', note: 'Профессия без артикля.' },
      { es: 'Juan es un ingeniero brillante.', ru: 'Хуан — блестящий инженер.', note: 'Прилагательное brillante → ставим un.' },
    ],
    commonMistakes: [
      {
        wrong: 'Soy un profesor de español.',
        right: 'Soy profesor de español.',
        explanation: 'Перед профессией после глагола ser артикль un/una не используется.'
      },
      {
        wrong: 'No tengo un auto.',
        right: 'No tengo auto.',
        explanation: 'При простом отрицании наличия предмета артикль обычно опускается.'
      }
    ],
    tutorSuggestions: [
      'В каких случаях unos/unas переводится как "примерно"?',
      'Когда с профессиями нужно ставить un, а когда нет?',
      'В чем главное отличие el/la от un/una?',
      'Дай мне 4 предложения, где нужно выбрать артикль или его отсутствие'
    ]
  },

  // 4. Plural Nouns (-s/-es) - ID 6
  6: {
    id: 6,
    topicName: 'Plural nouns (-s/-es)',
    russianTitle: 'Множественное число существительных (-s / -es / -ces)',
    level: 'A1',
    category: 'Grammar',
    icon: '👥',
    summary: 'Множественное число в испанском образуется просто и логично: к словам на гласную добавляется -s, к словам на согласную — -es, а конечная буква -z меняется на -ces.',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#090d16" rx="16"/>

  <g transform="translate(25, 20)">
    <g transform="translate(0, 0)">
      <rect width="200" height="200" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
      <rect x="0" y="0" width="200" height="32" rx="10" fill="#059669"/>
      <text x="100" y="21" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle">ГЛАСНАЯ + -S</text>
      
      <text x="15" y="60" fill="#6ee7b7" font-weight="bold">la casa → <tspan fill="#fff">las casas</tspan></text>
      <text x="15" y="90" fill="#6ee7b7" font-weight="bold">el libro → <tspan fill="#fff">los libros</tspan></text>
      <text x="15" y="120" fill="#6ee7b7" font-weight="bold">el café → <tspan fill="#fff">los cafés</tspan></text>
      <text x="15" y="150" fill="#6ee7b7" font-weight="bold">el taxi → <tspan fill="#fff">los taxis</tspan></text>
      <text x="15" y="180" fill="#94a3b8" font-size="10">Окончания -a, -e, -i, -o, -u</text>
    </g>

    <g transform="translate(225, 0)">
      <rect width="200" height="200" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
      <rect x="0" y="0" width="200" height="32" rx="10" fill="#2563eb"/>
      <text x="100" y="21" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle">СОГЛАСНАЯ + -ES</text>

      <text x="15" y="60" fill="#93c5fd" font-weight="bold">el hotel → <tspan fill="#fff">los hoteles</tspan></text>
      <text x="15" y="90" fill="#93c5fd" font-weight="bold">el mes → <tspan fill="#fff">los meses</tspan></text>
      <text x="15" y="120" fill="#93c5fd" font-weight="bold">la flor → <tspan fill="#fff">las flores</tspan></text>
      <text x="15" y="150" fill="#93c5fd" font-weight="bold">la ciudad → <tspan fill="#fff">ciudades</tspan></text>
      <text x="15" y="180" fill="#94a3b8" font-size="10">Окончания на согл. (кроме -z)</text>
    </g>

    <g transform="translate(450, 0)">
      <rect width="200" height="200" rx="10" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
      <rect x="0" y="0" width="200" height="32" rx="10" fill="#d97706"/>
      <text x="100" y="21" fill="#fff" font-size="13" font-weight="bold" text-anchor="middle">-Z → -CES / БЕЗ ИЗМ.</text>

      <text x="15" y="55" fill="#fde68a" font-weight="bold">el pez → <tspan fill="#fff">los peces</tspan></text>
      <text x="15" y="80" fill="#fde68a" font-weight="bold">la voz → <tspan fill="#fff">las voces</tspan></text>
      <text x="15" y="105" fill="#fde68a" font-weight="bold">la luz → <tspan fill="#fff">las luces</tspan></text>
      
      <line x1="15" y1="120" x2="185" y2="120" stroke="#475569"/>
      <text x="15" y="140" fill="#fca5a5" font-size="11" font-weight="bold">Слова на -s с безударным:</text>
      <text x="15" y="160" fill="#cbd5e1" font-size="11">el lunes → <tspan fill="#fff">los lunes</tspan></text>
      <text x="15" y="180" fill="#cbd5e1" font-size="11">el paraguas → <tspan fill="#fff">los paraguas</tspan></text>
    </g>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Три главных правила образования множественного числа',
        content: '1. Гласная (a, e, i, o, u) → добавляем -s: amigo → amigos, noche → noches.\n2. Согласная (кроме z) → добавляем -es: papel → papeles, mujer → mujeres.\n3. Буква -z переходит в -c + -es: el pez → los peces, la vez → las veces, el lápiz → los lápices.'
      },
      {
        title: '2. Сдвиг и сохранение графического ударения (Tilde)',
        content: 'При добавлении слога -es позиция ударения в слове сохраняется, что иногда требует добавления или снятия знака ударения:\n• Знак исчезает: la lección → las lecciones, el autobús → los autobuses.\n• Знак появляется: el examen → los exámenes, el joven → los jóvenes.',
        keyTakeaway: 'Слово el examen пишется без тильды, но во множественном числе los exámenes тильда ОБЯЗАТЕЛЬНА!'
      },
      {
        title: '3. Неизменяемые слова',
        content: 'Слова на безударный -s не меняются во множественном числе (меняется только артикль):\n• el lunes → los lunes\n• el cumpleaños → los cumpleaños\n• el paraguas → los paraguas'
      }
    ],
    examples: [
      { es: 'Compré dos lápices nuevos.', ru: 'Я купил два новых карандаша.', note: 'El lápiz → los lápices (z → c).' },
      { es: 'Los exámenes de español son difíciles.', ru: 'Экзамены по испанскому сложные.', note: 'Examen → exámenes (появилась тильда).' },
      { es: 'Trabajo todos los viernes.', ru: 'Я работаю каждую пятницу.', note: 'Viernes не меняет окончание.' },
    ],
    commonMistakes: [
      {
        wrong: 'los pezs / los pezes',
        right: 'los peces',
        explanation: 'Конечная Z перед E всегда переходит в C: el pez → los peces.'
      },
      {
        wrong: 'los examenes',
        right: 'los exámenes',
        explanation: 'Слово los exámenes требует ударение на букву á.'
      }
    ],
    tutorSuggestions: [
      'Почему в слове exámenes появляется тильда, а в lecciones исчезает?',
      'Как образуется множественное число от слов на букву Z?',
      'Назови 5 слов, которые не меняются во множественном числе',
      'Дай мне 5 существительных разного типа для перевода во множественное число'
    ]
  },

  // 5. Basic Adjective Agreement (gender/number) - ID 13
  13: {
    id: 13,
    topicName: 'Basic adjective agreement (gender/number)',
    russianTitle: 'Согласование прилагательных по роду и числу',
    level: 'A1',
    category: 'Grammar',
    icon: '🎨',
    summary: 'В испанском языке прилагательные как зеркало отражают существительное: они согласуются с ним и в роде (мужской/женский), и в числе (единственное/множественное). Обычно прилагательное ставится ПОСЛЕ существительного.',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#13111c" rx="16"/>

  <g transform="translate(30, 20)">
    <rect width="640" height="200" rx="12" fill="#1f1b2e" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="320" y="30" fill="#ddd6fe" font-size="15" font-weight="bold" text-anchor="middle">МАТРИЦА СОГЛАСОВАНИЯ: chico / chica (alto/alta)</text>
    
    <rect x="20" y="45" width="140" height="30" rx="6" fill="#4c1d95"/>
    <text x="90" y="65" fill="#fff" font-weight="bold" text-anchor="middle">Число / Род</text>

    <rect x="170" y="45" width="220" height="30" rx="6" fill="#1e3a8a"/>
    <text x="280" y="65" fill="#93c5fd" font-weight="bold" text-anchor="middle">Мужской род (Masculino)</text>

    <rect x="400" y="45" width="220" height="30" rx="6" fill="#831843"/>
    <text x="510" y="65" fill="#fbcfe8" font-weight="bold" text-anchor="middle">Женский род (Femenino)</text>

    <rect x="20" y="85" width="140" height="45" rx="6" fill="#2e2744"/>
    <text x="90" y="112" fill="#c4b5fd" font-weight="bold" text-anchor="middle">Единственное</text>

    <rect x="170" y="85" width="220" height="45" rx="6" fill="#172554"/>
    <text x="280" y="105" fill="#60a5fa" font-weight="bold" text-anchor="middle">el chico alt<tspan fill="#fbbf24" font-size="16">o</tspan></text>
    <text x="280" y="122" fill="#94a3b8" font-size="11" text-anchor="middle">высокий парень</text>

    <rect x="400" y="85" width="220" height="45" rx="6" fill="#500724"/>
    <text x="510" y="105" fill="#f472b6" font-weight="bold" text-anchor="middle">la chica alt<tspan fill="#fbbf24" font-size="16">a</tspan></text>
    <text x="510" y="122" fill="#94a3b8" font-size="11" text-anchor="middle">высокая девушка</text>

    <rect x="20" y="140" width="140" height="45" rx="6" fill="#2e2744"/>
    <text x="90" y="167" fill="#c4b5fd" font-weight="bold" text-anchor="middle">Множественное</text>

    <rect x="170" y="140" width="220" height="45" rx="6" fill="#172554"/>
    <text x="280" y="160" fill="#60a5fa" font-weight="bold" text-anchor="middle">los chicos alt<tspan fill="#fbbf24" font-size="16">os</tspan></text>
    <text x="280" y="177" fill="#94a3b8" font-size="11" text-anchor="middle">высокие парни</text>

    <rect x="400" y="140" width="220" height="45" rx="6" fill="#500724"/>
    <text x="510" y="160" fill="#f472b6" font-weight="bold" text-anchor="middle">las chicas alt<tspan fill="#fbbf24" font-size="16">as</tspan></text>
    <text x="510" y="177" fill="#94a3b8" font-size="11" text-anchor="middle">высокие девушки</text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Типы прилагательных по окончаниям',
        content: '• Прилагательные на -o (4 формы): -o, -a, -os, -as (rojo, roja, rojos, rojas).\n• Нейтральные прилагательные на -e или согласную: одинаковы для мужского и женского рода! grande / grandes (el auto grande / la casa grande), azul / azules, fácil / fáciles.\n• Прилагательные национальностей: español / española, argentino / argentina.'
      },
      {
        title: '2. Место прилагательного в предложении',
        content: 'Описательные прилагательные почти всегда стоят ПОСЛЕ существительного:\n• una casa blanca (белый дом)\n• un libro interesante (интересная книга)\n• un café caliente (горячий кофе)\nПеред существительным ставятся местоимения и числительные (mi casa, este libro, tres autos), а также mucho / poco / otro.',
        keyTakeaway: 'Описательное прилагательное почти всегда идет ПОСЛЕ существительного: "un auto rojo", а не "un rojo auto".'
      }
    ],
    examples: [
      { es: 'Tengo una casa grande y luminosa.', ru: 'У меня большой и светлый дом.', note: 'Grande (нейтральное) и luminosa (-a под la casa).' },
      { es: 'Los estudiantes argentinos son muy amables.', ru: 'Аргентинские студенты очень приветливы.', note: 'Argentinos (мн. число, муж. род).' },
      { es: 'Compré unas manzanas rojas.', ru: 'Я купил несколько красных яблок.', note: 'Las manzanas (ж.р., мн.ч.) → rojas.' },
      { es: 'Es un problema importante.', ru: 'Это важная проблема.', note: 'El problema (м.р.) + importante (нейтральное).' },
    ],
    commonMistakes: [
      {
        wrong: 'una grande casa',
        right: 'una casa grande',
        explanation: 'Описательное прилагательное ставится после существительного.'
      },
      {
        wrong: 'el problema es compleja',
        right: 'el problema es complejo',
        explanation: 'El problema — мужского рода, поэтому и прилагательное должно быть мужского рода (complejo).'
      }
    ],
    tutorSuggestions: [
      'Какие прилагательные не меняются по родам в испанском?',
      'Почему прилагательные ставятся ПОСЛЕ существительных?',
      'Как согласуются прилагательные национальностей?',
      'Дай мне 5 существительных и прилагательных, чтобы я составил правильные словосочетания'
    ]
  }
};

export function getGrammarTheoryGuide(topicId, topicName = '') {
  if (topicId && GRAMMAR_THEORY_GUIDES[topicId]) {
    return GRAMMAR_THEORY_GUIDES[topicId];
  }

  const lower = String(topicName).toLowerCase();
  if (lower.includes('pronoun') || lower.includes('местоимен') || lower.includes('yo/tú') || lower.includes('voseo')) {
    return GRAMMAR_THEORY_GUIDES[7];
  }
  if (lower.includes('gender') || (lower.includes('article') && lower.includes('el/la')) || lower.includes('род')) {
    return GRAMMAR_THEORY_GUIDES[4];
  }
  if (lower.includes('indefinite') || lower.includes('неопределен') || lower.includes('un/una')) {
    return GRAMMAR_THEORY_GUIDES[5];
  }
  if (lower.includes('plural') || lower.includes('множествен') || lower.includes('-s/-es')) {
    return GRAMMAR_THEORY_GUIDES[6];
  }
  if (lower.includes('adjective') || lower.includes('прилагательн') || lower.includes('agreement') || lower.includes('согласован')) {
    return GRAMMAR_THEORY_GUIDES[13];
  }

  return null;
}
