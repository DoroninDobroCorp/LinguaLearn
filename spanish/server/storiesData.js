// Interactive Graded Stories with Branching Narratives for LinguaLearn Spanish

export const PRESET_STORIES = [
  {
    "id": "story-mateo-aventura-a1",
    "title": "La Gran Aventura Porteña con Mateo",
    "level": "A1",
    "dialect": "Rioplatense (Argentina)",
    "coverEmoji": "🇦🇷",
    "summary": "Tu viaje completo por Buenos Aires junto a tu amigo Mateo: desde tu llegada a Ezeiza hasta la gran fiesta de graduación A1.",
    "xpReward": 250,
    "chapters": [
      {
        "id": "u1_ch1_ezeiza",
        "unitId": "a1-u01-first-contact",
        "title": "Capítulo 1: El Encuentro en Ezeiza 🛬",
        "text": "Tu avión aterriza en el aeropuerto internacional de Ezeiza. Pasas por el control de aduanas con tu pasaporte y tu maleta. En la sala de llegadas hay mucha gente con carteles. De repente, ves a un joven sonriente con un cartel que dice tu nombre: es Mateo, tu amigo y guía en Argentina.",
        "dialogue": [
          {
            "speaker": "Mateo",
            "text": "¡Hola! ¡Bienvenido a Buenos Aires! ¿Cómo estás? ¿El vuelo fue muy largo?"
          },
          {
            "speaker": "Tú",
            "text": "¡Hola, Mateo! Muy bien, gracias. Un poco cansado, pero muy feliz de estar acá."
          },
          {
            "speaker": "Mateo",
            "text": "¡Qué alegría! Tomemos un taxi hacia la Avenida de Mayo. Son las tres de la tarde y el día está hermoso."
          }
        ],
        "vocabHighlights": [
          {
            "word": "bienvenido",
            "translation": "добро пожаловать",
            "note": "Saludo hospitalario"
          },
          {
            "word": "vuelo",
            "translation": "полет / рейс",
            "note": "Viaje en avión"
          },
          {
            "word": "maleta",
            "translation": "чемодан",
            "note": "Equipaje de viaje"
          },
          {
            "word": "acá",
            "translation": "здесь (в Аргентине)",
            "note": "Variante de 'aquí' muy común en el Río de la Plata"
          },
          {
            "word": "tomemos",
            "translation": "давай возьмем / поедем",
            "note": "Forma de tomar (tomar un taxi)"
          }
        ],
        "question": {
          "prompt": "¿A qué hora llegan al aeropuerto en la historia?",
          "options": [
            "A las ocho de la mañana",
            "A las tres de la tarde",
            "A las diez de la noche",
            "Al mediodía"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-1a",
            "text": "«Mateo, ¿podemos parar en un quiosco a comprar agua y alfajores?»",
            "targetChapterId": "u2_ch2_san_telmo",
            "consequence": "Mateo sonríe y compran dos alfajores de dulce de leche para el camino."
          },
          {
            "id": "choice-1b",
            "text": "«¡Vamos directo a la ciudad! Quiero ver el Obelisco y las avenidas.»",
            "targetChapterId": "u2_ch2_san_telmo",
            "consequence": "El taxi entra a la autopista y contemplan la inmensa silueta de Buenos Aires."
          }
        ]
      },
      {
        "id": "u2_ch2_san_telmo",
        "unitId": "a1-u02-things",
        "title": "Capítulo 2: Los Colores de San Telmo 🎨",
        "text": "Al día siguiente, caminan por la calle Defensa en el histórico barrio de San Telmo. Las calles empedradas están llenas de puestos artesanales con objetos curiosos: lámparas antiguas, mates de plata, sombreros negros y pinturas de colores vivos: rojo, azul, verde y amarillo.",
        "dialogue": [
          {
            "speaker": "Mateo",
            "text": "Mirá esta taza azul y este cuaderno de cuero marrón. Son ideales para tus notas de español."
          },
          {
            "speaker": "Vendedora",
            "text": "¡Buen día! La taza roja cuesta quinientos pesos y el cuaderno marrón ochocientos. ¿Cuál te gusta más?"
          }
        ],
        "vocabHighlights": [
          {
            "word": "empedradas",
            "translation": "мощеные брусчаткой",
            "note": "Calles de adoquines"
          },
          {
            "word": "puestos",
            "translation": "палатки / лотки",
            "note": "Puestos de venta callejera"
          },
          {
            "word": "cuaderno",
            "translation": "тетрадь / блокнот",
            "note": "Libro en blanco para escribir"
          },
          {
            "word": "colores vivos",
            "translation": "яркие цвета",
            "note": "Tonos brillantes e intensos"
          }
        ],
        "question": {
          "prompt": "¿De qué color es la taza que señala Mateo?",
          "options": [
            "Verde",
            "Azul",
            "Amarilla",
            "Negra"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-2a",
            "text": "«Me llevo el cuaderno de cuero marrón para escribir mi diario.»",
            "targetChapterId": "u3_ch3_la_boca",
            "consequence": "La vendedora envuelve el cuaderno con un moño y te desea una hermosa estadía."
          },
          {
            "id": "choice-2b",
            "text": "«Prefiero la taza azul para tomar café en las mañanas.»",
            "targetChapterId": "u3_ch3_la_boca",
            "consequence": "Guardas la taza en tu mochila con mucho cuidado."
          }
        ]
      },
      {
        "id": "u3_ch3_la_boca",
        "unitId": "a1-u03-identity",
        "title": "Capítulo 3: El Taller de Arte en La Boca 🎭",
        "text": "Llegan a Caminito en La Boca. Las casas de chapa son de muchos colores: amarillo, rojo y celeste. Entran al taller de Sofía, una pintora talentosa. Sofía es alta, simpática y muy creativa. Hoy está muy contenta porque tiene una nueva exposición.",
        "dialogue": [
          {
            "speaker": "Mateo",
            "text": "Sofía es mi prima. Ella es artista plástica y vive acá en La Boca desde hace cinco años."
          },
          {
            "speaker": "Sofía",
            "text": "¡Hola! Mucho gusto. Yo soy Sofía. ¿Cómo estás hoy? ¿Estás cansado o con energía?"
          },
          {
            "speaker": "Tú",
            "text": "¡Mucho gusto! Estoy muy entusiasmado. Tu taller es hermoso y las pinturas son fascinantes."
          }
        ],
        "vocabHighlights": [
          {
            "word": "chapa",
            "translation": "жесть / листовой металл",
            "note": "Material típico de las casas de Caminito"
          },
          {
            "word": "talentosa",
            "translation": "талантливая",
            "note": "Con gran habilidad artística"
          },
          {
            "word": "contenta",
            "translation": "довольная / радостная",
            "note": "Estado de ánimo con 'estar'"
          },
          {
            "word": "entusiasmado",
            "translation": "воодушевленный",
            "note": "Estado emocional con 'estar'"
          }
        ],
        "question": {
          "prompt": "¿Cómo es la personalidad de Sofía según la historia?",
          "options": [
            "Tímida y seria",
            "Alta, simpática y creativa",
            "Aburrida y antipática",
            "Triste y callada"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-3a",
            "text": "Ayudar a Sofía a mezclar los colores para un cuadro de tango.",
            "targetChapterId": "u4_ch4_palermo_asado",
            "consequence": "Sofía te enseña cómo lograr el color dorado perfecto con témperas y óleos."
          },
          {
            "id": "choice-3b",
            "text": "Preguntarle a Sofía sobre la historia de los inmigrantes en La Boca.",
            "targetChapterId": "u4_ch4_palermo_asado",
            "consequence": "Sofía te cuenta cómo los marineros genoveses pintaban sus casas con restos de pintura de barcos."
          }
        ]
      },
      {
        "id": "u4_ch4_palermo_asado",
        "unitId": "a1-u04-family",
        "title": "Capítulo 4: El Asado del Domingo en Palermo 🥩",
        "text": "Es domingo al mediodía. En Argentina, el domingo es el día de la familia y el asado. Llegas a la casa de los tíos de Mateo en el barrio de Palermo. En el patio grande hay una parrilla con leña y una mesa larga para doce personas. El abuelo Horacio tiene setenta y dos años y cuenta historias divertidas.",
        "dialogue": [
          {
            "speaker": "Abuelo Horacio",
            "text": "¡Pasen, pasen! Mi casa es su casa. ¿Tienen hambre? La carne está casi lista."
          },
          {
            "speaker": "Mateo",
            "text": "Te presento a mi familia: mis tíos Carlos y Laura, mi primo Lucas que tiene doce años, y mi abuelo."
          },
          {
            "speaker": "Tú",
            "text": "¡Muchas gracias por la invitación! Tienen una familia muy cálida y hermosa."
          }
        ],
        "vocabHighlights": [
          {
            "word": "asado",
            "translation": "барбекю / мясо на гриле",
            "note": "Tradición gastronómica rioplatense"
          },
          {
            "word": "parrilla",
            "translation": "решетка-гриль",
            "note": "Lugar donde se asa la carne con brasas"
          },
          {
            "word": "leña",
            "translation": "дрова",
            "note": "Madera para hacer fuego"
          },
          {
            "word": "tener hambre",
            "translation": "хотеть есть / быть голодным",
            "note": "Expresión fija con 'tener'"
          }
        ],
        "question": {
          "prompt": "¿Cuántos años tiene el abuelo Horacio?",
          "options": [
            "65 años",
            "72 años",
            "80 años",
            "58 años"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-4a",
            "text": "Aprender a preparar la salsa chimichurri con la abuela Laura.",
            "targetChapterId": "u5_ch5_subte_ciudad",
            "consequence": "Mezclas perejil fresco, orégano, ajo, aceite y vinagre. ¡Queda deliciosa!"
          },
          {
            "id": "choice-4b",
            "text": "Jugar al truco (juego de cartas) con Mateo y su primo Lucas.",
            "targetChapterId": "u5_ch5_subte_ciudad",
            "consequence": "Lucas te enseña las señas secretas y ganan la primera partida entre risas."
          }
        ]
      },
      {
        "id": "u5_ch5_subte_ciudad",
        "unitId": "a1-u05-actions",
        "title": "Capítulo 5: Un Día en la Ciudad y el Subte 🚇",
        "text": "Comienza una nueva semana. Te levantas temprano, desayunas tostadas con café y sales a explorar la ciudad. Caminas hasta la estación Plaza de Mayo para tomar la histórica Línea A del Subte de Buenos Aires. En la ventanilla compras tu tarjeta de transporte.",
        "dialogue": [
          {
            "speaker": "Tú",
            "text": "¡Hola! Buenos días. ¿Tiene una tarjeta SUBE para viajar en metro y autobús?"
          },
          {
            "speaker": "Empleado del Subte",
            "text": "¡Buen día! Sí, claro. Cuesta cuatrocientos pesos y podés cargarle saldo acá mismo."
          },
          {
            "speaker": "Mateo",
            "text": "¿A dónde querés ir primero hoy? ¿Caminamos por la librería El Ateneo o visitamos el Jardín Botánico?"
          }
        ],
        "vocabHighlights": [
          {
            "word": "subte",
            "translation": "метро (в Аргентине)",
            "note": "Abreviatura de subterráneo"
          },
          {
            "word": "ventanilla",
            "translation": "билетная касса / окошко",
            "note": "Lugar de atención al público"
          },
          {
            "word": "cargar saldo",
            "translation": "пополнить баланс",
            "note": "Poner dinero en una tarjeta de transporte"
          },
          {
            "word": "temprano",
            "translation": "рано",
            "note": "A primera hora del día"
          }
        ],
        "question": {
          "prompt": "¿Cómo se llama la tarjeta de transporte en Buenos Aires?",
          "options": [
            "MetroPass",
            "SUBE",
            "Boleto Único",
            "Tarjeta Azul"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-5a",
            "text": "Visitar la famosa librería El Ateneo Grand Splendid en un antiguo teatro.",
            "targetChapterId": "u6_ch6_teatro_colon",
            "consequence": "Subes al antiguo escenario convertido en cafetería y lees un libro bajo la cúpula pintada."
          },
          {
            "id": "choice-5b",
            "text": "Pasear por el Rosedal y el Jardín Botánico de Palermo.",
            "targetChapterId": "u6_ch6_teatro_colon",
            "consequence": "Caminas entre miles de rosas rojas y blancas mientras el sol brilla en el lago."
          }
        ]
      },
      {
        "id": "u6_ch6_teatro_colon",
        "unitId": "a1-u06-calendar",
        "title": "Capítulo 6: La Gran Noche en el Teatro Colón 🏛️",
        "text": "Es viernes por la noche, quince de octubre. Son exactamente las siete y media. Frente al majestuoso Teatro Colón, las luces doradas iluminan las columnas de mármol. Tienes dos entradas para el concierto sinfónico de tango y música clásica.",
        "dialogue": [
          {
            "speaker": "Mateo",
            "text": "¡Llegamos justo a tiempo! La función empieza a las ocho en punto."
          },
          {
            "speaker": "Acomodador",
            "text": "Buenas noches, señores. Sus asientos están en la fila cuatro del palco central."
          },
          {
            "speaker": "Tú",
            "text": "¿A qué hora termina la función, por favor?"
          },
          {
            "speaker": "Acomodador",
            "text": "El concierto dura dos horas, termina a las diez en punto."
          }
        ],
        "vocabHighlights": [
          {
            "word": "justo a tiempo",
            "translation": "как раз вовремя",
            "note": "En el momento exacto"
          },
          {
            "word": "palco",
            "translation": "ложа в театре",
            "note": "Espacio exclusivo con asientos elevados"
          },
          {
            "word": "función",
            "translation": "сеанс / спектакль",
            "note": "Representación teatral o musical"
          },
          {
            "word": "en punto",
            "translation": "ровно (по часам)",
            "note": "Hora exacta (ej. a las ocho en punto)"
          }
        ],
        "question": {
          "prompt": "¿A qué hora comienza la función en el Teatro Colón?",
          "options": [
            "A las siete y media",
            "A las ocho en punto",
            "A las nueve y cuarto",
            "A las diez"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-6a",
            "text": "Escuchar atentamente el solo de violín y bandoneón en el palco central.",
            "targetChapterId": "u7_ch7_cena_corrientes",
            "consequence": "La acústica perfecta del teatro hace vibrar cada nota musical. ¡El público ovaciona de pie!"
          },
          {
            "id": "choice-6b",
            "text": "Sacar una foto discreta del techo pintado por Raúl Soldi durante el intervalo.",
            "targetChapterId": "u7_ch7_cena_corrientes",
            "consequence": "La cúpula iluminada es una verdadera obra de arte con figuras alegóricas de la música."
          }
        ]
      },
      {
        "id": "u7_ch7_cena_corrientes",
        "unitId": "a1-u07-food",
        "title": "Capítulo 7: La Cena en la Pizzería Tradicional 🍕",
        "text": "Al salir del teatro, caminan por la animada Avenida Corrientes. La calle nunca duerme: teatros abiertos, librerías nocturnas y pizzerías legendarias. Entran a la famosa pizzería Güerrín. El salón está lleno y el mozo les acerca la carta de comidas y bebidas.",
        "dialogue": [
          {
            "speaker": "Mozo",
            "text": "¡Buenas noches! ¿Qué van a comer hoy? Tenemos fugazzeta rellena, muzzarella y empanadas de carne."
          },
          {
            "speaker": "Mateo",
            "text": "Para mí, dos porciones de fugazzeta rellena con queso y cebolla. ¿Y para vos?"
          },
          {
            "speaker": "Tú",
            "text": "Yo quiero una porción de muzzarella, dos empanadas y agua mineral con gas, por favor."
          },
          {
            "speaker": "Mozo",
            "text": "¡Marchando! En diez minutos se los traigo a la mesa."
          }
        ],
        "vocabHighlights": [
          {
            "word": "porción",
            "translation": "кусок / порция",
            "note": "Trozo de pizza"
          },
          {
            "word": "fugazzeta",
            "translation": "пицца с луком и сыром",
            "note": "Pizza típica porteña rellena de queso"
          },
          {
            "word": "con gas",
            "translation": "с газом (о воде)",
            "note": "Agua carbonatada"
          },
          {
            "word": "carta",
            "translation": "меню ресторана",
            "note": "Lista de platos y precios"
          }
        ],
        "question": {
          "prompt": "¿Qué bebida pide el estudiante en la pizzería?",
          "options": [
            "Jugo de naranja",
            "Agua mineral con gas",
            "Cerveza artesanal",
            "Café con leche"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-7a",
            "text": "Comer la pizza de pie en el mostrador como hacen los auténticos porteños.",
            "targetChapterId": "u8_ch8_nuevo_depto",
            "consequence": "Disfrutan del queso derretido caliente en el mostrador mientras conversan con el maestro pizzero."
          },
          {
            "id": "choice-7b",
            "text": "Pedir de postre un flan casero con dulce de leche y crema.",
            "targetChapterId": "u8_ch8_nuevo_depto",
            "consequence": "El mozo trae una porción generosa de flan mixto. ¡El dulce de leche argentino es insuperable!"
          }
        ]
      },
      {
        "id": "u8_ch8_nuevo_depto",
        "unitId": "a1-u08-home",
        "title": "Capítulo 8: El Nuevo Departamento en San Telmo 🏢",
        "text": "Decides alquilar un departamento temporal para tu estancia de estudio. Mateo te acompaña a ver un departamento en un tercer piso con balcón a la calle. El dueño, Don Esteban, les muestra cada habitación con amabilidad.",
        "dialogue": [
          {
            "speaker": "Don Esteban",
            "text": "Miren, acá está el living comedor con una mesa de madera y cuatro sillas. En el dormitorio hay una cama grande y un placard amplio."
          },
          {
            "speaker": "Tú",
            "text": "¿Hay lavarropas en el departamento? ¿Y la cocina tiene heladera y microondas?"
          },
          {
            "speaker": "Don Esteban",
            "text": "Sí, la cocina está totalmente equipada. La heladera está al lado de la ventana y el lavarropas en el lavadero."
          },
          {
            "speaker": "Mateo",
            "text": "¡El departamento es luminoso, silencioso y queda cerca de la estación de metro!"
          }
        ],
        "vocabHighlights": [
          {
            "word": "living comedor",
            "translation": "гостиная-столовая",
            "note": "Espacio principal de la casa"
          },
          {
            "word": "placard",
            "translation": "встроенный шкаф",
            "note": "Armario para ropa (uso rioplatense)"
          },
          {
            "word": "heladera",
            "translation": "холодильник",
            "note": "Electrodoméstico de frío (refrigerador)"
          },
          {
            "word": "lavadero",
            "translation": "прачечная зона",
            "note": "Lugar para lavar la ropa"
          }
        ],
        "question": {
          "prompt": "¿En qué piso queda el departamento que visitan?",
          "options": [
            "En planta baja",
            "En el primer piso",
            "En el tercer piso",
            "En el décimo piso"
          ],
          "correctIndex": 2
        },
        "choices": [
          {
            "id": "choice-8a",
            "text": "Firmar el acuerdo y organizar los muebles del balcón para tomar mate al atardecer.",
            "targetChapterId": "u9_ch9_graduacion_fiesta",
            "consequence": "Don Esteban te entrega las llaves de bronce. ¡Ya tienes tu propio hogar en Buenos Aires!"
          },
          {
            "id": "choice-8b",
            "text": "Comprar plantas y flores en el vivero de la esquina para decorar la sala.",
            "targetChapterId": "u9_ch9_graduacion_fiesta",
            "consequence": "Llenas el balcón de jazmines y helechos verdes que perfuman toda la casa."
          }
        ]
      },
      {
        "id": "u9_ch9_graduacion_fiesta",
        "unitId": "a1-u09-needs",
        "title": "Capítulo 9: El Gran Viaje y la Fiesta de Graduación A1 🎓✨",
        "text": "Llega el final de tu primera etapa de aprendizaje. ¡Has completado todas las unidades del nivel A1 de español! Mateo y sus amigos organizan una fiesta sorpresa en la terraza del edificio. Todos brindan con copas en alto. El próximo mes vas a viajar a Bariloche y los glaciares de la Patagonia.",
        "dialogue": [
          {
            "speaker": "Mateo",
            "text": "¡Un aplauso para nuestro amigo! Cuando llegaste a Ezeiza no hablabas casi nada de español, ¡y hoy entendés, hablás, leés y escribís con fluidez A1!"
          },
          {
            "speaker": "Sofía",
            "text": "¡Felicitaciones! ¿Qué ropa vas a llevar a Bariloche? En el sur hace frío, necesitás una campera abrigada, guantes y bufanda."
          },
          {
            "speaker": "Tú",
            "text": "¡Muchas gracias a todos por su cariño y ayuda! Me encanta el español, me fascina Argentina y estoy listo para seguir aprendiendo."
          }
        ],
        "vocabHighlights": [
          {
            "word": "brindan",
            "translation": "произносят тост / чокаются",
            "note": "Chocar copas en celebración"
          },
          {
            "word": "campera",
            "translation": "куртка (в Аргентине)",
            "note": "Chaqueta o abrigo"
          },
          {
            "word": "guantes",
            "translation": "перчатки",
            "note": "Prenda para proteger las manos del frío"
          },
          {
            "word": "bufanda",
            "translation": "шарф",
            "note": "Prenda de lana para el cuello"
          },
          {
            "word": "felicitaciones",
            "translation": "поздравляю / поздравления",
            "note": "Expresión de enhorabuena"
          }
        ],
        "question": {
          "prompt": "¿A qué destino del sur argentino va a viajar el estudiante el próximo mes?",
          "options": [
            "A Mendoza",
            "A Bariloche y la Patagonia",
            "A Salta",
            "A Mar del Plata"
          ],
          "correctIndex": 1
        },
        "isEnd": true,
        "choices": []
      }
    ]
  },
  {
    "id": "story-tortoni-a1",
    "title": "El Secreto del Café Tortoni",
    "level": "A1",
    "dialect": "Rioplatense (Argentina)",
    "coverEmoji": "☕",
    "summary": "Llegas al mítico Café Tortoni en Buenos Aires. Un viejo mozo te entrega una misteriosa partitura de tango.",
    "xpReward": 120,
    "chapters": [
      {
        "id": "ch1",
        "title": "Capítulo 1: La Llegada a Avenida de Mayo",
        "text": "Es una tarde de otoño en Buenos Aires. El cielo está gris y caminas por la hermosa Avenida de Mayo. Entras al Café Tortoni. El aroma a café tostado y chocolate caliente llena el salón histórico.",
        "dialogue": [
          {
            "speaker": "Mozo",
            "text": "¡Buenas tardes! Bienvenido al Tortoni, pibe. ¿Buscás mesa para uno o estás esperando a alguien?"
          }
        ],
        "vocabHighlights": [
          {
            "word": "otoño",
            "translation": "осень",
            "note": "Estación del año entre verano e invierno"
          },
          {
            "word": "aroma",
            "translation": "аромат",
            "note": "Sustantivo masculino: el aroma"
          },
          {
            "word": "pibe",
            "translation": "парень / молодой человек",
            "note": "Lunfardo argentino para muchacho/chico"
          },
          {
            "word": "buscás",
            "translation": "ты ищешь (voseo)",
            "note": "Forma de voseo del verbo buscar (vos buscás)"
          }
        ],
        "question": {
          "prompt": "¿Qué estación del año es en la historia?",
          "options": [
            "Verano",
            "Otoño",
            "Primavera",
            "Invierno"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-1a",
            "text": "«Mesa para uno, por favor. Quiero sentarme cerca del piano.»",
            "targetChapterId": "ch2_piano",
            "consequence": "El mozo te sonríe y te acompaña a una mesa de roble al lado del piano de cola."
          },
          {
            "id": "choice-1b",
            "text": "«Prefiero una mesa en la esquina para leer y observar el café.»",
            "targetChapterId": "ch2_corner",
            "consequence": "Te sientas en un rincón tranquilo con una lámpara antigua de bronce."
          }
        ]
      },
      {
        "id": "ch2_piano",
        "title": "Capítulo 2: La Partitura Escondida",
        "text": "Te sientas junto al piano. Un señor elegante con sombrero de tango se acerca. Pone un sobre antiguo sobre tu mesa y susurra: «Carlos Gardel dejó esto aquí en 1930. Solo alguien con buen oído puede descifrar la última nota».",
        "dialogue": [
          {
            "speaker": "Señor elegante",
            "text": "Si te animás a tocar la primera nota, el tango cobrará vida."
          }
        ],
        "vocabHighlights": [
          {
            "word": "piano de cola",
            "translation": "рояль",
            "note": "Piano grande horizontal"
          },
          {
            "word": "sobre",
            "translation": "конверт",
            "note": "Envoltorio de papel para cartas"
          },
          {
            "word": "animás",
            "translation": "осмелишься (voseo)",
            "note": "Del verbo animarse: vos te animás"
          },
          {
            "word": "cobrará vida",
            "translation": "оживет",
            "note": "Expresión: hacerse realidad o tener vida"
          }
        ],
        "question": {
          "prompt": "¿De qué año es el misterioso documento?",
          "options": [
            "1910",
            "1930",
            "1950",
            "1980"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-2a",
            "text": "Abrir el sobre con cuidado y leer las notas musicales.",
            "targetChapterId": "ch3_ending_music",
            "consequence": "Lees las notas en clave de sol: ¡es un tango inédito dedicado a la luna de Buenos Aires!"
          },
          {
            "id": "choice-2b",
            "text": "Pedirle al señor que te cuente la historia de Carlos Gardel.",
            "targetChapterId": "ch3_ending_story",
            "consequence": "El señor pide dos cafés con medialunas y te relata una fascinante noche de 1930."
          }
        ]
      },
      {
        "id": "ch2_corner",
        "title": "Capítulo 2: El Diario Perdido",
        "text": "En la esquina tranquila, notas que debajo de la servilletera hay una pequeña libreta de cuero marrón con notas manuscritas en español.",
        "dialogue": [
          {
            "speaker": "Mozo",
            "text": "Che, esa libreta la olvidó un poeta ayer. Si querés, podés hojearla mientras te traigo un café con leche con tres medialunas."
          }
        ],
        "vocabHighlights": [
          {
            "word": "esquina",
            "translation": "угол",
            "note": "Rincón o intersección"
          },
          {
            "word": "servilletera",
            "translation": "салфетница",
            "note": "Soporte para servilletas"
          },
          {
            "word": "hojearla",
            "translation": "полистать её",
            "note": "Pasar las hojas de un libro o libreta"
          },
          {
            "word": "medialunas",
            "translation": "круассаны / полумесяцы",
            "note": "Típica factura dulce argentina"
          }
        ],
        "question": {
          "prompt": "¿Qué olvidó el poeta en la mesa?",
          "options": [
            "Un sombrero",
            "Una libreta de cuero",
            "Un reloj de oro",
            "Una partitura"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-2c",
            "text": "Leer el primer poema de la libreta en voz alta.",
            "targetChapterId": "ch3_ending_poem",
            "consequence": "El poema describe las calles empedradas de San Telmo y una cita bajo los faroles."
          },
          {
            "id": "choice-2d",
            "text": "Entregar la libreta al mozo para que la guarde con seguridad.",
            "targetChapterId": "ch3_ending_reward",
            "consequence": "El mozo te agradece por tu honestidad y te invita la merienda porteña."
          }
        ]
      },
      {
        "id": "ch3_ending_music",
        "title": "Final: La Melodía Inmortal 🎵",
        "text": "Tocas la melodía en el piano. Los clientes del café hacen silencio y luego aplauden con entusiasmo. El señor del sombrero sonríe, saluda tocando su sombrero y desaparece entre la multitud de Avenida de Mayo. ¡Has descubierto el Tango Perdido de Buenos Aires!",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "multitud",
            "translation": "толпа",
            "note": "Gran cantidad de gente"
          },
          {
            "word": "inmortal",
            "translation": "бессмертный",
            "note": "Que perdura en el tiempo"
          }
        ]
      },
      {
        "id": "ch3_ending_story",
        "title": "Final: Noche de Leyendas 📖",
        "text": "Entre sorbos de café humeante y medialunas doradas, el señor te cuenta historias inolvidables sobre los grandes artistas de la época dorada de Buenos Aires. ¡Te sientes como un verdadero porteño!",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "humeante",
            "translation": "дымящийся",
            "note": "Muy caliente"
          },
          {
            "word": "época dorada",
            "translation": "золотой век / эпоха",
            "note": "Periodo de gran esplendor cultural"
          }
        ]
      },
      {
        "id": "ch3_ending_poem",
        "title": "Final: La Inspiración del Poeta ✨",
        "text": "Las palabras del poema despiertan tu amor por la literatura en español. Al terminar de leer, una pareja de ancianos en la mesa vecina te felicita por tu hermosa pronunciación. ¡Una tarde mágica en Buenos Aires!",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "despiertan",
            "translation": "пробуждают",
            "note": "Del verbo despertar"
          },
          {
            "word": "pronunciación",
            "translation": "произношение",
            "note": "Modo de articular sonidos"
          }
        ]
      },
      {
        "id": "ch3_ending_reward",
        "title": "Final: Hospitalidad Porteña 🥐",
        "text": "El mozo te trae una bandeja con un submarino (chocolate en barra derretido en leche caliente) y medialunas recién horneadas. «Acá en Buenos Aires cuidamos a los amigos honestos», te dice con un guiño cómplice.",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "submarino",
            "translation": "горячий шоколад по-аргентински",
            "note": "Barra de chocolate que se sumerge en leche hirviendo"
          },
          {
            "word": "guiño cómplice",
            "translation": "понимающее подмигивание",
            "note": "Gesto de simpatía y complicidad"
          }
        ]
      }
    ]
  },
  {
    "id": "story-sevilla-tapas-a1",
    "title": "Noche de Tapas en Sevilla",
    "level": "A1",
    "dialect": "Castellano (España)",
    "coverEmoji": "🥘",
    "summary": "Recorres los callejones del barrio de Santa Cruz en Sevilla buscando las mejores tapas andaluzas.",
    "xpReward": 100,
    "chapters": [
      {
        "id": "ch1",
        "title": "Capítulo 1: Los Callejones de Santa Cruz",
        "text": "El aroma a azahar y jazmín perfuma la noche sevillana. Paseas por las calles estrechas y blancas del barrio de Santa Cruz. La música de una guitarra flamenca suena a lo lejos. Llegas a la Taberna del Duende, un bar tradicional con azulejos antiguos.",
        "dialogue": [
          {
            "speaker": "Camarero",
            "text": "¡Buenas noches! Pasad, pasad, que hay sitio en la barra. ¿Qué os apetece tomar para empezar?"
          }
        ],
        "vocabHighlights": [
          {
            "word": "azahar",
            "translation": "цветы апельсина",
            "note": "Flor blanca del naranjo"
          },
          {
            "word": "azulejos",
            "translation": "изразцы / плитка",
            "note": "Cerámica decorativa típica andaluza"
          },
          {
            "word": "os apetece",
            "translation": "вам хочется / желаете (vosotros)",
            "note": "Forma peninsular de 'querer o desear'"
          }
        ],
        "question": {
          "prompt": "¿En qué ciudad española transcurre la historia?",
          "options": [
            "Madrid",
            "Sevilla",
            "Barcelona",
            "Valencia"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-1a",
            "text": "«Queremos probar la famosa tortilla de patatas con una caña bien fría.»",
            "targetChapterId": "ch2_tortilla",
            "consequence": "El tabernero asiente entusiasmado y saca un plato humeante recién hecho."
          },
          {
            "id": "choice-1b",
            "text": "«Recomiéndanos el mejor jamón ibérico de bellota y un queso curado.»",
            "targetChapterId": "ch2_jamon",
            "consequence": "El maestro jamonero afila su cuchillo largo y te sonríe con orgullo."
          }
        ]
      },
      {
        "id": "ch2_tortilla",
        "title": "Capítulo 2: El Gran Debate de la Tortilla",
        "text": "El camarero te sirve una porción generosa de tortilla dorada con pan crujiente y aceitunas aliñadas. Los clientes de la barra discuten amistosamente sobre si la auténtica tortilla española debe llevar cebolla o no.",
        "dialogue": [
          {
            "speaker": "Cliente andaluz",
            "text": "¡Hombre! ¡Con cebolla siempre, que queda mucho más jugosa y suave!"
          },
          {
            "speaker": "Tabernero",
            "text": "¿Y tú qué opinas, amigo? ¿Con cebolla o sin cebolla?"
          }
        ],
        "vocabHighlights": [
          {
            "word": "jugosa",
            "translation": "сочная",
            "note": "Con mucho jugo o humedad deliciosa"
          },
          {
            "word": "crujiente",
            "translation": "хрустящий",
            "note": "Textura crocante"
          },
          {
            "word": "caña",
            "translation": "бокал разливного пива",
            "note": "Vaso de cerveza de grifo"
          }
        ],
        "question": {
          "prompt": "¿Cuál es el debate entre los clientes de la taberna?",
          "options": [
            "Con o sin sal",
            "Con cebolla o sin cebolla",
            "Con queso o con jamón",
            "Caliente o fría"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-2a",
            "text": "«¡Con cebolla, por supuesto! Le da un sabor dulce inigualable.»",
            "targetChapterId": "ch3_flamenco_con_cebolla",
            "consequence": "Toda la barra aplaude tu respuesta y el tabernero te regala una tapa de salmorejo cordobés."
          },
          {
            "id": "choice-2b",
            "text": "«Sin cebolla: patatas, huevos y aceite de oliva virgen extra.»",
            "targetChapterId": "ch3_guitarrero",
            "consequence": "El maestro cocinero te felicita por respetar la receta purista tradicional."
          }
        ]
      },
      {
        "id": "ch2_jamon",
        "title": "Capítulo 2: El Secreto del Maestro Cortador",
        "text": "El maestro jamonero corta lonchas casi transparentes con una destreza impresionante. El brillo del jamón ibérico refleja la luz de las lámparas de forja.",
        "dialogue": [
          {
            "speaker": "Maestro Jamonero",
            "text": "El secreto del buen jamón está en la temperatura ambiente y en la finura del corte. Pruébalo con la mano, sin pan primero."
          }
        ],
        "vocabHighlights": [
          {
            "word": "lonchas",
            "translation": "тонкие ломтики",
            "note": "Rebanadas muy finas de embutido"
          },
          {
            "word": "destreza",
            "translation": "мастерство / сноровка",
            "note": "Habilidad manual experta"
          },
          {
            "word": "curado",
            "translation": "выдержанный (о сыре или мясе)",
            "note": "Madurado con tiempo"
          }
        ],
        "question": {
          "prompt": "¿Cómo aconseja el maestro jamonero probar la primera loncha?",
          "options": [
            "Con tenedor de plata",
            "Con la mano y sin pan",
            "Con tomate rallado",
            "Con vino blanco"
          ],
          "correctIndex": 1
        },
        "choices": [
          {
            "id": "choice-2c",
            "text": "Agradecer la lección y pedir probar el queso manchego añejo.",
            "targetChapterId": "ch3_maridaje",
            "consequence": "Te sirven un queso curado con picos de pan y nueces que combina a la perfección."
          },
          {
            "id": "choice-2d",
            "text": "Pedir que te enseñe la técnica de corte con el cuchillo jamonero.",
            "targetChapterId": "ch3_corte_perfecto",
            "consequence": "Bajo su atenta mirada, cortas una loncha perfecta y te declara 'hijo honorífico de Sevilla'."
          }
        ]
      },
      {
        "id": "ch3_flamenco_con_cebolla",
        "title": "Final: ¡Olé y Duende! 💃",
        "text": "Una bailaora se levanta en el rincón y comienza a taconear al compás de la guitarra. La taberna entera canta y celebra. ¡Has vivido la auténtica magia de una noche sevillana!",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "taconear",
            "translation": "отбивать чечетку каблуками (в фламенко)",
            "note": "Golpear el suelo con el tacón"
          },
          {
            "word": "duende",
            "translation": "дуэнде / магия фламенко",
            "note": "Encanto y emoción misteriosa del arte andaluz"
          }
        ]
      },
      {
        "id": "ch3_guitarrero",
        "title": "Final: Acordes de Medianoche 🎸",
        "text": "El guitarrista se sienta a tu lado y te enseña los compases básicos por rumbas. Entre risas y aplausos, tocan juntos hasta que las campanas de la Giralda marcan la medianoche.",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "compases",
            "translation": "такты / ритмы",
            "note": "Estructura rítmica musical"
          },
          {
            "word": "medianoche",
            "translation": "полночь",
            "note": "Las 12 de la noche"
          }
        ]
      },
      {
        "id": "ch3_corte_perfecto",
        "title": "Final: El Nuevo Maestro Jamonero 🏆",
        "text": "El tabernero cuelga tu plato en la pared como recuerdo del 'estudiante que cortó la loncha perfecta'. ¡Te despiden con aplausos y una botella de aceite de oliva andaluz de regalo!",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "honorífico",
            "translation": "почетный",
            "note": "Que otorga distinción o mérito"
          }
        ]
      },
      {
        "id": "ch3_maridaje",
        "title": "Final: Banquete Andaluz 🧀",
        "text": "Disfrutas de una tabla completa de quesos de oveja, uvas dulces y jamón ibérico bajo las estrellas de Sevilla. Una velada inolvidable que recordarás siempre.",
        "isEnd": true,
        "vocabHighlights": [
          {
            "word": "velada",
            "translation": "вечер / посиделки",
            "note": "Reunión nocturna agradable"
          }
        ]
      }
    ]
  }
];
