# -*- coding: utf-8 -*-
"""
A1 Skill Tasks Builder
Generates at least 6 tasks for each of the 4 CEFR skills (Listening, Speaking, Reading, Writing).
Total: 24+ rigorous pedagogical tasks.
"""
import json

skills_data = {
    # ----------------------------------------------------
    # LISTENING (6 tasks across the units)
    # ----------------------------------------------------
    "listening": [
        {
            "id": "a1-listen-01-airport",
            "unitId": "a1-u01-first-contact",
            "title": "Llegada al aeropuerto de Madrid",
            "audioUrl": "/a1/media/audio/a1-u01-audio-01.mp3",
            "durationSec": 28,
            "speakersCount": 1,
            "speakerInfo": "Elena (locutora de Madrid)",
            "transcript": "¡Hola a todos! Bienvenidos a Madrid. Mi nombre es Elena y soy su guía turística. Hoy es lunes quince de octubre y son las diez de la mañana. Nuestro autobús hacia el hotel está en la puerta número cuatro. Por favor, tengan sus pasaportes y billetes en la mano. ¡Buen viaje y mucho gusto!",
            "questions": [
                {
                    "question": "¿Cómo se llama la guía turística?",
                    "options": ["Sofía", "Elena", "Carmen", "María"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «Mi nombre es Elena y soy su guía»."
                },
                {
                    "question": "¿En qué puerta está el autobús hacia el hotel?",
                    "options": ["En la puerta número dos", "En la puerta número cuatro", "En la puerta número diez", "En la puerta número seis"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «está en la puerta número cuatro»."
                },
                {
                    "question": "¿Qué documentos pide tener en la mano?",
                    "options": ["Solo dinero", "Pasaportes y billetes", "Las fotos", "Las maletas"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «tengan sus pasaportes y billetes en la mano»."
                },
                {
                    "question": "¿Qué hora es en el momento del anuncio?",
                    "options": ["Las diez de la mañana", "Las dos de la tarde", "Las diez de la noche", "Las ocho de la mañana"],
                    "correctIndex": 0,
                    "explanation": "En el audio: «son las diez de la mañana»."
                }
            ]
        },
        {
            "id": "a1-listen-02-room-description",
            "unitId": "a1-u02-things",
            "title": "La habitación de Carlos",
            "audioUrl": "/a1/media/audio/a1-u02-audio-01.mp3",
            "durationSec": 32,
            "speakersCount": 1,
            "speakerInfo": "Carlos (estudiante de Salamanca)",
            "transcript": "Hola, soy Carlos. En mi habitación tengo una cama grande, una mesa blanca y una lámpara azul. Encima de la mesa tengo cuatro libros de español y dos cuadernos rojos. Mi mochila negra está al lado de la puerta. Me gusta mucho mi habitación porque es luminosa y muy tranquila.",
            "questions": [
                {
                    "question": "¿De qué color es la lámpara?",
                    "options": ["Blanca", "Roja", "Azul", "Negra"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «una lámpara azul»."
                },
                {
                    "question": "¿Cuántos libros de español hay encima de la mesa?",
                    "options": ["Dos", "Cuatro", "Diez", "Tres"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «cuatro libros de español y dos cuadernos rojos»."
                },
                {
                    "question": "¿Dónde está la mochila negra?",
                    "options": ["Debajo de la cama", "Encima de la silla", "Al lado de la puerta", "En el balcón"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «al lado de la puerta»."
                }
            ]
        },
        {
            "id": "a1-listen-03-family-intro",
            "unitId": "a1-u04-family",
            "title": "La familia de Mateo",
            "audioUrl": "/a1/media/audio/a1-u04-audio-01.mp3",
            "durationSec": 36,
            "speakersCount": 1,
            "speakerInfo": "Mateo (Buenos Aires)",
            "transcript": "Hola amigos, me llamo Mateo. Mi familia vive en Buenos Aires. Mi padre tiene cincuenta y dos años y es profesor. Mi madre tiene cuarenta y ocho y trabaja como médica en un hospital infantil. Tengo una hermana menor que se llama Sofía; tiene dieciocho años y estudia arquitectura. Además, tenemos un perro marrón muy juguetón.",
            "questions": [
                {
                    "question": "¿Cuántos años tiene el padre de Mateo?",
                    "options": ["48 años", "50 años", "52 años", "60 años"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «Mi padre tiene cincuenta y dos años»."
                },
                {
                    "question": "¿A qué se dedica la madre de Mateo?",
                    "options": ["Es profesora", "Es médica en un hospital infantil", "Es arquitecta", "Es guía turística"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «trabaja como médica en un hospital infantil»."
                },
                {
                    "question": "¿Qué estudia su hermana Sofía?",
                    "options": ["Medicina", "Idiomas", "Arquitectura", "Música"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «estudia arquitectura»."
                },
                {
                    "question": "¿De qué color es su perro?",
                    "options": ["Negro", "Blanco", "Marrón", "Gris"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «un perro marrón muy juguetón»."
                }
            ]
        },
        {
            "id": "a1-listen-04-daily-routine",
            "unitId": "a1-u05-actions",
            "title": "El día a día de Laura",
            "audioUrl": "/a1/media/audio/a1-u05-audio-01.mp3",
            "durationSec": 40,
            "speakersCount": 1,
            "speakerInfo": "Laura (Sevilla)",
            "transcript": "Todos los días de lunes a viernes me despierto a las siete de la mañana. Me ducho, desayuno café con tostadas y salgo de casa a las ocho en punto. Trabajo en una oficina de marketing hasta las tres de la tarde. A las tres y media como en casa con mi esposo. Por las tardes camino por el parque y estudio español durante una hora.",
            "questions": [
                {
                    "question": "¿A qué hora sale Laura de casa?",
                    "options": ["A las siete", "A las ocho en punto", "A las nueve y media", "A las tres"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «salgo de casa a las ocho en punto»."
                },
                {
                    "question": "¿Con quién come a las tres y media?",
                    "options": ["Sola en la oficina", "Con su esposo en casa", "Con sus padres", "En un restaurante"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «como en casa con mi esposo»."
                },
                {
                    "question": "¿Qué hace Laura por las tardes?",
                    "options": ["Duerme cuatro horas", "Camina por el parque y estudia español", "Baila en una discoteca", "Va de compras"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «camino por el parque y estudio español durante una hora»."
                }
            ]
        },
        {
            "id": "a1-listen-05-cafe-order",
            "unitId": "a1-u07-food",
            "title": "Diálogo en el Café Tortoni",
            "audioUrl": "/a1/media/audio/a1-u07-audio-01.mp3",
            "durationSec": 45,
            "speakersCount": 2,
            "speakerInfo": "Camarero y Cliente (Буэнос-Айрес)",
            "transcript": "—¡Buenas tardes! ¿Tienen mesa para dos personas cerca de la ventana?\n—Sí, pasen por aquí, por favor. ¿Qué desean tomar?\n—Para mí un cortado con leche caliente y dos medialunas de manteca. ¿Y para ti, Sofía?\n—Yo quiero un té con limón y un vaso de agua mineral sin gas.\n—Muy bien, se lo traigo en seguida. ¿Desean algo más?\n—Nada más por ahora, muchas gracias.",
            "questions": [
                {
                    "question": "¿Dónde quieren sentarse los clientes?",
                    "options": ["En la barra", "Cerca de la ventana", "En la terraza", "En la entrada"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «¿Tienen mesa para dos personas cerca de la ventana?»."
                },
                {
                    "question": "¿Qué pide el primer cliente para comer?",
                    "options": ["Un bocadillo de jamón", "Dos medialunas de manteca", "Tarta de manzana", "Churros"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «un cortado con leche caliente y dos medialunas de manteca»."
                },
                {
                    "question": "¿Qué bebida pide Sofía?",
                    "options": ["Café solo y vino", "Té con limón y agua mineral sin gas", "Zumo de naranja", "Cerveza fría"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «un té con limón y un vaso de agua mineral sin gas»."
                }
            ]
        },
        {
            "id": "a1-listen-06-shopping-plans",
            "unitId": "a1-u09-needs",
            "title": "Planes de compras para el viaje",
            "audioUrl": "/a1/media/audio/a1-u09-audio-01.mp3",
            "durationSec": 48,
            "speakersCount": 2,
            "speakerInfo": "Diego y Carmen (Мадрид)",
            "transcript": "—Hola Carmen, mañana voy a ir al centro comercial porque el sábado viajo a Granada y necesito ropa de abrigo.\n—¡Qué buen viaje! ¿Qué ropa necesitas comprar?\n—Necesito una chaqueta gruesa, un jersey de lana gris y unas botas para caminar por la montaña. En la tienda de deportes tienen rebajas del cuarenta por ciento.\n—¡Qué bien! Yo también voy a ir contigo para comprarme una bufanda roja.\n—Perfecto, nos encontramos en la parada de metro a las cinco en punto.",
            "questions": [
                {
                    "question": "¿Adónde viaja Diego el sábado?",
                    "options": ["A Sevilla", "A Barcelona", "A Granada", "A Valencia"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «el sábado viajo a Granada»."
                },
                {
                    "question": "¿Qué prendas necesita comprar Diego?",
                    "options": ["Bañador y sandalias", "Chaqueta gruesa, jersey de lana y botas", "Traje y corbata", "Gafas de sol y camiseta"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «una chaqueta gruesa, un jersey de lana gris y unas botas»."
                },
                {
                    "question": "¿Qué descuento tienen en la tienda de deportes?",
                    "options": ["Veinte por ciento", "Treinta por ciento", "Cuarenta por ciento", "Cincuenta por ciento"],
                    "correctIndex": 2,
                    "explanation": "En el audio: «rebajas del cuarenta por ciento»."
                },
                {
                    "question": "¿A qué hora y dónde se van a encontrar?",
                    "options": ["A las seis en la tienda", "A las cinco en punto en la parada de metro", "A las cuatro en el hotel", "Al mediodía en el parque"],
                    "correctIndex": 1,
                    "explanation": "En el audio: «en la parada de metro a las cinco en punto»."
                }
            ]
        }
    ],

    # ----------------------------------------------------
    # SPEAKING (6 tasks across the units)
    # ----------------------------------------------------
    "speaking": [
        {
            "id": "a1-speak-01-presentation",
            "unitId": "a1-u01-first-contact",
            "title": "Presentación personal completa",
            "promptRu": "Запишите голосовое сообщение (20-40 секунд) с самопрезентацией на испанском:\n1. Поздоровайтесь (¡Hola! / ¡Buenos días!).\n2. Назовите свое имя (Me llamo...).\n3. Укажите свой возраст (Tengo ... años).\n4. Назовите свою страну происхождения и город (Soy de..., vivo en...).\n5. Скажите, на каких языках вы говорите (Hablo ruso y un poco de español).",
            "targetGrammar": "Me llamo, tengo X años, soy de, hablo",
            "durationRange": "20-40s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Понятность и беглость речи", "max": 40, "description": "Речь разборчива, естественный темп, паузы не мешают пониманию."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Правильное употребление глаголов llamarse, tener, ser, hablar."},
                    {"name": "Словарный запас A1", "max": 20, "description": "Слова по теме приветствий, возраста, стран и языков."},
                    {"name": "Произношение и ударение", "max": 10, "description": "Четкие гласные (o/a/e), правильное ударение в числах и глаголах."}
                ]
            }
        },
        {
            "id": "a1-speak-02-describe-room",
            "unitId": "a1-u02-things",
            "title": "Descripción de mi habitación y objetos",
            "promptRu": "Опишите вслух свою комнату (30-50 секунд):\n1. Назовите размер и атмосферу (Mi habitación es grande/pequeña, luminosa...).\n2. Назовите 3-4 предмета мебели с артиклями (la cama, el armario, la mesa...).\n3. Укажите цвета предметов с согласованием (el sofá gris, la lámpara azul...).\n4. Используйте конструкцию «hay» (En mi habitación hay...).",
            "targetGrammar": "Hay, género y número de adjetivos, colores",
            "durationRange": "30-50s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Понятность и связность", "max": 40, "description": "Логичное и связное описание пространства."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Корректное согласование артиклей, существительных и цветов."},
                    {"name": "Словарный запас A1", "max": 20, "description": "Лексика мебели (mesa, cama, armario) и цветов (blanco, rojo, azul)."},
                    {"name": "Произношение", "max": 10, "description": "Четкое произношение окончаний -o/-a/-os/-as."}
                ]
            }
        },
        {
            "id": "a1-speak-03-family-portrait",
            "unitId": "a1-u04-family",
            "title": "Descripción de un familiar",
            "promptRu": "Опишите одного из членов вашей семьи или друга (30-50 секунд):\n1. Кто этот человек и как его зовут (Es mi padre/hermano/amigo, se llama...).\n2. Сколько ему лет и какая у него профессия (Tiene ... años, es médico/profesor...).\n3. Какая у него внешность через SER, TENER и LLEVAR (Es alto, tiene el pelo corto, lleva gafas...).\n4. Какой он по характеру (Es muy simpático y paciente).",
            "targetGrammar": "SER + estatura/carácter, TENER + ojos/pelo, LLEVAR + gafas/barba",
            "durationRange": "30-50s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Понятность высказывания", "max": 40, "description": "Четкая структура описания человека."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Правильное разделение функций SER, TENER и LLEVAR."},
                    {"name": "Словарь внешности и характера", "max": 20, "description": "Слова alto, delgado, pelo liso/rizado, ojos marrones, gafas..."},
                    {"name": "Произношение", "max": 10, "description": "Правильное ударение в глаголах (tiene, lleva, es)."}
                ]
            }
        },
        {
            "id": "a1-speak-04-routine",
            "unitId": "a1-u05-actions",
            "title": "Mi rutina diaria y horarios",
            "promptRu": "Расскажите о своем обычном дне (30-50 секунд):\n1. Во сколько вы просыпаетесь и завтракаете (Me despierto a las..., desayuno...).\n2. Где и со скольки до скольки вы работаете или учитесь (Trabajo/estudio de ... a ...).\n3. Что вы делаете во второй половине дня (Por la tarde camino, leo, escucho música...).\n4. Во сколько вы ужинаете и ложитесь спать (Ceno a las... y me acuesto a las...).",
            "targetGrammar": "Presente de verbos -AR/-ER/-IR, horas (a las...)",
            "durationRange": "30-50s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Понятность и беглость", "max": 40, "description": "Плавный рассказ без длительных пауз."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Спряжение глаголов в 1-м лице и конструкции времени (a las ocho)."},
                    {"name": "Словарный запас распорядка", "max": 20, "description": "Слова levantarse, desayunar, trabajar, comer, cenar, acostarse."},
                    {"name": "Произношение", "max": 10, "description": "Интонация утвердительных предложений."}
                ]
            }
        },
        {
            "id": "a1-speak-05-order-food",
            "unitId": "a1-u07-food",
            "title": "Pedido en un restaurante español",
            "promptRu": "Сыграйте роль посетителя испанского ресторана (30-50 секунд):\n1. Поздоровайтесь и попросите столик на двоих (¡Buenas tardes! Una mesa para dos, por favor).\n2. Закажите первое, второе блюдо и напиток (De primero quiero..., de segundo..., para beber...).\n3. Спросите, какой десерт есть сегодня (¿Qué tienen de postre?).\n4. Попросите счет и спросите об оплате картой (La cuenta, por favor. ¿Puedo pagar con tarjeta?).",
            "targetGrammar": "De primero/segundo, la cuenta por favor, pagar con tarjeta",
            "durationRange": "30-50s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Коммуникативная понятность и этикет", "max": 40, "description": "Естественный ресторанный этикет (por favor, gracias)."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Формулы заказа «de primero / para beber / la cuenta»."},
                    {"name": "Лексика блюд и напитков", "max": 20, "description": "Слова sopa, ensalada, carne, pescado, agua, vino, postre, cuenta."},
                    {"name": "Произношение", "max": 10, "description": "Интонация вопросов и просьб."}
                ]
            }
        },
        {
            "id": "a1-speak-06-future-plans",
            "unitId": "a1-u09-needs",
            "title": "Mis planes para el próximo fin de semana",
            "promptRu": "Расскажите о ваших планах на следующие выходные (30-50 секунд):\n1. Куда вы собираетесь пойти в субботу (El sábado voy a ir a...).\n2. Что вы планируете купить или примерить (Voy a comprar / probarme...).\n3. С кем вы встретитесь в воскресенье (El domingo voy a comer con...).\n4. Чем вам нравится такой план (Me gusta / me encanta este plan porque...).",
            "targetGrammar": "IR A + infinitivo, GUSTAR / ENCANTAR",
            "durationRange": "30-50s",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Понятность и уверенность речи", "max": 40, "description": "Логичное изложение планов на будущее."},
                    {"name": "Целевая грамматика", "max": 30, "description": "Обязательное использование конструкции «IR A + инфинитив» и «GUSTAR»."},
                    {"name": "Словарный запас A1", "max": 20, "description": "Дни недели, покупки, одежда, досуг."},
                    {"name": "Произношение", "max": 10, "description": "Четкость и связность фраз."}
                ]
            }
        }
    ],

    # ----------------------------------------------------
    # READING (6 tasks across the units)
    # ----------------------------------------------------
    "reading": [
        {
            "id": "a1-read-01-profile",
            "unitId": "a1-u01-first-contact",
            "title": "El perfil de Mateo en la escuela de idiomas",
            "wordCount": 65,
            "text": "¡Hola a todos! Me llamo Mateo Benítez y soy de Córdoba, Argentina. Tengo veintidós años y soy estudiante de diseño gráfico en Madrid. Hablo español nativo y un poco de inglés. Mi número de teléfono es el 645 89 12 30 y mi correo es mateo.design@correo.es. Me gusta mucho conocer gente nueva en clase. ¡Mucho gusto en saludarles!",
            "questions": [
                {
                    "question": "¿De qué ciudad y país es Mateo?",
                    "options": ["De Madrid, España", "De Córdoba, Argentina", "De Buenos Aires", "De Lima, Perú"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «soy de Córdoba, Argentina»."
                },
                {
                    "question": "¿Qué estudia Mateo en Madrid?",
                    "options": ["Medicina", "Diseño gráfico", "Filosofía", "Arquitectura"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «soy estudiante de diseño gráfico en Madrid»."
                },
                {
                    "question": "¿Cuántos años tiene Mateo?",
                    "options": ["18 años", "20 años", "22 años", "25 años"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «Tengo veintidós años» (22)."
                }
            ]
        },
        {
            "id": "a1-read-02-apartment",
            "unitId": "a1-u02-things",
            "title": "Un apartamento en el barrio de Gracia",
            "wordCount": 85,
            "text": "Se alquila un apartamento luminoso en el barrio de Gracia, en Barcelona. El piso está en el segundo piso con ascensor. Tiene un salón amplio con un sofá gris y una mesa de madera con cuatro sillas blancas. En el dormitorio principal hay una cama doble, un armario grande y dos mesitas de noche. La cocina tiene nevera, lavadora y microondas. El baño tiene una ducha moderna. Cuesta ochocientos cincuenta euros al mes.",
            "questions": [
                {
                    "question": "¿En qué piso se encuentra el apartamento?",
                    "options": ["En la planta baja", "En el primer piso", "En el segundo piso con ascensor", "En el cuarto piso"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «está en el segundo piso con ascensor»."
                },
                {
                    "question": "¿De qué color son las cuatro sillas del salón?",
                    "options": ["Grises", "Negras", "Blancas", "Rojas"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «una mesa de madera con cuatro sillas blancas»."
                },
                {
                    "question": "¿Cuánto cuesta el alquiler mensual del apartamento?",
                    "options": ["500 euros", "750 euros", "850 euros", "1000 euros"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «Cuesta ochocientos cincuenta euros al mes» (850 €)."
                }
            ]
        },
        {
            "id": "a1-read-03-doctor-visit",
            "unitId": "a1-u04-family",
            "title": "La visita al médico de Carlos",
            "wordCount": 98,
            "text": "Hoy Carlos no va al trabajo porque está enfermo. Tiene fiebre y le duele mucho la cabeza y la garganta. A las diez de la mañana visita al doctor Ramírez en el centro de salud de su barrio. El doctor es un hombre mayor, muy amable y paciente; le examina los ojos, la boca y le toma la temperatura. El médico le dice: «Carlos, tienes gripe. Tienes que descansar en la cama tres días, beber mucha agua con limón y tomar este medicamento». Carlos regresa a su casa para descansar.",
            "questions": [
                {
                    "question": "¿Por qué no va Carlos a trabajar hoy?",
                    "options": ["Porque tiene vacaciones", "Porque está enfermo con fiebre y dolor de cabeza", "Porque es domingo", "Porque va de viaje"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «no va al trabajo porque está enfermo. Tiene fiebre...»."
                },
                {
                    "question": "¿Cómo es el doctor Ramírez?",
                    "options": ["Joven y antipático", "Un hombre mayor, muy amable y paciente", "Extranjero", "Tímido"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «El doctor es un hombre mayor, muy amable y paciente»."
                },
                {
                    "question": "¿Qué recomendaciones le da el médico a Carlos?",
                    "options": ["Hacer deporte", "Descansar en la cama tres días, beber agua y tomar medicamento", "Ir al cine", "Comer helado"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «descansar en la cama tres días, beber mucha agua con limón y tomar este medicamento»."
                }
            ]
        },
        {
            "id": "a1-read-04-seville-trip",
            "unitId": "a1-u06-calendar",
            "title": "Un fin de semana en Sevilla",
            "wordCount": 110,
            "text": "El viernes por la tarde, Ana y su hermano David viajan en tren de alta velocidad de Madrid a Sevilla. El viaje dura solo dos horas y media. Llegan a las siete en punto de la tarde a la estación de Santa Justa. Su hotel está en el barrio de Santa Cruz, muy cerca de la famosa Giralda. El sábado por la mañana hace mucho sol y visitan el Alcázar. Al mediodía comen tapas en una terraza tradicional: tortilla de patatas, jamón y ensaladilla rusa. El domingo por la tarde regresan a Madrid muy contentos.",
            "questions": [
                {
                    "question": "¿Cómo viajan Ana y David a Sevilla?",
                    "options": ["En coche", "En autobús", "En tren de alta velocidad", "En avión"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «viajan en tren de alta velocidad de Madrid a Sevilla»."
                },
                {
                    "question": "¿A qué hora llegan a la estación de Santa Justa el viernes?",
                    "options": ["A las dos de la tarde", "A las siete en punto de la tarde", "A medianoche", "A las nueve de la mañana"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Llegan a las siete en punto de la tarde»."
                },
                {
                    "question": "¿Qué tapas comen el sábado al mediodía?",
                    "options": ["Pizza y hamburguesa", "Tortilla de patatas, jamón y ensaladilla rusa", "Solo fruta", "Sopa caliente"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «tortilla de patatas, jamón y ensaladilla rusa»."
                }
            ]
        },
        {
            "id": "a1-read-05-market-day",
            "unitId": "a1-u07-food",
            "title": "Las compras en el Mercado de San Miguel",
            "wordCount": 120,
            "text": "Todos los sábados a las diez en punto de la mañana, Sofía va al Mercado de San Miguel para hacer las compras de la semana. Primero va a la frutería y compra dos kilos de naranjas de Valencia, un kilo de plátanos y medio kilo de fresas frescas. Después va a la panadería artesanal y pide dos barras de pan recién horneado. En la pescadería compra merluza fresca para el almuerzo del domingo. Sofía siempre paga en efectivo con billetes de veinte euros. Dice que la comida del mercado es mucho más sabrosa que la del supermercado.",
            "questions": [
                {
                    "question": "¿Qué frutas compra Sofía en el mercado?",
                    "options": ["Solo manzanas", "Naranjas de Valencia, plátanos y fresas frescas", "Uvas y limones", "Piña y sandía"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «dos kilos de naranjas de Valencia, un kilo de plátanos y medio kilo de fresas»."
                },
                {
                    "question": "¿Qué pescado compra para el domingo?",
                    "options": ["Salmón", "Merluza fresca", "Atún", "Sardinas"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «compra merluza fresca para el almuerzo del domingo»."
                },
                {
                    "question": "¿Cómo paga Sofía en los puestos del mercado?",
                    "options": ["Con tarjeta de crédito", "En efectivo con billetes de veinte euros", "Con el teléfono", "No paga"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «Sofía siempre paga en efectivo con billetes de veinte euros»."
                }
            ]
        },
        {
            "id": "a1-read-06-weekend-plans",
            "unitId": "a1-u09-needs",
            "title": "La carta de planes de Diego a su amigo",
            "wordCount": 135,
            "text": "Querido amigo Lucas: Te escribo desde mi casa en Madrid. La próxima semana voy a tener cinco días de vacaciones y quiero contarte mis planes. El jueves voy a viajar a Barcelona en tren para ver a mi hermana Lucía. Ella vive cerca de la playa y su piso es muy bonito. El viernes por la mañana vamos a ir de compras a las rebajas del centro; yo necesito comprar una chaqueta negra y unos zapatos cómodos. El sábado vamos a comer una paella de marisco en un restaurante frente al mar. El domingo vamos a visitar el Parque Güell y hacer muchas fotos. Tengo muchas ganas de hacer este viaje. ¿Y tú, qué vas a hacer? Un abrazo fuerte, Diego.",
            "questions": [
                {
                    "question": "¿Cuántos días de vacaciones va a tener Diego?",
                    "options": ["Dos días", "Tres días", "Cinco días", "Diez días"],
                    "correctIndex": 2,
                    "explanation": "В тексте: «voy a tener cinco días de vacaciones»."
                },
                {
                    "question": "¿Qué va a hacer Diego el viernes por la mañana?",
                    "options": ["Dormir", "Ir de compras a las rebajas del centro", "Cocinar paella", "Trabajar en la oficina"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «vamos a ir de compras a las rebajas del centro»."
                },
                {
                    "question": "¿Qué prendas necesita comprarse Diego?",
                    "options": ["Una bufanda y guantes", "Una chaqueta negra y unos zapatos cómodos", "Un bañador y gafas de sol", "Un sombrero y corbata"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «necesito comprar una chaqueta negra y unos zapatos cómodos»."
                },
                {
                    "question": "¿Qué monumento van a visitar el domingo?",
                    "options": ["La Sagrada Familia", "El Parque Güell", "El Museo del Prado", "La Alhambra"],
                    "correctIndex": 1,
                    "explanation": "В тексте: «vamos a visitar el Parque Güell y hacer muchas fotos»."
                }
            ]
        }
    ],

    # ----------------------------------------------------
    # WRITING (6 tasks across the units)
    # ----------------------------------------------------
    "writing": [
        {
            "id": "a1-write-01-profile-card",
            "unitId": "a1-u01-first-contact",
            "title": "Tarjeta de presentación para el club de idiomas",
            "wordRange": "20-35 palabras",
            "promptRu": "Напишите короткую анкету-визитку на испанском языке (3-4 предложения):\n1. Поздоровайтесь.\n2. Напишите свое имя и возраст.\n3. Укажите свою национальность и город проживания.\n4. Назовите языки, на которых говорите.\n5. Пожелайте собеседникам хорошего дня.",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение коммуникативной задачи", "max": 30, "description": "Представлены все запрашиваемые данные (имя, возраст, страна, языки)."},
                    {"name": "Грамматическая правильность", "max": 30, "description": "Корректное использование глаголов llamarse, tener, ser, hablar."},
                    {"name": "Словарный запас A1", "max": 25, "description": "Использование формул вежливости и лексики первого контакта."},
                    {"name": "Связность и пунктуация", "max": 15, "description": "Логичное деление на предложения, знаки ¡! и ¿?, заглавные буквы."}
                ]
            }
        },
        {
            "id": "a1-write-02-my-home",
            "unitId": "a1-u02-things",
            "title": "Descripción de mi casa o habitación",
            "wordRange": "30-50 palabras",
            "promptRu": "Опишите ваше жилье или комнату для сайта аренды (4-5 предложений):\n1. Назовите тип жилья и этаж (Vivo en un piso/casa en el segundo piso...).\n2. Перечислите комнаты через конструкцию HAY (Tiene un salón, dos dormitorios...).\n3. Опишите мебель и цвета в гостиной или спальне с согласованием (El sofá es gris, la mesa es grande...).\n4. Опишите атмосферу (Es muy luminoso y tranquilo).",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение задачи", "max": 30, "description": "Описаны комнаты, мебель, цвета и атмосфера жилья."},
                    {"name": "Грамматика рода и числа", "max": 30, "description": "Точное согласование артиклей и прилагательных (el sofá, la mesa blanca...)."},
                    {"name": "Лексика дома и мебели", "max": 25, "description": "Слова salón, cocina, dormitorio, cama, mesa, armario, luminoso..."},
                    {"name": "Связность текста", "max": 15, "description": "Плавные переходы между предложениями."}
                ]
            }
        },
        {
            "id": "a1-write-03-friend-description",
            "unitId": "a1-u03-identity",
            "title": "Retrato de mi mejor amigo/a",
            "wordRange": "35-55 palabras",
            "promptRu": "Напишите подробный портрет вашего друга или подруги (4-5 предложений):\n1. Назовите имя, возраст и профессию (Mi amigo se llama..., tiene ... años y es...).\n2. Опишите рост и фигуру через SER (Es alto/bajo, delgado...).\n3. Опишите волосы и глаза через TENER (Tiene el pelo corto/rizado y los ojos...).\n4. Опишите черты характера (Es muy alegre, simpático y trabajador).",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение коммуникативной задачи", "max": 30, "description": "Полный портрет с внешностью, возрастом, профессией и характером."},
                    {"name": "Триада SER / TENER / LLEVAR", "max": 30, "description": "Безошибочное использование SER для роста/характера и TENER для волос/глаз."},
                    {"name": "Лексика внешности и характера", "max": 25, "description": "Слова alto, rubio/moreno, ojos marrones/azules, simpático, paciente..."},
                    {"name": "Орфография и пунктуация", "max": 15, "description": "Правильные окончания -o/-a, акценты."}
                ]
            }
        },
        {
            "id": "a1-write-04-daily-email",
            "unitId": "a1-u05-actions",
            "title": "Correo sobre mi rutina diaria a un amigo",
            "wordRange": "40-65 palabras",
            "promptRu": "Напишите электронное письмо другу о вашем обычном рабочем или учебном дне (5-6 предложений):\n1. Начните с дружеского приветствия (¡Hola! ¿Qué tal estás?).\n2. Напишите, во сколько вы просыпаетесь и завтракаете (Me despierto a las...).\n3. Опишите вашу работу или учебу (Trabajo en... de ... a ...).\n4. Напишите, что вы делаете вечером (Por la tarde cocino, leo, estudio español...).\n5. Попрощайтесь (Un abrazo, hasta pronto).",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение задачи и формат письма", "max": 30, "description": "Формат дружеского письма с приветствием, распорядком и прощанием."},
                    {"name": "Спряжение глаголов в Presente", "max": 30, "description": "Правильные личные окончания глаголов -AR, -ER, -IR."},
                    {"name": "Лексика времени и распорядка", "max": 25, "description": "Слова despertarse, desayunar, trabajar, comer, estudiar, por la tarde..."},
                    {"name": "Связность и пунктуация", "max": 15, "description": "Логика текста, заглавные буквы, запятые."}
                ]
            }
        },
        {
            "id": "a1-write-05-restaurant-review",
            "unitId": "a1-u07-food",
            "title": "Reseña de mi restaurante favorito",
            "wordRange": "45-70 palabras",
            "promptRu": "Напишите короткий отзыв о вашем любимом кафе или ресторане (5-6 предложений):\n1. Назовите ресторан и где он находится (Mi restaurante favorito es... y está en el centro de...).\n2. Что вы обычно заказываете на первое и второе блюдо (De primero pido..., de segundo como...).\n3. Какие там напитки и десерты (Bebo agua/vino y de postre me encanta el flan/helado...).\n4. Опишите обслуживание официантов и цены (Los camareros son muy amables y el menú del día cuesta doce euros).\n5. Порекомендуйте место другим (Recomiendo este lugar a todos).",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение коммуникативной задачи", "max": 30, "description": "Описаны ресторан, меню, напитки, десерты, персонал и цены."},
                    {"name": "Грамматическая точность", "max": 30, "description": "Правильное использование SER/ESTAR, глаголов питания и цен."},
                    {"name": "Лексика гастрономии", "max": 25, "description": "Слова primer plato, sopa, carne, pescado, bebida, postre, camarero, cuenta."},
                    {"name": "Связность и оформление", "max": 15, "description": "Логичная структура отзыва."}
                ]
            }
        },
        {
            "id": "a1-write-06-vacation-plans",
            "unitId": "a1-u09-needs",
            "title": "Mis planes de viaje para las próximas vacaciones",
            "wordRange": "50-80 palabras",
            "promptRu": "Напишите подробный рассказ о ваших планах на предстоящий отпуск (5-7 предложений):\n1. Куда и в каком месяце вы собираетесь поехать (En agosto voy a viajar a...).\n2. На каком транспорте вы поедете (Voy a ir en tren/avión...).\n3. С кем вы поедете и где остановитесь (Voy a viajar con mi familia/amigos y vamos a dormir en un hotel cerca del mar).\n4. Какую одежду вы собираетесь взять или купить (Voy a llevar camisetas, vestidos, gafas de sol...).\n5. Что вы планируете делать на месте (Vamos a visitar monumentos, comer paella y descansar en la playa).\n6. Используйте конструкцию «IR A + инфинитив» минимум 4 раза.",
            "rubric": {
                "total": 100,
                "criteria": [
                    {"name": "Выполнение коммуникативной задачи", "max": 30, "description": "Полный план путешествия (направление, транспорт, попутчики, одежда, активности)."},
                    {"name": "Конструкция будущего времени (IR A + inf.)", "max": 30, "description": "Многократное безошибочное использование voy a / vamos a + инфинитив."},
                    {"name": "Богатый словарный запас A1", "max": 25, "description": "Слова по темам путешествий, транспорта, одежды, погоды и еды."},
                    {"name": "Связность, орфография и пунктуация", "max": 15, "description": "Грамотное оформление развернутого текста."}
                ]
            }
        }
    ]
}

# Save JSON
with open('/srv/LinguaLearn/spanish/server/a1SkillTasksData.json', 'w', encoding='utf-8') as f:
    json.dump(skills_data, f, ensure_ascii=False, indent=2)

# Save JS module
with open('/srv/LinguaLearn/spanish/server/a1SkillTasksData.js', 'w', encoding='utf-8') as f:
    f.write("/**\n * Complete CEFR A1 Skill Evidence Tasks\n * Distributed listening, speaking, reading, and writing tasks with clear rubrics 0..100.\n */\n")
    f.write("export const A1_SKILL_TASKS = Object.freeze(\n")
    f.write(json.dumps(skills_data, ensure_ascii=False, indent=2))
    f.write("\n);\n\n")
    f.write("""export function getA1SkillTasks(skill) {
  return A1_SKILL_TASKS[skill] || [];
}

export function getA1SkillTaskById(skill, taskId) {
  const list = A1_SKILL_TASKS[skill] || [];
  return list.find(t => t.id === taskId) || null;
}
""")

print("Saved server/a1SkillTasksData.json and server/a1SkillTasksData.js successfully!")
for sk, tasks in skills_data.items():
    print(f"Skill '{sk}': {len(tasks)} tasks.")
