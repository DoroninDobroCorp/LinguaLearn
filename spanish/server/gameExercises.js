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
  { left: "el desayuno", right: "завтрак" },
  { left: "la cuenta", right: "счет (в кафе)" },
  { left: "la propina", right: "чаевые" },
  { left: "la servilleta", right: "салфетка" },
  { left: "el camarero / mozo", right: "официант" },
  { left: "la esquina", right: "угол улицы" },
  { left: "el barrio", right: "район / квартал" },
  { left: "la vereda", right: "тротуар" },
  { left: "el colectivo / bondi", right: "автобус" },
  { left: "el equipaje", right: "багаж" },
  { left: "la habitación", right: "комната / номер" },
  { left: "la llave", right: "ключ" },
  { left: "la farmacia", right: "аптека" },
  { left: "el dolor de cabeza", right: "головная боль" },
  { left: "la pastilla / comprimido", right: "таблетка" },
  { left: "el mate", right: "напиток мате" },
  { left: "la bombilla", right: "соломинка для мате" },
  { left: "la yerba", right: "трава йерба" },
  { left: "el regateo", right: "торг по цене" },
  { left: "el descuento", right: "скидка" },
  { left: "en efectivo", right: "наличными" },
  { left: "con tarjeta", right: "банковской картой" },
  { left: "la suerte", right: "удача" },
  { left: "la sonrisa", right: "улыбка" },
  { left: "el abrazo", right: "объятие" },
  { left: "el atardecer", right: "закат" },
  { left: "la madrugada", right: "раннее утро / рассвет" },
  { left: "la lluvia", right: "дождь" },
  { left: "la sombra", right: "тень" },
  { left: "el regalo", right: "подарок" }
];

export function getWordTilesBatch(level = null) {
  let list = PRESET_WORD_TILES;
  if (level) {
    list = list.filter(item => item.level === level);
    if (list.length === 0) list = PRESET_WORD_TILES;
  }
  return list;
}

export function verifyWordTiles(itemId, userSentence) {
  const item = PRESET_WORD_TILES.find(t => t.id === itemId);
  if (!item) return { isCorrect: false, message: "Item not found" };

  const normalize = (str) =>
    (str || "")
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()¿?¡!]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const isCorrect = normalize(userSentence) === normalize(item.correctSentence);
  return {
    isCorrect,
    correctSentence: item.correctSentence,
    hint: item.hint
  };
}

export function getSpeedMatchItems(count = 6) {
  const shuffled = [...SPEED_MATCH_PAIRS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function getErrorDetectiveBatch(level = null) {
  let list = PRESET_ERROR_DETECTIVES;
  if (level) {
    list = list.filter(item => item.level === level);
    if (list.length === 0) list = PRESET_ERROR_DETECTIVES;
  }
  return list;
}

export function verifyErrorDetective(itemId, chosenOption) {
  const item = PRESET_ERROR_DETECTIVES.find(d => d.id === itemId);
  if (!item) return { isCorrect: false, message: "Item not found" };

  const isCorrect = (String(chosenOption || '').trim().toLowerCase() === String(item.correctWord || '').trim().toLowerCase());
  return {
    isCorrect,
    correctWord: item.correctWord,
    ruleExplanation: item.ruleExplanation
  };
}

