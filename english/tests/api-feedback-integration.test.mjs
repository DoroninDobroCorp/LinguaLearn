import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';
import { createWritingAnalysisService, createWritingFeedbackHandler } from '../server/writingAnalysis.js';

function createTestUserAndToken(db) {
  const email = `test-fb-${Date.now()}@example.com`;
  const user = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, 'hash', 'user') RETURNING id").get(email);
  const deviceTokenService = createDeviceTokenService(db);
  const { token } = deviceTokenService.createToken({ userId: user.id, deviceName: 'Test Device' });
  return { userId: user.id, token };
}

test('HTTP API: VAL-CAPT-007 & VAL-CAPT-008 End-to-End Feedback & Progress Undo via API', async (t) => {
  const db = getDb(':memory:');

  const writingAnalysisService = createWritingAnalysisService({ db, analyzer: async () => ({}) });
  const deviceAuth = createDeviceAuthMiddleware(db);

  const app = express();
  app.post(
    '/api/writing/samples/:id/feedback',
    deviceAuth,
    express.json({ limit: '32kb' }),
    createWritingFeedbackHandler({ service: writingAnalysisService }),
  );

  let server;
  let baseUrl;
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    db.close();
  });

  const { userId, token } = createTestUserAndToken(db);

  // Create writing sample directly in DB
  const sampleRes = db.prepare(`
    INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at, status, accepted)
    VALUES (?, ?, 'Slack', 'Yesterday I went to store.', CURRENT_TIMESTAMP, 'completed', 1)
  `).run(userId, `evt-api-fb-${Date.now()}`);
  const sampleId = sampleRes.lastInsertRowid;

  // Ensure topic exists in DB
  db.prepare("INSERT OR IGNORE INTO curriculum_topics (id, name, category, level) VALUES (1, 'Articles (a/an/the)', 'Grammar', 'A1')").run();
  const topicRow = db.prepare('SELECT id FROM curriculum_topics LIMIT 1').get();
  assert.ok(topicRow, 'Topic should exist in DB');
  const topicId = topicRow.id;

  // Insert mock evidence and user progress to test score undo deterministically
  db.prepare(`
    INSERT INTO grammar_evidence (user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta)
    VALUES (?, ?, ?, 'error', 0.95, 'Missing article', -2.0)
  `).run(userId, sampleId, topicId);

  db.prepare(`
    INSERT INTO user_topic_progress (user_id, curriculum_topic_id, status, score, success_count, error_count)
    VALUES (?, ?, 'recurring_problem', 48.0, 0, 1)
    ON CONFLICT(user_id, curriculum_topic_id) DO UPDATE SET score = 48.0, error_count = 1, status = 'recurring_problem'
  `).run(userId, topicId);

  // 1. Unauthenticated feedback request -> HTTP 401
  const unauthRes = await fetch(`${baseUrl}/api/writing/samples/${sampleId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback_type: 'helpful' }),
  });
  assert.equal(unauthRes.status, 401, 'Unauthenticated feedback request should return 401');

  // 2. VAL-CAPT-007: Submit helpful feedback via HTTP -> HTTP 200
  const helpfulRes = await fetch(`${baseUrl}/api/writing/samples/${sampleId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ feedback_type: 'helpful', notes: 'Very clear correction' }),
  });

  assert.equal(helpfulRes.status, 200, 'Submitting helpful feedback should return 200');
  const helpfulJson = await helpfulRes.json();
  assert.equal(helpfulJson.success, true);
  assert.equal(helpfulJson.feedback.feedback_type, 'helpful');
  assert.equal(helpfulJson.feedback.notes, 'Very clear correction');

  const fbRow = db.prepare('SELECT * FROM correction_feedback WHERE user_id = ? AND writing_sample_id = ? AND feedback_type = ?')
    .get(userId, sampleId, 'helpful');
  assert.ok(fbRow, 'correction_feedback row must exist in DB');

  // 3. VAL-CAPT-008: Submit undo_progress feedback via HTTP -> HTTP 200
  const undoRes1 = await fetch(`${baseUrl}/api/writing/samples/${sampleId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ feedback_type: 'undo_progress' }),
  });

  assert.equal(undoRes1.status, 200, 'Submitting undo_progress should return 200');
  const undoJson1 = await undoRes1.json();
  assert.equal(undoJson1.success, true);
  assert.equal(undoJson1.undoneEvidenceCount, 1);

  // Verify score in user_topic_progress is restored to 50.0 (48.0 - (-2.0))
  const progRow1 = db.prepare('SELECT score, error_count FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = ?').get(userId, topicId);
  assert.equal(progRow1.score, 50.0, 'Score should be restored to 50.0');
  assert.equal(progRow1.error_count, 0, 'Error count should be decremented to 0');

  // 4. Repeated undo_progress POST -> HTTP 200 (Idempotency)
  const undoRes2 = await fetch(`${baseUrl}/api/writing/samples/${sampleId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ feedback_type: 'undo_progress' }),
  });

  assert.equal(undoRes2.status, 200, 'Repeated undo_progress should return 200 OK');
  const undoJson2 = await undoRes2.json();
  assert.equal(undoJson2.success, true);

  const progRow2 = db.prepare('SELECT score, error_count FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = ?').get(userId, topicId);
  assert.equal(progRow2.score, 50.0, 'Score should remain 50.0 without double reversing');
  assert.equal(progRow2.error_count, 0, 'Error count should remain 0');
});
