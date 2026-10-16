// Dataset generator and validator for Maya's 200 regular verb practice sentences
import fs from 'fs';
import path from 'path';

const ES_TO_RU = [
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
        "spanish": "Yo dibujo una casa linda con el lápiz negro.",
        "russian": "Я рисую красивый дом чёрным карандашом.",
        "acceptedAnswers": [
          "Я рисую красивый дом чёрным карандашом",
          "Я рисую красивый дом черным карандашом",
          "Я рисую милый дом чёрным карандашом",
          "Я рисую милый дом черным карандашом",
          "Я рисую красивый домик чёрным карандашом"
        ],
        "hint": "dibujar = рисовать • yo dibujo = я рисую • la casa = дом • el lápiz = карандаш • negro = чёрный",
        "distractors": [
          "vos",
          "perro",
          "azul"
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
        "hint": "dibujar = рисовать • vos dibujás = ты рисуешь • el gato = кот • chiquito = маленький • el cuaderno = тетрадь",
        "distractors": [
          "yo",
          "mesa",
          "grande"
        ]
      },
      {
        "id": "es_ru_1_03",
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
        "hint": "pintar = раскрашивать • yo pinto = я раскрашиваю • el sol = солнце • amarillo = жёлтый",
        "distractors": [
          "vos",
          "rojo",
          "noche"
        ]
      },
      {
        "id": "es_ru_1_04",
        "verb": "pintar",
        "verbForm": "pintás",
        "verbPerson": "vos",
        "spanish": "Vos pintás una manzana roja en el libro.",
        "russian": "Ты раскрашиваешь красное яблоко в книге.",
        "acceptedAnswers": [
          "Ты раскрашиваешь красное яблоко в книге",
          "Ты красишь красное яблоко в книге",
          "Ты рисуешь красное яблоко в книге"
        ],
        "hint": "pintar = раскрашивать • vos pintás = ты раскрашиваешь • la manzana = яблоко • el libro = книга • rojo = красный",
        "distractors": [
          "yo",
          "pan",
          "verde"
        ]
      },
      {
        "id": "es_ru_1_05",
        "verb": "comer",
        "verbForm": "como",
        "verbPerson": "yo",
        "spanish": "Yo como pan con queso en la mesa.",
        "russian": "Я ем хлеб с сыром за столом.",
        "acceptedAnswers": [
          "Я ем хлеб с сыром за столом",
          "Я кушаю хлеб с сыром за столом",
          "Я ем хлеб с сыром на столе"
        ],
        "hint": "comer = есть/кушать • yo como = я ем • el pan = хлеб • el queso = сыр • la mesa = стол",
        "distractors": [
          "vos",
          "leche",
          "silla"
        ]
      },
      {
        "id": "es_ru_1_06",
        "verb": "comer",
        "verbForm": "comés",
        "verbPerson": "vos",
        "spanish": "Vos comés galletitas ricas con leche.",
        "russian": "Ты ешь вкусное печенье с молоком.",
        "acceptedAnswers": [
          "Ты ешь вкусное печенье с молоком",
          "Ты кушаешь вкусное печенье с молоком",
          "Ты ешь вкусные печеньки с молоком"
        ],
        "hint": "comer = есть • vos comés = ты ешь • las galletitas = печенье • la leche = молоко • rico = вкусный",
        "distractors": [
          "yo",
          "agua",
          "manzana"
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
        "hint": "correr = бегать • yo corro = я бегаю • rápido = быстро • la plaza = площадка/парк • grande = большой",
        "distractors": [
          "vos",
          "despacio",
          "auto"
        ]
      },
      {
        "id": "es_ru_1_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "spanish": "Vos corrés despacio con el perro negro.",
        "russian": "Ты медленно бегаешь с чёрной собакой.",
        "acceptedAnswers": [
          "Ты медленно бегаешь с чёрной собакой",
          "Ты медленно бегаешь с черной собакой",
          "Ты медленно бежишь с чёрной собакой",
          "Ты медленно бежишь с черной собакой"
        ],
        "hint": "correr = бегать • vos corrés = ты бегаешь • despacio = медленно • el perro = собака • negro = чёрный",
        "distractors": [
          "yo",
          "gato",
          "blanco"
        ]
      },
      {
        "id": "es_ru_1_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "spanish": "Yo escucho a la seño en el recreo.",
        "russian": "Я слушаю учительницу на перемене.",
        "acceptedAnswers": [
          "Я слушаю учительницу на перемене",
          "Я слушаю учительницу во время перемены"
        ],
        "hint": "escuchar = слушать • yo escucho = я слушаю • la seño = учительница • el recreo = перемена",
        "distractors": [
          "vos",
          "mamá",
          "amigo"
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
          "Ты слушаешь дождь в окно"
        ],
        "hint": "escuchar = слушать • vos escuchás = ты слушаешь • la lluvia = дождь • la ventana = окно",
        "distractors": [
          "yo",
          "sol",
          "puerta"
        ]
      },
      {
        "id": "es_ru_1_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "spanish": "Yo miro los colores lindos en el cuaderno.",
        "russian": "Я смотрю на красивые цвета в тетради.",
        "acceptedAnswers": [
          "Я смотрю на красивые цвета в тетради",
          "Я смотрю на милые цвета в тетради"
        ],
        "hint": "mirar = смотреть • yo miro = я смотрю • los colores = цвета • lindo = красивый • el cuaderno = тетрадь",
        "distractors": [
          "vos",
          "libro",
          "lápiz"
        ]
      },
      {
        "id": "es_ru_1_12",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "spanish": "Vos mirás el auto azul de papá.",
        "russian": "Ты смотришь на синюю машину папы.",
        "acceptedAnswers": [
          "Ты смотришь на синюю машину папы",
          "Ты смотришь на синий автомобиль папы"
        ],
        "hint": "mirar = смотреть • vos mirás = ты смотришь • el auto = машина • azul = синий • el papá = папа",
        "distractors": [
          "yo",
          "rojo",
          "mamá"
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
          "Я покупаю вкусное мороженое с шоколадом"
        ],
        "hint": "comprar = покупать • yo compro = я покупаю • el helado = мороженое • el chocolate = шоколад • rico = вкусный",
        "distractors": [
          "vos",
          "alfajor",
          "leche"
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
          "Ты покупаешь печенье в киоске"
        ],
        "hint": "comprar = покупать • vos comprás = ты покупаешь • el alfajor = альфахор • el quiosco = киоск",
        "distractors": [
          "yo",
          "pizza",
          "pan"
        ]
      },
      {
        "id": "es_ru_1_15",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "spanish": "Yo salto muy feliz en la plaza.",
        "russian": "Я очень радостно прыгаю на площадке.",
        "acceptedAnswers": [
          "Я очень радостно прыгаю на площадке",
          "Я очень счастливо прыгаю на площадке",
          "Я очень радостно прыгаю в парке"
        ],
        "hint": "saltar = прыгать • yo salto = я прыгаю • muy = очень • feliz = счастливый/радостный • la plaza = площадка",
        "distractors": [
          "vos",
          "cansada",
          "casa"
        ]
      },
      {
        "id": "es_ru_1_16",
        "verb": "saltar",
        "verbForm": "saltás",
        "verbPerson": "vos",
        "spanish": "Vos saltás en el tobogán verde.",
        "russian": "Ты прыгаешь на зелёной горке.",
        "acceptedAnswers": [
          "Ты прыгаешь на зелёной горке",
          "Ты прыгаешь на зеленой горке"
        ],
        "hint": "saltar = прыгать • vos saltás = ты прыгаешь • el tobogán = горка • verde = зелёный",
        "distractors": [
          "yo",
          "hamaca",
          "azul"
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
          "Я жду очередь на качелях"
        ],
        "hint": "esperar = ждать • yo espero = я жду • el turno = очередь • la hamaca = качели",
        "distractors": [
          "vos",
          "tobogán",
          "pelota"
        ]
      },
      {
        "id": "es_ru_1_18",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "spanish": "Vos esperás en la puerta de la casa.",
        "russian": "Ты ждёшь у двери дома.",
        "acceptedAnswers": [
          "Ты ждёшь у двери дома",
          "Ты ждешь у двери дома",
          "Ты ждёшь возле двери дома",
          "Ты ждешь возле двери дома"
        ],
        "hint": "esperar = ждать • vos esperás = ты ждёшь • la puerta = дверь • la casa = дом",
        "distractors": [
          "yo",
          "ventana",
          "mesa"
        ]
      },
      {
        "id": "es_ru_1_19",
        "verb": "ayudar",
        "verbForm": "ayudo",
        "verbPerson": "yo",
        "spanish": "Yo ayudo a mamá con la merienda.",
        "russian": "Я помогаю маме с полдником.",
        "acceptedAnswers": [
          "Я помогаю маме с полдником",
          "Я помогаю маме готовить полдник"
        ],
        "hint": "ayudar = помогать • yo ayudo = я помогаю • la mamá = мама • la merienda = полдник",
        "distractors": [
          "vos",
          "papá",
          "abuelo"
        ]
      },
      {
        "id": "es_ru_1_20",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "spanish": "Vos ayudás al hermano chiquito con la mochila.",
        "russian": "Ты помогаешь маленькому брату с рюкзаком.",
        "acceptedAnswers": [
          "Ты помогаешь маленькому брату с рюкзаком",
          "Ты помогаешь младшему брату с рюкзаком"
        ],
        "hint": "ayudar = помогать • vos ayudás = ты помогаешь • el hermano = брат • chiquito = маленький • la mochila = рюкзак",
        "distractors": [
          "yo",
          "hermana",
          "cuaderno"
        ]
      }
    ]
  },
  {
    "id": 2,
    "title": "Упр. 2: Он, она и семья (él, ella)",
    "shortTitle": "2. Он и она",
    "description": "Переводим формы третьего лица (dibuja, come, corre)",
    "icon": "👨‍👩‍👧",
    "sentences": [
      {
        "id": "es_ru_2_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "él",
        "spanish": "El hermano dibuja un perro blanco en la mesa.",
        "russian": "Брат рисует белую собаку за столом.",
        "acceptedAnswers": [
          "Брат рисует белую собаку за столом",
          "Брат рисует белого пса за столом",
          "Брат рисует белую собачку за столом"
        ],
        "hint": "dibujar = рисовать • él dibuja = он рисует • el hermano = брат • el perro = собака • blanco = белый",
        "distractors": [
          "hermana",
          "gato",
          "negro"
        ]
      },
      {
        "id": "es_ru_2_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "spanish": "Maya dibuja una pelota linda en el cuaderno.",
        "russian": "Майя рисует красивый мяч в тетради.",
        "acceptedAnswers": [
          "Майя рисует красивый мяч в тетради",
          "Майя рисует милый мячик в тетради",
          "Майя рисует красивый мячик в тетради"
        ],
        "hint": "dibujar = рисовать • Maya dibuja = Майя рисует • la pelota = мяч • lindo = красивый • el cuaderno = тетрадь",
        "distractors": [
          "mamá",
          "casa",
          "rojo"
        ]
      },
      {
        "id": "es_ru_2_03",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "él",
        "spanish": "El papá pinta la silla de color verde.",
        "russian": "Папа красит стул в зелёный цвет.",
        "acceptedAnswers": [
          "Папа красит стул в зелёный цвет",
          "Папа красит стул в зеленый цвет",
          "Папа раскрашивает стул в зелёный цвет"
        ],
        "hint": "pintar = красить • el papá pinta = папа красит • la silla = стул • verde = зелёный",
        "distractors": [
          "abuelo",
          "mesa",
          "azul"
        ]
      },
      {
        "id": "es_ru_2_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "spanish": "La hermana pinta una casa grande en el libro.",
        "russian": "Сестра раскрашивает большой дом в книге.",
        "acceptedAnswers": [
          "Сестра раскрашивает большой дом в книге",
          "Сестра рисует большой дом в книге",
          "Сестра красит большой дом в книге"
        ],
        "hint": "pintar = раскрашивать • la hermana pinta = сестра раскрашивает • la casa = дом • grande = большой",
        "distractors": [
          "amiga",
          "cuaderno",
          "chiquito"
        ]
      },
      {
        "id": "es_ru_2_05",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "él",
        "spanish": "El abuelo come medialunas ricas con leche.",
        "russian": "Дедушка ест вкусные медиалуны с молоком.",
        "acceptedAnswers": [
          "Дедушка ест вкусные медиалуны с молоком",
          "Дедушка кушает вкусные медиалуны с молоком",
          "Дедушка ест вкусные круассаны с молоком"
        ],
        "hint": "comer = есть • el abuelo come = дедушка ест • la medialuna = круассан • rico = вкусный • la leche = молоко",
        "distractors": [
          "papá",
          "pan",
          "agua"
        ]
      },
      {
        "id": "es_ru_2_06",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "ella",
        "spanish": "La mamá come una manzana roja en la mesa.",
        "russian": "Мама ест красное яблоко за столом.",
        "acceptedAnswers": [
          "Мама ест красное яблоко за столом",
          "Мама кушает красное яблоко за столом"
        ],
        "hint": "comer = есть • la mamá come = мама ест • la manzana = яблоко • rojo = красный • la mesa = стол",
        "distractors": [
          "abuela",
          "banana",
          "silla"
        ]
      },
      {
        "id": "es_ru_2_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "spanish": "El perro corre rápido con la pelota.",
        "russian": "Собака быстро бегает с мячом.",
        "acceptedAnswers": [
          "Собака быстро бегает с мячом",
          "Собака быстро бежит с мячом",
          "Пёс быстро бегает с мячом",
          "Пес быстро бежит с мячом"
        ],
        "hint": "correr = бегать • el perro corre = собака бегает • rápido = быстро • la pelota = мяч",
        "distractors": [
          "gato",
          "despacio",
          "auto"
        ]
      },
      {
        "id": "es_ru_2_08",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "ella",
        "spanish": "La amiga corre feliz a la puerta.",
        "russian": "Подруга радостно бежит к двери.",
        "acceptedAnswers": [
          "Подруга радостно бежит к двери",
          "Подруга счастливо бежит к двери",
          "Подружка радостно бежит к двери"
        ],
        "hint": "correr = бежать • la amiga corre = подруга бежит • feliz = радостный • la puerta = дверь",
        "distractors": [
          "amigo",
          "ventana",
          "cansada"
        ]
      },
      {
        "id": "es_ru_2_09",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "él",
        "spanish": "Él escucha a la seño con el hermano.",
        "russian": "Он слушает учительницу вместе с братом.",
        "acceptedAnswers": [
          "Он слушает учительницу вместе с братом",
          "Он слушает учительницу с братом"
        ],
        "hint": "escuchar = слушать • él escucha = он слушает • la seño = учительница • el hermano = брат",
        "distractors": [
          "ella",
          "papá",
          "amigo"
        ]
      },
      {
        "id": "es_ru_2_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "spanish": "La abuela escucha la lluvia en la noche.",
        "russian": "Бабушка слушает дождь ночью.",
        "acceptedAnswers": [
          "Бабушка слушает дождь ночью",
          "Бабушка слушает дождь в ночи"
        ],
        "hint": "escuchar = слушать • la abuela escucha = бабушка слушает • la lluvia = дождь • la noche = ночь",
        "distractors": [
          "mamá",
          "sol",
          "día"
        ]
      },
      {
        "id": "es_ru_2_11",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "él",
        "spanish": "El gato mira por la ventana grande.",
        "russian": "Кот смотрит в большое окно.",
        "acceptedAnswers": [
          "Кот смотрит в большое окно",
          "Кошка смотрит в большое окно",
          "Кот смотрит из большого окна"
        ],
        "hint": "mirar = смотреть • el gato mira = кот смотрит • la ventana = окно • grande = большой",
        "distractors": [
          "perro",
          "puerta",
          "chiquito"
        ]
      },
      {
        "id": "es_ru_2_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "spanish": "Ella mira los libros lindos en la mesa.",
        "russian": "Она смотрит на красивые книги на столе.",
        "acceptedAnswers": [
          "Она смотрит на красивые книги на столе",
          "Она смотрит на милые книги на столе"
        ],
        "hint": "mirar = смотреть • ella mira = она смотрит • los libros = книги • lindo = красивый • la mesa = стол",
        "distractors": [
          "él",
          "cuadernos",
          "silla"
        ]
      },
      {
        "id": "es_ru_2_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "él",
        "spanish": "El papá compra jugo y pan en el quiosco.",
        "russian": "Папа покупает сок и хлеб в киоске.",
        "acceptedAnswers": [
          "Папа покупает сок и хлеб в киоске",
          "Папа покупает хлеб и сок в киоске"
        ],
        "hint": "comprar = покупать • el papá compra = папа покупает • el jugo = сок • el pan = хлеб • el quiosco = киоск",
        "distractors": [
          "abuelo",
          "leche",
          "queso"
        ]
      },
      {
        "id": "es_ru_2_14",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "spanish": "La mamá compra galletitas ricas para la merienda.",
        "russian": "Мама покупает вкусное печенье на полдник.",
        "acceptedAnswers": [
          "Мама покупает вкусное печенье на полдник",
          "Мама покупает вкусное печенье для полдника",
          "Мама покупает вкусные печеньки на полдник"
        ],
        "hint": "comprar = покупать • la mamá compra = мама покупает • las galletitas = печенье • la merienda = полдник",
        "distractors": [
          "hermana",
          "helado",
          "recreo"
        ]
      },
      {
        "id": "es_ru_2_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "spanish": "El amigo salta en el tobogán con la pelota.",
        "russian": "Друг прыгает на горке с мячом.",
        "acceptedAnswers": [
          "Друг прыгает на горке с мячом",
          "Друг прыгает на горке вместе с мячом"
        ],
        "hint": "saltar = прыгать • el amigo salta = друг прыгает • el tobogán = горка • la pelota = мяч",
        "distractors": [
          "hermano",
          "hamaca",
          "auto"
        ]
      },
      {
        "id": "es_ru_2_16",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "ella",
        "spanish": "La hermana salta feliz en la plaza.",
        "russian": "Сестра радостно прыгает на площадке.",
        "acceptedAnswers": [
          "Сестра радостно прыгает на площадке",
          "Сестра счастливо прыгает на площадке",
          "Сестра радостно прыгает в парке"
        ],
        "hint": "saltar = прыгать • la hermana salta = сестра прыгает • feliz = счастливый/радостный • la plaza = площадка",
        "distractors": [
          "mamá",
          "cansada",
          "casa"
        ]
      },
      {
        "id": "es_ru_2_17",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "él",
        "spanish": "El abuelo espera el auto blanco de papá.",
        "russian": "Дедушка ждёт белую машину папы.",
        "acceptedAnswers": [
          "Дедушка ждёт белую машину папы",
          "Дедушка ждет белую машину папы",
          "Дедушка ждёт белый автомобиль папы"
        ],
        "hint": "esperar = ждать • el abuelo espera = дедушка ждёт • el auto = машина • blanco = белый • el papá = папа",
        "distractors": [
          "hermano",
          "azul",
          "mamá"
        ]
      },
      {
        "id": "es_ru_2_18",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "ella",
        "spanish": "La seño espera en la puerta en el recreo.",
        "russian": "Учительница ждёт у двери на перемене.",
        "acceptedAnswers": [
          "Учительница ждёт у двери на перемене",
          "Учительница ждет у двери на перемене"
        ],
        "hint": "esperar = ждать • la seño espera = учительница ждёт • la puerta = дверь • el recreo = перемена",
        "distractors": [
          "abuela",
          "ventana",
          "merienda"
        ]
      },
      {
        "id": "es_ru_2_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "spanish": "El hermano ayuda a papá con el auto.",
        "russian": "Брат помогает папе с машиной.",
        "acceptedAnswers": [
          "Брат помогает папе с машиной",
          "Брат помогает папе с автомобилем"
        ],
        "hint": "ayudar = помогать • el hermano ayuda = брат помогает • el papá = папа • el auto = машина",
        "distractors": [
          "amigo",
          "abuelo",
          "mesa"
        ]
      },
      {
        "id": "es_ru_2_20",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "ella",
        "spanish": "Maya ayuda a la abuela en la mesa.",
        "russian": "Майя помогает бабушке за столом.",
        "acceptedAnswers": [
          "Майя помогает бабушке за столом",
          "Майя помогает бабушке на столе"
        ],
        "hint": "ayudar = помогать • Maya ayuda = Майя помогает • la abuela = бабушка • la mesa = стол",
        "distractors": [
          "hermana",
          "mamá",
          "cama"
        ]
      }
    ]
  },
  {
    "id": 3,
    "title": "Упр. 3: Мы вместе (nosotros / nosotras)",
    "shortTitle": "3. Мы вместе",
    "description": "Отрабатываем формы первого лица множественного числа (-amos, -emos)",
    "icon": "🤝",
    "sentences": [
      {
        "id": "es_ru_3_01",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros dibujamos una casa grande con lápices de colores.",
        "russian": "Мы рисуем большой дом цветными карандашами.",
        "acceptedAnswers": [
          "Мы рисуем большой дом цветными карандашами",
          "Мы рисуем большой дом карандашами разных цветов"
        ],
        "hint": "dibujar = рисовать • dibujamos = мы рисуем • la casa = дом • grande = большой • los lápices = карандаши",
        "distractors": [
          "ellas",
          "chiquito",
          "goma"
        ]
      },
      {
        "id": "es_ru_3_02",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras dibujamos un gato lindo en el cuaderno.",
        "russian": "Мы (девочки) рисуем красивого кота в тетради.",
        "acceptedAnswers": [
          "Мы (девочки) рисуем красивого кота в тетради",
          "Мы рисуем красивого кота в тетради",
          "Мы рисуем милого кота в тетради",
          "Мы (девочки) рисуем милого котика в тетради"
        ],
        "hint": "dibujar = рисовать • nosotras dibujamos = мы (девочки) рисуем • el gato = кот • el cuaderno = тетрадь",
        "distractors": [
          "ellos",
          "perro",
          "libro"
        ]
      },
      {
        "id": "es_ru_3_03",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros pintamos la mesa de color azul.",
        "russian": "Мы красим стол в синий цвет.",
        "acceptedAnswers": [
          "Мы красим стол в синий цвет",
          "Мы раскрашиваем стол в синий цвет"
        ],
        "hint": "pintar = красить • pintamos = мы красим • la mesa = стол • azul = синий",
        "distractors": [
          "ustedes",
          "silla",
          "verde"
        ]
      },
      {
        "id": "es_ru_3_04",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras pintamos las puertas de color blanco.",
        "russian": "Мы (девочки) красим двери в белый цвет.",
        "acceptedAnswers": [
          "Мы (девочки) красим двери в белый цвет",
          "Мы красим двери в белый цвет",
          "Мы раскрашиваем двери в белый цвет"
        ],
        "hint": "pintar = красить • nosotras pintamos = мы (девочки) красим • las puertas = двери • blanco = белый",
        "distractors": [
          "ellos",
          "ventanas",
          "negro"
        ]
      },
      {
        "id": "es_ru_3_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros comemos pizza rica con queso.",
        "russian": "Мы едим вкусную пиццу с сыром.",
        "acceptedAnswers": [
          "Мы едим вкусную пиццу с сыром",
          "Мы кушаем вкусную пиццу с сыром"
        ],
        "hint": "comer = есть • comemos = мы едим • la pizza = пицца • el queso = сыр • rico = вкусный",
        "distractors": [
          "ustedes",
          "pan",
          "leche"
        ]
      },
      {
        "id": "es_ru_3_06",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras comemos helado de chocolate en la plaza.",
        "russian": "Мы (девочки) едим шоколадное мороженое на площадке.",
        "acceptedAnswers": [
          "Мы (девочки) едим шоколадное мороженое на площадке",
          "Мы едим шоколадное мороженое на площадке",
          "Мы (девочки) кушаем шоколадное мороженое на площадке",
          "Мы кушаем шоколадное мороженое на площадке"
        ],
        "hint": "comer = кушать • nosotras comemos = мы (девочки) едим • el helado = мороженое • el chocolate = шоколад",
        "distractors": [
          "ellos",
          "alfajor",
          "casa"
        ]
      },
      {
        "id": "es_ru_3_07",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros corremos rápido en el recreo.",
        "russian": "Мы быстро бегаем на перемене.",
        "acceptedAnswers": [
          "Мы быстро бегаем на перемене",
          "Мы быстро бежим на перемене"
        ],
        "hint": "correr = бегать • corremos = мы бегаем • rápido = быстро • el recreo = перемена",
        "distractors": [
          "ellas",
          "despacio",
          "recreo"
        ]
      },
      {
        "id": "es_ru_3_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras corremos con la pelota verde.",
        "russian": "Мы (девочки) бегаем с зелёным мячом.",
        "acceptedAnswers": [
          "Мы (девочки) бегаем с зелёным мячом",
          "Мы (девочки) бегаем с зеленым мячом",
          "Мы бегаем с зелёным мячом",
          "Мы бегаем с зеленым мячом"
        ],
        "hint": "correr = бегать • nosotras corremos = мы (девочки) бегаем • la pelota = мяч • verde = зелёный",
        "distractors": [
          "ellos",
          "rojo",
          "mochila"
        ]
      },
      {
        "id": "es_ru_3_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros escuchamos a la seño en el recreo.",
        "russian": "Мы слушаем учительницу на перемене.",
        "acceptedAnswers": [
          "Мы слушаем учительницу на перемене"
        ],
        "hint": "escuchar = слушать • escuchamos = мы слушаем • la seño = учительница • el recreo = перемена",
        "distractors": [
          "ustedes",
          "mamá",
          "auto"
        ]
      },
      {
        "id": "es_ru_3_10",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras escuchamos la lluvia en la casa.",
        "russian": "Мы (девочки) слушаем дождь в доме.",
        "acceptedAnswers": [
          "Мы (девочки) слушаем дождь в доме",
          "Мы слушаем дождь в доме",
          "Мы (девочки) слушаем дождь дома",
          "Мы слушаем дождь дома"
        ],
        "hint": "escuchar = слушать • nosotras escuchamos = мы (девочки) слушаем • la lluvia = дождь • la casa = дом",
        "distractors": [
          "ellos",
          "sol",
          "plaza"
        ]
      },
      {
        "id": "es_ru_3_11",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros miramos el sol grande por la ventana.",
        "russian": "Мы смотрим на большое солнце из окна.",
        "acceptedAnswers": [
          "Мы смотрим на большое солнце из окна",
          "Мы смотрим на большое солнце в окно"
        ],
        "hint": "mirar = смотреть • miramos = мы смотрим • el sol = солнце • grande = большой • la ventana = окно",
        "distractors": [
          "ellas",
          "chiquito",
          "puerta"
        ]
      },
      {
        "id": "es_ru_3_12",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras miramos los colores lindos del libro.",
        "russian": "Мы (девочки) смотрим на красивые цвета книги.",
        "acceptedAnswers": [
          "Мы (девочки) смотрим на красивые цвета книги",
          "Мы смотрим на красивые цвета книги",
          "Мы смотрим на красивые цвета в книге"
        ],
        "hint": "mirar = смотреть • nosotras miramos = мы (девочки) смотрим • los colores = цвета • el libro = книга",
        "distractors": [
          "ellos",
          "cuaderno",
          "lápiz"
        ]
      },
      {
        "id": "es_ru_3_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros compramos pan y queso con la plata.",
        "russian": "Мы покупаем хлеб и сыр на деньги.",
        "acceptedAnswers": [
          "Мы покупаем хлеб и сыр на деньги",
          "Мы покупаем хлеб и сыр на наши деньги"
        ],
        "hint": "comprar = покупать • compramos = мы покупаем • el pan = хлеб • el queso = сыр • la plata = деньги",
        "distractors": [
          "ustedes",
          "leche",
          "galletitas"
        ]
      },
      {
        "id": "es_ru_3_14",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras compramos alfajores ricos en el quiosco.",
        "russian": "Мы (девочки) покупаем вкусные альфахоры в киоске.",
        "acceptedAnswers": [
          "Мы (девочки) покупаем вкусные альфахоры в киоске",
          "Мы покупаем вкусные альфахоры в киоске",
          "Мы (девочки) покупаем вкусное печенье в киоске"
        ],
        "hint": "comprar = покупать • nosotras compramos = мы (девочки) покупаем • los alfajores = альфахоры • el quiosco = киоск",
        "distractors": [
          "ellos",
          "helado",
          "pizza"
        ]
      },
      {
        "id": "es_ru_3_15",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros saltamos felices en el tobogán.",
        "russian": "Мы счастливо прыгаем на горке.",
        "acceptedAnswers": [
          "Мы счастливо прыгаем на горке",
          "Мы радостно прыгаем на горке"
        ],
        "hint": "saltar = прыгать • saltamos = мы прыгаем • feliz = счастливый • el tobogán = горка",
        "distractors": [
          "ellas",
          "cansados",
          "hamaca"
        ]
      },
      {
        "id": "es_ru_3_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras saltamos con la amiga en la plaza.",
        "russian": "Мы (девочки) прыгаем с подругой на площадке.",
        "acceptedAnswers": [
          "Мы (девочки) прыгаем с подругой на площадке",
          "Мы прыгаем с подругой на площадке",
          "Мы (девочки) прыгаем с подругой в парке"
        ],
        "hint": "saltar = прыгать • nosotras saltamos = мы (девочки) прыгаем • la amiga = подруга • la plaza = площадка",
        "distractors": [
          "ellos",
          "amigo",
          "casa"
        ]
      },
      {
        "id": "es_ru_3_17",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros esperamos el turno en la hamaca.",
        "russian": "Мы ждём очередь на качелях.",
        "acceptedAnswers": [
          "Мы ждём очередь на качелях",
          "Мы ждем очередь на качелях",
          "Мы ждём свою очередь на качелях"
        ],
        "hint": "esperar = ждать • esperamos = мы ждём • el turno = очередь • la hamaca = качели",
        "distractors": [
          "ustedes",
          "tobogán",
          "pelota"
        ]
      },
      {
        "id": "es_ru_3_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras esperamos a mamá en la puerta.",
        "russian": "Мы (девочки) ждём маму у двери.",
        "acceptedAnswers": [
          "Мы (девочки) ждём маму у двери",
          "Мы (девочки) ждем маму у двери",
          "Мы ждём маму у двери",
          "Мы ждем маму у двери"
        ],
        "hint": "esperar = ждать • nosotras esperamos = мы (девочки) ждём • la mamá = мама • la puerta = дверь",
        "distractors": [
          "ellos",
          "papá",
          "ventana"
        ]
      },
      {
        "id": "es_ru_3_19",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros ayudamos al abuelo con las sillas.",
        "russian": "Мы помогаем дедушке со стульями.",
        "acceptedAnswers": [
          "Мы помогаем дедушке со стульями"
        ],
        "hint": "ayudar = помогать • ayudamos = мы помогаем • el abuelo = дедушка • las sillas = стулья",
        "distractors": [
          "ellas",
          "abuela",
          "mesas"
        ]
      },
      {
        "id": "es_ru_3_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras ayudamos a la hermana con la merienda.",
        "russian": "Мы (девочки) помогаем сестре с полдником.",
        "acceptedAnswers": [
          "Мы (девочки) помогаем сестре с полдником",
          "Мы помогаем сестре с полдником"
        ],
        "hint": "ayudar = помогать • nosotras ayudamos = мы (девочки) помогаем • la hermana = сестра • la merienda = полдник",
        "distractors": [
          "ellos",
          "hermano",
          "recreo"
        ]
      }
    ]
  },
  {
    "id": 4,
    "title": "Упр. 4: Они и вы все (ellos, ellas, ustedes)",
    "shortTitle": "4. Они и вы",
    "description": "Отрабатываем формы множественного числа (-an, -en)",
    "icon": "👥",
    "sentences": [
      {
        "id": "es_ru_4_01",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ellos",
        "spanish": "Ellos dibujan autos grandes en el cuaderno.",
        "russian": "Они рисуют большие машины в тетради.",
        "acceptedAnswers": [
          "Они рисуют большие машины в тетради",
          "Они рисуют большие автомобили в тетради"
        ],
        "hint": "dibujar = рисовать • ellos dibujan = они рисуют • los autos = машины • grande = большой • el cuaderno = тетрадь",
        "distractors": [
          "nosotros",
          "chiquito",
          "libro"
        ]
      },
      {
        "id": "es_ru_4_02",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes dibujan una casa linda con lápiz negro.",
        "russian": "Вы рисуете красивый дом чёрным карандашом.",
        "acceptedAnswers": [
          "Вы рисуете красивый дом чёрным карандашом",
          "Вы рисуете красивый дом черным карандашом",
          "Вы рисуете милый дом чёрным карандашом"
        ],
        "hint": "dibujar = рисовать • ustedes dibujan = вы рисуете • la casa = дом • el lápiz = карандаш • negro = чёрный",
        "distractors": [
          "ellas",
          "azul",
          "mesa"
        ]
      },
      {
        "id": "es_ru_4_03",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellas",
        "spanish": "Ellas pintan las mesas de color amarillo.",
        "russian": "Они (девочки) красят столы в жёлтый цвет.",
        "acceptedAnswers": [
          "Они (девочки) красят столы в жёлтый цвет",
          "Они (девочки) красят столы в желтый цвет",
          "Они красят столы в жёлтый цвет",
          "Они красят столы в желтый цвет"
        ],
        "hint": "pintar = красить • ellas pintan = они (девочки) красят • las mesas = столы • amarillo = жёлтый",
        "distractors": [
          "ellos",
          "sillas",
          "rojo"
        ]
      },
      {
        "id": "es_ru_4_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes pintan libros con lápices de colores.",
        "russian": "Вы раскрашиваете книги цветными карандашами.",
        "acceptedAnswers": [
          "Вы раскрашиваете книги цветными карандашами",
          "Вы красите книги цветными карандашами"
        ],
        "hint": "pintar = раскрашивать • ustedes pintan = вы раскрашиваете • los libros = книги • los lápices = карандаши",
        "distractors": [
          "nosotros",
          "cuadernos",
          "gomas"
        ]
      },
      {
        "id": "es_ru_4_05",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "spanish": "Ellos comen pan rico con queso.",
        "russian": "Они едят вкусный хлеб с сыром.",
        "acceptedAnswers": [
          "Они едят вкусный хлеб с сыром",
          "Они кушают вкусный хлеб с сыром"
        ],
        "hint": "comer = есть • ellos comen = они едят • el pan = хлеб • el queso = сыр • rico = вкусный",
        "distractors": [
          "ellas",
          "leche",
          "manzana"
        ]
      },
      {
        "id": "es_ru_4_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "spanish": "Ustedes comen galletitas ricas con chocolate.",
        "russian": "Вы едите вкусное печенье с шоколадом.",
        "acceptedAnswers": [
          "Вы едите вкусное печенье с шоколадом",
          "Вы кушаете вкусное печенье с шоколадом",
          "Вы едите вкусные печеньки с шоколадом"
        ],
        "hint": "comer = есть • ustedes comen = вы едите • las galletitas = печенье • el chocolate = шоколад",
        "distractors": [
          "nosotros",
          "alfajor",
          "leche"
        ]
      },
      {
        "id": "es_ru_4_07",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ellas",
        "spanish": "Ellas corren rápido en la plaza grande.",
        "russian": "Они (девочки) быстро бегают на большой площадке.",
        "acceptedAnswers": [
          "Они (девочки) быстро бегают на большой площадке",
          "Они быстро бегают на большой площадке",
          "Они (девочки) быстро бегут на большой площадке"
        ],
        "hint": "correr = бегать • ellas corren = они (девочки) бегают • rápido = быстро • la plaza = площадка",
        "distractors": [
          "ellos",
          "despacio",
          "auto"
        ]
      },
      {
        "id": "es_ru_4_08",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ustedes",
        "spanish": "Ustedes corren con el perro en el recreo.",
        "russian": "Вы бегаете с собакой на перемене.",
        "acceptedAnswers": [
          "Вы бегаете с собакой на перемене",
          "Вы бежите с собакой на перемене"
        ],
        "hint": "correr = бегать • ustedes corren = вы бегаете • el perro = собака • el recreo = перемена",
        "distractors": [
          "nosotros",
          "gato",
          "casa"
        ]
      },
      {
        "id": "es_ru_4_09",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "spanish": "Ellos escuchan a la seño en la mesa.",
        "russian": "Они слушают учительницу за столом.",
        "acceptedAnswers": [
          "Они слушают учительницу за столом"
        ],
        "hint": "escuchar = слушать • ellos escuchan = они слушают • la seño = учительница • la mesa = стол",
        "distractors": [
          "ellas",
          "mamá",
          "silla"
        ]
      },
      {
        "id": "es_ru_4_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes escuchan la lluvia en la noche.",
        "russian": "Вы слушаете дождь ночью.",
        "acceptedAnswers": [
          "Вы слушаете дождь ночью"
        ],
        "hint": "escuchar = слушать • ustedes escuchan = вы слушаете • la lluvia = дождь • la noche = ночь",
        "distractors": [
          "nosotros",
          "sol",
          "día"
        ]
      },
      {
        "id": "es_ru_4_11",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ellas",
        "spanish": "Ellas miran el sol amarillo en el día.",
        "russian": "Они (девочки) смотрят на жёлтое солнце днём.",
        "acceptedAnswers": [
          "Они (девочки) смотрят на жёлтое солнце днём",
          "Они (девочки) смотрят на желтое солнце днем",
          "Они смотрят на жёлтое солнце днём",
          "Они смотрят на желтое солнце днем"
        ],
        "hint": "mirar = смотреть • ellas miran = они (девочки) смотрят • el sol = солнце • amarillo = жёлтый • el día = день",
        "distractors": [
          "ellos",
          "lluvia",
          "noche"
        ]
      },
      {
        "id": "es_ru_4_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes miran los gatos chiquitos por la ventana.",
        "russian": "Вы смотрите на маленьких котят в окно.",
        "acceptedAnswers": [
          "Вы смотрите на маленьких котят в окно",
          "Вы смотрите на маленьких кошек в окно",
          "Вы смотрите на маленьких котиков из окна"
        ],
        "hint": "mirar = смотреть • ustedes miran = вы смотрите • los gatos = коты • chiquito = маленький • la ventana = окно",
        "distractors": [
          "nosotros",
          "perros",
          "puerta"
        ]
      },
      {
        "id": "es_ru_4_13",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ellos",
        "spanish": "Ellos compran helados de chocolate con su plata.",
        "russian": "Они покупают шоколадное мороженое на свои деньги.",
        "acceptedAnswers": [
          "Они покупают шоколадное мороженое на свои деньги",
          "Они покупают мороженое с шоколадом на свои деньги"
        ],
        "hint": "comprar = покупать • ellos compran = они покупают • el helado = мороженое • el chocolate = шоколад • la plata = деньги",
        "distractors": [
          "ellas",
          "alfajor",
          "jugo"
        ]
      },
      {
        "id": "es_ru_4_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes compran ricas medialunas en el quiosco.",
        "russian": "Вы покупаете вкусные медиалуны в киоске.",
        "acceptedAnswers": [
          "Вы покупаете вкусные медиалуны в киоске",
          "Вы покупаете вкусные круассаны в киоске"
        ],
        "hint": "comprar = покупать • ustedes compran = вы покупаете • las medialunas = медиалуны • el quiosco = киоск",
        "distractors": [
          "nosotros",
          "pizza",
          "pan"
        ]
      },
      {
        "id": "es_ru_4_15",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ellas",
        "spanish": "Ellas saltan felices en las hamacas.",
        "russian": "Они (девочки) радостно прыгают на качелях.",
        "acceptedAnswers": [
          "Они (девочки) радостно прыгают на качелях",
          "Они радостно прыгают на качелях",
          "Они (девочки) счастливо прыгают на качелях"
        ],
        "hint": "saltar = прыгать • ellas saltan = они (девочки) прыгают • feliz = счастливый • las hamacas = качели",
        "distractors": [
          "ellos",
          "tobogán",
          "cansadas"
        ]
      },
      {
        "id": "es_ru_4_16",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes saltan en el tobogán grande.",
        "russian": "Вы прыгаете на большой горке.",
        "acceptedAnswers": [
          "Вы прыгаете на большой горке"
        ],
        "hint": "saltar = прыгать • ustedes saltan = вы прыгаете • el tobogán = горка • grande = большой",
        "distractors": [
          "nosotros",
          "chiquito",
          "hamaca"
        ]
      },
      {
        "id": "es_ru_4_17",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "spanish": "Ellos esperan su turno para jugar.",
        "russian": "Они ждут своей очереди играть.",
        "acceptedAnswers": [
          "Они ждут своей очереди играть",
          "Они ждут свою очередь играть"
        ],
        "hint": "esperar = ждать • ellos esperan = они ждут • el turno = очередь • jugar = играть",
        "distractors": [
          "ellas",
          "comer",
          "correr"
        ]
      },
      {
        "id": "es_ru_4_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes esperan a los abuelos en la puerta.",
        "russian": "Вы ждёте дедушку и бабушку у двери.",
        "acceptedAnswers": [
          "Вы ждёте дедушку и бабушку у двери",
          "Вы ждете дедушку и бабушку у двери",
          "Вы ждёте бабушку и дедушку у двери"
        ],
        "hint": "esperar = ждать • ustedes esperan = вы ждёте • los abuelos = бабушка и дедушка • la puerta = дверь",
        "distractors": [
          "nosotros",
          "amigos",
          "ventana"
        ]
      },
      {
        "id": "es_ru_4_19",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ellas",
        "spanish": "Ellas ayudan a la mamá en la mesa.",
        "russian": "Они (девочки) помогают маме за столом.",
        "acceptedAnswers": [
          "Они (девочки) помогают маме за столом",
          "Они помогают маме за столом"
        ],
        "hint": "ayudar = помогать • ellas ayudan = они (девочки) помогают • la mamá = мама • la mesa = стол",
        "distractors": [
          "ellos",
          "papá",
          "silla"
        ]
      },
      {
        "id": "es_ru_4_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes ayudan a los amigos con las mochilas.",
        "russian": "Вы помогаете друзьям с рюкзаками.",
        "acceptedAnswers": [
          "Вы помогаете друзьям с рюкзаками",
          "Вы помогаете друзьям нести рюкзаки"
        ],
        "hint": "ayudar = помогать • ustedes ayudan = вы помогаете • los amigos = друзья • las mochilas = рюкзаки",
        "distractors": [
          "nosotros",
          "libros",
          "cuadernos"
        ]
      }
    ]
  },
  {
    "id": 5,
    "title": "Упр. 5: Большой микс всех форм",
    "shortTitle": "5. Супер-микс",
    "description": "Закрепляем все лица правильных глаголов в одном наборе",
    "icon": "🚀",
    "sentences": [
      {
        "id": "es_ru_5_01",
        "verb": "dibujar",
        "verbForm": "dibujo / dibujás",
        "verbPerson": "yo / vos",
        "spanish": "Yo dibujo una casa y vos dibujás un sol.",
        "russian": "Я рисую дом, а ты рисуешь солнце.",
        "acceptedAnswers": [
          "Я рисую дом, а ты рисуешь солнце",
          "Я рисую дом и ты рисуешь солнце"
        ],
        "hint": "dibujar = рисовать • yo dibujo = я рисую • vos dibujás = ты рисуешь • la casa = дом • el sol = солнце",
        "distractors": [
          "él",
          "noche",
          "perro"
        ]
      },
      {
        "id": "es_ru_5_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "spanish": "La abuela dibuja una pelota chiquita en el cuaderno.",
        "russian": "Бабушка рисует маленький мяч в тетради.",
        "acceptedAnswers": [
          "Бабушка рисует маленький мяч в тетради",
          "Бабушка рисует маленький мячик в тетради"
        ],
        "hint": "dibujar = рисовать • la abuela dibuja = бабушка рисует • la pelota = мяч • chiquito = маленький • el cuaderno = тетрадь",
        "distractors": [
          "abuelo",
          "grande",
          "libro"
        ]
      },
      {
        "id": "es_ru_5_03",
        "verb": "pintar",
        "verbForm": "pintamos / pintan",
        "verbPerson": "nosotros / ustedes",
        "spanish": "Nosotros pintamos las sillas y ustedes pintan las mesas.",
        "russian": "Мы красим стулья, а вы красите столы.",
        "acceptedAnswers": [
          "Мы красим стулья, а вы красите столы",
          "Мы красим стулья и вы красите столы"
        ],
        "hint": "pintar = красить • nosotros pintamos = мы красим • ustedes pintan = вы красите • las sillas = стулья • las mesas = столы",
        "distractors": [
          "ellos",
          "puertas",
          "ventanas"
        ]
      },
      {
        "id": "es_ru_5_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "spanish": "Maya pinta una manzana verde y una manzana roja.",
        "russian": "Майя раскрашивает зелёное яблоко и красное яблоко.",
        "acceptedAnswers": [
          "Майя раскрашивает зелёное яблоко и красное яблоко",
          "Майя раскрашивает зеленое яблоко и красное яблоко",
          "Майя рисует зелёное яблоко и красное яблоко"
        ],
        "hint": "pintar = раскрашивать • Maya pinta = Майя раскрашивает • la manzana = яблоко • verde = зелёный • rojo = красный",
        "distractors": [
          "banana",
          "azul",
          "amarillo"
        ]
      },
      {
        "id": "es_ru_5_05",
        "verb": "comer",
        "verbForm": "comés / como",
        "verbPerson": "vos / yo",
        "spanish": "Vos comés pizza rica y yo como pan con queso.",
        "russian": "Ты ешь вкусную пиццу, а я ем хлеб с сыром.",
        "acceptedAnswers": [
          "Ты ешь вкусную пиццу, а я ем хлеб с сыром",
          "Ты кушаешь вкусную пиццу, а я ем хлеб с сыром"
        ],
        "hint": "comer = есть • vos comés = ты ешь • yo como = я ем • la pizza = пицца • el pan = хлеб • el queso = сыр",
        "distractors": [
          "él",
          "leche",
          "manzana"
        ]
      },
      {
        "id": "es_ru_5_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "spanish": "Los amigos comen alfajores ricos en el recreo.",
        "russian": "Друзья едят вкусные альфахоры на перемене.",
        "acceptedAnswers": [
          "Друзья едят вкусные альфахоры на перемене",
          "Друзья кушают вкусные альфахоры на перемене"
        ],
        "hint": "comer = есть • comen = едят • los amigos = друзья • el alfajor = альфахор • el recreo = перемена",
        "distractors": [
          "helado",
          "quiosco",
          "merienda"
        ]
      },
      {
        "id": "es_ru_5_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "spanish": "El perro corre rápido a la puerta azul.",
        "russian": "Собака быстро бежит к синей двери.",
        "acceptedAnswers": [
          "Собака быстро бежит к синей двери",
          "Собака быстро бегает к синей двери",
          "Пёс быстро бежит к синей двери"
        ],
        "hint": "correr = бежать • el perro corre = собака бежит • rápido = быстро • la puerta = дверь • azul = синий",
        "distractors": [
          "gato",
          "despacio",
          "ventana"
        ]
      },
      {
        "id": "es_ru_5_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "spanish": "Nosotras corremos felices en el recreo grande.",
        "russian": "Мы (девочки) радостно бегаем на большой перемене.",
        "acceptedAnswers": [
          "Мы (девочки) радостно бегаем на большой перемене",
          "Мы радостно бегаем на большой перемене",
          "Мы (девочки) счастливо бегаем на большой перемене"
        ],
        "hint": "correr = бегать • nosotras corremos = мы (девочки) бегаем • feliz = радостный • el recreo = перемена • grande = большой",
        "distractors": [
          "ellos",
          "cansadas",
          "chiquito"
        ]
      },
      {
        "id": "es_ru_5_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "spanish": "Yo escucho a mamá y a papá en la casa.",
        "russian": "Я слушаю маму и папу в доме.",
        "acceptedAnswers": [
          "Я слушаю маму и папу в доме",
          "Я слушаю маму и папу дома"
        ],
        "hint": "escuchar = слушать • yo escucho = я слушаю • mamá = мама • papá = папа • la casa = дом",
        "distractors": [
          "abuelo",
          "seño",
          "auto"
        ]
      },
      {
        "id": "es_ru_5_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "spanish": "Ellos escuchan a la seño en la mesa blanca.",
        "russian": "Они слушают учительницу за белым столом.",
        "acceptedAnswers": [
          "Они слушают учительницу за белым столом"
        ],
        "hint": "escuchar = слушать • ellos escuchan = они слушают • la seño = учительница • la mesa = стол • blanco = белый",
        "distractors": [
          "ellas",
          "silla",
          "negro"
        ]
      },
      {
        "id": "es_ru_5_11",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "spanish": "Vos mirás por la ventana del auto grande.",
        "russian": "Ты смотришь из окна большой машины.",
        "acceptedAnswers": [
          "Ты смотришь из окна большой машины",
          "Ты смотришь в окно большой машины"
        ],
        "hint": "mirar = смотреть • vos mirás = ты смотришь • la ventana = окно • el auto = машина • grande = большой",
        "distractors": [
          "puerta",
          "chiquito",
          "azul"
        ]
      },
      {
        "id": "es_ru_5_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "spanish": "La mamá mira al gato chiquito en la cama.",
        "russian": "Мама смотрит на маленького кота на кровати.",
        "acceptedAnswers": [
          "Мама смотрит на маленького кота на кровати",
          "Мама смотрит на маленькую кошку на кровати"
        ],
        "hint": "mirar = смотреть • la mamá mira = мама смотрит • el gato = кот • chiquito = маленький • la cama = кровать",
        "distractors": [
          "papá",
          "perro",
          "mesa"
        ]
      },
      {
        "id": "es_ru_5_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros compramos helado rico en un día de calor.",
        "russian": "Мы покупаем вкусное мороженое в жаркий день.",
        "acceptedAnswers": [
          "Мы покупаем вкусное мороженое в жаркий день",
          "Мы покупаем вкусное мороженое в день жары"
        ],
        "hint": "comprar = покупать • compramos = мы покупаем • el helado = мороженое • el día = день • el calor = жара",
        "distractors": [
          "frío",
          "alfajor",
          "noche"
        ]
      },
      {
        "id": "es_ru_5_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "spanish": "Ustedes compran cuadernos y lápices de colores.",
        "russian": "Вы покупаете тетради и цветные карандаши.",
        "acceptedAnswers": [
          "Вы покупаете тетради и цветные карандаши",
          "Вы покупаете тетради и карандаши разных цветов"
        ],
        "hint": "comprar = покупать • ustedes compran = вы покупаете • los cuadernos = тетради • los lápices = карандаши",
        "distractors": [
          "libros",
          "gomas",
          "tijeras"
        ]
      },
      {
        "id": "es_ru_5_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "spanish": "El hermano salta rápido en la plaza verde.",
        "russian": "Брат быстро прыгает на зелёной площадке.",
        "acceptedAnswers": [
          "Брат быстро прыгает на зелёной площадке",
          "Брат быстро прыгает на зеленой площадке",
          "Брат быстро прыгает в зелёном парке"
        ],
        "hint": "saltar = прыгать • el hermano salta = брат прыгает • rápido = быстро • la plaza = площадка • verde = зелёный",
        "distractors": [
          "hermana",
          "despacio",
          "azul"
        ]
      },
      {
        "id": "es_ru_5_16",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "spanish": "Yo salto feliz con mi amiga en la hamaca.",
        "russian": "Я радостно прыгаю со своей подругой на качелях.",
        "acceptedAnswers": [
          "Я радостно прыгаю со своей подругой на качелях",
          "Я радостно прыгаю с подругой на качелях",
          "Я счастливо прыгаю со своей подругой на качелях"
        ],
        "hint": "saltar = прыгать • yo salto = я прыгаю • feliz = радостный • la amiga = подруга • la hamaca = качели",
        "distractors": [
          "amigo",
          "tobogán",
          "cansada"
        ]
      },
      {
        "id": "es_ru_5_17",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "spanish": "Vos esperás a la seño en la puerta blanca.",
        "russian": "Ты ждёшь учительницу у белой двери.",
        "acceptedAnswers": [
          "Ты ждёшь учительницу у белой двери",
          "Ты ждешь учительницу у белой двери"
        ],
        "hint": "esperar = ждать • vos esperás = ты ждёшь • la seño = учительница • la puerta = дверь • blanco = белый",
        "distractors": [
          "mamá",
          "ventana",
          "negro"
        ]
      },
      {
        "id": "es_ru_5_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "spanish": "Nosotros esperamos el turno en el tobogán grande.",
        "russian": "Мы ждём очередь на большой горке.",
        "acceptedAnswers": [
          "Мы ждём очередь на большой горке",
          "Мы ждем очередь на большой горке",
          "Мы ждём свою очередь на большой горке"
        ],
        "hint": "esperar = ждать • esperamos = мы ждём • el turno = очередь • el tobogán = горка • grande = большой",
        "distractors": [
          "hamaca",
          "chiquito",
          "plaza"
        ]
      },
      {
        "id": "es_ru_5_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "spanish": "El hermano ayuda a la hermana con los libros.",
        "russian": "Брат помогает сестре с книгами.",
        "acceptedAnswers": [
          "Брат помогает сестре с книгами"
        ],
        "hint": "ayudar = помогать • ayuda = помогает • el hermano = брат • la hermana = сестра • los libros = книги",
        "distractors": [
          "papá",
          "cuadernos",
          "mochila"
        ]
      },
      {
        "id": "es_ru_5_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "spanish": "Ustedes ayudan a papá en el auto azul.",
        "russian": "Вы помогаете папе в синей машине.",
        "acceptedAnswers": [
          "Вы помогаете папе в синей машине",
          "Вы помогаете папе с синей машиной"
        ],
        "hint": "ayudar = помогать • ustedes ayudan = вы помогаете • el papá = папа • el auto = машина • azul = синий",
        "distractors": [
          "mamá",
          "blanco",
          "casa"
        ]
      }
    ]
  }
];

