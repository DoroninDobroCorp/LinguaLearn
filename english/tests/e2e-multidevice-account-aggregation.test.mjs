import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';
import {
  createWritingAnalysisService,
  createWritingAnalyzeHandler,
  createWritingSamplesHandler,
} from '../server/writingAnalysis.js';

describe('VAL-ACCOUNT-002: E2E Multi-Device Account Aggregation Test Suite', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let authService;
  let deviceTokenService;
  let writingService;

  let userId1;
  let user1SessionCookie;
  let user1Header;

  let userId2;
  let user2SessionCookie;
  let user2Header;

  let tokenMacBookA; // { id, token, tokenHash, deviceName }
  let tokenMacBookB; // { id, token, tokenHash, deviceName }
  let tokenMacBookC; // User 2 token

  let analyzerCalls = 0;

  beforeEach(async () => {
    analyzerCalls = 0;
    db = getDb(':memory:');

    // Seed preset curriculum topics
    db.prepare(`
      INSERT OR IGNORE INTO curriculum_topics (id, name, category, level, source)
      VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO curriculum_topics (id, name, category, level, source)
      VALUES (2, 'Articles (a/an/the)', 'Grammar', 'A1', 'preset')
    `).run();

    // Create User 1
    const u1Res = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('user1@example.com', 'hash', 'user', 'active')
    `).run();
    userId1 = u1Res.lastInsertRowid;
    user1SessionCookie = 'session-user-1-multidevice';
    user1Header = `lingua_session=${user1SessionCookie}`;
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
      .run(user1SessionCookie, userId1);
    db.prepare("INSERT INTO user_settings (user_id, raw_text_retention_days) VALUES (?, 7)").run(userId1);

    // Create User 2 (for cross-user isolation verification)
    const u2Res = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('user2@example.com', 'hash', 'user', 'active')
    `).run();
    userId2 = u2Res.lastInsertRowid;
    user2SessionCookie = 'session-user-2-multidevice';
    user2Header = `lingua_session=${user2SessionCookie}`;
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
      .run(user2SessionCookie, userId2);
    db.prepare("INSERT INTO user_settings (user_id, raw_text_retention_days) VALUES (?, 7)").run(userId2);

    authService = createAuthService(db);
    deviceTokenService = createDeviceTokenService(db);

    const mockAnalyzer = async ({ text }) => {
      analyzerCalls++;
      const isGo = text.includes('go');
      const isWrite = text.includes('write');

      if (isGo) {
        return {
          isEnglish: true,
          assessment: 'clear_error',
          correctedText: text.replace(/\bgo\b/g, 'went'),
          summaryRu: 'Исправлена форма Past Simple.',
          errors: [
            {
              original: 'go',
              correction: 'went',
              explanationRu: 'Используйте Past Simple для действия в прошлом.',
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.95,
              kind: 'grammar_error',
              category: 'verb_tense',
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.95,
              explanationRu: 'Ошибка в форме Past Simple.',
            },
          ],
        };
      }

      if (isWrite) {
        return {
          isEnglish: true,
          assessment: 'clear_error',
          correctedText: text.replace(/\bwrite\b/g, 'wrote'),
          summaryRu: 'Исправлена форма Past Simple.',
          errors: [
            {
              original: 'write',
              correction: 'wrote',
              explanationRu: 'Используйте Past Simple для действия в прошлом.',
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.92,
              kind: 'grammar_error',
              category: 'verb_tense',
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.92,
              explanationRu: 'Ошибка в форме Past Simple.',
            },
          ],
        };
      }

      return {
        isEnglish: true,
        assessment: 'correct',
        correctedText: text,
        summaryRu: 'Корректное предложение.',
        errors: [],
        topicEvidence: [
          {
            topic: 'Articles (a/an/the)',
            outcome: 'success',
            confidence: 0.9,
            explanationRu: 'Правильное использование артикля.',
          },
        ],
      };
    };

    writingService = createWritingAnalysisService({
      db,
      analyzer: mockAnalyzer,
    });

    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(db);
    const deviceAuthMiddleware = createDeviceAuthMiddleware(db);

    // Device token endpoints
    app.post('/api/devices/tokens', authMiddleware, (req, res) => {
      deviceTokenService.handleCreateToken(req, res);
    });

    app.get('/api/devices/tokens', authMiddleware, (req, res) => {
      deviceTokenService.handleListTokens(req, res);
    });

    app.post('/api/devices/tokens/:id/revoke', authMiddleware, (req, res) => {
      deviceTokenService.handleRevokeToken(req, res);
    });

    // Writing analysis endpoints
    app.post(
      '/api/writing/analyze',
      deviceAuthMiddleware,
      createWritingAnalyzeHandler({ service: writingService })
    );

    app.get(
      '/api/writing/samples',
      deviceAuthMiddleware,
      createWritingSamplesHandler({ service: writingService })
    );

    // User Progress endpoint
    app.get('/api/user/progress', authMiddleware, (req, res) => {
      const progress = db.prepare(`
        SELECT p.*, c.name as topic_name, c.category, c.level
        FROM user_topic_progress p
        JOIN curriculum_topics c ON p.curriculum_topic_id = c.id
        WHERE p.user_id = ?
      `).all(req.user.id);
      res.json({ progress });
    });

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Provision device tokens for User 1: MacBook A and MacBook B
    const tokenARes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Header },
      body: JSON.stringify({ device_name: 'MacBook A (Work)' }),
    });
    assert.equal(tokenARes.status, 201);
    const dataA = await tokenARes.json();
    tokenMacBookA = dataA;

    const tokenBRes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user1Header },
      body: JSON.stringify({ device_name: 'MacBook B (Personal)' }),
    });
    assert.equal(tokenBRes.status, 201);
    const dataB = await tokenBRes.json();
    tokenMacBookB = dataB;

    // Provision device token for User 2: MacBook C
    const tokenCRes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user2Header },
      body: JSON.stringify({ device_name: 'MacBook C (User 2)' }),
    });
    assert.equal(tokenCRes.status, 201);
    const dataC = await tokenCRes.json();
    tokenMacBookC = dataC;
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) {
      try { db.close(); } catch (e) {}
    }
  });

  it('1. E2E setup creates two distinct device tokens under a single user account', async () => {
    assert.ok(tokenMacBookA.token.startsWith('ll_dev_'));
    assert.ok(tokenMacBookB.token.startsWith('ll_dev_'));
    assert.notEqual(tokenMacBookA.token, tokenMacBookB.token);
    assert.notEqual(tokenMacBookA.id, tokenMacBookB.id);

    // Verify database device_tokens table records
    const tokensInDb = db.prepare('SELECT * FROM device_tokens WHERE user_id = ? ORDER BY id ASC').all(userId1);
    assert.equal(tokensInDb.length, 2);
    assert.equal(tokensInDb[0].device_name, 'MacBook A (Work)');
    assert.equal(tokensInDb[1].device_name, 'MacBook B (Personal)');
  });

  it('2. Independent writing samples from MacBook A and MacBook B aggregate topic progress cleanly under one user', async () => {
    // MacBook A submits writing sample 1
    const resA = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookA.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-a-1',
        sourceApp: 'Slack',
        text: 'Yesterday I go to the store.',
      }),
    });
    assert.equal(resA.status, 200);
    const bodyA = await resA.json();
    assert.equal(bodyA.accepted, true);
    assert.equal(bodyA.errors.length, 1);

    // Verify writing sample recorded for MacBook A
    const sampleA = db.prepare('SELECT * FROM writing_samples WHERE event_id = ?').get('evt-macbook-a-1');
    assert.ok(sampleA);
    assert.equal(sampleA.user_id, userId1);
    assert.equal(sampleA.device_token_id, tokenMacBookA.id);

    // Check progress for User 1 after MacBook A submission
    const progAfterA = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 1').get();
    assert.ok(progAfterA);
    assert.equal(progAfterA.error_count, 1);

    // MacBook B submits writing sample 1
    const resB = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookB.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-b-1',
        sourceApp: 'Telegram',
        text: 'She write a letter yesterday.',
      }),
    });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    assert.equal(bodyB.accepted, true);

    // Verify writing sample recorded for MacBook B
    const sampleB = db.prepare('SELECT * FROM writing_samples WHERE event_id = ?').get('evt-macbook-b-1');
    assert.ok(sampleB);
    assert.equal(sampleB.user_id, userId1);
    assert.equal(sampleB.device_token_id, tokenMacBookB.id);

    // Check aggregated progress for User 1 after MacBook B submission
    const progAfterB = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 1').get();
    assert.ok(progAfterB);
    assert.equal(progAfterB.error_count, 2, 'Error counts from MacBook A and MacBook B must aggregate cleanly under single user account');

    // Both samples appear in User 1 recent samples list
    const samplesRes = await fetch(`${baseUrl}/api/writing/samples`, {
      headers: { Cookie: user1Header },
    });
    assert.equal(samplesRes.status, 200);
    const samplesList = await samplesRes.json();
    assert.equal(samplesList.samples.length, 2);
  });

  it('3. Duplicate eventId submissions are deduplicated without double-scoring (exact-once replay)', async () => {
    const fixedSentAt = '2026-08-13T12:00:00.000Z';
    // 3a. Initial submission from MacBook A
    const res1 = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookA.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-dup-test-1',
        sourceApp: 'Slack',
        text: 'Yesterday I go to market.',
        sentAt: fixedSentAt,
      }),
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('X-Idempotent-Replay'), 'false');
    const initialCalls = analyzerCalls;

    const evidenceCount1 = db.prepare('SELECT COUNT(*) AS cnt FROM grammar_evidence WHERE user_id = ?').get(userId1).cnt;
    const progress1 = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = 1').get(userId1);

    // 3b. Duplicate submission with SAME eventId from MacBook A
    const resDupA = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookA.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-dup-test-1',
        sourceApp: 'Slack',
        text: 'Yesterday I go to market.',
        sentAt: fixedSentAt,
      }),
    });
    assert.equal(resDupA.status, 200);
    assert.equal(resDupA.headers.get('X-Idempotent-Replay'), 'true');
    assert.equal(analyzerCalls, initialCalls, 'Analyzer should not be re-invoked on duplicate eventId');

    // 3c. Duplicate submission with SAME eventId from MacBook B (cross-device duplicate eventId)
    const resDupB = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookB.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-dup-test-1',
        sourceApp: 'Slack',
        text: 'Yesterday I go to market.',
        sentAt: fixedSentAt,
      }),
    });
    assert.equal(resDupB.status, 200);
    assert.equal(resDupB.headers.get('X-Idempotent-Replay'), 'true');
    assert.equal(analyzerCalls, initialCalls, 'Analyzer should not be re-invoked on duplicate eventId across devices');

    // Verify DB state: zero additional evidence rows and zero double-scoring
    const evidenceCount2 = db.prepare('SELECT COUNT(*) AS cnt FROM grammar_evidence WHERE user_id = ?').get(userId1).cnt;
    assert.equal(evidenceCount2, evidenceCount1, 'Duplicate submissions must not insert duplicate grammar_evidence');

    const progress2 = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = 1').get(userId1);
    assert.equal(progress2.score, progress1.score, 'Duplicate submissions must not alter user topic progress score');
    assert.equal(progress2.error_count, progress1.error_count, 'Duplicate submissions must not alter error_count');
  });

  it('4. Distinct eventIds with identical text count as legitimate practice', async () => {
    // 4a. MacBook A submits sentence 1 with eventId 1
    const res1 = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookA.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-mac-a-repeat-1',
        sourceApp: 'Slack',
        text: 'Yesterday I go to store.',
      }),
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('X-Idempotent-Replay'), 'false');

    const prog1 = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = 1').get(userId1);
    assert.equal(prog1.error_count, 1);

    // 4b. MacBook A submits identical text with DISTINCT eventId 2
    const res2 = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookA.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-mac-a-repeat-2',
        sourceApp: 'Slack',
        text: 'Yesterday I go to store.',
      }),
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('X-Idempotent-Replay'), 'false');

    const prog2 = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = 1').get(userId1);
    assert.equal(prog2.error_count, 2, 'Distinct eventId with identical text must increment practice error count');

    // 4c. MacBook B submits identical text with DISTINCT eventId 3
    const res3 = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookB.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-mac-b-repeat-1',
        sourceApp: 'Notes',
        text: 'Yesterday I go to store.',
      }),
    });
    assert.equal(res3.status, 200);
    assert.equal(res3.headers.get('X-Idempotent-Replay'), 'false');

    const prog3 = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ? AND curriculum_topic_id = 1').get(userId1);
    assert.equal(prog3.error_count, 3, 'Distinct eventId from MacBook B with identical text must count as legitimate practice');

    // Verify 3 distinct samples in database
    const sampleRows = db.prepare('SELECT id, device_token_id, event_id FROM writing_samples WHERE user_id = ? ORDER BY id ASC').all(userId1);
    assert.equal(sampleRows.length, 3);
    assert.equal(sampleRows[0].device_token_id, tokenMacBookA.id);
    assert.equal(sampleRows[1].device_token_id, tokenMacBookA.id);
    assert.equal(sampleRows[2].device_token_id, tokenMacBookB.id);
  });

  it('5. User 2 device (MacBook C) remains strictly isolated from User 1 multi-device account', async () => {
    // MacBook C (User 2) submits sample
    const resC = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMacBookC.token}`,
      },
      body: JSON.stringify({
        eventId: 'evt-macbook-c-1',
        sourceApp: 'Terminal',
        text: 'Yesterday I go to office.',
      }),
    });
    assert.equal(resC.status, 200);

    const sampleC = db.prepare('SELECT * FROM writing_samples WHERE event_id = ?').get('evt-macbook-c-1');
    assert.ok(sampleC);
    assert.equal(sampleC.user_id, userId2);
    assert.equal(sampleC.device_token_id, tokenMacBookC.id);

    // User 1 recent samples should NOT contain User 2's sample
    const user1Samples = db.prepare('SELECT * FROM writing_samples WHERE user_id = ?').all(userId1);
    const hasUser2Sample = user1Samples.some((s) => s.event_id === 'evt-macbook-c-1');
    assert.equal(hasUser2Sample, false);

    // User 1 progress should be 0 records because no User 1 samples were submitted in this test
    const user1Prog = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ?').all(userId1);
    assert.equal(user1Prog.length, 0);

    // User 2 progress should have 1 record
    const user2Prog = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ?').all(userId2);
    assert.equal(user2Prog.length, 1);
  });
});
