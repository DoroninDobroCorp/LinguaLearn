import fs from "node:fs";
import { fileURLToPath } from "node:url";
export const catalog = JSON.parse(
  fs.readFileSync(new URL("./catalog.json", import.meta.url), "utf8"),
);
export const PRIVATE_BOOKS = fileURLToPath(
  new URL("../private/books/", import.meta.url),
);
export const REMINDER =
  "Наталия, ты можешь попросить любые изменения, которые тебе хочется: темы, темп, задания, объяснения, голос и оформление. Расскажи об этом в чате, где мы настраиваем LinguaLearn.";
export class BookError extends Error {
  constructor(status, message, code = "BOOK_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function ensureBookSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_enrollments (profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS book_lesson_state (
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, version TEXT NOT NULL,
      reading_done INTEGER NOT NULL DEFAULT 0, self_reported INTEGER NOT NULL DEFAULT 0, resume_page INTEGER,
      updated_at TEXT NOT NULL, PRIMARY KEY(profile_id, lesson_id, version));
    CREATE TABLE IF NOT EXISTS book_positions (
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, book_id TEXT NOT NULL, lesson_id TEXT NOT NULL,
      PRIMARY KEY(profile_id, book_id));
    CREATE TABLE IF NOT EXISTS book_runs (
      id TEXT PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL,
      version TEXT NOT NULL, kind TEXT NOT NULL, pack_json TEXT NOT NULL, created_at TEXT NOT NULL,
      completed_at TEXT, score INTEGER, UNIQUE(profile_id, lesson_id, id));
    CREATE INDEX IF NOT EXISTS idx_book_runs_profile ON book_runs(profile_id, lesson_id, created_at);
    CREATE TABLE IF NOT EXISTS book_answers (
      run_id TEXT NOT NULL REFERENCES book_runs(id) ON DELETE CASCADE, item_id INTEGER NOT NULL,
      assisted INTEGER NOT NULL DEFAULT 0, answer TEXT, verdict TEXT, feedback_json TEXT, created_at TEXT NOT NULL,
      PRIMARY KEY(run_id, item_id));
    CREATE TABLE IF NOT EXISTS book_conversations (
      session_id INTEGER PRIMARY KEY REFERENCES coach_sessions(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, version TEXT NOT NULL);
  `);
  const columns = db
    .prepare("PRAGMA table_info(book_conversations)")
    .all()
    .map((c) => c.name);
  if (!columns.includes("application_json"))
    db.exec("ALTER TABLE book_conversations ADD COLUMN application_json TEXT");
  if (!columns.includes("application_error"))
    db.exec("ALTER TABLE book_conversations ADD COLUMN application_error TEXT");
}
export function enabled(db, pid) {
  return Boolean(
    db.prepare("SELECT 1 FROM book_enrollments WHERE profile_id=?").get(pid),
  );
}
export function requireBooks(db, pid) {
  if (!enabled(db, pid))
    throw new BookError(
      403,
      "Книги не подключены к этому профилю.",
      "BOOKS_NOT_ENROLLED",
    );
}
export function lessonById(id) {
  const lesson = catalog.lessons.find((x) => x.id === id);
  if (!lesson)
    throw new BookError(404, "Урок не найден.", "BOOK_LESSON_NOT_FOUND");
  return lesson;
}
export function stateFor(db, pid, id) {
  return (
    db
      .prepare(
        "SELECT * FROM book_lesson_state WHERE profile_id=? AND lesson_id=? AND version=?",
      )
      .get(pid, id, catalog.version) || {}
  );
}
export function markReading(db, pid, id, { page, done, selfReported } = {}) {
  requireBooks(db, pid);
  const l = lessonById(id);
  const old = stateFor(db, pid, id);
  if (
    page !== undefined &&
    (!Number.isInteger(page) || !l.pages.includes(page))
  )
    throw new BookError(400, "Страница не относится к уроку.");
  for (const v of [done, selfReported])
    if (v !== undefined && typeof v !== "boolean")
      throw new BookError(400, "Некорректная отметка.");
  const stamp = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO book_lesson_state(profile_id,lesson_id,version,reading_done,self_reported,resume_page,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(profile_id,lesson_id,version) DO UPDATE SET reading_done=excluded.reading_done,self_reported=excluded.self_reported,resume_page=excluded.resume_page,updated_at=excluded.updated_at`,
    ).run(
      pid,
      id,
      catalog.version,
      done === undefined ? old.reading_done || 0 : Number(done),
      selfReported === undefined
        ? old.self_reported || 0
        : Number(selfReported),
      page ?? old.resume_page ?? l.pages[0],
      stamp,
    );
    db.prepare(
      "INSERT INTO book_positions VALUES(?,?,?) ON CONFLICT(profile_id,book_id) DO UPDATE SET lesson_id=excluded.lesson_id",
    ).run(pid, l.book_id, id);
  })();
  return stateFor(db, pid, id);
}
export function setStartingPoint(
  db,
  pid,
  bookId,
  lessonId,
  markEarlier = false,
) {
  requireBooks(db, pid);
  const target = lessonById(lessonId);
  if (target.book_id !== bookId || typeof markEarlier !== "boolean")
    throw new BookError(400, "Некорректная точка старта.");
  const lessons = catalog.lessons.filter((l) => l.book_id === bookId);
  db.transaction(() => {
    if (markEarlier)
      for (const l of lessons.slice(
        0,
        lessons.findIndex((l) => l.id === lessonId),
      ))
        markReading(db, pid, l.id, { selfReported: true });
    db.prepare(
      "INSERT INTO book_positions VALUES(?,?,?) ON CONFLICT(profile_id,book_id) DO UPDATE SET lesson_id=excluded.lesson_id",
    ).run(pid, bookId, lessonId);
  })();
}
export function runById(db, pid, id) {
  requireBooks(db, pid);
  const r = db
    .prepare(
      "SELECT * FROM book_runs WHERE id=? AND profile_id=? AND version=?",
    )
    .get(id, pid, catalog.version);
  if (!r)
    throw new BookError(404, "Практика не найдена.", "BOOK_RUN_NOT_FOUND");
  return { ...r, pack: JSON.parse(r.pack_json) };
}
export function publicRun(db, pid, id) {
  const r = runById(db, pid, id);
  const answers = db
    .prepare("SELECT * FROM book_answers WHERE run_id=?")
    .all(id);
  return {
    id: r.id,
    lesson_id: r.lesson_id,
    kind: r.kind,
    completed_at: r.completed_at,
    score: r.score,
    created_at: r.created_at,
    requires_written: Boolean(r.pack.requires_written),
    theory_ru: r.pack.theory_ru,
    examples: r.pack.examples,
    vocabulary: r.pack.vocabulary,
    conversation_goal_es: r.pack.conversation_goal_es,
    items: r.pack.items.map((item, index) => {
      const a = answers.find((x) => x.item_id === index);
      return {
        id: index,
        type: item.type,
        prompt: item.prompt,
        options: item.options || [],
        source_kind: item.source_kind,
        reference: item.reference,
        assisted: Boolean(a?.assisted),
        result: a?.verdict ? JSON.parse(a.feedback_json) : null,
      };
    }),
  };
}
export function saveAnswer(
  db,
  pid,
  runId,
  itemId,
  { answer, verdict, feedback_ru, corrected },
  now = new Date(),
) {
  return db.transaction(() => {
    const r = runById(db, pid, runId);
    if (!Number.isInteger(itemId) || !r.pack.items[itemId])
      throw new BookError(404, "Задание не найдено.");
    const old = db
      .prepare("SELECT * FROM book_answers WHERE run_id=? AND item_id=?")
      .get(runId, itemId);
    if (old?.verdict) return JSON.parse(old.feedback_json);
    if (r.completed_at) throw new BookError(409, "Эта практика уже завершена.");
    const result = {
      answer,
      verdict,
      feedback_ru,
      corrected,
      assisted: Boolean(old?.assisted),
    };
    db.prepare(
      `INSERT INTO book_answers(run_id,item_id,assisted,answer,verdict,feedback_json,created_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(run_id,item_id) DO UPDATE SET answer=excluded.answer,verdict=excluded.verdict,feedback_json=excluded.feedback_json`,
    ).run(
      runId,
      itemId,
      old?.assisted || 0,
      String(answer).slice(0, 1600),
      verdict,
      JSON.stringify(result),
      now.toISOString(),
    );
    const all = db
      .prepare(
        "SELECT verdict,assisted FROM book_answers WHERE run_id=? AND verdict IS NOT NULL",
      )
      .all(runId);
    if (all.length === r.pack.items.length) {
      const score = Math.round(
        (100 *
          all.filter((a) => a.verdict === "correct" && !a.assisted).length) /
          r.pack.items.length,
      );
      db.prepare("UPDATE book_runs SET completed_at=?,score=? WHERE id=?").run(
        now.toISOString(),
        score,
        runId,
      );
    }
    return result;
  })();
}
export function assist(db, pid, runId, itemId, reveal = false) {
  return db.transaction(() => {
    const r = runById(db, pid, runId);
    const item = r.pack.items[itemId];
    if (!Number.isInteger(itemId) || !item)
      throw new BookError(404, "Задание не найдено.");
    const old = db
      .prepare("SELECT * FROM book_answers WHERE run_id=? AND item_id=?")
      .get(runId, itemId);
    if (old?.verdict)
      return {
        hint: item.hint_ru,
        answer: item.answers.join(" / "),
        result: JSON.parse(old.feedback_json),
      };
    db.prepare(
      "INSERT INTO book_answers(run_id,item_id,assisted,created_at) VALUES(?,?,1,?) ON CONFLICT(run_id,item_id) DO UPDATE SET assisted=1",
    ).run(runId, itemId, new Date().toISOString());
    if (reveal)
      return {
        hint: item.hint_ru,
        answer: item.answers.join(" / "),
        result: saveAnswer(db, pid, runId, itemId, {
          answer: "Показан ответ",
          verdict: "incorrect",
          feedback_ru: item.explanation_ru,
          corrected: item.answers[0],
        }),
      };
    return { hint: item.hint_ru };
  })();
}
export function lessonProgress(db, pid, l, now = new Date()) {
  const state = stateFor(db, pid, l.id);
  const runs = db
    .prepare(
      "SELECT id,kind,completed_at,score,created_at FROM book_runs WHERE profile_id=? AND lesson_id=? AND version=? ORDER BY created_at",
    )
    .all(pid, l.id, catalog.version);
  const done = runs.filter((r) => r.completed_at);
  const passed = done.filter((r) => r.score >= 80);
  const first = passed[0];
  const delayed =
    first &&
    passed.find(
      (r) =>
        Date.parse(r.created_at) - Date.parse(first.completed_at) >=
        3 * 86400000,
    );
  const talks = db
    .prepare(
      `SELECT c.session_id,s.status,s.analysis_json,c.application_json,c.application_error FROM book_conversations c JOIN coach_sessions s ON s.id=c.session_id AND s.profile_id=c.profile_id WHERE c.profile_id=? AND c.lesson_id=? AND c.version=? ORDER BY c.session_id DESC`,
    )
    .all(pid, l.id, catalog.version);
  const applied = talks.some((t) => {
    if (t.status !== "analyzed" || !t.application_json) return false;
    try {
      const a = JSON.parse(t.application_json);
      return (
        a.applied === true && Array.isArray(a.evidence) && a.evidence.length > 0
      );
    } catch {
      return false;
    }
  });
  const completed = Boolean(state.reading_done && done.length);
  const last = done.at(-1);
  const mastered = Boolean(
    completed && delayed && applied && last?.score >= 80,
  );
  const interval = last?.score >= 80 ? (mastered ? 7 : 3) : 1;
  const dueAt = last
    ? new Date(
        Date.parse(last.completed_at) + interval * 86400000,
      ).toISOString()
    : null;
  return {
    reading_done: Boolean(state.reading_done),
    self_reported: Boolean(state.self_reported),
    resume_page: state.resume_page ?? l.pages[0],
    completed,
    mastered,
    applied,
    due_at: dueAt,
    due: Boolean(dueAt && Date.parse(dueAt) <= now.getTime()),
    best_score: done.length ? Math.max(...done.map((x) => x.score)) : null,
    last_score: last?.score ?? null,
    last_run: runs.at(-1)?.id || null,
    active_run: runs.find((r) => !r.completed_at)?.id || null,
    practice_count: done.length,
    history: done
      .slice(-20)
      .reverse()
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        completed_at: r.completed_at,
        score: r.score,
      })),
    talks: talks.map(
      ({ session_id, status, application_error, application_json }) => ({
        session_id,
        status,
        application_error,
        application_checked: Boolean(application_json),
      }),
    ),
    status: mastered
      ? "Закреплено"
      : completed
        ? "Пройдено"
        : state.self_reported
          ? "Изучала раньше"
          : state.reading_done || runs.length
            ? "В процессе"
            : "Не начато",
  };
}
export function getBooksDashboard(db, pid, now = new Date()) {
  if (!enabled(db, pid)) return { enabled: false, books: [], reminder: null };
  const lessons = catalog.lessons.map((l) => ({
    ...l,
    progress: lessonProgress(db, pid, l, now),
  }));
  const books = catalog.books.map((b) => {
    const ls = lessons.filter((l) => l.book_id === b.id);
    const saved = db
      .prepare(
        "SELECT lesson_id FROM book_positions WHERE profile_id=? AND book_id=?",
      )
      .get(pid, b.id)?.lesson_id;
    const current =
      ls.find((l) => l.id === saved && !l.progress.completed) ||
      ls.find((l) => l.progress.active_run) ||
      ls.find((l) => !l.progress.completed && !l.progress.self_reported) ||
      ls.find((l) => !l.progress.completed) ||
      ls[0];
    const completed = ls.filter((l) => l.progress.completed).length;
    return {
      ...b,
      total: ls.length,
      completed,
      percent: Math.round((completed * 100) / ls.length),
      mastered: ls.filter((l) => l.progress.mastered).length,
      self_reported: ls.filter(
        (l) => l.progress.self_reported && !l.progress.completed,
      ).length,
      current_lesson: current.id,
    };
  });
  const due = lessons
    .filter((l) => l.progress.due)
    .sort((a, b) => a.progress.due_at.localeCompare(b.progress.due_at));
  const next = due[0] || lessons.find((l) => l.id === books[0].current_lesson);
  return {
    enabled: true,
    version: catalog.version,
    books,
    lessons,
    due: due.map((l) => l.id),
    next_lesson: next.id,
    reminder: REMINDER,
  };
}
