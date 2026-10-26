import { assessBookConversation } from "./bookApplication.js";
import express from "express";
import path from "node:path";
import {
  BookError,
  catalog,
  PRIVATE_BOOKS,
  requireBooks,
  enabled,
  lessonById,
  getBooksDashboard,
  markReading,
  setStartingPoint,
  publicRun,
  runById,
  assist,
  lessonProgress,
} from "./bookStore.js";
import { answerItem, prepareRun, preparation } from "./bookService.js";
import { startSession } from "../coach/coachService.js";
import {
  createVocabularyEntry,
  createVocabularyGroup,
  listVocabularyGroups,
} from "../vocabularyReview.js";
export function createBookRoutes({ db }) {
  const router = express.Router();
  const hits = new Map();
  const conversations = new Map();
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (!res.headersSent) {
        if (e.status)
          res
            .status(e.status)
            .json({ error: e.message, code: e.code || "BOOK_ERROR" });
        else {
          console.error("[books]", e);
          res.status(500).json({
            error: "Не удалось выполнить действие. Попробуй ещё раз.",
          });
        }
      }
    }
  };
  router.get(
    "/status",
    handle((req, res) => res.json({ enabled: enabled(db, req.profileId) })),
  );
  router.use((req, res, next) => {
    try {
      requireBooks(db, req.profileId);
      next();
    } catch (e) {
      res.status(e.status).json({ error: e.message, code: e.code });
    }
  });
  router.use((req, res, next) => {
    if (req.method === "GET") return next();
    const now = Date.now();
    const key = req.profileId;
    const previous = (hits.get(key) || []).filter((x) => now - x < 60000);
    if (previous.length >= 45)
      return res
        .status(429)
        .json({ error: "Слишком много действий подряд. Подожди минуту." });
    hits.set(key, [...previous, now]);
    next();
  });
  router.get(
    "/",
    handle((req, res) => res.json(getBooksDashboard(db, req.profileId))),
  );
  router.get(
    "/lessons/:id",
    handle((req, res) => {
      const lesson = lessonById(req.params.id);
      const siblings = catalog.lessons.filter(
        (l) => l.book_id === lesson.book_id,
      );
      const next = siblings[siblings.findIndex((l) => l.id === lesson.id) + 1];
      res.json({
        lesson: { ...lesson, next_lesson: next?.id || null },
        progress: lessonProgress(db, req.profileId, lesson),
        preparation:
          db
            .prepare(
              "SELECT id,status,error FROM book_preparations WHERE profile_id=? AND lesson_id=? AND status IN ('generating','failed') ORDER BY created_at DESC LIMIT 1",
            )
            .get(req.profileId, lesson.id) || null,
      });
    }),
  );
  router.post(
    "/lessons/:id/reading",
    handle((req, res) =>
      res.json(markReading(db, req.profileId, req.params.id, req.body || {})),
    ),
  );
  router.post(
    "/:bookId/starting-point",
    handle((req, res) => {
      setStartingPoint(
        db,
        req.profileId,
        req.params.bookId,
        req.body?.lessonId,
        req.body?.markEarlier ?? false,
      );
      res.json({ ok: true });
    }),
  );
  router.get(
    "/:bookId/pages/:page",
    handle((req, res) => {
      const book = catalog.books.find((b) => b.id === req.params.bookId);
      const page = Number(req.params.page);
      if (!book || !Number.isInteger(page) || page < 1 || page > book.pages)
        throw new BookError(404, "Страница не найдена.");
      res.sendFile(path.join(PRIVATE_BOOKS, "pages", book.id, `${page}.jpg`), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }),
  );
  router.post(
    "/lessons/:id/prepare",
    handle((req, res) =>
      res.json(
        prepareRun(
          db,
          req.profileId,
          req.params.id,
          req.body?.kind || "practice",
        ),
      ),
    ),
  );
  router.get(
    "/preparations/:id",
    handle((req, res) =>
      res.json(preparation(db, req.profileId, req.params.id)),
    ),
  );
  router.get(
    "/runs/:id",
    handle((req, res) => res.json(publicRun(db, req.profileId, req.params.id))),
  );
  router.post(
    "/runs/:id/items/:itemId/answer",
    handle(async (req, res) =>
      res.json(
        await answerItem(
          db,
          req.profileId,
          req.params.id,
          Number(req.params.itemId),
          req.body || {},
        ),
      ),
    ),
  );
  router.post(
    "/runs/:id/items/:itemId/hint",
    handle((req, res) =>
      res.json(
        assist(
          db,
          req.profileId,
          req.params.id,
          Number(req.params.itemId),
          false,
        ),
      ),
    ),
  );
  router.post(
    "/runs/:id/items/:itemId/reveal",
    handle((req, res) =>
      res.json(
        assist(
          db,
          req.profileId,
          req.params.id,
          Number(req.params.itemId),
          true,
        ),
      ),
    ),
  );
  router.post(
    "/lessons/:id/conversation",
    handle(async (req, res) => {
      const lesson = lessonById(req.params.id);
      const r = req.body?.runId
        ? runById(db, req.profileId, req.body.runId)
        : null;
      if (r && r.lesson_id !== lesson.id)
        throw new BookError(400, "Практика относится к другому уроку.");
      if (
        lesson.book_id === "gramatica" &&
        [123, 124, 125].includes(lesson.unit) &&
        req.body?.mode === "call"
      )
        throw new BookError(
          400,
          "Это урок на написание. Выбери текстовый разговор.",
          "BOOK_WRITTEN_ONLY",
        );
      const goal =
        r?.pack.conversation_goal_es ||
        `Conversá sobre ${lesson.title_es || lesson.title}. Ayudala a usar la estructura del tema en ejemplos de su vida en El Bolsón.`;
      const mode = req.body?.mode === "call" ? "call" : "chat";
      const key = `${req.profileId}:${lesson.id}:${mode}`;
      if (conversations.has(key))
        return res.json({ id: (await conversations.get(key)).id });
      const existing = db
        .prepare(
          `SELECT c.session_id FROM book_conversations c JOIN coach_sessions s ON s.id=c.session_id WHERE c.profile_id=? AND c.lesson_id=? AND s.status='active' AND s.mode=? AND c.version=? ORDER BY c.session_id DESC LIMIT 1`,
        )
        .get(req.profileId, lesson.id, mode, catalog.version);
      if (existing) return res.json({ id: existing.session_id });
      const pending = startSession(db, req.profileId, {
        mode,
        bookContext: {
          lesson_id: lesson.id,
          title: lesson.title,
          goal_es: goal,
          focus_keys: lesson.spot_keys,
          requires_written:
            lesson.book_id === "gramatica" &&
            [123, 124, 125].includes(lesson.unit),
        },
      });
      conversations.set(key, pending);
      try {
        const session = await pending;
        res.json({ id: session.id });
      } finally {
        conversations.delete(key);
      }
    }),
  );
  router.post(
    "/lessons/:id/conversations/:sessionId/check",
    handle(async (req, res) => {
      const sid = Number(req.params.sessionId);
      const row = db
        .prepare(
          "SELECT 1 FROM book_conversations WHERE session_id=? AND profile_id=? AND lesson_id=?",
        )
        .get(sid, req.profileId, req.params.id);
      if (!row) throw new BookError(404, "Разговор не найден.");
      res.json(await assessBookConversation(db, req.profileId, sid));
    }),
  );
  router.post(
    "/runs/:id/vocabulary/:index",
    handle((req, res) => {
      const r = runById(db, req.profileId, req.params.id);
      const index = Number(req.params.index);
      const word = r.pack.vocabulary[index];
      if (!Number.isInteger(index) || !word)
        throw new BookError(404, "Слово не найдено.");
      let group = listVocabularyGroups(db, req.profileId).find(
        (g) => g.name === "Из книг",
      );
      if (!group) group = createVocabularyGroup(db, req.profileId, "Из книг");
      try {
        const entry = createVocabularyEntry(db, req.profileId, {
          ...word,
          groupId: group.id,
        });
        res.json({ added: true, id: entry.id });
      } catch (e) {
        if (e.code === "DUPLICATE_WORD")
          res.json({ added: false, duplicate: true });
        else throw e;
      }
    }),
  );
  return router;
}
