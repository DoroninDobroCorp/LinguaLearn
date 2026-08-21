/**
 * Complete CEFR A1 Checkpoints Dataset
 * Unit Checkpoints 1-9 (40% current, 40% spaced, 20% real task) & Final Graduation Exam.
 */
export const A1_CHECKPOINTS = Object.freeze(
{
  "a1-u01-first-contact": {
    "id": "checkpoint-u01",
    "unitId": "a1-u01-first-contact",
    "unitOrder": 1,
    "title": "Контрольная точка: Модуль 1 — Первый контакт",
    "description": "Проверка приветствий, личных местоимений, счета 0–20 и первого знакомства.",
    "tasksCount": 14,
    "tasks": [
      {
        "id": "chk-u01-01",
        "topicId": 27,
        "type": "choice",
        "question": "¿Cómo se saluda por la mañana a las diez?",
        "options": [
          "¡Buenos días!",
          "¡Buenas tardes!",
          "¡Buenas noches!",
          "¡Hasta luego!"
        ],
        "correctAnswer": "¡Buenos días!",
        "explanation": "Buenos días — утреннее приветствие."
      },
      {
        "id": "chk-u01-02",
        "topicId": 27,
        "type": "gap",
        "question": "Hola, me ____ (llamar, yo) Carlos y soy de Madrid.",
        "correctAnswer": "llamo",
        "acceptableAnswers": [
          "llamo",
          "Llamo"
        ],
        "explanation": "me llamo."
      },
      {
        "id": "chk-u01-03",
        "topicId": 7,
        "type": "choice",
        "question": "¿Qué pronombre se usa para «nosotros» si solo son mujeres?",
        "options": [
          "Nosotras",
          "Nosotros",
          "Ellas",
          "Vosotras"
        ],
        "correctAnswer": "Nosotras",
        "explanation": "Nosotras."
      },
      {
        "id": "chk-u01-04",
        "topicId": 7,
        "type": "gap",
        "question": "Carlos y yo somos amigos. ____ (мы) estudiamos español.",
        "correctAnswer": "Nosotros",
        "acceptableAnswers": [
          "Nosotros",
          "nosotros"
        ],
        "explanation": "Nosotros."
      },
      {
        "id": "chk-u01-05",
        "topicId": 19,
        "type": "choice",
        "question": "¿Cuánto es diez más seis (10 + 6)?",
        "options": [
          "dieciséis",
          "diecisiete",
          "quince",
          "catorce"
        ],
        "correctAnswer": "dieciséis",
        "explanation": "16 = dieciséis (пишется слитно с тильдой)."
      },
      {
        "id": "chk-u01-06",
        "topicId": 19,
        "type": "gap",
        "question": "Tengo ____ (1, перед муж. родом) billete de tren.",
        "correctAnswer": "un",
        "acceptableAnswers": [
          "un",
          "Un"
        ],
        "explanation": "un billete."
      },
      {
        "id": "chk-u01-07",
        "topicId": 27,
        "type": "choice",
        "question": "¿Qué se responde a «¡Muchas gracias!»?",
        "options": [
          "De nada",
          "Por favor",
          "Lo siento",
          "Hola"
        ],
        "correctAnswer": "De nada",
        "explanation": "De nada."
      },
      {
        "id": "chk-u01-08",
        "topicId": 7,
        "type": "transformation",
        "question": "Ponga el pronombre «tú» con tilde:",
        "prompt": "tu → ____",
        "correctAnswer": "Tú",
        "acceptableAnswers": [
          "Tú",
          "tú"
        ],
        "explanation": "Tú."
      },
      {
        "id": "chk-u01-09",
        "topicId": 19,
        "type": "choice",
        "question": "¿Qué número es «quince»?",
        "options": [
          "15",
          "5",
          "50",
          "14"
        ],
        "correctAnswer": "15",
        "explanation": "15 = quince."
      },
      {
        "id": "chk-u01-10",
        "topicId": 27,
        "type": "input",
        "question": "Escriba «Пожалуйста» (просьба) en español:",
        "correctAnswer": "Por favor",
        "acceptableAnswers": [
          "por favor",
          "Por favor"
        ],
        "explanation": "por favor."
      },
      {
        "id": "chk-u01-11",
        "topicId": 7,
        "type": "choice",
        "question": "¿Qué pronombre se usa en Argentina para «tú»?",
        "options": [
          "Vos",
          "Usted",
          "Vosotros",
          "Él"
        ],
        "correctAnswer": "Vos",
        "explanation": "Vos."
      },
      {
        "id": "chk-u01-12",
        "topicId": 19,
        "type": "gap",
        "question": "La semana tiene ____ (7) días.",
        "correctAnswer": "siete",
        "acceptableAnswers": [
          "siete",
          "Siete"
        ],
        "explanation": "siete."
      },
      {
        "id": "chk-u01-13",
        "topicId": 27,
        "type": "scenario",
        "question": "Llegas a la recepción de la escuela a las 9:30. Preséntate con cortesía:",
        "options": [
          "¡Buenos días! Me llamo Alex y soy el nuevo estudiante. Mucho gusto.",
          "¡Buenas noches! No entiendo.",
          "De nada, adiós.",
          "Por favor, la cuenta."
        ],
        "correctAnswer": "¡Buenos días! Me llamo Alex y soy el nuevo estudiante. Mucho gusto.",
        "explanation": "Приветствие по времени + имя + формула вежливости."
      },
      {
        "id": "chk-u01-14",
        "topicId": 27,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Escribe una tarjeta de presentación con tu nombre, edad, país y saludo formal (mínimo 15 palabras).",
        "minWords": 15,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Cumplimiento",
              "max": 40
            },
            {
              "name": "Gramática",
              "max": 30
            },
            {
              "name": "Vocabulario",
              "max": 30
            }
          ]
        }
      }
    ]
  },
  "a1-u02-things": {
    "id": "checkpoint-u02",
    "unitId": "a1-u02-things",
    "unitOrder": 2,
    "title": "Контрольная точка: Модуль 2 — Предметы вокруг",
    "description": "Проверка артиклей (el/la, un/una), цветов, множественного числа и повторение Модуля 1.",
    "tasksCount": 15,
    "tasks": [
      {
        "id": "chk-u02-01",
        "topicId": 4,
        "type": "choice",
        "question": "¿Qué artículo lleva «problema»?",
        "options": [
          "el",
          "la",
          "los",
          "las"
        ],
        "correctAnswer": "el",
        "explanation": "el problema (муж. род)."
      },
      {
        "id": "chk-u02-02",
        "topicId": 4,
        "type": "gap",
        "question": "Voy ____ (a + el) parque por la tarde.",
        "correctAnswer": "al",
        "acceptableAnswers": [
          "al",
          "Al"
        ],
        "explanation": "a + el = al."
      },
      {
        "id": "chk-u02-03",
        "topicId": 5,
        "type": "choice",
        "question": "¿Cómo se dice «Я — врач» без лишнего артикля?",
        "options": [
          "Soy médico.",
          "Soy un médico.",
          "Estoy médico.",
          "Soy el médico."
        ],
        "correctAnswer": "Soy médico.",
        "explanation": "Профессия без оценки — без артикля."
      },
      {
        "id": "chk-u02-04",
        "topicId": 20,
        "type": "choice",
        "question": "¿Cómo se dice «белая рубашка»?",
        "options": [
          "una camisa blanca",
          "una blanca camisa",
          "una camisa blanco",
          "un camisa blanca"
        ],
        "correctAnswer": "una camisa blanca",
        "explanation": "una camisa blanca."
      },
      {
        "id": "chk-u02-05",
        "topicId": 6,
        "type": "choice",
        "question": "¿Cuál es el plural de «el pez»?",
        "options": [
          "los peces",
          "los pezs",
          "los pezes",
          "las pezas"
        ],
        "correctAnswer": "los peces",
        "explanation": "el pez → los peces (z → ces)."
      },
      {
        "id": "chk-u02-06",
        "topicId": 6,
        "type": "gap",
        "question": "El hotel → Los ____ (отели).",
        "correctAnswer": "hoteles",
        "acceptableAnswers": [
          "hoteles",
          "Hoteles"
        ],
        "explanation": "hoteles."
      },
      {
        "id": "chk-u02-07",
        "topicId": 27,
        "type": "choice",
        "question": "¿Cómo se saluda a las tres de la tarde?",
        "options": [
          "¡Buenas tardes!",
          "¡Buenos días!",
          "¡Buenas noches!",
          "¡Adiós!"
        ],
        "correctAnswer": "¡Buenas tardes!",
        "explanation": "Buenas tardes."
      },
      {
        "id": "chk-u02-08",
        "topicId": 7,
        "type": "gap",
        "question": "Ella y Laura son amigas; ____ (они, жен. род) estudian juntas.",
        "correctAnswer": "ellas",
        "acceptableAnswers": [
          "ellas",
          "Ellas"
        ],
        "explanation": "ellas."
      },
      {
        "id": "chk-u02-09",
        "topicId": 19,
        "type": "choice",
        "question": "¿Cuánto es ocho más siete (8 + 7)?",
        "options": [
          "quince",
          "catorce",
          "dieciséis",
          "trece"
        ],
        "correctAnswer": "quince",
        "explanation": "8 + 7 = 15 (quince)."
      },
      {
        "id": "chk-u02-10",
        "topicId": 4,
        "type": "choice",
        "question": "¿Qué artículo lleva «mano»?",
        "options": [
          "la",
          "el",
          "los",
          "las"
        ],
        "correctAnswer": "la",
        "explanation": "la mano (женский род)."
      },
      {
        "id": "chk-u02-11",
        "topicId": 20,
        "type": "transformation",
        "question": "Plural de «azul»:",
        "prompt": "azul → ____",
        "correctAnswer": "azules",
        "acceptableAnswers": [
          "azules",
          "Azules"
        ],
        "explanation": "azul → azules."
      },
      {
        "id": "chk-u02-12",
        "topicId": 5,
        "type": "gap",
        "question": "En la plaza hay ____ (жен. ед.) cafetería bonita.",
        "correctAnswer": "una",
        "acceptableAnswers": [
          "una",
          "Una"
        ],
        "explanation": "una cafetería."
      },
      {
        "id": "chk-u02-13",
        "topicId": 4,
        "type": "scenario",
        "question": "En una papelería compras un cuaderno y preguntas por el mapa de la ciudad:",
        "options": [
          "Quiero un cuaderno rojo y el mapa de la ciudad, por favor.",
          "Quiero una cuaderno rojo y la mapa del ciudad.",
          "Tengo el cuaderno y soy la mapa.",
          "De nada, los mapa."
        ],
        "correctAnswer": "Quiero un cuaderno rojo y el mapa de la ciudad, por favor.",
        "explanation": "Cuaderno rojo (муж. род) + el mapa (исключение муж. рода)."
      },
      {
        "id": "chk-u02-14",
        "topicId": 20,
        "type": "choice",
        "question": "¿De qué colores es la bandera de España?",
        "options": [
          "Roja y amarilla",
          "Azul y blanca",
          "Verde y negra",
          "Rosa y gris"
        ],
        "correctAnswer": "Roja y amarilla",
        "explanation": "Roja y amarilla."
      },
      {
        "id": "chk-u02-15",
        "topicId": 6,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Describe 3 objetos en tu habitación indicando su color y cantidad en plural (mínimo 15 palabras).",
        "minWords": 15,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Uso de artículos y plural",
              "max": 40
            },
            {
              "name": "Colores y concordancia",
              "max": 40
            },
            {
              "name": "Coherencia",
              "max": 20
            }
          ]
        }
      }
    ]
  },
  "a1-u03-identity": {
    "id": "checkpoint-u03",
    "unitId": "a1-u03-identity",
    "unitOrder": 3,
    "title": "Контрольная точка: Модуль 3 — Кто мы и какие мы",
    "description": "Проверка SER vs ESTAR, согласования прилагательных и описания людей + повторение Модулей 1 и 2.",
    "tasksCount": 15,
    "tasks": [
      {
        "id": "chk-u03-01",
        "topicId": 1,
        "type": "choice",
        "question": "¿Qué verbo expresa ubicación geográfica?",
        "options": [
          "ESTAR",
          "SER",
          "TENER",
          "HACER"
        ],
        "correctAnswer": "ESTAR",
        "explanation": "Местоположение — только estar (Madrid está en España)."
      },
      {
        "id": "chk-u03-02",
        "topicId": 1,
        "type": "gap",
        "question": "Hoy yo ____ (быть в состоянии) muy cansado por el trabajo.",
        "correctAnswer": "estoy",
        "acceptableAnswers": [
          "estoy",
          "Estoy"
        ],
        "explanation": "estoy cansado (состояние)."
      },
      {
        "id": "chk-u03-03",
        "topicId": 13,
        "type": "choice",
        "question": "¿Qué adjetivo NO cambia en femenino?",
        "options": [
          "inteligente",
          "alto",
          "simpático",
          "rojo"
        ],
        "correctAnswer": "inteligente",
        "explanation": "Прилагательные на -e одинаковы для обоих родов."
      },
      {
        "id": "chk-u03-04",
        "topicId": 13,
        "type": "gap",
        "question": "Las lecciones son muy ____ (легкий, мн. ч.).",
        "correctAnswer": "fáciles",
        "acceptableAnswers": [
          "fáciles",
          "faciles"
        ],
        "explanation": "fáciles."
      },
      {
        "id": "chk-u03-05",
        "topicId": 30,
        "type": "choice",
        "question": "¿Cómo se describe el color de los ojos?",
        "options": [
          "Tiene los ojos marrones",
          "Es los ojos marrones",
          "Está los ojos marrones",
          "Lleva los ojos marrones"
        ],
        "correctAnswer": "Tiene los ojos marrones",
        "explanation": "Tener + ojos."
      },
      {
        "id": "chk-u03-06",
        "topicId": 30,
        "type": "gap",
        "question": "El profesor ____ (носить) gafas y barba.",
        "correctAnswer": "lleva",
        "acceptableAnswers": [
          "lleva",
          "Lleva",
          "tiene"
        ],
        "explanation": "lleva gafas y barba."
      },
      {
        "id": "chk-u03-07",
        "topicId": 4,
        "type": "choice",
        "question": "¿Cuál es la forma correcta con contracción?",
        "options": [
          "Voy al cine.",
          "Voy a el cine.",
          "Voy del cine.",
          "Voy en el cine."
        ],
        "correctAnswer": "Voy al cine.",
        "explanation": "a + el = al."
      },
      {
        "id": "chk-u03-08",
        "topicId": 6,
        "type": "transformation",
        "question": "Plural de «la luz»:",
        "prompt": "la luz → las ____",
        "correctAnswer": "luces",
        "acceptableAnswers": [
          "luces",
          "Luces"
        ],
        "explanation": "luces (z → ces)."
      },
      {
        "id": "chk-u03-09",
        "topicId": 19,
        "type": "choice",
        "question": "¿Cuánto es doce más ocho (12 + 8)?",
        "options": [
          "veinte",
          "diecinueve",
          "dieciocho",
          "veintiuno"
        ],
        "correctAnswer": "veinte",
        "explanation": "20 = veinte."
      },
      {
        "id": "chk-u03-10",
        "topicId": 7,
        "type": "gap",
        "question": "Juan y yo somos estudiantes; ____ estudiamos mucho.",
        "correctAnswer": "nosotros",
        "acceptableAnswers": [
          "nosotros",
          "Nosotros"
        ],
        "explanation": "nosotros."
      },
      {
        "id": "chk-u03-11",
        "topicId": 20,
        "type": "choice",
        "question": "¿Cómo se dice «красные яблоки»?",
        "options": [
          "manzanas rojas",
          "manzanas rojos",
          "rojas manzanas",
          "manzanas roja"
        ],
        "correctAnswer": "manzanas rojas",
        "explanation": "manzanas rojas."
      },
      {
        "id": "chk-u03-12",
        "topicId": 5,
        "type": "choice",
        "question": "¿Qué significa «Cuesta unos veinte euros»?",
        "options": [
          "Aproximadamente 20 euros",
          "Exactamente 20 euros",
          "Menos de un euro",
          "20 billetes"
        ],
        "correctAnswer": "Aproximadamente 20 euros",
        "explanation": "unos = около/примерно."
      },
      {
        "id": "chk-u03-13",
        "topicId": 30,
        "type": "scenario",
        "question": "En el aeropuerto buscas a tu amiga Elena. Descríbela al personal de información:",
        "options": [
          "Es alta, tiene el pelo largo y rubio, y lleva una chaqueta roja.",
          "Está alta, es el pelo largo y tiene una chaqueta roja.",
          "Tiene alta, lleva los ojos rubios y es chaqueta roja.",
          "Es de chaqueta y está pelo rubio."
        ],
        "correctAnswer": "Es alta, tiene el pelo largo y rubio, y lleva una chaqueta roja.",
        "explanation": "Разделение SER (рост) + TENER (волосы) + LLEVAR (одежда)."
      },
      {
        "id": "chk-u03-14",
        "topicId": 1,
        "type": "choice",
        "question": "¿Cuál es la respuesta correcta a «¿Dónde estás ahora?»?",
        "options": [
          "Estoy en el hotel en Barcelona.",
          "Soy en el hotel en Barcelona.",
          "Tengo el hotel en Barcelona.",
          "Hago en el hotel."
        ],
        "correctAnswer": "Estoy en el hotel en Barcelona.",
        "explanation": "Estoy en el hotel (местоположение estar)."
      },
      {
        "id": "chk-u03-15",
        "topicId": 30,
        "type": "productive_speaking",
        "skill": "speaking",
        "prompt": "Graba un audio describiendo físicamente y de carácter a tu mejor amigo/a (mínimo 20 segundos).",
        "durationRange": "20-40s",
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Claridad y fluidez",
              "max": 40
            },
            {
              "name": "Uso de SER, TENER y LLEVAR",
              "max": 30
            },
            {
              "name": "Vocabulario de adjetivos",
              "max": 20
            },
            {
              "name": "Pronunciación",
              "max": 10
            }
          ]
        }
      }
    ]
  },
  "a1-u04-family": {
    "id": "checkpoint-u04",
    "unitId": "a1-u04-family",
    "unitOrder": 4,
    "title": "Контрольная точка: Модуль 4 — Семья и принадлежность",
    "description": "Проверка семьи, притяжательных (mi/tu/su), глагола TENER и частей тела + повторение Модулей 1-3.",
    "tasksCount": 15,
    "tasks": [
      {
        "id": "chk-u04-01",
        "topicId": 21,
        "type": "choice",
        "question": "¿Quién es el hermano de mi madre?",
        "options": [
          "mi tío",
          "mi abuelo",
          "mi primo",
          "mi sobrino"
        ],
        "correctAnswer": "mi tío",
        "explanation": "tío = дядя."
      },
      {
        "id": "chk-u04-02",
        "topicId": 8,
        "type": "gap",
        "question": "Carlos busca ____ (его, мн. ч.) llaves en el bolso.",
        "correctAnswer": "sus",
        "acceptableAnswers": [
          "sus",
          "Sus"
        ],
        "explanation": "sus llaves."
      },
      {
        "id": "chk-u04-03",
        "topicId": 8,
        "type": "choice",
        "question": "¿Cómo se dice «наш дом»?",
        "options": [
          "nuestra casa",
          "nuestro casa",
          "nuestros casa",
          "nosotros casa"
        ],
        "correctAnswer": "nuestra casa",
        "explanation": "nuestra casa (жен. род)."
      },
      {
        "id": "chk-u04-04",
        "topicId": 11,
        "type": "choice",
        "question": "¿Cómo se dice «Мне холодно»?",
        "options": [
          "Tengo mucho frío.",
          "Soy mucho frío.",
          "Estoy muy frío.",
          "Hago frío."
        ],
        "correctAnswer": "Tengo mucho frío.",
        "explanation": "Tengo mucho frío (глагол tener)."
      },
      {
        "id": "chk-u04-05",
        "topicId": 11,
        "type": "gap",
        "question": "Tengo ____ (обязанность) estudiar para el examen.",
        "correctAnswer": "que",
        "acceptableAnswers": [
          "que",
          "Que"
        ],
        "explanation": "Tengo que estudiar."
      },
      {
        "id": "chk-u04-06",
        "topicId": 25,
        "type": "choice",
        "question": "¿Cuál es la forma correcta: «Me ____ las piernas»?",
        "options": [
          "duelen",
          "duele",
          "duelo",
          "dolemos"
        ],
        "correctAnswer": "duelen",
        "explanation": "las piernas (мн. число) → duelen."
      },
      {
        "id": "chk-u04-07",
        "topicId": 1,
        "type": "choice",
        "question": "¿SER o ESTAR: «El café ____ muy caliente»?",
        "options": [
          "está",
          "es",
          "son",
          "están"
        ],
        "correctAnswer": "está",
        "explanation": "Температурное состояние — estar."
      },
      {
        "id": "chk-u04-08",
        "topicId": 4,
        "type": "gap",
        "question": "El libro ____ (de + el) profesor está en la mesa.",
        "correctAnswer": "del",
        "acceptableAnswers": [
          "del",
          "Del"
        ],
        "explanation": "de + el = del."
      },
      {
        "id": "chk-u04-09",
        "topicId": 13,
        "type": "transformation",
        "question": "Femenino de «trabajador»:",
        "prompt": "trabajador → ____",
        "correctAnswer": "trabajadora",
        "acceptableAnswers": [
          "trabajadora",
          "Trabajadora"
        ],
        "explanation": "trabajadora."
      },
      {
        "id": "chk-u04-10",
        "topicId": 20,
        "type": "choice",
        "question": "Plural de «ojo marrón»:",
        "options": [
          "ojos marrones",
          "ojos marrón",
          "ojos marronos",
          "ojos marronas"
        ],
        "correctAnswer": "ojos marrones",
        "explanation": "ojos marrones."
      },
      {
        "id": "chk-u04-11",
        "topicId": 19,
        "type": "choice",
        "question": "¿Cómo se escribe 18?",
        "options": [
          "dieciocho",
          "diez y ocho",
          "diezyocho",
          "diecisiete"
        ],
        "correctAnswer": "dieciocho",
        "explanation": "dieciocho (слитно)."
      },
      {
        "id": "chk-u04-12",
        "topicId": 27,
        "type": "gap",
        "question": "—Muchas gracias. —De ____, un placer.",
        "correctAnswer": "nada",
        "acceptableAnswers": [
          "nada",
          "Nada"
        ],
        "explanation": "De nada."
      },
      {
        "id": "chk-u04-13",
        "topicId": 25,
        "type": "scenario",
        "question": "En la farmacia explicas tus síntomas:",
        "options": [
          "Buenos días, me duele mucho la cabeza y tengo dolor de garganta.",
          "Buenos días, me duelen la cabeza y soy dolor.",
          "De nada, tengo frío la cabeza.",
          "Por favor, la cuenta de cabeza."
        ],
        "correctAnswer": "Buenos días, me duele mucho la cabeza y tengo dolor de garganta.",
        "explanation": "Me duele la cabeza + tengo dolor de garganta."
      },
      {
        "id": "chk-u04-14",
        "topicId": 11,
        "type": "choice",
        "question": "¿Qué dices si tienes prisa para tomar el tren?",
        "options": [
          "Perdón, tengo mucha prisa, tengo que irme.",
          "Perdón, soy mucha prisa.",
          "Estoy prisa del tren.",
          "Tengo miedo a la estación."
        ],
        "correctAnswer": "Perdón, tengo mucha prisa, tengo que irme.",
        "explanation": "tengo mucha prisa + tengo que irme."
      },
      {
        "id": "chk-u04-15",
        "topicId": 21,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Escribe un breve texto presentando a tu familia (padres, hermanos, edad y profesiones, mínimo 20 palabras).",
        "minWords": 20,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Vocabulario de familia y posesivos",
              "max": 40
            },
            {
              "name": "Uso de TENER y SER",
              "max": 35
            },
            {
              "name": "Ortografía y coherencia",
              "max": 25
            }
          ]
        }
      }
    ]
  },
  "a1-u05-actions": {
    "id": "checkpoint-u05",
    "unitId": "a1-u05-actions",
    "unitOrder": 5,
    "title": "Контрольная точка: Модуль 5 — Повседневные действия",
    "description": "Проверка глаголов на -AR, отрицания (no/nada/tampoco) и вопросов (¿...?) + повторение Модулей 1-4.",
    "tasksCount": 16,
    "tasks": [
      {
        "id": "chk-u05-01",
        "topicId": 2,
        "type": "choice",
        "question": "Forma correcta de «hablar» para «yo»:",
        "options": [
          "hablo",
          "hablas",
          "habla",
          "hablan"
        ],
        "correctAnswer": "hablo",
        "explanation": "yo hablo."
      },
      {
        "id": "chk-u05-02",
        "topicId": 2,
        "type": "gap",
        "question": "Mis padres ____ (trabajar) en una escuela.",
        "correctAnswer": "trabajan",
        "acceptableAnswers": [
          "trabajan",
          "Trabajan"
        ],
        "explanation": "trabajan."
      },
      {
        "id": "chk-u05-03",
        "topicId": 17,
        "type": "choice",
        "question": "¿Cómo se responde a «No hablo francés» si tú tampoco?",
        "options": [
          "Yo tampoco.",
          "Yo también no.",
          "Yo no.",
          "Yo nada."
        ],
        "correctAnswer": "Yo tampoco.",
        "explanation": "Yo tampoco."
      },
      {
        "id": "chk-u05-04",
        "topicId": 17,
        "type": "gap",
        "question": "No entiendo ____ (ничего), ¿puede repetir?",
        "correctAnswer": "nada",
        "acceptableAnswers": [
          "nada",
          "Nada"
        ],
        "explanation": "no entiendo nada."
      },
      {
        "id": "chk-u05-05",
        "topicId": 18,
        "type": "choice",
        "question": "¿Qué palabra interrogativa pregunta por la causa/razón?",
        "options": [
          "¿Por qué?",
          "¿Por que?",
          "¿Porque?",
          "¿Dónde?"
        ],
        "correctAnswer": "¿Por qué?",
        "explanation": "¿Por qué? (раздельно с тильдой)."
      },
      {
        "id": "chk-u05-06",
        "topicId": 18,
        "type": "gap",
        "question": "¿____ (где) está la estación de metro?",
        "correctAnswer": "Dónde",
        "acceptableAnswers": [
          "Dónde",
          "dónde",
          "Donde"
        ],
        "explanation": "¿Dónde está?"
      },
      {
        "id": "chk-u05-07",
        "topicId": 11,
        "type": "choice",
        "question": "¿Cómo se dice «Мне 25 лет»?",
        "options": [
          "Tengo veinticinco años.",
          "Soy veinticinco años.",
          "Estoy veinticinco años.",
          "Tengo veinticinco."
        ],
        "correctAnswer": "Tengo veinticinco años.",
        "explanation": "Tengo veinticinco años."
      },
      {
        "id": "chk-u05-08",
        "topicId": 8,
        "type": "choice",
        "question": "Forma correcta de «nuestro» para «casa»:",
        "options": [
          "nuestra casa",
          "nuestro casa",
          "nuestros casa",
          "nuestras casa"
        ],
        "correctAnswer": "nuestra casa",
        "explanation": "nuestra casa."
      },
      {
        "id": "chk-u05-09",
        "topicId": 25,
        "type": "gap",
        "question": "Me ____ (болит, ед. ч.) la cabeza.",
        "correctAnswer": "duele",
        "acceptableAnswers": [
          "duele",
          "Duele"
        ],
        "explanation": "duele."
      },
      {
        "id": "chk-u05-10",
        "topicId": 4,
        "type": "choice",
        "question": "Género de «idioma»:",
        "options": [
          "el idioma",
          "la idioma",
          "los idioma",
          "las idiomas"
        ],
        "correctAnswer": "el idioma",
        "explanation": "el idioma (муж. род)."
      },
      {
        "id": "chk-u05-11",
        "topicId": 1,
        "type": "gap",
        "question": "Madrid ____ (находится) en España.",
        "correctAnswer": "está",
        "acceptableAnswers": [
          "está",
          "esta",
          "Está"
        ],
        "explanation": "está en España."
      },
      {
        "id": "chk-u05-12",
        "topicId": 21,
        "type": "choice",
        "question": "¿Quién es la madre de mi padre?",
        "options": [
          "mi abuela",
          "mi tía",
          "mi hermana",
          "mi prima"
        ],
        "correctAnswer": "mi abuela",
        "explanation": "mi abuela."
      },
      {
        "id": "chk-u05-13",
        "topicId": 18,
        "type": "scenario",
        "question": "Entrevistas a un compañero de clase. Pregúntale dónde vive y por qué estudia español:",
        "options": [
          "¿Dónde vives y por qué estudias español?",
          "¿Qué vives y porque estudias español?",
          "¿Cuándo vives y cómo estudias español?",
          "¿Dónde está vives y por qué hablas?"
        ],
        "correctAnswer": "¿Dónde vives y por qué estudias español?",
        "explanation": "¿Dónde...? + ¿Por qué...?"
      },
      {
        "id": "chk-u05-14",
        "topicId": 17,
        "type": "choice",
        "question": "¿Cómo explicas amablemente que no hablas alemán?",
        "options": [
          "Perdón, no hablo alemán.",
          "Hablo no alemán jamás.",
          "Soy no alemán.",
          "No alemán yo."
        ],
        "correctAnswer": "Perdón, no hablo alemán.",
        "explanation": "No hablo alemán."
      },
      {
        "id": "chk-u05-15",
        "topicId": 2,
        "type": "input",
        "question": "Escribe en español «Я готовлю ужин по воскресеньям»:",
        "correctAnswer": "Cocino la cena los domingos",
        "acceptableAnswers": [
          "Cocino la cena los domingos",
          "cocino la cena los domingos",
          "Yo cocino la cena los domingos"
        ],
        "explanation": "Cocino la cena los domingos."
      },
      {
        "id": "chk-u05-16",
        "topicId": 18,
        "type": "productive_speaking",
        "skill": "speaking",
        "prompt": "Formula 3 preguntas en audio para conocer a un nuevo compañero (nombre, país, motivo para aprender español).",
        "durationRange": "20-40s",
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Entonación interrogativa",
              "max": 40
            },
            {
              "name": "Palabras interrogativas con tilde",
              "max": 30
            },
            {
              "name": "Vocabulario A1",
              "max": 30
            }
          ]
        }
      }
    ]
  },
  "a1-u06-calendar": {
    "id": "checkpoint-u06",
    "unitId": "a1-u06-calendar",
    "unitOrder": 6,
    "title": "Контрольная точка: Модуль 6 — Календарь и время",
    "description": "Проверка дней недели, времени (la hora), чисел 0–1000 и повторение Модулей 1-5.",
    "tasksCount": 16,
    "tasks": [
      {
        "id": "chk-u06-01",
        "topicId": 22,
        "type": "choice",
        "question": "¿Cómo se dice «в понедельник»?",
        "options": [
          "El lunes",
          "En lunes",
          "A lunes",
          "Por lunes"
        ],
        "correctAnswer": "El lunes",
        "explanation": "El lunes (без en!)."
      },
      {
        "id": "chk-u06-02",
        "topicId": 22,
        "type": "gap",
        "question": "Mi cumpleaños es ____ (в) agosto.",
        "correctAnswer": "en",
        "acceptableAnswers": [
          "en",
          "En"
        ],
        "explanation": "en agosto."
      },
      {
        "id": "chk-u06-03",
        "topicId": 28,
        "type": "choice",
        "question": "¿Qué hora es: 1:00?",
        "options": [
          "Es la una en punto.",
          "Son la una en punto.",
          "Son las una en punto.",
          "Es las una."
        ],
        "correctAnswer": "Es la una en punto.",
        "explanation": "Es la una (1:00 — ед. ч.)."
      },
      {
        "id": "chk-u06-04",
        "topicId": 28,
        "type": "gap",
        "question": "La clase empieza ____ (в) las cuatro y media.",
        "correctAnswer": "a",
        "acceptableAnswers": [
          "a",
          "A"
        ],
        "explanation": "a las cuatro y media."
      },
      {
        "id": "chk-u06-05",
        "topicId": 14,
        "type": "choice",
        "question": "¿Cómo se escribe 500?",
        "options": [
          "quinientos",
          "cincocientos",
          "cinco cientos",
          "quincientos"
        ],
        "correctAnswer": "quinientos",
        "explanation": "quinientos (500)."
      },
      {
        "id": "chk-u06-06",
        "topicId": 14,
        "type": "gap",
        "question": "El billete cuesta ____ (100) euros en punto.",
        "correctAnswer": "cien",
        "acceptableAnswers": [
          "cien",
          "Cien"
        ],
        "explanation": "cien euros."
      },
      {
        "id": "chk-u06-07",
        "topicId": 2,
        "type": "choice",
        "question": "Forma de «estudiar» para «nosotros»:",
        "options": [
          "estudiamos",
          "estudian",
          "estudias",
          "estudio"
        ],
        "correctAnswer": "estudiamos",
        "explanation": "estudiamos."
      },
      {
        "id": "chk-u06-08",
        "topicId": 17,
        "type": "gap",
        "question": "Yo ____ (не) hablo alemán.",
        "correctAnswer": "no",
        "acceptableAnswers": [
          "no",
          "No"
        ],
        "explanation": "no hablo."
      },
      {
        "id": "chk-u06-09",
        "topicId": 11,
        "type": "choice",
        "question": "¿Qué significa «Tengo mucha sed»?",
        "options": [
          "Я хочу пить",
          "Я хочу спать",
          "Мне жарко",
          "Я спешу"
        ],
        "correctAnswer": "Я хочу пить",
        "explanation": "tener sed = хотеть пить."
      },
      {
        "id": "chk-u06-10",
        "topicId": 8,
        "type": "choice",
        "question": "Plural de «mi hermano»:",
        "options": [
          "mis hermanos",
          "mi hermanos",
          "míos hermanos",
          "los mis hermanos"
        ],
        "correctAnswer": "mis hermanos",
        "explanation": "mis hermanos."
      },
      {
        "id": "chk-u06-11",
        "topicId": 13,
        "type": "gap",
        "question": "Las chicas son muy ____ (симпатичный, мн. ч.).",
        "correctAnswer": "simpáticas",
        "acceptableAnswers": [
          "simpáticas",
          "simpaticas"
        ],
        "explanation": "simpáticas."
      },
      {
        "id": "chk-u06-12",
        "topicId": 4,
        "type": "choice",
        "question": "Contracción de «de + el»:",
        "options": [
          "del",
          "de el",
          "al",
          "dela"
        ],
        "correctAnswer": "del",
        "explanation": "del."
      },
      {
        "id": "chk-u06-13",
        "topicId": 28,
        "type": "scenario",
        "question": "En la estación de tren preguntas la hora de salida a Madrid:",
        "options": [
          "Disculpe, ¿a qué hora sale el tren a Madrid?",
          "Disculpe, ¿qué hora es el tren a Madrid?",
          "Disculpe, ¿cuándo hora es el tren?",
          "Disculpe, ¿cuánto cuesta la hora?"
        ],
        "correctAnswer": "Disculpe, ¿a qué hora sale el tren a Madrid?",
        "explanation": "¿A qué hora sale...?"
      },
      {
        "id": "chk-u06-14",
        "topicId": 14,
        "type": "choice",
        "question": "¿Cuánto es «doscientos cincuenta + ciento cincuenta» (250 + 150)?",
        "options": [
          "cuatrocientos",
          "trescientos cincuenta",
          "quinientos",
          "trescientos"
        ],
        "correctAnswer": "cuatrocientos",
        "explanation": "250 + 150 = 400 (cuatrocientos)."
      },
      {
        "id": "chk-u06-15",
        "topicId": 22,
        "type": "input",
        "question": "Escribe en español «По воскресеньям я не работаю»:",
        "correctAnswer": "Los domingos no trabajo",
        "acceptableAnswers": [
          "Los domingos no trabajo",
          "los domingos no trabajo"
        ],
        "explanation": "Los domingos no trabajo."
      },
      {
        "id": "chk-u06-16",
        "topicId": 28,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Escribe tu horario de un día típico indicando 4 actividades con horas exactas (mínimo 20 palabras).",
        "minWords": 20,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Uso de horas y preposición A",
              "max": 40
            },
            {
              "name": "Verbos de rutina",
              "max": 35
            },
            {
              "name": "Coherencia",
              "max": 25
            }
          ]
        }
      }
    ]
  },
  "a1-u07-food": {
    "id": "checkpoint-u07",
    "unitId": "a1-u07-food",
    "unitOrder": 7,
    "title": "Контрольная точка: Модуль 7 — Еда и кафе",
    "description": "Проверка глаголов -ER/-IR, еды и напитков, заказа в ресторане + повторение Модулей 1-6.",
    "tasksCount": 16,
    "tasks": [
      {
        "id": "chk-u07-01",
        "topicId": 3,
        "type": "choice",
        "question": "Forma de «comer» para «nosotros»:",
        "options": [
          "comemos",
          "comimos",
          "comamos",
          "comen"
        ],
        "correctAnswer": "comemos",
        "explanation": "comemos (-er)."
      },
      {
        "id": "chk-u07-02",
        "topicId": 3,
        "type": "gap",
        "question": "Nosotros ____ (жить - vivir) en Madrid.",
        "correctAnswer": "vivimos",
        "acceptableAnswers": [
          "vivimos",
          "Vivimos"
        ],
        "explanation": "vivimos (-ir)."
      },
      {
        "id": "chk-u07-03",
        "topicId": 23,
        "type": "choice",
        "question": "¿En qué se sirve el vino en un restaurante?",
        "options": [
          "en una copa",
          "en un vaso",
          "en una taza",
          "en un plato"
        ],
        "correctAnswer": "en una copa",
        "explanation": "una copa de vino."
      },
      {
        "id": "chk-u07-04",
        "topicId": 23,
        "type": "choice",
        "question": "¿Qué concordancia es correcta con «agua»?",
        "options": [
          "el agua fría",
          "el agua frío",
          "la agua fría",
          "la agua frío"
        ],
        "correctAnswer": "el agua fría",
        "explanation": "el agua fría (жен. род)."
      },
      {
        "id": "chk-u07-05",
        "topicId": 29,
        "type": "choice",
        "question": "¿Cómo se pide la cuenta al camarero?",
        "options": [
          "La cuenta, por favor.",
          "El dinero, por favor.",
          "El precio, por favor.",
          "La factura ahora."
        ],
        "correctAnswer": "La cuenta, por favor.",
        "explanation": "La cuenta, por favor."
      },
      {
        "id": "chk-u07-06",
        "topicId": 29,
        "type": "gap",
        "question": "¿Se puede pagar ____ (картой) tarjeta?",
        "correctAnswer": "con",
        "acceptableAnswers": [
          "con",
          "Con"
        ],
        "explanation": "con tarjeta."
      },
      {
        "id": "chk-u07-07",
        "topicId": 28,
        "type": "choice",
        "question": "¿Qué hora es: 3:30?",
        "options": [
          "Son las tres y media.",
          "Son las tres y mitad.",
          "Es las tres y media.",
          "Son los tres y media."
        ],
        "correctAnswer": "Son las tres y media.",
        "explanation": "Son las tres y media."
      },
      {
        "id": "chk-u07-08",
        "topicId": 22,
        "type": "choice",
        "question": "¿Cómo se dice «по субботам»?",
        "options": [
          "Los sábados",
          "El sábado",
          "En sábados",
          "Por sábados"
        ],
        "correctAnswer": "Los sábados",
        "explanation": "Los sábados."
      },
      {
        "id": "chk-u07-09",
        "topicId": 2,
        "type": "gap",
        "question": "Yo ____ (готовить - cocinar) una paella deliciosa.",
        "correctAnswer": "cocino",
        "acceptableAnswers": [
          "cocino",
          "Cocino"
        ],
        "explanation": "yo cocino."
      },
      {
        "id": "chk-u07-10",
        "topicId": 14,
        "type": "choice",
        "question": "¿Cómo se dice 700?",
        "options": [
          "setecientos",
          "sietecientos",
          "sete cientos",
          "siete cien"
        ],
        "correctAnswer": "setecientos",
        "explanation": "setecientos."
      },
      {
        "id": "chk-u07-11",
        "topicId": 17,
        "type": "gap",
        "question": "No quiero comer ____ (ничего) ahora.",
        "correctAnswer": "nada",
        "acceptableAnswers": [
          "nada",
          "Nada"
        ],
        "explanation": "nada."
      },
      {
        "id": "chk-u07-12",
        "topicId": 11,
        "type": "choice",
        "question": "¿Cómo se dice «У меня много дел и я спешу»?",
        "options": [
          "Tengo prisa.",
          "Soy prisa.",
          "Estoy prisa.",
          "Hago prisa."
        ],
        "correctAnswer": "Tengo prisa.",
        "explanation": "tengo prisa."
      },
      {
        "id": "chk-u07-13",
        "topicId": 29,
        "type": "scenario",
        "question": "En un mesón español pides el menú completo:",
        "options": [
          "De primero la sopa, de segundo el pescado y para beber agua sin gas.",
          "De primero tenedor, de segundo plato y de beber sal.",
          "En primero la sopa y son las dos.",
          "Quiero toda comida gratis."
        ],
        "correctAnswer": "De primero la sopa, de segundo el pescado y para beber agua sin gas.",
        "explanation": "De primero... de segundo... para beber..."
      },
      {
        "id": "chk-u07-14",
        "topicId": 23,
        "type": "choice",
        "question": "¿Cómo pides un café sin azúcar?",
        "options": [
          "Un café solo sin azúcar, por favor.",
          "Un café con azúcar mucho.",
          "Un café de azúcar no.",
          "Un café salado."
        ],
        "correctAnswer": "Un café solo sin azúcar, por favor.",
        "explanation": "sin azúcar."
      },
      {
        "id": "chk-u07-15",
        "topicId": 3,
        "type": "input",
        "question": "Escribe en español «Nosotros comemos pescado y bebemos vino»:",
        "correctAnswer": "Comemos pescado y bebemos vino",
        "acceptableAnswers": [
          "Comemos pescado y bebemos vino",
          "Nosotros comemos pescado y bebemos vino",
          "comemos pescado y bebemos vino"
        ],
        "explanation": "Comemos pescado y bebemos vino."
      },
      {
        "id": "chk-u07-16",
        "topicId": 29,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Escribe un diálogo pidiendo mesa, menú del día, bebida y pidiendo la cuenta con tarjeta (mínimo 25 palabras).",
        "minWords": 25,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Fórmulas de restaurante",
              "max": 40
            },
            {
              "name": "Vocabulario de platos",
              "max": 30
            },
            {
              "name": "Gramática y cortesía",
              "max": 30
            }
          ]
        }
      }
    ]
  },
  "a1-u08-home": {
    "id": "checkpoint-u08",
    "unitId": "a1-u08-home",
    "unitOrder": 8,
    "title": "Контрольная точка: Модуль 8 — Дом и пространство",
    "description": "Проверка HAY vs ESTAR, предлогов места, мебели и указательных местоимений + повторение Модулей 1-7.",
    "tasksCount": 16,
    "tasks": [
      {
        "id": "chk-u08-01",
        "topicId": 10,
        "type": "choice",
        "question": "¿Qué palabra expresa existencia/presencia general?",
        "options": [
          "HAY",
          "ESTAR",
          "SER",
          "TENER"
        ],
        "correctAnswer": "HAY",
        "explanation": "HAY = имеется/есть."
      },
      {
        "id": "chk-u08-02",
        "topicId": 10,
        "type": "choice",
        "question": "¿Qué palabra NO se puede usar después de HAY?",
        "options": [
          "el libro",
          "un libro",
          "tres libros",
          "muchos libros"
        ],
        "correctAnswer": "el libro",
        "explanation": "После hay определенный артикль запрещен."
      },
      {
        "id": "chk-u08-03",
        "topicId": 15,
        "type": "gap",
        "question": "El gato duerme debajo ____ (de + el) sofá.",
        "correctAnswer": "del",
        "acceptableAnswers": [
          "del",
          "Del"
        ],
        "explanation": "debajo del sofá (de + el = del)."
      },
      {
        "id": "chk-u08-04",
        "topicId": 26,
        "type": "choice",
        "question": "Género de «sofá»:",
        "options": [
          "el sofá",
          "la sofá",
          "las sofá",
          "una sofá"
        ],
        "correctAnswer": "el sofá",
        "explanation": "el sofá (муж. род)."
      },
      {
        "id": "chk-u08-05",
        "topicId": 9,
        "type": "choice",
        "question": "¿Cómo se dice «эта книга» (en la mano)?",
        "options": [
          "este libro",
          "esto libro",
          "esta libro",
          "aquel libro"
        ],
        "correctAnswer": "este libro",
        "explanation": "este libro (муж. род)."
      },
      {
        "id": "chk-u08-06",
        "topicId": 9,
        "type": "choice",
        "question": "Plural masculino de «este»:",
        "options": [
          "estos",
          "estes",
          "estas",
          "estosos"
        ],
        "correctAnswer": "estos",
        "explanation": "estos libros (не estes!)."
      },
      {
        "id": "chk-u08-07",
        "topicId": 3,
        "type": "gap",
        "question": "Carlos ____ (жить - vivir) en el tercer piso.",
        "correctAnswer": "vive",
        "acceptableAnswers": [
          "vive",
          "Vive"
        ],
        "explanation": "vive."
      },
      {
        "id": "chk-u08-08",
        "topicId": 23,
        "type": "choice",
        "question": "¿Cómo se llama el desayuno tradicional de pan?",
        "options": [
          "la tostada con aceite",
          "el vino tinto",
          "la paella dulce",
          "el helado de carne"
        ],
        "correctAnswer": "la tostada con aceite",
        "explanation": "la tostada con aceite."
      },
      {
        "id": "chk-u08-09",
        "topicId": 28,
        "type": "choice",
        "question": "¿Qué hora es: 5:45?",
        "options": [
          "Son las seis menos cuarto.",
          "Son las cinco y cuarto.",
          "Son las cinco menos cuarto.",
          "Son las seis y media."
        ],
        "correctAnswer": "Son las seis menos cuarto.",
        "explanation": "Son las seis menos cuarto."
      },
      {
        "id": "chk-u08-10",
        "topicId": 2,
        "type": "gap",
        "question": "Nosotros ____ (учить - estudiar) en la biblioteca.",
        "correctAnswer": "estudiamos",
        "acceptableAnswers": [
          "estudiamos",
          "Estudiamos"
        ],
        "explanation": "estudiamos."
      },
      {
        "id": "chk-u08-11",
        "topicId": 11,
        "type": "choice",
        "question": "¿Cómo se dice «У меня есть 2 брата»?",
        "options": [
          "Tengo dos hermanos.",
          "Soy dos hermanos.",
          "Estoy dos hermanos.",
          "Hay dos hermanos."
        ],
        "correctAnswer": "Tengo dos hermanos.",
        "explanation": "Tengo dos hermanos."
      },
      {
        "id": "chk-u08-12",
        "topicId": 13,
        "type": "transformation",
        "question": "Plural de «la ciudad grande»:",
        "prompt": "la ciudad grande → las ciudades ____",
        "correctAnswer": "grandes",
        "acceptableAnswers": [
          "grandes",
          "Grandes"
        ],
        "explanation": "grandes."
      },
      {
        "id": "chk-u08-13",
        "topicId": 10,
        "type": "scenario",
        "question": "En la calle preguntas por un supermercado y la parada de metro:",
        "options": [
          "Disculpe, ¿hay un supermercado cerca y dónde está el metro?",
          "Disculpe, ¿dónde hay el supermercado y qué está el metro?",
          "Disculpe, ¿está un supermercado y hay el metro?",
          "Disculpe, ¿son un supermercado?"
        ],
        "correctAnswer": "Disculpe, ¿hay un supermercado cerca y dónde está el metro?",
        "explanation": "¿Hay un... (наличие) y dónde está el... (местоположение конкретного)?"
      },
      {
        "id": "chk-u08-14",
        "topicId": 15,
        "type": "choice",
        "question": "¿Dónde está el cine si está entre el banco y el café?",
        "options": [
          "En medio de los dos",
          "Debajo del banco",
          "Encima del café",
          "Detrás de la ciudad"
        ],
        "correctAnswer": "En medio de los dos",
        "explanation": "entre = между двумя объектами."
      },
      {
        "id": "chk-u08-15",
        "topicId": 26,
        "type": "input",
        "question": "Escribe en español «В гостиной есть большой серый диван»:",
        "correctAnswer": "En el salón hay un sofá gris grande",
        "acceptableAnswers": [
          "En el salón hay un sofá gris grande",
          "En el salón hay un sofá grande gris",
          "En el salon hay un sofa gris grande"
        ],
        "explanation": "En el salón hay un sofá gris grande."
      },
      {
        "id": "chk-u08-16",
        "topicId": 26,
        "type": "productive_speaking",
        "skill": "speaking",
        "prompt": "Graba un audio describiendo tu casa, habitaciones y la ubicación de 3 muebles con preposiciones (mínimo 25 segundos).",
        "durationRange": "25-45s",
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Uso de HAY y ESTAR",
              "max": 40
            },
            {
              "name": "Preposiciones de lugar (del/al)",
              "max": 30
            },
            {
              "name": "Vocabulario de casa",
              "max": 20
            },
            {
              "name": "Fluidez",
              "max": 10
            }
          ]
        }
      }
    ]
  },
  "a1-u09-needs": {
    "id": "checkpoint-u09",
    "unitId": "a1-u09-needs",
    "unitOrder": 9,
    "title": "Контрольная точка: Модуль 9 — Планы, вкусы и одежда",
    "description": "Проверка глаголов ir/hacer/decir, конструкции будущего (ir a + inf.), глагола GUSTAR, одежды и финальное повторение курса A1.",
    "tasksCount": 18,
    "tasks": [
      {
        "id": "chk-u09-01",
        "topicId": 16,
        "type": "choice",
        "question": "Forma de «ir» para «yo»:",
        "options": [
          "voy",
          "vas",
          "va",
          "vamos"
        ],
        "correctAnswer": "voy",
        "explanation": "yo voy."
      },
      {
        "id": "chk-u09-02",
        "topicId": 16,
        "type": "gap",
        "question": "Mañana nosotros ____ (ir a + cenar) a cenar en la pizzería.",
        "correctAnswer": "vamos",
        "acceptableAnswers": [
          "vamos",
          "Vamos"
        ],
        "explanation": "vamos a cenar."
      },
      {
        "id": "chk-u09-03",
        "topicId": 16,
        "type": "choice",
        "question": "Forma de 1ª persona de «hacer» y «decir»:",
        "options": [
          "hago y digo",
          "haco y dico",
          "hace y dice",
          "haces y dices"
        ],
        "correctAnswer": "hago y digo",
        "explanation": "hago y digo (1ª persona)."
      },
      {
        "id": "chk-u09-04",
        "topicId": 12,
        "type": "choice",
        "question": "Forma correcta con «los libros»:",
        "options": [
          "Me gustan los libros.",
          "Me gusta los libros.",
          "Yo gusto los libros.",
          "Me gusto los libros."
        ],
        "correctAnswer": "Me gustan los libros.",
        "explanation": "Me gustan los libros (мн. число)."
      },
      {
        "id": "chk-u09-05",
        "topicId": 12,
        "type": "gap",
        "question": "A mi hermana le ____ (обожать, ед. ч.) la música latina.",
        "correctAnswer": "encanta",
        "acceptableAnswers": [
          "encanta",
          "Encanta"
        ],
        "explanation": "le encanta la música."
      },
      {
        "id": "chk-u09-06",
        "topicId": 24,
        "type": "choice",
        "question": "¿Cómo se dice «Эта куртка мне как раз / сидит хорошо»?",
        "options": [
          "Esta chaqueta me queda bien.",
          "Esta chaqueta me es bien.",
          "Esta chaqueta tiene bien.",
          "Esta chaqueta está bien talla."
        ],
        "correctAnswer": "Esta chaqueta me queda bien.",
        "explanation": "quedar bien."
      },
      {
        "id": "chk-u09-07",
        "topicId": 24,
        "type": "gap",
        "question": "En invierno llevo un ____ (пальто) y guantes de cuero.",
        "correctAnswer": "abrigo",
        "acceptableAnswers": [
          "abrigo",
          "Abrigo"
        ],
        "explanation": "el abrigo."
      },
      {
        "id": "chk-u09-08",
        "topicId": 10,
        "type": "choice",
        "question": "¿Qué palabra expresa presencia general?",
        "options": [
          "HAY",
          "ESTAR",
          "SER",
          "TENER"
        ],
        "correctAnswer": "HAY",
        "explanation": "HAY."
      },
      {
        "id": "chk-u09-09",
        "topicId": 15,
        "type": "gap",
        "question": "El hotel está enfrente ____ (de + el) parque.",
        "correctAnswer": "del",
        "acceptableAnswers": [
          "del",
          "Del"
        ],
        "explanation": "enfrente del parque."
      },
      {
        "id": "chk-u09-10",
        "topicId": 3,
        "type": "choice",
        "question": "Forma de «vivir» para «nosotros»:",
        "options": [
          "vivimos",
          "vivemos",
          "viven",
          "vivís"
        ],
        "correctAnswer": "vivimos",
        "explanation": "vivimos (-ir)."
      },
      {
        "id": "chk-u09-11",
        "topicId": 28,
        "type": "choice",
        "question": "¿Qué hora es: 1:15?",
        "options": [
          "Es la una y cuarto.",
          "Son la una y cuarto.",
          "Son las una y quince.",
          "Es las una y cuarto."
        ],
        "correctAnswer": "Es la una y cuarto.",
        "explanation": "Es la una y cuarto."
      },
      {
        "id": "chk-u09-12",
        "topicId": 22,
        "type": "choice",
        "question": "¿Cómo se dice «по пятницам»?",
        "options": [
          "Los viernes",
          "El viernes",
          "En viernes",
          "Por viernes"
        ],
        "correctAnswer": "Los viernes",
        "explanation": "Los viernes."
      },
      {
        "id": "chk-u09-13",
        "topicId": 17,
        "type": "gap",
        "question": "Carlos ____ (не) come carne.",
        "correctAnswer": "no",
        "acceptableAnswers": [
          "no",
          "No"
        ],
        "explanation": "no come."
      },
      {
        "id": "chk-u09-14",
        "topicId": 1,
        "type": "choice",
        "question": "¿SER o ESTAR: «Yo ____ de Argentina pero ahora ____ en Madrid»?",
        "options": [
          "soy / estoy",
          "estoy / soy",
          "soy / soy",
          "estoy / estoy"
        ],
        "correctAnswer": "soy / estoy",
        "explanation": "soy de (происхождение) + estoy en (место)."
      },
      {
        "id": "chk-u09-15",
        "topicId": 16,
        "type": "scenario",
        "question": "Un amigo te pregunta por tus planes de sábado. Respóndele que vas a ir de compras con tu hermana:",
        "options": [
          "El sábado voy a ir de compras con mi hermana al centro.",
          "El sábado hago de compras con mi hermana.",
          "En sábado voy comprar de compras.",
          "El sábado soy a ir de compras."
        ],
        "correctAnswer": "El sábado voy a ir de compras con mi hermana al centro.",
        "explanation": "El sábado + voy a ir de compras (ir a + inf.) + con mi hermana."
      },
      {
        "id": "chk-u09-16",
        "topicId": 24,
        "type": "choice",
        "question": "En una tienda de ropa pides la talla M y preguntas por los probadores:",
        "options": [
          "¿Tiene esta camisa en la talla M? ¿Dónde están los probadores?",
          "¿Tiene este camisa en número M? ¿Dónde es probador?",
          "¿Cuánto cuesta la talla M de probador?",
          "¿Es camisa talla M gratis?"
        ],
        "correctAnswer": "¿Tiene esta camisa en la talla M? ¿Dónde están los probadores?",
        "explanation": "la talla M + los probadores."
      },
      {
        "id": "chk-u09-17",
        "topicId": 12,
        "type": "input",
        "question": "Escribe en español «Мне очень нравится путешествовать на поезде»:",
        "correctAnswer": "Me gusta mucho viajar en tren",
        "acceptableAnswers": [
          "Me gusta mucho viajar en tren",
          "A mí me gusta mucho viajar en tren",
          "Me encanta viajar en tren"
        ],
        "explanation": "Me gusta mucho viajar en tren."
      },
      {
        "id": "chk-u09-18",
        "topicId": 16,
        "type": "productive_writing",
        "skill": "writing",
        "prompt": "Escribe un texto sobre tus gustos y tus planes para el próximo verano (ropa, destinos, actividades, mínimo 30 palabras).",
        "minWords": 30,
        "rubric": {
          "total": 100,
          "criteria": [
            {
              "name": "Uso de IR A + infinitivo",
              "max": 35
            },
            {
              "name": "Uso de GUSTAR / ENCANTAR",
              "max": 35
            },
            {
              "name": "Vocabulario de ropa y viaje",
              "max": 30
            }
          ]
        }
      }
    ]
  },
  "a1-final-graduation": {
    "id": "checkpoint-a1-final",
    "unitId": "a1-final-graduation",
    "unitOrder": 10,
    "title": "Финальный выпускной экзамен A1 (Evaluación Global de Nivel A1)",
    "description": "Комплексный экзамен на 45–60 минут по 4 речевым навыкам (Listening, Reading, Writing, Speaking) и 30 темам курса A1. Не отменяет системные требования (30 освоенных тем, 650 зрелых слов).",
    "tasksCount": 20,
    "sections": [
      {
        "skill": "listening",
        "title": "Блок 1: Аудирование (Comprensión Auditiva)",
        "durationMin": 12,
        "tasks": [
          {
            "id": "final-listen-01",
            "audioUrl": "/a1/media/audio/a1-u09-audio-01.mp3",
            "question": "¿Adónde viaja Diego el fin de semana según la grabación?",
            "options": [
              "A Granada",
              "A Sevilla",
              "A Valencia",
              "A Barcelona"
            ],
            "correctAnswer": "A Granada",
            "explanation": "En el audio: «el sábado viajo a Granada»."
          },
          {
            "id": "final-listen-02",
            "audioUrl": "/a1/media/audio/a1-u07-audio-01.mp3",
            "question": "¿Qué bebida pide la clienta en el café?",
            "options": [
              "Té con limón y agua mineral sin gas",
              "Café con leche caliente",
              "Vino tinto",
              "Zumo de naranja"
            ],
            "correctAnswer": "Té con limón y agua mineral sin gas",
            "explanation": "En el audio: «un té con limón y un vaso de agua mineral sin gas»."
          },
          {
            "id": "final-listen-03",
            "audioUrl": "/a1/media/audio/a1-u05-audio-01.mp3",
            "question": "¿A qué hora sale Laura de casa por la mañana?",
            "options": [
              "A las ocho en punto",
              "A las siete y media",
              "A las nueve",
              "A las diez"
            ],
            "correctAnswer": "A las ocho en punto",
            "explanation": "En el audio: «salgo de casa a las ocho en punto»."
          }
        ]
      },
      {
        "skill": "reading",
        "title": "Блок 2: Чтение (Comprensión de Lectura)",
        "durationMin": 15,
        "text": "Mateo es un joven argentino de veintidós años que estudia arquitectura en Madrid. Vive en un piso luminoso en el centro con su amigo Carlos. En su piso hay dos dormitorios, un salón acogedor con un sofá gris y una cocina moderna. De lunes a viernes, Mateo se levanta a las siete en punto de la mañana, desayuna café con leche y tostadas, y va a la universidad en metro. Los fines de semana le gusta cocinar paella, pasear por los parques de la ciudad y hablar con su familia por videollamada. El próximo mes de agosto va a viajar por Andalucía para visitar Sevilla y Granada.",
        "tasks": [
          {
            "id": "final-read-01",
            "question": "¿De dónde es Mateo y cuántos años tiene?",
            "options": [
              "Es de Argentina y tiene veintidós años",
              "Es de Madrid y tiene veinte años",
              "Es de México y tiene dieciocho años",
              "Es de Sevilla y tiene treinta años"
            ],
            "correctAnswer": "Es de Argentina y tiene veintidós años",
            "explanation": "В тексте: «argentino de veintidós años»."
          },
          {
            "id": "final-read-02",
            "question": "¿Cómo viaja Mateo a la universidad de lunes a viernes?",
            "options": [
              "En metro",
              "En coche",
              "En bicicleta",
              "En autobús"
            ],
            "correctAnswer": "En metro",
            "explanation": "В тексте: «va a la universidad en metro»."
          },
          {
            "id": "final-read-03",
            "question": "¿Qué planes tiene Mateo para el mes de agosto?",
            "options": [
              "Va a viajar por Andalucía para visitar Sevilla y Granada",
              "Va a regresar a Argentina",
              "Va a trabajar en un hospital",
              "Va a comprar un coche nuevo"
            ],
            "correctAnswer": "Va a viajar por Andalucía para visitar Sevilla y Granada",
            "explanation": "В тексте: «El próximo mes de agosto va a viajar por Andalucía...»."
          }
        ]
      },
      {
        "skill": "writing",
        "title": "Блок 3: Письмо (Expresión Escrita)",
        "durationMin": 15,
        "task": {
          "id": "final-write-01",
          "prompt": "Escribe un correo electrónico a un amigo español presentándote, describiendo tu rutina diaria, tus gustos y tus planes para el próximo verano (mínimo 50 palabras).",
          "minWords": 50,
          "rubric": {
            "total": 100,
            "criteria": [
              {
                "name": "Cumplimiento de la tarea (presentación, rutina, gustos, planes)",
                "max": 30
              },
              {
                "name": "Corrección gramatical (Presente, SER/ESTAR/TENER, IR A + inf., GUSTAR)",
                "max": 30
              },
              {
                "name": "Riqueza de vocabulario A1 (650 lemas)",
                "max": 25
              },
              {
                "name": "Coherencia y puntuación",
                "max": 15
              }
            ]
          }
        }
      },
      {
        "skill": "speaking",
        "title": "Блок 4: Говорение (Expresión Oral)",
        "durationMin": 10,
        "task": {
          "id": "final-speak-01",
          "prompt": "Graba un mensaje de voz de 45 a 60 segundos presentándote, describiendo a tu familia y tu casa, y contando qué vas a hacer este fin de semana.",
          "durationRange": "45-60s",
          "rubric": {
            "total": 100,
            "criteria": [
              {
                "name": "Comprensibilidad y fluidez general",
                "max": 40
              },
              {
                "name": "Gramática objetivo A1 (SER/ESTAR, TENER, IR A)",
                "max": 30
              },
              {
                "name": "Vocabulario específico",
                "max": 20
              },
              {
                "name": "Pronunciación y acento",
                "max": 10
              }
            ]
          }
        }
      }
    ]
  }
}
);

export function getA1CheckpointByUnit(unitId) {
  return A1_CHECKPOINTS[unitId] || null;
}

export function getAllA1Checkpoints() {
  return Object.values(A1_CHECKPOINTS);
}
