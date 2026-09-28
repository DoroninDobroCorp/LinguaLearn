// Visual metadata and thematic illustration matcher for Spanish vocabulary
// Optimized for children, everyday Argentine context, and general CEFR vocabulary.

export function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getWordVisualMeta(word = '', translation = '', domain = '') {
  const normW = normalizeText(word);
  const normT = normalizeText(translation);
  const normD = normalizeText(domain);

  // 1. GREETINGS & SOCIAL (⭐ Группа 1 и основы общения)
  if (normW === 'hola' || normT.includes('привет') || normT.includes('здравствуй')) {
    return {
      emoji: '👋',
      tag: 'Приветствие',
      svgKind: 'waving_hand',
      gradient: 'from-amber-400 via-orange-400 to-yellow-300',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#f59e0b'
    };
  }
  if (normW === 'chau' || normW.includes('adios') || normW.includes('hasta') || normT.includes('пока') || normT.includes('до свидания')) {
    return {
      emoji: '🙋',
      tag: 'Прощание',
      svgKind: 'farewell',
      gradient: 'from-teal-400 via-cyan-500 to-blue-500',
      bgCard: 'bg-teal-50/90 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700',
      accentColor: '#0d9488'
    };
  }
  if (normW.includes('gracias') || normT.includes('спасибо')) {
    return {
      emoji: '🙏',
      tag: 'Вежливость',
      svgKind: 'heart_spark',
      gradient: 'from-emerald-400 via-green-500 to-teal-600',
      bgCard: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700',
      accentColor: '#10b981'
    };
  }
  if (normW.includes('favor') || normT.includes('пожалуйста')) {
    return {
      emoji: '🤲',
      tag: 'Просьба',
      svgKind: 'magic_wand',
      gradient: 'from-sky-400 via-blue-500 to-indigo-500',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW === 'si' || normT === 'да') {
    return {
      emoji: '✅',
      tag: 'Согласие',
      svgKind: 'checkmark',
      gradient: 'from-green-400 via-emerald-500 to-teal-500',
      bgCard: 'bg-green-50/90 dark:bg-green-950/40 border-green-300 dark:border-green-700',
      accentColor: '#16a34a'
    };
  }
  if (normW === 'no' || normT === 'нет') {
    return {
      emoji: '🛑',
      tag: 'Отказ',
      svgKind: 'cross_mark',
      gradient: 'from-rose-400 via-red-500 to-pink-500',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#e11d48'
    };
  }
  if (normW === 'dale' || normW === 'che' || normT.includes('давай') || normT.includes('ладно')) {
    return {
      emoji: '🤝',
      tag: 'Дружеское слово',
      svgKind: 'handshake',
      gradient: 'from-fuchsia-400 via-purple-500 to-indigo-500',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#9333ea'
    };
  }

  // 2. ESSENTIAL SURVIVAL & DRINK (вода, туалет)
  if (normW.includes('agua') || normT.includes('вод')) {
    return {
      emoji: '💧',
      tag: 'Вода и напитки',
      svgKind: 'water_glass',
      gradient: 'from-cyan-400 via-sky-500 to-blue-600',
      bgCard: 'bg-cyan-50/90 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
      accentColor: '#0891b2'
    };
  }
  if (normW.includes('bano') || normT.includes('туалет')) {
    return {
      emoji: '🚻',
      tag: 'Комната / Туалет',
      svgKind: 'bathroom',
      gradient: 'from-indigo-400 via-sky-500 to-teal-500',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#4f46e5'
    };
  }

  // 3. ANIMALS (животные)
  if (normW.includes('perro') || normT.includes('собак') || normT.includes('пес')) {
    return {
      emoji: '🐶',
      tag: 'Животные',
      svgKind: 'dog',
      gradient: 'from-amber-400 via-orange-400 to-rose-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('gato') || normT.includes('кот') || normT.includes('кошк')) {
    return {
      emoji: '🐱',
      tag: 'Животные',
      svgKind: 'cat',
      gradient: 'from-orange-400 via-amber-400 to-yellow-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }

  // 4. FAMILY (семья)
  if (normW.includes('mama') || normT.includes('мам')) {
    return {
      emoji: '👩‍👧',
      tag: 'Семья',
      svgKind: 'mom',
      gradient: 'from-rose-400 via-pink-400 to-purple-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('papa') && !normT.includes('картоф') || normT.includes('пап')) {
    return {
      emoji: '👨‍👧',
      tag: 'Семья',
      svgKind: 'dad',
      gradient: 'from-blue-400 via-indigo-400 to-sky-400',
      bgCard: 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700',
      accentColor: '#2563eb'
    };
  }
  if (normW.includes('herman') || normT.includes('брат') || normT.includes('сестр')) {
    return {
      emoji: '👫',
      tag: 'Семья',
      svgKind: 'siblings',
      gradient: 'from-violet-400 via-purple-400 to-indigo-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#7c3aed'
    };
  }
  if (normW.includes('abuel') || normT.includes('дедушк') || normT.includes('бабушк')) {
    return {
      emoji: '👵',
      tag: 'Семья',
      svgKind: 'grandparents',
      gradient: 'from-amber-400 via-rose-300 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#b45309'
    };
  }
  if (normW.includes('amig') || normT.includes('друг') || normT.includes('подруг')) {
    return {
      emoji: '👯‍♀️',
      tag: 'Друзья',
      svgKind: 'friends',
      gradient: 'from-pink-400 via-purple-400 to-indigo-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#db2777'
    };
  }

  // 5. SCHOOL & CLASS (🎒 Группа 2)
  if (normW.includes('mochila') || normT.includes('рюкзак') || normT.includes('портфель')) {
    return {
      emoji: '🎒',
      tag: 'Школа и класс',
      svgKind: 'backpack',
      gradient: 'from-indigo-400 via-purple-400 to-pink-400',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#6366f1'
    };
  }
  if (normW.includes('lapiz') || normT.includes('карандаш')) {
    return {
      emoji: '✏️',
      tag: 'Школа и канцелярия',
      svgKind: 'pencil',
      gradient: 'from-amber-400 via-yellow-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('cuaderno') || normT.includes('тетрадь')) {
    return {
      emoji: '📓',
      tag: 'Школа и учеба',
      svgKind: 'notebook',
      gradient: 'from-sky-400 via-cyan-400 to-blue-400',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('goma') || normT.includes('ластик') || normT.includes('стерк')) {
    return {
      emoji: '🧼',
      tag: 'Школа и канцелярия',
      svgKind: 'eraser',
      gradient: 'from-pink-400 via-rose-400 to-purple-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#f43f5e'
    };
  }
  if (normW.includes('tijera') || normT.includes('ножниц')) {
    return {
      emoji: '✂️',
      tag: 'Школа и творчество',
      svgKind: 'scissors',
      gradient: 'from-cyan-400 via-teal-400 to-emerald-400',
      bgCard: 'bg-teal-50/90 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700',
      accentColor: '#0d9488'
    };
  }
  if (normW.includes('libro') || normT.includes('книг')) {
    return {
      emoji: '📖',
      tag: 'Чтение и книги',
      svgKind: 'book',
      gradient: 'from-blue-400 via-indigo-400 to-purple-400',
      bgCard: 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700',
      accentColor: '#2563eb'
    };
  }
  if (normW.includes('dibuj') || normT.includes('рисовать') || normW.includes('pintar') || normT.includes('краск')) {
    return {
      emoji: '🎨',
      tag: 'Творчество',
      svgKind: 'art_palette',
      gradient: 'from-fuchsia-400 via-rose-400 to-amber-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#c026d3'
    };
  }
  if (normW.includes('seno') || normW.includes('profesor') || normT.includes('учитель')) {
    return {
      emoji: '👩‍🏫',
      tag: 'Школа',
      svgKind: 'teacher',
      gradient: 'from-purple-400 via-indigo-400 to-sky-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#7c3aed'
    };
  }
  if (normW.includes('recreo') || normT.includes('перемен')) {
    return {
      emoji: '🔔',
      tag: 'Школа и отдых',
      svgKind: 'bell_joy',
      gradient: 'from-amber-400 via-yellow-400 to-green-400',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#ca8a04'
    };
  }

  // 6. COLORS (цвета)
  if (normW === 'rojo' || normT.includes('красн')) {
    return {
      emoji: '🔴',
      tag: 'Красный цвет',
      svgKind: 'color_red',
      gradient: 'from-red-500 via-rose-500 to-pink-600',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700',
      accentColor: '#dc2626'
    };
  }
  if (normW === 'azul' || normT.includes('син') || normT.includes('голуб')) {
    return {
      emoji: '🔵',
      tag: 'Синий цвет',
      svgKind: 'color_blue',
      gradient: 'from-blue-400 via-sky-500 to-indigo-600',
      bgCard: 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700',
      accentColor: '#2563eb'
    };
  }
  if (normW === 'amarillo' || normT.includes('желт')) {
    return {
      emoji: '🟡',
      tag: 'Жёлтый цвет',
      svgKind: 'color_yellow',
      gradient: 'from-yellow-300 via-amber-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#eab308'
    };
  }
  if (normW === 'verde' || normT.includes('зелен')) {
    return {
      emoji: '🟢',
      tag: 'Зелёный цвет',
      svgKind: 'color_green',
      gradient: 'from-emerald-400 via-green-500 to-teal-500',
      bgCard: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700',
      accentColor: '#16a34a'
    };
  }
  if (normW === 'blanco' || normT.includes('бел')) {
    return {
      emoji: '⚪',
      tag: 'Белый цвет',
      svgKind: 'color_white',
      gradient: 'from-slate-200 via-zinc-200 to-gray-300',
      bgCard: 'bg-slate-50/90 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700',
      accentColor: '#64748b'
    };
  }
  if (normW === 'negro' || normT.includes('черн')) {
    return {
      emoji: '⚫',
      tag: 'Чёрный цвет',
      svgKind: 'color_black',
      gradient: 'from-neutral-700 via-gray-800 to-slate-900',
      bgCard: 'bg-gray-100/90 dark:bg-gray-900/70 border-gray-400 dark:border-gray-600',
      accentColor: '#334155'
    };
  }
  if (normW.includes('color') || normT.includes('цвет')) {
    return {
      emoji: '🌈',
      tag: 'Цвета',
      svgKind: 'rainbow',
      gradient: 'from-rose-400 via-amber-400 to-emerald-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#8b5cf6'
    };
  }

  // 7. FOOD, TREATS & KIOSCO (🍎 Группа 3)
  if (normW.includes('alfajor') || normT.includes('альфахор')) {
    return {
      emoji: '🍪',
      tag: 'Сладости / Аргентина',
      svgKind: 'alfajor',
      gradient: 'from-amber-400 via-orange-400 to-amber-600',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#b45309'
    };
  }
  if (normW.includes('medialuna') || normT.includes('медиалун') || normT.includes('круассан')) {
    return {
      emoji: '🥐',
      tag: 'Выпечка / Завтрак',
      svgKind: 'croissant',
      gradient: 'from-amber-300 via-yellow-400 to-orange-400',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('helado') || normT.includes('морожен')) {
    return {
      emoji: '🍦',
      tag: 'Мороженое / Вкусности',
      svgKind: 'ice_cream',
      gradient: 'from-pink-400 via-rose-400 to-purple-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#ec4899'
    };
  }
  if (normW.includes('leche') || normT.includes('молок')) {
    return {
      emoji: '🥛',
      tag: 'Напитки',
      svgKind: 'milk_box',
      gradient: 'from-sky-300 via-blue-400 to-indigo-400',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('jugo') || normT.includes('сок')) {
    return {
      emoji: '🧃',
      tag: 'Напитки',
      svgKind: 'juice_box',
      gradient: 'from-orange-400 via-amber-400 to-yellow-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }
  if (normW.includes('pan') && !normT.includes('картоф') || normT.includes('хлеб')) {
    return {
      emoji: '🥖',
      tag: 'Еда и выпечка',
      svgKind: 'bread',
      gradient: 'from-amber-400 via-yellow-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#b45309'
    };
  }
  if (normW.includes('manzana') || normT.includes('яблок')) {
    return {
      emoji: '🍎',
      tag: 'Фрукты',
      svgKind: 'apple',
      gradient: 'from-rose-500 via-red-500 to-emerald-400',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('banana') || normT.includes('банан')) {
    return {
      emoji: '🍌',
      tag: 'Фрукты',
      svgKind: 'banana',
      gradient: 'from-yellow-300 via-amber-400 to-yellow-500',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#ca8a04'
    };
  }
  if (normW.includes('galletit') || normT.includes('печень')) {
    return {
      emoji: '🍪',
      tag: 'Сладости',
      svgKind: 'cookies',
      gradient: 'from-amber-400 via-orange-400 to-yellow-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#b45309'
    };
  }
  if (normW.includes('chocolate') || normT.includes('шоколад')) {
    return {
      emoji: '🍫',
      tag: 'Сладости',
      svgKind: 'chocolate',
      gradient: 'from-amber-600 via-stone-700 to-amber-800',
      bgCard: 'bg-amber-50/90 dark:bg-stone-900/60 border-amber-300 dark:border-amber-700',
      accentColor: '#78350f'
    };
  }
  if (normW.includes('queso') || normT.includes('сыр')) {
    return {
      emoji: '🧀',
      tag: 'Еда',
      svgKind: 'cheese',
      gradient: 'from-yellow-400 via-amber-400 to-orange-400',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('pizza') || normT.includes('пицц')) {
    return {
      emoji: '🍕',
      tag: 'Еда',
      svgKind: 'pizza',
      gradient: 'from-red-400 via-amber-400 to-orange-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }
  if (normW === 'rico' || normT.includes('вкусн')) {
    return {
      emoji: '😋',
      tag: 'Вкусно!',
      svgKind: 'yummy_face',
      gradient: 'from-amber-400 via-rose-400 to-pink-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#f59e0b'
    };
  }
  if (normW.includes('hambre') || normT.includes('голод')) {
    return {
      emoji: '🥪',
      tag: 'Аппетит / Голод',
      svgKind: 'appetite',
      gradient: 'from-orange-400 via-amber-500 to-yellow-500',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('sed') || normT.includes('жажд')) {
    return {
      emoji: '🥤',
      tag: 'Жажда',
      svgKind: 'thirst',
      gradient: 'from-cyan-400 via-sky-500 to-blue-500',
      bgCard: 'bg-cyan-50/90 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('quiosco') || normT.includes('киоск')) {
    return {
      emoji: '🏪',
      tag: 'Киоск / Магазин',
      svgKind: 'store_kiosco',
      gradient: 'from-fuchsia-400 via-purple-500 to-pink-500',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#a855f7'
    };
  }
  if (normW.includes('plata') || normT.includes('деньг') || normW.includes('cuanto') || normT.includes('сто')) {
    return {
      emoji: '🪙',
      tag: 'Покупки и деньги',
      svgKind: 'coins_shopping',
      gradient: 'from-yellow-400 via-amber-400 to-orange-400',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('merienda') || normT.includes('полдник')) {
    return {
      emoji: '🧁',
      tag: 'Полдник / Мериенда',
      svgKind: 'afternoon_snack',
      gradient: 'from-pink-400 via-purple-400 to-amber-300',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#ec4899'
    };
  }

  // 8. PLAYGROUND & GAMES (🛝 Группа 4)
  if (normW.includes('pelota') || normT.includes('мяч')) {
    return {
      emoji: '⚽',
      tag: 'Игры и спорт',
      svgKind: 'soccer_ball',
      gradient: 'from-emerald-400 via-teal-400 to-sky-400',
      bgCard: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700',
      accentColor: '#059669'
    };
  }
  if (normW.includes('plaza') || normT.includes('парк') || normT.includes('площадк')) {
    return {
      emoji: '🌳',
      tag: 'Площадка / Парк',
      svgKind: 'park_plaza',
      gradient: 'from-green-400 via-emerald-500 to-teal-500',
      bgCard: 'bg-green-50/90 dark:bg-green-950/40 border-green-300 dark:border-green-700',
      accentColor: '#16a34a'
    };
  }
  if (normW.includes('hamaca') || normT.includes('качел')) {
    return {
      emoji: '🎪',
      tag: 'Качели на площадке',
      svgKind: 'swings',
      gradient: 'from-purple-400 via-pink-400 to-rose-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#9333ea'
    };
  }
  if (normW.includes('tobogan') || normT.includes('горк')) {
    return {
      emoji: '🛝',
      tag: 'Горка на площадке',
      svgKind: 'playground_slide',
      gradient: 'from-amber-400 via-orange-400 to-rose-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#f97316'
    };
  }
  if (normW.includes('correr') || normT.includes('бег')) {
    return {
      emoji: '🏃‍♀️',
      tag: 'Бег и движение',
      svgKind: 'running',
      gradient: 'from-orange-400 via-amber-400 to-yellow-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }
  if (normW.includes('saltar') || normT.includes('прыг')) {
    return {
      emoji: '🦘',
      tag: 'Прыжки и радость',
      svgKind: 'jumping',
      gradient: 'from-cyan-400 via-teal-400 to-emerald-400',
      bgCard: 'bg-teal-50/90 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700',
      accentColor: '#0d9488'
    };
  }
  if (normW.includes('gane') || normT.includes('выигра')) {
    return {
      emoji: '🏆',
      tag: 'Победа!',
      svgKind: 'trophy_win',
      gradient: 'from-amber-300 via-yellow-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('turno') || normT.includes('очеред')) {
    return {
      emoji: '⏳',
      tag: 'Очередь играть',
      svgKind: 'turn_taking',
      gradient: 'from-indigo-400 via-purple-400 to-pink-400',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#6366f1'
    };
  }

  // 9. BODY & FEELINGS (тело и эмоции)
  if (normW.includes('mano') || normT.includes('рук') || normT.includes('ладон')) {
    return {
      emoji: '✋',
      tag: 'Тело',
      svgKind: 'hand',
      gradient: 'from-amber-300 via-orange-300 to-rose-300',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('cabeza') || normT.includes('голов')) {
    return {
      emoji: '👧',
      tag: 'Тело',
      svgKind: 'head',
      gradient: 'from-rose-300 via-pink-300 to-purple-300',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('ojo') || normT.includes('глаз')) {
    return {
      emoji: '👀',
      tag: 'Тело',
      svgKind: 'eyes',
      gradient: 'from-sky-400 via-blue-400 to-indigo-400',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('boca') || normT.includes('рот')) {
    return {
      emoji: '👄',
      tag: 'Тело',
      svgKind: 'mouth',
      gradient: 'from-rose-400 via-pink-400 to-red-400',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#f43f5e'
    };
  }
  if (normW.includes('pie') || normT.includes('ног') || normT.includes('стоп')) {
    return {
      emoji: '🦶',
      tag: 'Тело',
      svgKind: 'foot',
      gradient: 'from-orange-300 via-amber-300 to-yellow-300',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#d97706'
    };
  }
  if (normW.includes('doler') || normW.includes('duele') || normT.includes('бол')) {
    return {
      emoji: '🩹',
      tag: 'Самочувствие',
      svgKind: 'bandage',
      gradient: 'from-rose-400 via-red-400 to-amber-400',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('cansad') || normT.includes('устал')) {
    return {
      emoji: '🥱',
      tag: 'Состояние',
      svgKind: 'sleepy',
      gradient: 'from-indigo-400 via-purple-400 to-slate-400',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#6366f1'
    };
  }
  if (normW.includes('feliz') || normW.includes('content') || normT.includes('счастлив') || normT.includes('рад')) {
    return {
      emoji: '🥰',
      tag: 'Радость и счастье',
      svgKind: 'happy_face',
      gradient: 'from-amber-300 via-yellow-400 to-rose-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#f59e0b'
    };
  }
  if (normW.includes('lindo') || normT.includes('красив') || normT.includes('мил')) {
    return {
      emoji: '✨',
      tag: 'Красота',
      svgKind: 'pretty_sparkles',
      gradient: 'from-pink-400 via-fuchsia-400 to-rose-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#ec4899'
    };
  }
  if (normW.includes('copado') || normT.includes('классн') || normT.includes('крут')) {
    return {
      emoji: '😎',
      tag: 'Круто! / Аргентина',
      svgKind: 'cool_sunglasses',
      gradient: 'from-cyan-400 via-blue-500 to-indigo-600',
      bgCard: 'bg-cyan-50/90 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
      accentColor: '#06b6d4'
    };
  }

  // 10. HOME & DAILY WORLD (🏠 Группа 5)
  if (normW.includes('casa') || normT.includes('дом')) {
    return {
      emoji: '🏠',
      tag: 'Дом',
      svgKind: 'house',
      gradient: 'from-amber-400 via-orange-400 to-rose-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#ea580c'
    };
  }
  if (normW.includes('cama') || normT.includes('кроват')) {
    return {
      emoji: '🛏️',
      tag: 'Комната и дом',
      svgKind: 'bed',
      gradient: 'from-indigo-400 via-purple-400 to-sky-400',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#6366f1'
    };
  }
  if (normW.includes('mesa') || normT.includes('стол')) {
    return {
      emoji: '🪑',
      tag: 'Мебель в доме',
      svgKind: 'table',
      gradient: 'from-amber-400 via-yellow-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#b45309'
    };
  }
  if (normW.includes('silla') || normT.includes('стул')) {
    return {
      emoji: '🪑',
      tag: 'Мебель в доме',
      svgKind: 'chair',
      gradient: 'from-sky-400 via-blue-400 to-indigo-400',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('puerta') || normT.includes('двер')) {
    return {
      emoji: '🚪',
      tag: 'Дом',
      svgKind: 'door',
      gradient: 'from-amber-500 via-orange-500 to-stone-600',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#9a3412'
    };
  }
  if (normW.includes('ventana') || normT.includes('окн')) {
    return {
      emoji: '🪟',
      tag: 'Дом',
      svgKind: 'window',
      gradient: 'from-cyan-400 via-sky-400 to-blue-400',
      bgCard: 'bg-cyan-50/90 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
      accentColor: '#0891b2'
    };
  }
  if (normW.includes('auto') || normW.includes('coche') || normT.includes('машин') || normT.includes('авто')) {
    return {
      emoji: '🚗',
      tag: 'Транспорт',
      svgKind: 'car',
      gradient: 'from-rose-400 via-red-500 to-amber-400',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('sol') || normT.includes('солн')) {
    return {
      emoji: '☀️',
      tag: 'Природа и погода',
      svgKind: 'sun',
      gradient: 'from-amber-300 via-yellow-400 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#f59e0b'
    };
  }
  if (normW.includes('lluvia') || normT.includes('дожд')) {
    return {
      emoji: '🌧️',
      tag: 'Погода',
      svgKind: 'rain',
      gradient: 'from-cyan-400 via-blue-400 to-slate-400',
      bgCard: 'bg-cyan-50/90 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('dia') || normT.includes('день')) {
    return {
      emoji: '🌅',
      tag: 'Время дня',
      svgKind: 'daytime',
      gradient: 'from-amber-300 via-sky-300 to-orange-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#f59e0b'
    };
  }
  if (normW.includes('noche') || normT.includes('ноч')) {
    return {
      emoji: '🌙',
      tag: 'Время дня',
      svgKind: 'night_moon',
      gradient: 'from-indigo-600 via-purple-700 to-slate-800',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#4f46e5'
    };
  }
  if (normW.includes('grande') || normT.includes('больш')) {
    return {
      emoji: '🐘',
      tag: 'Размер',
      svgKind: 'big_size',
      gradient: 'from-purple-400 via-indigo-500 to-blue-500',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#7c3aed'
    };
  }
  if (normW.includes('chiquit') || normW.includes('pequen') || normT.includes('маленьк')) {
    return {
      emoji: '🐣',
      tag: 'Размер',
      svgKind: 'tiny_size',
      gradient: 'from-yellow-300 via-amber-400 to-rose-300',
      bgCard: 'bg-yellow-50/90 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-700',
      accentColor: '#ca8a04'
    };
  }
  if (normW.includes('calor') || normT.includes('жар') || normT.includes('тепл')) {
    return {
      emoji: '🌡️',
      tag: 'Погода и тепло',
      svgKind: 'hot_weather',
      gradient: 'from-orange-400 via-red-400 to-amber-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }
  if (normW.includes('frio') || normT.includes('холод')) {
    return {
      emoji: '❄️',
      tag: 'Погода и холод',
      svgKind: 'cold_snow',
      gradient: 'from-sky-300 via-cyan-400 to-blue-500',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }

  // 11. ACTIONS (играть, кушать, хочу, имею, ждать, помогать, слушать)
  if (normW.includes('jugar') || normT.includes('игр')) {
    return {
      emoji: '🎲',
      tag: 'Игра и веселье',
      svgKind: 'playing_blocks',
      gradient: 'from-pink-400 via-rose-400 to-amber-400',
      bgCard: 'bg-pink-50/90 dark:bg-pink-950/40 border-pink-300 dark:border-pink-700',
      accentColor: '#ec4899'
    };
  }
  if (normW.includes('comer') || normT.includes('кушать') || normT.includes('есть')) {
    return {
      emoji: '🍽️',
      tag: 'Приём пищи',
      svgKind: 'eating',
      gradient: 'from-amber-400 via-orange-400 to-yellow-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#ea580c'
    };
  }
  if (normW.includes('quiero') || normW.includes('querer') || normT.includes('хоч')) {
    return {
      emoji: '💖',
      tag: 'Желание',
      svgKind: 'heart_wish',
      gradient: 'from-rose-400 via-pink-400 to-fuchsia-400',
      bgCard: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700',
      accentColor: '#e11d48'
    };
  }
  if (normW.includes('tengo') || normW.includes('tener') || normT.includes('иметь') || normT.includes('есть')) {
    return {
      emoji: '🎁',
      tag: 'Обладание',
      svgKind: 'gift_box',
      gradient: 'from-purple-400 via-indigo-400 to-sky-400',
      bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
      accentColor: '#7c3aed'
    };
  }
  if (normW.includes('esperar') || normT.includes('ждать')) {
    return {
      emoji: '⏱️',
      tag: 'Терпение и ожидание',
      svgKind: 'timer_clock',
      gradient: 'from-sky-400 via-cyan-400 to-teal-400',
      bgCard: 'bg-sky-50/90 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
      accentColor: '#0284c7'
    };
  }
  if (normW.includes('ayudar') || normT.includes('помог')) {
    return {
      emoji: '🤝',
      tag: 'Помощь и забота',
      svgKind: 'helping_hands',
      gradient: 'from-emerald-400 via-teal-400 to-sky-400',
      bgCard: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700',
      accentColor: '#059669'
    };
  }

  // 12. GENERAL DOMAINS & SENSE FALLBACKS
  if (normD.includes('food') || normT.includes('еда')) {
    return {
      emoji: '🥪',
      tag: 'Еда и напитки',
      svgKind: 'food_general',
      gradient: 'from-amber-400 via-orange-400 to-yellow-400',
      bgCard: 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700',
      accentColor: '#d97706'
    };
  }
  if (normD.includes('school') || normT.includes('школ')) {
    return {
      emoji: '🎒',
      tag: 'Школа и учёба',
      svgKind: 'school_general',
      gradient: 'from-indigo-400 via-purple-400 to-sky-400',
      bgCard: 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700',
      accentColor: '#6366f1'
    };
  }
  if (normD.includes('animal') || normT.includes('животн')) {
    return {
      emoji: '🐾',
      tag: 'Мир животных',
      svgKind: 'animals_general',
      gradient: 'from-orange-400 via-amber-400 to-rose-400',
      bgCard: 'bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700',
      accentColor: '#ea580c'
    };
  }

  // Universal cheerful fallback
  return {
    emoji: '✨',
    tag: 'Слово для изучения',
    svgKind: 'sparkle_card',
    gradient: 'from-purple-400 via-fuchsia-400 to-indigo-500',
    bgCard: 'bg-purple-50/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
    accentColor: '#8b5cf6'
  };
}
