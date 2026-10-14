// Practice sentences dataset for Maya
// 5 exercises x 20 sentences for ES -> RU (100 sentences)
// 5 exercises x 20 sentences for RU -> ES (100 sentences)
// Total 200 unique sentences focusing on regular verbs and Maya's vocabulary

export const MAYA_REGULAR_VERBS_LIST = [
  'dibujar', 'pintar', 'comer', 'correr', 'escuchar',
  'mirar', 'comprar', 'saltar', 'esperar', 'ayudar'
];

export const EXERCISES_ES_TO_RU = [
  {
    "id": 1,
    "title": "Упр. 1: Я и ты (yo и vos)",
    "shortTitle": "1. Я и ты",
    "description": "Тренируем перевод форм первого и второго лица (yo dibujo, vos comés)",
    "icon": "⭐",
    "sentences": [
      {
        "id": "es_ru_1_01",
        "verb": "dibujar",
        "verbForm": "dibujo",
        "verbPerson": "yo",
        "spanish": "Yo dibujo una casa linda con jardín.",
        "russian": "Я рисую красивый дом с садом.",
        "acceptedAnswers": [
          "Я рисую красивый дом с садом",
          "Я рисую милый дом с садом",
          "Я рисую красивый домик с садом"
        ],
        "hint": "dibujar = рисовать • yo dibujo = я рисую",
        "distractors": [
          "ты",
          "кошку"
        ]
      },
      {
        "id": "es_ru_1_02",
        "verb": "dibujar",
        "verbForm": "dibujás",
        "verbPerson": "vos",
        "spanish": "Vos dibujás un gato chiquito en el cuaderno.",
        "russian": "Ты рисуешь маленького кота в тетради.",
        "acceptedAnswers": [
          "Ты рисуешь маленького кота в тетради",
          "Ты рисуешь маленькую кошку в тетради",
          "Ты рисуешь котика в тетради"
        ],
        "hint": "dibujar = рисовать • vos dibujás = ты рисуешь",
        "distractors": [
          "я",
          "собаку"
        ]
      },
      {
        "id": "es_ru_1_03",
        "verb": "comer",
        "verbForm": "como",
        "verbPerson": "yo",
        "spanish": "Yo como pan fresco con queso.",
        "russian": "Я ем свежий хлеб с сыром.",
        "acceptedAnswers": [
          "Я ем свежий хлеб с сыром",
          "Я кушаю свежий хлеб с сыром"
        ],
        "hint": "comer = кушать/есть • yo como = я ем",
        "distractors": [
          "ты",
          "молоко"
        ]
      },
      {
        "id": "es_ru_1_04",
        "verb": "comer",
        "verbForm": "comés",
        "verbPerson": "vos",
        "spanish": "Vos comés una manzana dulce y roja.",
        "russian": "Ты ешь сладкое красное яблоко.",
        "acceptedAnswers": [
          "Ты ешь сладкое красное яблоко",
          "Ты кушаешь сладкое красное яблоко",
          "Ты ешь красное сладкое яблоко"
        ],
        "hint": "comer = кушать • vos comés = ты ешь",
        "distractors": [
          "я",
          "банан"
        ]
      },
      {
        "id": "es_ru_1_05",
        "verb": "pintar",
        "verbForm": "pinto",
        "verbPerson": "yo",
        "spanish": "Yo pinto el sol de color amarillo.",
        "russian": "Я раскрашиваю солнце в жёлтый цвет.",
        "acceptedAnswers": [
          "Я раскрашиваю солнце в жёлтый цвет",
          "Я раскрашиваю солнце в желтый цвет",
          "Я рисую солнце жёлтым цветом",
          "Я рисую солнце желтым цветом",
          "Я крашу солнце в жёлтый цвет"
        ],
        "hint": "pintar = раскрашивать • yo pinto = я раскрашиваю",
        "distractors": [
          "ты",
          "синий"
        ]
      },
      {
        "id": "es_ru_1_06",
        "verb": "pintar",
        "verbForm": "pintás",
        "verbPerson": "vos",
        "spanish": "Vos pintás una flor roja con témperas.",
        "russian": "Ты раскрашиваешь красный цветок красками.",
        "acceptedAnswers": [
          "Ты раскрашиваешь красный цветок красками",
          "Ты красишь красный цветок красками",
          "Ты рисуешь красный цветок красками"
        ],
        "hint": "pintar = раскрашивать • vos pintás = ты раскрашиваешь",
        "distractors": [
          "он",
          "карандашом"
        ]
      },
      {
        "id": "es_ru_1_07",
        "verb": "correr",
        "verbForm": "corro",
        "verbPerson": "yo",
        "spanish": "Yo corro rápido en la plaza grande.",
        "russian": "Я быстро бегаю на большой площадке.",
        "acceptedAnswers": [
          "Я быстро бегаю на большой площадке",
          "Я быстро бегу на большой площадке",
          "Я быстро бегаю в большом парке",
          "Я быстро бегу в большом парке"
        ],
        "hint": "correr = бегать • yo corro = я бегаю",
        "distractors": [
          "медленно",
          "прыгаю"
        ]
      },
      {
        "id": "es_ru_1_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "spanish": "Vos corrés con el perro negro.",
        "russian": "Ты бегаешь с чёрной собакой.",
        "acceptedAnswers": [
          "Ты бегаешь с чёрной собакой",
          "Ты бегаешь с черной собакой",
          "Ты бежишь с чёрной собакой",
          "Ты бежишь с черной собакой"
        ],
        "hint": "correr = бегать • vos corrés = ты бегаешь",
        "distractors": [
          "белым",
          "котом"
        ]
      },
      {
        "id": "es_ru_1_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "spanish": "Yo escucho a la seño en la escuela.",
        "russian": "Я слушаю учительницу в школе.",
        "acceptedAnswers": [
          "Я слушаю учительницу в школе",
          "Я слушаю учительницу на уроке"
        ],
        "hint": "escuchar = слушать • yo escucho = я слушаю",
        "distractors": [
          "смотрю",
          "маму"
        ]
      },
      {
        "id": "es_ru_1_10",
        "verb": "escuchar",
        "verbForm": "escuchás",
        "verbPerson": "vos",
        "spanish": "Vos escuchás la lluvia en la ventana.",
        "russian": "Ты слушаешь дождь за окном.",
        "acceptedAnswers": [
          "Ты слушаешь дождь за окном",
          "Ты слушаешь дождь в окне"
        ],
        "hint": "escuchar = слушать • vos escuchás = ты слушаешь",
        "distractors": [
          "ветер",
          "смотришь"
        ]
      },
      {
        "id": "es_ru_1_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "spanish": "Yo miro el cielo azul por la mañana.",
        "russian": "Я смотрю на синее небо утром.",
        "acceptedAnswers": [
          "Я смотрю на синее небо утром",
          "Я смотрю в синее небо утром"
        ],
        "hint": "mirar = смотреть • yo miro = я смотрю",
        "distractors": [
          "вечером",
          "ночь"
        ]
      },
      {
        "id": "es_ru_1_12",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "spanish": "Vos mirás los colores lindos del libro.",
        "russian": "Ты смотришь на красивые цвета книги.",
        "acceptedAnswers": [
          "Ты смотришь на красивые цвета книги",
          "Ты разглядываешь красивые цвета книги"
        ],
        "hint": "mirar = смотреть • vos mirás = ты смотришь",
        "distractors": [
          "слушаешь",
          "тетради"
        ]
      },
      {
        "id": "es_ru_1_13",
        "verb": "comprar",
        "verbForm": "compro",
        "verbPerson": "yo",
        "spanish": "Yo compro un helado de chocolate rico.",
        "russian": "Я покупаю вкусное шоколадное мороженое.",
        "acceptedAnswers": [
          "Я покупаю вкусное шоколадное мороженое",
          "Я беру вкусное шоколадное мороженое"
        ],
        "hint": "comprar = покупать • yo compro = я покупаю",
        "distractors": [
          "продаю",
          "сок"
        ]
      },
      {
        "id": "es_ru_1_14",
        "verb": "comprar",
        "verbForm": "comprás",
        "verbPerson": "vos",
        "spanish": "Vos comprás un alfajor en el quiosco.",
        "russian": "Ты покупаешь альфахор в киоске.",
        "acceptedAnswers": [
          "Ты покупаешь альфахор в киоске",
          "Ты берешь альфахор в киоске"
        ],
        "hint": "comprar = покупать • vos comprás = ты покупаешь",
        "distractors": [
          "печенье",
          "магазине"
        ]
      },
      {
        "id": "es_ru_1_15",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "spanish": "Yo salto alto en el tobogán verde.",
        "russian": "Я высоко прыгаю на зелёной горке.",
        "acceptedAnswers": [
          "Я высоко прыгаю на зелёной горке",
          "Я высоко прыгаю на зеленой горке",
          "Я прыгаю высоко на зелёной горке"
        ],
        "hint": "saltar = прыгать • yo salto = я прыгаю",
        "distractors": [
          "падаю",
          "синей"
        ]
      },
      {
        "id": "es_ru_1_16",
        "verb": "saltar",
        "verbForm": "saltás",
        "verbPerson": "vos",
        "spanish": "Vos saltás a la soga en el recreo.",
        "russian": "Ты прыгаешь через скакалку на перемене.",
        "acceptedAnswers": [
          "Ты прыгаешь через скакалку на перемене",
          "Ты скачешь через скакалку на перемене"
        ],
        "hint": "saltar = прыгать • vos saltás = ты прыгаешь",
        "distractors": [
          "бегаешь",
          "уроке"
        ]
      },
      {
        "id": "es_ru_1_17",
        "verb": "esperar",
        "verbForm": "espero",
        "verbPerson": "yo",
        "spanish": "Yo espero mi turno en la hamaca.",
        "russian": "Я жду свою очередь на качелях.",
        "acceptedAnswers": [
          "Я жду свою очередь на качелях",
          "Я жду своей очереди на качелях"
        ],
        "hint": "esperar = ждать • yo espero = я жду",
        "distractors": [
          "пропускаю",
          "горке"
        ]
      },
      {
        "id": "es_ru_1_18",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "spanish": "Vos esperás el auto blanco de papá.",
        "russian": "Ты ждёшь белую машину папы.",
        "acceptedAnswers": [
          "Ты ждёшь белую машину папы",
          "Ты ждешь белую машину папы",
          "Ты ждёшь белый автомобиль папы"
        ],
        "hint": "esperar = ждать • vos esperás = ты ждёшь",
        "distractors": [
          "мамы",
          "чёрную"
        ]
      },
      {
        "id": "es_ru_1_19",
        "verb": "ayudar",
        "verbForm": "ayudo",
        "verbPerson": "yo",
        "spanish": "Yo ayudo a mamá a poner la mesa.",
        "russian": "Я помогаю маме накрывать на стол.",
        "acceptedAnswers": [
          "Я помогаю маме накрывать на стол",
          "Я помогаю маме накрыть на стол"
        ],
        "hint": "ayudar = помогать • yo ayudo = я помогаю",
        "distractors": [
          "мешаю",
          "папе"
        ]
      },
      {
        "id": "es_ru_1_20",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "spanish": "Vos ayudás al hermano chiquito con la tarea.",
        "russian": "Ты помогаешь маленькому брату с уроками.",
        "acceptedAnswers": [
          "Ты помогаешь маленькому брату с уроками",
          "Ты помогаешь младшему брату с заданием",
          "Ты помогаешь маленькому брату с домашкой"
        ],
        "hint": "ayudar = помогать • vos ayudás = ты помогаешь",
        "distractors": [
          "сестре",
          "большому"
        ]
      }
    ]
  },
  {
    "id": 2,
    "title": "Упр. 2: Он, она и семья (él, ella)",
    "shortTitle": "2. Семья и друзья",
    "description": "Формы 3-го лица: él, ella, la mamá, el papá (хвостики -a, -e)",
    "icon": "👨‍👩‍👧",
    "sentences": [
      {
        "id": "es_ru_2_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "él",
        "spanish": "El hermano dibuja un barco grande en el papel.",
        "russian": "Брат рисует большой корабль на бумаге.",
        "acceptedAnswers": [
          "Брат рисует большой корабль на бумаге",
          "Мой брат рисует большой корабль на бумаге"
        ],
        "hint": "dibujar • él dibuja = он рисует",
        "distractors": [
          "сестра",
          "маленький"
        ]
      },
      {
        "id": "es_ru_2_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "spanish": "Maya dibuja una muñeca linda con vestido rosa.",
        "russian": "Майя рисует красивую куклу в розовом платье.",
        "acceptedAnswers": [
          "Майя рисует красивую куклу в розовом платье",
          "Майя рисует милую куклу в розовом платье"
        ],
        "hint": "dibujar • Maya dibuja = Майя рисует",
        "distractors": [
          "красит",
          "синем"
        ]
      },
      {
        "id": "es_ru_2_03",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "él",
        "spanish": "El papá pinta la silla de madera.",
        "russian": "Папа красит деревянный стул.",
        "acceptedAnswers": [
          "Папа красит деревянный стул",
          "Папа раскрашивает деревянный стул"
        ],
        "hint": "pintar • él pinta = он красит",
        "distractors": [
          "стол",
          "ломает"
        ]
      },
      {
        "id": "es_ru_2_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "spanish": "La hermana pinta mariposas amarillas en la pared.",
        "russian": "Сестра рисует жёлтых бабочек на стене.",
        "acceptedAnswers": [
          "Сестра рисует жёлтых бабочек на стене",
          "Сестра рисует желтых бабочек на стене",
          "Сестра раскрашивает жёлтых бабочек на стене"
        ],
        "hint": "pintar • ella pinta = она рисует/раскрашивает",
        "distractors": [
          "брат",
          "синих"
        ]
      },
      {
        "id": "es_ru_2_05",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "él",
        "spanish": "El abuelo come medialunas dulces con té caliente.",
        "russian": "Дедушка ест сладкие круассаны с горячим чаем.",
        "acceptedAnswers": [
          "Дедушка ест сладкие круассаны с горячим чаем",
          "Дедушка кушает сладкие медиалуны с чаем",
          "Дедушка ест сладкие медиалуны с чаем"
        ],
        "hint": "comer • él come = он ест",
        "distractors": [
          "бабушка",
          "кофе"
        ]
      },
      {
        "id": "es_ru_2_06",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "ella",
        "spanish": "La mamá come una ensalada rica al mediodía.",
        "russian": "Мама ест вкусный салат в полдень.",
        "acceptedAnswers": [
          "Мама ест вкусный салат в полдень",
          "Мама кушает вкусный салат днём",
          "Мама ест вкусный салат днем"
        ],
        "hint": "comer • ella come = она ест",
        "distractors": [
          "папа",
          "суп"
        ]
      },
      {
        "id": "es_ru_2_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "spanish": "El amigo corre con la pelota en el patio.",
        "russian": "Друг бегает с мячом во дворе.",
        "acceptedAnswers": [
          "Друг бегает с мячом во дворе",
          "Друг бежит с мячом во дворе"
        ],
        "hint": "correr • él corre = он бегает",
        "distractors": [
          "подруга",
          "собакой"
        ]
      },
      {
        "id": "es_ru_2_08",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "ella",
        "spanish": "La amiga corre feliz hacia la puerta.",
        "russian": "Подруга радостно бежит к двери.",
        "acceptedAnswers": [
          "Подруга радостно бежит к двери",
          "Подруга счастливо бежит к двери"
        ],
        "hint": "correr • ella corre = она бежит",
        "distractors": [
          "грустно",
          "окну"
        ]
      },
      {
        "id": "es_ru_2_09",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "él",
        "spanish": "Él escucha la radio en la cocina.",
        "russian": "Он слушает радио на кухне.",
        "acceptedAnswers": [
          "Он слушает радио на кухне"
        ],
        "hint": "escuchar • él escucha = он слушает",
        "distractors": [
          "она",
          "телевизор"
        ]
      },
      {
        "id": "es_ru_2_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "spanish": "La abuela escucha canciones suaves en la sala.",
        "russian": "Бабушка слушает спокойные песни в гостиной.",
        "acceptedAnswers": [
          "Бабушка слушает спокойные песни в гостиной",
          "Бабушка слушает нежные песни в зале"
        ],
        "hint": "escuchar • ella escucha = она слушает",
        "distractors": [
          "дедушка",
          "громкие"
        ]
      },
      {
        "id": "es_ru_2_11",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "él",
        "spanish": "El gato mira un pajarito desde la ventana.",
        "russian": "Кот смотрит на птичку из окна.",
        "acceptedAnswers": [
          "Кот смотрит на птичку из окна",
          "Кошка смотрит на птичку из окна"
        ],
        "hint": "mirar • él mira = он смотрит",
        "distractors": [
          "собака",
          "двери"
        ]
      },
      {
        "id": "es_ru_2_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "spanish": "Ella mira las fotos viejas con una sonrisa.",
        "russian": "Она смотрит старые фотографии с улыбкой.",
        "acceptedAnswers": [
          "Она смотрит старые фотографии с улыбкой",
          "Она разглядывает старые фото с улыбкой"
        ],
        "hint": "mirar • ella mira = она смотрит",
        "distractors": [
          "он",
          "книги"
        ]
      },
      {
        "id": "es_ru_2_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "él",
        "spanish": "El papá compra jugo de naranja natural.",
        "russian": "Папа покупает натуральный апельсиновый сок.",
        "acceptedAnswers": [
          "Папа покупает натуральный апельсиновый сок",
          "Папа покупает свежий апельсиновый сок"
        ],
        "hint": "comprar • él compra = он покупает",
        "distractors": [
          "яблочный",
          "мама"
        ]
      },
      {
        "id": "es_ru_2_14",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "spanish": "La mamá compra galletitas dulces para la merienda.",
        "russian": "Мама покупает сладкое печенье на полдник.",
        "acceptedAnswers": [
          "Мама покупает сладкое печенье на полдник",
          "Мама берет сладкое печенье на полдник"
        ],
        "hint": "comprar • ella compra = она покупает",
        "distractors": [
          "хлеб",
          "завтрак"
        ]
      },
      {
        "id": "es_ru_2_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "spanish": "El nene salta en el pasto verde.",
        "russian": "Мальчик прыгает на зелёной траве.",
        "acceptedAnswers": [
          "Мальчик прыгает на зелёной траве",
          "Мальчик прыгает на зеленой траве",
          "Ребёнок прыгает на зелёной траве"
        ],
        "hint": "saltar • él salta = он прыгает",
        "distractors": [
          "девочка",
          "бегает"
        ]
      },
      {
        "id": "es_ru_2_16",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "ella",
        "spanish": "La nena salta con alegría en la plaza.",
        "russian": "Девочка с радостью прыгает на площадке.",
        "acceptedAnswers": [
          "Девочка с радостью прыгает на площадке",
          "Девочка радостно скачет на площадке"
        ],
        "hint": "saltar • ella salta = она прыгает",
        "distractors": [
          "плачет",
          "дома"
        ]
      },
      {
        "id": "es_ru_2_17",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "él",
        "spanish": "El abuelo espera sentado en el banco del parque.",
        "russian": "Дедушка ждёт сидя на лавочке в парке.",
        "acceptedAnswers": [
          "Дедушка ждёт сидя на лавочке в парке",
          "Дедушка ждет сидя на лавочке в парке",
          "Дедушка сидит и ждет на скамейке в парке"
        ],
        "hint": "esperar • él espera = он ждёт",
        "distractors": [
          "бабушка",
          "стоит"
        ]
      },
      {
        "id": "es_ru_2_18",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "ella",
        "spanish": "La seño espera a los chicos en la puerta del aula.",
        "russian": "Учительница ждёт ребят у двери класса.",
        "acceptedAnswers": [
          "Учительница ждёт ребят у двери класса",
          "Учительница ждет ребят у двери класса",
          "Учительница ждет детей у двери класса"
        ],
        "hint": "esperar • ella espera = она ждёт",
        "distractors": [
          "мама",
          "окна"
        ]
      },
      {
        "id": "es_ru_2_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "spanish": "El hermano ayuda a papá a lavar el auto.",
        "russian": "Брат помогает папе мыть машину.",
        "acceptedAnswers": [
          "Брат помогает папе мыть машину",
          "Брат помогает папе помыть автомобиль"
        ],
        "hint": "ayudar • él ayuda = он помогает",
        "distractors": [
          "сестра",
          "чинить"
        ]
      },
      {
        "id": "es_ru_2_20",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "ella",
        "spanish": "Maya ayuda a la abuela a regar las plantas.",
        "russian": "Майя помогает бабушке поливать растения.",
        "acceptedAnswers": [
          "Майя помогает бабушке поливать растения",
          "Майя помогает бабушке полить цветы"
        ],
        "hint": "ayudar • ella ayuda = она помогает",
        "distractors": [
          "дедушке",
          "сажать"
        ]
      }
    ]
  },
  {
    "id": 3,
    "title": "Упр. 3: Мы вместе (nosotros / nosotras)",
    "shortTitle": "3. Мы вместе",
    "description": "Формы множественного числа первого лица (хвостики -amos, -emos)",
    "icon": "🤝",
    "sentences": [
      {
        "id": "es_ru_3_01",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros dibujamos un mapa grande de la ciudad.",
        "russian": "Мы рисуем большую карту города.",
        "acceptedAnswers": [
          "Мы рисуем большую карту города"
        ],
        "hint": "dibujar • nosotros dibujamos = мы рисуем",
        "distractors": [
          "они",
          "маленькую"
        ]
      },
      {
        "id": "es_ru_3_02",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras dibujamos estrellas brillantes en el cuaderno.",
        "russian": "Мы рисуем яркие звёзды в тетради.",
        "acceptedAnswers": [
          "Мы рисуем яркие звёзды в тетради",
          "Мы рисуем яркие звезды в тетради",
          "Мы (девочки) рисуем яркие звёзды в тетради"
        ],
        "hint": "dibujar • nosotras dibujamos = мы рисуем",
        "distractors": [
          "вы",
          "цветы"
        ]
      },
      {
        "id": "es_ru_3_03",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros pintamos la casita del perro de color verde.",
        "russian": "Мы красим будку собаки в зелёный цвет.",
        "acceptedAnswers": [
          "Мы красим будку собаки в зелёный цвет",
          "Мы красим будку собаки в зеленый цвет",
          "Мы красим домик собаки в зелёный цвет"
        ],
        "hint": "pintar • nosotros pintamos = мы красим",
        "distractors": [
          "синий",
          "кошки"
        ]
      },
      {
        "id": "es_ru_3_04",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras pintamos un arcoíris hermoso con témperas.",
        "russian": "Мы раскрашиваем красивую радугу красками.",
        "acceptedAnswers": [
          "Мы раскрашиваем красивую радугу красками",
          "Мы рисуем красивую радугу красками"
        ],
        "hint": "pintar • nosotras pintamos = мы раскрашиваем",
        "distractors": [
          "солнце",
          "карандашами"
        ]
      },
      {
        "id": "es_ru_3_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros comemos pizza caliente en familia.",
        "russian": "Мы едим горячую пиццу всей семьёй.",
        "acceptedAnswers": [
          "Мы едим горячую пиццу всей семьёй",
          "Мы едим горячую пиццу всей семьей",
          "Мы кушаем горячую пиццу всей семьей"
        ],
        "hint": "comer • nosotros comemos = мы едим",
        "distractors": [
          "холодную",
          "бутерброды"
        ]
      },
      {
        "id": "es_ru_3_06",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras comemos helado de frutilla en la plaza.",
        "russian": "Мы едим клубничное мороженое в парке.",
        "acceptedAnswers": [
          "Мы едим клубничное мороженое в парке",
          "Мы кушаем клубничное мороженое на площадке",
          "Мы едим клубничное мороженое на площади"
        ],
        "hint": "comer • nosotras comemos = мы едим",
        "distractors": [
          "шоколадное",
          "дома"
        ]
      },
      {
        "id": "es_ru_3_07",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros corremos juntos hasta el árbol grande.",
        "russian": "Мы бежим вместе до большого дерева.",
        "acceptedAnswers": [
          "Мы бежим вместе до большого дерева",
          "Мы вместе бежим к большому дереву",
          "Мы бегаем вместе до большого дерева"
        ],
        "hint": "correr • nosotros corremos = мы бегаем/бежим",
        "distractors": [
          "прыгаем",
          "маленького"
        ]
      },
      {
        "id": "es_ru_3_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras corremos carreras divertidas en el recreo.",
        "russian": "Мы весело бегаем наперегонки на перемене.",
        "acceptedAnswers": [
          "Мы весело бегаем наперегонки на перемене",
          "Мы бегаем наперегонки на перемене"
        ],
        "hint": "correr • nosotras corremos = мы бегаем",
        "distractors": [
          "уроке",
          "медленно"
        ]
      },
      {
        "id": "es_ru_3_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros escuchamos los sonidos de la naturaleza.",
        "russian": "Мы слушаем звуки природы.",
        "acceptedAnswers": [
          "Мы слушаем звуки природы"
        ],
        "hint": "escuchar • nosotros escuchamos = мы слушаем",
        "distractors": [
          "города",
          "смотрим"
        ]
      },
      {
        "id": "es_ru_3_10",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras escuchamos el cuento que lee la seño.",
        "russian": "Мы слушаем сказку, которую читает учительница.",
        "acceptedAnswers": [
          "Мы слушаем сказку, которую читает учительница",
          "Мы слушаем сказку которую читает учительница",
          "Мы слушаем рассказ учительницы"
        ],
        "hint": "escuchar • nosotras escuchamos = мы слушаем",
        "distractors": [
          "пишем",
          "мама"
        ]
      },
      {
        "id": "es_ru_3_11",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros miramos las estrellas por la noche.",
        "russian": "Мы смотрим на звёзды ночью.",
        "acceptedAnswers": [
          "Мы смотрим на звёзды ночью",
          "Мы смотрим на звезды ночью",
          "Мы разглядываем звёзды ночью"
        ],
        "hint": "mirar • nosotros miramos = мы смотрим",
        "distractors": [
          "днём",
          "луну"
        ]
      },
      {
        "id": "es_ru_3_12",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras miramos los pajaritos de colores en el jardín.",
        "russian": "Мы смотрим на разноцветных птичек в саду.",
        "acceptedAnswers": [
          "Мы смотрим на разноцветных птичек в саду",
          "Мы наблюдаем за разноцветными птичками в саду"
        ],
        "hint": "mirar • nosotras miramos = мы смотрим",
        "distractors": [
          "бабочек",
          "лесу"
        ]
      },
      {
        "id": "es_ru_3_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros compramos pan caliente en la panadería.",
        "russian": "Мы покупаем горячий хлеб в булочной.",
        "acceptedAnswers": [
          "Мы покупаем горячий хлеб в булочной",
          "Мы берем горячий хлеб в пекарне"
        ],
        "hint": "comprar • nosotros compramos = мы покупаем",
        "distractors": [
          "холодный",
          "сыр"
        ]
      },
      {
        "id": "es_ru_3_14",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras compramos figuritas nuevas para el álbum.",
        "russian": "Мы покупаем новые наклейки для альбома.",
        "acceptedAnswers": [
          "Мы покупаем новые наклейки для альбома",
          "Мы берем новые карточки для альбома"
        ],
        "hint": "comprar • nosotras compramos = мы покупаем",
        "distractors": [
          "старые",
          "книги"
        ]
      },
      {
        "id": "es_ru_3_15",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros saltamos charcos de agua en la calle.",
        "russian": "Мы прыгаем через лужи на улице.",
        "acceptedAnswers": [
          "Мы прыгаем через лужи на улице",
          "Мы скачем по лужам на улице"
        ],
        "hint": "saltar • nosotros saltamos = мы прыгаем",
        "distractors": [
          "камни",
          "падаем"
        ]
      },
      {
        "id": "es_ru_3_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras saltamos muy felices en la cama elástica.",
        "russian": "Мы очень радостно прыгаем на батуте.",
        "acceptedAnswers": [
          "Мы очень радостно прыгаем на батуте",
          "Мы счастливо прыгаем на батуте"
        ],
        "hint": "saltar • nosotras saltamos = мы прыгаем",
        "distractors": [
          "грустно",
          "диване"
        ]
      },
      {
        "id": "es_ru_3_17",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros esperamos el colectivo en la parada.",
        "russian": "Мы ждём автобус на остановке.",
        "acceptedAnswers": [
          "Мы ждём автобус на остановке",
          "Мы ждем автобус на остановке",
          "Мы ждем маршрутку на остановке"
        ],
        "hint": "esperar • nosotros esperamos = мы ждём",
        "distractors": [
          "поезд",
          "улице"
        ]
      },
      {
        "id": "es_ru_3_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras esperamos a las amigas en la entrada del club.",
        "russian": "Мы ждём подруг у входа в клуб.",
        "acceptedAnswers": [
          "Мы ждём подруг у входа в клуб",
          "Мы ждем подруг у входа в клуб",
          "Мы ждем подружек на входе в клуб"
        ],
        "hint": "esperar • nosotras esperamos = мы ждём",
        "distractors": [
          "друзей",
          "выходе"
        ]
      },
      {
        "id": "es_ru_3_19",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros ayudamos a ordenar la sala de juegos.",
        "russian": "Мы помогаем наводить порядок в игровой комнате.",
        "acceptedAnswers": [
          "Мы помогаем наводить порядок в игровой комнате",
          "Мы помогаем убирать игровую комнату"
        ],
        "hint": "ayudar • nosotros ayudamos = мы помогаем",
        "distractors": [
          "пачкать",
          "спальне"
        ]
      },
      {
        "id": "es_ru_3_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras ayudamos a mamá a preparar la merienda.",
        "russian": "Мы помогаем маме готовить полдник.",
        "acceptedAnswers": [
          "Мы помогаем маме готовить полдник",
          "Мы помогаем маме сделать полдник"
        ],
        "hint": "ayudar • nosotras ayudamos = мы помогаем",
        "distractors": [
          "ужин",
          "папе"
        ]
      }
    ]
  },
  {
    "id": 4,
    "title": "Упр. 4: Они и вы все (ellos, ellas, ustedes)",
    "shortTitle": "4. Они и вы",
    "description": "Формы множественного числа с хвостиками -an, -en (ellos corren, ustedes saltan)",
    "icon": "👥",
    "sentences": [
      {
        "id": "es_ru_4_01",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ellos",
        "spanish": "Ellos dibujan animales salvajes en la pizarra.",
        "russian": "Они рисуют диких животных на доске.",
        "acceptedAnswers": [
          "Они рисуют диких животных на доске"
        ],
        "hint": "dibujar • ellos dibujan = они рисуют",
        "distractors": [
          "мы",
          "домашних"
        ]
      },
      {
        "id": "es_ru_4_02",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes dibujan figuras geométricas con regla.",
        "russian": "Вы рисуете геометрические фигуры по линейке.",
        "acceptedAnswers": [
          "Вы рисуете геометрические фигуры по линейке",
          "Вы чертите геометрические фигуры линейкой"
        ],
        "hint": "dibujar • ustedes dibujan = вы рисуете",
        "distractors": [
          "они",
          "красками"
        ]
      },
      {
        "id": "es_ru_4_03",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellas",
        "spanish": "Ellas pintan flores de colores en el patio.",
        "russian": "Они рисуют разноцветные цветы во дворе.",
        "acceptedAnswers": [
          "Они рисуют разноцветные цветы во дворе",
          "Они раскрашивают цветные цветы во дворе"
        ],
        "hint": "pintar • ellas pintan = они раскрашивают",
        "distractors": [
          "мы",
          "комнате"
        ]
      },
      {
        "id": "es_ru_4_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes pintan el mural de la escuela de color celeste.",
        "russian": "Вы красите школьную стену в светло-голубой цвет.",
        "acceptedAnswers": [
          "Вы красите школьную стену в светло-голубой цвет",
          "Вы раскрашиваете школьное панно в голубой цвет"
        ],
        "hint": "pintar • ustedes pintan = вы красите",
        "distractors": [
          "зелёный",
          "забор"
        ]
      },
      {
        "id": "es_ru_4_05",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "spanish": "Ellos comen sándwiches de jamón en el parque.",
        "russian": "Они едят бутерброды с ветчиной в парке.",
        "acceptedAnswers": [
          "Они едят бутерброды с ветчиной в парке",
          "Они кушают сэндвичи с ветчиной в парке"
        ],
        "hint": "comer • ellos comen = они едят",
        "distractors": [
          "сыром",
          "школе"
        ]
      },
      {
        "id": "es_ru_4_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "spanish": "Ustedes comen galletitas dulces con chocolate.",
        "russian": "Вы едите сладкое печенье с шоколадом.",
        "acceptedAnswers": [
          "Вы едите сладкое печенье с шоколадом",
          "Вы кушаете сладкое печенье с шоколадом"
        ],
        "hint": "comer • ustedes comen = вы едите",
        "distractors": [
          "солью",
          "они"
        ]
      },
      {
        "id": "es_ru_4_07",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ellas",
        "spanish": "Ellas corren veloces hacia la meta.",
        "russian": "Они быстро бегут к финишу.",
        "acceptedAnswers": [
          "Они быстро бегут к финишу",
          "Они мчатся к финишу"
        ],
        "hint": "correr • ellas corren = они бегут",
        "distractors": [
          "медленно",
          "старту"
        ]
      },
      {
        "id": "es_ru_4_08",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ustedes",
        "spanish": "Ustedes corren todas las tardes alrededor de la pista.",
        "russian": "Вы бегаете каждый вечер вокруг дорожки.",
        "acceptedAnswers": [
          "Вы бегаете каждый вечер вокруг дорожки",
          "Вы бегаете по вечерам вокруг дорожки"
        ],
        "hint": "correr • ustedes corren = вы бегаете",
        "distractors": [
          "утром",
          "парка"
        ]
      },
      {
        "id": "es_ru_4_09",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "spanish": "Ellos escuchan con atención las instrucciones del juego.",
        "russian": "Они внимательно слушают правила игры.",
        "acceptedAnswers": [
          "Они внимательно слушают правила игры",
          "Они с вниманием слушают инструкции к игре"
        ],
        "hint": "escuchar • ellos escuchan = они слушают",
        "distractors": [
          "нарушают",
          "урока"
        ]
      },
      {
        "id": "es_ru_4_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes escuchan música divertida con auriculares.",
        "russian": "Вы слушаете весёлую музыку в наушниках.",
        "acceptedAnswers": [
          "Вы слушаете весёлую музыку в наушниках",
          "Вы слушаете веселую музыку в наушниках",
          "Вы слушаете задорную музыку в наушниках"
        ],
        "hint": "escuchar • ustedes escuchan = вы слушаете",
        "distractors": [
          "грустную",
          "колонках"
        ]
      },
      {
        "id": "es_ru_4_11",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ellas",
        "spanish": "Ellas miran las mariposas que vuelan sobre las rosas.",
        "russian": "Они смотрят на бабочек, летающих над розами.",
        "acceptedAnswers": [
          "Они смотрят на бабочек, летающих над розами",
          "Они смотрят на бабочек летающих над розами",
          "Они смотрят на бабочек над розами"
        ],
        "hint": "mirar • ellas miran = они смотрят",
        "distractors": [
          "пчёл",
          "деревьями"
        ]
      },
      {
        "id": "es_ru_4_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes miran el arcoíris que sale después de la lluvia.",
        "russian": "Вы смотрите на радугу, появившуюся после дождя.",
        "acceptedAnswers": [
          "Вы смотрите на радугу, появившуюся после дождя",
          "Вы смотрите на радугу появившуюся после дождя",
          "Вы смотрите на радугу после дождя"
        ],
        "hint": "mirar • ustedes miran = вы смотрите",
        "distractors": [
          "солнце",
          "бури"
        ]
      },
      {
        "id": "es_ru_4_13",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ellos",
        "spanish": "Ellos compran pelotas de tenis para entrenar.",
        "russian": "Они покупают теннисные мячи для тренировок.",
        "acceptedAnswers": [
          "Они покупают теннисные мячи для тренировок",
          "Они берут теннисные мячи для тренировки"
        ],
        "hint": "comprar • ellos compran = они покупают",
        "distractors": [
          "футбольные",
          "игры"
        ]
      },
      {
        "id": "es_ru_4_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes compran cuadernos de hojas rayadas para la clase.",
        "russian": "Вы покупаете тетради в линейку для уроков.",
        "acceptedAnswers": [
          "Вы покупаете тетради в линейку для уроков",
          "Вы берете тетради в линейку для занятий"
        ],
        "hint": "comprar • ustedes compran = вы покупаете",
        "distractors": [
          "клетку",
          "книги"
        ]
      },
      {
        "id": "es_ru_4_15",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ellas",
        "spanish": "Ellas saltan con ritmo en la clase de baile.",
        "russian": "Они ритмично прыгают на уроке танцев.",
        "acceptedAnswers": [
          "Они ритмично прыгают на уроке танцев",
          "Они в ритм прыгают на танцах"
        ],
        "hint": "saltar • ellas saltan = они прыгают",
        "distractors": [
          "музыки",
          "падают"
        ]
      },
      {
        "id": "es_ru_4_16",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes saltan sobre los almohadones en el suelo.",
        "russian": "Вы прыгаете по подушкам на полу.",
        "acceptedAnswers": [
          "Вы прыгаете по подушкам на полу",
          "Вы скачете по подушкам на полу"
        ],
        "hint": "saltar • ustedes saltan = вы прыгаете",
        "distractors": [
          "диване",
          "кровати"
        ]
      },
      {
        "id": "es_ru_4_17",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "spanish": "Ellos esperan el comienzo del partido con entusiasmo.",
        "russian": "Они с восторгом ждут начала матча.",
        "acceptedAnswers": [
          "Они с восторгом ждут начала матча",
          "Они с нетерпением ждут начала игры"
        ],
        "hint": "esperar • ellos esperan = они ждут",
        "distractors": [
          "конца",
          "урока"
        ]
      },
      {
        "id": "es_ru_4_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes esperan a los abuelos en la puerta de casa.",
        "russian": "Вы ждёте бабушку и дедушку у двери дома.",
        "acceptedAnswers": [
          "Вы ждёте бабушку и дедушку у двери дома",
          "Вы ждете бабушку и дедушку у двери дома",
          "Вы ждете дедушку и бабушку у входа в дом"
        ],
        "hint": "esperar • ustedes esperan = вы ждёте",
        "distractors": [
          "родителей",
          "окна"
        ]
      },
      {
        "id": "es_ru_4_19",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ellas",
        "spanish": "Ellas ayudan a la maestra a repartir los lápices de colores.",
        "russian": "Они помогают учительнице раздавать цветные карандаши.",
        "acceptedAnswers": [
          "Они помогают учительнице раздавать цветные карандаши",
          "Они помогают учительнице раздать цветные карандаши"
        ],
        "hint": "ayudar • ellas ayudan = они помогают",
        "distractors": [
          "собирать",
          "тетради"
        ]
      },
      {
        "id": "es_ru_4_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes ayudan a los compañeros nuevos en el colegio.",
        "russian": "Вы помогаете новым одноклассникам в школе.",
        "acceptedAnswers": [
          "Вы помогаете новым одноклассникам в школе",
          "Вы помогаете новым ребятам в школе"
        ],
        "hint": "ayudar • ustedes ayudan = вы помогаете",
        "distractors": [
          "мешаете",
          "учителям"
        ]
      }
    ]
  },
  {
    "id": 5,
    "title": "Упр. 5: Большой микс всех форм",
    "shortTitle": "5. Большой микс",
    "description": "Все лица и формы правильных глаголов в живых детских ситуациях",
    "icon": "🌈",
    "sentences": [
      {
        "id": "es_ru_5_01",
        "verb": "dibujar",
        "verbForm": "dibujo / dibujás",
        "verbPerson": "yo / vos",
        "spanish": "Yo dibujo un sol sonriente y vos dibujás una nube blanca.",
        "russian": "Я рисую улыбающееся солнце, а ты рисуешь белое облако.",
        "acceptedAnswers": [
          "Я рисую улыбающееся солнце, а ты рисуешь белое облако",
          "Я рисую улыбающееся солнце а ты рисуешь белое облако",
          "Я рисую солнце с улыбкой, а ты рисуешь белое облако"
        ],
        "hint": "dibujar • yo dibujo / vos dibujás",
        "distractors": [
          "он",
          "дождь"
        ]
      },
      {
        "id": "es_ru_5_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "spanish": "La abuela dibuja flores lindas en una servilleta de papel.",
        "russian": "Бабушка рисует красивые цветы на бумажной салфетке.",
        "acceptedAnswers": [
          "Бабушка рисует красивые цветы на бумажной салфетке",
          "Бабушка рисует милые цветы на салфетке"
        ],
        "hint": "dibujar • ella dibuja = она рисует",
        "distractors": [
          "дедушка",
          "столе"
        ]
      },
      {
        "id": "es_ru_5_03",
        "verb": "pintar",
        "verbForm": "pintamos / pintan",
        "verbPerson": "nosotros / ustedes",
        "spanish": "Nosotros pintamos las cajas de cartón y ustedes pintan las tapas.",
        "russian": "Мы красим картонные коробки, а вы красите крышки.",
        "acceptedAnswers": [
          "Мы красим картонные коробки, а вы красите крышки",
          "Мы красим картонные коробки а вы красите крышки",
          "Мы раскрашиваем коробки из картона, а вы раскрашиваете крышки"
        ],
        "hint": "pintar • pintamos / pintan",
        "distractors": [
          "они",
          "банки"
        ]
      },
      {
        "id": "es_ru_5_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "spanish": "Maya pinta un paisaje de montañas verdes con acuarelas.",
        "russian": "Майя рисует зелёные горы акварелью.",
        "acceptedAnswers": [
          "Майя рисует зелёные горы акварелью",
          "Майя рисует зеленые горы акварелью",
          "Майя раскрашивает пейзаж с зелёными горами акварелью"
        ],
        "hint": "pintar • ella pinta = она рисует/красит",
        "distractors": [
          "красками",
          "синие"
        ]
      },
      {
        "id": "es_ru_5_05",
        "verb": "comer",
        "verbForm": "comés / como",
        "verbPerson": "vos / yo",
        "spanish": "Vos comés tostadas con manteca y yo como frutas frescas.",
        "russian": "Ты ешь тосты с маслом, а я ем свежие фрукты.",
        "acceptedAnswers": [
          "Ты ешь тосты с маслом, а я ем свежие фрукты",
          "Ты ешь тосты с маслом а я ем свежие фрукты",
          "Ты кушаешь тосты с маслом, а я кушаю свежие фрукты"
        ],
        "hint": "comer • vos comés / yo como",
        "distractors": [
          "джемом",
          "он"
        ]
      },
      {
        "id": "es_ru_5_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "spanish": "Los chicos comen empanadas de carne en el almuerzo escolar.",
        "russian": "Ребята едят пирожки с мясом на школьном обеде.",
        "acceptedAnswers": [
          "Ребята едят пирожки с мясом на школьном обеде",
          "Дети едят эмпанадас с мясом на школьном обеде",
          "Дети едят пирожки с мясом на школьном обеде"
        ],
        "hint": "comer • ellos comen = они едят",
        "distractors": [
          "сыром",
          "завтраке"
        ]
      },
      {
        "id": "es_ru_5_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "spanish": "El perrito corre feliz por el jardín cuando llega papá.",
        "russian": "Щенок радостно бегает по саду, когда приходит папа.",
        "acceptedAnswers": [
          "Щенок радостно бегает по саду, когда приходит папа",
          "Щенок радостно бегает по саду когда приходит папа",
          "Собачка весело бежит по саду, когда приходит папа"
        ],
        "hint": "correr • corre = бегает",
        "distractors": [
          "кот",
          "мама"
        ]
      },
      {
        "id": "es_ru_5_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras corremos bajo la lluvia tibia de verano.",
        "russian": "Мы бегаем под тёплым летним дождём.",
        "acceptedAnswers": [
          "Мы бегаем под тёплым летним дождём",
          "Мы бегаем под теплым летним дождем",
          "Мы бежим под тёплым летним дождём"
        ],
        "hint": "correr • corremos = мы бегаем",
        "distractors": [
          "холодным",
          "снежным"
        ]
      },
      {
        "id": "es_ru_5_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "spanish": "Yo escucho el canto del gallo muy temprano en el campo.",
        "russian": "Я слышу пение петуха очень рано в деревне.",
        "acceptedAnswers": [
          "Я слышу пение петуха очень рано в деревне",
          "Я слушаю пение петуха очень рано в деревне",
          "Я слушаю пение петуха рано утром за городом"
        ],
        "hint": "escuchar • escucho = я слышу/слушаю",
        "distractors": [
          "птиц",
          "поздно"
        ]
      },
      {
        "id": "es_ru_5_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "spanish": "Ellos escuchan atentos el relato del abuelo sobre su juventud.",
        "russian": "Они внимательно слушают рассказ дедушки о его молодости.",
        "acceptedAnswers": [
          "Они внимательно слушают рассказ дедушки о его молодости",
          "Они слушают дедушкин рассказ о молодости"
        ],
        "hint": "escuchar • escuchan = они слушают",
        "distractors": [
          "бабушки",
          "детстве"
        ]
      },
      {
        "id": "es_ru_5_11",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "spanish": "Vos mirás por la ventanilla del auto los árboles verdes.",
        "russian": "Ты смотришь из окна машины на зелёные деревья.",
        "acceptedAnswers": [
          "Ты смотришь из окна машины на зелёные деревья",
          "Ты смотришь из окна машины на зеленые деревья",
          "Ты глядишь в окно автомобиля на зелёные деревья"
        ],
        "hint": "mirar • mirás = ты смотришь",
        "distractors": [
          "дома",
          "двери"
        ]
      },
      {
        "id": "es_ru_5_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "spanish": "La mamá mira cómo juegan sus hijos en el patio.",
        "russian": "Мама смотрит, как её дети играют во дворе.",
        "acceptedAnswers": [
          "Мама смотрит, как её дети играют во дворе",
          "Мама смотрит как её дети играют во дворе",
          "Мама наблюдает, как играют её дети во дворе"
        ],
        "hint": "mirar • mira = смотрит",
        "distractors": [
          "папа",
          "парке"
        ]
      },
      {
        "id": "es_ru_5_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros compramos pochoclos dulces antes de entrar al cine.",
        "russian": "Мы покупаем сладкий попкорн перед входом в кинотеатр.",
        "acceptedAnswers": [
          "Мы покупаем сладкий попкорн перед входом в кинотеатр",
          "Мы берем сладкий попкорн перед сеансом кино"
        ],
        "hint": "comprar • compramos = мы покупаем",
        "distractors": [
          "солёный",
          "театр"
        ]
      },
      {
        "id": "es_ru_5_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes compran lápices nuevos para dibujar en plástica.",
        "russian": "Вы покупаете новые карандаши для рисования на уроке творчества.",
        "acceptedAnswers": [
          "Вы покупаете новые карандаши для рисования на уроке творчества",
          "Вы берете новые карандаши для рисования"
        ],
        "hint": "comprar • compran = вы покупаете",
        "distractors": [
          "ручки",
          "математики"
        ]
      },
      {
        "id": "es_ru_5_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "spanish": "El canguro salta rápido en la pradera verde.",
        "russian": "Кенгуру быстро прыгает по зелёному лугу.",
        "acceptedAnswers": [
          "Кенгуру быстро прыгает по зелёному лугу",
          "Кенгуру быстро прыгает по зеленому лугу",
          "Кенгуру скачет быстро по зеленой поляне"
        ],
        "hint": "saltar • salta = прыгает",
        "distractors": [
          "зайчик",
          "медленно"
        ]
      },
      {
        "id": "es_ru_5_16",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "spanish": "Yo salto a la cuerda y cuento hasta diez en español.",
        "russian": "Я прыгаю через скакалку и считаю до десяти по-испански.",
        "acceptedAnswers": [
          "Я прыгаю через скакалку и считаю до десяти по-испански",
          "Я скачу на скакалке и считаю до десяти по-испански"
        ],
        "hint": "saltar • salto = я прыгаю",
        "distractors": [
          "двадцати",
          "по-русски"
        ]
      },
      {
        "id": "es_ru_5_17",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "spanish": "Vos esperás que la sopa tibia se enfríe un poco.",
        "russian": "Ты ждёшь, пока тёплый суп немного остынет.",
        "acceptedAnswers": [
          "Ты ждёшь, пока тёплый суп немного остынет",
          "Ты ждешь, пока теплый суп немного остынет",
          "Ты ждешь, когда остынет суп"
        ],
        "hint": "esperar • esperás = ты ждёшь",
        "distractors": [
          "чай",
          "нагреется"
        ]
      },
      {
        "id": "es_ru_5_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros esperamos ansiosos las vacaciones de verano.",
        "russian": "Мы с нетерпением ждём летних каникул.",
        "acceptedAnswers": [
          "Мы с нетерпением ждём летних каникул",
          "Мы с нетерпением ждем летних каникул",
          "Мы с волнением ждем летние каникулы"
        ],
        "hint": "esperar • esperamos = мы ждём",
        "distractors": [
          "зимних",
          "выходных"
        ]
      },
      {
        "id": "es_ru_5_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "spanish": "El hermano mayor ayuda al pequeño a atarse los cordones.",
        "russian": "Старший брат помогает младшему завязать шнурки.",
        "acceptedAnswers": [
          "Старший брат помогает младшему завязать шнурки",
          "Старший брат помогает маленькому завязать шнурки"
        ],
        "hint": "ayudar • ayuda = помогает",
        "distractors": [
          "сестра",
          "ботинки"
        ]
      },
      {
        "id": "es_ru_5_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes ayudan a cuidar a las mascotas de la casa con cariño.",
        "russian": "Вы с заботой помогаете ухаживать за домашними питомцами.",
        "acceptedAnswers": [
          "Вы с заботой помогаете ухаживать за домашними питомцами",
          "Вы заботливо помогаете ухаживать за питомцами в доме"
        ],
        "hint": "ayudar • ayudan = вы помогаете",
        "distractors": [
          "растениями",
          "собакой"
        ]
      }
    ]
  }
];

