# -*- coding: utf-8 -*-
"""Unit 7: Еда и кафе (Topics 3, 23, 29)"""

unit7_topics = {
    # ----------------------------------------------------
    # TOPIC 3: Present tense regular -er/-ir verbs
    # ----------------------------------------------------
    3: {
        "id": 3,
        "topicName": "Present tense regular -er/-ir verbs",
        "russianTitle": "Настоящее время правильных глаголов второго (-ER) и третьего (-IR) спряжений",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u07-food",
        "icon": "🍽️",
        "summary": "Глаголы второго спряжения оканчиваются на -ER (comer, beber, aprender, leer, vender...), третьего — на -IR (vivir, escribir, abrir...). Они спрягаются почти идентично, за исключением форм nosotros (-emos для -er, -imos для -ir) и vosotros (-éis / -ís).",
        "mnemonicRule": "Глаголы -ER и -IR близнецы! У них везде гласная «E» (-o, -es, -e, -en), кроме nosotros: -ER делает -EMOS (comemos), а -IR делает -IMOS (vivimos).",
        "goalsRu": [
            "Спрягать правильные глаголы на -ER (comer, beber, aprender, comprender, responder, vender...)",
            "Спрягать правильные глаголы на -IR (vivir, escribir, abrir, decidir...)",
            "Различать формы 1-го лица мн. числа: comemos (-er) vs vivimos (-ir)",
            "Строить предложения о еде, чтении, письме и повседневных процессах"
        ],
        "sections": [
            {
                "title": "1. Спряжение глаголов на -ER и -IR в сравнении",
                "content": "Обратите внимание на полное совпадение во всех лицах, кроме nosotros и vosotros:",
                "tables": [
                    {
                        "headers": ["Лицо / Местоимение", "COMER (-ER: есть)", "VIVIR (-IR: жить)", "Окончания -ER / -IR"],
                        "rows": [
                            ["yo", "como (я ем)", "vivo (я живу)", "-o / -o"],
                            ["tú", "comes (ты ешь)", "vives (ты живешь)", "-es / -es"],
                            ["vos (Аргентина)", "comés", "vivís", "-és / -ís (ударение!)"],
                            ["él / ella / usted", "come (он ест / Вы едите)", "vive (он живет / Вы живете)", "-e / -e"],
                            ["nosotros / nosotras", "comemos (мы едим)", "vivimos (мы живем)", "-emos / -imos (разница!)"],
                            ["vosotros / vosotras", "coméis", "vivís", "-éis / -ís"],
                            ["ellos / ellas / ustedes", "comen (они едят)", "viven (они живут)", "-en / -en"]
                        ]
                    }
                ]
            },
            {
                "title": "2. Топ базовых глаголов на -ER и -IR",
                "content": "Основные глаголы, необходимые для общения на уровне A1:",
                "tables": [
                    {
                        "headers": ["Спряжение", "Глаголы (инфинитив)", "Значение", "Пример в Presente"],
                        "rows": [
                            ["-ER", "comer, beber, aprender, comprender, leer, vender, responder", "есть, пить, учить, понимать, читать, продавать, отвечать", "Bebo agua y como fruta."],
                            ["-IR", "vivir, escribir, abrir, decidir, recibir, subir", "жить, писать, открывать, решать, получать, подниматься", "Escribo un correo y abro la puerta."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Como una ensalada mixta y bebo agua mineral.", "ru": "Я ем смешанный салат и пью минеральную воду."},
            {"es": "¿Dónde vives tú? —Vivo en un apartamento en Madrid.", "ru": "Где ты живешь? —Я живу в квартире в Мадриде."},
            {"es": "Nosotros aprendemos mucho vocabulario en clase.", "ru": "Мы учим много лексики на уроке."},
            {"es": "Ella escribe correos electrónicos para su trabajo.", "ru": "Она пишет электронные письма по работе."},
            {"es": "Ellos comen en el restaurante a las dos de la tarde.", "ru": "Они обедают в ресторане в два часа дня."},
            {"es": "El camarero abre la ventana porque hace calor.", "ru": "Официант открывает окно, потому что жарко."},
            {"es": "¿Lees el periódico todos los días?", "ru": "Ты читаешь газету каждый день?"},
            {"es": "Comprendemos la gramática con las explicaciones del profesor.", "ru": "Мы понимаем грамматику благодаря объяснениям преподавателя."},
            {"es": "En esta tienda venden libros en español e inglés.", "ru": "В этом магазине продают книги на испанском и английском."},
            {"es": "Bebemos café con leche por las mañanas.", "ru": "Мы пьем кофе с молоком по утрам."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Nosotros vivemos» вместо «vivimos»",
                "correction": "Nosotros vivimos (-ir) / Nosotros comemos (-er)",
                "explanation": "Глаголы на -ir в форме nosotros получают окончание -IMOS (vivimos, escribimos), а не -emos."
            },
            {
                "mistake": "«Yo coma» или «Yo viva» в настоящем времени",
                "correction": "Yo como / Yo vivo (окончание -o для 1-го лица)",
                "explanation": "В 1-м лице единственного числа (yo) Presente у всех регулярных глаголов окончание всегда «-o»."
            },
            {
                "mistake": "«Tú comas» вместо «Tú comes»",
                "correction": "Tú comes / Tú vives (окончание -es)",
                "explanation": "Окончание -as принадлежит только спряжению на -ar. У -er и -ir окончание 2-го лица — «-es»."
            }
        ],
        "trapAlert": "Форма nosotros: у глаголов -ER окончание «-EMOS» (comemos), а у глаголов -IR окончание «-IMOS» (vivimos)!",
        "dialectNote": "При voseo (Аргентина, Уругвай): vos comés (ударение на -és), vos vivís (ударение на -ís), vos escribís.",
        "quiz": [
            {
                "question": "Какое окончание у глагола «comer» (-ER) для местоимения «nosotros»?",
                "type": "recognition",
                "options": ["-amos", "-emos", "-imos", "-en"],
                "correctIndex": 1,
                "explanations": [
                    "-amos — для глаголов на -ar.",
                    "Правильно: для -ER форма nosotros оканчивается на «-emos» (comemos).",
                    "-imos — для глаголов на -ir.",
                    "-en — для ellos/ustedes."
                ]
            },
            {
                "question": "Какое окончание у глагола «vivir» (-IR) для местоимения «nosotros»?",
                "type": "recognition",
                "options": ["-emos", "-imos", "-amos", "-ís"],
                "correctIndex": 1,
                "explanations": [
                    "-emos — для глаголов на -er.",
                    "Правильно: для -IR форма nosotros оканчивается на «-imos» (vivimos).",
                    "-amos — для глаголов на -ar.",
                    "-ís — для vosotros."
                ]
            },
            {
                "question": "Какая форма глагола «escribir» соответствует «él / ella / usted»?",
                "type": "recognition",
                "options": ["escribo", "escribes", "escribe", "escriben"],
                "correctIndex": 2,
                "explanations": [
                    "Escribo — yo.",
                    "Escribes — tú.",
                    "Правильно: él/ella/usted «escribe» (окончание -e).",
                    "Escriben — ellos/ustedes."
                ]
            },
            {
                "question": "Какая форма глагола «beber» соответствует «tú»?",
                "type": "recognition",
                "options": ["bebo", "bebes", "bebe", "beben"],
                "correctIndex": 1,
                "explanations": [
                    "Bebo — yo.",
                    "Правильно: tú «bebes» (окончание -es).",
                    "Bebe — él/ella/usted.",
                    "Beben — ellos/ustedes."
                ]
            },
            {
                "question": "Вставьте глагол: «Mis amigos ____ (жить) en el centro de Sevilla.»",
                "type": "application",
                "options": ["vive", "viven", "vivimos", "vivo"],
                "correctIndex": 1,
                "explanations": [
                    "Vive — единственное число.",
                    "Правильно: mis amigos = ellos → «viven».",
                    "Vivimos — мы.",
                    "Vivo — я."
                ]
            },
            {
                "question": "Вставьте глагол: «Nosotros ____ (есть) paella los domingos.»",
                "type": "application",
                "options": ["comemos", "comimos", "coman", "como"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: nosotros «comemos» (глагол на -er).",
                    "Comimos — прошедшее время (Pretérito Indefinido).",
                    "Coman — сослагательное/повелительное.",
                    "Como — я."
                ]
            },
            {
                "question": "Вставьте глагол: «Yo ____ (читать) un libro en español cada noche.»",
                "type": "application",
                "options": ["leo", "lees", "lee", "leemos"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: yo «leo».",
                    "Lees — tú.",
                    "Lee — él/ella.",
                    "Leemos — nosotros."
                ]
            },
            {
                "question": "Вставьте глагол: «¿Qué ____ (пить) ustedes para cenar?»",
                "type": "application",
                "options": ["bebo", "bebes", "bebe", "beben"],
                "correctIndex": 3,
                "explanations": [
                    "Bebo — yo.",
                    "Bebes — tú.",
                    "Bebe — usted (ед. ч.).",
                    "Правильно: ustedes «beben» (3 лицо мн. число)."
                ]
            },
            {
                "question": "Официант спрашивает, что вы будете пить. Вы хотите минеральную воду. Ваш ответ:",
                "type": "transfer",
                "options": ["Bebo agua mineral, por favor.", "Bebes agua mineral, por favor.", "Beber agua mineral, por favor.", "Beben agua mineral, por favor."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Bebo agua mineral, por favor» (1-е лицо ед. ч. yo).",
                    "Bebes — форма tú.",
                    "Инфинитив.",
                    "Beben — они/вы (мн. ч.)."
                ]
            },
            {
                "question": "Как рассказать о друге: «Он живет в Мадриде и пишет статьи для газеты»?",
                "type": "transfer",
                "options": [
                    "Vive en Madrid y escribe artículos para el periódico.",
                    "Vives en Madrid y escribes artículos para el periódico.",
                    "Vivo en Madrid y escribo artículos para el periódico.",
                    "Viven en Madrid y escriben artículos para el periódico."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Vive en Madrid y escribe...» (3 лицо ед. ч. для он/él).",
                    "Формы 2 лица (tú).",
                    "Формы 1 лица (yo).",
                    "Формы мн. числа (ellos)."
                ]
            },
            {
                "question": "Как сказать «Мы учим много испанских слов на каждом уроке»?",
                "type": "transfer",
                "options": [
                    "Aprendemos muchas palabras de español en cada clase.",
                    "Aprendamos muchas palabras de español en cada clase.",
                    "Aprendo muchas palabras de español en cada clase.",
                    "Aprenden muchas palabras de español en cada clase."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Aprendemos...» (aprender + emos для nosotros).",
                    "Aprendamos — сослагательное наклонение.",
                    "Aprendo — только я.",
                    "Aprenden — они."
                ]
            },
            {
                "question": "В Аргентине вас спрашивают: «¿Dónde vivís vos?». Как ответить, что вы живете в Буэнос-Айресе?",
                "type": "transfer",
                "options": ["Vivo en Buenos Aires.", "Vivís en Buenos Aires.", "Vive en Buenos Aires.", "Vivimos en Buenos Aires."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: на вопрос к вам («vivís vos?») вы отвечаете в 1-м лице: «Vivo en Buenos Aires».",
                    "Vivís — форма ты (vos).",
                    "Vive — он/она.",
                    "Vivimos — мы."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-3-01",
                "type": "choice",
                "question": "Какая форма глагола «comer» соответствует «yo»?",
                "options": ["como", "comes", "come", "comen"],
                "correctAnswer": "como",
                "explanation": "yo como."
            },
            {
                "id": "ex-3-02",
                "type": "gap",
                "question": "Nosotros ____ (жить - vivir) en una casa bonita cerca del mar.",
                "correctAnswer": "vivimos",
                "acceptableAnswers": ["vivimos", "Vivimos"],
                "explanation": "nosotros vivimos."
            },
            {
                "id": "ex-3-03",
                "type": "tiles",
                "question": "Соберите предложение: «Я пью воду и ем салат.»",
                "tiles": ["Bebo", "agua", "y", "como", "ensalada."],
                "correctAnswer": "Bebo agua y como ensalada.",
                "explanation": "Bebo agua y como ensalada."
            },
            {
                "id": "ex-3-04",
                "type": "transformation",
                "question": "Поставьте глагол «beber» в форму 2-го лица (tú): «Yo bebo» → «Tú ____»",
                "prompt": "beber (tú) → ____",
                "correctAnswer": "bebes",
                "acceptableAnswers": ["bebes", "Bebes"],
                "explanation": "tú bebes."
            },
            {
                "id": "ex-3-05",
                "type": "input",
                "question": "Напишите форму глагола «escribir» для «él / ella»:",
                "correctAnswer": "escribe",
                "acceptableAnswers": ["escribe", "Escribe"],
                "explanation": "él/ella escribe."
            },
            {
                "id": "ex-3-06",
                "type": "gap",
                "question": "Mis hermanos ____ (учить - aprender) español en la escuela.",
                "correctAnswer": "aprenden",
                "acceptableAnswers": ["aprenden", "Aprenden"],
                "explanation": "aprenden."
            },
            {
                "id": "ex-3-07",
                "type": "choice",
                "question": "Какая форма глагола «abrir» соответствует «él»?",
                "options": ["abre", "abro", "abres", "abren"],
                "correctAnswer": "abre",
                "explanation": "él abre."
            },
            {
                "id": "ex-3-08",
                "type": "input",
                "question": "Напишите форму глагола «comer» для «nosotros»:",
                "correctAnswer": "comemos",
                "acceptableAnswers": ["comemos", "Comemos"],
                "explanation": "nosotros comemos."
            },
            {
                "id": "ex-3-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «Él vive en Madrid» → «Ellos ____ en Madrid»",
                "prompt": "vive → ____",
                "correctAnswer": "viven",
                "acceptableAnswers": ["viven", "Viven"],
                "explanation": "ellos viven."
            },
            {
                "id": "ex-3-10",
                "type": "tiles",
                "question": "Соберите фразу: «Она пишет письмо своей подруге.»",
                "tiles": ["Ella", "escribe", "una", "carta", "a", "su", "amiga."],
                "correctAnswer": "Ella escribe una carta a su amiga.",
                "explanation": "Ella escribe una carta a su amiga."
            },
            {
                "id": "ex-3-11",
                "type": "gap",
                "question": "El alumno ____ (отвечать - responder) a las preguntas del profesor.",
                "correctAnswer": "responde",
                "acceptableAnswers": ["responde", "Responde"],
                "explanation": "el alumno responde."
            },
            {
                "id": "ex-3-12",
                "type": "choice",
                "question": "Что означает «Leemos el periódico»?",
                "options": ["Мы читаем газету", "Они читают книгу", "Я пишу письмо", "Ты слушаешь музыку"],
                "correctAnswer": "Мы читаем газету",
                "explanation": "Leemos = мы читаем."
            },
            {
                "id": "ex-3-13",
                "type": "input",
                "question": "Напишите форму глагола «leer» для «yo»:",
                "correctAnswer": "leo",
                "acceptableAnswers": ["leo", "Leo"],
                "explanation": "yo leo."
            },
            {
                "id": "ex-3-14",
                "type": "transformation",
                "question": "Замените форму tú на аргентинское voseo: «tú comes» → «vos ____»",
                "prompt": "tú comes → vos ____",
                "correctAnswer": "comés",
                "acceptableAnswers": ["comés", "comes", "Comés"],
                "explanation": "vos comés."
            },
            {
                "id": "ex-3-15",
                "type": "tiles",
                "question": "Соберите предложение: «В этой лавке продают свежий хлеб.»",
                "tiles": ["En", "esta", "tienda", "venden", "pan", "fresco."],
                "correctAnswer": "En esta tienda venden pan fresco.",
                "explanation": "En esta tienda venden pan fresco."
            },
            {
                "id": "ex-3-16",
                "type": "gap",
                "question": "¿Qué ____ (пить - beber) tú cuando tienes sed?",
                "correctAnswer": "bebes",
                "acceptableAnswers": ["bebes", "Bebes"],
                "explanation": "tú bebes."
            },
            {
                "id": "ex-3-17",
                "type": "choice",
                "question": "Какая форма глагола «vivir» соответствует «vosotros» (Испания)?",
                "options": ["vivís", "vivéis", "viven", "vivimos"],
                "correctAnswer": "vivís",
                "explanation": "vosotros vivís."
            },
            {
                "id": "ex-3-18",
                "type": "input",
                "question": "Напишите форму глагола «abrir» для «yo»:",
                "correctAnswer": "abro",
                "acceptableAnswers": ["abro", "Abro"],
                "explanation": "yo abro."
            },
            {
                "id": "ex-3-19",
                "type": "gap",
                "question": "Nosotros ____ (понимать - comprender) la lección perfectamente.",
                "correctAnswer": "comprendemos",
                "acceptableAnswers": ["comprendemos", "Comprendemos"],
                "explanation": "comprendemos."
            },
            {
                "id": "ex-3-20",
                "type": "tiles",
                "question": "Соберите вопрос: «Где вы живете, сеньор?»",
                "tiles": ["¿Dónde", "vive", "usted,", "señor?"],
                "correctAnswer": "¿Dónde vive usted, señor?",
                "explanation": "¿Dónde vive usted, señor?"
            },
            {
                "id": "ex-3-21",
                "type": "choice",
                "question": "Какая форма глагола «escribir» согласуется с «tú»?",
                "options": ["escribes", "escribo", "escribe", "escribís"],
                "correctAnswer": "escribes",
                "explanation": "tú escribes."
            },
            {
                "id": "ex-3-22",
                "type": "transformation",
                "question": "Поставьте глагол в форму 1-го лица ед. числа: «beber» → «____»",
                "prompt": "yo (beber) → ____",
                "correctAnswer": "bebo",
                "acceptableAnswers": ["bebo", "Bebo"],
                "explanation": "yo bebo."
            },
            {
                "id": "ex-3-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет глаголы на -er/-ir, время и семью?",
                "options": [
                    "Mi familia y yo comemos juntos a las dos de la tarde.",
                    "El mi familia y yo comer juntos son las dos.",
                    "Mi familia y yo están comer a las dos.",
                    "Mi familia y yo comen juntos en las dos."
                ],
                "correctAnswer": "Mi familia y yo comemos juntos a las dos de la tarde.",
                "explanation": "Mi familia y yo = nosotros → comemos + a las dos de la tarde (время)."
            },
            {
                "id": "ex-3-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Я живу в Мадриде и учу испанский»:",
                "correctAnswer": "Vivo en Madrid y aprendo español",
                "acceptableAnswers": [
                    "Vivo en Madrid y aprendo español",
                    "Vivo en Madrid y estudio español",
                    "Yo vivo en Madrid y aprendo español"
                ],
                "explanation": "Vivo en Madrid y aprendo español."
            }
        ],
        "miniScenario": {
            "title": "Заказ обеда в испанской таверне",
            "setting": "Традиционный ресторан в центре Севильи.",
            "situation": "Официант подходит к вашему столику и принимает заказ блюд и напитков.",
            "dialog": [
                {"speaker": "Camarero", "text": "¡Buenas tardes! ¿Qué van a comer hoy?"},
                {"speaker": "Tú", "text": "Buenas tardes. De primer plato como una sopa y de segundo plato como pescado."},
                {"speaker": "Camarero", "text": "¿Y para beber?"},
                {"speaker": "Tú", "text": "Bebo agua con gas y una copa de vino blanco, por favor."}
            ],
            "task": "Сделайте заказ первого блюда и напитка.",
            "prompt": "Как сказать официанту: «Я ем рыбу и пью воду»?",
            "options": [
                "Como pescado y bebo agua, por favor.",
                "Comes pescado y bebes agua, por favor.",
                "Comer pescado y beber agua, por favor.",
                "Comen pescado y beben agua, por favor."
            ],
            "correctIndex": 0,
            "explanation": "«Como pescado y bebo agua, por favor» — правильные формы 1-го лица единственного числа."
        },
        "shortText": {
            "title": "Los hábitos de los estudiantes en Salamanca",
            "text": "Los estudiantes de la Universidad de Salamanca tienen una vida muy activa. Viven en pisos compartidos o residencias cerca del campus histórico. Por las mañanas aprenden gramática y literatura en clase y escriben ensayos para sus profesores. A las dos y media comen en los comedores universitarios, donde beben agua o zumo y comparten anécdotas de sus países. Por las tardes leen en la biblioteca.",
            "questions": [
                {
                    "question": "¿Dónde viven los estudiantes de Salamanca?",
                    "options": ["En hoteles de lujo", "En pisos compartidos o residencias cerca del campus", "En otras ciudades", "En la biblioteca"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Viven en pisos compartidos o residencias cerca del campus...»."
                },
                {
                    "question": "¿Qué hacen los estudiantes en clase por las mañanas?",
                    "options": ["Duermen", "Aprenden gramática y escriben ensayos", "Cocinan paella", "Cantan canciones"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «aprenden gramática y literatura en clase y escriben ensayos...»."
                },
                {
                    "question": "¿Qué forma del verbo «beber» se usa para los estudiantes en el texto?",
                    "options": ["Bebo", "Bebes", "Bebe", "Beben"],
                    "correctIndex": 3,
                    "explanation": "В тексте: «donde beben agua o zumo» (ellos beben)."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Что я ем, пью, читаю и где живу (глаголы на -ER/-IR)",
            "prompt": "Напишите короткий текст (4-5 предложений), используя глаголы второго и третьего спряжений:\n1. Где вы живете (Vivo en...).\n2. Что вы обычно едите и пьете на завтрак или обед (Como..., bebo...).\n3. Что вы читаете или пишете по вечерам (Leo libros en español, escribo correos...).\n4. Что вы учите или понимаете (Aprendo vocabulario, comprendo la lección...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Спряжение глаголов на -ER и -IR", "points": 35, "description": "Правильное образование форм (como, bebo, vivo, escribo, aprendo, leo)."},
                    {"name": "Разнообразие глаголов", "points": 30, "description": "Использование минимум 4 различных глаголов на -ER и -IR."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Связно описаны привычки в еде, чтении и жизни."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное построение предложений."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 23: Basic food and drinks (comida y bebida)
    # ----------------------------------------------------
    23: {
        "id": 23,
        "topicName": "Basic food and drinks (comida y bebida)",
        "russianTitle": "Еда и напитки: базовые продукты, блюда и посуда",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u07-food",
        "icon": "☕",
        "summary": "Лексика по теме продуктов питания, традиционных испанских блюд, безалкогольных и алкогольных напитков, посуды и столовых приборов (el plato, el vaso, la copa, el tenedor, el cuchillo, la cuchara).",
        "mnemonicRule": "Завтрак = el desayuno, Обед = el almuerzo / la comida, Ужин = la cena. Кофе с молоком = café con leche, без сахара = sin azúcar.",
        "goalsRu": [
            "Знать названия базовых продуктов (хлеб, сыр, масло, молоко, мясо, рыба, яйца, овощи, фрукты)",
            "Знать названия традиционных блюд (tortilla española, paella, jamón serrano, tapas)",
            "Называть напитки (agua con/sin gas, café solo/con leche, té, vino tinto/blanco, cerveza, zumo/jugo)",
            "Называть посуду и приборы (vaso, copa, taza, plato, tenedor, cuchillo, cuchara, servilleta)"
        ],
        "sections": [
            {
                "title": "1. Основные группы продуктов и напитков",
                "content": "Базовый словарный запас для похода в супермаркет и ресторан:",
                "tables": [
                    {
                        "headers": ["Категория", "Испанские слова", "Русский перевод"],
                        "rows": [
                            ["Напитки (Bebidas)", "el agua, la leche, el café, el té, el zumo (jugo), el vino, la cerveza", "вода, молоко, кофе, чай, сок, вино, пиво"],
                            ["Основные продукты", "el pan, el queso, la mantequilla, el aceite de oliva, los huevos, el arroz", "хлеб, сыр, сливочное масло, оливковое масло, яйца, рис"],
                            ["Мясо и рыба", "la carne, el pollo, el pescado, el jamón serrano", "мясо, курица, рыба, хамон серрано"],
                            ["Овощи и зелень", "el tomate, la patata (papa), la cebolla, el ajo, la lechuga, la zanahoria", "помидор, картофель, лук, чеснок, салат, морковь"],
                            ["Фрукты", "la manzana, el plátano (banana), la naranja, el limón, la fresa (frutilla)", "яблоко, банан, апельсин, лимон, клубника"],
                            ["Посуда и приборы", "el plato, el vaso, la copa, la taza, el tenedor, el cuchillo, la cuchara, la servilleta", "тарелка, стакан, бокал, чашка, вилка, нож, ложка, салфетка"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Desayuno café con leche y una tostada con aceite de oliva.", "ru": "Я завтракаю кофе с молоком и тостом с оливковым маслом."},
            {"es": "Para la ensalada necesito tomates, cebolla y lechuga.", "ru": "Для салата мне нужны помидоры, лук и листья салата."},
            {"es": "La tortilla de patatas lleva huevos, patatas y cebolla.", "ru": "В картофельную тортилью входят яйца, картофель и лук."},
            {"es": "Una botella de agua mineral sin gas, por favor.", "ru": "Бутылку минеральной воды без газа, пожалуйста."},
            {"es": "Compro medio kilo de queso y un pan fresco.", "ru": "Я покупаю полкилограмма сыра и свежий хлеб."},
            {"es": "Necesito un tenedor limpio y una servilleta.", "ru": "Мне нужна чистая вилка и салфетка."},
            {"es": "¿Prefieres vino tinto o vino blanco?", "ru": "Ты предпочитаешь красное или белое вино?"},
            {"es": "Las naranjas de Valencia son muy dulces y jugosas.", "ru": "Апельсины из Валенсии очень сладкие и сочные."},
            {"es": "De postre quiero un helado de chocolate.", "ru": "На десерт я хочу шоколадное мороженое."},
            {"es": "El pescado al horno con patatas está delicioso.", "ru": "Запеченная рыба с картофелем восхитительна."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Un vaso de vino» вместо «una copa de vino»",
                "correction": "una copa de vino / un vaso de agua",
                "explanation": "Вино наливают в бокал (la copa), а воду и сок — в стакан (el vaso)."
            },
            {
                "mistake": "«El agua fría» считают мужским родом из-за артикля «el»",
                "correction": "El agua está fría / limpia (прилагательные в женском роде!)",
                "explanation": "Слово «agua» — женского рода. Артикль «el» ставится только для благозвучия перед ударной «а-», но прилагательные согласуются в женском роде (agua fría)."
            },
            {
                "mistake": "«Pescado» путают с «pez»",
                "correction": "Pescado (блюдо/еда) vs Pez (живая рыба в воде)",
                "explanation": "В кулинарии и магазине всегда говорят «pescado»."
            }
        ],
        "trapAlert": "«AGUA» — женского рода: «el agua FRÍA», «el agua PURA»!",
        "dialectNote": "Картофель в Испании — «patata», в Латинской Америке — «papa». Сок в Испании — «zumo», в Латинской Америке — «jugo». Клубника в Аргентине — «frutilla», в Испании — «fresa».",
        "quiz": [
            {
                "question": "В какую посуду наливают вино в ресторане?",
                "type": "recognition",
                "options": ["en un vaso", "en una copa", "en una taza", "en un plato"],
                "correctIndex": 1,
                "explanations": [
                    "Vaso — стакан (для воды или сока).",
                    "Правильно: вино наливают в бокал («una copa de vino»).",
                    "Taza — чашка (для чая/кофе).",
                    "Plato — тарелка."
                ]
            },
            {
                "question": "Какого рода слово «agua» в испанском языке?",
                "type": "recognition",
                "options": ["Мужского", "Женского", "Среднего", "Обоих родов"],
                "correctIndex": 1,
                "explanations": [
                    "Артикль el используется только для благозвучия, но род — женский.",
                    "Правильно: «agua» — существительное женского рода (el agua fría).",
                    "В испанском языке нет среднего рода для существительных.",
                    "Неверно."
                ]
            },
            {
                "question": "Какой столовый прибор используют для супа?",
                "type": "recognition",
                "options": ["el tenedor", "el cuchillo", "la cuchara", "la servilleta"],
                "correctIndex": 2,
                "explanations": [
                    "Tenedor — вилка.",
                    "Cuchillo — нож.",
                    "Правильно: «la cuchara» — ложка.",
                    "Servilleta — салфетка."
                ]
            },
            {
                "question": "Какие обязательные ингредиенты входят в классическую испанскую тортилью?",
                "type": "recognition",
                "options": ["Arroz y pescado", "Huevos y patatas", "Pan y mantequilla", "Pollo y lechuga"],
                "correctIndex": 1,
                "explanations": [
                    "Рис и рыба входят в паэлью.",
                    "Правильно: «tortilla española» готовится из яиц и картофеля (huevos y patatas).",
                    "Хлеб и масло.",
                    "Курица и салат."
                ]
            },
            {
                "question": "Вставьте форму прилагательного: «Bebo un vaso de agua ____ (холодный).»",
                "type": "application",
                "options": ["frío", "fría", "fríos", "frías"],
                "correctIndex": 1,
                "explanations": [
                    "Слово agua женского рода, поэтому frío ошибочно.",
                    "Правильно: «agua fría» (женский род).",
                    "Множественное число мужского рода.",
                    "Множественное число женского рода."
                ]
            },
            {
                "question": "Какое слово обозначает красное вино в испанском языке?",
                "type": "application",
                "options": ["vino rojo", "vino tinto", "vino negro", "vino caliente"],
                "correctIndex": 1,
                "explanations": [
                    "«Vino rojo» — калька, в испанском так не говорят.",
                    "Правильно: красное вино называется строго «vino tinto».",
                    "Неверно.",
                    "Горячее вино."
                ]
            },
            {
                "question": "Как сказать «апельсиновый сок» в Испании?",
                "type": "application",
                "options": ["zumo de naranja", "agua de naranja", "leche de naranja", "vino de naranja"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «zumo de naranja» (или «jugo de naranja» в Латинской Америке).",
                    "Неверно.",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Как называется утренний прием пищи?",
                "type": "application",
                "options": ["el almuerzo", "el desayuno", "la cena", "la merienda"],
                "correctIndex": 1,
                "explanations": [
                    "Almuerzo — обед.",
                    "Правильно: «el desayuno» — завтрак.",
                    "Cena — ужин.",
                    "Merienda — полдник."
                ]
            },
            {
                "question": "Вам принесли прибор без ножа для мяса. Как попросить нож у официанта?",
                "type": "transfer",
                "options": [
                    "Camarero, ¿me trae un cuchillo, por favor?",
                    "Camarero, ¿me trae una cuchara, por favor?",
                    "Camarero, ¿me trae un tenedor, por favor?",
                    "Camarero, ¿me trae un vaso de vino?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «un cuchillo» — нож.",
                    "Cuchara — ложка.",
                    "Tenedor — вилка.",
                    "Vaso de vino — стакан вина."
                ]
            },
            {
                "question": "В супермаркете вы ищете оливковое масло. Что спросить у работника зала?",
                "type": "transfer",
                "options": [
                    "Disculpe, ¿dónde está el aceite de oliva?",
                    "Disculpe, ¿dónde está la mantequilla de oliva?",
                    "Disculpe, ¿dónde está el vinagre dulce?",
                    "Disculpe, ¿dónde está la leche con sal?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «el aceite de oliva» — оливковое масло.",
                    "Mantequilla — сливочное масло.",
                    "Vinagre — уксус.",
                    "Бессмысленно."
                ]
            },
            {
                "question": "Вы заказываете кофе и не хотите сахар. Как сказать бариста?",
                "type": "transfer",
                "options": ["Un café solo sin azúcar, por favor.", "Un café con azúcar mucho.", "Un café de leche y sal.", "Un té frío de azúcar."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Un café solo sin azúcar, por favor» (черный кофе без сахара).",
                    "С большим количеством сахара.",
                    "С молоком и солью.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Как спросить у друга: «Что ты предпочитаешь на десерт: фрукты или шоколадное мороженое?»?",
                "type": "transfer",
                "options": [
                    "¿Qué prefieres de postre: fruta o helado de chocolate?",
                    "¿Qué prefieres de comida: sopa o carne?",
                    "¿Qué prefieres de desayuno: agua o sal?",
                    "¿Qué prefieres de bebida: tenedor o cuchillo?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Qué prefieres de postre: fruta o helado de chocolate?» (десерт, фрукты, мороженое).",
                    "Вопрос об основном обеде.",
                    "Неверно.",
                    "Смешение напитков и приборов."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-23-01",
                "type": "choice",
                "question": "Какой напиток получают из апельсинов?",
                "options": ["el zumo de naranja", "la leche", "el vino tinto", "el té caliente"],
                "correctAnswer": "el zumo de naranja",
                "explanation": "zumo de naranja = апельсиновый сок."
            },
            {
                "id": "ex-23-02",
                "type": "gap",
                "question": "Pongo aceite de ____ (олива) en la ensalada.",
                "correctAnswer": "oliva",
                "acceptableAnswers": ["oliva", "Oliva"],
                "explanation": "aceite de oliva."
            },
            {
                "id": "ex-23-03",
                "type": "tiles",
                "question": "Соберите фразу: «Один кофе с молоком без сахара, пожалуйста.»",
                "tiles": ["Un", "café", "con", "leche", "sin", "azúcar,", "por", "favor."],
                "correctAnswer": "Un café con leche sin azúcar, por favor.",
                "explanation": "Un café con leche sin azúcar, por favor."
            },
            {
                "id": "ex-23-04",
                "type": "transformation",
                "question": "Поставьте прилагательное в женский род для «вода»: «el agua ____ (холодный)»",
                "prompt": "frío → ____",
                "correctAnswer": "fría",
                "acceptableAnswers": ["fría", "fria", "Fría"],
                "explanation": "el agua fría (женский род)."
            },
            {
                "id": "ex-23-05",
                "type": "input",
                "question": "Напишите по-испански слово «сыр»:",
                "correctAnswer": "queso",
                "acceptableAnswers": ["queso", "el queso", "Queso", "El queso"],
                "explanation": "el queso."
            },
            {
                "id": "ex-23-06",
                "type": "gap",
                "question": "Para comer la carne necesito un tenedor y un ____ (нож).",
                "correctAnswer": "cuchillo",
                "acceptableAnswers": ["cuchillo", "Cuchillo"],
                "explanation": "el cuchillo = нож."
            },
            {
                "id": "ex-23-07",
                "type": "choice",
                "question": "В какую посуду наливают горячий чай?",
                "options": ["en una taza", "en un plato", "en un tenedor", "en una servilleta"],
                "correctAnswer": "en una taza",
                "explanation": "taza = чашка."
            },
            {
                "id": "ex-23-08",
                "type": "input",
                "question": "Напишите по-испански слово «хлеб»:",
                "correctAnswer": "pan",
                "acceptableAnswers": ["pan", "el pan", "Pan", "El pan"],
                "explanation": "el pan."
            },
            {
                "id": "ex-23-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la manzana» → «las ____»",
                "prompt": "la manzana → ____",
                "correctAnswer": "manzanas",
                "acceptableAnswers": ["manzanas", "las manzanas", "Manzanas"],
                "explanation": "las manzanas."
            },
            {
                "id": "ex-23-10",
                "type": "tiles",
                "question": "Соберите предложение: «На десерт мы заказываем шоколадное мороженое.»",
                "tiles": ["De", "postre", "pedimos", "helado", "de", "chocolate."],
                "correctAnswer": "De postre pedimos helado de chocolate.",
                "explanation": "De postre pedimos helado de chocolate."
            },
            {
                "id": "ex-23-11",
                "type": "gap",
                "question": "Una botella de agua mineral ____ (без) gas, por favor.",
                "correctAnswer": "sin",
                "acceptableAnswers": ["sin", "Sin"],
                "explanation": "sin gas."
            },
            {
                "id": "ex-23-12",
                "type": "choice",
                "question": "Какое блюдо готовится из риса и морепродуктов/курицы в Испании?",
                "options": ["la paella", "la tortilla", "el gazpacho", "el bocadillo"],
                "correctAnswer": "la paella",
                "explanation": "la paella."
            },
            {
                "id": "ex-23-13",
                "type": "input",
                "question": "Напишите по-испански слово «вилка»:",
                "correctAnswer": "el tenedor",
                "acceptableAnswers": ["el tenedor", "tenedor", "Tenedor", "El tenedor"],
                "explanation": "el tenedor."
            },
            {
                "id": "ex-23-14",
                "type": "transformation",
                "question": "Замените «белое вино» на «красное вино» по-испански: «vino blanco» → «vino ____»",
                "prompt": "vino blanco → vino ____",
                "correctAnswer": "tinto",
                "acceptableAnswers": ["tinto", "Tinto"],
                "explanation": "vino tinto."
            },
            {
                "id": "ex-23-15",
                "type": "tiles",
                "question": "Соберите фразу: «В тортилью кладут яйца и картофель.»",
                "tiles": ["La", "tortilla", "lleva", "huevos", "y", "patatas."],
                "correctAnswer": "La tortilla lleva huevos y patatas.",
                "explanation": "La tortilla lleva huevos y patatas."
            },
            {
                "id": "ex-23-16",
                "type": "gap",
                "question": "Tomo la sopa caliente con una ____ (ложка).",
                "correctAnswer": "cuchara",
                "acceptableAnswers": ["cuchara", "Cuchara"],
                "explanation": "la cuchara."
            },
            {
                "id": "ex-23-17",
                "type": "choice",
                "question": "Какой продукт делают из молока?",
                "options": ["el queso", "el pan", "el vino", "el arroz"],
                "correctAnswer": "el queso",
                "explanation": "queso = сыр."
            },
            {
                "id": "ex-23-18",
                "type": "input",
                "question": "Напишите по-испански слово «салфетка»:",
                "correctAnswer": "la servilleta",
                "acceptableAnswers": ["la servilleta", "servilleta", "Servilleta", "La servilleta"],
                "explanation": "la servilleta."
            },
            {
                "id": "ex-23-19",
                "type": "gap",
                "question": "Compro medio kilo de ____ (помидоры - tomate).",
                "correctAnswer": "tomates",
                "acceptableAnswers": ["tomates", "Tomates"],
                "explanation": "tomates."
            },
            {
                "id": "ex-23-20",
                "type": "tiles",
                "question": "Соберите предложение: «Одна чашка чая с лимоном, пожалуйста.»",
                "tiles": ["Una", "taza", "de", "té", "con", "limón,", "por", "favor."],
                "correctAnswer": "Una taza de té con limón, por favor.",
                "explanation": "Una taza de té con limón, por favor."
            },
            {
                "id": "ex-23-21",
                "type": "choice",
                "question": "Как называется вечерний прием пищи?",
                "options": ["la cena", "el desayuno", "el almuerzo", "el postre"],
                "correctAnswer": "la cena",
                "explanation": "la cena = ужин."
            },
            {
                "id": "ex-23-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el pez» → «los ____» / «el pescado» → «los ____»",
                "prompt": "el pescado → ____",
                "correctAnswer": "los pescados",
                "acceptableAnswers": ["los pescados", "pescados", "Pescados"],
                "explanation": "los pescados."
            },
            {
                "id": "ex-23-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет глагол comer, время и продукты?",
                "options": [
                    "A las dos de la tarde como pollo con arroz y ensalada.",
                    "Son las dos de la tarde como pollo de arroz.",
                    "En dos horas como pollo con arroz.",
                    "A la dos de la tarde comer pollo con arroz."
                ],
                "correctAnswer": "A las dos de la tarde como pollo con arroz y ensalada.",
                "explanation": "A las dos de la tarde (время) + como (глагол -er) + pollo con arroz (еда)."
            },
            {
                "id": "ex-23-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня есть сыр, хлеб и оливковое масло»:",
                "correctAnswer": "Tengo queso, pan y aceite de oliva",
                "acceptableAnswers": [
                    "Tengo queso, pan y aceite de oliva",
                    "Tengo queso, pan y aceite",
                    "tengo queso, pan y aceite de oliva"
                ],
                "explanation": "Tengo queso, pan y aceite de oliva."
            }
        ],
        "miniScenario": {
            "title": "Покупка свежих продуктов на рынке",
            "setting": "Рыночный прилавок в Мадриде.",
            "situation": "Вы покупаете фрукты и овощи у продавца на рынке. Уточните вес и цену.",
            "dialog": [
                {"speaker": "Vendedor", "text": "¡Buenos días! ¿Qué le pongo hoy?"},
                {"speaker": "Tú", "text": "Buenos días. Póngame un kilo de manzanas rojas y medio kilo de tomates, por favor."},
                {"speaker": "Vendedor", "text": "Aquí tiene, todo muy fresco. ¿Desea algo más?"},
                {"speaker": "Tú", "text": "Nada más, ¿cuánto cuesta en total?"},
                {"speaker": "Vendedor", "text": "Son cuatro euros con cincuenta céntimos."}
            ],
            "task": "Закажите килограмм яблок и полкилограмма помидоров.",
            "prompt": "Как попросить килограмм яблок и полкилограмма помидоров?",
            "options": [
                "Un kilo de manzanas y medio kilo de tomates, por favor.",
                "Un kilo de manzana y medio kilo de tomate, de nada.",
                "Una taza de manzanas y un vaso de tomates.",
                "Tengo un kilo de manzanas rojas."
            ],
            "correctIndex": 0,
            "explanation": "«Un kilo de manzanas y medio kilo de tomates, por favor» — правильный заказ продуктов."
        },
        "shortText": {
            "title": "El desayuno tradicional español",
            "text": "El desayuno en España es ligero pero muy sabroso. La mayoría de la gente toma un café con leche caliente y una tostada de pan con tomate y aceite de oliva virgen. Muchas personas también beben un vaso de zumo de naranja natural recién exprimido. En los fines de semana, es muy popular comer churros con chocolate caliente en una chocolatería tradicional con amigos o en familia.",
            "questions": [
                {
                    "question": "¿Qué lleva la tostada del desayuno tradicional?",
                    "options": ["Mantequilla y azúcar", "Tomate y aceite de oliva virgen", "Queso y huevo", "Pescado y limón"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «una tostada de pan con tomate y aceite de oliva virgen»."
                },
                {
                    "question": "¿Qué beben muchas personas además del café?",
                    "options": ["Vino tinto", "Cerveza", "Un vaso de zumo de naranja natural", "Sopa caliente"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «un vaso de zumo de naranja natural recién exprimido»."
                },
                {
                    "question": "¿Qué comen los fines de semana en las chocolaterías?",
                    "options": ["Paella", "Churros con chocolate caliente", "Pollo con arroz", "Ensalada mixta"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «comer churros con chocolate caliente en una chocolatería tradicional»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Мое ежедневное меню (завтрак, обед, ужин)",
            "prompt": "Напишите короткий текст (4-5 предложений) о том, что вы едите и пьете в течение дня:\n1. Что вы едите и пьете на завтрак (Para desayunar tomo/como... y bebo...).\n2. Что вы заказываете или готовите на обед (Para almorzar/comer como...).\n3. Что вы предпочитаете на ужин (Para cenar prefiero...).\n4. Назовите ваш любимый десерт и напиток (Mi postre favorito es..., mi bebida favorita es...).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Лексика еды и напитков", "points": 35, "description": "Точное использование названий продуктов (pan, queso, café, leche, zumo, ensalada, carne...)."},
                    {"name": "Глаголы питания (desayunar, comer, beber, cenar)", "points": 30, "description": "Правильное спряжение глаголов в 1-м лице."},
                    {"name": "Согласование по роду и числу", "points": 20, "description": "Согласование артиклей и прилагательных (agua fría, zumo natural...)."},
                    {"name": "Связность и пунктуация", "points": 15, "description": "Логичное построение текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 29: Ordering food (pedir comida)
    # ----------------------------------------------------
    29: {
        "id": 29,
        "topicName": "Ordering food (pedir comida)",
        "russianTitle": "Заказ еды в ресторане и кафе: этикет и фразы",
        "level": "A1",
        "category": "Speaking",
        "unitId": "a1-u07-food",
        "icon": "📝",
        "summary": "Как вести диалог в кафе и ресторане: забронировать столик, попросить меню (la carta / el menú), заказать первое и второе блюдо, попросить счет (la cuenta, por favor), уточнить способ оплаты (con tarjeta / en efectivo) и оставить чаевые.",
        "mnemonicRule": "Заказ: «Para mí, de primero... de segundo... para beber...». Просьба: «¿Me trae...? / Quería...». Счёт: «La cuenta, por favor».",
        "goalsRu": [
            "Просить столик на определенное количество человек: «Una mesa para dos, por favor»",
            "Заказывать блюда из меню: «De primero quiero..., de segundo..., de postre...»",
            "Вежливо просить счет: «La cuenta, por favor»",
            "Уточнять способ оплаты картой или наличными: «¿Puedo pagar con tarjeta?»"
        ],
        "sections": [
            {
                "title": "1. Основные фразы для заказа в ресторане",
                "content": "Пошаговый сценарий общения с официантом:",
                "tables": [
                    {
                        "headers": ["Этап", "Реплика гостя", "Русский перевод"],
                        "rows": [
                            ["Вход в ресторан", "¡Hola! Una mesa para dos personas, por favor.", "Здравствуйте! Столик на двоих, пожалуйста."],
                            ["Просьба меню", "¿Nos trae la carta / el menú del día, por favor?", "Принесите нам меню / меню дня, пожалуйста."],
                            ["Первое блюдо", "De primero, para mí la sopa de verduras.", "На первое для меня овощной суп."],
                            ["Второе блюдо", "De segundo, el pollo con patatas.", "На второе — курицу с картофелем."],
                            ["Напиток", "Para beber, una botella de agua sin gas.", "Попить — бутылку воды без газа."],
                            ["Десерт", "¿Qué tienen de postre hoy?", "Что у вас сегодня на десерт?"],
                            ["Просьба счета", "Camarero, la cuenta, por favor.", "Официант, счет, пожалуйста."],
                            ["Оплата", "¿Se puede pagar con tarjeta?", "Можно оплатить картой?"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Buenas tardes, una mesa para tres en la terraza, por favor.", "ru": "Добрый день, столик на троих на террасе, пожалуйста."},
            {"es": "¿Tienen menú del día?", "ru": "У вас есть комплексный обед (меню дня)?"},
            {"es": "Para mí, de primero la ensalada mixta y de segundo el pescado.", "ru": "Для меня на первое — смешанный салат, на второе — рыба."},
            {"es": "¿Me trae un poco más de pan y una botella de agua?", "ru": "Принесете еще немного хлеба и бутылку воды?"},
            {"es": "El plato está delicioso, felicidades al cocinero.", "ru": "Блюдо восхитительное, поздравления повару."},
            {"es": "La cuenta, por favor, cuando pueda.", "ru": "Счет, пожалуйста, как сможете."},
            {"es": "¿Aceptan tarjeta de crédito o solo efectivo?", "ru": "Вы принимаете кредитные карты или только наличные?"},
            {"es": "Muchas gracias, quédese con el cambio (de propina).", "ru": "Большое спасибо, сдачу оставьте себе (на чай)."},
            {"es": "¿Qué me recomienda de la casa?", "ru": "Что вы мне посоветуете из фирменных блюд?"},
            {"es": "Para mí un café solo con hielo, por favor.", "ru": "Для меня черный кофе со льдом, пожалуйста."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Yo quiero la cuenta» в грубой форме без «por favor»",
                "correction": "La cuenta, por favor / ¿Me trae la cuenta, por favor?",
                "explanation": "В испанском этикете фраза «La cuenta, por favor» является нормой вежливости."
            },
            {
                "mistake": "«Pagar por tarjeta» вместо «con tarjeta»",
                "correction": "pagar con tarjeta / pagar en efectivo",
                "explanation": "Способ оплаты выражается предлогом «con» (con tarjeta) или «en» (en efectivo)."
            },
            {
                "mistake": "«Un mesa» вместо «una mesa»",
                "correction": "una mesa para dos",
                "explanation": "Слово «mesa» — женского рода: una mesa."
            }
        ],
        "trapAlert": "Оплата: «con tarjeta» (картой) и «en efectivo» (наличными). Счёт: «La cuenta, por favor»!",
        "dialectNote": "Официанта в Испании зовут «camarero», в Мексике — «mesero», в Аргентине и Уругвае — «mozo».",
        "quiz": [
            {
                "question": "Как вежливо попросить счет в ресторане?",
                "type": "recognition",
                "options": ["La cuenta, por favor.", "El dinero, por favor.", "El precio, por favor.", "La factura ahora."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «La cuenta, por favor» — универсальная и вежливая фраза.",
                    "El dinero означает «деньги».",
                    "El precio означает «цена».",
                    "Factura — официальный счет-фактура."
                ]
            },
            {
                "question": "Как сказать «Столик на двоих, пожалуйста»?",
                "type": "recognition",
                "options": ["Una mesa para dos, por favor.", "Un mesa para dos, por favor.", "La mesa dos personas.", "Dos mesas para uno."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Una mesa para dos, por favor» (женский род una mesa).",
                    "Mesa женского рода, «un mesa» ошибка.",
                    "Неграмотно.",
                    "Означает «два стола на одного»."
                ]
            },
            {
                "question": "Как спросить о возможности безналичной оплаты?",
                "type": "recognition",
                "options": ["¿Puedo pagar con tarjeta?", "¿Puedo pagar en tarjeta?", "¿Puedo pagar de tarjeta?", "¿Puedo tarjeta pagar?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «pagar con tarjeta» (предлог con).",
                    "«En tarjeta» — ошибка предлога.",
                    "«De tarjeta» — ошибка.",
                    "Неверный порядок слов."
                ]
            },
            {
                "question": "Как называется комплексный обед в Испании?",
                "type": "recognition",
                "options": ["El menú del día", "La carta del día", "El plato del día", "El precio del día"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «El menú del día» — комплексное меню дня (первое, второе, хлеб, напиток и десерт по фиксированной цене).",
                    "Carta — общее меню a la carte.",
                    "Plato del día — одно блюдо дня.",
                    "Неверно."
                ]
            },
            {
                "question": "Как заказать первое блюдо: «На первое я буду суп»?",
                "type": "application",
                "options": ["De primero quiero la sopa.", "En primero quiero la sopa.", "A primero quiero la sopa.", "Por primero quiero la sopa."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «De primero...» — устойчивая ресторанная конструкция.",
                    "«En primero» — калька.",
                    "«A primero» — ошибка.",
                    "«Por primero» — ошибка."
                ]
            },
            {
                "question": "Как сказать «Я плачу наличными»?",
                "type": "application",
                "options": ["Pago en efectivo.", "Pago con efectivo.", "Pago por efectivo.", "Pago de efectivo."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «pago en efectivo» (предлог en с наличными).",
                    "«Con efectivo» менее употребительно, стандарт — «en efectivo».",
                    "«Por efectivo» — ошибка.",
                    "«De efectivo» — ошибка."
                ]
            },
            {
                "question": "Что означает реплика официанта: «¿Qué desean para beber?»?",
                "type": "application",
                "options": ["Что вы будете есть?", "Что вы желаете попить?", "Сколько вас человек?", "Какой десерт вы хотите?"],
                "correctIndex": 1,
                "explanations": [
                    "Вопрос о еде — «¿Qué desean para comer?»",
                    "Правильно: «beber» означает пить.",
                    "Количество гостей — «¿Cuántos son?»",
                    "Десерт — «¿Qué desean de postre?»"
                ]
            },
            {
                "question": "Как вежливо спросить рекомендацию у официанта?",
                "type": "application",
                "options": ["¿Qué me recomienda?", "¿Qué es la comida?", "¿Por qué cocinas?", "¿Dónde está el menú?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Qué me recomienda?» (Что вы мне порекомендуете?).",
                    "«Что это за еда?» — грубовато.",
                    "Бессмысленно.",
                    "Вопрос о месте меню."
                ]
            },
            {
                "question": "Вы закончили трапезу и хотите расплатиться. Официант проходит мимо. Что вы скажете?",
                "type": "transfer",
                "options": [
                    "¡Camarero, la cuenta, por favor!",
                    "¡Camarero, la sopa, por favor!",
                    "¡Camarero, una mesa, por favor!",
                    "¡Camarero, de nada!"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¡Camarero, la cuenta, por favor!» (просьба счета).",
                    "Заказ супа.",
                    "Запрос столика при входе.",
                    "Неуместно."
                ]
            },
            {
                "question": "Вам принесли счет на 18 евро. Вы даете купюру 20 евро и хотите оставить сдачу официанту. Что сказать?",
                "type": "transfer",
                "options": [
                    "Muchas gracias, quédese con el cambio.",
                    "Muchas gracias, no tengo dinero.",
                    "Por favor, la cuenta de nuevo.",
                    "No entiendo nada del precio."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Quédese con el cambio» (Оставьте сдачу себе).",
                    "Бессмысленно после оплаты.",
                    "Просьба нового счета.",
                    "Не относится к чаевым."
                ]
            },
            {
                "question": "Как объяснить официанту ваш полный заказ на обед?",
                "type": "transfer",
                "options": [
                    "De primero ensalada, de segundo pollo y para beber agua con gas.",
                    "De primero tenedor, de segundo cuchillo y para beber plato.",
                    "Son las dos de ensalada y tengo hambre.",
                    "En primero ensalada, en segundo pollo y en beber agua."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «De primero..., de segundo... y para beber...» (идеальная формула заказа).",
                    "Смешение еды и приборов.",
                    "Бессмысленно.",
                    "Ошибочный предлог «en»."
                ]
            },
            {
                "question": "Как в Буэнос-Айресе позвать официанта?",
                "type": "transfer",
                "options": ["¡Mozo, por favor!", "¡Camarero, por favor!", "¡Chico, por favor!", "¡Señor de mesa!"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: в Аргентине и Уругвае официанта называют «mozo».",
                    "«Camarero» используется в Испании.",
                    "«Chico» звучит фамильярно.",
                    "Не существует."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-29-01",
                "type": "choice",
                "question": "Как сказать «Счет, пожалуйста»?",
                "options": ["La cuenta, por favor.", "El precio, por favor.", "El menú, por favor.", "El dinero, por favor."],
                "correctAnswer": "La cuenta, por favor.",
                "explanation": "La cuenta, por favor."
            },
            {
                "id": "ex-29-02",
                "type": "gap",
                "question": "Una mesa ____ (для) cuatro personas, por favor.",
                "correctAnswer": "para",
                "acceptableAnswers": ["para", "Para"],
                "explanation": "para cuatro personas."
            },
            {
                "id": "ex-29-03",
                "type": "tiles",
                "question": "Соберите фразу: «Можно оплатить банковской картой?»",
                "tiles": ["¿Se", "puede", "pagar", "con", "tarjeta?"],
                "correctAnswer": "¿Se puede pagar con tarjeta?",
                "explanation": "¿Se puede pagar con tarjeta?"
            },
            {
                "id": "ex-29-04",
                "type": "transformation",
                "question": "Замените оплату наличными на оплату картой: «Pago en efectivo» → «Pago ____»",
                "prompt": "en efectivo → ____",
                "correctAnswer": "con tarjeta",
                "acceptableAnswers": ["con tarjeta", "Con tarjeta"],
                "explanation": "con tarjeta."
            },
            {
                "id": "ex-29-05",
                "type": "input",
                "question": "Напишите по-испански «счет» (в ресторане):",
                "correctAnswer": "la cuenta",
                "acceptableAnswers": ["la cuenta", "cuenta", "La cuenta", "Cuenta"],
                "explanation": "la cuenta."
            },
            {
                "id": "ex-29-06",
                "type": "gap",
                "question": "____ (на) primero quiero una sopa caliente.",
                "correctAnswer": "De",
                "acceptableAnswers": ["De", "de"],
                "explanation": "De primero."
            },
            {
                "id": "ex-29-07",
                "type": "choice",
                "question": "Как сказать «комплексный обед» по-испански?",
                "options": ["el menú del día", "la carta grande", "el plato caro", "la comida rápida"],
                "correctAnswer": "el menú del día",
                "explanation": "el menú del día."
            },
            {
                "id": "ex-29-08",
                "type": "input",
                "question": "Напишите по-испански «чаевые»:",
                "correctAnswer": "la propina",
                "acceptableAnswers": ["la propina", "propina", "La propina", "Propina"],
                "explanation": "la propina."
            },
            {
                "id": "ex-29-09",
                "type": "transformation",
                "question": "Сформулируйте заказ второго блюда: «segundo / pollo» → «De ____ el pollo»",
                "prompt": "на второе → ____",
                "correctAnswer": "segundo",
                "acceptableAnswers": ["segundo", "Segundo"],
                "explanation": "De segundo."
            },
            {
                "id": "ex-29-10",
                "type": "tiles",
                "question": "Соберите фразу: «Принесите нам меню, пожалуйста.»",
                "tiles": ["¿Nos", "trae", "la", "carta,", "por", "favor?"],
                "correctAnswer": "¿Nos trae la carta, por favor?",
                "explanation": "¿Nos trae la carta, por favor?"
            },
            {
                "id": "ex-29-11",
                "type": "gap",
                "question": "Para ____ (пить - beber), una botella de agua fría.",
                "correctAnswer": "beber",
                "acceptableAnswers": ["beber", "Beber", "tomar"],
                "explanation": "Para beber."
            },
            {
                "id": "ex-29-12",
                "type": "choice",
                "question": "Что означает «¿Qué tienen de postre?»?",
                "options": ["Что у вас на десерт?", "Что у вас на первое?", "Сколько стоит обед?", "Где счет?"],
                "correctAnswer": "Что у вас на десерт?",
                "explanation": "postre = десерт."
            },
            {
                "id": "ex-29-13",
                "type": "input",
                "question": "Напишите по-испански «официант» (в Испании):",
                "correctAnswer": "camarero",
                "acceptableAnswers": ["camarero", "el camarero", "Camarero", "El camarero"],
                "explanation": "el camarero."
            },
            {
                "id": "ex-29-14",
                "type": "transformation",
                "question": "Замените «pago con tarjeta» на «я плачу наличными»:",
                "prompt": "con tarjeta → ____",
                "correctAnswer": "en efectivo",
                "acceptableAnswers": ["en efectivo", "En efectivo"],
                "explanation": "en efectivo."
            },
            {
                "id": "ex-29-15",
                "type": "tiles",
                "question": "Соберите фразу: «Оставьте сдачу себе, спасибо.»",
                "tiles": ["Quédese", "con", "el", "cambio,", "muchas", "gracias."],
                "correctAnswer": "Quédese con el cambio, muchas gracias.",
                "explanation": "Quédese con el cambio, muchas gracias."
            },
            {
                "id": "ex-29-16",
                "type": "gap",
                "question": "El servicio fue excelente, dejamos una buena ____ (чаевые).",
                "correctAnswer": "propina",
                "acceptableAnswers": ["propina", "Propina"],
                "explanation": "propina."
            },
            {
                "id": "ex-29-17",
                "type": "choice",
                "question": "Как позвать официанта в кафе?",
                "options": ["¡Camarero, por favor!", "¡Oye tú!", "¡Hombre de comida!", "¡Señor rápido!"],
                "correctAnswer": "¡Camarero, por favor!",
                "explanation": "¡Camarero, por favor!"
            },
            {
                "id": "ex-29-18",
                "type": "input",
                "question": "Напишите формулу вежливости при заказе «Пожалуйста»:",
                "correctAnswer": "por favor",
                "acceptableAnswers": ["por favor", "Por favor"],
                "explanation": "por favor."
            },
            {
                "id": "ex-29-19",
                "type": "gap",
                "question": "¿Tienen una mesa libre en la ____ (терраса)?",
                "correctAnswer": "terraza",
                "acceptableAnswers": ["terraza", "Terraza"],
                "explanation": "en la terraza."
            },
            {
                "id": "ex-29-20",
                "type": "tiles",
                "question": "Соберите фразу: «Что вы мне посоветуете из меню?»",
                "tiles": ["¿Qué", "me", "recomienda", "del", "menú?"],
                "correctAnswer": "¿Qué me recomienda del menú?",
                "explanation": "¿Qué me recomienda del menú?"
            },
            {
                "id": "ex-29-21",
                "type": "choice",
                "question": "Как спросить, включен ли хлеб в стоимость обеда?",
                "options": ["¿El pan está incluido?", "¿El pan es gratis?", "¿Dónde compras pan?", "¿Cuánto pan tienes?"],
                "correctAnswer": "¿El pan está incluido?",
                "explanation": "¿El pan está incluido?"
            },
            {
                "id": "ex-29-22",
                "type": "transformation",
                "question": "Преобразуйте просьбу меню в вежливую форму: «Quiero el menú» → «¿Me trae el menú, ____?»",
                "prompt": "пожалуйста → ____",
                "correctAnswer": "por favor",
                "acceptableAnswers": ["por favor", "Por favor"],
                "explanation": "por favor."
            },
            {
                "id": "ex-29-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет заказ еды, глаголы на -er и числа?",
                "options": [
                    "Para comer queremos paella para tres personas y la cuenta cuesta cincuenta euros.",
                    "Para comer somos paella para tres personas.",
                    "En comer queremos paella para tres personas y son cincuenta.",
                    "Para comer tienen paella de tres persona."
                ],
                "correctAnswer": "Para comer queremos paella para tres personas y la cuenta cuesta cincuenta euros.",
                "explanation": "Para comer (глагол -er) + paella para tres personas (число) + la cuenta cuesta 50 euros."
            },
            {
                "id": "ex-29-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Официант, счет, пожалуйста. Я плачу картой»:",
                "correctAnswer": "Camarero, la cuenta, por favor. Pago con tarjeta",
                "acceptableAnswers": [
                    "Camarero, la cuenta, por favor. Pago con tarjeta",
                    "Camarero, la cuenta por favor. Pago con tarjeta",
                    "Camarero la cuenta por favor. Pago con tarjeta"
                ],
                "explanation": "Camarero, la cuenta, por favor. Pago con tarjeta."
            }
        ],
        "miniScenario": {
            "title": "Полный обед в мадридском ресторане",
            "setting": "Ресторан традиционной кухни в Мадриде.",
            "situation": "Вы обедаете с другом, заказываете комплексное меню, просите напитки и в конце оплачиваете счет.",
            "dialog": [
                {"speaker": "Camarero", "text": "¡Buenas tardes! ¿Tienen mesa reservada?"},
                {"speaker": "Tú", "text": "No, no tenemos reserva. ¿Tienen una mesa libre para dos personas?"},
                {"speaker": "Camarero", "text": "Sí, pasen por aquí. ¿Qué desean comer?"},
                {"speaker": "Tú", "text": "De primero queremos dos ensaladas mixtas, de segundo pescado y pollo, y para beber agua sin gas."},
                {"speaker": "Camarero", "text": "Muy bien. ¿Desean postre o café?"},
                {"speaker": "Tú", "text": "Dos cafés solos y la cuenta, por favor. ¿Se puede pagar con tarjeta?"},
                {"speaker": "Camarero", "text": "Por supuesto. Son veintiocho euros en total."}
            ],
            "task": "Попросите счет и уточните возможность оплаты картой.",
            "prompt": "Как попросить счет и спросить об оплате картой?",
            "options": [
                "La cuenta, por favor. ¿Se puede pagar con tarjeta?",
                "El dinero, por favor. Pago en tarjeta.",
                "Quiero el precio. No tengo dinero.",
                "De nada, hasta mañana en el restaurante."
            ],
            "correctIndex": 0,
            "explanation": "«La cuenta, por favor. ¿Se puede pagar con tarjeta?» — безупречный ресторанный диалог."
        },
        "shortText": {
            "title": "El menú del día en el Mesón de San Pedro",
            "text": "El Mesón de San Pedro es famoso por su menú del día económico y abundante. Por doce euros, los clientes eligen un primer plato entre sopa castellana o ensalada mixta, y un segundo plato entre merluza a la plancha o ternera con patatas. El menú incluye pan fresco, una copa de vino o agua mineral, y un postre casero como flan o tarta de manzana. La atención de los camareros es rápida y amable.",
            "questions": [
                {
                    "question": "¿Cuánto cuesta el menú del día en el Mesón de San Pedro?",
                    "options": ["Diez euros", "Doce euros", "Veinte euros", "Quince euros"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Por doce euros, los clientes eligen...»."
                },
                {
                    "question": "¿Qué incluye el menú además de los platos principales?",
                    "options": ["Solo agua", "Pan fresco, vino o agua mineral y postre casero", "Café y licores caros", "Nada más"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «El menú incluye pan fresco, una copa de vino o agua mineral, y un postre casero...»."
                },
                {
                    "question": "¿Qué postres caseros se mencionan?",
                    "options": ["Helado de fresa", "Flan o tarta de manzana", "Churros con chocolate", "Frutas exóticas"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «un postre casero como flan o tarta de manzana»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Диалог заказа полного обеда в ресторане",
            "prompt": "Составьте развернутый диалог в ресторане (5-7 реплик между вами и официантом):\n1. Попросите столик на двоих (Una mesa para dos...).\n2. Попросите меню (¿Nos trae la carta/el menú...?)\n3. Сделайте заказ первого, второго блюда и напитка (De primero..., de segundo..., para beber...).\n4. Закажите десерт (De postre queremos...).\n5. Попросите счет и оплатите картой (La cuenta, por favor. ¿Puedo pagar con tarjeta?).",
            "minWords": 30,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Ресторанный этикет и формулы заказа", "points": 35, "description": "Точное использование фраз «una mesa para dos», «de primero/segundo», «la cuenta por favor», «pagar con tarjeta»."},
                    {"name": "Лексика блюд и напитков", "points": 30, "description": "Использование слов ensalada, sopa, pescado, carne, agua, vino, postre, café."},
                    {"name": "Грамматическая правильность", "points": 20, "description": "Спряжение глаголов querer, tomar, beber, pagar, traer."},
                    {"name": "Структура диалога и оформление", "points": 15, "description": "Четкое разделение реплик говорящих, пунктуация."}
                ]
            }
        }
    }
}
