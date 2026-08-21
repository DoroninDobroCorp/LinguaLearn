// Tactile and Gamified Exercises Engine for LinguaLearn Spanish

export const PRESET_WORD_TILES = [
  {
    id: "wt-1",
    level: "A1",
    category: "Restaurante & Comida",
    prompt: "Я хочу кофе с молоком и два круассана, пожалуйста.",
    correctSentence: "Quiero un café con leche y dos medialunas por favor",
    tiles: ["Quiero", "un", "café", "con", "leche", "y", "dos", "medialunas", "por", "favor", "tengo", "una", "cerveza"],
    hint: "Используй глагол querer (quiero) и предлог con."
  },
  {
    id: "wt-2",
    level: "A1",
    category: "Direcciones & Ciudad",
    prompt: "Где находится ближайшая станция метро?",
    correctSentence: "¿Dónde está la estación de metro más cercana?",
    tiles: ["¿Dónde", "está", "la", "estación", "de", "metro", "más", "cercana?", "es", "el", "lejos"],
    hint: "Для местоположения используй estar: ¿Dónde está...?"
  },
  {
    id: "wt-3",
    level: "A1",
    category: "Presentaciones",
    prompt: "Меня зовут Маркос и я живу в Буэнос-Айресе уже два года.",
    correctSentence: "Me llamo Marcos y vivo en Buenos Aires hace dos años",
    tiles: ["Me", "llamo", "Marcos", "y", "vivo", "en", "Buenos", "Aires", "hace", "dos", "años", "soy", "desde"],
    hint: "Выражение hace + время означает уже столько-то времени."
  },
  {
    id: "wt-4",
    level: "A2",
    category: "Rutina & Pasado",
    prompt: "Вчера я проснулся в восемь и пошел в спортзал.",
    correctSentence: "Ayer me desperté a las ocho y fui al gimnasio",
    tiles: ["Ayer", "me", "desperté", "a", "las", "ocho", "y", "fui", "al", "gimnasio", "despierto", "voy", "en"],
    hint: "Pretérito Indefinido: despertarse -> me desperté; ir -> fui."
  },
  {
    id: "wt-5",
    level: "A2",
    category: "Gustos & Opinión",
    prompt: "Мне очень нравятся старые улочки этого района.",
    correctSentence: "Me gustan mucho las calles antiguas de este barrio",
    tiles: ["Me", "gustan", "mucho", "las", "calles", "antiguas", "de", "este", "barrio", "gusta", "muy", "el"],
    hint: "Так как las calles во множественном числе -> me gustan."
  },
  {
    id: "wt-6",
    level: "B1",
    category: "Subjuntivo & Deseos",
    prompt: "Я надеюсь, что завтра не будет дождя и мы сможем пойти на пляж.",
    correctSentence: "Espero que mañana no llueva y podamos ir a la playa",
    tiles: ["Espero", "que", "mañana", "no", "llueva", "y", "podamos", "ir", "a", "la", "playa", "llueve", "podemos"],
    hint: "После Espero que... требуется Subjuntivo: llueva, podamos."
  },
  {
    id: "wt-7",
    level: "B1",
    category: "Condicional & Planes",
    prompt: "Если бы у меня было больше времени, я бы выучил танцевать танго.",
    correctSentence: "Si tuviera más tiempo aprendería a bailar tango",
    tiles: ["Si", "tuviera", "más", "tiempo", "aprendería", "a", "bailar", "tango", "tengo", "aprendo", "de"],
    hint: "Условное предложение 2-го типа: Si + Imperfecto de Subjuntivo + Condicional Simple."
  }
];

