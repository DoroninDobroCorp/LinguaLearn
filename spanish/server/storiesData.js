// Interactive Graded Stories with Branching Narratives for LinguaLearn Spanish

export const PRESET_STORIES = [
  {
    id: "story-tortoni-a1",
    title: "El Secreto del Café Tortoni",
    level: "A1",
    dialect: "Rioplatense (Argentina)",
    coverEmoji: "☕",
    summary: "Llegas al mítico Café Tortoni en Buenos Aires. Un viejo mozo te entrega una misteriosa partitura de tango.",
    xpReward: 100,
    chapters: [
      {
        id: "ch1",
        title: "Capítulo 1: La Llegada a Avenida de Mayo",
        text: "Es una tarde de otoño en Buenos Aires. El cielo está gris y caminas por la hermosa Avenida de Mayo. Entras al Café Tortoni. El aroma a café tostado y chocolate caliente llena el salón histórico.",
        dialogue: [
          { speaker: "Mozo", text: "¡Buenas tardes! Bienvenido al Tortoni, pibe. ¿Buscás mesa para uno o estás esperando a alguien?" }
        ],
        vocabHighlights: [
          { word: "otoño", translation: "осень", note: "Estación del año entre verano e invierno" },
          { word: "aroma", translation: "аромат", note: "Sustantivo masculino: el aroma" },
          { word: "pibe", translation: "парень / молодой человек", note: "Lunfardo argentino para muchacho/chico" },
          { word: "buscás", translation: "ты ищешь (voseo)", note: "Forma de voseo del verbo buscar (vos buscás)" }
        ],
        question: {
          prompt: "¿Qué estación del año es en la historia?",
          options: ["Verano", "Otoño", "Primavera", "Invierno"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-1a",
            text: "«Mesa para uno, por favor. Quiero sentarme cerca del piano.»",
            targetChapterId: "ch2_piano",
            consequence: "El mozo te sonríe y te acompaña a una mesa de roble al lado del piano de cola."
          },
          {
            id: "choice-1b",
            text: "«Prefiero una mesa en la esquina para leer y observar el café.»",
            targetChapterId: "ch2_corner",
            consequence: "Te sientas en un rincón tranquilo con una lámpara antigua de bronce."
          }
        ]
      },
      {
        id: "ch2_piano",
        title: "Capítulo 2: La Partitura Escondida",
        text: "Te sientas junto al piano. Un señor elegante con sombrero de tango se acerca. Pone un sobre antiguo sobre tu mesa y susurra: «Carlos Gardel dejó esto aquí en 1930. Solo alguien con buen oído puede descifrar la última nota».",
        dialogue: [
          { speaker: "Señor elegante", text: "Si te animás a tocar la primera nota, el tango cobrará vida." }
        ],
        vocabHighlights: [
          { word: "piano de cola", translation: "рояль", note: "Piano grande horizontal" },
          { word: "sobre", translation: "конверт", note: "Envoltorio de papel para cartas" },
          { word: "animás", translation: "осмелишься (voseo)", note: "Del verbo animarse: vos te animás" },
          { word: "cobrará vida", translation: "оживет", note: "Expresión: hacerse realidad o tener vida" }
        ],
        question: {
          prompt: "¿De qué año es el misterioso documento?",
          options: ["1910", "1930", "1950", "1980"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2a",
            text: "Abrir el sobre con cuidado y leer las notas musicales.",
            targetChapterId: "ch3_ending_music",
            consequence: "Lees las notas en clave de sol: ¡es un tango inédito dedicado a la luna de Buenos Aires!"
          },
          {
            id: "choice-2b",
            text: "Pedirle al señor que te cuente la historia de Carlos Gardel.",
            targetChapterId: "ch3_ending_story",
            consequence: "El señor pide dos cafés con medialunas y te relata una fascinante noche de 1930."
          }
        ]
      },
      {
        id: "ch2_corner",
        title: "Capítulo 2: El Diario Perdido",
        text: "En la esquina tranquila, notas que debajo de la servilletera hay una pequeña libreta de cuero marrón con notas manuscritas en español.",
        dialogue: [
          { speaker: "Mozo", text: "Che, esa libreta la olvidó un poeta ayer. Si querés, podés hojearla mientras te traigo un café con leche con tres medialunas." }
        ],
        vocabHighlights: [
          { word: "esquina", translation: "угол", note: "Rincón o intersección" },
          { word: "servilletera", translation: "салфетница", note: "Soporte para servilletas" },
          { word: "hojearla", translation: "полистать её", note: "Pasar las hojas de un libro o libreta" },
          { word: "medialunas", translation: "круассаны / полумесяцы", note: "Típica factura dulce argentina" }
        ],
        question: {
          prompt: "¿Qué olvidó el poeta en la mesa?",
          options: ["Un sombrero", "Una libreta de cuero", "Un reloj de oro", "Una partitura"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2c",
            text: "Leer el primer poema de la libreta en voz alta.",
            targetChapterId: "ch3_ending_poem",
            consequence: "El poema describe las calles empedradas de San Telmo y una cita bajo los faroles."
          },
          {
            id: "choice-2d",
            text: "Entregar la libreta al mozo para que la guarde con seguridad.",
            targetChapterId: "ch3_ending_reward",
            consequence: "El mozo te agradece por tu honestidad y te invita la merienda porteña."
          }
        ]
      },
      {
        id: "ch3_ending_music",
        title: "Final: La Melodía Inmortal 🎵",
        text: "Tocas la melodía en el piano. Los clientes del café hacen silencio y luego aplauden con entusiasmo. El señor del sombrero sonríe, saluda tocando su sombrero y desaparece entre la multitud de Avenida de Mayo. ¡Has descubierto el Tango Perdido de Buenos Aires!",
        isEnd: true,
        vocabHighlights: [
          { word: "multitud", translation: "толпа", note: "Gran cantidad de gente" },
          { word: "inmortal", translation: "бессмертный", note: "Que perdura en el tiempo" }
        ]
      },
      {
        id: "ch3_ending_story",
        title: "Final: Noche de Leyendas 📖",
        text: "Pasan dos horas conversando como viejos amigos. Aprendes que la música y la pasión porteña viven en cada rincón de la ciudad. Sales del Café Tortoni sintiéndote un verdadero conocedor de la cultura argentina.",
        isEnd: true,
        vocabHighlights: [
          { word: "rincón", translation: "уголок / закоулок", note: "Lugar apartado o especial" },
          { word: "conocedor", translation: "знаток / ценитель", note: "Persona con conocimientos profundos" }
        ]
      },
      {
        id: "ch3_ending_poem",
        title: "Final: La Inspiración del Poeta ✨",
        text: "Al terminar de leer el poema, un joven entra apresurado: «¡Mi libreta! ¡Gracias por cuidarla!». Resulta ser un célebre escritor que te invita a la tertulia literaria de esa noche en el barrio de Palermo.",
        isEnd: true,
        vocabHighlights: [
          { word: "apresurado", translation: "поспешно / торопясь", note: "Con prisa" },
          { word: "tertulia", translation: "литературный вечер / беседа", note: "Reunión de personas para charlar" }
        ]
      },
      {
        id: "ch3_ending_reward",
        title: "Final: Hospitalidad Porteña 🥐",
        text: "El mozo vuelve con una bandeja reluciente: café humeante, medialunas recién horneadas y un vasito con soda. «Por tu buena onda, pibe. En este café, la gente buena siempre tiene su casa».",
        isEnd: true,
        vocabHighlights: [
          { word: "bandeja", translation: "поднос", note: "Recipiente plano para servir comida" },
          { word: "buena onda", translation: "позитив / добродушие", note: "Expresión argentina muy común: buena vibra" }
        ]
      }
    ]
  },
  {
    id: "story-sevilla-tapas-a1",
    title: "Noche de Tapas en Sevilla",
    level: "A1",
    dialect: "Castellano (España)",
    coverEmoji: "🥘",
    summary: "Caminas por el laberinto del Barrio de Santa Cruz buscando el bar de tapas más auténtico de Andalucía.",
    xpReward: 100,
    chapters: [
      {
        id: "ch1",
        title: "Capítulo 1: Los Callejones de Santa Cruz",
        text: "El aire de Sevilla huele a azahar y flores de jazmín. Las calles son estrechas y las casas tienen patios andaluces llenos de plantas verdes y fuentes de agua.",
        dialogue: [
          { speaker: "Paco el tabernero", text: "¡Hombre, pasa y ponte cómodo! ¿Qué te apetece para empezar, una caña bien fría o un vino fino de Jerez?" }
        ],
        vocabHighlights: [
          { word: "azahar", translation: "цветок апельсина", note: "Flor blanca del naranjo, típica de Sevilla" },
          { word: "estrechas", translation: "узкие", note: "Opuesto de anchas" },
          { word: "caña", translation: "бокал разливного пива", note: "Vaso de cerveza de barril en España" },
          { word: "te apetece", translation: "тебе хочется", note: "Verbo apetecer (gustar/querer en España)" }
        ],
        question: {
          prompt: "¿A qué huelen las calles de Sevilla en la historia?",
          options: ["A café", "A azahar y jazmín", "A lluvia", "A chocolate"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-1a",
            text: "«Una caña bien fría y una ración de tortilla de patatas con cebolla.»",
            targetChapterId: "ch2_tortilla",
            consequence: "Paco te sirve una tortilla jugosa y dorada recién salida de la sartén."
          },
          {
            id: "choice-1b",
            text: "«Un vino de Jerez y jamón ibérico de bellota cortado a mano.»",
            targetChapterId: "ch2_jamon",
            consequence: "El cortador de jamón prepara un plato de lonchas finas que se deshacen en la boca."
          }
        ]
      },
      {
        id: "ch2_tortilla",
        title: "Capítulo 2: El Gran Debate de la Tortilla",
        text: "Dos clientes locales empiezan a discutir amistosamente: «¡La auténtica tortilla siempre lleva cebolla!», dice uno. «¡Jamás! ¡La tortilla clásica solo lleva patatas y huevos!», responde el otro.",
        dialogue: [
          { speaker: "Paco", text: "¿Tú qué opinas, forastero? Danos tu veredicto." }
        ],
        vocabHighlights: [
          { word: "discutir", translation: "спорить / дискутировать", note: "Hablar defendiendo opiniones distintas" },
          { word: "forastero", translation: "приезжий / путник", note: "Persona de otro lugar" },
          { word: "veredicto", translation: "вердикт / решение", note: "Opinión decisiva" }
        ],
        question: {
          prompt: "¿Cuál es el debate entre los dos clientes?",
          options: ["Si la tortilla lleva queso", "Si la tortilla lleva cebolla", "Si la tortilla lleva carne", "Si la tortilla es picante"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2a",
            text: "«Con cebolla es mucho más jugosa y dulce, sin duda.»",
            targetChapterId: "ch3_flamenco_con_cebolla",
            consequence: "Los simpatizantes de la cebolla brindan contigo y te invitan a un tablao flamenco cercano."
          },
          {
            id: "choice-2b",
            text: "«La sencillez sin cebolla destaca el sabor del huevo de campo.»",
            targetChapterId: "ch3_guitarrero",
            consequence: "Un viejo guitarrista asiente satisfecho y comienza a afinar su guitarra española."
          }
        ]
      },
      {
        id: "ch2_jamon",
        title: "Capítulo 2: El Secreto del Maestro Cortador",
        text: "El maestro cortador te muestra cómo colocar el cuchillo largo y flexible: «El secreto no es la fuerza, sino el ángulo suave y el respeto al producto».",
        dialogue: [
          { speaker: "Maestro", text: "¿Te gustaría intentar cortar una loncha tú mismo?" }
        ],
        vocabHighlights: [
          { word: "cuchillo", translation: "нож", note: "Utensilio para cortar" },
          { word: "loncha", translation: "тонкий ломтик", note: "Rebanada muy fina de jamón o queso" },
          { word: "suave", translation: "мягкий / плавный", note: "Delicado, sin brusquedad" }
        ],
        question: {
          prompt: "¿Cuál es el secreto para cortar el jamón según el maestro?",
          options: ["La fuerza bruta", "El ángulo suave y el respeto", "Usar tijeras", "Cortarlo muy rápido"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2c",
            text: "Aceptar el reto y cortar la loncha con paciencia y pulso firme.",
            targetChapterId: "ch3_corte_perfecto",
            consequence: "Cortas una loncha casi transparente y perfecta. ¡Todos aplauden en la taberna!"
          },
          {
            id: "choice-2d",
            text: "Pedir que te enseñe a maridar el jamón con queso manchego.",
            targetChapterId: "ch3_maridaje",
            consequence: "Pruebas una combinación exquisita de sabores andaluces y manchegos."
          }
        ]
      },
      {
        id: "ch3_flamenco_con_cebolla",
        title: "Final: ¡Olé y Duende! 💃",
        text: "Llegan a un patio íntimo iluminado por farolillos. Una bailaora taconea sobre la tarima de madera al ritmo de las palmas. La pasión del flamenco te envuelve. ¡Una noche mágica en el corazón de Sevilla!",
        isEnd: true,
        vocabHighlights: [
          { word: "taconea", translation: "выстукивает каблуками", note: "Golpear el suelo con los tacones en el baile" },
          { word: "duende", translation: "магия / вдохновение фламенко", note: "Sentimiento y encanto misterioso del arte flamenco" }
        ]
      },
      {
        id: "ch3_guitarrero",
        title: "Final: Acordes de Medianoche 🎸",
        text: "El guitarrista toca una soleá andaluza. Las notas resuenan en las paredes encaladas del bar. Paco sirve otra ronda de cañas mientras disfrutas del auténtico espíritu sevillano.",
        isEnd: true,
        vocabHighlights: [
          { word: "acordes", translation: "аккорды", note: "Conjunto de notas musicales" },
          { word: "encaladas", translation: "побеленные", note: "Pintadas con cal blanca" }
        ]
      },
      {
        id: "ch3_corte_perfecto",
        title: "Final: El Nuevo Maestro Jamonero 🏆",
        text: "Paco te otorga el título honorífico de Cortador Mayor de Santa Cruz. Te regala un delantal bordado con el escudo de Sevilla y un recuerdo inolvidable.",
        isEnd: true,
        vocabHighlights: [
          { word: "delantal", translation: "фартук", note: "Prenda para proteger la ropa al cocinar" },
          { word: "inolvidable", translation: "незабываемый", note: "Que no se puede olvidar" }
        ]
      },
      {
        id: "ch3_maridaje",
        title: "Final: Banquete Andaluz 🧀",
        text: "La mesa se llena de aceitunas gordales, queso curado y pan con tomate. Paco te confiesa su receta secreta del gazpacho sevillano. ¡Te vas con el corazón contento y el estómago feliz!",
        isEnd: true,
        vocabHighlights: [
          { word: "curado", translation: "выдержанный", note: "Queso o embutido madurado con el tiempo" },
          { word: "confiesa", translation: "признается / раскрывает", note: "Del verbo confesar" }
        ]
      }
    ]
  },
  {
    id: "story-san-telmo-a2",
    title: "El Mate Mágico de San Telmo",
    level: "A2",
    dialect: "Rioplatense (Argentina)",
    coverEmoji: "🧉",
    summary: "En la feria dominical de San Telmo encuentras una calabaza de mate con una inscripción misteriosa grabada en plata.",
    xpReward: 120,
    chapters: [
      {
        id: "ch1",
        title: "Capítulo 1: La Feria de los Domingos",
        text: "Los domingos, la calle Defensa se transforma en un río de personas, bailarines de tango y puestos de antigüedades. Mientras caminas entre sifones antiguos y candelabros, un mate de calabaza tallado con hojas de laurel llama tu atención.",
        dialogue: [
          { speaker: "Don Horacio", text: "Buenas pibe, mirá con atención esa pieza. No es un mate común; perteneció a un gaucho que cruzó los Andes con San Martín." }
        ],
        vocabHighlights: [
          { word: "calabaza", translation: "тыква (сосуд для мате)", note: "Fruto seco que se usa tradicionalmente para tomar mate" },
          { word: "laurel", translation: "лавр", note: "Símbolo patrio y de victoria en el escudo argentino" },
          { word: "mirá", translation: "смотри (voseo)", note: "Imperativo de mirar en voseo: ¡mirá!" },
          { word: "gaucho", translation: "гаучо (южноамериканский ковбой)", note: "Hombre de campo de las pampas argentinas" }
        ],
        question: {
          prompt: "¿A quién perteneció el mate según Don Horacio?",
          options: ["A un pirata", "A un gaucho de los Andes", "A un rey español", "A un cantante de ópera"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-1a",
            text: "«¿Cuánto cuesta el mate, Don Horacio? ¿Me hace un precio si pago en efectivo?»",
            targetChapterId: "ch2_bargain",
            consequence: "Don Horacio sonríe con picardía y se acomoda la boina de gaucho."
          },
          {
            id: "choice-1b",
            text: "«¿Cómo se prepara un mate correctamente antes de usarlo por primera vez?»",
            targetChapterId: "ch2_curar",
            consequence: "Don Horacio saca un termo con agua caliente y un paquete de yerba mate con palo."
          }
        ]
      },
      {
        id: "ch2_bargain",
        title: "Capítulo 2: El Arte del Regateo",
        text: "Don Horacio pide 8.000 pesos. Vos le ofrecés 6.000 diciendo que sos un estudiante apasionado por la historia argentina.",
        dialogue: [
          { speaker: "Don Horacio", text: "Mirá que sos negociador, che. Te lo dejo en 6.500 pero con una condición: te enseño el ritual sagrado del cebador." }
        ],
        vocabHighlights: [
          { word: "regateo", translation: "торг / сбивание цены", note: "Negociación del precio" },
          { word: "cebador", translation: "тот, кто заваривает и подает мате", note: "La persona encargada de servir el mate a la ronda" },
          { word: "yerba", translation: "трава йерба мате", note: "Hojas secas de Ilex paraguariensis" }
        ],
        question: {
          prompt: "¿En cuánto acordaron el precio final?",
          options: ["5.000", "6.500", "8.000", "10.000"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2a",
            text: "Aceptar el trato y aprender a cebar mate amargo como los gauchos.",
            targetChapterId: "ch3_amargo",
            consequence: "Don Horacio te enseña a acomodar la yerba en ángulo de 45 grados y colocar la bombilla."
          },
          {
            id: "choice-2b",
            text: "Preguntarle si se le puede poner azúcar o cascaritas de naranja.",
            targetChapterId: "ch3_dulce",
            consequence: "Don Horacio levanta las cejas con gracia: «¡Un gaucho auténtico toma amargo, pero todo se vale!»"
          }
        ]
      },
      {
        id: "ch2_curar",
        title: "Capítulo 2: Curar la Calabaza",
        text: "Don Horacio te explica el rito de iniciación: «Para que el mate no tenga sabor amargo a madera cruda, tenés que curarlo durante tres días con yerba usada y un chorrito de whisky o café caliente».",
        dialogue: [
          { speaker: "Don Horacio", text: "El mate es compañía, diálogo y amistad. Cuando compartís un mate, nunca estás solo." }
        ],
        vocabHighlights: [
          { word: "curar", translation: "подготовить / обработать (мате)", note: "Proceso para acondicionar el recipiente de mate antes de estrenarlo" },
          { word: "chorrito", translation: "небольшая струйка / капелька", note: "Pequeña cantidad de líquido" },
          { word: "amistad", translation: "дружба", note: "Relación de afecto entre amigos" }
        ],
        question: {
          prompt: "¿Cuántos días se cura la calabaza según Don Horacio?",
          options: ["1 día", "3 días", "7 días", "1 mes"],
          correctIndex: 1
        },
        choices: [
          {
            id: "choice-2c",
            text: "Comprar el kit completo: mate, bombilla de alpaca y termo.",
            targetChapterId: "ch3_kit_gaucho",
            consequence: "Empacas tu nuevo tesoro y te diriges a la Plaza Dorrego a escuchar milongas."
          }
        ]
      },
      {
        id: "ch3_amargo",
        title: "Final: El Mate de la Amistad 🧉🇦🇷",
        text: "Tomas el primer sorbo con la bombilla de alpaca. La espuma verde es perfecta y el calor reconforta el alma. «¡Sos un gaucho honorario, che!», exclama Don Horacio. Has aprendido una tradición viva que te acompañará para siempre.",
        isEnd: true,
        vocabHighlights: [
          { word: "bombilla", translation: "бомбилья (соломинка с фильтром)", note: "Tubo metálico con filtro para beber el mate" },
          { word: "reconforta", translation: "утешает / согревает", note: "Da fuerza o alivio" }
        ]
      },
      {
        id: "ch3_dulce",
        title: "Final: Mate con Onda Moderna 🍊",
        text: "Le agregan unas cascaritas de naranja tostadas. El aroma cítrico combina delicioso con la yerba. Alrededor de la mesa se unen dos músicos callejeros y la tarde se vuelve una fiesta espontánea en San Telmo.",
        isEnd: true,
        vocabHighlights: [
          { word: "cascaritas", translation: "цедра / корочки", note: "Piel de fruta cortada finita" },
          { word: "espontánea", translation: "спонтанная", note: "Que surge de forma natural" }
        ]
      },
      {
        id: "ch3_kit_gaucho",
        title: "Final: El Viajero Equipado 🎒",
        text: "Bajo los jacarandás de Plaza Dorrego, preparas tu primer mate propio. Una pareja baila tango en la vereda empedrada. El mate caliente en tus manos se siente como un abrazo de bienvenida a la Argentina.",
        isEnd: true,
        vocabHighlights: [
          { word: "jacarandás", translation: "жакаранда (деревья с фиолетовыми цветами)", note: "Árboles emblemáticos de Buenos Aires con flores lilas" },
          { word: "vereda", translation: "тротуар (арг.)", note: "Acera para peatones en el español rioplatense" }
        ]
      }
    ]
  }
];
