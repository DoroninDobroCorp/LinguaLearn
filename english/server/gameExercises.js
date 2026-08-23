// Tactile and Gamified Exercises Engine for LinguaLearn English

export const PRESET_WORD_TILES = [
  {
    id: "wt-1",
    level: "A1",
    category: "Cafe & Food",
    prompt: "Я хотел бы чашку черного кофе и два круассана, пожалуйста.",
    correctSentence: "I would like a cup of black coffee and two croissants please",
    tiles: ["I", "would", "like", "a", "cup", "of", "black", "coffee", "and", "two", "croissants", "please", "want", "some", "tea"],
    hint: "Вежливая форма: I would like (a cup of...)."
  },
  {
    id: "wt-2",
    level: "A1",
    category: "Directions & City",
    prompt: "Где находится ближайшая станция метро?",
    correctSentence: "Where is the nearest underground station?",
    tiles: ["Where", "is", "the", "nearest", "underground", "station?", "are", "a", "far", "subway"],
    hint: "Вопрос с Where is + превосходная степень the nearest."
  },
  {
    id: "wt-3",
    level: "A1",
    category: "Introductions",
    prompt: "Меня зовут Алекс, и я живу в Лондоне уже три года.",
    correctSentence: "My name is Alex and I have lived in London for three years",
    tiles: ["My", "name", "is", "Alex", "and", "I", "have", "lived", "in", "London", "for", "three", "years", "live", "since"],
    hint: "Для периода до настоящего момента используется Present Perfect + for."
  },
  {
    id: "wt-4",
    level: "A2",
    category: "Routine & Past",
    prompt: "Вчера я проснулся в семь утра и пошел на пробежку в парк.",
    correctSentence: "Yesterday I woke up at seven in the morning and went for a run in the park",
    tiles: ["Yesterday", "I", "woke", "up", "at", "seven", "in", "the", "morning", "and", "went", "for", "a", "run", "in", "the", "park", "wake", "go"],
    hint: "Формы Past Simple: wake -> woke up; go -> went for a run."
  },
  {
    id: "wt-5",
    level: "A2",
    category: "Infinitive of Purpose",
    prompt: "Она включила ноутбук, чтобы проверить рабочую почту.",
    correctSentence: "She turned on the laptop to check her work email",
    tiles: ["She", "turned", "on", "the", "laptop", "to", "check", "her", "work", "email", "for", "checking", "with"],
    hint: "Инфинитив цели выражается через to + глагол (to check)."
  },
  {
    id: "wt-6",
    level: "B1",
    category: "Conditionals & Work",
    prompt: "Если мы закончим этот проект вовремя, мы получим квартальный бонус.",
    correctSentence: "If we finish this project on time we will receive a quarterly bonus",
    tiles: ["If", "we", "finish", "this", "project", "on", "time", "we", "will", "receive", "a", "quarterly", "bonus", "would", "got"],
    hint: "First Conditional: If + Present Simple, Future with will."
  },
  {
    id: "wt-7",
    level: "B2",
    category: "Mixed Conditionals & Inversion",
    prompt: "Если бы я не пропустил тот рейс, я бы сейчас выступал на конференции.",
    correctSentence: "If I had not missed that flight I would be speaking at the conference now",
    tiles: ["If", "I", "had", "not", "missed", "that", "flight", "I", "would", "be", "speaking", "at", "the", "conference", "now", "did", "spoke"],
    hint: "Mixed Conditional: Past cause (had not missed) -> Present action (would be speaking)."
  },
  {
    id: "wt-8",
    level: "C1",
    category: "Advanced Inversion",
    prompt: "Редко мне доводилось встречать столь преданного своему делу специалиста.",
    correctSentence: "Seldom have I met such a dedicated professional",
    tiles: ["Seldom", "have", "I", "met", "such", "a", "dedicated", "professional", "did", "meet", "so"],
    hint: "Отрицательная инверсия: Seldom + have + I + met."
  }
];

