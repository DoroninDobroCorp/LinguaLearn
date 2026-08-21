# -*- coding: utf-8 -*-
"""Unit 8: Дом и пространство (Topics 10, 15, 26, 9)"""

unit8_topics = {
    # ----------------------------------------------------
    # TOPIC 10: Hay (there is / there are)
    # ----------------------------------------------------
    10: {
        "id": 10,
        "topicName": "Hay (there is / there are)",
        "russianTitle": "Конструкция HAY (имеется / есть / существует) vs ESTAR",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u08-home",
        "icon": "📍",
        "summary": "Безличная форма «HAY» (от глагола haber) выражает наличие или существование предметов в пространстве (соответствует английскому there is / there are, русскому «есть / имеется / находится»). Форма HAY неизменна для единственного и множественного числа.",
        "mnemonicRule": "HAY = Наличие неизвестного (Hay un libro / Hay tres mesas / No hay nadie). ESTAR = Локация известного конкретного предмета (El libro está en la mesa).",
        "goalsRu": [
            "Использовать безличную форму HAY для выражения наличия предметов и людей в пространстве",
            "Помнить, что форма HAY одинакова для единственного и множественного числа (hay un libro / hay diez libros)",
            "Знать, с чем употребляется HAY (неопределенный артикль, числа, много/мало, без артикля во мн. ч., nada/nadie)",
            "Четко различать HAY (наличие нового) и ESTAR (местоположение конкретного известного объекта)"
        ],
        "sections": [
            {
                "title": "1. С чем употребляется форма HAY",
                "content": "После HAY никогда НЕ ставится определенный артикль (el/la/los/las) или притяжательное (mi/tu/su):",
                "tables": [
                    {
                        "headers": ["Конструкция после HAY", "Пример", "Русский перевод"],
                        "rows": [
                            ["HAY + неопределенный артикль", "Hay una farmacia cerca de aquí.", "Рядом есть (какая-то) аптека."],
                            ["HAY + числительное", "Hay tres habitaciones en el piso.", "В квартире есть три комнаты."],
                            ["HAY + mucho/poco/bastante", "Hay mucha gente en la plaza.", "На площади много людей."],
                            ["HAY + сущ. во мн. ч. без артикля", "Hay flores en el balcón.", "На балконе есть цветы."],
                            ["HAY + algo / nada / nadie", "¿Hay alguien en casa? —No hay nadie.", "Есть кто-нибудь дома? —Никого нет."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Разница между HAY и ESTAR",
                "content": "Сравните две принципиально разные мыслительные модели:",
                "tables": [
                    {
                        "headers": ["Критерий", "HAY (Наличие / Существование)", "ESTAR (Геолокация конкретного)"],
                        "rows": [
                            ["Вопрос", "¿Qué hay en la mesa? (Что есть на столе?)", "¿Dónde está el libro? (Где эта книга?)"],
                            ["Артикль / Тип", "Неопределенный / Число (un libro / tres libros)", "Определенный / Имя (el libro / mi libro / Carlos)"],
                            ["Пример", "En la plaza hay un banco.", "El banco está en la plaza."],
                            ["Смысл", "Мы сообщаем, ЧТО ИМЕЕТСЯ в данном месте.", "Мы сообщаем, ГДЕ НАХОДИТСЯ конкретный предмет."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "En mi barrio hay muchos parques y tiendas.", "ru": "В моем районе много парков и магазинов."},
            {"es": "¿Hay una farmacia por aquí cerca?", "ru": "Здесь поблизости есть аптека?"},
            {"es": "En la mesa hay tres libros de español.", "ru": "На столе лежат три книги по испанскому."},
            {"es": "No hay nadie en la oficina a las ocho de la tarde.", "ru": "В офисе никого нет в восемь вечера."},
            {"es": "En el frigorífico no hay leche.", "ru": "В холодильнике нет молока."},
            {"es": "En la plaza hay una fuente histórica; la fuente está en el centro.", "ru": "На площади есть исторический фонтан (hay); фонтан находится в центре (está)."},
            {"es": "¿Qué hay de comer hoy?", "ru": "Что есть поесть сегодня?"},
            {"es": "Hay mucho tráfico en la avenida.", "ru": "На проспекте сильное движение."},
            {"es": "En la habitación hay una cama grande y un armario.", "ru": "В комнате есть большая кровать и шкаф."},
            {"es": "¿Hay algún problema con la reserva?", "ru": "Есть какая-то проблема с бронированием?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Hay el libro en la mesa» с определенным артиклем",
                "correction": "Hay un libro en la mesa / El libro está en la mesa",
                "explanation": "После HAY категорически запрещено ставить определенные артикли (el/la/los/las)."
            },
            {
                "mistake": "«Han tres libros» попытка проспрягать во множественное число",
                "correction": "Hay tres libros (форма hay не меняется)",
                "explanation": "В значении «есть/имеется» форма HAY безлична и неизменна для любого числа предметов."
            },
            {
                "mistake": "«¿Dónde hay el banco?» смешение вопросов",
                "correction": "¿Dónde está el banco? (конкретный) vs ¿Hay un banco por aquí? (любой)",
                "explanation": "С вопросительным словом ¿Dónde? используется глагол ESTAR."
            }
        ],
        "trapAlert": "После HAY — только UN/UNA/UNOS/UNAS, числа или без артикля. НИКОГДА «el/la/los/las»!",
        "dialectNote": "В разговорной речи во всех испаноязычных странах вопрос «¿Qué hay?» часто используется как неформальное приветствие: «Привет! Как оно?» (аналог «¿Qué tal?»).",
        "quiz": [
            {
                "question": "С каким типом слов употребляется безличная форма HAY?",
                "type": "recognition",
                "options": ["С определенными артиклями (el/la)", "С неопределенными артиклями (un/una) и числами", "С притяжательными местоимениями (mi/tu)", "С именами собственными"],
                "correctIndex": 1,
                "explanations": [
                    "С определенными артиклями используется estar.",
                    "Правильно: HAY сочетается с un/una/unos/unas, числами, mucho/poco, nada/nadie.",
                    "С притяжательными используется estar (mi libro está...).",
                    "С именами используется estar (Carlos está...)."
                ]
            },
            {
                "question": "Меняется ли форма HAY во множественном числе?",
                "type": "recognition",
                "options": ["Да, становится «han»", "Нет, форма «hay» неизменна", "Да, становится «hayen»", "Да, становится «hayan»"],
                "correctIndex": 1,
                "explanations": [
                    "Форма «han» — это вспомогательный глагол времени (han hablado), но не наличие.",
                    "Правильно: форма «HAY» безлична и одинакова для ед. и мн. числа (hay un libro / hay diez libros).",
                    "Такой формы нет.",
                    "Неверно."
                ]
            },
            {
                "question": "Выберите правильную форму для вопроса о наличии аптеки поблизости:",
                "type": "recognition",
                "options": ["¿Dónde hay la farmacia?", "¿Hay una farmacia por aquí cerca?", "¿Está una farmacia aquí?", "¿Hay la farmacia?"],
                "correctIndex": 1,
                "explanations": [
                    "Смешение dónde и hay.",
                    "Правильно: «¿Hay una farmacia por aquí cerca?» (наличие неопределенного объекта).",
                    "С неопределенным артиклем estar не употребляется в вопросе о наличии.",
                    "После hay нельзя ставить la."
                ]
            },
            {
                "question": "Вставьте правильное слово: «El museo del Prado ____ en Madrid.»",
                "type": "recognition",
                "options": ["hay", "está", "es", "tiene"],
                "correctIndex": 1,
                "explanations": [
                    "Музей Прадо — конкретное известное здание, наличие через hay ошибочно.",
                    "Правильно: геолокация конкретного объекта — «está en Madrid».",
                    "Ser не используется для геолокации.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте форму: «En el salón ____ tres ventanas grandes.»",
                "type": "application",
                "options": ["está", "están", "hay", "es"],
                "correctIndex": 2,
                "explanations": [
                    "Está — ед. число.",
                    "Están выражало бы местоположение конкретных окон.",
                    "Правильно: «En el salón hay tres ventanas grandes» (наличие количества объектов).",
                    "Es — суть."
                ]
            },
            {
                "question": "Вставьте форму: «¿Dónde ____ mis llaves?»",
                "type": "application",
                "options": ["hay", "están", "está", "son"],
                "correctIndex": 1,
                "explanations": [
                    "С ¿Dónde? и конкретным «mis llaves» используется estar во множественном числе.",
                    "Правильно: «¿Dónde están mis llaves?» (конкретные ключи во мн. числе).",
                    "Ключи во множественном числе.",
                    "Ser не выражает местоположение."
                ]
            },
            {
                "question": "Вставьте артикль/слово: «En la cocina hay ____ (много) fruta.»",
                "type": "application",
                "options": ["la", "mucha", "mucho", "las"],
                "correctIndex": 1,
                "explanations": [
                    "Определенный артикль la после hay запрещен.",
                    "Правильно: «mucha fruta» (существительное женского рода).",
                    "Fruta женского рода.",
                    "Определенный артикль запрещен."
                ]
            },
            {
                "question": "Выберите предложение, составленное абсолютно верно:",
                "type": "application",
                "options": [
                    "En la mesa hay un libro; el libro está cerrado.",
                    "En la mesa está un libro; el libro hay cerrado.",
                    "En la mesa hay el libro; el libro es cerrado.",
                    "En la mesa tiene un libro; el libro está cerrado."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: сначала сообщаем о наличии (hay un libro), затем о состоянии конкретного предмета (el libro está cerrado).",
                    "Перепутаны позиции hay и está.",
                    "«Hay el libro» — грубая ошибка.",
                    "Tener требует подлежащего."
                ]
            },
            {
                "question": "Вы ищете банкомат на незнакомой улице. Как правильно спросить прохожего?",
                "type": "transfer",
                "options": [
                    "Disculpe, ¿hay un cajero automático por aquí cerca?",
                    "Disculpe, ¿dónde hay el cajero automático?",
                    "Disculpe, ¿está un cajero automático por aquí?",
                    "Disculpe, ¿hay el cajero automático?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Hay un cajero automático por aquí cerca?» (спрашиваем о наличии любого банкомата).",
                    "«Dónde hay el» — грамматическая ошибка.",
                    "Estar с неопределенным артиклем звучит неестественно.",
                    "Hay с определенным артиклем запрещено."
                ]
            },
            {
                "question": "Вам нужно сказать: «В холодильнике ничего нет, нам нужно пойти в супермаркет».",
                "type": "transfer",
                "options": [
                    "En la nevera no hay nada, tenemos que ir al supermercado.",
                    "En la nevera no está nada, somos que ir al supermercado.",
                    "En la nevera hay no nada, tenemos de ir.",
                    "En la nevera no tiene nada, estamos que ir."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «no hay nada (ничего нет) + tenemos que ir (должны пойти)».",
                    "Está nada — ошибка.",
                    "Неверный порядок слов.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Как описать свой город: «В моем городе есть много музеев, и главный музей находится в центре»?",
                "type": "transfer",
                "options": [
                    "En mi ciudad hay muchos museos y el museo principal está en el centro.",
                    "En mi ciudad están muchos museos y el museo principal hay en el centro.",
                    "En mi ciudad hay los museos y el museo principal es en el centro.",
                    "En mi ciudad son muchos museos y el museo está centro."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «hay muchos museos (наличие) y el museo principal está en el centro (локация конкретного музея)».",
                    "Перепутаны позиции.",
                    "«Hay los museos» — ошибка.",
                    "«Son muchos museos» — ошибка."
                ]
            },
            {
                "question": "Как спросить «Есть ли кто-нибудь дома?»?",
                "type": "transfer",
                "options": ["¿Hay alguien en casa?", "¿Está alguien en casa?", "¿Hay nadie en casa?", "¿Es alguien en casa?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Hay alguien en casa?» (наличие человека).",
                    "Estar менее употребительно с неопределенным «alguien».",
                    "Nadie — «никто» (в утвердительном вопросе используется alguien).",
                    "Ser — ошибка."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-10-01",
                "type": "choice",
                "question": "Какое слово выражает наличие предмета: «En la calle ____ una tienda»?",
                "options": ["hay", "está", "es", "tiene"],
                "correctAnswer": "hay",
                "explanation": "hay una tienda."
            },
            {
                "id": "ex-10-02",
                "type": "gap",
                "question": "En el parque ____ (имеется / есть) muchos niños jugando.",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "hay muchos niños."
            },
            {
                "id": "ex-10-03",
                "type": "tiles",
                "question": "Соберите предложение: «Здесь поблизости есть аптека?»",
                "tiles": ["¿Hay", "una", "farmacia", "por", "aquí", "cerca?"],
                "correctAnswer": "¿Hay una farmacia por aquí cerca?",
                "explanation": "¿Hay una farmacia por aquí cerca?"
            },
            {
                "id": "ex-10-04",
                "type": "transformation",
                "question": "Замените «hay» на глагол «estar» для конкретного предмета: «Hay una farmacia» → «La farmacia ____ en la esquina»",
                "prompt": "находится → ____",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "La farmacia está en la esquina."
            },
            {
                "id": "ex-10-05",
                "type": "input",
                "question": "Напишите безличную форму наличия «имеется / есть»:",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "hay."
            },
            {
                "id": "ex-10-06",
                "type": "gap",
                "question": "No ____ (нет никого) nadie en la sala de conferencias.",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "No hay nadie."
            },
            {
                "id": "ex-10-07",
                "type": "choice",
                "question": "Какое слово НЕЛЬЗЯ поставить после «HAY»?",
                "options": ["el libro", "un libro", "tres libros", "muchos libros"],
                "correctAnswer": "el libro",
                "explanation": "Определенный артикль «el libro» запрещен после hay."
            },
            {
                "id": "ex-10-08",
                "type": "input",
                "question": "Напишите форму глагола estar для «el banco»:",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "el banco está."
            },
            {
                "id": "ex-10-09",
                "type": "transformation",
                "question": "Сделайте фразу отрицательной: «Hay leche en la nevera» → «No ____ leche»",
                "prompt": "нет молока → ____",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "No hay leche."
            },
            {
                "id": "ex-10-10",
                "type": "tiles",
                "question": "Соберите предложение: «На столе лежат четыре книги.»",
                "tiles": ["En", "la", "mesa", "hay", "cuatro", "libros."],
                "correctAnswer": "En la mesa hay cuatro libros.",
                "explanation": "En la mesa hay cuatro libros."
            },
            {
                "id": "ex-10-11",
                "type": "gap",
                "question": "El hotel ____ (находится) cerca de la playa.",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "El hotel está."
            },
            {
                "id": "ex-10-12",
                "type": "choice",
                "question": "Что означает вопрос «¿Qué hay en el bolso?»?",
                "options": ["Что лежит в сумке?", "Где эта сумка?", "Какого цвета сумка?", "Сколько стоит сумка?"],
                "correctAnswer": "Что лежит в сумке?",
                "explanation": "«¿Qué hay...?» спрашивает о наличии предметов внутри."
            },
            {
                "id": "ex-10-13",
                "type": "input",
                "question": "Напишите отрицательную конструкцию «ничего нет» (no...):",
                "correctAnswer": "no hay nada",
                "acceptableAnswers": ["no hay nada", "No hay nada"],
                "explanation": "no hay nada."
            },
            {
                "id": "ex-10-14",
                "type": "transformation",
                "question": "Замените «HAY» на «ESTAR»: «En la plaza hay un banco» → «El banco ____ en la plaza»",
                "prompt": "находится → ____",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "El banco está en la plaza."
            },
            {
                "id": "ex-10-15",
                "type": "tiles",
                "question": "Соберите фразу: «В моем доме есть две спальни.»",
                "tiles": ["En", "mi", "casa", "hay", "dos", "dormitorios."],
                "correctAnswer": "En mi casa hay dos dormitorios.",
                "explanation": "En mi casa hay dos dormitorios."
            },
            {
                "id": "ex-10-16",
                "type": "gap",
                "question": "¿____ (есть ли кто-то) alguien en la oficina?",
                "correctAnswer": "Hay",
                "acceptableAnswers": ["Hay", "hay"],
                "explanation": "¿Hay alguien?"
            },
            {
                "id": "ex-10-17",
                "type": "choice",
                "question": "Какое предложение грамматически безупречно?",
                "options": ["En el centro hay muchos restaurantes.", "En el centro están muchos restaurantes.", "En el centro hay los restaurantes.", "En el centro son muchos restaurantes."],
                "correctAnswer": "En el centro hay muchos restaurantes.",
                "explanation": "hay muchos restaurantes."
            },
            {
                "id": "ex-10-18",
                "type": "input",
                "question": "Напишите форму глагола estar для «las llaves» (во множественном числе):",
                "correctAnswer": "están",
                "acceptableAnswers": ["están", "estan", "Están"],
                "explanation": "las llaves están."
            },
            {
                "id": "ex-10-19",
                "type": "gap",
                "question": "En la avenida ____ (имеется) mucho tráfico hoy.",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "hay mucho tráfico."
            },
            {
                "id": "ex-10-20",
                "type": "tiles",
                "question": "Соберите вопрос: «Что есть в меню сегодня?»",
                "tiles": ["¿Qué", "hay", "en", "el", "menú", "hoy?"],
                "correctAnswer": "¿Qué hay en el menú hoy?",
                "explanation": "¿Qué hay en el menú hoy?"
            },
            {
                "id": "ex-10-21",
                "type": "choice",
                "question": "Как ответить «Никого нет» на вопрос «¿Hay alguien?»?",
                "options": ["No hay nadie.", "No está nadie.", "Hay nadie.", "No hay nada."],
                "correctIndex": 0,
                "correctAnswer": "No hay nadie.",
                "explanation": "No hay nadie."
            },
            {
                "id": "ex-10-22",
                "type": "transformation",
                "question": "Преобразуйте в отрицание: «Hay problemas» → «No ____ problemas»",
                "prompt": "нет проблем → ____",
                "correctAnswer": "hay",
                "acceptableAnswers": ["hay", "Hay"],
                "explanation": "No hay problemas."
            },
            {
                "id": "ex-10-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет hay, притяжательные местоимения и семью?",
                "options": [
                    "En la casa de mis abuelos hay un gran jardín con árboles.",
                    "En la casa de mis abuelos está un gran jardín con árboles.",
                    "En el mi casa de abuelos hay el jardín.",
                    "En la casa de mis abuelos son un jardín."
                ],
                "correctAnswer": "En la casa de mis abuelos hay un gran jardín con árboles.",
                "explanation": "Mis abuelos (притяж.) + hay un gran jardín (наличие)."
            },
            {
                "id": "ex-10-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «В комнате есть стол и кровать»:",
                "correctAnswer": "En la habitación hay una mesa y una cama",
                "acceptableAnswers": [
                    "En la habitación hay una mesa y una cama",
                    "En la habitacion hay una mesa y una cama",
                    "Hay una mesa y una cama en la habitación"
                ],
                "explanation": "En la habitación hay una mesa y una cama."
            }
        ],
        "miniScenario": {
            "title": "Поиск услуг в незнакомом районе",
            "setting": "Улица в центре Малаги.",
            "situation": "Вы только что приехали в город и ищете супермаркет и станцию метро.",
            "dialog": [
                {"speaker": "Tú", "text": "Disculpe, buenas tardes. ¿Hay un supermercado por aquí cerca?"},
                {"speaker": "Transeúnte", "text": "Sí, hay un supermercado en la próxima calle a la derecha."},
                {"speaker": "Tú", "text": "¿Y la estación de metro dónde está?"},
                {"speaker": "Transeúnte", "text": "La estación de metro está al final de la avenida, enfrente del parque."},
                {"speaker": "Tú", "text": "Muchas gracias por su ayuda."}
            ],
            "task": "Спросите прохожего о наличии супермаркета и месте станции метро.",
            "prompt": "Как спросить: «Здесь есть супермаркет и где станция метро?»?",
            "options": [
                "¿Hay un supermercado cerca y dónde está el metro?",
                "¿Dónde hay el supermercado y qué está el metro?",
                "¿Está un supermercado y hay el metro?",
                "¿Tiene un supermercado y es el metro?"
            ],
            "correctIndex": 0,
            "explanation": "«¿Hay un supermercado (наличие любого) y dónde está el metro (локация конкретного)?» — идеальное владение грамматикой."
        },
        "shortText": {
            "title": "El nuevo barrio de Carmen",
            "text": "Carmen vive en un barrio nuevo y moderno en las afueras de Valencia. En el barrio hay muchas zonas verdes, dos colegios y un centro de salud. También hay una plaza grande con cafeterías y tiendas de ropa. La parada de autobús está justo delante de su edificio, y la estación de tren está a diez minutos a pie. Carmen está muy contenta porque en su barrio no hay mucho ruido.",
            "questions": [
                {
                    "question": "¿Qué servicios e instalaciones hay en el barrio de Carmen?",
                    "options": ["Solo fábricas y oficinas", "Zonas verdes, colegios, centro de salud y cafeterías", "Un aeropuerto grande", "Solo un hotel"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «hay muchas zonas verdes, dos colegios y un centro de salud...»."
                },
                {
                    "question": "¿Dónde está la parada de autobús?",
                    "options": ["A diez kilómetros", "Justo delante de su edificio", "En otra ciudad", "Dentro del colegio"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «La parada de autobús está justo delante de su edificio»."
                },
                {
                    "question": "¿Por qué está contenta Carmen con su barrio?",
                    "options": ["Porque es muy caro", "Porque no hay mucho ruido", "Porque no hay transporte", "Porque trabaja allí"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «porque en su barrio no hay mucho ruido»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание моего района и квартиры (HAY vs ESTAR)",
            "prompt": "Напишите короткий текст (4-5 предложений), описывая ваш район или дом:\n1. Напишите, что есть в вашем районе через HAY (En mi barrio hay parques, tiendas, cafeterías...).\n2. Напишите, чего в нем НЕТ через NO HAY (No hay mucho ruido / no hay fábricas...).\n3. Укажите местоположение конкретного объекта через ESTAR (El supermercado/la estación está cerca de mi casa).\n4. Опишите свою квартиру через HAY (En mi piso hay tres habitaciones...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Различение HAY и ESTAR", "points": 40, "description": "Безошибочное использование HAY для наличия и ESTAR для местоположения конкретных объектов."},
                    {"name": "Лексика города и дома", "points": 25, "description": "Слова barrio, parque, tienda, farmacia, parada, edificio, habitaciones."},
                    {"name": "Грамматическая правильность", "points": 20, "description": "Согласование неопределенных артиклей и предлогов места."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 15: Prepositions of place (en/sobre/debajo de)
    # ----------------------------------------------------
    15: {
        "id": 15,
        "topicName": "Prepositions of place (en/sobre/debajo de)",
        "russianTitle": "Предлоги места и пространственной ориентации",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u08-home",
        "icon": "🧭",
        "summary": "Как указать точное пространственное положение предметов и людей: предлоги и предложные конструкции места (en, sobre / encima de, debajo de, delante de, detrás de, al lado de, entre, enfrente de, a la derecha / a la izquierda).",
        "mnemonicRule": "Большинство предлогов требуют «DE»: debajo DE, encima DE, delante DE, detrás DE, al lado DE, enfrente DE. Без «de»: EN, SOBRE, ENTRE.",
        "goalsRu": [
            "Использовать базовые предлоги места: en (в/на), sobre (на/над), entre (между)",
            "Использовать составные предлоги с «de»: encima de, debajo de, delante de, detrás de, al lado de, enfrente de",
            "Указывать направление: a la derecha (справа), a la izquierda (слева), al final de (в конце)",
            "Учитывать обязательное слияние de + el = del: al lado del banco, debajo del sofá"
        ],
        "sections": [
            {
                "title": "1. Таблица предлогов и конструкций места",
                "content": "Обратите внимание на обязательное слияние «de + el = DEL»:",
                "tables": [
                    {
                        "headers": ["Испанский предлог", "Русский перевод", "Пример", "Перевод примера"],
                        "rows": [
                            ["en", "в / на (внутри или на поверхности)", "El libro está en la mesa.", "Книга на столе."],
                            ["sobre / encima de", "на / сверху над", "Las llaves están encima de la mesa.", "Ключи на столе."],
                            ["debajo de", "под", "El gato duerme debajo de la cama.", "Кот спит под кроватью."],
                            ["delante de", "перед / впереди", "La parada está delante del hotel.", "Остановка перед отелем."],
                            ["detrás de", "за / позади", "El jardín está detrás de la casa.", "Сад позади дома."],
                            ["al lado de", "рядом с / около", "La farmacia está al lado del banco.", "Аптека рядом с банком."],
                            ["enfrente de", "напротив", "El museo está enfrente del parque.", "Музей напротив парка."],
                            ["entre", "между (двумя объектами)", "El cine está entre el banco y el café.", "Кинотеатр между банком и кафе."],
                            ["a la derecha (de)", "справа (от)", "El baño está a la derecha.", "Туалет справа."],
                            ["a la izquierda (de)", "слева (от)", "La cocina está a la izquierda.", "Кухня слева."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "El gato duerme tranquilamente debajo del sofá.", "ru": "Кот спокойно спит под диваном (debajo de + el = del)."},
            {"es": "El ordenador está encima del escritorio.", "ru": "Компьютер стоит на письменном столе."},
            {"es": "La parada de autobús está delante de la escuela.", "ru": "Остановка автобуса находится перед школой."},
            {"es": "El coche está aparcado detrás del edificio.", "ru": "Машина припаркована за зданием."},
            {"es": "La farmacia está al lado de la panadería.", "ru": "Аптека находится рядом с булочной."},
            {"es": "El hotel está enfrente de la estación de tren.", "ru": "Отель находится напротив железнодорожного вокзала."},
            {"es": "España está entre Francia y Portugal.", "ru": "Испания находится между Францией и Португалией."},
            {"es": "Gira a la derecha en la esquina.", "ru": "Поверни направо на углу."},
            {"es": "El libro está sobre la mesa de noche.", "ru": "Книга лежит на прикроватной тумбочке."},
            {"es": "Las llaves están dentro del bolso.", "ru": "Ключи внутри сумки."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Debajo el sofá» без предлога «de»",
                "correction": "debajo del sofá (debajo + de + el = del)",
                "explanation": "Составные предлоги места обязательно требуют связку «de»: debajo de, encima de, delante de."
            },
            {
                "mistake": "«Al lado de el banco» без слияния",
                "correction": "al lado del banco",
                "explanation": "Слияние de + el = DEL обязательно в испанском языке."
            },
            {
                "mistake": "«Entre de dos casas» с лишним предлогом «de»",
                "correction": "entre dos casas (без de!)",
                "explanation": "Предлог «entre» (между) используется напрямую без частицы «de»."
            }
        ],
        "trapAlert": "Всегда помните слияние: «al lado DE + EL = al lado DEL»!",
        "dialectNote": "Вместо «enfrente de» в Латинской Америке также часто говорят «frente a» («Frente al parque»). Оба варианта нормативны.",
        "quiz": [
            {
                "question": "Какой предлог означает «под» чем-либо?",
                "type": "recognition",
                "options": ["encima de", "debajo de", "delante de", "detrás de"],
                "correctIndex": 1,
                "explanations": [
                    "Encima de = сверху / на.",
                    "Правильно: «debajo de» = под.",
                    "Delante de = перед.",
                    "Detrás de = сзади."
                ]
            },
            {
                "question": "Какой предлог означает «между двумя предметами»?",
                "type": "recognition",
                "options": ["entre", "sobre", "en", "al lado de"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «entre» = между.",
                    "Sobre = на/над.",
                    "En = в/на.",
                    "Al lado de = рядом с."
                ]
            },
            {
                "question": "Какое слияние образуется во фразе «al lado de + el cine»?",
                "type": "recognition",
                "options": ["al lado de el cine", "al lado del cine", "al lado al cine", "al lado de la cine"],
                "correctIndex": 1,
                "explanations": [
                    "Раздельное написание запрещено.",
                    "Правильно: de + el сливается в «del»: «al lado del cine».",
                    "Неверный предлог.",
                    "Cine мужского рода."
                ]
            },
            {
                "question": "Что означает фраза «El coche está detrás de la casa»?",
                "type": "recognition",
                "options": ["Машина перед домом", "Машина за домом (позади дома)", "Машина внутри дома", "Машина рядом с домом"],
                "correctIndex": 1,
                "explanations": [
                    "Перед домом — delante de la casa.",
                    "Правильно: «detrás de» означает «позади / за».",
                    "Внутри — dentro de.",
                    "Рядом — al lado de."
                ]
            },
            {
                "question": "Вставьте предлог: «El gato está escondido ____ (под) la mesa.»",
                "type": "application",
                "options": ["encima de", "debajo de", "delante de", "sobre"],
                "correctIndex": 1,
                "explanations": [
                    "Encima de = на столе.",
                    "Правильно: «debajo de la mesa» (под столом).",
                    "Delante de = перед столом.",
                    "Sobre = на столе."
                ]
            },
            {
                "question": "Вставьте правильную форму слияния: «La farmacia está enfrente ____ (de + el) parque.»",
                "type": "application",
                "options": ["de el", "del", "al", "en el"],
                "correctIndex": 1,
                "explanations": [
                    "«De el» не пишется раздельно.",
                    "Правильно: «enfrente del parque» (de + el = del).",
                    "Al означает направление.",
                    "En el — ошибка связки."
                ]
            },
            {
                "question": "Вставьте предлог: «El cine está ____ el banco y la cafetería.»",
                "type": "application",
                "options": ["entre", "debajo de", "detrás de", "encima de"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «entre» (между двумя объектами).",
                    "Debajo de = под.",
                    "Detrás de = сзади.",
                    "Encima de = сверху."
                ]
            },
            {
                "question": "Вставьте предлог направления: «Gira a la ____ (направо) en el semáforo.»",
                "type": "application",
                "options": ["derecha", "izquierda", "recto", "lado"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «a la derecha» (направо).",
                    "A la izquierda = налево.",
                    "Recto = прямо.",
                    "Lado = сторона."
                ]
            },
            {
                "question": "Вы не можете найти свои очки. Друг говорит: «Están encima de la mesa». Где очки?",
                "type": "transfer",
                "options": ["Под столом", "На столе (сверху)", "Внутри стола", "За столом"],
                "correctIndex": 1,
                "explanations": [
                    "Под столом — debajo de la mesa.",
                    "Правильно: «encima de la mesa» = на столе / сверху на столе.",
                    "Внутри — dentro de la mesa.",
                    "За столом — detrás de la mesa."
                ]
            },
            {
                "question": "Как объяснить прохожему: «Банк находится прямо напротив музея»?",
                "type": "transfer",
                "options": [
                    "El banco está justo enfrente del museo.",
                    "El banco está debajo del museo.",
                    "El banco está detrás al museo.",
                    "El banco está entre el museo solo."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «enfrente del museo» (напротив музея).",
                    "Debajo — под.",
                    "Detrás al — неграмотный предлог.",
                    "Entre требует двух объектов."
                ]
            },
            {
                "question": "В гостинице вы спрашиваете, где туалет. Администратор отвечает: «Al final del pasillo, a la izquierda». Что это значит?",
                "type": "transfer",
                "options": [
                    "В конце коридора, налево",
                    "В начале коридора, направо",
                    "На втором этаже, прямо",
                    "Рядом с лифтом, направо"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: al final del pasillo (в конце коридора) + a la izquierda (налево).",
                    "Неверно.",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Как описать расположение картины в комнате: «Картина висит на стене над диваном»?",
                "type": "transfer",
                "options": [
                    "El cuadro está en la pared, encima del sofá.",
                    "El cuadro está debajo del sofá en la pared.",
                    "El cuadro está entre el sofá solo.",
                    "El cuadro está detrás del sofá en el suelo."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «en la pared, encima del sofá» (на стене, над диваном).",
                    "Debajo = под.",
                    "Entre требует 2 объекта.",
                    "Detrás = позади."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-15-01",
                "type": "choice",
                "question": "Какой предлог означает «напротив»?",
                "options": ["enfrente de", "al lado de", "debajo de", "detrás de"],
                "correctAnswer": "enfrente de",
                "explanation": "enfrente de = напротив."
            },
            {
                "id": "ex-15-02",
                "type": "gap",
                "question": "El perro duerme debajo ____ (предлог) la mesa.",
                "correctAnswer": "de",
                "acceptableAnswers": ["de", "De"],
                "explanation": "debajo de."
            },
            {
                "id": "ex-15-03",
                "type": "tiles",
                "question": "Соберите предложение: «Ключи лежат на столе.»",
                "tiles": ["Las", "llaves", "están", "encima", "de", "la", "mesa."],
                "correctAnswer": "Las llaves están encima de la mesa.",
                "explanation": "Las llaves están encima de la mesa."
            },
            {
                "id": "ex-15-04",
                "type": "transformation",
                "question": "Объедините предлог de и артикль el: «delante de + el hotel» → «delante ____ hotel»",
                "prompt": "de + el → ____",
                "correctAnswer": "del",
                "acceptableAnswers": ["del", "Del"],
                "explanation": "delante del hotel."
            },
            {
                "id": "ex-15-05",
                "type": "input",
                "question": "Напишите по-испански предлог «между»:",
                "correctAnswer": "entre",
                "acceptableAnswers": ["entre", "Entre"],
                "explanation": "entre."
            },
            {
                "id": "ex-15-06",
                "type": "gap",
                "question": "La farmacia está al lado ____ (de + el) supermercado.",
                "correctAnswer": "del",
                "acceptableAnswers": ["del", "Del"],
                "explanation": "al lado del supermercado."
            },
            {
                "id": "ex-15-07",
                "type": "choice",
                "question": "Что означает «a la izquierda»?",
                "options": ["налево / слева", "направо / справа", "прямо", "сзади"],
                "correctAnswer": "налево / слева",
                "explanation": "a la izquierda = налево."
            },
            {
                "id": "ex-15-08",
                "type": "input",
                "question": "Напишите по-испански «направо / справа»:",
                "correctAnswer": "a la derecha",
                "acceptableAnswers": ["a la derecha", "derecha", "A la derecha"],
                "explanation": "a la derecha."
            },
            {
                "id": "ex-15-09",
                "type": "transformation",
                "question": "Поставьте антоним: «delante de la casa» → «____ de la casa» (позади)",
                "prompt": "сзади → ____",
                "correctAnswer": "detrás",
                "acceptableAnswers": ["detrás", "detras", "Detrás"],
                "explanation": "detrás de."
            },
            {
                "id": "ex-15-10",
                "type": "tiles",
                "question": "Соберите фразу: «Больница находится рядом с банком.»",
                "tiles": ["El", "hospital", "está", "al", "lado", "del", "banco."],
                "correctAnswer": "El hospital está al lado del banco.",
                "explanation": "El hospital está al lado del banco."
            },
            {
                "id": "ex-15-11",
                "type": "gap",
                "question": "El coche está aparcado ____ (за / позади) del edificio.",
                "correctAnswer": "detrás",
                "acceptableAnswers": ["detrás", "detras", "Detrás"],
                "explanation": "detrás del edificio."
            },
            {
                "id": "ex-15-12",
                "type": "choice",
                "question": "Где находится Испания по отношению к Франции и Португалии?",
                "options": ["entre Francia y Portugal", "debajo de Portugal", "encima de Francia", "dentro de Francia"],
                "correctAnswer": "entre Francia y Portugal",
                "explanation": "entre Francia y Portugal."
            },
            {
                "id": "ex-15-13",
                "type": "input",
                "question": "Напишите предлог «на / над» (из 5 букв, синоним encima de):",
                "correctAnswer": "sobre",
                "acceptableAnswers": ["sobre", "Sobre"],
                "explanation": "sobre."
            },
            {
                "id": "ex-15-14",
                "type": "transformation",
                "question": "Замените «sobre la mesa» на составной предлог: «____ de la mesa»",
                "prompt": "наверху / на → ____",
                "correctAnswer": "encima",
                "acceptableAnswers": ["encima", "Encima"],
                "explanation": "encima de la mesa."
            },
            {
                "id": "ex-15-15",
                "type": "tiles",
                "question": "Соберите предложение: «Музей находится напротив парка.»",
                "tiles": ["El", "museo", "está", "enfrente", "del", "parque."],
                "correctAnswer": "El museo está enfrente del parque.",
                "explanation": "El museo está enfrente del parque."
            },
            {
                "id": "ex-15-16",
                "type": "gap",
                "question": "La parada de metro está justo ____ (перед) de la estación.",
                "correctAnswer": "delante",
                "acceptableAnswers": ["delante", "Delante", "enfrente"],
                "explanation": "delante de la estación."
            },
            {
                "id": "ex-15-17",
                "type": "choice",
                "question": "Как сказать «в конце коридора»?",
                "options": ["al final del pasillo", "al lado del pasillo", "debajo del pasillo", "entre el pasillo"],
                "correctAnswer": "al final del pasillo",
                "explanation": "al final del pasillo."
            },
            {
                "id": "ex-15-18",
                "type": "input",
                "question": "Напишите по-испански «под» (debajo...):",
                "correctAnswer": "debajo de",
                "acceptableAnswers": ["debajo de", "debajo", "Debajo de", "bajo"],
                "explanation": "debajo de."
            },
            {
                "id": "ex-15-19",
                "type": "gap",
                "question": "El libro está ____ (внутри) del bolso.",
                "correctAnswer": "dentro",
                "acceptableAnswers": ["dentro", "Dentro"],
                "explanation": "dentro del bolso."
            },
            {
                "id": "ex-15-20",
                "type": "tiles",
                "question": "Соберите фразу: «Туалет находится справа от кухни.»",
                "tiles": ["El", "baño", "está", "a", "la", "derecha", "de", "la", "cocina."],
                "correctAnswer": "El baño está a la derecha de la cocina.",
                "explanation": "El baño está a la derecha de la cocina."
            },
            {
                "id": "ex-15-21",
                "type": "choice",
                "question": "Какое предложение верно по слиянию предлогов?",
                "options": ["La parada está al lado del banco.", "La parada está al lado de el banco.", "La parada está al lado al banco.", "La parada está a el lado de banco."],
                "correctAnswer": "La parada está al lado del banco.",
                "explanation": "al lado del banco."
            },
            {
                "id": "ex-15-22",
                "type": "transformation",
                "question": "Поставьте антоним: «a la derecha» → «a la ____» (налево)",
                "prompt": "налево → ____",
                "correctAnswer": "izquierda",
                "acceptableAnswers": ["izquierda", "Izquierda"],
                "explanation": "a la izquierda."
            },
            {
                "id": "ex-15-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет предлоги места, конструкцию hay и мебель?",
                "options": [
                    "En el dormitorio hay una cama y la lámpara está encima de la mesa de noche.",
                    "En el dormitorio está una cama y la lámpara hay en la mesa.",
                    "En el dormitorio hay la cama y la lámpara es encima de la mesa.",
                    "En el dormitorio son una cama y la lámpara está debajo."
                ],
                "correctAnswer": "En el dormitorio hay una cama y la lámpara está encima de la mesa de noche.",
                "explanation": "Hay una cama (наличие) + la lámpara está encima de la mesa (предлог места)."
            },
            {
                "id": "ex-15-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Кот спит под диваном в гостиной»:",
                "correctAnswer": "El gato duerme debajo del sofá en el salón",
                "acceptableAnswers": [
                    "El gato duerme debajo del sofá en el salón",
                    "El gato duerme debajo del sofa en el salon",
                    "El gato está debajo del sofá en el salón"
                ],
                "explanation": "El gato duerme debajo del sofá en el salón."
            }
        ],
        "miniScenario": {
            "title": "Ориентирование в новом здании университета",
            "setting": "Холл факультета филологии в Мадриде.",
            "situation": "Вы впервые пришли на факультет и ищете библиотеку и деканат.",
            "dialog": [
                {"speaker": "Tú", "text": "Disculpe, ¿dónde está la biblioteca de la facultad?"},
                {"speaker": "Estudiante", "text": "La biblioteca está en el segundo piso, al final del pasillo a la derecha."},
                {"speaker": "Tú", "text": "¿Y la secretaría?"},
                {"speaker": "Estudiante", "text": "La secretaría está en la planta baja, justo enfrente de la entrada principal."},
                {"speaker": "Tú", "text": "Muchas gracias por las indicaciones."}
            ],
            "task": "Спросите у студента, где находится библиотека.",
            "prompt": "Как спросить: «Где находится библиотека факультета?»?",
            "options": [
                "¿Dónde está la biblioteca de la facultad?",
                "¿Qué hay la biblioteca de la facultad?",
                "¿Dónde hay la biblioteca?",
                "¿A qué hora está la biblioteca de lugar?"
            ],
            "correctIndex": 0,
            "explanation": "«¿Dónde está la biblioteca de la facultad?» — точный вопрос о местоположении."
        },
        "shortText": {
            "title": "La distribución de la casa de Alejandro",
            "text": "La casa de Alejandro tiene una distribución muy cómoda. Al entrar, el salón está a la izquierda y la cocina está a la derecha. En el salón hay un sofá grande y, delante del sofá, hay una mesa baja de madera. La televisión está enfrente del sofá. Al lado de la cocina hay una terraza luminosa con muchas plantas. Los dos dormitorios están al final del pasillo, entre el baño principal y el estudio.",
            "questions": [
                {
                    "question": "¿Dónde está la cocina al entrar en la casa?",
                    "options": ["Al final del pasillo", "A la derecha", "A la izquierda", "Debajo de la escalera"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «la cocina está a la derecha»."
                },
                {
                    "question": "¿Qué hay delante del sofá en el salón?",
                    "options": ["Una televisión grande", "Una mesa baja de madera", "La terraza", "La cama"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «delante del sofá, hay una mesa baja de madera»."
                },
                {
                    "question": "¿Dónde están los dos dormitorios?",
                    "options": ["En la terraza", "Al final del pasillo, entre el baño y el estudio", "Delante de la entrada", "En la cocina"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «al final del pasillo, entre el baño principal y el estudio»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Схема расположения предметов в комнате",
            "prompt": "Напишите короткий гид по вашей комнате (4-5 предложений), используя разнообразные предлоги места:\n1. Опишите, где стоит кровать и шкаф (La cama está al lado de..., el armario está a la derecha...).\n2. Опишите рабочий стол и предметы на нем (El ordenador está encima del escritorio...).\n3. Укажите, что находится под столом или кроватью (Debajo de la mesa hay...).\n4. Опишите вид из окна или расположение относительно двери (La ventana está enfrente de la puerta...).\n5. Используйте минимум 4 различных предлога места (encima de, debajo de, al lado de, enfrente de, entre).",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование предлогов места", "points": 35, "description": "Правильное употребление encima de, debajo de, al lado de, enfrente de, entre, delante de, detrás de."},
                    {"name": "Слияние de + el = del", "points": 25, "description": "Безошибочное использование слияния del (del sofá, del escritorio, del armario)."},
                    {"name": "Лексика мебели и комнаты", "points": 25, "description": "Слова mesa, cama, silla, armario, sofá, puerta, ventana, pasillo."},
                    {"name": "Связность и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 26: House and furniture (la casa)
    # ----------------------------------------------------
    26: {
        "id": 26,
        "topicName": "House and furniture (la casa)",
        "russianTitle": "Дом, комнаты и мебель (la casa y los muebles)",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u08-home",
        "icon": "🏠",
        "summary": "Лексика для описания жилья: типы жилья (casa, apartamento, piso), комнаты (salón, cocina, dormitorio, baño, terraza, pasillo) и предметы мебели (mesa, silla, cama, sofá, armario, estantería, lámpara, espejo).",
        "mnemonicRule": "PISO в Испании = квартира и этаж (Vivo en un piso en el tercer piso). В Лат. Америке чаще «apartamento» или «departamento».",
        "goalsRu": [
            "Называть типы жилья и этажи (casa, apartamento, piso, planta baja, primer piso)",
            "Знать названия всех комнат в доме (salón, cocina, dormitorio, baño, comedor, terraza, jardín, garaje)",
            "Называть основную мебель и бытовую технику (cama, mesa, silla, sofá, armario, lámpara, nevera, lavadora)",
            "Описывать интерьер и комфорт жилья (luminoso, amplio, acogedor, ruidoso, tranquilo)"
        ],
        "sections": [
            {
                "title": "1. Комнаты и зоны в доме",
                "content": "Основные помещения жилого дома или квартиры:",
                "tables": [
                    {
                        "headers": ["Комната (испанский)", "Род", "Русский перевод", "Что там находится"],
                        "rows": [
                            ["el salón", "муж.", "гостиная / зал", "el sofá, el televisor, los sillones"],
                            ["el dormitorio / la habitación", "муж./жен.", "спальня / комната", "la cama, las mesitas de noche, el armario"],
                            ["la cocina", "жен.", "кухня", "la nevera, el horno, la lavadora"],
                            ["el baño", "муж.", "ванная комната / туалет", "la ducha, el espejo, el lavabo"],
                            ["el comedor", "муж.", "столовая", "la mesa grande, las sillas"],
                            ["la terraza / el balcón", "жен./муж.", "терраса / балкон", "las plantas, la mesa pequeña"],
                            ["el pasillo", "муж.", "коридор", "las puertas, los cuadros"],
                            ["el jardín", "муж.", "сад", "los árboles, el césped, las flores"],
                            ["el garaje", "муж.", "гараж", "el coche, las bicicletas"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Мебель и предметы интерьера",
                "content": "Базовые названия предметов обстановки:",
                "tables": [
                    {
                        "headers": ["Предмет мебели", "Род", "Русский перевод", "Пример"],
                        "rows": [
                            ["la cama", "жен.", "кровать", "La cama es muy cómoda."],
                            ["la mesa", "жен.", "стол", "El libro está en la mesa."],
                            ["la silla", "жен.", "стул", "Siéntate en esta silla."],
                            ["el sofá", "муж. (искл.!)", "диван", "El sofá es de color gris."],
                            ["el sillón", "муж.", "кресло", "El abuelo lee en el sillón."],
                            ["el armario", "муж.", "шкаф", "Guardo la ropa en el armario."],
                            ["la estantería", "жен.", "полка / стеллаж", "Los libros están en la estantería."],
                            ["la lámpara", "жен.", "лампа", "La lámpara da mucha luz."],
                            ["el espejo", "муж.", "зеркало", "Me miro en el espejo del baño."],
                            ["la nevera / frigorífico", "жен./муж.", "холодильник", "La leche está en la nevera."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Mi apartamento tiene dos dormitorios, un salón y una cocina.", "ru": "В моей квартире две спальни, гостиная и кухня."},
            {"es": "El salón es muy luminoso porque tiene dos ventanas grandes.", "ru": "Гостиная очень светлая, потому что в ней два больших окна."},
            {"es": "Guardo toda mi ropa en el armario del dormitorio.", "ru": "Я храню всю свою одежду в шкафу в спальне."},
            {"es": "El sofá del salón es cómodo y de color azul.", "ru": "Диван в гостиной удобный и синего цвета."},
            {"es": "Cocinamos platos deliciosos en la cocina moderna.", "ru": "Мы готовим вкусные блюда на современной кухне."},
            {"es": "En el balcón hay muchas plantas y flores bonitas.", "ru": "На балконе много красивых растений и цветов."},
            {"es": "El baño tiene una ducha amplia y un espejo grande.", "ru": "В ванной есть просторный душ и большое зеркало."},
            {"es": "Vivo en una casa de campo con jardín y garaje.", "ru": "Я живу в загородном доме с садом и гаражом."},
            {"es": "La nevera está llena de comida fresca.", "ru": "Холодильник полон свежей еды."},
            {"es": "¿En qué piso vives? —Vivo en el cuarto piso.", "ru": "На каком этаже ты живешь? —Я живу на четвертом этаже."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«La sofá» из-за окончания -a",
                "correction": "el sofá / los sofás",
                "explanation": "Слово «sofá» — мужского рода (el sofá), несмотря на окончание -á."
            },
            {
                "mistake": "«Vivo en piso tres» без порядкового числительного и артикля",
                "correction": "Vivo en el tercer piso",
                "explanation": "Для этажей используется порядковое числительное с артиклем: en el primer / segundo / tercer / cuarto piso."
            },
            {
                "mistake": "«Dormitorio de cama» вместо «la habitación / el dormitorio»",
                "correction": "el dormitorio / la habitación",
                "explanation": "Спальня по-испански называется «el dormitorio»."
            }
        ],
        "trapAlert": "Слово «SOFÁ» — МУЖСКОГО рода: «EL sofá cómodo», «LOS sofás grandes»!",
        "dialectNote": "Холодильник в Испании называют «la nevera / el frigorífico», в Аргентине и Уругвае — «la heladera», в Мексике и Колумбии — «el refrigerador».",
        "quiz": [
            {
                "question": "Какого рода слово «sofá» в испанском языке?",
                "type": "recognition",
                "options": ["Мужского (el sofá)", "Женского (la sofá)", "Среднего", "Обоих родов"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el sofá» — существительное мужского рода (исключение на -á).",
                    "«La sofá» — распространенная ошибка.",
                    "Среднего рода нет в испанских существительных.",
                    "Неверно."
                ]
            },
            {
                "question": "В какой комнате обычно спит человек?",
                "type": "recognition",
                "options": ["en la cocina", "en el dormitorio", "en el baño", "en el garaje"],
                "correctIndex": 1,
                "explanations": [
                    "Кухня.",
                    "Правильно: «en el dormitorio» (в спальне).",
                    "Ванная.",
                    "Гараж."
                ]
            },
            {
                "question": "Где хранится скоропортящаяся еда (молоко, сыр, мясо)?",
                "type": "recognition",
                "options": ["en el armario", "en la nevera", "en la estantería", "en el sofá"],
                "correctIndex": 1,
                "explanations": [
                    "Шкаф для одежды/посуды.",
                    "Правильно: «en la nevera» (в холодильнике).",
                    "Полка для книг.",
                    "Диван."
                ]
            },
            {
                "question": "Что означает испанское слово «el piso» в Испании?",
                "type": "recognition",
                "options": ["Только пол", "Квартира и этаж", "Только крыша", "Загородный дом"],
                "correctIndex": 1,
                "explanations": [
                    "Пол — el suelo.",
                    "Правильно: в Испании «un piso» означает квартиру, а также этаж здания (el segundo piso).",
                    "Крыша — el tejado.",
                    "Загородный дом — la casa de campo."
                ]
            },
            {
                "question": "Вставьте артикль: «Me siento en ____ (диван) cómodo.»",
                "type": "application",
                "options": ["el", "la", "las", "una"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el sofá» (мужской род).",
                    "«La sofá» — ошибка.",
                    "Множественное число.",
                    "Una — женский род."
                ]
            },
            {
                "question": "Вставьте название мебели: «Guardo los libros en la ____ (книжная полка).»",
                "type": "application",
                "options": ["estantería", "nevera", "cama", "ducha"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «la estantería» — стеллаж / книжная полка.",
                    "Холодильник.",
                    "Кровать.",
                    "Душ."
                ]
            },
            {
                "question": "Как сказать «Я живу на третьем этаже»?",
                "type": "application",
                "options": ["Vivo en el tercer piso.", "Vivo en el tres piso.", "Vivo en piso tercero de tres.", "Vivo de tercer piso."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «en el tercer piso» (tercer — усеченная форма tercero перед муж. родом).",
                    "«Tres piso» — ошибка.",
                    "Неграмотно.",
                    "Неверный предлог."
                ]
            },
            {
                "question": "Выберите правильное сочетание существительного и прилагательного:",
                "type": "application",
                "options": ["un dormitorio luminoso", "una dormitorio luminosa", "un dormitorio luminosa", "una cocina luminoso"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «un dormitorio luminoso» (мужской род).",
                    "Dormitorio мужского рода.",
                    "Несогласованность окончания.",
                    "Cocina женского рода (una cocina luminosa)."
                ]
            },
            {
                "question": "Вы снимаете квартиру в Мадриде и хотите описать ее другу: «В ней 2 спальни, кухня и большой балкон».",
                "type": "transfer",
                "options": [
                    "Tiene dos dormitorios, una cocina y un balcón grande.",
                    "Es dos dormitorios, una cocina y un balcón grande.",
                    "Está dos dormitorios, la cocina y una balcón grande.",
                    "Lleva dos dormitorios y mucho balcón."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Tiene dos dormitorios, una cocina y un balcón grande» (глагол tener для состава комнат).",
                    "Глагол ser не используется для состава комнат.",
                    "Estar не используется для наличия комнат.",
                    "Llevar не подходит."
                ]
            },
            {
                "question": "Как сказать гостю в доме: «Проходи в гостиную и садись на диван»?",
                "type": "transfer",
                "options": [
                    "Pasa al salón y siéntate en el sofá.",
                    "Pasa a la cocina y siéntate en la nevera.",
                    "Pasa al baño y duerme en la cama.",
                    "Pasa al garaje y siéntate en el cuadro."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Pasa al salón y siéntate en el sofá» (salón + el sofá).",
                    "Кухня и холодильник.",
                    "Ванная и кровать.",
                    "Бессмысленно."
                ]
            },
            {
                "question": "В объявлении об аренде написано: «Piso muy acogedor y tranquilo, con terraza soleada». Что это значит?",
                "type": "transfer",
                "options": [
                    "Очень уютная и тихая квартира с солнечной террасой",
                    "Шумная комната без окон",
                    "Загородный дом без мебели",
                    "Офис в центре"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «acogedor» = уютный, «tranquilo» = тихий, «terraza soleada» = солнечная терраса.",
                    "Неверно.",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Как по-испански назвать прикроватную тумбочку?",
                "type": "transfer",
                "options": ["la mesita de noche", "la mesa de comer", "el armario grande", "la silla de noche"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «la mesita de noche» — прикроватная тумбочка.",
                    "Обеденный стол.",
                    "Большой шкаф.",
                    "Неверно."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-26-01",
                "type": "choice",
                "question": "Какой артикль согласуется со словом «sofá»?",
                "options": ["el", "la", "las", "una"],
                "correctAnswer": "el",
                "explanation": "el sofá (мужской род)."
            },
            {
                "id": "ex-26-02",
                "type": "gap",
                "question": "En el salón hay un ____ (диван) azul muy cómodo.",
                "correctAnswer": "sofá",
                "acceptableAnswers": ["sofá", "sofa", "Sofá"],
                "explanation": "el sofá."
            },
            {
                "id": "ex-26-03",
                "type": "tiles",
                "question": "Соберите предложение: «Моя квартира имеет два спальни и террасу.»",
                "tiles": ["Mi", "piso", "tiene", "dos", "dormitorios", "y", "una", "terraza."],
                "correctAnswer": "Mi piso tiene dos dormitorios y una terraza.",
                "explanation": "Mi piso tiene dos dormitorios y una terraza."
            },
            {
                "id": "ex-26-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el sofá» → «los ____»",
                "prompt": "el sofá → ____",
                "correctAnswer": "sofás",
                "acceptableAnswers": ["sofás", "sofas", "Sofás"],
                "explanation": "los sofás."
            },
            {
                "id": "ex-26-05",
                "type": "input",
                "question": "Напишите по-испански слово «кухня»:",
                "correctAnswer": "la cocina",
                "acceptableAnswers": ["la cocina", "cocina", "La cocina", "Cocina"],
                "explanation": "la cocina."
            },
            {
                "id": "ex-26-06",
                "type": "gap",
                "question": "Guardo la ropa en el ____ (шкаф) del dormitorio.",
                "correctAnswer": "armario",
                "acceptableAnswers": ["armario", "Armario"],
                "explanation": "el armario."
            },
            {
                "id": "ex-26-07",
                "type": "choice",
                "question": "В какой комнате находится душ и раковина?",
                "options": ["el baño", "la cocina", "el garaje", "el balcón"],
                "correctAnswer": "el baño",
                "explanation": "el baño = ванная комната."
            },
            {
                "id": "ex-26-08",
                "type": "input",
                "question": "Напишите по-испански слово «кровать»:",
                "correctAnswer": "la cama",
                "acceptableAnswers": ["la cama", "cama", "La cama", "Cama"],
                "explanation": "la cama."
            },
            {
                "id": "ex-26-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la habitación» → «las ____»",
                "prompt": "la habitación → ____",
                "correctAnswer": "habitaciones",
                "acceptableAnswers": ["habitaciones", "las habitaciones", "Habitaciones"],
                "explanation": "las habitaciones."
            },
            {
                "id": "ex-26-10",
                "type": "tiles",
                "question": "Соберите фразу: «Холодильник стоит на кухне.»",
                "tiles": ["La", "nevera", "está", "en", "la", "cocina."],
                "correctAnswer": "La nevera está en la cocina.",
                "explanation": "La nevera está en la cocina."
            },
            {
                "id": "ex-26-11",
                "type": "gap",
                "question": "Vivo en el ____ (третий) piso de un edificio moderno.",
                "correctAnswer": "tercer",
                "acceptableAnswers": ["tercer", "tercero", "Tercer"],
                "explanation": "el tercer piso."
            },
            {
                "id": "ex-26-12",
                "type": "choice",
                "question": "Как сказать «кресло» по-испански?",
                "options": ["el sillón", "la silla", "el sofá", "la mesa"],
                "correctAnswer": "el sillón",
                "explanation": "el sillón = кресло."
            },
            {
                "id": "ex-26-13",
                "type": "input",
                "question": "Напишите по-испански слово «лампа»:",
                "correctAnswer": "la lámpara",
                "acceptableAnswers": ["la lámpara", "lámpara", "lampara", "la lampara", "La lámpara"],
                "explanation": "la lámpara."
            },
            {
                "id": "ex-26-14",
                "type": "transformation",
                "question": "Преобразуйте в женский род: «un piso luminoso» → «una casa ____»",
                "prompt": "luminoso → ____",
                "correctAnswer": "luminosa",
                "acceptableAnswers": ["luminosa", "Luminosa"],
                "explanation": "una casa luminosa."
            },
            {
                "id": "ex-26-15",
                "type": "tiles",
                "question": "Соберите предложение: «На балконе много красивых растений.»",
                "tiles": ["En", "el", "balcón", "hay", "muchas", "plantas", "bonitas."],
                "correctAnswer": "En el balcón hay muchas plantas bonitas.",
                "explanation": "En el balcón hay muchas plantas bonitas."
            },
            {
                "id": "ex-26-16",
                "type": "gap",
                "question": "La televisión está en el ____ (гостиная / зал).",
                "correctAnswer": "salón",
                "acceptableAnswers": ["salón", "salon", "Salón"],
                "explanation": "el salón."
            },
            {
                "id": "ex-26-17",
                "type": "choice",
                "question": "Где паркуют машину в частном доме?",
                "options": ["en el garaje", "en la cocina", "en el baño", "en el salón"],
                "correctAnswer": "en el garaje",
                "explanation": "el garaje = гараж."
            },
            {
                "id": "ex-26-18",
                "type": "input",
                "question": "Напишите по-испански слово «зеркало»:",
                "correctAnswer": "el espejo",
                "acceptableAnswers": ["el espejo", "espejo", "Espejo", "El espejo"],
                "explanation": "el espejo."
            },
            {
                "id": "ex-26-19",
                "type": "gap",
                "question": "Comemos todos juntos en el ____ (столовая).",
                "correctAnswer": "comedor",
                "acceptableAnswers": ["comedor", "Comedor"],
                "explanation": "el comedor."
            },
            {
                "id": "ex-26-20",
                "type": "tiles",
                "question": "Соберите фразу: «Спальня очень просторная и тихая.»",
                "tiles": ["El", "dormitorio", "es", "muy", "amplio", "y", "tranquilo."],
                "correctAnswer": "El dormitorio es muy amplio y tranquilo.",
                "explanation": "El dormitorio es muy amplio y tranquilo."
            },
            {
                "id": "ex-26-21",
                "type": "choice",
                "question": "Что означает «una casa acogedora»?",
                "options": ["уютный дом", "дорогой дом", "старый дом", "холодный дом"],
                "correctAnswer": "уютный дом",
                "explanation": "acogedor/a = уютный, гостеприимный."
            },
            {
                "id": "ex-26-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la silla» → «las ____»",
                "prompt": "la silla → ____",
                "correctAnswer": "sillas",
                "acceptableAnswers": ["sillas", "las sillas", "Sillas"],
                "explanation": "las sillas."
            },
            {
                "id": "ex-26-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет лексику дома, предлоги места и цвета?",
                "options": [
                    "En el salón hay un sofá azul y dos sillones grises.",
                    "En el salón está un sofá azul y dos sillones gris.",
                    "En el salón son un sofá azul y dos sillones grises.",
                    "En el salón hay la sofá azul."
                ],
                "correctAnswer": "En el salón hay un sofá azul y dos sillones grises.",
                "explanation": "Hay un sofá azul (муж. род) + dos sillones grises (согласование цвета во мн. ч.)."
            },
            {
                "id": "ex-26-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Мой дом большой, и в нем 3 комнаты»:",
                "correctAnswer": "Mi casa es grande y tiene tres habitaciones",
                "acceptableAnswers": [
                    "Mi casa es grande y tiene tres habitaciones",
                    "Mi casa es grande y tiene tres dormitorios",
                    "Mi casa es grande y en ella hay tres habitaciones"
                ],
                "explanation": "Mi casa es grande y tiene tres habitaciones."
            }
        ],
        "miniScenario": {
            "title": "Осмотр квартиры для аренды с риелтором",
            "setting": "Квартира в историческом районе Севильи.",
            "situation": "Риелтор показывает вам комнаты в квартире и описывает мебель.",
            "dialog": [
                {"speaker": "Agente", "text": "Éste es el salón. Como ve, es muy amplio y tiene un sofá nuevo y una mesa con cuatro sillas."},
                {"speaker": "Tú", "text": "¡Qué bonito! ¿Y la cocina tiene electrodomésticos?"},
                {"speaker": "Agente", "text": "Sí, la cocina está totalmente equipada con nevera, horno y lavadora."},
                {"speaker": "Tú", "text": "Excelente. El dormitorio también es muy tranquilo."}
            ],
            "task": "Оцените гостиную и спросите про кухню.",
            "prompt": "Как сказать риелтору: «Гостиная очень красивая, а кухня современная»?",
            "options": [
                "El salón es muy bonito y la cocina es moderna.",
                "El salón está muy bonito y la cocina hay moderna.",
                "La salón es muy bonito y el cocina es moderna.",
                "El salón son bonito y la cocina son moderna."
            ],
            "correctIndex": 0,
            "explanation": "«El salón es muy bonito y la cocina es moderna» — безупречное согласование родов."
        },
        "shortText": {
            "title": "El nuevo piso de Lucía en Madrid",
            "text": "Lucía se acaba de mudar a un piso luminoso en el barrio de Malasaña. El piso está en el tercer piso de un edificio con ascensor. Tiene un salón acogedor con un sofá gris y una estantería llena de novelas. La cocina es pequeña pero muy práctica, con una nevera grande y lavadora. En el dormitorio principal hay una cama doble y un armario empotrado. Desde el balcón se ve una plaza llena de árboles.",
            "questions": [
                {
                    "question": "¿En qué piso está el apartamento de Lucía?",
                    "options": ["En la planta baja", "En el primer piso", "En el tercer piso", "En el quinto piso"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «está en el tercer piso de un edificio...»."
                },
                {
                    "question": "¿De qué color es el sofá del salón?",
                    "options": ["Rojo", "Azul", "Gris", "Blanco"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «un sofá gris y una estantería...»."
                },
                {
                    "question": "¿Qué se ve desde el balcón de Lucía?",
                    "options": ["Una autopista", "Una plaza llena de árboles", "Una fábrica", "El mar"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «se ve una plaza llena de árboles»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Подробное описание моего идеального дома",
            "prompt": "Опишите ваш реальный или идеальный дом (4-6 предложений):\n1. Какой это тип жилья и где он находится (Vivo en una casa / un piso en...).\n2. Сколько в нем комнат (Tiene un salón, dos dormitorios, una cocina y un baño...).\n3. Опишите мебель в главной комнате (En el salón hay un sofá cómodo, una mesa grande, una lámpara...).\n4. Опишите атмосферу и комфорт (Es muy luminoso, acogedor y tranquilo).\n5. Следите за родом существительных (el sofá, la cama, el armario).",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Лексика комнат и мебели", "points": 35, "description": "Использование названий комнат (salón, cocina, dormitorio, baño) и мебели (sofá, cama, mesa, armario, nevera...)."},
                    {"name": "Грамматический род и артикли", "points": 25, "description": "Правильный род слов (el sofá, la cama, el piso, la casa)."},
                    {"name": "Согласование прилагательных", "points": 25, "description": "Точное согласование amplio, luminoso, cómodo, acogedor."},
                    {"name": "Связность и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 9: Demonstratives (este/ese/aquel)
    # ----------------------------------------------------
    9: {
        "id": 9,
        "topicName": "Demonstratives (este/ese/aquel)",
        "russianTitle": "Указательные местоимения и прилагательные (este / ese / aquel)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u08-home",
        "icon": "👉",
        "summary": "Три степени пространственной дистанции в испанском языке: ESTE (этот — близко к говорящему), ESE (тот / этот — около собеседника или средней дальности) и AQUEL (вон тот — далеко от обоих). Каждое имеет формы мужского, женского рода и множественного числа.",
        "mnemonicRule": "ESTE (с буквой T) = ТУТ (рядом со мной). ESE = около ТЕБЯ. AQUEL = вон ТАМ вдалеке.",
        "goalsRu": [
            "Различать 3 степени дистанции: este (здесь), ese (там у тебя), aquel (вон там далеко)",
            "Использовать все 12 форм указательных прилагательных (este/esta/estos/estas, ese/esa/esos/esas, aquel/aquella/aquellos/aquellas)",
            "Знать нейтральные местоимения esto, eso, aquello (для неопознанных предметов и абстрактных понятий: ¿Qué es esto?)",
            "Согласовывать указательные слова с существительными в роде и числе"
        ],
        "sections": [
            {
                "title": "1. Таблица 3 степеней дистанции (12 форм)",
                "content": "Указательные прилагательные ставятся ПЕРЕД существительным и согласуются с ним в роде и числе:",
                "tables": [
                    {
                        "headers": ["Дистанция", "Муж. ед.", "Жен. ед.", "Муж. мн.", "Жен. мн.", "Русский смысл"],
                        "rows": [
                            ["1. Рядом со мной (aquí / acá)", "este libro", "esta casa", "estos libros", "estas casas", "этот / эта / эти (здесь рядом)"],
                            ["2. Рядом с тобой (ahí)", "ese libro", "esa casa", "esos libros", "esas casas", "тот / эта / те (у тебя / чуть дальше)"],
                            ["3. Далеко от обоих (allí / allá)", "aquel libro", "aquella casa", "aquellos libros", "aquellas casas", "вон тот / вон та / вон те (вдали)"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Нейтральные указательные местоимения (ESTO / ESO / AQUELLO)",
                "content": "Используются, когда мы НЕ знаем род предмета или говорим об абстрактной ситуации. Они НИКОГДА не ставятся перед существительным:",
                "tables": [
                    {
                        "headers": ["Нейтральное слово", "Значение", "Пример", "Русский перевод"],
                        "rows": [
                            ["esto", "это (предмет рядом / факт)", "¿Qué es esto?", "Что это такое (в моих руках)?"],
                            ["eso", "это / то (предмет у тебя / мысль)", "Eso es verdad.", "Это правда / То, что ты сказал — правда."],
                            ["aquello", "вон то (вдали / давнее событие)", "¿Qué es aquello que brilla allí?", "Что это там блестит вдали?"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Este libro que tengo en la mano es muy interesante.", "ru": "Эта книга, которая у меня в руке, очень интересная."},
            {"es": "Esa camisa que llevas te queda muy bien.", "ru": "Та рубашка, что на тебе, тебе очень идет."},
            {"es": "Aquella montaña a lo lejos tiene nieve.", "ru": "Вон та гора вдали покрыта снегом."},
            {"es": "¿Cuánto cuesta esta camiseta roja?", "ru": "Сколько стоит эта красная футболка (здесь рядом)?"},
            {"es": "Esos chicos de ahí son mis compañeros de clase.", "ru": "Те ребята там — мои одногруппники."},
            {"es": "¿Qué es esto que tienes aquí?", "ru": "Что это такое у тебя здесь? (нейтральное esto)."},
            {"es": "Aquellos edificios antiguos son del siglo dieciocho.", "ru": "Вон те старинные здания вдали — восемнадцатого века."},
            {"es": "Estas manzanas están muy ricas.", "ru": "Эти яблоки (здесь) очень вкусные."},
            {"es": "Eso no me parece una buena idea.", "ru": "Это (сказанное тобой) не кажется мне хорошей идеей."},
            {"es": "Prefiero este hotel de aquí antes que aquel de allá.", "ru": "Я предпочитаю этот отель здесь, а не вон тот вдали."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Esto libro» с существительным",
                "correction": "Este libro / ¿Qué es esto?",
                "explanation": "Нейтральная форма «esto» НИКОГДА не ставится перед существительными мужского рода. Перед существительным используется только «este»."
            },
            {
                "mistake": "«Estos» путают с «estes»",
                "correction": "estos libros / esos libros",
                "explanation": "Во множественном числе мужского рода форма оканчивается на -os: «estos», «esos» (не estes/eses!)."
            },
            {
                "mistake": "Путаница между «este» (этот) и «ese» (тот)",
                "correction": "Este (здесь рядом с говорящим) vs Ese (там рядом с собеседником)",
                "explanation": "«Este» ассоциируется с aquí (здесь), а «ese» — с ahí (там)."
            }
        ],
        "trapAlert": "Перед существительным мужского рода ставится «ESTE libro», а НЕ «esto libro»! «Esto» используется только само по себе: «¿Qué es esto?»!",
        "dialectNote": "В испаноязычном мире для жестикуляции часто комбинируют: «este de acá» (этот вот здесь) и «aquel de allá» (вон тот вон там).",
        "quiz": [
            {
                "question": "Какое указательное слово используется для предмета, находящегося рядом с говорящим («здесь»)?",
                "type": "recognition",
                "options": ["este", "ese", "aquel", "eso"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «este» относится к предметам рядом с говорящим (aquí).",
                    "Ese — рядом с собеседником (ahí).",
                    "Aquel — далеко от обоих (allí).",
                    "Eso — нейтральное местоимение."
                ]
            },
            {
                "question": "Как сказать «эта книга» перед существительным мужского рода?",
                "type": "recognition",
                "options": ["esto libro", "este libro", "esta libro", "estos libro"],
                "correctIndex": 1,
                "explanations": [
                    "«Esto» никогда не ставится перед существительными.",
                    "Правильно: «este libro» (мужской род ед. число).",
                    "Esta — женский род.",
                    "Estos — множественное число."
                ]
            },
            {
                "question": "Какая форма множественного числа мужского рода у слова «este»?",
                "type": "recognition",
                "options": ["estes", "estos", "estas", "estosos"],
                "correctIndex": 1,
                "explanations": [
                    "Формы «estes» не существует в испанском языке.",
                    "Правильно: «estos» (estos libros).",
                    "Estas — женский род.",
                    "Неверно."
                ]
            },
            {
                "question": "Какое указательное слово обозначает предмет вон там вдалеке (далеко от обоих)?",
                "type": "recognition",
                "options": ["este", "ese", "aquel", "esto"],
                "correctIndex": 2,
                "explanations": [
                    "Este — близко.",
                    "Ese — средняя дистанция.",
                    "Правильно: «aquel» — предмет вдали (allí / allá).",
                    "Esto — нейтральное местоимение."
                ]
            },
            {
                "question": "Вставьте форму: «____ (эти, жен. род) flores huelen muy bien.»",
                "type": "application",
                "options": ["Estos", "Estas", "Este", "Esta"],
                "correctIndex": 1,
                "explanations": [
                    "Estos — мужской род.",
                    "Правильно: «Estas flores» (женский род во множественном числе).",
                    "Este — ед. число муж. род.",
                    "Esta — ед. число жен. род."
                ]
            },
            {
                "question": "Вставьте форму: «Me gustan mucho ____ (вон те вдали) montañas nevadas.»",
                "type": "application",
                "options": ["aquellas", "aquellos", "esas", "estas"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «aquellas montañas» (женский род во множественном числе для удаленных объектов).",
                    "Aquellos — мужской род.",
                    "Esas — объекты средней дальности.",
                    "Estas — близкие объекты."
                ]
            },
            {
                "question": "Как спросить «Что это такое?» о незнакомом предмете в руках?",
                "type": "application",
                "options": ["¿Qué es esto?", "¿Qué es este?", "¿Qué es esta?", "¿Qué es ese?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Qué es esto?» (нейтральное esto для неопознанного предмета).",
                    "«Este» требует существительного или ясного мужского рода.",
                    "«Esta» требует женского рода.",
                    "«Ese» относится к предмету у собеседника."
                ]
            },
            {
                "question": "Вставьте форму: «____ (тот у тебя) chico que está a tu lado es muy alto.»",
                "type": "application",
                "options": ["Este", "Ese", "Aquel", "Eso"],
                "correctIndex": 1,
                "explanations": [
                    "Este относится к тому, кто рядом с говорящим.",
                    "Правильно: «Ese chico» (парень рядом с собеседником).",
                    "Aquel — далеко от обоих.",
                    "Eso — нейтральное слово, не ставится перед существительным."
                ]
            },
            {
                "question": "В магазине одежды вы держите вешалку с платьем. Как спросить цену этого платья?",
                "type": "transfer",
                "options": [
                    "¿Cuánto cuesta este vestido?",
                    "¿Cuánto cuesta esto vestido?",
                    "¿Cuánto cuesta aquel vestido de allá?",
                    "¿Cuánto cuesta esta vestido?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «este vestido» (мужской род, предмет в руках).",
                    "«Esto vestido» — грубая ошибка.",
                    "Aquel — вон то платье вдали.",
                    "Vestido мужского рода (не esta)."
                ]
            },
            {
                "question": "Вы стоите на смотровой площадке и указываете на старинный замок на горизонте. Что сказать?",
                "type": "transfer",
                "options": [
                    "Mira aquel castillo antiguo en la montaña.",
                    "Mira este castillo aquí en la mano.",
                    "Mira esto castillo antiguo.",
                    "Mira ese castillo en mi bolsillo."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «aquel castillo» (далекий объект на горизонте).",
                    "Este означает близкий объект.",
                    "Esto не ставится перед существительными.",
                    "Ese в кармане — абсурдно."
                ]
            },
            {
                "question": "Собеседник высказал интересную мысль. Вы хотите сказать: «Это очень интересно». Ваш выбор:",
                "type": "transfer",
                "options": ["Eso es muy interesante.", "Ese es muy interesante libro.", "Este es interesante nada.", "Aquella es interesante."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Eso es muy interesante» (нейтральное eso относится к абстрактной мысли собеседника).",
                    "Ese требует существительного.",
                    "Бессмысленно.",
                    "Aquella требует женского рода."
                ]
            },
            {
                "question": "Вы выбираете между двумя парами обуви: туфлями рядом с вами и туфлями у продавца. Как сказать «Я предпочитаю эти туфли, а не те»?",
                "type": "transfer",
                "options": [
                    "Prefiero estos zapatos de aquí antes que esos de ahí.",
                    "Prefiero estes zapatos antes que eses zapatos.",
                    "Prefiero estos zapatos antes que esto zapatos.",
                    "Prefiero estas zapatos antes que esas."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «estos zapatos de aquí (эти здесь) antes que esos de ahí (те у тебя)».",
                    "Форм «estes» и «eses» не существует.",
                    "Esto не используется с существительными.",
                    "Zapatos мужского рода (не estas)."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-9-01",
                "type": "choice",
                "question": "Какое указательное слово согласуется со словом «casa» (здесь рядом)?",
                "options": ["esta", "este", "esto", "estos"],
                "correctAnswer": "esta",
                "explanation": "esta casa (женский род)."
            },
            {
                "id": "ex-9-02",
                "type": "gap",
                "question": "____ (этот, муж. ед.) libro de español es muy útil.",
                "correctAnswer": "Este",
                "acceptableAnswers": ["Este", "este"],
                "explanation": "Este libro."
            },
            {
                "id": "ex-9-03",
                "type": "tiles",
                "question": "Соберите вопрос: «Что это такое у тебя в руке?»",
                "tiles": ["¿Qué", "es", "esto", "que", "tienes", "ahí?"],
                "correctAnswer": "¿Qué es esto que tienes ahí?",
                "explanation": "¿Qué es esto que tienes ahí?"
            },
            {
                "id": "ex-9-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «este libro» → «____»",
                "prompt": "este libro → ____",
                "correctAnswer": "estos libros",
                "acceptableAnswers": ["estos libros", "Estos libros"],
                "explanation": "estos libros (не estes!)."
            },
            {
                "id": "ex-9-05",
                "type": "input",
                "question": "Напишите нейтральное указательное местоимение «это» (рядом со мной):",
                "correctAnswer": "esto",
                "acceptableAnswers": ["esto", "Esto"],
                "explanation": "esto."
            },
            {
                "id": "ex-9-06",
                "type": "gap",
                "question": "____ (вон та вдали) montaña tiene mucha nieve.",
                "correctAnswer": "Aquella",
                "acceptableAnswers": ["Aquella", "aquella"],
                "explanation": "Aquella montaña."
            },
            {
                "id": "ex-9-07",
                "type": "choice",
                "question": "Какое указательное слово относится к объекту рядом с собеседником?",
                "options": ["ese / esa", "este / esta", "aquel / aquella", "esto"],
                "correctAnswer": "ese / esa",
                "explanation": "ese / esa = тот / та (рядом с тобой)."
            },
            {
                "id": "ex-9-08",
                "type": "input",
                "question": "Напишите форму женского рода множественного числа для «este»:",
                "correctAnswer": "estas",
                "acceptableAnswers": ["estas", "Estas"],
                "explanation": "estas."
            },
            {
                "id": "ex-9-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «ese chico» → «____»",
                "prompt": "ese chico → ____",
                "correctAnswer": "esos chicos",
                "acceptableAnswers": ["esos chicos", "Esos chicos"],
                "explanation": "esos chicos."
            },
            {
                "id": "ex-9-10",
                "type": "tiles",
                "question": "Соберите предложение: «Вон те здания вдали очень старинные.»",
                "tiles": ["Aquellos", "edificios", "son", "muy", "antiguos."],
                "correctAnswer": "Aquellos edificios son muy antiguos.",
                "explanation": "Aquellos edificios son muy antiguos."
            },
            {
                "id": "ex-9-11",
                "type": "gap",
                "question": "¿Cuánto cuesta ____ (эта) camisa blanca que tengo aquí?",
                "correctAnswer": "esta",
                "acceptableAnswers": ["esta", "Esta"],
                "explanation": "esta camisa."
            },
            {
                "id": "ex-9-12",
                "type": "choice",
                "question": "Какая форма множественного числа у «aquel»?",
                "options": ["aquellos", "aqueles", "aquelos", "aquels"],
                "correctAnswer": "aquellos",
                "explanation": "aquel → aquellos."
            },
            {
                "id": "ex-9-13",
                "type": "input",
                "question": "Напишите нейтральное указательное местоимение «то / это» (о сказанном собеседником):",
                "correctAnswer": "eso",
                "acceptableAnswers": ["eso", "Eso"],
                "explanation": "eso."
            },
            {
                "id": "ex-9-14",
                "type": "transformation",
                "question": "Поставьте в женский род: «este profesor» → «____ profesora»",
                "prompt": "este → ____",
                "correctAnswer": "esta",
                "acceptableAnswers": ["esta", "Esta"],
                "explanation": "esta profesora."
            },
            {
                "id": "ex-9-15",
                "type": "tiles",
                "question": "Соберите фразу: «Эта красная футболка мне очень нравится.»",
                "tiles": ["Esta", "camiseta", "roja", "me", "gusta", "mucho."],
                "correctAnswer": "Esta camiseta roja me gusta mucho.",
                "explanation": "Esta camiseta roja me gusta mucho."
            },
            {
                "id": "ex-9-16",
                "type": "gap",
                "question": "____ (те у тебя) pantalones te quedan muy bien.",
                "correctAnswer": "Esos",
                "acceptableAnswers": ["Esos", "esos"],
                "explanation": "Esos pantalones."
            },
            {
                "id": "ex-9-17",
                "type": "choice",
                "question": "Какое словосочетание грамматически ошибочно?",
                "options": ["esto coche", "este coche", "esta casa", "estos libros"],
                "correctAnswer": "esto coche",
                "explanation": "«Esto coche» — ошибка, должно быть «este coche»."
            },
            {
                "id": "ex-9-18",
                "type": "input",
                "question": "Напишите форму женского рода множественного числа для «aquel»:",
                "correctAnswer": "aquellas",
                "acceptableAnswers": ["aquellas", "Aquellas"],
                "explanation": "aquellas."
            },
            {
                "id": "ex-9-19",
                "type": "gap",
                "question": "¿De quién son ____ (эти) llaves que están aquí en la mesa?",
                "correctAnswer": "estas",
                "acceptableAnswers": ["estas", "Estas"],
                "explanation": "estas llaves."
            },
            {
                "id": "ex-9-20",
                "type": "tiles",
                "question": "Соберите предложение: «Это не кажется мне хорошей идеей.»",
                "tiles": ["Eso", "no", "me", "parece", "una", "buena", "idea."],
                "correctAnswer": "Eso no me parece una buena idea.",
                "explanation": "Eso no me parece una buena idea."
            },
            {
                "id": "ex-9-21",
                "type": "choice",
                "question": "Как перевести «вон те деревья вдали»?",
                "options": ["aquellos árboles", "estos árboles", "esos árboles", "esto árboles"],
                "correctAnswer": "aquellos árboles",
                "explanation": "aquellos árboles."
            },
            {
                "id": "ex-9-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «aquella chica» → «____»",
                "prompt": "aquella chica → ____",
                "correctAnswer": "aquellas chicas",
                "acceptableAnswers": ["aquellas chicas", "Aquellas chicas"],
                "explanation": "aquellas chicas."
            },
            {
                "id": "ex-9-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет указательные слова, мебель и предлоги места?",
                "options": [
                    "Esta lámpara está encima de aquella mesa antigua.",
                    "Esto lámpara está encima de aquella mesa antigua.",
                    "Esta lámpara hay encima de aquella mesa.",
                    "Esta lámpara es debajo de aquel mesa."
                ],
                "correctAnswer": "Esta lámpara está encima de aquella mesa antigua.",
                "explanation": "Esta lámpara (указат. жен. род) + está encima de (предлог места) + aquella mesa antigua (указат. вдали)."
            },
            {
                "id": "ex-9-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Этот отель очень современный и уютный»:",
                "correctAnswer": "Este hotel es muy moderno y acogedor",
                "acceptableAnswers": [
                    "Este hotel es muy moderno y acogedor",
                    "este hotel es muy moderno y acogedor"
                ],
                "explanation": "Este hotel es muy moderno y acogedor."
            }
        ],
        "miniScenario": {
            "title": "Выбор сувенира на блошином рынке",
            "setting": "Рынок Растро в Мадриде.",
            "situation": "Вы рассматриваете антикварные предметы на прилавке и сравниваете вещи на разном расстоянии.",
            "dialog": [
                {"speaker": "Tú", "text": "Disculpe, ¿cuánto cuesta este reloj de bolsillo que tengo aquí?"},
                {"speaker": "Vendedor", "text": "Este reloj cuesta treinta euros. Pero ese que está ahí a su lado cuesta solo veinte."},
                {"speaker": "Tú", "text": "¿Y aquel cuadro grande que está al fondo de la pared?"},
                {"speaker": "Vendedor", "text": "Aquel cuadro es una pintura al óleo y cuesta noventa euros."}
            ],
            "task": "Спросите цену картины, которая висит вдали на стене.",
            "prompt": "Как спросить: «Сколько стоит вон та картина вдали?»?",
            "options": [
                "¿Cuánto cuesta aquel cuadro de allá?",
                "¿Cuánto cuesta este cuadro de allá?",
                "¿Cuánto cuesta esto cuadro de allá?",
                "¿Cuánto cuesta esa cuadro de allá?"
            ],
            "correctIndex": 0,
            "explanation": "«¿Cuánto cuesta aquel cuadro de allá?» — правильная форма для удаленного объекта мужского рода."
        },
        "shortText": {
            "title": "La visita al taller de cerámica",
            "text": "Hoy visitamos el taller de cerámica de Don Rafael en Toledo. En la entrada, Don Rafael nos muestra varias piezas: «Esta taza azul de aquí es de estilo mudéjar tradicional. Esas vasijas que tienen ustedes en la mesa son ideales para el aceite de oliva. Y aquellas figuras grandes del fondo son reproducciones históricas». Todos los visitantes quedan maravillados con estas obras de arte.",
            "questions": [
                {
                    "question": "¿De qué estilo es la taza azul que está cerca de la entrada?",
                    "options": ["Estilo moderno", "Estilo mudéjar tradicional", "Estilo italiano", "Estilo abstracto"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Esta taza azul de aquí es de estilo mudéjar tradicional»."
                },
                {
                    "question": "¿Qué demostrativo usa Don Rafael para las vasijas cerca de los visitantes?",
                    "options": ["Estas", "Esas", "Aquellas", "Esto"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Esas vasijas que tienen ustedes en la mesa...»."
                },
                {
                    "question": "¿Dónde están las figuras grandes mencionadas con «aquellas»?",
                    "options": ["En la entrada", "En el bolsillo", "En el fondo del taller", "En la calle"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «aquellas figuras grandes del fondo...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Сравнение предметов на разном расстоянии вокруг вас",
            "prompt": "Напишите короткий текст (4-5 предложений), описывая предметы вокруг вас на трех дистанциях:\n1. Опишите предмет рядом с вами (Este libro / esta pluma que tengo aquí es...).\n2. Опишите предмет рядом с вашим другом или на соседнем столе (Ese teléfono / esa mochila que tienes ahí es...).\n3. Опишите предмет вдали (Aquel edificio / aquella ventana a lo lejos es...).\n4. Задайте общий вопрос с нейтральным местоимением esto/eso (¿Qué es esto/eso?).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование 3 степеней указательных слов", "points": 35, "description": "Правильное различение este (aquí), ese (ahí) и aquel (allí)."},
                    {"name": "Согласование по роду и числу", "points": 30, "description": "Точное согласование este/esta/estos/estas, aquel/aquella/aquellos/aquellas."},
                    {"name": "Нейтральные местоимения (esto/eso)", "points": 20, "description": "Корректное использование esto/eso без существительного."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    }
}
