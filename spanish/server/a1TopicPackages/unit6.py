# -*- coding: utf-8 -*-
"""Unit 6: Календарь и время (Topics 22, 28, 14)"""

unit6_topics = {
    # ----------------------------------------------------
    # TOPIC 22: Days, months, seasons
    # ----------------------------------------------------
    22: {
        "id": 22,
        "topicName": "Days, months, seasons",
        "russianTitle": "Дни недели, месяцы и времена года (días, meses, estaciones)",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u06-calendar",
        "icon": "📅",
        "summary": "Названия 7 дней недели, 12 месяцев и 4 времен года на испанском языке. Особенности: дни недели и месяцы пишутся со строчной (маленькой) буквы. Дни недели мужского рода и используются с артиклем «el / los» («по понедельникам» = «los lunes»).",
        "mnemonicRule": "В испанском «в понедельник» = «EL lunes» (НЕ «en lunes»!). «По понедельникам» = «LOS lunes». Месяцы и дни пишутся со строчной буквы.",
        "goalsRu": [
            "Знать и правильно произносить все 7 дней недели, 12 месяцев и 4 времени года",
            "Использовать артикль «el» для выражения конкретного дня («el lunes») и «los» для регулярного действия («los lunes»)",
            "Называть даты: «Hoy es 15 de mayo de 2024»",
            "Использовать предлог «en» с месяцами и сезонами: «en verano», «en agosto»"
        ],
        "sections": [
            {
                "title": "1. Дни недели (Los días de la semana)",
                "content": "Все дни недели мужского рода. Дни с понедельника по пятницу оканчиваются на -s и не меняются во множественном числе:",
                "tables": [
                    {
                        "headers": ["День недели", "С артиклем el (в этот день)", "С артиклем los (по этим дням)", "Русский перевод"],
                        "rows": [
                            ["lunes", "el lunes", "los lunes", "понедельник / в понедельник / по понедельникам"],
                            ["martes", "el martes", "los martes", "вторник / во вторник / по вторникам"],
                            ["miércoles", "el miércoles", "los miércoles", "среда / в среду / по средам"],
                            ["jueves", "el jueves", "los jueves", "четверг / в четверг / по четвергам"],
                            ["viernes", "el viernes", "los viernes", "пятница / в пятницу / по пятницам"],
                            ["sábado", "el sábado", "los sábados (+s)", "суббота / в субботу / по субботам"],
                            ["domingo", "el domingo", "los domingos (+s)", "воскресенье / в воскресенье / по воскресеньям"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Месяцы (Los meses del año) и Времена года (Las estaciones)",
                "content": "С месяцами и временами года используется предлог «en» (en enero, en primavera):",
                "tables": [
                    {
                        "headers": ["Сезон (Estación)", "Месяцы (Meses)", "Русский перевод"],
                        "rows": [
                            ["la primavera (весна)", "marzo, abril, mayo", "март, апрель, май"],
                            ["el verano (лето)", "junio, julio, agosto", "июнь, июль, август"],
                            ["el otoño (осень)", "septiembre, octubre, noviembre", "сентябрь, октябрь, ноябрь"],
                            ["el invierno (зима)", "diciembre, enero, febrero", "декабрь, январь, февраль"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "El lunes tengo clase de español a las diez.", "ru": "В понедельник у меня урок испанского в десять."},
            {"es": "Los fines de semana descanso con mi familia.", "ru": "По выходным я отдыхаю с семьей."},
            {"es": "Hoy es viernes quince de marzo.", "ru": "Сегодня пятница, пятнадцатое марта."},
            {"es": "Mi cumpleaños es en agosto, en pleno verano.", "ru": "Мой день рождения в августе, в разгар лета."},
            {"es": "En invierno hace mucho frío en Madrid.", "ru": "Зимой в Мадриде очень холодно."},
            {"es": "La primavera es mi estación favorita porque hay flores.", "ru": "Весна — мое любимое время года, потому что цветут цветы."},
            {"es": "Los martes y los jueves voy al gimnasio.", "ru": "По вторникам и четвергам я хожу в спортзал."},
            {"es": "En otoño las hojas de los árboles caen al suelo.", "ru": "Осенью листья деревьев падают на землю."},
            {"es": "¿Qué día es hoy? —Hoy es miércoles.", "ru": "Какой сегодня день? —Сегодня среда."},
            {"es": "Las vacaciones de verano empiezan en julio.", "ru": "Летние каникулы начинаются в июле."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«En lunes voy al cine» (калька с английского/русского)",
                "correction": "El lunes voy al cine (с артиклем el, без предлога en)",
                "explanation": "В испанском языке с днями недели используется только артикль «el / los», предлог «en» перед днем недели ЗАПРЕЩЕН."
            },
            {
                "mistake": "Написание дней и месяцев с заглавной буквы («Lunes», «Marzo»)",
                "correction": "lunes / marzo / verano (со строчной буквы)",
                "explanation": "В испанском дни недели, месяцы и времена года пишутся с маленькой буквы (если не стоят в самом начале предложения)."
            },
            {
                "mistake": "«Los luneses» во множественном числе",
                "correction": "los lunes / los martes / los viernes",
                "explanation": "Дни недели на -s не меняют форму во множественном числе, меняется только артикль (el lunes → los lunes)."
            }
        ],
        "trapAlert": "«В понедельник» = «EL lunes» (НЕ «en lunes»)! «По пятницам» = «LOS viernes»!",
        "dialectNote": "В испаноязычном календаре первым днем недели ВСЕГДА считается понедельник (lunes), а воскресенье (domingo) — седьмой день.",
        "quiz": [
            {
                "question": "Как сказать по-испански «в пятницу»?",
                "type": "recognition",
                "options": ["En viernes", "El viernes", "A viernes", "Por viernes"],
                "correctIndex": 1,
                "explanations": [
                    "«En viernes» — грубая калька.",
                    "Правильно: «El viernes» (артикль мужского рода без предлога).",
                    "A viernes — ошибка.",
                    "Por viernes — ошибка."
                ]
            },
            {
                "question": "Как сказать «по воскресеньям» (регулярное действие)?",
                "type": "recognition",
                "options": ["El domingo", "Los domingos", "En domingos", "Por los domingos"],
                "correctIndex": 1,
                "explanations": [
                    "El domingo означает «в это конкретное воскресенье».",
                    "Правильно: «Los domingos» выражает регулярность по воскресеньям.",
                    "En domingos — ошибка.",
                    "Por los domingos — ошибка."
                ]
            },
            {
                "question": "Какое время года следует за зимой (el invierno)?",
                "type": "recognition",
                "options": ["El verano", "El otoño", "La primavera", "El enero"],
                "correctIndex": 2,
                "explanations": [
                    "Лето идет после весны.",
                    "Осень идет после лета.",
                    "Правильно: за зимой следует весна («la primavera»).",
                    "Enero — месяц."
                ]
            },
            {
                "question": "С какой буквы (заглавной или строчной) пишутся дни недели и месяцы в испанском языке?",
                "type": "recognition",
                "options": ["Всегда с заглавной", "Всегда со строчной (маленькой)", "Только месяцы с заглавной", "Как в английском языке"],
                "correctIndex": 1,
                "explanations": [
                    "Ошибка.",
                    "Правильно: со строчной буквы (lunes, martes, enero, febrero...), за исключением начала предложения.",
                    "Ошибка.",
                    "В английском с заглавной, а в испанском — со строчной."
                ]
            },
            {
                "question": "Вставьте предлог или артикль: «Mi cumpleaños es ____ mayo.»",
                "type": "application",
                "options": ["el", "en", "a", "de"],
                "correctIndex": 1,
                "explanations": [
                    "«El mayo» ошибочно без даты.",
                    "Правильно: с месяцами используется предлог «en» («en mayo»).",
                    "«A mayo» — ошибка.",
                    "«De mayo» используется после конкретного числа (15 de mayo)."
                ]
            },
            {
                "question": "Вставьте правильную форму: «____ (по вторникам) tengo clase de salsa.»",
                "type": "application",
                "options": ["En martes", "El martes", "Los martes", "Los marteses"],
                "correctIndex": 2,
                "explanations": [
                    "En martes — калька.",
                    "El martes — в один конкретный вторник.",
                    "Правильно: «Los martes» (регулярно по вторникам).",
                    "Формы marteses не существует."
                ]
            },
            {
                "question": "Как правильно назвать дату «12 октября»?",
                "type": "application",
                "options": ["El doce de octubre", "El doce octubre", "En doce de octubre", "Doce en octubre"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «El doce de octubre» (el + число + de + месяц).",
                    "Пропущен обязательный предлог «de».",
                    "Предлог «en» перед числом даты не ставится.",
                    "Неверный порядок."
                ]
            },
            {
                "question": "Какой месяц является седьмым месяцем года?",
                "type": "application",
                "options": ["Junio", "Julio", "Agosto", "Septiembre"],
                "correctIndex": 1,
                "explanations": [
                    "Junio — 6-й месяц (июнь).",
                    "Правильно: «Julio» — 7-й месяц (июль).",
                    "Agosto — 8-й месяц (август).",
                    "Septiembre — 9-й месяц (сентябрь)."
                ]
            },
            {
                "question": "Вы договариваетесь о встрече с коллегой на четверг. Что сказать?",
                "type": "transfer",
                "options": [
                    "Nos vemos el jueves a las cinco.",
                    "Nos vemos en jueves a las cinco.",
                    "Nos vemos los jueves a las cinco.",
                    "Nos vemos de jueves a las cinco."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Nos vemos el jueves» (в четверг).",
                    "«En jueves» — калька с русского.",
                    "«Los jueves» значило бы «по четвергам регулярно».",
                    "«De jueves» — ошибка."
                ]
            },
            {
                "question": "Как сказать, что в Испании в августе очень жарко?",
                "type": "transfer",
                "options": [
                    "En agosto hace mucho calor en España.",
                    "El agosto es mucho calor en España.",
                    "A agosto está calor en España.",
                    "Por agosto tiene calor España."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «En agosto hace mucho calor...» (предлог en с месяцем + погода hace calor).",
                    "«El agosto es» — ошибка.",
                    "«A agosto» — ошибка.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Какое время года в Испании длится с декабря по февраль?",
                "type": "transfer",
                "options": ["El verano", "El invierno", "La primavera", "El otoño"],
                "correctIndex": 1,
                "explanations": [
                    "Verano — лето.",
                    "Правильно: «El invierno» — зима (декабрь, январь, февраль).",
                    "Primavera — весна.",
                    "Otoño — осень."
                ]
            },
            {
                "question": "Как ответить на вопрос «¿Cuándo son tus vacaciones?» (в июле):",
                "type": "transfer",
                "options": [
                    "Mis vacaciones son en julio.",
                    "Mis vacaciones son el julio.",
                    "Mis vacaciones están a julio.",
                    "Mis vacaciones tienen julio."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «en julio» (предлог en с месяцем).",
                    "«El julio» ошибочно без даты.",
                    "Глагол estar и предлог a ошибочны.",
                    "Бессмысленно."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-22-01",
                "type": "choice",
                "question": "Какой первый день недели в испаноязычном календаре?",
                "options": ["lunes", "domingo", "sábado", "martes"],
                "correctAnswer": "lunes",
                "explanation": "lunes = понедельник."
            },
            {
                "id": "ex-22-02",
                "type": "gap",
                "question": "____ (в субботу) voy al mercado a comprar fruta.",
                "correctAnswer": "El sábado",
                "acceptableAnswers": ["El sábado", "El sabado", "el sábado", "el sabado"],
                "explanation": "El sábado."
            },
            {
                "id": "ex-22-03",
                "type": "tiles",
                "question": "Соберите фразу: «По воскресеньям мы обедаем с семьей.»",
                "tiles": ["Los", "domingos", "comemos", "con", "la", "familia."],
                "correctAnswer": "Los domingos comemos con la familia.",
                "explanation": "Los domingos comemos con la familia."
            },
            {
                "id": "ex-22-04",
                "type": "transformation",
                "question": "Преобразуйте день недели во множественное число (регулярность): «el martes» → «____»",
                "prompt": "el martes → ____",
                "correctAnswer": "los martes",
                "acceptableAnswers": ["los martes", "Los martes"],
                "explanation": "el martes → los martes."
            },
            {
                "id": "ex-22-05",
                "type": "input",
                "question": "Напишите по-испански название месяца «январь»:",
                "correctAnswer": "enero",
                "acceptableAnswers": ["enero", "Enero"],
                "explanation": "enero."
            },
            {
                "id": "ex-22-06",
                "type": "gap",
                "question": "En ____ (лето) vamos a la playa todos los días.",
                "correctAnswer": "verano",
                "acceptableAnswers": ["verano", "el verano", "Verano"],
                "explanation": "en verano / en el verano."
            },
            {
                "id": "ex-22-07",
                "type": "choice",
                "question": "Какой день идет после среды (miércoles)?",
                "options": ["jueves", "martes", "viernes", "sábado"],
                "correctAnswer": "jueves",
                "explanation": "jueves = четверг."
            },
            {
                "id": "ex-22-08",
                "type": "input",
                "question": "Напишите по-испански название сезона «весна» (с артиклем):",
                "correctAnswer": "la primavera",
                "acceptableAnswers": ["la primavera", "primavera", "La primavera"],
                "explanation": "la primavera."
            },
            {
                "id": "ex-22-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el sábado» → «____»",
                "prompt": "el sábado → ____",
                "correctAnswer": "los sábados",
                "acceptableAnswers": ["los sábados", "los sabados", "Los sábados"],
                "explanation": "los sábados."
            },
            {
                "id": "ex-22-10",
                "type": "tiles",
                "question": "Соберите предложение: «Сегодня пятница, двадцать первое марта.»",
                "tiles": ["Hoy", "es", "viernes", "veintiuno", "de", "marzo."],
                "correctAnswer": "Hoy es viernes veintiuno de marzo.",
                "explanation": "Hoy es viernes veintiuno de marzo."
            },
            {
                "id": "ex-22-11",
                "type": "gap",
                "question": "El invierno tiene tres meses: diciembre, ____ (январь) y febrero.",
                "correctAnswer": "enero",
                "acceptableAnswers": ["enero", "Enero"],
                "explanation": "enero."
            },
            {
                "id": "ex-22-12",
                "type": "choice",
                "question": "Какое время года наступает в сентябре?",
                "options": ["el otoño", "la primavera", "el verano", "el invierno"],
                "correctAnswer": "el otoño",
                "explanation": "el otoño = осень."
            },
            {
                "id": "ex-22-13",
                "type": "input",
                "question": "Напишите по-испански день недели «среда» (с тильдой):",
                "correctAnswer": "miércoles",
                "acceptableAnswers": ["miércoles", "miercoles", "Miércoles"],
                "explanation": "miércoles."
            },
            {
                "id": "ex-22-14",
                "type": "transformation",
                "question": "Преобразуйте «el viernes» во множественное число: «____»",
                "prompt": "el viernes → ____",
                "correctAnswer": "los viernes",
                "acceptableAnswers": ["los viernes", "Los viernes"],
                "explanation": "los viernes."
            },
            {
                "id": "ex-22-15",
                "type": "tiles",
                "question": "Соберите фразу: «В августе в Испании очень жарко.»",
                "tiles": ["En", "agosto", "hace", "mucho", "calor", "en", "España."],
                "correctAnswer": "En agosto hace mucho calor en España.",
                "explanation": "En agosto hace mucho calor en España."
            },
            {
                "id": "ex-22-16",
                "type": "gap",
                "question": "Mi cumpleaños es el cuatro de ____ (октябрь).",
                "correctAnswer": "octubre",
                "acceptableAnswers": ["octubre", "Octubre"],
                "explanation": "octubre."
            },
            {
                "id": "ex-22-17",
                "type": "choice",
                "question": "Какой месяц последний в году?",
                "options": ["diciembre", "noviembre", "enero", "agosto"],
                "correctAnswer": "diciembre",
                "explanation": "diciembre = декабрь."
            },
            {
                "id": "ex-22-18",
                "type": "input",
                "question": "Напишите по-испански день недели «четверг»:",
                "correctAnswer": "jueves",
                "acceptableAnswers": ["jueves", "Jueves"],
                "explanation": "jueves."
            },
            {
                "id": "ex-22-19",
                "type": "gap",
                "question": "Las clases empiezan en ____ (сентябрь).",
                "correctAnswer": "septiembre",
                "acceptableAnswers": ["septiembre", "Septiembre", "setiembre"],
                "explanation": "septiembre."
            },
            {
                "id": "ex-22-20",
                "type": "tiles",
                "question": "Соберите вопрос: «Какой сегодня день недели?»",
                "tiles": ["¿Qué", "día", "de", "la", "semana", "es", "hoy?"],
                "correctAnswer": "¿Qué día de la semana es hoy?",
                "explanation": "¿Qué día de la semana es hoy?"
            },
            {
                "id": "ex-22-21",
                "type": "choice",
                "question": "Как сказать «выходные дни» по-испански?",
                "options": ["el fin de semana", "los días libres", "la semana final", "el domingo solo"],
                "correctAnswer": "el fin de semana",
                "explanation": "el fin de semana = выходные."
            },
            {
                "id": "ex-22-22",
                "type": "transformation",
                "question": "Преобразуйте «el domingo» во множественное число: «____»",
                "prompt": "el domingo → ____",
                "correctAnswer": "los domingos",
                "acceptableAnswers": ["los domingos", "Los domingos"],
                "explanation": "los domingos."
            },
            {
                "id": "ex-22-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет дни недели, глаголы на -ar и отрицание?",
                "options": [
                    "Los domingos no trabajo y descanso con mi familia.",
                    "En domingos no trabajar y descanso con mi familia.",
                    "Los domingos trabajo no y estoy descanso.",
                    "El domingos no trabajo y soy descanso."
                ],
                "correctAnswer": "Los domingos no trabajo y descanso con mi familia.",
                "explanation": "Los domingos (по воскресеньям) + no trabajo (отрицание перед -ar) + descanso (отдыхаю)."
            },
            {
                "id": "ex-22-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «В понедельник я учу испанский в университете»:",
                "correctAnswer": "El lunes estudio español en la universidad",
                "acceptableAnswers": [
                    "El lunes estudio español en la universidad",
                    "El lunes estudio espanol en la universidad",
                    "el lunes estudio español en la universidad"
                ],
                "explanation": "El lunes estudio español en la universidad."
            }
        ],
        "miniScenario": {
            "title": "Согласование даты экзамена и занятий",
            "setting": "Деканат языковой школы в Севилье.",
            "situation": "Вы уточняете расписание занятий и дату финального экзамена у секретаря.",
            "dialog": [
                {"speaker": "Secretaria", "text": "¡Buenos días! Sus clases de español son los lunes y los miércoles por la tarde."},
                {"speaker": "Tú", "text": "Muchas gracias. ¿Y cuándo es el examen final?"},
                {"speaker": "Secretaria", "text": "El examen es el viernes veinte de junio a las diez de la mañana."},
                {"speaker": "Tú", "text": "Perfecto, muchas gracias por la información."}
            ],
            "task": "Спросите у секретаря, когда состоится экзамен.",
            "prompt": "Как спросить секретаря о дате экзамена?",
            "options": [
                "¿Cuándo es el examen final, por favor?",
                "¿Dónde es el examen final, de nada?",
                "¿Qué es el examen final?",
                "¿Cuánto cuesta el examen final?"
            ],
            "correctIndex": 0,
            "explanation": "«¿Cuándo es el examen final, por favor?» — точный вопрос о дате и времени."
        },
        "shortText": {
            "title": "Las cuatro estaciones en España",
            "text": "España es un país con cuatro estaciones bien diferenciadas. En primavera, los parques y campos se llenan de flores de muchos colores. En verano, especialmente en julio y agosto, hace mucho calor y la gente viaja a la playa. En otoño, en octubre y noviembre, llueve más y el clima es templado. En invierno, en enero y febrero, hace frío y nieva en las montañas.",
            "questions": [
                {
                    "question": "¿Cuáles son los meses más calurosos del verano en España?",
                    "options": ["Marzo y abril", "Julio y agosto", "Octubre y noviembre", "Enero y febrero"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «En verano, especialmente en julio y agosto, hace mucho calor...»."
                },
                {
                    "question": "¿Qué tiempo hace en las montañas en invierno?",
                    "options": ["Hace mucho calor", "Nieva y hace frío", "Hay flores", "No hay nubes"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «hace frío y nieva en las montañas»."
                },
                {
                    "question": "¿Qué preposición se usa en el texto delante de los meses y las estaciones?",
                    "options": ["A", "De", "En", "Por"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «En primavera», «En verano», «en julio», «En otoño», «En invierno»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Мое любимое время года и недельный график",
            "prompt": "Напишите короткий текст (4-5 предложений) о своем любимом сезоне и недельной рутине:\n1. Назовите любимое время года и месяцы (Mi estación favorita es el verano/la primavera... porque en julio/mayo...).\n2. Напишите, что вы делаете в будние дни с артиклем (Los lunes y miércoles estudio..., los viernes salgo con amigos).\n3. Напишите, что вы делаете по выходным (Los fines de semana descanso...).\n4. Соблюдайте правила строчной буквы для дней и месяцев.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Лексика календаря (дни, месяцы, сезоны)", "points": 35, "description": "Правильное использование названий дней, месяцев и времен года."},
                    {"name": "Употребление артиклей el/los с днями недели", "points": 30, "description": "Использование el lunes / los domingos (без ошибки «en lunes»)."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Связно описаны любимый сезон и распорядок по дням."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Строчные буквы для дней/месяцев, акценты."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 28: Asking and telling the time (la hora)
    # ----------------------------------------------------
    28: {
        "id": 28,
        "topicName": "Asking and telling the time (la hora)",
        "russianTitle": "Который час: как спросить и назвать время (la hora)",
        "level": "A1",
        "category": "Speaking",
        "unitId": "a1-u06-calendar",
        "icon": "⏰",
        "summary": "Как спрашивать и называть время на испанском языке: конструкции «¿Qué hora es?» (Который час?) и «¿A qué hora...?» (Во сколько...?). Правило согласования: «Es la una» (1:00 — ед. ч.) против «Son las dos / tres / diez...» (мн. ч.).",
        "mnemonicRule": "1:00 — ES LA una (единственное число!), все остальные часы — SON LAS dos, SON LAS tres... Минуты до половины: «Y cuarto», «Y media». После половины: «MENOS cuarto».",
        "goalsRu": [
            "Спрашивать время: «¿Qué hora es, por favor?» и время начала события: «¿A qué hora empieza...?»",
            "Называть точное время с «Es la una» и «Son las ... en punto»",
            "Использовать четверти и половины: «y cuarto» (:15), «y media» (:30), «menos cuarto» (:45)",
            "Указывать время суток: de la mañana (утра), de la tarde (дня), de la noche (вечера/ночи)"
        ],
        "sections": [
            {
                "title": "1. Как называть текущее время",
                "content": "Слово «hora» женского рода, поэтому артикли всегда женские (la / las). Для 1 часа используется глагол «es» (ед. ч.), для всех остальных — «son» (мн. ч.):",
                "tables": [
                    {
                        "headers": ["Время (цифры)", "Испанский", "Структура", "Русский перевод"],
                        "rows": [
                            ["1:00", "Es la una en punto.", "Es la una (ед. ч.!)", "Ровно час."],
                            ["2:00", "Son las dos en punto.", "Son las dos (мн. ч.)", "Ровно два часа."],
                            ["3:15", "Son las tres y cuarto.", "y cuarto (+15 мин)", "Пятнадцать минут четвертого (3:15)."],
                            ["4:30", "Son las cuatro y media.", "y media (+30 мин)", "Половина пятого (4:30)."],
                            ["5:45", "Son las seis menos cuarto.", "menos cuarto (-15 мин до 6)", "Без пятнадцати шесть (5:45)."],
                            ["7:50", "Son las ocho menos diez.", "menos diez (-10 мин до 8)", "Без десяти восемь (7:50)."],
                            ["12:00 (день)", "Es mediodía.", "mediodía", "Полдень."],
                            ["0:00 (ночь)", "Es medianoche.", "medianoche", "Полночь."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Разница между ¿Qué hora es? и ¿A qué hora?",
                "content": "Не путайте вопрос о текущем времени и вопрос о времени начала события:",
                "tables": [
                    {
                        "headers": ["Вопрос", "Значение", "Формула ответа", "Пример"],
                        "rows": [
                            ["¿Qué hora es?", "Который сейчас час?", "Es la una... / Son las...", "Son las tres y media."],
                            ["¿A qué hora...?", "Во сколько (начинается)?", "A la una... / A las...", "La clase empieza a las nueve."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Disculpe, ¿qué hora es, por favor? —Son las cuatro y media.", "ru": "Извините, который час, пожалуйста? —Половина пятого (4:30)."},
            {"es": "Es la una en punto de la tarde.", "ru": "Ровно час дня (Es la una — ед. число)."},
            {"es": "¿A qué hora sale el tren para Sevilla? —A las seis y cuarto.", "ru": "Во сколько отправляется поезд в Севилью? —В 6:15."},
            {"es": "La reunión empieza a las diez de la mañana.", "ru": "Встреча начинается в десять утра."},
            {"es": "Son las ocho menos cuarto de la noche.", "ru": "Без пятнадцати восемь вечера (7:45)."},
            {"es": "Almorzamos al mediodía con mis compañeros.", "ru": "Мы обедаем в полдень с коллегами."},
            {"es": "El concierto termina a medianoche.", "ru": "Концерт заканчивается в полночь."},
            {"es": "Son las nueve y diez de la mañana.", "ru": "Девять часов десять минут утра."},
            {"es": "Me despierto a las siete en punto todos los días.", "ru": "Я просыпаюсь ровно в семь часов каждый день."},
            {"es": "El supermercado abre a las nueve y cierra a las nueve y media.", "ru": "Супермаркет открывается в 9:00 и закрывается в 21:30."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Son la una» во множественном числе",
                "correction": "Es la una (1:00 — всегда в единственном числе)",
                "explanation": "Час один — это единственное число, поэтому строго «Es la una», а не «Son las una»."
            },
            {
                "mistake": "«Son los dos» с мужским артиклем",
                "correction": "Son las dos / Son las tres",
                "explanation": "Слово «hora» женского рода, поэтому артикль ВСЕГДА женский («las dos», «las tres»)."
            },
            {
                "mistake": "Путаница между ответом на «¿Qué hora es?» (Son las...) и «¿A qué hora...?» (A las...)",
                "correction": "—¿Qué hora es? —Son las diez. vs —¿A qué hora vienes? —A las diez.",
                "explanation": "Для времени действия обязательно нужен предлог «a»: «a las tres», «a la una»."
            }
        ],
        "trapAlert": "Запомните: 1:00 = «ES LA una», а 2:00, 3:00, 10:00... = «SON LAS dos, tres, diez»!",
        "dialectNote": "В некоторых странах Латинской Америки (Колумбия, Мексика) вместо «menos cuarto» часто говорят «un cuarto para las seis» (четверть до шести). Оба варианта понятны всем носителям.",
        "quiz": [
            {
                "question": "Как сказать «Сейчас ровно час дня»?",
                "type": "recognition",
                "options": ["Son la una en punto.", "Es la una en punto.", "Son las una en punto.", "Es las una en punto."],
                "correctIndex": 1,
                "explanations": [
                    "Son — множественное число, а 1 час — единственное.",
                    "Правильно: «Es la una en punto» (глагол es + артикль la).",
                    "«Son las una» — грубая грамматическая ошибка.",
                    "Несогласованно."
                ]
            },
            {
                "question": "Как сказать «Сейчас 3:30 (половина четвертого)»?",
                "type": "recognition",
                "options": ["Son las tres y media.", "Son las tres y mitad.", "Es las tres y media.", "Son los tres y media."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Son las tres y media» (половина = media).",
                    "«Mitad» не используется при обозначении времени.",
                    "Es — форма единственного числа.",
                    "Артикль времени всегда женского рода (las)."
                ]
            },
            {
                "question": "Как сказать «Без пятнадцати шесть (5:45)»?",
                "type": "recognition",
                "options": ["Son las cinco y cuarto.", "Son las seis menos cuarto.", "Son las cinco menos cuarto.", "Son las seis y cuarto."],
                "correctIndex": 1,
                "explanations": [
                    "5:15 — cinco y cuarto.",
                    "Правильно: 5:45 = без пятнадцати шесть («Son las seis menos cuarto»).",
                    "5:00 минус 15 минут было бы 4:45.",
                    "6:15 — seis y cuarto."
                ]
            },
            {
                "question": "Как спросить время у прохожего на улице?",
                "type": "recognition",
                "options": ["¿Qué tiempo es?", "¿Qué hora es?", "¿A qué hora es?", "¿Cuánto hora es?"],
                "correctIndex": 1,
                "explanations": [
                    "«¿Qué tiempo hace?» спрашивает о погоде.",
                    "Правильно: «¿Qué hora es?» — стандартный вопрос «Который час?»",
                    "«¿A qué hora...?» спрашивает о начале конкретного события.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте форму: «El tren sale ____ (в три часа дня).»",
                "type": "application",
                "options": ["son las tres", "a las tres", "en las tres", "de las tres"],
                "correctIndex": 1,
                "explanations": [
                    "«Son las tres» — ответ на вопрос «который сейчас час».",
                    "Правильно: для указания времени действия используется предлог «a»: «a las tres».",
                    "«En las tres» — калька с русского.",
                    "«De las tres» — ошибка."
                ]
            },
            {
                "question": "Вставьте глагол: «____ las ocho de la mañana.»",
                "type": "application",
                "options": ["Es", "Son", "Está", "Están"],
                "correctIndex": 1,
                "explanations": [
                    "Es используется только с 1:00 (Es la una).",
                    "Правильно: «Son las ocho...» (множественное число).",
                    "Estar не используется для времени.",
                    "Estar не используется для времени."
                ]
            },
            {
                "question": "Как сказать «В час ночи» (время начала события)?",
                "type": "application",
                "options": ["A las una de la noche", "A la una de la noche", "En la una de la noche", "Son la una de la noche"],
                "correctIndex": 1,
                "explanations": [
                    "1 час — единственное число (la una).",
                    "Правильно: «A la una de la noche» (предлог a + la una).",
                    "«En la una» — ошибка.",
                    "«Son la una» не выражает время события."
                ]
            },
            {
                "question": "Как сказать «12:00 дня (полдень)»?",
                "type": "application",
                "options": ["Es mediodía.", "Son mediodía.", "Es medianoche.", "Son las mediodía."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Es mediodía» (полдень — ед. ч. муж. род).",
                    "Mediodía в единственном числе.",
                    "Medianoche — полночь (0:00).",
                    "Неверно."
                ]
            },
            {
                "question": "Вы опаздываете на встречу, назначенной на 10:00. Вы смотрите на часы: 10:15. Как сказать другу, сколько сейчас времени?",
                "type": "transfer",
                "options": [
                    "Son las diez y cuarto, vamos tarde.",
                    "Son las diez menos cuarto, vamos tarde.",
                    "Es la diez y cuarto, vamos tarde.",
                    "A las diez y cuarto, vamos tarde."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Son las diez y cuarto» (10:15).",
                    "Diez menos cuarto = 9:45.",
                    "Es la diez — несогласованно.",
                    "A las diez указывает время начала, а не текущий час."
                ]
            },
            {
                "question": "В расписании уроков написано: «Español: 09:00 - 10:30». Как объяснить одногруппнику расписание?",
                "type": "transfer",
                "options": [
                    "La clase empieza a las nueve y termina a las diez y media.",
                    "La clase empieza son las nueve y termina son las diez y media.",
                    "La clase es en las nueve y termina en las diez.",
                    "La clase tiene nueve horas y diez horas."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «empieza a las nueve y termina a las diez y media» (предлог a + las + время).",
                    "«Son las nueve» не используется после глаголов начала.",
                    "Предлог «en» ошибочен со временем.",
                    "Бессмысленно."
                ]
            },
            {
                "question": "Как вежливо спросить у администратора отеля время завтрака?",
                "type": "transfer",
                "options": [
                    "Disculpe, ¿a qué hora es el desayuno?",
                    "Disculpe, ¿qué hora es el desayuno?",
                    "Disculpe, ¿cuándo hora es el desayuno?",
                    "Disculpe, ¿cuánto es el desayuno de hora?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿A qué hora es el desayuno?» (Во сколько завтрак?).",
                    "«¿Qué hora es?» спрашивает «Который сейчас час?».",
                    "Неграмотно.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Собеседник говорит: «Llego a las ocho menos diez». В какое время он прибудет?",
                "type": "transfer",
                "options": ["В 8:10", "В 7:50", "В 8:50", "В 7:10"],
                "correctIndex": 1,
                "explanations": [
                    "8:10 — las ocho y diez.",
                    "Правильно: «las ocho menos diez» = без десяти восемь (7:50).",
                    "8:50 — las nueve menos diez.",
                    "7:10 — las siete y diez."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-28-01",
                "type": "choice",
                "question": "Какая форма глагола нужна для 1:00: «____ la una en punto»?",
                "options": ["Es", "Son", "Está", "Hay"],
                "correctAnswer": "Es",
                "explanation": "1:00 — единственное число: «Es la una»."
            },
            {
                "id": "ex-28-02",
                "type": "gap",
                "question": "____ (2:00) las dos de la tarde.",
                "correctAnswer": "Son",
                "acceptableAnswers": ["Son", "son"],
                "explanation": "Son las dos."
            },
            {
                "id": "ex-28-03",
                "type": "tiles",
                "question": "Соберите предложение: «Сейчас половина четвертого (3:30).»",
                "tiles": ["Son", "las", "tres", "y", "media."],
                "correctAnswer": "Son las tres y media.",
                "explanation": "Son las tres y media."
            },
            {
                "id": "ex-28-04",
                "type": "transformation",
                "question": "Преобразуйте вопрос о текущем часе: «¿Qué ____ es?»",
                "prompt": "время → ____",
                "correctAnswer": "hora",
                "acceptableAnswers": ["hora", "Hora"],
                "explanation": "¿Qué hora es?"
            },
            {
                "id": "ex-28-05",
                "type": "input",
                "question": "Напишите по-испански «четверть часа» (в конструкции времени: y...):",
                "correctAnswer": "cuarto",
                "acceptableAnswers": ["cuarto", "y cuarto", "Cuarto"],
                "explanation": "cuarto / y cuarto."
            },
            {
                "id": "ex-28-06",
                "type": "gap",
                "question": "La clase de español empieza ____ (в) las nueve.",
                "correctAnswer": "a",
                "acceptableAnswers": ["a", "A"],
                "explanation": "a las nueve."
            },
            {
                "id": "ex-28-07",
                "type": "choice",
                "question": "Как сказать «12:00 дня (полдень)»?",
                "options": ["mediodía", "medianoche", "media hora", "en punto"],
                "correctAnswer": "mediodía",
                "explanation": "mediodía = полдень."
            },
            {
                "id": "ex-28-08",
                "type": "input",
                "question": "Напишите по-испански слово «полночь» (0:00):",
                "correctAnswer": "medianoche",
                "acceptableAnswers": ["medianoche", "la medianoche", "Medianoche"],
                "explanation": "medianoche."
            },
            {
                "id": "ex-28-09",
                "type": "transformation",
                "question": "Напишите время словами: «7:15» → «Son las siete y ____»",
                "prompt": "15 минут → ____",
                "correctAnswer": "cuarto",
                "acceptableAnswers": ["cuarto", "Cuarto", "quince"],
                "explanation": "y cuarto."
            },
            {
                "id": "ex-28-10",
                "type": "tiles",
                "question": "Соберите фразу: «Поезд отправляется в шесть часов утра.»",
                "tiles": ["El", "tren", "sale", "a", "las", "seis", "de", "la", "mañana."],
                "correctAnswer": "El tren sale a las seis de la mañana.",
                "explanation": "El tren sale a las seis de la mañana."
            },
            {
                "id": "ex-28-11",
                "type": "gap",
                "question": "Son las ocho ____ (без) diez de la noche (7:50).",
                "correctAnswer": "menos",
                "acceptableAnswers": ["menos", "Menos"],
                "explanation": "menos diez."
            },
            {
                "id": "ex-28-12",
                "type": "choice",
                "question": "Как сказать «ровно (по часам)»?",
                "options": ["en punto", "y cuarto", "y media", "menos cuarto"],
                "correctAnswer": "en punto",
                "explanation": "en punto = ровно."
            },
            {
                "id": "ex-28-13",
                "type": "input",
                "question": "Напишите по-испански «половина» (при указании времени):",
                "correctAnswer": "media",
                "acceptableAnswers": ["media", "y media", "Media"],
                "explanation": "media / y media."
            },
            {
                "id": "ex-28-14",
                "type": "transformation",
                "question": "Сформулируйте вопрос к времени: «La fiesta es a las diez» → «¿A ____ hora es la fiesta?»",
                "prompt": "какой → ____",
                "correctAnswer": "qué",
                "acceptableAnswers": ["qué", "que", "Qué"],
                "explanation": "¿A qué hora...?"
            },
            {
                "id": "ex-28-15",
                "type": "tiles",
                "question": "Соберите вопрос: «Который час, пожалуйста?»",
                "tiles": ["¿Qué", "hora", "es,", "por", "favor?"],
                "correctAnswer": "¿Qué hora es, por favor?",
                "explanation": "¿Qué hora es, por favor?"
            },
            {
                "id": "ex-28-16",
                "type": "gap",
                "question": "Almorzamos al ____ (полдень) en el restaurante.",
                "correctAnswer": "mediodía",
                "acceptableAnswers": ["mediodía", "mediodia", "Mediodía"],
                "explanation": "al mediodía."
            },
            {
                "id": "ex-28-17",
                "type": "choice",
                "question": "Сколько времени: «Son las dos menos cuarto»?",
                "options": ["1:45", "2:15", "2:45", "1:15"],
                "correctAnswer": "1:45",
                "explanation": "2:00 минус 15 мин = 1:45."
            },
            {
                "id": "ex-28-18",
                "type": "input",
                "question": "Напишите форму глагола ser для времени 5:00 (Son/Es):",
                "correctAnswer": "Son",
                "acceptableAnswers": ["Son", "son"],
                "explanation": "Son las cinco."
            },
            {
                "id": "ex-28-19",
                "type": "gap",
                "question": "La tienda abre ____ (в) las diez en punto.",
                "correctAnswer": "a",
                "acceptableAnswers": ["a", "A"],
                "explanation": "a las diez."
            },
            {
                "id": "ex-28-20",
                "type": "tiles",
                "question": "Соберите предложение: «Сейчас ровно час дня.»",
                "tiles": ["Es", "la", "una", "en", "punto."],
                "correctAnswer": "Es la una en punto.",
                "explanation": "Es la una en punto."
            },
            {
                "id": "ex-28-21",
                "type": "choice",
                "question": "Какое время суток обозначает «de la madrugada»?",
                "options": ["глубокая ночь / раннее утро (до рассвета)", "день после обеда", "вечер после заката", "полдень"],
                "correctAnswer": "глубокая ночь / раннее утро (до рассвета)",
                "explanation": "madrugada = предрассветные часы (01:00-06:00)."
            },
            {
                "id": "ex-28-22",
                "type": "transformation",
                "question": "Напишите время словами: «10:30» → «Son las diez y ____»",
                "prompt": "30 минут → ____",
                "correctAnswer": "media",
                "acceptableAnswers": ["media", "Media"],
                "explanation": "y media."
            },
            {
                "id": "ex-28-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение правильно объединяет дни недели, глагол tener и время?",
                "options": [
                    "El lunes tengo una reunión importante a las diez en punto.",
                    "En lunes tengo una reunión importante son las diez.",
                    "Los lunes soy una reunión a las diez.",
                    "El lunes tengo reunión importante en las diez."
                ],
                "correctAnswer": "El lunes tengo una reunión importante a las diez en punto.",
                "explanation": "El lunes (в понедельник) + tengo (у меня есть) + reunión + a las diez (время события)."
            },
            {
                "id": "ex-28-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Который час? — Сейчас 4:15 дня»:",
                "correctAnswer": "¿Qué hora es? — Son las cuatro y cuarto de la tarde",
                "acceptableAnswers": [
                    "¿Qué hora es? — Son las cuatro y cuarto de la tarde",
                    "¿Qué hora es? Son las cuatro y cuarto de la tarde",
                    "Que hora es? Son las cuatro y cuarto de la tarde",
                    "Son las cuatro y cuarto de la tarde"
                ],
                "explanation": "¿Qué hora es? — Son las cuatro y cuarto de la tarde."
            }
        ],
        "miniScenario": {
            "title": "Уточнение времени отправления автобуса",
            "setting": "Автовокзал в Толедо.",
            "situation": "Вы хотите узнать текущее время и время отправления следующего автобуса в Мадрид.",
            "dialog": [
                {"speaker": "Tú", "text": "Disculpe, ¿qué hora es? Se ha parado mi reloj."},
                {"speaker": "Pasajero", "text": "Son las tres y diez de la tarde."},
                {"speaker": "Tú", "text": "Muchas gracias. ¿Y a qué hora sale el autobús a Madrid?"},
                {"speaker": "Pasajero", "text": "Sale a las tres y media en punto. Tienes veinte minutos."}
            ],
            "task": "Спросите время отправления автобуса.",
            "prompt": "Как спросить: «Во сколько отправляется автобус в Мадрид?»?",
            "options": [
                "¿A qué hora sale el autobús a Madrid?",
                "¿Qué hora sale el autobús a Madrid?",
                "¿Dónde hora sale el autobús?",
                "¿Cuánto sale el autobús de hora?"
            ],
            "correctIndex": 0,
            "explanation": "«¿A qué hora sale el autobús a Madrid?» — точная и естественная формулировка."
        },
        "shortText": {
            "title": "El horario de clases de Marta",
            "text": "Marta tiene un horario muy organizado. Se levanta a las siete en punto de la mañana y desayuna con calma. Su primera clase en la universidad empieza a las ocho y media. A las dos en punto de la tarde almuerza con sus amigos en el comedor del campus. Por las tardes, de cuatro a seis y media, estudia en la biblioteca. Cena a las nueve y se acuesta a las once de la noche.",
            "questions": [
                {
                    "question": "¿A qué hora se levanta Marta por la mañana?",
                    "options": ["A las seis y media", "A las siete en punto", "A las ocho", "A las nueve"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Se levanta a las siete en punto de la mañana...»."
                },
                {
                    "question": "¿A qué hora empieza su primera clase?",
                    "options": ["A las ocho y media", "A las nueve", "A las diez", "Al mediodía"],
                    "correctIndex": 0,
                    "explanation": "В тексте: «empieza a las ocho y media»."
                },
                {
                    "question": "¿Hasta qué hora estudia en la biblioteca por la tarde?",
                    "options": ["Hasta las cinco", "Hasta las seis y media", "Hasta las nueve", "Hasta medianoche"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «de cuatro a seis y media, estudia en la biblioteca»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Мой распорядок дня по часам",
            "prompt": "Напишите текст о вашем обычном дневном расписании с указанием точного времени (4-6 предложений):\n1. Во сколько вы просыпаетесь (Me despierto a las...).\n2. Во сколько вы завтракаете или выходите из дома (Desayuno a las... y salgo a las...).\n3. Во сколько начинается ваша работа или учеба (El trabajo/la clase empieza a las...).\n4. Во сколько вы обедаете и ужинаете (Almuerzo a la una / a las dos..., ceno a las...).\n5. Используйте конструкции «en punto», «y cuarto», «y media», «de la mañana/tarde/noche».",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Конструкции времени (a la una / a las...)", "points": 35, "description": "Безошибочное использование предлога «a» и артиклей la/las со временем действия."},
                    {"name": "Использование четвертей и половин", "points": 25, "description": "Правильное употребление y cuarto, y media, en punto, menos cuarto."},
                    {"name": "Глаголы распорядка дня", "points": 25, "description": "Употребление глаголов levantarse, desayunar, empezar, almorzar, cenar."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 14: Numbers (0-1000)
    # ----------------------------------------------------
    14: {
        "id": 14,
        "topicName": "Numbers (0-1000)",
        "russianTitle": "Числительные от 0 до 1000 (números hasta 1000)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u06-calendar",
        "icon": "💯",
        "summary": "Количественные числительные испанского языка от 0 до 1000: десятки (veinte, treinta, cuarenta...), сотни (cien, doscientos, quinientos, setecientos, novecientos...), тысяча (mil), правила слитного написания (21-29) и раздельного (31-99), согласование сотен по родам.",
        "mnemonicRule": "21-29 пишутся СЛИТНО (veintiuno, veintidós...), 31-99 пишутся РАЗДЕЛЬНО через «Y» (treinta y uno, cuarenta y dos...). Сотни согласуются по родам: doscientos libros / doscientas casas!",
        "goalsRu": [
            "Свободно называть и понимать на слух любые числа от 0 до 1000",
            "Знать разницу в написании: 21–29 слитно (veintitrés), 31–99 раздельно (treinta y tres)",
            "Знать особые формы сотен: 500 = quinientos, 700 = setecientos, 900 = novecientos",
            "Согласовывать сотни по роду с существительным: doscientos euros / doscientas personas",
            "Понимать разницу между «cien» (ровно 100 перед сущ.) и «ciento» (101-199)"
        ],
        "sections": [
            {
                "title": "1. Десятки (20–90) и правило слитного/раздельного написания",
                "content": "Числа от 21 до 29 пишутся в одно слово (veintiuno, veintidós). Начиная с 31, десятки и единицы пишутся в три слова через союз «y»:",
                "tables": [
                    {
                        "headers": ["Десяток", "Испанский", "Пример сложного числа", "Русский перевод"],
                        "rows": [
                            ["20", "veinte", "veinticinco (слитно!)", "двадцать пять"],
                            ["30", "treinta", "treinta y uno (раздельно!)", "тридцать один"],
                            ["40", "cuarenta", "cuarenta y dos", "сорок два"],
                            ["50", "cincuenta", "cincuenta y cinco", "пятьдесят пять"],
                            ["60", "sesenta", "sesenta y ocho", "шестьдесят восемь"],
                            ["70", "setenta", "setenta y tres", "семьдесят три"],
                            ["80", "ochenta", "ochenta y cuatro", "восемьдесят четыре"],
                            ["90", "noventa", "noventa y nueve", "девяносто девять"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Сотни (100–900) и тысяча (1000)",
                "content": "Ровно 100 перед существительным сокращается до CIEN (cien euros). Сотни от 200 до 900 имеют мужской и женский род (-os / -as):",
                "tables": [
                    {
                        "headers": ["Число", "Мужской род", "Женский род", "Русский перевод"],
                        "rows": [
                            ["100", "cien (ровно 100)", "cien", "сто (cien personas / cien euros)"],
                            ["101-199", "ciento uno...", "ciento una...", "сто один..."],
                            ["200", "doscientos", "doscientas", "двести"],
                            ["300", "trescientos", "trescientas", "триста"],
                            ["400", "cuatrocientos", "cuatrocientas", "четыреста"],
                            ["500", "quinientos (искл.!)", "quinientas", "пятьсот"],
                            ["600", "seiscientos", "seiscientas", "шестьсот"],
                            ["700", "setecientos (искл.!)", "setecientas", "семьсот"],
                            ["800", "ochocientos", "ochocientas", "восемьсот"],
                            ["900", "novecientos (искл.!)", "novecientas", "девятьсот"],
                            ["1000", "mil", "mil", "тысяча (не меняется по родам)"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "El billete de avión cuesta trescientos cincuenta euros.", "ru": "Билет на самолет стоит триста пятьдесят евро."},
            {"es": "En el hotel hay doscientas habitaciones.", "ru": "В отеле двести номеров (doscientas — жен. род)."},
            {"es": "La novela tiene quinientas páginas.", "ru": "В романе пятьсот страниц (quinientas — жен. род)."},
            {"es": "El pueblo está a setecientos kilómetros de Madrid.", "ru": "Посёлок находится в семистах километрах от Мадрида."},
            {"es": "Mil gracias por toda tu ayuda.", "ru": "Тысяча благодарностей за всю твою помощь."},
            {"es": "Compro una bicicleta por novecientos euros.", "ru": "Я покупаю велосипед за девятьсот евро."},
            {"es": "El curso cuesta ciento veinticinco dólares.", "ru": "Курс стоит сто двадцать пять долларов."},
            {"es": "Cien personas asistieron al concierto.", "ru": "Сто человек присутствовали на концерте (cien перед сущ.)."},
            {"es": "Mi abuela tiene ochenta y siete años.", "ru": "Моей бабушке восемьдесят семь лет."},
            {"es": "El apartamento cuesta seiscientos euros al mes.", "ru": "Квартира стоит шестьсот евро в месяц."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Cinco cientos» вместо «quinientos»",
                "correction": "quinientos / quinientas",
                "explanation": "500 имеет особую историческую форму: quinientos (не cinco cientos!)."
            },
            {
                "mistake": "«Doscientos casas» без согласования в женском роде",
                "correction": "doscientas casas / quinientas personas",
                "explanation": "Сотни от 200 до 900 согласуются по роду с существительным: doscientas, trescientas, quinientas..."
            },
            {
                "mistake": "«Treintayuno» в одно слово",
                "correction": "treinta y uno (раздельно в три слова)",
                "explanation": "Слитно пишутся только числа до 29 (veintinueve). Начиная с 31 — строго раздельно через «y»."
            }
        ],
        "trapAlert": "Особые формы сотен: 500 = QUINIENTOS, 700 = SETECIENTOS, 900 = NOVECIENTOS!",
        "dialectNote": "В испаноязычном мире для разделения тысяч и десятичных дробей часто используют точку для тысяч (1.000) и запятую для копеек/центов (10,50 €).",
        "quiz": [
            {
                "question": "Как правильно пишется число 500 на испанском языке?",
                "type": "recognition",
                "options": ["Cincocientos", "Quinientos", "Quincientos", "Cinco cien"],
                "correctIndex": 1,
                "explanations": [
                    "«Cincocientos» — грубая ошибка.",
                    "Правильно: 500 = «quinientos».",
                    "Опечатка.",
                    "Неверно."
                ]
            },
            {
                "question": "Как пишется число 35 на испанском языке?",
                "type": "recognition",
                "options": ["Treintaycinco", "Treinta y cinco", "Treinta cinco", "Tres cinco"],
                "correctIndex": 1,
                "explanations": [
                    "Слитно пишутся только числа до 29.",
                    "Правильно: «treinta y cinco» (раздельно в 3 слова через y).",
                    "Пропущен союз «y».",
                    "Неверно."
                ]
            },
            {
                "question": "Какая форма числа 200 согласуется со словом «páginas» (страницы, жен. род)?",
                "type": "recognition",
                "options": ["doscientos", "doscientas", "dos cientos", "doscientases"],
                "correctIndex": 1,
                "explanations": [
                    "Doscientos — мужской род.",
                    "Правильно: «doscientas páginas» (женский род).",
                    "Раздельное написание ошибочно.",
                    "Такой формы не существует."
                ]
            },
            {
                "question": "Как сказать «ровно 100 евро»?",
                "type": "recognition",
                "options": ["Ciento euros", "Cien euros", "Cientos euros", "Uno cien euros"],
                "correctIndex": 1,
                "explanations": [
                    "Ciento используется в составе чисел от 101 до 199 (ciento uno).",
                    "Правильно: ровно 100 перед существительным = «cien euros».",
                    "Cientos — это существительное во мн. ч. («сотни людей»).",
                    "Неверно."
                ]
            },
            {
                "question": "Как пишется число 700 на испанском?",
                "type": "application",
                "options": ["Sietecientos", "Setecientos", "Sietecentas", "Setecientas solamente"],
                "correctIndex": 1,
                "explanations": [
                    "«Sietecientos» — ошибка (корень sete-).",
                    "Правильно: 700 = «setecientos».",
                    "Неверно.",
                    "Setecientos (муж. род) / setecientas (жен. род)."
                ]
            },
            {
                "question": "Решите пример: «Trescientos + doscientos = ____»",
                "type": "application",
                "options": ["Cuatrocientos", "Quinientos", "Seiscientos", "Setecientos"],
                "correctIndex": 1,
                "explanations": [
                    "300 + 200 = 500.",
                    "Правильно: 300 + 200 = 500 («quinientos»).",
                    "600 = seiscientos.",
                    "700 = setecientos."
                ]
            },
            {
                "question": "Как пишется число 900 на испанском?",
                "type": "application",
                "options": ["Nuevecientos", "Novecientos", "Nueve cien", "Noventa cientos"],
                "correctIndex": 1,
                "explanations": [
                    "«Nuevecientos» — ошибка (корень nove-).",
                    "Правильно: 900 = «novecientos».",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте число: «El vuelo cuesta ____ (150) dólares.»",
                "type": "application",
                "options": ["cien cincuenta", "ciento cincuenta", "cientos cincuenta", "uno cincuenta"],
                "correctIndex": 1,
                "explanations": [
                    "Cien употребляется только для ровно 100.",
                    "Правильно: 150 = «ciento cincuenta».",
                    "Множественное число ошибочно.",
                    "Неверно."
                ]
            },
            {
                "question": "В магазине вам называют цену телевизора: «Ochocientos noventa euros». Сколько это в цифрах?",
                "type": "transfer",
                "options": ["890 €", "809 €", "790 €", "980 €"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: ochocientos (800) + noventa (90) = 890 €.",
                    "809 — ochocientos nueve.",
                    "790 — setecientos noventa.",
                    "980 — novecientos ochenta."
                ]
            },
            {
                "question": "Как сказать «В университете учится 1000 студентов»?",
                "type": "transfer",
                "options": [
                    "En la universidad estudian mil estudiantes.",
                    "En la universidad estudian un mil estudiantes.",
                    "En la universidad estudian miles estudiantes.",
                    "En la universidad estudian uno mil estudiantes."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: 1000 = «mil» (без артикля un перед mil).",
                    "«Un mil» — грамматическая ошибка.",
                    "Miles de estudiantes требует предлога de.",
                    "«Uno mil» — ошибка."
                ]
            },
            {
                "question": "Как сказать «В зрительном зале сидят 400 женщин»?",
                "type": "transfer",
                "options": [
                    "Hay cuatrocientas mujeres en la sala.",
                    "Hay cuatrocientos mujeres en la sala.",
                    "Hay cuatro cien mujeres en la sala.",
                    "Hay cuatrocientosas mujeres en la sala."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «cuatrocientas mujeres» (согласование сотен по женскому роду).",
                    "Cuatrocientos — мужской род.",
                    "Неверно.",
                    "Такой формы не существует."
                ]
            },
            {
                "question": "На вопрос «¿A qué distancia está la playa?» вам отвечают: «A unos doscientos cincuenta kilómetros». Каково расстояние?",
                "type": "transfer",
                "options": ["Около 250 км", "Ровно 215 км", "Около 520 км", "2500 км"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: doscientos cincuenta = 250 км (unos = около).",
                    "215 — doscientos quince.",
                    "520 — quinientos veinte.",
                    "2500 — dos mil quinientos."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-14-01",
                "type": "choice",
                "question": "Какое число соответствует испанскому «quinientos»?",
                "options": ["500", "50", "15", "5000"],
                "correctAnswer": "500",
                "explanation": "quinientos = 500."
            },
            {
                "id": "ex-14-02",
                "type": "gap",
                "question": "El billete cuesta ____ (100) euros en punto.",
                "correctAnswer": "cien",
                "acceptableAnswers": ["cien", "Cien"],
                "explanation": "cien euros (ровно 100 перед сущ.)."
            },
            {
                "id": "ex-14-03",
                "type": "tiles",
                "question": "Соберите число словами: «350 евро»",
                "tiles": ["trescientos", "cincuenta", "euros."],
                "correctAnswer": "trescientos cincuenta euros.",
                "explanation": "trescientos cincuenta euros."
            },
            {
                "id": "ex-14-04",
                "type": "transformation",
                "question": "Преобразуйте число в слова: «500 personas» → «____ personas»",
                "prompt": "500 (жен. род) → ____",
                "correctAnswer": "quinientas",
                "acceptableAnswers": ["quinientas", "Quinientas"],
                "explanation": "quinientas personas."
            },
            {
                "id": "ex-14-05",
                "type": "input",
                "question": "Напишите словом по-испански число 1000:",
                "correctAnswer": "mil",
                "acceptableAnswers": ["mil", "Mil"],
                "explanation": "mil."
            },
            {
                "id": "ex-14-06",
                "type": "gap",
                "question": "El libro tiene ____ (200, жен. род) páginas.",
                "correctAnswer": "doscientas",
                "acceptableAnswers": ["doscientas", "Doscientas"],
                "explanation": "doscientas páginas."
            },
            {
                "id": "ex-14-07",
                "type": "choice",
                "question": "Как пишется число 700?",
                "options": ["setecientos", "sietecientos", "sete cientos", "siete cien"],
                "correctAnswer": "setecientos",
                "explanation": "setecientos = 700."
            },
            {
                "id": "ex-14-08",
                "type": "input",
                "question": "Напишите словом по-испански число 900:",
                "correctAnswer": "novecientos",
                "acceptableAnswers": ["novecientos", "Novecientos"],
                "explanation": "novecientos."
            },
            {
                "id": "ex-14-09",
                "type": "transformation",
                "question": "Напишите число словами: «45» → «cuarenta y ____»",
                "prompt": "5 → ____",
                "correctAnswer": "cinco",
                "acceptableAnswers": ["cinco", "Cinco"],
                "explanation": "cuarenta y cinco."
            },
            {
                "id": "ex-14-10",
                "type": "tiles",
                "question": "Соберите предложение: «Курс стоит сто двадцать долларов.»",
                "tiles": ["El", "curso", "cuesta", "ciento", "veinte", "dólares."],
                "correctAnswer": "El curso cuesta ciento veinte dólares.",
                "explanation": "El curso cuesta ciento veinte dólares."
            },
            {
                "id": "ex-14-11",
                "type": "gap",
                "question": "El hotel tiene ____ (300) habitaciones modernas.",
                "correctAnswer": "trescientas",
                "acceptableAnswers": ["trescientas", "trescientos"],
                "explanation": "trescientas habitaciones (жен. род)."
            },
            {
                "id": "ex-14-12",
                "type": "choice",
                "question": "Как пишется число 400?",
                "options": ["cuatrocientos", "cuatro cientos", "cuatrociento", "cuatricientos"],
                "correctAnswer": "cuatrocientos",
                "explanation": "cuatrocientos = 400."
            },
            {
                "id": "ex-14-13",
                "type": "input",
                "question": "Напишите словом число 600:",
                "correctAnswer": "seiscientos",
                "acceptableAnswers": ["seiscientos", "Seiscientos"],
                "explanation": "seiscientos."
            },
            {
                "id": "ex-14-14",
                "type": "transformation",
                "question": "Преобразуйте число в слова: «800 euros» → «____ euros»",
                "prompt": "800 → ____",
                "correctAnswer": "ochocientos",
                "acceptableAnswers": ["ochocientos", "Ochocientos"],
                "explanation": "ochocientos euros."
            },
            {
                "id": "ex-14-15",
                "type": "tiles",
                "question": "Соберите фразу: «Тысяча благодарностей за помощь.»",
                "tiles": ["Mil", "gracias", "por", "la", "ayuda."],
                "correctAnswer": "Mil gracias por la ayuda.",
                "explanation": "Mil gracias por la ayuda."
            },
            {
                "id": "ex-14-16",
                "type": "gap",
                "question": "Mi abuela tiene ____ (85) años.",
                "correctAnswer": "ochenta y cinco",
                "acceptableAnswers": ["ochenta y cinco", "Ochenta y cinco"],
                "explanation": "ochenta y cinco."
            },
            {
                "id": "ex-14-17",
                "type": "choice",
                "question": "Какое число написано слитно без ошибок?",
                "options": ["veintiséis", "veinte y seis", "treintayseis", "cuarentayuno"],
                "correctAnswer": "veintiséis",
                "explanation": "veintiséis пишется слитно с тильдой."
            },
            {
                "id": "ex-14-18",
                "type": "input",
                "question": "Напишите словом число 100 перед существительным (cien/ciento):",
                "correctAnswer": "cien",
                "acceptableAnswers": ["cien", "Cien"],
                "explanation": "cien."
            },
            {
                "id": "ex-14-19",
                "type": "gap",
                "question": "El vuelo dura ____ (75) minutos.",
                "correctAnswer": "setenta y cinco",
                "acceptableAnswers": ["setenta y cinco", "Setenta y cinco"],
                "explanation": "setenta y cinco."
            },
            {
                "id": "ex-14-20",
                "type": "tiles",
                "question": "Соберите предложение: «В городе около девятисот магазинов.»",
                "tiles": ["En", "la", "ciudad", "hay", "unas", "novecientas", "tiendas."],
                "correctAnswer": "En la ciudad hay unas novecientas tiendas.",
                "explanation": "En la ciudad hay unas novecientas tiendas."
            },
            {
                "id": "ex-14-21",
                "type": "choice",
                "question": "Какая сумма больше?",
                "options": ["quinientos euros", "cuatrocientos noventa euros", "trescientos euros", "cien euros"],
                "correctAnswer": "quinientos euros",
                "explanation": "500 € больше, чем 490 €, 300 € и 100 €."
            },
            {
                "id": "ex-14-22",
                "type": "transformation",
                "question": "Решите пример и напишите ответ словом: «600 + 400 = ____»",
                "prompt": "600 + 400 → ____",
                "correctAnswer": "mil",
                "acceptableAnswers": ["mil", "Mil"],
                "explanation": "mil (1000)."
            },
            {
                "id": "ex-14-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет большие числа, семью и покупки?",
                "options": [
                    "Compro un regalo de doscientos euros para mis padres.",
                    "Compro un regalo de doscientos euros para el mis padres.",
                    "Soy comprar regalo de doscientas euros para mi padres.",
                    "Comprar doscientos euro por mi padres."
                ],
                "correctAnswer": "Compro un regalo de doscientos euros para mis padres.",
                "explanation": "Compro (покупаю) + doscientos euros (200 €) + para mis padres (для моих родителей)."
            },
            {
                "id": "ex-14-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Квартира стоит 650 евро в месяц»:",
                "correctAnswer": "El apartamento cuesta seiscientos cincuenta euros al mes",
                "acceptableAnswers": [
                    "El apartamento cuesta seiscientos cincuenta euros al mes",
                    "El piso cuesta seiscientos cincuenta euros al mes",
                    "El apartamento cuesta 650 euros al mes"
                ],
                "explanation": "El apartamento cuesta seiscientos cincuenta euros al mes."
            }
        ],
        "miniScenario": {
            "title": "Аренда жилья в Барселоне",
            "setting": "Агентство недвижимости в Барселоне.",
            "situation": "Вы подбираете квартиру в аренду и обсуждаете цены и площадь.",
            "dialog": [
                {"speaker": "Agente", "text": "Tenemos este piso céntrico de ochenta metros cuadrados. Cuesta setecientos cincuenta euros al mes."},
                {"speaker": "Tú", "text": "¿Y cuánto cuesta la fianza (залог)?"},
                {"speaker": "Agente", "text": "La fianza es de mil quinientos euros (dos meses)."},
                {"speaker": "Tú", "text": "Comprendo. Me parece un precio razonable."}
            ],
            "task": "Подтвердите, что цена 750 евро в месяц вам подходит.",
            "prompt": "Как сказать агенту: «Семьсот пятьдесят евро в месяц — хорошая цена»?",
            "options": [
                "Setecientos cincuenta euros al mes es un buen precio.",
                "Sietecientos cincuenta euros al mes es un buen precio.",
                "Setecientas euros al mes es un buen precio.",
                "Siete cientos cincuenta euros al mes está buen precio."
            ],
            "correctIndex": 0,
            "explanation": "«Setecientos cincuenta euros al mes es un buen precio» — правильное числительное 750."
        },
        "shortText": {
            "title": "La gran biblioteca de la ciudad",
            "text": "La biblioteca central de la ciudad tiene más de novecientos mil libros en su colección. El edificio tiene cuatro pisos y quinientas mesas de estudio para los alumnos. Todos los días visitan la biblioteca unas ochocientas personas. Para registrarse, la tarjeta de lector cuesta solo cinco euros y permite llevarse hasta diez libros durante treinta días.",
            "questions": [
                {
                    "question": "¿Cuántas mesas de estudio hay en la biblioteca?",
                    "options": ["Cien", "Quinientas", "Ochocientas", "Novecientos"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «quinientas mesas de estudio para los alumnos»."
                },
                {
                    "question": "¿Cuántas personas visitan la biblioteca al día aproximadamente?",
                    "options": ["Unas doscientas", "Unas ochocientas", "Cincuenta", "Mil"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «visitan la biblioteca unas ochocientas personas»."
                },
                {
                    "question": "¿Cuántos días se pueden tener los libros en préstamo?",
                    "options": ["Diez días", "Veinte días", "Treinta días", "Cinco días"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «durante treinta días»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание цен, расстояний и количеств (числа до 1000)",
            "prompt": "Напишите короткий финансовый или путевой отчет (4-5 предложений), используя крупные числа:\n1. Укажите стоимость аренды или проживания (El apartamento cuesta ... euros al mes).\n2. Укажите стоимость билета на самолет или поезд (El billete cuesta ... euros).\n3. Укажите расстояние в километрах (La ciudad está a ... kilómetros).\n4. Используйте числительные сотен (doscientos/as, quinientos/as, setecientos/as, novecientos/as) с согласованием по роду.",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Использование числительных до 1000", "points": 35, "description": "Безошибочное написание сотен (quinientos, setecientos, novecientos) и сложных чисел."},
                    {"name": "Согласование сотен по родам", "points": 30, "description": "Точное согласование doscientos euros / doscientas personas."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Связно описаны бюджет и расстояния."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    }
}
