# -*- coding: utf-8 -*-
"""Unit 4: Семья и принадлежность (Topics 21, 8, 11, 25)"""

unit4_topics = {
    # ----------------------------------------------------
    # TOPIC 21: Family members (la familia)
    # ----------------------------------------------------
    21: {
        "id": 21,
        "topicName": "Family members (la familia)",
        "russianTitle": "Семья и родственники (la familia)",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u04-family",
        "icon": "👨‍👩‍👧‍👦",
        "summary": "Названия членов семьи и родственников в испанском языке, их род и множественное число (padres = родители, hermanos = братья и сестры, abuelos = дедушка и бабушка).",
        "mnemonicRule": "Мужской род во множественном числе часто объединяет обоих родственников: padre + madre = padres (родители), hermano + hermana = hermanos (братья и сестры).",
        "goalsRu": [
            "Называть всех близких и дальних родственников на испанском языке",
            "Правильно использовать парные понятия во множественном числе (padres, abuelos, hijos, tíos, primos)",
            "Рассказывать о составе своей семьи, профессиях и возрасте родственников",
            "Использовать предлог de для выражения родственных связей (el hermano de mi madre)"
        ],
        "sections": [
            {
                "title": "1. Ближний и дальний круг семьи",
                "content": "Слова для обозначения членов семьи образуют логичные пары по родам:",
                "tables": [
                    {
                        "headers": ["Мужской род", "Женский род", "Множественное число (оба пола)", "Русский перевод"],
                        "rows": [
                            ["el padre / papá", "la madre / mamá", "los padres", "отец / мать / родители"],
                            ["el hijo", "la hija", "los hijos", "сын / дочь / дети (сыновья и дочери)"],
                            ["el hermano", "la hermana", "los hermanos", "брат / сестра / братья и сестры"],
                            ["el abuelo", "la abuela", "los abuelos", "дедушка / бабушка / дедушка и бабушка"],
                            ["el tío", "la tía", "los tíos", "дядя / тётя / дяди и тёти"],
                            ["el primo", "la prima", "los primos", "кузен / кузина / двоюродные братья и сестры"],
                            ["el sobrino", "la sobrina", "los sobrinos", "племянник / племянница / племянники"],
                            ["el nieto", "la nieta", "los nietos", "внук / внучка / внуки"],
                            ["el esposo / marido", "la esposa / mujer", "los esposos", "муж / жена / супруги"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Mi familia es bastante grande y unida.", "ru": "Моя семья довольно большая и дружная."},
            {"es": "Mis padres viven en una casa de campo.", "ru": "Мои родители живут в загородном доме."},
            {"es": "Tengo dos hermanos: un hermano mayor y una hermana menor.", "ru": "У меня два брата/сестры: старший брат и младшая сестра."},
            {"es": "Mi abuelo tiene ochenta años y cocina muy bien.", "ru": "Моему дедушке восемьдесят лет, и он отлично готовит."},
            {"es": "Los domingos comemos en casa de mis tíos.", "ru": "По воскресеньям мы обедаем дома у дяди и тёти."},
            {"es": "Juego con mis primos en el jardín.", "ru": "Я играю с кузенами в саду."},
            {"es": "Mi sobrina pequeña tiene tres años.", "ru": "Моей маленькой племяннице три года."},
            {"es": "El esposo de mi hermana es arquitecto.", "ru": "Муж моей сестры — архитектор."},
            {"es": "Los abuelos pasean con sus nietos en el parque.", "ru": "Бабушка и дедушка гуляют с внуками в парке."},
            {"es": "¿Tienes hermanos o eres hijo único?", "ru": "У тебя есть братья/сестры или ты единственный ребенок?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Mis parientes» переводят как «мои родители» (ложные друзья переводчика)",
                "correction": "Mis padres (родители) vs Mis parientes (все родственники)",
                "explanation": "«Padres» — это строго родители (папа и мама), а «parientes» — это любые родственники."
            },
            {
                "mistake": "«Hermano mayor» путают со словом «viejo»",
                "correction": "Mi hermano mayor (старший брат) / Mi hermano menor (младший брат)",
                "explanation": "Для старших/младших братьев и сестер используются слова «mayor» и «menor», а не «viejo/joven»."
            },
            {
                "mistake": "«El hijo de mi madre es mi hermano» — путаница в сложных родственных цепочках",
                "correction": "El hermano de mi padre es mi tío",
                "explanation": "Связи выражаются предлогом de: la madre de mi madre = mi abuela."
            }
        ],
        "trapAlert": "«LOS PADRES» — это родители (отец и мать), а не просто «отцы»!",
        "dialectNote": "В разговорной речи во всех испаноязычных странах вместо «padre» и «madre» почти всегда говорят ласково «papá» и «mamá» (с ударением на последний слог).",
        "quiz": [
            {
                "question": "Кто такой «el hermano de mi madre»?",
                "type": "recognition",
                "options": ["Mi abuelo", "Mi tío", "Mi primo", "Mi sobrino"],
                "correctIndex": 1,
                "explanations": [
                    "Abuelo — дедушка (отец матери).",
                    "Правильно: брат моей мамы — это мой дядя («mi tío»).",
                    "Primo — двоюродный брат.",
                    "Sobrino — племянник."
                ]
            },
            {
                "question": "Что означает испанское слово «los padres»?",
                "type": "recognition",
                "options": ["Родственники", "Родители (отец и мать)", "Только отцы", "Дедушки"],
                "correctIndex": 1,
                "explanations": [
                    "Родственники — «los parientes».",
                    "Правильно: «los padres» — родители (отец и мать).",
                    "Неверно.",
                    "Дедушки — «los abuelos»."
                ]
            },
            {
                "question": "Кто такая «la hija de mi hermano»?",
                "type": "recognition",
                "options": ["Mi tía", "Mi prima", "Mi sobrina", "Mi nieta"],
                "correctIndex": 2,
                "explanations": [
                    "Tía — тётя.",
                    "Prima — кузина.",
                    "Правильно: дочь моего брата — это моя племянница («mi sobrina»).",
                    "Nieta — внучка."
                ]
            },
            {
                "question": "Как сказать «старший брат» по-испански?",
                "type": "recognition",
                "options": ["Hermano viejo", "Hermano grande", "Hermano mayor", "Hermano alto"],
                "correctIndex": 2,
                "explanations": [
                    "«Hermano viejo» звучит некорректно.",
                    "«Hermano grande» означает «крупный по размеру».",
                    "Правильно: «hermano mayor» — старший по возрасту брат.",
                    "«Hermano alto» — высокий брат."
                ]
            },
            {
                "question": "Вставьте слово: «La madre de mi padre es mi ____.»",
                "type": "application",
                "options": ["tía", "abuela", "hermana", "prima"],
                "correctIndex": 1,
                "explanations": [
                    "Tía — тётя.",
                    "Правильно: мать моего отца — это моя бабушка («mi abuela»).",
                    "Hermana — сестра.",
                    "Prima — кузина."
                ]
            },
            {
                "question": "Вставьте форму множественного числа: «Tengo tres ____ (братья и сестры)»:",
                "type": "application",
                "options": ["hermanas", "hermanos", "padres", "hijos"],
                "correctIndex": 1,
                "explanations": [
                    "«Hermanas» означает только сестер.",
                    "Правильно: «hermanos» во мн. числе объединяет братьев и сестер.",
                    "«Padres» — родители.",
                    "«Hijos» — дети."
                ]
            },
            {
                "question": "Кто такие «los abuelos»?",
                "type": "application",
                "options": ["Дядя и тётя", "Дедушка и бабушка", "Родители", "Внуки"],
                "correctIndex": 1,
                "explanations": [
                    "Дядя и тётя — «los tíos».",
                    "Правильно: «los abuelos» — дедушка и бабушка.",
                    "Родители — «los padres».",
                    "Внуки — «los nietos»."
                ]
            },
            {
                "question": "Как переводится фраза «Soy hijo único»?",
                "type": "application",
                "options": ["Я старший сын", "Я единственный ребенок в семье", "У меня много братьев", "Я младший сын"],
                "correctIndex": 1,
                "explanations": [
                    "Старший сын — «el hijo mayor».",
                    "Правильно: «hijo único» — единственный ребенок (нет братьев и сестер).",
                    "Неверно.",
                    "Младший сын — «el hijo menor»."
                ]
            },
            {
                "question": "Вы знакомите нового друга со своей женой. Что сказать?",
                "type": "transfer",
                "options": ["Te presento a mi esposa, Elena.", "Te presento a mi madre, Elena.", "Te presento a mi abuela, Elena.", "Te presento a mi prima hija, Elena."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Te presento a mi esposa, Elena» (жена / супруга).",
                    "Madre — мама.",
                    "Abuela — бабушка.",
                    "Бессмысленное сочетание."
                ]
            },
            {
                "question": "Ваш собеседник показывает семейное фото и говорит: «Éstos son los hijos de mi tío». Кто они вам?",
                "type": "transfer",
                "options": ["Mis hermanos", "Mis primos", "Mis sobrinos", "Mis abuelos"],
                "correctIndex": 1,
                "explanations": [
                    "Дети дяди — двоюродные братья и сестры.",
                    "Правильно: дети дяди — это кузены («mis primos»).",
                    "Sobrinos — племянники (дети брата/сестры).",
                    "Abuelos — дедушка и бабушка."
                ]
            },
            {
                "question": "Как рассказать о своей большой семье: «У меня есть родители, двое братьев и бабушка»?",
                "type": "transfer",
                "options": [
                    "Tengo a mis padres, dos hermanos y una abuela.",
                    "Soy mis padres, dos hermanos y una abuela.",
                    "Estoy mis padres, dos hermanos y una abuela.",
                    "Llevo mis padres, dos hermanos y una abuela."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Tengo...» (наличие семьи выражается глаголом tener).",
                    "Глагол ser не выражает наличие родственников.",
                    "Глагол estar выражает состояние/место.",
                    "Llevar означает носить."
                ]
            },
            {
                "question": "Как ласково обратиться к дедушке в испанской семье?",
                "type": "transfer",
                "options": ["Abuelito", "Hijito", "Tío", "Señor abuelo"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: уменьшительно-ласкательное «abuelito» (дедуля / дедушка).",
                    "Hijito — сыночек.",
                    "Tío — дядя.",
                    "Слишком официально."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-21-01",
                "type": "choice",
                "question": "Кто является матерью вашей мамы?",
                "options": ["mi abuela", "mi tía", "mi hermana", "mi prima"],
                "correctAnswer": "mi abuela",
                "explanation": "Мать мамы — бабушка (mi abuela)."
            },
            {
                "id": "ex-21-02",
                "type": "gap",
                "question": "El hermano de mi padre es mi ____ (дядя).",
                "correctAnswer": "tío",
                "acceptableAnswers": ["tío", "tio", "Tío"],
                "explanation": "tío = дядя."
            },
            {
                "id": "ex-21-03",
                "type": "tiles",
                "question": "Соберите предложение: «Моя семья живет в Мадриде.»",
                "tiles": ["Mi", "familia", "vive", "en", "Madrid."],
                "correctAnswer": "Mi familia vive en Madrid.",
                "explanation": "Mi familia vive en Madrid."
            },
            {
                "id": "ex-21-04",
                "type": "transformation",
                "question": "Поставьте в женский род: «el hijo» → «la ____»",
                "prompt": "el hijo → la ____",
                "correctAnswer": "hija",
                "acceptableAnswers": ["hija", "Hija"],
                "explanation": "el hijo → la hija."
            },
            {
                "id": "ex-21-05",
                "type": "input",
                "question": "Напишите по-испански слово «родители» (отец и мать):",
                "correctAnswer": "padres",
                "acceptableAnswers": ["los padres", "padres", "Padres", "Los padres"],
                "explanation": "los padres = родители."
            },
            {
                "id": "ex-21-06",
                "type": "gap",
                "question": "La hija de mi tía es mi ____ (двоюродная сестра).",
                "correctAnswer": "prima",
                "acceptableAnswers": ["prima", "Prima"],
                "explanation": "prima = двоюродная сестра."
            },
            {
                "id": "ex-21-07",
                "type": "choice",
                "question": "Как сказать «младшая сестра»?",
                "options": ["hermana menor", "hermana joven", "hermana pequeña", "menor hermana"],
                "correctAnswer": "hermana menor",
                "explanation": "hermana menor = младшая сестра."
            },
            {
                "id": "ex-21-08",
                "type": "input",
                "question": "Напишите по-испански слово «дедушка»:",
                "correctAnswer": "abuelo",
                "acceptableAnswers": ["abuelo", "el abuelo", "Abuelo", "El abuelo"],
                "explanation": "abuelo."
            },
            {
                "id": "ex-21-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el hermano» → «los ____»",
                "prompt": "el hermano → los ____",
                "correctAnswer": "hermanos",
                "acceptableAnswers": ["hermanos", "Hermanos"],
                "explanation": "los hermanos."
            },
            {
                "id": "ex-21-10",
                "type": "tiles",
                "question": "Соберите предложение: «Мой дедушка очень добрый человек.»",
                "tiles": ["Mi", "abuelo", "es", "un", "hombre", "muy", "bueno."],
                "correctAnswer": "Mi abuelo es un hombre muy bueno.",
                "explanation": "Mi abuelo es un hombre muy bueno."
            },
            {
                "id": "ex-21-11",
                "type": "gap",
                "question": "El hijo de mi hermano es mi ____ (племянник).",
                "correctAnswer": "sobrino",
                "acceptableAnswers": ["sobrino", "Sobrino"],
                "explanation": "sobrino = племянник."
            },
            {
                "id": "ex-21-12",
                "type": "choice",
                "question": "Кто такой «el nieto»?",
                "options": ["внук", "сын", "племянник", "дедушка"],
                "correctAnswer": "внук",
                "explanation": "nieto = внук."
            },
            {
                "id": "ex-21-13",
                "type": "input",
                "question": "Напишите по-испански слово «жена / супруга»:",
                "correctAnswer": "esposa",
                "acceptableAnswers": ["esposa", "la esposa", "mujer", "la mujer", "Esposa"],
                "explanation": "esposa / mujer."
            },
            {
                "id": "ex-21-14",
                "type": "transformation",
                "question": "Поставьте в женский род: «el tío» → «la ____»",
                "prompt": "el tío → la ____",
                "correctAnswer": "tía",
                "acceptableAnswers": ["tía", "tia", "Tía"],
                "explanation": "la tía."
            },
            {
                "id": "ex-21-15",
                "type": "tiles",
                "question": "Соберите фразу: «У меня два двоюродных брата.»",
                "tiles": ["Tengo", "dos", "primos", "en", "Sevilla."],
                "correctAnswer": "Tengo dos primos en Sevilla.",
                "explanation": "Tengo dos primos en Sevilla."
            },
            {
                "id": "ex-21-16",
                "type": "gap",
                "question": "Mi padre y mi madre son mis ____ (родители).",
                "correctAnswer": "padres",
                "acceptableAnswers": ["padres", "Padres"],
                "explanation": "padres."
            },
            {
                "id": "ex-21-17",
                "type": "choice",
                "question": "Как сказать «муж» на испанском?",
                "options": ["el marido / esposo", "el hombre solo", "el novio padre", "el hermano mayor"],
                "correctAnswer": "el marido / esposo",
                "explanation": "marido / esposo = муж."
            },
            {
                "id": "ex-21-18",
                "type": "input",
                "question": "Напишите по-испански слово «внучка»:",
                "correctAnswer": "nieta",
                "acceptableAnswers": ["nieta", "la nieta", "Nieta"],
                "explanation": "nieta."
            },
            {
                "id": "ex-21-19",
                "type": "gap",
                "question": "Los hijos de mis hijos son mis ____ (внуки).",
                "correctAnswer": "nietos",
                "acceptableAnswers": ["nietos", "Nietos"],
                "explanation": "nietos."
            },
            {
                "id": "ex-21-20",
                "type": "tiles",
                "question": "Соберите предложение: «Моя мама — преподаватель в университете.»",
                "tiles": ["Mi", "madre", "es", "profesora", "en", "la", "universidad."],
                "correctAnswer": "Mi madre es profesora en la universidad.",
                "explanation": "Mi madre es profesora en la universidad."
            },
            {
                "id": "ex-21-21",
                "type": "choice",
                "question": "Какое слово обозначает всех родственников в целом?",
                "options": ["los parientes", "los padres", "los abuelos", "los hijos"],
                "correctAnswer": "los parientes",
                "explanation": "parientes = родственники."
            },
            {
                "id": "ex-21-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el abuelo» → «los ____» (дедушка и бабушка)",
                "prompt": "el abuelo → los ____",
                "correctAnswer": "abuelos",
                "acceptableAnswers": ["abuelos", "Abuelos"],
                "explanation": "los abuelos."
            },
            {
                "id": "ex-21-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет лексику семьи, числительные и ser/estar?",
                "options": [
                    "Tengo tres hermanos; dos son médicos y uno está en Madrid.",
                    "Soy tres hermanos; dos están médicos y uno es en Madrid.",
                    "Estoy tres hermanos; dos tienen médicos y uno hace en Madrid.",
                    "Llevo tres hermanos; son en Madrid."
                ],
                "correctAnswer": "Tengo tres hermanos; dos son médicos y uno está en Madrid.",
                "explanation": "Tengo (наличие) + son médicos (профессия ser) + está en Madrid (местоположение estar)."
            },
            {
                "id": "ex-21-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Мой старший брат высокий и добрый»:",
                "correctAnswer": "Mi hermano mayor es alto y bueno",
                "acceptableAnswers": [
                    "Mi hermano mayor es alto y bueno",
                    "Mi hermano mayor es alto y simpático",
                    "Mi hermano mayor es alto y amable"
                ],
                "explanation": "Mi hermano mayor es alto y bueno / simpático."
            }
        ],
        "miniScenario": {
            "title": "Семейный праздник и знакомство с родственниками",
            "setting": "Гостиная в доме бабушки в Валенсии.",
            "situation": "Ваш испанский друг Матео знакомит вас со своими родственниками на семейном обеде.",
            "dialog": [
                {"speaker": "Mateo", "text": "¡Hola! Te presento a mi familia. Éste es mi padre, Antonio, y ella es mi madre, Carmen."},
                {"speaker": "Tú", "text": "¡Mucho gusto! Encantado de conocerles."},
                {"speaker": "Mateo", "text": "Y ellos son mis primos, Lucas y Sofía."},
                {"speaker": "Tú", "text": "¡Hola a todos! Tienen una familia muy bonita."}
            ],
            "task": "Поприветствуйте родителей друга вежливо при знакомстве.",
            "prompt": "Как ответить родителям Матео при знакомстве?",
            "options": [
                "¡Mucho gusto! Encantado de conocerles.",
                "De nada, adiós a todos.",
                "Tengo veinte años y soy cansado.",
                "Por favor, la cuenta del restaurante."
            ],
            "correctIndex": 0,
            "explanation": "«¡Mucho gusto! Encantado de conocerles» — идеальная формула вежливости."
        },
        "shortText": {
            "title": "El domingo en familia de David",
            "text": "Los domingos son días especiales para David. Toda su familia se reúne en la casa de sus abuelos en el campo. Su abuela prepara una paella deliciosa para diez personas. Su padre ayuda en el jardín y su madre conversa con sus tías en la terraza. David juega al fútbol con sus tres primos. Para David, la familia es lo más importante.",
            "questions": [
                {
                    "question": "¿Dónde se reúne la familia de David los domingos?",
                    "options": ["En un restaurante del centro", "En la casa de los abuelos en el campo", "En la escuela", "En el cine"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «en la casa de sus abuelos en el campo»."
                },
                {
                    "question": "¿Con quién juega al fútbol David?",
                    "options": ["Con su abuelo", "Con sus tres primos", "Con el profesor", "Con sus tíos"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «David juega al fútbol con sus tres primos»."
                },
                {
                    "question": "¿Qué prepara la abuela para la comida?",
                    "options": ["Una sopa fría", "Una paella deliciosa", "Pizzas", "Bocadillos"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Su abuela prepara una paella deliciosa...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Рассказ о своей семье и родственниках",
            "prompt": "Напишите короткий рассказ о вашей семье (4-6 предложений):\n1. Опишите семью в целом (Mi familia es grande/pequeña, vivimos en...).\n2. Назовите родителей и их профессии (Mi padre es..., mi madre es...).\n3. Укажите, есть ли у вас братья или сестры (Tengo un hermano mayor... / Soy hijo único).\n4. Расскажите о бабушке или дедушке (Mi abuelo tiene ... años).",
            "minWords": 25,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Лексика семьи", "points": 35, "description": "Точное использование терминов родства (padres, hermano mayor/menor, abuelos, tíos...)."},
                    {"name": "Грамматика глаголов ser, tener, vivir", "points": 30, "description": "Правильное спряжение в 3-м лице (es, tiene, viven)."},
                    {"name": "Согласование прилагательных", "points": 20, "description": "Согласование по роду и числу при описании родственников."},
                    {"name": "Связность и пунктуация", "points": 15, "description": "Логичное построение текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 8: Possessive adjectives (mi/tu/su)
    # ----------------------------------------------------
    8: {
        "id": 8,
        "topicName": "Possessive adjectives (mi/tu/su)",
        "russianTitle": "Притяжательные прилагательные (mi/tu/su/nuestro/vuestro/su)",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u04-family",
        "icon": "🎒",
        "summary": "Притяжательные прилагательные указывают на принадлежность предмета (мой, твой, его/ее/Ваш, наш, ваш, их). Они ставятся ПЕРЕД существительным и согласуются с предметом обладания, а не с владельцем!",
        "mnemonicRule": "Окончание зависит от ПРЕДМЕТА, а не от владельца: mi libro / mis libros, su casa / sus casas. Формы nuestro/vuestro имеют еще и женский род (nuestra casa).",
        "goalsRu": [
            "Безошибочно использовать притяжательные формы mi/mis, tu/tus, su/sus",
            "Согласовывать формы nuestro/nuestra/nuestros/nuestras по роду и числу с предметом",
            "Понимать многозначность формы «su / sus» (его, её, Ваш, их, Ваше)",
            "Не ставить определенный артикль перед притяжательными прилагательными (mi libro, а не el mi libro)"
        ],
        "sections": [
            {
                "title": "1. Таблица притяжательных прилагательных",
                "content": "Обратите внимание: формы mi, tu, su меняются только по ЧИСЛАМ (mi/mis), а nuestro и vuestro меняются и по РОДАМ, и по ЧИСЛАМ:",
                "tables": [
                    {
                        "headers": ["Владелец", "Перед муж. ед.", "Перед жен. ед.", "Перед мн. числом", "Русский перевод"],
                        "rows": [
                            ["yo (я)", "mi libro", "mi casa", "mis libros / mis casas", "мой / моя / мои"],
                            ["tú / vos (ты)", "tu libro", "tu casa", "tus libros / tus casas", "твой / твоя / твои (без тильды!)"],
                            ["él / ella / usted (он/она/Вы)", "su libro", "su casa", "sus libros / sus casas", "его / её / Ваш / Ваши"],
                            ["nosotros / nosotras (мы)", "nuestro libro", "nuestra casa", "nuestros libros / nuestras casas", "наш / наша / наши"],
                            ["vosotros / vosotras (вы)", "vuestro libro", "vuestra casa", "vuestros libros / vuestras casas", "ваш / ваша / ваши"],
                            ["ellos / ellas / ustedes (они/Вы)", "su libro", "su casa", "sus libros / sus casas", "их / Ваши"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Mi casa es pequeña pero muy cómoda.", "ru": "Мой дом маленький, но очень уютный."},
            {"es": "Mis hermanos estudian en la universidad.", "ru": "Мои братья учатся в университете."},
            {"es": "¿Dónde está tu pasaporte?", "ru": "Где твой паспорт?"},
            {"es": "Tus amigos son muy simpáticos.", "ru": "Твои друзья очень симпатичные."},
            {"es": "Carlos busca su coche en el garaje.", "ru": "Карлос ищет свою машину в гараже."},
            {"es": "Nuestra profesora habla tres idiomas.", "ru": "Наша преподавательница говорит на трех языках."},
            {"es": "Nuestros padres viven en Sevilla.", "ru": "Наши родители живут в Севилье."},
            {"es": "Vuestra casa es muy luminosa.", "ru": "Ваш дом очень светлый (в Испании)."},
            {"es": "Los estudiantes leen sus libros en silencio.", "ru": "Студенты читают свои книги в тишине."},
            {"es": "Señor García, ¿éste es su número de teléfono?", "ru": "Сеньор Гарсия, это Ваш номер телефона?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«El mi libro» или «La mi casa» с артиклем",
                "correction": "Mi libro / Mi casa (без артикля!)",
                "explanation": "В испанском языке притяжательные прилагательные исключают употребление определенного артикля."
            },
            {
                "mistake": "«Mi padres» вместо «Mis padres»",
                "correction": "Mis padres / Mis libros",
                "explanation": "Притяжательное прилагательное обязательно согласуется по числу: с существительным во мн. числе ставится «mis», «tus», «sus»."
            },
            {
                "mistake": "Путаница между местоимением «tú» (с тильдой) и притяжательным «tu» (без тильды)",
                "correction": "Tú tienes tu libro",
                "explanation": "«Tú» с тильдой — подлежащее («ты»), «tu» без тильды — притяжательное («твой»)."
            }
        ],
        "trapAlert": "Форма «SU / SUS» многозначна: она означает «его», «её», «Ваш (ед.)», «их» и «Ваш (мн.)»!",
        "dialectNote": "В Латинской Америке формы «vuestro/vuestra» не используются: для обращения к группе людей всегда говорят «su / sus» («¿Es su casa?» = Это ваш дом?).",
        "quiz": [
            {
                "question": "Какое притяжательное слово нужно для фразы «____ libros (мои книги)»?",
                "type": "recognition",
                "options": ["Mi", "Mis", "Mío", "Me"],
                "correctIndex": 1,
                "explanations": [
                    "«Mi» используется только с единственным числом (mi libro).",
                    "Правильно: «mis libros» (множественное число).",
                    "«Mío» ставится после существительного.",
                    "«Me» — местоимение дополнения."
                ]
            },
            {
                "question": "Какая форма соответствует «наша школа»?",
                "type": "recognition",
                "options": ["Nuestro escuela", "Nuestra escuela", "Nuestros escuela", "Nuestras escuela"],
                "correctIndex": 1,
                "explanations": [
                    "Escuela — женский род, поэтому «nuestro» ошибочно.",
                    "Правильно: «Nuestra escuela» (женский род ед. число).",
                    "Nuestros — мн. число мужского рода.",
                    "Nuestras — мн. число женского рода."
                ]
            },
            {
                "question": "Чем отличается «tú» от «tu»?",
                "type": "recognition",
                "options": ["tú = ты (подлежащее), tu = твой (притяжательное)", "tú = твой, tu = ты", "Нет никакой разницы", "tú = Вы, tu = твой"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «tú» (с тильдой) — местоимение «ты», «tu» (без тильды) — «твой/твоя».",
                    "Перепутано.",
                    "Разница принципиальная.",
                    "Неверно."
                ]
            },
            {
                "question": "Какое притяжательное прилагательное согласуется и по роду, и по числу?",
                "type": "recognition",
                "options": ["Mi", "Tu", "Nuestro", "Su"],
                "correctIndex": 2,
                "explanations": [
                    "Mi меняется только по числам (mi/mis).",
                    "Tu меняется только по числам (tu/tus).",
                    "Правильно: «Nuestro» имеет 4 формы (nuestro, nuestra, nuestros, nuestras).",
                    "Su меняется только по числам (su/sus)."
                ]
            },
            {
                "question": "Вставьте форму: «Carlos y ____ (его) amigos juegan al fútbol.»",
                "type": "application",
                "options": ["su", "sus", "suyo", "tu"],
                "correctIndex": 1,
                "explanations": [
                    "Amigos во множественном числе, поэтому «su» ошибочно.",
                    "Правильно: «sus amigos» (согласование во множественном числе).",
                    "Suyo ставится после слова.",
                    "Tu означает «твой», а речь идет о Карлосе."
                ]
            },
            {
                "question": "Вставьте форму: «Nosotros vivimos en ____ (наш) apartamento nuevo.»",
                "type": "application",
                "options": ["nuestro", "nuestra", "nuestros", "nuestras"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: apartamento — мужской род ед. число → «nuestro apartamento».",
                    "Nuestra — женский род.",
                    "Nuestros — множественное число.",
                    "Nuestras — женский род мн. число."
                ]
            },
            {
                "question": "Вставьте притяжательное вежливости: «Señora Ramos, ¿dónde está ____ (Ваша) maleta?»",
                "type": "application",
                "options": ["tu", "su", "tus", "sus"],
                "correctIndex": 1,
                "explanations": [
                    "Tu — неформальное обращение на «ты».",
                    "Правильно: «su maleta» (вежливое обращение к сеньоре Рамос).",
                    "Tus — множественное число на «ты».",
                    "Maleta в единственном числе, «sus» не подходит."
                ]
            },
            {
                "question": "Выберите предложение без грамматических ошибок:",
                "type": "application",
                "options": [
                    "El mi hermano vive con sus amigos.",
                    "Mi hermano vive con sus amigos.",
                    "Mi hermano vive con su amigos.",
                    "Mis hermano vive con sus amigos."
                ],
                "correctIndex": 1,
                "explanations": [
                    "Нельзя ставить артикль перед «mi».",
                    "Правильно: «Mi hermano vive con sus amigos» (mi ед. ч., sus мн. ч.).",
                    "«Su amigos» ошибочно, нужно множественное число «sus».",
                    "«Mis hermano» несогласованно."
                ]
            },
            {
                "question": "Вы потеряли ключи и спрашиваете у соседа по комнате: «Ты видел мои ключи?». Как сказать?",
                "type": "transfer",
                "options": [
                    "¿Tienes mis llaves?",
                    "¿Tienes mi llaves?",
                    "¿Tienes las mis llaves?",
                    "¿Tienes tus llaves?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «mis llaves» (множественное число согласуется с llaves).",
                    "«Mi llaves» — несогласованно по числу.",
                    "Артикль «las» нельзя сочетать с «mis».",
                    "«Tus llaves» значит «твои ключи»."
                ]
            },
            {
                "question": "Преподаватель обращается к студентам: «Откройте ваши книги». Как сказать на нейтральном испанском?",
                "type": "transfer",
                "options": [
                    "Abran sus libros, por favor.",
                    "Abran su libros, por favor.",
                    "Abran vuestro libros, por favor.",
                    "Abran los sus libros, por favor."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «sus libros» (обращение к ustedes во множественном числе).",
                    "«Su» в единственном числе не согласуется с «libros».",
                    "Vuestro в единственном числе.",
                    "Лишний артикль «los»."
                ]
            },
            {
                "question": "Как сказать «Это наш любимый город»?",
                "type": "transfer",
                "options": [
                    "Es nuestra ciudad favorita.",
                    "Es nuestro ciudad favorita.",
                    "Es la nuestra ciudad favorita.",
                    "Es nuestros ciudad favorita."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: ciudad — женский род → «nuestra ciudad favorita».",
                    "Nuestro — мужской род.",
                    "Лишний артикль «la».",
                    "Nuestros — множественное число."
                ]
            },
            {
                "question": "Как перевести «Её зовут Анна, а её брат — врач»?",
                "type": "transfer",
                "options": [
                    "Se llama Ana y su hermano es médico.",
                    "Se llama Ana y tu hermano es médico.",
                    "Se llama Ana y el su hermano es médico.",
                    "Se llama Ana y sus hermano es médico."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «su hermano» (её брат, ед. число).",
                    "Tu означает «твой».",
                    "Лишний артикль «el».",
                    "Sus — во множественном числе."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-8-01",
                "type": "choice",
                "question": "Какое притяжательное слово согласуется со словом «padres» (мои)?",
                "options": ["mis", "mi", "mío", "me"],
                "correctAnswer": "mis",
                "explanation": "Padres во мн. числе: «mis padres»."
            },
            {
                "id": "ex-8-02",
                "type": "gap",
                "question": "Ana busca ____ (ее, ед. ч.) pasaporte en el bolso.",
                "correctAnswer": "su",
                "acceptableAnswers": ["su", "Su"],
                "explanation": "su pasaporte."
            },
            {
                "id": "ex-8-03",
                "type": "tiles",
                "question": "Соберите предложение: «Наш дом находится близко от центра.»",
                "tiles": ["Nuestra", "casa", "está", "cerca", "del", "centro."],
                "correctAnswer": "Nuestra casa está cerca del centro.",
                "explanation": "Nuestra casa está cerca del centro."
            },
            {
                "id": "ex-8-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «mi libro» → «____»",
                "prompt": "mi libro → ____",
                "correctAnswer": "mis libros",
                "acceptableAnswers": ["mis libros", "Mis libros"],
                "explanation": "mi libro → mis libros."
            },
            {
                "id": "ex-8-05",
                "type": "input",
                "question": "Напишите притяжательное «твой» (без графического ударения):",
                "correctAnswer": "tu",
                "acceptableAnswers": ["tu", "Tu"],
                "explanation": "tu (без тильды)."
            },
            {
                "id": "ex-8-06",
                "type": "gap",
                "question": "Carlos y Marta leen ____ (их, мн. ч.) libros en clase.",
                "correctAnswer": "sus",
                "acceptableAnswers": ["sus", "Sus"],
                "explanation": "sus libros."
            },
            {
                "id": "ex-8-07",
                "type": "choice",
                "question": "Какая форма нужна для «наши друзья»?",
                "options": ["nuestros amigos", "nuestro amigos", "nuestras amigos", "nosotros amigos"],
                "correctAnswer": "nuestros amigos",
                "explanation": "nuestros amigos."
            },
            {
                "id": "ex-8-08",
                "type": "input",
                "question": "Напишите форму женского рода для «наш» (наша...):",
                "correctAnswer": "nuestra",
                "acceptableAnswers": ["nuestra", "Nuestra"],
                "explanation": "nuestra."
            },
            {
                "id": "ex-8-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «tu hermano» → «____»",
                "prompt": "tu hermano → ____",
                "correctAnswer": "tus hermanos",
                "acceptableAnswers": ["tus hermanos", "Tus hermanos"],
                "explanation": "tu hermano → tus hermanos."
            },
            {
                "id": "ex-8-10",
                "type": "tiles",
                "question": "Соберите фразу: «Где находятся твои ключи?»",
                "tiles": ["¿Dónde", "están", "tus", "llaves?"],
                "correctAnswer": "¿Dónde están tus llaves?",
                "explanation": "¿Dónde están tus llaves?"
            },
            {
                "id": "ex-8-11",
                "type": "gap",
                "question": "Señor Gómez, ¿éste es ____ (Ваш, ед. ч.) coche?",
                "correctAnswer": "su",
                "acceptableAnswers": ["su", "Su"],
                "explanation": "su coche (вежливо на usted)."
            },
            {
                "id": "ex-8-12",
                "type": "choice",
                "question": "Какое словосочетание написано с ошибкой?",
                "options": ["el mi amigo", "mi amigo", "mis amigos", "nuestro amigo"],
                "correctAnswer": "el mi amigo",
                "explanation": "«El mi amigo» ошибочно, артикль не ставится."
            },
            {
                "id": "ex-8-13",
                "type": "input",
                "question": "Напишите притяжательное «мои» (множественное число):",
                "correctAnswer": "mis",
                "acceptableAnswers": ["mis", "Mis"],
                "explanation": "mis."
            },
            {
                "id": "ex-8-14",
                "type": "transformation",
                "question": "Поставьте во множественное число: «su amigo» → «____»",
                "prompt": "su amigo → ____",
                "correctAnswer": "sus amigos",
                "acceptableAnswers": ["sus amigos", "Sus amigos"],
                "explanation": "su amigo → sus amigos."
            },
            {
                "id": "ex-8-15",
                "type": "tiles",
                "question": "Соберите предложение: «Наши родители живут в Севилье.»",
                "tiles": ["Nuestros", "padres", "viven", "en", "Sevilla."],
                "correctAnswer": "Nuestros padres viven en Sevilla.",
                "explanation": "Nuestros padres viven en Sevilla."
            },
            {
                "id": "ex-8-16",
                "type": "gap",
                "question": "David ayuda a ____ (его, жен. ед.) madre en la cocina.",
                "correctAnswer": "su",
                "acceptableAnswers": ["su", "Su"],
                "explanation": "su madre."
            },
            {
                "id": "ex-8-17",
                "type": "choice",
                "question": "Как сказать «наши преподавательницы» (только женщины)?",
                "options": ["nuestras profesoras", "nuestros profesoras", "nuestra profesoras", "nosotras profesoras"],
                "correctAnswer": "nuestras profesoras",
                "explanation": "nuestras profesoras."
            },
            {
                "id": "ex-8-18",
                "type": "input",
                "question": "Напишите форму «твои» (множественное число):",
                "correctAnswer": "tus",
                "acceptableAnswers": ["tus", "Tus"],
                "explanation": "tus."
            },
            {
                "id": "ex-8-19",
                "type": "gap",
                "question": "Ésta es ____ (наша) ciudad favorita de España.",
                "correctAnswer": "nuestra",
                "acceptableAnswers": ["nuestra", "Nuestra"],
                "explanation": "nuestra ciudad."
            },
            {
                "id": "ex-8-20",
                "type": "tiles",
                "question": "Соберите фразу: «Это твоя новая сумка?»",
                "tiles": ["¿Éste", "es", "tu", "bolso", "nuevo?"],
                "correctAnswer": "¿Éste es tu bolso nuevo?",
                "explanation": "¿Éste es tu bolso nuevo?"
            },
            {
                "id": "ex-8-21",
                "type": "choice",
                "question": "Какая форма притяжательного местоимения подходит для «ustedes»?",
                "options": ["su / sus", "tu / tus", "mi / mis", "nuestro"],
                "correctAnswer": "su / sus",
                "explanation": "Для ustedes используется «su» (ед. ч. предмета) / «sus» (мн. ч. предметов)."
            },
            {
                "id": "ex-8-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «nuestra casa» → «____»",
                "prompt": "nuestra casa → ____",
                "correctAnswer": "nuestras casas",
                "acceptableAnswers": ["nuestras casas", "Nuestras casas"],
                "explanation": "nuestras casas."
            },
            {
                "id": "ex-8-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение правильно объединяет семью, притяжательные и ser/estar?",
                "options": [
                    "Mi hermana es médica y su hospital está en el centro.",
                    "El mi hermana es médica y el su hospital es en el centro.",
                    "Mis hermana está médica y su hospital soy en el centro.",
                    "Mi hermana tiene médica y sus hospital está en el centro."
                ],
                "correctAnswer": "Mi hermana es médica y su hospital está en el centro.",
                "explanation": "Mi hermana (притяж.) + es médica (профессия ser) + su hospital está en el centro (место estar)."
            },
            {
                "id": "ex-8-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «Наш дедушка живет с моими родителями»:",
                "correctAnswer": "Nuestro abuelo vive con mis padres",
                "acceptableAnswers": [
                    "Nuestro abuelo vive con mis padres",
                    "nuestro abuelo vive con mis padres"
                ],
                "explanation": "Nuestro abuelo vive con mis padres."
            }
        ],
        "miniScenario": {
            "title": "Поиск потерянного паспорта в аэропорту",
            "setting": "Стойка информации в аэропорту Барселоны.",
            "situation": "Вы потеряли свой паспорт и рюкзак. Сотрудник аэропорта помогает вам найти вещи.",
            "dialog": [
                {"speaker": "Empleado", "text": "¡Buenos días! ¿Qué ha perdido?"},
                {"speaker": "Tú", "text": "Buenos días. He perdido mi mochila y mi pasaporte."},
                {"speaker": "Empleado", "text": "¿Cómo es su mochila? ¿Y cuál es su nombre?"},
                {"speaker": "Tú", "text": "Mi nombre es Alex. Mi mochila es negra y tiene mis libros dentro."}
            ],
            "task": "Объясните сотруднику, что вы потеряли свой рюкзак и паспорт.",
            "prompt": "Как сказать: «Я потерял мой рюкзак и мой паспорт»?",
            "options": [
                "He perdido mi mochila y mi pasaporte.",
                "He perdido el mi mochila y el mi pasaporte.",
                "He perdido mis mochila y mis pasaporte.",
                "He perdido su mochila y su pasaporte."
            ],
            "correctIndex": 0,
            "explanation": "«Mi mochila y mi pasaporte» — правильное использование притяжательных mi без лишних артиклей."
        },
        "shortText": {
            "title": "La casa de nuestros abuelos",
            "text": "Nuestra casa de campo es el lugar favorito de toda la familia. Nuestros abuelos viven allí desde hace cincuenta años. Su jardín tiene muchos árboles frutales y sus flores son preciosas. Mis primos y yo pasamos nuestras vacaciones de verano jugando en el patio. Mi abuelo siempre nos cuenta sus historias de juventud y mi abuela prepara sus famosos pasteles.",
            "questions": [
                {
                    "question": "¿De quién es la casa de campo?",
                    "options": ["De los tíos", "De los abuelos", "De los profesores", "De los vecinos"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Nuestros abuelos viven allí...»."
                },
                {
                    "question": "¿Qué forma posesiva se usa para «vacaciones» en el texto?",
                    "options": ["Nuestra", "Nuestras", "Mis", "Sus"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «pasamos nuestras vacaciones de verano...»."
                },
                {
                    "question": "¿Qué cuenta el abuelo?",
                    "options": ["Sus historias de juventud", "Sus problemas", "Sus canciones", "Sus números"],
                    "correctIndex": 0,
                    "explanation": "В тексте: «nos cuenta sus historias de juventud...»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание личных вещей и членов семьи через притяжательные",
            "prompt": "Напишите короткий текст (4-5 предложений), используя различные притяжательные прилагательные:\n1. Опишите свой дом или комнату (Mi casa es..., mis cosas son...).\n2. Упомяните родственников и их вещи (Mi hermano y su coche, mi madre y su trabajo...).\n3. Используйте форму «nuestro/nuestra/nuestros» (Nuestra familia, nuestros amigos...).\n4. Соблюдайте согласование по родам и числам.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Употребление притяжательных прилагательных", "points": 35, "description": "Правильное использование mi/mis, tu/tus, su/sus, nuestro/a/os/as без лишних артиклей."},
                    {"name": "Грамматическое согласование", "points": 30, "description": "Точное согласование по числу и роду с существительным."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Текст связно описывает семью и личные вещи."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Отсутствие опечаток, заглавные буквы, логика."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 11: Tener (to have) and tener expressions
    # ----------------------------------------------------
    11: {
        "id": 11,
        "topicName": "Tener (to have) and tener expressions",
        "russianTitle": "Глагол TENER и идиоматические выражения состояния",
        "level": "A1",
        "category": "Grammar",
        "unitId": "a1-u04-family",
        "icon": "⚡",
        "summary": "Глагол TENER (иметь) — один из самых важных глаголов в испанском языке. Помимо обладания предметами и указания возраста, с глаголом TENER строятся фундаментальные выражения физического и эмоционального состояния (tener hambre, tener sed, tener calor, tener frío, tener miedo...).",
        "mnemonicRule": "В русском «Мне холодно / Я хочу есть», а в испанском — «Я ИМЕЮ холод (tengo frío) / Я ИМЕЮ голод (tengo hambre) / Я ИМЕЮ N лет (tengo N años)».",
        "goalsRu": [
            "Спрягать глагол tener в Presente (tengo, tienes, tiene, tenemos, tenéis, tienen)",
            "Выражать возраст через «tener ... años»",
            "Использовать базовые идиомы состояния: tener hambre, tener sed, tener frío, tener calor, tener sueño, tener miedo, tener prisa, tener razón",
            "Использовать конструкцию обязательства «tener que + инфинитив» (должен / нужно сделать)"
        ],
        "sections": [
            {
                "title": "1. Спряжение глагола TENER в настоящем времени",
                "content": "Глагол tener имеет неправильную форму 1-го лица (tengo) и чередование e → ie в ударных формах:",
                "tables": [
                    {
                        "headers": ["Лицо", "Форма глагола", "Русский перевод", "Пример"],
                        "rows": [
                            ["yo", "tengo", "я имею / у меня есть", "Tengo dos hermanos."],
                            ["tú", "tienes", "ты имеешь / у тебя есть", "¿Tienes tiempo hoy?"],
                            ["vos (Аргентина)", "tenés", "ты имеешь (voseo)", "Tenés razón."],
                            ["él / ella / usted", "tiene", "он/она имеет / у Вас есть", "Tiene veinte años."],
                            ["nosotros / nosotras", "tenemos", "мы имеем / у нас есть", "Tenemos una casa grande."],
                            ["vosotros / vosotras", "tenéis", "вы имеете (Испания)", "¿Tenéis hambre?"],
                            ["ellos / ellas / ustedes", "tienen", "они имеют / у вас всех есть", "Tienen mucha prisa."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Идиоматические выражения состояния с TENER",
                "content": "В испанском физические ощущения и эмоции «имеются», поэтому с ними используются существительные (hambre, sed, frío...) и наречие MUCHO (очень):",
                "tables": [
                    {
                        "headers": ["Выражение с TENER", "Буквальный смысл", "Русский перевод", "Пример с «много» (mucho)"],
                        "rows": [
                            ["tener hambre", "иметь голод", "хотеть есть / быть голодным", "Tengo mucha hambre (f)"],
                            ["tener sed", "иметь жажду", "хотеть пить", "Tengo mucha sed (f)"],
                            ["tener frío", "иметь холод", "мерзнуть / мне холодно", "Tengo mucho frío (m)"],
                            ["tener calor", "иметь жару", "мне жарко", "Tengo mucho calor (m)"],
                            ["tener sueño", "иметь сон", "хотеть спать / быть сонным", "Tengo mucho sueño (m)"],
                            ["tener miedo (de)", "иметь страх", "бояться (чего-то)", "Tengo miedo a la oscuridad"],
                            ["tener prisa", "иметь спешку", "спешить / торопиться", "Tengo mucha prisa hoy"],
                            ["tener razón", "иметь правоту", "быть правым", "Tú tienes toda la razón"],
                            ["tener que + inf.", "иметь обязанность", "быть должным / нужно сделать", "Tengo que estudiar español"]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Tengo veinticinco años.", "ru": "Мне двадцать пять лет."},
            {"es": "Tengo mucha hambre, vamos a comer.", "ru": "Я очень хочу есть, пойдём поедим."},
            {"es": "En verano en Madrid tenemos mucho calor.", "ru": "Летом в Мадриде нам очень жарко."},
            {"es": "¿Tienes frío? Toma mi chaqueta.", "ru": "Тебе холодно? Возьми мою куртку."},
            {"es": "Estoy cansado y tengo mucho sueño.", "ru": "Я устал и очень хочу спать."},
            {"es": "Los niños tienen miedo a los perros grandes.", "ru": "Дети боятся больших собак."},
            {"es": "Perdón, no puedo hablar ahora, tengo prisa.", "ru": "Прости, я не могу говорить сейчас, я спешу."},
            {"es": "Tienes razón, la lección es muy importante.", "ru": "Ты прав, этот урок очень важный."},
            {"es": "Tengo que comprar comida en el supermercado.", "ru": "Я должен купить еду в супермаркете."},
            {"es": "¿Cuántos años tienen tus hermanos?", "ru": "Сколько лет твоим братьям?"}
        ],
        "typicalMistakes": [
            {
                "mistake": "«Soy hambre» или «Estoy hambre»",
                "correction": "Tengo hambre / Tengo sed",
                "explanation": "Голод, жажда, холод и жара выражаются исключительно глаголом TENER."
            },
            {
                "mistake": "«Tengo muy frío» вместо «Tengo mucho frío»",
                "correction": "Tengo mucho frío / Tengo mucha hambre",
                "explanation": "С глаголом tener используются существительные (frío, calor, hambre, sed), поэтому усилитель — прилагательное «mucho/mucha», а не наречие «muy»."
            },
            {
                "mistake": "«Tengo que estudio» вместо инфинитива",
                "correction": "Tengo que estudiar",
                "explanation": "После «tener que» всегда ставится глагол в начальной форме (инфинитиве): estudiar, comer, salir."
            }
        ],
        "trapAlert": "Говорим «Tengo MUCHO frío» (не «muy»), потому что frío здесь — существительное!",
        "dialectNote": "В Аргентине и Уругвае ударение в форме глагола для vos падает на окончание: «vos tenés» («¿Tenés frío?», «Tenés razón»).",
        "quiz": [
            {
                "question": "Как сказать «Я хочу пить» по-испански?",
                "type": "recognition",
                "options": ["Soy sed.", "Estoy sed.", "Tengo sed.", "Hago sed."],
                "correctIndex": 2,
                "explanations": [
                    "Ser не используется с ощущениями.",
                    "Estar не используется со словом sed.",
                    "Правильно: «Tengo sed» (глагол tener).",
                    "Hacer sed — ошибка."
                ]
            },
            {
                "question": "Какое слово используется для усиления: «Tengo ____ frío»?",
                "type": "recognition",
                "options": ["muy", "mucho", "mucha", "muchos"],
                "correctIndex": 1,
                "explanations": [
                    "«Muy» употребляется только перед прилагательными и наречиями.",
                    "Правильно: «mucho» (frío — существительное мужского рода).",
                    "«Mucha» — женский род (mucha hambre).",
                    "«Muchos» — множественное число."
                ]
            },
            {
                "question": "Какая форма глагола tener соответствует местоимению «nosotros»?",
                "type": "recognition",
                "options": ["tengo", "tienes", "tenemos", "tienen"],
                "correctIndex": 2,
                "explanations": [
                    "Tengo — yo.",
                    "Tienes — tú.",
                    "Правильно: nosotros «tenemos».",
                    "Tienen — ellos/ustedes."
                ]
            },
            {
                "question": "Что означает конструкция «Tener que + infinitivo»?",
                "type": "recognition",
                "options": ["Желание сделать что-то", "Обязанность / необходимость (должен/нужно)", "Прошедшее действие", "Запрет"],
                "correctIndex": 1,
                "explanations": [
                    "Желание выражается глаголом querer.",
                    "Правильно: «Tener que + inf.» выражает необходимость или обязанность (я должен / мне нужно).",
                    "Неверно.",
                    "Неверно."
                ]
            },
            {
                "question": "Вставьте форму: «Los estudiantes ____ mucha hambre después de la clase.»",
                "type": "application",
                "options": ["tienen", "tenemos", "tiene", "tengo"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: los estudiantes = 3 лицо мн. число → «tienen».",
                    "Tenemos — 1 лицо мн. число.",
                    "Tiene — единственное число.",
                    "Tengo — 1 лицо ед. число."
                ]
            },
            {
                "question": "Как сказать «Ты абсолютно прав»?",
                "type": "application",
                "options": ["Tú eres razón.", "Tú tienes razón.", "Tú estás razón.", "Tú haces razón."],
                "correctIndex": 1,
                "explanations": [
                    "Ser не используется со словом razón.",
                    "Правильно: «Tú tienes razón» (идиома tener razón).",
                    "Estar — ошибка.",
                    "Hacer — ошибка."
                ]
            },
            {
                "question": "Вставьте глагол: «Mañana tengo que ____ (учиться) para el examen.»",
                "type": "application",
                "options": ["estudio", "estudiar", "estudias", "estudiamos"],
                "correctIndex": 1,
                "explanations": [
                    "После tener que требуется инфинитив, а не спрягаемая форма.",
                    "Правильно: «tengo que estudiar» (инфинитив).",
                    "Спрягаемая форма не подходит.",
                    "Спрягаемая форма не подходит."
                ]
            },
            {
                "question": "Вставьте правильную форму: «Tengo ____ hambre.»",
                "type": "application",
                "options": ["muy", "mucho", "mucha", "muchos"],
                "correctIndex": 2,
                "explanations": [
                    "Muy нельзя с существительными.",
                    "Hambre женского рода (хотя с артиклем el hambre из-за ударения), прилагательное «mucha» женского рода.",
                    "Правильно: «Tengo mucha hambre» (hambre — существительное женского рода).",
                    "Множественное число."
                ]
            },
            {
                "question": "Вы на улице зимой без пальто. Как сказать другу, что вы замерзли?",
                "type": "transfer",
                "options": ["Tengo mucho frío.", "Soy mucho frío.", "Estoy muy frío.", "Hago frío hoy."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Tengo mucho frío» (физическое ощущение холода).",
                    "Soy frío — ошибка (означало бы «я холодный по натуре человек»).",
                    "Estoy frío — не передает ощущение «мне холодно».",
                    "«Hace frío» говорит о погоде на улице, а не о личном самочувствии."
                ]
            },
            {
                "question": "Вам нужно уйти со встречи, потому что вы опаздываете на поезд. Что сказать вежливо?",
                "type": "transfer",
                "options": [
                    "Perdón, tengo mucha prisa, tengo que irme.",
                    "Perdón, soy mucha prisa, estoy que irme.",
                    "De nada, tengo frío a la estación.",
                    "Hasta luego, tengo miedo del tren."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «tengo mucha prisa (спешу), tengo que irme (должен идти)».",
                    "Soy prisa — грубая ошибка.",
                    "Бессмысленно.",
                    "«Tengo miedo del tren» значит «я боюсь поезда»."
                ]
            },
            {
                "question": "У ребенка слипаются глаза в 22:00. Что скажет мама?",
                "type": "transfer",
                "options": ["El niño tiene sueño, tiene que dormir.", "El niño es sueño, tiene que dormir.", "El niño está sueño, es que dormir.", "El niño tiene miedo, está dormir."],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «tiene sueño (хочет спать), tiene que dormir (должен поспать)».",
                    "Es sueño — ошибка.",
                    "Está sueño — ошибка.",
                    "Tengo miedo — боится."
                ]
            },
            {
                "question": "Как спросить у собеседника в ресторане: «Ты хочешь есть?»?",
                "type": "transfer",
                "options": ["¿Tienes hambre?", "¿Eres hambre?", "¿Estás hambre?", "¿Haces hambre?"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Tienes hambre?» — классический вопрос.",
                    "Eres hambre — ошибка.",
                    "Estás hambre — ошибка.",
                    "Haces hambre — ошибка."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-11-01",
                "type": "choice",
                "question": "Какая форма глагола tener соответствует «yo»?",
                "options": ["tengo", "tienes", "tiene", "tenemos"],
                "correctAnswer": "tengo",
                "explanation": "yo tengo."
            },
            {
                "id": "ex-11-02",
                "type": "gap",
                "question": "Yo ____ (имею) veintidós años.",
                "correctAnswer": "tengo",
                "acceptableAnswers": ["tengo", "Tengo"],
                "explanation": "Tengo veintidós años."
            },
            {
                "id": "ex-11-03",
                "type": "tiles",
                "question": "Соберите предложение: «Я очень хочу есть, пойдём в ресторан.»",
                "tiles": ["Tengo", "mucha", "hambre,", "vamos", "al", "restaurante."],
                "correctAnswer": "Tengo mucha hambre, vamos al restaurante.",
                "explanation": "Tengo mucha hambre, vamos al restaurante."
            },
            {
                "id": "ex-11-04",
                "type": "transformation",
                "question": "Поставьте глагол tener в форму 2-го лица ед. ч. (tú): «Yo tengo» → «Tú ____»",
                "prompt": "tener (tú) → ____",
                "correctAnswer": "tienes",
                "acceptableAnswers": ["tienes", "Tienes"],
                "explanation": "tú tienes."
            },
            {
                "id": "ex-11-05",
                "type": "input",
                "question": "Напишите форму глагола tener для «él / ella»:",
                "correctAnswer": "tiene",
                "acceptableAnswers": ["tiene", "Tiene"],
                "explanation": "él/ella tiene."
            },
            {
                "id": "ex-11-06",
                "type": "gap",
                "question": "Nosotros ____ (хотим пить / иметь жажду) mucha sed.",
                "correctAnswer": "tenemos",
                "acceptableAnswers": ["tenemos", "Tenemos"],
                "explanation": "tenemos mucha sed."
            },
            {
                "id": "ex-11-07",
                "type": "choice",
                "question": "Что означает «Tengo sueño»?",
                "options": ["Я хочу спать", "Мне холодно", "Я боюсь", "Я спешу"],
                "correctAnswer": "Я хочу спать",
                "explanation": "tener sueño = хотеть спать."
            },
            {
                "id": "ex-11-08",
                "type": "input",
                "question": "Напишите форму глагола tener для «ellos»:",
                "correctAnswer": "tienen",
                "acceptableAnswers": ["tienen", "Tienen"],
                "explanation": "ellos tienen."
            },
            {
                "id": "ex-11-09",
                "type": "transformation",
                "question": "Замените «tú tienes» на аргентинскую форму voseo:",
                "prompt": "tú tienes → vos ____",
                "correctAnswer": "tenés",
                "acceptableAnswers": ["tenés", "tenes", "Tenés"],
                "explanation": "vos tenés."
            },
            {
                "id": "ex-11-10",
                "type": "tiles",
                "question": "Соберите фразу: «Ты абсолютно прав, мой друг.»",
                "tiles": ["Tienes", "toda", "la", "razón,", "mi", "amigo."],
                "correctAnswer": "Tienes toda la razón, mi amigo.",
                "explanation": "Tienes toda la razón, mi amigo."
            },
            {
                "id": "ex-11-11",
                "type": "gap",
                "question": "Hoy tengo ____ (много) frío porque no llevo abrigo.",
                "correctAnswer": "mucho",
                "acceptableAnswers": ["mucho", "Mucho"],
                "explanation": "mucho frío."
            },
            {
                "id": "ex-11-12",
                "type": "choice",
                "question": "Что означает «Tener prisa»?",
                "options": ["Спешить / торопиться", "Бояться", "Хотеть есть", "Быть правым"],
                "correctAnswer": "Спешить / торопиться",
                "explanation": "tener prisa = спешить."
            },
            {
                "id": "ex-11-13",
                "type": "input",
                "question": "Напишите по-испански: «У меня есть вопрос» (Tengo una...):",
                "correctAnswer": "Tengo una pregunta",
                "acceptableAnswers": ["Tengo una pregunta", "tengo una pregunta"],
                "explanation": "Tengo una pregunta."
            },
            {
                "id": "ex-11-14",
                "type": "transformation",
                "question": "Преобразуйте в конструкцию обязанности (tengo que + инфинитив): «Yo estudio» → «Tengo que ____»",
                "prompt": "estudio → ____",
                "correctAnswer": "estudiar",
                "acceptableAnswers": ["estudiar", "Estudiar"],
                "explanation": "tengo que estudiar."
            },
            {
                "id": "ex-11-15",
                "type": "tiles",
                "question": "Соберите предложение: «Мне нужно купить билет на автобус.»",
                "tiles": ["Tengo", "que", "comprar", "el", "billete", "de", "autobús."],
                "correctAnswer": "Tengo que comprar el billete de autobús.",
                "explanation": "Tengo que comprar el billete de autobús."
            },
            {
                "id": "ex-11-16",
                "type": "gap",
                "question": "En verano en Sevilla la gente ____ (имеет) mucho calor.",
                "correctAnswer": "tiene",
                "acceptableAnswers": ["tiene", "Tiene"],
                "explanation": "la gente tiene."
            },
            {
                "id": "ex-11-17",
                "type": "choice",
                "question": "Как сказать «Дети боятся темноты»?",
                "options": ["Los niños tienen miedo a la oscuridad.", "Los niños son miedo a la oscuridad.", "Los niños están miedo.", "Los niños hacen miedo."],
                "correctAnswer": "Los niños tienen miedo a la oscuridad.",
                "explanation": "tener miedo = бояться."
            },
            {
                "id": "ex-11-18",
                "type": "input",
                "question": "Напишите форму глагола tener для «nosotros»:",
                "correctAnswer": "tenemos",
                "acceptableAnswers": ["tenemos", "Tenemos"],
                "explanation": "tenemos."
            },
            {
                "id": "ex-11-19",
                "type": "gap",
                "question": "Perdón, no puedo hablar más, ____ (я спешу) mucha prisa.",
                "correctAnswer": "tengo",
                "acceptableAnswers": ["tengo", "Tengo"],
                "explanation": "tengo mucha prisa."
            },
            {
                "id": "ex-11-20",
                "type": "tiles",
                "question": "Соберите фразу: «Сколько лет твоей сестре?»",
                "tiles": ["¿Cuántos", "años", "tiene", "tu", "hermana?"],
                "correctAnswer": "¿Cuántos años tiene tu hermana?",
                "explanation": "¿Cuántos años tiene tu hermana?"
            },
            {
                "id": "ex-11-21",
                "type": "choice",
                "question": "Какая фраза грамматически верна?",
                "options": ["Tengo que trabajar mañana.", "Tengo que trabajo mañana.", "Tengo que trabajando mañana.", "Tengo que trabajado mañana."],
                "correctAnswer": "Tengo que trabajar mañana.",
                "explanation": "Tener que + инфинитив (trabajar)."
            },
            {
                "id": "ex-11-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «Tiene hambre» → «Ellos ____ hambre»",
                "prompt": "tiene → ____",
                "correctAnswer": "tienen",
                "acceptableAnswers": ["tienen", "Tienen"],
                "explanation": "ellos tienen."
            },
            {
                "id": "ex-11-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет притяжательные местоимения, семью и глагол tener?",
                "options": [
                    "Mis padres tienen cincuenta años y viven en su casa de campo.",
                    "Mis padres son cincuenta años y están en su casa.",
                    "El mis padres tienen cincuenta años.",
                    "Mis padres llevan cincuenta años y tienen en su casa."
                ],
                "correctAnswer": "Mis padres tienen cincuenta años y viven en su casa de campo.",
                "explanation": "Mis padres (притяж.) + tienen 50 años (возраст) + viven en su casa (притяж. su)."
            },
            {
                "id": "ex-11-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня есть 2 вопроса и я спешу»:",
                "correctAnswer": "Tengo dos preguntas y tengo prisa",
                "acceptableAnswers": [
                    "Tengo dos preguntas y tengo prisa",
                    "Tengo dos preguntas y tengo mucha prisa",
                    "tengo dos preguntas y tengo prisa"
                ],
                "explanation": "Tengo dos preguntas y tengo prisa."
            }
        ],
        "miniScenario": {
            "title": "В кафе после долгой прогулки",
            "setting": "Летняя терраса кафе в Кордове, 15:00 (+35°C).",
            "situation": "Вы с другом гуляли по городу в жару и зашли в кафе перекусить и отдохнуть.",
            "dialog": [
                {"speaker": "Amigo", "text": "¡Uf! Tengo muchísimo calor y mucha sed. ¿Y tú?"},
                {"speaker": "Tú", "text": "Yo también tengo mucha sed y además tengo hambre."},
                {"speaker": "Amigo", "text": "Vamos a pedir una botella de agua bien fría y unas tapas."},
                {"speaker": "Tú", "text": "Perfecto, tienes toda la razón. ¡Camarero, por favor!"}
            ],
            "task": "Скажите другу, что вы очень хотите пить и есть.",
            "prompt": "Как выразить, что вы хотите пить и есть?",
            "options": [
                "Tengo mucha sed y tengo hambre.",
                "Soy mucha sed y estoy hambre.",
                "Estoy con sed y hago hambre.",
                "Tengo muy sed y tengo muy hambre."
            ],
            "correctIndex": 0,
            "explanation": "«Tengo mucha sed y tengo hambre» — безупречное использование выражений состояния с глаголом tener."
        },
        "shortText": {
            "title": "La rutina atareada de Marcos",
            "text": "Marcos tiene veintiocho años y trabaja en una empresa internacional. Todos los días se despierta a las seis de la mañana y siempre tiene prisa para tomar el metro. A las dos de la tarde tiene mucha hambre y almuerza con sus compañeros. Por las tardes tiene que estudiar inglés para su trabajo. Cuando llega a casa a las diez de la noche, tiene mucho sueño y se duerme enseguida.",
            "questions": [
                {
                    "question": "¿Cuántos años tiene Marcos?",
                    "options": ["Dieciocho años", "Veintiocho años", "Treinta años", "Veinte años"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Marcos tiene veintiocho años...»."
                },
                {
                    "question": "¿Por qué siempre tiene prisa por la mañana?",
                    "options": ["Para hacer deporte", "Para tomar el metro", "Para ver a su madre", "Para cocinar"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «siempre tiene prisa para tomar el metro»."
                },
                {
                    "question": "¿Qué tiene que hacer Marcos por las tardes?",
                    "options": ["Dormir", "Estudiar inglés para su trabajo", "Comprar ropa", "Ir al cine"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Por las tardes tiene que estudiar inglés para su trabajo»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Описание своего самочувствия и планов на день через TENER",
            "prompt": "Напишите короткий текст о своем текущем состоянии и планах на сегодня (4-5 предложений):\n1. Укажите свой возраст (Tengo ... años).\n2. Опишите физическое состояние через идиомы tener (Tengo hambre/sed/sueño/frío/calor...).\n3. Напишите, что вы должны сделать сегодня (Tengo que + infinitivo).\n4. Используйте наречие «mucho/mucha» для усиления ощущения.",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Идиомы состояния с TENER", "points": 35, "description": "Правильное использование выражений tener hambre/sed/frío/calor/sueño/prisa."},
                    {"name": "Конструкция TENER QUE + инфинитив", "points": 30, "description": "Корректное употребление формулы обязанности с инфинитивом."},
                    {"name": "Использование MUCHO/MUCHA", "points": 20, "description": "Точное согласование mucho frío / mucha hambre (без ошибки «muy»)."},
                    {"name": "Орфография и связность", "points": 15, "description": "Грамотное оформление предложений и связность текста."}
                ]
            }
        }
    },

    # ----------------------------------------------------
    # TOPIC 25: Parts of the body (el cuerpo)
    # ----------------------------------------------------
    25: {
        "id": 25,
        "topicName": "Parts of the body (el cuerpo)",
        "russianTitle": "Части тела (el cuerpo humano) и выражение боли (doler)",
        "level": "A1",
        "category": "Vocabulary",
        "unitId": "a1-u04-family",
        "icon": "🫀",
        "summary": "Названия основных частей человеческого тела на испанском языке, грамматический род (включая исключение la mano), множественное число и конструкция выражения боли: «me duele + ед. ч. / me duelen + мн. ч.» (у меня болит...).",
        "mnemonicRule": "С глаголом DOLER подлежащее — это болящая часть тела! Если болит один орган — «me duele la cabeza», если несколько — «me duelen los pies».",
        "goalsRu": [
            "Знать и называть основные части тела (cabeza, ojos, nariz, boca, orejas, cuello, brazos, manos, piernas, pies, espalda, estómago)",
            "Помнить грамматический род органов (la mano — женский род, el ojo — мужской)",
            "Использовать глагол doler для описания боли и недомогания (me duele / me duelen, te duele, le duele)",
            "Объяснять симптомы врачу или фармацевту в аптеке"
        ],
        "sections": [
            {
                "title": "1. Основные части тела человека",
                "content": "Части тела делятся на мужской и женский род. Обратите внимание на исключение «la mano»:",
                "tables": [
                    {
                        "headers": ["Часть тела (испанский)", "Род и число", "Русский перевод", "Пример"],
                        "rows": [
                            ["la cabeza", "жен. ед.", "голова", "Me duele la cabeza."],
                            ["la cara", "жен. ед.", "лицо", "Tiene la cara sonriente."],
                            ["el ojo / los ojos", "муж. ед./мн.", "глаз / глаза", "Tiene los ojos azules."],
                            ["la nariz", "жен. ед.", "нос", "Respira por la nariz."],
                            ["la boca", "жен. ед.", "рот", "Abre la boca, por favor."],
                            ["la oreja / las orejas", "жен. ед./мн.", "ухо (раковина) / уши", "Me duelen las orejas por el frío."],
                            ["el diente / los dientes", "муж. ед./мн.", "зуб / зубы", "Me cepillo los dientes."],
                            ["el cuello", "муж. ед.", "шея", "Lleva una bufanda en el cuello."],
                            ["el hombro / los hombros", "муж. ед./мн.", "плечо / плечи", "Me duele el hombro derecho."],
                            ["el brazo / los brazos", "муж. ед./мн.", "рука (от плеча) / руки", "Levanta los brazos."],
                            ["la mano / las manos", "жен. ед./мн. (искл.!)", "рука (кисть) / кисти", "Lávate las manos (la mano!)."],
                            ["el dedo / los dedos", "муж. ед./мн.", "палец / пальцы", "Cinco dedos en la mano."],
                            ["la espalda", "жен. ед.", "спина", "Tengo dolor de espalda."],
                            ["el estómago", "муж. ед.", "желудок / живот", "Me duele el estómago."],
                            ["la pierna / las piernas", "жен. ед./мн.", "нога (до стопы) / ноги", "Tengo las piernas cansadas."],
                            ["la rodilla / las rodillas", "жен. ед./мн.", "колено / колени", "Me duele la rodilla izquierda."],
                            ["el pie / los pies", "муж. ед./мн.", "стопа / стопы / ноги", "Voy a pie al trabajo."]
                        ]
                    }
                ]
            },
            {
                "title": "2. Как выразить боль: глагол DOLER (duele / duelen)",
                "content": "Глагол doler работает аналогично глаголу gustar. Он согласуется с частью тела, которая болит:",
                "tables": [
                    {
                        "headers": ["Конструкция", "Когда используется", "Пример", "Перевод"],
                        "rows": [
                            ["Me duele + ед. ч.", "Болит один орган", "Me duele la cabeza.", "У меня болит голова."],
                            ["Me duelen + мн. ч.", "Болят несколько органов", "Me duelen los pies.", "У меня болят ноги (стопы)."],
                            ["¿Qué te duele?", "Вопрос к собеседнику", "¿Te duele la espalda?", "У тебя болит спина?"],
                            ["Tener dolor de + орган", "Синонимичная конструкция", "Tengo dolor de muelas/garganta.", "У меня зубная боль / боль в горле."]
                        ]
                    }
                ]
            }
        ],
        "examples": [
            {"es": "Me duele mucho la cabeza hoy.", "ru": "У меня сегодня сильно болит голова."},
            {"es": "Después de correr me duelen las piernas y los pies.", "ru": "После бега у меня болят ноги и стопы."},
            {"es": "El médico me examina la garganta y los ojos.", "ru": "Врач осматривает мне горло и глаза."},
            {"es": "Lávate las manos con agua y jabón.", "ru": "Помой руки водой с мылом."},
            {"es": "Tiene el pelo largo hasta los hombros.", "ru": "У неё длинные волосы до плеч."},
            {"es": "Tengo cinco dedos en cada mano.", "ru": "У меня пять пальцев на каждой руке."},
            {"es": "¿Te duele el estómago?", "ru": "У тебя болит желудок/живот?"},
            {"es": "El jugador tiene una lesión en la rodilla derecha.", "ru": "У игрока травма правого колена."},
            {"es": "Tengo dolor de espalda por trabajar sentado.", "ru": "У меня болит спина от сидячей работы."},
            {"es": "Abre la boca y cierra los ojos, por favor.", "ru": "Открой рот и закрой глаза, пожалуйста."}
        ],
        "typicalMistakes": [
            {
                "mistake": "«El mano» из-за окончания -o",
                "correction": "la mano / las manos",
                "explanation": "«Mano» — женского рода: la mano derecha, las manos limpias."
            },
            {
                "mistake": "«Me duele los ojos» в единственном числе",
                "correction": "Me duelen los ojos / Me duelen los pies",
                "explanation": "С существительными во множественном числе форма глагола doler обязана быть во множественном числе: «duelen»."
            },
            {
                "mistake": "«Me duele mi cabeza» с лишним притяжательным",
                "correction": "Me duele la cabeza (с определенным артиклем)",
                "explanation": "С частями тела в испанском языке используется определенный артикль (la cabeza, los pies), а не притяжательное (mi), так как местоимение «me» уже указывает на владельца."
            }
        ],
        "trapAlert": "С частями тела НЕ говорят «mi cabeza»: говорим «Me duele LA cabeza», «Me lavo LAS manos»!",
        "dialectNote": "В разговорной речи для живота часто используют слово «la panza» или «la barriga» («Me duele la panza/barriga»), а для горла — «la garganta».",
        "quiz": [
            {
                "question": "Какой артикль ставится перед словом «mano» (рука)?",
                "type": "recognition",
                "options": ["El", "La", "Los", "Un"],
                "correctIndex": 1,
                "explanations": [
                    "Ошибка: mano женского рода.",
                    "Правильно: «La mano» (исключение женского рода).",
                    "Множественное число мужского рода.",
                    "Мужской род."
                ]
            },
            {
                "question": "Какая форма глагола doler нужна во фразе «Me ____ los ojos»?",
                "type": "recognition",
                "options": ["duele", "duelen", "duelo", "dolemos"],
                "correctIndex": 1,
                "explanations": [
                    "«Duele» используется только с единственным числом (la cabeza).",
                    "Правильно: «Me duelen los ojos» (множественное число).",
                    "Формы duelo не существует в значении боли.",
                    "Неверно."
                ]
            },
            {
                "question": "Какая часть тела находится между головой и туловищем?",
                "type": "recognition",
                "options": ["El cuello", "El pie", "La rodilla", "El dedo"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «El cuello» — шея.",
                    "Pie — стопа.",
                    "Rodilla — колено.",
                    "Dedo — палец."
                ]
            },
            {
                "question": "Как переводится фраза «Me duele la espalda»?",
                "type": "recognition",
                "options": ["У меня болит голова", "У меня болит спина", "У меня болят ноги", "У меня болит зуб"],
                "correctIndex": 1,
                "explanations": [
                    "Голова — la cabeza.",
                    "Правильно: «la espalda» — спина.",
                    "Ноги — las piernas / los pies.",
                    "Зуб — el diente / la muela."
                ]
            },
            {
                "question": "Вставьте правильную форму: «Al paciente le ____ (болит) la garganta.»",
                "type": "application",
                "options": ["duele", "duelen", "duelet", "dueles"],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: la garganta в единственном числе → «le duele».",
                    "Duelen используется для множественного числа.",
                    "Ошибочная форма.",
                    "Ошибочная форма."
                ]
            },
            {
                "question": "Вставьте форму: «Después de caminar diez kilómetros me ____ (болят) los pies.»",
                "type": "application",
                "options": ["duele", "duelen", "doler", "duelemos"],
                "correctIndex": 1,
                "explanations": [
                    "Duele — для единственного числа.",
                    "Правильно: los pies во множественном числе → «me duelen».",
                    "Инфинитив.",
                    "Неверно."
                ]
            },
            {
                "question": "Выберите грамматически корректную фразу для выражения боли:",
                "type": "application",
                "options": [
                    "Me duele la cabeza.",
                    "Me duele mi cabeza.",
                    "Soy dolor en la cabeza.",
                    "Estoy dolor de cabeza."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Me duele la cabeza» (с определенным артиклем la).",
                    "«Mi cabeza» с местоимением me избыточно и неестественно.",
                    "Глагол ser не используется.",
                    "Глагол estar не используется."
                ]
            },
            {
                "question": "Вставьте артикль: «Lávate ____ (руки) manos antes de comer.»",
                "type": "application",
                "options": ["los", "las", "el", "la"],
                "correctIndex": 1,
                "explanations": [
                    "Mano женского рода, поэтому «los» ошибочно.",
                    "Правильно: «las manos» (женский род во множественном числе).",
                    "Единственное число мужского рода.",
                    "Единственное число женского рода."
                ]
            },
            {
                "question": "Вы пришли в аптеку в Испании и хотите объяснить, что у вас болит живот. Что сказать фармацевту?",
                "type": "transfer",
                "options": [
                    "Buenos días, me duele el estómago. ¿Tiene algo para el dolor?",
                    "Buenos días, me duelen el estómago. De nada.",
                    "Buenas noches, soy estómago enfermo.",
                    "Hasta luego, tengo dolor de mano."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «me duele el estómago» (ед. число) + вежливый запрос лекарства.",
                    "«Duelen» ошибочно с единственным числом.",
                    "Неграмотная конструкция.",
                    "«Dolor de mano» означает боль в руке."
                ]
            },
            {
                "question": "Футболист получил удар по ноге. Что он скажет врачу на поле?",
                "type": "transfer",
                "options": [
                    "¡Ay! Me duele mucho la rodilla derecha.",
                    "¡Ay! Me duelen mucho la rodilla derecha.",
                    "¡Ay! Soy mucho dolor en la rodilla.",
                    "¡Ay! Estoy dolor en el pie derecho."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «Me duele mucho la rodilla derecha» (колено — ед. ч.).",
                    "Duelen — ошибка с единственным числом.",
                    "Неграмотно.",
                    "Неграмотно."
                ]
            },
            {
                "question": "Стоматолог осматривает пациента. Какой вопрос он задает?",
                "type": "transfer",
                "options": [
                    "¿Qué diente te duele exactamente?",
                    "¿Qué diente te duelen exactamente?",
                    "¿De qué color son tus dientes?",
                    "¿Cuántos dientes llevas?"
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «¿Qué diente te duele exactamente?» (один зуб — duele).",
                    "Duelen с единственным числом ошибочно.",
                    "Вопрос о цвете не касается жалобы на боль.",
                    "Llevar не используется с зубами."
                ]
            },
            {
                "question": "Как перевести «После тренировки у нас болят мышцы и спина»?",
                "type": "transfer",
                "options": [
                    "Nos duele la espalda y nos duelen los músculos.",
                    "Nos duelen la espalda y los músculos.",
                    "Nos duele los músculos y la espalda.",
                    "Somos dolor de espalda y músculos."
                ],
                "correctIndex": 0,
                "explanations": [
                    "Правильно: «nos duele la espalda (ед. ч.) y nos duelen los músculos (мн. ч.)».",
                    "Не разделены формы ед. и мн. числа (хотя при общем сказуемом во мн. ч. допустимо, раздельный вариант грамматически точнее для A1).",
                    "Duele с мн. числом ошибочно.",
                    "Неграмотно."
                ]
            }
        ],
        "exercises": [
            {
                "id": "ex-25-01",
                "type": "choice",
                "question": "Какая часть тела женского рода?",
                "options": ["la mano", "el brazo", "el pie", "el ojo"],
                "correctAnswer": "la mano",
                "explanation": "la mano — женский род (исключение)."
            },
            {
                "id": "ex-25-02",
                "type": "gap",
                "question": "Me ____ (болит, ед. ч.) la cabeza después del trabajo.",
                "correctAnswer": "duele",
                "acceptableAnswers": ["duele", "Duele"],
                "explanation": "Me duele la cabeza."
            },
            {
                "id": "ex-25-03",
                "type": "tiles",
                "question": "Соберите предложение: «У меня болят ноги после прогулки.»",
                "tiles": ["Me", "duelen", "los", "pies", "después", "del", "paseo."],
                "correctAnswer": "Me duelen los pies después del paseo.",
                "explanation": "Me duelen los pies después del paseo."
            },
            {
                "id": "ex-25-04",
                "type": "transformation",
                "question": "Поставьте во множественное число: «Me duele el ojo» → «Me ____ los ojos»",
                "prompt": "duele → ____",
                "correctAnswer": "duelen",
                "acceptableAnswers": ["duelen", "Duelen"],
                "explanation": "Me duelen los ojos."
            },
            {
                "id": "ex-25-05",
                "type": "input",
                "question": "Напишите по-испански слово «голова» (с артиклем):",
                "correctAnswer": "la cabeza",
                "acceptableAnswers": ["la cabeza", "cabeza", "La cabeza", "Cabeza"],
                "explanation": "la cabeza."
            },
            {
                "id": "ex-25-06",
                "type": "gap",
                "question": "El dentista examina los ____ (зубы - diente).",
                "correctAnswer": "dientes",
                "acceptableAnswers": ["dientes", "Dientes"],
                "explanation": "los dientes."
            },
            {
                "id": "ex-25-07",
                "type": "choice",
                "question": "Какой частью тела мы слушаем звуки?",
                "options": ["con las orejas", "con los ojos", "con la boca", "con las manos"],
                "correctAnswer": "con las orejas",
                "explanation": "orejas = уши."
            },
            {
                "id": "ex-25-08",
                "type": "input",
                "question": "Напишите по-испански слово «сердце»:",
                "correctAnswer": "el corazón",
                "acceptableAnswers": ["el corazón", "corazón", "corazon", "el corazon", "El corazón"],
                "explanation": "el corazón."
            },
            {
                "id": "ex-25-09",
                "type": "transformation",
                "question": "Поставьте во множественное число: «el pie» → «los ____»",
                "prompt": "el pie → los ____",
                "correctAnswer": "pies",
                "acceptableAnswers": ["pies", "Pies"],
                "explanation": "los pies."
            },
            {
                "id": "ex-25-10",
                "type": "tiles",
                "question": "Соберите фразу: «Открой рот и покажи язык.»",
                "tiles": ["Abre", "la", "boca", "y", "muestra", "la", "lengua."],
                "correctAnswer": "Abre la boca y muestra la lengua.",
                "explanation": "Abre la boca y muestra la lengua."
            },
            {
                "id": "ex-25-11",
                "type": "gap",
                "question": "A Carlos le ____ (болит) la espalda por levantar peso.",
                "correctAnswer": "duele",
                "acceptableAnswers": ["duele", "Duele"],
                "explanation": "le duele la espalda."
            },
            {
                "id": "ex-25-12",
                "type": "choice",
                "question": "Сколько пальцев (dedos) на одной руке?",
                "options": ["cinco", "diez", "cuatro", "seis"],
                "correctAnswer": "cinco",
                "explanation": "5 = cinco dedos."
            },
            {
                "id": "ex-25-13",
                "type": "input",
                "question": "Напишите по-испански слово «шея»:",
                "correctAnswer": "el cuello",
                "acceptableAnswers": ["el cuello", "cuello", "El cuello", "Cuello"],
                "explanation": "el cuello."
            },
            {
                "id": "ex-25-14",
                "type": "transformation",
                "question": "Измените местоимение боли на 2-е лицо (тебе): «Me duele la rodilla» → «¿____ duele la rodilla?»",
                "prompt": "me → ____",
                "correctAnswer": "te",
                "acceptableAnswers": ["te", "Te"],
                "explanation": "¿Te duele la rodilla?"
            },
            {
                "id": "ex-25-15",
                "type": "tiles",
                "question": "Соберите предложение: «Помой руки перед едой.»",
                "tiles": ["Lávate", "las", "manos", "antes", "de", "comer."],
                "correctAnswer": "Lávate las manos antes de comer.",
                "explanation": "Lávate las manos antes de comer."
            },
            {
                "id": "ex-25-16",
                "type": "gap",
                "question": "Tiene el pelo largo hasta los ____ (плечи - hombro).",
                "correctAnswer": "hombros",
                "acceptableAnswers": ["hombros", "Hombros"],
                "explanation": "los hombros."
            },
            {
                "id": "ex-25-17",
                "type": "choice",
                "question": "Какая часть тела находится на ноге между бедром и голенью?",
                "options": ["la rodilla", "el codo", "el hombro", "la mano"],
                "correctAnswer": "la rodilla",
                "explanation": "rodilla = колено."
            },
            {
                "id": "ex-25-18",
                "type": "input",
                "question": "Напишите по-испански «рука (кисть)» с определенным артиклем:",
                "correctAnswer": "la mano",
                "acceptableAnswers": ["la mano", "La mano"],
                "explanation": "la mano."
            },
            {
                "id": "ex-25-19",
                "type": "gap",
                "question": "Me ____ (болят) los dientes, tengo que ir al dentista.",
                "correctAnswer": "duelen",
                "acceptableAnswers": ["duelen", "Duelen"],
                "explanation": "Me duelen los dientes."
            },
            {
                "id": "ex-25-20",
                "type": "tiles",
                "question": "Соберите фразу: «У него карие глаза и прямой нос.»",
                "tiles": ["Tiene", "los", "ojos", "marrones", "y", "la", "nariz", "recta."],
                "correctAnswer": "Tiene los ojos marrones y la nariz recta.",
                "explanation": "Tiene los ojos marrones y la nariz recta."
            },
            {
                "id": "ex-25-21",
                "type": "choice",
                "question": "Как сказать «У меня болит желудок»?",
                "options": ["Me duele el estómago.", "Me duelen el estómago.", "Soy dolor de estómago.", "Estoy estómago."],
                "correctAnswer": "Me duele el estómago.",
                "explanation": "Me duele el estómago."
            },
            {
                "id": "ex-25-22",
                "type": "transformation",
                "question": "Поставьте во множественное число: «la pierna» → «las ____»",
                "prompt": "la pierna → las ____",
                "correctAnswer": "piernas",
                "acceptableAnswers": ["piernas", "Piernas"],
                "explanation": "las piernas."
            },
            {
                "id": "ex-25-23",
                "type": "choice",
                "spiralReview": True,
                "question": "Какое предложение объединяет части тела, глагол tener и цвета?",
                "options": [
                    "Mi hermana tiene los ojos azules y el pelo rubio.",
                    "Mi hermana es los ojos azules y el pelo rubio.",
                    "Mi hermana está los ojos azul y pelo rubia.",
                    "Mi hermana lleva ojos azul y pelo rubio."
                ],
                "correctAnswer": "Mi hermana tiene los ojos azules y el pelo rubio.",
                "explanation": "Tiene los ojos azules (tener + соглас. цветов) y el pelo rubio."
            },
            {
                "id": "ex-25-24",
                "type": "input",
                "spiralReview": True,
                "question": "Напишите по-испански: «У меня болит голова и мне нужно отдохнуть»:",
                "correctAnswer": "Me duele la cabeza y tengo que descansar",
                "acceptableAnswers": [
                    "Me duele la cabeza y tengo que descansar",
                    "me duele la cabeza y tengo que descansar"
                ],
                "explanation": "Me duele la cabeza y tengo que descansar."
            }
        ],
        "miniScenario": {
            "title": "Визит к врачу в поликлинике",
            "setting": "Кабинет терапевта в Мадриде.",
            "situation": "Вы пришли на прием к доктору из-за сильной головной боли и боли в горле.",
            "dialog": [
                {"speaker": "Médico", "text": "¡Buenos días! Siéntese, por favor. ¿Qué le pasa? ¿Qué le duele?"},
                {"speaker": "Tú", "text": "Buenos días, doctor. Me duele mucho la cabeza y también me duele la garganta."},
                {"speaker": "Médico", "text": "Bien, abra la boca para ver la garganta... Sí, está un poco roja. Debe tomar este medicamento."},
                {"speaker": "Tú", "text": "Muchas gracias, doctor."}
            ],
            "task": "Объясните врачу, что у вас болит голова и горло.",
            "prompt": "Как сказать врачу о симптомах?",
            "options": [
                "Me duele mucho la cabeza y también me duele la garganta.",
                "Me duelen la cabeza y soy garganta.",
                "Tengo dolor de la cabeza y estoy garganta.",
                "Me duele los ojos y las piernas solamente."
            ],
            "correctIndex": 0,
            "explanation": "«Me duele mucho la cabeza y también me duele la garganta» — точное и грамотное выражение симптомов."
        },
        "shortText": {
            "title": "Un día en la consulta médica",
            "text": "Hoy Elena visita al médico porque no se siente bien. Después de hacer deporte el fin de semana, le duelen mucho las piernas y la espalda. Además, tiene dolor de cabeza y un poco de fiebre. El doctor le examina los ojos, la boca y la espalda. Le dice: «Elena, no es grave, pero tienes que descansar tres días y beber mucha agua». Elena regresa a casa para recuperarse.",
            "questions": [
                {
                    "question": "¿Por qué visita Elena al médico?",
                    "options": ["Porque quiere un certificado", "Porque le duelen las piernas, la espalda y la cabeza", "Porque busca trabajo", "Para visitar a un amigo"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «le duelen mucho las piernas y la espalda. Además, tiene dolor de cabeza...»."
                },
                {
                    "question": "¿Qué forma verbal se usa para «las piernas»?",
                    "options": ["Duele", "Duelen", "Dolemos", "Dueles"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «le duelen mucho las piernas...» (множественное число)."
                },
                {
                    "question": "¿Qué consejo le da el doctor a Elena?",
                    "options": ["Correr un maratón", "Descansar tres días y beber mucha agua", "Comer helado", "Trabajar diez horas"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «tienes que descansar tres días y beber mucha agua»."
                }
            ]
        },
        "productiveTask": {
            "type": "writing",
            "title": "Записка врачу или объяснение самочувствия",
            "prompt": "Напишите короткую записку (4-5 предложений), объясняя свое самочувствие или причину пропуска занятий:\n1. Поздоровайтесь вежливо (Buenos días, doctor / profesor).\n2. Объясните, что вы заболели или плохо себя чувствуете (Hoy estoy enfermo / no me siento bien).\n3. Опишите, какие части тела болят, используя конструкции «me duele (ед. ч.)» и «me duelen (мн. ч.)» (Me duele la cabeza, me duelen los ojos...).\n4. Напишите, что вам нужно отдохнуть (Tengo que descansar en casa).",
            "minWords": 20,
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Конструкции выражения боли (doler)", "points": 35, "description": "Безошибочное различение me duele (ед. ч.) и me duelen (мн. ч.) с артиклями la/los/las."},
                    {"name": "Лексика частей тела", "points": 30, "description": "Правильное употребление названий органов (cabeza, espalda, ojos, garganta, manos...)."},
                    {"name": "Выполнение коммуникативной задачи", "points": 20, "description": "Логичное объяснение причины недомогания."},
                    {"name": "Орфография и пунктуация", "points": 15, "description": "Грамотное оформление текста."}
                ]
            }
        }
    }
}