export const PRESET_ERROR_DETECTIVES = [
  {
    id: "ed-1",
    level: "A1",
    sentence: "He don't like drinking coffee late in the evening.",
    errorWord: "don't",
    correctWord: "doesn't",
    ruleExplanation: "В Present Simple для местоимений he, she, it вспомогательный глагол в отрицании — doesn't, а не don't!",
    options: ["doesn't", "isn't", "not", "don't like"]
  },
  {
    id: "ed-2",
    level: "A1",
    sentence: "I have been waiting here for an hour because my friend is a architect.",
    errorWord: "a architect",
    correctWord: "an architect",
    ruleExplanation: "Перед словами, начинающимися с гласного звука [ɑː], используется артикль an: an architect, an apple, an hour.",
    options: ["an architect", "the architect", "architect", "one architect"]
  },
  {
    id: "ed-3",
    level: "A2",
    sentence: "I went to the supermarket yesterday for buy some fresh bread.",
    errorWord: "for buy",
    correctWord: "to buy",
    ruleExplanation: "Инфинитив цели выражается конструкцией to + глагол (to buy), а не for + глагол!",
    options: ["to buy", "for buying", "to buying", "buying"]
  },
  {
    id: "ed-4",
    level: "A2",
    sentence: "She didn't went to the office because she was feeling unwell.",
    errorWord: "didn't went",
    correctWord: "didn't go",
    ruleExplanation: "После вспомогательного глагола didn't смысловой глагол всегда возвращается в базовую форму инфинитива (go) без окончания прошедшего времени.",
    options: ["didn't go", "wasn't go", "not went", "didn't gone"]
  },
  {
    id: "ed-5",
    level: "B1",
    sentence: "I am looking forward to meet you at the tech conference in London.",
    errorWord: "to meet",
    correctWord: "to meeting",
    ruleExplanation: "После фразового оборота 'look forward to' частица to является предлогом, поэтому после неё используется герундий (V-ing): to meeting you!",
    options: ["to meeting", "to met", "meeting", "for meeting"]
  },
  {
    id: "ed-6",
    level: "B1",
    sentence: "If I would have more free time, I would travel around South America.",
    errorWord: "If I would have",
    correctWord: "If I had",
    ruleExplanation: "Во 2-м типе условных предложений (Second Conditional) в части с If используется Past Simple (had), а не would!",
    options: ["If I had", "If I have", "If I were having", "If had I"]
  },
  {
    id: "ed-7",
    level: "B2",
    sentence: "I finally had my broken laptop repair by the authorized service center.",
    errorWord: "repair",
    correctWord: "repaired",
    ruleExplanation: "Каузативная конструкция: have something done (Past Participle V3) -> had my laptop repaired!",
    options: ["repaired", "repairing", "to repair", "for repair"]
  },
  {
    id: "ed-8",
    level: "C1",
    sentence: "No sooner had we launched the campaign when the server crashed under heavy load.",
    errorWord: "when",
    correctWord: "than",
    ruleExplanation: "Конструкция No sooner had... парно согласуется ТОЛЬКО с союзом THAN (а Hardly / Scarcely — с WHEN).",
    options: ["than", "that", "then", "when as"]
  }
];

export const SPEED_MATCH_PAIRS = [
  { id: "sm-1", left: "sustainable", right: "экологически устойчивый", level: "B2" },
  { id: "sm-2", left: "inevitable", right: "неизбежный", level: "B1" },
  { id: "sm-3", left: "reluctant", right: "неохотный / сомневающийся", level: "B2" },
  { id: "sm-4", left: "ubiquitous", right: "вездесущий / повсеместный", level: "C1" },
  { id: "sm-5", left: "scrutinize", right: "тщательно изучать", level: "C1" },
  { id: "sm-6", left: "thoroughly", right: "досконально / тщательно", level: "B1" },
  { id: "sm-7", left: "counterproductive", right: "контрпродуктивный", level: "B2" },
  { id: "sm-8", left: "substantiate", right: "обосновать / подтвердить", level: "C1" },
  { id: "sm-9", left: "look forward to", right: "с нетерпением ждать", level: "A2" },
  { id: "sm-10", left: "run out of", right: "закончиться / исчерпать", level: "A2" },
  { id: "sm-11", left: "catch up with", right: "нагнать / поболтать о новостях", level: "B1" },
  { id: "sm-12", left: "make up for", right: "компенсировать / загладить вину", level: "B2" }
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
    String(str || '')
      .toLowerCase()
      .replace(/[.,;:!?¡¿"'«»()—–\-_/\\]+/g, '')
      .replace(/\s+/g, ' ')
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
