# -*- coding: utf-8 -*-
"""Unit 1: Первый контакт (Topics 27, 7, 19)"""

unit1_topics = {
    # ----------------------------------------------------
    # TOPIC 27: Greetings and introductions (saludos)
    # ----------------------------------------------------
    27: {
        "id": 27,
        "topicName": "Greetings and introductions (saludos)",
        "russianTitle": "Приветствия, знакомство и формулы вежливости",
        "level": "A1",
        "category": "Speaking",
        "unitId": "a1-u01-first-contact",
        "icon": "🤝",
        "summary": "Базовые фразы для первого контакта в испаноязычной среде: как поздороваться в разное время суток, представиться, спросить имя собеседника и вежливо попрощаться.",
        "mnemonicRule": "DÍAS — утро до обеда, TARDES — день до темноты, NOCHES — вечер и ночь.",
        "goalsRu": [
            "Здороваться и прощаться в зависимости от времени суток и степени формальности",
            "Называть свое имя и корректно спрашивать имя собеседника",
            "Использовать базовые формулы вежливости (por favor, gracias, de nada, perdón)",
            "Поддерживать первый контакт и выражать радость от знакомства (mucho gusto, encantado/a)"
        ],
        "sections": [
            {
                "title": "1. Приветствия по времени суток",
                "content": "В испанском языке приветствия по времени суток всегда используются во множественном числе (буквально «добрые дни», «добрые вечера»).",
                "tables": [
                    {
                        "headers": ["Испанский", "Русский перевод", "Когда используется"],
                        "rows": [
                            ["¡Hola!", "Привет! / Здравствуйте!", "Универсально, в любое время"],
                            ["¡Buenos días!", "Доброе утро! / Добрый день!", "С утра до обеда (до 13:00–14:00)"],
                            ["¡Buenas tardes!", "Добрый день! / Добрый вечер!", "После обеда до захода солнца"],
                            ["¡Buenas noches!", "Добрый вечер! / Спокойной ночи!", "Когда стемнело и перед сном"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Как представиться и познакомиться",
                "content": "Для знакомства используется возвратный глагол llamarse (зваться) или глагол ser (быть).",
                "tables": [
                    {
                        "headers": ["Конструкция", "Пример", "Перевод"],
                        "rows": [
                            ["Me llamo + имя", "Me llamo Mateo.", "Меня зовут Матео."],
                            ["Soy + имя", "Soy Sofía.", "Я — София."],
                            ["Mi nombre es + имя", "Mi nombre es Carlos.", "Моё имя — Карлос."],
                            ["¿Cómo te llamas? (ты)", "¿Cómo te llamas tú?", "Как тебя зовут?"],
                            ["¿Cómo se llama usted? (Вы)", "¿Cómo se llama usted, señor?", "Как Вас зовут, сеньор?"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "¡Hola! ¿Cómo estás?", "ru": "Привет! Как дела?"},
            {"es": "Buenos días, me llamo David.", "ru": "Доброе утро, меня зовут Давид."},
            {"es": "Buenas tardes, ¿cómo te llamas?", "ru": "Добрый день, как тебя зовут?"},
            {"es": "Mucho gusto en conocerte.", "ru": "Очень приятно с тобой познакомиться."},
            {"es": "Encantada de conocerle, señor López.", "ru": "Очень приятно познакомиться с Вами, сеньор Лопес (говорит женщина)."},
            {"es": "Estoy muy bien, gracias. ¿Y tú?", "ru": "У меня всё отлично, спасибо. А у тебя?"},
            {"es": "Hasta luego, nos vemos mañana.", "ru": "До скорого, увидимся завтра."},
            {"es": "Por favor, hable más despacio.", "ru": "Пожалуйста, говорите помедленнее."},
            {"es": "Muchas gracias por tu ayuda.", "ru": "Большое спасибо за твою помощь."},
            {"es": "De nada, es un placer.", "ru": "Не за что, это удовольствие."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Mi llamo es Juan» вместо «Me llamo Juan» или «Mi nombre es Juan»",
                "correction": "Me llamo Juan / Mi nombre es Juan",
                "explanation": "Нельзя смешивать местоимение «me» и существительное «nombre» с глаголом «es». Говорите либо «Me llamo...», либо «Mi nombre es...»."
            },
            {
                "mistake": "«Buen día» для ночи или путаница «Buenas días»",
                "correction": "¡Buenos días! (муж. род: el día)",
                "explanation": "Слово «día» — мужского рода, поэтому «buenOS días», а «tarde» и «noche» — женского («buenAS tardes», «buenAS noches»)."
            },
            {
                "mistake": "Женщина говорит «Encantado» вместо «Encantada»",
                "correction": "Encantada (говорит женщина) / Encantado (мужчина)",
                "explanation": "Прилагательное «encantado/a» согласуется с полом говорящего."
            }
        ],
        "trapAlert": "Слово «día» мужского рода: говорим «Buenos días», но «Buenas tardes» и «Buenas noches»!",
        "dialectNote": "В Латинской Америке (особенно в Аргентине и Уругвае) часто говорят «¡Buen día!» в единственном числе, а в качестве приветствия популярно «¿Qué tal?» и «¿Cómo andás?».",
        "quiz": [
            {
                "question": "Как правильно поздороваться утром в 10:00?",
                "type": "recognition",
                "options": ["¡Buenas noches!", "¡Buenos días!", "¡Buenas tardes!", "¡Hasta luego!"],
                "correctIndex": 1,
                "explanations": [
                    "«Buenas noches» используется только вечером и ночью.",
                    "Правильно: «Buenos días» — стандартное приветствие до полудня.",
                    "«Buenas tardes» используется после обеда.",
                    "«Hasta luego» — это прощание («до скорого»)."
                ]
            },
            {
                "question": "Какая фраза означает «Меня зовут Мария»?",
                "type": "recognition",
                "options": ["Mi llamo es María", "Me llamo María", "Yo llamo María", "Me nombre María"],
                "correctIndex": 1,
                "explanations": [
                    "Неверно: нельзя смешивать «mi» и «llamo es».",
                    "Правильно: «Me llamo María» (буквально: зовусь Мария).",
                    "«Yo llamo» означает «я звоню / я зову кого-то».",
                    "«Me nombre» грамматически не существует."
                ]
            },
            {
                "question": "Что отвечает вежливый человек на фразу «¡Muchas gracias!»?",
                "type": "recognition",
                "options": ["Por favor", "De nada", "Lo siento", "Hola"],
                "correctIndex": 1,
                "explanations": [
                    "«Por favor» означает «пожалуйста» при просьбе, а не при ответе на спасибо.",
                    "Правильно: «De nada» означает «не за что / пожалуйста» в ответ на благодарность.",
                    "«Lo siento» означает «мне жаль / извините».",
                    "«Hola» — это приветствие."
                ]
            },
            {
                "question": "Как женщина должна сказать «Очень приятно познакомиться»?",
                "type": "recognition",
                "options": ["Encantado", "Encantada", "Encantados", "Muchos gustos"],
                "correctIndex": 1,
                "explanations": [
                    "«Encantado» говорит только мужчина.",
                    "Правильно: женщина согласует окончание по женскому роду — «Encantada».",
                    "«Encantados» — множественное число.",
                    "Правильная фраза без окончания -s: «Mucho gusto»."
                ]
            },
            {
                "question": "Выберите корректный вопрос к незнакомому пожилому человеку:",
                "type": "application",
                "options": ["¿Cómo te llamas?", "¿Cómo se llama usted?", "¿Cómo te llamas usted?", "¿Qué es tu nombre?"],
                "correctIndex": 1,
                "explanations": [
                    "«¿Cómo te llamas?» — неформальное обращение на «ты».",
                    "Правильно: «¿Cómo se llama usted?» — вежливое обращение на «Вы».",
                    "Нельзя смешивать местоимение «te» и форму «usted».",
                    "«¿Qué es tu nombre?» — калька с английского, в испанском так не говорят."
                ]
            },
            {
                "question": "Дополните диалог: «—¿Cómo estás? —Estoy muy ____, gracias.»",
                "type": "application",
                "options": ["bueno", "bien", "bienvenida", "buenas"],
                "correctIndex": 1,
                "explanations": [
                    "«Bueno» — прилагательное («хороший»), а с глаголом estar нужно наречие состояния.",
                    "Правильно: «bien» — наречие («хорошо»).",
                    "«Bienvenida» означает «добро пожаловать».",
                    "«Buenas» — краткое неформальное приветствие."
                ]
            },
            {
                "question": "Какое прощание означает «Увидимся завтра»?",
                "type": "application",
                "options": ["Hasta pronto", "Hasta mañana", "Hasta luego", "Buenas noches"],
                "correctIndex": 1,
                "explanations": [
                    "«Hasta pronto» означает «до скорой встречи».",
                    "Правильно: «Hasta mañana» буквально означает «до завтра».",
                    "«Hasta luego» означает «до скорого / увидимся позже».",
                    "«Buenas noches» — спокойной ночи."
                ]
            },
            {
                "question": "Как вежливо попросить кофе с молоком в кафе?",
                "type": "application",
                "options": ["Un café con leche, de nada", "Un café con leche, por favor", "Un café con leche, perdón", "Un café con leche, hola"],
                "correctIndex": 1,
                "explanations": [
                    "«De nada» говорят в ответ на спасибо.",
                    "Правильно: «por favor» выражает вежливую просьбу.",
                    "«Perdón» выражает извинение.",
                    "«Hola» — приветствие, ставится в начале реплики, а не в конце заказа."
                ]
            },
            {
                "question": "Вы случайно задели прохожего на улице. Что сказать?",
                "type": "transfer",
                "options": ["¡De nada!", "¡Perdón! / ¡Disculpe!", "¡Mucho gusto!", "¡Hasta la vista!"],
                "correctIndex": 1,
                "explanations": [
                    "«De nada» — не за что.",
                    "Правильно: «¡Perdón!» или «¡Disculpe!» используются для извинения при случайном столкновении.",
                    "«Mucho gusto» говорят при знакомстве.",
                    "«Hasta la vista» — прощание."
                ]
            },
            {
                "question": "Собеседник говорит слишком быстро. Как попросить его говорить медленнее?",
                "type": "transfer",
                "options": ["Hable más rápido, por favor", "Más despacio, por favor", "No me gusta, por favor", "Hablo español muy bien"],
                "correctIndex": 1,
                "explanations": [
                    "«Más rápido» означает «быстрее».",
                    "Правильно: «Más despacio, por favor» («Помедленнее, пожалуйста»).",
                    "«No me gusta» означает «мне не нравится».",
                    "«Hablo español muy bien» означает «я очень хорошо говорю по-испански»."
                ]
            },
            {
                "question": "Вы заходите в гостиницу в 20:30. Какое приветствие уместно?",
                "type": "transfer",
                "options": ["¡Buenos días!", "¡Buenas tardes!", "¡Buenas noches!", "¡Adiós!"],
                "correctIndex": 2,
                "explanations": [
                    "«Buenos días» — только до полудня.",
                    "«Buenas tardes» — до захода солнца.",
                    "Правильно: в 20:30 уже стемнело, поэтому говорим «¡Buenas noches!».",
                    "«Adiós» — прощание."
                ]
            },
            {
                "question": "Коллега знакомит вас с новым сотрудником. Ваша естественная реплика:",
                "type": "transfer",
                "options": ["¡Mucho gusto! Me llamo Iván.", "¡De nada! Soy Iván.", "¡Perdón! ¿Qué hora es?", "¡Hasta mañana! Me llamo Iván."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¡Mucho gusto!» — естественная этикетная формула при знакомстве.",
                    "«De nada» неуместно при первом знакомстве.",
                    "«Perdón, ¿qué hora es?» переводит тему на время.",
                    "«Hasta mañana» — это прощание."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-27-01",
                "type": "choice",
                "question": "Какое приветствие используется в первой половине дня (до 13:00)?",
                "options": ["Buenos días", "Buenas tardes", "Buenas noches", "Hasta luego"],
                "correctAnswer": "Buenos días",
                "explanation": "«Buenos días» — утреннее приветствие до обеда."
            },
            {
                "id": "ex-27-02",
                "type": "gap",
                "question": "Hola, ____ llamo Roberto y soy de Madrid.",
                "correctAnswer": "me",
                "acceptableAnswers": ["me", "Me"],
                "explanation": "Возвратное местоимение 1 лица: «me llamo»."
            },
            {
                "id": "ex-27-03",
                "type": "tiles",
                "question": "Соберите фразу: «Добрый день, меня зовут Елена.»",
                "tiles": ["Buenas", "tardes,", "me", "llamo", "Elena."],
                "correctAnswer": "Buenas tardes, me llamo Elena.",
                "explanation": "Порядок слов: Приветствие + me llamo + имя."
            },
            {
                "id": "ex-27-04",
                "type": "input",
                "question": "Напишите по-испански «Пожалуйста» (формула вежливости):",
                "correctAnswer": "Por favor",
                "acceptableAnswers": ["por favor", "Por favor", "porfavor"],
                "explanation": "«Por favor» пишется раздельно в два слова."
            },
            {
                "id": "ex-27-05",
                "type": "transformation",
                "question": "Переделайте фразу мужчины «Encantado» в фразу женщины:",
                "prompt": "Encantado → ____",
                "correctAnswer": "Encantada",
                "acceptableAnswers": ["Encantada", "encantada"],
                "explanation": "Женский род требует окончания -a: «Encantada»."
            },
            {
                "id": "ex-27-06",
                "type": "gap",
                "question": "—Muchas gracias por todo. —De ____, un placer.",
                "correctAnswer": "nada",
                "acceptableAnswers": ["nada", "Nada"],
                "explanation": "Устойчивый ответ на спасибо: «De nada»."
            },
            {
                "id": "ex-27-07",
                "type": "choice",
                "question": "Как вежливо обратиться к незнакомой взрослой женщине?",
                "options": ["Señora", "Chico", "Amigo", "Tú"],
                "correctAnswer": "Señora",
                "explanation": "«Señora» — уважительное обращение к взрослой женщине."
            },
            {
                "id": "ex-27-08",
                "type": "input",
                "question": "Напишите по-испански «Спасибо большое»:",
                "correctAnswer": "Muchas gracias",
                "acceptableAnswers": ["Muchas gracias", "muchas gracias", "Muchísimas gracias", "muchisimas gracias"],
                "explanation": "«Muchas gracias» — стандартная формула благодарности."
            },
            {
                "id": "ex-27-09",
                "type": "tiles",
                "question": "Соберите вопрос: «Как тебя зовут?»",
                "tiles": ["¿Cómo", "te", "llamas", "tú?"],
                "correctAnswer": "¿Cómo te llamas tú?",
                "explanation": "Вопросительное слово ¿Cómo + te llamas + tú?"
            },
            {
                "id": "ex-27-10",
                "type": "choice",
                "question": "Что означает фраза «Hasta luego»?",
                "options": ["До скорого / Пока", "Доброе утро", "Очень приятно", "Извините"],
                "correctAnswer": "До скорого / Пока",
                "explanation": "«Hasta luego» — распространенное прощание."
            },
            {
                "id": "ex-27-11",
                "type": "gap",
                "question": "—¿Cómo ____ usted? —Me llamo señor Gómez.",
                "correctAnswer": "se llama",
                "acceptableAnswers": ["se llama", "se llama usted"],
                "explanation": "Для usted форма глагола 3-го лица: «se llama»."
            },
            {
                "id": "ex-27-12",
                "type": "input",
                "question": "Напишите ответ «Очень хорошо, спасибо» по-испански:",
                "correctAnswer": "Muy bien, gracias",
                "acceptableAnswers": ["Muy bien, gracias", "muy bien gracias", "Muy bien gracias", "muy bien, gracias"],
                "explanation": "«Muy bien, gracias» — классический ответ на вопрос ¿Cómo estás?"
            },
            {
                "id": "ex-27-13",
                "type": "transformation",
                "question": "Переделайте вопрос на «ты» в вежливый вопрос на «Вы» (usted): «¿Cómo te llamas?»",
                "prompt": "¿Cómo te llamas? → ____",
                "correctAnswer": "¿Cómo se llama usted?",
                "acceptableAnswers": ["¿Cómo se llama usted?", "¿Cómo se llama?", "Como se llama usted?", "Como se llama?"],
                "explanation": "При переходе на usted: te llamas → se llama (usted)."
            },
            {
                "id": "ex-27-14",
                "type": "choice",
                "question": "Какое слово пропущено: «Buenas ____ (вечером в 21:00)»?",
                "options": ["noches", "días", "tardes", "mañanas"],
                "correctAnswer": "noches",
                "explanation": "В 21:00 используется «Buenas noches»."
            },
            {
                "id": "ex-27-15",
                "type": "tiles",
                "question": "Соберите реплику: «Очень приятно познакомиться с тобой.»",
                "tiles": ["Mucho", "gusto", "en", "conocerte."],
                "correctAnswer": "Mucho gusto en conocerte.",
                "explanation": "Mucho gusto en conocerte."
            },
            {
                "id": "ex-27-16",
                "type": "gap",
                "question": "Con ____, tengo que pasar por aquí.",
                "correctAnswer": "permiso",
                "acceptableAnswers": ["permiso", "Permiso"],
                "explanation": "«Con permiso» означает «разрешите пройти / с вашего позволения»."
            },
            {
                "id": "ex-27-17",
                "type": "input",
                "question": "Напишите по-испански прощание «До завтра»:",
                "correctAnswer": "Hasta mañana",
                "acceptableAnswers": ["Hasta mañana", "hasta mañana", "Hasta manana", "hasta manana"],
                "explanation": "«Hasta mañana» — до завтра."
            },
            {
                "id": "ex-27-18",
                "type": "choice",
                "question": "Что сказать, если вы не расслышали фразу?",
                "options": ["¿Puede repetir, por favor?", "¡De nada!", "¡Buenas noches!", "Mucho gusto."],
                "correctAnswer": "¿Puede repetir, por favor?",
                "explanation": "«¿Puede repetir, por favor?» — вежливая просьба повторить сказанное."
            },
            {
                "id": "ex-27-19",
                "type": "gap",
                "question": "Lo ____, no hablo español muy bien.",
                "correctAnswer": "siento",
                "acceptableAnswers": ["siento", "Siento"],
                "explanation": "«Lo siento» означает «мне жаль / прошу прощения»."
            },
            {
                "id": "ex-27-20",
                "type": "tiles",
                "question": "Соберите фразу: «Привет, как твои дела?»",
                "tiles": ["¡Hola!", "¿Cómo", "estás", "tú?"],
                "correctAnswer": "¡Hola! ¿Cómo estás tú?",
                "explanation": "¡Hola! ¿Cómo estás tú?"
            },
            {
                "id": "ex-27-21",
                "type": "input",
                "question": "Напишите по-испански «Меня зовут Матео»:",
                "correctAnswer": "Me llamo Mateo",
                "acceptableAnswers": ["Me llamo Mateo", "me llamo Mateo", "me llamo mateo", "Soy Mateo", "Mi nombre es Mateo"],
                "explanation": "«Me llamo Mateo» или «Soy Mateo»."
            },
            {
                "id": "ex-27-22",
                "type": "transformation",
                "question": "Замените «Soy Ana» на эквивалентную конструкцию с глаголом llamarse:",
                "prompt": "Soy Ana → ____",
                "correctAnswer": "Me llamo Ana",
                "acceptableAnswers": ["Me llamo Ana", "me llamo Ana", "me llamo ana"],
                "explanation": "«Me llamo Ana» — синонимичный способ представиться."
            },
            {
                "id": "ex-27-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какая фраза выражает приветствие и представление одновременно?",
                "options": ["¡Hola! Soy Carlos y soy de Madrid.", "Adiós, hasta mañana en Madrid.", "Buenas noches, no tengo número.", "Gracias por la cuenta."],
                "correctAnswer": "¡Hola! Soy Carlos y soy de Madrid.",
                "explanation": "«¡Hola! Soy Carlos y soy de Madrid» содержит приветствие, имя и происхождение."
            },
            {
                "id": "ex-27-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански приветствие в 15:00 и фразу «Как дела?»:",
                "correctAnswer": "Buenas tardes, ¿cómo estás?",
                "acceptableAnswers": ["Buenas tardes, ¿cómo estás?", "Buenas tardes, como estas?", "Buenas tardes ¿como estas?", "buenas tardes, ¿cómo estás?"],
                "explanation": "«Buenas tardes, ¿cómo estás?»"
            }
        ],
        "miniScenario": {
            "title": "Первая встреча в языковой школе",
            "setting": "Ресепшн школы испанского языка в Мадриде, 10:30 утра.",
            "situation": "Вы впервые пришли на урок испанского языка. Администратор приветствует вас и спрашивает ваше имя.",
            "dialog": [
                {"speaker": "Recepcionista", "text": "¡Buenos días! Bienvenido a la escuela. ¿Cómo te llamas?"},
                {"speaker": "Tú", "text": "¡Buenos días! Me llamo Alex. Mucho gusto."},
                {"speaker": "Recepcionista", "text": "Mucho gusto, Alex. Aquí tienes tu horario. ¡Hasta luego!"},
                {"speaker": "Tú", "text": "Muchas gracias, hasta luego."}
            ],
            "task": "Ответьте администратору, назвав свое имя и выразив вежливость.",
            "prompt": "Как ответить администратору на вопрос «¿Cómo te llamas?»?",
            "options": [
                "¡Buenos días! Me llamo Alex. Mucho gusto.",
                "¡Buenas noches! No entiendo nada.",
                "De nada, adiós.",
                "Por favor, la cuenta."
            ],
            "correctIndex": 0,
            "explanation": "Реплика содержит приветствие по времени суток (Buenos días), правильную форму глагола (Me llamo Alex) и формулу вежливости (Mucho gusto)."
        },
        "shortText": {
            "title": "El primer día de clase de Lucía",
            "text": "Hola a todos. Me llamo Lucía y soy de Roma, Italia. Hoy es mi primer día en Madrid. Por la mañana llego a la escuela a las nueve en punto. Saludo a la profesora: «¡Buenos días, profesora!». Ella es muy amable y me responde: «¡Buenos días, Lucía! Mucho gusto en conocerte». Mis compañeros son simpáticos. Al final de la clase digo: «¡Hasta mañana a todos!». Estoy muy feliz de aprender español.",
            "questions": [
                {
                    "question": "¿De dónde es Lucía?",
                    "options": ["De Madrid, España", "De Roma, Italia", "De Buenos Aires", "De París, Francia"],
                    "correctIndex": 1,
                    "explanation": "В тексте прямо сказано: «Me llamo Lucía y soy de Roma, Italia»."
                },
                {
                    "question": "¿Cómo saluda Lucía a la profesora por la mañana?",
                    "options": ["¡Buenas noches!", "¡Buenos días, profesora!", "¡Hasta luego!", "¡Hola, adiós!"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Saludo a la profesora: ¡Buenos días, profesora!»."
                },
                {
                    "question": "¿Qué dice Lucía al final de la clase al despedirse?",
                    "options": ["¡Hasta mañana a todos!", "¡Por favor!", "¡Muchas gracias solamente!", "¡Buenas tardes!"],
                    "correctIndex": 0,
                    "explanation": "В тексте: «Al final de la clase digo: ¡Hasta mañana a todos!»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Короткая визитка-самопрезентация",
            "prompt": "Напишите короткое приветствие для испаноязычного чата знакомств (3-4 предложения):\n1. Поздоровайтесь.\n2. Назовите свое имя.\n3. Скажите, откуда вы родом.\n4. Вежливо попрощайтесь или пожелайте хорошего дня.",
            "minWords": 15,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение коммуникативной задачи", "points": 30, "description": "Включены приветствие, имя, страна происхождения и вежливое прощание."},
                    {"name": "Грамматическая корректность", "points": 30, "description": "Корректное использование «me llamo / soy de / buenos días» без ошибок согласования."},
                    {"name": "Словарный запас A1", "points": 25, "description": "Использование целевых формул вежливости (mucho gusto, saludos, hasta pronto)."},
                    {"name": "Связность и пунктуация", "points": 15, "description": "Логичное построение предложений, восклицательные знаки ¡!, заглавные буквы."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 7: Subject pronouns (yo/tú/vos/él/ella)
    # ----------------------------------------------------
    7: {
        "id": 7,
        "topicName": "Subject pronouns (yo/tú/vos/él/ella)",
        "russianTitle": "Личные местоимения в роли подлежащего",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u01-first-contact",
        "icon": "👤",
        "summary": "Личные местоимения указывают, кто выполняет действие (я, ты, он, мы, вы, они). В испанском языке они часто опускаются, потому что личное окончание глагола уже однозначно показывает субъект.",
        "mnemonicRule": "Окончание глагола = лицо! Местоимение нужно только для акцента, вежливости или устранения двусмысленности.",
        "goalsRu": [
            "Различать и безошибочно использовать все личные местоимения испанского языка",
            "Понимать разницу между неформальным tú / vos и вежливым usted / ustedes",
            "Различать мужской и женский род во множественном числе (nosotros/nosotras, ellos/ellas)",
            "Правильно опускать местоимения в естественной речи и понимать, когда они необходимы"
        ],
        "sections": [
            {
                "title": "1. Таблица личных местоимений",
                "content": "В испанском языке местоимения имеют грамматический род даже в 1-м и 2-м лице множественного числа.",
                "tables": [
                    {
                        "headers": ["Лицо", "Испанский", "Русский перевод", "Особенности"],
                        "rows": [
                            ["1-е ед.", "yo", "я", "Всегда пишется со строчной буквы (в отличие от англ. I)"],
                            ["2-е ед. (неформ.)", "tú", "ты", "С графическим ударением (tu = твой)"],
                            ["2-е ед. (voseo)", "vos", "ты (Аргентина, Уругвай)", "Используется вместо tú в Риоплатенсе"],
                            ["3-е ед. (муж.)", "él", "он", "С графическим ударением (el = артикль)"],
                            ["3-е ед. (жен.)", "ella", "она", "Произносится [эйя] или [эжя/эшя] в Риоплатенсе"],
                            ["3-е ед. (вежл.)", "usted", "Вы (ед. число)", "Согласуется с глаголом 3-го лица!"],
                            ["1-е мн. (муж./смеш.)", "nosotros", "мы (мужчины или смеш.)", "Если в группе хотя бы один мужчина"],
                            ["1-е мн. (жен.)", "nosotras", "мы (только женщины)", "Исключительно женская группа"],
                            ["2-е мн. (Испания)", "vosotros / vosotras", "вы (неформ. мн. ч.)", "Только в Испании"],
                            ["3-е мн. / 2-е мн.", "ustedes", "Вы (все) / вы", "Вся Латинская Америка для любого «вы (мн.)»"],
                            ["3-е мн. (муж.)", "ellos", "они (мужчины/смеш.)", "Группа мужчин или смешанная"],
                            ["3-е мн. (жен.)", "ellas", "они (только женщины)", "Исключительно женская группа"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Когда местоимения опускаются, а когда нужны",
                "content": "В испанском говорят «Hablo español», а не «Yo hablo español», потому что окончание -o принадлежит только yo. Местоимение добавляют для контраста («Yo estudio y él trabaja») или вежливости («¿Cómo está usted?»).",
                "tables": [
                    {
                        "headers": ["Контекст", "Пример без местоимения", "Пример с акцентом/контрастом"],
                        "rows": [
                            ["Обычная речь", "Vivo en Madrid.", "Yo vivo en Madrid, pero ella vive en Barcelona."],
                            ["Вежливость", "¿De dónde es?", "¿De dónde es usted?"],
                            ["Уточнение 3-го лица", "Habla ruso.", "Él habla ruso (уточняем, он или она)."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Yo soy de México.", "ru": "Я из Мексики."},
            {"es": "Tú hablas muy bien español.", "ru": "Ты очень хорошо говоришь по-испански."},
            {"es": "Vos sos muy simpático.", "ru": "Ты очень приятный (в Аргентине/Уругвае)."},
            {"es": "Él es profesor y ella es médica.", "ru": "Он преподаватель, а она — врач."},
            {"es": "¿Usted es el señor Ramírez?", "ru": "Вы сеньор Рамирес?"},
            {"es": "Nosotros estudiamos en la biblioteca.", "ru": "Мы (мужчины/смешанная группа) учимся в библиотеке."},
            {"es": "Nosotras somos estudiantes de medicina.", "ru": "Мы (женщины) — студентки медицинского."},
            {"es": "Ellos viven en una casa grande.", "ru": "Они (мужчины/смешанная группа) живут в большом доме."},
            {"es": "Ellas son mis hermanas.", "ru": "Они (женщины) — мои сестры."},
            {"es": "¿Ustedes tienen alguna pregunta?", "ru": "У вас (у всех) есть вопрос?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Él» без графического ударения пишется как «El»",
                "correction": "Él es mi amigo vs El amigo",
                "explanation": "«Él» с тильдой — местоимение «он», а «el» без тильды — определенный артикль мужского рода."
            },
            {
                "mistake": "«Tú» путают с притяжательным «tu»",
                "correction": "Tú tienes tu pasaporte",
                "explanation": "«Tú» с тильдой — подлежащее «ты», «tu» без тильды — «твой»."
            },
            {
                "mistake": "Использование местоимения «yo» в каждом предложении",
                "correction": "Hablo español y vivo en Madrid (без лишних yo)",
                "explanation": "Постоянное повторение «yo» звучит неестественно и эгоцентрично для носителей испанского языка."
            }
        ],
        "trapAlert": "Помните про тильды: Él = он (местоимение), el = артикль; Tú = ты (местоимение), tu = твой!",
        "dialectNote": "В Испании для неформального общения с несколькими людьми используют «vosotros/vosotras». Во всей Латинской Америке форму «vosotros» не используют вовсе: к любой группе людей обращаются на «ustedes».",
        "quiz": [
            {
                "question": "Какое местоимение означает «он» в испанском языке?",
                "type": "recognition",
                "options": ["El", "Él", "Ella", "Ellos"],
                "correctIndex": 1,
                "explanations": [
                    "«El» без тильды — определенный артикль мужского рода.",
                    "Правильно: «Él» с тильдой — личное местоимение «он».",
                    "«Ella» означает «она».",
                    "«Ellos» означает «они»."
                ]
            },
            {
                "question": "Какое местоимение используется для группы, состоящей ТОЛЬКО из женщин (мы)?",
                "type": "recognition",
                "options": ["Nosotros", "Nosotras", "Ellas", "Vosotras"],
                "correctIndex": 1,
                "explanations": [
                    "«Nosotros» используется для мужской или смешанной группы.",
                    "Правильно: «Nosotras» — «мы» исключительно для женской группы.",
                    "«Ellas» означает «они (женщины)».",
                    "«Vosotras» означает «вы (девушки)» в Испании."
                ]
            },
            {
                "question": "Какое местоимение выражает вежливое обращение к одному человеку («Вы»)?",
                "type": "recognition",
                "options": ["Tú", "Vos", "Usted", "Ustedes"],
                "correctIndex": 2,
                "explanations": [
                    "«Tú» — неформальное «ты».",
                    "«Vos» — неформальное «ты» в ряде стран Латинской Америки.",
                    "Правильно: «Usted» — вежливое «Вы» к одному лицу.",
                    "«Ustedes» — обращение к нескольким лицам."
                ]
            },
            {
                "question": "В Аргентине и Уругвае вместо местоимения «tú» повсеместно говорят:",
                "type": "recognition",
                "options": ["Vos", "Nosotros", "Ustedes", "Él"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: феномен voseo заменяет «tú» на «vos».",
                    "«Nosotros» означает «мы».",
                    "«Ustedes» — множественное число.",
                    "«Él» — он."
                ]
            },
            {
                "question": "Вставьте правильное местоимение: «Ana y María son médicas. ____ trabajan en el hospital.»",
                "type": "application",
                "options": ["Ellos", "Ellas", "Nosotras", "Él"],
                "correctIndex": 1,
                "explanations": [
                    "«Ellos» относится к мужчинам или смешанной группе.",
                    "Правильно: Ана и Мария — две женщины, поэтому используется «Ellas».",
                    "«Nosotras» значило бы «мы», но говорящий не входит в группу.",
                    "«Él» — единственное число мужского рода."
                ]
            },
            {
                "question": "Вставьте местоимение: «Carlos y yo somos amigos. ____ estudiamos español.»",
                "type": "application",
                "options": ["Ellos", "Nosotros", "Ustedes", "Vosotros"],
                "correctIndex": 1,
                "explanations": [
                    "«Ellos» — они (без участия говорящего).",
                    "Правильно: Карлос и я = «мы» (Nosotros).",
                    "«Ustedes» — вы (множественное).",
                    "«Vosotros» — вы (в Испании)."
                ]
            },
            {
                "question": "Вставьте местоимение вежливости: «Señor García, ¿____ es de Madrid?»",
                "type": "application",
                "options": ["tú", "él", "usted", "vos"],
                "correctIndex": 2,
                "explanations": [
                    "«Tú» слишком фамильярно для сеньора Гарсии.",
                    "«Él» означает «он» (разговор о ком-то третьем), а вопрос задается напрямую.",
                    "Правильно: «usted» — прямое вежливое обращение к сеньору Гарсии.",
                    "«Vos» — неформальное обращение."
                ]
            },
            {
                "question": "В предложении «____ eres muy inteligente» пропущено местоимение:",
                "type": "application",
                "options": ["Yo", "Tú", "Él", "Usted"],
                "correctIndex": 1,
                "explanations": [
                    "С «yo» глагол был бы «soy».",
                    "Правильно: форма «eres» согласуется только с местоимением «Tú».",
                    "С «él» форма была бы «es».",
                    "С «usted» форма была бы «es»."
                ]
            },
            {
                "question": "Как звучит естественная фраза на испанском без избыточного местоимения?",
                "type": "transfer",
                "options": ["Yo hablo español y yo vivo en Madrid.", "Hablo español y vivo en Madrid.", "Yo hablo y yo vivo Madrid.", "Mi hablo español."],
                "correctIndex": 1,
                "explanations": [
                    "Избыточное повторение «yo» перегружает речь.",
                    "Правильно: окончания -o в «hablo» и «vivo» уже ясно указывают на «yo».",
                    "Пропущен предлог «en» перед Madrid и избыточные местоимения.",
                    "«Mi hablo» — грубая ошибка."
                ]
            },
            {
                "question": "В Латинской Америке учитель обращается к классу учеников. Какое местоимение он выберет?",
                "type": "transfer",
                "options": ["Vosotros", "Ustedes", "Ellos", "Nosotros"],
                "correctIndex": 1,
                "explanations": [
                    "«Vosotros» используется только в Испании.",
                    "Правильно: в Латинской Америке ко всем группам учеников обращаются на «Ustedes».",
                    "«Ellos» — третье лицо («они»).",
                    "«Nosotros» — «мы»."
                ]
            },
            {
                "question": "Различение омонимов: выберите предложение, где «el/él» употреблено верно:",
                "type": "transfer",
                "options": ["El es mi hermano y él libro es nuevo.", "Él es mi hermano y el libro es nuevo.", "Él es mi hermano y él libro es nuevo.", "El es mi hermano y el libro es nuevo."],
                "correctIndex": 1,
                "explanations": [
                    "Перепутаны тильды: должно быть «Él» (он) и «el» (артикль).",
                    "Правильно: «Él» (местоимение он) с тильдой, а «el libro» (артикль муж. рода) без тильды.",
                    "«Él libro» — ошибка, перед существительным ставится артикль «el».",
                    "«El es» — ошибка, местоимение «он» пишется с тильдой «Él»."
                ]
            },
            {
                "question": "В комнате находятся 5 девушек и 1 юноша. Какое местоимение обозначает эту группу («они»)?",
                "type": "transfer",
                "options": ["Ellas", "Ellos", "Nosotras", "Vosotras"],
                "correctIndex": 1,
                "explanations": [
                    "«Ellas» используется ТОЛЬКО если в группе нет ни одного мужчины.",
                    "Правильно: в грамматике испанского языка наличие хотя бы одного мужчины делает группу грамматически мужской — «Ellos».",
                    "«Nosotras» — «мы (женщины)».",
                    "«Vosotras» — «вы (женщины)»."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-7-01",
                "type": "choice",
                "question": "Выберите местоимение, соответствующее русскому «мы (женщины)»:",
                "options": ["Nosotras", "Nosotros", "Ellas", "Vosotras"],
                "correctAnswer": "Nosotras",
                "explanation": "«Nosotras» — форма 1-го лица мн. числа женского рода."
            },
            {
                "id": "ex-7-02",
                "type": "gap",
                "question": "____ (он) es médico en el hospital de Madrid.",
                "correctAnswer": "Él",
                "acceptableAnswers": ["Él", "El", "él"],
                "explanation": "Местоимение 3 лица мужского рода: «Él» с тильдой."
            },
            {
                "id": "ex-7-03",
                "type": "tiles",
                "question": "Соберите предложение: «Мы учим испанский каждый день.»",
                "tiles": ["Nosotros", "estudiamos", "español", "todos", "los", "días."],
                "correctAnswer": "Nosotros estudiamos español todos los días.",
                "explanation": "Nosotros + глагол + прямое дополнение + обстоятельство времени."
            },
            {
                "id": "ex-7-04",
                "type": "transformation",
                "question": "Замените группу «María y Laura» на подходящее личное местоимение:",
                "prompt": "María y Laura → ____",
                "correctAnswer": "Ellas",
                "acceptableAnswers": ["Ellas", "ellas"],
                "explanation": "Две женщины в 3-м лице = «Ellas»."
            },
            {
                "id": "ex-7-05",
                "type": "input",
                "question": "Напишите испанское личное местоимение «я»:",
                "correctAnswer": "Yo",
                "acceptableAnswers": ["Yo", "yo"],
                "explanation": "«Yo» — местоимение 1 лица единственного числа."
            },
            {
                "id": "ex-7-06",
                "type": "gap",
                "question": "¿Cómo se llama ____ (Вы - вежливо, один человек)?",
                "correctAnswer": "usted",
                "acceptableAnswers": ["usted", "Usted"],
                "explanation": "Вежливое местоимение единственного числа: «usted»."
            },
            {
                "id": "ex-7-07",
                "type": "choice",
                "question": "Какое местоимение заменяет «Pedro y tú» при обращении в Латинской Америке?",
                "options": ["Ustedes", "Vosotros", "Ellos", "Nosotros"],
                "correctAnswer": "Ustedes",
                "explanation": "Педро и ты = вы (во всей Латинской Америке — ustedes)."
            },
            {
                "id": "ex-7-08",
                "type": "input",
                "question": "Напишите форму «ты» с графическим ударением:",
                "correctAnswer": "Tú",
                "acceptableAnswers": ["Tú", "tú"],
                "explanation": "Местоимение «Tú» обязательно пишется с тильдой."
            },
            {
                "id": "ex-7-09",
                "type": "transformation",
                "question": "Замените «Juan y yo» на личное местоимение:",
                "prompt": "Juan y yo → ____",
                "correctAnswer": "Nosotros",
                "acceptableAnswers": ["Nosotros", "nosotros"],
                "explanation": "Хуан и я = «мы» (Nosotros)."
            },
            {
                "id": "ex-7-10",
                "type": "tiles",
                "question": "Соберите фразу: «Она — моя сестра.»",
                "tiles": ["Ella", "es", "mi", "hermana."],
                "correctAnswer": "Ella es mi hermana.",
                "explanation": "Ella es mi hermana."
            },
            {
                "id": "ex-7-11",
                "type": "gap",
                "question": "Marta y Juan son amables. ____ (они) viven en Sevilla.",
                "correctAnswer": "Ellos",
                "acceptableAnswers": ["Ellos", "ellos"],
                "explanation": "Смешанная группа (мужчина + женщина) обозначается местоимением «Ellos»."
            },
            {
                "id": "ex-7-12",
                "type": "choice",
                "question": "В каком варианте местоимение опускается естественно?",
                "options": ["Vivo en Madrid", "Yo vivo en Madrid", "Él vivo en Madrid", "Tú vivo en Madrid"],
                "correctAnswer": "Vivo en Madrid",
                "explanation": "«Vivo en Madrid» — естественный испанский вариант без лишнего yo."
            },
            {
                "id": "ex-7-13",
                "type": "input",
                "question": "Какое аргентинское местоимение заменяет неформальное «tú»?",
                "correctAnswer": "Vos",
                "acceptableAnswers": ["Vos", "vos"],
                "explanation": "В Аргентине и Уругвае используется местоимение «Vos»."
            },
            {
                "id": "ex-7-14",
                "type": "gap",
                "question": "¿De dónde son ____ (Вы, вежливо ко всем)?",
                "correctAnswer": "ustedes",
                "acceptableAnswers": ["ustedes", "Ustedes"],
                "explanation": "Вежливое обращение ко множеству лиц: «ustedes»."
            },
            {
                "id": "ex-7-15",
                "type": "tiles",
                "question": "Соберите предложение: «Вы (сеньор) очень добры.»",
                "tiles": ["Usted", "es", "muy", "amable."],
                "correctAnswer": "Usted es muy amable.",
                "explanation": "Usted es muy amable."
            },
            {
                "id": "ex-7-16",
                "type": "transformation",
                "question": "Переделайте фразу с мужского рода на женский: «Ellos son altos» → «____»",
                "prompt": "Ellos son altos → ____",
                "correctAnswer": "Ellas son altas",
                "acceptableAnswers": ["Ellas son altas", "ellas son altas"],
                "explanation": "Ellas son altas (согласование местоимения и прилагательного)."
            },
            {
                "id": "ex-7-17",
                "type": "choice",
                "question": "Чем отличается «tú» от «tu»?",
                "options": ["tú = ты (местоимение), tu = твой (притяжательное)", "tú = твой, tu = ты", "Оба слова одинаковы", "tú = Вы, tu = ты"],
                "correctAnswer": "tú = ты (местоимение), tu = твой (притяжательное)",
                "explanation": "«Tú» с тильдой — подлежащее «ты», «tu» без тильды — «твой»."
            },
            {
                "id": "ex-7-18",
                "type": "input",
                "question": "Напишите испанское местоимение «она»:",
                "correctAnswer": "Ella",
                "acceptableAnswers": ["Ella", "ella"],
                "explanation": "«Ella» — местоимение 3 лица женского рода."
            },
            {
                "id": "ex-7-19",
                "type": "gap",
                "question": "____ (ты) eres mi mejor amigo.",
                "correctAnswer": "Tú",
                "acceptableAnswers": ["Tú", "tu", "Tu", "tú"],
                "explanation": "Местоимение 2 лица ед. числа: «Tú»."
            },
            {
                "id": "ex-7-20",
                "type": "tiles",
                "question": "Соберите фразу: «Они (девушки) студентки университета.»",
                "tiles": ["Ellas", "son", "estudiantes", "de", "la", "universidad."],
                "correctAnswer": "Ellas son estudiantes de la universidad.",
                "explanation": "Ellas son estudiantes de la universidad."
            },
            {
                "id": "ex-7-21",
                "type": "choice",
                "question": "Какое местоимение используется в Испании при дружеском обращении к группе парней?",
                "options": ["Vosotros", "Ustedes", "Ellos", "Nosotros"],
                "correctAnswer": "Vosotros",
                "explanation": "В Испании неформальное «вы (ребята)» — «vosotros»."
            },
            {
                "id": "ex-7-22",
                "type": "input",
                "question": "Напишите местоимение «они (только женщины)»:",
                "correctAnswer": "Ellas",
                "acceptableAnswers": ["Ellas", "ellas"],
                "explanation": "«Ellas» — 3 лицо мн. число женский род."
            },
            {
                "id": "ex-7-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Выберите грамматически верное приветствие с вежливым местоимением:",
                "options": ["¡Buenos días! ¿Cómo está usted?", "¡Buenos días! ¿Cómo estás usted?", "¡Buenas noches! ¿Cómo te llamas usted?", "¡Hola! ¿Cómo estás tú señor?"],
                "correctAnswer": "¡Buenos días! ¿Cómo está usted?",
                "explanation": "Местоимение «usted» согласуется с глаголом 3-го лица: «está usted»."
            },
            {
                "id": "ex-7-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Он из Испании, а я из Мексики»:",
                "correctAnswer": "Él es de España y yo soy de México",
                "acceptableAnswers": [
                    "Él es de España y yo soy de México",
                    "El es de España y yo soy de México",
                    "Él es de España y yo de México",
                    "él es de españa y yo soy de méxico"
                ],
                "explanation": "Él es de España y yo soy de México."
            }
        ],
        "miniScenario": {
            "title": "Определение состава группы на курсах",
            "setting": "Языковая школа в Барселоне. Преподаватель делит студентов на пары и группы.",
            "situation": "Учитель уточняет, кто в какой группе занимается. Вам нужно правильно указать на участников.",
            "dialog": [
                {"speaker": "Profesor", "text": "¿Quiénes son los estudiantes de nivel inicial?"},
                {"speaker": "Estudiante", "text": "Ellas son María y Lucía, y nosotros somos Carlos y yo."},
                {"speaker": "Profesor", "text": "Perfecto. ¿Y usted, señor Fernández?"},
                {"speaker": "Sr. Fernández", "text": "Yo soy de nivel intermedio."}
            ],
            "task": "Объясните учителю, что вы с другом — новички.",
            "prompt": "Как сказать учителю: «Мы (я и Карлос) — студенты начального уровня»?",
            "options": [
                "Nosotros somos estudiantes de nivel inicial.",
                "Ellas son estudiantes de nivel inicial.",
                "Usted es estudiante de nivel inicial.",
                "Yo son estudiantes de nivel inicial."
            ],
            "correctIndex": 0,
            "explanation": "«Nosotros» правильно объединяет говорящего и Карлоса в 1-е лицо мн. числа."
        },
        "shortText": {
            "title": "Nuestra clase internacional",
            "text": "En mi clase de español hay personas de muchos países. Yo soy de Rusia y me llamo Alex. Mi amigo Marco es de Italia; él habla italiano e inglés. Elena y Carla son de Alemania; ellas estudian mucho todos los días. El profesor se llama señor Martínez; usted puede ver que él es muy paciente con todos. Nosotros formamos un gran equipo y practicamos juntos.",
            "questions": [
                {
                    "question": "¿Quién es de Italia en la clase?",
                    "options": ["Alex", "Marco", "Elena", "El señor Martínez"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Mi amigo Marco es de Italia; él habla italiano...»."
                },
                {
                    "question": "¿Qué pronombre se usa para Elena y Carla?",
                    "options": ["Ellos", "Ellas", "Vosotras", "Nosotras"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Elena y Carla son de Alemania; ellas estudian mucho...»."
                },
                {
                    "question": "¿Qué pronombre usa el narrador para referirse a toda la clase reunida?",
                    "options": ["Ustedes", "Ellos", "Nosotros", "Vosotros"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «Nosotros formamos un gran equipo...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание членов группы или семьи с местоимениями",
            "prompt": "Напишите короткий текст (4-5 предложений), представив себя и двух своих друзей или родственников:\n1. Назовите себя через «yo» или глагол.\n2. Назовите друга через «él» и подругу через «ella».\n3. Объедините вас всех местоимением «nosotros/nosotras».\n4. Укажите, откуда вы все родом.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Употребление целевой грамматики", "points": 35, "description": "Правильное использование местоимений (yo, él, ella, nosotros/as) и их согласование с глаголами."},
                    {"name": "Выполнение задания", "points": 30, "description": "Представлены все упомянутые лица и их происхождение."},
                    {"name": "Словарный запас A1", "points": 20, "description": "Слова по темам «личность», «страны», «профессии/статус»."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Правильные тильды в «él», заглавные буквы в именах."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 19: Numbers and counting
    # ----------------------------------------------------
    19: {
        "id": 19,
        "topicName": "Numbers and counting",
        "russianTitle": "Числа и счет от 0 до 20",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u01-first-contact",
        "icon": "🔢",
        "summary": "Базовые количественные числительные испанского языка от 0 до 20: правильное написание, произношение, использование для счета предметов, возраста, номеров телефонов и цен.",
        "mnemonicRule": "16-19 пишутся в ОДНО слово: dieciséis, diecisiete, dieciocho, diecinueve (diez + y + número).",
        "goalsRu": [
            "Считать от 0 до 20 на испанском языке без пауз",
            "Понимать на слух и диктовать номера телефонов и цены",
            "Правильно отвечать на вопрос о возрасте: «Tengo ... años»",
            "Понимать усечение числительного uno → un перед существительными мужского рода"
        ],
        "sections": [
            {
                "title": "1. Числительные от 0 до 15",
                "content": "Числа от 0 до 15 имеют уникальные исторические корни, их нужно выучить наизусть:",
                "tables": [
                    {
                        "headers": ["Цифра", "Испанский", "Произношение", "Русский"],
                        "rows": [
                            ["0", "cero", "[сэро]", "ноль"],
                            ["1", "uno / un / una", "[уно]", "один / одна"],
                            ["2", "dos", "[дос]", "два"],
                            ["3", "tres", "[трэс]", "три"],
                            ["4", "cuatro", "[куатро]", "четыре"],
                            ["5", "cinco", "[синко]", "пять"],
                            ["6", "seis", "[сэйс]", "шесть"],
                            ["7", "siete", "[сьетэ]", "семь"],
                            ["8", "ocho", "[очо]", "восемь"],
                            ["9", "nueve", "[нуэвэ]", "девять"],
                            ["10", "diez", "[дьес]", "десять"],
                            ["11", "once", "[онсэ]", "одиннадцать"],
                            ["12", "doce", "[досэ]", "двенадцать"],
                            ["13", "trece", "[трэсэ]", "тринадцать"],
                            ["14", "catorce", "[каторсэ]", "четырнадцать"],
                            ["15", "quince", "[кинсэ]", "пятнадцать"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Числительные от 16 до 20 и правило усечения uno",
                "content": "Числа 16–19 образуются слиянием dieci + число и пишутся ВСЕГДА слитно. Числительное uno перед существительным мужского рода сокращается до un (un libro), а перед женским становится una (una mesa).",
                "tables": [
                    {
                        "headers": ["Цифра", "Испанский", "Особенность написания", "Пример"],
                        "rows": [
                            ["16", "dieciséis", "Слитное написание с графическим ударением!", "dieciséis euros"],
                            ["17", "diecisiete", "Слитное написание", "diecisiete estudiantes"],
                            ["18", "dieciocho", "Слитное написание", "dieciocho años"],
                            ["19", "diecinueve", "Слитное написание", "diecinueve libros"],
                            ["20", "veinte", "Заканчивается на -e", "veinte minutos"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Tengo veinte años.", "ru": "Мне двадцать лет."},
            {"es": "Hay tres libros en la mesa.", "ru": "На столе три книги."},
            {"es": "El billete cuesta quince euros.", "ru": "Билет стоит пятнадцать евро."},
            {"es": "Mi número de teléfono es cinco-cinco-cinco, doce-trece.", "ru": "Мой номер телефона 555-12-13."},
            {"es": "Tengo un hermano y dos hermanas.", "ru": "У меня один брат и две сестры."},
            {"es": "Son las cuatro de la tarde.", "ru": "Сейчас четыре часа дня."},
            {"es": "Compro diez manzanas rojas.", "ru": "Я покупаю десять красных яблок."},
            {"es": "La lección dura dieciséis minutos.", "ru": "Урок длится шестнадцать минут."},
            {"es": "En la clase hay dieciocho estudiantes.", "ru": "В классе восемнадцать студентов."},
            {"es": "Dos más dos son cuatro.", "ru": "Два плюс два равно четыре."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Diez y seis» раздельно в три слова",
                "correction": "dieciséis (в одно слово с тильдой)",
                "explanation": "Числа от 16 до 29 в современном испанском пишутся исключительно слитно: dieciséis, diecisiete..."
            },
            {
                "mistake": "«Uno libro» вместо «un libro»",
                "correction": "un libro / una mesa",
                "explanation": "Перед существительным мужского рода числительное «uno» обязательно усекается до «un»."
            },
            {
                "mistake": "«Tengo veinte» без слова «años» при ответе о возрасте",
                "correction": "Tengo veinte años",
                "explanation": "В испанском нельзя опускать слово «años» при указании возраста (в отличие от английского 'I am twenty')."
            }
        ],
        "trapAlert": "Число 16 пишется с ударением: «dieciséis». Не забывайте тильду!",
        "dialectNote": "При диктовке номеров телефонов в Испании цифры группируют парами (por ejemplo, 622 34 56 78: sesenta y dos, treinta y cuatro...), а в Латинской Америке чаще диктуют по одной или по три цифры.",
        "quiz": [
            {
                "question": "Какое число следует за «catorce»?",
                "type": "recognition",
                "options": ["Trece", "Quince", "Dieciséis", "Doce"],
                "correctIndex": 1,
                "explanations": [
                    "«Trece» — 13.",
                    "Правильно: 14 (catorce) → 15 (quince).",
                    "«Dieciséis» — 16.",
                    "«Doce» — 12."
                ]
            },
            {
                "question": "Как правильно пишется число 16 на испанском языке?",
                "type": "recognition",
                "options": ["Diez y seis", "Dieciseis", "Dieciséis", "Dieceséis"],
                "correctIndex": 2,
                "explanations": [
                    "Раздельное написание «Diez y seis» устарело.",
                    "Без ударения форма неверна, по правилам ударения нужна тильда.",
                    "Правильно: «dieciséis» пишется слитно с тильдой над -é-.",
                    "Неверная корневая гласная."
                ]
            },
            {
                "question": "Какое число означает «once»?",
                "type": "recognition",
                "options": ["1", "9", "11", "12"],
                "correctIndex": 2,
                "explanations": [
                    "1 — uno.",
                    "9 — nueve.",
                    "Правильно: «once» означает 11.",
                    "12 — doce."
                ]
            },
            {
                "question": "Сколько дней в двух неделях (7 + 7)?",
                "type": "recognition",
                "options": ["Doce", "Trece", "Catorce", "Quince"],
                "correctIndex": 2,
                "explanations": [
                    "Doce = 12.",
                    "Trece = 13.",
                    "Правильно: 7 + 7 = 14 (catorce).",
                    "Quince = 15."
                ]
            },
            {
                "question": "Как правильно сказать «один билет»?",
                "type": "application",
                "options": ["Uno billete", "Un billete", "Una billete", "Unos billete"],
                "correctIndex": 1,
                "explanations": [
                    "Перед существительным мужского рода uno усекается.",
                    "Правильно: «un billete» (слово billete мужского рода).",
                    "Una — форма женского рода.",
                    "Unos — множественное число."
                ]
            },
            {
                "question": "Решите пример: «Ocho + cinco = ____»",
                "type": "application",
                "options": ["Doce", "Trece", "Catorce", "Quince"],
                "correctIndex": 1,
                "explanations": [
                    "8 + 5 = 13.",
                    "Правильно: 8 + 5 = 13 («trece»).",
                    "Catorce = 14.",
                    "Quince = 15."
                ]
            },
            {
                "question": "Как сказать «Мне 18 лет»?",
                "type": "application",
                "options": ["Soy dieciocho años.", "Tengo dieciocho años.", "Estoy dieciocho años.", "Tengo dieciocho."],
                "correctIndex": 1,
                "explanations": [
                    "Возраст в испанском выражается глаголом tener, а не ser.",
                    "Правильно: «Tengo dieciocho años».",
                    "Глагол estar не используется для возраста.",
                    "Нельзя опускать слово «años»."
                ]
            },
            {
                "question": "Решите пример: «Veinte - tres = ____»",
                "type": "application",
                "options": ["Diecisiete", "Dieciséis", "Dieciocho", "Diecinueve"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: 20 - 3 = 17 («diecisiete»).",
                    "Dieciséis = 16.",
                    "Dieciocho = 18.",
                    "Diecinueve = 19."
                ]
            },
            {
                "question": "В магазине вам говорят: «Son doce euros». Сколько евро нужно заплатить?",
                "type": "transfer",
                "options": ["2 евро", "10 евро", "12 евро", "20 евро"],
                "correctIndex": 2,
                "explanations": [
                    "2 — dos.",
                    "10 — diez.",
                    "Правильно: «doce» — это 12 евро.",
                    "20 — veinte."
                ]
            },
            {
                "question": "Вам диктуют телефон: «Nueve, uno, cuatro, dos, cero». Какие это цифры?",
                "type": "transfer",
                "options": ["9 1 4 2 0", "9 2 4 1 0", "8 1 4 2 0", "9 1 3 2 0"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: nueve (9), uno (1), cuatro (4), dos (2), cero (0).",
                    "Вторая цифра uno (1), а не dos (2).",
                    "Первая цифра nueve (9), а не ocho (8).",
                    "Третья цифра cuatro (4), а не tres (3)."
                ]
            },
            {
                "question": "В автобусе 19 мест. Как сказать «19 мест» по-испански?",
                "type": "transfer",
                "options": ["Diecinueve plazas", "Diez y nueve plazas", "Veinte menos uno plazas", "Dieciocho plazas"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «diecinueve plazas» пишется слитно.",
                    "Раздельное написание ошибочно.",
                    "Математическое выражение неестественно для счета предметов.",
                    "Dieciocho = 18."
                ]
            },
            {
                "question": "В гостинице вам дают ключ с номером «Habitación 15». Как назвать номер портье?",
                "type": "transfer",
                "options": ["Habitación cinco", "Habitación quince", "Habitación cincuenta", "Habitación once"],
                "correctIndex": 1,
                "explanations": [
                    "Cinco = 5.",
                    "Правильно: 15 по-испански — «quince».",
                    "Cincuenta = 50.",
                    "Once = 11."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-19-01",
                "type": "choice",
                "question": "Какое число соответствует испанскому «quince»?",
                "options": ["15", "5", "50", "14"],
                "correctAnswer": "15",
                "explanation": "Quince = 15."
            },
            {
                "id": "ex-19-02",
                "type": "gap",
                "question": "Tengo ____ (1) gato y dos perros.",
                "correctAnswer": "un",
                "acceptableAnswers": ["un", "Un"],
                "explanation": "Перед мужским родом (gato) uno сокращается в «un»."
            },
            {
                "id": "ex-19-03",
                "type": "tiles",
                "question": "Соберите фразу: «Мне двадцать лет.»",
                "tiles": ["Tengo", "veinte", "años."],
                "correctAnswer": "Tengo veinte años.",
                "explanation": "Tengo + число + años."
            },
            {
                "id": "ex-19-04",
                "type": "input",
                "question": "Напишите словом по-испански число 12:",
                "correctAnswer": "Doce",
                "acceptableAnswers": ["Doce", "doce"],
                "explanation": "12 по-испански — «doce»."
            },
            {
                "id": "ex-19-05",
                "type": "transformation",
                "question": "Преобразуйте цифру в слово: «Hay 7 días en la semana» → «Hay ____ días»",
                "prompt": "7 → ____",
                "correctAnswer": "siete",
                "acceptableAnswers": ["siete", "Siete"],
                "explanation": "7 = siete."
            },
            {
                "id": "ex-19-06",
                "type": "gap",
                "question": "Diez más seis son ____ (16).",
                "correctAnswer": "dieciséis",
                "acceptableAnswers": ["dieciséis", "dieciseis", "Dieciséis"],
                "explanation": "16 = dieciséis (пишется слитно с тильдой)."
            },
            {
                "id": "ex-19-07",
                "type": "choice",
                "question": "Как пишется число 19 по-испански?",
                "options": ["Diecinueve", "Diez y nueve", "Decinueve", "Diecinueve años"],
                "correctAnswer": "Diecinueve",
                "explanation": "Diecinueve пишется в одно слово."
            },
            {
                "id": "ex-19-08",
                "type": "input",
                "question": "Напишите словом по-испански число 8:",
                "correctAnswer": "Ocho",
                "acceptableAnswers": ["Ocho", "ocho"],
                "explanation": "8 = ocho."
            },
            {
                "id": "ex-19-09",
                "type": "tiles",
                "question": "Соберите пример: «Два плюс три равно пять.»",
                "tiles": ["Dos", "más", "tres", "son", "cinco."],
                "correctAnswer": "Dos más tres son cinco.",
                "explanation": "Dos más tres son cinco."
            },
            {
                "id": "ex-19-10",
                "type": "transformation",
                "question": "Замените цифру словом: «Compro 1 manzana» → «Compro ____ manzana»",
                "prompt": "1 manzana → ____",
                "correctAnswer": "una",
                "acceptableAnswers": ["una", "Una"],
                "explanation": "Перед существительным женского рода (manzana) число 1 = «una»."
            },
            {
                "id": "ex-19-11",
                "type": "gap",
                "question": "El billete de autobús cuesta ____ (2) euros.",
                "correctAnswer": "dos",
                "acceptableAnswers": ["dos", "Dos"],
                "explanation": "2 = dos."
            },
            {
                "id": "ex-19-12",
                "type": "input",
                "question": "Напишите словом число 11:",
                "correctAnswer": "Once",
                "acceptableAnswers": ["Once", "once"],
                "explanation": "11 = once."
            },
            {
                "id": "ex-19-13",
                "type": "choice",
                "question": "Сколько пальцев на двух руках (5 + 5)?",
                "options": ["Diez", "Once", "Ocho", "Nueve"],
                "correctAnswer": "Diez",
                "explanation": "5 + 5 = 10 (diez)."
            },
            {
                "id": "ex-19-14",
                "type": "gap",
                "question": "Tengo catorce libros y compro cuatro más. Ahora tengo ____ (18).",
                "correctAnswer": "dieciocho",
                "acceptableAnswers": ["dieciocho", "Dieciocho"],
                "explanation": "14 + 4 = 18 (dieciocho)."
            },
            {
                "id": "ex-19-15",
                "type": "tiles",
                "question": "Соберите фразу: «В классе тринадцать столов.»",
                "tiles": ["En", "la", "clase", "hay", "trece", "mesas."],
                "correctAnswer": "En la clase hay trece mesas.",
                "explanation": "En la clase hay trece mesas."
            },
            {
                "id": "ex-19-16",
                "type": "transformation",
                "question": "Преобразуйте цифру в слово: «Vivo en el piso 4» → «Vivo en el piso ____»",
                "prompt": "4 → ____",
                "correctAnswer": "cuatro",
                "acceptableAnswers": ["cuatro", "Cuatro"],
                "explanation": "4 = cuatro."
            },
            {
                "id": "ex-19-17",
                "type": "input",
                "question": "Напишите словом число 17:",
                "correctAnswer": "Diecisiete",
                "acceptableAnswers": ["Diecisiete", "diecisiete"],
                "explanation": "17 = diecisiete."
            },
            {
                "id": "ex-19-18",
                "type": "choice",
                "question": "Какое число меньше: «nueve» или «diez»?",
                "options": ["Nueve", "Diez", "Son iguales", "Once"],
                "correctAnswer": "Nueve",
                "explanation": "Nueve (9) меньше, чем diez (10)."
            },
            {
                "id": "ex-19-19",
                "type": "gap",
                "question": "El hotel tiene ____ (20) habitaciones.",
                "correctAnswer": "veinte",
                "acceptableAnswers": ["veinte", "Veinte"],
                "explanation": "20 = veinte."
            },
            {
                "id": "ex-19-19b",
                "type": "tiles",
                "question": "Соберите фразу: «Сколько тебе лет?»",
                "tiles": ["¿Cuántos", "años", "tienes", "tú?"],
                "correctAnswer": "¿Cuántos años tienes tú?",
                "explanation": "¿Cuántos años tienes tú?"
            },
            {
                "id": "ex-19-21",
                "type": "input",
                "question": "Напишите словом число 0:",
                "correctAnswer": "Cero",
                "acceptableAnswers": ["Cero", "cero"],
                "explanation": "0 = cero."
            },
            {
                "id": "ex-19-22",
                "type": "transformation",
                "question": "Напишите результат математического действия словами: «Diez + cuatro = ____»",
                "prompt": "10 + 4 → ____",
                "correctAnswer": "catorce",
                "acceptableAnswers": ["catorce", "Catorce"],
                "explanation": "10 + 4 = 14 (catorce)."
            },
            {
                "id": "ex-19-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Выберите корректное предложение со спиральным повторением приветствия и возраста:",
                "options": [
                    "¡Hola! Me llamo Diego y tengo diecinueve años.",
                    "¡Buenas noches! Soy diecinueve años.",
                    "Mucho gusto, mi edad es diecinueve número.",
                    "Hasta luego, me llamo diecinueve."
                ],
                "correctAnswer": "¡Hola! Me llamo Diego y tengo diecinueve años.",
                "explanation": "Приветствие + представление (Me llamo) + возраст (tengo diecinueve años)."
            },
            {
                "id": "ex-19-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня есть 3 брата»:",
                "correctAnswer": "Tengo tres hermanos",
                "acceptableAnswers": ["Tengo tres hermanos", "tengo tres hermanos", "Yo tengo tres hermanos"],
                "explanation": "Tengo tres hermanos."
            }
        ],
        "miniScenario": {
            "title": "Покупка билетов в музей",
            "setting": "Касса музея Прадо в Мадриде.",
            "situation": "Вы покупаете билеты для себя и двоих друзей. Кассир называет стоимость и просит указать количество.",
            "dialog": [
                {"speaker": "Cajero", "text": "¡Buenos días! ¿Cuántas entradas necesita?"},
                {"speaker": "Tú", "text": "Buenos días. Tres entradas, por favor."},
                {"speaker": "Cajero", "text": "Son quince euros en total. ¿Paga con tarjeta o en efectivo?"},
                {"speaker": "Tú", "text": "Pago con tarjeta. Aquí tiene. Muchas gracias."}
            ],
            "task": "Закажите три билета вежливо.",
            "prompt": "Как сказать кассиру: «Три билета, пожалуйста»?",
            "options": [
                "Tres entradas, por favor.",
                "Trece entradas, de nada.",
                "Tengo tres años, por favor.",
                "Tres euros solamente."
            ],
            "correctIndex": 0,
            "explanation": "«Tres entradas, por favor» — правильное числительное 3 и формула вежливости."
        },
        "shortText": {
            "title": "La pequeña tienda de Don Antonio",
            "text": "Don Antonio tiene una pequeña tienda de frutas en el barrio. En la tienda hay diez tipos de manzanas y cinco tipos de plátanos. Hoy tiene quince clientes por la mañana. Un kilo de naranjas cuesta tres euros y una botella de agua cuesta dos euros. Antonio tiene sesenta años y trabaja ocho horas al día con una sonrisa.",
            "questions": [
                {
                    "question": "¿Cuántos tipos de manzanas hay en la tienda?",
                    "options": ["Cinco", "Diez", "Quince", "Tres"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «En la tienda hay diez tipos de manzanas...»."
                },
                {
                    "question": "¿Cuántos clientes tiene Antonio por la mañana?",
                    "options": ["Ocho", "Tres", "Quince", "Diez"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «Hoy tiene quince clientes por la mañana»."
                },
                {
                    "question": "¿Cuánto cuesta un kilo de naranjas?",
                    "options": ["Dos euros", "Tres euros", "Cinco euros", "Diez euros"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Un kilo de naranjas cuesta tres euros»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Анкета с контактными данными и числами",
            "prompt": "Заполните короткий опросный лист на испанском (3-4 предложения):\n1. Укажите свой возраст (Tengo ... años).\n2. Напишите свой номер телефона словами или цифрами (Mi número de teléfono es...).\n3. Укажите количество книг или предметов у вас дома (Tengo ... libros).",
            "minWords": 15,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование числительных", "points": 35, "description": "Корректное написание числительных от 0 до 20 (особенно un/una, dieciséis)."},
                    {"name": "Грамматика конструкции tener", "points": 30, "description": "Правильное использование «Tengo ... años / libros»."},
                    {"name": "Лексическая точность", "points": 20, "description": "Слова número, teléfono, años, libros."},
                    {"name": "Связность и орфография", "points": 15, "description": "Пунктуация, заглавные буквы, отсутствие опечаток."}
                ]
            }
        }
    }
}

