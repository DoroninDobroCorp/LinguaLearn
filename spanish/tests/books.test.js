import { answerItem } from "../server/books/bookService.js";
import { answerKey } from "../server/books/bookService.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import express from "express";
import { ensureCoachSchema } from "../server/coach/coachStore.js";
import {
  catalog,
  PRIVATE_BOOKS,
  ensureBookSchema,
  getBooksDashboard,
  markReading,
  setStartingPoint,
  lessonById,
  lessonProgress,
  publicRun,
  saveAnswer,
  assist,
  runById,
} from "../server/books/bookStore.js";
import {
  validatePack,
  initPreparations,
  preparation,
} from "../server/books/bookService.js";
import { validateApplication } from "../server/books/bookApplication.js";
import { createBookRoutes } from "../server/books/bookRoutes.js";
function dbFixture() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  db.exec(
    "CREATE TABLE profiles(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO profiles VALUES(1,'Test'),(2,'Other');",
  );
  ensureCoachSchema(db);
  ensureBookSchema(db);
  initPreparations(db);
  db.exec("INSERT INTO book_enrollments(profile_id) VALUES(1)");
  return db;
}
function pack() {
  return {
    theory_ru:
      "Это проверенное объяснение темы с примерами и понятной практикой. Оно достаточно подробное для выполнения задания.",
    examples: [{ es: "Ayer fui al parque.", ru: "Вчера я ходила в парк." }],
    vocabulary: [],
    conversation_goal_es: "Contá qué pasó ayer.",
    items: Array.from({ length: 8 }, (_, i) => ({
      type: "gap",
      prompt: `${i + 1}. Ayer ____ al parque.`,
      options: [],
      answers: ["fui"],
      hint_ru: "Действие завершилось.",
      explanation_ru: "Это прошедшее завершённое действие.",
      source_kind: "additional",
      reference: "Практика",
      source_quote: "",
    })),
  };
}
function run(
  db,
  {
    pid = 1,
    lesson = "grammar-064",
    when = "2026-10-01T12:00:00.000Z",
    kind = "practice",
  } = {},
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO book_runs(id,profile_id,lesson_id,version,kind,pack_json,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(id, pid, lesson, catalog.version, kind, JSON.stringify(pack()), when);
  return id;
}
function finish(db, id, when, incorrect = 0) {
  for (let i = 0; i < 8; i++)
    saveAnswer(
      db,
      1,
      id,
      i,
      {
        answer: i < incorrect ? "iba" : "fui",
        verdict: i < incorrect ? "incorrect" : "correct",
        corrected: "fui",
        feedback_ru: "Разбор",
      },
      new Date(when),
    );
}
describe("Complete book content", () => {
  it("covers both complete routes, the original pages, and every grammar answer key", () => {
    assert.equal(
      catalog.lessons.filter((x) => x.book_id === "gramatica").length,
      126,
    );
    assert.equal(
      catalog.lessons.filter((x) => x.book_id === "nivel2").length,
      24,
    );
    const source = JSON.parse(
      fs.readFileSync(PRIVATE_BOOKS + "/sources.json", "utf8"),
    );
    const ids = new Set(catalog.lessons.map((l) => l.id));
    assert.equal(ids.size, 150);
    for (const l of catalog.lessons) {
      assert.ok(source[l.id].text.length > 50, l.id);
      for (const p of l.pages)
        assert.ok(
          fs.existsSync(`${PRIVATE_BOOKS}/pages/${l.book_id}/${p}.jpg`),
          `${l.id}:${p}`,
        );
      for (const id of l.grammar_links) assert.ok(ids.has(id));
      if (l.book_id === "gramatica" && l.unit < 126)
        assert.match(source[l.id].key, new RegExp("Unidad " + l.unit + ":"));
    }
    const nivelPages = new Set(
      catalog.lessons
        .filter((l) => l.book_id === "nivel2")
        .flatMap((l) => l.pages),
    );
    for (const [a, b] of [
      [7, 34],
      [37, 76],
      [79, 95],
      [99, 107],
      [111, 131],
    ])
      for (let p = a; p <= b; p++)
        assert.ok(nivelPages.has(p), `Uncovered study page ${p}`);
  });
  it("rejects invalid choices, fabricated quotations, duplicate tasks and copied review questions", () => {
    const l = lessonById("grammar-064");
    const s = { text: "Una frase del original", key: "" };
    const p = pack();
    p.items[0] = {
      ...p.items[0],
      source_kind: "book",
      source_quote: "Una frase",
      reference: "PDF 139, ejercicio 64.1",
    };
    assert.equal(validatePack(p, l, s).items.length, 8);
    assert.throws(() =>
      validatePack(
        {
          ...p,
          items: p.items.map((x) => ({ ...x, source_quote: "inventada" })),
        },
        l,
        s,
      ),
    );
    assert.throws(() => validatePack(p, l, s, "review"));
    assert.throws(() =>
      validatePack({ ...p, items: [...p.items.slice(0, 7), p.items[0]] }, l, s),
    );
    p.items[1] = {
      ...p.items[1],
      type: "choice",
      options: ["fui", "FUI"],
      answers: ["fui"],
    };
    assert.throws(() => validatePack(p, l, s));
  });
});
describe("Honest, isolated progress", () => {
  it("does not award progress for browsing or self-reporting; stores page and start point", () => {
    const db = dbFixture();
    let d = getBooksDashboard(db, 1);
    assert.equal(d.books[0].completed, 0);
    markReading(db, 1, "grammar-064", { page: 139, selfReported: true });
    let p = lessonProgress(db, 1, lessonById("grammar-064"));
    assert.equal(p.resume_page, 139);
    assert.equal(p.completed, false);
    assert.equal(p.self_reported, true);
    assert.throws(() => markReading(db, 1, "grammar-064", { page: 999 }));
    assert.throws(() => markReading(db, 1, "grammar-064", { done: "yes" }));
    setStartingPoint(db, 1, "nivel2", "nivel2-03", true);
    assert.equal(
      lessonProgress(db, 1, lessonById("nivel2-01")).self_reported,
      true,
    );
    assert.equal(getBooksDashboard(db, 1).books[0].completed, 0);
    run(db);
    setStartingPoint(db, 1, "gramatica", "grammar-066", false);
    assert.equal(
      getBooksDashboard(db, 1).books.find((b) => b.id === "gramatica")
        .current_lesson,
      "grammar-066",
    );
    assert.equal(getBooksDashboard(db, 2).enabled, false);
    assert.throws(() => markReading(db, 2, "grammar-064", { done: true }));
  });
  it("never exposes answer keys before a submission or reveal", () => {
    const db = dbFixture();
    const id = run(db);
    const pub = publicRun(db, 1, id);
    assert.equal(pub.items[0].answers, undefined);
    assert.equal(pub.items[0].hint_ru, undefined);
    assert.equal(pub.items[0].explanation_ru, undefined);
    assert.throws(() => runById(db, 2, id));
  });
  it("counts hints and reveals as assisted and is idempotent after submit", () => {
    const db = dbFixture();
    const id = run(db);
    assist(db, 1, id, 0);
    assist(db, 1, id, 1, true);
    for (let i = 0; i < 8; i++)
      saveAnswer(db, 1, id, i, {
        answer: "fui",
        verdict: "correct",
        corrected: "fui",
        feedback_ru: "Верно",
      });
    assert.equal(publicRun(db, 1, id).score, 75);
    saveAnswer(db, 1, id, 1, {
      answer: "fui",
      verdict: "correct",
      corrected: "fui",
      feedback_ru: "Верно",
    });
    assert.equal(publicRun(db, 1, id).score, 75);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM book_answers").get().n, 8);
  });
  it("requires reading, a delayed fresh successful run and validated conversation evidence", () => {
    const db = dbFixture();
    const l = lessonById("grammar-064");
    const a = run(db);
    finish(db, a, "2026-10-01T12:05:00.000Z");
    assert.equal(lessonProgress(db, 1, l).completed, false);
    markReading(db, 1, l.id, { done: true });
    assert.equal(lessonProgress(db, 1, l).completed, true);
    assert.equal(lessonProgress(db, 1, l).mastered, false);
    const sameDay = run(db, {
      when: "2026-10-01T13:00:00.000Z",
      kind: "review",
    });
    finish(db, sameDay, "2026-10-01T13:05:00.000Z");
    assert.equal(lessonProgress(db, 1, l).mastered, false);
    const later = run(db, { when: "2026-10-05T12:00:00.000Z", kind: "review" });
    finish(db, later, "2026-10-05T12:05:00.000Z");
    assert.equal(lessonProgress(db, 1, l).mastered, false);
    const sid = db
      .prepare(
        "INSERT INTO coach_sessions(profile_id,status,analysis_json) VALUES(1,'analyzed',?)",
      )
      .run(
        JSON.stringify({
          successes: [
            {
              spot_key: "preterito-vs-imperfecto",
              example: "Caminaba cuando te vi.",
            },
          ],
        }),
      ).lastInsertRowid;
    db.prepare(
      "INSERT INTO book_conversations(session_id,profile_id,lesson_id,version) VALUES(?,?,?,?)",
    ).run(sid, 1, l.id, catalog.version);
    assert.equal(
      lessonProgress(db, 1, l).mastered,
      false,
      "Broad coach successes alone do not prove the exact book lesson",
    );
    db.prepare(
      "UPDATE book_conversations SET application_json=? WHERE session_id=?",
    ).run(
      JSON.stringify({
        applied: true,
        evidence: [{ quote: "Caminaba cuando te vi." }],
      }),
      sid,
    );
    assert.equal(
      lessonProgress(db, 1, l, new Date("2026-10-15")).mastered,
      true,
    );
    assert.equal(lessonProgress(db, 1, l, new Date("2026-10-15")).due, true);
    const failed = run(db, {
      when: "2026-10-10T12:00:00.000Z",
      kind: "review",
    });
    finish(db, failed, "2026-10-10T12:05:00.000Z", 4);
    assert.equal(lessonProgress(db, 1, l).mastered, false);
    db.prepare("UPDATE coach_sessions SET status='failed' WHERE id=?").run(sid);
    assert.equal(lessonProgress(db, 1, l).mastered, false);
  });
  it("rejects another profile preparations and recovers interrupted preparation", () => {
    const db = dbFixture();
    db.prepare(
      "INSERT INTO book_preparations(id,profile_id,lesson_id,kind,status,created_at) VALUES('job',1,'grammar-064','practice','generating','now')",
    ).run();
    assert.throws(() => preparation(db, 2, "job"));
    initPreparations(db);
    assert.equal(preparation(db, 1, "job").status, "failed");
  });
  it("cascades deleted profile data", () => {
    const db = dbFixture();
    const id = run(db);
    finish(db, id, "2026-10-01T12:05:00.000Z");
    db.prepare("DELETE FROM profiles WHERE id=1").run();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM book_answers").get().n, 0);
  });
});
describe("Book routes and boundaries", () => {
  it("requires enrollment for pages, rejects traversal, and isolates run IDs", async () => {
    const db = dbFixture();
    const id = run(db);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.profileId = Number(req.get("x-test-profile") || 1);
      next();
    });
    app.use("/api/books", createBookRoutes({ db }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}/api/books`;
    try {
      assert.equal(
        (
          await fetch(base + "/gramatica/pages/139", {
            headers: { "x-test-profile": "2" },
          })
        ).status,
        403,
      );
      const image = await fetch(base + "/gramatica/pages/139");
      assert.equal(image.status, 200);
      assert.match(image.headers.get("content-type"), /image\/jpeg/);
      assert.match(image.headers.get("cache-control"), /no-store/);
      assert.equal((await fetch(base + "/gramatica/pages/999")).status, 404);
      assert.equal((await fetch(base + "/not-a-book/pages/1")).status, 404);
      db.exec("INSERT INTO book_enrollments(profile_id) VALUES(2)");
      assert.equal(
        (
          await fetch(base + "/runs/" + id, {
            headers: { "x-test-profile": "2" },
          })
        ).status,
        404,
      );
      const wrong = await fetch(base + "/runs/" + id + "/items/100/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "fui" }),
      });
      assert.equal(wrong.status, 404);
      const pub = await (await fetch(base + "/runs/" + id)).json();
      assert.equal(pub.items[0].answers, undefined);
    } finally {
      await new Promise((r) => server.close(r));
      db.close();
    }
  });
});

describe("Book application evidence", () => {
  it("rejects invented, teacher and low confidence quotations", () => {
    const messages = [
      {
        id: 1,
        role: "user",
        content: "Cuando era chica, iba al parque todos los domingos.",
      },
      { id: 2, role: "assistant", content: "Yo iba al parque." },
    ];
    assert.equal(
      validateApplication(
        {
          applied: true,
          confidence: 0.95,
          evidence: [
            { message_id: 1, quote: "Cuando era chica, iba al parque" },
          ],
        },
        messages,
      ).applied,
      true,
    );
    for (const evidence of [
      [{ message_id: 1, quote: "Una cita inventada" }],
      [{ message_id: 2, quote: "Yo iba al parque." }],
    ])
      assert.equal(
        validateApplication(
          { applied: true, confidence: 0.95, evidence },
          messages,
        ).applied,
        false,
      );
    assert.equal(
      validateApplication(
        {
          applied: true,
          confidence: 0.5,
          evidence: [
            { message_id: 1, quote: "Cuando era chica, iba al parque" },
          ],
        },
        messages,
      ).applied,
      false,
    );
  });
});

describe("Writing-specific grading", () => {
  it("preserves case for the capitalization lesson and accents for spelling", () => {
    assert.notEqual(
      answerKey("grammar-125", "Chile"),
      answerKey("grammar-125", "chile"),
    );
    assert.equal(
      answerKey("grammar-064", "Fui."),
      answerKey("grammar-064", "fui"),
    );
    assert.notEqual(
      answerKey("grammar-123", "habló"),
      answerKey("grammar-123", "hablo"),
    );
    const p = pack();
    p.items[0] = {
      ...p.items[0],
      type: "choice",
      options: ["lunes", "Lunes"],
      answers: ["lunes"],
      source_kind: "book",
      source_quote: "lunes",
      reference: "PDF 263",
    };
    const validated = validatePack(p, lessonById("grammar-125"), {
      text: "lunes",
      key: "",
    });
    assert.equal(validated.requires_written, true);
    assert.equal(validated.items[0].options.length, 2);
  });
});

describe("Writing API enforcement", () => {
  it("does not accept wrong capitalization or voice as spelling proof", async () => {
    const db = dbFixture();
    const id = run(db, { lesson: "grammar-125" });
    const p = pack();
    p.requires_written = true;
    p.items[0] = {
      ...p.items[0],
      type: "choice",
      prompt: "El día: lunes o Lunes",
      options: ["lunes", "Lunes"],
      answers: ["lunes"],
    };
    p.items[1] = {
      ...p.items[1],
      type: "open",
      prompt: "Nombre del país: chile",
      answers: ["Chile"],
    };
    db.prepare("UPDATE book_runs SET pack_json=? WHERE id=?").run(
      JSON.stringify(p),
      id,
    );
    assert.equal(
      (await answerItem(db, 1, id, 0, { answer: "Lunes" })).verdict,
      "incorrect",
    );
    assert.equal(
      (await answerItem(db, 1, id, 1, { answer: "chile" })).verdict,
      "incorrect",
    );
    await assert.rejects(
      answerItem(db, 1, id, 2, { audio: "fake", mimeType: "audio/webm" }),
      /Ответь текстом/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM book_answers WHERE run_id=?").get(id)
        .n,
      2,
    );
  });
});
