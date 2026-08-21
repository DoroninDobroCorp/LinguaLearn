# -*- coding: utf-8 -*-
"""Unit 3: Кто мы и какие мы (Topics 1, 13, 30)"""

unit3_topics = {
    # ----------------------------------------------------
    # TOPIC 1: Ser vs Estar (basic)
    # ----------------------------------------------------
    1: {
        "id": 1,
        "topicName": "Ser vs Estar (basic)",
        "russianTitle": "Глаголы SER и ESTAR: фундаментальная разница",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u03-identity",
        "icon": "⚖️",
        "summary": "В русском языке один глагол «быть», а в испанском — два! SER выражает постоянную суть, идентичность, профессию и происхождение (Кто? Что это? Чей? Откуда?). ESTAR выражает временное состояние, настроение, самочувствие и физическое местонахождение (Где? Как себя чувствует?).",
        "mnemonicRule": "SER = СУТЬ и ПАСПОРТ (DOCTOR) vs ESTAR = СОСТОЯНИЕ и ГЕОЛОКАЦИЯ (PLACE).",
        "goalsRu": [
            "Спрягать глаголы ser (soy, eres, es, somos, sois, son) и estar (estoy, estás, está, estamos, estáis, están)",
            "Выбирать SER для национальности, профессии, происхождения и постоянных черт характера",
            "Выбирать ESTAR для местоположения (где находится предмет/человек) и временного самочувствия/настроения",
            "Различать изменение значения прилагательных с ser и estar (ser bueno = добрый/хороший, estar bueno = вкусный/выздоровевший)"
        ],
        "sections": [
            {
                "title": "1. Спряжение в настоящем времени (Presente de Indicativo)",
                "content": "Оба глагола являются неправильными и требуют запоминания всех форм:",
                "tables": [
                    {
                        "headers": ["Лицо / Местоимение", "SER (Суть / Идентичность)", "ESTAR (Состояние / Место)"],
                        "rows": [
                            ["yo", "soy (я есть)", "estoy (я нахожусь / мне)"],
                            ["tú", "eres (ты есть)", "estás (ты находишься / тебе)"],
                            ["vos (Аргентина)", "sos (ты есть)", "estás (ты находишься)"],
                            ["él / ella / usted", "es (он / она есть / Вы)", "está (он находится / в состоянии)"],
                            ["nosotros / nosotras", "somos (мы есть)", "estamos (мы находимся)"],
                            ["vosotros / vosotras", "sois (вы есть)", "estáis (вы находитесь)"],
                            ["ellos / ellas / ustedes", "son (они / Вы все есть)", "están (они находятся)"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Мнемонические правила: DOCTOR против PLACE",
                "content": "Используйте проверенные мнемонические акронимы:",
                "tables": [
                    {
                        "headers": ["SER (D-O-C-T-O-R)", "Пример с SER", "ESTAR (P-L-A-C-E)", "Пример с ESTAR"],
                        "rows": [
                            ["Description (Описание)", "Soy alto y moreno.", "Position (Положение)", "Estoy sentado en la silla."],
                            ["Origin (Происхождение)", "Soy de Argentina.", "Location (Локация)", "Madrid está en España."],
                            ["Characteristic (Характер)", "Es inteligente y amable.", "Action (Действие -ing)", "Estoy comiendo una manzana."],
                            ["Time / Date (Время/Дата)", "Son las tres de la tarde.", "Condition (Состояние/Здоровье)", "Estoy enfermo hoy."],
                            ["Occupation (Профессия)", "Soy médico en el hospital.", "Emotion (Эмоция/Настроение)", "Estoy muy feliz y contento."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Soy de España, pero ahora estoy en México.", "ru": "Я из Испании (ser), но сейчас нахожусь в Мексике (estar)."},
            {"es": "¿Cómo estás hoy? —Estoy muy bien, gracias.", "ru": "Как ты себя чувствуешь сегодня? —Отлично, спасибо (estar)."},
            {"es": "Carlos es muy simpático y alegre.", "ru": "Карлос очень приятный и жизнерадостный (характер, ser)."},
            {"es": "La sopa está muy caliente.", "ru": "Суп очень горячий (состояние в данный момент, estar)."},
            {"es": "El museo está en el centro de la ciudad.", "ru": "Музей находится в центре города (геолокация, estar)."},
            {"es": "Hoy estoy cansado después del trabajo.", "ru": "Сегодня я устал после работы (временное состояние, estar)."},
            {"es": "Nosotros somos estudiantes de medicina.", "ru": "Мы — студенты медицинского факультета (профессия/статус, ser)."},
            {"es": "La puerta está cerrada.", "ru": "Дверь закрыта (состояние предмета, estar)."},
            {"es": "Hoy es lunes, son las diez.", "ru": "Сегодня понедельник, сейчас десять часов (время/дата, ser)."},
            {"es": "¿Dónde está la estación de metro?", "ru": "Где находится станция метро? (локация, estar)."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Madrid es en España» вместо «Madrid está en España»",
                "correction": "Madrid está en España",
                "explanation": "Любое физическое местоположение объектов и городов ВСЕГДА выражается глаголом ESTAR."
            },
            {
                "mistake": "«Soy cansado» вместо «Estoy cansado»",
                "correction": "Estoy cansado / Estoy feliz",
                "explanation": "Усталость, настроение и самочувствие — это временные состояния, поэтому используется только ESTAR."
            },
            {
                "mistake": "«¿Cómo eres?» в значении «Как дела?»",
                "correction": "¿Cómo estás? (Как дела?) vs ¿Cómo eres? (Какой ты по характеру/внешности?)",
                "explanation": "«¿Cómo estás?» спрашивает о самочувствии (estar), а «¿Cómo eres?» — о внешности и характере (ser)."
            }
        ],
        "trapAlert": "Геолокация — ВСЕГДА ESTAR! Даже для постоянных зданий: «El museo está en Madrid».",
        "dialectNote": "В Аргентине и Уругвае форма 2-го лица глагола ser для местоимения vos — «sos» («Vos sos de Buenos Aires»), а для estar — «estás» («¿Cómo estás vos?»).",
        "quiz": [
            {
                "question": "Какой глагол выражает физическое местонахождение объекта?",
                "type": "recognition",
                "options": ["SER", "ESTAR", "TENER", "HAY"],
                "correctIndex": 1,
                "explanations": [
                    "SER никогда не используется для геолокации объектов.",
                    "Правильно: ESTAR используется для любого местоположения («El hotel está aquí»).",
                    "TENER означает «иметь».",
                    "HAY выражает наличие/существование («здесь есть аптека»)."
                ]
            },
            {
                "question": "Какая форма глагола ser соответствует местоимению «nosotros»?",
                "type": "recognition",
                "options": ["somos", "estamos", "sois", "son"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: nosotros «somos».",
                    "«estamos» — форма глагола estar.",
                    "«sois» — форма vosotros.",
                    "«son» — форма ellos/ustedes."
                ]
            },
            {
                "question": "Какая форма глагола estar соответствует «yo»?",
                "type": "recognition",
                "options": ["soy", "estoy", "estás", "está"],
                "correctIndex": 1,
                "explanations": [
                    "«soy» — форма глагола ser.",
                    "Правильно: yo «estoy».",
                    "«estás» — форма tú.",
                    "«está» — форма él/ella/usted."
                ]
            },
            {
                "question": "Как переводится вопрос «¿Cómo eres?»?",
                "type": "recognition",
                "options": ["Как твои дела?", "Какой ты по характеру/внешности?", "Где ты находишься?", "Откуда ты?"],
                "correctIndex": 1,
                "explanations": [
                    "«Как дела?» — ¿Cómo estás?",
                    "Правильно: «¿Cómo eres?» (ser) спрашивает о постоянных свойствах личности и внешности.",
                    "«Где ты?» — ¿Dónde estás?",
                    "«Откуда ты?» — ¿De dónde eres?"
                ]
            },
            {
                "question": "Вставьте глагол: «Madrid ____ en el centro de España.»",
                "type": "application",
                "options": ["es", "está", "son", "están"],
                "correctIndex": 1,
                "explanations": [
                    "Ошибка: местоположение города нельзя выражать глаголом ser.",
                    "Правильно: «está» (местоположение выражается estar).",
                    "Мадрид в единственном числе.",
                    "Множественное число не подходит."
                ]
            },
            {
                "question": "Вставьте глагол: «Hoy yo ____ muy cansado por el trabajo.»",
                "type": "application",
                "options": ["soy", "estoy", "eres", "está"],
                "correctIndex": 1,
                "explanations": [
                    "Усталость — временное состояние, ser не подходит.",
                    "Правильно: «estoy cansado» (временное состояние с estar).",
                    "Форма 2 лица.",
                    "Форма 3 лица."
                ]
            },
            {
                "question": "Вставьте глагол: «Mi hermana ____ médica en el hospital.»",
                "type": "application",
                "options": ["está", "es", "somos", "estoy"],
                "correctIndex": 1,
                "explanations": [
                    "Профессия — постоянная характеристика (ser), а не временное состояние.",
                    "Правильно: «es médica» (профессия выражается глаголом ser).",
                    "Множественное число.",
                    "Первое лицо."
                ]
            },
            {
                "question": "Вставьте глагол: «La sopa ____ muy caliente, ten cuidado.»",
                "type": "application",
                "options": ["es", "está", "son", "están"],
                "correctIndex": 1,
                "explanations": [
                    "Температура супа в данный момент — это состояние, а не вечная суть.",
                    "Правильно: «está caliente» (температурное состояние в данный момент).",
                    "Суп в единственном числе.",
                    "Множественное число."
                ]
            },
            {
                "question": "Вам звонит друг и спрашивает «¿Dónde estás?». Вы дома. Ваш ответ:",
                "type": "transfer",
                "options": ["Soy en casa.", "Estoy en casa.", "Tengo casa.", "Hay en casa."],
                "correctIndex": 1,
                "explanations": [
                    "Ser нельзя использовать с предлогом «en» для выражения нахождения.",
                    "Правильно: «Estoy en casa» (местонахождение).",
                    "Означает «у меня есть дом».",
                    "Бессмысленная фраза."
                ]
            },
            {
                "question": "Вы хотите сказать, что ваш друг — добрый и отзывчивый человек по натуре. Что выбрать?",
                "type": "transfer",
                "options": ["Mi amigo está bueno.", "Mi amigo es bueno.", "Mi amigo tiene bueno.", "Mi amigo hace bueno."],
                "correctIndex": 1,
                "explanations": [
                    "«Estar bueno» в разговорной речи значит «быть сексуально привлекательным» или «выздороветь».",
                    "Правильно: «Es bueno» означает «он добрый / хороший человек по натуре».",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "В гостинице вы обнаружили, что окно открыто. Как сообщить портье?",
                "type": "transfer",
                "options": ["La ventana es abierta.", "La ventana está abierta.", "La ventana son abierta.", "La ventana están abierta."],
                "correctIndex": 1,
                "explanations": [
                    "Состояние предмета (открыто/закрыто) выражается глаголом estar.",
                    "Правильно: «La ventana está abierta» (состояние в данный момент).",
                    "Неверный глагол и число.",
                    "Окно в единственном числе."
                ]
            },
            {
                "question": "Какое предложение грамматически безупречно передает национальность и текущее состояние?",
                "type": "transfer",
                "options": [
                    "Soy español y hoy estoy muy contento.",
                    "Estoy español y hoy soy muy contento.",
                    "Soy español y hoy soy muy contento.",
                    "Estoy español y hoy estoy muy contento."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: национальность постоянна (Soy español), а радость — временное состояние (estoy contento).",
                    "Национальность нельзя выражать estar, а радость — ser.",
                    "«Soy contento» ошибочно, радость — это состояние (estar).",
                    "«Estoy español» — грубая ошибка."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-1-01",
                "type": "choice",
                "question": "Какой глагол нужен для происхождения: «Yo ____ de Colombia»?",
                "options": ["soy", "estoy", "tengo", "hago"],
                "correctAnswer": "soy",
                "explanation": "Происхождение выражается глаголом ser: «soy de Colombia»."
            },
            {
                "id": "ex-1-02",
                "type": "gap",
                "question": "El museo del Prado ____ (находится) en Madrid.",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "Геолокация — глагол estar: «está en Madrid»."
            },
            {
                "id": "ex-1-03",
                "type": "tiles",
                "question": "Соберите фразу: «Я из Испании, но сейчас я в Мексике.»",
                "tiles": ["Soy", "de", "España,", "pero", "ahora", "estoy", "en", "México."],
                "correctAnswer": "Soy de España, pero ahora estoy en México.",
                "explanation": "Soy de España (происхождение), pero ahora estoy en México (местоположение)."
            },
            {
                "id": "ex-1-04",
                "type": "transformation",
                "question": "Поставьте глагол ser в форму 1-го лица мн. числа: «Yo soy» → «Nosotros ____»",
                "prompt": "ser (nosotros) → ____",
                "correctAnswer": "somos",
                "acceptableAnswers": ["somos", "Somos"],
                "explanation": "nosotros somos."
            },
            {
                "id": "ex-1-05",
                "type": "input",
                "question": "Напишите форму глагола estar для «tú» (с тильдой):",
                "correctAnswer": "estás",
                "acceptableAnswers": ["estás", "estas", "Estás"],
                "explanation": "tú estás."
            },
            {
                "id": "ex-1-06",
                "type": "gap",
                "question": "Mis hermanos ____ (являются) profesores de historia.",
                "correctAnswer": "son",
                "acceptableAnswers": ["son", "Son"],
                "explanation": "Профессия во мн. числе: «son profesores»."
            },
            {
                "id": "ex-1-07",
                "type": "choice",
                "question": "Какая фраза выражает вопрос о самочувствии?",
                "options": ["¿Cómo estás?", "¿Cómo eres?", "¿De dónde eres?", "¿Qué eres?"],
                "correctAnswer": "¿Cómo estás?",
                "explanation": "«¿Cómo estás?» — Как дела? / Как самочувствие?"
            },
            {
                "id": "ex-1-08",
                "type": "input",
                "question": "Напишите форму глагола ser для местоимения «él»:",
                "correctAnswer": "es",
                "acceptableAnswers": ["es", "Es"],
                "explanation": "él es."
            },
            {
                "id": "ex-1-09",
                "type": "transformation",
                "question": "Замените «tú eres» на аргентинскую форму voseo:",
                "prompt": "tú eres → vos ____",
                "correctAnswer": "sos",
                "acceptableAnswers": ["sos", "Sos"],
                "explanation": "vos sos (в Аргентине и Уругвае)."
            },
            {
                "id": "ex-1-10",
                "type": "tiles",
                "question": "Соберите предложение: «Мой друг сегодня очень счастлив.»",
                "tiles": ["Mi", "amigo", "está", "muy", "feliz", "hoy."],
                "correctAnswer": "Mi amigo está muy feliz hoy.",
                "explanation": "Mi amigo está muy feliz hoy."
            },
            {
                "id": "ex-1-11",
                "type": "gap",
                "question": "La puerta de la casa ____ (находится в состоянии) cerrada.",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "Состояние предмета: «está cerrada»."
            },
            {
                "id": "ex-1-12",
                "type": "choice",
                "question": "Какой глагол используется для указания времени («Son las tres»)?",
                "options": ["SER", "ESTAR", "TENER", "HACER"],
                "correctAnswer": "SER",
                "explanation": "Время всегда выражается глаголом ser: «Son las tres»."
            },
            {
                "id": "ex-1-13",
                "type": "input",
                "question": "Напишите форму глагола estar для «ellos»:",
                "correctAnswer": "están",
                "acceptableAnswers": ["están", "estan", "Están"],
                "explanation": "ellos están."
            },
            {
                "id": "ex-1-14",
                "type": "transformation",
                "question": "Поставьте глагол estar во множественное число: «Estoy cansado» → «Nosotros ____ cansados»",
                "prompt": "estoy → ____",
                "correctAnswer": "estamos",
                "acceptableAnswers": ["estamos", "Estamos"],
                "explanation": "nosotros estamos."
            },
            {
                "id": "ex-1-15",
                "type": "tiles",
                "question": "Соберите предложение: «Сейчас ровно четыре часа дня.»",
                "tiles": ["Son", "las", "cuatro", "en", "punto."],
                "correctAnswer": "Son las cuatro en punto.",
                "explanation": "Son las cuatro en punto."
            },
            {
                "id": "ex-1-16",
                "type": "gap",
                "question": "Nosotros ____ (находимся) en la biblioteca de la universidad.",
                "correctAnswer": "estamos",
                "acceptableAnswers": ["estamos", "Estamos"],
                "explanation": "Местоположение: «estamos en la biblioteca»."
            },
            {
                "id": "ex-1-17",
                "type": "choice",
                "question": "Какое предложение выражает постоянную черту характера человека?",
                "options": ["Carlos es muy inteligente.", "Carlos está muy inteligente.", "Carlos tiene inteligente.", "Carlos hace inteligente."],
                "correctAnswer": "Carlos es muy inteligente.",
                "explanation": "Качество интеллекта — постоянная черта личности (ser)."
            },
            {
                "id": "ex-1-18",
                "type": "input",
                "question": "Напишите форму глагола ser для местоимения «yo»:",
                "correctAnswer": "soy",
                "acceptableAnswers": ["soy", "Soy"],
                "explanation": "yo soy."
            },
            {
                "id": "ex-1-19",
                "type": "gap",
                "question": "Hoy el clima ____ (находится в состоянии) muy frío.",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "Состояние погоды сегодня: «está muy frío»."
            },
            {
                "id": "ex-1-20",
                "type": "tiles",
                "question": "Соберите вопрос: «Откуда ты родом?»",
                "tiles": ["¿De", "dónde", "eres", "tú?"],
                "correctAnswer": "¿De dónde eres tú?",
                "explanation": "¿De dónde eres tú?"
            },
            {
                "id": "ex-1-21",
                "type": "choice",
                "question": "Что означает фраза «El café está frío»?",
                "options": ["Кофе остыл (состояние)", "Кофе всегда холодный по своей сути", "Кофе невкусный", "Кофе нет"],
                "correctAnswer": "Кофе остыл (состояние)",
                "explanation": "Estar выражает текущее температурное состояние."
            },
            {
                "id": "ex-1-22",
                "type": "transformation",
                "question": "Преобразуйте в вежливую форму (usted): «Tú estás en Madrid» → «Usted ____ en Madrid»",
                "prompt": "estás → ____",
                "correctAnswer": "está",
                "acceptableAnswers": ["está", "esta", "Está"],
                "explanation": "usted está."
            },
            {
                "id": "ex-1-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет приветствие, число и разницу ser/estar?",
                "options": [
                    "¡Buenos días! Soy Carlos, tengo veinte años y estoy en Madrid.",
                    "¡Buenos días! Estoy Carlos, soy veinte años y soy en Madrid.",
                    "¡Buenas noches! Soy Carlos, estoy veinte años y tengo en Madrid.",
                    "De nada, Carlos es veinte años."
                ],
                "correctAnswer": "¡Buenos días! Soy Carlos, tengo veinte años y estoy в Madrid.",
                "explanation": "Soy (имя) + tengo (возраст) + estoy en (местоположение)."
            },
            {
                "id": "ex-1-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Они студенты, и сейчас они в классе»:",
                "correctAnswer": "Ellos son estudiantes y ahora están en la clase",
                "acceptableAnswers": [
                    "Ellos son estudiantes y ahora están en la clase",
                    "Ellos son estudiantes y ahora estan en la clase",
                    "Son estudiantes y ahora están en clase",
                    "Ellos son estudiantes y están en la clase"
                ],
                "explanation": "Ellos son estudiantes (ser) y ahora están en la clase (estar)."
            }
        ],
        "miniScenario": {
            "title": "Звонок другу из путешествия",
            "setting": "Звонок по видеосвязи из Барселоны.",
            "situation": "Вы приехали в Барселону и звоните другу, чтобы рассказать, как вы себя чувствуете и где остановились.",
            "dialog": [
                {"speaker": "Amigo", "text": "¡Hola Alex! ¿Cómo estás? ¿Dónde estás ahora?"},
                {"speaker": "Tú", "text": "¡Hola! Estoy muy bien y feliz. Ahora estoy en el hotel en Barcelona."},
                {"speaker": "Amigo", "text": "¿Y cómo es el hotel?"},
                {"speaker": "Tú", "text": "El hotel es muy moderno y la habitación es grande."}
            ],
            "task": "Ответьте другу о своем самочувствии и местоположении.",
            "prompt": "Как сказать: «Я очень хорошо себя чувствую и сейчас я в Барселоне»?",
            "options": [
                "Estoy muy bien y ahora estoy en Barcelona.",
                "Soy muy bien y ahora soy en Barcelona.",
                "Tengo muy bien y hay en Barcelona.",
                "Hago muy bien y estoy de Barcelona."
            ],
            "correctIndex": 0,
            "explanation": "Самочувствие (estoy bien) и местонахождение (estoy en Barcelona) выражаются глаголом estar."
        },
        "shortText": {
            "title": "El día de Mateo en Buenos Aires",
            "text": "Mateo es un estudiante de arquitectura. Él es de Córdoba, pero ahora está en Buenos Aires para hacer un curso. La ciudad es enorme y muy activa. Hoy Mateo está un poco cansado porque camina mucho por las calles históricas. Sin embargo, está muy contento con sus nuevos compañeros de clase, que son muy simpáticos.",
            "questions": [
                {
                    "question": "¿De dónde es Mateo?",
                    "options": ["De Buenos Aires", "De Córdoba", "De Madrid", "De Roma"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Él es de Córdoba...» (происхождение с ser)."
                },
                {
                    "question": "¿Por qué se usa «está» para Buenos Aires?",
                    "options": ["Porque es su profesión", "Porque es su ubicación actual temporal", "Porque es su nacionalidad", "Es un error del texto"],
                    "correctIndex": 1,
                    "explanation": "В тексте «ahora está en Buenos Aires» указывает на текущее местонахождение."
                },
                {
                    "question": "¿Cómo son los compañeros de clase de Mateo?",
                    "options": ["Son antipáticos", "Son muy simpáticos", "Están enfermos", "Son médicos"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «sus nuevos compañeros de clase, que son muy simpáticos»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Самопрезентация с контрастом SER и ESTAR",
            "prompt": "Напишите короткий рассказ о себе (4-5 предложений):\n1. Кто вы, ваша профессия/статус и происхождение (SER: soy..., soy de...).\n2. Какой вы по характеру (SER: soy alegre/tranquilo...).\n3. Где вы находитесь прямо сейчас (ESTAR: estoy en...).\n4. Как вы себя чувствуете сегодня (ESTAR: estoy contento/cansado...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Различение SER и ESTAR", "points": 40, "description": "Безошибочное употребление SER для сути/происхождения и ESTAR для места/состояния."},
                    {"name": "Формы спряжения глаголов", "points": 25, "description": "Правильные формы 1-го лица soy, estoy."},
                    {"name": "Согласование прилагательных", "points": 20, "description": "Прилагательные согласованы по роду (cansado/a, contento/a)."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Связность текста и грамотность."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 13: Basic adjective agreement (gender/number)
    # ----------------------------------------------------
    13: {
        "id": 13,
        "topicName": "Basic adjective agreement (gender/number)",
        "russianTitle": "Согласование прилагательных по роду и числу",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u03-identity",
        "icon": "🧩",
        "summary": "В испанском языке прилагательные всегда согласуются с существительными, которые они описывают, в роде (мужской/женский) и числе (единственное/множественное). Как правило, прилагательные ставятся ПОСЛЕ существительного.",
        "mnemonicRule": "Существительное — командир, прилагательное — солдат. Если командир женского рода во мн. числе (las casas), то и солдат меняется (blancas).",
        "goalsRu": [
            "Согласовывать прилагательные на -o/-a по 4 формам (alto/alta/altos/altas)",
            "Понимать поведение неизменяемых по роду прилагательных на -e и согласный (inteligente/inteligentes, fácil/fáciles)",
            "Знать особенности национальностей на согласный (español → española, inglés → inglesa)",
            "Правильно ставить прилагательные после существительного в нейтральном описании"
        ],
        "sections": [
            {
                "title": "1. Четыре формы прилагательных на -o",
                "content": "Прилагательные, оканчивающиеся на -o в мужском роде, имеют 4 формы:",
                "tables": [
                    {
                        "headers": ["Форма", "Окончание", "Пример", "Русский перевод"],
                        "rows": [
                            ["Мужской род ед. ч.", "-o", "un chico alto", "высокий парень"],
                            ["Женский род ед. ч.", "-a", "una chica alta", "высокая девушка"],
                            ["Мужской род мн. ч.", "-os", "unos chicos altos", "высокие парни"],
                            ["Женский род мн. ч.", "-as", "unas chicas altas", "высокие девушки"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Прилагательные на -e и согласный",
                "content": "Прилагательные на -e (inteligente, grande, amable) и согласный (fácil, difícil, joven, azul) не меняются по родам, а меняются только по числам:",
                "tables": [
                    {
                        "headers": ["Тип окончания", "Единственное число (муж./жен.)", "Множественное число (муж./жен.)", "Примеры"],
                        "rows": [
                            ["На -e", "inteligente", "inteligentes (+s)", "el alumno inteligente / la alumna inteligente"],
                            ["На согласный", "fácil", "fáciles (+es)", "un examen fácil / una tarea fácil → exámenes fáciles"],
                            ["Национальности на согласный", "español (м) / española (ж)", "españoles (м) / españolas (ж)", "un vino español / una comida española"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "El edificio es muy alto y moderno.", "ru": "Здание очень высокое и современное."},
            {"es": "La casa es pequeña pero cómoda.", "ru": "Дом маленький, но уютный."},
            {"es": "Los estudiantes son muy inteligentes y trabajadores.", "ru": "Студенты очень умные и трудолюбивые."},
            {"es": "Las chicas son simpáticas y divertidas.", "ru": "Девушки приятные и весёлые."},
            {"es": "Es una lección fácil y rápida.", "ru": "Это лёгкий и быстрый урок."},
            {"es": "Los exámenes finales son difíciles.", "ru": "Выпускные экзамены трудные."},
            {"es": "Compro una manzana roja y dulce.", "ru": "Я покупаю красное и сладкое яблоко."},
            {"es": "Mis amigos son españoles y amables.", "ru": "Мои друзья — испанцы и очень любезны."},
            {"es": "La comida italiana es deliciosa.", "ru": "Итальянская еда восхитительна."},
            {"es": "Tenemos unas habitaciones grandes y luminosas.", "ru": "У нас большие и светлые комнаты."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Una chica simpático» без смены окончания",
                "correction": "Una chica simpática",
                "explanation": "Прилагательные на -o обязательно меняют окончание на -a с существительными женского рода."
            },
            {
                "mistake": "«Un chico inteligento» или «una chica inteligenta»",
                "correction": "un chico inteligente / una chica inteligente",
                "explanation": "Прилагательные на -e НЕ имеют формы на -o/-a и одинаковы для обоих родов."
            },
            {
                "mistake": "«Una mujer español» без окончания женского рода",
                "correction": "una mujer española",
                "explanation": "Прилагательные национальности на согласный в женском роде получают -a: español → española, alemán → alemana."
            }
        ],
        "trapAlert": "Прилагательные на -E (inteligente, grande, verde) НЕ меняются по роду: un libro verde / una mesa verde!",
        "dialectNote": "Слово «grande» перед существительным мужского и женского рода в единственном числе усекается до «gran» («un gran hombre» — великий человек, «una gran ciudad» — великий город).",
        "quiz": [
            {
                "question": "Какая форма прилагательного «alto» нужна для фразы «las casas ____»?",
                "type": "recognition",
                "options": ["alto", "alta", "altos", "altas"],
                "correctIndex": 3,
                "explanations": [
                    "Alto — мужской род ед. число.",
                    "Alta — женский род ед. число.",
                    "Altos — мужской род мн. число.",
                    "Правильно: «las casas altas» (женский род мн. число)."
                ]
            },
            {
                "question": "Какое прилагательное НЕ меняет окончание в женском роде?",
                "type": "recognition",
                "options": ["simpático", "inteligente", "bonito", "rojo"],
                "correctIndex": 1,
                "explanations": [
                    "Simpático → simpática.",
                    "Правильно: «inteligente» оканчивается на -e и одинаково для обоих родов (un chico inteligente / una chica inteligente).",
                    "Bonito → bonita.",
                    "Rojo → roja."
                ]
            },
            {
                "question": "Какая форма женского рода у национальности «español»?",
                "type": "recognition",
                "options": ["español", "española", "españole", "españoli"],
                "correctIndex": 1,
                "explanations": [
                    "Español — форма мужского рода.",
                    "Правильно: национальности на согласный получают -a в женском роде: «española».",
                    "Такой формы не существует.",
                    "Неверно."
                ]
            },
            {
                "question": "Какая форма множественного числа у прилагательного «fácil»?",
                "type": "recognition",
                "options": ["fácils", "fáciles", "fácilos", "fácilas"],
                "correctIndex": 1,
                "explanations": [
                    "После согласного нельзя добавлять просто -s.",
                    "Правильно: fácil + es = «fáciles».",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Согласуйте прилагательное: «María es una estudiante muy ____ (трудолюбивый)»:",
                "type": "application",
                "options": ["trabajador", "trabajadora", "trabajadores", "trabajadoras"],
                "correctIndex": 1,
                "explanations": [
                    "Trabajador — мужской род.",
                    "Правильно: «trabajadora» (женский род ед. число).",
                    "Множественное число мужского рода.",
                    "Множественное число женского рода."
                ]
            },
            {
                "question": "Согласуйте во множественном числе: «Los problemas son ____ (трудный)»:",
                "type": "application",
                "options": ["difícil", "difíciles", "difícilos", "difícilas"],
                "correctIndex": 1,
                "explanations": [
                    "Difícil — единственное число.",
                    "Правильно: «difíciles» (множественное число).",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте форму прилагательного: «Compro una falda ____ (красивый)»:",
                "type": "application",
                "options": ["bonito", "bonita", "bonitos", "bonitas"],
                "correctIndex": 1,
                "explanations": [
                    "Bonito — мужской род.",
                    "Правильно: «una falda bonita» (женский род).",
                    "Множественное число мужского рода.",
                    "Множественное число женского рода."
                ]
            },
            {
                "question": "Выберите грамматически верное предложение:",
                "type": "application",
                "options": [
                    "Las habitaciones son grandes y luminosas.",
                    "Las habitaciones son grande y luminosos.",
                    "Las habitaciones son grandes y luminoso.",
                    "Las habitaciones son grandes y luminosa."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: оба прилагательных согласованы с «las habitaciones» (grandes y luminosas).",
                    "Grande не во мн. числе, luminosos мужского рода.",
                    "Luminoso мужского рода ед. числа.",
                    "Luminosa в ед. числе."
                ]
            },
            {
                "question": "Вам нужно описать новую машину подруги: «Это быстрая и современная машина». Выберите верный вариант:",
                "type": "transfer",
                "options": [
                    "Es un coche rápido y moderno.",
                    "Es una coche rápida y moderna.",
                    "Es un coche rápida y moderno.",
                    "Es un coche rápido y moderna."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el coche» мужского рода → «un coche rápido y moderno».",
                    "Coche мужского рода, а не женского.",
                    "Несогласованность: rápida в женском роде.",
                    "Несогласованность: moderna в женском роде."
                ]
            },
            {
                "question": "Как описать двух сестер-итальянок: «Они симпатичные итальянки»?",
                "type": "transfer",
                "options": [
                    "Ellas son italianas y simpáticas.",
                    "Ellas son italianos y simpáticos.",
                    "Ellas son italiana y simpática.",
                    "Ellas son italianas y simpáticos."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Ellas son italianas y simpáticas» (женский род во множественном числе).",
                    "Мужской род ошибочен для сестер.",
                    "Единственное число не подходит для двух сестер.",
                    "Несогласованность в последнем слове."
                ]
            },
            {
                "question": "Вы хотите сказать: «Уроки испанского очень интересные». Как написать?",
                "type": "transfer",
                "options": [
                    "Las clases de español son muy interesantes.",
                    "Las clases de español son muy interesante.",
                    "Los clases de español son muy interesantes.",
                    "Las clases de español son muy interesantas."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Las clases de español son muy interesantes» (clases — жен. род мн. число, interesante + s).",
                    "Пропущено окончание множественного числа -s.",
                    "Clase женского рода (las clases).",
                    "Формы «interesanta» не существует."
                ]
            },
            {
                "question": "Как перевести «Мы живем в красивом старинном городе»?",
                "type": "transfer",
                "options": [
                    "Vivimos en una ciudad bonita y antigua.",
                    "Vivimos en un ciudad bonito y antiguo.",
                    "Vivimos en una ciudad bonito y antigua.",
                    "Vivimos en una ciudad bonitas y antiguas."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «una ciudad bonita y antigua» (ciudad женского рода ед. числа).",
                    "Ciudad женского рода.",
                    "Bonito в мужском роде.",
                    "Город один, множественное число не нужно."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-13-01",
                "type": "choice",
                "question": "Какая форма прилагательного «nuevo» согласуется со словом «casa»?",
                "options": ["nueva", "nuevo", "nuevas", "nuevos"],
                "correctAnswer": "nueva",
                "explanation": "Casa — женский род: «una casa nueva»."
            },
            {
                "id": "ex-13-02",
                "type": "gap",
                "question": "Los estudiantes son muy ____ (умный, мн. ч.).",
                "correctAnswer": "inteligentes",
                "acceptableAnswers": ["inteligentes", "Inteligentes"],
                "explanation": "inteligente + s = inteligentes."
            },
            {
                "id": "ex-13-03",
                "type": "tiles",
                "question": "Соберите предложение: «Моя сестра очень высокая и красивая.»",
                "tiles": ["Mi", "hermana", "es", "muy", "alta", "y", "bonita."],
                "correctAnswer": "Mi hermana es muy alta y bonita.",
                "explanation": "Mi hermana es muy alta y bonita."
            },
            {
                "id": "ex-13-04",
                "type": "transformation",
                "question": "Поставьте прилагательное в женский род: «un chico trabajador» → «una chica ____»",
                "prompt": "trabajador → ____",
                "correctAnswer": "trabajadora",
                "acceptableAnswers": ["trabajadora", "Trabajadora"],
                "explanation": "trabajador → trabajadora."
            },
            {
                "id": "ex-13-05",
                "type": "input",
                "question": "Напишите форму множественного числа прилагательного «fácil»:",
                "correctAnswer": "fáciles",
                "acceptableAnswers": ["fáciles", "faciles", "Fáciles"],
                "explanation": "fácil → fáciles."
            },
            {
                "id": "ex-13-06",
                "type": "gap",
                "question": "Las lecciones de español son ____ (легкий, мн. число).",
                "correctAnswer": "fáciles",
                "acceptableAnswers": ["fáciles", "faciles"],
                "explanation": "fáciles."
            },
            {
                "id": "ex-13-07",
                "type": "choice",
                "question": "Как сказать «испанская гитара»?",
                "options": ["guitarra española", "guitarra español", "guitarra españolo", "española guitarra"],
                "correctAnswer": "guitarra española",
                "explanation": "Guitarra (жен. род) → española."
            },
            {
                "id": "ex-13-08",
                "type": "input",
                "question": "Напишите форму женского рода для «alemán» (немецкий):",
                "correctAnswer": "alemana",
                "acceptableAnswers": ["alemana", "Alemana"],
                "explanation": "alemán → alemana."
            },
            {
                "id": "ex-13-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la ciudad pequeña» → «las ciudades ____»",
                "prompt": "pequeña → ____",
                "correctAnswer": "pequeñas",
                "acceptableAnswers": ["pequeñas", "pequenas", "Pequeñas"],
                "explanation": "pequeña → pequeñas."
            },
            {
                "id": "ex-13-10",
                "type": "tiles",
                "question": "Соберите фразу: «У нас современные и комфортные комнаты.»",
                "tiles": ["Tenemos", "habitaciones", "modernas", "y", "cómodas."],
                "correctAnswer": "Tenemos habitaciones modernas y cómodas.",
                "explanation": "Tenemos habitaciones modernas y cómodas."
            },
            {
                "id": "ex-13-11",
                "type": "gap",
                "question": "El café está muy ____ (горячий, муж. род).",
                "correctAnswer": "caliente",
                "acceptableAnswers": ["caliente", "Caliente"],
                "explanation": "caliente."
            },
            {
                "id": "ex-13-12",
                "type": "choice",
                "question": "Какое словосочетание грамматически корректно?",
                "options": ["una persona amable", "una persona amabla", "un persona amable", "una persona amablo"],
                "correctAnswer": "una persona amable",
                "explanation": "Amable не меняется по родам: una persona amable."
            },
            {
                "id": "ex-13-13",
                "type": "input",
                "question": "Напишите форму женского рода во множественном числе для «rojo»:",
                "correctAnswer": "rojas",
                "acceptableAnswers": ["rojas", "Rojas"],
                "explanation": "rojo → rojas."
            },
            {
                "id": "ex-13-14",
                "type": "transformation",
                "question": "Поставьте в мужской род: «una mujer francesa» → «un hombre ____»",
                "prompt": "francesa → ____",
                "correctAnswer": "francés",
                "acceptableAnswers": ["francés", "frances", "Francés"],
                "explanation": "francesa → francés."
            },
            {
                "id": "ex-13-15",
                "type": "tiles",
                "question": "Соберите предложение: «Эти упражнения очень трудные.»",
                "tiles": ["Estos", "ejercicios", "son", "muy", "difíciles."],
                "correctAnswer": "Estos ejercicios son muy difíciles.",
                "explanation": "Estos ejercicios son muy difíciles."
            },
            {
                "id": "ex-13-16",
                "type": "gap",
                "question": "Ella lleva una falda ____ (длинный, жен. род).",
                "correctAnswer": "larga",
                "acceptableAnswers": ["larga", "Larga"],
                "explanation": "largo → larga."
            },
            {
                "id": "ex-13-17",
                "type": "choice",
                "question": "Какая форма прилагательного нужна для «los hombres»?",
                "options": ["fuertes", "fuerte", "fuertos", "fuertas"],
                "correctAnswer": "fuertes",
                "explanation": "fuerte + s = fuertes."
            },
            {
                "id": "ex-13-18",
                "type": "input",
                "question": "Напишите форму женского рода для «bueno»:",
                "correctAnswer": "buena",
                "acceptableAnswers": ["buena", "Buena"],
                "explanation": "bueno → buena."
            },
            {
                "id": "ex-13-19",
                "type": "gap",
                "question": "Madrid y Barcelona son ciudades ____ (большой, мн. число).",
                "correctAnswer": "grandes",
                "acceptableAnswers": ["grandes", "Grandes"],
                "explanation": "grande + s = grandes."
            },
            {
                "id": "ex-13-20",
                "type": "tiles",
                "question": "Соберите фразу: «Моя мама — очень добрая женщина.»",
                "tiles": ["Mi", "madre", "es", "una", "mujer", "muy", "buena."],
                "correctAnswer": "Mi madre es una mujer muy buena.",
                "explanation": "Mi madre es una mujer muy buena."
            },
            {
                "id": "ex-13-21",
                "type": "choice",
                "question": "Какое предложение верно согласовано?",
                "options": ["Las manzanas son dulces y rojas.", "Las manzanas son dulce y rojos.", "Las manzanas son dulces y rojo.", "Los manzanas son dulces y rojas."],
                "correctAnswer": "Las manzanas son dulces y rojas.",
                "explanation": "Manzanas (жен. род мн. число) → dulces y rojas."
            },
            {
                "id": "ex-13-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el examen difícil» → «los exámenes ____»",
                "prompt": "difícil → ____",
                "correctAnswer": "difíciles",
                "acceptableAnswers": ["difíciles", "dificiles", "Difíciles"],
                "explanation": "difícil → difíciles."
            },
            {
                "id": "ex-13-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Выберите предложение, где правильно согласованы артикль, существительное и прилагательное:",
                "options": [
                    "El mapa del metro es muy claro y útil.",
                    "La mapa del metro es muy clara y útil.",
                    "El mapa de la metro es muy claro y útiles.",
                    "Los mapa del metro son muy claro."
                ],
                "correctAnswer": "El mapa del metro es muy claro y útil.",
                "explanation": "El mapa (муж. род) + del metro + claro y útil."
            },
            {
                "id": "ex-13-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня есть 2 новые белые рубашки»:",
                "correctAnswer": "Tengo dos camisas blancas nuevas",
                "acceptableAnswers": [
                    "Tengo dos camisas blancas nuevas",
                    "Tengo dos camisas nuevas blancas",
                    "tengo dos camisas blancas nuevas",
                    "Tengo dos camisas nuevas y blancas"
                ],
                "explanation": "Tengo dos camisas blancas nuevas."
            }
        ],
        "miniScenario": {
            "title": "Выбор подарка в магазине сувениров",
            "setting": "Сувенирная лавка в Гранаде.",
            "situation": "Вы выбираете подарок для мамы и сестры. Продавец показывает разные варианты керамики и шелка.",
            "dialog": [
                {"speaker": "Dependiente", "text": "Tenemos estas tazas tradicionales y unas bufandas de seda muy bonitas."},
                {"speaker": "Tú", "text": "Las tazas son preciosas, pero prefiero una bufanda roja y elegante."},
                {"speaker": "Dependiente", "text": "Excelente elección. Es de seda pura y muy suave."},
                {"speaker": "Tú", "text": "Perfecto, me la llevo. Muchas gracias."}
            ],
            "task": "Опишите желаемый шарф продавцу (красный и элегантный).",
            "prompt": "Как сказать продавцу: «Я хочу элегантный красный шарф»?",
            "options": [
                "Quiero una bufanda roja y elegante, por favor.",
                "Quiero un bufanda rojo y elegante, por favor.",
                "Quiero una bufanda rojo y eleganta, por favor.",
                "Quiero unas bufandas roja y elegantes, por favor."
            ],
            "correctIndex": 0,
            "explanation": "«Una bufanda roja y elegante» — идеальное согласование женского рода."
        },
        "shortText": {
            "title": "Los dos hermanos: Carlos y Lucía",
            "text": "Carlos y Lucía son dos hermanos muy diferentes pero muy unidos. Carlos es alto, moreno y bastante tímido; le gustan los libros difíciles de filosofía. Lucía es baja, rubia y extremadamente simpática y habladora. Ella tiene muchos amigos en la universidad. Ambos son estudiantes excelentes y personas muy amables con todos sus vecinos.",
            "questions": [
                {
                    "question": "¿Cómo es físicamente Carlos?",
                    "options": ["Bajo y rubio", "Alto y moreno", "Gordo y bajo", "Poco simpático"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Carlos es alto, moreno y bastante tímido...»."
                },
                {
                    "question": "¿Qué adjetivos describen el carácter de Lucía?",
                    "options": ["Tímida y aburrida", "Simpática y habladora", "Enferma y triste", "Seria y antipática"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Lucía es... extremadamente simpática y habladora»."
                },
                {
                    "question": "¿Qué forma plural tiene el adjetivo «amable» al final del texto?",
                    "options": ["Amablos", "Amablas", "Amables", "Amable"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «personas muy amables» (amable + s)."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание двух друзей с контрастными прилагательными",
            "prompt": "Напишите короткий текст (4-5 предложений), сравнивая двух людей (друзей или членов семьи):\n1. Опишите внешность первого человека через прилагательные (alto/bajo, rubio/moreno...).\n2. Опишите характер второго человека (simpático/a, tímido/a, trabajador/a...).\n3. Опишите их вместе во множественном числе (ambos son inteligentes/amables...).\n4. Следите за согласованием рода (-o/-a) и числа (-s/-es).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Согласование прилагательных", "points": 35, "description": "Точное соблюдение рода и числа во всех прилагательных текста."},
                    {"name": "Разнообразие типов прилагательных", "points": 25, "description": "Использование прилагательных на -o/-a, на -e и на согласный."},
                    {"name": "Выполнение коммуникативной задачи", "points": 25, "description": "Описаны оба человека и даны их сравнительные характеристики."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотность, акценты, связность."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 30: Describing people (describir personas)
    # ----------------------------------------------------
    30: {
        "id": 30,
        "topicName": "Describing people (describir personas)",
        "russianTitle": "Описание внешности и характера людей (ser vs tener vs llevar)",
        "level": "A1",
        "category": "Speaking",
        "unitId": "a1-u03-identity",
        "icon": "🧑‍🤝‍🧑",
        "summary": "Как полноценно описать человека на испанском языке: внешность, телосложение, цвет волос и глаз, одежду и черты характера с помощью трех базовых глаголов: SER (какой?), TENER (что имеет?) и LLEVAR (что носит?).",
        "mnemonicRule": "SER для роста и характера (Soy alto, soy simpático), TENER для волос и глаз (Tengo el pelo negro, tengo ojos verdes), LLEVAR для одежды и очков (Llevo gafas, llevo barba).",
        "goalsRu": [
            "Описывать внешность и телосложение человека с помощью глагола SER (alto, bajo, delgado, joven...)",
            "Описывать волосы и глаза с помощью конструкции TENER (tiene el pelo rubio / ojos marrones)",
            "Описывать отличительные черты и одежду с помощью LLEVAR (lleva gafas, lleva barba, lleva camisa)",
            "Описывать черты характера (simpático, inteligente, tímido, divertido, amable)"
        ],
        "sections": [
            {
                "title": "1. Три кита описания человека: SER, TENER и LLEVAR",
                "content": "В испанском языке описание человека четко делится между тремя глаголами:",
                "tables": [
                    {
                        "headers": ["Глагол", "Для чего используется", "Пример", "Перевод"],
                        "rows": [
                            ["SER", "Рост, фигура, возраст, характер", "Es alto, delgado y muy simpático.", "Он высокий, стройный и очень приятный."],
                            ["TENER", "Волосы (pelo), глаза (ojos), возраст", "Tiene el pelo largo y los ojos azules.", "У неё длинные волосы и синие глаза."],
                            ["LLEVAR", "Одежда, аксессуары, борода, усы, очки", "Lleva gafas, barba y una chaqueta negra.", "Он носит очки, бороду и черную куртку."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Словарь для описания волос и глаз",
                "content": "Обратите внимание на устойчивые сочетания с глаголом TENER:",
                "tables": [
                    {
                        "headers": ["Категория", "Испанские варианты", "Русский перевод"],
                        "rows": [
                            ["Длина волос", "el pelo corto / largo / media melena", "короткие / длинные / до плеч"],
                            ["Тип волос", "el pelo liso / rizado / ondulado", "прямые / кудрявые / волнистые"],
                            ["Цвет волос", "el pelo rubio / moreno / castaño / pelirrojo / canoso", "светлые / темные / каштановые / рыжие / седые"],
                            ["Глаза", "los ojos marrones / azules / verdes / negros", "карие / синие / зеленые / черные"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Mi hermano es alto, delgado y tiene el pelo corto.", "ru": "Мой брат высокий, стройный, и у него короткие волосы."},
            {"es": "Elena tiene los ojos verdes y el pelo rizado.", "ru": "У Елены зеленые глаза и кудрявые волосы."},
            {"es": "El profesor lleva gafas y tiene barba.", "ru": "Преподаватель носит очки, и у него борода."},
            {"es": "Mi madre es muy trabajadora y paciente.", "ru": "Моя мама очень трудолюбивая и терпеливая."},
            {"es": "¿Cómo es físicamente tu mejor amigo?", "ru": "Какой твой лучший друг внешне?"},
            {"es": "Lleva una camisa blanca y pantalones vaqueros.", "ru": "На нём белая рубашка и джинсы."},
            {"es": "Es una chica joven, alegre y muy divertida.", "ru": "Это молодая, жизнерадостная и очень веселая девушка."},
            {"es": "El abuelo es calvo y lleva bigote.", "ru": "Дедушка лысый и носит усы."},
            {"es": "Tengo el pelo castaño y los ojos marrones.", "ru": "У меня каштановые волосы и карие глаза."},
            {"es": "Somos personas tranquilas y optimistas.", "ru": "Мы — спокойные и оптимистичные люди."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Yo soy ojos azules» или «Soy pelo rubio»",
                "correction": "Tengo los ojos azules / Tengo el pelo rubio",
                "explanation": "Глаза и волосы описываются глаголом TENER (иметь), а не SER."
            },
            {
                "mistake": "«Llevar los ojos» вместо «Tener los ojos»",
                "correction": "Tengo ojos verdes / Llevo gafas",
                "explanation": "Глагол LLEVAR используется только для съемных элементов (одежда, очки, борода, прическа), а части тела — с TENER."
            },
            {
                "mistake": "«Tengo rubio» без слова pelo",
                "correction": "Soy rubio / Tengo el pelo rubio",
                "explanation": "Можно сказать «Soy rubio» (Я блондин через SER) или «Tengo el pelo rubio» (через TENER)."
            }
        ],
        "trapAlert": "Запомните формулу: SER + прилагательное (Soy alto), TENER + часть тела (Tengo ojos verdes), LLEVAR + аксессуар/одежда (Llevo gafas)!",
        "dialectNote": "В Латинской Америке каштановые волосы и карие глаза часто называют словом «café» («ojos color café»), а светлые волосы в Мексике называют «güero», в Колумбии — «mono», в Аргентине — «rubio».",
        "quiz": [
            {
                "question": "Какой глагол используется для описания цвета глаз?",
                "type": "recognition",
                "options": ["SER", "TENER", "ESTAR", "HACER"],
                "correctIndex": 1,
                "explanations": [
                    "SER не употребляется со словами «ojos / pelo».",
                    "Правильно: «TENER los ojos verdes/azules...».",
                    "ESTAR выражает место или состояние.",
                    "HACER означает «делать»."
                ]
            },
            {
                "question": "Какой глагол используется со словом «gafas» (очки)?",
                "type": "recognition",
                "options": ["SER", "LLEVAR", "ESTAR", "VIVIR"],
                "correctIndex": 1,
                "explanations": [
                    "SER gafas — бессмысленно.",
                    "Правильно: «LLEVAR gafas» (носить очки).",
                    "ESTAR — находиться.",
                    "VIVIR — жить."
                ]
            },
            {
                "question": "Как сказать «У него кудрявые волосы»?",
                "type": "recognition",
                "options": ["Es el pelo rizado.", "Tiene el pelo rizado.", "Está el pelo rizado.", "Lleva los pelos rizado."],
                "correctIndex": 1,
                "explanations": [
                    "С «pelo» используется глагол tener, а не ser.",
                    "Правильно: «Tiene el pelo rizado».",
                    "Estar не используется для описания внешности.",
                    "Неверное согласование."
                ]
            },
            {
                "question": "Как правильно сказать «Я блондинка»?",
                "type": "recognition",
                "options": ["Soy rubia.", "Estoy rubia.", "Tengo rubia.", "Llevo rubia."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Soy rubia» (глагол ser + прил. в женском роде).",
                    "Estar не определяет постоянный тип внешности.",
                    "Tengo требует существительного (Tengo el pelo rubio).",
                    "Llevo не используется в этой конструкции."
                ]
            },
            {
                "question": "Дополните описание: «Carlos es alto y ____ (носит) barba.»",
                "type": "application",
                "options": ["es", "tiene", "lleva", "está"],
                "correctIndex": 2,
                "explanations": [
                    "«Es barba» грамматически неверно.",
                    "«Tiene barba» допустимо в разговорной речи, но «lleva barba» — наиболее идиоматичный вариант для бороды и стиля.",
                    "Правильно: «lleva barba» (носит бороду).",
                    "Estar не подходит."
                ]
            },
            {
                "question": "Вставьте форму: «Mi abuela tiene los ojos ____ (карие)»:",
                "type": "application",
                "options": ["marrón", "marrones", "marronas", "marronos"],
                "correctIndex": 1,
                "explanations": [
                    "Marrón — единственное число.",
                    "Правильно: «los ojos marrones» (мн. число).",
                    "Такой формы не существует.",
                    "Такой формы не существует."
                ]
            },
            {
                "question": "Выберите грамматически безупречное описание внешности мужчины:",
                "type": "application",
                "options": [
                    "Es bajo, tiene el pelo corto y lleva gafas.",
                    "Está bajo, es el pelo corto y tiene gafas.",
                    "Es bajo, lleva el pelo corto y es gafas.",
                    "Tiene bajo, está el pelo corto y lleva gafas."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: Es bajo (ser), tiene el pelo corto (tener), lleva gafas (llevar).",
                    "Está bajo и es el pelo — грубые ошибки.",
                    "Es gafas — грубая ошибка.",
                    "Tiene bajo — грубая ошибка."
                ]
            },
            {
                "question": "Как охарактеризовать человека, который не любит много говорить на публике?",
                "type": "application",
                "options": ["Es extrovertido.", "Es tímido.", "Es gordo.", "Es rubio."],
                "correctIndex": 1,
                "explanations": [
                    "Extrovertido — общительный.",
                    "Правильно: «Es tímido» (он застенчивый / робкий).",
                    "Gordo — полный (телосложение).",
                    "Rubio — блондин."
                ]
            },
            {
                "question": "Вам нужно встретить в аэропорту коллегу Лауру, которую вы никогда не видели. Что спросить у неё?",
                "type": "transfer",
                "options": [
                    "¿Cómo eres físicamente y qué ropa llevas?",
                    "¿Dónde eres y cómo estás?",
                    "¿Cuánto cuesta tu maleta?",
                    "¿Cómo te llamas de nuevo?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Cómo eres físicamente y qué ropa llevas?» (описание внешности и одежда).",
                    "Вопрос о самочувствии не поможет узнать человека в толпе.",
                    "Вопрос о цене чемодана неуместен.",
                    "Вопрос об имени не описывает внешность."
                ]
            },
            {
                "question": "Опишите преподавателя: он носит усы, у него седые волосы и он очень добрый. Ваш выбор:",
                "type": "transfer",
                "options": [
                    "Lleva bigote, tiene el pelo canoso y es muy amable.",
                    "Es bigote, lleva el pelo canoso y está amable.",
                    "Tiene bigote, es el pelo canoso y tiene amable.",
                    "Está bigote, tiene el pelo canoso y hace amable."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: Lleva bigote (llevar), tiene el pelo canoso (tener), es amable (ser).",
                    "Es bigote — ошибка.",
                    "Es el pelo — ошибка.",
                    "Está bigote — ошибка."
                ]
            },
            {
                "question": "Свидетель описывает подозреваемого в полиции: «Он молодой, темноволосый, среднего роста и в темных очках».",
                "type": "transfer",
                "options": [
                    "Es joven, moreno, de estatura media y lleva gafas de sol.",
                    "Está joven, tiene moreno y es gafas de sol.",
                    "Es joven, lleva moreno y tiene de estatura media.",
                    "Tiene joven, es moreno y está gafas de sol."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: Es joven, moreno, de estatura media y lleva gafas de sol.",
                    "Está joven и tiene moreno — ошибки.",
                    "Lleva moreno — ошибка.",
                    "Tiene joven — ошибка."
                ]
            },
            {
                "question": "Как сказать «У моей дочери длинные прямые волосы и голубые глаза»?",
                "type": "transfer",
                "options": [
                    "Mi hija tiene el pelo largo y liso, y los ojos azules.",
                    "Mi hija es el pelo largo y liso, y los ojos azules.",
                    "Mi hija lleva los ojos azules y el pelo largo.",
                    "Mi hija está con pelo largo y ojos azules."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Mi hija tiene el pelo largo y liso, y los ojos azules» (глагол tener для волос и глаз).",
                    "Глагол ser нельзя использовать для волос и глаз.",
                    "Llevar не используется для глаз.",
                    "Менее естественная конструкция с estar."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-30-01",
                "type": "choice",
                "question": "Какой глагол нужен: «Mi tío ____ barba y bigote»?",
                "options": ["lleva", "es", "está", "hace"],
                "correctAnswer": "lleva",
                "explanation": "Для бороды и усов используется глагол «llevar» (или tener)."
            },
            {
                "id": "ex-30-02",
                "type": "gap",
                "question": "Sofia ____ (имеет) los ojos verdes y el pelo rubio.",
                "correctAnswer": "tiene",
                "acceptableAnswers": ["tiene", "Tiene"],
                "explanation": "Волосы и глаза: «tiene los ojos verdes»."
            },
            {
                "id": "ex-30-03",
                "type": "tiles",
                "question": "Соберите фразу: «Мой друг высокий и очень симпатичный.»",
                "tiles": ["Mi", "amigo", "es", "alto", "y", "muy", "simpático."],
                "correctAnswer": "Mi amigo es alto y muy simpático.",
                "explanation": "Mi amigo es alto y muy simpático."
            },
            {
                "id": "ex-30-04",
                "type": "transformation",
                "question": "Замените «Tiene el pelo rubio» на конструкцию с глаголом SER для мужчины:",
                "prompt": "Tiene el pelo rubio → Él ____",
                "correctAnswer": "es rubio",
                "acceptableAnswers": ["es rubio", "Es rubio"],
                "explanation": "Él es rubio."
            },
            {
                "id": "ex-30-05",
                "type": "input",
                "question": "Напишите по-испански «кудрявые волосы» (el pelo...):",
                "correctAnswer": "el pelo rizado",
                "acceptableAnswers": ["el pelo rizado", "pelo rizado", "El pelo rizado"],
                "explanation": "el pelo rizado."
            },
            {
                "id": "ex-30-06",
                "type": "gap",
                "question": "El profesor ____ (носит) gafas para leer.",
                "correctAnswer": "lleva",
                "acceptableAnswers": ["lleva", "Lleva", "usa", "Usa"],
                "explanation": "lleva gafas / usa gafas."
            },
            {
                "id": "ex-30-07",
                "type": "choice",
                "question": "Какое слово обозначает человека без волос на голове?",
                "options": ["calvo", "moreno", "pelirrojo", "rubio"],
                "correctAnswer": "calvo",
                "explanation": "calvo = лысый."
            },
            {
                "id": "ex-30-08",
                "type": "input",
                "question": "Напишите по-испански прилагательное «смуглый / темноволосый» (муж. род):",
                "correctAnswer": "moreno",
                "acceptableAnswers": ["moreno", "Moreno"],
                "explanation": "moreno."
            },
            {
                "id": "ex-30-09",
                "type": "transformation",
                "question": "Поставьте описание в женский род: «Él es alto y delgado» → «Ella ____»",
                "prompt": "Él es alto y delgado → Ella ____",
                "correctAnswer": "es alta y delgada",
                "acceptableAnswers": ["es alta y delgada", "Es alta y delgada"],
                "explanation": "Ella es alta y delgada."
            },
            {
                "id": "ex-30-10",
                "type": "tiles",
                "question": "Соберите предложение: «У неё длинные прямые волосы.»",
                "tiles": ["Ella", "tiene", "el", "pelo", "largo", "y", "liso."],
                "correctAnswer": "Ella tiene el pelo largo y liso.",
                "explanation": "Ella tiene el pelo largo y liso."
            },
            {
                "id": "ex-30-11",
                "type": "gap",
                "question": "Mi padre es una persona muy ____ (терпеливый).",
                "correctAnswer": "paciente",
                "acceptableAnswers": ["paciente", "Paciente"],
                "explanation": "paciente."
            },
            {
                "id": "ex-30-12",
                "type": "choice",
                "question": "Что означает «Lleva bigote»?",
                "options": ["Он носит усы", "Он носит бороду", "У него синие глаза", "Он высокий"],
                "correctAnswer": "Он носит усы",
                "explanation": "bigote = усы."
            },
            {
                "id": "ex-30-13",
                "type": "input",
                "question": "Напишите по-испански «карие глаза» (los ojos...):",
                "correctAnswer": "los ojos marrones",
                "acceptableAnswers": ["los ojos marrones", "ojos marrones", "Los ojos marrones", "los ojos cafés"],
                "explanation": "los ojos marrones."
            },
            {
                "id": "ex-30-14",
                "type": "transformation",
                "question": "Переделайте фразу о волосах для местоимения «yo»: «Él tiene el pelo corto» → «Yo ____»",
                "prompt": "Él tiene el pelo corto → Yo ____",
                "correctAnswer": "tengo el pelo corto",
                "acceptableAnswers": ["tengo el pelo corto", "Tengo el pelo corto"],
                "explanation": "Yo tengo el pelo corto."
            },
            {
                "id": "ex-30-15",
                "type": "tiles",
                "question": "Соберите фразу: «Мой брат очень веселый и общительный.»",
                "tiles": ["Mi", "hermano", "es", "muy", "divertido", "y", "sociable."],
                "correctAnswer": "Mi hermano es muy divertido y sociable.",
                "explanation": "Mi hermano es muy divertido y sociable."
            },
            {
                "id": "ex-30-16",
                "type": "gap",
                "question": "Carlos ____ (носит) una camisa blanca y zapatos negros.",
                "correctAnswer": "lleva",
                "acceptableAnswers": ["lleva", "Lleva"],
                "explanation": "lleva una camisa."
            },
            {
                "id": "ex-30-17",
                "type": "choice",
                "question": "Какое прилагательное описывает человека с рыжими волосами?",
                "options": ["pelirrojo", "castaño", "canoso", "rubio"],
                "correctAnswer": "pelirrojo",
                "explanation": "pelirrojo = рыжий."
            },
            {
                "id": "ex-30-18",
                "type": "input",
                "question": "Напишите испанское слово для «очки»:",
                "correctAnswer": "gafas",
                "acceptableAnswers": ["gafas", "las gafas", "Gafas", "lentes", "anteojos"],
                "explanation": "gafas (или lentes/anteojos в Лат. Америке)."
            },
            {
                "id": "ex-30-19",
                "type": "gap",
                "question": "Mi abuelo tiene el pelo ____ (седой).",
                "correctAnswer": "canoso",
                "acceptableAnswers": ["canoso", "Canoso", "blanco", "gris"],
                "explanation": "pelo canoso = седые волосы."
            },
            {
                "id": "ex-30-20",
                "type": "tiles",
                "question": "Соберите предложение: «Она носит солнцезащитные очки на пляже.»",
                "tiles": ["Lleva", "gafas", "de", "sol", "en", "la", "playa."],
                "correctAnswer": "Lleva gafas de sol en la playa.",
                "explanation": "Lleva gafas de sol en la playa."
            },
            {
                "id": "ex-30-21",
                "type": "choice",
                "question": "Как сказать «Он невысокого роста»?",
                "options": ["Es bajo", "Es alto", "Tiene bajo", "Está bajo"],
                "correctAnswer": "Es bajo",
                "explanation": "Es bajo (глагол ser + bajo)."
            },
            {
                "id": "ex-30-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «Es un chico simpático» → «Son unos chicos ____»",
                "prompt": "simpático → ____",
                "correctAnswer": "simpáticos",
                "acceptableAnswers": ["simpáticos", "simpaticos", "Simpáticos"],
                "explanation": "simpático → simpáticos."
            },
            {
                "id": "ex-30-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет ser, tener, цвета и множественное число?",
                "options": [
                    "Mis dos hermanos son altos y tienen los ojos verdes.",
                    "Mis dos hermanos están altos y son los ojos verdes.",
                    "Mis dos hermanos tienen altos y llevan los ojos verde.",
                    "Mis dos hermanos son alto y tienen ojos verde."
                ],
                "correctAnswer": "Mis dos hermanos son altos y tienen los ojos verdes.",
                "explanation": "Son altos (ser) + tienen los ojos verdes (tener + соглас. цвета)."
            },
            {
                "id": "ex-30-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Она молодая, у неё короткие чёрные волосы»:",
                "correctAnswer": "Ella es joven y tiene el pelo corto y negro",
                "acceptableAnswers": [
                    "Ella es joven y tiene el pelo corto y negro",
                    "Ella es joven, tiene el pelo corto y negro",
                    "Es joven y tiene el pelo corto y negro"
                ],
                "explanation": "Ella es joven y tiene el pelo corto y negro."
            }
        ],
        "miniScenario": {
            "title": "Встреча гостя на вокзале Аточа",
            "setting": "Вокзал Аточа в Мадриде.",
            "situation": "Вы договорились встретить нового коллегу Марко. Вы списываетесь в мессенджере, чтобы узнать друг друга.",
            "dialog": [
                {"speaker": "Tú", "text": "¡Hola Marco! Ya estoy en la estación cerca del reloj. ¿Cómo eres físicamente?"},
                {"speaker": "Marco", "text": "Hola. Soy alto, llevo una chaqueta azul, gafas y una mochila roja."},
                {"speaker": "Tú", "text": "Perfecto. Yo soy de estatura media, tengo el pelo rizado y llevo un abrigo negro."},
                {"speaker": "Marco", "text": "¡Ya te veo! Voy hacia ti."}
            ],
            "task": "Опишите себя коллеге (среднего роста, кудрявые волосы, черное пальто).",
            "prompt": "Как написать коллеге описание своей внешности?",
            "options": [
                "Soy de estatura media, tengo el pelo rizado y llevo un abrigo negro.",
                "Estoy de estatura media, soy el pelo rizado y tengo un abrigo negro.",
                "Tengo estatura media, llevo los ojos rizados y soy un abrigo negro.",
                "Hago estatura media, estoy el pelo rizado y llevo negro abrigo."
            ],
            "correctIndex": 0,
            "explanation": "«Soy de estatura media (ser), tengo el pelo rizado (tener), llevo un abrigo negro (llevar)». Идеальное владение тремя глаголами."
        },
        "shortText": {
            "title": "La familia de Sofía",
            "text": "Sofía vive en Valencia con su familia. Su padre, Antonio, es un hombre alto y fuerte; tiene cincuenta años, lleva barba y gafas para trabajar. Su madre, Carmen, es baja, muy delgada y tiene los ojos verdes y el pelo castaño y ondulado. El hermano pequeño de Sofía tiene ocho años; es rubio, muy travieso y siempre lleva zapatillas deportivas rojas. Todos son muy amables y hospitalarios.",
            "questions": [
                {
                    "question": "¿Cómo es físicamente el padre de Sofía?",
                    "options": ["Bajo y rubio", "Alto, fuerte, lleva barba y gafas", "Calvo y antipático", "Joven y delgado"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Antonio, es un hombre alto y fuerte; tiene cincuenta años, lleva barba y gafas...»."
                },
                {
                    "question": "¿De qué color son los ojos de la madre de Sofía?",
                    "options": ["Marrones", "Azules", "Verdes", "Negros"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «tiene los ojos verdes y el pelo castaño...»."
                },
                {
                    "question": "¿Qué lleva puesto el hermano pequeño de Sofía?",
                    "options": ["Un sombrero negro", "Zapatillas deportivas rojas", "Un abrigo largo", "Gafas de sol"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «siempre lleva zapatillas deportivas rojas»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Полный портрет друга или любимого персонажа",
            "prompt": "Напишите подробный портрет вашего друга или известного человека (4-6 предложений):\n1. Назовите имя и возраст (Se llama..., tiene ... años).\n2. Опишите рост и фигуру через SER (Es alto/bajo/delgado...).\n3. Опишите волосы и глаза через TENER (Tiene el pelo..., los ojos...).\n4. Опишите одежду и аксессуары через LLEVAR (Lleva gafas, camisa...).\n5. Опишите характер (Es muy simpático/inteligente...).",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование триады SER / TENER / LLEVAR", "points": 35, "description": "Четкое разделение функций трех глаголов при описании внешности и одежды."},
                    {"name": "Лексическое богатство", "points": 25, "description": "Слова pelo (liso/rizado), ojos, gafas, ropa, adjetivos de carácter."},
                    {"name": "Грамматическое согласование", "points": 25, "description": "Точное согласование всех прилагательных по роду и числу."},
                    {"name": "Связность и структура", "points": 15, "description": "Логичное деление на предложения, правильная пунктуация."}
                ]
            }
        }
    }
}