export const PRESET_ERROR_DETECTIVES = [
  {
    id: "ed-1",
    level: "A1",
    sentence: "El agua en esta botella está muy caliente y la problema es que no hay hielo.",
    errorWord: "la problema",
    correctWord: "el problema",
    ruleExplanation: "Слова греческого происхождения на -ma (el problema, el sistema, el tema, el idioma) мужского рода!",
    options: ["el problema", "las problemas", "un problema grande", "problema hembra"]
  },
  {
    id: "ed-2",
    level: "A1",
    sentence: "A mí me gusta mucho los gatos negros y los perros grandes.",
    errorWord: "gusta",
    correctWord: "gustan",
    ruleExplanation: "Глагол gustar согласуется с подлежащим: если нравятся несколько предметов/животных (los gatos y los perros), форма во мн.ч. — gustan!",
    options: ["gustan", "gusto", "gustar", "gustamos"]
  },
  {
    id: "ed-3",
    level: "A2",
    sentence: "Salgo para el aeropuerto por la mañana porque el vuelo es para las tres.",
    errorWord: "para las tres",
    correctWord: "a las tres",
    ruleExplanation: "Точное время события обозначается предлогом a (a las tres, a las ocho), а не para.",
    options: ["a las tres", "en las tres", "por las tres", "de las tres"]
  },
  {
    id: "ed-4",
    level: "A2",
    sentence: "Mi hermano es en Madrid trabajando en una empresa de tecnología.",
    errorWord: "es en Madrid",
    correctWord: "está en Madrid",
    ruleExplanation: "Местонахождение одушевленных и неодушевленных объектов всегда выражается глаголом ESTAR, а не SER!",
    options: ["está en Madrid", "hay en Madrid", "queda de Madrid", "vive a Madrid"]
  },
  {
    id: "ed-5",
    level: "B1",
    sentence: "No creo que mi amigo tiene razón sobre ese tema político.",
    errorWord: "tiene",
    correctWord: "tenga",
    ruleExplanation: "После отрицания мнения/сомнения (No creo que..., No pienso que...) обязательно используется Subjuntivo: tenga!",
    options: ["tenga", "tuviera", "teniendo", "ha tenido"]
  },
  {
    id: "ed-6",
    level: "B1",
    sentence: "Estudio español por conseguir un mejor trabajo en América Latina.",
    errorWord: "por conseguir",
    correctWord: "para conseguir",
    ruleExplanation: "Цель или предназначение действия обозначается предлогом PARA (para + инфинитив = чтобы...), а POR выражает причину.",
    options: ["para conseguir", "a conseguir", "de conseguir", "en conseguir"]
  }
];

export const SPEED_MATCH_PAIRS = [
  { es: "el desayuno", ru: "завтрак" },
  { es: "la cuenta", ru: "счет (в кафе)" },
  { es: "la propina", ru: "чаевые" },
  { es: "la servilleta", ru: "салфетка" },
  { es: "el camarero / mozo", ru: "официант" },
  { es: "la esquina", ru: "угол улицы" },
  { es: "el barrio", ru: "район / квартал" },
  { es: "la vereda", ru: "тротуар" },
  { es: "el colectivo / bondi", ru: "автобус" },
  { es: "el equipaje", ru: "багаж" },
  { es: "la habitación", ru: "комната / номер" },
  { es: "la llave", ru: "ключ" },
  { es: "la farmacia", ru: "аптека" },
  { es: "el dolor de cabeza", ru: "головная боль" },
  { es: "la pastilla / comprimido", ru: "таблетка" },
  { es: "el mate", ru: "напиток мате" },
  { es: "la bombilla", ru: "соломинка для мате" },
  { es: "la yerba", ru: "трава йерба" },
  { es: "el regateo", ru: "торг по цене" },
  { es: "el descuento", ru: "скидка" },
  { es: "en efectivo", ru: "наличными" },
  { es: "con tarjeta", ru: "банковской картой" },
  { es: "la suerte", ru: "удача" },
  { es: "la sonrisa", ru: "улыбка" },
  { es: "el abrazo", ru: "объятие" },
  { es: "el atardecer", ru: "закат" },
  { es: "la madrugada", ru: "раннее утро / рассвет" },
  { es: "la lluvia", ru: "дождь" },
  { es: "la sombra", ru: "тень" },
  { es: "el regalo", ru: "подарок" }
];