export const EXERCISES_RU_TO_ES = [
  {
    "id": 1,
    "title": "Упр. 1: Мои и твои действия (yo и vos)",
    "shortTitle": "1. Я и ты",
    "description": "Переводим русские фразы с формами yo (-o) и vos (-ás, -és) на испанский",
    "icon": "⭐",
    "sentences": [
      {
        "id": "ru_es_1_01",
        "verb": "dibujar",
        "verbForm": "dibujo",
        "verbPerson": "yo",
        "russian": "Я рисую синюю птицу на ветке дерева.",
        "spanish": "Yo dibujo un pájaro azul en la rama.",
        "acceptedAnswers": [
          "Yo dibujo un pájaro azul en la rama",
          "Dibujo un pájaro azul en la rama",
          "Yo dibujo un pajaro azul en la rama",
          "Dibujo un pajaro azul en la rama"
        ],
        "hint": "рисовать = dibujar • я рисую = yo dibujo",
        "distractors": [
          "pintas",
          "rojo",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_02",
        "verb": "dibujar",
        "verbForm": "dibujás",
        "verbPerson": "vos",
        "russian": "Ты рисуешь красивый замок с башенками.",
        "spanish": "Vos dibujás un castillo lindo con torres.",
        "acceptedAnswers": [
          "Vos dibujás un castillo lindo con torres",
          "Dibujás un castillo lindo con torres",
          "Vos dibujas un castillo lindo con torres",
          "Dibujas un castillo lindo con torres",
          "Tú dibujas un castillo lindo con torres"
        ],
        "hint": "рисовать = dibujar • ты рисуешь = vos dibujás",
        "distractors": [
          "dibujo",
          "casa",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_03",
        "verb": "pintar",
        "verbForm": "pinto",
        "verbPerson": "yo",
        "russian": "Я раскрашиваю страницу в альбоме для рисования.",
        "spanish": "Yo pinto una página en el bloc de dibujo.",
        "acceptedAnswers": [
          "Yo pinto una página en el bloc de dibujo",
          "Pinto una página en el bloc de dibujo",
          "Yo pinto una pagina en el bloc de dibujo",
          "Yo pinto una página en el cuaderno de dibujo"
        ],
        "hint": "раскрашивать = pintar • я раскрашиваю = yo pinto",
        "distractors": [
          "cuaderno",
          "lees",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_04",
        "verb": "pintar",
        "verbForm": "pintás",
        "verbPerson": "vos",
        "russian": "Ты красишь деревянную рамку в жёлтый цвет.",
        "spanish": "Vos pintás el marco de madera de color amarillo.",
        "acceptedAnswers": [
          "Vos pintás el marco de madera de color amarillo",
          "Pintás el marco de madera de color amarillo",
          "Vos pintas el marco de madera de color amarillo",
          "Tú pintas el marco de madera de color amarillo"
        ],
        "hint": "красить = pintar • ты красишь = vos pintás",
        "distractors": [
          "pinto",
          "azul",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_05",
        "verb": "comer",
        "verbForm": "como",
        "verbPerson": "yo",
        "russian": "Я ем тёплый суп за кухонным столом.",
        "spanish": "Yo como sopa tibia en la mesa de la cocina.",
        "acceptedAnswers": [
          "Yo como sopa tibia en la mesa de la cocina",
          "Como sopa tibia en la mesa de la cocina"
        ],
        "hint": "есть/кушать = comer • я ем = yo como",
        "distractors": [
          "comes",
          "fría",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_06",
        "verb": "comer",
        "verbForm": "comés",
        "verbPerson": "vos",
        "russian": "Ты кушаешь сладкое мороженое с клубникой.",
        "spanish": "Vos comés helado dulce con frutilla.",
        "acceptedAnswers": [
          "Vos comés helado dulce con frutilla",
          "Comés helado dulce con frutilla",
          "Vos comes helado dulce con frutilla",
          "Tú comes helado dulce con frutilla"
        ],
        "hint": "кушать = comer • ты кушаешь = vos comés",
        "distractors": [
          "como",
          "chocolate",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_07",
        "verb": "correr",
        "verbForm": "corro",
        "verbPerson": "yo",
        "russian": "Я бегаю каждое утро по дорожке парка.",
        "spanish": "Yo corro cada mañana por el camino del parque.",
        "acceptedAnswers": [
          "Yo corro cada mañana por el camino del parque",
          "Corro cada mañana por el camino del parque"
        ],
        "hint": "бегать = correr • я бегаю = yo corro",
        "distractors": [
          "corres",
          "tarde",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "russian": "Ты быстро бежишь за летящим мячом.",
        "spanish": "Vos corrés rápido tras la pelota.",
        "acceptedAnswers": [
          "Vos corrés rápido tras la pelota",
          "Corrés rápido tras la pelota",
          "Vos corres rápido tras la pelota",
          "Vos corrés rápido detrás de la pelota",
          "Tú corres rápido tras la pelota"
        ],
        "hint": "бежать = correr • ты бежишь = vos corrés",
        "distractors": [
          "corro",
          "despacio",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "russian": "Я слушаю спокойную музыку перед сном.",
        "spanish": "Yo escucho música tranquila antes de dormir.",
        "acceptedAnswers": [
          "Yo escucho música tranquila antes de dormir",
          "Escucho música tranquila antes de dormir",
          "Yo escucho musica tranquila antes de dormir"
        ],
        "hint": "слушать = escuchar • я слушаю = yo escucho",
        "distractors": [
          "escuchas",
          "fuerte",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_10",
        "verb": "escuchar",
        "verbForm": "escuchás",
        "verbPerson": "vos",
        "russian": "Ты слушаешь шум морских волн на берегу.",
        "spanish": "Vos escuchás las olas del mar en la orilla.",
        "acceptedAnswers": [
          "Vos escuchás las olas del mar en la orilla",
          "Escuchás las olas del mar en la orilla",
          "Vos escuchas las olas del mar en la orilla",
          "Tú escuchas las olas del mar en la orilla"
        ],
        "hint": "слушать = escuchar • ты слушаешь = vos escuchás",
        "distractors": [
          "escucho",
          "viento",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "russian": "Я смотрю на яркую луну на тёмном небе.",
        "spanish": "Yo miro la luna brillante en el cielo oscuro.",
        "acceptedAnswers": [
          "Yo miro la luna brillante en el cielo oscuro",
          "Miro la luna brillante en el cielo oscuro"
        ],
        "hint": "смотреть = mirar • я смотрю = yo miro",
        "distractors": [
          "miras",
          "sol",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_12",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "russian": "Ты внимательно смотришь на новую игрушку.",
        "spanish": "Vos mirás con atención el juguete nuevo.",
        "acceptedAnswers": [
          "Vos mirás con atención el juguete nuevo",
          "Mirás con atención el juguete nuevo",
          "Vos miras con atención el juguete nuevo",
          "Tú miras con atención el juguete nuevo"
        ],
        "hint": "смотреть = mirar • ты смотришь = vos mirás",
        "distractors": [
          "miro",
          "libro",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_13",
        "verb": "comprar",
        "verbForm": "compro",
        "verbPerson": "yo",
        "russian": "Я покупаю вкусный бутерброд в школьном буфете.",
        "spanish": "Yo compro un sándwich rico en el comedor escolar.",
        "acceptedAnswers": [
          "Yo compro un sándwich rico en el comedor escolar",
          "Compro un sándwich rico en el comedor escolar",
          "Yo compro un sandwich rico en el comedor escolar"
        ],
        "hint": "покупать = comprar • я покупаю = yo compro",
        "distractors": [
          "compras",
          "jugo",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_14",
        "verb": "comprar",
        "verbForm": "comprás",
        "verbPerson": "vos",
        "russian": "Ты покупаешь яркие наклейки для своего дневника.",
        "spanish": "Vos comprás figuritas de colores para tu diario.",
        "acceptedAnswers": [
          "Vos comprás figuritas de colores para tu diario",
          "Comprás figuritas de colores para tu diario",
          "Vos compras figuritas de colores para tu diario",
          "Tú compras figuritas de colores para tu diario"
        ],
        "hint": "покупать = comprar • ты покупаешь = vos comprás",
        "distractors": [
          "compro",
          "lápices",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_15",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "russian": "Я высоко прыгаю через натянутую верёвочку.",
        "spanish": "Yo salto bien alto sobre la cuerda.",
        "acceptedAnswers": [
          "Yo salto bien alto sobre la cuerda",
          "Salto bien alto sobre la cuerda"
        ],
        "hint": "прыгать = saltar • я прыгаю = yo salto",
        "distractors": [
          "saltas",
          "banco",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_16",
        "verb": "saltar",
        "verbForm": "saltás",
        "verbPerson": "vos",
        "russian": "Ты скачешь на одной ножке по классикам.",
        "spanish": "Vos saltás en una pata en la rayuela.",
        "acceptedAnswers": [
          "Vos saltás en una pata en la rayuela",
          "Saltás en una pata en la rayuela",
          "Vos saltas en una pata en la rayuela",
          "Tú saltas en una pata en la rayuela"
        ],
        "hint": "скакать/прыгать = saltar • ты скачешь = vos saltás",
        "distractors": [
          "salto",
          "corres",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_17",
        "verb": "esperar",
        "verbForm": "espero",
        "verbPerson": "yo",
        "russian": "Я жду прихода школьного автобуса на остановке.",
        "spanish": "Yo espero el autobús escolar en la parada.",
        "acceptedAnswers": [
          "Yo espero el autobús escolar en la parada",
          "Espero el autobús escolar en la parada",
          "Yo espero el colectivo escolar en la parada",
          "Espero el colectivo escolar en la parada"
        ],
        "hint": "ждать = esperar • я жду = yo espero",
        "distractors": [
          "esperas",
          "tren",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_18",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "russian": "Ты терпеливо ждёшь свой любимый десерт.",
        "spanish": "Vos esperás tu postre favorito con paciencia.",
        "acceptedAnswers": [
          "Vos esperás tu postre favorito con paciencia",
          "Esperás tu postre favorito con paciencia",
          "Vos esperas tu postre favorito con paciencia",
          "Tú esperas tu postre favorito con paciencia"
        ],
        "hint": "ждать = esperar • ты ждёшь = vos esperás",
        "distractors": [
          "espero",
          "comida",
          "yo"
        ]
      },
      {
        "id": "ru_es_1_19",
        "verb": "ayudar",
        "verbForm": "ayudo",
        "verbPerson": "yo",
        "russian": "Я помогаю дедушке поливать помидоры на грядке.",
        "spanish": "Yo ayudo al abuelo a regar los tomates en la huerta.",
        "acceptedAnswers": [
          "Yo ayudo al abuelo a regar los tomates en la huerta",
          "Ayudo al abuelo a regar los tomates en la huerta"
        ],
        "hint": "помогать = ayudar • я помогаю = yo ayudo",
        "distractors": [
          "ayudas",
          "flores",
          "vos"
        ]
      },
      {
        "id": "ru_es_1_20",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "russian": "Ты помогаешь сестрёнке собрать рассыпанные карандаши.",
        "spanish": "Vos ayudás a tu hermana a juntar los lápices.",
        "acceptedAnswers": [
          "Vos ayudás a tu hermana a juntar los lápices",
          "Ayudás a tu hermana a juntar los lápices",
          "Vos ayudas a tu hermana a juntar los lápices",
          "Tú ayudas a tu hermana a juntar los lápices"
        ],
        "hint": "помогать = ayudar • ты помогаешь = vos ayudás",
        "distractors": [
          "ayudo",
          "juguetes",
          "yo"
        ]
      }
    ]
  },
  {
    "id": 2,
    "title": "Упр. 2: Семья, друзья и питомцы (él, ella)",
    "shortTitle": "2. Семья и друзья",
    "description": "Переводим фразы про маму, папу, брата, сестру, питомцев (хвостики -a, -e)",
    "icon": "👨‍👩‍👧",
    "sentences": [
      {
        "id": "ru_es_2_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "él",
        "russian": "Папа рисует план нового деревянного стола.",
        "spanish": "El papá dibuja el plano de una mesa de madera.",
        "acceptedAnswers": [
          "El papá dibuja el plano de una mesa de madera",
          "Papá dibuja el plano de una mesa de madera"
        ],
        "hint": "рисовать = dibujar • папа рисует = el papá dibuja",
        "distractors": [
          "pinta",
          "silla",
          "mamá"
        ]
      },
      {
        "id": "ru_es_2_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "russian": "Сестра рисует сказочную фею с крыльями.",
        "spanish": "La hermana dibuja un hada mágica con alas.",
        "acceptedAnswers": [
          "La hermana dibuja un hada mágica con alas",
          "Mi hermana dibuja un hada mágica con alas"
        ],
        "hint": "рисовать = dibujar • сестра рисует = la hermana dibuja",
        "distractors": [
          "princesa",
          "hermano",
          "pinta"
        ]
      },
      {
        "id": "ru_es_2_03",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "él",
        "russian": "Дедушка красит старую скамейку в саду.",
        "spanish": "El abuelo pinta el banco viejo del jardín.",
        "acceptedAnswers": [
          "El abuelo pinta el banco viejo del jardín",
          "Mi abuelo pinta el banco viejo del jardín"
        ],
        "hint": "красить = pintar • дедушка красит = el abuelo pinta",
        "distractors": [
          "mesa",
          "abuela",
          "dibuja"
        ]
      },
      {
        "id": "ru_es_2_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "russian": "Мама раскрашивает глиняную вазочку для цветов.",
        "spanish": "La mamá pinta un florero de arcilla.",
        "acceptedAnswers": [
          "La mamá pinta un florero de arcilla",
          "Mamá pinta un florero de arcilla"
        ],
        "hint": "раскрашивать = pintar • мама раскрашивает = la mamá pinta",
        "distractors": [
          "plato",
          "papá",
          "compra"
        ]
      },
      {
        "id": "ru_es_2_05",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "él",
        "russian": "Брат ест горячие тосты с клубничным вареньем.",
        "spanish": "El hermano come tostadas calientes con dulce de frutilla.",
        "acceptedAnswers": [
          "El hermano come tostadas calientes con dulce de frutilla",
          "Mi hermano come tostadas calientes con dulce de frutilla"
        ],
        "hint": "есть = comer • брат ест = el hermano come",
        "distractors": [
          "queso",
          "hermana",
          "como"
        ]
      },
      {
        "id": "ru_es_2_06",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "ella",
        "russian": "Бабушка кушает свежий пирог с яблоками.",
        "spanish": "La abuela come una tarta fresca de manzana.",
        "acceptedAnswers": [
          "La abuela come una tarta fresca de manzana",
          "Mi abuela come una tarta fresca de manzana"
        ],
        "hint": "кушать = comer • бабушка кушает = la abuela come",
        "distractors": [
          "naranja",
          "abuelo",
          "bebe"
        ]
      },
      {
        "id": "ru_es_2_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "russian": "Пёс бежит за брошенной палкой во дворе.",
        "spanish": "El perro corre tras el palo en el patio.",
        "acceptedAnswers": [
          "El perro corre tras el palo en el patio",
          "El perro corre detrás del palo en el patio"
        ],
        "hint": "бежать = correr • пёс бежит = el perro corre",
        "distractors": [
          "pelota",
          "gato",
          "camina"
        ]
      },
      {
        "id": "ru_es_2_08",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "ella",
        "russian": "Подруга бежит навстречу с широкой улыбкой.",
        "spanish": "La amiga corre al encuentro con una gran sonrisa.",
        "acceptedAnswers": [
          "La amiga corre al encuentro con una gran sonrisa",
          "Mi amiga corre al encuentro con una gran sonrisa"
        ],
        "hint": "бежать = correr • подруга бежит = la amiga corre",
        "distractors": [
          "llorando",
          "amigo",
          "salta"
        ]
      },
      {
        "id": "ru_es_2_09",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "él",
        "russian": "Учитель слушает ответ ученика у доски.",
        "spanish": "El maestro escucha la respuesta del alumno en el pizarrón.",
        "acceptedAnswers": [
          "El maestro escucha la respuesta del alumno en el pizarrón",
          "El profesor escucha la respuesta del alumno en el pizarrón"
        ],
        "hint": "слушать = escuchar • учитель слушает = el maestro escucha",
        "distractors": [
          "mira",
          "pregunta",
          "lee"
        ]
      },
      {
        "id": "ru_es_2_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "russian": "Мама слушает пение птиц ранним утром.",
        "spanish": "La mamá escucha el canto de las aves temprano.",
        "acceptedAnswers": [
          "La mamá escucha el canto de las aves temprano",
          "Mamá escucha el canto de los pájaros temprano"
        ],
        "hint": "слушать = escuchar • мама слушает = la mamá escucha",
        "distractors": [
          "noche",
          "tarde",
          "mira"
        ]
      },
      {
        "id": "ru_es_2_11",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "él",
        "russian": "Друг смотрит на витрину с игрушечными поездами.",
        "spanish": "El amigo mira la vidriera con trenes de juguete.",
        "acceptedAnswers": [
          "El amigo mira la vidriera con trenes de juguete",
          "Mi amigo mira la vidriera de trenes de juguete"
        ],
        "hint": "смотреть = mirar • друг смотрит = el amigo mira",
        "distractors": [
          "autos",
          "amiga",
          "compra"
        ]
      },
      {
        "id": "ru_es_2_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "russian": "Майя смотрит на разноцветных рыб в аквариуме.",
        "spanish": "Maya mira los peces de colores en el acuario.",
        "acceptedAnswers": [
          "Maya mira los peces de colores en el acuario",
          "Maya mira peces coloridos en el acuario"
        ],
        "hint": "смотреть = mirar • Майя смотрит = Maya mira",
        "distractors": [
          "pájaros",
          "laguna",
          "pesca"
        ]
      },
      {
        "id": "ru_es_2_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "él",
        "russian": "Дедушка покупает свежую газету в киоске.",
        "spanish": "El abuelo compra el diario fresco en el quiosco.",
        "acceptedAnswers": [
          "El abuelo compra el diario fresco en el quiosco",
          "El abuelo compra el periódico en el quiosco"
        ],
        "hint": "покупать = comprar • дедушка покупает = el abuelo compra",
        "distractors": [
          "revista",
          "abuela",
          "vende"
        ]
      },
      {
        "id": "ru_es_2_14",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "russian": "Сестра покупает цветные ленты для волос.",
        "spanish": "La hermana compra cintas de colores para el pelo.",
        "acceptedAnswers": [
          "La hermana compra cintas de colores para el pelo",
          "Mi hermana compra cintas de colores para el pelo"
        ],
        "hint": "покупать = comprar • сестра покупает = la hermana compra",
        "distractors": [
          "gorra",
          "hermano",
          "busca"
        ]
      },
      {
        "id": "ru_es_2_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "russian": "Кот ловко прыгает на мягкое кресло.",
        "spanish": "El gato salta con agilidad al sillón suave.",
        "acceptedAnswers": [
          "El gato salta con agilidad al sillón suave",
          "El gato salta al sillón suave"
        ],
        "hint": "прыгать = saltar • кот прыгает = el gato salta",
        "distractors": [
          "cama",
          "perro",
          "corre"
        ]
      },
      {
        "id": "ru_es_2_16",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "ella",
        "russian": "Малышка прыгает от восторга при виде щенка.",
        "spanish": "La nena salta de emoción al ver al perrito.",
        "acceptedAnswers": [
          "La nena salta de emoción al ver al perrito",
          "La niña salta de alegría al ver al perrito"
        ],
        "hint": "прыгать = saltar • девочка прыгает = la nena salta",
        "distractors": [
          "miedo",
          "gatito",
          "llora"
        ]
      },
      {
        "id": "ru_es_2_17",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "él",
        "russian": "Папа ждёт зелёный сигнал на перекрёстке.",
        "spanish": "El papá espera la señal verde en la esquina.",
        "acceptedAnswers": [
          "El papá espera la señal verde en la esquina",
          "Papá espera la luz verde en la esquina"
        ],
        "hint": "ждать = esperar • папа ждёт = el papá espera",
        "distractors": [
          "roja",
          "auto",
          "mira"
        ]
      },
      {
        "id": "ru_es_2_18",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "ella",
        "russian": "Бабушка ждёт гостей с горячим пирогом.",
        "spanish": "La abuela espera a los invitados con una tarta caliente.",
        "acceptedAnswers": [
          "La abuela espera a los invitados con una tarta caliente",
          "Mi abuela espera visitas con una torta caliente"
        ],
        "hint": "ждать = esperar • бабушка ждёт = la abuela espera",
        "distractors": [
          "amigos",
          "abuelo",
          "come"
        ]
      },
      {
        "id": "ru_es_2_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "russian": "Брат помогает папе собрать новую книжную полку.",
        "spanish": "El hermano ayuda a papá a armar la biblioteca nueva.",
        "acceptedAnswers": [
          "El hermano ayuda a papá a armar la biblioteca nueva",
          "Mi hermano ayuda a papá a armar la estantería"
        ],
        "hint": "помогать = ayudar • брат помогает = el hermano ayuda",
        "distractors": [
          "desarmar",
          "mesa",
          "mira"
        ]
      },
      {
        "id": "ru_es_2_20",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "ella",
        "russian": "Подруга помогает учительнице сложить книги на столе.",
        "spanish": "La amiga ayuda a la seño a ordenar los libros.",
        "acceptedAnswers": [
          "La amiga ayuda a la seño a ordenar los libros",
          "La amiga ayuda a la maestra a acomodar los libros"
        ],
        "hint": "помогать = ayudar • подруга помогает = la amiga ayuda",
        "distractors": [
          "tirar",
          "cuadernos",
          "lee"
        ]
      }
    ]
  },
  {
    "id": 3,
    "title": "Упр. 3: Мы делаем вместе (nosotros / nosotras)",
    "shortTitle": "3. Мы вместе",
    "description": "Переводим русские предложения про \"мы\" с хвостиками -amos и -emos",
    "icon": "🤝",
    "sentences": [
      {
        "id": "ru_es_3_01",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotros",
        "russian": "Мы рисуем большую ракету, летящую в космос.",
        "spanish": "Nosotros dibujamos un cohete grande que vuela al espacio.",
        "acceptedAnswers": [
          "Nosotros dibujamos un cohete grande que vuela al espacio",
          "Dibujamos un cohete grande que vuela al espacio"
        ],
        "hint": "рисовать = dibujar • мы рисуем = nosotros dibujamos",
        "distractors": [
          "avión",
          "ustedes",
          "pintamos"
        ]
      },
      {
        "id": "ru_es_3_02",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) рисуем пышные цветы в альбоме.",
        "spanish": "Nosotras dibujamos flores hermosas en el álbum.",
        "acceptedAnswers": [
          "Nosotras dibujamos flores hermosas en el álbum",
          "Dibujamos flores hermosas en el álbum"
        ],
        "hint": "рисовать = dibujar • мы рисуем = nosotras dibujamos",
        "distractors": [
          "árboles",
          "ellos",
          "leemos"
        ]
      },
      {
        "id": "ru_es_3_03",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotros",
        "russian": "Мы раскрашиваем деревянные кубики яркими красками.",
        "spanish": "Nosotros pintamos los cubos de madera con témperas brillantes.",
        "acceptedAnswers": [
          "Nosotros pintamos los cubos de madera con témperas brillantes",
          "Pintamos los cubos de madera con témperas brillantes"
        ],
        "hint": "раскрашивать = pintar • мы раскрашиваем = nosotros pintamos",
        "distractors": [
          "papel",
          "lápices",
          "dibujamos"
        ]
      },
      {
        "id": "ru_es_3_04",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) красим декоративные камни в золотой цвет.",
        "spanish": "Nosotras pintamos piedras decorativas de color dorado.",
        "acceptedAnswers": [
          "Nosotras pintamos piedras decorativas de color dorado",
          "Pintamos piedras decorativas de color dorado"
        ],
        "hint": "красить = pintar • мы красим = nosotras pintamos",
        "distractors": [
          "plata",
          "madera",
          "compramos"
        ]
      },
      {
        "id": "ru_es_3_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "russian": "Мы едим хрустящее печенье с тёплым молоком.",
        "spanish": "Nosotros comemos galletitas crocantes con leche tibia.",
        "acceptedAnswers": [
          "Nosotros comemos galletitas crocantes con leche tibia",
          "Comemos galletitas crocantes con leche tibia"
        ],
        "hint": "есть = comer • мы едим = nosotros comemos",
        "distractors": [
          "té",
          "pan",
          "comen"
        ]
      },
      {
        "id": "ru_es_3_06",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) кушаем спелый арбуз в саду.",
        "spanish": "Nosotras comemos sandía madura en el jardín.",
        "acceptedAnswers": [
          "Nosotras comemos sandía madura en el jardín",
          "Comemos sandía madura en el jardín"
        ],
        "hint": "кушать = comer • мы кушаем = nosotras comemos",
        "distractors": [
          "manzana",
          "cocina",
          "beben"
        ]
      },
      {
        "id": "ru_es_3_07",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotros",
        "russian": "Мы бежим на спортивную площадку после звонка.",
        "spanish": "Nosotros corremos a la cancha después del timbre.",
        "acceptedAnswers": [
          "Nosotros corremos a la cancha después del timbre",
          "Corremos a la cancha después del timbre"
        ],
        "hint": "бежать = correr • мы бежим = nosotros corremos",
        "distractors": [
          "aula",
          "antes",
          "saltamos"
        ]
      },
      {
        "id": "ru_es_3_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) быстро бежим под зонтом во время ливня.",
        "spanish": "Nosotras corremos rápido bajo el paraguas durante la lluvia.",
        "acceptedAnswers": [
          "Nosotras corremos rápido bajo el paraguas durante la lluvia",
          "Corremos rápido bajo el paraguas durante la lluvia"
        ],
        "hint": "бежать = correr • мы бежим = nosotras corremos",
        "distractors": [
          "sol",
          "despacio",
          "caminan"
        ]
      },
      {
        "id": "ru_es_3_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotros",
        "russian": "Мы с интересом слушаем рассказ о динозаврах.",
        "spanish": "Nosotros escuchamos con interés el relato sobre dinosaurios.",
        "acceptedAnswers": [
          "Nosotros escuchamos con interés el relato sobre dinosaurios",
          "Escuchamos con interés el relato sobre dinosaurios"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotros escuchamos",
        "distractors": [
          "miramos",
          "planetas",
          "leen"
        ]
      },
      {
        "id": "ru_es_3_10",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) слушаем весёлую аргентинскую песню.",
        "spanish": "Nosotras escuchamos una canción argentina divertida.",
        "acceptedAnswers": [
          "Nosotras escuchamos una canción argentina divertida",
          "Escuchamos una canción argentina divertida"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotras escuchamos",
        "distractors": [
          "triste",
          "bailamos",
          "miran"
        ]
      },
      {
        "id": "ru_es_3_11",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotros",
        "russian": "Мы смотрим на парящих орлов высоко в небе.",
        "spanish": "Nosotros miramos las águilas que vuelan alto en el cielo.",
        "acceptedAnswers": [
          "Nosotros miramos las águilas que vuelan alto en el cielo",
          "Miramos las águilas que vuelan alto en el cielo"
        ],
        "hint": "смотреть = mirar • мы смотрим = nosotros miramos",
        "distractors": [
          "palomas",
          "árbol",
          "escuchan"
        ]
      },
      {
        "id": "ru_es_3_12",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) смотрим на яркие огни праздничного салюта.",
        "spanish": "Nosotras miramos las luces brillantes de los fuegos artificiales.",
        "acceptedAnswers": [
          "Nosotras miramos las luces brillantes de los fuegos artificiales",
          "Miramos las luces brillantes de los fuegos artificiales"
        ],
        "hint": "смотреть = mirar • мы смотрим = nosotras miramos",
        "distractors": [
          "estrellas",
          "humo",
          "buscan"
        ]
      },
      {
        "id": "ru_es_3_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "russian": "Мы покупаем вкусные бублики в пекарне у дома.",
        "spanish": "Nosotros compramos panes ricos en la panadería del barrio.",
        "acceptedAnswers": [
          "Nosotros compramos panes ricos en la panadería del barrio",
          "Compramos panes ricos en la panadería del barrio"
        ],
        "hint": "покупать = comprar • мы покупаем = nosotros compramos",
        "distractors": [
          "supermercado",
          "caros",
          "venden"
        ]
      },
      {
        "id": "ru_es_3_14",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) покупаем разноцветные резинки для волос.",
        "spanish": "Nosotras compramos gomitas de colores para el peinado.",
        "acceptedAnswers": [
          "Nosotras compramos gomitas de colores para el peinado",
          "Compramos gomitas de colores para el peinado"
        ],
        "hint": "покупать = comprar • мы покупаем = nosotras compramos",
        "distractors": [
          "hebillas",
          "ropa",
          "buscamos"
        ]
      },
      {
        "id": "ru_es_3_15",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "russian": "Мы дружно прыгаем в бассейн в жаркий день.",
        "spanish": "Nosotros saltamos juntos a la pileta en un día caluroso.",
        "acceptedAnswers": [
          "Nosotros saltamos juntos a la pileta en un día caluroso",
          "Saltamos juntos a la pileta en un día caluroso"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotros saltamos",
        "distractors": [
          "frío",
          "mar",
          "corremos"
        ]
      },
      {
        "id": "ru_es_3_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) высоко прыгаем на гимнастическом коврике.",
        "spanish": "Nosotras saltamos alto en la colchoneta de gimnasia.",
        "acceptedAnswers": [
          "Nosotras saltamos alto en la colchoneta de gimnasia",
          "Saltamos alto en la colchoneta de gimnasia"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotras saltamos",
        "distractors": [
          "suelo",
          "cama",
          "caen"
        ]
      },
      {
        "id": "ru_es_3_17",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "russian": "Мы ждём свистка судьи к началу футбольного матча.",
        "spanish": "Nosotros esperamos el silbato del árbitro para empezar el partido.",
        "acceptedAnswers": [
          "Nosotros esperamos el silbato del árbitro para empezar el partido",
          "Esperamos el silbato del árbitro para empezar el partido"
        ],
        "hint": "ждать = esperar • мы ждём = nosotros esperamos",
        "distractors": [
          "final",
          "entrenador",
          "juegan"
        ]
      },
      {
        "id": "ru_es_3_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) терпеливо ждём открытия детского парка.",
        "spanish": "Nosotras esperamos con paciencia la apertura del parque infantil.",
        "acceptedAnswers": [
          "Nosotras esperamos con paciencia la apertura del parque infantil",
          "Esperamos con paciencia la apertura del parque infantil"
        ],
        "hint": "ждать = esperar • мы ждём = nosotras esperamos",
        "distractors": [
          "cierre",
          "escuela",
          "corren"
        ]
      },
      {
        "id": "ru_es_3_19",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotros",
        "russian": "Мы помогаем соседу найти убежавшего котёнка.",
        "spanish": "Nosotros ayudamos al vecino a buscar el gatito perdido.",
        "acceptedAnswers": [
          "Nosotros ayudamos al vecino a buscar el gatito perdido",
          "Ayudamos al vecino a buscar el gatito perdido"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotros ayudamos",
        "distractors": [
          "perro",
          "amiga",
          "miramos"
        ]
      },
      {
        "id": "ru_es_3_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) с удовольствием помогаем готовить праздничный торт.",
        "spanish": "Nosotras ayudamos con gusto a preparar la torta de fiesta.",
        "acceptedAnswers": [
          "Nosotras ayudamos con gusto a preparar la torta de fiesta",
          "Ayudamos con gusto a preparar la torta de fiesta"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotras ayudamos",
        "distractors": [
          "comer",
          "galletitas",
          "compran"
        ]
      }
    ]
  },
  {
    "id": 4,
    "title": "Упр. 4: Они и вы все (ellos, ellas, ustedes)",
    "shortTitle": "4. Они и вы",
    "description": "Переводим русские фразы во множественном числе на испанский (-an, -en)",
    "icon": "👥",
    "sentences": [
      {
        "id": "ru_es_4_01",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ellos",
        "russian": "Они рисуют забавных роботов на листах бумаги.",
        "spanish": "Ellos dibujan robots divertidos en hojas de papel.",
        "acceptedAnswers": [
          "Ellos dibujan robots divertidos en hojas de papel",
          "Dibujan robots divertidos en hojas de papel"
        ],
        "hint": "рисовать = dibujar • они рисуют = ellos dibujan",
        "distractors": [
          "monstruos",
          "pared",
          "pintan"
        ]
      },
      {
        "id": "ru_es_4_02",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ustedes",
        "russian": "Вы рисуете портреты своих домашних любимцев.",
        "spanish": "Ustedes dibujan retratos de sus mascotas queridas.",
        "acceptedAnswers": [
          "Ustedes dibujan retratos de sus mascotas queridas",
          "Dibujan retratos de sus mascotas queridas"
        ],
        "hint": "рисовать = dibujar • вы рисуете = ustedes dibujan",
        "distractors": [
          "amigos",
          "juguetes",
          "miran"
        ]
      },
      {
        "id": "ru_es_4_03",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) раскрашивают глиняные горшочки для цветов.",
        "spanish": "Ellas pintan macetas de barro para las flores.",
        "acceptedAnswers": [
          "Ellas pintan macetas de barro para las flores",
          "Pintan macetas de barro para las flores"
        ],
        "hint": "раскрашивать = pintar • они раскрашивают = ellas pintan",
        "distractors": [
          "plástico",
          "árboles",
          "rompen"
        ]
      },
      {
        "id": "ru_es_4_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ustedes",
        "russian": "Вы красите беседку в саду в белый цвет.",
        "spanish": "Ustedes pintan el gazebo del jardín de color blanco.",
        "acceptedAnswers": [
          "Ustedes pintan el gazebo del jardín de color blanco",
          "Pintan el gazebo del jardín de color blanco"
        ],
        "hint": "красить = pintar • вы красите = ustedes pintan",
        "distractors": [
          "negro",
          "casa",
          "construyen"
        ]
      },
      {
        "id": "ru_es_4_05",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "russian": "Они кушают сладкую кукурузу на ярмарке.",
        "spanish": "Ellos comen choclo dulce en la feria.",
        "acceptedAnswers": [
          "Ellos comen choclo dulce en la feria",
          "Comen choclo dulce en la feria"
        ],
        "hint": "кушать = comer • они кушают = ellos comen",
        "distractors": [
          "salado",
          "cine",
          "compran"
        ]
      },
      {
        "id": "ru_es_4_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "russian": "Вы едите вкусные блинчики с карамельным соусом.",
        "spanish": "Ustedes comen panqueques ricos con dulce de leche.",
        "acceptedAnswers": [
          "Ustedes comen panqueques ricos con dulce de leche",
          "Comen panqueques ricos con dulce de leche"
        ],
        "hint": "есть = comer • вы едите = ustedes comen",
        "distractors": [
          "chocolate",
          "frutas",
          "cocinan"
        ]
      },
      {
        "id": "ru_es_4_07",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ellas",
        "russian": "Они (девочки) бегут по мягкой зелёной траве поляны.",
        "spanish": "Ellas corren por el pasto verde y suave del campo.",
        "acceptedAnswers": [
          "Ellas corren por el pasto verde y suave del campo",
          "Corren por el pasto verde y suave del campo"
        ],
        "hint": "бежать = correr • они бегут = ellas corren",
        "distractors": [
          "arena",
          "calle",
          "saltan"
        ]
      },
      {
        "id": "ru_es_4_08",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ustedes",
        "russian": "Вы бегаете утром вдоль береговой линии озера.",
        "spanish": "Ustedes corren por la mañana por la orilla del lago.",
        "acceptedAnswers": [
          "Ustedes corren por la mañana por la orilla del lago",
          "Corren por la mañana por la orilla del lago"
        ],
        "hint": "бегать = correr • вы бегаете = ustedes corren",
        "distractors": [
          "mar",
          "noche",
          "nadan"
        ]
      },
      {
        "id": "ru_es_4_09",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "russian": "Они внимательно слушают рассказ экскурсовода в музее.",
        "spanish": "Ellos escuchan atentos al guía en el museo.",
        "acceptedAnswers": [
          "Ellos escuchan atentos al guía en el museo",
          "Escuchan atentos al guía en el museo"
        ],
        "hint": "слушать = escuchar • они слушают = ellos escuchan",
        "distractors": [
          "miran",
          "cine",
          "hablan"
        ]
      },
      {
        "id": "ru_es_4_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ustedes",
        "russian": "Вы слушаете тихий шелест листьев в лесу.",
        "spanish": "Ustedes escuchan el susurro suave de las hojas en el bosque.",
        "acceptedAnswers": [
          "Ustedes escuchan el susurro suave de las hojas en el bosque",
          "Escuchan el susurro suave de las hojas en el bosque"
        ],
        "hint": "слушать = escuchar • вы слушаете = ustedes escuchan",
        "distractors": [
          "viento",
          "ciudad",
          "miran"
        ]
      },
      {
        "id": "ru_es_4_11",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ellas",
        "russian": "Они (девочки) с восторгом смотрят на цирковое представление.",
        "spanish": "Ellas miran el espectáculo del circo con emoción.",
        "acceptedAnswers": [
          "Ellas miran el espectáculo del circo con emoción",
          "Miran el espectáculo del circo con emoción"
        ],
        "hint": "смотреть = mirar • они смотрят = ellas miran",
        "distractors": [
          "teatro",
          "tristeza",
          "aplauden"
        ]
      },
      {
        "id": "ru_es_4_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "russian": "Вы смотрите на разноцветные воздушные шары в небе.",
        "spanish": "Ustedes miran los globos de colores en el cielo.",
        "acceptedAnswers": [
          "Ustedes miran los globos de colores en el cielo",
          "Miran los globos de colores en el cielo"
        ],
        "hint": "смотреть = mirar • вы смотрите = ustedes miran",
        "distractors": [
          "pájaros",
          "suelo",
          "sueltan"
        ]
      },
      {
        "id": "ru_es_4_13",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ellos",
        "russian": "Они покупают новые краски и кисточки для урока.",
        "spanish": "Ellos compran témperas nuevas y pinceles para la clase.",
        "acceptedAnswers": [
          "Ellos compran témperas nuevas y pinceles para la clase",
          "Compran témperas nuevas y pinceles para la clase"
        ],
        "hint": "покупать = comprar • они покупают = ellos compran",
        "distractors": [
          "lápices",
          "cuadernos",
          "usan"
        ]
      },
      {
        "id": "ru_es_4_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "russian": "Вы покупаете вкусный натуральный лимонад со льдом.",
        "spanish": "Ustedes compran limonada natural rica con hielo.",
        "acceptedAnswers": [
          "Ustedes compran limonada natural rica con hielo",
          "Compran limonada natural rica con hielo"
        ],
        "hint": "покупать = comprar • вы покупаете = ustedes compran",
        "distractors": [
          "jugo",
          "caliente",
          "beben"
        ]
      },
      {
        "id": "ru_es_4_15",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) синхронно прыгают в воду на тренировке.",
        "spanish": "Ellas saltan juntas al agua en el entrenamiento.",
        "acceptedAnswers": [
          "Ellas saltan juntas al agua en el entrenamiento",
          "Saltan juntas al agua en el entrenamiento"
        ],
        "hint": "прыгать = saltar • они прыгают = ellas saltan",
        "distractors": [
          "solas",
          "pileta",
          "corren"
        ]
      },
      {
        "id": "ru_es_4_16",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ustedes",
        "russian": "Вы весело прыгаете под бодрую ритмичную музыку.",
        "spanish": "Ustedes saltan felices con la música alegre.",
        "acceptedAnswers": [
          "Ustedes saltan felices con la música alegre",
          "Saltan felices con la música alegre"
        ],
        "hint": "прыгать = saltar • вы прыгаете = ustedes saltan",
        "distractors": [
          "triste",
          "bailan",
          "cantan"
        ]
      },
      {
        "id": "ru_es_4_17",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "russian": "Они терпеливо ждут своей очереди на аттракцион.",
        "spanish": "Ellos esperan con paciencia su turno en el juego.",
        "acceptedAnswers": [
          "Ellos esperan con paciencia su turno en el juego",
          "Esperan con paciencia su turno en el juego"
        ],
        "hint": "ждать = esperar • они ждут = ellos esperan",
        "distractors": [
          "cine",
          "desesperan",
          "miran"
        ]
      },
      {
        "id": "ru_es_4_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ustedes",
        "russian": "Вы ждёте начала праздничного концерта в зале.",
        "spanish": "Ustedes esperan el inicio del recital en la sala.",
        "acceptedAnswers": [
          "Ustedes esperan el inicio del recital en la sala",
          "Esperan el inicio del recital en la sala"
        ],
        "hint": "ждать = esperar • вы ждёте = ustedes esperan",
        "distractors": [
          "final",
          "calle",
          "escuchan"
        ]
      },
      {
        "id": "ru_es_4_19",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) помогают упаковывать подарки к празднику.",
        "spanish": "Ellas ayudan a envolver los regalos para la fiesta.",
        "acceptedAnswers": [
          "Ellas ayudan a envolver los regalos para la fiesta",
          "Ayudan a envolver los regalos para la fiesta"
        ],
        "hint": "помогать = ayudar • они помогают = ellas ayudan",
        "distractors": [
          "abrir",
          "comprar",
          "miran"
        ]
      },
      {
        "id": "ru_es_4_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "russian": "Вы помогаете поливать молодые саженцы в школьном саду.",
        "spanish": "Ustedes ayudan a regar los arbolitos en el jardín escolar.",
        "acceptedAnswers": [
          "Ustedes ayudan a regar los arbolitos en el jardín escolar",
          "Ayudan a regar los arbolitos en el jardín escolar"
        ],
        "hint": "помогать = ayudar • вы помогаете = ustedes ayudan",
        "distractors": [
          "cortar",
          "flores",
          "plantan"
        ]
      }
    ]
  },
  {
    "id": 5,
    "title": "Упр. 5: Финальный супер-микс всех форм",
    "shortTitle": "5. Супер-микс",
    "description": "Закрепляем все лица и формы правильных глаголов в переводе на испанский",
    "icon": "🌈",
    "sentences": [
      {
        "id": "ru_es_5_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "russian": "Майя рисует золотую бабочку на обложке тетради.",
        "spanish": "Maya dibuja una mariposa dorada en la tapa del cuaderno.",
        "acceptedAnswers": [
          "Maya dibuja una mariposa dorada en la tapa del cuaderno",
          "Maya dibuja una mariposa dorada en la portada del cuaderno"
        ],
        "hint": "рисовать = dibujar • Майя рисует = Maya dibuja",
        "distractors": [
          "pinta",
          "azul",
          "libro"
        ]
      },
      {
        "id": "ru_es_5_02",
        "verb": "dibujar",
        "verbForm": "dibujás",
        "verbPerson": "vos",
        "russian": "Ты рисуешь весёлого снеговика на белой бумаге.",
        "spanish": "Vos dibujás un muñeco de nieve divertido en el papel blanco.",
        "acceptedAnswers": [
          "Vos dibujás un muñeco de nieve divertido en el papel blanco",
          "Dibujás un muñeco de nieve divertido en el papel blanco",
          "Vos dibujas un muñeco de nieve divertido en el papel blanco",
          "Tú dibujas un muñeco de nieve divertido en el papel blanco"
        ],
        "hint": "рисовать = dibujar • ты рисуешь = vos dibujás",
        "distractors": [
          "dibujo",
          "triste",
          "pared"
        ]
      },
      {
        "id": "ru_es_5_03",
        "verb": "pintar",
        "verbForm": "pinto",
        "verbPerson": "yo",
        "russian": "Я раскрашиваю осенний пейзаж тёплыми красками.",
        "spanish": "Yo pinto un paisaje de otoño con colores cálidos.",
        "acceptedAnswers": [
          "Yo pinto un paisaje de otoño con colores cálidos",
          "Pinto un paisaje de otoño con colores cálidos",
          "Yo pinto un paisaje de otono con colores calidos"
        ],
        "hint": "раскрашивать = pintar • я раскрашиваю = yo pinto",
        "distractors": [
          "pintas",
          "fríos",
          "primavera"
        ]
      },
      {
        "id": "ru_es_5_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellos",
        "russian": "Они красят деревянные скворечники для птиц.",
        "spanish": "Ellos pintan casitas de madera para los pájaros.",
        "acceptedAnswers": [
          "Ellos pintan casitas de madera para los pájaros",
          "Pintan casitas de madera para los pájaros",
          "Ellos pintan casitas de madera para los pajaros"
        ],
        "hint": "красить = pintar • они красят = ellos pintan",
        "distractors": [
          "rompen",
          "gatos",
          "nosotros"
        ]
      },
      {
        "id": "ru_es_5_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "russian": "Мы едим домашний яблочный штрудель с корицей.",
        "spanish": "Nosotros comemos strudel casero de manzana con canela.",
        "acceptedAnswers": [
          "Nosotros comemos strudel casero de manzana con canela",
          "Comemos strudel casero de manzana con canela"
        ],
        "hint": "есть = comer • мы едим = nosotros comemos",
        "distractors": [
          "torta",
          "chocolate",
          "ustedes"
        ]
      },
      {
        "id": "ru_es_5_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "russian": "Вы кушаете хрустящие чипсы во время просмотра фильма.",
        "spanish": "Ustedes comen papas crocantes mientras miran la película.",
        "acceptedAnswers": [
          "Ustedes comen papas crocantes mientras miran la película",
          "Comen papas crocantes mientras miran la película"
        ],
        "hint": "кушать = comer • вы кушаете = ustedes comen",
        "distractors": [
          "pochoclos",
          "serie",
          "ellos"
        ]
      },
      {
        "id": "ru_es_5_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "russian": "Маленький мальчик быстро бежит к бабушке с букетом.",
        "spanish": "El nene chiquito corre rápido hacia la abuela con flores.",
        "acceptedAnswers": [
          "El nene chiquito corre rápido hacia la abuela con flores",
          "El niño corre rápido hacia la abuela con flores"
        ],
        "hint": "бежать = correr • бежит = corre",
        "distractors": [
          "mamá",
          "despacio",
          "hermana"
        ]
      },
      {
        "id": "ru_es_5_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "russian": "Ты бежишь со всех ног, чтобы успеть на поезд.",
        "spanish": "Vos corrés con todas tus fuerzas para llegar al tren.",
        "acceptedAnswers": [
          "Vos corrés con todas tus fuerzas para llegar al tren",
          "Corrés con todas tus fuerzas para llegar al tren",
          "Vos corres con todas tus fuerzas para llegar al tren",
          "Tú corres con todas tus fuerzas para llegar al tren"
        ],
        "hint": "бежать = correr • ты бежишь = vos corrés",
        "distractors": [
          "colectivo",
          "corro",
          "despacio"
        ]
      },
      {
        "id": "ru_es_5_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotros",
        "russian": "Мы внимательно слушаем указания тренера перед матчем.",
        "spanish": "Nosotros escuchamos atentos las indicaciones del entrenador.",
        "acceptedAnswers": [
          "Nosotros escuchamos atentos las indicaciones del entrenador",
          "Escuchamos atentos las indicaciones del entrenador"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotros escuchamos",
        "distractors": [
          "miramos",
          "árbitro",
          "partido"
        ]
      },
      {
        "id": "ru_es_5_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "russian": "Она слушает добрые пожелания друзей в свой день рождения.",
        "spanish": "Ella escucha los buenos deseos de sus amigos en su cumpleaños.",
        "acceptedAnswers": [
          "Ella escucha los buenos deseos de sus amigos en su cumpleaños",
          "Escucha los buenos deseos de sus amigos en su cumpleaños"
        ],
        "hint": "слушать = escuchar • она слушает = ella escucha",
        "distractors": [
          "él",
          "regalos",
          "fiesta"
        ]
      },
      {
        "id": "ru_es_5_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "russian": "Я смотрю на плывущие по небу белые облака.",
        "spanish": "Yo miro las nubes blancas que flotan en el cielo.",
        "acceptedAnswers": [
          "Yo miro las nubes blancas que flotan en el cielo",
          "Miro las nubes blancas que flotan en el cielo"
        ],
        "hint": "смотреть = mirar • я смотрю = yo miro",
        "distractors": [
          "miras",
          "negras",
          "aves"
        ]
      },
      {
        "id": "ru_es_5_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "russian": "Вы смотрите интересное научное видео о космосе.",
        "spanish": "Ustedes miran un video educativo interesante sobre el espacio.",
        "acceptedAnswers": [
          "Ustedes miran un video educativo interesante sobre el espacio",
          "Miran un video educativo interesante sobre el espacio"
        ],
        "hint": "смотреть = mirar • вы смотрите = ustedes miran",
        "distractors": [
          "película",
          "escuchan",
          "tierra"
        ]
      },
      {
        "id": "ru_es_5_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "russian": "Мама покупает свежие ингредиенты для праздничного ужина.",
        "spanish": "La mamá compra ingredientes frescos para la cena especial.",
        "acceptedAnswers": [
          "La mamá compra ingredientes frescos para la cena especial",
          "Mamá compra ingredientes frescos para la cena especial"
        ],
        "hint": "покупать = comprar • мама покупает = la mamá compra",
        "distractors": [
          "almuerzo",
          "papá",
          "cocina"
        ]
      },
      {
        "id": "ru_es_5_14",
        "verb": "comprar",
        "verbForm": "comprás",
        "verbPerson": "vos",
        "russian": "Ты покупаешь красивый блокнот в книжном магазине.",
        "spanish": "Vos comprás un cuaderno lindo en la librería.",
        "acceptedAnswers": [
          "Vos comprás un cuaderno lindo en la librería",
          "Comprás un cuaderno lindo en la librería",
          "Vos compras un cuaderno lindo en la librería",
          "Tú compras un cuaderno lindo en la librería"
        ],
        "hint": "покупать = comprar • ты покупаешь = vos comprás",
        "distractors": [
          "compro",
          "quiosco",
          "lápiz"
        ]
      },
      {
        "id": "ru_es_5_15",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ellos",
        "russian": "Дети весело прыгают через надувные препятствия.",
        "spanish": "Los chicos saltan felices sobre los obstáculos inflables.",
        "acceptedAnswers": [
          "Los chicos saltan felices sobre los obstáculos inflables",
          "Los niños saltan felices sobre los obstáculos inflables"
        ],
        "hint": "прыгать = saltar • дети прыгают = los chicos saltan",
        "distractors": [
          "corren",
          "bancos",
          "grandes"
        ]
      },
      {
        "id": "ru_es_5_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "russian": "Мы прыгаем от радости, когда наша команда побеждает.",
        "spanish": "Nosotros saltamos de alegría cuando nuestro equipo gana.",
        "acceptedAnswers": [
          "Nosotros saltamos de alegría cuando nuestro equipo gana",
          "Saltamos de alegría cuando nuestro equipo gana"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotros saltamos",
        "distractors": [
          "lloramos",
          "pierde",
          "ellos"
        ]
      },
      {
        "id": "ru_es_5_17",
        "verb": "esperar",
        "verbForm": "espero",
        "verbPerson": "yo",
        "russian": "Я жду маму возле школьных ворот после звонка.",
        "spanish": "Yo espero a mamá en el portón de la escuela tras el timbre.",
        "acceptedAnswers": [
          "Yo espero a mamá en el portón de la escuela tras el timbre",
          "Espero a mamá en el portón de la escuela tras el timbre"
        ],
        "hint": "ждать = esperar • я жду = yo espero",
        "distractors": [
          "papá",
          "esperas",
          "puerta"
        ]
      },
      {
        "id": "ru_es_5_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "russian": "Они ждут прибытия теплохода на причале.",
        "spanish": "Ellos esperan la llegada del barco en el muelle.",
        "acceptedAnswers": [
          "Ellos esperan la llegada del barco en el muelle",
          "Esperan la llegada del barco en el muelle"
        ],
        "hint": "ждать = esperar • они ждут = ellos esperan",
        "distractors": [
          "tren",
          "esperamos",
          "puerto"
        ]
      },
      {
        "id": "ru_es_5_19",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "russian": "Ты помогаешь другу понять сложное правило по грамматике.",
        "spanish": "Vos ayudás a tu amigo a entender la regla difícil.",
        "acceptedAnswers": [
          "Vos ayudás a tu amigo a entender la regla difícil",
          "Ayudás a tu amigo a entender la regla difícil",
          "Vos ayudas a tu amigo a entender la regla difícil",
          "Tú ayudas a tu amigo a entender la regla difícil"
        ],
        "hint": "помогать = ayudar • ты помогаешь = vos ayudás",
        "distractors": [
          "ayudo",
          "fácil",
          "tarea"
        ]
      },
      {
        "id": "ru_es_5_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotros",
        "russian": "Мы помогаем украсить школьный класс гирляндами.",
        "spanish": "Nosotros ayudamos a adornar el aula con guirnaldas.",
        "acceptedAnswers": [
          "Nosotros ayudamos a adornar el aula con guirnaldas",
          "Ayudamos a adornar el aula con guirnaldas"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotros ayudamos",
        "distractors": [
          "limpiar",
          "casa",
          "ustedes"
        ]
      }
    ]
  }
];

export function getExercise(direction, exerciseId) {
  const list = direction === 'ru_to_es' ? EXERCISES_RU_TO_ES : EXERCISES_ES_TO_RU;
  const numId = Number(exerciseId) || 1;
  return list.find((ex) => ex.id === numId) || list[0];
}

export function normalizeSentenceForCheck(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"()]/g, '')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function stripSpanishPronoun(text) {
  return text.replace(/^(yo|vos|tu|tú|el|él|ella|nosotros|nosotras|ustedes|ellos|ellas)\s+/i, '').trim();
}

export function isMayaSentenceAnswerCorrect(userInput, sentence) {
  if (!userInput || !sentence) return false;
  const normUser = normalizeSentenceForCheck(userInput);
  const strippedUser = stripDiacritics(normUser);
  const userWithoutPronoun = stripDiacritics(stripSpanishPronoun(normUser));

  // Build target candidate list
  const candidates = [
    sentence.expectedAnswer || (sentence.direction === 'ru_to_es' ? sentence.spanish : sentence.russian),
    sentence.russian,
    sentence.spanish,
    ...(Array.isArray(sentence.acceptedAnswers) ? sentence.acceptedAnswers : [])
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normTarget = normalizeSentenceForCheck(candidate);
    const strippedTarget = stripDiacritics(normTarget);
    const targetWithoutPronoun = stripDiacritics(stripSpanishPronoun(normTarget));

    // Exact normalized match
    if (normUser === normTarget) return true;
    // Diacritic-tolerant match
    if (strippedUser === strippedTarget) return true;
    // Omitted subject pronoun in Spanish (e.g. "dibujo una casa" == "yo dibujo una casa")
    if (userWithoutPronoun && targetWithoutPronoun && userWithoutPronoun === targetWithoutPronoun) return true;
  }

  return false;
}

// Generate interactive word chips for a sentence
export function generateWordTilesForSentence(sentence, direction) {
  const targetText = direction === 'ru_to_es' ? sentence.spanish : sentence.russian;
  // Clean tokens from targetText
  const cleanTokens = targetText
    .replace(/[¿?¡!.,;:«»"()]/g, '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const distractors = Array.isArray(sentence.distractors) ? sentence.distractors : [];
  const allTokens = [...cleanTokens, ...distractors];

  // Shuffle deterministically based on tokens length + chars, or random
  return allTokens
    .map((word, idx) => ({ id: `${idx}_${word}`, text: word }))
    .sort(() => 0.5 - Math.random());
}
