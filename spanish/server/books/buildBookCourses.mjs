/**
 * Builds two ordered courses from the Nataliia book library.
 * Theory and worked examples come from the reviewed lesson packs.
 * Practice is grounded in the OCR of that lesson's own pages.
 * Run: node server/books/buildBookCourses.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const privateBooks = path.resolve(here, "../private/books");
const catalog = JSON.parse(fs.readFileSync(path.join(here, "catalog.json"), "utf8"));
const outPath = path.join(here, "bookCoursesData.json");

const COURSES = [
  {
    id: "gramatica",
    title: "Курс: Gramática de uso del español",
    subtitle: "126 разделов по порядку книги, A1–B2",
    outcome: "Пройти грамматику по книге: объяснение, примеры, страница и проверка.",
  },
  {
    id: "nivel2",
    title: "Курс: Español para extranjeros · Nivel 2",
    subtitle: "24 занятия по порядку книги Университета Буэнос-Айреса",
    outcome: "Пройти Nivel 2 по книге: чтение страниц, лексика и практика по каждой теме.",
  },
];

function loadOcr(bookId) {
  const pages = new Map();
  const file = path.join(privateBooks, `${bookId}-ocr.jsonl`);
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    pages.set(Number(row.page), String(row.text || ""));
  }
  return pages;
}

function loadPack(lessonId) {
  const file = path.join(privateBooks, "packs", `${catalog.version}-${lessonId}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function sentences(text) {
  return clean(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18 && part.length <= 180 && /[a-záéíóúñ]/i.test(part));
}

function meaningfulLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && !/^unidad\s+\d+/i.test(line) && !/^soluciones/i.test(line));
}

function pickExamples(pack) {
  return (pack.examples || [])
    .filter((row) => row.es && row.ru)
    .slice(0, 4)
    .map((row) => ({ es: clean(row.es), ru: clean(row.ru) }));
}

function pickVocabulary(pack, lines) {
  const fromPack = (pack.vocabulary || [])
    .filter((row) => row.word && row.translation)
    .slice(0, 6)
    .map((row) => ({
      word: clean(row.word),
      translation: clean(row.translation),
      example: clean(row.example || ""),
    }));
  if (fromPack.length >= 3) return fromPack;
  const extras = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ /-]*?)\s+[—–-]\s+(.+)$/);
    if (!match) continue;
    extras.push({ word: clean(match[1]), translation: "", example: clean(match[2]) });
    if (fromPack.length + extras.length >= 6) break;
  }
  return [...fromPack, ...extras].slice(0, 6);
}

function itemToExercise(item, index, lessonId) {
  const answers = (item.answers || []).map(clean).filter(Boolean);
  if (!answers.length || !item.prompt) return null;
  const base = {
    id: `${lessonId}-ex-${String(index + 1).padStart(2, "0")}`,
    question: clean(item.prompt),
    explanation: clean(item.explanation_ru || ""),
    reference: clean(item.reference || ""),
  };
  if (item.type === "choice" && Array.isArray(item.options) && item.options.length >= 2) {
    const options = [...new Set(item.options.map(clean))].filter(Boolean);
    if (!options.includes(answers[0])) options.push(answers[0]);
    const ordered = options.slice(0, 4);
    const rank = (option) => {
      let hash = index + 1;
      for (const char of option) hash = (hash * 33 + char.charCodeAt(0)) % 10007;
      return hash;
    };
    const rotated = [...ordered].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
    return { ...base, type: "choice", options: rotated, correctAnswer: answers[0] };
  }
  const short = answers[0].length <= 48;
  return {
    ...base,
    type: short ? "gap" : "input",
    correctAnswer: answers[0],
    acceptableAnswers: [...new Set(answers)].slice(0, 4),
  };
}

function pageGrounded(item, pageText) {
  const quote = clean(item.source_quote || "");
  if (quote.length >= 8 && pageText.toLowerCase().includes(quote.toLowerCase())) return true;
  const answer = clean(item.answers?.[0] || "");
  return answer.length >= 4 && pageText.toLowerCase().includes(answer.toLowerCase());
}

function fallbackExercises(lines, lesson) {
  const pairs = [];
  for (const line of lines) {
    const pair = line.match(/^(el|la|los|las|un|una)\s+([a-záéíóúñ]+)\s+[—–-]\s+(el|la|los|las|un|una)\s+([a-záéíóúñ]+)/i);
    if (pair) pairs.push([`${pair[1]} ${pair[2]}`, `${pair[3]} ${pair[4]}`]);
  }
  return pairs.slice(0, 4).map((pair, index) => ({
    id: `${lesson.id}-page-${index + 1}`,
    type: "gap",
    question: `По странице книги напишите пару к «${pair[0]}».`,
    correctAnswer: pair[1],
    acceptableAnswers: [pair[1], pair[1].replace(/^(el|la|los|las|un|una)\s+/i, "")],
    explanation: `В книге эта пара дана так: ${pair[0]} — ${pair[1]}.`,
    reference: `Страницы ${lesson.printed_pages[0]}–${lesson.printed_pages.at(-1)}`,
  }));
}

function buildLesson(lesson, ocr) {
  const pack = loadPack(lesson.id);
  const pageText = lesson.pages.map((page) => ocr.get(page) || "").join("\n");
  const lines = meaningfulLines(pageText);
  const grounded = [];
  const extra = [];
  for (const item of pack.items || []) {
    const exercise = itemToExercise(item, grounded.length + extra.length, lesson.id);
    if (!exercise) continue;
    if (pageGrounded(item, pageText) || item.source_kind === "book" || item.source_kind === "adapted") grounded.push(exercise);
    else extra.push(exercise);
  }
  let exercises = [...grounded, ...extra].slice(0, 8);
  if (exercises.length < 4) exercises = [...exercises, ...fallbackExercises(lines, lesson)].slice(0, 8);
  const keyPoints = sentences(pageText).slice(0, 3);
  const steps = [
    { title: "Прочитайте страницы", detail: `В книге это страницы ${lesson.printed_pages[0]}${lesson.printed_pages.length > 1 ? `–${lesson.printed_pages.at(-1)}` : ""}.` },
    { title: "Разберите правило", detail: clean(pack.theory_ru) },
    { title: "Сделайте задания", detail: "Сначала варианты, затем ввод. Ответ можно проверить сразу." },
  ];
  return {
    id: lesson.id,
    bookId: lesson.book_id,
    order: lesson.unit,
    group: lesson.group,
    title: lesson.title,
    titleEs: clean(lesson.title_es).slice(0, 180),
    printedPages: lesson.printed_pages,
    filePages: lesson.pages,
    focus: clean(lesson.application_focus_ru),
    theory: clean(pack.theory_ru),
    keyPoints,
    examples: pickExamples(pack),
    vocabulary: pickVocabulary(pack, lines),
    steps,
    exercises,
    exerciseCount: exercises.length,
    groundedCount: exercises.filter((item) => item.reference && !item.reference.startsWith("Дополнительное")).length,
  };
}

function build() {
  const courses = COURSES.map((course) => {
    const ocr = loadOcr(course.id);
    const lessons = catalog.lessons
      .filter((lesson) => lesson.book_id === course.id)
      .map((lesson) => buildLesson(lesson, ocr));
    const groups = [];
    for (const lesson of lessons) {
      const last = groups.at(-1);
      if (!last || last.title !== lesson.group) groups.push({ title: lesson.group, lessonIds: [lesson.id] });
      else last.lessonIds.push(lesson.id);
    }
    return { ...course, lessonCount: lessons.length, groups, lessons };
  });
  const payload = {
    version: `${catalog.version}-courses`,
    builtAt: new Date().toISOString(),
    courses,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload));
  for (const course of courses) {
    const thin = course.lessons.filter((lesson) => lesson.exercises.length < 4 || !lesson.theory);
    console.log(course.id, course.lessonCount, "lessons; thin", thin.length);
    if (thin.length) console.log(thin.map((lesson) => lesson.id).join(", "));
  }
}

build();
