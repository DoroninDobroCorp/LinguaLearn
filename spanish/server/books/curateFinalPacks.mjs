import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { validatePack } from "./bookService.js";
import { catalog, PRIVATE_BOOKS, lessonById } from "./bookStore.js";
import { generateJson, COACH_MODELS } from "../coach/coachGemini.js";
const sources = JSON.parse(
  fs.readFileSync(path.join(PRIVATE_BOOKS, "sources.json"), "utf8"),
);
const item = (
  type,
  prompt,
  answers,
  options = [],
  quote = "",
  reference = "",
) => ({
  type,
  prompt,
  answers,
  options,
  source_kind: quote ? "adapted" : "additional",
  source_quote: quote,
  reference,
  hint_ru: "Посмотри правило и обрати внимание на условие задания.",
  explanation_ru: "Проверь форму слова по правилу и сравни со своим ответом.",
});
const n = () => {
  const p = {
    theory_ru:
      "Для ровно ста перед существительным используется cien: cien personas. Начиная со 101 — ciento: ciento uno, ciento veinticinco. Сотни от 200 до 900 согласуются с существительным: doscientos pesos, doscientas personas. Тысяча — mil; слово mil не меняется по роду. Миллион — un millón, несколько миллионов — millones. Перед существительным после целого числа миллионов ставится de: dos millones de pesos; но dos millones cuatrocientos mil pesos. Числа обозначают количество, возраст, расстояния, цены и годы.",
    examples: [
      {
        es: "Hay doscientas personas en la feria.",
        ru: "На ярмарке двести человек.",
      },
      {
        es: "El viaje cuesta un millón de pesos.",
        ru: "Поездка стоит миллион песо.",
      },
    ],
    vocabulary: [
      { word: "mil", translation: "тысяча", example: "Mil pesos." },
      {
        word: "un millón",
        translation: "миллион",
        example: "Un millón de habitantes.",
      },
      {
        word: "trescientas",
        translation: "триста, с существительным женского рода",
        example: "Trescientas personas.",
      },
    ],
    conversation_goal_es:
      "Contame cantidades, precios y distancias de tu vida: usá números mayores que cien y al menos una cantidad con un nombre femenino.",
    items: [
      item(
        "open",
        "Escribí con letras el número 1070.",
        ["mil setenta"],
        [],
        "2. 1070 -",
        "PDF 63, 26.1.2",
      ),
      item(
        "open",
        "Escribí con letras el número 3561.",
        ["tres mil quinientos sesenta y uno"],
        [],
        "3. 3561",
        "PDF 63, 26.1.3",
      ),
      item(
        "gap",
        "Completá con letras: «María gana ____ euros al mes». (2085)",
        ["dos mil ochenta y cinco"],
        [],
        "2. María gana (2 085).",
        "PDF 63, 26.3.2",
      ),
      item(
        "gap",
        "Completá con letras: «Rafael tiene una colección de más de ____ mariposas». (300)",
        ["trescientas"],
        [],
        "3. Rafael tiene una colección de más de (300)",
        "PDF 63, 26.3.3",
      ),
      item(
        "choice",
        "Completá con letras: «Hay ____ personas». (200)",
        ["doscientas"],
        ["doscientas", "doscientos"],
      ),
      item("gap", "Completá con letras: «Cuesta ____ de pesos». (2 000 000)", [
        "dos millones",
      ]),
      item(
        "choice",
        "Elegí cómo se escribe correctamente «100 pesos» con letras.",
        ["cien pesos"],
        ["cien pesos", "ciento pesos"],
      ),
      item("open", "Escribí con letras el número 2026.", [
        "dos mil veintiséis",
      ]),
    ],
  };
  p.items[3].explanation_ru =
    "Mariposas — женский род, поэтому trescientas, как в ключе 26.3.3.";
  p.items[4].explanation_ru =
    "Personas — женский род; сотня согласуется: doscientas personas.";
  p.items[5].explanation_ru =
    "После целого количества миллионов перед названием того, что считаем, нужен de: dos millones de pesos.";
  p.items[6].explanation_ru =
    "Ровно сто перед существительным — cien, без окончания -to.";
  return p;
};
const c = () => ({
  theory_ru:
    "Заглавная буква нужна в начале предложения и в собственных именах людей, городов и стран: Manuel, China, Argentina, El Bolsón. Дни недели и месяцы внутри предложения пишутся со строчной: el lunes, en enero. Названия национальностей и языков также обычно со строчной. В названиях из нескольких слов сохраняй правильное написание: Buenos Aires, El Bolsón, Río Negro. Заглавные буквы тоже получают необходимые знаки ударения: Ángel. В этом занятии важно именно написание, поэтому отвечай текстом.",
  examples: [
    { es: "El lunes viajo a Chile.", ru: "В понедельник я еду в Чили." },
    { es: "Mi cumpleaños es en enero.", ru: "Мой день рождения в январе." },
  ],
  vocabulary: [
    {
      word: "mayúscula",
      translation: "заглавная буква",
      example: "Escribí con mayúscula.",
    },
    {
      word: "minúscula",
      translation: "строчная буква",
      example: "Enero se escribe con minúscula.",
    },
    {
      word: "nombre propio",
      translation: "имя собственное",
      example: "Manuel es un nombre propio.",
    },
  ],
  conversation_goal_es:
    "Escribime un mensaje con el nombre de una persona, una ciudad y un mes; cuidá las mayúsculas. Esta práctica requiere texto, no audio.",
  items: [
    item(
      "open",
      "Reescribí con mayúsculas donde corresponda: «ayer fue dos de enero. fue el cumpleaños de manuel».",
      ["Ayer fue dos de enero. Fue el cumpleaños de Manuel."],
      [],
      "2. ayer fue dos de enero. fue el cumpleaños de manuel.",
      "PDF 263, 125.1.2",
    ),
    item(
      "open",
      "Corregí las mayúsculas: «Queremos ir a CHina en Diciembre».",
      ["Queremos ir a China en diciembre."],
      [],
      "2. Queremos ir a CHina en Diciembre. -",
      "PDF 263, 125.2.2",
    ),
    item(
      "choice",
      "Elegí cómo se escribe el día de la semana: «El ____ voy al mercado».",
      ["lunes"],
      ["lunes", "Lunes"],
    ),
    item(
      "choice",
      "Elegí cómo se escribe el nombre de un país en esta frase: «Vivo en ____».",
      ["Argentina"],
      ["Argentina", "argentina"],
    ),
    item("open", "Corregí las mayúsculas: «vivo en el bolsón, río negro».", [
      "Vivo en El Bolsón, Río Negro.",
    ]),
    item(
      "choice",
      "Elegí cómo se escribe el mes: «Viajamos en ____».",
      ["enero"],
      ["enero", "Enero"],
    ),
    item(
      "open",
      "Reescribí con mayúsculas y tildes correctas: «angel vive en argentina».",
      ["Ángel vive en Argentina."],
    ),
    item(
      "gap",
      "Completá con la escritura correcta del país: «En ____ tenemos amigos». (chile)",
      ["Chile"],
    ),
  ],
});
for (const [id, raw] of [
  ["grammar-026", n()],
  ["grammar-125", c()],
]) {
  const lesson = lessonById(id),
    source = sources[id];
  const pack = validatePack(raw, lesson, source);
  const response = await generateJson({
    task: "book_manual_pack_review",
    models: COACH_MODELS.analysis,
    system:
      "Проверь учебный пакет по источнику. Для урока заглавных букв учитывай регистр: lunes и Lunes — разные варианты. Не считай неверным то, что у open есть другие правильные ответы: answers содержит примеры. Отклони реальные ошибки в заданиях, ответах, русском объяснении или цитатах. Верни approved=true только если нет существенных проблем.",
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify({ source, lesson, pack }) }],
      },
    ],
    schema: {
      type: "OBJECT",
      properties: {
        approved: { type: "BOOLEAN" },
        issues: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["approved", "issues"],
    },
    temperature: 0,
    effort: "low",
    maxOutputTokens: 3000,
    timeoutMs: 90000,
  });
  console.log(id, JSON.stringify(response));
  if (response.json?.approved !== true)
    throw new Error("Pack rejected: " + JSON.stringify(response.json));
  pack.review = {
    generator: "manual-source-curation",
    reviewer: response.model,
    checked_at: new Date().toISOString(),
  };
  const dest = path.join(
    PRIVATE_BOOKS,
    "packs",
    `${catalog.version}-${id}.json`,
  );
  fs.writeFileSync(dest + ".tmp", JSON.stringify(pack));
  fs.renameSync(dest + ".tmp", dest);
}
// Earlier spelling packages also require written answers, regardless of their cache age.
for (const id of ["grammar-123", "grammar-124"]) {
  const file = path.join(
    PRIVATE_BOOKS,
    "packs",
    `${catalog.version}-${id}.json`,
  );
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  p.requires_written = true;
  fs.writeFileSync(file, JSON.stringify(p));
}