const RU_TO_ES = [
  {
    "id": 1,
    "title": "Упр. 1: Мои и твои действия (yo и vos)",
    "shortTitle": "1. Я и ты",
    "description": "Пишем перевод на испанский для форм yo и vos (хвостики -o, -ás, -és)",
    "icon": "✍️",
    "sentences": [
      {
        "id": "ru_es_1_01",
        "verb": "dibujar",
        "verbForm": "dibujo",
        "verbPerson": "yo",
        "russian": "Я рисую синий мяч в тетради.",
        "spanish": "Yo dibujo una pelota azul en el cuaderno.",
        "acceptedAnswers": [
          "Yo dibujo una pelota azul en el cuaderno",
          "Dibujo una pelota azul en el cuaderno"
        ],
        "hint": "рисовать = dibujar • я рисую = yo dibujo • мяч = la pelota • тетрадь = el cuaderno • синий = azul",
        "distractors": [
          "vos",
          "dibujás",
          "verde"
        ]
      },
      {
        "id": "ru_es_1_02",
        "verb": "dibujar",
        "verbForm": "dibujás",
        "verbPerson": "vos",
        "russian": "Ты рисуешь белого кота в книге.",
        "spanish": "Vos dibujás un gato blanco en el libro.",
        "acceptedAnswers": [
          "Vos dibujás un gato blanco en el libro",
          "Dibujás un gato blanco en el libro",
          "Vos dibujas un gato blanco en el libro",
          "Dibujas un gato blanco en el libro",
          "Tú dibujas un gato blanco en el libro",
          "Vos dibujás una gata blanca en el libro",
          "Dibujás una gata blanca en el libro"
        ],
        "hint": "рисовать = dibujar • ты рисуешь = vos dibujás • кот = el gato • книга = el libro • белый = blanco",
        "distractors": [
          "yo",
          "dibujo",
          "negro"
        ]
      },
      {
        "id": "ru_es_1_03",
        "verb": "pintar",
        "verbForm": "pinto",
        "verbPerson": "yo",
        "russian": "Я раскрашиваю большую дверь в жёлтый цвет.",
        "spanish": "Yo pinto la puerta grande de color amarillo.",
        "acceptedAnswers": [
          "Yo pinto la puerta grande de color amarillo",
          "Pinto la puerta grande de color amarillo"
        ],
        "hint": "раскрашивать = pintar • я раскрашиваю = yo pinto • дверь = la puerta • большой = grande • жёлтый = amarillo",
        "distractors": [
          "vos",
          "pintás",
          "azul"
        ]
      },
      {
        "id": "ru_es_1_04",
        "verb": "pintar",
        "verbForm": "pintás",
        "verbPerson": "vos",
        "russian": "Ты раскрашиваешь стол красным карандашом.",
        "spanish": "Vos pintás la mesa con el lápiz rojo.",
        "acceptedAnswers": [
          "Vos pintás la mesa con el lápiz rojo",
          "Pintás la mesa con el lápiz rojo",
          "Vos pintas la mesa con el lápiz rojo",
          "Pintas la mesa con el lápiz rojo",
          "Tú pintas la mesa con el lápiz rojo",
          "Vos pintás la mesa con el lapiz rojo",
          "Vos pintas la mesa con el lapiz rojo"
        ],
        "hint": "раскрашивать = pintar • ты красишь = vos pintás • стол = la mesa • карандаш = el lápiz • красный = rojo",
        "distractors": [
          "yo",
          "pinto",
          "verde"
        ]
      },
      {
        "id": "ru_es_1_05",
        "verb": "comer",
        "verbForm": "como",
        "verbPerson": "yo",
        "russian": "Я ем вкусное яблоко за столом.",
        "spanish": "Yo como una manzana rica en la mesa.",
        "acceptedAnswers": [
          "Yo como una manzana rica en la mesa",
          "Como una manzana rica en la mesa"
        ],
        "hint": "есть = comer • я ем = yo como • яблоко = la manzana • вкусный = rico • стол = la mesa",
        "distractors": [
          "vos",
          "comés",
          "pan"
        ]
      },
      {
        "id": "ru_es_1_06",
        "verb": "comer",
        "verbForm": "comés",
        "verbPerson": "vos",
        "russian": "Ты кушаешь вкусную медиалуну с молоком.",
        "spanish": "Vos comés una medialuna rica con leche.",
        "acceptedAnswers": [
          "Vos comés una medialuna rica con leche",
          "Comés una medialuna rica con leche",
          "Vos comes una medialuna rica con leche",
          "Comes una medialuna rica con leche",
          "Tú comes una medialuna rica con leche"
        ],
        "hint": "кушать = comer • ты ешь = vos comés • медиалуна = la medialuna • вкусный = rico • молоко = la leche",
        "distractors": [
          "yo",
          "como",
          "agua"
        ]
      },
      {
        "id": "ru_es_1_07",
        "verb": "correr",
        "verbForm": "corro",
        "verbPerson": "yo",
        "russian": "Я быстро бегу к большой двери.",
        "spanish": "Yo corro rápido a la puerta grande.",
        "acceptedAnswers": [
          "Yo corro rápido a la puerta grande",
          "Corro rápido a la puerta grande",
          "Yo corro rapido a la puerta grande",
          "Corro rapido a la puerta grande"
        ],
        "hint": "бегать = correr • я бегу = yo corro • быстро = rápido • дверь = la puerta • большой = grande",
        "distractors": [
          "vos",
          "corrés",
          "despacio"
        ]
      },
      {
        "id": "ru_es_1_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "russian": "Ты медленно бегаешь на перемене.",
        "spanish": "Vos corrés despacio en el recreo.",
        "acceptedAnswers": [
          "Vos corrés despacio en el recreo",
          "Corrés despacio en el recreo",
          "Vos corres despacio en el recreo",
          "Corres despacio en el recreo",
          "Tú corres despacio en el recreo"
        ],
        "hint": "бегать = correr • ты бегаешь = vos corrés • медленно = despacio • перемена = el recreo",
        "distractors": [
          "yo",
          "corro",
          "rápido"
        ]
      },
      {
        "id": "ru_es_1_09",
        "verb": "escuchar",
        "verbForm": "escucho",
        "verbPerson": "yo",
        "russian": "Я слушаю добрую бабушку в доме.",
        "spanish": "Yo escucho a la abuela linda en la casa.",
        "acceptedAnswers": [
          "Yo escucho a la abuela linda en la casa",
          "Escucho a la abuela linda en la casa"
        ],
        "hint": "слушать = escuchar • я слушаю = yo escucho • бабушка = la abuela • добрый/милый = lindo • дом = la casa",
        "distractors": [
          "vos",
          "escuchás",
          "mamá"
        ]
      },
      {
        "id": "ru_es_1_10",
        "verb": "escuchar",
        "verbForm": "escuchás",
        "verbPerson": "vos",
        "spanish": "Vos escuchás a papá en el auto.",
        "russian": "Ты слушаешь папу в машине.",
        "acceptedAnswers": [
          "Vos escuchás a papá en el auto",
          "Escuchás a papá en el auto",
          "Vos escuchas a papá en el auto",
          "Escuchas a papá en el auto",
          "Tú escuchas a papá en el auto",
          "Vos escuchás a papa en el auto",
          "Tú escuchas a papa en el auto"
        ],
        "hint": "слушать = escuchar • ты слушаешь = vos escuchás • папа = el papá • машина = el auto",
        "distractors": [
          "yo",
          "escucho",
          "casa"
        ]
      },
      {
        "id": "ru_es_1_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "russian": "Я смотрю на жёлтое солнце в окно.",
        "spanish": "Yo miro el sol amarillo por la ventana.",
        "acceptedAnswers": [
          "Yo miro el sol amarillo por la ventana",
          "Miro el sol amarillo por la ventana",
          "Yo miro el sol amarillo en la ventana",
          "Miro el sol amarillo en la ventana"
        ],
        "hint": "смотреть = mirar • я смотрю = yo miro • солнце = el sol • жёлтый = amarillo • окно = la ventana",
        "distractors": [
          "vos",
          "mirás",
          "puerta"
        ]
      },
      {
        "id": "ru_es_1_12",
        "verb": "mirar",
        "verbForm": "mirás",
        "verbPerson": "vos",
        "spanish": "Vos mirás al perro lindo en la plaza.",
        "russian": "Ты смотришь на красивую собаку на площадке.",
        "acceptedAnswers": [
          "Vos mirás al perro lindo en la plaza",
          "Mirás al perro lindo en la plaza",
          "Vos miras al perro lindo en la plaza",
          "Miras al perro lindo en la plaza",
          "Tú miras al perro lindo en la plaza",
          "Vos mirás a la perra linda en la plaza",
          "Tú miras a la perra linda en la plaza"
        ],
        "hint": "смотреть = mirar • ты смотришь = vos mirás • собака = el perro • красивый = lindo • площадка = la plaza",
        "distractors": [
          "yo",
          "miro",
          "gato"
        ]
      },
      {
        "id": "ru_es_1_13",
        "verb": "comprar",
        "verbForm": "compro",
        "verbPerson": "yo",
        "russian": "Я покупаю вкусный банан в киоске.",
        "spanish": "Yo compro una banana rica en el quiosco.",
        "acceptedAnswers": [
          "Yo compro una banana rica en el quiosco",
          "Compro una banana rica en el quiosco"
        ],
        "hint": "покупать = comprar • я покупаю = yo compro • банан = la banana • вкусный = rico • киоск = el quiosco",
        "distractors": [
          "vos",
          "comprás",
          "pan"
        ]
      },
      {
        "id": "ru_es_1_14",
        "verb": "comprar",
        "verbForm": "comprás",
        "verbPerson": "vos",
        "spanish": "Vos comprás chocolate y galletitas ricas.",
        "russian": "Ты покупаешь шоколад и вкусное печенье.",
        "acceptedAnswers": [
          "Vos comprás chocolate y galletitas ricas",
          "Comprás chocolate y galletitas ricas",
          "Vos compras chocolate y galletitas ricas",
          "Compras chocolate y galletitas ricas",
          "Tú compras chocolate y galletitas ricas"
        ],
        "hint": "покупать = comprar • ты покупаешь = vos comprás • шоколад = el chocolate • печенье = las galletitas",
        "distractors": [
          "yo",
          "compro",
          "helado"
        ]
      },
      {
        "id": "ru_es_1_15",
        "verb": "saltar",
        "verbForm": "salto",
        "verbPerson": "yo",
        "russian": "Я радостно прыгаю на зелёной горке.",
        "spanish": "Yo salto feliz en el tobogán verde.",
        "acceptedAnswers": [
          "Yo salto feliz en el tobogán verde",
          "Salto feliz en el tobogán verde",
          "Yo salto feliz en el tobogan verde",
          "Salto feliz en el tobogan verde"
        ],
        "hint": "прыгать = saltar • я прыгаю = yo salto • радостный = feliz • горка = el tobogán • зелёный = verde",
        "distractors": [
          "vos",
          "saltás",
          "azul"
        ]
      },
      {
        "id": "ru_es_1_16",
        "verb": "saltar",
        "verbForm": "saltás",
        "verbPerson": "vos",
        "spanish": "Vos saltás rápido en la hamaca.",
        "russian": "Ты быстро прыгаешь на качелях.",
        "acceptedAnswers": [
          "Vos saltás rápido en la hamaca",
          "Saltás rápido en la hamaca",
          "Vos saltas rapido en la hamaca",
          "Saltas rapido en la hamaca",
          "Tú saltas rápido en la hamaca"
        ],
        "hint": "прыгать = saltar • ты прыгаешь = vos saltás • быстро = rápido • качели = la hamaca",
        "distractors": [
          "yo",
          "salto",
          "despacio"
        ]
      },
      {
        "id": "ru_es_1_17",
        "verb": "esperar",
        "verbForm": "espero",
        "verbPerson": "yo",
        "russian": "Я жду маму возле двери дома.",
        "spanish": "Yo espero a mamá en la puerta de la casa.",
        "acceptedAnswers": [
          "Yo espero a mamá en la puerta de la casa",
          "Espero a mamá en la puerta de la casa",
          "Yo espero a mama en la puerta de la casa",
          "Espero a mama en la puerta de la casa"
        ],
        "hint": "ждать = esperar • я жду = yo espero • мама = la mamá • дверь = la puerta • дом = la casa",
        "distractors": [
          "vos",
          "esperás",
          "papá"
        ]
      },
      {
        "id": "ru_es_1_18",
        "verb": "esperar",
        "verbForm": "esperás",
        "verbPerson": "vos",
        "spanish": "Vos esperás tu turno en la hamaca.",
        "russian": "Ты ждёшь свою очередь на качелях.",
        "acceptedAnswers": [
          "Vos esperás tu turno en la hamaca",
          "Esperás tu turno en la hamaca",
          "Vos esperas tu turno en la hamaca",
          "Esperas tu turno en la hamaca",
          "Tú esperas tu turno en la hamaca"
        ],
        "hint": "ждать = esperar • ты ждёшь = vos esperás • очередь = el turno • качели = la hamaca",
        "distractors": [
          "yo",
          "espero",
          "tobogán"
        ]
      },
      {
        "id": "ru_es_1_19",
        "verb": "ayudar",
        "verbForm": "ayudo",
        "verbPerson": "yo",
        "russian": "Я помогаю дедушке за столом.",
        "spanish": "Yo ayudo al abuelo en la mesa.",
        "acceptedAnswers": [
          "Yo ayudo al abuelo en la mesa",
          "Ayudo al abuelo en la mesa"
        ],
        "hint": "помогать = ayudar • я помогаю = yo ayudo • дедушка = el abuelo • стол = la mesa",
        "distractors": [
          "vos",
          "ayudás",
          "abuela"
        ]
      },
      {
        "id": "ru_es_1_20",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "spanish": "Vos ayudás a la hermana con los libros.",
        "russian": "Ты помогаешь сестре с книгами.",
        "acceptedAnswers": [
          "Vos ayudás a la hermana con los libros",
          "Ayudás a la hermana con los libros",
          "Vos ayudas a la hermana con los libros",
          "Ayudas a la hermana con los libros",
          "Tú ayudas a la hermana con los libros"
        ],
        "hint": "помогать = ayudar • ты помогаешь = vos ayudás • сестра = la hermana • книги = los libros",
        "distractors": [
          "yo",
          "ayudo",
          "hermano"
        ]
      }
    ]
  },
  {
    "id": 2,
    "title": "Упр. 2: Семья, друзья и питомцы (él, ella)",
    "shortTitle": "2. Он и она",
    "description": "Пишем формы третьего лица для él, ella, Maya, семьи и питомцев (хвостики -a, -e)",
    "icon": "👨‍👩‍👧",
    "sentences": [
      {
        "id": "ru_es_2_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "él",
        "russian": "Папа рисует большой дом в тетради.",
        "spanish": "El papá dibuja una casa grande en el cuaderno.",
        "acceptedAnswers": [
          "El papá dibuja una casa grande en el cuaderno",
          "El papa dibuja una casa grande en el cuaderno",
          "Papá dibuja una casa grande en el cuaderno"
        ],
        "hint": "рисовать = dibujar • папа рисует = el papá dibuja • дом = la casa • большой = grande • тетрадь = el cuaderno",
        "distractors": [
          "dibuja",
          "gato",
          "mesa"
        ]
      },
      {
        "id": "ru_es_2_02",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "russian": "Сестра рисует маленькую кошку зелёным карандашом.",
        "spanish": "La hermana dibuja una gata chiquita con lápiz verde.",
        "acceptedAnswers": [
          "La hermana dibuja una gata chiquita con lápiz verde",
          "La hermana dibuja una gata chiquita con lapiz verde",
          "La hermana dibuja un gato chiquito con lápiz verde",
          "La hermana dibuja un gato chiquito con lapiz verde"
        ],
        "hint": "рисовать = dibujar • сестра рисует = la hermana dibuja • кошка = la gata / el gato • маленький = chiquito • зелёный = verde • карандаш = el lápiz",
        "distractors": [
          "dibuja",
          "perro",
          "azul"
        ]
      },
      {
        "id": "ru_es_2_03",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "él",
        "russian": "Дедушка красит синий стул в доме.",
        "spanish": "El abuelo pinta la silla azul en la casa.",
        "acceptedAnswers": [
          "El abuelo pinta la silla azul en la casa",
          "Abuelo pinta la silla azul en la casa"
        ],
        "hint": "красить = pintar • дедушка красит = el abuelo pinta • стул = la silla • синий = azul • дом = la casa",
        "distractors": [
          "pinta",
          "mesa",
          "verde"
        ]
      },
      {
        "id": "ru_es_2_04",
        "verb": "pintar",
        "verbForm": "pinta",
        "verbPerson": "ella",
        "russian": "Мама раскрашивает жёлтое яблоко в книге.",
        "spanish": "La mamá pinta una manzana amarilla en el libro.",
        "acceptedAnswers": [
          "La mamá pinta una manzana amarilla en el libro",
          "La mama pinta una manzana amarilla en el libro",
          "Mamá pinta una manzana amarilla en el libro"
        ],
        "hint": "раскрашивать = pintar • мама раскрашивает = la mamá pinta • яблоко = la manzana • жёлтый = amarillo • книга = el libro",
        "distractors": [
          "pinta",
          "rojo",
          "cuaderno"
        ]
      },
      {
        "id": "ru_es_2_05",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "él",
        "russian": "Брат ест вкусную пиццу с сыром.",
        "spanish": "El hermano come pizza rica con queso.",
        "acceptedAnswers": [
          "El hermano come pizza rica con queso",
          "Hermano come pizza rica con queso"
        ],
        "hint": "есть = comer • брат ест = el hermano come • пицца = la pizza • вкусный = rico • сыр = el queso",
        "distractors": [
          "come",
          "pan",
          "leche"
        ]
      },
      {
        "id": "ru_es_2_06",
        "verb": "comer",
        "verbForm": "come",
        "verbPerson": "ella",
        "russian": "Бабушка кушает вкусную медиалуну с молоком.",
        "spanish": "La abuela come una medialuna rica con leche.",
        "acceptedAnswers": [
          "La abuela come una medialuna rica con leche",
          "Abuela come una medialuna rica con leche"
        ],
        "hint": "кушать = comer • бабушка ест = la abuela come • круассан = la medialuna • молоко = la leche",
        "distractors": [
          "come",
          "galletitas",
          "agua"
        ]
      },
      {
        "id": "ru_es_2_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "russian": "Пёс быстро бежит за зелёным мячом.",
        "spanish": "El perro corre rápido con la pelota verde.",
        "acceptedAnswers": [
          "El perro corre rápido con la pelota verde",
          "El perro corre rapido con la pelota verde",
          "Perro corre rápido con la pelota verde"
        ],
        "hint": "бежать = correr • пёс бежит = el perro corre • быстро = rápido • мяч = la pelota • зелёный = verde",
        "distractors": [
          "corre",
          "despacio",
          "auto"
        ]
      },
      {
        "id": "ru_es_2_08",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "ella",
        "russian": "Подруга радостно бежит на площадку.",
        "spanish": "La amiga corre feliz a la plaza.",
        "acceptedAnswers": [
          "La amiga corre feliz a la plaza",
          "Amiga corre feliz a la plaza"
        ],
        "hint": "бежать = correr • подруга бежит = la amiga corre • радостно = feliz • площадка = la plaza",
        "distractors": [
          "corre",
          "casa",
          "cansada"
        ]
      },
      {
        "id": "ru_es_2_09",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "él",
        "russian": "Друг слушает учительницу на перемене.",
        "spanish": "El amigo escucha a la seño en el recreo.",
        "acceptedAnswers": [
          "El amigo escucha a la seño en el recreo",
          "El amigo escucha a la seno en el recreo",
          "Amigo escucha a la seño en el recreo"
        ],
        "hint": "слушать = escuchar • друг слушает = el amigo escucha • учительница = la seño • перемена = el recreo",
        "distractors": [
          "escucha",
          "mamá",
          "auto"
        ]
      },
      {
        "id": "ru_es_2_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "russian": "Мама слушает дождь в машине.",
        "spanish": "La mamá escucha la lluvia en el auto.",
        "acceptedAnswers": [
          "La mamá escucha la lluvia en el auto",
          "La mama escucha la lluvia en el auto",
          "Mamá escucha la lluvia en el auto"
        ],
        "hint": "слушать = escuchar • мама слушает = la mamá escucha • дождь = la lluvia • машина = el auto",
        "distractors": [
          "escucha",
          "sol",
          "casa"
        ]
      },
      {
        "id": "ru_es_2_11",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "él",
        "russian": "Кот смотрит на маленькую собаку из окна.",
        "spanish": "El gato mira al perro chiquito por la ventana.",
        "acceptedAnswers": [
          "El gato mira al perro chiquito por la ventana",
          "El gato mira a la perra chiquita por la ventana"
        ],
        "hint": "смотреть = mirar • кот смотрит = el gato mira • собака = el perro • маленький = chiquito • окно = la ventana",
        "distractors": [
          "mira",
          "puerta",
          "mesa"
        ]
      },
      {
        "id": "ru_es_2_12",
        "verb": "mirar",
        "verbForm": "mira",
        "verbPerson": "ella",
        "russian": "Майя смотрит на цветные карандаши в рюкзаке.",
        "spanish": "Maya mira los lápices de colores en la mochila.",
        "acceptedAnswers": [
          "Maya mira los lápices de colores en la mochila",
          "Maya mira los lapices de colores en la mochila"
        ],
        "hint": "смотреть = mirar • Майя смотрит = Maya mira • карандаши = los lápices • цвета = los colores • рюкзак = la mochila",
        "distractors": [
          "mira",
          "cuaderno",
          "goma"
        ]
      },
      {
        "id": "ru_es_2_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "él",
        "russian": "Дедушка покупает вкусный хлеб в киоске.",
        "spanish": "El abuelo compra pan rico en el quiosco.",
        "acceptedAnswers": [
          "El abuelo compra pan rico en el quiosco",
          "Abuelo compra pan rico en el quiosco"
        ],
        "hint": "покупать = comprar • дедушка покупает = el abuelo compra • хлеб = el pan • вкусный = rico • киоск = el quiosco",
        "distractors": [
          "compra",
          "alfajor",
          "leche"
        ]
      },
      {
        "id": "ru_es_2_14",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "russian": "Сестра покупает шоколадное мороженое на свои деньги.",
        "spanish": "La hermana compra helado de chocolate con su plata.",
        "acceptedAnswers": [
          "La hermana compra helado de chocolate con su plata"
        ],
        "hint": "покупать = comprar • сестра покупает = la hermana compra • мороженое = el helado • шоколад = el chocolate • деньги = la plata",
        "distractors": [
          "compra",
          "pizza",
          "jugo"
        ]
      },
      {
        "id": "ru_es_2_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "russian": "Брат радостно прыгает на большой горке.",
        "spanish": "El hermano salta feliz en el tobogán grande.",
        "acceptedAnswers": [
          "El hermano salta feliz en el tobogán grande",
          "El hermano salta feliz en el tobogan grande"
        ],
        "hint": "прыгать = saltar • брат прыгает = el hermano salta • радостно = feliz • горка = el tobogán • большой = grande",
        "distractors": [
          "salta",
          "hamaca",
          "chiquito"
        ]
      },
      {
        "id": "ru_es_2_16",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "ella",
        "russian": "Подруга прыгает на качелях на площадке.",
        "spanish": "La amiga salta en la hamaca en la plaza.",
        "acceptedAnswers": [
          "La amiga salta en la hamaca en la plaza"
        ],
        "hint": "прыгать = saltar • подруга прыгает = la amiga salta • качели = la hamaca • площадка = la plaza",
        "distractors": [
          "salta",
          "tobogán",
          "casa"
        ]
      },
      {
        "id": "ru_es_2_17",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "él",
        "russian": "Папа ждёт у синей двери дома.",
        "spanish": "El papá espera en la puerta azul de la casa.",
        "acceptedAnswers": [
          "El papá espera en la puerta azul de la casa",
          "El papa espera en la puerta azul de la casa"
        ],
        "hint": "ждать = esperar • папа ждёт = el papá espera • дверь = la puerta • синий = azul • дом = la casa",
        "distractors": [
          "espera",
          "ventana",
          "auto"
        ]
      },
      {
        "id": "ru_es_2_18",
        "verb": "esperar",
        "verbForm": "espera",
        "verbPerson": "ella",
        "russian": "Бабушка ждёт маму в машине.",
        "spanish": "La abuela espera a mamá en el auto.",
        "acceptedAnswers": [
          "La abuela espera a mamá en el auto",
          "La abuela espera a mama en el auto"
        ],
        "hint": "ждать = esperar • бабушка ждёт = la abuela espera • мама = la mamá • машина = el auto",
        "distractors": [
          "espera",
          "papá",
          "casa"
        ]
      },
      {
        "id": "ru_es_2_19",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "él",
        "russian": "Брат помогает папе за большим столом.",
        "spanish": "El hermano ayuda a papá en la mesa grande.",
        "acceptedAnswers": [
          "El hermano ayuda a papá en la mesa grande",
          "El hermano ayuda a papa en la mesa grande"
        ],
        "hint": "помогать = ayudar • брат помогает = el hermano ayuda • папа = el papá • стол = la mesa • большой = grande",
        "distractors": [
          "ayuda",
          "mamá",
          "silla"
        ]
      },
      {
        "id": "ru_es_2_20",
        "verb": "ayudar",
        "verbForm": "ayuda",
        "verbPerson": "ella",
        "russian": "Подруга помогает учительнице с книгами.",
        "spanish": "La amiga ayuda a la seño con los libros.",
        "acceptedAnswers": [
          "La amiga ayuda a la seño con los libros",
          "La amiga ayuda a la seno con los libros"
        ],
        "hint": "помогать = ayudar • подруга помогает = la amiga ayuda • учительница = la seño • книги = los libros",
        "distractors": [
          "ayuda",
          "cuadernos",
          "mochila"
        ]
      }
    ]
  },
  {
    "id": 3,
    "title": "Упр. 3: Мы делаем вместе (nosotros / nosotras)",
    "shortTitle": "3. Мы вместе",
    "description": "Пишем формы множественного числа для мы (хвостики -amos, -emos)",
    "icon": "🤝",
    "sentences": [
      {
        "id": "ru_es_3_01",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotros",
        "russian": "Мы рисуем маленькую собаку чёрным карандашом.",
        "spanish": "Nosotros dibujamos un perro chiquito con el lápiz negro.",
        "acceptedAnswers": [
          "Nosotros dibujamos un perro chiquito con el lápiz negro",
          "Dibujamos un perro chiquito con el lápiz negro",
          "Nosotros dibujamos un perro chiquito con el lapiz negro",
          "Dibujamos un perro chiquito con el lapiz negro"
        ],
        "hint": "рисовать = dibujar • мы рисуем = nosotros dibujamos • собака = el perro • маленький = chiquito • карандаш = el lápiz • чёрный = negro",
        "distractors": [
          "gato",
          "blanco",
          "libro"
        ]
      },
      {
        "id": "ru_es_3_02",
        "verb": "dibujar",
        "verbForm": "dibujamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) рисуем красивое солнце в тетради.",
        "spanish": "Nosotras dibujamos un sol lindo en el cuaderno.",
        "acceptedAnswers": [
          "Nosotras dibujamos un sol lindo en el cuaderno",
          "Dibujamos un sol lindo en el cuaderno"
        ],
        "hint": "рисовать = dibujar • мы рисуем = nosotras dibujamos • солнце = el sol • красивый = lindo • тетрадь = el cuaderno",
        "distractors": [
          "noche",
          "amarillo",
          "mesa"
        ]
      },
      {
        "id": "ru_es_3_03",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotros",
        "russian": "Мы красим большую дверь в синий цвет.",
        "spanish": "Nosotros pintamos la puerta grande de color azul.",
        "acceptedAnswers": [
          "Nosotros pintamos la puerta grande de color azul",
          "Pintamos la puerta grande de color azul"
        ],
        "hint": "красить = pintar • мы красим = nosotros pintamos • дверь = la puerta • большой = grande • синий = azul",
        "distractors": [
          "ventana",
          "blanco",
          "verde"
        ]
      },
      {
        "id": "ru_es_3_04",
        "verb": "pintar",
        "verbForm": "pintamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) раскрашиваем зелёное яблоко в книге.",
        "spanish": "Nosotras pintamos una manzana verde en el libro.",
        "acceptedAnswers": [
          "Nosotras pintamos una manzana verde en el libro",
          "Pintamos una manzana verde en el libro"
        ],
        "hint": "раскрашивать = pintar • мы раскрашиваем = nosotras pintamos • яблоко = la manzana • зелёный = verde • книга = el libro",
        "distractors": [
          "rojo",
          "banana",
          "cuaderno"
        ]
      },
      {
        "id": "ru_es_3_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "russian": "Мы едим вкусное печенье с молоком за столом.",
        "spanish": "Nosotros comemos galletitas ricas con leche en la mesa.",
        "acceptedAnswers": [
          "Nosotros comemos galletitas ricas con leche en la mesa",
          "Comemos galletitas ricas con leche en la mesa"
        ],
        "hint": "есть = comer • мы едим = nosotros comemos • печенье = las galletitas • молоко = la leche • стол = la mesa",
        "distractors": [
          "pan",
          "queso",
          "silla"
        ]
      },
      {
        "id": "ru_es_3_06",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) кушаем вкусные бананы на полдник.",
        "spanish": "Nosotras comemos bananas ricas en la merienda.",
        "acceptedAnswers": [
          "Nosotras comemos bananas ricas en la merienda",
          "Comemos bananas ricas en la merienda"
        ],
        "hint": "кушать = comer • мы кушаем = nosotras comemos • бананы = las bananas • полдник = la merienda",
        "distractors": [
          "manzanas",
          "helado",
          "recreo"
        ]
      },
      {
        "id": "ru_es_3_07",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotros",
        "russian": "Мы быстро бежим к синей машине.",
        "spanish": "Nosotros corremos rápido al auto azul.",
        "acceptedAnswers": [
          "Nosotros corremos rápido al auto azul",
          "Corremos rápido al auto azul",
          "Nosotros corremos rapido al auto azul",
          "Corremos rapido al auto azul"
        ],
        "hint": "бежать = correr • мы бежим = nosotros corremos • быстро = rápido • машина = el auto • синий = azul",
        "distractors": [
          "despacio",
          "puerta",
          "blanco"
        ]
      },
      {
        "id": "ru_es_3_08",
        "verb": "correr",
        "verbForm": "corremos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) радостно бегаем с собакой на площадке.",
        "spanish": "Nosotras corremos felices con el perro en la plaza.",
        "acceptedAnswers": [
          "Nosotras corremos felices con el perro en la plaza",
          "Corremos felices con el perro en la plaza"
        ],
        "hint": "бегать = correr • мы бегаем = nosotras corremos • радостно = feliz • собака = el perro • площадка = la plaza",
        "distractors": [
          "gato",
          "pelota",
          "casa"
        ]
      },
      {
        "id": "ru_es_3_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotros",
        "russian": "Мы слушаем доброго дедушку в доме.",
        "spanish": "Nosotros escuchamos al abuelo lindo en la casa.",
        "acceptedAnswers": [
          "Nosotros escuchamos al abuelo lindo en la casa",
          "Escuchamos al abuelo lindo en la casa"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotros escuchamos • дедушка = el abuelo • дом = la casa",
        "distractors": [
          "abuela",
          "seño",
          "auto"
        ]
      },
      {
        "id": "ru_es_3_10",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) слушаем маму в машине.",
        "spanish": "Nosotras escuchamos a mamá en el auto.",
        "acceptedAnswers": [
          "Nosotras escuchamos a mamá en el auto",
          "Escuchamos a mamá en el auto",
          "Nosotras escuchamos a mama en el auto",
          "Escuchamos a mama en el auto"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotras escuchamos • мама = la mamá • машина = el auto",
        "distractors": [
          "papá",
          "lluvia",
          "casa"
        ]
      },
      {
        "id": "ru_es_3_11",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotros",
        "russian": "Мы смотрим на чёрную кошку на окне.",
        "spanish": "Nosotros miramos la gata negra en la ventana.",
        "acceptedAnswers": [
          "Nosotros miramos la gata negra en la ventana",
          "Miramos la gata negra en la ventana",
          "Nosotros miramos el gato negro en la ventana",
          "Miramos el gato negro en la ventana"
        ],
        "hint": "смотреть = mirar • мы смотрим = nosotros miramos • кошка = la gata / el gato • чёрный = negro • окно = la ventana",
        "distractors": [
          "blanco",
          "perro",
          "puerta"
        ]
      },
      {
        "id": "ru_es_3_12",
        "verb": "mirar",
        "verbForm": "miramos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) смотрим на синюю машину папы.",
        "spanish": "Nosotras miramos el auto azul de papá.",
        "acceptedAnswers": [
          "Nosotras miramos el auto azul de papá",
          "Miramos el auto azul de papá",
          "Nosotras miramos el auto azul de papa",
          "Miramos el auto azul de papa"
        ],
        "hint": "смотреть = mirar • мы смотрим = nosotras miramos • машина = el auto • синий = azul • папа = el papá",
        "distractors": [
          "mamá",
          "blanco",
          "casa"
        ]
      },
      {
        "id": "ru_es_3_13",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotros",
        "russian": "Мы покупаем шоколад и сок в киоске.",
        "spanish": "Nosotros compramos chocolate y jugo en el quiosco.",
        "acceptedAnswers": [
          "Nosotros compramos chocolate y jugo en el quiosco",
          "Compramos chocolate y jugo en el quiosco"
        ],
        "hint": "покупать = comprar • мы покупаем = nosotros compramos • шоколад = el chocolate • сок = el jugo • киоск = el quiosco",
        "distractors": [
          "helado",
          "pan",
          "leche"
        ]
      },
      {
        "id": "ru_es_3_14",
        "verb": "comprar",
        "verbForm": "compramos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) покупаем вкусные медиалуны на свои деньги.",
        "spanish": "Nosotras compramos medialunas ricas con nuestra plata.",
        "acceptedAnswers": [
          "Nosotras compramos medialunas ricas con nuestra plata",
          "Compramos medialunas ricas con nuestra plata"
        ],
        "hint": "покупать = comprar • мы покупаем = nosotras compramos • медиалуны = las medialunas • деньги = la plata",
        "distractors": [
          "galletitas",
          "helado",
          "quiosco"
        ]
      },
      {
        "id": "ru_es_3_15",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "russian": "Мы прыгаем с мячом на зелёной площадке.",
        "spanish": "Nosotros saltamos con la pelota en la plaza verde.",
        "acceptedAnswers": [
          "Nosotros saltamos con la pelota en la plaza verde",
          "Saltamos con la pelota en la plaza verde"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotros saltamos • мяч = la pelota • площадка = la plaza • зелёный = verde",
        "distractors": [
          "tobogán",
          "hamaca",
          "azul"
        ]
      },
      {
        "id": "ru_es_3_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) быстро прыгаем на качелях.",
        "spanish": "Nosotras saltamos rápido en las hamacas.",
        "acceptedAnswers": [
          "Nosotras saltamos rápido en las hamacas",
          "Saltamos rápido en las hamacas",
          "Nosotras saltamos rapido en las hamacas",
          "Saltamos rapido en las hamacas"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotras saltamos • быстро = rápido • качели = las hamacas",
        "distractors": [
          "tobogán",
          "despacio",
          "plaza"
        ]
      },
      {
        "id": "ru_es_3_17",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotros",
        "russian": "Мы ждём папу у белой двери.",
        "spanish": "Nosotros esperamos a papá en la puerta blanca.",
        "acceptedAnswers": [
          "Nosotros esperamos a papá en la puerta blanca",
          "Esperamos a papá en la puerta blanca",
          "Nosotros esperamos a papa en la puerta blanca",
          "Esperamos a papa en la puerta blanca"
        ],
        "hint": "ждать = esperar • мы ждём = nosotros esperamos • папа = el papá • дверь = la puerta • белый = blanco",
        "distractors": [
          "mamá",
          "ventana",
          "auto"
        ]
      },
      {
        "id": "ru_es_3_18",
        "verb": "esperar",
        "verbForm": "esperamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) ждём свою очередь на горке.",
        "spanish": "Nosotras esperamos nuestro turno en el tobogán.",
        "acceptedAnswers": [
          "Nosotras esperamos nuestro turno en el tobogán",
          "Esperamos nuestro turno en el tobogán",
          "Nosotras esperamos nuestro turno en el tobogan",
          "Esperamos nuestro turno en el tobogan"
        ],
        "hint": "ждать = esperar • мы ждём = nosotras esperamos • очередь = el turno • горка = el tobogán",
        "distractors": [
          "hamaca",
          "plaza",
          "pelota"
        ]
      },
      {
        "id": "ru_es_3_19",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotros",
        "russian": "Мы помогаем маме с вкусным полдником.",
        "spanish": "Nosotros ayudamos a mamá con la merienda rica.",
        "acceptedAnswers": [
          "Nosotros ayudamos a mamá con la merienda rica",
          "Ayudamos a mamá con la merienda rica",
          "Nosotros ayudamos a mama con la merienda rica",
          "Ayudamos a mama con la merienda rica"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotros ayudamos • мама = la mamá • полдник = la merienda • вкусный = rico",
        "distractors": [
          "papá",
          "mesa",
          "pan"
        ]
      },
      {
        "id": "ru_es_3_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) помогаем подруге с рюкзаком.",
        "spanish": "Nosotras ayudamos a la amiga con la mochila.",
        "acceptedAnswers": [
          "Nosotras ayudamos a la amiga con la mochila",
          "Ayudamos a la amiga con la mochila"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotras ayudamos • подруга = la amiga • рюкзак = la mochila",
        "distractors": [
          "amigo",
          "cuaderno",
          "libros"
        ]
      }
    ]
  },
  {
    "id": 4,
    "title": "Упр. 4: Они и вы все (ellos, ellas, ustedes)",
    "shortTitle": "4. Они и вы",
    "description": "Пишем формы множественного числа для ellos, ellas, ustedes (хвостики -an, -en)",
    "icon": "👥",
    "sentences": [
      {
        "id": "ru_es_4_01",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ellos",
        "russian": "Они рисуют большой дом синим карандашом.",
        "spanish": "Ellos dibujan una casa grande con lápiz azul.",
        "acceptedAnswers": [
          "Ellos dibujan una casa grande con lápiz azul",
          "Dibujan una casa grande con lápiz azul",
          "Ellos dibujan una casa grande con lapiz azul",
          "Dibujan una casa grande con lapiz azul"
        ],
        "hint": "рисовать = dibujar • они рисуют = ellos dibujan • дом = la casa • большой = grande • карандаш = el lápiz • синий = azul",
        "distractors": [
          "rojo",
          "cuaderno",
          "perro"
        ]
      },
      {
        "id": "ru_es_4_02",
        "verb": "dibujar",
        "verbForm": "dibujan",
        "verbPerson": "ustedes",
        "russian": "Вы рисуете маленьких кошек в тетради.",
        "spanish": "Ustedes dibujan gatos chiquitos en el cuaderno.",
        "acceptedAnswers": [
          "Ustedes dibujan gatos chiquitos en el cuaderno",
          "Dibujan gatos chiquitos en el cuaderno",
          "Ustedes dibujan gatas chiquitas en el cuaderno",
          "Dibujan gatas chiquitas en el cuaderno"
        ],
        "hint": "рисовать = dibujar • вы рисуете = ustedes dibujan • кошки = los gatos / las gatas • маленький = chiquito • тетрадь = el cuaderno",
        "distractors": [
          "perros",
          "grande",
          "libro"
        ]
      },
      {
        "id": "ru_es_4_03",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) раскрашивают жёлтое солнце в книге.",
        "spanish": "Ellas pintan el sol amarillo en el libro.",
        "acceptedAnswers": [
          "Ellas pintan el sol amarillo en el libro",
          "Pintan el sol amarillo en el libro"
        ],
        "hint": "раскрашивать = pintar • они (девочки) раскрашивают = ellas pintan • солнце = el sol • жёлтый = amarillo • книга = el libro",
        "distractors": [
          "noche",
          "azul",
          "mesa"
        ]
      },
      {
        "id": "ru_es_4_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ustedes",
        "russian": "Вы красите белые стулья в зелёный цвет.",
        "spanish": "Ustedes pintan las sillas blancas de color verde.",
        "acceptedAnswers": [
          "Ustedes pintan las sillas blancas de color verde",
          "Pintan las sillas blancas de color verde"
        ],
        "hint": "красить = pintar • вы красите = ustedes pintan • стулья = las sillas • белый = blanco • зелёный = verde",
        "distractors": [
          "mesas",
          "azul",
          "puertas"
        ]
      },
      {
        "id": "ru_es_4_05",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ellos",
        "russian": "Они едят вкусный хлеб с молоком.",
        "spanish": "Ellos comen pan rico con leche.",
        "acceptedAnswers": [
          "Ellos comen pan rico con leche",
          "Comen pan rico con leche"
        ],
        "hint": "есть = comer • они едят = ellos comen • хлеб = el pan • вкусный = rico • молоко = la leche",
        "distractors": [
          "queso",
          "agua",
          "pizza"
        ]
      },
      {
        "id": "ru_es_4_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "russian": "Вы кушаете красные яблоки за столом.",
        "spanish": "Ustedes comen manzanas rojas en la mesa.",
        "acceptedAnswers": [
          "Ustedes comen manzanas rojas en la mesa",
          "Comen manzanas rojas en la mesa"
        ],
        "hint": "кушать = comer • вы кушаете = ustedes comen • яблоки = las manzanas • красный = rojo • стол = la mesa",
        "distractors": [
          "bananas",
          "verde",
          "silla"
        ]
      },
      {
        "id": "ru_es_4_07",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ellas",
        "russian": "Они (девочки) медленно бегают с собакой.",
        "spanish": "Ellas corren despacio con el perro.",
        "acceptedAnswers": [
          "Ellas corren despacio con el perro",
          "Corren despacio con el perro"
        ],
        "hint": "бегать = correr • они (девочки) бегают = ellas corren • медленно = despacio • собака = el perro",
        "distractors": [
          "rápido",
          "gato",
          "pelota"
        ]
      },
      {
        "id": "ru_es_4_08",
        "verb": "correr",
        "verbForm": "corren",
        "verbPerson": "ustedes",
        "russian": "Вы быстро бежите к двери дома.",
        "spanish": "Ustedes corren rápido a la puerta de la casa.",
        "acceptedAnswers": [
          "Ustedes corren rápido a la puerta de la casa",
          "Corren rápido a la puerta de la casa",
          "Ustedes corren rapido a la puerta de la casa",
          "Corren rapido a la puerta de la casa"
        ],
        "hint": "бежать = correr • вы бежите = ustedes corren • быстро = rápido • дверь = la puerta • дом = la casa",
        "distractors": [
          "ventana",
          "despacio",
          "auto"
        ]
      },
      {
        "id": "ru_es_4_09",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ellos",
        "russian": "Они слушают добрую бабушку в доме.",
        "spanish": "Ellos escuchan a la abuela linda en la casa.",
        "acceptedAnswers": [
          "Ellos escuchan a la abuela linda en la casa",
          "Escuchan a la abuela linda en la casa"
        ],
        "hint": "слушать = escuchar • они слушают = ellos escuchan • бабушка = la abuela • дом = la casa",
        "distractors": [
          "abuelo",
          "mamá",
          "seño"
        ]
      },
      {
        "id": "ru_es_4_10",
        "verb": "escuchar",
        "verbForm": "escuchan",
        "verbPerson": "ustedes",
        "russian": "Вы слушаете дождь за окном дома.",
        "spanish": "Ustedes escuchan la lluvia en la ventana de la casa.",
        "acceptedAnswers": [
          "Ustedes escuchan la lluvia en la ventana de la casa",
          "Escuchan la lluvia en la ventana de la casa"
        ],
        "hint": "слушать = escuchar • вы слушаете = ustedes escuchan • дождь = la lluvia • окно = la ventana • дом = la casa",
        "distractors": [
          "sol",
          "puerta",
          "auto"
        ]
      },
      {
        "id": "ru_es_4_11",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ellas",
        "russian": "Они (девочки) смотрят на синий мяч на площадке.",
        "spanish": "Ellas miran la pelota azul en la plaza.",
        "acceptedAnswers": [
          "Ellas miran la pelota azul en la plaza",
          "Miran la pelota azul en la plaza"
        ],
        "hint": "смотреть = mirar • они (девочки) смотрят = ellas miran • мяч = la pelota • синий = azul • площадка = la plaza",
        "distractors": [
          "verde",
          "tobogán",
          "casa"
        ]
      },
      {
        "id": "ru_es_4_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "russian": "Вы смотрите на красивую машину папы.",
        "spanish": "Ustedes miran el auto lindo de papá.",
        "acceptedAnswers": [
          "Ustedes miran el auto lindo de papá",
          "Miran el auto lindo de papá",
          "Ustedes miran el auto lindo de papa",
          "Miran el auto lindo de papa"
        ],
        "hint": "смотреть = mirar • вы смотрите = ustedes miran • машина = el auto • красивый = lindo • папа = el papá",
        "distractors": [
          "mamá",
          "casa",
          "perro"
        ]
      },
      {
        "id": "ru_es_4_13",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ellos",
        "russian": "Они покупают вкусные альфахоры в киоске.",
        "spanish": "Ellos compran alfajores ricos en el quiosco.",
        "acceptedAnswers": [
          "Ellos compran alfajores ricos en el quiosco",
          "Compran alfajores ricos en el quiosco"
        ],
        "hint": "покупать = comprar • они покупают = ellos compran • альфахоры = los alfajores • вкусный = rico • киоск = el quiosco",
        "distractors": [
          "helado",
          "chocolate",
          "pan"
        ]
      },
      {
        "id": "ru_es_4_14",
        "verb": "comprar",
        "verbForm": "compran",
        "verbPerson": "ustedes",
        "russian": "Вы покупаете бананы и яблоки на свои деньги.",
        "spanish": "Ustedes compran bananas y manzanas con su plata.",
        "acceptedAnswers": [
          "Ustedes compran bananas y manzanas con su plata",
          "Compran bananas y manzanas con su plata"
        ],
        "hint": "покупать = comprar • вы покупаете = ustedes compran • бананы = las bananas • яблоки = las manzanas • деньги = la plata",
        "distractors": [
          "helado",
          "medialunas",
          "leche"
        ]
      },
      {
        "id": "ru_es_4_15",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) радостно прыгают на зелёной горке.",
        "spanish": "Ellas saltan felices en el tobogán verde.",
        "acceptedAnswers": [
          "Ellas saltan felices en el tobogán verde",
          "Saltan felices en el tobogán verde",
          "Ellas saltan felices en el tobogan verde",
          "Saltan felices en el tobogan verde"
        ],
        "hint": "прыгать = saltar • они (девочки) прыгают = ellas saltan • радостно = feliz • горка = el tobogán • зелёный = verde",
        "distractors": [
          "hamaca",
          "azul",
          "plaza"
        ]
      },
      {
        "id": "ru_es_4_16",
        "verb": "saltar",
        "verbForm": "saltan",
        "verbPerson": "ustedes",
        "russian": "Вы прыгаете на качелях на перемене.",
        "spanish": "Ustedes saltan en las hamacas en el recreo.",
        "acceptedAnswers": [
          "Ustedes saltan en las hamacas en el recreo",
          "Saltan en las hamacas en el recreo"
        ],
        "hint": "прыгать = saltar • вы прыгаете = ustedes saltan • качели = las hamacas • перемена = el recreo",
        "distractors": [
          "tobogán",
          "pelota",
          "recreo"
        ]
      },
      {
        "id": "ru_es_4_17",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "russian": "Они ждут учительницу у двери на перемене.",
        "spanish": "Ellos esperan a la seño en la puerta en el recreo.",
        "acceptedAnswers": [
          "Ellos esperan a la seño en la puerta en el recreo",
          "Esperan a la seño en la puerta en el recreo",
          "Ellos esperan a la seno en la puerta en el recreo"
        ],
        "hint": "ждать = esperar • они ждут = ellos esperan • учительница = la seño • дверь = la puerta • перемена = el recreo",
        "distractors": [
          "mamá",
          "ventana",
          "auto"
        ]
      },
      {
        "id": "ru_es_4_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ustedes",
        "russian": "Вы ждёте свою очередь на качелях.",
        "spanish": "Ustedes esperan su turno en la hamaca.",
        "acceptedAnswers": [
          "Ustedes esperan su turno en la hamaca",
          "Esperan su turno en la hamaca"
        ],
        "hint": "ждать = esperar • вы ждёте = ustedes esperan • очередь = el turno • качели = la hamaca",
        "distractors": [
          "tobogán",
          "pelota",
          "plaza"
        ]
      },
      {
        "id": "ru_es_4_19",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ellas",
        "russian": "Они (девочки) помогают сестре с книгами.",
        "spanish": "Ellas ayudan a la hermana con los libros.",
        "acceptedAnswers": [
          "Ellas ayudan a la hermana con los libros",
          "Ayudan a la hermana con los libros"
        ],
        "hint": "помогать = ayudar • они (девочки) помогают = ellas ayudan • сестра = la hermana • книги = los libros",
        "distractors": [
          "hermano",
          "cuadernos",
          "mochila"
        ]
      },
      {
        "id": "ru_es_4_20",
        "verb": "ayudar",
        "verbForm": "ayudan",
        "verbPerson": "ustedes",
        "russian": "Вы помогаете дедушке за столом.",
        "spanish": "Ustedes ayudan al abuelo en la mesa.",
        "acceptedAnswers": [
          "Ustedes ayudan al abuelo en la mesa",
          "Ayudan al abuelo en la mesa"
        ],
        "hint": "помогать = ayudar • вы помогаете = ustedes ayudan • дедушка = el abuelo • стол = la mesa",
        "distractors": [
          "abuela",
          "silla",
          "cama"
        ]
      }
    ]
  },
  {
    "id": 5,
    "title": "Упр. 5: Финальный супер-микс всех форм",
    "shortTitle": "5. Супер-микс",
    "description": "Пишем на испанском любые лица и формы глаголов на 100 словах Майи",
    "icon": "🚀",
    "sentences": [
      {
        "id": "ru_es_5_01",
        "verb": "dibujar",
        "verbForm": "dibuja",
        "verbPerson": "ella",
        "russian": "Майя рисует красивый дом в тетради.",
        "spanish": "Maya dibuja una casa linda en el cuaderno.",
        "acceptedAnswers": [
          "Maya dibuja una casa linda en el cuaderno"
        ],
        "hint": "рисовать = dibujar • Майя рисует = Maya dibuja • дом = la casa • красивый = lindo • тетрадь = el cuaderno",
        "distractors": [
          "libro",
          "perro",
          "mesa"
        ]
      },
      {
        "id": "ru_es_5_02",
        "verb": "dibujar",
        "verbForm": "dibujás",
        "verbPerson": "vos",
        "russian": "Ты рисуешь зелёный мяч чёрным карандашом.",
        "spanish": "Vos dibujás una pelota verde con lápiz negro.",
        "acceptedAnswers": [
          "Vos dibujás una pelota verde con lápiz negro",
          "Dibujás una pelota verde con lápiz negro",
          "Vos dibujas una pelota verde con lapiz negro",
          "Dibujas una pelota verde con lapiz negro",
          "Tú dibujas una pelota verde con lápiz negro"
        ],
        "hint": "рисовать = dibujar • ты рисуешь = vos dibujás • мяч = la pelota • зелёный = verde • карандаш = el lápiz • чёрный = negro",
        "distractors": [
          "blanco",
          "azul",
          "cuaderno"
        ]
      },
      {
        "id": "ru_es_5_03",
        "verb": "pintar",
        "verbForm": "pinto",
        "verbPerson": "yo",
        "russian": "Я раскрашиваю большую книгу цветными карандашами.",
        "spanish": "Yo pinto el libro grande con lápices de colores.",
        "acceptedAnswers": [
          "Yo pinto el libro grande con lápices de colores",
          "Pinto el libro grande con lápices de colores",
          "Yo pinto el libro grande con lapices de colores"
        ],
        "hint": "раскрашивать = pintar • я раскрашиваю = yo pinto • книга = el libro • большой = grande • карандаши = los lápices",
        "distractors": [
          "cuaderno",
          "chiquito",
          "mesa"
        ]
      },
      {
        "id": "ru_es_5_04",
        "verb": "pintar",
        "verbForm": "pintan",
        "verbPerson": "ellos",
        "russian": "Они красят стол в белый цвет.",
        "spanish": "Ellos pintan la mesa de color blanco.",
        "acceptedAnswers": [
          "Ellos pintan la mesa de color blanco",
          "Pintan la mesa de color blanco"
        ],
        "hint": "красить = pintar • они красят = ellos pintan • стол = la mesa • белый = blanco",
        "distractors": [
          "silla",
          "negro",
          "azul"
        ]
      },
      {
        "id": "ru_es_5_05",
        "verb": "comer",
        "verbForm": "comemos",
        "verbPerson": "nosotros",
        "russian": "Мы едим вкусную пиццу с сыром за столом.",
        "spanish": "Nosotros comemos pizza rica con queso en la mesa.",
        "acceptedAnswers": [
          "Nosotros comemos pizza rica con queso en la mesa",
          "Comemos pizza rica con queso en la mesa"
        ],
        "hint": "есть = comer • мы едим = nosotros comemos • пицца = la pizza • сыр = el queso • стол = la mesa",
        "distractors": [
          "pan",
          "leche",
          "silla"
        ]
      },
      {
        "id": "ru_es_5_06",
        "verb": "comer",
        "verbForm": "comen",
        "verbPerson": "ustedes",
        "russian": "Вы кушаете вкусный шоколад на перемене.",
        "spanish": "Ustedes comen chocolate rico en el recreo.",
        "acceptedAnswers": [
          "Ustedes comen chocolate rico en el recreo",
          "Comen chocolate rico en el recreo"
        ],
        "hint": "кушать = comer • вы кушаете = ustedes comen • шоколад = el chocolate • вкусный = rico • перемена = el recreo",
        "distractors": [
          "helado",
          "pan",
          "quiosco"
        ]
      },
      {
        "id": "ru_es_5_07",
        "verb": "correr",
        "verbForm": "corre",
        "verbPerson": "él",
        "russian": "Маленький брат быстро бежит к бабушке.",
        "spanish": "El hermano chiquito corre rápido a la abuela.",
        "acceptedAnswers": [
          "El hermano chiquito corre rápido a la abuela",
          "El hermano chiquito corre rapido a la abuela"
        ],
        "hint": "бежать = correr • брат бежит = el hermano corre • маленький = chiquito • быстро = rápido • бабушка = la abuela",
        "distractors": [
          "abuelo",
          "despacio",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_08",
        "verb": "correr",
        "verbForm": "corrés",
        "verbPerson": "vos",
        "russian": "Ты быстро бежишь за мячом на площадке.",
        "spanish": "Vos corrés rápido con la pelota en la plaza.",
        "acceptedAnswers": [
          "Vos corrés rápido con la pelota en la plaza",
          "Corrés rápido con la pelota en la plaza",
          "Vos corres rapido con la pelota en la plaza",
          "Corres rapido con la pelota en la plaza",
          "Tú corres rápido con la pelota en la plaza"
        ],
        "hint": "бежать = correr • ты бежишь = vos corrés • быстро = rápido • мяч = la pelota • площадка = la plaza",
        "distractors": [
          "despacio",
          "perro",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_09",
        "verb": "escuchar",
        "verbForm": "escuchamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) слушаем учительницу за столом.",
        "spanish": "Nosotras escuchamos a la seño en la mesa.",
        "acceptedAnswers": [
          "Nosotras escuchamos a la seño en la mesa",
          "Escuchamos a la seño en la mesa",
          "Nosotras escuchamos a la seno en la mesa"
        ],
        "hint": "слушать = escuchar • мы слушаем = nosotras escuchamos • учительница = la seño • стол = la mesa",
        "distractors": [
          "silla",
          "mamá",
          "recreo"
        ]
      },
      {
        "id": "ru_es_5_10",
        "verb": "escuchar",
        "verbForm": "escucha",
        "verbPerson": "ella",
        "russian": "Она слушает доброго папу в машине.",
        "spanish": "Ella escucha al papá lindo en el auto.",
        "acceptedAnswers": [
          "Ella escucha al papá lindo en el auto",
          "Ella escucha al papa lindo en el auto"
        ],
        "hint": "слушать = escuchar • она слушает = ella escucha • папа = el papá • машина = el auto",
        "distractors": [
          "mamá",
          "abuelo",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_11",
        "verb": "mirar",
        "verbForm": "miro",
        "verbPerson": "yo",
        "russian": "Я смотрю на синий автомобиль из окна.",
        "spanish": "Yo miro el auto azul por la ventana.",
        "acceptedAnswers": [
          "Yo miro el auto azul por la ventana",
          "Miro el auto azul por la ventana",
          "Yo miro el auto azul en la ventana"
        ],
        "hint": "смотреть = mirar • я смотрю = yo miro • машина = el auto • синий = azul • окно = la ventana",
        "distractors": [
          "puerta",
          "blanco",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_12",
        "verb": "mirar",
        "verbForm": "miran",
        "verbPerson": "ustedes",
        "russian": "Вы смотрите на жёлтое солнце в тёплый день.",
        "spanish": "Ustedes miran el sol amarillo en un día de calor.",
        "acceptedAnswers": [
          "Ustedes miran el sol amarillo en un día de calor",
          "Miran el sol amarillo en un día de calor",
          "Ustedes miran el sol amarillo en un dia de calor"
        ],
        "hint": "смотреть = mirar • вы смотрите = ustedes miran • солнце = el sol • жёлтый = amarillo • день = el día • тепло = el calor",
        "distractors": [
          "lluvia",
          "frío",
          "noche"
        ]
      },
      {
        "id": "ru_es_5_13",
        "verb": "comprar",
        "verbForm": "compra",
        "verbPerson": "ella",
        "russian": "Мама покупает вкусный сок и хлеб на полдник.",
        "spanish": "La mamá compra jugo rico y pan para la merienda.",
        "acceptedAnswers": [
          "La mamá compra jugo rico y pan para la merienda",
          "La mama compra jugo rico y pan para la merienda"
        ],
        "hint": "покупать = comprar • мама покупает = la mamá compra • сок = el jugo • хлеб = el pan • полдник = la merienda",
        "distractors": [
          "leche",
          "queso",
          "recreo"
        ]
      },
      {
        "id": "ru_es_5_14",
        "verb": "comprar",
        "verbForm": "comprás",
        "verbPerson": "vos",
        "russian": "Ты покупаешь красивую тетрадь в киоске.",
        "spanish": "Vos comprás un cuaderno lindo en el quiosco.",
        "acceptedAnswers": [
          "Vos comprás un cuaderno lindo en el quiosco",
          "Comprás un cuaderno lindo en el quiosco",
          "Vos compras un cuaderno lindo en el quiosco",
          "Compras un cuaderno lindo en el quiosco",
          "Tú compras un cuaderno lindo en el quiosco"
        ],
        "hint": "покупать = comprar • ты покупаешь = vos comprás • тетрадь = el cuaderno • красивый = lindo • киоск = el quiosco",
        "distractors": [
          "libro",
          "lápiz",
          "mochila"
        ]
      },
      {
        "id": "ru_es_5_15",
        "verb": "saltar",
        "verbForm": "salta",
        "verbPerson": "él",
        "russian": "Собака радостно прыгает с мячом на площадке.",
        "spanish": "El perro salta feliz con la pelota en la plaza.",
        "acceptedAnswers": [
          "El perro salta feliz con la pelota en la plaza"
        ],
        "hint": "прыгать = saltar • собака прыгает = el perro salta • радостно = feliz • мяч = la pelota • площадка = la plaza",
        "distractors": [
          "gato",
          "tobogán",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_16",
        "verb": "saltar",
        "verbForm": "saltamos",
        "verbPerson": "nosotros",
        "russian": "Мы радостно прыгаем на большой горке.",
        "spanish": "Nosotros saltamos felices en el tobogán grande.",
        "acceptedAnswers": [
          "Nosotros saltamos felices en el tobogán grande",
          "Saltamos felices en el tobogán grande",
          "Nosotros saltamos felices en el tobogan grande"
        ],
        "hint": "прыгать = saltar • мы прыгаем = nosotros saltamos • радостно = feliz • горка = el tobogán • большой = grande",
        "distractors": [
          "hamaca",
          "chiquito",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_17",
        "verb": "esperar",
        "verbForm": "espero",
        "verbPerson": "yo",
        "russian": "Я жду маму возле белой машины.",
        "spanish": "Yo espero a mamá en el auto blanco.",
        "acceptedAnswers": [
          "Yo espero a mamá en el auto blanco",
          "Espero a mamá en el auto blanco",
          "Yo espero a mama en el auto blanco",
          "Espero a mama en el auto blanco"
        ],
        "hint": "ждать = esperar • я жду = yo espero • мама = la mamá • машина = el auto • белый = blanco",
        "distractors": [
          "papá",
          "azul",
          "casa"
        ]
      },
      {
        "id": "ru_es_5_18",
        "verb": "esperar",
        "verbForm": "esperan",
        "verbPerson": "ellos",
        "russian": "Они ждут свою очередь на большой горке.",
        "spanish": "Ellos esperan su turno en el tobogán grande.",
        "acceptedAnswers": [
          "Ellos esperan su turno en el tobogán grande",
          "Esperan su turno en el tobogán grande",
          "Ellos esperan su turno en el tobogan grande"
        ],
        "hint": "ждать = esperar • они ждут = ellos esperan • очередь = el turno • горка = el tobogán • большой = grande",
        "distractors": [
          "hamaca",
          "chiquito",
          "plaza"
        ]
      },
      {
        "id": "ru_es_5_19",
        "verb": "ayudar",
        "verbForm": "ayudás",
        "verbPerson": "vos",
        "russian": "Ты помогаешь другу с рюкзаком.",
        "spanish": "Vos ayudás al amigo con la mochila.",
        "acceptedAnswers": [
          "Vos ayudás al amigo con la mochila",
          "Ayudás al amigo con la mochila",
          "Vos ayudas al amigo con la mochila",
          "Ayudas al amigo con la mochila",
          "Tú ayudas al amigo con la mochila"
        ],
        "hint": "помогать = ayudar • ты помогаешь = vos ayudás • друг = el amigo • рюкзак = la mochila",
        "distractors": [
          "hermano",
          "cuaderno",
          "libros"
        ]
      },
      {
        "id": "ru_es_5_20",
        "verb": "ayudar",
        "verbForm": "ayudamos",
        "verbPerson": "nosotras",
        "russian": "Мы (девочки) помогаем маме за столом.",
        "spanish": "Nosotras ayudamos a mamá en la mesa.",
        "acceptedAnswers": [
          "Nosotras ayudamos a mamá en la mesa",
          "Ayudamos a mamá en la mesa",
          "Nosotras ayudamos a mama en la mesa",
          "Ayudamos a mama en la mesa"
        ],
        "hint": "помогать = ayudar • мы помогаем = nosotras ayudamos • мама = la mamá • стол = la mesa",
        "distractors": [
          "papá",
          "silla",
          "cama"
        ]
      }
    ]
  }
];

export const MAYA_REGULAR_VERBS_LIST = [
  'dibujar',
  'pintar',
  'comer',
  'correr',
  'escuchar',
  'mirar',
  'comprar',
  'saltar',
  'esperar',
  'ayudar'
];

const jsContent = `// Practice sentences dataset for Maya
// Tailored strictly to Maya's 100-word curriculum and regular verb endings
// Total 200 unique sentences focusing on regular verbs and Maya's vocabulary

export const MAYA_REGULAR_VERBS_LIST = ${JSON.stringify(MAYA_REGULAR_VERBS_LIST, null, 2)};

export const EXERCISES_ES_TO_RU = ${JSON.stringify(ES_TO_RU, null, 2)};

export const EXERCISES_RU_TO_ES = ${JSON.stringify(RU_TO_ES, null, 2)};

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
    .split(/\\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const distractors = Array.isArray(sentence.distractors) ? sentence.distractors : [];
  const allTokens = [...cleanTokens, ...distractors];

  // Shuffle deterministically based on tokens length + chars, or random
  return allTokens
    .map((word, idx) => ({ id: \`\${idx}_\${word}\`, text: word }))
    .sort(() => 0.5 - Math.random());
}
`;

fs.writeFileSync(path.resolve('/srv/LinguaLearn/spanish/src/utils/mayaSentencesData.js'), jsContent, 'utf8');
console.log('Saved /srv/LinguaLearn/spanish/src/utils/mayaSentencesData.js successfully!');
