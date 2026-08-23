# -*- coding: utf-8 -*-
"""
Full Curated Grammar & Vocabulary Engine for LinguaLearn English.
Guarantees 100% rich, dedicated pedagogical content for all 125 topics (A1-B2) with ZERO generic placeholders.
"""
import json, os, sqlite3

def generate_curated_packages():
    # Database connection
    con = sqlite3.connect("/srv/LinguaLearn/english/server/english_learning.db")
    cur = con.cursor()
    all_db_topics = cur.execute("SELECT id, name, category, level FROM curriculum_topics WHERE level IN ('A1', 'A2', 'B1', 'B2') ORDER BY id").fetchall()

    DATA = {}

    def add(t_id, ru_title, summary, s1_title, s1_text, s2_title, s2_text, tbl_title, tbl_headers, tbl_rows, examples, mistakes, tutor_prompts=None):
        if not tutor_prompts:
            tutor_prompts = [
                f"Объясни правило «{ru_title}» простыми словами с примерами",
                "Приведи 3 частые ошибки русскоязычных студентов в этой теме",
                "Дай мне 3 практических предложения для проверки знаний"
            ]
        DATA[t_id] = {
            "russianTitle": ru_title,
            "summaryRu": summary,
            "sections": [
                {"title": s1_title, "content": s1_text},
                {"title": s2_title, "content": s2_text}
            ],
            "tables": [
                {"title": tbl_title, "headers": tbl_headers, "rows": tbl_rows}
            ],
            "examples": examples,
            "commonMistakes": mistakes,
            "tutorQuickPrompts": tutor_prompts
        }

    # =========================================================================
    # A1 (Topics 1 - 30)
    # =========================================================================
    add(1, 'Глагол "to be" в настоящем времени (am/is/are)',
        'Глагол to be (быть, являться, находиться) — основа английского языка. В английском предложение всегда требует глагола-связки («I am a student»).',
        '1. Три формы глагола to be',
        'В Present Simple глагол to be имеет три формы: **am** (только с I), **is** (с he, she, it) и **are** (с you, we, they). В разговорной речи используются сокращения: *I\'m, he\'s, she\'s, it\'s, we\'re, you\'re, they\'re*.',
        '2. Отрицания и вопросы',
        'Отрицание образуется добавлением частицы **not** после глагола: *is not = isn\'t, are not = aren\'t, I am not = I\'m not*. Для вопроса to be выносится на первое место перед подлежащим: *Are you ready? Is he at home?*',
        'Спряжение глагола to be', ['Лицо', 'Утверждение', 'Кратко', 'Отрицание', 'Вопрос'],
        [['I', 'I am', 'I\'m', 'I\'m not', 'Am I?'],
         ['You', 'You are', 'You\'re', 'You aren\'t', 'Are you?'],
         ['He / She / It', 'He is', 'He\'s', 'He isn\'t', 'Is he?'],
         ['We', 'We are', 'We\'re', 'We aren\'t', 'Are we?'],
         ['They', 'They are', 'They\'re', 'They aren\'t', 'Are they?']],
        [{'en': 'I am a software engineer in Berlin.', 'ru': 'Я инженер-программист в Берлине.', 'note': 'Профессия (am a...)'},
         {'en': 'She is not at home right now.', 'ru': 'Она сейчас не дома.', 'note': 'Отрицание (is not)'},
         {'en': 'Are you ready for the presentation?', 'ru': 'Ты готов к презентации?', 'note': 'Вопрос (Are you...)'}],
        ['Пропуск глагола to be: ❌ I doctor -> ✅ I am a doctor.',
         'Путаница it\'s (it is) и its (чей?): ❌ Its cold -> ✅ It\'s cold.']
    )

    add(2, 'Present Simple: Утвердительные предложения',
        'Present Simple выражает постоянные факты, привычки, регулярные действия и расписания. Главное правило: для he/she/it к глаголу добавляется окончание -s или -es.',
        '1. Образование утверждений',
        'Для *I, you, we, they* используется начальная форма глагола (*I work, we live, they play*). Для *he, she, it* к глаголу добавляется окончание **-s / -es** (*he works, she watches*).',
        '2. Правила добавления окончаний -s, -es, -ies',
        'Если глагол оканчивается на *-ss, -sh, -ch, -x, -o*, добавляется **-es** (*goes, watches, washes, fixes*). Если на согласную + -y, буква y меняется на **-ies** (*study -> studies, fly -> flies*). Если гласная + y — просто -s (*play -> plays*).',
        'Окончания в Present Simple', ['Тип глагола', 'Правило', 'Пример', 'Перевод'],
        [['Обычный глагол', '+s', 'work -> works, speak -> speaks', 'Он работает, она говорит'],
         ['На -ch, -sh, -ss, -x, -o', '+es', 'watch -> watches, go -> goes', 'Он смотрит, она идет'],
         ['Согласная + -y', '-y -> -ies', 'study -> studies, fly -> flies', 'Он учится, птица летает'],
         ['Гласная + -y', '+s', 'play -> plays, buy -> buys', 'Он играет, она покупает']],
        [{'en': 'I live in London and work remotely.', 'ru': 'Я живу в Лондоне и работаю удаленно.', 'note': 'Постоянный факт'},
         {'en': 'He drinks green tea every morning.', 'ru': 'Он пьет зеленый чай каждое утро.', 'note': 'Привычка (drinks)'},
         {'en': 'The train leaves at 8:15 AM.', 'ru': 'Поезд отправляется в 8:15 утра.', 'note': 'Расписание (leaves)'}],
        ['Забывание окончания -s для he/she/it: ❌ He live in London -> ✅ He lives in London.',
         'Лишнее окончание -s во множественном числе: ❌ They works -> ✅ They work.']
    )

    add(3, 'Present Simple: Отрицания и вопросы',
        'Для отрицаний и вопросов привлекается вспомогательный глагол DO (I/you/we/they) или DOES (he/she/it). Смысловой глагол всегда возвращается в чистую начальную форму без -s!',
        '1. Отрицания с don\'t и doesn\'t',
        'Формула: **Подлежащее + don\'t / doesn\'t + Глагол (V1 без -s)**. Например: *I don\'t smoke. She doesn\'t like spicy food* (не doesn\'t likes!).',
        '2. Вопросы с Do и Does',
        'Формула: **(Вопрос. слово) + Do / Does + Подлежащее + Глагол (V1)?** Например: *Do you speak English? Where does she work?* Краткие ответы: *Yes, I do / No, I don\'t; Yes, he does / No, he doesn\'t*.',
        'Формулы отрицаний и вопросов', ['Тип', 'I / You / We / They', 'He / She / It'],
        [['Отрицание', 'I don\'t like coffee.', 'He doesn\'t like coffee.'],
         ['Общий вопрос', 'Do you work here?', 'Does she work here?'],
         ['Краткий ответ (+)', 'Yes, I do.', 'Yes, she does.'],
         ['Краткий ответ (-)', 'No, I don\'t.', 'No, she doesn\'t.']],
        [{'en': 'I don\'t drink coffee after 5 PM.', 'ru': 'Я не пью кофе после 5 вечера.', 'note': 'Отрицание don\'t'},
         {'en': 'Does he play tennis on weekends?', 'ru': 'Он играет в теннис по выходным?', 'note': 'Вопрос Does + play'}],
        ['Двойное окончание -s: ❌ He doesn\'t likes tea -> ✅ He doesn\'t like tea.',
         'Построение вопроса без вспомогательного do: ❌ You have a car? -> ✅ Do you have a car?']
    )

    add(4, 'Артикли в английском языке (a/an/the)',
        'A/AN — неопределенный артикль (один из многих, любой). THE — определенный артикль (конкретный предмет, известный собеседникам или уникальный в мире).',
        '1. Артикли A и AN',
        'Ставятся только перед исчисляемыми в единственном числе. **A** — перед согласным звуком (*a car, a house, a university [j]*), **AN** — перед гласным звуком (*an apple, an hour [h немая]*).',
        '2. Артикль THE и нулевой артикль',
        '**THE** ставится перед конкретными вещами (*the book on the table*), уникальными объектами (*the sun, the internet*) или при повторном упоминании. Без артикля говорят о вещах во множественном числе или неисчисляемых в общем смысле (*I like cats, Water is healthy*).',
        'Выбор артикля', ['Артикль', 'Когда употребляется', 'Примеры'],
        [['a', 'Ед. ч., исчисляемое, согласный звук', 'a dog, a table, a uniform [j]'],
         ['an', 'Ед. ч., исчисляемое, гласный звук', 'an orange, an idea, an hour [aʊər]'],
         ['the', 'Конкретный предмет, уникальный объект', 'the door, the moon, the capital'],
         ['без артикля', 'Мн. ч. и неисчисляемые в общем', 'I love music. Dogs are loyal.']],
        [{'en': 'I bought a laptop yesterday. The laptop is very fast.', 'ru': 'Вчера я купил ноутбук. Этот ноутбук очень быстрый.', 'note': 'A -> THE при повторе'},
         {'en': 'He is an architect.', 'ru': 'Он архитектор.', 'note': 'Профессии всегда с a/an'}],
        ['Ориентация на букву вместо звука: ❌ a hour -> ✅ an hour.',
         'Пропуск a/an перед профессиями: ❌ I am teacher -> ✅ I am a teacher.']
    )

    add(5, 'Множественное число существительных (-s/-es)',
        'Множественное число образуется добавлением окончания -s или -es к существительному. Существуют важные орфографические правила и слова-исключения.',
        '1. Окончания -s, -es, -ies',
        'Обычно добавляется **-s** (*book -> books*). После шипящих (*-s, -ss, -sh, -ch, -x*) добавляется **-es** (*bus -> buses, box -> boxes*). После согласной + y пишется **-ies** (*city -> cities*).',
        '2. Слова на -f/-fe и исключения',
        'Слова на *-f / -fe* меняются на **-ves** (*life -> lives, knife -> knives*). Исключения без окончания -s: *child -> children, person -> people, man -> men, woman -> women, foot -> feet, tooth -> teeth, mouse -> mice*.',
        'Таблица множественного числа', ['Категория', 'Правило', 'Примеры'],
        [['Стандартные слова', '+s', 'car -> cars, pen -> pens'],
         ['Шипящие окончания', '+es', 'box -> boxes, match -> matches'],
         ['Согласная + -y', '-y -> -ies', 'city -> cities, story -> stories'],
         ['Слова на -f / -fe', '-f -> -ves', 'leaf -> leaves, knife -> knives'],
         ['Исключения (неправильные)', 'изменение корня', 'child -> children, person -> people']],
        [{'en': 'There are three boxes in the room.', 'ru': 'В комнате стоят три коробки.', 'note': 'Окончание -es'},
         {'en': 'The children are playing outside.', 'ru': 'Дети играют на улице.', 'note': 'Исключение child -> children'}],
        ['Лишнее -s у исключений: ❌ childrens -> ✅ children, ❌ peoples -> ✅ people.',
         'Забывание менять -f на -ves: ❌ knifes -> ✅ knives.']
    )

    add(6, 'Личные местоимения в роли подлежащего (I/you/he/she/it/we/they)',
        'Личные местоимения заменяют существительные в роли подлежащего и отвечают на вопрос «Кто?» или «Что?».',
        '1. Формы местоимений',
        '**I** (я — всегда с большой буквы!), **you** (ты / вы), **he** (он), **she** (она), **it** (оно/он/она для предметов и животных), **we** (мы), **they** (они).',
        '2. Местоимение IT',
        'Местоимение *it* заменяет любые неодушевленные предметы (*the laptop -> it*), явления природы и время (*It is 5 o\'clock, It is raining*).',
        'Личные местоимения', ['Число', 'Лицо', 'Местоимение', 'Перевод', 'Пример'],
        [['Единственное', '1-е лицо', 'I', 'я (всегда с большой)', 'I live in Prague.'],
         ['Единственное', '2-е лицо', 'you', 'ты', 'You are kind.'],
         ['Единственное', '3-е лицо', 'he / she / it', 'он / она / оно', 'He is busy. It is cold.'],
         ['Множественное', '1-е лицо', 'we', 'мы', 'We are ready.'],
         ['Множественное', '2-е лицо', 'you', 'вы', 'You know this.'],
         ['Множественное', '3-е лицо', 'they', 'они', 'They work here.']],
        [{'en': 'I live in Berlin.', 'ru': 'Я живу в Берлине.', 'note': 'I всегда с заглавной'},
         {'en': 'Where is the key? It is on the desk.', 'ru': 'Где ключ? Он на столе.', 'note': 'It для предметов'}],
        ['Написание i со строчной буквы: ❌ i am -> ✅ I am.',
         'Использование he/she для стола или телефона: ❌ The phone, she is ringing -> ✅ It is ringing.']
    )

    add(7, 'Притяжательные прилагательные (my/your/his/her/its/our/their)',
        'Притяжательные прилагательные указывают на принадлежность и всегда стоят перед существительным: my book, his car, our house.',
        '1. Формы притяжательных слов',
        'Каждому местоимению соответствует форма: *I -> my, you -> your, he -> his, she -> her, it -> its, we -> our, they -> their*.',
        '2. Важное различие: its vs it\'s',
        '**its** (без апострофа) — это «его/её» (принадлежность предмету): *The cat drinks its milk*. **it\'s** (с апострофом) — это сокращение от *it is*!',
        'Притяжательные формы', ['Личное', 'Притяжательное', 'Перевод', 'Пример'],
        [['I', 'my', 'мой, моя, мои', 'my laptop'],
         ['You', 'your', 'твой, ваш', 'your phone'],
         ['He', 'his', 'его (мужчины)', 'his coat'],
         ['She', 'her', 'её (женщины)', 'her car'],
         ['It', 'its', 'его/её (предмета)', 'its name'],
         ['We', 'our', 'наш, наша, наши', 'our home'],
         ['They', 'their', 'их', 'their team']],
        [{'en': 'What is your phone number?', 'ru': 'Какой у тебя номер телефона?', 'note': 'your + существительное'},
         {'en': 'Our company is growing rapidly.', 'ru': 'Наша компания быстро растет.', 'note': 'our + существительное'}],
        ['Путаница your и you\'re: ❌ You\'re bag -> ✅ Your bag.',
         'Путаница its и it\'s: ❌ The dog wagged it\'s tail -> ✅ its tail.']
    )

    add(8, 'Указательные местоимения (this/that/these/those)',
        'Указательные местоимения зависят от расстояния (близко / далеко) и числа (единственное / множественное).',
        '1. Выбор формы',
        '**THIS** — этот (близко, ед. ч.). **THAT** — тот (далеко, ед. ч.). **THESE** — эти (близко, мн. ч.). **THOSE** — те (далеко, мн. ч.).',
        '2. Использование по телефону',
        'По телефону о себе говорят: *Hello, this is Alex*. При вопросе о собеседнике: *Is that John?*',
        'Сетка указательных местоимений', ['Расстояние', 'Единственное число', 'Множественное число'],
        [['Близко (HERE)', 'THIS (этот / эта / это)', 'THESE (эти)'],
         ['Далеко (THERE)', 'THAT (тот / та / то)', 'THOSE (те)']],
        [{'en': 'This is my new coffee cup.', 'ru': 'Это моя новая кофейная чашка (в руках).', 'note': 'This (близко, ед. ч.)'},
         {'en': 'Look at that building over there.', 'ru': 'Посмотри на то здание вон там.', 'note': 'That (далеко, ед. ч.)'}],
        ['Путаница this и these в речи: this [ðɪs] кратко, these [ðiːz] долго.',
         'Использование that со множественным числом: ❌ that cars -> ✅ those cars.']
    )

    add(9, 'Конструкция наличия: There is / There are',
        'Конструкция There is / There are используется, когда нужно сообщить о наличии или местонахождении чего-либо («В комнате есть...»).',
        '1. There is vs There are',
        '**There is** (There\'s) ставится перед единственным числом и неисчисляемыми существительными (*There is a cafe nearby, There is water*). **There are** — перед множественным числом (*There are two chairs*).',
        '2. Отрицания и вопросы',
        'Отрицание: **There isn\'t / There aren\'t**. Вопрос: **Is there...? / Are there...?**',
        'Формы There is / There are', ['Тип', 'Ед. число / Неисчисляемое', 'Множественное число'],
        [['Утверждение (+)', 'There is a park nearby.', 'There are two parks here.'],
         ['Отрицание (-)', 'There isn\'t any milk left.', 'There aren\'t any tickets.'],
         ['Вопрос (?)', 'Is there a bank near here?', 'Are there any questions?']],
        [{'en': 'There is a great restaurant around the corner.', 'ru': 'За углом есть отличный ресторан.', 'note': 'There is a...'},
         {'en': 'There are five people in the room.', 'ru': 'В комнате пять человек.', 'note': 'There are...'}],
        ['Использование have вместо there is: ❌ In room has a table -> ✅ There is a table in the room.',
         'Согласование по первому слову: ✅ There is a table and four chairs.']
    )

    add(10, 'Повелительное наклонение (Imperatives: sit down, open)',
        'Повелительное наклонение используется для команд, инструкций, указаний, вежливых просьб (please) и совместных действий (Let\'s).',
        '1. Образование команд и запретов',
        'Утверждение строится чистым инфинитивом без подлежащего и to: *Sit down! Open the window!* Отрицание (запрет) всегда начинается с **Don\'t**: *Don\'t touch that! Don\'t be late!*',
        '2. Вежливость и Let\'s',
        'Для вежливости добавляется **please**: *Please take a seat*. Для совместного действия («Давай / Давайте») используется **Let\'s + глагол**: *Let\'s start!*',
        'Формы повелительного наклонения', ['Тип', 'Формула', 'Пример', 'Перевод'],
        [['Инструкция', 'Глагол (V1)', 'Press this button.', 'Нажмите эту кнопку.'],
         ['Вежливая просьба', 'Please + Глагол', 'Please take a seat.', 'Пожалуйста, присаживайтесь.'],
         ['Запрет', 'Don\'t + Глагол', 'Don\'t worry about it.', 'Не переживай об этом.'],
         ['Совместное действие', 'Let\'s + Глагол', 'Let\'s have lunch.', 'Давай пообедаем.']],
        [{'en': 'Turn left at the traffic light.', 'ru': 'Поверните налево на светофоре.', 'note': 'Указание'},
         {'en': 'Let\'s take a short break.', 'ru': 'Давайте сделаем короткий перерыв.', 'note': 'Let\'s'}],
        ['Использование частицы to: ❌ To open the door -> ✅ Open the door.',
         'Отрицание с no вместо don\'t: ❌ No speak -> ✅ Don\'t speak.']
    )

    add(11, 'Модальный глагол Can / Can\'t (способность и возможность)',
        'Модальный глагол CAN выражает физическую или умственную способность («умею, могу»), а также просьбу или разрешение.',
        '1. Форма глагола CAN',
        'Глагол CAN не меняется по лицам (никаких -s для he/she/it!). После CAN всегда идет чистый инфинитив без частицы to: *I can swim, she can speak English*.',
        '2. Отрицание и вопросы',
        'Отрицание: **cannot** (слитно!) или кратко **can\'t** [kɑːnt / kænt]. Вопрос: *Can you hear me? Can I help you?*',
        'Формы глагола CAN', ['Форма', 'Схема', 'Пример', 'Перевод'],
        [['Утверждение', 'Подлежащее + can + V1', 'She can drive a car.', 'Она умеет водить машину.'],
         ['Отрицание', 'Подлежащее + can\'t + V1', 'I can\'t swim very well.', 'Я не умею плавать.'],
         ['Вопрос', 'Can + Подлежащее + V1?', 'Can you play tennis?', 'Ты умеешь играть в теннис?']],
        [{'en': 'I can speak three languages.', 'ru': 'Я говорю на трех языках.', 'note': 'Умение'},
         {'en': 'Can you open the window, please?', 'ru': 'Можешь открыть окно, пожалуйста?', 'note': 'Просьба'}],
        ['Добавление to после can: ❌ I can to swim -> ✅ I can swim.',
         'Добавление -s: ❌ He cans drive -> ✅ He can drive.']
    )

    add(12, 'Предлоги места: IN, ON, AT',
        'Предлоги места показывают положение объекта: IN (внутри пространства/страны), ON (на поверхности/линии), AT (в конкретной точке/заведении).',
        '1. Разделение In, On, At',
        '**IN** — внутри закрытого пространства, в городе, стране (*in the room, in London*). **ON** — на плоской поверхности, на улице, в общественном транспорте (*on the table, on the bus*). **AT** — в конкретной точке назначения или функциональном месте (*at the bus stop, at home, at work*).',
        '2. Типичные устойчивые сочетания',
        '*at home, at school, at work, at the airport, on the plane, in the car*.',
        'Шпаргалка предлогов места', ['Предлог', 'Сфера применения', 'Примеры'],
        [['IN (внутри, объем)', 'Комнаты, здания, города, страны', 'in the kitchen, in Paris'],
         ['ON (поверхность, транспорт)', 'Поверхности, этажи, улицы, поезд/автобус', 'on the wall, on the train'],
         ['AT (точка, локация)', 'Конкретные места, мероприятия, события', 'at the door, at work, at school']],
        [{'en': 'I am working at my desk in the office.', 'ru': 'Я работаю за столом в офисе.', 'note': 'At the desk, in the office'},
         {'en': 'The laptop is on the table.', 'ru': 'Ноутбук лежит на столе.', 'note': 'On (поверхность)'}],
        ['In home вместо at home: ❌ in home -> ✅ at home.',
         'In the bus вместо on the bus: ❌ in the bus -> ✅ on the bus.']
    )

    add(13, 'Предлоги времени: IN, ON, AT',
        'Шпаргалка треугольника времени: AT (точное время/праздники), ON (дни и даты), IN (длительные периоды: месяцы, годы, века, времена года).',
        '1. Правило золотого треугольника',
        '**AT** для часов и точных моментов: *at 5 o\'clock, at noon, at night*. **ON** для дней недели и конкретных дат: *on Monday, on May 15th, on my birthday*. **IN** для месяцев, годов, сезонов: *in July, in 2026, in summer, in the morning*.',
        '2. Случаи без предлогов',
        'Предлоги времени НЕ ставятся перед словами **this, last, next, every**: *next Monday, this morning, every day*.',
        'Предлоги времени', ['Предлог', 'Временной масштаб', 'Примеры'],
        [['AT (точное время)', 'Часы, моменты, ночь', 'at 7:30, at midnight, at night'],
         ['ON (дни и даты)', 'Дни недели, календарные даты', 'on Friday, on 1st January'],
         ['IN (периоды)', 'Месяцы, годы, сезоны, части дня', 'in August, in 2026, in winter, in the evening']],
        [{'en': 'The meeting is on Thursday at 3 PM.', 'ru': 'Встреча в четверг в 15:00.', 'note': 'On + день, At + время'},
         {'en': 'I usually travel in August.', 'ru': 'Я обычно путешествую в августе.', 'note': 'In + месяц'}],
        ['Предлог перед next/this: ❌ on next Friday -> ✅ next Friday.',
         'In night вместо at night: ❌ in night -> ✅ at night.']
    )

    add(14, 'Исчисляемые и неисчисляемые существительные (Countable / Uncountable)',
        'Исчисляемые существительные можно посчитать поштучно (a cup, two cups). Неисчисляемые — вещества, жидкости, абстрактные понятия — не имеют множественного числа.',
        '1. Различия и признаки',
        'Исчисляемые (*apple, car*) употребляются с *a/an* и числительными. Неисчисляемые (*water, money, information, advice, bread*) не используются с *a/an* без слов-емкостей (*a bottle of water, a piece of advice*).',
        '2. Слова-ловушки для русскоязычных',
        'Слова *money (деньги), information (информация), advice (совет), news (новости), luggage (багаж), furniture (мебель)* в английском ВСЕГДА неисчисляемые в единственном числе!',
        'Исчисляемые vs Неисчисляемые', ['Параметр', 'Исчисляемые', 'Неисчисляемые'],
        [['Артикли', 'a / an / the', 'the / some (без a/an)'],
         ['Множественное число', 'Есть: cars, books', 'Нет: water, money, music'],
         ['Вопрос количества', 'How many? (How many apples?)', 'How much? (How much sugar?)']],
        [{'en': 'Can I have some water, please?', 'ru': 'Можно мне немного воды?', 'note': 'Some + неисчисляемое'},
         {'en': 'She gave me some great advice.', 'ru': 'Она дала мне отличный совет.', 'note': 'Advice неисчисляемое'}],
        ['Множественное число от неисчисляемых: ❌ advices, ❌ informations -> ✅ advice, information.',
         'How much с исчисляемыми: ❌ How much apples? -> ✅ How many apples?']
    )

    add(15, 'Вопросы количества: How much / How many',
        'How many используется с исчисляемыми существительными во множественном числе («Сколько штук?»). How much — с неисчисляемыми существительными («Сколько объема/вещества?»), а также для цены («Сколько стоит?»).',
        '1. How many vs How much',
        'С исчисляемыми: *How many brothers do you have? How many emails did you send?* С неисчисляемыми: *How much time do we have? How much coffee do you drink?* Для вопроса цены: *How much is this ticket?*',
        '2. Краткие ответы',
        'В ответах: *A lot (много), Not many (немного штук), Not much (немного объема), A few / A little*.',
        'Выбор How much / How many', ['Конструкция', 'Тип существительного', 'Пример', 'Перевод'],
        [['How many', 'Исчисляемые во мн. ч.', 'How many languages do you speak?', 'На скольких языках ты говоришь?'],
         ['How much', 'Неисчисляемые', 'How much sugar do you want?', 'Сколько сахара ты хочешь?'],
         ['How much is...', 'Вопрос цены', 'How much is this shirt?', 'Сколько стоит эта рубашка?']],
        [{'en': 'How many people are coming to the event?', 'ru': 'Сколько человек придет на мероприятие?', 'note': 'How many + people'},
         {'en': 'How much money do you need for this project?', 'ru': 'Сколько денег тебе нужно на этот проект?', 'note': 'How much + money'}],
        ['How many с неисчисляемыми: ❌ How many time? -> ✅ How much time?',
         'How much со штучными предметами: ❌ How much chairs? -> ✅ How many chairs?']
    )

    add(16, 'Present Continuous: Настоящее длительное время',
        'Present Continuous выражает действие, происходящее прямо сейчас, в момент речи (NOW / AT THE MOMENT). Формула: am/is/are + глагол с окончанием -ing.',
        '1. Образование Present Continuous',
        'Формула: **Подлежащее + am / is / are + V-ing**. Например: *I am reading a book. She is cooking dinner. They are playing football.*',
        '2. Глаголы состояния (Stative Verbs)',
        'Глаголы чувств, мыслей и владения (*like, love, know, understand, want, believe, need*) обычно НЕ употребляются в Continuous: *I know (не I am knowing)*.',
        'Формулы Present Continuous', ['Тип предложения', 'Формула', 'Пример'],
        [['Утверждение (+)', 'am / is / are + V-ing', 'She is writing an email right now.'],
         ['Отрицание (-)', 'am / is / are + not + V-ing', 'They aren\'t watching TV.'],
         ['Вопрос (?)', 'Am / Is / Are + подлежащее + V-ing?', 'Are you working today?']],
        [{'en': 'I am learning English right now.', 'ru': 'Я учу английский прямо сейчас.', 'note': 'В момент речи'},
         {'en': 'Look! It is raining outside.', 'ru': 'Смотри! На улице идет дождь.', 'note': 'Процесс'}],
        ['Пропуск глагола to be: ❌ I writing a letter -> ✅ I am writing a letter.',
         'Использование глаголов чувств в Continuous: ❌ I am knowing -> ✅ I know.']
    )

    add(17, 'Объектные местоимения (me/you/him/her/it/us/them)',
        'Объектные местоимения отвечают на вопросы косвенных падежей («кому?», «кого?», «с кем?») и стоят ПОСЛЕ глаголов или предлогов: call me, look at him.',
        '1. Формы объектных местоимений',
        '*I -> me, you -> you, he -> him, she -> her, it -> it, we -> us, they -> them*.',
        '2. Позиция в предложении',
        'Подлежащее стоит ПЕРЕД глаголом, а объектное местоимение — ВСЕГДА ПОСЛЕ глагола или предлога: *He loves her. Listen to me.*',
        'Личные vs Объектные', ['Субъект (Кто?)', 'Объект (Кого? Кому?)', 'Пример'],
        [['I', 'me', 'She called me.'],
         ['You', 'you', 'I see you.'],
         ['He', 'him', 'Give him the key.'],
         ['She', 'her', 'I know her well.'],
         ['We', 'us', 'Join us for lunch.'],
         ['They', 'them', 'Ask them.']],
        [{'en': 'Can you help me, please?', 'ru': 'Ты можешь мне помочь, пожалуйста?', 'note': 'Help + me'},
         {'en': 'I will send them an email tomorrow.', 'ru': 'Я отправлю им письмо завтра.', 'note': 'Send + them'}],
        ['Использование I вместо me после глагола: ❌ Call I -> ✅ Call me.',
         'Использование he/she после предлогов: ❌ with he -> ✅ with him.']
    )

    add(18, 'Порядок прилагательных перед существительным (Adjective order)',
        'В английском прилагательные всегда стоят ПЕРЕД существительным (a red car, an interesting book) и не меняются по родам и числам.',
        '1. Базовый порядок описания',
        'Порядок: **Мнение (Opinion) -> Размер (Size) -> Возраст (Age) -> Цвет (Color) -> Происхождение (Origin) -> Материал (Material) + Существительное**.',
        '2. Неизменяемость прилагательных',
        'Прилагательные в английском никогда не получают окончания -s: *two red cars* (не red**s** cars!).',
        'Порядок прилагательных', ['Оценка', 'Размер', 'Цвет', 'Существительное'],
        [['a beautiful', 'small', 'black', 'cat'],
         ['a nice', 'big', 'blue', 'house'],
         ['a delicious', 'hot', 'Italian', 'pizza']],
        [{'en': 'She bought a beautiful Italian leather jacket.', 'ru': 'Она купила красивую итальянскую кожаную куртку.', 'note': 'Мнение -> Страна -> Материал'}],
        ['Прилагательное после существительного: ❌ car red -> ✅ red car.',
         'Добавление -s к прилагательному: ❌ interesting books -> ✅ interesting books.']
    )

    add(19, 'Числа и счет (Numbers and counting)',
        'Счет от 0 до 20, десятки (twenty, thirty, forty...) и составные числа с дефисом (twenty-five, ninety-nine).',
        '1. Суффиксы -teen и -ty',
        'Суффикс **-teen** означает подростковые числа с ударением на -teen (*fourteen, fifteen, sixteen*). Суффикс **-ty** — десятки с ударением на первый слог (*forty, fifty, sixty*).',
        '2. Сотни и тысячи',
        'Слова *hundred, thousand, million* не получают окончания -s, если перед ними стоит точное число: *two hundred (не two hundreds)*.',
        'Числительные', ['1-10', '11-20', 'Десятки (10-90)'],
        [['one, two, three', 'eleven, twelve, thirteen', 'ten, twenty, thirty'],
         ['four, five, six', 'fourteen, fifteen, sixteen', 'forty, fifty, sixty'],
         ['seven, eight, nine, ten', 'seventeen, eighteen, nineteen, twenty', 'seventy, eighty, ninety, one hundred']],
        [{'en': 'I have twenty-five dollars in cash.', 'ru': 'У меня двадцать пять долларов наличными.', 'note': 'Дефис в составных числах'}],
        ['Написание fourty вместо forty: ❌ fourty -> ✅ forty (без буквы u!).']
    )

    add(20, 'Цвета и оттенки (Colors)',
        'Базовые цвета и уточнения оттенков с префиксами light- (светло-), dark- (темно-) и bright- (ярко-).',
        '1. Оттенки',
        '*light-blue (голубой), dark-green (темно-зеленый), bright-yellow (ярко-желтый)*.',
        '2. Позиция в предложении',
        'Цвет ставится перед существительным (*a red apple*) или после глагола to be (*The apple is red*).',
        'Основные цвета', ['Цвет (En)', 'Транскрипция', 'Перевод'],
        [['red / blue / green', '[red] / [bluː] / [ɡriːn]', 'красный / синий / зеленый'],
         ['yellow / orange / pink', '[ˈjeləʊ] / [ˈɒrɪndʒ] / [pɪŋk]', 'желтый / оранжевый / розовый'],
         ['black / white / grey', '[blæk] / [waɪt] / [ɡreɪ]', 'черный / белый / серый']],
        [{'en': 'She wore a dark-blue coat to the interview.', 'ru': 'Она надела темно-синее пальто на собеседование.', 'note': 'Оттенок цвета'}],
        ['Множественное число цветов: ❌ blue eyes -> ✅ blue eyes (прилагательное не имеет -s).']
    )

    add(21, 'Семья и родственники (Family members)',
        'Словарь семьи: parents (родители), siblings (братья и сестры), relatives (родственники).',
        '1. Родители vs Родственники',
        '*Parents* — это строго папа и мама. Все остальные родственники — это *relatives*. *Siblings* — родные братья и сестры.',
        '2. Притяжательный падеж \'s с членами семьи',
        '*my brother\'s car (машина моего брата), my parents\' house (дом моих родителей — апостроф после s)*.',
        'Члены семьи', ['Мужской род', 'Женский род', 'Общее понятие'],
        [['father (dad)', 'mother (mom)', 'parents (родители)'],
         ['son (сын)', 'daughter (дочь)', 'children (дети)'],
         ['brother (брат)', 'sister (сестра)', 'siblings (братья/сестры)']],
        [{'en': 'I have two siblings: an older brother and a younger sister.', 'ru': 'У меня двое братьев/сестер: старший брат и младшая сестра.', 'note': 'Siblings'}],
        ['Перевод parents как "родственники": ❌ My parents live far -> означает "Мои родители".']
    )

    add(22, 'Дни недели, месяцы и времена года',
        'В английском языке дни недели и месяцы ВСЕГДА пишутся с заглавной буквы (Monday, August)!',
        '1. Предлоги с календарем',
        'С днями недели: **ON** (*on Monday*). С месяцами и сезонами: **IN** (*in July, in winter*).',
        '2. Выходные дни',
        'В Великобритании говорят: *at the weekend*. В США говорят: *on the weekend*.',
        'Календарь', ['Категория', 'Предлог', 'Примеры (всегда с большой буквы!)'],
        [['Дни недели', 'ON', 'on Monday, on Wednesday, on Friday'],
         ['Месяцы', 'IN', 'in January, in May, in October'],
         ['Времена года', 'IN', 'in spring, in summer, in autumn / fall']],
        [{'en': 'Our lesson is on Wednesday at 6 PM.', 'ru': 'Наш урок в среду в 18:00.', 'note': 'On Wednesday'}],
        ['Написание с маленькой буквы: ❌ on friday -> ✅ on Friday.']
    )

    add(23, 'Базовая еда и напитки (Food & Drinks)',
        'Продукты питания, напитки и устойчивые выражения с глаголом HAVE (have breakfast, have a coffee).',
        '1. Приемы пищи',
        'С приемами пищи используется **have**: *have breakfast (завтракать), have lunch (обедать), have dinner (ужинать)*.',
        '2. Заказ в кафе',
        'Вежливая просьба: *Can I have a cup of black coffee, please?*',
        'Еда и напитки', ['Категория', 'Слова', 'Пример'],
        [['Напитки', 'water, coffee, tea, juice, milk', 'A cup of coffee, please.'],
         ['Базовые продукты', 'bread, cheese, eggs, rice, meat, fish', 'I eat eggs for breakfast.'],
         ['Фрукты/овощи', 'apple, banana, tomato, potato, salad', 'Fresh fruit and vegetables.']],
        [{'en': 'I usually have cereal and coffee for breakfast.', 'ru': 'Я обычно ем хлопья и пью кофе на завтрак.', 'note': 'have breakfast'}],
        ['Использование eat breakfast вместо have breakfast (have более естественно).']
    )

    add(24, 'Одежда и обувь (Clothes)',
        'Словарь одежды и глаголы: wear (быть одетым в), put on (надевать). Слово clothes всегда во множественном числе!',
        '1. Wear vs Put on',
        '*Wear* — состояние (носить сейчас: *I am wearing a coat*). *Put on* — действие надевания (*Put on your shoes*).',
        '2. Парные предметы одежды',
        'Слова *jeans, trousers, pants, shorts, glasses* всегда во множественном числе (*a pair of jeans*).',
        'Гардероб', ['Тип', 'Слова', 'Особенность'],
        [['Верхняя одежда', 'jacket, coat, sweater, hoodie', 'a jacket'],
         ['Брюки/джинсы', 'jeans, trousers (UK) / pants (US)', 'Всегда во мн. ч. (a pair of jeans)'],
         ['Обувь', 'shoes, boots, sneakers (US) / trainers (UK)', 'a pair of shoes']],
        [{'en': 'He is wearing a black jacket and jeans.', 'ru': 'На нем надета черная куртка и джинсы.', 'note': 'Wear + одежда'}],
        ['Слово clothes в единственном числе: ❌ This cloth is nice -> ✅ These clothes are nice.']
    )

    add(25, 'Части тела (Parts of the body)',
        'Анатомический словарь и способы сказать о симптомах: my head hurts, I have a headache.',
        '1. Неправильное множественное число',
        '*foot -> feet (стопы), tooth -> teeth (зубы)*.',
        '2. Выражение боли',
        '*I have a headache (головная боль), I have a stomach ache (боль в животе), My back hurts (спина болит)*.',
        'Части тела', ['Зона', 'Слова', 'Симптом'],
        [['Голова', 'head, hair, eyes, ears, nose, mouth, teeth', 'headache (головная боль)'],
         ['Конечности', 'arm, hand, finger, leg, foot, toe', 'foot -> feet'],
         ['Спина и живот', 'back, stomach, chest', 'backache (боль в спине)']],
        [{'en': 'My back hurts after sitting in front of the computer all day.', 'ru': 'У меня болит спина после целого дня за компьютером.', 'note': 'Симптом'}],
        ['Множественное число foots: ❌ two foots -> ✅ two feet.']
    )

    add(26, 'Комнаты и мебель (Rooms and furniture)',
        'Комнаты (living room, bedroom, kitchen, bathroom) и мебель (desk, table, sofa, bed, wardrobe).',
        '1. Table vs Desk',
        '*Table* — обеденный или журнальный стол. *Desk* — рабочий/письменный стол для работы или учебы.',
        '2. Конструкция There is в описании дома',
        '*There is a large wardrobe in the bedroom. There are two windows in the kitchen.*',
        'Дом и интерьер', ['Комната', 'Типичная мебель'],
        [['Kitchen (Кухня)', 'fridge, cooker / stove, sink, cupboard'],
         ['Living room (Гостиная)', 'sofa, armchair, TV, coffee table, bookshelf'],
         ['Bedroom (Спальня)', 'bed, wardrobe, nightstand, mirror']],
        [{'en': 'There is a comfortable sofa in the living room.', 'ru': 'В гостиной стоит удобный диван.', 'note': 'Мебель'}],
        ['Путаница table (обеденный стол) и desk (рабочий стол).']
    )

    add(27, 'Приветствия и знакомство (Greetings and introductions)',
        'Формулы вежливости при первой встрече: Nice to meet you, How are you doing?, Pleased to meet you.',
        '1. Речевой этикет',
        'При первом знакомстве: *Nice to meet you*. Ответ: *Nice to meet you too*. При неформальной встрече: *How is it going? — Good, thanks!*',
        '2. Представление других людей',
        '*Alex, this is Sarah. Sarah, this is Alex.*',
        'Речевые клише', ['Ситуация', 'Фраза', 'Ответ'],
        [['Знакомство', 'My name is Alex. Nice to meet you.', 'Nice to meet you too, Alex.'],
         ['Как дела?', 'How are you? / How is it going?', 'I am doing well, thank you! And you?'],
         ['Прощание', 'Have a great day! / See you later!', 'Thanks, you too! Bye!']],
        [{'en': 'Hello, my name is David. Nice to meet you.', 'ru': 'Здравствуйте, меня зовут Дэвид. Приятно познакомиться.', 'note': 'Знакомство'}],
        ['Ответ на "How do you do?": традиционный ответ в деловом стиле — тоже "How do you do?".']
    )

    add(28, 'Который час: Как спросить и назвать время',
        'Два способа назвать время: цифровой (five thirty) и традиционный (half past five, quarter to six).',
        '1. Предлоги past и to',
        '**past** — минуты после часа (до 30 мин): *quarter past three (3:15)*. **to** — минуты до следующего часа (после 30 мин): *quarter to four (3:45)*. **half past** — половина: *half past three (3:30)*.',
        '2. Вопрос о времени',
        '*What time is it?* или *Do you have the time?*',
        'Формулы времени', ['Время', 'Традиционный способ', 'Цифровой способ'],
        [['3:00', 'It is three o\'clock.', 'three o\'clock'],
         ['3:15', 'It is quarter past three.', 'three fifteen'],
         ['3:30', 'It is half past three.', 'three thirty'],
         ['3:45', 'It is quarter to four.', 'three forty-five']],
        [{'en': 'What time is it? — It is quarter to six.', 'ru': 'Который час? — Без пятнадцати шесть.', 'note': 'Quarter to'}],
        ['Забывание It is: ❌ Time is three -> ✅ It is three o\'clock.']
    )

    add(29, 'Заказ еды в ресторане и кафе (Ordering food)',
        'Вежливые формулы заказа: Can I have...? / I would like... / Could I get...? Никогда не говорите грубое "I want".',
        '1. Вежливый заказ',
        '*Can I have a cappuccino, please?* или *I\'d like a chicken sandwich, please*.',
        '2. Вопросы официанта',
        '*For here or to go? (Здесь или с собой?)*, *Are you ready to order? (Готовы заказать?)*.',
        'Диалог в кафе', ['Официант / Бариста', 'Ваш ответ'],
        [['Are you ready to order?', 'Yes, can I have a latte, please?'],
         ['For here or to go / takeaway?', 'For here, please. / To go, please.'],
         ['Anything else?', 'No, that\'s all, thank you. How much is that?']],
        [{'en': 'Can I have the check / bill, please?', 'ru': 'Можно мне счет, пожалуйста?', 'note': 'Счет'}],
        ['Использование "I want" при заказе: ❌ I want burger -> ✅ I would like a burger, please.']
    )

    add(30, 'Описание внешности и характера людей (Describing people)',
        'Глагол BE используется для роста/телосложения (He is tall), глагол HAVE — для волос/глаз (She has blue eyes).',
        '1. BE vs HAVE в описании',
        '*He is tall and slim (BE)*. *He has short dark hair and brown eyes (HAVE)*.',
        '2. Черты характера',
        '*kind (добрый), polite (вежливый), hard-working (трудолюбивый), reliable (надежный)*.',
        'Сетка описания', ['Параметр', 'Прилагательные', 'Пример фразы'],
        [['Рост и телосложение', 'tall, short, slim, athletic', 'He is tall and slim.'],
         ['Волосы (hair)', 'long, short, blonde, dark, curly', 'She has long blonde hair.'],
         ['Характер', 'kind, friendly, polite, smart, funny', 'He is very friendly and funny.']],
        [{'en': 'He is a tall man with green eyes and brown hair.', 'ru': 'Он высокий мужчина с зелеными глазами и каштановыми волосами.', 'note': 'Полное описание'}],
        ['Использование have для роста: ❌ He has tall -> ✅ He is tall.']
    )

    # =========================================================================
    # A2 (Topics 31 - 60, 11251, 11252)
    # =========================================================================
    add(31, 'Past Simple: Правильные глаголы (-ed)',
        'Past Simple выражает завершенные действия в прошлом с указанием времени (yesterday, last week, in 2020). У правильных глаголов добавляется окончание -ed.',
        '1. Правила правописания окончания -ed',
        'Обычно добавляется **-ed** (*work -> worked*). Если глагол оканчивается на -e, добавляется только **-d** (*live -> lived*). Согласная + -y меняется на **-ied** (*study -> studied*). Если краткий слог оканчивается на согласную между гласными, согласная удваивается (*stop -> stopped, plan -> planned*).',
        '2. Произношение -ed ([t], [d], [ɪd])',
        '**[t]** после глухих согласных (*watched, worked, laughed*). **[d]** после звонких и гласных (*lived, played, cleaned*). **[ɪd]** ТОЛЬКО после звуков [t] и [d] (*wanted, decided, started*).',
        'Правописание и произношение -ed', ['Окончание', 'Правило', 'Пример', 'Произношение'],
        [['Обычный глагол', '+ed', 'work -> worked, ask -> asked', '[t]'],
         ['На гласную -e', '+d', 'live -> lived, love -> loved', '[d]'],
         ['На -t / -d', '+ed', 'want -> wanted, need -> needed', '[ɪd]'],
         ['Согласная + -y', '-y -> -ied', 'study -> studied, try -> tried', '[d]'],
         ['Удвоение согласной', 'удвоение + ed', 'stop -> stopped, plan -> planned', '[t]']],
        [{'en': 'I worked late yesterday evening.', 'ru': 'Вчера вечером я работал допоздна.', 'note': 'Past Simple (-ed)'},
         {'en': 'We lived in Madrid for three years.', 'ru': 'Мы жили в Мадриде три года.', 'note': 'Завершенный период'}],
        ['Произношение [ɪd] во всех словах: ❌ work-id -> ✅ worked [t].',
         'Забывание удвоения согласной: ❌ stoped -> ✅ stopped.']
    )

    add(32, 'Past Simple: Неправильные глаголы (2-я форма V2)',
        'Неправильные глаголы образуют прошедшее время индивидуально (go -> went, see -> saw, buy -> bought). Их 2-ю форму необходимо запомнить наизусть.',
        '1. Вторая колонка глаголов (V2)',
        'В утвердительных предложениях Past Simple используется 2-я форма глагола (V2): *I went to the store, She had breakfast, They saw a movie*.',
        '2. Группы для легкого запоминания',
        'Группы со схожим паттерном: 1) не меняются (*cost-cost, cut-cut, put-put*); 2) с окончанием -ought/-aught (*buy-bought, think-thought, catch-caught*); 3) изменение гласной на o (*drive-drove, write-wrote, speak-spoke*).',
        'Топ-10 частых неправильных глаголов', ['Infinitive (V1)', 'Past Simple (V2)', 'Перевод', 'Пример'],
        [['be', 'was / were', 'быть', 'I was tired yesterday.'],
         ['have', 'had', 'иметь', 'We had lunch at 1 PM.'],
         ['do', 'did', 'делать', 'He did his homework.'],
         ['go', 'went', 'идти/ехать', 'She went to Paris.'],
         ['get', 'got', 'получать', 'I got your message.'],
         ['see', 'saw', 'видеть', 'We saw an old friend.'],
         ['make', 'made', 'делать/создавать', 'He made coffee.'],
         ['take', 'took', 'брать', 'She took the train.'],
         ['come', 'came', 'приходить', 'They came on time.'],
         ['say', 'said', 'сказать', 'He said yes.']],
        [{'en': 'She went to Rome last summer.', 'ru': 'Она ездила в Рим прошлым летом.', 'note': 'go -> went'},
         {'en': 'I bought a new laptop yesterday.', 'ru': 'Вчера я купил новый ноутбук.', 'note': 'buy -> bought'}],
        ['Добавление -ed к неправильным глаголам: ❌ goed -> ✅ went, ❌ buyed -> ✅ bought.',
         'Путаница was (I/he/she/it) и were (we/you/they).']
    )

    add(33, 'Past Simple: Отрицания и вопросы (didn\'t / Did...?)',
        'В отрицаниях и вопросах Past Simple используется универсальный вспомогательный глагол DID (для всех лиц!). Смысловой глагол возвращается в 1-ю форму (V1)!',
        '1. Отрицания с didn\'t',
        'Формула: **Подлежащее + didn\'t + Глагол в 1-й форме (V1)**. Например: *I didn\'t go* (не didn\'t went!), *She didn\'t see him*.',
        '2. Вопросы с Did',
        'Формула: **(Вопрос. слово) + Did + Подлежащее + Глагол в 1-й форме (V1)?** Например: *Did you sleep well? Where did you go?* Краткие ответы: *Yes, I did / No, I didn\'t*.',
        'Отрицания и вопросы в Past Simple', ['Тип', 'Формула', 'Пример', 'Перевод'],
        [['Утверждение (+)', 'Подлежащее + V2', 'She visited her parents.', 'Она навестила родителей.'],
         ['Отрицание (-)', 'Подлежащее + didn\'t + V1', 'She didn\'t visit her parents.', 'Она не навестила родителей.'],
         ['Вопрос (?)', 'Did + подлежащее + V1?', 'Did she visit her parents?', 'Она навестила родителей?'],
         ['Краткий ответ', 'Yes/No + did/didn\'t', 'Yes, she did. / No, she didn\'t.', 'Да. / Нет.']],
        [{'en': 'I didn\'t receive your email yesterday.', 'ru': 'Я не получил твое письмо вчера.', 'note': 'didn\'t + receive (V1)'},
         {'en': 'Did you enjoy the concert?', 'ru': 'Тебе понравился концерт?', 'note': 'Did + enjoy (V1)'}],
        ['Двойное прошедшее время: ❌ I didn\'t went -> ✅ I didn\'t go, ❌ Did you saw him? -> ✅ Did you see him?',
         'Использование don\'t/doesn\'t в прошлом: ❌ I don\'t went -> ✅ I didn\'t go.']
    )

    add(34, 'Будущее время: Конструкция "be going to" (планы и намерения)',
        'Конструкция BE GOING TO используется для запланированных действий, личных намерений («я собираюсь сделать») и очевидных прогнозов на основе того, что видно прямо сейчас.',
        '1. Формула и значение намерений',
        'Формула: **am / is / are + going to + Глагол (V1)**. Например: *I am going to buy a car* (Я собираюсь купить машину — это заранее принятое решение).',
        '2. Прогнозы по очевидным признакам',
        'Если мы видим прямое подтверждение события в настоящем: *Look at those dark clouds! It is going to rain* (Смотри на темные тучи! Сейчас пойдет дождь).',
        'Формы Be going to', ['Лицо', 'Утверждение (+)', 'Отрицание (-)', 'Вопрос (?)'],
        [['I', 'I am going to travel', 'I am not going to travel', 'Am I going to travel?'],
         ['He / She / It', 'He is going to call', 'He isn\'t going to call', 'Is he going to call?'],
         ['We / You / They', 'We are going to start', 'We aren\'t going to start', 'Are we going to start?']],
        [{'en': 'I am going to learn Spanish this year.', 'ru': 'Я собираюсь учить испанский в этом году.', 'note': 'Намерение'},
         {'en': 'Watch out! The glass is going to fall!', 'ru': 'Осторожно! Стакан сейчас упадет!', 'note': 'Очевидный прогноз'}],
        ['Пропуск глагола to be: ❌ I going to buy -> ✅ I am going to buy.',
         'Использование will для заранее спланированных дел: лучше сказать *I\'m going to meet my friend*.']
    )

    add(35, 'Будущее время: Future Simple с WILL (спонтанные решения и обещания)',
        'WILL используется для спонтанных решений в момент разговора, обещаний, предложений помощи и общих предсказаний будущего (I think it will...).',
        '1. Сферы применения WILL',
        '1) **Спонтанное решение**: *The phone is ringing. — I will answer it!* 2) **Обещание**: *I will never forget this*. 3) **Предложение помощи**: *I will help you with the bags*. 4) **Предположения со словами I think, I hope, maybe**: *I think it will be sunny tomorrow*.',
        '2. Формулы и сокращения',
        'Утверждение: **will + V1** (*I\'ll help, he\'ll come*). Отрицание: **will not = won\'t** [woʊnt] (*I won\'t be late*). Вопрос: **Will + подлежащее + V1?**',
        'WILL vs BE GOING TO', ['Ситуация', 'Конструкция', 'Пример'],
        [['Спонтанное решение (сейчас)', 'WILL', 'I am thirsty. I\'ll get some water.'],
         ['Заранее спланированное', 'BE GOING TO', 'I bought tickets. I\'m going to visit Italy.'],
         ['Обещание', 'WILL', 'I promise I will call you tomorrow.'],
         ['Прогноз по фактам', 'BE GOING TO', 'Look at the dark clouds! It\'s going to rain.']],
        [{'en': 'Don\'t worry, I won\'t tell anyone.', 'ru': 'Не переживай, я никому не скажу.', 'note': 'Обещание (won\'t)'},
         {'en': 'I think artificial intelligence will change everything.', 'ru': 'Я думаю, искусственный интеллект изменит всё.', 'note': 'Прогноз (I think will)'}],
        ['Использование to после will: ❌ I will to help -> ✅ I will help.',
         'Использование will для договоренностей с купленными билетами: ❌ I will fly tomorrow -> ✅ I am flying tomorrow.']
    )

    add(36, 'Present Continuous для запланированных договоренностей (Future plans)',
        'Present Continuous часто используется для 100% зафиксированных планов и договоренностей в будущем (куплены билеты, назначена встреча в календаре).',
        '1. Договоренность с указанием точного времени/места',
        'Если событие уже организовано и договорено с другими людьми: *I am meeting John at 3 PM tomorrow. We are flying to Paris on Saturday (билеты на руках)*.',
        '2. Контраст со спонтанным WILL',
        'Сравните: *I think I will go home (спонтанное решение)* vs *I am going home at 6 PM (договоренность/план)*.',
        '3 способа выразить будущее', ['Конструкция', 'Степень готовности', 'Пример'],
        [['Present Continuous (am/is/are + V-ing)', '100% точная договоренность с датой/людьми', 'I am flying to Rome on Friday.'],
         ['Be going to + V1', 'Личное намерение / план в голове', 'I am going to buy a new laptop soon.'],
         ['Will + V1', 'Спонтанное решение / общее мнение', 'I will help you with this.']],
        [{'en': 'I am having dinner with my boss tonight.', 'ru': 'У меня сегодня вечером совместный ужин с начальником.', 'note': 'Договоренность'},
         {'en': 'She is starting her new job next Monday.', 'ru': 'Она выходит на новую работу в следующий понедельник.', 'note': 'Зафиксированный план'}],
        ['Использование will для точных встреч из календаря: ❌ I will meet John at 3 PM -> ✅ I am meeting John at 3 PM.']
    )

    add(37, 'Сравнительная степень прилагательных (-er / more... than)',
        'Сравнительная степень используется для сравнения двух предметов или людей: A is bigger than B, A is more expensive than B.',
        '1. Короткие прилагательные (1-2 слога)',
        'К коротким словам добавляется суффикс **-er + than**: *fast -> faster than, cold -> colder than, big -> bigger than (удвоение!), happy -> happier than (-y -> -ier)*.',
        '2. Длинные прилагательные (2+ слогов) и исключения',
        'Перед длинными словами ставится **more + than**: *more expensive than, more interesting than*. Исключения: *good -> better, bad -> worse, far -> further / farther*.',
        'Образование сравнительной степени', ['Тип слова', 'Правило', 'Пример', 'Сравнение'],
        [['Короткое (1 слог)', '+er', 'fast, tall, old', 'faster than, taller than'],
         ['На -y (2 слога)', '-y -> -ier', 'easy, happy, busy', 'easier than, happier than'],
         ['Длинное (2+ слога)', 'more + слово', 'expensive, modern', 'more expensive than'],
         ['Исключения', 'особая форма', 'good, bad, far', 'better than, worse than, further than']],
        [{'en': 'My new laptop is much faster than the old one.', 'ru': 'Мой новый ноутбук намного быстрее старого.', 'note': 'faster than'},
         {'en': 'This method is more effective.', 'ru': 'Этот метод более эффективен.', 'note': 'more effective'}],
        ['Двойное сравнение: ❌ more faster -> ✅ faster.',
         'Использование that вместо than: ❌ bigger that -> ✅ bigger than.']
    )

    add(38, 'Превосходная степень прилагательных (the -est / the most)',
        'Превосходная степень выделяет один предмет как самый-самый среди группы: the biggest, the most expensive, the best.',
        '1. Образование превосходной степени',
        'Перед превосходной степенью ВСЕГДА ставится артикль **THE**! Короткие слова: **the + -est** (*the fastest, the oldest, the biggest*). Длинные слова: **the most + слово** (*the most popular, the most expensive*).',
        '2. Исключения',
        '*good -> the best (самый лучший), bad -> the worst (самый худший), far -> the furthest (самый дальний)*.',
        'Степени сравнения прилагательных', ['Положительная', 'Сравнительная', 'Превосходная'],
        [['cheap (дешевый)', 'cheaper than', 'the cheapest'],
         ['easy (легкий)', 'easier than', 'the easiest'],
         ['important (важный)', 'more important than', 'the most important'],
         ['good (хороший)', 'better than', 'the best'],
         ['bad (плохой)', 'worse than', 'the worst']],
        [{'en': 'This is the best restaurant in the city.', 'ru': 'Это самый лучший ресторан в городе.', 'note': 'the best'},
         {'en': 'Mount Everest is the highest mountain in the world.', 'ru': 'Эверест — самая высокая гора в мире.', 'note': 'the highest'}],
        ['Пропуск артикля the: ❌ He is best player -> ✅ He is the best player.',
         'Двойная превосходная форма: ❌ the most best -> ✅ the best.']
    )

    add(39, 'Наречия частотности: Adverbs of frequency (always, usually, never)',
        'Наречия частотности показывают регулярность: always (100%), usually (80%), often (60%), sometimes (40%), rarely / seldom (10%), never (0%).',
        '1. Место в предложении',
        '1) **ПЕРЕД обычным смысловым глаголом**: *I **always** drink coffee; She **never** eats meat*. 2) **ПОСЛЕ глагола to be**: *He is **always** late; They are **usually** at home*.',
        '2. Отрицание с Never',
        'Слово **never** уже содержит отрицание, поэтому частица *not / don\'t* НЕ ставится: *I never eat fish* (не I don\'t never eat!).',
        'Шкала частотности', ['Наречие', 'Процент частоты', 'Пример', 'Перевод'],
        [['always', '100%', 'I always wake up at 7.', 'Я всегда просыпаюсь в 7.'],
         ['usually', '80%', 'We usually work from home.', 'Мы обычно работаем из дома.'],
         ['often', '60%', 'He often visits his parents.', 'Он часто навещает родителей.'],
         ['sometimes', '40%', 'I sometimes cook dinner.', 'Я иногда готовлю ужин.'],
         ['rarely / seldom', '10%', 'They rarely watch TV.', 'Они редко смотрят телевизор.'],
         ['never', '0%', 'She never drinks alcohol.', 'Она никогда не пьет алкоголь.']],
        [{'en': 'She is always on time for our meetings.', 'ru': 'Она всегда вовремя на наших встречах.', 'note': 'После глагола to be (is always)'},
         {'en': 'I usually drink coffee before work.', 'ru': 'Я обычно пью кофе перед работой.', 'note': 'Перед смысловым глаголом (usually drink)'}],
        ['Двойное отрицание со словом never: ❌ I don\'t never do that -> ✅ I never do that.',
         'Неверная позиция после глагола: ❌ I drink always coffee -> ✅ I always drink coffee.']
    )

    add(40, 'Неопределенные местоимения: Some, Any, No',
        'SOME используется в утвердительных предложениях и вежливых просьбах. ANY — в отрицаниях и вопросах. NO — в отрицаниях вместо not any.',
        '1. Основные правила',
        '**SOME** — «несколько, немного» в утверждениях (*I have some questions, I bought some milk*). **ANY** — в вопросах и отрицаниях с not (*Do you have any questions? I don\'t have any money*). **NO** — прямое отрицание с утвердительным глаголом (*I have no time* = I don\'t have any time).',
        '2. Вежливые просьбы и предложения с SOME',
        'В вопросах-предложениях («Хотите...?») и вежливых просьбах ставится **some**, а не any: *Would you like some tea? Can I have some water?*',
        'Some / Any / No', ['Тип предложения', 'Местоимение', 'Пример', 'Перевод'],
        [['Утверждение (+)', 'some', 'There are some apples in the basket.', 'В корзине есть несколько яблок.'],
         ['Отрицание (- с don\'t)', 'any', 'I don\'t have any cash on me.', 'У меня нет с собой наличных.'],
         ['Отрицание (- с no)', 'no', 'I have no cash on me.', 'У меня нет с собой наличных.'],
         ['Общий вопрос (?)', 'any', 'Are there any vegetarian dishes?', 'Есть ли какие-нибудь вегетарианские блюда?'],
         ['Вежливая просьба (?)', 'some', 'Would you like some coffee?', 'Хотите немного кофе?']],
        [{'en': 'I need some information about the train schedule.', 'ru': 'Мне нужна кое-какая информация о расписании поездов.', 'note': 'Some + неисчисляемое'},
         {'en': 'We don\'t have any milk left.', 'ru': 'У нас не осталось молока.', 'note': 'Any в отрицании'}],
        ['Any в обычных утверждениях: ❌ I bought any bread -> ✅ I bought some bread.',
         'Двойное отрицание с no: ❌ I don\'t have no time -> ✅ I have no time (или I don\'t have any time).']
    )

    add(41, 'Слова количества: Much, Many, A lot of',
        'A LOT OF используется в утверждениях. MANY — с исчисляемыми существительными (вопросы/отрицания). MUCH — с неисчисляемыми существительными (вопросы/отрицания).',
        '1. Утверждения vs Отрицания и Вопросы',
        'В утверждениях обычно говорят **a lot of / lots of** (*I have a lot of friends, He drinks a lot of coffee*). В отрицаниях и вопросах используют **many** для исчисляемых (*I don\'t have many books*) и **much** для неисчисляемых (*Do you have much free time?*).',
        '2. How much vs How many',
        '*How many hours did you sleep?* vs *How much coffee did you drink?*',
        'Употребление Much / Many / A lot of', ['Тип предложения', 'Исчисляемые (Countable)', 'Неисчисляемые (Uncountable)'],
        [['Утверждения (+)', 'a lot of / lots of (a lot of cars)', 'a lot of / lots of (a lot of water)'],
         ['Отрицания (-)', 'many (not many cars)', 'much (not much water)'],
         ['Вопросы (?)', 'many / how many (How many cars?)', 'much / how much (How much water?)']],
        [{'en': 'There were a lot of people at the tech conference.', 'ru': 'На технологической конференции было много людей.', 'note': 'A lot of в утверждении'},
         {'en': 'I don\'t drink much coffee during the day.', 'ru': 'Я не пью много кофе в течение дня.', 'note': 'Much с неисчисляемым в отрицании'}],
        ['Much со штучными предметами: ❌ much friends -> ✅ many friends.',
         'Much в простых утверждениях (звучит неестественно): ❌ I have much money -> ✅ I have a lot of money.']
    )

    add(42, 'Модальные глаголы обязанности: Have to / Don\'t have to',
        'Have to выражает внешнюю необходимость («приходится по правилам/расписанию»). Don\'t have to выражает ОТСУТСТВИЕ необходимости («не обязательно, нет нужды»).',
        '1. Have to / Has to',
        'Формула: **have to / has to + V1**. Например: *I have to wake up early tomorrow (Мне приходится вставать рано — расписание)*. В 3-м лице: *He has to work on Saturday*.',
        '2. Разница между Don\'t have to и Mustn\'t',
        '**Don\'t have to** = не обязательно (*You don\'t have to come if you are tired*). **Mustn\'t** = строгий запрет (*You mustn\'t smoke here*)!',
        'Формы Have to', ['Лицо', 'Утверждение (+)', 'Отрицание (-)', 'Вопрос (?)'],
        [['I / You / We / They', 'I have to leave', 'I don\'t have to leave', 'Do you have to leave?'],
         ['He / She / It', 'He has to leave', 'He doesn\'t have to leave', 'Does he have to leave?']],
        [{'en': 'You don\'t have to pay for this ticket, it is free.', 'ru': 'Тебе не нужно платить за этот билет, он бесплатный.', 'note': 'Отсутствие необходимости'},
         {'en': 'Do we have to wear a suit to the meeting?', 'ru': 'Мы обязаны надевать костюм на встречу?', 'note': 'Вопрос о правилах'}],
        ['Путаница don\'t have to и mustn\'t: ❌ You mustn\'t pay -> означает "запрещено платить", а нужно "не обязательно" -> ✅ You don\'t have to pay.']
    )

    add(43, 'Модальный глагол Should / Shouldn\'t (советы и рекомендации)',
        'SHOULD выражает дружеский совет, рекомендацию или моральный долг («следует, стоит сделать»). После should используется чистый инфинитив без to.',
        '1. Утверждения и отрицания',
        'Формула: **should / shouldn\'t + V1**. Например: *You should see a doctor (Тебе стоит показаться врачу). You shouldn\'t eat so much junk food.*',
        '2. Запрос совета',
        'Для запроса совета: *What should I do? Should we call him now?*',
        'Формы Should', ['Тип', 'Формула', 'Пример', 'Перевод'],
        [['Совет (+)', 'should + V1', 'You should take a break.', 'Тебе стоит сделать перерыв.'],
         ['Совет против (-)', 'shouldn\'t + V1', 'You shouldn\'t stay up late.', 'Тебе не следует засиживаться допоздна.'],
         ['Вопрос о совете (?)', 'Should + подлежащее + V1?', 'Should I accept the offer?', 'Мне стоит принять предложение?']],
        [{'en': 'You should drink more water every day.', 'ru': 'Тебе стоит пить больше воды каждый день.', 'note': 'Полезный совет'},
         {'en': 'You look exhausted, you should get some rest.', 'ru': 'Ты выглядишь истощенным, тебе нужно отдохнуть.', 'note': 'Рекомендация'}],
        ['Использование to после should: ❌ You should to sleep -> ✅ You should sleep.',
         'Добавление -s: ❌ He shoulds go -> ✅ He should go.']
    )

    add(44, 'Абсолютные притяжательные местоимения (mine/yours/his/hers/ours/theirs)',
        'Абсолютные притяжательные местоимения используются БЕЗ существительного после них, чтобы избежать повторов: This bag is mine (а не my bag).',
        '1. Формы абсолютных местоимений',
        '*my -> **mine**, your -> **yours**, his -> **his**, her -> **hers**, our -> **ours**, their -> **theirs***.',
        '2. Сравнение с притяжательными прилагательными',
        'С существительным: *This is **my** phone*. Без существительного: *This phone is **mine**; Whose keys are these? — They are **ours**.*',
        'Притяжательные пары', ['Личное', 'С существительным (my...)', 'Без существительного (mine)'],
        [['I', 'my car', 'mine (моя)'],
         ['You', 'your car', 'yours (твоя/ваша)'],
         ['He', 'his car', 'his (его)'],
         ['She', 'her car', 'hers (её)'],
         ['We', 'our car', 'ours (наша)'],
         ['They', 'their car', 'theirs (их)']],
        [{'en': 'Is this umbrella yours or mine?', 'ru': 'Этот зонт твой или мой?', 'note': 'Абсолютные местоимения'},
         {'en': 'Her car is blue, but ours is black.', 'ru': 'Ее машина синяя, а наша — черная.', 'note': 'Ours без повтора слова car'}],
        ['Добавление существительного после mine: ❌ This is mine car -> ✅ This is my car (или This car is mine).',
         'Апостроф в yours/theirs: ❌ your\'s -> ✅ yours.']
    )

    add(45, 'Past Continuous: Прошедшее длительное время (was/were + V-ing)',
        'Past Continuous выражает действие, которое длилось в определенный момент в прошлом (at 5 PM yesterday) или служило фоном для другого краткого события в Past Simple.',
        '1. Образование Past Continuous',
        'Формула: **was / were + V-ing**. **Was** (для I, he, she, it), **were** (для you, we, they). Например: *I was cooking dinner at 7 PM*.',
        '2. Комбинация с Past Simple (When / While)',
        'Длинное фоновое действие стоит в Past Continuous, а внезапно прервавшее его короткое действие — в Past Simple: *I was walking in the park when it started to rain*.',
        'Past Continuous vs Past Simple', ['Время', 'Суть', 'Формула', 'Пример'],
        [['Past Continuous', 'Длительный процесс/фон', 'was/were + V-ing', 'I was reading a book...'],
         ['Past Simple', 'Краткий факт / прерывание', 'V2 / -ed', '...when the phone rang.']],
        [{'en': 'What were you doing yesterday at 8 PM?', 'ru': 'Что ты делал вчера в 8 вечера?', 'note': 'Действие в точный момент'},
         {'en': 'While she was driving, she listened to a podcast.', 'ru': 'Пока она вела машину, она слушала подкаст.', 'note': 'Фоновый процесс'}],
        ['Пропуск was/were: ❌ I sleeping when he called -> ✅ I was sleeping when he called.',
         'Путаница was и were: ❌ They was playing -> ✅ They were playing.']
    )

    add(46, 'Союзы: Conjunctions (and/but/or/because/so)',
        'Союзы связывают части предложения: AND (добавление), BUT (контраст), OR (выбор), BECAUSE (причина), SO (следствие / результат).',
        '1. Because против So',
        '**Because** объясняет причину («потому что»): *I went to bed early **because** I was tired*. **So** объясняет результат («поэтому»): *I was tired, **so** I went to bed early*.',
        '2. Пунктуация перед союзами',
        'Перед *so* и *but* в сложносочиненных предложениях обычно ставится запятая.',
        'Сводка союзов', ['Союз', 'Значение', 'Пример', 'Перевод'],
        [['and', 'и / а также', 'He plays guitar and sings.', 'Он играет на гитаре и поет.'],
         ['but', 'но / однако', 'I like the apartment, but it is too small.', 'Мне нравится квартира, но она маловата.'],
         ['or', 'или', 'Do you want tea or coffee?', 'Хочешь чай или кофе?'],
         ['because', 'потому что (причина)', 'I called you because I needed advice.', 'Я позвонил, потому что мне был нужен совет.'],
         ['so', 'поэтому (следствие)', 'It was raining, so we stayed at home.', 'Шел дождь, поэтому мы остались дома.']],
        [{'en': 'I wanted to buy the ticket, but it was sold out.', 'ru': 'Я хотел купить билет, но он был распродан.', 'note': 'Контраст (but)'},
         {'en': 'He studied hard, so he passed the exam easily.', 'ru': 'Он усердно учился, поэтому легко сдал экзамен.', 'note': 'Результат (so)'}],
        ['Использование although вместо because: ❌ I left although I was tired -> ✅ because I was tired.',
         'Одновременное использование although и but: ❌ Although he worked hard, but he failed -> ✅ Although he worked hard, he failed.']
    )

    add(47, 'Вопросительные слова: Question words (who/what/where/when/why/how)',
        'Специальные вопросы начинаются с вопросительного слова (Wh-words), после которого следует обычный порядок слов общего вопроса (вспомогательный глагол + подлежащее + глагол).',
        '1. Значение вопросительных слов',
        '**Who** (кто), **What** (что / какой), **Where** (где / куда), **When** (когда), **Why** (почему), **How** (как), **How often** (как часто), **Which** (какой / который из ограниченного выбора).',
        '2. Вопросы к подлежащему с WHO',
        'Если вопрос задается к подлежащему («Кто разбил чашку?»), вспомогательный глагол did/does НЕ нужен: *Who broke the cup? Who lives here?*',
        'Вопросительные слова', ['Слово', 'Значение', 'Пример вопроса', 'Перевод'],
        [['Who', 'кто', 'Who is your team lead?', 'Кто твой тимлид?'],
         ['What', 'что / какой', 'What do you do?', 'Кем ты работаешь?'],
         ['Where', 'где / куда', 'Where did you go yesterday?', 'Куда ты ходил вчера?'],
         ['When', 'когда', 'When will the meeting start?', 'Когда начнется встреча?'],
         ['Why', 'почему / зачем', 'Why are you learning English?', 'Почему ты учишь английский?'],
         ['How', 'как', 'How does this feature work?', 'Как работает эта функция?']],
        [{'en': 'Where do you usually spend your holidays?', 'ru': 'Где ты обычно проводишь отпуск?', 'note': 'Where + do you...'},
         {'en': 'Why did you choose this university?', 'ru': 'Почему ты выбрал этот университет?', 'note': 'Why + did you...'}],
        ['Прямой порядок слов в вопросе: ❌ Where you live? -> ✅ Where do you live?',
         'Лишний did в вопросе к подлежащему: ❌ Who did write this? -> ✅ Who wrote this?']
    )

    add(48, 'Инфинитив цели: Infinitive of purpose (to + verb)',
        'Инфинитив цели (to + глагол) отвечает на вопрос «Зачем? С какой целью?» и переводится союзом «чтобы»: I went to the store to buy milk (Я пошел в магазин, чтобы купить молоко).',
        '1. Конструкция TO + глагол',
        'Для выражения цели действия в английском языке используется инфинитив с частицей **to**: *I turned on the laptop **to check** my email*. Более формальные варианты: **in order to** и **so as to** (*He exercised daily in order to stay healthy*).',
        '2. Отрицательная цель (чтобы НЕ...) и предлог FOR',
        'Если цель отрицательная («чтобы не опоздать / чтобы не забыть»), используется конструкция **in order not to + V1** или **so as not to + V1**: *I set an alarm **so as not to be** late*. Предлог **FOR + V-ing** используется ТОЛЬКО для описания функции предмета (*A microwave is for heating food*), но НЕ для цели человека!',
        'Способы выражения цели', ['Конструкция', 'Тип стиля', 'Пример', 'Перевод'],
        [['to + V1', 'Разговорный / универсальный', 'I called her to ask a question.', 'Я позвонил ей, чтобы задать вопрос.'],
         ['in order to + V1', 'Формальный / деловой', 'We hired an auditor in order to check accounts.', 'Мы наняли аудитора, чтобы проверить счета.'],
         ['so as to + V1', 'Формальный', 'He spoke quietly so as to avoid attention.', 'Он говорил тихо, чтобы не привлекать внимания.'],
         ['so as not to + V1', 'Отрицательная цель (чтобы НЕ)', 'I wrote it down so as not to forget.', 'Я записал это, чтобы не забыть.']],
        [{'en': 'I moved to Berlin to work in a tech startup.', 'ru': 'Я переехал в Берлин, чтобы работать в технологическом стартапе.', 'note': 'Инфинитив цели (to work)'},
         {'en': 'She took a taxi in order not to miss the flight.', 'ru': 'Она взяла такси, чтобы не опоздать на рейс.', 'note': 'Отрицательная цель (in order not to miss)'},
         {'en': 'Press this icon to save your changes.', 'ru': 'Нажмите на эту иконку, чтобы сохранить изменения.', 'note': 'Инструкция цели'}],
        ['Использование for + глагол вместо to: ❌ I went for buy food -> ✅ I went to buy food.',
         'Использование for + V-ing для выражения цели человека: ❌ I called for asking -> ✅ I called to ask.']
    )

    add(49, 'Путешествия и транспорт (Travel and transport)',
        'Словарь транспорта (by car, by train, on foot) и глаголы посадки/высадки (get on/off, get in/out of).',
        '1. Предлоги транспорта',
        'С общим видом транспорта: **by car, by train, by plane, by bus**, но пешком: **on foot**.',
        '2. Глаголы Get on/off vs Get in/out',
        'Общественный транспорт (поезд, автобус, самолет): **get on** (садиться) / **get off** (выходить). Легковая машина/такси: **get in** / **get out of**.',
        'Транспортные фразы', ['Тип транспорта', 'Как добираться', 'Сесть в транспорт', 'Выйти из транспорта'],
        [['Автобус / Поезд', 'by bus / by train', 'get on the bus', 'get off the train'],
         ['Самолет', 'by plane', 'board the plane', 'get off the plane'],
         ['Автомобиль / Такси', 'by car / by taxi', 'get into the car', 'get out of the taxi'],
         ['Пешком', 'on foot', 'walk', 'arrive on foot']],
        [{'en': 'I usually go to work by subway.', 'ru': 'Я обычно езжу на работу на метро.', 'note': 'by subway'},
         {'en': 'Get off the bus at the next stop.', 'ru': 'Выходите из автобуса на следующей остановке.', 'note': 'get off'}],
        ['By foot вместо on foot: ❌ by foot -> ✅ on foot.',
         'Get in the bus вместо get on: ❌ get in the bus -> ✅ get on the bus.']
    )

    add(50, 'Погода и климат (Weather and climate)',
        'Как говорить о погоде через конструкцию It is + прилагательное: It is sunny, It is windy, It is raining.',
        '1. Прилагательные vs Глаголы погоды',
        'Существительное -> Прилагательное: *sun -> sunny, rain -> rainy, wind -> windy, cloud -> cloudy, snow -> snowy*. Глаголы: *It is raining (идет дождь), It is snowing (идет снег)*.',
        '2. Температура',
        '*It is hot (+30°C), warm (+20°C), cool (+12°C), chilly (+5°C), freezing (-10°C)*.',
        'Погодный словарь', ['Явление (Noun)', 'Погода (Adjective)', 'Пример фразы'],
        [['sun (солнце)', 'sunny (солнечно)', 'It is a warm and sunny day.'],
         ['rain (дождь)', 'rainy (дождливо)', 'It was rainy all weekend.'],
         ['wind (ветер)', 'windy (ветрено)', 'It is very windy outside.'],
         ['snow (снег)', 'snowy (снежно)', 'The roads are snowy today.']],
        [{'en': 'What is the weather like in London today?', 'ru': 'Какая сегодня погода в Лондоне?', 'note': 'Вопрос о погоде'},
         {'en': 'It is freezing outside, put on your warm jacket.', 'ru': 'На улице мороз, надень теплую куртку.', 'note': 'It is freezing'}],
        ['The weather is rain: ❌ The weather is rain -> ✅ It is raining (или The weather is rainy).']
    )

    add(51, 'Хобби и свободное время (Hobbies and leisure)',
        'Словарь досуга и глаголы play / go / do со спортом и увлечениями.',
        '1. Правило Play, Go, Do',
        '**PLAY** — командные игры и игры с мячом (*play football, play tennis, play chess*). **GO** — активности на -ing (*go swimming, go running, go skiing*). **DO** — единоборства и гимнастика (*do yoga, do martial arts, do aerobics*).',
        '2. Выражение интереса',
        '*I am interested in photography, I am into hiking*.',
        'Сочетаемость глаголов досуга', ['Глагол', 'Тип активности', 'Примеры'],
        [['PLAY', 'Игры с мячом, командные, настольные', 'play basketball, play guitar, play video games'],
         ['GO', 'Активности с окончанием -ing', 'go hiking, go cycling, go swimming'],
         ['DO', 'Индивидуальные занятия, спортзал', 'do yoga, do puzzles, do crossfit']],
        [{'en': 'I go swimming twice a week to stay fit.', 'ru': 'Я хожу плавать дважды в неделю, чтобы держать форму.', 'note': 'go swimming'}],
        ['Play swimming вместо go swimming: ❌ play swimming -> ✅ go swimming.']
    )

    add(52, 'Профессии и сфера занятости (Jobs and occupations)',
        'Названия профессий (engineer, lawyer, accountant, nurse) и артикль A/AN перед ними.',
        '1. Золотое правило артикля с профессиями',
        'В английском языке перед профессией ВСЕГДА ставится артикль **a** или **an**: *I am **a** software developer, She is **an** accountant*.',
        '2. Глаголы занятости',
        '*work as a manager (работать менеджером), work for Google (работать в компании Google), work in IT (работать в сфере IT)*.',
        'Популярные профессии', ['Профессия', 'Транскрипция', 'Перевод'],
        [['software developer / engineer', '[ˈsɒftweə dɪˈveləpər]', 'разработчик ПО / инженер'],
         ['lawyer / attorney', '[ˈlɔːjər]', 'юрист / адвокат'],
         ['accountant', '[əˈkaʊntənt]', 'бухгалтер'],
         ['product manager', '[ˈprɒdʌkt ˈmænɪdʒər]', 'продакт-менеджер']],
        [{'en': 'She works as a project manager at a fintech company.', 'ru': 'Она работает проектным менеджером в финтех-компании.', 'note': 'as a project manager'}],
        ['Пропуск a/an перед профессией: ❌ He is engineer -> ✅ He is an engineer.']
    )

    add(53, 'Покупки и магазины (Shopping)',
        'Словарь шоппинга: примерка (try on), размеры (sizes), касса (checkout/cashier), возврат (refund/receipt).',
        '1. Фразы в магазине',
        '*Can I try this on? (Можно примерить?)*, *Where are the fitting rooms? (Где примерочные?)*, *Do you have this in size M? (Есть этот размер М?)*.',
        '2. Оплата и возврат',
        '*pay by card / cash, get a refund (получить возврат денег), keep the receipt (сохранить чек)*.',
        'Шоппинг-фразы', ['Ситуация', 'Фраза покупателя', 'Фраза продавца'],
        [['Примерка', 'Can I try this shirt on?', 'The fitting rooms are on the left.'],
         ['Наличие размера', 'Do you have this in a larger size?', 'Let me check the stock for you.'],
         ['Оплата', 'Can I pay by card / contactless?', 'Please tap your card here.']],
        [{'en': 'Keep the receipt if you need a refund or exchange.', 'ru': 'Сохраните чек, если вам понадобится возврат или обмен.', 'note': 'receipt & refund'}],
        ['Произношение слова receipt: буква "p" немая! Произносится как [rɪˈsiːt].']
    )

    add(54, 'Здоровье и медицина (Health and the body)',
        'Как описать самочувствие у врача: I have a sore throat, I caught a cold, I feel dizzy.',
        '1. Болезни и симптомы',
        '*catch a cold (простудиться), have a fever / temperature (температура), feel dizzy (кружится голова), sore throat (болит горло)*.',
        '2. Визит к врачу',
        '*make an appointment with a doctor, take medicine / painkiller, prescription (рецепт)*.',
        'Медицинские симптомы', ['Симптом', 'Перевод', 'Пример фразы'],
        [['headache / stomach ache', 'головная боль / боль в животе', 'I have had a bad headache since morning.'],
         ['sore throat', 'больное горло', 'It hurts when I swallow, I have a sore throat.'],
         ['prescription', 'рецепт от врача', 'The doctor gave me a prescription for antibiotics.']],
        [{'en': 'I need to make an appointment with a doctor.', 'ru': 'Мне нужно записаться на прием к врачу.', 'note': 'make an appointment'}],
        ['I am pain вместо I am in pain или I have a pain: ❌ I am pain -> ✅ My arm hurts.']
    )

    add(55, 'Распорядок дня: Daily routines',
        'Глаголы ежедневных действий: wake up, get up, brush teeth, commute to work, fall asleep.',
        '1. Wake up vs Get up',
        '*Wake up* — проснуться (открыть глаза). *Get up* — физически встать с кровати на ноги.',
        '2. Ежедневные привычки',
        '*take a shower, get dressed, commute to the office, work out, go to bed*.',
        'Ежедневный распорядок', ['Время', 'Действие', 'Пример фразы'],
        [['Утро', 'wake up, have breakfast, brush teeth', 'I wake up at 7:00 and have coffee.'],
         ['День', 'commute to work, have lunch, attend meetings', 'I commute by train and work until 6.'],
         ['Вечер', 'cook dinner, relax, go to bed', 'I read a book and fall asleep by 11.']],
        [{'en': 'I usually commute for forty minutes each morning.', 'ru': 'Каждое утро я добираюсь до работы сорок минут.', 'note': 'commute'}],
        ['Пропуск предлогов времени: ❌ I wake up 7 o\'clock -> ✅ at 7 o\'clock.']
    )

    add(56, 'Как спросить и указать дорогу (Asking for and giving directions)',
        'Ориентирование в городе: turn left/right, go straight ahead, opposite the bank, next to the station.',
        '1. Навигационные фразы',
        '*Excuse me, how do I get to...? (Как мне добраться до...?)*, *Go straight ahead for two blocks (Идите прямо два квартала)*, *Turn right at the crossroads (Поверните направо на перекрестке)*.',
        '2. Ориентиры',
        '*roundabout (кольцевое движение), traffic lights (светофор), opposite (напротив), next to (рядом с)*.',
        'Указатели направления', ['Команда', 'Перевод', 'Ориентир'],
        [['go straight ahead', 'идите прямо', 'along this street'],
         ['turn left / right', 'поверните налево / направо', 'at the traffic light'],
         ['cross the street', 'перейдите улицу', 'at the pedestrian crossing'],
         ['on your left / right', 'слева / справа от вас', 'next to the post office']],
        [{'en': 'Excuse me, where is the nearest pharmacy? — It is opposite the supermarket.', 'ru': 'Извините, где ближайшая аптека? — Напротив супермаркета.', 'note': 'opposite'}],
        ['Turn to the left вместо turn left (в разговорной речи предлог to опускается).']
    )

    add(57, 'Как вносить предложения: Making suggestions (Let\'s / How about / Why don\'t we)',
        'Конструкции для совместных идей: Let\'s + V1, Why don\'t we + V1, How about + V-ing / What about + V-ing.',
        '1. Разница в форме глагола',
        'После **Let\'s** и **Why don\'t we** идет чистый глагол (*Let\'s go, Why don\'t we meet?*). После **How about / What about** идет глагол с **-ing** (*How about going to the cinema?*).',
        '2. Ответы на предложения',
        '*That sounds great! (Звучит отлично!)*, *I\'d love to, but I am busy (С удовольствием, но я занят)*.',
        'Формулы предложений', ['Конструкция', 'Форма глагола', 'Пример', 'Перевод'],
        [['Let\'s...', '+ V1 (инфинитив)', 'Let\'s grab a coffee.', 'Давай выпьем кофе.'],
         ['Why don\'t we...', '+ V1 (инфинитив)', 'Why don\'t we take a break?', 'Почему бы нам не сделать перерыв?'],
         ['How about...', '+ V-ing (герундий)', 'How about watching a movie tonight?', 'Как насчет того, чтобы посмотреть кино сегодня?']],
        [{'en': 'How about ordering pizza for dinner?', 'ru': 'Как насчет того, чтобы заказать пиццу на ужин?', 'note': 'How about + ordering (-ing)'}],
        ['Инфинитив после How about: ❌ How about go to cafe? -> ✅ How about going to a cafe?']
    )

    add(58, 'Рассказ о событиях в прошлом: Describing past events',
        'Связующие слова для связного рассказа: first, then, after that, suddenly, in the end.',
        '1. Хронологические маркеры',
        '*First (сначала), then / after that (затем), suddenly (вдруг), finally / in the end (в конце концов)*.',
        '2. Чередование времен',
        'В связном рассказе факты идут в Past Simple, фон в Past Continuous, а предшествовавшие события — в Past Perfect.',
        'Слова-связки повествования', ['Этап истории', 'Слово-связка', 'Пример'],
        [['Начало', 'First / In the beginning', 'First, we arrived at the airport.'],
         ['Развитие', 'Then / After that / Later', 'Then, we rented a car.'],
         ['Неожиданность', 'Suddenly / Out of nowhere', 'Suddenly, the engine stopped.'],
         ['Финал', 'Finally / In the end', 'Finally, a mechanic arrived and fixed it.']],
        [{'en': 'First we checked in at the hotel, and then we went for a walk.', 'ru': 'Сначала мы заселились в отель, а затем пошли гулять.', 'note': 'First -> then'}],
        ['Путаница at the end (в конце чего-то конкретного: книги, улицы) и in the end (в итоге/в конце концов).']
    )

    add(59, 'Договоренности и планы: Making plans and arrangements',
        'Как договориться о встрече на английском: Are you free on Friday?, Shall we meet at 6?, That works for me.',
        '1. Ключевые фразы согласования',
        '*Are you available tomorrow? (Ты свободен завтра?)*, *Does 4 PM suit you / work for you? (В 16:00 тебе подходит?)*, *Let\'s fix a date (Давай согласуем дату)*.',
        '2. Перенос встречи',
        '*Can we reschedule for Friday? (Можем перенести на пятницу?)*, *Something came up (Кое-что непредвиденное возникло)*.',
        'Диалог согласования встречи', ['Инициатор', 'Ответ собеседника'],
        [['Are you free this Thursday evening?', 'Yes, I am free after 6 PM.'],
         ['How about meeting at the Starbucks downtown?', 'Sounds great, that works for me.'],
         ['Can we reschedule to Friday?', 'Sure, Friday at 10 AM is perfect.']],
        [{'en': 'That time works perfectly for me. See you then!', 'ru': 'Это время мне идеально подходит. До встречи!', 'note': 'works for me'}],
        ['Буквальный перевод "I can tomorrow": лучше сказать *I am available tomorrow* или *Tomorrow works for me*.']
    )

    add(60, 'Выражение предпочтений: Expressing likes and dislikes',
        'Градации предпочтений: I love > I really like > I don\'t mind > I dislike > I can\'t stand (терпеть не могу).',
        '1. Форма глагола после like / love / hate',
        'После глаголов чувств используется форма с **-ing** (герундий) или существительное: *I love cooking, I can\'t stand waiting in lines*.',
        '2. Фраза "I don\'t mind"',
        '*I don\'t mind* означает «я не против, мне все равно» (нейтральное отношение): *I don\'t mind walking*.',
        'Шкала предпочтений', ['Степень', 'Фраза', 'Пример'],
        [['Обожаю (+100%)', 'I love / I am crazy about', 'I love traveling to new countries.'],
         ['Нравится (+70%)', 'I really like / I enjoy', 'I enjoy listening to podcasts.'],
         ['Нейтрально (0%)', 'I don\'t mind', 'I don\'t mind working overtime sometimes.'],
         ['Не нравится (-50%)', 'I don\'t like / I dislike', 'I don\'t like crowded places.'],
         ['Терпеть не могу (-100%)', 'I can\'t stand / I hate', 'I can\'t stand waking up early on Sundays.']],
        [{'en': 'I really enjoy solving complex coding problems.', 'ru': 'Мне очень нравится решать сложные задачи в коде.', 'note': 'enjoy + solving (-ing)'}],
        ['Инфинитив после enjoy / can\'t stand: ❌ I enjoy to read -> ✅ I enjoy reading.']
    )

    add(11251, 'Фразовые глаголы движения и быта (wake up, get on, turn off)',
        'Фразовый глагол — это комбинация глагола с предлогом/наречием, которая меняет исходный смысл глагола (turn = поворачивать, turn off = выключать прибор).',
        '1. Топ базовых фразовых глаголов A2',
        '*wake up (просыпаться), get up (вставать), turn on / off (включать / выключать свет/прибор), put on (надевать), take off (снимать одежду / взлетать), give up (сдаваться/бросать привычку)*.',
        '2. Разделяемость фразовых глаголов',
        'Если дополнение выражено местоимением (it, them), оно ставится В СЕРЕДИНУ: *turn **it** on (не turn on it!)*.',
        'Бытовые фразовые глаголы', ['Фразовый глагол', 'Значение', 'Пример предложения', 'Перевод'],
        [['turn on / turn off', 'включить / выключить (электричество/прибор)', 'Please turn off the lights before leaving.', 'Пожалуйста, выключите свет перед уходом.'],
         ['put on / take off', 'надеть / снять (одежду)', 'Take off your shoes inside.', 'Снимите обувь в помещении.'],
         ['give up', 'бросить (курить/дело), сдаться', 'Never give up on your dreams.', 'Никогда не отказывайся от своей мечты.'],
         ['look for', 'искать что-то', 'I am looking for my keys.', 'Я ищу свои ключи.']],
        [{'en': 'Could you turn down the music, please?', 'ru': 'Не мог бы ты сделать музыку потише?', 'note': 'turn down (убавить громкость)'}],
        ['Буквальный перевод open the light вместо turn on the light: ❌ open the light -> ✅ turn on the light.']
    )

    add(11252, 'Различия American vs British English (лексика и орфография)',
        'Ключевые различия между американским (US) и британским (UK) английским в словах и правописании (-or vs -our, -ize vs -ise).',
        '1. Разница в словах',
        'Квартира: *apartment (US) / flat (UK)*; Лифт: *elevator (US) / lift (UK)*; Метро: *subway (US) / underground / tube (UK)*; Печенье: *cookie (US) / biscuit (UK)*; Картошка фри: *fries (US) / chips (UK)*.',
        '2. Орфография',
        'US: *color, favorite, center, theater, realize*. UK: *colour, favourite, centre, theatre, realise*.',
        'US vs UK Vocabulary', ['Значение', 'American English (US)', 'British English (UK)'],
        [['Квартира', 'apartment', 'flat'],
         ['Лифт', 'elevator', 'lift'],
         ['Метро', 'subway', 'tube / underground'],
         ['Осень', 'fall', 'autumn'],
         ['Бензин', 'gas / gasoline', 'petrol'],
         ['Отпуск', 'vacation', 'holiday']],
        [{'en': 'I took the elevator up to my apartment (US) = I took the lift up to my flat (UK).', 'ru': 'Я поднялся на лифте в свою квартиру.', 'note': 'US vs UK эквиваленты'}],
        ['Смешение правописания в одном документе: придерживайтесь последовательно одного стандарта (US или UK).']
    )

    # =========================================================================
    # B1 (Topics 61 - 89, 11253, 11254, 11255)
    # =========================================================================
    add(61, 'Present Perfect: Жизненный опыт и результаты (have/has + V3)',
        'Present Perfect связывает прошлое действие с настоящим моментом: жизненный опыт (бывал/не бывал), результат к текущей секунде или действие за незавершенный период.',
        '1. Формула Present Perfect',
        'Формула: **have / has + 3-я форма глагола (V3 / -ed)**. *Have* (с I, you, we, they), *has* (с he, she, it). Например: *I have seen this movie. She has visited London.*',
        '2. Маркеры времени',
        'Слова-маркеры: **ever** (когда-либо в вопросах), **never** (никогда), **already** (уже в утверждениях), **yet** (уже в вопросах, еще не в отрицаниях), **just** (только что).',
        'Маркеры Present Perfect', ['Маркер', 'Значение', 'Позиция', 'Пример'],
        [['ever', 'когда-либо', 'перед V3 в вопросе', 'Have you ever been to Japan?'],
         ['never', 'никогда', 'перед V3', 'I have never eaten oysters.'],
         ['already', 'уже', 'перед V3', 'I have already finished the task.'],
         ['yet', 'еще не / уже', 'в конце предложения', 'I haven\'t received the email yet.'],
         ['just', 'только что', 'перед V3', 'He has just left the office.']],
        [{'en': 'Have you ever worked in a remote team?', 'ru': 'Ты когда-либо работал в удаленной команде?', 'note': 'Жизненный опыт (ever)'},
         {'en': 'I have already sent the report.', 'ru': 'Я уже отправил отчет.', 'note': 'Результат в настоящем'}],
        ['Указание точного времени с Present Perfect: ❌ I have seen him yesterday -> ✅ I saw him yesterday.',
         'Забывание has в 3-м лице: ❌ She have done it -> ✅ She has done it.']
    )

    add(62, 'Контраст: Present Perfect против Past Simple',
        'Главная дилемма английского языка: Past Simple — для событий с точным временем в закрытом прошлом (yesterday, in 2021). Present Perfect — для опыта и результатов в связи с НАСТОЯЩИМ (без точной даты).',
        '1. Сравнение контекстов',
        'Если есть маркеры точного времени (*yesterday, last week, ago, in 2018*) — ВСЕГДА **Past Simple**. Если важен факт свершения, результат или опыт (*ever, never, already, yet, so far*) — **Present Perfect**.',
        '2. Диалоги: вопрос Present Perfect -> детали в Past Simple',
        'Типичный паттерн живой речи: *— Have you ever been to Paris? (Present Perfect) — Yes, I went there last summer with my family (Past Simple).*',
        'Сравнительная таблица времен', ['Параметр', 'Present Perfect', 'Past Simple'],
        [['Фокус', 'Результат сейчас / опыт', 'Факт в прошлом / точное время'],
         ['Маркеры времени', 'ever, never, already, yet, just, recently', 'yesterday, last month, in 2020, 2 days ago, when'],
         ['Период времени', 'Незавершенный (today, this year)', 'Завершенный (yesterday, last year)'],
         ['Пример', 'I have lost my key (I can\'t enter now).', 'I lost my key yesterday (found it later).']],
        [{'en': 'I have visited Spain twice, but I went to Madrid in 2022.', 'ru': 'Я бывал в Испании дважды, но в Мадрид ездил в 2022 году.', 'note': 'Опыт (Present Perfect) + факт с датой (Past Simple)'}],
        ['Present Perfect с датой/yesterday: ❌ I have arrived yesterday -> ✅ I arrived yesterday.',
         'Past Simple со словом never в значении опыта: лучше сказать *I have never tried this*.']
    )

    add(63, 'Present Perfect Continuous: Длительность действия (have/has been + V-ing)',
        'Present Perfect Continuous выражает действие, которое началось в прошлом и длится до сих пор (с предлогами FOR / SINCE), или только что завершилось с очевидным результатом.',
        '1. Формула и предлоги FOR / SINCE',
        'Формула: **have / has been + V-ing**. **FOR** указывает на длительность периода (*for two hours, for five years*). **SINCE** указывает на начальную точку отсчета (*since 9 AM, since Monday, since 2020*).',
        '2. Сравнение с Present Perfect Simple',
        'Present Perfect Continuous подчеркивает сам **процесс и длительность** (*I have been coding all morning*). Present Perfect Simple подчеркивает **факт и завершенный результат** (*I have written three functions*).',
        'Present Perfect Continuous vs Simple', ['Время', 'Акцент', 'Формула', 'Пример'],
        [['Present Perfect Continuous', 'Длительность процесса (Как долго?)', 'have/has been + V-ing', 'I have been waiting for two hours.'],
         ['Present Perfect Simple', 'Результат / Количество (Сколько сделано?)', 'have/has + V3', 'I have read 50 pages today.']],
        [{'en': 'I have been working at this company since 2021.', 'ru': 'Я работаю в этой компании с 2021 года (и продолжаю работать).', 'note': 'have been working + since'},
         {'en': 'You look tired. — Yes, I have been running.', 'ru': 'Ты выглядишь уставшим. — Да, я бегал.', 'note': 'Очевидный результат процесса'}],
        ['Использование Present Simple вместо Continuous со словом since: ❌ I work here since 2020 -> ✅ I have been working here since 2020.',
         'Использование глаголов состояния в Continuous: ❌ I have been knowing him -> ✅ I have known him.']
    )

    add(64, 'Past Continuous vs Past Simple: Фоновые действия и прерывания',
        'Past Continuous описывает длинное фоновое действие, которое происходило в определенный момент прошлого. Past Simple описывает краткое событие, которое прервало этот фон.',
        '1. Союзы When и While',
        'После **While** обычно ставится Past Continuous (*While I was sleeping...*). После **When** — краткое действие в Past Simple (*...when the alarm went off*).',
        '2. Одновременные длительные действия',
        'Два параллельных процесса в прошлом: *While I was cooking, my wife was setting the table.*',
        'Комбинация времен в прошлом', ['Тип действия', 'Время', 'Союз', 'Пример'],
        [['Длинный фон (процесс)', 'Past Continuous', 'While / As', 'While we were driving to the airport...'],
         ['Краткое прерывание', 'Past Simple', 'When', '...the car suddenly broke down.'],
         ['Последовательность событий', 'Past Simple + Past Simple', 'First, then', 'He opened the door and walked inside.']],
        [{'en': 'I was watching TV when the lights went out.', 'ru': 'Я смотрел телевизор, когда внезапно погас свет.', 'note': 'Фон (was watching) + прерывание (went out)'}],
        ['Past Continuous для последовательных действий: ❌ He was entering the room and was sitting down -> ✅ He entered the room and sat down.']
    )

    add(65, 'Привычки в прошлом: Used to и Would (Past habits)',
        'Конструкции USED TO и WOULD используются для выражения регулярных привычек и состояний в прошлом, которых больше нет в настоящем («раньше я делал...»).',
        '1. Used to для привычек и состояний',
        'Формула: **used to + V1**. Подходит и для повторяющихся действий (*I used to play tennis*), и для долговременных состояний (*I used to live in Paris, I used to have long hair*). Отрицание: *I didn\'t use to...*',
        '2. Would только для повторяющихся действий',
        '**Would + V1** используется ТОЛЬКО для повторяющихся действий в прошлом (*Every summer we would go to the beach*). С глаголами состояния (live, know, be, have) would НЕ употребляется!',
        'Used to vs Would', ['Конструкция', 'Повторяющиеся действия', 'Состояния (be, live, have)', 'Пример'],
        [['used to + V1', 'Да (регулярно делал)', 'Да (раньше жил/был)', 'I used to live in London.'],
         ['would + V1', 'Да (часто делал)', 'НЕТ (нельзя с live, be)', 'We would swim in the river every day.']],
        [{'en': 'I used to smoke, but I quit five years ago.', 'ru': 'Раньше я курил, но бросил пять лет назад.', 'note': 'Привычка в прошлом (used to)'},
         {'en': 'My grandmother would always bake cookies on Sundays.', 'ru': 'Моя бабушка всегда пекла печенье по воскресеньям.', 'note': 'Повторяющееся действие (would) '}],
        ['Использование would с глаголами состояния: ❌ I would live in Rome -> ✅ I used to live in Rome.',
         'Добавление -d в отрицании: ❌ didn\'t used to -> ✅ didn\'t use to.']
    )

    add(66, 'First Conditional: Первый тип условных предложений (Реальное будущее)',
        'First Conditional выражает реальные, вероятные условия в будущем. Формула: If + Present Simple, will + V1.',
        '1. Золотое правило: НИКАКОГО WILL В ЧАСТИ С IF!',
        'В условной части (после IF или WHEN) будущее время передается через **Present Simple**, а WILL ставится только в главной части: *If it rains tomorrow, we will stay at home* (не If it will rain!).',
        '2. Союзы When, Unless, As soon as',
        '**Unless** = if not (если не): *Unless you hurry, we will miss the train* (= If you don\'t hurry). **As soon as** = как только: *I will call you as soon as I arrive*.',
        'Структура First Conditional', ['Условная часть (IF)', 'Главная часть (Результат)', 'Пример'],
        [['If + Present Simple', 'will + V1 (Future Simple)', 'If you study hard, you will pass the exam.'],
         ['Unless + Present Simple', 'will + V1', 'Unless you call, I won\'t know.'],
         ['When + Present Simple', 'will + V1', 'When the meeting ends, I will text you.']],
        [{'en': 'If we finish the sprint today, we will deploy tomorrow.', 'ru': 'Если мы закончим спринт сегодня, мы задеплоим завтра.', 'note': 'Реальное будущее'},
         {'en': 'I will send you the document as soon as it is ready.', 'ru': 'Я отправлю тебе документ, как только он будет готов.', 'note': 'As soon as + Present Simple'}],
        ['Will после if: ❌ If you will come -> ✅ If you come.',
         'Забывание -s для he/she/it в части if: ❌ If he come -> ✅ If he comes.']
    )

    add(67, 'Second Conditional: Второй тип условных предложений (Воображаемое настоящее)',
        'Second Conditional описывает маловероятные, нереальные или воображаемые ситуации в настоящем/будущем («Если бы... то я бы...»). Формула: If + Past Simple, would + V1.',
        '1. Образование и формула',
        'Формула: **If + Past Simple, would + V1**. Например: *If I had a million dollars, I would travel around the world* (Но у меня нет миллиона — это мечта).',
        '2. Конструкция "If I were you" (Совет)',
        'В условных предложениях для всех лиц традиционно используется форма **WERE**: *If I were you, I would accept the job offer (На твоем месте я бы принял предложение).*',
        'First vs Second Conditional', ['Тип', 'Смысл', 'Формула', 'Пример'],
        [['1st Conditional', 'Реальное будущее (50-90% вероятность)', 'If + Present Simple, will + V1', 'If I have time tomorrow, I will call you.'],
         ['2nd Conditional', 'Воображаемое настоящее (мечта / совет)', 'If + Past Simple, would + V1', 'If I had more time, I would learn Spanish.']],
        [{'en': 'If I had his phone number, I would call him right now.', 'ru': 'Если бы у меня был его номер, я бы позвонил ему прямо сейчас.', 'note': 'Воображаемая ситуация'},
         {'en': 'If I were you, I would take a few days off.', 'ru': 'На твоем месте я бы взял пару дней отдыха.', 'note': 'Совет (If I were you)'}],
        ['Would в части с if: ❌ If I would know -> ✅ If I knew.',
         'Использование will во втором типе: ❌ If I had money, I will buy -> ✅ I would buy.']
    )

    add(68, 'Пассивный залог: Present & Past Passive (am/is/are/was/were + V3)',
        'Пассивный залог используется, когда важно само действие или его объект, а исполнитель неизвестен, очевиден или не имеет значения: The house was built in 1990.',
        '1. Образование пассивного залога',
        'Формула: **be (в нужном времени) + 3-я форма глагола (V3 / -ed)**. В Present Simple: *am / is / are + V3* (*English is spoken worldwide*). В Past Simple: *was / were + V3* (*The file was deleted yesterday*).',
        '2. Предлог BY для указания автора',
        'Если необходимо назвать автора действия, в конце ставится предлог **by**: *The novel was written by George Orwell*.',
        'Present vs Past Passive', ['Время', 'Активный залог', 'Пассивный залог', 'Перевод'],
        [['Present Simple', 'They make these cars in Germany.', 'These cars are made in Germany.', 'Эти машины производятся в Германии.'],
         ['Past Simple', 'Alexander Bell invented the telephone.', 'The telephone was invented by Bell.', 'Телефон был изобретен Беллом.']],
        [{'en': 'Millions of emails are sent every minute.', 'ru': 'Миллионы писем отправляются каждую минуту.', 'note': 'Present Passive (are sent)'},
         {'en': 'The system was updated last night.', 'ru': 'Система была обновлена прошлой ночью.', 'note': 'Past Passive (was updated)'}],
        ['Пропуск глагола be в пассиве: ❌ The bridge built in 2000 -> ✅ The bridge was built in 2000.',
         'Использование 2-й формы вместо 3-й: ❌ was wrote -> ✅ was written.']
    )

    add(69, 'Определительные придаточные предложения: Relative clauses (who/which/that)',
        'Relative clauses соединяют два предложения и уточняют, о каком именно человеке, предмете или месте идет речь.',
        '1. Относительные местоимения',
        '**WHO** — о людях (*The man who called you*). **WHICH** — о предметах и животных (*The laptop which I bought*). **THAT** — универсально о людях и предметах в разговорной речи. **WHOSE** — чей/чья (*The girl whose car was stolen*). **WHERE** — где/куда (*The city where I was born*).',
        '2. Когда можно опускать who / which / that',
        'Если местоимение является дополнением (после него идет подлежащее + глагол), его можно спокойно опустить: *The movie (that) I watched yesterday was amazing.*',
        'Относительные местоимения', ['Местоимение', 'Относится к', 'Пример предложения', 'Перевод'],
        [['who', 'людям', 'The engineer who fixed the server is brilliant.', 'Инженер, который починил сервер, великолепен.'],
         ['which', 'предметам / животным', 'This is the book which won the prize.', 'Это книга, которая выиграла премию.'],
         ['that', 'людям и предметам', 'I like the music that you recommended.', 'Мне нравится музыка, которую ты порекомендовал.'],
         ['whose', 'принадлежности (чей?)', 'A colleague whose laptop broke asked for help.', 'Коллега, чей ноутбук сломался, попросил о помощи.'],
         ['where', 'местам (где)', 'This is the cafe where we met.', 'Это кафе, где мы познакомились.']],
        [{'en': 'The candidate who had the most experience got the job.', 'ru': 'Кандидат, у которого было больше всего опыта, получил работу.', 'note': 'who + о людях'},
         {'en': 'I lost the keys that you gave me yesterday.', 'ru': 'Я потерял ключи, которые ты дал мне вчера.', 'note': 'that + о предметах'}],
        ['Использование what вместо that/which: ❌ The car what I bought -> ✅ The car that I bought.',
         'Использование who для предметов: ❌ The phone who is on the desk -> ✅ The phone which is on the desk.']
    )

    add(70, 'Косвенная речь: Базовые правила согласования (Reported Speech)',
        'Когда мы передаем чужие слова (He said that...), времена сдвигаются на шаг назад в прошлое (Backshift of tenses): Present -> Past.',
        '1. Сдвиг времен (Backshift)',
        'Если вводный глагол стоит в прошедшем времени (*He said / She told me*): *Present Simple -> Past Simple* (*"I work" -> He said he worked*), *Present Continuous -> Past Continuous*, *will -> would*, *can -> could*.',
        '2. Разница между SAY и TELL',
        '**SAY** употребляется без указания адресата (*He said that...*). **TELL** обязательно требует адресата (*He told ME that...* — без предлога to!).',
        'Таблица сдвига времен', ['Прямая речь (Direct)', 'Косвенная речь (Reported)', 'Пример'],
        [['Present Simple (I like)', 'Past Simple (liked)', 'He said he liked jazz.'],
         ['Present Continuous (I am working)', 'Past Continuous (was working)', 'She said she was working.'],
         ['will (I will call)', 'would (would call)', 'He said he would call.'],
         ['can (I can help)', 'could (could help)', 'She said she could help.']],
        [{'en': 'Anna said that she was very busy.', 'ru': 'Анна сказала, что она очень занята.', 'note': 'is -> was'},
         {'en': 'He told me that he would arrive on Friday.', 'ru': 'Он сказал мне, что приедет в пятницу.', 'note': 'told me + would'}],
        ['To после tell: ❌ He told to me -> ✅ He told me.',
         'Забывание сдвига времени: ❌ He said he is busy -> ✅ He said he was busy.']
    )

    add(71, 'Герундий против Инфинитива: Gerund vs Infinitive (doing vs to do)',
        'После одних глаголов в английском ставится форма на -ing (герундий), а после других — инфинитив с частицей to (to do).',
        '1. Глаголы с герундием (-ing)',
        'После глаголов: **enjoy, avoid, mind, suggest, finish, keep, practice, admit, recommend, consider** + **V-ing** (*I enjoy reading, She suggested going for a walk*). А также после ВСЕХ предлогов: *interested in learning, good at coding*.',
        '2. Глаголы с инфинитивом (to + V1)',
        'После глаголов: **decide, want, hope, promise, agree, refuse, plan, offer, need, afford** + **to V1** (*I decided to quit, She promised to help*).',
        'Герундий vs Инфинитив', ['Группа', 'Ключевые глаголы', 'Пример предложения', 'Перевод'],
        [['Герундий (-ing)', 'enjoy, avoid, finish, suggest, mind', 'I avoid driving in rush hour.', 'Я избегаю вождения в час пик.'],
         ['Инфинитив (to + V)', 'decide, plan, hope, want, offer', 'We decided to launch the feature.', 'Мы решили запустить эту функцию.'],
         ['После предлогов', 'in, on, at, about, without, before', 'He left without saying goodbye.', 'Он ушел, не попрощавшись.']],
        [{'en': 'I am looking forward to meeting you next week.', 'ru': 'Я с нетерпением жду встречи с вами на следующей неделе.', 'note': 'look forward to + -ing (to здесь предлог!)'},
         {'en': 'She refused to sign the contract.', 'ru': 'Она отказалась подписывать контракт.', 'note': 'refuse + to V1'}],
        ['Инфинитив после enjoy: ❌ I enjoy to swim -> ✅ I enjoy swimming.',
         'Инфинитив после предлогов: ❌ thank you for come -> ✅ thank you for coming.']
    )

    add(72, 'Модальные глаголы вероятности и обязанности (must/might/may)',
        'Модальные глаголы выражают степень уверенности: MUST (99% уверенность: «должно быть, точно»), MIGHT / MAY / COULD (30-50% вероятность: «возможно, может быть»), CAN\'T (99% невозможность: «не может быть»).',
        '1. Степень уверенности в настоящем',
        '*He **must** be at the office (Он точно в офисе — горит свет)*. *He **might** be in a meeting (Возможно, он на встрече)*. *He **can\'t** be at home (Он точно не дома — я только что видел его машину здесь)*.',
        '2. Must как строгая обязанность',
        '**Must** также выражает личную категорическую обязанность или закон: *You must wear a seatbelt.*',
        'Шкала модальной уверенности', ['Модальный глагол', 'Уверенность', 'Пример предложения', 'Смысл'],
        [['MUST', '99% уверенность (+)', 'He has three cars, he must be rich.', 'Он точно богат.'],
         ['MIGHT / MAY / COULD', '40-50% возможность', 'It might rain later today.', 'Возможно, позже пойдет дождь.'],
         ['CAN\'T', '99% невозможность (-)', 'That can\'t be true!', 'Это не может быть правдой!']],
        [{'en': 'You must be exhausted after such a long flight.', 'ru': 'Ты, должно быть, очень устал после такого долгого перелета.', 'note': 'Логический вывод (Must be)'},
         {'en': 'We might move to another city next year.', 'ru': 'Возможно, в следующем году мы переедем в другой город.', 'note': 'Вероятность (Might move)'}],
        ['Использование must not для выражения "вряд ли": ❌ He must not be at home -> ✅ He can\'t be at home (mustn\'t означает строгий запрет!).']
    )

    add(73, 'Слова меры и степени: Too / Enough',
        'TOO означает избыток («слишком много / чересчур»). ENOUGH означает достаточную норму («достаточно»).',
        '1. Позиция в предложении',
        '**TOO** ставится ПЕРЕД прилагательным/наречием (*too expensive, too late*). **ENOUGH** ставится ПОСЛЕ прилагательного (*rich enough, fast enough*), но ПЕРЕД существительным (*enough money, enough time*)!',
        '2. Конструкция "too... to" и "enough to"',
        '*This car is **too expensive to buy** (Слишком дорогая, чтобы купить)*. *He is **strong enough to lift** this box (Достаточно силен, чтобы поднять)*.',
        'Too vs Enough', ['Слово', 'Позиция', 'Пример', 'Перевод'],
        [['too + adj', 'перед прилагательным', 'This coffee is too hot.', 'Этот кофе слишком горячий.'],
         ['adj + enough', 'ПОСЛЕ прилагательного', 'Is the water warm enough?', 'Вода достаточно теплая?'],
         ['enough + noun', 'ПЕРЕД существительным', 'We don\'t have enough budget.', 'У нас недостаточно бюджета.']],
        [{'en': 'He is old enough to drive a car.', 'ru': 'Он достаточно взрослый, чтобы водить машину.', 'note': 'old enough (после)'},
         {'en': 'It is too late to change the decision.', 'ru': 'Слишком поздно, чтобы менять решение.', 'note': 'too late (перед)'}],
        ['Enough перед прилагательным: ❌ enough warm -> ✅ warm enough.',
         'Too с положительным оттенком: вместо too good лучше сказать *very good* или *so good*.']
    )

    add(74, 'Усилители So / Such (So good vs Such a good idea)',
        'SO и SUCH переводятся как «такой, настолько» и служат для сильного эмоционального усиления признака.',
        '1. Различие в синтаксисе',
        '**SO + прилагательное / наречие** (без существительного!): *She is **so smart**, He drives **so fast***. **SUCH + (a/an) + прилагательное + существительное**: *She is **such a smart person**, It was **such bad weather***.',
        '2. Конструкция So... that / Such... that (Настолько... что)',
        '*The movie was **so interesting that** I watched it twice.* *It was **such a great day that** we went to the beach.*',
        'So vs Such', ['Конструкция', 'Схема', 'Пример', 'Перевод'],
        [['SO', 'so + adjective / adverb', 'The task was so difficult.', 'Задача была настолько сложной.'],
         ['SUCH A / AN', 'such a/an + adj + существительное (ед. ч.)', 'It was such a difficult task.', 'Это была такая сложная задача.'],
         ['SUCH', 'such + adj + существительное (мн. ч. / неисч.)', 'They are such friendly people.', 'Они такие дружелюбные люди.']],
        [{'en': 'I was so tired that I fell asleep immediately.', 'ru': 'Я так устал, что мгновенно уснул.', 'note': 'so + tired + that'},
         {'en': 'We had such a wonderful time in Rome.', 'ru': 'Мы так замечательно провели время в Риме.', 'note': 'such a + wonderful time'}],
        ['Such без существительного: ❌ He is such smart -> ✅ He is so smart.',
         'So с существительным: ❌ so a good day -> ✅ such a good day.']
    )

    add(75, 'Продвинутые правила артикля THE (География и уникальные группы)',
        'Продвинутые случаи употребления THE: географические объекты, музыкальные инструменты, группы людей и уникальные системы.',
        '1. География с артиклем THE',
        'С артиклем **THE**: реки (*the Thames*), моря и океаны (*the Atlantic*), горные цепи (*the Alps*), группы островов (*the Bahamas*), страны во мн. числе или со словами Kingdom/States/Republic (*the USA, the UK, the Netherlands*). БЕЗ артикля: одиночные горы (*Everest*), озера (*Lake Baikal*), города (*London*) и большинство стран (*Germany, France*).',
        '2. Музыкальные инструменты и группы',
        '*play **the** piano, play **the** guitar*. Группы людей: *the rich (богатые), the homeless (бездомные), the elderly (пожилые)*.',
        'Сводка географических артиклей', ['С артиклем THE', 'БЕЗ артикля (Zero article)'],
        [['Океаны, моря, реки: the Pacific, the Nile', 'Одиночные озера: Lake Michigan'],
         ['Горные цепи (мн. ч.): the Himalayas, the Alps', 'Одиночные вершины: Mount Fuji, Everest'],
         ['Страны-федерации: the United States, the UK', 'Обычные страны: Spain, Japan, Canada'],
         ['Музыкальные инструменты: play the guitar', 'Виды спорта: play football, play tennis']],
        [{'en': 'She plays the violin in the national orchestra.', 'ru': 'Она играет на скрипке в национальном оркестре.', 'note': 'play the violin'},
         {'en': 'We are planning a trip across the United States.', 'ru': 'Мы планируем поездку через Соединенные Штаты.', 'note': 'the United States'}],
        ['The перед обычными странами: ❌ the France -> ✅ France.',
         'Пропуск the перед горными цепями: ❌ Alps -> ✅ the Alps.']
    )

    add(76, 'Квантификаторы: A few / Few и A little / Little',
        'A FEW / A LITTLE означают «немного, но достаточно (позитивный оттенок)». FEW / LITTLE (без артикля "a") означают «мало, практически нет (негативный оттенок дефицита)».',
        '1. Исчисляемые vs Неисчисляемые',
        '**A few / few** — с исчисляемыми существительными во мн. числе (*friends, days, emails*). **A little / little** — с неисчисляемыми существительными (*money, time, patience*).',
        '2. Разница между "A few" и "Few"',
        '*I have **a few** friends (У меня есть несколько хороших друзей — мне хватает)*. *I have **few** friends (У меня мало друзей — я чувствую себя одиноко)*.',
        'Таблица A few / Few / A little / Little', ['Значение', 'Исчисляемые (Countable)', 'Неисчисляемые (Uncountable)'],
        [['Немного, но достаточно (+)', 'a few (a few friends)', 'a little (a little time)'],
         ['Мало, не хватает (-)', 'few (few friends)', 'little (little time)'],
         ['Достаточно много', 'plenty of / a lot of', 'plenty of / a lot of']],
        [{'en': 'I have a little time before the meeting, let\'s talk.', 'ru': 'У меня есть немного времени перед встречей, давай поговорим.', 'note': 'a little (достаточно для разговора)'},
         {'en': 'Unfortunately, very few people attended the conference.', 'ru': 'К сожалению, очень мало людей посетило конференцию.', 'note': 'few (недостаточно/мало)'}],
        ['Few с неисчисляемыми: ❌ few time -> ✅ little time.',
         'Путаница a little (позитивно) и little (критически мало).']
    )

    add(77, 'Слова-связки: Linking words (however/although/despite)',
        'Слова-связки повышают уровень речи: HOWEVER (однако), ALTHOUGH / EVEN THOUGH (хотя), DESPITE / IN SPITE OF (несмотря на).',
        '1. Синтаксис Although vs Despite',
        '**Although / Even though + подлежащее + глагол**: *Although it was raining, we went for a walk*. **Despite / In spite of + существительное / V-ing**: *Despite the rain, we went for a walk (не Despite of!).*',
        '2. Пунктуация с HOWEVER',
        '**However** обычно начинает новое предложение и выделяется запятой: *We faced technical issues. However, the launch was successful.*',
        'Слова-связки контраста', ['Связка', 'Грамматическая структура', 'Пример предложения'],
        [['Although / Even though', '+ Clause (Подлежащее + Глагол)', 'Although he was tired, he finished the code.'],
         ['Despite / In spite of', '+ Noun / V-ing (Существительное/герундий)', 'Despite being tired, he finished the code.'],
         ['However', 'В начале предложения с запятой', 'It was late. However, we continued working.']],
        [{'en': 'Despite the strict deadline, the team delivered a great product.', 'ru': 'Несмотря на жесткий дедлайн, команда выпустила отличный продукт.', 'note': 'Despite + существительное'},
         {'en': 'Although she was nervous, she gave a fantastic presentation.', 'ru': 'Хотя она нервничала, она блестяще провела презентацию.', 'note': 'Although + clause'}],
        ['Despite of: ❌ Despite of the rain -> ✅ Despite the rain (или In spite of the rain).',
         'Использование Although и But в одном предложении: ❌ Although it rained, but we went -> ✅ Although it rained, we went.']
    )

    add(78, 'Разделительные вопросы: Tag questions ("isn\'t it?", "don\'t you?")',
        'Разделительные вопросы («хвостики») переводятся как «не так ли? / правда?». Правило маятника: утвердительное предложение -> отрицательный хвостик; отрицательное предложение -> утвердительный хвостик.',
        '1. Формула построения хвостика',
        'В хвостик ставится вспомогательный глагол в противоположной форме + личное местоимение: *You are a developer, **aren\'t you**? She works here, **doesn\'t she**? You didn\'t call him, **did you**?*',
        '2. Особые исключения',
        '*I am right, **aren\'t I**? (не amn\'t I!). Let\'s go, **shall we**? Don\'t be late, **will you**?*',
        'Примеры разделительных вопросов', ['Основная часть', 'Хвостик (Tag)', 'Полное предложение', 'Перевод'],
        [['Утверждение (+)', 'Отрицательный (-)', 'You speak English, don\'t you?', 'Ты ведь говоришь по-английски, не так ли?'],
         ['Отрицание (-)', 'Утвердительный (+)', 'They haven\'t arrived yet, have they?', 'Они еще не приехали, правда?'],
         ['С модальным глаголом', 'Противоположный модальный', 'She can drive, can\'t she?', 'Она умеет водить, да?'],
         ['Исключение (I am)', 'aren\'t I?', 'I am early, aren\'t I?', 'Я рано, не так ли?']],
        [{'en': 'The meeting was very productive, wasn\'t it?', 'ru': 'Встреча была очень продуктивной, не так ли?', 'note': 'was -> wasn\'t it?'},
         {'en': 'You won\'t forget to send the file, will you?', 'ru': 'Ты ведь не забудешь отправить файл, правда?', 'note': 'won\'t -> will you?'}],
        ['Использование isn\'t it для всех предложений: ❌ You work here, isn\'t it? -> ✅ don\'t you?']
    )

    add(79, 'Образование и учеба (Education and studying)',
        'Лексикон академической сферы: graduate from university, take/pass an exam, major in, tuition fees, scholarship.',
        '1. Pass vs Take an exam',
        '*Take an exam* — просто сдавать экзамен (писать работу). *Pass an exam* — успешно сдать (получить положительную оценку). *Fail an exam* — провалить.',
        '2. Университетские термины',
        '*degree (диплом/степень), assignment (задание), deadline (срок сдачи), lecturer (преподаватель)*.',
        'Академический словарь', ['Выражение', 'Перевод', 'Пример фразы'],
        [['graduate from university', 'окончить университет', 'She graduated from Harvard in 2020.'],
         ['take / pass an exam', 'сдавать / успешно сдать экзамен', 'I took the test and passed with honors.'],
         ['major in computer science', 'специализироваться в CS', 'He is majoring in software engineering.']],
        [{'en': 'He won a full scholarship to study data science abroad.', 'ru': 'Он выиграл полную стипендию на изучение науки о данных за рубежом.', 'note': 'scholarship'}],
        ['Graduate university без предлога from: ❌ graduated university -> ✅ graduated from university.']
    )

    add(80, 'Технологии и интернет (Technology and the internet)',
        'Современный IT-словарь: artificial intelligence, cloud storage, cybersecurity, download/upload, bandwidth.',
        '1. Download vs Upload',
        '*Download* — скачивать из интернета на свое устройство. *Upload* — загружать с устройства на сервер/в облако.',
        '2. Компьютерные фразовые глаголы',
        '*log in / out (входить/выходить из системы), back up (делать резервную копию), wipe (стирать данные)*.',
        'IT и веб-терминология', ['Термин', 'Перевод', 'Пример в контексте'],
        [['cloud computing', 'облачные вычисления', 'We migrated our backend to cloud computing.'],
         ['cybersecurity threat', 'угроза кибербезопасности', 'Two-factor authentication protects against threats.'],
         ['back up data', 'создавать резервную копию', 'Always back up your code before refactoring.']],
        [{'en': 'Make sure to back up your database before running migrations.', 'ru': 'Обязательно сделайте резервную копию базы данных перед выполнением миграций.', 'note': 'back up'}],
        ['In the internet вместо on the internet: ❌ in the internet -> ✅ on the internet.']
    )

    add(81, 'Экология и окружающая среда (Environment and nature)',
        'Экологическая лексика: climate change, renewable energy, carbon footprint, pollution, recycle.',
        '1. Ключевые термины экологии',
        '*global warming (глобальное потепление), solar/wind power (солнечная/ветровая энергия), eco-friendly (экологичный)*.',
        '2. Защита природы',
        '*reduce waste (сокращать отходы), endangered species (исчезающие виды), sustainable living (устойчивый образ жизни)*.',
        'Экологический глоссарий', ['Понятие', 'Перевод', 'Пример предложения'],
        [['renewable energy', 'возобновляемая энергия', 'Solar and wind are key sources of renewable energy.'],
         ['carbon footprint', 'углеродный след', 'Using public transport reduces your carbon footprint.'],
         ['recycle waste', 'перерабатывать отходы', 'We recycle plastic and paper in our office.']],
        [{'en': 'Investing in renewable energy is crucial for combating climate change.', 'ru': 'Инвестиции в возобновляемую энергетику имеют решающее значение для борьбы с изменением климата.', 'note': 'renewable energy'}],
        ['Nature с артиклем the в общем значении: ❌ love the nature -> ✅ love nature.']
    )

    add(82, 'Чувства, эмоции и настроение (Feelings and emotions)',
        'Словарь эмоциональных состояний: anxious (тревожный), relieved (испытавший облегчение), overwhelmed (перегруженный), frustrated (разочарованный).',
        '1. Прилагательные на -ed и -ing',
        '**-ed** описывает то, что ЧУВСТВУЕТ человек (*I am bored, She is excited*). **-ing** описывает причину / свойство предмета (*The book is boring, The news is exciting*).',
        '2. Продвинутые эмоциональные состояния',
        '*thrilled (в восторге), exhausted (крайне уставший), grateful (благодарный)*.',
        'Эмоции и состояния', ['Прилагательное', 'Перевод', 'Пример контекста'],
        [['relieved', 'испытавший облегчение', 'I felt so relieved when I heard the test results.'],
         ['overwhelmed', 'перегруженный делами/эмоциями', 'He felt overwhelmed with all the sprint tasks.'],
         ['frustrated', 'раздраженный неудачей', 'She was frustrated because the bug kept reappearing.']],
        [{'en': 'I was thrilled to receive the job offer from London.', 'ru': 'Я был в полном восторге, получив предложение о работе из Лондона.', 'note': 'thrilled'}],
        ['I am boring вместо I am bored: ❌ I am boring -> означает "я скучный человек"! ✅ I am bored (мне скучно).']
    )

    add(83, 'Преступность и правосудие (Crime and law)',
        'Юридический и правовой словарь: commit a crime, witness, suspect, judge, jury, sentence, evidence.',
        '1. Субъекты и действия',
        '*commit a crime (совершить преступление), investigation (расследование), evidence (доказательства — неисчисляемое!), verdict (вердикт)*.',
        '2. Виды правонарушений',
        '*theft / thief (кража / вор), fraud (мошенничество), burglary (ограбление со взломом)*.',
        'Правовой глоссарий', ['Термин', 'Перевод', 'Пример фразы'],
        [['commit a crime', 'совершить преступление', 'The suspect denied committing any crime.'],
         ['crucial evidence', 'ключевые доказательства', 'The police discovered crucial evidence on the laptop.'],
         ['reach a verdict', 'вынести вердикт', 'The jury reached a unanimous guilty verdict.']],
        [{'en': 'The judge sentenced the hacker to three years in prison.', 'ru': 'Судья приговорил хакера к трем годам тюремного заключения.', 'note': 'sentenced to'}],
        ['Evidences во множественном числе: ❌ many evidences -> ✅ a lot of evidence (неисчисляемое).']
    )

    add(84, 'Деньги и личные финансы (Money and finance)',
        'Финансовый словарь: borrow vs lend, afford, invest in, mortgage, budget, interest rate.',
        '1. Borrow vs Lend',
        '**Borrow** — брать взаймы у кого-то (*Can I borrow your pen?*). **Lend** — одалживать кому-то свои деньги/вещи (*Can you lend me 20 dollars?*).',
        '2. Банковские термины',
        '*bank account (банковский счет), mortgage (ипотека [t немая!]), interest rate (процентная ставка), expense (расход)*.',
        'Финансовые концепции', ['Глагол / Термин', 'Перевод', 'Пример'],
        [['afford to buy', 'позволить себе купить', 'We cannot afford to waste company resources.'],
         ['borrow from / lend to', 'взять у / одолжить кому-то', 'He borrowed $500 from the bank.'],
         ['invest in stocks', 'инвестировать в акции', 'She invests 20% of her income in index funds.']],
        [{'en': 'They took out a mortgage to buy their first family house.', 'ru': 'Они взяли ипотеку, чтобы купить свой первый семейный дом.', 'note': 'mortgage [ˈmɔːɡɪdʒ]'}],
        ['Путаница borrow и lend: ❌ Lend me from you -> ✅ Can I borrow from you?']
    )

    add(85, 'Выражение личного мнения: Expressing opinions (I think/believe/in my view)',
        'Формулы выражения точки зрения в беседах и на деловых встречах: In my opinion, From my perspective, As far as I am concerned.',
        '1. Вводные фразы мнения',
        '*In my view (На мой взгляд)*, *From my perspective (С моей точки зрения)*, *Personally, I believe that (Лично я считаю, что)*, *To be honest (Честно говоря)*.',
        '2. Смягчение категоричности',
        '*It seems to me that (Мне кажется, что)*, *I tend to think that (Я склонен думать, что)*.',
        'Фразы выражения мнения', ['Уровень формальности', 'Фраза', 'Пример предложения'],
        [['Разговорный', 'In my opinion, ...', 'In my opinion, this framework is easier to learn.'],
         ['Деловой', 'From my perspective, ...', 'From my perspective, we should focus on stability.'],
         ['Академический', 'It is widely believed that...', 'It is widely believed that remote work boosts output.']],
        [{'en': 'As far as I am concerned, quality should never be compromised for speed.', 'ru': 'Что касается меня, качеством никогда нельзя жертвовать ради скорости.', 'note': 'As far as I am concerned'}],
        ['According to me: ❌ According to me -> ✅ In my opinion (according to используется только о других источниках!).']
    )

    add(86, 'Согласие и несогласие: Agreeing and disagreeing',
        'Дипломатичные формулы вежливой дискуссии: I couldn\'t agree more, That\'s a valid point, but..., I am afraid I disagree.',
        '1. Полное согласие',
        '*I totally agree with you (Полностью согласен)*, *I couldn\'t agree more (Не могу не согласиться)*, *Exactly! / Absolutely!*',
        '2. Вежливое частичное несогласие',
        '*You have a point, but... (В твоих словах есть смысл, но...)*, *I see what you mean, however... (Я понимаю, о чем ты, однако...)*.',
        'Шкала согласия и несогласия', ['Позиция', 'Английская фраза', 'Перевод'],
        [['100% Согласие', 'I couldn\'t agree more.', 'Полностью согласен с вами.'],
         ['Частичное согласие', 'That\'s a valid point, but we need to consider costs.', 'Это весомый довод, но нужно учесть затраты.'],
         ['Вежливое несогласие', 'I am afraid I see it differently.', 'Боюсь, я смотрю на это иначе.']],
        [{'en': 'I see your point, but we don\'t have enough resources right now.', 'ru': 'Я понимаю вашу точку зрения, но у нас сейчас недостаточно ресурсов.', 'note': 'Вежливое возражение'}],
        ['I am agree: ❌ I am agree -> ✅ I agree (agree — это глагол, а не прилагательное!).']
    )

    add(87, 'Как подать жалобу или рекламацию: Making complaints',
        'Формулы вежливого выражения недовольства сервисом или товаром: I am writing to complain about..., There seems to be an issue with...',
        '1. Вежливый тон претензии',
        'Вместо агрессивного "This is terrible" используют: *I am afraid there is a problem with my order*, *I am not satisfied with the quality of service*.',
        '2. Требование решения проблемы',
        '*I would appreciate a prompt refund / replacement (Буду признателен за оперативный возврат/замену).*',
        'Фразы рекламации', ['Ситуация', 'Вежливая фраза жалобы', 'Ожидаемое решение'],
        [['Бракованный товар', 'The item arrived damaged.', 'I would like a replacement.'],
         ['Задержка доставки', 'My delivery is three days overdue.', 'Could you check the status?'],
         ['Некорректный счет', 'There seems to be an overcharge on my bill.', 'Please issue a refund for the difference.']],
        [{'en': 'I am writing to express my dissatisfaction with the recent service outage.', 'ru': 'Я пишу, чтобы выразить свое неудовлетворение недавним сбоем в обслуживании.', 'note': 'Официальная жалоба'}],
        ['Слишком эмоциональный тон: формулируйте проблему через факты и конструкции вежливости.']
    )

    add(88, 'Как рассказать историю или анекдот: Telling a story / anecdote',
        'Приемы сторителлинга: завязка (It all started when...), кульминация (To my surprise...), развязка (In the end...).',
        '1. Структура живой истории',
        '1) **Hook / Введение**: *You won\'t believe what happened to me yesterday!* 2) **Background / Фон**: *I was walking through the station when...* 3) **Climax**: *Suddenly, out of nowhere...* 4) **Conclusion**: *To cut a long story short...*',
        '2. Привлечение внимания слушателя',
        '*Guess what? (Угадай что?)*, *The funny thing was that... (Самое забавное было в том, что...)*.',
        'Фразы сторителлинга', ['Этап рассказа', 'Фраза', 'Пример'],
        [['Завязка', 'You won\'t believe this, but...', 'You won\'t believe who I met today.'],
         ['Поворот сюжета', 'All of a sudden / Out of the blue', 'Out of the blue, my phone rang.'],
         ['Итог истории', 'To cut a long story short, ...', 'To cut a long story short, we got the contract!']],
        [{'en': 'To cut a long story short, we managed to fix the server before the client noticed.', 'ru': 'Короче говоря, нам удалось починить сервер до того, как клиент заметил.', 'note': 'To cut a long story short'}],
        ['Монотонное повторение "and then... and then": используйте связки *meanwhile, suddenly, after a while*.']
    )

    add(89, 'Как дать совет: Giving advice (If I were you, You had better, Why don\'t you)',
        'Градации советов: дружеский совет (Why don\'t you / You should), совет эксперта (If I were in your shoes), строгое предупреждение (You had better).',
        '1. Конструкция "You had better + V1"',
        '**Had better + V1 (без to!)** выражает совет-предупреждение с риском негативных последствий: *You\'d better leave now or you\'ll miss the train (Тебе лучше уйти прямо сейчас, иначе опоздаешь)*.',
        '2. Мягкие советы',
        '*Have you considered taking a course?*, *It might be a good idea to consult a specialist.*',
        'Формулы советов', ['Степень настоятельности', 'Формула', 'Пример', 'Перевод'],
        [['Мягкий совет', 'It might be worth + V-ing', 'It might be worth checking the logs.', 'Возможно, стоит проверить логи.'],
         ['Дружеский совет', 'If I were you, I would...', 'If I were you, I would take the job.', 'На твоем месте я бы взял работу.'],
         ['Строгий совет / Предостережение', 'You had better (You\'d better) + V1', 'You\'d better save your work right now.', 'Тебе лучше сохранить работу прямо сейчас.']],
        [{'en': 'You had better double-check the configuration before deploying to production.', 'ru': 'Тебе лучше дважды проверить конфигурацию перед деплоем в прод.', 'note': 'had better + V1'}],
        ['Частица to после had better: ❌ You had better to check -> ✅ You had better check.']
    )

    add(11253, 'Фразовые глаголы общения и эмоций (bring up, get along, break up, count on)',
        'Продвинутые фразовые глаголы сферы отношений: get along with (ладить), bring up (поднимать тему/воспитывать), count on (рассчитывать на кого-то), let down (подводить).',
        '1. Топ глаголов B1',
        '*get along with (ладить с людьми), bring up a topic (поднять вопрос на встрече), count on someone (полагаться на кого-то), look up to (уважать/брать пример), figure out (разобраться/понять)*.',
        '2. Разделяемые и неразделяемые глаголы',
        'Некоторые глаголы разделяются местоимением: *let me down (подвести меня), figure it out (разобраться в этом)*.',
        'Фразовые глаголы отношений', ['Глагол', 'Значение', 'Пример предложения', 'Перевод'],
        [['get along with', 'ладить, иметь хорошие отношения', 'I get along very well with my colleagues.', 'Я отлично лажу со своими коллегами.'],
         ['bring up', 'поднять тему, упомянуть вопрос', 'Don\'t bring up the budget issue during the call.', 'Не поднимай вопрос бюджета во время звонка.'],
         ['count on', 'рассчитывать, полагаться на кого-то', 'You can always count on me for support.', 'Ты всегда можешь рассчитывать на мою поддержку.'],
         ['figure out', 'разобраться, найти решение', 'We need to figure out why the app crashed.', 'Нам нужно понять, почему приложение упало.']],
        [{'en': 'I knew I could count on you to deliver on time.', 'ru': 'Я знал, что могу рассчитывать на тебя в плане своевременной сдачи.', 'note': 'count on'}],
        ['Добавление лишнего предлога: ❌ count with you -> ✅ count on you.']
    )

    add(11254, 'Различия: Used to vs Would vs Be used to vs Get used to',
        'Фундаментальная разница между привычками в прошлом (Used to / Would) и состоянием привыкания в настоящем (Be used to / Get used to + V-ing).',
        '1. Used to vs Be used to',
        '**Used to + V1** = раньше делал в прошлом (*I used to live in Madrid*). **Be used to + V-ing** = привык к чему-то в настоящем (*I am used to waking up early*). **Get used to + V-ing** = процесс привыкания (*I am getting used to the new keyboard*).',
        '2. Форма после Be used to',
        'После *be used to* и *get used to* ВСЕГДА идет существительное или **герундий с -ing** (так как "to" здесь — предлог направления привычки)!',
        'Сравнительная матрица Used to', ['Конструкция', 'Значение', 'Форма глагола', 'Пример'],
        [['used to + V1', 'Раньше делал в прошлом (сейчас нет)', 'Инфинитив (V1)', 'I used to drink coffee, but now I drink tea.'],
         ['would + V1', 'Повторял действие в прошлом', 'Инфинитив (V1)', 'We would visit our grandparents every summer.'],
         ['be used to + V-ing', 'Привык к чему-то в настоящем', 'Герундий (-ing) / Noun', 'I am used to working in a fast-paced environment.'],
         ['get used to + V-ing', 'Привыкаю (процесс адаптации)', 'Герундий (-ing) / Noun', 'You will soon get used to driving on the left.']],
        [{'en': 'I am used to working remotely across different time zones.', 'ru': 'Я привык работать удаленно в разных часовых поясах.', 'note': 'be used to + working (-ing)'},
         {'en': 'It took me a month to get used to the new design.', 'ru': 'Мне потребовался месяц, чтобы привыкнуть к новому дизайну.', 'note': 'get used to + noun'}],
        ['Инфинитив после be used to: ❌ I am used to wake up early -> ✅ I am used to waking up early.',
         'Путаница used to (прошлое) и be used to (настоящая привычка).']
    )

    add(11255, 'Различия в синтаксисе: American vs British syntax (have got, tenses, prepositions)',
        'Грамматические различия US и UK: глагол have got против have, употребление Present Perfect против Past Simple со словами just/already, и предлоги (at the weekend vs on the weekend).',
        '1. Have got vs Have',
        'В британском (UK) чаще говорят: *Have you got a car? I haven\'t got time*. В американском (US): *Do you have a car? I don\'t have time*.',
        '2. Времена со словами Just, Already, Yet',
        'В UK со словами *just/already/yet* строго требуют **Present Perfect**: *I have just eaten*. В US допустим **Past Simple**: *I just ate* или *Did you do it yet?*.',
        'Синтаксис US vs UK', ['Сфера', 'British English (UK)', 'American English (US)'],
        [['Владение предметом', 'I have got a question. / Have you got...?', 'I have a question. / Do you have...?'],
         ['Слова just / already', 'I have just seen him. (Present Perfect)', 'I just saw him. (Past Simple)'],
         ['Выходные дни', 'at the weekend', 'on the weekend'],
         ['Коллективные существительные', 'The team ARE playing well. (мн. ч.)', 'The team IS playing well. (ед. ч.)']],
        [{'en': 'UK: I\'ve just lost my keys. / US: I just lost my keys.', 'ru': 'Я только что потерял ключи.', 'note': 'Контраст времен US vs UK'}],
        ['Смешивание стилей: старайтесь последовательно придерживаться американской или британской грамматической нормы в деловой переписке.']
    )

    # =========================================================================
    # B2 (Topics 90 - 117, 11256, 11257, 11258)
    # =========================================================================
    add(90, 'Third Conditional: Третий тип условных предложений (Сожаление о прошлом)',
        'Third Conditional описывает нереальные события в ПРОШЛОМ, которые уже невозможно изменить («Если бы тогда... то тогда бы...»). Формула: If + had + V3, would have + V3.',
        '1. Формула Third Conditional',
        'Формула: **If + Past Perfect (had + V3), would have + V3**. Например: *If I had studied harder, I would have passed the exam (Если бы я тогда учился усерднее, я бы сдал тот экзамен).*',
        '2. Модальные варианты (could have / might have)',
        'Вместо would have можно использовать **could have** (смог бы) или **might have** (возможно, сделал бы): *If we had taken a taxi, we might have arrived on time.*',
        'Все 3 типа условных предложений', ['Тип', 'Время ситуации', 'Формула', 'Пример'],
        [['1st', 'Будущее (реально)', 'If + Present, will + V1', 'If it rains, I will stay home.'],
         ['2nd', 'Настоящее (воображаемо)', 'If + Past, would + V1', 'If I had time, I would help.'],
         ['3rd', 'Прошлое (не изменить)', 'If + had V3, would have V3', 'If I had known, I would have come.']],
        [{'en': 'If we had left earlier, we wouldn\'t have missed the flight.', 'ru': 'Если бы мы выехали раньше, мы бы не опоздали на рейс.', 'note': 'Сожаление о прошлом'},
         {'en': 'She would have won if she hadn\'t made that mistake.', 'ru': 'Она бы победила, если бы не совершила ту ошибку.', 'note': 'Third Conditional'}],
        ['Would have в части с if: ❌ If I would have known -> ✅ If I had known.',
         'Забывание have: ❌ I would passed -> ✅ I would have passed.']
    )

    add(91, 'Смешанные условные предложения: Mixed Conditionals',
        'Mixed Conditionals объединяют условие из прошлого с результатом в настоящем (или наоборот: постоянную черту характера с событием в прошлом).',
        '1. Тип 1: Прошлое условие -> Настоящий результат (Type 3 + Type 2)',
        'Формула: **If + had + V3, would + V1**. *If I had won the lottery yesterday (прошлое), I would be rich today (настоящее).*',
        '2. Тип 2: Постоянное свойство -> Прошлый результат (Type 2 + Type 3)',
        'Формула: **If + Past Simple, would have + V3**. *If I spoke fluent French (постоянный навык), I would have applied for that job last month (действие в прошлом).*',
        'Типы Mixed Conditionals', ['Схема', 'Формула', 'Пример предложения', 'Перевод'],
        [['Прошлое -> Настоящее', 'If + had V3, would + V1', 'If I had taken the job, I would live in London now.', 'Если бы я принял ту работу, я бы жил в Лондоне сейчас.'],
         ['Настоящее -> Прошлое', 'If + Past Simple, would have V3', 'If I weren\'t afraid of flying, I would have traveled with you.', 'Если бы я не боялся летать (вообще), я бы полетел с тобой тогда.']],
        [{'en': 'If you had listened to my advice yesterday, you wouldn\'t be in trouble now.', 'ru': 'Если бы ты послушал мой совет вчера, ты бы не был в беде сейчас.', 'note': 'Past condition -> Present result'}],
        ['Использование would have в части с if: ❌ If I would have learned -> ✅ If I had learned.']
    )

    add(92, 'Конструкции сожаления и желаний: Wish / If only',
        'WISH и IF ONLY используются для выражения сожаления о том, что всё не так, как хотелось бы. Времена сдвигаются на шаг назад: о настоящем — Past Simple, о прошлом — Past Perfect.',
        '1. Сожаление о настоящем (Wish + Past Simple)',
        'Когда мы хотим изменить текущее положение дел: **I wish I had more free time** (Жаль, что у меня мало свободного времени). **I wish I were taller**.',
        '2. Сожаление о прошлом (Wish + Past Perfect)',
        'Когда мы сожалеем о совершенном поступке в прошлом: **I wish I hadn\'t bought this car** (Жаль, что я купил эту машину тогда).',
        'Сетка конструкций I wish', ['Тип желания', 'Формула', 'Пример', 'Истинный смысл'],
        [['О настоящем', 'Wish + Past Simple', 'I wish I spoke fluent German.', 'I don\'t speak fluent German.'],
         ['О прошлом (сожаление)', 'Wish + Past Perfect', 'I wish I had accepted the offer.', 'I didn\'t accept the offer.'],
         ['Раздражение на действие', 'Wish + would + V1', 'I wish it would stop raining.', 'It is raining and annoying me.']],
        [{'en': 'I wish I knew the answer to this question.', 'ru': 'Жаль, что я не знаю ответа на этот вопрос.', 'note': 'Wish + Past Simple'},
         {'en': 'If only I had listened to your advice!', 'ru': 'Если бы только я послушал твой совет тогда!', 'note': 'If only + Past Perfect'}],
        ['Использование Present после wish о настоящем: ❌ I wish I have a car -> ✅ I wish I had a car.',
         'Использование I wish I would о себе: с местоимением I/we говорят *I wish I could*.']
    )

    add(93, 'Past Perfect: Предпрошедшее время (had + V3)',
        'Past Perfect выражает действие, которое произошло и завершилось РАНЬШЕ другого события в прошлом: When I arrived, the train had already left.',
        '1. Образование и логика времени',
        'Формула: **had + 3-я форма глагола (V3 / -ed)** для всех лиц. Past Perfect используется для наведения хронологического порядка: то, что произошло раньше всего — в Past Perfect, а более позднее событие — в Past Simple.',
        '2. Маркеры времени',
        '*before, after, by the time (к тому моменту как), already, never before*. Например: *By the time police arrived, the burglar had escaped.*',
        'Хронология: Past Perfect vs Past Simple', ['Событие 1 (Самое раннее)', 'Событие 2 (Позже)', 'Результирующее предложение'],
        [['He booked a table (18:00)', 'They arrived at cafe (19:00)', 'He had booked a table before they arrived.'],
         ['She finished work (17:00)', 'I called her (17:30)', 'When I called, she had already finished work.']],
        [{'en': 'When I got to the station, the train had already departed.', 'ru': 'Когда я добрался до вокзала, поезд уже уехал.', 'note': 'Уехал ДО моего прибытия'},
         {'en': 'She had never seen the ocean before she visited Portugal.', 'ru': 'Она никогда раньше не видела океан, пока не побывала в Португалии.', 'note': 'Опыт до момента в прошлом'}],
        ['Использование Past Perfect без связи с другим событием в прошлом: Past Perfect нужен только для сопоставления двух моментов в прошлом!',
         'Путаница had и have: ❌ When I arrived he has left -> ✅ he had left.']
    )

    add(94, 'Past Perfect Continuous: Длительность до момента в прошлом (had been + V-ing)',
        'Past Perfect Continuous выражает длительное действие, которое началось в прошлом и продолжалось до определенного момента в прошлом (часто с видимым результатом).',
        '1. Формула и употребление',
        'Формула: **had been + V-ing** (для всех лиц). Например: *He was exhausted because he **had been driving** for eight hours (Он был истощен, потому что вел машину 8 часов подряд)*.',
        '2. Сравнение с Past Continuous',
        'Past Continuous описывает действие в момент прошлого (*At 5 PM I was working*). Past Perfect Continuous подчеркивает **длительность к моменту** (*By 5 PM I had been working for 6 hours*).',
        'Past Perfect Continuous vs Past Continuous', ['Время', 'Акцент', 'Формула', 'Пример'],
        [['Past Perfect Continuous', 'Длительность до момента (Как долго?)', 'had been + V-ing', 'The ground was wet because it had been raining all night.'],
         ['Past Continuous', 'Процесс в момент речи в прошлом', 'was/were + V-ing', 'When I looked out, it was raining.']],
        [{'en': 'We had been discussing the architecture for three hours before reaching a consensus.', 'ru': 'Мы обсуждали архитектуру три часа, прежде чем пришли к консенсусу.', 'note': 'had been discussing + for 3 hours'}],
        ['Использование have been вместо had been: ❌ When she arrived I have been waiting -> ✅ had been waiting.']
    )

    add(95, 'Future Continuous: Будущее длительное время (will be + V-ing)',
        'Future Continuous выражает действие, которое будет длиться в определенный точный момент в будущем: At this time tomorrow, I will be flying to Tokyo.',
        '1. Образование и сферы применения',
        'Формула: **will be + V-ing**. 1) Действие в точный момент будущего (*Tomorrow at 10 AM I will be having a job interview*). 2) Вежливый вопрос о чьих-то планах (*Will you be using your laptop later?*).',
        '2. Утверждения, отрицания и вопросы',
        'Утверждение: *I will be working*. Отрицание: *I won\'t be working*. Вопрос: *Will you be working?*',
        'Сравнение Future Continuous и Future Simple', ['Время', 'Суть', 'Пример', 'Перевод'],
        [['Future Continuous', 'Процесс в точный момент будущего', 'At 8 PM tonight, I will be watching the game.', 'В 20:00 сегодня я буду смотреть матч (буду в процессе).'],
         ['Future Simple', 'Факт / спонтанное решение', 'I will watch the game tonight.', 'Я посмотрю матч сегодня.']],
        [{'en': 'Don\'t call me between 2 and 4 PM, I will be conducting interviews.', 'ru': 'Не звони мне с 14 до 16, я буду проводить собеседования.', 'note': 'will be conducting'}],
        ['Пропуск глагола be: ❌ I will working -> ✅ I will be working.']
    )

    add(96, 'Future Perfect: Будущее совершенное время (will have + V3)',
        'Future Perfect выражает действие, которое завершится К определенному моменту в будущем (со словом BY / BY THE TIME).',
        '1. Формула и маркеры времени',
        'Формула: **will have + 3-я форма глагола (V3 / -ed)**. Ключевые маркеры: **by tomorrow, by 5 PM, by next year, by the time you arrive**.',
        '2. Пример ситуации дедлайна',
        '*By next Friday, we **will have launched** the new mobile update (К следующей пятнице мы уже завершим запуск обновления).*',
        'Времена Future: Simple vs Continuous vs Perfect', ['Время', 'Фокус', 'Формула', 'Пример с 18:00'],
        [['Future Simple', 'Факт старта / решение', 'will + V1', 'I will start cooking at 18:00.'],
         ['Future Continuous', 'Процесс в 18:00', 'will be + V-ing', 'At 18:00, I will be cooking dinner.'],
         ['Future Perfect', 'Завершение К 18:00', 'will have + V3', 'By 18:00, I will have cooked dinner.']],
        [{'en': 'By the time you graduate, you will have mastered English.', 'ru': 'К тому моменту как ты закончишь учебу, ты овладеешь английским в совершенстве.', 'note': 'will have mastered + by the time'}],
        ['Использование will в части с by the time: ❌ By the time you will arrive -> ✅ By the time you arrive, I will have finished.']
    )

    add(97, 'Пассивный залог во всех временах: Passive Voice (All tenses)',
        'Сводная система пассивного залога во всех грамматических временах: Present/Past Continuous Passive, Present/Past Perfect Passive, Modal Passive.',
        '1. Универсальная формула пассива',
        'Формула: **BE (в соответствующем времени) + 3-я форма глагола (V3 / -ed)**.',
        '2. Таблица всех времен в пассиве',
        'Continuous Passive требует связки **being**: *is being built, was being repaired*. Perfect Passive требует связки **been**: *has been developed, had been tested*. Модальный пассив: **modal + be + V3** (*must be done, should be sent*).',
        'Сводка Passive Voice по всем временам', ['Время', 'Формула пассива', 'Пример предложения', 'Перевод'],
        [['Present Continuous Passive', 'am/is/are + being + V3', 'The server is being upgraded right now.', 'Сервер сейчас обновляется.'],
         ['Past Continuous Passive', 'was/were + being + V3', 'The bridge was being repaired last month.', 'Мост ремонтировался в прошлом месяце.'],
         ['Present Perfect Passive', 'have/has + been + V3', 'The bug has already been fixed.', 'Баг уже исправлен.'],
         ['Past Perfect Passive', 'had + been + V3', 'The file had been deleted before we noticed.', 'Файл был удален до того, как мы заметили.'],
         ['Modal Passive', 'modal + be + V3', 'This code must be reviewed by the lead.', 'Этот код должен быть проверен тимлидом.']],
        [{'en': 'The feature is currently being tested by the QA engineers.', 'ru': 'Функционал в данный момент тестируется инженерами по качеству.', 'note': 'is being tested'}],
        ['Пропуск being в Continuous Passive: ❌ The house is repairing -> ✅ The house is being repaired.']
    )

    add(98, 'Косвенная речь продвинутого уровня: Reported Speech with reporting verbs',
        'Продвинутая косвенная речь использует специальные глаголы-индикаторы вместо скучного say/tell: encourage, warn, apologize for, refuse, suggest, admit, convince.',
        '1. Группы глаголов по структурам',
        '1) **Verb + to V1**: *agree, offer, promise, refuse, threaten* (*He offered to help*). 2) **Verb + Object + to V1**: *advise, convince, encourage, remind, warn* (*She advised me to invest*). 3) **Verb + -ing**: *admit, deny, suggest, recommend* (*He admitted making a mistake*). 4) **Verb + preposition + -ing**: *apologize for, insist on* (*He apologized for being late*).',
        '2. Особенности глаголов suggest и recommend',
        'Глаголы *suggest* и *recommend* требуют герундия (*suggest doing*) или придаточного предложения с should (*suggest that we should do*), но никогда не сочетаются с инфинитивом (*не suggest to do*)!',
        'Продвинутые вводные глаголы', ['Глагол', 'Синтаксическая модель', 'Пример предложения', 'Перевод'],
        [['advise / warn', 'verb + obj + to V1', 'The doctor advised him to stop smoking.', 'Врач посоветовал ему бросить курить.'],
         ['refuse / offer', 'verb + to V1', 'He refused to disclose the details.', 'Он отказался раскрывать детали.'],
         ['admit / deny', 'verb + V-ing', 'She denied leaking the internal documents.', 'Она отрицала утечку внутренних документов.'],
         ['apologize for', 'verb + for + V-ing', 'The company apologized for the outage.', 'Компания извинилась за сбой.']],
        [{'en': 'The CEO convinced the board to invest in AI infrastructure.', 'ru': 'Генеральный директор убедил совет директоров инвестировать в инфраструктуру ИИ.', 'note': 'convinced + board + to invest'}],
        ['Неправильный предлог после apologize: ❌ apologized about being late -> ✅ apologized for being late.']
    )

    add(99, 'Неограничительные определительные придаточные: Non-defining relative clauses',
        'Non-defining relative clauses дают ДОПОЛНИТЕЛЬНУЮ (необязательную) информацию о предмете или человеке. Они ВСЕГДА выделяются запятыми, и в них ЗАПРЕЩЕНО использовать слово THAT!',
        '1. Запятые и запрет на THAT',
        'Если информацию можно удалить без потери смысла: *My brother, **who lives in New York**, is a designer*. Запятые обязательны! Вместо who/which нельзя ставить that (*My brother, that lives... — грубая ошибка!*).',
        '2. Which со ссылкой на все предыдущее предложение',
        '*He passed the exam on the first attempt, **which surprised everyone** (Он сдал экзамен с первой попытки, что удивило всех).*',
        'Defining vs Non-defining', ['Тип', 'Смысл', 'Запятые', 'Слово THAT', 'Пример'],
        [['Defining (Ограничительное)', 'Критическая информация для идентификации', 'НЕТ', 'Разрешено (who/which/that)', 'The employees who work remotely love flexibility.'],
         ['Non-defining (Описательное)', 'Дополнительный второстепенный факт', 'ОБЯЗАТЕЛЬНО', 'ЗАПРЕЩЕНО (только who/which)', 'Apple, which was founded in 1976, released a new chip.']],
        [{'en': 'London, which is the capital of the UK, attracts millions of tourists.', 'ru': 'Лондон, который является столицей Великобритании, привлекает миллионы туристов.', 'note': 'Non-defining с запятыми'}],
        ['Использование that с запятыми в Non-defining: ❌ London, that is capital -> ✅ London, which is capital.']
    )

    add(100, 'Каузативные конструкции: Have / Get something done',
        'Каузатив Have something done используется, когда мы не сами выполняем действие, а делегируем его специалисту (подстричь волосы, починить машину, покрасить стены).',
        '1. Формула каузатива',
        'Формула: **HAVE / GET + предмет + 3-я форма глагола (V3 / -ed)**. Например: *I cut my hair* = я сам взял ножницы и подстригся. *I had my hair cut* = парикмахер подстриг меня в салоне.',
        '2. Времена в каузативных конструкциях',
        'Сам глагол HAVE / GET меняется по временам: *Present Simple: I have my car washed; Past Simple: I had my car washed yesterday; Future: I will have my car washed.*',
        'Примеры каузатива в разных временах', ['Время', 'Формула', 'Пример', 'Смысл'],
        [['Present Simple', 'have/get + obj + V3', 'I have my eyes tested every year.', 'Окулист проверяет мне зрение.'],
         ['Past Simple', 'had/got + obj + V3', 'We had our roof repaired.', 'Мастера починили нам крышу.'],
         ['Present Continuous', 'am/is/are having + obj + V3', 'She is having her apartment painted.', 'Ей сейчас красят квартиру.']],
        [{'en': 'I need to have my passport renewed before the trip.', 'ru': 'Мне нужно обновить загранпаспорт (в паспортном столе) перед поездкой.', 'note': 'have + passport + renewed'},
         {'en': 'Where did you get your laptop fixed?', 'ru': 'Где тебе починили ноутбук?', 'note': 'get + laptop + fixed'}],
        ['Путаница "I repaired my car" (сам чинил) и "I had my car repaired" (в автосервисе).',
         'Неверный порядок слов: ❌ I had repaired my car -> это Past Perfect! ✅ I had my car repaired.']
    )

    add(101, 'Инверсия с отрицательными наречиями (Negative Inversion)',
        'Инверсия (обратный порядок слов как в вопросе) используется для усиления выразительности и драматизма речи при вынесении отрицательных наречий в начало предложения.',
        '1. Формула отрицательной инверсии',
        'Когда предложение начинается с *Never, Seldom, Rarely, Hardly, Scarcely, Little, Under no circumstances*, вспомогательный глагол ставится ПЕРЕД подлежащим: **Отрицательное слово + Вспомогательный глагол + Подлежащее + Основной глагол**.',
        '2. Конструкция Hardly... when / No sooner... than',
        '*No sooner had I arrived at the station than the train left (Не успел я прибыть на вокзал, как поезд ушел).*',
        'Трансформация предложений с инверсией', ['Обычный порядок', 'Стилистическая инверсия', 'Перевод'],
        [['I have never seen such beauty.', 'Never have I seen such beauty.', 'Никогда в жизни я не видел такой красоты.'],
         ['She rarely complains.', 'Rarely does she complain.', 'Редко когда она жалуется.'],
         ['He little knew the truth.', 'Little did he know the truth.', 'Меньше всего он знал правду.']],
        [{'en': 'Under no circumstances should you share your password.', 'ru': 'Ни при каких обстоятельствах вам не следует делиться паролем.', 'note': 'Инверсия should you'},
         {'en': 'Seldom have we witnessed such outstanding teamwork.', 'ru': 'Редко когда мы были свидетелями столь выдающейся командной работы.', 'note': 'Seldom have we'}],
        ['Прямой порядок слов после отрицательного маркера в начале: ❌ Never I have seen -> ✅ Never have I seen.',
         'Путаница than и when: No sooner требует **than**, а Hardly — **when**.']
    )

    add(102, 'Причастные обороты в английском: Participle clauses (-ing and -ed)',
        'Причастные обороты позволяют объединить два предложения в одно компактное и стильное высказывание, заменяя союзы when, because, after.',
        '1. Present Participle (-ing) для активного залога',
        'Заменяет активное действие (*because / when*): *Feeling exhausted, he went to bed early (= Because he felt exhausted)*. *Walking down the street, I ran into an old friend.*',
        '2. Past Participle (-ed / V3) и Having Done',
        'Для пассивного значения: *Built in 1889, the Eiffel Tower is iconic*. Для предшествующего действия: *Having finished the project, the team celebrated.*',
        'Типы причастных оборотов', ['Тип оборота', 'Форма', 'Пример предложения', 'Исходный эквивалент'],
        [['Present Participle', 'V-ing', 'Opening the envelope, she found a letter.', 'When she opened the envelope...'],
         ['Past Participle', 'V3 / -ed (пассив)', 'Shocked by the news, he couldn\'t speak.', 'Because he was shocked by the news...'],
         ['Perfect Participle', 'Having + V3', 'Having saved enough money, they bought a house.', 'After they had saved enough money...']],
        [{'en': 'Having passed all code reviews, the pull request was merged.', 'ru': 'Пройдя все ревью кода, пулл-реквест был смержен.', 'note': 'Having passed'}],
        ['Dangling participle (висячее причастие, относящееся не к тому подлежащему): ❌ Walking down the street, the rain started -> ✅ Walking down the street, I got caught in the rain.']
    )

    add(103, 'Модальная дедукция в прошлом: Modals of deduction (must have, can\'t have, might have + V3)',
        'Модальные глаголы с перфектным инфинитивом (have + V3) выражают догадки и дедуктивные выводы о событиях в ПРОШЛОМ.',
        '1. Степень уверенности в прошлом',
        '**MUST HAVE + V3** = 99% уверенность («должно быть, точно сделал»): *He must have forgotten his keys*. **CAN\'T / COULDN\'T HAVE + V3** = 99% невозможность («не мог этого сделать»): *He can\'t have stolen the money, he was with me*. **MIGHT / MAY / COULD HAVE + V3** = 40% вероятность («возможно, сделал»): *She might have missed the bus*.',
        '2. Should have + V3 (Критика и сожаление)',
        '**SHOULD HAVE + V3** выражает упрек или сожаление («следовало сделать, но не сделал»): *You should have called me!*',
        'Дедукция о событиях в прошлом', ['Модальная конструкция', 'Уверенность о прошлом', 'Пример предложения', 'Перевод'],
        [['must have + V3', '99% уверенность (+)', 'The streets are wet; it must have rained overnight.', 'Улицы мокрые; ночью точно шел дождь.'],
         ['can\'t have + V3', '99% невозможность (-)', 'He can\'t have written this code, he doesn\'t know Rust.', 'Он не мог написать этот код.'],
         ['might have + V3', '40% вероятность', 'I might have left my wallet in the car.', 'Возможно, я оставил кошелек в машине.'],
         ['should have + V3', 'Сожаление / упрек', 'We should have booked the tickets in advance.', 'Нам следовало забронировать билеты заранее.']],
        [{'en': 'She can\'t have known about the surprise party, nobody told her.', 'ru': 'Она не могла знать о вечеринке-сюрпризе, никто ей не говорил.', 'note': 'can\'t have known'}],
        ['Использование must not have для невозможности: ❌ He must not have seen it -> ✅ He can\'t have seen it.']
    )

    add(104, 'Нулевой артикль: Zero article (продвинутые случаи)',
        'Случаи, когда артикль (a/an/the) строго ЗАПРЕЩЕН: абстрактные понятия, материалы, приемы пищи, учреждения по назначению (school, hospital, prison, church).',
        '1. Учреждения по их прямому назначению',
        'Если человек находится в учреждении по его основной функции, артикль НЕ ставится: *He is in prison (как заключенный), She went to hospital (как пациентка), Children go to school (учиться)*. Если прийти как посетитель — ставится **THE**: *I went to **the** school to meet the teacher.*',
        '2. Языки, спорт, транспорт и абстракции',
        '*English (но the English language), play tennis, travel by plane, love, life, science*.',
        'Zero article vs The', ['Категория', 'БЕЗ артикля (Zero article)', 'С артиклем THE (конкретика)'],
        [['Учреждения (прямая цель)', 'in hospital (на лечении), in bed (спать)', 'in the hospital (в здании больницы)'],
         ['Приемы пищи', 'have breakfast, before lunch', 'The breakfast at the hotel was great.'],
         ['Абстрактные понятия', 'Life is unpredictable. Love is strong.', 'The life of Steve Jobs.'],
         ['Транспорт с предлогом by', 'by bus, by train, by air', 'on the bus, in the car']],
        [{'en': 'He was sent to prison for financial fraud.', 'ru': 'Его отправили в тюрьму (как преступника) за финансовое мошенничество.', 'note': 'to prison без артикля'}],
        ['Артикль перед видами спорта и языками: ❌ I play the basketball -> ✅ I play basketball.']
    )

    add(105, 'Эмфатические расщепленные предложения: Cleft sentences (It is... that / What I need is...)',
        'Cleft sentences (расщепленные предложения) служат для сильного логического ударения и выделения ключевой информации в предложении.',
        '1. Конструкция "It is / It was... that/who"',
        'Формула: **It is / was + выделяемое слово + that / who + остальная часть**. Например: Обычное: *Alex solved the problem*. Эмфатическое: *It was **Alex who** solved the problem (Именно Алекс решил проблему!)*.',
        '2. WH-clefts (What I... is...)',
        'Формула: **What... is / was...**: *What I really need is a cup of hot coffee (Что мне действительно нужно — так это чашка кофе).*',
        'Типы Cleft Sentences', ['Тип конструкции', 'Схема', 'Пример предложения', 'Перевод'],
        [['It-cleft', 'It is/was [фокус] that/who...', 'It was his dedication that inspired the entire team.', 'Именно его самоотверженность вдохновила команду.'],
         ['Wh-cleft (What...)', 'What [подлежащее + глагол] is/was...', 'What we need is more actionable data.', 'Что нам нужно — так это больше практических данных.'],
         ['All-cleft (All I want...)', 'All [clause] is/was...', 'All I want is a good night\'s sleep.', 'Всё, чего я хочу — это выспаться.']],
        [{'en': 'It was in 2020 that our startup secured its first major investment.', 'ru': 'Именно в 2020 году наш стартап привлек первые крупные инвестиции.', 'note': 'It was in 2020 that...'}],
        ['Неправильный порядок слов: ❌ What I want it is... -> ✅ What I want is...']
    )

    add(106, 'Работа и карьера продвинутого уровня: Work and career',
        'Бизнес-лексика: performance review, climb the corporate ladder, severance package, job perks, resign vs be dismissed.',
        '1. Профессиональное развитие',
        '*land a job (получить желанную работу), negotiate a salary (вести переговоры по зарплате), promotion (повышение), high-pressure environment*.',
        '2. Увольнение и смена работы',
        '*resign / step down (уволиться по собственному желанию), be laid off (попасть под сокращение), be fired / dismissed (быть уволенным за проступок)*.',
        'Карьерный глоссарий B2', ['Фраза', 'Перевод', 'Пример в речи'],
        [['climb the career ladder', 'продвигаться по карьерной лестнице', 'She worked diligently to climb the career ladder.'],
         ['laid off due to downsizing', 'сокращен из-за оптимизации штата', 'Many tech workers were laid off last quarter.'],
         ['fringe benefits / perks', 'дополнительные льготы/бонусы', 'Health insurance and stock options are key job perks.']],
        [{'en': 'He decided to resign from his executive position to launch his own venture.', 'ru': 'Он решил уйти с руководящей должности, чтобы запустить собственный бизнес.', 'note': 'resign from position'}],
        ['Путаница quit / fired / laid off: "laid off" — сокращение компании (без вины сотрудника), "fired" — увольнение за провинность.']
    )

    add(107, 'Медиа и новости: Media and news',
        'Словарь современных медиа: breaking news, biased reporting, clickbait, investigative journalism, press release.',
        '1. Анализ медиа-контента',
        '*biased vs objective (предвзятый vs объективный), verify sources (проверять источники), viral content (вирусный контент)*.',
        '2. Журналистские термины',
        '*headline (заголовок), whistleblower (информатор), censorship (цензура), front page*.',
        'Медиа-лексикон', ['Термин', 'Перевод', 'Пример'],
        [['breaking news headline', 'срочная новость в заголовках', 'Breaking news interrupted the scheduled broadcast.'],
         ['biased coverage', 'предвзятое освещение событий', 'The article was criticized for biased political coverage.'],
         ['investigative journalism', 'журналистское расследование', 'The scandal was exposed through investigative journalism.']],
        [{'en': 'It is essential to fact-check information to avoid falling for sensational clickbait.', 'ru': 'Важно проверять факты, чтобы не попадаться на сенсационный кликбейт.', 'note': 'fact-check & clickbait'}],
        ['News во множественном числе: ❌ These news are shocking -> ✅ This news is shocking (news неисчисляемое).']
    )

    add(108, 'Общество и социальные отношения: Relationships and society',
        'Социологический и этический словарь: social mobility, cultural diversity, peer pressure, demographic shift, welfare state.',
        '1. Общественные процессы',
        '*civil society (гражданское общество), bridge the gap (сократить разрыв), social inequality (социальное неравенство)*.',
        '2. Межличностные отношения B2',
        '*drift apart (постепенно отдаляться друг от друга), maintain ties (поддерживать связи), mutual respect (взаимное уважение)*.',
        'Социологические термины', ['Выражение', 'Перевод', 'Пример контекста'],
        [['bridge the wealth gap', 'сократить разрыв в благосостоянии', 'Policies aimed at bridging the wealth gap are vital.'],
         ['cultural diversity', 'культурное многообразие', 'Cultural diversity fosters innovation in international teams.'],
         ['peer pressure', 'давление со стороны сверстников/окружения', 'Young professionals often feel peer pressure to overwork.']],
        [{'en': 'Rapid urbanization has triggered significant demographic shifts in metropolitan areas.', 'ru': 'Стремительная урбанизация вызвала значительные демографические сдвиги в мегаполисах.', 'note': 'demographic shifts'}],
        ['Sociable vs Social: *sociable* — общительный человек; *social* — относящийся к обществу (social issues).']
    )

    add(109, 'Наука и академические исследования: Science and research',
        'Исследовательский вокабуляр: conduct an experiment, peer-reviewed journal, hypothesis, breakthrough, empirical data.',
        '1. Научный метод',
        '*formulate a hypothesis (сформулировать гипотезу), gather empirical data (собирать эмпирические данные), prove/disprove a theory (доказать/опровергнуть теорию)*.',
        '2. Публикация и инновации',
        '*scientific breakthrough (научный прорыв), peer review (рецензирование коллегами), clinical trials (клинические испытания)*.',
        'Научный глоссарий', ['Понятие', 'Перевод', 'Пример'],
        [['conduct an experiment', 'проводить эксперимент', 'Scientists conducted a series of controlled experiments.'],
         ['peer-reviewed study', 'рецензированное исследование', 'The findings were published in a peer-reviewed journal.'],
         ['major breakthrough', 'крупный научный прорыв', 'CRISPR technology represents a major breakthrough in genetics.']],
        [{'en': 'The researchers gathered extensive empirical data before drawing final conclusions.', 'ru': 'Исследователи собрали обширные эмпирические данные, прежде чем делать окончательные выводы.', 'note': 'empirical data'}],
        ['Research во множественном числе: ❌ many researches -> ✅ much research / several studies.']
    )

    add(110, 'Продвинутые фразовые глаголы (Phrasal verbs common in B2)',
        'Фразовые глаголы делового и аналитического общения: weigh up, back down, come up with, call off, phase out, rule out.',
        '1. Топ глаголов B2',
        '*come up with an idea (придумать идею), call off a meeting (отменить встречу), rule out a possibility (исключить возможность), phase out legacy tools (постепенно выводить из эксплуатации)*.',
        '2. Аналитические глаголы',
        '*weigh up pros and cons (взвесить за и против), stem from (проистекать из/быть следствием), narrow down options (сузить выбор)*.',
        'Фразовые глаголы B2', ['Глагол', 'Значение', 'Пример в контексте'],
        [['come up with', 'придумать, предложить решение', 'Our team came up with an ingenious architecture design.'],
         ['call off', 'отменить запланированное событие', 'They had to call off the product launch due to bugs.'],
         ['rule out', 'исключить вариант из рассмотрения', 'We cannot rule out the possibility of a market correction.'],
         ['phase out', 'постепенно свернуть / вывести из оборота', 'The company is phasing out on-premise servers.']],
        [{'en': 'After weighing up the options, we decided to narrow down our roadmap.', 'ru': 'Взвесив варианты, мы решили сузить нашу дорожную карту.', 'note': 'weigh up & narrow down'}],
        ['Смешение call off (отменить насовсем) и put off / postpone (перенести на более поздний срок).']
    )

    add(111, 'Устойчивые коллокации с глаголами: Make / Do / Take / Get',
        'Коллокации — это устойчивые сочетания: make a decision (НЕ do!), do business, take a risk, get an impression.',
        '1. MAKE vs DO',
        '**MAKE** — создание чего-то нового, результат или решение: *make a mistake, make money, make a decision, make an effort, make an appointment*. **DO** — деятельность, работа, обязательства: *do homework, do research, do business, do someone a favor, do your best*.',
        '2. TAKE и GET',
        '**TAKE**: *take a risk, take responsibility, take advantage of, take into account*. **GET**: *get permission, get involved, get the impression*.',
        'Коллокации Make / Do / Take / Get', ['Глагол', 'Типичные словосочетания', 'Пример предложения'],
        [['MAKE', 'a decision, a mistake, profit, an exception', 'We need to make a strategic decision today.'],
         ['DO', 'research, business, your best, harm, a favor', 'Our analysts will do thorough market research.'],
         ['TAKE', 'a risk, responsibility, measures, into account', 'The leadership must take full responsibility.'],
         ['GET', 'access, permission, in touch, ready', 'You need admin rights to get access to the cluster.']],
        [{'en': 'We must take into account user feedback before making any major modifications.', 'ru': 'Мы обязаны принять во внимание отзывы пользователей перед внесением любых крупных изменений.', 'note': 'take into account & make modifications'}],
        ['Do a mistake: ❌ do a mistake -> ✅ make a mistake.',
         'Make research: ❌ make research -> ✅ do research.']
    )

    add(112, 'Популярные английские идиомы: Common Idioms',
        'Идиомы обогащают речь носителей: cut corners (халявить/экономить на качестве), bite the bullet (стиснуть зубы и сделать), on the same page (на одной волне).',
        '1. Деловые и повседневные идиомы',
        '*hit the ground running (сходу включиться в работу), learn the ropes (освоить азы дела), think outside the box (мыслить нестандартно), touch base (кратко связаться)*.',
        '2. Идиомы риска и решений',
        '*bite the bullet (решиться на неприятный шаг), play it by ear (действовать по обстановке), burn the midnight oil (работать допоздна)*.',
        'Топ-6 идиом уровня B2', ['Идиома', 'Буквальный смысл', 'Истинное значение', 'Пример'],
        [['on the same page', 'на одной странице', 'быть единомышленниками, иметь общее видение', 'Let\'s align so that everyone is on the same page.'],
         ['cut corners', 'срезать углы', 'экономить в ущерб качеству / халтурить', 'Never cut corners on security protocols.'],
         ['bite the bullet', 'прикусить пулю', 'стиснуть зубы и принять неизбежное', 'We had to bite the bullet and rewrite the codebase.'],
         ['touch base', 'коснуться базы', 'кратко связаться и сверить статус', 'Let\'s touch base next Monday at 10 AM.']],
        [{'en': 'To stay competitive, our engineers are encouraged to think outside the box.', 'ru': 'Чтобы оставаться конкурентоспособными, нашим инженерам предлагается мыслить нестандартно.', 'note': 'think outside the box'}],
        ['Дословный перевод русских фразеологизмов: не переводите «вешать лапшу» буквально; в английском есть эквивалент *pull someone\'s leg*.']
    )

    add(113, 'Дебаты и искусство убеждения: Debating and persuading',
        'Риторические стратегии убеждения: playing devil\'s advocate, conceding points, refuting arguments, persuasive hooks.',
        '1. Структура убедительного аргумента (A-R-E-L)',
        '**Assertion** (Тезис) -> **Reasoning** (Обоснование) -> **Evidence** (Факты и цифры) -> **Link** (Связка с главной целью).',
        '2. Дипломатичное опровержение',
        '*While I concede that initial costs are high, the long-term ROI is undeniable.* *I see the logic behind your claim, but the statistics indicate otherwise.*',
        'Риторические клише дебатов', ['Цель', 'Английская фраза', 'Перевод'],
        [['Смягченное согласие с частью довода', 'I concede that point, however...', 'Я признаю этот пункт, однако...'],
         ['Опровержение контраргумента', 'That argument overlooks the fact that...', 'Этот аргумент упускает из виду тот факт, что...'],
         ['Адвокат дьявола', 'Playing devil\'s advocate for a moment...', 'Если выступить в роли адвоката дьявола на секунду...']],
        [{'en': 'While I acknowledge your concerns about latency, the benchmark tests prove the new cache layer is faster.', 'ru': 'Хотя я признаю ваши опасения по поводу задержек, тесты производительности доказывают, что новый слой кэширования работает быстрее.', 'note': 'Дипломатичное убеждение'}],
        ['Агрессивный перебив собеседника: используйте вводные вежливые конструкции *If I may add..., May I address this point?*.']
    )

    add(114, 'Прогнозы и гипотезы о будущем: Speculating about the future',
        'Конструкции предсказаний с разной степенью вероятности: is bound to, is likely / unlikely to, on the verge of, by all accounts.',
        '1. Градация вероятности будущего',
        '100% неизбежность: **be bound to + V1** (*This system is bound to succeed*). 75% высокая вероятность: **be likely to + V1** (*Prices are likely to drop*). 25% маловероятно: **be unlikely to + V1** (*He is unlikely to agree*).',
        '2. На грани события',
        '**be on the verge of / on the brink of + V-ing/Noun** (*Scientists are on the verge of a major discovery*).',
        'Модели вероятности будущего', ['Конструкция', 'Вероятность', 'Пример предложения', 'Перевод'],
        [['be bound to + V1', '99% неизбежно', 'AI is bound to transform software engineering.', 'ИИ неизбежно трансформирует разработку ПО.'],
         ['be likely to + V1', '75% вероятно', 'The interest rates are likely to remain stable.', 'Процентные ставки, скорее всего, останутся стабильными.'],
         ['be unlikely to + V1', '25% маловероятно', 'We are unlikely to encounter any downtime.', 'Мы вряд ли столкнемся с простоем системы.'],
         ['on the verge of + -ing', 'Событие вот-вот наступит', 'They are on the verge of closing the deal.', 'Они на грани закрытия сделки.']],
        [{'en': 'Autonomous vehicles are bound to become mainstream within the next decade.', 'ru': 'Автономные автомобили неизбежно станут массовыми в течение следующего десятилетия.', 'note': 'is bound to become'}],
        ['It is likely that he will vs He is likely to: модель *He is likely to come* считается более естественной и стильной в B2.']
    )

    add(115, 'Описание графиков, тенденций и данных: Describing trends and data',
        'Аналитический язык отчетов: soar, plummet, fluctuate, level off, dramatic increase, steady decline.',
        '1. Глаголы динамики',
        'Резкий рост: *soar, skyrocket, surge*. Резкое падение: *plummet, plunge, drop sharply*. Колебания: *fluctuate*. Стабилизация: *level off, plateau*.',
        '2. Наречия степени изменения',
        '*substantially, dramatically, steadily, marginally, noticeably*. Например: *Sales increased steadily by 15%.*',
        'Лексика аналитики и графиков', ['Направление тренда', 'Глаголы (Verbs)', 'Существительные (Nouns)', 'Пример'],
        [['Резкий рост (📈)', 'soar, surge, peak at', 'a sharp increase, a surge', 'User acquisition soared by 40%.'],
         ['Резкий спад (📉)', 'plummet, plunge, drop', 'a steep decline, a slump', 'Latency plummeted after optimization.'],
         ['Колебания (〰️)', 'fluctuate between X and Y', 'fluctuations', 'Currency rates fluctuated throughout May.'],
         ['Стабилизация (➡️)', 'level off, reach a plateau', 'a period of stability', 'Traffic leveled off at 1M monthly visits.']],
        [{'en': 'Revenue grew steadily in Q3 before reaching a plateau in November.', 'ru': 'Выручка стабильно росла в 3-м квартале, прежде чем вышла на плато в ноябре.', 'note': 'grew steadily & reached a plateau'}],
        ['Предлоги с цифрами: *increase **by** 20%* (изменилось на 20%), *increase **from** 100 **to** 120* (с 100 до 120).']
    )

    add(116, 'Официальный и неформальный регистры речи: Formal vs informal register',
        'Стилистическая трансформация текста: разговорный сленг и сокращения vs деловой академический стиль переписки.',
        '1. Сравнение лексических пар',
        '*ask for -> request*, *tell -> inform*, *help -> assist*, *buy -> purchase*, *check -> verify*, *fix -> resolve*, *get -> obtain/receive*.',
        '2. Правила официального письма',
        'В формальном регистре: НИКАКИХ сокращений (write *do not*, not *don\'t*), больше пассивных конструкций (*The issue has been resolved*), использование формальных связок (*Furthermore, Consequently*).',
        'Регистры: Formal vs Informal', ['Смысл', 'Неформальный (Chat / Slack)', 'Официальный (Email / Report)'],
        [['Начать письмо', 'Hey guys! / Hi team,', 'Dear Mr. Davis, / Dear colleagues,'],
         ['Сообщить о баге', 'We messed up and broke the build.', 'We regret to inform you of a technical malfunction.'],
         ['Запросить инфу', 'Drop me the details ASAP.', 'Could you kindly provide the relevant details at your earliest convenience?'],
         ['Завершение', 'Cheers! / Catch you later!', 'Sincerely yours, / Best regards,']],
        [{'en': 'Informal: We got your email and will fix it soon. -> Formal: We have received your correspondence and will rectify the issue promptly.', 'ru': 'Мы получили ваше письмо и оперативно устраним возникшую проблему.', 'note': 'Трансформация регистра'}],
        ['Использование сленга и сокращений в официальных письмах руководству или клиентам: ❌ wanna, gonna, thanks a bunch.']
    )

    add(117, 'Гипотетические сценарии и предположения: Expressing hypothetical situations',
        'Продвинутые конструкции гипотез: Suppose / Supposing, What if, Imagine, Provided that, As long as, In the event of.',
        '1. Suppose / Supposing / What if',
        'Используются для моделирования возможных ситуаций. Если ситуация гипотетическая в настоящем — глагол ставится в Past Simple: *Supposing we lost the contract, what would we do? (Предположим, мы потеряли бы контракт, что бы мы делали?)*',
        '2. Provided that / As long as (При условии что)',
        '*We can launch next week **provided that** all tests pass green (= If and only if).*',
        'Гипотетические конструкции', ['Конструкция', 'Значение', 'Пример предложения', 'Перевод'],
        [['Supposing (that)...', 'Предположим, что...', 'Supposing you had unlimited budget, what would you build?', 'Предположим, у тебя был бы неограниченный бюджет, что бы ты построил?'],
         ['Provided that / As long as', 'При условии, если...', 'We will sign the SLA provided that uptime is guaranteed.', 'Мы подпишем соглашение при условии гарантии аптайма.'],
         ['In the event of...', 'В случае наступления...', 'In the event of a power outage, the generator starts.', 'В случае отключения питания запустится генератор.']],
        [{'en': 'Supposing we migrated to Kubernetes, how much engineering overhead would that reduce?', 'ru': 'Предположим, мы мигрировали бы на Kubernetes, насколько снизились бы трудозатраты инженеров?', 'note': 'Supposing + Past Simple'}],
        ['Использование will после provided that: ❌ provided that you will come -> ✅ provided that you come.']
    )

    add(11256, 'Трехсоставные фразовые глаголы (look forward to, run out of, get rid of, put up with)',
        'Трехсоставные фразовые глаголы состоят из глагола и двух предлогов. Они НИКОГДА не разделяются дополнением.',
        '1. Золотой топ B2',
        '*look forward to (с нетерпением ждать + V-ing!), run out of (заканчиваться: we ran out of memory), get rid of (избавляться от), put up with (мириться/терпеть), cut down on (сокращать потребление), catch up with (наверстывать/догонять)*.',
        '2. Герундий после Look forward to',
        'Поскольку *to* — это предлог, после него идет **существительное или -ing**: *I look forward to hearing from you (не hear!).*',
        'Топ трехсоставных глаголов', ['Глагол', 'Значение', 'Пример предложения', 'Перевод'],
        [['look forward to', 'с нетерпением ждать (+ -ing!)', 'I look forward to working with you.', 'С нетерпением жду совместной работы.'],
         ['run out of', 'исчерпать запас чего-то', 'We have run out of time on this agenda item.', 'У нас закончилось время по этому пункту.'],
         ['get rid of', 'избавиться от чего-то ненужного', 'We need to get rid of legacy code.', 'Нам нужно избавиться от легаси-кода.'],
         ['put up with', 'терпеть, мириться с чем-то неприятным', 'I cannot put up with this noise any longer.', 'Я больше не могу терпеть этот шум.']],
        [{'en': 'We decided to cut down on unnecessary meetings.', 'ru': 'Мы решили сократить количество ненужных встреч.', 'note': 'cut down on'}],
        ['Инфинитив после look forward to: ❌ I look forward to see you -> ✅ I look forward to seeing you.']
    )

    add(11257, 'Продвинутые каузативные структуры: Have someone do vs Get someone to do vs Make / Let',
        'Различия каузативных глаголов: HAVE someone do (делегировать без to), GET someone to do (уговорить с to), MAKE someone do (заставить), LET someone do (разрешить).',
        '1. Разница между Have, Get, Make, Let',
        '1) **HAVE + лицо + V1 (без to)**: *I had the developer fix the bug (Я поручил разработчику исправить баг)*. 2) **GET + лицо + TO V1 (с to!)**: *I got him to agree (Я убедил его согласиться)*. 3) **MAKE + лицо + V1 (без to)**: *He made me laugh (Он заставил меня смеяться)*. 4) **LET + лицо + V1 (без to)**: *Let me know (Дай мне знать)*.',
        '2. Каузатив в пассивном залоге',
        'В пассивном залоге глагол MAKE требует частицу TO: *I was made to wait for an hour*. Глагол LET в пассиве заменяется на **be allowed to**: *We were allowed to leave early*.',
        'Каузативные конструкции с лицом', ['Конструкция', 'Оттенок смысла', 'Частица TO', 'Пример'],
        [['HAVE someone DO', 'Поручить / Делегировать', 'БЕЗ TO', 'The manager had the team prepare the report.'],
         ['GET someone TO DO', 'Уговорить / Убедить', 'С ЧАСТИЦЕЙ TO', 'She got the client to sign the deal.'],
         ['MAKE someone DO', 'Принудить / Заставить', 'БЕЗ TO', 'The error made the server restart.'],
         ['LET someone DO', 'Позволить / Разрешить', 'БЕЗ TO', 'Please let me finish my sentence.']],
        [{'en': 'I will get the designer to update the mockups by tomorrow.', 'ru': 'Я договорюсь с дизайнером, чтобы он обновил макеты к завтрашнему дню.', 'note': 'get + designer + to update'}],
        ['To после make / let: ❌ He made me to do it -> ✅ He made me do it.',
         'Пропуск to после get: ❌ I got him do it -> ✅ I got him to do it.']
    )

    add(11258, 'Инверсия в условных предложениях (Had I known, Were you to, Should you need)',
        'Формальная литературная и деловая инверсия в условных предложениях без слова IF: Had I known, Were I you, Should you require assistance.',
        '1. Инверсия для 1-го, 2-го и 3-го типов',
        '1) **1st Condition**: *If you need -> **Should you need** any help*. 2) **2nd Condition**: *If I were -> **Were I** in your shoes*. 3) **3rd Condition**: *If I had known -> **Had I known** about the issue*.',
        '2. Отрицания при инверсии',
        'В отрицательных инверсиях частица **not** ставится ПОСЛЕ подлежащего (сокращения wouldn\'t/hadn\'t не используются): *Had we **not** taken a taxi, we would have missed the train.*',
        'Инвертированные условные конструкции', ['Тип Condition', 'Обычная форма с IF', 'Инверсия высокого стиля', 'Перевод'],
        [['1st Conditional (Should)', 'If you have any questions...', 'Should you have any questions, feel free to ask.', 'Если у вас возникнут вопросы, обращайтесь.'],
         ['2nd Conditional (Were)', 'If we were to accept the offer...', 'Were we to accept the offer, we would grow.', 'Если бы мы приняли это предложение...'],
         ['3rd Conditional (Had)', 'If I had realized the risk...', 'Had I realized the risk, I would have declined.', 'Если бы я осознавал риск тогда...']],
        [{'en': 'Should you experience any issues with the build, reach out to DevOps.', 'ru': 'Если у вас возникнут проблемы со сборкой, свяжитесь с DevOps.', 'note': 'Should you experience...'}],
        ['Одновременное использование if и инверсии: ❌ If had I known -> ✅ Had I known.']
    )

    print(f"Total handcrafted registered topics: {len(DATA)}")
    
    # Verify coverage across all DB topics
    packages = {"A1": {}, "A2": {}, "B1": {}, "B2": {}}
    unregistered = []

    for t in all_db_topics:
        t_id, name, cat, lvl = t
        if t_id not in DATA:
            unregistered.append((t_id, name, lvl))
        else:
            entry = DATA[t_id]
            pkg = {
                "topicId": t_id,
                "topicName": name,
                "level": lvl,
                "category": cat,
                "russianTitle": entry["russianTitle"],
                "summaryRu": entry["summaryRu"],
                "sections": entry["sections"],
                "tables": entry["tables"],
                "examples": entry["examples"],
                "commonMistakes": entry["commonMistakes"],
                "tutorQuickPrompts": entry["tutorQuickPrompts"]
            }
            packages[lvl][str(t_id)] = pkg

    if unregistered:
        print(f"CRITICAL WARNING: {len(unregistered)} topics are not registered!")
        for u in unregistered:
            print("  Missing:", u)
    else:
        print("PERFECT: 100% of all 125 DB topics are explicitly handcrafted and registered!")

    out_dir = "/srv/LinguaLearn/english/server/theoryPackages"
    os.makedirs(out_dir, exist_ok=True)

    for lvl, pdata in packages.items():
        out_path = os.path.join(out_dir, f"english{lvl}Theory.json")
        with open(out_path, "w", encoding="utf-8") as out_f:
            json.dump(pdata, out_f, ensure_ascii=False, indent=2)
        print(f"SUCCESS: Wrote {len(pdata)} topics to {out_path}")

if __name__ == "__main__":
    generate_curated_packages()
