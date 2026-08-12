import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';
import http from 'node:http';
import getDb from '../server/db.js';
import { createAuthMiddleware } from '../server/auth.js';
import { createDailyPracticeService } from '../server/dailyPractice.js';
import { getUserTopicProgress } from '../server/topicProgress.js';

describe('Today Daily Practice Engine Integration Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let user1Id, user1SessionId;
  let user2Id, user2SessionId;

  beforeEach(async () => {
    db = getDb(':memory:');

    // Seed curriculum_topics
    db.prepare("INSERT INTO curriculum_topics (id, name, category, level) VALUES (1, 'Verb \"to be\" (am/is/are)', 'Grammar', 'A1')").run();
    db.prepare("INSERT INTO curriculum_topics (id, name, category, level) VALUES (2, 'Present Simple (positive)', 'Grammar', 'A1')").run();
    db.prepare("INSERT INTO curriculum_topics (id, name, category, level) VALUES (4, 'Articles (a/an/the)', 'Grammar', 'A1')").run();

    // Create User 1
    const passHash = bcrypt.hashSync('TestPassword123!', 10);
    const u1 = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('user1@example.com', ?, 'user', 'active')"
    ).run(passHash);
    user1Id = u1.lastInsertRowid;

    user1SessionId = 'session-user-1-practice';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(user1SessionId, user1Id);

    // Create User 2
    const u2 = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('user2@example.com', ?, 'user', 'active')"
    ).run(passHash);
    user2Id = u2.lastInsertRowid;

    user2SessionId = 'session-user-2-practice';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(user2SessionId, user2Id);

    // Seed user_topic_progress for User 1: 1 recurring problem, 1 low score, rest not started
    db.prepare(`
      INSERT INTO user_topic_progress (user_id, curriculum_topic_id, status, score, error_count, success_count, last_error_at)
      VALUES (?, 4, 'recurring_problem', 20.0, 4, 1, CURRENT_TIMESTAMP)
    `).run(user1Id);

    db.prepare(`
      INSERT INTO user_topic_progress (user_id, curriculum_topic_id, status, score, error_count, success_count, last_success_at)
      VALUES (?, 2, 'improving', 35.0, 1, 3, CURRENT_TIMESTAMP)
    `).run(user1Id);

    // Setup Express App
    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(db);
    const practiceService = createDailyPracticeService(db);

    app.use('/api', (req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      const publicPaths = ['/api/auth/login', '/api/auth/signup'];
      if (publicPaths.includes(req.path)) {
        return next();
      }
      return authMiddleware(req, res, next);
    });

    app.get('/api/practice/today', (req, res) => practiceService.getTodaySession(req, res));
    app.post('/api/practice/sessions/:id/complete', (req, res) => practiceService.completeSession(req, res));

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) {
      db.close();
    }
  });

  it('VAL-PRIV-001 / Security: unauthenticated GET /api/practice/today returns 401 with security headers', async () => {
    const res = await fetch(`${baseUrl}/api/practice/today`);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('VAL-PRIV-001 / Security: unauthenticated POST /api/practice/sessions/123/complete returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/practice/sessions/123/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    });
    assert.equal(res.status, 401);
  });

  it('VAL-PRACT-001: GET /api/practice/today generates 3-7 exercises targeting 2-3 weak topics', async () => {
    const res = await fetch(`${baseUrl}/api/practice/today`, {
      headers: { Cookie: `lingua_session=${user1SessionId}` },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    const sessionData = body.session || body;
    assert.equal(sessionData.status, 'in_progress');
    assert.ok(Array.isArray(sessionData.topics));
    assert.ok(sessionData.topics.length >= 2 && sessionData.topics.length <= 3, 'Topics count should be 2-3');

    const topicIds = sessionData.topics.map((t) => t.id);
    assert.ok(topicIds.includes(4), 'Should select recurring problem topic (Articles)');

    assert.ok(Array.isArray(sessionData.exercises));
    assert.ok(sessionData.exercises.length >= 3 && sessionData.exercises.length <= 7, 'Exercises count should be 3-7');

    const ex = sessionData.exercises[0];
    assert.ok(ex.id);
    assert.ok(ex.curriculum_topic_id);
    assert.ok(ex.topic_name);
    assert.ok(ex.prompt);
    assert.ok(ex.canonical_answer);
    assert.ok(ex.explanation_ru);
  });

  it('GET /api/practice/today returns existing in_progress session on second call', async () => {
    const res1 = await fetch(`${baseUrl}/api/practice/today`, {
      headers: { Cookie: `lingua_session=${user1SessionId}` },
    });
    const body1 = await res1.json();
    const session1 = body1.session || body1;

    const res2 = await fetch(`${baseUrl}/api/practice/today`, {
      headers: { Cookie: `lingua_session=${user1SessionId}` },
    });
    const body2 = await res2.json();
    const session2 = body2.session || body2;

    assert.equal(session1.id, session2.id);
    assert.equal(session1.exercises.length, session2.exercises.length);
  });

  it('VAL-PRACT-002: POST /api/practice/sessions/:id/complete evaluates answers & updates topic scores exactly once', async () => {
    const getRes = await fetch(`${baseUrl}/api/practice/today`, {
      headers: { Cookie: `lingua_session=${user1SessionId}` },
    });
    const body = await getRes.json();
    const sessionData = body.session || body;
    const sessionId = sessionData.id;
    const exercises = sessionData.exercises;

    const answers = exercises.map((ex) => ({
      exercise_id: ex.id,
      answer: ex.canonical_answer,
    }));

    const initialProgress4 = getUserTopicProgress(db, user1Id, 4);

    const completeRes = await fetch(`${baseUrl}/api/practice/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${user1SessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers }),
    });

    assert.equal(completeRes.status, 200);
    const completeBody = await completeRes.json();
    assert.equal(completeBody.status, 'completed');
    assert.ok(Array.isArray(completeBody.results));
    assert.equal(completeBody.results.length, exercises.length);

    assert.ok(completeBody.results[0].explanation_ru);
    assert.equal(completeBody.results[0].is_correct, true);

    const updatedProgress4 = getUserTopicProgress(db, user1Id, 4);
    assert.notEqual(updatedProgress4.score, initialProgress4.score);
    const scoreAfterFirstComplete = updatedProgress4.score;

    const completeAgainRes = await fetch(`${baseUrl}/api/practice/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${user1SessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers }),
    });

    assert.equal(completeAgainRes.status, 200);
    const progressAfterSecondComplete = getUserTopicProgress(db, user1Id, 4);
    assert.equal(progressAfterSecondComplete.score, scoreAfterFirstComplete, 'Score should NOT update a second time');
  });

  it('VAL-CROSS-001: Strict multi-user data isolation on practice sessions', async () => {
    const res1 = await fetch(`${baseUrl}/api/practice/today`, {
      headers: { Cookie: `lingua_session=${user1SessionId}` },
    });
    const body1 = await res1.json();
    const session1 = body1.session || body1;

    const resUser2Complete = await fetch(`${baseUrl}/api/practice/sessions/${session1.id}/complete`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${user2SessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers: [] }),
    });

    assert.ok(resUser2Complete.status === 404 || resUser2Complete.status === 403);
  });
});
