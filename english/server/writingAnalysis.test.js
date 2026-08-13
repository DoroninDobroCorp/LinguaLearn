import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  createCaptureAuthMiddleware,
  createWritingAnalysisService,
  EXTERNAL_SCORE_WEIGHTS,
  filterWritingCandidate,
  validateAnalyzerResult,
  validateWritingPayload,
} from './writingAnalysis.js';
import {
  createChatIdempotencyStore,
  normalizeGeminiChatHistory,
  normalizeOptionalMessageId,
} from './chatIdempotency.js';

function createTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deactivated')),
      cefr_level TEXT DEFAULT 'B1',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (email, password_hash, role) VALUES ('owner@example.com', 'hash', 'owner');

    CREATE TABLE curriculum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      score REAL DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_practiced TEXT,
      source TEXT DEFAULT 'preset',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  sqlite.prepare(`
    INSERT INTO curriculum_topics
      (name, category, level, score, source)
    VALUES (?, 'Grammar', ?, ?, ?)
  `).run('Past Simple (irregular verbs)', 'A2', 10, 'preset');
  sqlite.prepare(`
    INSERT INTO curriculum_topics
      (name, category, level, score, source)
    VALUES (?, 'Grammar', ?, ?, ?)
  `).run('Articles (a/an/the)', 'A1', 20, 'preset');
  sqlite.prepare(`
    INSERT INTO curriculum_topics
      (name, category, level, score, source)
    VALUES (?, 'Grammar', ?, ?, ?)
  `).run('Invented AI topic', 'B2', 50, 'ai_detected');

  return {
    exec: sqlite.exec.bind(sqlite),
    prepare: sqlite.prepare.bind(sqlite),
    transaction(fn) {
      return (...args) => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      };
    },
    close: sqlite.close.bind(sqlite),
  };
}

function writingEvent(overrides = {}) {
  return {
    eventId: 'telegram:message-42',
    sourceApp: 'Telegram',
    text: 'Yesterday I go to the store.',
    sentAt: '2026-08-10T10:00:00+02:00',
    ...overrides,
  };
}

function analyzerResponse(overrides = {}) {
  return {
    isEnglish: true,
    correctedText: 'Yesterday I went to the store.',
    summaryRu: 'Исправлено прошедшее время.',
    errors: [
      {
        original: 'go',
        correction: 'went',
        explanationRu: 'Нужна форма Past Simple.',
        topic: 'past simple (irregular verbs)',
        confidence: 0.99,
        kind: 'grammar_error',
        category: 'verb_tense',
      },
      {
        original: 'the store',
        correction: 'the store',
        explanationRu: 'Несуществующая тема должна быть отброшена.',
        topic: 'Invented AI topic',
        confidence: 0.8,
        kind: 'grammar_error',
        category: 'grammar',
      },
    ],
    topicEvidence: [
      {
        topic: 'Past Simple (irregular verbs)',
        outcome: 'success',
        confidence: 0.7,
        explanationRu: 'Часть конструкции верна.',
      },
      {
        topic: 'past simple (irregular verbs)',
        outcome: 'error',
        confidence: 0.95,
        explanationRu: 'Ошибка имеет приоритет.',
      },
      {
        topic: 'Invented AI topic',
        outcome: 'error',
        confidence: 1,
        explanationRu: 'Не каноническая тема.',
      },
    ],
    ...overrides,
  };
}

test('server-side candidate filter accepts prose and rejects words, URLs, Cyrillic, and code', () => {
  assert.deepEqual(filterWritingCandidate('Yesterday I went home.'), { accepted: true, reason: null });
  assert.deepEqual(filterWritingCandidate('That was great! 😊'), { accepted: true, reason: null });
  assert.deepEqual(filterWritingCandidate('That was great!😊'), { accepted: true, reason: null });
  assert.deepEqual(filterWritingCandidate('This uses version 1.2 without an ending'), { accepted: true, reason: null });
  assert.deepEqual(filterWritingCandidate("so now i tried but i can't see advice popup"), { accepted: true, reason: null });
  assert.deepEqual(
    filterWritingCandidate("hm, let's try again... yeah i still can not see a pop-up"),
    { accepted: true, reason: null },
  );
  assert.equal(filterWritingCandidate('hello').reason, 'no_sentence_terminator');
  assert.equal(filterWritingCandidate('good morning friend').reason, 'no_sentence_terminator');
  assert.equal(filterWritingCandidate('openai.com is useful.').reason, 'url_or_email');
  assert.equal(filterWritingCandidate('Это not English.').reason, 'contains_cyrillic');
  assert.equal(filterWritingCandidate('const answer = true;').reason, 'no_sentence_terminator');
});

