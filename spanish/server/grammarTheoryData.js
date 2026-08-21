/**
 * Comprehensive & Vibrant Grammar Theory Guides for Spanish A1-A2
 * Rich explanations in Russian, visual mnemonic diagrams, real-life examples,
 * trap alerts, Argentine dialect notes, and interactive check quizzes.
 */

export const GRAMMAR_THEORY_GUIDES = {
  // 1. Ser vs Estar (basic) - ID 1
  1: {
    id: 1,
    topicName: 'Ser vs Estar (basic)',
    russianTitle: 'Глаголы SER и ESTAR: фундаментальная разница',
    level: 'A1',
    category: 'Grammar',
    icon: '⚖️',
    summary: 'В русском языке один глагол «быть», а в испанском — два! SER выражает постоянную суть, идентичность и происхождение (Кто? Что это? Чей? Откуда?). ESTAR выражает временное состояние, настроение, самочувствие и местонахождение (Где? Как себя чувствует?).',
    mnemonicRule: 'SER = СУТЬ и ПАСПОРТ (DOCTOR) vs ESTAR = СОСТОЯНИЕ и ГЕОЛОКАЦИЯ (PLACE)',
    visualSvg: `<svg viewBox="0 0 700 240" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <defs>
    <linearGradient id="gradSer" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
    <linearGradient id="gradEstar" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0f172a" rx="16"/>

  <!-- SER BOX -->
  <g transform="translate(30, 20)">
    <rect width="300" height="200" rx="14" fill="#1e293b" stroke="#8b5cf6" stroke-width="2"/>
    <rect x="0" y="0" width="300" height="40" rx="14" fill="url(#gradSer)"/>
    <text x="150" y="26" fill="#fff" font-size="15" font-weight="extrabold" text-anchor="middle">SER — ПОСТОЯННАЯ СУТЬ</text>
    <text x="20" y="68" fill="#f472b6" font-size="13" font-weight="bold">D</text><text x="38" y="68" fill="#e2e8f0" font-size="12">escription (Soy alto)</text>
    <text x="20" y="93" fill="#f472b6" font-size="13" font-weight="bold">O</text><text x="38" y="93" fill="#e2e8f0" font-size="12">rigin (Soy de Argentina)</text>
    <text x="20" y="118" fill="#f472b6" font-size="13" font-weight="bold">C</text><text x="38" y="118" fill="#e2e8f0" font-size="12">haracteristic (Es inteligente)</text>
    <text x="20" y="143" fill="#f472b6" font-size="13" font-weight="bold">T</text><text x="38" y="143" fill="#e2e8f0" font-size="12">ime / Date (Son las tres)</text>
    <text x="20" y="168" fill="#f472b6" font-size="13" font-weight="bold">O</text><text x="38" y="168" fill="#e2e8f0" font-size="12">ccupation (Soy médico)</text>
    <text x="20" y="193" fill="#f472b6" font-size="13" font-weight="bold">R</text><text x="38" y="193" fill="#e2e8f0" font-size="12">elation (Es mi hermano)</text>
  </g>

  <!-- ESTAR BOX -->
  <g transform="translate(370, 20)">
    <rect width="300" height="200" rx="14" fill="#1e293b" stroke="#06b6d4" stroke-width="2"/>
    <rect x="0" y="0" width="300" height="40" rx="14" fill="url(#gradEstar)"/>
    <text x="150" y="26" fill="#fff" font-size="15" font-weight="extrabold" text-anchor="middle">ESTAR — СОСТОЯНИЕ & МЕСТО</text>
    <text x="20" y="70" fill="#38bdf8" font-size="13" font-weight="bold">P</text><text x="38" y="70" fill="#e2e8f0" font-size="12">osition (Estoy sentado)</text>
    <text x="20" y="100" fill="#38bdf8" font-size="13" font-weight="bold">L</text><text x="38" y="100" fill="#e2e8f0" font-size="12">ocation (Está en Madrid)</text>
    <text x="20" y="130" fill="#38bdf8" font-size="13" font-weight="bold">A</text><text x="38" y="130" fill="#e2e8f0" font-size="12">ction -ing (Estoy comiendo)</text>
    <text x="20" y="160" fill="#38bdf8" font-size="13" font-weight="bold">C</text><text x="38" y="160" fill="#e2e8f0" font-size="12">ondition / Health (Está enfermo)</text>
    <text x="20" y="190" fill="#38bdf8" font-size="13" font-weight="bold">E</text><text x="38" y="190" fill="#e2e8f0" font-size="12">motion (Estoy feliz / cansado)</text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Спряжение в настоящем времени (Presente)',
        content: 'Запомните формы обоих глаголов для каждого лица:',
        tables: [
          {
            headers: ['Лицо', 'SER (быть по сути)', 'ESTAR (находиться / чувствовать)'],
            rows: [
              ['yo (я)', 'soy (я есть)', 'estoy (я нахожусь / мне...)'],
              ['tú / vos (ты)', 'eres / sos (ты есть)', 'estás (ты находишься)'],
              ['él / ella / usted (он/она/Вы)', 'es', 'está'],
              ['nosotros (мы)', 'somos', 'estamos'],
              ['vosotros (вы - Испания)', 'sois', 'estáis'],
              ['ellos / ustedes (они/Вы все)', 'son', 'están']
            ]
          }
        ]
      },
      {
        title: '2. Сравнение, меняющее смысл на 180 градусов!',
        content: 'Одно и то же прилагательное с SER и ESTAR означает совершенно разные вещи:',
        tables: [
          {
            headers: ['Слово', 'С глаголом SER (Суть)', 'С глаголом ESTAR (Состояние)'],
            rows: [
              ['aburrido', 'Soy aburrido = Я занудный человек', 'Estoy aburrido = Мне скучно сейчас'],
              ['rico', 'Es rico = Он богатый миллионер', 'Está rico = Это блюдо очень вкусное!'],
              ['verde', 'La manzana es verde = Яблоко зеленого сорта', 'La manzana está verde = Яблоко еще не созрело'],
              ['listo', 'Es listo = Он умный / сообразительный', 'Está listo = Он готов (к выходу/обеду)'],
              ['bueno', 'Es bueno = Он добрый / качественный', 'Está bueno = Он привлекательный / вкусный']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Всегда используйте ESTAR для местоположения (El hotel ESTÁ en la esquina), даже если здание стоит там 200 лет!',
    dialectNote: 'В Аргентине с местоимением vos используется: «vos sos» (SER) и «vos estás» (ESTAR). Например: «¡Che, vos sos un genio!» (Дружище, ты гений!).',
    quickCheckQuiz: [
      {
        question: 'Как правильно сказать: «Я нахожусь в кафе и пью кофе»?',
        options: ['Soy en el café', 'Estoy en el café', 'Tengo en el café', 'Voy en el café'],
        correctIndex: 1,
        explanation: 'Для физического местонахождения всегда используется ESTAR (Estoy en el café).'
      },
      {
        question: 'Что означает фраза «El café está muy rico»?',
        options: ['Кофе стоит миллион долларов', 'Кофе очень вкусный прямо сейчас', 'Кофе горький', 'Кофе холодный'],
        correctIndex: 1,
        explanation: 'Estar rico = вкусный о еде/напитках в данный момент.'
      }
    ]
  },

  // 2. Present tense regular -ar verbs - ID 2
  2: {
    id: 2,
    topicName: 'Present tense regular -ar verbs',
    russianTitle: 'Настоящее время: правильные глаголы на -AR',
    level: 'A1',
    category: 'Grammar',
    icon: '🗣️',
    summary: 'Глаголы первого спряжения оканчиваются на -AR (hablar, trabajar, comprar, viajar, estudiar). Чтобы проспрягать их, отбрасываем -AR и добавляем личные окончания: -o, -as/-ás, -a, -amos, -áis, -an.',
    mnemonicRule: 'Отсеки -AR ➔ добавь: -O, -AS, -A, -AMOS, -ÁIS, -AN',
    visualSvg: `<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#1e293b" rx="16"/>
  <g transform="translate(30, 20)">
    <text x="320" y="30" fill="#facc15" font-size="16" font-weight="extrabold" text-anchor="middle">HABLAR (говорить) ➔ HABL + окончания</text>
    <g transform="translate(0, 50)">
      <rect x="0" y="0" width="95" height="85" rx="10" fill="#334155" stroke="#ec4899" stroke-width="2"/>
      <text x="47" y="30" fill="#f8fafc" font-size="12" text-anchor="middle">yo</text>
      <text x="47" y="60" fill="#f472b6" font-size="18" font-weight="bold" text-anchor="middle">habl-O</text>
    </g>
    <g transform="translate(110, 50)">
      <rect x="0" y="0" width="115" height="85" rx="10" fill="#334155" stroke="#3b82f6" stroke-width="2"/>
      <text x="57" y="30" fill="#f8fafc" font-size="12" text-anchor="middle">tú / vos</text>
      <text x="57" y="55" fill="#60a5fa" font-size="14" font-weight="bold" text-anchor="middle">habl-AS</text>
      <text x="57" y="73" fill="#a78bfa" font-size="12" text-anchor="middle">vos habl-ÁS</text>
    </g>
    <g transform="translate(240, 50)">
      <rect x="0" y="0" width="115" height="85" rx="10" fill="#334155" stroke="#10b981" stroke-width="2"/>
      <text x="57" y="30" fill="#f8fafc" font-size="12" text-anchor="middle">él / ella / usted</text>
      <text x="57" y="60" fill="#34d399" font-size="18" font-weight="bold" text-anchor="middle">habl-A</text>
    </g>
    <g transform="translate(370, 50)">
      <rect x="0" y="0" width="125" height="85" rx="10" fill="#334155" stroke="#f59e0b" stroke-width="2"/>
      <text x="62" y="30" fill="#f8fafc" font-size="12" text-anchor="middle">nosotros</text>
      <text x="62" y="60" fill="#fbbf24" font-size="16" font-weight="bold" text-anchor="middle">habl-AMOS</text>
    </g>
    <g transform="translate(510, 50)">
      <rect x="0" y="0" width="130" height="85" rx="10" fill="#334155" stroke="#8b5cf6" stroke-width="2"/>
      <text x="65" y="30" fill="#f8fafc" font-size="12" text-anchor="middle">ellos / ustedes</text>
      <text x="65" y="60" fill="#c084fc" font-size="18" font-weight="bold" text-anchor="middle">habl-AN</text>
    </g>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Топ-10 глаголов на -AR для ежедневного общения',
        content: 'Все эти глаголы спрягаются по единой схеме:',
        tables: [
          {
            headers: ['Глагол', 'Значение', 'Пример (yo)', 'Пример (tú/vos)'],
            rows: [
              ['hablar', 'говорить', 'Hablo español (Я говорю по-испански)', '¿Hablás inglés?'],
              ['trabajar', 'работать', 'Trabajo en casa (Я работаю дома)', 'Trabajás mucho'],
              ['estudiar', 'учиться', 'Estudio medicina (Я учу медицину)', 'Estudiás español'],
              ['comprar', 'покупать', 'Compro fruta (Покупаю фрукты)', '¿Qué comprás?'],
              ['viajar', 'путешествовать', 'Viajo a España (Еду в Испанию)', 'Viajás en avión'],
              ['necesitar', 'нуждаться', 'Necesito un café (Мне нужен кофе)', '¿Necesitás ayuda?'],
              ['buscar', 'искать', 'Busco el hotel (Ищу отель)', '¿Qué buscás?'],
              ['escuchar', 'слушать', 'Escucho tango (Слушаю танго)', 'Escuchás música'],
              ['tomar', 'пить / брать', 'Tomo mate (Пью мате)', 'Tomás un taxi'],
              ['esperar', 'ждать / надеяться', 'Espero el autobús (Жду автобус)', 'Esperás aquí']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Местоимения (yo, tú, él) обычно не произносят! Фраза «Yo hablo español» звучит как «Я-то говорю...». Достаточно сказать просто: «Hablo español».',
    dialectNote: 'В Риоплатском диалекте (Аргентина/Уругвай) окончание для vos ВСЕГДА с ударением на последний слог: hablás, trabajás, comprás, viajás!',
    quickCheckQuiz: [
      {
        question: 'Как сказать «Мы работаем в Буэнос-Айресе»?',
        options: ['Trabajamos en Buenos Aires', 'Trabajan en Buenos Aires', 'Trabajo en Buenos Aires', 'Trabajas en Buenos Aires'],
        correctIndex: 0,
        explanation: 'Для nosotros окончание -amos: Trabajamos.'
      }
    ]
  },

  // 3. Present tense regular -er/-ir verbs - ID 3
  3: {
    id: 3,
    topicName: 'Present tense regular -er/-ir verbs',
    russianTitle: 'Настоящее время: глаголы на -ER и -IR',
    level: 'A1',
    category: 'Grammar',
    icon: '🍽️',
    summary: 'Глаголы 2-го спряжения (-ER: comer, beber, aprender) и 3-го спряжения (-IR: vivir, escribir, abrir) почти одинаковы по окончаниям. Разница только в форме мы (nosotros): -emos у глаголов на -ER и -imos у глаголов на -IR.',
    mnemonicRule: '-ER: -o, -es, -e, -EMOS, -éis, -en | -IR: -o, -es, -e, -IMOS, -ís, -en',
    visualSvg: `<svg viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#0f172a" rx="16"/>
  <g transform="translate(30, 20)">
    <rect width="300" height="140" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
    <text x="150" y="28" fill="#facc15" font-size="14" font-weight="extrabold" text-anchor="middle">-ER: COMER (есть)</text>
    <text x="25" y="60" fill="#f8fafc" font-size="12">yo com<tspan fill="#f59e0b" font-weight="bold">-o</tspan></text>
    <text x="160" y="60" fill="#f8fafc" font-size="12">nosotros com<tspan fill="#f59e0b" font-weight="bold">-emos</tspan></text>
    <text x="25" y="90" fill="#f8fafc" font-size="12">tú / vos com<tspan fill="#f59e0b" font-weight="bold">-es / -és</tspan></text>
    <text x="160" y="90" fill="#f8fafc" font-size="12">ellos com<tspan fill="#f59e0b" font-weight="bold">-en</tspan></text>
    <text x="25" y="120" fill="#f8fafc" font-size="12">él / ella com<tspan fill="#f59e0b" font-weight="bold">-e</tspan></text>
  </g>
  <g transform="translate(370, 20)">
    <rect width="300" height="140" rx="12" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
    <text x="150" y="28" fill="#34d399" font-size="14" font-weight="extrabold" text-anchor="middle">-IR: VIVIR (жить)</text>
    <text x="25" y="60" fill="#f8fafc" font-size="12">yo viv<tspan fill="#10b981" font-weight="bold">-o</tspan></text>
    <text x="160" y="60" fill="#f8fafc" font-size="12">nosotros viv<tspan fill="#10b981" font-weight="bold">-imos</tspan></text>
    <text x="25" y="90" fill="#f8fafc" font-size="12">tú / vos viv<tspan fill="#10b981" font-weight="bold">-es / -ís</tspan></text>
    <text x="160" y="90" fill="#f8fafc" font-size="12">ellos viv<tspan fill="#10b981" font-weight="bold">-en</tspan></text>
    <text x="25" y="120" fill="#f8fafc" font-size="12">él / ella viv<tspan fill="#10b981" font-weight="bold">-e</tspan></text>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Примеры спряжения',
        content: 'Сравните: comer (есть) и vivir (жить):',
        tables: [
          {
            headers: ['Лицо', 'COMER (-er)', 'VIVIR (-ir)', 'ESCRIBIR (-ir)'],
            rows: [
              ['yo', 'como', 'vivo', 'escribo'],
              ['tú (vos)', 'comes (comés)', 'vives (vivís)', 'escribes (escribís)'],
              ['él / ella / usted', 'come', 'vive', 'escribe'],
              ['nosotros', 'comemos', 'vivimos', 'escribimos'],
              ['ellos / ustedes', 'comen', 'viven', 'escriben']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Форма первого лица (yo) у всех трех спряжений ВСЕГДА оканчивается на -O (hablo, como, vivo)!',
    dialectNote: 'В Аргентине: vos comés (ударение на -és), vos vivís (ударение на -ís).',
    quickCheckQuiz: [
      {
        question: 'Как перевести: «Где вы живете?» (к группе людей, ustedes)?',
        options: ['¿Dónde viven ustedes?', '¿Dónde vivís ustedes?', '¿Dónde vivimos?', '¿Dónde vivo?'],
        correctIndex: 0,
        explanation: 'Для ustedes окончание -en: ¿Dónde viven?'
      }
    ]
  },

  // 12. Gustar and similar verbs - ID 12
  12: {
    id: 12,
    topicName: 'Gustar and similar verbs',
    russianTitle: 'Глагол GUSTAR: зеркальная логика «нравиться»',
    level: 'A1',
    category: 'Grammar',
    icon: '❤️',
    summary: 'Глагол GUSTAR работает не так, как в английском (I like), а буквально как в русском: «МНЕ НРАВИТСЯ ЧТО-ТО». Глагол согласуется не с человеком, а с тем ПРЕДМЕТОМ, который нравится!',
    mnemonicRule: '1 предмет или действие ➔ GUSTA | Много предметов ➔ GUSTAN',
    visualSvg: `<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto rounded-xl">
  <rect width="100%" height="100%" fill="#1e293b" rx="16"/>
  <g transform="translate(30, 20)">
    <text x="320" y="26" fill="#f43f5e" font-size="16" font-weight="extrabold" text-anchor="middle">ЗЕРКАЛЬНАЯ ЛОГИКА: [КОМУ] + GUSTA / GUSTAN + [ЧТО]</text>
    <g transform="translate(40, 50)">
      <rect width="250" height="90" rx="12" fill="#334155" stroke="#f43f5e" stroke-width="2"/>
      <text x="125" y="30" fill="#fecdd3" font-size="13" text-anchor="middle">ОДИН ПРЕДМЕТ / ДЕЙСТВИЕ</text>
      <text x="125" y="60" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">Me <tspan fill="#f43f5e">GUSTA</tspan> el café</text>
      <text x="125" y="78" fill="#cbd5e1" font-size="11" text-anchor="middle">Me gusta bailar</text>
    </g>
    <g transform="translate(350, 50)">
      <rect width="250" height="90" rx="12" fill="#334155" stroke="#38bdf8" stroke-width="2"/>
      <text x="125" y="30" fill="#bae6fd" font-size="13" text-anchor="middle">МНОЖЕСТВЕННОЕ ЧИСЛО</text>
      <text x="125" y="60" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">Me <tspan fill="#38bdf8">GUSTAN</tspan> los tacos</text>
      <text x="125" y="78" fill="#cbd5e1" font-size="11" text-anchor="middle">Me gustan las medialunas</text>
    </g>
  </g>
</svg>`,
    sections: [
      {
        title: '1. Местоимения дательного падежа (Кому?)',
        content: 'Перед глаголом gustar ставится местоимение, показывающее, кому нравится:',
        tables: [
          {
            headers: ['Кому?', 'Испанский', 'Пример (ед.ч. gusta)', 'Пример (мн.ч. gustan)'],
            rows: [
              ['мне', 'me', 'Me gusta la música', 'Me gustan los gatos'],
              ['тебе', 'te', '¿Te gusta el mate?', '¿Te gustan las películas?'],
              ['ему / ей / Вам', 'le', 'Le gusta viajar', 'Le gustan los libros'],
              ['нам', 'nos', 'Nos gusta Argentina', 'Nos gustan las empanadas'],
              ['вам (Испания)', 'os', '¿Os gusta el vino?', '¿Os gustan las tapas?'],
              ['им / Вам всем', 'les', 'Les gusta el fútbol', 'Les gustan las ciudades']
            ]
          }
        ]
      },
      {
        title: '2. Другие глаголы, работающие точно так же',
        content: 'Эти полезные глаголы используют ту же грамматику:',
        tables: [
          {
            headers: ['Глагол', 'Значение', 'Пример'],
            rows: [
              ['encantar', 'очень сильно нравиться / обожать', '¡Me encanta Buenos Aires!'],
              ['interesar', 'интересовать', 'Me interesa la historia'],
              ['importar', 'иметь значение / волновать', 'No me importa (Мне все равно)'],
              ['doler (o->ue)', 'болеть (о теле)', 'Me duele la cabeza (Болит голова)']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Никогда не говорите «Yo gusto»! Только «Me gusta» (Мне нравится) или «A mí me gusta» для логического ударения.',
    dialectNote: 'В Аргентине фраза «Me encanta» выражает высшую степень восторга: «¡Che, me encanta este boliche!» (Мне безумно нравится этот клуб!).',
    quickCheckQuiz: [
      {
        question: 'Как правильно сказать: «Мне нравятся эти книги»?',
        options: ['Me gusto estos libros', 'Me gustan estos libros', 'Yo gusto estos libros', 'Me gusta estos libros'],
        correctIndex: 1,
        explanation: 'Так как «libros» во множественном числе, форма глагола — gustan.'
      }
    ]
  },

  // 11. Tener and tener expressions - ID 11
  11: {
    id: 11,
    topicName: 'Tener (to have) and tener expressions',
    russianTitle: 'Глагол TENER и идиомы физического состояния',
    level: 'A1',
    category: 'Grammar',
    icon: '🤝',
    summary: 'Глагол TENER означает «иметь / обладать». Но в испанском он также используется там, где в русском мы говорим «мне холодно», «я хочу есть», «мне 25 лет»!',
    mnemonicRule: 'В испанском возраст и физические ощущения ИМЕЮТ (Tener calor, tener hambre, tener 25 años)',
    sections: [
      {
        title: '1. Спряжение TENER (неправильный глагол)',
        content: 'Обратите внимание на форму yo (tengo) и чередование e->ie в остальных:',
        tables: [
          {
            headers: ['Лицо', 'Форма TENER', 'Пример'],
            rows: [
              ['yo', 'tengo', 'Tengo un hermano (У меня есть брат)'],
              ['tú (vos)', 'tienes (tenés)', '¿Tienes tiempo? / ¿Tenés mate?'],
              ['él / ella / usted', 'tiene', 'Tiene una casa grande'],
              ['nosotros', 'tenemos', 'Tenemos hambre (Мы голодны)'],
              ['ellos / ustedes', 'tienen', 'Tienen sed (Они хотят пить)']
            ]
          }
        ]
      },
      {
        title: '2. Топ-8 идиом с глаголом TENER',
        content: 'Запомните эти готовые фразы:',
        tables: [
          {
            headers: ['Испанское выражение', 'Буквально', 'Русский перевод'],
            rows: [
              ['Tener ... años', 'Иметь ... лет', 'Tengo 30 años (Мне 30 лет)'],
              ['Tener hambre', 'Иметь голод', 'Tengo mucha hambre (Я очень голоден)'],
              ['Tener sed', 'Иметь жажду', 'Tengo sed (Я хочу пить)'],
              ['Tener frío / calor', 'Иметь холод / жар', 'Tengo frío (Мне холодно)'],
              ['Tener sueño', 'Иметь сон', 'Tengo sueño (Я хочу спать)'],
              ['Tener miedo', 'Иметь страх', 'Tengo miedo (Мне страшно)'],
              ['Tener prisa', 'Иметь спешку', 'Tengo prisa (Я спешу)'],
              ['Tener que + infinitivo', 'Иметь обязанность', 'Tengo que estudiar (Я должен учиться)']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Не говорите «Soy 25 años» или «Estoy hambre»! В испанском возраст и голод «имеют»: Tengo 25 años, Tengo hambre.',
    dialectNote: 'В Аргентине форма для vos: «vos tenés» (ударение на последний слог). «¿Tenés fuego, che?» (Есть огонька / зажигалка, дружище?).',
    quickCheckQuiz: [
      {
        question: 'Как сказать «Мне 20 лет и я хочу есть»?',
        options: ['Soy 20 años y estoy hambre', 'Tengo 20 años y tengo hambre', 'Estoy 20 años y soy hambre', 'Tengo 20 años y quiero comer hambre'],
        correctIndex: 1,
        explanation: 'И возраст, и голод выражаются через глагол tener.'
      }
    ]
  },

  // 4. Gender and articles - ID 4
  4: {
    id: 4,
    topicName: 'Gender and articles (el/la/los/las)',
    russianTitle: 'Род существительных и определенный артикль',
    level: 'A1',
    category: 'Grammar',
    icon: '🏷️',
    summary: 'В испанском все существительные мужского (el/los) или женского (la/las) рода. Обычно -o ➔ мужской, -a ➔ женский. Но есть важные греческие слова на -ma мужского рода и несколько ярких исключений!',
    mnemonicRule: '-O = Мужской (el) | -A, -CIÓN, -DAD = Женский (la) | Слова на -MA = Мужской (el problema)',
    sections: [
      {
        title: '1. Определенные артикли (The)',
        content: 'Указывают на конкретный, уже знакомый предмет:',
        tables: [
          {
            headers: ['Род', 'Единственное число', 'Множественное число', 'Пример'],
            rows: [
              ['Мужской род (Masculino)', 'EL', 'LOS', 'el libro ➔ los libros'],
              ['Женский род (Femenino)', 'LA', 'LAS', 'la mesa ➔ las mesas']
            ]
          }
        ]
      },
      {
        title: '2. Ловушка: Слова на -MA мужского рода!',
        content: 'Слова греческого происхождения на -ma ВСЕГДА мужского рода:',
        tables: [
          {
            headers: ['Слово', 'Перевод', 'Почему мужской род?'],
            rows: [
              ['EL problema', 'проблема', 'Греческий корень на -ma'],
              ['EL idioma', 'язык (иностранный)', 'Греческий корень на -ma'],
              ['EL tema', 'тема', 'Греческий корень на -ma'],
              ['EL sistema', 'система', 'Греческий корень на -ma'],
              ['EL planeta', 'планета', 'Греческий корень на -ta']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Никогда не говорите «la problema»! Правильно: EL PROBLEMA, EL IDIOMA, EL TEMA.',
    dialectNote: 'В разговорной речи Рио-де-ла-Платы артикль часто сливается с предлогом: a + el = al (voy al café), de + el = del (vengo del centro).',
    quickCheckQuiz: [
      {
        question: 'Какой артикль у слова «problema»?',
        options: ['La problema', 'El problema', 'Una problema', 'Las problema'],
        correctIndex: 1,
        explanation: 'Слова на -ma греческого происхождения мужского рода: el problema.'
      }
    ]
  },

  // 7. Subject pronouns - ID 7
  7: {
    id: 7,
    topicName: 'Subject pronouns (yo/tú/vos/él/ella)',
    russianTitle: 'Личные местоимения в роли подлежащего',
    level: 'A1',
    category: 'Grammar',
    icon: '👤',
    summary: 'Личные местоимения указывают, кто выполняет действие (я, ты, он, мы, вы, они). В испанском языке они часто опускаются, так как окончание глагола уже указывает на лицо.',
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
              ['3-е ед. (муж.)', 'él', 'он', 'Везде'],
              ['3-е ед. (жен.)', 'ella', 'она', 'Везде'],
              ['3-е ед. (вежл.)', 'usted', 'Вы (один человек)', 'Везде'],
              ['1-е мн.', 'nosotros / nosotras', 'мы', 'Везде'],
              ['2-е мн. (Испания)', 'vosotros / vosotras', 'вы (неформально)', 'Только в Испании'],
              ['3-е мн. / 2-е мн.', 'ellos / ellas / ustedes', 'они / Вы (все)', 'Ustedes используется везде в Латинской Америке']
            ]
          }
        ]
      }
    ],
    trapAlert: 'Не путайте «él» (он - с графическим ударением) и «el» (артикль мужского рода без ударения)!',
    dialectNote: 'В Латинской Америке форма «vosotros» вообще не используется — вместо нее для группы людей всегда говорят «ustedes».',
    quickCheckQuiz: [
      {
        question: 'Какое местоимение используется в Аргентине для неформального «ты»?',
        options: ['Tú', 'Vos', 'Usted', 'Vosotros'],
        correctIndex: 1,
        explanation: 'В Аргентине повсеместно используется voseo: vos.'
      }
    ]
  }
};

export function getGrammarTheoryGuide(topicId) {
  if (!topicId) return null;
  const numId = Number(topicId);
  return GRAMMAR_THEORY_GUIDES[numId] || null;
}
