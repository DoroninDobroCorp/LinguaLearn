# -*- coding: utf-8 -*-
"""Unit 5: Повседневные действия (Topics 2, 17, 18)"""

unit5_topics = {
    # ----------------------------------------------------
    # TOPIC 2: Present tense regular -ar verbs
    # ----------------------------------------------------
    2: {
        "id": 2,
        "topicName": "Present tense regular -ar verbs",
        "russianTitle": "Настоящее время правильных глаголов первого спряжения (-AR)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u05-actions",
        "icon": "🗣️",
        "summary": "Глаголы первого спряжения оканчиваются на -AR (hablar, trabajar, estudiar, escuchar, comprar, bailar, cocinar...). В настоящем времени (Presente) окончание -AR отбрасывается, и к основе добавляются личные окончания: -o, -as, -a, -amos, -áis, -an.",
        "mnemonicRule": "Основа + О-АС-А-АМОС-АЙС-АН (Habl-o, Habl-as, Habl-a, Habl-amos, Habl-áis, Habl-an). Для voseo (Аргентина) — Habl-ás.",
        "goalsRu": [
            "Спрягать любые правильные глаголы на -AR во всех лицах Presente",
            "Описывать свои повседневные привычки, работу и учебу (trabajo, estudio, hablo, compro...)",
            "Понимать форму voseo (vos hablás, vos trabajás, vos estudiás)",
            "Правильно использовать глаголы с прямым дополнением (hablo español, compro pan)"
        ],
        "sections": [
            {
                "title": "1. Спряжение глаголов на -AR на примере HABLAR (говорить)",
                "content": "Отбрасываем суффикс -ar и добавляем личные окончания:",
                "tables": [
                    {
                        "headers": ["Лицо / Местоимение", "Окончание", "Форма глагола", "Русский перевод"],
                        "rows": [
                            ["yo", "-o", "hablo", "я говорю"],
                            ["tú", "-as", "hablas", "ты говоришь"],
                            ["vos (Аргентина)", "-ás (ударение на -ás!)", "hablás", "ты говоришь (voseo)"],
                            ["él / ella / usted", "-a", "habla", "он/она говорит / Вы говорите"],
                            ["nosotros / nosotras", "-amos", "hablamos", "мы говорим"],
                            ["vosotros / vosotras", "-áis", "habláis", "вы говорите (Испания)"],
                            ["ellos / ellas / ustedes", "-an", "hablan", "они говорят / Вы (все) говорите"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Список топ-10 базовых глаголов на -AR",
                "content": "Все эти глаголы спрягаются абсолютно одинаково по базовой модели:",
                "tables": [
                    {
                        "headers": ["Глагол (инфинитив)", "Основа", "Пример в 1-м лице (yo)", "Русский перевод"],
                        "rows": [
                            ["trabajar", "trabaj-", "trabajo en una oficina", "работать → я работаю в офисе"],
                            ["estudiar", "estudi-", "estudio español", "учиться → я учу испанский"],
                            ["escuchar", "escuch-", "escucho música", "слушать → я слушаю музыку"],
                            ["comprar", "compr-", "compro comida", "покупать → я покупаю еду"],
                            ["cocinar", "cocin-", "cocino la cena", "готовить → я готовлю ужин"],
                            ["caminar", "camin-", "camino por el parque", "гулять/ходить → я гуляю по парку"],
                            ["bailar", "bail-", "bailo salsa", "танцевать → я танцую сальсу"],
                            ["viajar", "viaj-", "viajo en tren", "путешествовать → я путешествую на поезде"],
                            ["descansar", "descans-", "descanso los domingos", "отдыхать → я отдыхаю по воскресеньям"],
                            ["preguntar", "pregunt-", "pregunto la hora", "спрашивать → я спрашиваю время"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Hablo español e inglés con mis amigos.", "ru": "Я говорю по-испански и по-английски с друзьями."},
            {"es": "Carlos trabaja en un hospital moderno.", "ru": "Карлос работает в современной больнице."},
            {"es": "¿Estudias en la universidad o trabajas?", "ru": "Ты учишься в университете или работаешь?"},
            {"es": "Nosotros cocinamos una paella los domingos.", "ru": "Мы готовим паэлью по воскресеньям."},
            {"es": "Ellos escuchan la radio por la mañana.", "ru": "Они слушают радио по утрам."},
            {"es": "Compro fruta fresca en el mercado del barrio.", "ru": "Я покупаю свежие фрукты на районном рынке."},
            {"es": "¿Caminas mucho todos los días?", "ru": "Ты много ходишь пешком каждый день?"},
            {"es": "Mis padres descansan en el jardín.", "ru": "Мои родители отдыхают в саду."},
            {"es": "Bailamos tango en una milonga de Buenos Aires.", "ru": "Мы танцуем танго в милонге Буэнос-Айреса."},
            {"es": "¿Dónde compras tus libros de español?", "ru": "Где ты покупаешь свои книги по испанскому?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Yo hablar español» с инфинитивом вместо личной формы",
                "correction": "Hablo español (с окончанием -o)",
                "explanation": "Глагол в предложении обязан быть проспряжен в соответствии с лицом подлежащего."
            },
            {
                "mistake": "«Él hablas» или «Tú habla» — путаница окончаний 2-го и 3-го лица",
                "correction": "Tú hablas (-as) / Él habla (-a)",
                "explanation": "Окончание -as принадлежит 2-му лицу (tú), а -a — 3-му лицу (él, ella, usted)."
            },
            {
                "mistake": "«Nosotros hablais» в Латинской Америке",
                "correction": "Nosotros hablamos (-amos) / Vosotros habláis (-áis)",
                "explanation": "Для nosotros окончание всегда -amos, а -áis используется только с vosotros в Испании."
            }
        ],
        "trapAlert": "Форма «usted» (Вы, вежливо) ВСЕГДА принимает окончание 3-го лица (-a): «¿Usted habla español?»!",
        "dialectNote": "При обращении на «vos» (Аргентина, Уругвай) ударение падает на суффикс -ás: vos hablás, vos trabajás, vos caminás, vos estudiás.",
        "quiz": [
            {
                "question": "Какое личное окончание получает глагол на -AR для местоимения «yo»?",
                "type": "recognition",
                "options": ["-as", "-o", "-a", "-amos"],
                "correctIndex": 1,
                "explanations": [
                    "-as — форма tú.",
                    "Правильно: для yo окончание всегда «-o» (hablo, trabajo, estudio).",
                    "-a — форма él/ella/usted.",
                    "-amos — форма nosotros."
                ]
            },
            {
                "question": "Какая форма глагола «trabajar» соответствует «nosotros»?",
                "type": "recognition",
                "options": ["trabajamos", "trabajan", "trabajáis", "trabajas"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: nosotros «trabajamos».",
                    "Trabajan — ellos/ustedes.",
                    "Trabajáis — vosotros.",
                    "Trabajas — tú."
                ]
            },
            {
                "question": "Какая форма глагола «estudiar» согласуется с местоимением «tú»?",
                "type": "recognition",
                "options": ["estudio", "estudia", "estudias", "estudian"],
                "correctIndex": 2,
                "explanations": [
                    "Estudio — yo.",
                    "Estudia — él/ella/usted.",
                    "Правильно: tú «estudias».",
                    "Estudian — ellos/ustedes."
                ]
            },
            {
                "question": "Какая форма глагола «hablar» используется с вежливым «usted»?",
                "type": "recognition",
                "options": ["hablo", "hablas", "habla", "hablan"],
                "correctIndex": 2,
                "explanations": [
                    "Hablo — yo.",
                    "Hablas — ты (tú).",
                    "Правильно: usted «habla» (3-е лицо единственного числа).",
                    "Hablan — ustedes (множественное число)."
                ]
            },
            {
                "question": "Вставьте глагол: «Mis padres ____ (работать) en una escuela.»",
                "type": "application",
                "options": ["trabaja", "trabajamos", "trabajan", "trabajo"],
                "correctIndex": 2,
                "explanations": [
                    "Trabaja — единственное число.",
                    "Trabajamos — 1 лицо мн. число.",
                    "Правильно: mis padres = они (ellos) → «trabajan».",
                    "Trabajo — 1 лицо ед. число."
                ]
            },
            {
                "question": "Вставьте глагол: «¿Tú ____ (слушать) música clásica?»",
                "type": "application",
                "options": ["escucho", "escuchas", "escucha", "escuchan"],
                "correctIndex": 1,
                "explanations": [
                    "Escucho — yo.",
                    "Правильно: tú «escuchas».",
                    "Escucha — él/ella/usted.",
                    "Escuchan — ellos/ustedes."
                ]
            },
            {
                "question": "Вставьте форму: «Elena y yo ____ (готовить) la cena juntos.»",
                "type": "application",
                "options": ["cocina", "cocino", "cocinamos", "cocinan"],
                "correctIndex": 2,
                "explanations": [
                    "Cocina — 3 лицо ед. ч.",
                    "Cocino — 1 лицо ед. ч.",
                    "Правильно: Елена и я = мы (nosotros) → «cocinamos».",
                    "Cocinan — 3 лицо мн. ч."
                ]
            },
            {
                "question": "Вставьте глагол: «Yo ____ (покупать) el pan en la panadería.»",
                "type": "application",
                "options": ["compro", "compras", "compra", "compramos"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: yo «compro».",
                    "Compras — tú.",
                    "Compra — él/ella.",
                    "Compramos — nosotros."
                ]
            },
            {
                "question": "Собеседник спрашивает: «¿Dónde trabajas?». Вы работаете в банке. Ваш ответ:",
                "type": "transfer",
                "options": ["Trabajo en un banco.", "Trabajas en un banco.", "Trabaja en un banco.", "Trabajar en un banco."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Trabajo en un banco» (форма 1-го лица yo).",
                    "«Trabajas» означает «ты работаешь».",
                    "«Trabaja» означает «он работает».",
                    "Инфинитив без спряжения ошибочен."
                ]
            },
            {
                "question": "Как вежливо спросить у прохожего: «Вы говорите по-английски?»?",
                "type": "transfer",
                "options": ["¿Usted habla inglés?", "¿Usted hablas inglés?", "¿Usted hablo inglés?", "¿Usted hablar inglés?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Usted habla inglés?» (usted + окончание -a).",
                    "Hablas — форма tú.",
                    "Hablo — форма yo.",
                    "Инфинитив без спряжения."
                ]
            },
            {
                "question": "Как рассказать о друзьях: «Они много путешествуют на поезде»?",
                "type": "transfer",
                "options": ["Viajan mucho en tren.", "Viajamos mucho en tren.", "Viajas mucho en tren.", "Viajo mucho en tren."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Viajan mucho en tren» (форма 3-го лица ellos).",
                    "Viajamos — мы.",
                    "Viajas — ты.",
                    "Viajo — я."
                ]
            },
            {
                "question": "В Аргентине вам задают вопрос с voseo: «¿Vos hablás español?». Как звучит естественный утвердительный ответ?",
                "type": "transfer",
                "options": ["Sí, hablo español.", "Sí, hablás español.", "Sí, habla español.", "Sí, hablamos español."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: на вопрос к вам («vos hablás?») вы отвечаете в 1-м лице: «Sí, hablo español».",
                    "«Hablás» значило бы «да, ты говоришь».",
                    "3-е лицо.",
                    "«Мы говорим»."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-2-01",
                "type": "choice",
                "question": "Какая форма глагола «hablar» соответствует местоимению «yo»?",
                "options": ["hablo", "hablas", "habla", "hablan"],
                "correctAnswer": "hablo",
                "explanation": "yo hablo."
            },
            {
                "id": "ex-2-02",
                "type": "gap",
                "question": "Carlos ____ (работать - trabajar) en una oficina en Madrid.",
                "correctAnswer": "trabaja",
                "acceptableAnswers": ["trabaja", "Trabaja"],
                "explanation": "Carlos trabaja."
            },
            {
                "id": "ex-2-03",
                "type": "tiles",
                "question": "Соберите предложение: «Мы учим испанский в университете.»",
                "tiles": ["Estudiamos", "español", "en", "la", "universidad."],
                "correctAnswer": "Estudiamos español en la universidad.",
                "explanation": "Estudiamos español en la universidad."
            },
            {
                "id": "ex-2-04",
                "type": "transformation",
                "question": "Поставьте глагол «hablar» в форму 2-го лица ед. ч. (tú): «Yo hablo» → «Tú ____»",
                "prompt": "hablar (tú) → ____",
                "correctAnswer": "hablas",
                "acceptableAnswers": ["hablas", "Hablas"],
                "explanation": "tú hablas."
            },
            {
                "id": "ex-2-05",
                "type": "input",
                "question": "Напишите форму глагола «estudiar» для «nosotros»:",
                "correctAnswer": "estudiamos",
                "acceptableAnswers": ["estudiamos", "Estudiamos"],
                "explanation": "nosotros estudiamos."
            },
            {
                "id": "ex-2-06",
                "type": "gap",
                "question": "Yo ____ (слушать - escuchar) música clásica por la tarde.",
                "correctAnswer": "escucho",
                "acceptableAnswers": ["escucho", "Escucho"],
                "explanation": "yo escucho."
            },
            {
                "id": "ex-2-07",
                "type": "choice",
                "question": "Какая форма глагола «comprar» соответствует «ellos»?",
                "options": ["compran", "compramos", "compras", "compra"],
                "correctAnswer": "compran",
                "explanation": "ellos compran."
            },
            {
                "id": "ex-2-08",
                "type": "input",
                "question": "Напишите форму глагола «cocinar» для «él / ella»:",
                "correctAnswer": "cocina",
                "acceptableAnswers": ["cocina", "Cocina"],
                "explanation": "él/ella cocina."
            },
            {
                "id": "ex-2-09",
                "type": "transformation",
                "question": "Замените форму tú на аргентинскую форму voseo: «tú hablas» → «vos ____»",
                "prompt": "tú hablas → vos ____",
                "correctAnswer": "hablás",
                "acceptableAnswers": ["hablás", "hablas", "Hablás"],
                "explanation": "vos hablás."
            },
            {
                "id": "ex-2-10",
                "type": "tiles",
                "question": "Соберите фразу: «Я покупаю свежие фрукты на рынке.»",
                "tiles": ["Compro", "fruta", "fresca", "en", "el", "mercado."],
                "correctAnswer": "Compro fruta fresca en el mercado.",
                "explanation": "Compro fruta fresca en el mercado."
            },
            {
                "id": "ex-2-11",
                "type": "gap",
                "question": "¿Dónde ____ (учиться - estudiar) tú y tus amigos?",
                "correctAnswer": "estudian",
                "acceptableAnswers": ["estudian", "estudiáis"],
                "explanation": "tú y tus amigos = ustedes (estudian) / vosotros (estudiáis)."
            },
            {
                "id": "ex-2-12",
                "type": "choice",
                "question": "Что означает «Caminamos por el parque»?",
                "options": ["Мы гуляем по парку", "Они бегают в парке", "Я сижу в парке", "Ты идешь в парк"],
                "correctAnswer": "Мы гуляем по парку",
                "explanation": "Caminamos = мы гуляем/ходим."
            },
            {
                "id": "ex-2-13",
                "type": "input",
                "question": "Напишите форму глагола «bailar» для «yo»:",
                "correctAnswer": "bailo",
                "acceptableAnswers": ["bailo", "Bailo"],
                "explanation": "yo bailo."
            },
            {
                "id": "ex-2-14",
                "type": "transformation",
                "question": "Поставьте во множественное число: «Él viaja en tren» → «Ellos ____ en tren»",
                "prompt": "viaja → ____",
                "correctAnswer": "viajan",
                "acceptableAnswers": ["viajan", "Viajan"],
                "explanation": "ellos viajan."
            },
            {
                "id": "ex-2-15",
                "type": "tiles",
                "question": "Соберите предложение: «Мои родители отдыхают по воскресеньям.»",
                "tiles": ["Mis", "padres", "descansan", "los", "domingos."],
                "correctAnswer": "Mis padres descansan los domingos.",
                "explanation": "Mis padres descansan los domingos."
            },
            {
                "id": "ex-2-16",
                "type": "gap",
                "question": "El alumno ____ (спрашивать - preguntar) la duda al profesor.",
                "correctAnswer": "pregunta",
                "acceptableAnswers": ["pregunta", "Pregunta"],
                "explanation": "el alumno pregunta."
            },
            {
                "id": "ex-2-17",
                "type": "choice",
                "question": "Какая форма глагола «hablar» согласуется с «usted»?",
                "options": ["habla", "hablas", "hablo", "hablamos"],
                "correctAnswer": "habla",
                "explanation": "usted habla."
            },
            {
                "id": "ex-2-18",
                "type": "input",
                "question": "Напишите форму глагола «trabajar» для «tú»:",
                "correctAnswer": "trabajas",
                "acceptableAnswers": ["trabajas", "Trabajas"],
                "explanation": "tú trabajas."
            },
            {
                "id": "ex-2-19",
                "type": "gap",
                "question": "Nosotros ____ (путешествовать - viajar) a España en verano.",
                "correctAnswer": "viajamos",
                "acceptableAnswers": ["viajamos", "Viajamos"],
                "explanation": "nosotros viajamos."
            },
            {
                "id": "ex-2-19b",
                "type": "tiles",
                "question": "Соберите фразу: «Вы говорите по-испански очень хорошо.»",
                "tiles": ["Usted", "habla", "español", "muy", "bien."],
                "correctAnswer": "Usted habla español muy bien.",
                "explanation": "Usted habla español muy bien."
            },
            {
                "id": "ex-2-21",
                "type": "choice",
                "question": "Как сказать «Я готовлю вкусный ужин»?",
                "options": ["Cocino una cena deliciosa.", "Cocina una cena deliciosa.", "Cocinas una cena deliciosa.", "Cocinar una cena deliciosa."],
                "correctAnswer": "Cocino una cena deliciosa.",
                "explanation": "yo cocino."
            },
            {
                "id": "ex-2-22",
                "type": "transformation",
                "question": "Поставьте глагол в форму 1-го лица ед. числа: «trabajar» → «____»",
                "prompt": "yo (trabajar) → ____",
                "correctAnswer": "trabajo",
                "acceptableAnswers": ["trabajo", "Trabajo"],
                "explanation": "yo trabajo."
            },
            {
                "id": "ex-2-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет глаголы на -ar, семью и притяжательные местоимения?",
                "options": [
                    "Mi hermano trabaja en Madrid y mi hermana estudia en Sevilla.",
                    "El mi hermano trabajar en Madrid y su hermana estudiar.",
                    "Mis hermano trabaja en Madrid y mi hermana es en Sevilla.",
                    "Mi hermano tiene en Madrid y mi hermana está estudiar."
                ],
                "correctAnswer": "Mi hermano trabaja en Madrid y mi hermana estudia en Sevilla.",
                "explanation": "Mi hermano trabaja (trabajar) + mi hermana estudia (estudiar)."
            },
            {
                "id": "ex-2-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Я говорю по-испански и живу в Мадриде»:",
                "correctAnswer": "Hablo español y vivo en Madrid",
                "acceptableAnswers": [
                    "Hablo español y vivo en Madrid",
                    "Hablo espanol y vivo en Madrid",
                    "Yo hablo español y vivo en Madrid"
                ],
                "explanation": "Hablo español y vivo en Madrid."
            }
        ],
        "miniScenario": {
            "title": "Разговор с новым соседом",
            "setting": "Патио жилого дома в Валенсии.",
            "situation": "Вы знакомитесь с новым соседом по лестничной клетке. Он интересуется вашей профессией и увлечениями.",
            "dialog": [
                {"speaker": "Vecino", "text": "¡Hola! ¿Eres el nuevo vecino del tercero? ¿Estudias o trabajas?"},
                {"speaker": "Tú", "text": "¡Hola! Sí, trabajo como diseñador y estudio español por las tardes."},
                {"speaker": "Vecino", "text": "¡Qué bien! Yo cocino en un restaurante del centro. Si necesitas algo, aquí estoy."},
                {"speaker": "Tú", "text": "Muchas gracias, muy amable."}
            ],
            "task": "Расскажите соседу, что вы работаете и учите испанский.",
            "prompt": "Как ответить соседу на вопрос «¿Estudias o trabajas?»?",
            "options": [
                "Trabajo como diseñador y estudio español.",
                "Trabajas como diseñador y estudias español.",
                "Trabajar como diseñador y estudiar español.",
                "Es diseñador y está español."
            ],
            "correctIndex": 0,
            "explanation": "«Trabajo como diseñador y estudio español» (1-е лицо ед. ч. обоих глаголов)."
        },
        "shortText": {
            "title": "La vida diaria de Pedro",
            "text": "Pedro es un joven de veinticuatro años que vive en Granada. Por las mañanas trabaja en una librería histórica en el centro. Por las tardes estudia filología en la universidad y habla español con sus amigos internacionales. Los fines de semana camina por las montañas de Sierra Nevada, cocina platos tradicionales con su madre y escucha música clásica para relajarse.",
            "questions": [
                {
                    "question": "¿Dónde trabaja Pedro por las mañanas?",
                    "options": ["En un hospital", "En una librería histórica", "En un restaurante", "En un banco"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «trabaja en una librería histórica en el centro»."
                },
                {
                    "question": "¿Qué hace Pedro por las tardes?",
                    "options": ["Duerme diez horas", "Estudia filología y habla español con amigos", "Baila tango", "Compra coches"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «estudia filología en la universidad y habla español...»."
                },
                {
                    "question": "¿Qué forma verbal del verbo «cocinar» se usa con Pedro?",
                    "options": ["Cocino", "Cocinas", "Cocina", "Cocinamos"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «cocina platos tradicionales con su madre»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Мой обычный распорядок дня (глаголы на -AR)",
            "prompt": "Напишите короткий рассказ о своем обычном дне (4-5 предложений), используя глаголы первого спряжения (-AR):\n1. Где и кем вы работаете или учитесь (trabajo en..., estudio...).\n2. Что вы слушаете или покупаете днем (escucho música, compro...).\n3. Что вы делаете вечером (cocino la cena, camino por el parque...).\n4. С кем вы разговариваете (hablo con mis amigos/familia).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Спряжение глаголов на -AR", "points": 35, "description": "Правильное использование личных форм на -o, -as, -a, -amos, -an."},
                    {"name": "Разнообразие глаголов", "points": 30, "description": "Использование минимум 4 различных глаголов на -AR (hablar, trabajar, estudiar, escuchar, cocinar, caminar...)."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Связно описан распорядок дня."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотность и отсутствие опечаток."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 17: Negation (no + verb)
    # ----------------------------------------------------
    17: {
        "id": 17,
        "topicName": "Negation (no + verb)",
        "russianTitle": "Отрицание в испанском языке (no + глагол, nunca, nada, nadie)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u05-actions",
        "icon": "⛔",
        "summary": "Базовое отрицание в испанском языке строится добавлением частицы «NO» непосредственно перед спрягаемым глаголом. В отличие от английского, вспомогательные глаголы не требуются. В испанском также грамматически нормативно двойное отрицание (No hablo nunca / No veo a nadie).",
        "mnemonicRule": "NO всегда стоит прямо ПЕРЕД глаголом: «No hablo», «No trabajo», «No es difícil». Двойное отрицание — норма: «No quiero nada».",
        "goalsRu": [
            "Строить базовые отрицательные предложения с частицей «no» перед глаголом",
            "Использовать базовые отрицательные местоимения и наречия (nada, nadie, nunca, tampoco)",
            "Правильно строить конструкции двойного отрицания (No como nada, No veo a nadie)",
            "Отвечать «нет» на общие вопросы: «No, no hablo inglés»"
        ],
        "sections": [
            {
                "title": "1. Базовое отрицание: NO + глагол",
                "content": "Частица NO всегда ставится ПЕРЕД глаголом. Между NO и глаголом могут стоять только местоимения (no me llamo, no te entiendo):",
                "tables": [
                    {
                        "headers": ["Утверждение (+)", "Отрицание (-)", "Русский перевод"],
                        "rows": [
                            ["Hablo inglés.", "No hablo inglés.", "Я не говорю по-английски."],
                            ["Trabajo los domingos.", "No trabajo los domingos.", "Я не работаю по воскресеньям."],
                            ["Es fácil.", "No es fácil.", "Это не легко."],
                            ["Tengo frío.", "No tengo frío.", "Мне не холодно."],
                            ["Estoy cansado.", "No estoy cansado.", "Я не устал."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Отрицательные слова и двойное отрицание",
                "content": "Если отрицательное слово (nada, nadie, nunca, tampoco) стоит ПОСЛЕ глагола, перед глаголом ОБЯЗАТЕЛЬНО должна стоять частица NO:",
                "tables": [
                    {
                        "headers": ["Отрицательное слово", "Конструкция с двойным отрицанием", "Конструкция перед глаголом", "Русский перевод"],
                        "rows": [
                            ["nada (ничего)", "No entiendo nada.", "Nada es fácil.", "Я ничего не понимаю."],
                            ["nadie (никто)", "No veo a nadie.", "Nadie habla.", "Я никого не вижу."],
                            ["nunca (никогда)", "No viajo nunca en avión.", "Nunca viajo en avión.", "Я никогда не летаю на самолете."],
                            ["tampoco (тоже не)", "No hablo alemán tampoco.", "Tampoco hablo alemán.", "Я тоже не говорю по-немецки."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "No hablo alemán, pero hablo español.", "ru": "Я не говорю по-немецки, но говорю по-испански."},
            {"es": "Hoy no trabajo porque es fiesta.", "ru": "Сегодня я не работаю, потому что праздник."},
            {"es": "No tengo dinero en efectivo.", "ru": "У меня нет наличных денег."},
            {"es": "No entiendo la pregunta, ¿puede repetir?", "ru": "Я не понимаю вопрос, можете повторить?"},
            {"es": "No quiero comer nada ahora.", "ru": "Я ничего не хочу есть сейчас (двойное отрицание)."},
            {"es": "En la clase no hay nadie.", "ru": "В классе никого нет."},
            {"es": "Yo no viajo nunca solo.", "ru": "Я никогда не путешествую один."},
            {"es": "—No hablo francés. —Yo tampoco.", "ru": "—Я не говорю по-французски. —Я тоже нет."},
            {"es": "No es verdad lo que dices.", "ru": "То, что ты говоришь — неправда."},
            {"es": "No, gracias, no fumo.", "ru": "Нет, спасибо, я не курю."}
        ],
        "typicalMistakes": [
            {
                "mistake": "Постановка «no» после глагола: «Hablo no español»",
                "correction": "No hablo español",
                "explanation": "Отрицательная частица «no» обязана стоять ПЕРЕД глаголом."
            },
            {
                "mistake": "«No entiendo algo» вместо «No entiendo nada»",
                "correction": "No entiendo nada",
                "explanation": "В отрицательных предложениях в испанском языке «что-то» заменяется на отрицательное «nada» (двойное отрицание)."
            },
            {
                "mistake": "«Yo también no» вместо «Yo tampoco»",
                "correction": "Yo tampoco (я тоже не...)",
                "explanation": "В испанском нельзя сказать «también no» — для отрицательного согласия используется слово «tampoco»."
            }
        ],
        "trapAlert": "«ТОЖЕ НЕ» по-испански — это TAMPOCO! Никогда не говорите «también no»!",
        "dialectNote": "Слово «jamás» усиливает «nunca» и используется во всех испаноязычных странах («¡Nunca jamás!» = Никогда в жизни!).",
        "quiz": [
            {
                "question": "Где ставится отрицательная частица «no» в простом предложении?",
                "type": "recognition",
                "options": ["После глагола", "Прямо перед глаголом", "В самом конце предложения", "После подлежащего и глагола"],
                "correctIndex": 1,
                "explanations": [
                    "После глагола ставить «no» запрещено.",
                    "Правильно: «no» ставится непосредственно перед спрягаемым глаголом (No hablo).",
                    "В конце предложения отрицание не ставится.",
                    "Неверно."
                ]
            },
            {
                "question": "Как ответить собеседнику «Я тоже не...» (отрицательное согласие)?",
                "type": "recognition",
                "options": ["Yo también no", "Yo tampoco", "Yo no también", "Yo nada"],
                "correctIndex": 1,
                "explanations": [
                    "«También no» — типичная грубая ошибка русскоязычных учеников.",
                    "Правильно: «Yo tampoco» означает «Я тоже не...».",
                    "Неграмотно.",
                    "Не выражает согласие."
                ]
            },
            {
                "question": "Какое отрицательное местоимение означает «никто»?",
                "type": "recognition",
                "options": ["nada", "nadie", "nunca", "ninguno"],
                "correctIndex": 1,
                "explanations": [
                    "Nada = ничего.",
                    "Правильно: «nadie» = никто.",
                    "Nunca = никогда.",
                    "Ninguno = никакой / ни один."
                ]
            },
            {
                "question": "Какое отрицательное слово означает «ничего»?",
                "type": "recognition",
                "options": ["nadie", "nada", "nunca", "tampoco"],
                "correctIndex": 1,
                "explanations": [
                    "Nadie = никто.",
                    "Правильно: «nada» = ничего.",
                    "Nunca = никогда.",
                    "Tampoco = тоже не."
                ]
            },
            {
                "question": "Как правильно сказать «Я ничего не понимаю»?",
                "type": "application",
                "options": ["No entiendo algo.", "No entiendo nada.", "Entiendo nada no.", "No nada entiendo."],
                "correctIndex": 1,
                "explanations": [
                    "«Algo» используется только в утвердительных предложениях.",
                    "Правильно: «No entiendo nada» (двойное отрицание: no + глагол + nada).",
                    "Неверный порядок слов.",
                    "Неверный порядок слов."
                ]
            },
            {
                "question": "Сделайте предложение отрицательным: «Carlos trabaja hoy» → «____»",
                "type": "application",
                "options": ["Carlos trabaja no hoy.", "Carlos no trabaja hoy.", "Carlos trabaja hoy no.", "No Carlos trabaja hoy."],
                "correctIndex": 1,
                "explanations": [
                    "Отрицание после глагола недопустимо.",
                    "Правильно: «Carlos no trabaja hoy» (no перед глаголом).",
                    "Неверный порядок слов.",
                    "No перед подлежащим звучит неестественно."
                ]
            },
            {
                "question": "Дополните диалог: «—No me gusta el café con azúcar. —A mí ____.»",
                "type": "application",
                "options": ["también", "tampoco", "nada", "no"],
                "correctIndex": 1,
                "explanations": [
                    "También используется при согласии с утверждением (Me gusta → A mí también).",
                    "Правильно: «A mí tampoco» (согласие с отрицанием).",
                    "Nada не выражает согласие.",
                    "Одного «no» недостаточно."
                ]
            },
            {
                "question": "Вставьте отрицание: «En esta sala ____ hay nadie.»",
                "type": "application",
                "options": ["no", "ni", "nunca no", "tampoco no"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «no hay nadie» (если nadie стоит после hay, перед ним обязательно no).",
                    "Ni — союз «ни».",
                    "Избыточно.",
                    "Избыточно."
                ]
            },
            {
                "question": "Вам предлагают десерт в гостях, но вы сыты. Как вежливо отказаться?",
                "type": "transfer",
                "options": ["No, gracias, no tengo hambre.", "Sí, gracias, no hablo.", "De nada, no soy hambre.", "Por favor, no nada."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «No, gracias, no tengo hambre» (вежливый отказ + объяснение).",
                    "Бессмысленно.",
                    "«Soy hambre» — ошибка.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Как сказать «Я никогда не опаздываю на уроки»?",
                "type": "transfer",
                "options": ["No llego nunca tarde a clase.", "Llego nunca no tarde a clase.", "No llego jamás no tarde.", "Llego no nunca tarde."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «No llego nunca tarde a clase» (или «Nunca llego tarde a clase»).",
                    "Неверный порядок слов.",
                    "Тройное отрицание ошибочно.",
                    "Неверно."
                ]
            },
            {
                "question": "Как перевести «Никто не говорит по-русски в этом отеле»?",
                "type": "transfer",
                "options": ["Nadie habla ruso en este hotel.", "Nadie no habla ruso en este hotel.", "No nadie habla ruso en este hotel.", "Habla nadie ruso no."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: если «Nadie» стоит ПЕРЕД глаголом, частица «no» НЕ ставится: «Nadie habla ruso» (или «No habla ruso nadie»).",
                    "«Nadie no habla» — ошибка (когда Nadie перед глаголом, no не нужно).",
                    "Неверный порядок.",
                    "Неверный порядок."
                ]
            },
            {
                "question": "Собеседник говорит: «No tengo coche». У вас тоже нет машины. Ваш краткий естественный ответ:",
                "type": "transfer",
                "options": ["Yo tampoco.", "Yo también.", "Yo no.", "Yo nada."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Yo tampoco» — краткое согласие с отрицанием.",
                    "«Yo también» значило бы «А у меня есть» в ответ на отрицание.",
                    "«Yo no» значило бы «А я нет» в ответ на утверждение.",
                    "«Yo nada» не имеет смысла."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-17-01",
                "type": "choice",
                "question": "Какое слово делает фразу отрицательной: «Yo ____ hablo alemán»?",
                "options": ["no", "ni", "nada", "tampoco"],
                "correctAnswer": "no",
                "explanation": "Отрицательная частица: «no hablo»."
            },
            {
                "id": "ex-17-02",
                "type": "gap",
                "question": "Hoy es domingo y yo ____ (не) trabajo.",
                "correctAnswer": "no",
                "acceptableAnswers": ["no", "No"],
                "explanation": "no trabajo."
            },
            {
                "id": "ex-17-03",
                "type": "tiles",
                "question": "Соберите отрицательное предложение: «Я не говорю по-немецки.»",
                "tiles": ["No", "hablo", "alemán."],
                "correctAnswer": "No hablo alemán.",
                "explanation": "No hablo alemán."
            },
            {
                "id": "ex-17-04",
                "type": "transformation",
                "question": "Сделайте предложение отрицательным: «Estudio hoy» → «____»",
                "prompt": "Estudio hoy → ____",
                "correctAnswer": "No estudio hoy",
                "acceptableAnswers": ["No estudio hoy", "no estudio hoy"],
                "explanation": "No estudio hoy."
            },
            {
                "id": "ex-17-05",
                "type": "input",
                "question": "Напишите испанское слово для отрицательного согласия «тоже не»:",
                "correctAnswer": "tampoco",
                "acceptableAnswers": ["tampoco", "Tampoco"],
                "explanation": "tampoco."
            },
            {
                "id": "ex-17-06",
                "type": "gap",
                "question": "No entiendo ____ (ничего), ¿puede repetir?",
                "correctAnswer": "nada",
                "acceptableAnswers": ["nada", "Nada"],
                "explanation": "No entiendo nada."
            },
            {
                "id": "ex-17-07",
                "type": "choice",
                "question": "Какое отрицательное слово означает «никогда»?",
                "options": ["nunca", "nadie", "nada", "tampoco"],
                "correctAnswer": "nunca",
                "explanation": "nunca = никогда."
            },
            {
                "id": "ex-17-08",
                "type": "input",
                "question": "Напишите по-испански слово «никто»:",
                "correctAnswer": "nadie",
                "acceptableAnswers": ["nadie", "Nadie"],
                "explanation": "nadie."
            },
            {
                "id": "ex-17-09",
                "type": "transformation",
                "question": "Сделайте фразу отрицательной: «Tengo hambre» → «____»",
                "prompt": "Tengo hambre → ____",
                "correctAnswer": "No tengo hambre",
                "acceptableAnswers": ["No tengo hambre", "no tengo hambre"],
                "explanation": "No tengo hambre."
            },
            {
                "id": "ex-17-10",
                "type": "tiles",
                "question": "Соберите фразу: «В классе никого нет.»",
                "tiles": ["No", "hay", "nadie", "en", "la", "clase."],
                "correctAnswer": "No hay nadie en la clase.",
                "explanation": "No hay nadie en la clase."
            },
            {
                "id": "ex-17-11",
                "type": "gap",
                "question": "Carlos ____ (никогда не) come carne porque es vegetariano.",
                "correctAnswer": "nunca",
                "acceptableAnswers": ["nunca", "Nunca", "no"],
                "explanation": "nunca come carne."
            },
            {
                "id": "ex-17-12",
                "type": "choice",
                "question": "Как ответить «Я тоже не курю» на фразу «No fumo»?",
                "options": ["Yo tampoco.", "Yo también.", "Yo no.", "Yo nada."],
                "correctAnswer": "Yo tampoco.",
                "explanation": "Yo tampoco."
            },
            {
                "id": "ex-17-13",
                "type": "input",
                "question": "Напишите по-испански «ничего»:",
                "correctAnswer": "nada",
                "acceptableAnswers": ["nada", "Nada"],
                "explanation": "nada."
            },
            {
                "id": "ex-17-14",
                "type": "transformation",
                "question": "Сделайте фразу отрицательной: «Es mi amigo» → «____»",
                "prompt": "Es mi amigo → ____",
                "correctAnswer": "No es mi amigo",
                "acceptableAnswers": ["No es mi amigo", "no es mi amigo"],
                "explanation": "No es mi amigo."
            },
            {
                "id": "ex-17-15",
                "type": "tiles",
                "question": "Соберите предложение: «Я ничего не покупаю в этом магазине.»",
                "tiles": ["No", "compro", "nada", "en", "esta", "tienda."],
                "correctAnswer": "No compro nada en esta tienda.",
                "explanation": "No compro nada en esta tienda."
            },
            {
                "id": "ex-17-16",
                "type": "gap",
                "question": "—No hablo francés. —Yo ____ (тоже не).",
                "correctAnswer": "tampoco",
                "acceptableAnswers": ["tampoco", "Tampoco"],
                "explanation": "Yo tampoco."
            },
            {
                "id": "ex-17-17",
                "type": "choice",
                "question": "Какая конструкция двойного отрицания грамматически верна?",
                "options": ["No veo a nadie.", "Veo no a nadie.", "No veo a alguien.", "Nadie no veo."],
                "correctAnswer": "No veo a nadie.",
                "explanation": "No veo a nadie (no + глагол + a nadie)."
            },
            {
                "id": "ex-17-18",
                "type": "input",
                "question": "Напишите по-испански: «Я не знаю»:",
                "correctAnswer": "No sé",
                "acceptableAnswers": ["No sé", "no sé", "No se", "no se"],
                "explanation": "No sé (с тильдой)."
            },
            {
                "id": "ex-17-19",
                "type": "gap",
                "question": "El museo ____ (не) abre los lunes.",
                "correctAnswer": "no",
                "acceptableAnswers": ["no", "No"],
                "explanation": "no abre."
            },
            {
                "id": "ex-17-20",
                "type": "tiles",
                "question": "Соберите фразу: «Я никогда не путешествую один.»",
                "tiles": ["Nunca", "viajo", "solo."],
                "correctAnswer": "Nunca viajo solo.",
                "explanation": "Nunca viajo solo."
            },
            {
                "id": "ex-21-21b",
                "type": "choice",
                "question": "Как сказать «Это неправда»?",
                "options": ["No es verdad.", "Es no verdad.", "No está verdad.", "Es verdad no."],
                "correctAnswer": "No es verdad.",
                "explanation": "No es verdad."
            },
            {
                "id": "ex-17-22",
                "type": "transformation",
                "question": "Сделайте фразу отрицательной: «Tengo frío» → «____»",
                "prompt": "Tengo frío → ____",
                "correctAnswer": "No tengo frío",
                "acceptableAnswers": ["No tengo frío", "no tengo frío", "No tengo frio"],
                "explanation": "No tengo frío."
            },
            {
                "id": "ex-17-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет отрицание, глаголы на -ar и притяжательные местоимения?",
                "options": [
                    "Mi hermano no trabaja los domingos.",
                    "El mi hermano trabaja no los domingos.",
                    "Mis hermano no es trabajar los domingos.",
                    "Mi hermano no tiene trabajar los domingos."
                ],
                "correctAnswer": "Mi hermano no trabaja los domingos.",
                "explanation": "Mi hermano + no trabaja (отрицание перед глаголом на -ar) + los domingos."
            },
            {
                "id": "ex-17-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Я не говорю по-испански и у меня нет билета»:",
                "correctAnswer": "No hablo español y no tengo billete",
                "acceptableAnswers": [
                    "No hablo español y no tengo billete",
                    "No hablo español y no tengo el billete",
                    "No hablo español y no tengo boleto"
                ],
                "explanation": "No hablo español y no tengo billete."
            }
        ],
        "miniScenario": {
            "title": "Непонимание в чужом городе",
            "setting": "Улица в Валенсии. К вам обращается турист на немецком языке.",
            "situation": "Прохожий спрашивает дорогу на незнакомом вам языке. Вы вежливо объясняете, что не говорите на нем.",
            "dialog": [
                {"speaker": "Turista", "text": "Entschuldigung, sprechen Sie Deutsch?"},
                {"speaker": "Tú", "text": "Perdón, no hablo alemán y no entiendo nada. Solo hablo español e inglés."},
                {"speaker": "Turista", "text": "Oh, sorry! Do you speak English?"},
                {"speaker": "Tú", "text": "Yes, I do. How can I help you?"}
            ],
            "task": "Объясните прохожему, что вы не говорите по-немецки и ничего не понимаете.",
            "prompt": "Как сказать: «Простите, я не говорю по-немецки и ничего не понимаю»?",
            "options": [
                "Perdón, no hablo alemán y no entiendo nada.",
                "Perdón, hablo no alemán y entiendo algo no.",
                "De nada, soy alemán no y no hablo.",
                "Por favor, no alemán nadie."
            ],
            "correctIndex": 0,
            "explanation": "«Perdón, no hablo alemán y no entiendo nada» — точное построение отрицания."
        },
        "shortText": {
            "title": "Las vacaciones tranquilas de Sara",
            "text": "Sara no trabaja durante el mes de agosto. No viaja a otros países este año porque prefiere descansar en su casa de campo. En el pueblo no hay mucho ruido ni tráfico; no hay nadie en las calles a las tres de la tarde por el calor. Sara no usa el teléfono móvil durante el día y no tiene prisa para nada. Vive un verano muy tranquilo.",
            "questions": [
                {
                    "question": "¿Por qué Sara no trabaja en agosto?",
                    "options": ["Porque está enferma", "Porque tiene vacaciones", "Porque no tiene trabajo", "Porque viaja"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Sara no trabaja durante el mes de agosto... prefiere descansar»."
                },
                {
                    "question": "¿Por qué no hay nadie en las calles a las tres de la tarde?",
                    "options": ["Por la lluvia", "Por el frío", "Por el calor", "Por una fiesta"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «no hay nadie en las calles a las tres de la tarde por el calor»."
                },
                {
                    "question": "¿Qué no usa Sara durante el día?",
                    "options": ["El reloj", "El teléfono móvil", "El coche", "Las gafas"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Sara no usa el teléfono móvil durante el día...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Что я НЕ делаю в свой выходной день (отрицательные предложения)",
            "prompt": "Напишите короткий текст (4-5 предложений) о том, чего вы НЕ делаете по выходным:\n1. Напишите, что вы не работаете и не встаете рано (Los domingos no trabajo, no me levanto temprano...).\n2. Напишите, что вы не пользуетесь компьютером или не смотрите ТВ (No uso el ordenador...).\n3. Используйте двойное отрицание с «nada» или «nunca» (No hago nada difícil, nunca tengo prisa...).\n4. Используйте слово «tampoco» (Mi familia tampoco madruga...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Структура отрицания (no + глагол)", "points": 35, "description": "Безошибочное расположение частицы «no» прямо перед спрягаемыми глаголами."},
                    {"name": "Отрицательные слова и двойное отрицание", "points": 30, "description": "Корректное использование nada, nadie, nunca, tampoco."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Связно описан выходной день с точки зрения отсутствия рутины."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 18: Question formation (¿...?)
    # ----------------------------------------------------
    18: {
        "id": 18,
        "topicName": "Question formation (¿...?)",
        "russianTitle": "Вопросительные предложения и вопросительные слова (¿...?)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u05-actions",
        "icon": "❓",
        "summary": "Как задавать вопросы в испанском языке: пунктуация с перевернутым вопросительным знаком в начале (¿?), интонация в общих вопросах (да/нет) и специальные вопросительные слова с обязательным графическим ударением (qué, quién, dónde, cuándo, cómo, cuánto, por qué).",
        "mnemonicRule": "Все вопросительные слова ВСЕГДА пишутся с тильдой: ¿Qué? ¿Quién? ¿Dónde? ¿Cuándo? ¿Cómo? ¿Cuánto? ¿Por qué? В начале вопроса всегда ставится перевернутый знак ¿.",
        "goalsRu": [
            "Ставить открывающий перевернутый вопросительный знак «¿» в начале вопроса",
            "Задавать общие вопросы с помощью вопросительной интонации и инверсии",
            "Безошибочно использовать все ключевые вопросительные слова с графическим ударением",
            "Различать «¿por qué?» (почему? раздельно с ударением) и «porque» (потому что, слитно без ударения)"
        ],
        "sections": [
            {
                "title": "1. Специальные вопросительные слова (всегда с тильдой!)",
                "content": "В испанском языке вопросительные слова обязательно несут графическое ударение, чтобы отличаться от союзов и относительных местоимений:",
                "tables": [
                    {
                        "headers": ["Вопросительное слово", "Русский перевод", "Пример вопроса", "Пример ответа"],
                        "rows": [
                            ["¿Qué?", "Что? / Какой?", "¿Qué estudias?", "Estudio español."],
                            ["¿Quién? / ¿Quiénes?", "Кто? (ед./мн.)", "¿Quién es esa chica?", "Es mi hermana."],
                            ["¿Dónde?", "Где?", "¿Dónde está el hotel?", "Está en el centro."],
                            ["¿Adónde?", "Куда? (направление)", "¿Adónde vas?", "Voy al parque."],
                            ["¿De dónde?", "Откуда?", "¿De dónde eres?", "Soy de México."],
                            ["¿Cuándo?", "Когда?", "¿Cuándo empieza la clase?", "A las nueve."],
                            ["¿Cómo?", "Как?", "¿Cómo te llamas?", "Me llamo Alex."],
                            ["¿Cuánto/a/os/as?", "Сколько?", "¿Cuánto cuesta?", "Cuesta diez euros."],
                            ["¿Por qué?", "Почему? / Зачем?", "¿Por qué estudias español?", "Porque me gusta."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Разница между ¿Por qué? и Porque",
                "content": "Обратите внимание на орфографию:",
                "tables": [
                    {
                        "headers": ["Форма", "Написание", "Значение", "Пример"],
                        "rows": [
                            ["Вопрос", "¿Por qué? (раздельно с тильдой)", "Почему?", "¿Por qué aprendes español?"],
                            ["Ответ", "Porque (слитно без тильды)", "Потому что...", "Porque quiero viajar a España."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "¿Cómo te llamas y de dónde eres?", "ru": "Как тебя зовут и откуда ты?"},
            {"es": "¿Dónde está la parada de autobús más cercana?", "ru": "Где находится ближайшая автобусная остановка?"},
            {"es": "¿Qué hora es, por favor?", "ru": "Который час, пожалуйста?"},
            {"es": "¿Cuándo tienes el examen de español?", "ru": "Когда у тебя экзамен по испанскому?"},
            {"es": "¿Quién es el profesor de la clase?", "ru": "Кто преподаватель этого урока?"},
            {"es": "¿Cuánto cuesta un café con leche?", "ru": "Сколько стоит кофе с молоком?"},
            {"es": "¿Cuántos años tienes?", "ru": "Сколько тебе лет?"},
            {"es": "¿Por qué estudias en la biblioteca?", "ru": "Почему ты занимаешься в библиотеке?"},
            {"es": "¿Hablas español con tus compañeros?", "ru": "Ты говоришь по-испански с одногруппниками? (общий вопрос)"},
            {"es": "¿Adónde van ustedes este fin de semana?", "ru": "Куда вы едете в эти выходные?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "Пропуск перевернутого знака «¿» в начале вопроса",
                "correction": "¿Cómo estás? (с открывающим знаком ¿)",
                "explanation": "В испанской пунктуации вопрос ВСЕГДА открывается перевернутым знаком ¿."
            },
            {
                "mistake": "Написание вопросительных слов без тильды: «Donde vives» вместо «¿Dónde vives?»",
                "correction": "¿Dónde vives? / ¿Qué haces?",
                "explanation": "Вопросительные слова в вопросах ВСЕГДА пишутся с графическим ударением."
            },
            {
                "mistake": "Путаница между «¿Por qué?» (почему) и «porque» (потому что)",
                "correction": "¿Por qué estudias? — Porque es útil.",
                "explanation": "Вопрос пишется в два слова с тильдой (¿Por qué?), а ответ — в одно слово без тильды (Porque...)."
            }
        ],
        "trapAlert": "Все вопросительные слова (¿Qué? ¿Dónde? ¿Cuándo? ¿Quién? ¿Cómo? ¿Cuánto? ¿Por qué?) ОБЯЗАТЕЛЬНО пишутся с ТИЛЬДОЙ!",
        "dialectNote": "В разговорной речи в конце утверждения часто добавляют короткие вопросительные «хвостики» для подтверждения: «¿verdad?», «¿no?», «¿cierto?» («Hablas español, ¿verdad?» = Ты говоришь по-испански, правда?).",
        "quiz": [
            {
                "question": "Какое вопросительное слово означает «где»?",
                "type": "recognition",
                "options": ["¿Qué?", "¿Dónde?", "¿Cuándo?", "¿Quién?"],
                "correctIndex": 1,
                "explanations": [
                    "¿Qué? = Что / Какой.",
                    "Правильно: «¿Dónde?» = Где.",
                    "¿Cuándo? = Когда.",
                    "¿Quién? = Кто."
                ]
            },
            {
                "question": "Какое вопросительное слово означает «когда»?",
                "type": "recognition",
                "options": ["¿Cómo?", "¿Cuándo?", "¿Cuánto?", "¿Por qué?"],
                "correctIndex": 1,
                "explanations": [
                    "¿Cómo? = Как.",
                    "Правильно: «¿Cuándo?» = Когда.",
                    "¿Cuánto? = Сколько.",
                    "¿Por qué? = Почему."
                ]
            },
            {
                "question": "Какой знак препинания ОБЯЗАТЕЛЬНО ставится в начале вопроса на испанском языке?",
                "type": "recognition",
                "options": ["!", "¿", "¡", "?"],
                "correctIndex": 1,
                "explanations": [
                    "! — восклицательный знак.",
                    "Правильно: «¿» — открывающий перевернутый вопросительный знак.",
                    "¡ — открывающий восклицательный знак.",
                    "? — закрывающий вопросительный знак в конце."
                ]
            },
            {
                "question": "Как пишется слово «почему» в вопросительном предложении?",
                "type": "recognition",
                "options": ["Porque", "¿Por qué?", "¿Por que?", "Porqué"],
                "correctIndex": 1,
                "explanations": [
                    "«Porque» — ответ «потому что».",
                    "Правильно: вопрос «¿Por qué?» пишется раздельно с тильдой над -é-.",
                    "Без тильды неверно.",
                    "«El porqué» — существительное «причина»."
                ]
            },
            {
                "question": "Вставьте вопросительное слово: «¿____ es el director del hospital?» (Кто...)",
                "type": "application",
                "options": ["Qué", "Quién", "Dónde", "Cuándo"],
                "correctIndex": 1,
                "explanations": [
                    "Qué спрашивает о предметах/профессиях в общем.",
                    "Правильно: «¿Quién es...?» спрашивает о конкретном человеке («Кто директор?»).",
                    "Dónde = где.",
                    "Cuándo = когда."
                ]
            },
            {
                "question": "Вставьте вопросительное слово: «¿____ cuesta este libro de español?»",
                "type": "application",
                "options": ["Cuánto", "Cómo", "Dónde", "Quién"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Cuánto cuesta...?» — стандартный вопрос о стоимости (Сколько стоит?).",
                    "Cómo = как.",
                    "Dónde = где.",
                    "Quién = кто."
                ]
            },
            {
                "question": "Вставьте вопросительное слово: «¿____ vas de vacaciones, a la playa o a la montaña?»",
                "type": "application",
                "options": ["Adónde", "De dónde", "Cuándo", "Quién"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Adónde vas...?» спрашивает о направлении движения (Куда ты едешь?).",
                    "De dónde = откуда.",
                    "Cuándo = когда.",
                    "Quién = кто."
                ]
            },
            {
                "question": "Выберите правильный вопрос о причине:",
                "type": "application",
                "options": [
                    "¿Por qué estudias español? — Porque me gusta mucho.",
                    "¿Porque estudias español? — Por qué me gusta mucho.",
                    "¿Por que estudias español? — Porque me gusta mucho.",
                    "¿Porqué estudias español? — Porque me gusta mucho."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: вопрос «¿Por qué?», ответ «Porque...».",
                    "Перепутано написание вопроса и ответа.",
                    "Пропущена тильда в вопросе.",
                    "Слитное написание в вопросе ошибочно."
                ]
            },
            {
                "question": "Вам нужно спросить дорогу на вокзал у прохожего. Какой вопрос правильный?",
                "type": "transfer",
                "options": [
                    "Disculpe, ¿dónde está la estación de tren?",
                    "Disculpe, ¿qué está la estación de tren?",
                    "Disculpe, ¿cuándo es la estación de tren?",
                    "Disculpe, ¿quién está la estación de tren?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Dónde está la estación...?» (Где находится вокзал?).",
                    "Qué = что.",
                    "Cuándo = когда.",
                    "Quién = кто."
                ]
            },
            {
                "question": "Как спросить у нового знакомого: «Сколько тебе лет и откуда ты?»?",
                "type": "transfer",
                "options": [
                    "¿Cuántos años tienes y de dónde eres?",
                    "¿Qué años tienes y dónde estás?",
                    "¿Cómo años tienes y por qué eres?",
                    "¿Cuánto años eres y adónde vives?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Cuántos años tienes y de dónde eres?» (возраст с cuántos años tienes + происхождение с de dónde eres).",
                    "Qué años — калька.",
                    "Cómo años — бессмысленно.",
                    "Несогласованно."
                ]
            },
            {
                "question": "Вам звонят в дверь. Как спросить «Кто там?» изнутри квартиры?",
                "type": "transfer",
                "options": ["¿Quién es?", "¿Qué es?", "¿Dónde es?", "¿Cómo es?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Quién es?» — стандартный вопрос «Кто там / Кто это?».",
                    "«¿Qué es?» значит «Что это за предмет?».",
                    "«¿Dónde es?» — «Где это происходит?».",
                    "«¿Cómo es?» — «Какой он по внешности/характеру?»."
                ]
            },
            {
                "question": "Как задать вопрос в ресторане о составе блюда: «Что в этом салате?»?",
                "type": "transfer",
                "options": [
                    "¿Qué lleva esta ensalada?",
                    "¿Quién lleva esta ensalada?",
                    "¿Dónde lleva esta ensalada?",
                    "¿Cuándo lleva esta ensalada?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Qué lleva esta ensalada?» (глагол llevar используется для ингредиентов блюд).",
                    "Quién относится к людям.",
                    "Dónde = где.",
                    "Cuándo = когда."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-18-01",
                "type": "choice",
                "question": "Какое вопросительное слово спрашивает о месте: «¿____ está el museo?»?",
                "options": ["Dónde", "Qué", "Quién", "Cuándo"],
                "correctAnswer": "Dónde",
                "explanation": "¿Dónde está el museo?"
            },
            {
                "id": "ex-18-02",
                "type": "gap",
                "question": "¿____ (как) te llamas tú?",
                "correctAnswer": "Cómo",
                "acceptableAnswers": ["Cómo", "cómo", "Como"],
                "explanation": "¿Cómo te llamas?"
            },
            {
                "id": "ex-18-03",
                "type": "tiles",
                "question": "Соберите вопрос: «Где находится станция метро?»",
                "tiles": ["¿Dónde", "está", "la", "estación", "de", "metro?"],
                "correctAnswer": "¿Dónde está la estación de metro?",
                "explanation": "¿Dónde está la estación de metro?"
            },
            {
                "id": "ex-18-04",
                "type": "transformation",
                "question": "Преобразуйте утверждение в вопрос: «Hablas inglés» → «¿____?»",
                "prompt": "Hablas inglés → ____",
                "correctAnswer": "¿Hablas inglés?",
                "acceptableAnswers": ["¿Hablas inglés?", "¿Hablas ingles?", "Hablas inglés?"],
                "explanation": "¿Hablas inglés?"
            },
            {
                "id": "ex-18-05",
                "type": "input",
                "question": "Напишите вопросительное слово «что» (с тильдой):",
                "correctAnswer": "Qué",
                "acceptableAnswers": ["Qué", "qué", "que", "Que"],
                "explanation": "Qué."
            },
            {
                "id": "ex-18-06",
                "type": "gap",
                "question": "¿____ (сколько) cuesta un billete de autobús?",
                "correctAnswer": "Cuánto",
                "acceptableAnswers": ["Cuánto", "cuánto", "Cuanto"],
                "explanation": "¿Cuánto cuesta?"
            },
            {
                "id": "ex-18-07",
                "type": "choice",
                "question": "Какое вопросительное слово спрашивает о времени наступления события?",
                "options": ["Cuándo", "Dónde", "Quién", "Cómo"],
                "correctAnswer": "Cuándo",
                "explanation": "¿Cuándo? = когда."
            },
            {
                "id": "ex-18-08",
                "type": "input",
                "question": "Напишите вопросительное слово «кто» (с тильдой):",
                "correctAnswer": "Quién",
                "acceptableAnswers": ["Quién", "quién", "Quien", "quien"],
                "explanation": "Quién."
            },
            {
                "id": "ex-18-09",
                "type": "transformation",
                "question": "Поставьте вопрос о происхождении: «Soy de México» → «¿De ____ eres?»",
                "prompt": "De ____ eres → ____",
                "correctAnswer": "dónde",
                "acceptableAnswers": ["dónde", "donde", "Dónde"],
                "explanation": "¿De dónde eres?"
            },
            {
                "id": "ex-18-10",
                "type": "tiles",
                "question": "Соберите вопрос: «Сколько тебе лет?»",
                "tiles": ["¿Cuántos", "años", "tienes", "tú?"],
                "correctAnswer": "¿Cuántos años tienes tú?",
                "explanation": "¿Cuántos años tienes tú?"
            },
            {
                "id": "ex-18-11",
                "type": "gap",
                "question": "¿____ (почему) estudias español todos los días?",
                "correctAnswer": "Por qué",
                "acceptableAnswers": ["Por qué", "por qué", "Por que", "por que"],
                "explanation": "¿Por qué?"
            },
            {
                "id": "ex-18-12",
                "type": "choice",
                "question": "Как ответить на вопрос «¿Por qué estudias español?»?",
                "options": ["Porque me gusta mucho.", "¿Por qué me gusta mucho?", "Porqué me gusta.", "Por que me gusta."],
                "correctAnswer": "Porque me gusta mucho.",
                "explanation": "Ответ пишется слитно: «Porque me gusta mucho»."
            },
            {
                "id": "ex-18-13",
                "type": "input",
                "question": "Напишите вопросительное слово «где / куда» (с тильдой):",
                "correctAnswer": "Dónde",
                "acceptableAnswers": ["Dónde", "dónde", "Donde", "donde"],
                "explanation": "Dónde."
            },
            {
                "id": "ex-18-14",
                "type": "transformation",
                "question": "Сформулируйте вопрос к подчеркнутому слову: «La clase empieza a las 9» → «¿____ empieza la clase?»",
                "prompt": "a las 9 → ¿____?",
                "correctAnswer": "Cuándo",
                "acceptableAnswers": ["Cuándo", "cuándo", "A qué hora", "a qué hora"],
                "explanation": "¿Cuándo / ¿A qué hora empieza la clase?"
            },
            {
                "id": "ex-18-15",
                "type": "tiles",
                "question": "Соберите вопрос: «Куда ты идешь сейчас?»",
                "tiles": ["¿Adónde", "vas", "tú", "ahora?"],
                "correctAnswer": "¿Adónde vas tú ahora?",
                "explanation": "¿Adónde vas tú ahora?"
            },
            {
                "id": "ex-18-16",
                "type": "gap",
                "question": "¿____ (кто) es esa mujer que habla con el profesor?",
                "correctAnswer": "Quién",
                "acceptableAnswers": ["Quién", "quién", "Quien"],
                "explanation": "¿Quién es?"
            },
            {
                "id": "ex-18-17",
                "type": "choice",
                "question": "Какое вопросительное слово согласовано по женскому роду: «¿____ hermanas tienes?»?",
                "options": ["Cuántas", "Cuántos", "Cuánto", "Cuánta"],
                "correctAnswer": "Cuántas",
                "explanation": "Hermanas (жен. род мн. число) → ¿Cuántas hermanas?"
            },
            {
                "id": "ex-18-18",
                "type": "input",
                "question": "Напишите вопросительное слово «как» (с тильдой):",
                "correctAnswer": "Cómo",
                "acceptableAnswers": ["Cómo", "cómo", "Como", "como"],
                "explanation": "Cómo."
            },
            {
                "id": "ex-18-19",
                "type": "gap",
                "question": "¿____ (что) hora es, por favor?",
                "correctAnswer": "Qué",
                "acceptableAnswers": ["Qué", "qué", "Que"],
                "explanation": "¿Qué hora es?"
            },
            {
                "id": "ex-18-20",
                "type": "tiles",
                "question": "Соберите вопрос: «Почему ты не работаешь сегодня?»",
                "tiles": ["¿Por", "qué", "no", "trabajas", "hoy?"],
                "correctAnswer": "¿Por qué no trabajas hoy?",
                "explanation": "¿Por qué no trabajas hoy?"
            },
            {
                "id": "ex-18-21",
                "type": "choice",
                "question": "Как спросить собеседника о его самочувствии?",
                "options": ["¿Cómo estás?", "¿Qué estás?", "¿Dónde estás?", "¿Quién estás?"],
                "correctAnswer": "¿Cómo estás?",
                "explanation": "¿Cómo estás?"
            },
            {
                "id": "ex-18-22",
                "type": "transformation",
                "question": "Сформулируйте вопрос о стоимости: «Cuesta 15 euros» → «¿____ cuesta?»",
                "prompt": "15 euros → ¿____?",
                "correctAnswer": "Cuánto",
                "acceptableAnswers": ["Cuánto", "cuánto", "Cuanto"],
                "explanation": "¿Cuánto cuesta?"
            },
            {
                "id": "ex-18-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет вопросительное слово, отрицание и глагол на -ar?",
                "options": [
                    "¿Por qué no estudias español los fines de semana?",
                    "¿Por que estudias no español los fines de semana?",
                    "¿Porque no estudias español?",
                    "¿Por qué no tú estudiar español?"
                ],
                "correctAnswer": "¿Por qué no estudias español los fines de semana?",
                "explanation": "¿Por qué (вопрос) + no estudias (отрицание перед глаголом на -ar) + los fines de semana."
            },
            {
                "id": "ex-18-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Где живет твоя семья?» (с вопросительными знаками):",
                "correctAnswer": "¿Dónde vive tu familia?",
                "acceptableAnswers": [
                    "¿Dónde vive tu familia?",
                    "¿Donde vive tu familia?",
                    "Dónde vive tu familia?",
                    "Donde vive tu familia?"
                ],
                "explanation": "¿Dónde vive tu familia?"
            }
        ],
        "miniScenario": {
            "title": "Интервью с новым студентом",
            "setting": "Языковой клуб в Мадриде.",
            "situation": "Вы проводите короткое мини-интервью с новым участником разговорного клуба.",
            "dialog": [
                {"speaker": "Tú", "text": "¡Hola! Bienvenido. ¿Cómo te llamas y de dónde eres?"},
                {"speaker": "Estudiante", "text": "¡Hola! Me llamo Marco y soy de Milán, Italia."},
                {"speaker": "Tú", "text": "¿Por qué estudias español?"},
                {"speaker": "Estudiante", "text": "Porque trabajo en una empresa internacional y me encanta el idioma."}
            ],
            "task": "Задайте собеседнику вопросы об имени, происхождении и причине изучения языка.",
            "prompt": "Как спросить: «Как тебя зовут и почему ты учишь испанский?»?",
            "options": [
                "¿Cómo te llamas y por qué estudias español?",
                "¿Qué te llamas y porque estudias español?",
                "¿Quién te llamas y dónde estudias español?",
                "¿Cuándo te llamas y cómo estudias español?"
            ],
            "correctIndex": 0,
            "explanation": "«¿Cómo te llamas y por qué estudias español?» — правильные вопросительные слова с тильдами."
        },
        "shortText": {
            "title": "Las preguntas de la entrevista",
            "text": "Hoy en la escuela de idiomas los estudiantes hacen un juego de preguntas en parejas. Alex le pregunta a Sofía: «¿Dónde vives? ¿A qué hora te levantas por la mañana? ¿Por qué estudias español?». Sofía le responde con una sonrisa: «Vivo cerca del centro, me levanto a las siete y estudio español porque quiero viajar por toda América Latina». El profesor felicita a la pareja por su fluidez.",
            "questions": [
                {
                    "question": "¿Qué pregunta le hace Alex a Sofía sobre su rutina matutina?",
                    "options": ["¿Qué desayunas?", "¿A qué hora te levantas por la mañana?", "¿Con quién vives?", "¿Dónde trabajas?"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «¿A qué hora te levantas por la mañana?»."
                },
                {
                    "question": "¿Por qué estudia español Sofía?",
                    "options": ["Porque es obligatorio", "Porque quiere viajar por toda América Latina", "Para ver películas", "Porque vive en Roma"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «estudio español porque quiero viajar por toda América Latina»."
                },
                {
                    "question": "¿Qué palabra se usa en el texto para responder a «¿Por qué...?»?",
                    "options": ["Por qué", "Porque", "Porqué", "Por que"],
                    "correctIndex": 1,
                    "explanation": "В тексте ответ оформлен словом «porque» (слитно без тильды)."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Анкета из 5 вопросов для испаноязычного друга",
            "prompt": "Составьте опросник из 5 вопросов для знакомства с новым испаноязычным другом:\n1. Спросите имя и происхождение (¿Cómo...?, ¿De dónde...?).\n2. Спросите о возрасте (¿Cuántos años...?).\n3. Спросите о месте работы или учебы (¿Dónde...?).\n4. Спросите о причине изучения испанского или интересах (¿Por qué...?).\n5. Обязательно используйте перевернутые знаки ¿? и тильды над вопросительными словами.",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Вопросительные слова с графическим ударением", "points": 35, "description": "Безошибочное использование qué, quién, dónde, cuándo, cómo, cuánto, por qué с тильдами."},
                    {"name": "Пунктуация вопросительных предложений", "points": 30, "description": "Использование открывающих знаков «¿» и закрывающих «?»."},
                    {"name": "Грамматическая структура вопросов", "points": 20, "description": "Правильный порядок слов и согласование глаголов."},
                    {"name": "Разнообразие типов вопросов", "points": 15, "description": "Использование минимум 4 различных вопросительных слов."}
                ]
            }
        }
    }
}