test('payload validation normalizes timestamps and enforces stable event IDs', () => {
  const payload = validateWritingPayload(writingEvent());
  assert.equal(payload.sentAt, '2026-08-10T08:00:00.000Z');
  assert.equal(payload.previewOnly, false);
  assert.equal(validateWritingPayload(writingEvent({ previewOnly: true })).previewOnly, true);
  assert.throws(
    () => validateWritingPayload(writingEvent({ eventId: 'spaces are unsafe' })),
    { code: 'INVALID_EVENT_ID', statusCode: 400 },
  );
});

test('draft preview returns corrections without changing curriculum progress', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  const service = createWritingAnalysisService({ db, analyzer: async () => analyzerResponse() });

  const result = await service.analyze(writingEvent({
    eventId: 'preview-draft-1',
    previewOnly: true,
  }));

  assert.equal(result.response.accepted, true);
  assert.equal(result.response.previewOnly, true);
  assert.deepEqual(result.response.topicEvidence, []);
  assert.deepEqual(
    {
      ...db.prepare(`SELECT p.score, p.success_count, p.error_count AS failure_count FROM user_topic_progress p JOIN curriculum_topics c ON c.id = p.curriculum_topic_id WHERE c.name = ?`).get(
        'Past Simple (irregular verbs)',
      ),
    },
    { score: 10, success_count: 0, failure_count: 0 },
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence').get().count, 0);
});

test('strict analyzer validation rejects malformed confidence values', () => {
  assert.throws(
    () => validateAnalyzerResult(analyzerResponse({
      topicEvidence: [{
        topic: 'Articles (a/an/the)',
        outcome: 'success',
        confidence: 4,
        explanationRu: 'bad',
      }],
    })),
    { code: 'INVALID_ANALYZER_RESPONSE', statusCode: 502 },
  );
});

test('writing analysis stores canonical evidence once and replays without rescoring', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  let analyzerCalls = 0;
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => {
      analyzerCalls += 1;
      return analyzerResponse();
    },
  });

  const first = await service.analyze(writingEvent());
  assert.equal(first.replayed, false);
  assert.equal(first.response.accepted, true);
  assert.equal(first.response.topicEvidence.length, 1);
  assert.equal(first.response.topicEvidence[0].outcome, 'error');
  assert.equal(first.response.topicEvidence[0].scoreDelta, EXTERNAL_SCORE_WEIGHTS.error);
  assert.equal(first.response.errors[1].topic, null);

  const topic = db.prepare(`
    SELECT p.score, p.success_count, p.error_count AS failure_count
    FROM user_topic_progress p JOIN curriculum_topics c ON c.id = p.curriculum_topic_id WHERE c.name = ?
  `).get('Past Simple (irregular verbs)');
  assert.deepEqual({ ...topic }, { score: 8, success_count: 0, failure_count: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM writing_samples').get().count, 1);

  const replay = await service.analyze(writingEvent());
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.response, first.response);
  assert.equal(analyzerCalls, 1);
  assert.deepEqual(
    {
      ...db.prepare(`SELECT p.score, p.success_count, p.error_count AS failure_count FROM user_topic_progress p JOIN curriculum_topics c ON c.id = p.curriculum_topic_id WHERE c.name = ?`).get(
        'Past Simple (irregular verbs)',
      ),
    },
    { ...topic },
  );
  assert.equal(service.listRecent(10).length, 1);
});

test('an erroneous sentence cannot also award unrelated success points', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => analyzerResponse({
      topicEvidence: [
        {
          topic: 'Past Simple (irregular verbs)',
          outcome: 'error',
          confidence: 0.99,
          explanationRu: 'Неверная форма глагола.',
        },
        {
          topic: 'Articles (a/an/the)',
          outcome: 'success',
          confidence: 1,
          explanationRu: 'Артикль присутствует.',
        },
      ],
    }),
  });

  const result = await service.analyze(writingEvent({ eventId: 'no-success-farming' }));
  assert.deepEqual(
    result.response.topicEvidence.map((evidence) => [evidence.topic, evidence.outcome]),
    [['Past Simple (irregular verbs)', 'error']],
  );
  assert.equal(
    db.prepare('SELECT p.score FROM user_topic_progress p JOIN curriculum_topics c ON c.id = p.curriculum_topic_id WHERE c.name = ?').get('Articles (a/an/the)').score,
    20,
  );
});

