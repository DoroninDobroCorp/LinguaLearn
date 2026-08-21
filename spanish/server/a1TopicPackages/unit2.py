# -*- coding: utf-8 -*-
"""Unit 2: Предметы вокруг (Topics 4, 5, 20, 6)"""

unit2_topics = {
    # ----------------------------------------------------
    # TOPIC 4: Gender and articles (el/la/los/las)
    # ----------------------------------------------------
    4: {
        "id": 4,
        "topicName": "Gender and articles (el/la/los/las)",
        "russianTitle": "Род существительных и определенные артикли (el/la/los/las)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u02-things",
        "icon": "🏷️",
        "summary": "В испанском языке все существительные делятся на мужской (masculino) и женский (femenino) род. Определенные артикли (el, la, los, las) указывают на конкретный, уже известный предмет или понятие в общем смысле.",
        "mnemonicRule": "-O обычно мужской (EL), -A/-CIÓN/-SIÓN/-DAD обычно женский (LA). Ловушки: EL problema, EL día, LA mano, LA foto.",
        "goalsRu": [
            "Определять грамматический род существительных по их окончаниям",
            "Безошибочно использовать определенные артикли el, la, los, las",
            "Помнить ключевые исключения (el problema, el mapa, el día, la mano, la foto)",
            "Знать обязательные слияния предлогов: a + el = al, de + el = del"
        ],
        "sections": [
            {
                "title": "1. Формы определенного артикля",
                "content": "Артикль согласуется с существительным в роде и числе:",
                "tables": [
                    {
                        "headers": ["Род", "Единственное число", "Множественное число", "Примеры"],
                        "rows": [
                            ["Мужской", "el", "los", "el libro → los libros (книга/книги)"],
                            ["Женский", "la", "las", "la casa → las casas (дом/дома)"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Правила рода и типичные ловушки",
                "content": "Большинство слов на -o — мужского рода, на -a — женского. Слова греческого происхождения на -ma/-ta — мужского рода (el problema, el tema, el planeta, el mapa).",
                "tables": [
                    {
                        "headers": ["Окончание", "Род", "Примеры", "Исключения"],
                        "rows": [
                            ["-o", "Мужской", "el libro, el perro, el teléfono", "la mano, la foto, la moto, la radio"],
                            ["-a", "Женский", "la casa, la mesa, la silla", "el día, el mapa, el sofá, el problema"],
                            ["-ción / -sión", "Женский", "la lección, la estación, la profesión", "Без исключений"],
                            ["-dad / -tad", "Женский", "la ciudad, la universidad, la libertad", "Без исключений"],
                            ["-ma (греч.)", "Мужской", "el problema, el tema, el sistema, el idioma", "la cama (исконное слово)"]
                        ]
                    }
                ]
            },
            {
                "title": "3. Обязательные слияния (al / del)",
                "content": "Когда предлог «a» или «de» встречается с артиклем «el», они обязательно сливаются: a + el = AL, de + el = DEL. С другими артиклями (la, los, las) слияния нет (a la casa, de los amigos).",
                "tables": [
                    {
                        "headers": ["Формула", "Слияние", "Пример", "Перевод"],
                        "rows": [
                            ["a + el", "al", "Voy al parque.", "Я иду в парк."],
                            ["de + el", "del", "El libro del profesor.", "Книга преподавателя."],
                            ["a + la", "a la", "Voy a la tienda.", "Я иду в магазин."],
                            ["de + la", "de la", "La puerta de la casa.", "Дверь дома."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "El libro está sobre la mesa.", "ru": "Книга лежит на столе."},
            {"es": "La casa es muy grande y luminosa.", "ru": "Дом очень большой и светлый."},
            {"es": "Los estudiantes escuchan al profesor.", "ru": "Студенты слушают преподавателя."},
            {"es": "Las ciudades de España son históricas.", "ru": "Города Испании исторические."},
            {"es": "El problema es bastante difícil.", "ru": "Проблема довольно сложная."},
            {"es": "El mapa de la ciudad está en la mesa.", "ru": "Карта города лежит на столе."},
            {"es": "La mano derecha me duele.", "ru": "У меня болит правая рука."},
            {"es": "El agua fría es refrescante.", "ru": "Холодная вода освежает (el agua — жен. род)."},
            {"es": "Voy al cine con mis amigos.", "ru": "Я иду в кино с друзьями (a + el = al)."},
            {"es": "Es el coche del director.", "ru": "Это машина директора (de + el = del)."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«La problema» вместо «El problema»",
                "correction": "El problema / El tema / El idioma",
                "explanation": "Слова греческого происхождения на -ma мужского рода: el problema, el tema, el sistema."
            },
            {
                "mistake": "«El mano» вместо «La mano»",
                "correction": "La mano",
                "explanation": "Слово «mano» — женского рода (la mano), несмотря на окончание -o."
            },
            {
                "mistake": "«Voy a el parque» или «El libro de el chico» без слияния",
                "correction": "Voy al parque / El libro del chico",
                "explanation": "Слияния a + el = AL и de + el = DEL являются строго обязательными в испанском языке."
            }
        ],
        "trapAlert": "Слова «el problema», «el día», «el mapa», «el idioma» — МУЖСКОГО рода, а «la mano», «la foto» — ЖЕНСКОГО!",
        "dialectNote": "Слова «la foto» и «la moto» — это сокращения от «la fotografía» и «la motocicleta», поэтому они сохраняют женский род во всех диалектах испанского мира.",
        "quiz": [
            {
                "question": "Какой артикль нужен перед словом «problema»?",
                "type": "recognition",
                "options": ["La", "El", "Las", "Una"],
                "correctIndex": 1,
                "explanations": [
                    "Ошибка: «problema» греческого происхождения на -ma и является существительным мужского рода.",
                    "Правильно: «El problema» (мужской род).",
                    "«Las» — множественное число женского рода.",
                    "«Una» — женский род."
                ]
            },
            {
                "question": "Какой артикль используется со словом «mano» (рука)?",
                "type": "recognition",
                "options": ["El", "La", "Los", "Un"],
                "correctIndex": 1,
                "explanations": [
                    "Ошибка: «mano» — исключение женского рода.",
                    "Правильно: «La mano» (женский род).",
                    "«Los» — мужской род во множественном числе.",
                    "«Un» — неопределенный артикль мужского рода."
                ]
            },
            {
                "question": "Какое слияние образуется от предлога «a» и артикля «el»?",
                "type": "recognition",
                "options": ["A el", "Al", "Del", "Ala"],
                "correctIndex": 1,
                "explanations": [
                    "«A el» — грубая ошибка, слияние обязательно.",
                    "Правильно: a + el = «al».",
                    "«Del» образуется от de + el.",
                    "«Ala» — ошибочное написание."
                ]
            },
            {
                "question": "Какой артикль ставится перед словом «ciudad» (город)?",
                "type": "recognition",
                "options": ["El", "La", "Los", "Al"],
                "correctIndex": 1,
                "explanations": [
                    "Слова на -dad всегда женского рода.",
                    "Правильно: «La ciudad» (женский род на -dad).",
                    "«Los» — множественное число мужского рода.",
                    "«Al» — слияние предлога a и артикля el."
                ]
            },
            {
                "question": "Выберите правильную форму: «El libro ____ profesor» (книга преподавателя):",
                "type": "application",
                "options": ["de el", "del", "de la", "al"],
                "correctIndex": 1,
                "explanations": [
                    "«De el» не пишется раздельно.",
                    "Правильно: de + el сливается в «del».",
                    "«De la» используется с существительными женского рода (la profesora).",
                    "«Al» означает направление (куда?)."
                ]
            },
            {
                "question": "Вставьте артикль: «____ día está muy soleado y despejado.»",
                "type": "application",
                "options": ["La", "El", "Las", "Una"],
                "correctIndex": 1,
                "explanations": [
                    "«La día» — грубая ошибка, «día» мужского рода.",
                    "Правильно: «El día» (слово «día» — мужского рода).",
                    "«Las» — множественное число женского рода.",
                    "«Una» — женский род."
                ]
            },
            {
                "question": "Вставьте правильную форму: «Mañana voy ____ cine con mis amigos.»",
                "type": "application",
                "options": ["a el", "al", "a la", "del"],
                "correctIndex": 1,
                "explanations": [
                    "Раздельное написание «a el» запрещено правилами испанского языка.",
                    "Правильно: a + el cine = «al cine».",
                    "Слово «cine» мужского рода, поэтому «a la» не подходит.",
                    "«Del» означает «из/от» (откуда?), а не «в» (куда?)."
                ]
            },
            {
                "question": "Выберите существительное, требующее артикля «la»:",
                "type": "application",
                "options": ["mapa", "idioma", "estación", "sistema"],
                "correctIndex": 2,
                "explanations": [
                    "«El mapa» — мужской род.",
                    "«El idioma» — мужской род.",
                    "Правильно: слова на -ción всегда женского рода — «la estación».",
                    "«El sistema» — мужской род (греческое на -ma)."
                ]
            },
            {
                "question": "Вам нужно сказать «Я возвращаюсь из отеля». Выберите правильный вариант:",
                "type": "transfer",
                "options": ["Vuelvo de el hotel.", "Vuelvo del hotel.", "Vuelvo al hotel.", "Vuelvo de la hotel."],
                "correctIndex": 1,
                "explanations": [
                    "«De el» обязательно сливается в «del».",
                    "Правильно: «Vuelvo del hotel» (de + el = del).",
                    "«Al hotel» означает «в отель» (куда?), а не «из отеля».",
                    "Слово «hotel» мужского рода, «de la» неверно."
                ]
            },
            {
                "question": "Какое предложение написано абсолютно правильно с точки зрения рода и артиклей?",
                "type": "transfer",
                "options": [
                    "El idioma español tiene la gramática interesante.",
                    "La idioma español tiene el gramática interesante.",
                    "El idioma español tiene el gramática interesante.",
                    "La idioma española tiene la gramática interesante."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el idioma» (муж. род) и «la gramática» (жен. род).",
                    "«La idioma» — ошибка, idioma мужского рода.",
                    "«El gramática» — ошибка, gramática женского рода.",
                    "«La idioma» — ошибка."
                ]
            },
            {
                "question": "Вы смотрите на карту метро. Как правильно сказать «карта метро»?",
                "type": "transfer",
                "options": ["La mapa del metro", "El mapa del metro", "El mapa de el metro", "La mapa de la metro"],
                "correctIndex": 1,
                "explanations": [
                    "«Mapa» — слово мужского рода («el mapa»).",
                    "Правильно: «El mapa del metro» (el mapa + de + el = del).",
                    "«De el» не должно писаться раздельно.",
                    "«La mapa» — ошибка."
                ]
            },
            {
                "question": "Преподаватель просит показать домашнюю фотографию. Как сказать «Вот фотография»?",
                "type": "transfer",
                "options": ["Aquí está el foto.", "Aquí está la foto.", "Aquí está los foto.", "Aquí está al foto."],
                "correctIndex": 1,
                "explanations": [
                    "«Foto» — сокращение от «fotografía», поэтому женского рода.",
                    "Правильно: «Aquí está la foto».",
                    "«Los» — множественное число мужского рода.",
                    "«Al» — слияние предлога."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-4-01",
                "type": "choice",
                "question": "Какой артикль нужен для слова «profesora»?",
                "options": ["la", "el", "los", "las"],
                "correctAnswer": "la",
                "explanation": "Profesora — женский род ед. число: «la profesora»."
            },
            {
                "id": "ex-4-02",
                "type": "gap",
                "question": "____ (артикль) problema es fácil de resolver.",
                "correctAnswer": "El",
                "acceptableAnswers": ["El", "el"],
                "explanation": "«El problema» (мужской род)."
            },
            {
                "id": "ex-4-03",
                "type": "tiles",
                "question": "Соберите фразу: «Книга преподавателя лежит на столе.»",
                "tiles": ["El", "libro", "del", "profesor", "está", "en", "la", "mesa."],
                "correctAnswer": "El libro del profesor está en la mesa.",
                "explanation": "El libro del profesor está en la mesa."
            },
            {
                "id": "ex-4-04",
                "type": "transformation",
                "question": "Объедините предлог и артикль: «Voy a + el parque» → «Voy ____ parque»",
                "prompt": "a + el → ____",
                "correctAnswer": "al",
                "acceptableAnswers": ["al", "Al"],
                "explanation": "a + el = al."
            },
            {
                "id": "ex-4-05",
                "type": "input",
                "question": "Напишите определенный артикль женского рода единственного числа:",
                "correctAnswer": "la",
                "acceptableAnswers": ["la", "La"],
                "explanation": "«la» — артикль женского рода ед. числа."
            },
            {
                "id": "ex-4-06",
                "type": "gap",
                "question": "Cierro ____ (дверь, la/el) puerta de la habitación.",
                "correctAnswer": "la",
                "acceptableAnswers": ["la", "La"],
                "explanation": "Puerta — женский род: «la puerta»."
            },
            {
                "id": "ex-4-07",
                "type": "choice",
                "question": "Какое слово требует артикля «el»?",
                "options": ["mapa", "ciudad", "mesa", "lección"],
                "correctAnswer": "mapa",
                "explanation": "«El mapa» — исключение мужского рода."
            },
            {
                "id": "ex-4-08",
                "type": "input",
                "question": "Напишите слияние предлога de и артикля el (de + el):",
                "correctAnswer": "del",
                "acceptableAnswers": ["del", "Del"],
                "explanation": "de + el = del."
            },
            {
                "id": "ex-4-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el libro» → «____»",
                "prompt": "el libro → ____",
                "correctAnswer": "los libros",
                "acceptableAnswers": ["los libros", "Los libros"],
                "explanation": "el libro → los libros."
            },
            {
                "id": "ex-4-10",
                "type": "tiles",
                "question": "Соберите предложение: «Карта города находится здесь.»",
                "tiles": ["El", "mapa", "de", "la", "ciudad", "está", "aquí."],
                "correctAnswer": "El mapa de la ciudad está aquí.",
                "explanation": "El mapa de la ciudad está aquí."
            },
            {
                "id": "ex-4-11",
                "type": "gap",
                "question": "Lavarse ____ (руки - las/los) manos antes de comer.",
                "correctAnswer": "las",
                "acceptableAnswers": ["las", "Las"],
                "explanation": "Mano — женский род: «las manos»."
            },
            {
                "id": "ex-4-12",
                "type": "choice",
                "question": "Какой артикль используется для «estudiantes» (девушки)?",
                "options": ["las", "los", "la", "el"],
                "correctAnswer": "las",
                "explanation": "Группа студенток: «las estudiantes»."
            },
            {
                "id": "ex-4-13",
                "type": "input",
                "question": "Напишите артикль для слова «tema» (тема):",
                "correctAnswer": "el",
                "acceptableAnswers": ["el", "El"],
                "explanation": "«El tema» — мужской род."
            },
            {
                "id": "ex-4-14",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la casa» → «____»",
                "prompt": "la casa → ____",
                "correctAnswer": "las casas",
                "acceptableAnswers": ["las casas", "Las casas"],
                "explanation": "la casa → las casas."
            },
            {
                "id": "ex-4-15",
                "type": "tiles",
                "question": "Соберите фразу: «Мы идём в супермаркет.»",
                "tiles": ["Vamos", "al", "supermercado", "ahora."],
                "correctAnswer": "Vamos al supermercado ahora.",
                "explanation": "Vamos al supermercado ahora (a + el = al)."
            },
            {
                "id": "ex-4-16",
                "type": "gap",
                "question": "____ (университет) universidad es muy prestigiosa.",
                "correctAnswer": "La",
                "acceptableAnswers": ["La", "la"],
                "explanation": "Слова на -dad женского рода: «La universidad»."
            },
            {
                "id": "ex-4-17",
                "type": "choice",
                "question": "Выберите правильное слияние в предложении «El coche ____ médico está allí»:",
                "options": ["del", "de el", "de la", "al"],
                "correctAnswer": "del",
                "explanation": "de + el médico = del médico."
            },
            {
                "id": "ex-4-18",
                "type": "input",
                "question": "Напишите форму мужского рода множественного числа определенного артикля:",
                "correctAnswer": "los",
                "acceptableAnswers": ["los", "Los"],
                "explanation": "«los» — мужской род во мн. числе."
            },
            {
                "id": "ex-4-19",
                "type": "gap",
                "question": "____ (день - el/la) de hoy es perfecto para pasear.",
                "correctAnswer": "El",
                "acceptableAnswers": ["El", "el"],
                "explanation": "«El día» (мужской род)."
            },
            {
                "id": "ex-4-20",
                "type": "tiles",
                "question": "Соберите предложение: «Студенты слушают преподавателя.»",
                "tiles": ["Los", "estudiantes", "escuchan", "al", "profesor."],
                "correctAnswer": "Los estudiantes escuchan al profesor.",
                "explanation": "Los estudiantes escuchan al profesor (a + el = al)."
            },
            {
                "id": "ex-4-21",
                "type": "choice",
                "question": "Какой артикль ставится перед словом «foto»?",
                "options": ["la", "el", "los", "las"],
                "correctAnswer": "la",
                "explanation": "«La foto» (сокращение от la fotografía)."
            },
            {
                "id": "ex-4-22",
                "type": "transformation",
                "question": "Замените «a el médico» на грамматически корректную форму:",
                "prompt": "a el médico → ____",
                "correctAnswer": "al médico",
                "acceptableAnswers": ["al médico", "al medico", "Al médico"],
                "explanation": "Обязательное слияние: al médico."
            },
            {
                "id": "ex-4-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какая фраза правильно объединяет приветствие и существительное с артиклем?",
                "options": [
                    "¡Buenos días! ¿Dónde está el mapa de la ciudad?",
                    "¡Buenos días! ¿Dónde está la mapa del ciudad?",
                    "¡Buenas tardes! ¿Dónde está el mapa de el ciudad?",
                    "¡Hasta luego! ¿Dónde está las mapa?"
                ],
                "correctAnswer": "¡Buenos días! ¿Dónde está el mapa de la ciudad?",
                "explanation": "«El mapa» (муж. род) и «de la ciudad» (жен. род)."
            },
            {
                "id": "ex-4-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Ключи от дома на столе» (используйте артикли):",
                "correctAnswer": "Las llaves de la casa están en la mesa",
                "acceptableAnswers": [
                    "Las llaves de la casa están en la mesa",
                    "Las llaves de la casa estan en la mesa",
                    "las llaves de la casa están en la mesa",
                    "Las llaves de la casa están sobre la mesa"
                ],
                "explanation": "Las llaves de la casa están en la mesa."
            }
        ],
        "miniScenario": {
            "title": "Ориентирование в библиотеке",
            "setting": "Главная библиотека университета.",
            "situation": "Вы ищете книгу и карту исторического центра. Спросите у библиотекаря правильные предметы.",
            "dialog": [
                {"speaker": "Tú", "text": "Disculpe, ¿dónde está el libro de historia?"},
                {"speaker": "Bibliotecario", "text": "El libro está en el estante tres. Y el mapa de la ciudad está sobre la mesa."},
                {"speaker": "Tú", "text": "Muchas gracias por la ayuda."},
                {"speaker": "Bibliotecario", "text": "De nada. Buen estudio."}
            ],
            "task": "Спросите у библиотекаря, где находится книга по истории.",
            "prompt": "Как корректно спросить: «Где находится книга по истории?»?",
            "options": [
                "¿Dónde está el libro de historia?",
                "¿Dónde está la libro de historia?",
                "¿Dónde está al libro de historia?",
                "¿Dónde está los libros de historia?"
            ],
            "correctIndex": 0,
            "explanation": "«El libro» — правильный мужской род единственного числа."
        },
        "shortText": {
            "title": "La habitación de Mateo",
            "text": "La habitación de Mateo es luminosa y ordenada. En el centro está la cama grande. Al lado de la cama está la mesa de noche con la lámpara. En la pared está el mapa del mundo y las fotos de sus viajes. Mateo guarda los libros en el armario grande. El ambiente de la casa es muy tranquilo y agradable.",
            "questions": [
                {
                    "question": "¿Qué hay en la pared de la habitación?",
                    "options": ["El televisor", "El mapa del mundo y las fotos", "El espejo", "La puerta"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «En la pared está el mapa del mundo y las fotos...»."
                },
                {
                    "question": "¿Dónde guarda Mateo los libros?",
                    "options": ["En la cama", "En el suelo", "En el armario grande", "En la cocina"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «Mateo guarda los libros en el armario grande»."
                },
                {
                    "question": "¿Qué artículo tiene la palabra «mapa» en el texto?",
                    "options": ["La", "El", "Las", "Una"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «el mapa del mundo» (мужской род)."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание предметов в вашей комнате",
            "prompt": "Напишите 4-5 предложений с описанием вашей комнаты и предметов в ней:\n1. Назовите комнату (la habitación / la casa).\n2. Перечислите 3 предмета мебели с определенными артиклями (la mesa, el armario, la cama...).\n3. Укажите, где лежит книга или карта (el libro, el mapa).\n4. Используйте слияние «del» или «al».",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Точность использования артиклей и рода", "points": 35, "description": "Безошибочный выбор el/la/los/las, включая исключения (el mapa, el día, la foto)."},
                    {"name": "Слияния al / del", "points": 25, "description": "Хотя бы одно правильное слияние a + el = al или de + el = del."},
                    {"name": "Выполнение коммуникативной задачи", "points": 25, "description": "Описана комната и расположение предметов."},
                    {"name": "Орфография и связность", "points": 15, "description": "Пунктуация, заглавные буквы, логика."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 5: Indefinite articles (un/una/unos/unas)
    # ----------------------------------------------------
    5: {
        "id": 5,
        "topicName": "Indefinite articles (un/una/unos/unas)",
        "russianTitle": "Неопределенные артикли (un/una/unos/unas)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u02-things",
        "icon": "📦",
        "summary": "Неопределенные артикли (un, una, unos, unas) используются, когда предмет упоминается впервые, является одним из многих в своем классе или выражает примерное количество («несколько / около»).",
        "mnemonicRule": "UN = муж. ед. (один), UNA = жен. ед. (одна), UNOS/UNAS = несколько / приблизительно.",
        "goalsRu": [
            "Использовать неопределенный артикль при первом упоминании предмета",
            "Различать un, una, unos, unas по родам и числам",
            "Выражать примерное количество во множественном числе («unos veinte euros» — около 20 евро)",
            "Знать, когда неопределенный артикль НЕ ставится (с немодифицированными профессиями после ser: «Soy médico»)"
        ],
        "sections": [
            {
                "title": "1. Формы неопределенного артикля",
                "content": "В отличие от английского 'a/an', в испанском неопределенный артикль имеет формы и единственного, и множественного числа:",
                "tables": [
                    {
                        "headers": ["Род", "Единственное число (один/одна)", "Множественное число (несколько / около)", "Примеры"],
                        "rows": [
                            ["Мужской", "un", "unos", "un libro (книга) → unos libros (несколько книг / около N книг)"],
                            ["Женский", "una", "unas", "una mesa (стол) → unas mesas (несколько столов)"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Когда артикль опускается (Профессии)",
                "content": "В испанском языке после глагола ser при названии профессии артикль НЕ ставится: «Soy profesor» (Я учитель). Но если у профессии есть определение, артикль возвращается: «Soy un profesor paciente» (Я терпеливый учитель).",
                "tables": [
                    {
                        "headers": ["Конструкция", "Пример", "Русский перевод"],
                        "rows": [
                            ["Ser + профессия (без артикля!)", "Carlos es médico.", "Карлос — врач."],
                            ["Ser + un/una + профессия + прил.", "Carlos es un médico excelente.", "Карлос — отличный врач."],
                            ["Hay + un/una + предмет", "Hay una farmacia cerca.", "Рядом есть аптека."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Compro un billete de tren.", "ru": "Я покупаю (один) билет на поезд."},
            {"es": "Necesito una habitación tranquila.", "ru": "Мне нужен тихий номер."},
            {"es": "Hay unos libros en la estantería.", "ru": "На полке лежит несколько книг."},
            {"es": "Tengo unas preguntas para el profesor.", "ru": "У меня есть несколько вопросов к преподавателю."},
            {"es": "Cuesta unos quince euros.", "ru": "Это стоит около пятнадцати евро."},
            {"es": "Soy estudiante de español.", "ru": "Я студент, изучающий испанский (без артикля!)."},
            {"es": "Ella es una profesora fantástica.", "ru": "Она — потрясающий преподаватель (с артиклем из-за прил.)."},
            {"es": "En la plaza hay una cafetería bonita.", "ru": "На площади есть красивое кафе."},
            {"es": "Tengo un hermano y dos hermanas.", "ru": "У меня один брат и две сестры."},
            {"es": "Llevo unos pantalones vaqueros.", "ru": "На мне джинсы (пара джинсов)."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Soy un médico» без уточняющего прилагательного",
                "correction": "Soy médico / Soy un médico excelente",
                "explanation": "После глагола ser при простом указании профессии артикль опускается."
            },
            {
                "mistake": "«Uno libro» вместо «un libro»",
                "correction": "un libro",
                "explanation": "Форма «uno» сокращается до «un» перед любым существительным мужского рода."
            },
            {
                "mistake": "«Hay el libro en la mesa» с конструкцией Hay",
                "correction": "Hay un libro en la mesa",
                "explanation": "С безличной формой «hay» (имеется/есть) используется неопределенный артикль, а не определенный."
            }
        ],
        "trapAlert": "После «HAY» (есть/имеется) используется ТОЛЬКО неопределенный артикль (un, una, unos, unas), никогда «el/la»!",
        "dialectNote": "Во всех испаноязычных странах «unos/unas» перед числительными выражает приблизительность: «Tiene unos 30 años» = Ему около 30 лет.",
        "quiz": [
            {
                "question": "Какой неопределенный артикль ставится перед словом «casa»?",
                "type": "recognition",
                "options": ["Un", "Una", "Unos", "Unas"],
                "correctIndex": 1,
                "explanations": [
                    "«Un» — мужской род.",
                    "Правильно: «Una casa» (женский род ед. число).",
                    "«Unos» — мужской род мн. число.",
                    "«Unas» — женский род мн. число."
                ]
            },
            {
                "question": "Какой артикль ставится перед «problema» при первом упоминании?",
                "type": "recognition",
                "options": ["Una", "Un", "Unas", "Unos"],
                "correctIndex": 1,
                "explanations": [
                    "Слово «problema» мужского рода.",
                    "Правильно: «Un problema» (мужской род).",
                    "«Unas» — женский род мн. число.",
                    "«Unos» — множественное число."
                ]
            },
            {
                "question": "Как сказать «Я — инженер» на естественном испанском языке?",
                "type": "recognition",
                "options": ["Soy un ingeniero.", "Soy ingeniero.", "Estoy ingeniero.", "Soy el ingeniero."],
                "correctIndex": 1,
                "explanations": [
                    "«Soy un ingeniero» — калька с английского/французского, артикль здесь лишний.",
                    "Правильно: «Soy ingeniero» — без артикля при назывании профессии.",
                    "Глагол estar не используется для постоянной профессии.",
                    "«Soy el ingeniero» значит «Я тот самый главный инженер»."
                ]
            },
            {
                "question": "Что означает «Unos diez euros»?",
                "type": "recognition",
                "options": ["Ровно 10 евро", "Около 10 евро / Примерно 10 евро", "Больше 100 евро", "Меньше 1 евро"],
                "correctIndex": 1,
                "explanations": [
                    "Ровно 10 евро — «Diez euros en punto / exactamente diez euros».",
                    "Правильно: «unos» перед числительными означает «около / приблизительно».",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте артикль в конструкцию с hay: «En la calle hay ____ farmacia.»",
                "type": "application",
                "options": ["la", "una", "el", "un"],
                "correctIndex": 1,
                "explanations": [
                    "С «hay» определенный артикль не ставится.",
                    "Правильно: «hay una farmacia» (аптека — женский род).",
                    "«El» — определенный артикль мужского рода.",
                    "«Un» — мужской род, а farmacia женского."
                ]
            },
            {
                "question": "Вставьте форму множественного числа: «Compro ____ manzanas en el mercado.»",
                "type": "application",
                "options": ["un", "una", "unos", "unas"],
                "correctIndex": 3,
                "explanations": [
                    "«Un» — ед. число мужского рода.",
                    "«Una» — ед. число женского рода.",
                    "«Unos» — мн. число мужского рода.",
                    "Правильно: «unas manzanas» (женский род мн. число)."
                ]
            },
            {
                "question": "Выберите предложение с правильным употреблением артикля:",
                "type": "application",
                "options": [
                    "Mi padre es un profesor excelente.",
                    "Mi padre es el profesor excelente.",
                    "Mi padre es profesor excelente.",
                    "Mi padre está un profesor."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: с прилагательным (excelente) артикль «un» обязателен!",
                    "«El» указывает на конкретного, а здесь дается качественная оценка.",
                    "Без артикля с прилагательным фраза звучит неполно.",
                    "Глагол estar не используется."
                ]
            },
            {
                "question": "Вставьте артикль: «Necesito ____ mapa de Madrid, por favor.»",
                "type": "application",
                "options": ["una", "un", "unas", "unos"],
                "correctIndex": 1,
                "explanations": [
                    "«Mapa» мужского рода, поэтому «una» ошибочно.",
                    "Правильно: «un mapa» (мужской род).",
                    "«Unas» — женский род мн. число.",
                    "«Unos» — множественное число."
                ]
            },
            {
                "question": "Вы заходите в кафе и хотите заказать какой-нибудь один круассан. Что сказать?",
                "type": "transfer",
                "options": ["Un cruasán, por favor.", "El cruasán, de nada.", "Uno cruasán, por favor.", "Unos cruasán, por favor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Un cruasán, por favor» (неопределенный артикль мужского рода).",
                    "«El» значит «тот самый конкретный», а «de nada» здесь неуместно.",
                    "«Uno» перед существительным усекается до «un».",
                    "«Unos» требует множественного числа (cruasanes)."
                ]
            },
            {
                "question": "Как сказать другу «У меня есть к тебе пара вопросов»?",
                "type": "transfer",
                "options": ["Tengo unas preguntas para ti.", "Tengo la pregunta para ti.", "Tengo unos preguntas para ti.", "Tengo el preguntas para ti."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Tengo unas preguntas para ti» (женский род во множественном числе).",
                    "«La pregunta» — один конкретный вопрос.",
                    "«Unos» — мужской род, а preguntas женского.",
                    "«El preguntas» — несогласованно."
                ]
            },
            {
                "question": "Вы описываете свой отель новому знакомому: «Это очень уютный отель». Как сказать?",
                "type": "transfer",
                "options": ["Es un hotel muy acogedor.", "Es el hotel muy acogedor.", "Es hotel muy acogedor.", "Está un hotel muy acogedor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Es un hotel muy acogedor» (один из отелей, качественная характеристика).",
                    "«El» означает конкретный отель в контрасте.",
                    "Без артикля существительное с прилагательным не употребляется в классической предикации.",
                    "Глагол estar не определяет сущность предмета."
                ]
            },
            {
                "question": "На вопрос «¿Cuánto cuesta el billete?» вам отвечают: «Unos veinte euros». Что это значит?",
                "type": "transfer",
                "options": ["Ровно 20 евро", "Примерно 20 евро", "Больше 200 евро", "20 билетов"],
                "correctIndex": 1,
                "explanations": [
                    "Ровно 20 евро было бы «Veinte euros».",
                    "Правильно: «Unos veinte euros» означает «примерно / около двадцати евро».",
                    "Неверно.",
                    "Неверно."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-5-01",
                "type": "choice",
                "question": "Какой неопределенный артикль нужен для слова «libro»?",
                "options": ["un", "una", "unos", "unas"],
                "correctAnswer": "un",
                "explanation": "Libro — мужской род ед. число: «un libro»."
            },
            {
                "id": "ex-5-02",
                "type": "gap",
                "question": "En el centro hay ____ (жен. ед.) plaza muy bonita.",
                "correctAnswer": "una",
                "acceptableAnswers": ["una", "Una"],
                "explanation": "Plaza — женский род: «una plaza»."
            },
            {
                "id": "ex-5-03",
                "type": "tiles",
                "question": "Соберите фразу: «Я покупаю билет на поезд.»",
                "tiles": ["Compro", "un", "billete", "de", "tren."],
                "correctAnswer": "Compro un billete de tren.",
                "explanation": "Compro un billete de tren."
            },
            {
                "id": "ex-5-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «un libro» → «____»",
                "prompt": "un libro → ____",
                "correctAnswer": "unos libros",
                "acceptableAnswers": ["unos libros", "Unos libros"],
                "explanation": "un libro → unos libros."
            },
            {
                "id": "ex-5-05",
                "type": "input",
                "question": "Напишите неопределенный артикль женского рода множественного числа:",
                "correctAnswer": "unas",
                "acceptableAnswers": ["unas", "Unas"],
                "explanation": "«unas» — женский род во мн. числе."
            },
            {
                "id": "ex-5-06",
                "type": "gap",
                "question": "Mi hermana es ____ (профессия без прил.) médica.",
                "correctAnswer": "—",
                "acceptableAnswers": ["—", "", "ninguno", "no"],
                "explanation": "С профессией без прилагательного артикль не ставится («es médica»)."
            },
            {
                "id": "ex-5-07",
                "type": "choice",
                "question": "Какой артикль нужен для «mapa» (мужской род)?",
                "options": ["un", "una", "unas", "la"],
                "correctAnswer": "un",
                "explanation": "«Un mapa» (слово mapa мужского рода)."
            },
            {
                "id": "ex-5-08",
                "type": "input",
                "question": "Напишите неопределенный артикль для слова «manzana»:",
                "correctAnswer": "una",
                "acceptableAnswers": ["una", "Una"],
                "explanation": "«una manzana» (женский род)."
            },
            {
                "id": "ex-5-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «una mesa» → «____»",
                "prompt": "una mesa → ____",
                "correctAnswer": "unas mesas",
                "acceptableAnswers": ["unas mesas", "Unas mesas"],
                "explanation": "una mesa → unas mesas."
            },
            {
                "id": "ex-5-10",
                "type": "tiles",
                "question": "Соберите предложение: «В городе есть несколько хороших парков.»",
                "tiles": ["En", "la", "ciudad", "hay", "unos", "parques", "buenos."],
                "correctAnswer": "En la ciudad hay unos parques buenos.",
                "explanation": "En la ciudad hay unos parques buenos."
            },
            {
                "id": "ex-5-11",
                "type": "gap",
                "question": "Tengo ____ (несколько, муж. род) amigos en Valencia.",
                "correctAnswer": "unos",
                "acceptableAnswers": ["unos", "Unos"],
                "explanation": "Amigos — мужской род мн. число: «unos amigos»."
            },
            {
                "id": "ex-5-12",
                "type": "choice",
                "question": "Какое предложение грамматически корректно?",
                "options": ["Soy profesor de inglés.", "Soy un profesor de inglés.", "Soy el profesor de inglés.", "Estoy un profesor."],
                "correctAnswer": "Soy profesor de inglés.",
                "explanation": "Профессия без оценки употребляется без артикля."
            },
            {
                "id": "ex-5-13",
                "type": "input",
                "question": "Напишите артикль для «problema» при первом упоминании:",
                "correctAnswer": "un",
                "acceptableAnswers": ["un", "Un"],
                "explanation": "«un problema» (мужской род)."
            },
            {
                "id": "ex-5-14",
                "type": "transformation",
                "question": "Замените определенный артикль на неопределенный: «el coche» → «____»",
                "prompt": "el coche → ____",
                "correctAnswer": "un coche",
                "acceptableAnswers": ["un coche", "Un coche", "un auto", "Un auto"],
                "explanation": "el coche → un coche."
            },
            {
                "id": "ex-5-15",
                "type": "tiles",
                "question": "Соберите фразу: «Это стоит около пятнадцати евро.»",
                "tiles": ["Cuesta", "unos", "quince", "euros."],
                "correctAnswer": "Cuesta unos quince euros.",
                "explanation": "Cuesta unos quince euros."
            },
            {
                "id": "ex-5-16",
                "type": "gap",
                "question": "Quiero comprar ____ (жен. ед.) camiseta azul.",
                "correctAnswer": "una",
                "acceptableAnswers": ["una", "Una"],
                "explanation": "Camiseta — женский род: «una camiseta»."
            },
            {
                "id": "ex-5-17",
                "type": "choice",
                "question": "Что означает «Tengo unas diez fotos»?",
                "options": ["У меня около 10 фотографий", "У меня ровно 10 фотографий", "У меня нет фотографий", "У меня 10 фотоаппаратов"],
                "correctAnswer": "У меня около 10 фотографий",
                "explanation": "Unas перед числом = около/примерно."
            },
            {
                "id": "ex-5-18",
                "type": "input",
                "question": "Напишите неопределенный артикль мужского рода во множественном числе:",
                "correctAnswer": "unos",
                "acceptableAnswers": ["unos", "Unos"],
                "explanation": "«unos» — мужской род во мн. числе."
            },
            {
                "id": "ex-5-19",
                "type": "gap",
                "question": "El hotel tiene ____ (муж. ед.) restaurante excelente.",
                "correctAnswer": "un",
                "acceptableAnswers": ["un", "Un"],
                "explanation": "Restaurante — мужской род: «un restaurante»."
            },
            {
                "id": "ex-5-20",
                "type": "tiles",
                "question": "Соберите предложение: «На улице есть аптека.»",
                "tiles": ["En", "la", "calle", "hay", "una", "farmacia."],
                "correctAnswer": "En la calle hay una farmacia.",
                "explanation": "En la calle hay una farmacia."
            },
            {
                "id": "ex-5-21",
                "type": "choice",
                "question": "Какой артикль нужен для «lección» (женский род)?",
                "options": ["una", "un", "unos", "el"],
                "correctAnswer": "una",
                "explanation": "Lección — женский род: «una lección»."
            },
            {
                "id": "ex-5-22",
                "type": "transformation",
                "question": "Замените «la carta» на неопределенный артикль: «____»",
                "prompt": "la carta → ____",
                "correctAnswer": "una carta",
                "acceptableAnswers": ["una carta", "Una carta"],
                "explanation": "la carta → una carta."
            },
            {
                "id": "ex-5-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Выберите правильную реплику с приветствием и неопределенным артиклем:",
                "options": [
                    "¡Hola! Necesito una habitación individual, por favor.",
                    "¡Hola! Necesito la habitación individual, de nada.",
                    "¡Adiós! Tengo unos habitación.",
                    "Buenos días, soy un estudiante."
                ],
                "correctAnswer": "¡Hola! Necesito una habitación individual, por favor.",
                "explanation": "«Necesito una habitación individual, por favor» — вежливый запрос с неопределенным артиклем."
            },
            {
                "id": "ex-5-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «В номере есть кровать и стол»:",
                "correctAnswer": "En la habitación hay una cama y una mesa",
                "acceptableAnswers": [
                    "En la habitación hay una cama y una mesa",
                    "En la habitacion hay una cama y una mesa",
                    "en la habitación hay una cama y una mesa",
                    "Hay una cama y una mesa en la habitación"
                ],
                "explanation": "En la habitación hay una cama y una mesa."
            }
        ],
        "miniScenario": {
            "title": "Заселение в отель и запрос номера",
            "setting": "Ресепшн небольшого отеля в Севилье.",
            "situation": "Вы пришли в отель без бронирования и хотите узнать, есть ли свободный номер.",
            "dialog": [
                {"speaker": "Tú", "text": "¡Buenas tardes! ¿Tienen una habitación libre para esta noche?"},
                {"speaker": "Recepcionista", "text": "Sí, tenemos una habitación doble muy tranquila."},
                {"speaker": "Tú", "text": "¿Cuánto cuesta?"},
                {"speaker": "Recepcionista", "text": "Cuesta unos cincuenta euros con desayuno incluido."}
            ],
            "task": "Спросите у администратора, есть ли свободный номер.",
            "prompt": "Как спросить: «У вас есть свободная комната на сегодня?»?",
            "options": [
                "¿Tienen una habitación libre para esta noche?",
                "¿Tienen la habitación libre para esta noche?",
                "¿Tienen el habitación libre?",
                "¿Tienen unos habitación libre?"
            ],
            "correctIndex": 0,
            "explanation": "«Una habitación libre» — правильный женский род и неопределенный артикль."
        },
        "shortText": {
            "title": "Un café en la plaza",
            "text": "Cerca de mi casa hay una plaza pequeña y tranquila. En la plaza hay una cafetería tradicional con unas mesas al aire libre. Todos los días pido un café con leche y una tostada con aceite. El camarero es un chico muy amable. En la cafetería siempre hay unos vecinos que leen el periódico y conversan alegremente.",
            "questions": [
                {
                    "question": "¿Qué hay en la plaza cerca de la casa?",
                    "options": ["Un museo grande", "Una cafetería tradicional", "Un banco moderno", "Un hotel de lujo"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «En la plaza hay una cafetería tradicional...»."
                },
                {
                    "question": "¿Qué pide el narrador todos los días?",
                    "options": ["Un té y una manzana", "Un café con leche y una tostada", "Un zumo y una pizza", "Una sopa caliente"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Todos los días pido un café con leche y una tostada...»."
                },
                {
                    "question": "¿Qué artículo tiene la palabra «mesas» en el texto?",
                    "options": ["Las", "Unas", "Unos", "Una"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «con unas mesas al aire libre»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание покупок или вещей в сумке",
            "prompt": "Опишите содержимое вашей сумки или рюкзака (4-5 предложений):\n1. Укажите, что у вас в сумке (En mi mochila hay...).\n2. Назовите 3-4 предмета с неопределенными артиклями (un libro, una botella de agua, unos bolígrafos, unas llaves).\n3. Укажите примерное количество чего-либо через «unos/unas».\n4. Назовите свою профессию без артикля (Soy estudiante / Soy diseñador...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование неопределенных артиклей", "points": 35, "description": "Правильный выбор un, una, unos, unas для всех существительных."},
                    {"name": "Правило отсутствия артикля с профессией", "points": 25, "description": "Корректное написание «Soy + профессия» без лишнего артикля."},
                    {"name": "Выполнение коммуникативной задачи", "points": 25, "description": "Связно описаны предметы и их примерное количество."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Соблюдение правил написания и согласования."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 20: Colors (colores)
    # ----------------------------------------------------
    20: {
        "id": 20,
        "topicName": "Colors (colores)",
        "russianTitle": "Цвета (colores) и их грамматическое согласование",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u02-things",
        "icon": "🎨",
        "summary": "Названия основных цветов в испанском языке и правила их грамматического согласования по роду и числу с существительными, которые они описывают.",
        "mnemonicRule": "Цвета на -o меняются по 4 формам (-o/-a/-os/-as: rojo/roja/rojos/rojas). Цвета на согласный или -e меняются только по числам (+s/+es: verde/verdes, azul/azules).",
        "goalsRu": [
            "Знать названия всех базовых цветов на испанском языке",
            "Согласовывать цвета, оканчивающиеся на -o, в роде и числе (rojo/roja/rojos/rojas)",
            "Правильно ставить цвета во множественное число (azul → azules, verde → verdes)",
            "Знать неизменяемые по роду цвета (rosa, naranja, marrón)"
        ],
        "sections": [
            {
                "title": "1. Базовые цвета и их согласование",
                "content": "В испанском языке прилагательные цвета почти всегда ставятся ПОСЛЕ существительного: «una camisa blanca» (белая рубашка).",
                "tables": [
                    {
                        "headers": ["Цвет (муж. ед.)", "Жен. ед.", "Муж. мн.", "Жен. мн.", "Русский"],
                        "rows": [
                            ["rojo", "roja", "rojos", "rojas", "красный"],
                            ["blanco", "blanca", "blancos", "blancas", "белый"],
                            ["negro", "negra", "negros", "negras", "чёрный"],
                            ["amarillo", "amarilla", "amarillos", "amarillas", "жёлтый"],
                            ["azul", "azul", "azules", "azules", "синий / голубой (не меняется по роду)"],
                            ["verde", "verde", "verdes", "verdes", "зелёный (не меняется по роду)"],
                            ["gris", "gris", "grises", "grises", "серый (не меняется по роду)"],
                            ["marrón", "marrón", "marrones", "marrones", "коричневый (не меняется по роду)"],
                            ["rosa", "rosa", "rosas", "rosas", "розовый"],
                            ["naranja", "naranja", "naranjas", "naranjas", "оранжевый"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Tengo un coche rojo y una bicicleta roja.", "ru": "У меня красная машина и красный велосипед."},
            {"es": "El cielo está completamente azul.", "ru": "Небо совершенно синее."},
            {"es": "Las hojas de los árboles son verdes.", "ru": "Листья деревьев зеленые."},
            {"es": "Llevo unos zapatos negros.", "ru": "На мне черные туфли."},
            {"es": "Una camisa blanca y limpia.", "ru": "Белая и чистая рубашка."},
            {"es": "Los pantalones son grises.", "ru": "Брюки серые."},
            {"es": "Compro una falda amarilla.", "ru": "Я покупаю жёлтую юбку."},
            {"es": "La casa tiene puertas marrones.", "ru": "В доме коричневые двери."},
            {"es": "El vestido rosa es muy bonito.", "ru": "Розовое платье очень красивое."},
            {"es": "¿De qué color es tu mochila?", "ru": "Какого цвета твой рюкзак?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Una camisa blanco» без согласования в женском роде",
                "correction": "Una camisa blanca",
                "explanation": "Цвета на -o обязательно согласуются по женскому роду: blanca, roja, negra, amarilla."
            },
            {
                "mistake": "«Unos ojos azuls» вместо «azules»",
                "correction": "unos ojos azules",
                "explanation": "Прилагательные на согласный во множественном числе получают окончание -es: azul → azules, gris → grises."
            },
            {
                "mistake": "Постановка цвета перед существительным: «una roja manzana»",
                "correction": "una manzana roja",
                "explanation": "В испанском цвета ставятся строго после существительного."
            }
        ],
        "trapAlert": "Цвета ставятся ПОСЛЕ существительного: «el coche rojo», а не «el rojo coche»!",
        "dialectNote": "Для обозначения коричневого цвета в Испании говорят «marrón», в Мексике — «café», а в некоторых странах Южной Америки — «castaño» (особенно о волосах и глазах).",
        "quiz": [
            {
                "question": "Как сказать «белая рубашка» по-испански?",
                "type": "recognition",
                "options": ["Una blanca camisa", "Una camisa blanca", "Una camisa blanco", "Un camisa blanca"],
                "correctIndex": 1,
                "explanations": [
                    "Цвет ставится после существительного.",
                    "Правильно: «Una camisa blanca» (женский род, цвет после слова).",
                    "«Blanco» мужского рода, а camisa женского.",
                    "«Un» мужского рода."
                ]
            },
            {
                "question": "Какая форма множественного числа у цвета «azul»?",
                "type": "recognition",
                "options": ["Azuls", "Azules", "Azulos", "Azulas"],
                "correctIndex": 1,
                "explanations": [
                    "После согласного добавляется -es, а не -s.",
                    "Правильно: azul → «azules».",
                    "Такой формы не существует.",
                    "Такой формы не существует."
                ]
            },
            {
                "question": "Какой цвет НЕ меняет форму по родам (одинаков для мужского и женского)?",
                "type": "recognition",
                "options": ["Rojo", "Blanco", "Verde", "Negro"],
                "correctIndex": 2,
                "explanations": [
                    "Rojo/roja меняется по родам.",
                    "Blanco/blanca меняется по родам.",
                    "Правильно: «verde» оканчивается на -e и одинаков для обоих родов (un libro verde / una mesa verde).",
                    "Negro/negra меняется по родам."
                ]
            },
            {
                "question": "Как спросить «Какого цвета твой телефон?»",
                "type": "recognition",
                "options": ["¿De qué color es tu teléfono?", "¿Qué es color tu teléfono?", "¿Cómo color es tu teléfono?", "¿Cuál color tu teléfono?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿De qué color es...?» — стандартный вопрос о цвете.",
                    "Неверная грамматическая структура.",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Согласуйте цвет: «Las flores son ____ (желтый)»:",
                "type": "application",
                "options": ["amarillo", "amarilla", "amarillos", "amarillas"],
                "correctIndex": 3,
                "explanations": [
                    "Единственное число мужского рода.",
                    "Единственное число женского рода.",
                    "Мужской род мн. число.",
                    "Правильно: flores — женский род мн. число → «amarillas»."
                ]
            },
            {
                "question": "Вставьте цвет: «Tengo unos zapatos ____ (черный)»:",
                "type": "application",
                "options": ["negro", "negra", "negros", "negras"],
                "correctIndex": 2,
                "explanations": [
                    "Единственное число.",
                    "Женский род ед. число.",
                    "Правильно: zapatos — мужской род мн. число → «negros».",
                    "Женский род мн. число."
                ]
            },
            {
                "question": "Вставьте форму цвета: «Las nubes son ____ (серый)»:",
                "type": "application",
                "options": ["gris", "grises", "grisas", "grisis"],
                "correctIndex": 1,
                "explanations": [
                    "Gris — единственное число.",
                    "Правильно: gris + es = «grises» (мн. число).",
                    "Такой формы не существует.",
                    "Неверно."
                ]
            },
            {
                "question": "Выберите грамматически верное сочетание существительного и цвета:",
                "type": "application",
                "options": ["Una manzana rojo", "Unos pantalones azul", "Una casa blanca", "Unas mesas negros"],
                "correctIndex": 2,
                "explanations": [
                    "Должно быть «roja» (женский род).",
                    "Должно быть «azules» (множественное число).",
                    "Правильно: «Una casa blanca» (женский род ед. число).",
                    "Должно быть «negras» (женский род)."
                ]
            },
            {
                "question": "В магазине одежды вы хотите купить синюю куртку. Как попросить её у продавца?",
                "type": "transfer",
                "options": ["Quiero una chaqueta azul, por favor.", "Quiero un azul chaqueta, por favor.", "Quiero una chaqueta azula, por favor.", "Quiero el chaqueta azul, por favor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «una chaqueta azul» (цвет после слова, azul не меняется по родам).",
                    "Цвет не ставится перед словом.",
                    "Формы «azula» не существует.",
                    "«Chaqueta» женского рода (не el)."
                ]
            },
            {
                "question": "Вы описываете флаг Испании. Какие на нем цвета?",
                "type": "transfer",
                "options": ["Rojo y amarillo", "Azul y blanco", "Verde y negro", "Gris y rosa"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: флаг Испании — «rojo y amarillo» (красно-желтый).",
                    "Цвета флагов других стран (Аргентины, Греции).",
                    "Неверные цвета.",
                    "Неверные цвета."
                ]
            },
            {
                "question": "Вы потеряли свой чемодан в аэропорту. Сотрудник спрашивает: «¿De qué color es?». Ваш чемодан — черный. Ваш ответ:",
                "type": "transfer",
                "options": ["Es negro.", "Es negra.", "Está negro.", "Son negros."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: el equipaje / el maletín — мужской род → «Es negro».",
                    "«Negra» используется для la maleta (если вы уточнили la maleta).",
                    "Цвет — постоянная характеристика, используется ser (es), а не estar.",
                    "Чемодан один, множественное число не нужно."
                ]
            },
            {
                "question": "Как описать свои глаза: «У меня карие (коричневые) глаза»?",
                "type": "transfer",
                "options": ["Tengo los ojos marrones.", "Tengo los ojos marronos.", "Tengo las ojos marrones.", "Tengo los ojos marrón."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Tengo los ojos marrones» (ojos — муж. род мн. число, marrón + es = marrones).",
                    "Формы «marronos» не существует.",
                    "«Ojos» мужского рода (los ojos).",
                    "Пропущено окончание множественного числа -es."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-20-01",
                "type": "choice",
                "question": "Какой цвет получается при смешивании белого и черного?",
                "options": ["gris", "rojo", "verde", "amarillo"],
                "correctAnswer": "gris",
                "explanation": "Gris = серый."
            },
            {
                "id": "ex-20-02",
                "type": "gap",
                "question": "La manzana es ____ (красный, жен. род).",
                "correctAnswer": "roja",
                "acceptableAnswers": ["roja", "Roja"],
                "explanation": "Manzana — женский род: «roja»."
            },
            {
                "id": "ex-20-03",
                "type": "tiles",
                "question": "Соберите предложение: «У меня синяя машина.»",
                "tiles": ["Tengo", "un", "coche", "azul."],
                "correctAnswer": "Tengo un coche azul.",
                "explanation": "Tengo un coche azul."
            },
            {
                "id": "ex-20-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el libro verde» → «los libros ____»",
                "prompt": "verde → ____",
                "correctAnswer": "verdes",
                "acceptableAnswers": ["verdes", "Verdes"],
                "explanation": "verde → verdes."
            },
            {
                "id": "ex-20-05",
                "type": "input",
                "question": "Напишите по-испански цвет «чёрный» (мужской род):",
                "correctAnswer": "negro",
                "acceptableAnswers": ["negro", "Negro"],
                "explanation": "negro = чёрный."
            },
            {
                "id": "ex-20-06",
                "type": "gap",
                "question": "Las casas del pueblo son ____ (белый, мн. число).",
                "correctAnswer": "blancas",
                "acceptableAnswers": ["blancas", "Blancas"],
                "explanation": "Casas — женский род мн. число: «blancas»."
            },
            {
                "id": "ex-20-07",
                "type": "choice",
                "question": "Как сказать «желтые цветы»?",
                "options": ["flores amarillas", "flores amarillos", "amarillas flores", "flores amarilla"],
                "correctAnswer": "flores amarillas",
                "explanation": "Flores (жен. род мн. ч.) → amarillas."
            },
            {
                "id": "ex-20-08",
                "type": "input",
                "question": "Напишите по-испански цвет «жёлтый» (мужской род):",
                "correctAnswer": "amarillo",
                "acceptableAnswers": ["amarillo", "Amarillo"],
                "explanation": "amarillo = жёлтый."
            },
            {
                "id": "ex-20-09",
                "type": "transformation",
                "question": "Поставьте во множественное число цвет «azul»: «____»",
                "prompt": "azul → ____",
                "correctAnswer": "azules",
                "acceptableAnswers": ["azules", "Azules"],
                "explanation": "azul → azules."
            },
            {
                "id": "ex-20-10",
                "type": "tiles",
                "question": "Соберите фразу: «На ней надета белая рубашка.»",
                "tiles": ["Lleva", "una", "camisa", "blanca."],
                "correctAnswer": "Lleva una camisa blanca.",
                "explanation": "Lleva una camisa blanca."
            },
            {
                "id": "ex-20-11",
                "type": "gap",
                "question": "Los pantalones son ____ (серый, мн. ч.).",
                "correctAnswer": "grises",
                "acceptableAnswers": ["grises", "Grises"],
                "explanation": "gris + es = grises."
            },
            {
                "id": "ex-20-12",
                "type": "choice",
                "question": "Какого цвета трава весной?",
                "options": ["verde", "roja", "azul", "negra"],
                "correctAnswer": "verde",
                "explanation": "Трава зелёная (verde)."
            },
            {
                "id": "ex-20-13",
                "type": "input",
                "question": "Напишите по-испански цвет «красный» (мужской род):",
                "correctAnswer": "rojo",
                "acceptableAnswers": ["rojo", "Rojo"],
                "explanation": "rojo = красный."
            },
            {
                "id": "ex-20-14",
                "type": "transformation",
                "question": "Поставьте в женский род: «un perro negro» → «una gata ____»",
                "prompt": "negro → ____",
                "correctAnswer": "negra",
                "acceptableAnswers": ["negra", "Negra"],
                "explanation": "negro → negra."
            },
            {
                "id": "ex-20-15",
                "type": "tiles",
                "question": "Соберите предложение: «У меня карие глаза.»",
                "tiles": ["Tengo", "los", "ojos", "marrones."],
                "correctAnswer": "Tengo los ojos marrones.",
                "explanation": "Tengo los ojos marrones."
            },
            {
                "id": "ex-20-16",
                "type": "gap",
                "question": "Compro una falda ____ (розовый).",
                "correctAnswer": "rosa",
                "acceptableAnswers": ["rosa", "Rosa"],
                "explanation": "«una falda rosa»."
            },
            {
                "id": "ex-20-17",
                "type": "choice",
                "question": "Какое предложение верно по согласованию цвета?",
                "options": ["Tengo dos gatos negros.", "Tengo dos gatos negro.", "Tengo dos gatos negras.", "Tengo dos negros gatos."],
                "correctAnswer": "Tengo dos gatos negros.",
                "explanation": "Gatos (муж. род мн. число) → negros."
            },
            {
                "id": "ex-20-18",
                "type": "input",
                "question": "Напишите по-испански цвет «белый» (мужской род):",
                "correctAnswer": "blanco",
                "acceptableAnswers": ["blanco", "Blanco"],
                "explanation": "blanco = белый."
            },
            {
                "id": "ex-20-19",
                "type": "gap",
                "question": "El autobús de la ciudad es de color ____ (оранжевый).",
                "correctAnswer": "naranja",
                "acceptableAnswers": ["naranja", "Naranja"],
                "explanation": "naranja = оранжевый."
            },
            {
                "id": "ex-20-20",
                "type": "tiles",
                "question": "Соберите фразу: «Небо совершенно синее.»",
                "tiles": ["El", "cielo", "está", "completamente", "azul."],
                "correctAnswer": "El cielo está completamente azul.",
                "explanation": "El cielo está completamente azul."
            },
            {
                "id": "ex-20-21",
                "type": "choice",
                "question": "Какого цвета спелый апельсин?",
                "options": ["naranja", "azul", "negro", "gris"],
                "correctAnswer": "naranja",
                "explanation": "Апельсин оранжевый (naranja)."
            },
            {
                "id": "ex-20-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «un zapato marrón» → «unos zapatos ____»",
                "prompt": "marrón → ____",
                "correctAnswer": "marrones",
                "acceptableAnswers": ["marrones", "Marrones"],
                "explanation": "marrón → marrones."
            },
            {
                "id": "ex-20-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какая реплика содержит приветствие и описание цвета предмета?",
                "options": [
                    "¡Buenas tardes! Busco mi mochila roja, por favor.",
                    "¡Buenas noches! No tengo números.",
                    "De nada, el libro del profesor.",
                    "Mucho gusto, soy quince años."
                ],
                "correctAnswer": "¡Buenas tardes! Busco mi mochila roja, por favor.",
                "explanation": "Приветствие + поиск предмета с цветом (mochila roja)."
            },
            {
                "id": "ex-20-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня есть 2 красных яблока»:",
                "correctAnswer": "Tengo dos manzanas rojas",
                "acceptableAnswers": [
                    "Tengo dos manzanas rojas",
                    "tengo dos manzanas rojas",
                    "Yo tengo dos manzanas rojas"
                ],
                "explanation": "Tengo dos manzanas rojas."
            }
        ],
        "miniScenario": {
            "title": "Покупка одежды в магазине",
            "setting": "Магазин одежды в центре Мадрида.",
            "situation": "Вы хотите купить футболку определенного цвета. Консультант помогает выбрать нужный цвет и размер.",
            "dialog": [
                {"speaker": "Dependiente", "text": "¡Hola! ¿En qué puedo ayudarte?"},
                {"speaker": "Tú", "text": "Hola. Busco una camiseta verde, por favor."},
                {"speaker": "Dependiente", "text": "Aquí tienes una verde y otra azul. ¿Cuál prefieres?"},
                {"speaker": "Tú", "text": "Prefiero la camiseta verde. Muchas gracias."}
            ],
            "task": "Попросите у продавца зеленую футболку.",
            "prompt": "Как сказать продавцу: «Я ищу зелёную футболку, пожалуйста»?",
            "options": [
                "Busco una camiseta verde, por favor.",
                "Busco una verde camiseta, por favor.",
                "Busco un camiseta verde, por favor.",
                "Busco unas camisetas verde, por favor."
            ],
            "correctIndex": 0,
            "explanation": "«Una camiseta verde» — правильное согласование и порядок слов."
        },
        "shortText": {
            "title": "El mercado de las flores",
            "text": "Los sábados por la mañana visito el mercado de las flores en la plaza central. Hay puestos con flores de todos los colores. Compro rosas rojas para mi madre y unas margaritas amarillas y blancas para mi casa. Las plantas tienen hojas muy verdes y frescas. El vendedor lleva un delantal azul y siempre regala una flor pequeña a los clientes.",
            "questions": [
                {
                    "question": "¿De qué color son las rosas que compra el narrador?",
                    "options": ["Amarillas", "Rojas", "Azules", "Verdes"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Compro rosas rojas para mi madre...»."
                },
                {
                    "question": "¿De qué color es el delantal del vendedor?",
                    "options": ["Blanco", "Negro", "Azul", "Rojo"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «El vendedor lleva un delantal azul...»."
                },
                {
                    "question": "¿Qué forma tiene el adjetivo «verdes» en el texto?",
                    "options": ["Femenino singular", "Masculino singular", "Plural (para hojas)", "Neutro"],
                    "correctIndex": 2,
                    "explanation": "В тексте «hojas muy verdes» — множественное число."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание цветов вашей любимой одежды",
            "prompt": "Напишите короткий текст (4-5 предложений) о цветах вашей любимой одежды:\n1. Опишите куртку или пальто (Llevo una chaqueta...).\n2. Опишите брюки или обувь (Mis pantalones son..., mis zapatos son...).\n3. Опишите любимый цвет в целом (Mi color favorito es el...).\n4. Соблюдайте согласование по родам и числам.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Согласование прилагательных цвета", "points": 35, "description": "Точное согласование по роду и числу (rojo/roja/rojos/rojas, azules, negras...)."},
                    {"name": "Порядок слов", "points": 25, "description": "Прилагательные цвета стоят строго после существительных."},
                    {"name": "Лексика одежды и внешности", "points": 25, "description": "Слова camisa, zapatos, pantalones, chaqueta, color favorito."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотность и связность текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 6: Plural nouns (-s/-es)
    # ----------------------------------------------------
    6: {
        "id": 6,
        "topicName": "Plural nouns (-s/-es)",
        "russianTitle": "Множественное число существительных (-s / -es / z → ces)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u02-things",
        "icon": "👥",
        "summary": "Правила образования множественного числа существительных в испанском языке: добавление окончания -s после гласных, -es после согласных и замена z → ces.",
        "mnemonicRule": "Гласный + S (libro → libros), Согласный + ES (hotel → hoteles), Z меняется на CES (lápiz → lápices).",
        "goalsRu": [
            "Образовывать множественное число существительных на гласный (+s)",
            "Образовывать множественное число существительных на согласный (+es)",
            "Применять орфографическое правило z → ces (el pez → los peces, el lápiz → los lápices)",
            "Понимать смещение или сохранение графического ударения (la lección → las lecciones)"
        ],
        "sections": [
            {
                "title": "1. Основные правила образования множественного числа",
                "content": "В испанском языке способ образования множественного числа зависит от последней буквы слова:",
                "tables": [
                    {
                        "headers": ["Окончание слова", "Что добавляется", "Пример в ед. ч.", "Пример во мн. ч."],
                        "rows": [
                            ["Гласный (-a, -e, -i, -o, -u)", "+s", "el libro, la casa", "los libros, las casas"],
                            ["Согласный (кроме -z)", "+es", "el hotel, la ciudad, el profesor", "los hoteles, las ciudades, los profesores"],
                            ["На букву -z", "z → ces", "el lápiz, el pez, la actriz", "los lápices, los peces, las actrices"],
                            ["Слова на -ión с тильдой", "теряют тильду во мн. ч.", "la lección, la estación", "las lecciones, las estaciones"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Los libros están en las mesas.", "ru": "Книги лежат на столах."},
            {"es": "Los hoteles de la ciudad son modernos.", "ru": "Отели города современные."},
            {"es": "Los profesores explican las lecciones.", "ru": "Преподаватели объясняют уроки."},
            {"es": "Hay muchos peces de colores en el mar.", "ru": "В море много разноцветных рыб (pez → peces)."},
            {"es": "Necesito dos lápices para dibujar.", "ru": "Мне нужны два карандаша для рисования (lápiz → lápices)."},
            {"es": "Las ciudades españolas son bonitas.", "ru": "Испанские города красивые (ciudad → ciudades)."},
            {"es": "Compro tres panes en la panadería.", "ru": "Я покупаю три хлеба в пекарне (pan → panes)."},
            {"es": "Los autobuses llegan a la estación.", "ru": "Автобусы прибывают на вокзал (autobús → autobuses)."},
            {"es": "Las mujeres y los hombres trabajan juntos.", "ru": "Женщины и мужчины работают вместе."},
            {"es": "Las luces de la calle están encendidas.", "ru": "Фонари (огни) на улице зажжены (luz → luces)."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Lápizs» или «pezs» с добавлением только -s",
                "correction": "lápices / peces",
                "explanation": "Буква Z перед E в испанском языке ВСЕГДА переходит в C: lápiz → lápices, luz → luces."
            },
            {
                "mistake": "«Hotels» вместо «hoteles»",
                "correction": "hoteles / profesores / ciudades",
                "explanation": "После согласных обязательно добавляется окончание -es."
            },
            {
                "mistake": "Сохранение тильды: «lecciónes» вместо «lecciones»",
                "correction": "las lecciones / las estaciones",
                "explanation": "При добавлении -es ударение падает на предпоследний слог по общему правилу, поэтому графическая тильда больше не нужна."
            }
        ],
        "trapAlert": "Слова на -Z меняют Z на CES: pez → peces, lápiz → lápices, luz → luces, voz → voces!",
        "dialectNote": "Слова, оканчивающиеся на согласный -s с безударным окончанием (el paraguas, el cumpleaños, el martes), не меняют форму во множественном числе: los paraguas, los cumpleaños, los martes.",
        "quiz": [
            {
                "question": "Какая форма множественного числа у слова «el pez» (рыба)?",
                "type": "recognition",
                "options": ["Los pezs", "Los peces", "Los pezes", "Las pezas"],
                "correctIndex": 1,
                "explanations": [
                    "Окончание -zs недопустимо в испанском.",
                    "Правильно: z меняется на ces → «los peces».",
                    "«Pezes» — орфографическая ошибка (z не пишется перед e).",
                    "Неверный род и форма."
                ]
            },
            {
                "question": "Какая форма множественного числа у слова «el hotel»?",
                "type": "recognition",
                "options": ["Los hotels", "Los hoteles", "Los hotelos", "Las hoteles"],
                "correctIndex": 1,
                "explanations": [
                    "После согласного нельзя добавлять просто -s.",
                    "Правильно: hotel + es = «los hoteles».",
                    "Неверно.",
                    "Hotel мужского рода (los)."
                ]
            },
            {
                "question": "Какое слово во множественном числе теряет графическое ударение (тильду)?",
                "type": "recognition",
                "options": ["El libro", "La lección", "El hotel", "La casa"],
                "correctIndex": 1,
                "explanations": [
                    "В слове libro тильды не было.",
                    "Правильно: la lección → «las lecciones» (ударение падает на предпоследний слог, тильда снимается).",
                    "В слове hotel тильды не было.",
                    "В слове casa тильды не было."
                ]
            },
            {
                "question": "Какая форма множественного числа у слова «la luz» (свет / огонь)?",
                "type": "recognition",
                "options": ["Las luzs", "Las luces", "Los luces", "Las luzes"],
                "correctIndex": 1,
                "explanations": [
                    "Окончание -zs недопустимо.",
                    "Правильно: luz → «las luces» (z → ces).",
                    "Luz женского рода (las luces).",
                    "Буква z не пишется перед e."
                ]
            },
            {
                "question": "Поставьте во множественное число: «la ciudad grande» → «____»",
                "type": "application",
                "options": ["las ciudads grandes", "las ciudades grandes", "los ciudades grandes", "las ciudades grande"],
                "correctIndex": 1,
                "explanations": [
                    "Ciudad на согласный требует -es.",
                    "Правильно: «las ciudades grandes» (согласование сущ. и прил.).",
                    "Ciudad женского рода (las).",
                    "Прилагательное grande тоже должно быть во мн. числе (grandes)."
                ]
            },
            {
                "question": "Поставьте во множественное число: «el profesor trabajador» → «____»",
                "type": "application",
                "options": ["los profesors trabajadors", "los profesores trabajadores", "los profesores trabajadors", "las profesores trabajadoras"],
                "correctIndex": 1,
                "explanations": [
                    "После согласных добавляется -es.",
                    "Правильно: «los profesores trabajadores» (оба слова получают -es).",
                    "Прилагательное trabajador тоже получает -es.",
                    "Мужской род требует артикля «los»."
                ]
            },
            {
                "question": "Как сказать «три карандаша» по-испански?",
                "type": "application",
                "options": ["Tres lápizs", "Tres lápizes", "Tres lápices", "Tres lapizos"],
                "correctIndex": 2,
                "explanations": [
                    "Окончание -zs ошибочно.",
                    "Буква z перед e заменяется на c.",
                    "Правильно: lápiz → «tres lápices».",
                    "Неверно."
                ]
            },
            {
                "question": "Какое слово НЕ меняет форму во множественном числе (только артикль)?",
                "type": "application",
                "options": ["El cumpleaños", "El libro", "La mesa", "El profesor"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el cumpleaños → los cumpleaños» (слово оканчивается на безударный -s).",
                    "Libro → libros.",
                    "Mesa → mesas.",
                    "Profesor → profesores."
                ]
            },
            {
                "question": "В классе сидят 10 студенток. Как назвать эту группу?",
                "type": "transfer",
                "options": ["Diez estudiantes", "Diez estudiantas", "Diez estudiantesas", "Diez estudiantos"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «estudiante» оканчивается на -e, мн. число — «estudiantes» (las estudiantes).",
                    "Слова «estudianta» не существует в литературной норме.",
                    "Ошибочное окончание.",
                    "Ошибочное окончание."
                ]
            },
            {
                "question": "Вы заказываете в кафе три кофе. Как сказать правильно?",
                "type": "transfer",
                "options": ["Tres cafés, por favor.", "Tres cafeses, por favor.", "Tres café, por favor.", "Tres cofes, por favor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: café + s = «tres cafés».",
                    "«Cafeses» — просторечная ошибка.",
                    "Пропущено окончание множественного числа.",
                    "Неверное слово."
                ]
            },
            {
                "question": "Вам нужно купить в магазине 2 зонта. Как сказать по-испански?",
                "type": "transfer",
                "options": ["Dos paraguas, por favor.", "Dos paraguases, por favor.", "Dos paraguass, por favor.", "Dos paragua, por favor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «paraguas» уже оканчивается на -s и не меняет форму: «dos paraguas».",
                    "«Paraguases» — ошибка.",
                    "Недопустимое удвоение -ss.",
                    "Слова «paragua» не существует."
                ]
            },
            {
                "question": "В аквариуме плавают 5 рыбок. Как сказать «5 рыбок»?",
                "type": "transfer",
                "options": ["Cinco peces", "Cinco pezs", "Cinco pezes", "Cinco pescados"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: живая рыба в воде — «pez → peces».",
                    "Окончание -zs недопустимо.",
                    "Z перед E заменяется на C.",
                    "Pescado — это уже выловленная или приготовленная рыба в кулинарии."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-6-01",
                "type": "choice",
                "question": "Какое окончание добавляется к слову «árbol» во множественном числе?",
                "options": ["-es (árboles)", "-s (árbols)", "-ces", "-as"],
                "correctAnswer": "-es (árboles)",
                "explanation": "Слова на согласный получают -es: árbol → árboles."
            },
            {
                "id": "ex-6-02",
                "type": "gap",
                "question": "El lápiz → Los ____ (карандаши).",
                "correctAnswer": "lápices",
                "acceptableAnswers": ["lápices", "lapices", "Lápices"],
                "explanation": "lápiz → lápices (z → ces)."
            },
            {
                "id": "ex-6-03",
                "type": "tiles",
                "question": "Соберите предложение: «Отели города очень удобные.»",
                "tiles": ["Los", "hoteles", "de", "la", "ciudad", "son", "muy", "cómodos."],
                "correctAnswer": "Los hoteles de la ciudad son muy cómodos.",
                "explanation": "Los hoteles de la ciudad son muy cómodos."
            },
            {
                "id": "ex-6-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la canción» → «las ____»",
                "prompt": "la canción → ____",
                "correctAnswer": "canciones",
                "acceptableAnswers": ["canciones", "las canciones", "Canciones"],
                "explanation": "canción → canciones (без тильды)."
            },
            {
                "id": "ex-6-05",
                "type": "input",
                "question": "Напишите форму множественного числа для слова «el pez»:",
                "correctAnswer": "los peces",
                "acceptableAnswers": ["los peces", "peces", "Peces", "Los peces"],
                "explanation": "el pez → los peces."
            },
            {
                "id": "ex-6-06",
                "type": "gap",
                "question": "En la biblioteca hay muchas ____ (книги - libro).",
                "correctAnswer": "libros",
                "acceptableAnswers": ["libros", "mesas"],
                "explanation": "«libros» / «mesas»."
            },
            {
                "id": "ex-6-07",
                "type": "choice",
                "question": "Какая форма множественного числа у «la mujer»?",
                "options": ["las mujeres", "las mujers", "los mujeres", "las mujeras"],
                "correctAnswer": "las mujeres",
                "explanation": "mujer + es = mujeres (las mujeres)."
            },
            {
                "id": "ex-6-08",
                "type": "input",
                "question": "Напишите форму мн. числа для слова «la luz»:",
                "correctAnswer": "las luces",
                "acceptableAnswers": ["las luces", "luces", "Luces", "Las luces"],
                "explanation": "luz → luces."
            },
            {
                "id": "ex-6-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el profesor» → «los ____»",
                "prompt": "profesor → ____",
                "correctAnswer": "profesores",
                "acceptableAnswers": ["profesores", "Profesores"],
                "explanation": "profesor → profesores."
            },
            {
                "id": "ex-6-10",
                "type": "tiles",
                "question": "Соберите предложение: «Преподаватели объясняют новые уроки.»",
                "tiles": ["Los", "profesores", "explican", "las", "lecciones", "nuevas."],
                "correctAnswer": "Los profesores explican las lecciones nuevas.",
                "explanation": "Los profesores explican las lecciones nuevas."
            },
            {
                "id": "ex-6-11",
                "type": "gap",
                "question": "Las ____ (город - ciudad) de España son históricas.",
                "correctAnswer": "ciudades",
                "acceptableAnswers": ["ciudades", "Ciudades"],
                "explanation": "ciudad → ciudades."
            },
            {
                "id": "ex-6-12",
                "type": "choice",
                "question": "Какая форма множественного числа у «el autobús»?",
                "options": ["los autobuses", "los autobús", "los autobuss", "las autobuses"],
                "correctAnswer": "los autobuses",
                "explanation": "autobús + es = autobuses."
            },
            {
                "id": "ex-6-13",
                "type": "input",
                "question": "Напишите форму мн. числа для «la estación»:",
                "correctAnswer": "las estaciones",
                "acceptableAnswers": ["las estaciones", "estaciones", "Estaciones", "Las estaciones"],
                "explanation": "estación → estaciones."
            },
            {
                "id": "ex-6-14",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la voz» (голос) → «las ____»",
                "prompt": "la voz → ____",
                "correctAnswer": "voces",
                "acceptableAnswers": ["voces", "las voces", "Voces"],
                "explanation": "voz → voces."
            },
            {
                "id": "ex-6-15",
                "type": "tiles",
                "question": "Соберите фразу: «В море много разноцветных рыб.»",
                "tiles": ["En", "el", "mar", "hay", "muchos", "peces", "de", "colores."],
                "correctAnswer": "En el mar hay muchos peces de colores.",
                "explanation": "En el mar hay muchos peces de colores."
            },
            {
                "id": "ex-6-16",
                "type": "gap",
                "question": "El abuelo compra tres ____ (хлеб - pan) en la panadería.",
                "correctAnswer": "panes",
                "acceptableAnswers": ["panes", "Panes"],
                "explanation": "pan + es = panes."
            },
            {
                "id": "ex-6-17",
                "type": "choice",
                "question": "Какое слово во множественном числе написано без ошибок?",
                "options": ["actrices", "actrizs", "actrizes", "actrizoes"],
                "correctAnswer": "actrices",
                "explanation": "actriz → actrices."
            },
            {
                "id": "ex-6-18",
                "type": "input",
                "question": "Напишите форму множественного числа для «el país» (страна):",
                "correctAnswer": "los países",
                "acceptableAnswers": ["los países", "países", "paises", "los paises", "Países"],
                "explanation": "país → países (сохраняет тильду для раздельного произношения гласных)."
            },
            {
                "id": "ex-6-19",
                "type": "gap",
                "question": "Los ____ (вторник - martes) tengo clase de español.",
                "correctAnswer": "martes",
                "acceptableAnswers": ["martes", "Martes"],
                "explanation": "Дни недели на -s не меняются: los martes."
            },
            {
                "id": "ex-6-20",
                "type": "tiles",
                "question": "Соберите предложение: «Женщины читают книги в саду.»",
                "tiles": ["Las", "mujeres", "leen", "libros", "en", "el", "jardín."],
                "correctAnswer": "Las mujeres leen libros en el jardín.",
                "explanation": "Las mujeres leen libros en el jardín."
            },
            {
                "id": "ex-6-21",
                "type": "choice",
                "question": "Как во множественном числе пишется «el examen»?",
                "options": ["los exámenes", "los examens", "los examenes", "las exámenes"],
                "correctAnswer": "los exámenes",
                "explanation": "examen → exámenes (получает тильду, так как ударение падает на 3-й слог с конца)."
            },
            {
                "id": "ex-6-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la pared» (стена) → «las ____»",
                "prompt": "la pared → ____",
                "correctAnswer": "paredes",
                "acceptableAnswers": ["paredes", "las paredes", "Paredes"],
                "explanation": "pared + es = paredes."
            },
            {
                "id": "ex-6-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет цвета и множественное число правильно?",
                "options": [
                    "Los peces rojos nadan en el agua.",
                    "Los pezs rojos nadan en el agua.",
                    "Los peces rojo nadan en el agua.",
                    "Las peces rojas nadan en el agua."
                ],
                "correctAnswer": "Los peces rojos nadan en el agua.",
                "explanation": "Peces (муж. род мн. число) + rojos."
            },
            {
                "id": "ex-6-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански во множественном числе: «Учителя говорят на 2 языках»:",
                "correctAnswer": "Los profesores hablan dos idiomas",
                "acceptableAnswers": [
                    "Los profesores hablan dos idiomas",
                    "los profesores hablan dos idiomas",
                    "Los profesores hablan en dos idiomas"
                ],
                "explanation": "Los profesores hablan dos idiomas."
            }
        ],
        "miniScenario": {
            "title": "Покупка сувениров и открыток",
            "setting": "Сувенирный киоск на площади Пласа-Майор в Мадриде.",
            "situation": "Вы хотите купить несколько открыток и магнитов. Уточните количество и цену.",
            "dialog": [
                {"speaker": "Dependiente", "text": "¡Hola! ¿Qué deseas llevar hoy?"},
                {"speaker": "Tú", "text": "Hola. Quiero cinco postales y dos lápices de recuerdo, por favor."},
                {"speaker": "Dependiente", "text": "Perfecto. Son siete euros en total."},
                {"speaker": "Tú", "text": "Aquí tiene. Muchas gracias."}
            ],
            "task": "Закажите пять открыток и два карандаша.",
            "prompt": "Как сказать продавцу: «Пять открыток и два карандаша, пожалуйста»?",
            "options": [
                "Cinco postales y dos lápices, por favor.",
                "Cinco postals y dos lápizs, por favor.",
                "Cinco postales y dos lápizes, por favor.",
                "Cinco postal y dos lápiz, por favor."
            ],
            "correctIndex": 0,
            "explanation": "«Cinco postales y dos lápices» — правильные формы множественного числа."
        },
        "shortText": {
            "title": "Las ciudades y las luces de España",
            "text": "España tiene muchas ciudades interesantes y llenas de historia. En las calles principales hay grandes hoteles, restaurantes tradicionales y panaderías con panes recién hechos. Por las noches, las luces de los edificios crean un ambiente mágico. Los turistas toman fotos de los monumentos y compran recuerdos en las tiendas locales.",
            "questions": [
                {
                    "question": "¿Qué hay en las calles principales de las ciudades?",
                    "options": ["Solo fábricas", "Hoteles, restaurantes y panaderías", "Aeropuertos", "Bosques oscuros"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «hay grandes hoteles, restaurantes tradicionales y panaderías...»."
                },
                {
                    "question": "¿Qué forma plural del sustantivo «luz» aparece en el texto?",
                    "options": ["Luzs", "Luces", "Luzes", "Lucesas"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «las luces de los edificios...»."
                },
                {
                    "question": "¿Qué hacen los turistas por las noches?",
                    "options": ["Duermen en la calle", "Toman fotos de los monumentos", "Trabajan en panaderías", "No salen del hotel"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Los turistas toman fotos de los monumentos...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание предметов во множественном числе вокруг вас",
            "prompt": "Напишите 4-5 предложений о вещах в вашем городе или учебном классе во множественном числе:\n1. Упомяните здания или отели (los edificios, los hoteles).\n2. Упомяните людей (los profesores, las mujeres, los estudiantes).\n3. Упомяните предметы с чередованием Z → CES (los lápices, las luces, los peces).\n4. Согласуйте прилагательные во множественном числе.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Образование множественного числа (-s, -es, -ces)", "points": 35, "description": "Безошибочное образование мн. числа, включая согласные и слова на -z."},
                    {"name": "Согласование артиклей и прилагательных", "points": 30, "description": "Артикли los/las и прилагательные согласованы во мн. числе."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Текст связно описывает город/класс."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотность, заглавные буквы, отсутствие ошибок в тильдах."}
                ]
            }
        }
    }
}