test('a concurrent duplicate receives in-progress and only one analyzer runs', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  let analyzerCalls = 0;
  let releaseAnalyzer;
  const analyzerGate = new Promise((resolve) => {
    releaseAnalyzer = resolve;
  });
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => {
      analyzerCalls += 1;
      await analyzerGate;
      return analyzerResponse();
    },
  });

  const firstPromise = service.analyze(writingEvent({ eventId: 'concurrent-1' }));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    service.analyze(writingEvent({ eventId: 'concurrent-1' })),
    { code: 'EVENT_IN_PROGRESS', statusCode: 409 },
  );
  assert.equal(analyzerCalls, 1);

  releaseAnalyzer();
  await firstPromise;
  const replay = await service.analyze(writingEvent({ eventId: 'concurrent-1' }));
  assert.equal(replay.replayed, true);
  assert.equal(analyzerCalls, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence').get().count, 1);
});

test('filtered events are persisted and replayed without invoking the analyzer', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  let analyzerCalls = 0;
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => {
      analyzerCalls += 1;
      return analyzerResponse();
    },
  });
  const event = writingEvent({ eventId: 'word-only', text: 'Thanks' });

  const first = await service.analyze(event);
  const replay = await service.analyze(event);
  assert.equal(first.response.accepted, false);
  assert.equal(first.response.rejectionReason, 'no_sentence_terminator');
  assert.equal(replay.replayed, true);
  assert.equal(analyzerCalls, 0);
});

test('failed analyzer validation removes the processing lease for a safe retry', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => ({ nope: true }),
  });

  await assert.rejects(service.analyze(writingEvent()), { code: 'INVALID_ANALYZER_RESPONSE' });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM writing_samples').get().count, 0);
});

test('analyzer timeout releases the event reservation', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  const service = createWritingAnalysisService({
    db,
    analyzer: async () => new Promise(() => {}),
    analysisTimeoutMs: 10,
  });

  await assert.rejects(
    service.analyze(writingEvent({ eventId: 'timeout-1' })),
    { code: 'WRITING_ANALYSIS_TIMEOUT', statusCode: 504 },
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM writing_samples').get().count, 0);
});

test('service startup recovers processing rows left by an interrupted process', (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());
  createWritingAnalysisService({ db, analyzer: async () => analyzerResponse() });
  db.prepare(`
    INSERT INTO writing_samples (event_id, source_app, original_text, sent_at, status)
    VALUES ('crashed-1', 'Codex', 'I was writing.', '2026-08-10T08:00:00.000Z', 'processing')
  `).run();

  createWritingAnalysisService({ db, analyzer: async () => analyzerResponse() });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM writing_samples').get().count, 0);
});

test('capture auth is fail-closed and validates a Bearer token', () => {
  const run = (token, authorization) => {
    let nextCalled = false;
    const output = { statusCode: 200, headers: {}, body: null };
    const req = { get: () => authorization };
    const res = {
      set(name, value) { output.headers[name] = value; return this; },
      status(statusCode) { output.statusCode = statusCode; return this; },
      json(body) { output.body = body; return this; },
    };
    createCaptureAuthMiddleware({ token })(req, res, () => { nextCalled = true; });
    return { nextCalled, output };
  };

  assert.equal(run('', 'Bearer anything').output.statusCode, 503);
  assert.equal(run('secret', 'Bearer wrong').output.statusCode, 401);
  assert.equal(run('secret', 'Bearer secret').nextCalled, true);
});

test('chat message IDs reserve atomically, replay stored JSON, and reject conflicts', () => {
  const db = createTestDatabase();
  const store = createChatIdempotencyStore(db);
  assert.equal(normalizeOptionalMessageId(undefined), null);
  assert.equal(store.begin('chat-1', 'Hello.').state, 'reserved');
  assert.equal(store.begin('chat-1', 'Hello.').state, 'processing');
  store.complete('chat-1', { response: 'Hi!' });
  assert.deepEqual(store.begin('chat-1', 'Hello.'), {
    state: 'cached',
    response: { response: 'Hi!' },
  });
  assert.throws(
    () => store.begin('chat-1', 'Different message.'),
    { code: 'MESSAGE_ID_CONFLICT', statusCode: 409 },
  );
  db.close();
});

test('chat history normalization produces completed alternating Gemini turns', () => {
  assert.deepEqual(
    normalizeGeminiChatHistory([
      { role: 'assistant', content: 'orphaned by LIMIT' },
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second fragment' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'unfinished tail' },
    ]),
    [
      { role: 'user', parts: [{ text: 'first\nsecond fragment' }] },
      { role: 'model', parts: [{ text: 'answer' }] },
    ],
  );
});
