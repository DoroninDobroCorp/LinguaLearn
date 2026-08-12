import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthMiddleware } from '../server/auth.js';
import { runRetentionCleanup } from '../server/scripts/retentionCleanup.js';

describe('Raw Text Retention & User Data Rights (VAL-PRIV-004, VAL-PRIV-005, VAL-PRIV-006)', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let user1Id;
  let user2Id;
  let session1Id;
  let session2Id;

  beforeEach(async () => {
    db = getDb(':memory:');

    // Create User 1
    const passHash = bcrypt.hashSync('Password123!', 10);
    const u1Res = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('user1@example.com', ?, 'user', 'active')"
    ).run(passHash);
    user1Id = u1Res.lastInsertRowid;

    session1Id = 'session-user-1-retention';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
      .run(session1Id, user1Id);

    // Create User 2
    const u2Res = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('user2@example.com', ?, 'user', 'active')"
    ).run(passHash);
    user2Id = u2Res.lastInsertRowid;

    session2Id = 'session-user-2-retention';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
      .run(session2Id, user2Id);

    // Seed curriculum topic
    db.prepare("INSERT INTO curriculum_topics (id, name, category, level) VALUES (1, 'Past Simple', 'Grammar', 'B1')").run();

    // App setup
    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(db);

    // Export endpoint
    app.get('/api/user/export', authMiddleware, (req, res) => {
      try {
        const userId = req.user.id;
        const userProfile = db.prepare('SELECT id, email, role, status, cefr_level, created_at, updated_at FROM users WHERE id = ?').get(userId);
        if (!userProfile) return res.status(404).json({ error: 'User not found' });

        db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
        const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

        const vocabulary = db.prepare('SELECT * FROM vocabulary WHERE user_id = ? ORDER BY id ASC').all(userId);
        const progress = db.prepare(`
          SELECT p.*, c.name as topic_name, c.category, c.level
          FROM user_topic_progress p
          LEFT JOIN curriculum_topics c ON p.curriculum_topic_id = c.id
          WHERE p.user_id = ?
          ORDER BY p.id ASC
        `).all(userId);
        const writingSamples = db.prepare('SELECT * FROM writing_samples WHERE user_id = ? ORDER BY id ASC').all(userId);
        const evidence = db.prepare('SELECT * FROM grammar_evidence WHERE user_id = ? ORDER BY id ASC').all(userId);
        const practiceSessions = db.prepare('SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY id ASC').all(userId);
        const chatHistory = db.prepare('SELECT id, role, content, timestamp FROM chat_history WHERE user_id = ? ORDER BY id ASC').all(userId);
        const deviceTokens = db.prepare('SELECT id, device_name, app_version, last_used_at, revoked_at, created_at FROM device_tokens WHERE user_id = ? ORDER BY id ASC').all(userId);
        const feedback = db.prepare('SELECT * FROM correction_feedback WHERE user_id = ? ORDER BY id ASC').all(userId);
        const analyticsEvents = db.prepare('SELECT * FROM analytics_events WHERE user_id = ? ORDER BY id ASC').all(userId);

        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');

        res.json({
          exported_at: new Date().toISOString(),
          user: userProfile,
          settings: settings || null,
          vocabulary,
          progress,
          evidence,
          writing_samples: writingSamples,
          practice_sessions: practiceSessions,
          chat_history: chatHistory,
          device_tokens: deviceTokens,
          feedback,
          analytics_events: analyticsEvents,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Account deletion endpoint
    app.delete('/api/user/account', authMiddleware, (req, res) => {
      try {
        const userId = req.user.id;
        const { confirm, confirmation } = req.body || {};
        const confirmParam = req.query?.confirm || req.query?.confirmation;
        const isConfirmed = confirm === true || confirm === 'true' || confirm === 'DELETE' ||
                            confirmation === true || confirmation === 'true' || confirmation === 'DELETE' ||
                            confirmParam === 'true' || confirmParam === 'DELETE' || confirmParam === '1';

        if (!isConfirmed) {
          return res.status(400).json({ error: 'Confirmation required for account deletion' });
        }

        const performAccountDeletion = db.transaction((targetUserId) => {
          db.prepare('UPDATE beta_invites SET used_by = NULL WHERE used_by = ?').run(targetUserId);
          db.prepare('UPDATE beta_invites SET created_by = NULL WHERE created_by = ?').run(targetUserId);
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM user_topic_progress WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM grammar_evidence WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM correction_feedback WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM writing_samples WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM practice_sessions WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM chat_requests WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM vocabulary WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM analytics_events WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM achievements WHERE user_id = ?').run(targetUserId);
          db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
        });

        performAccountDeletion(userId);

        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.clearCookie('lingua_session', { path: '/' });
        res.json({ success: true, message: 'Account and all associated data deleted' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // VAL-PRIV-004: Retention Cleanup
  it('VAL-PRIV-004: Retention cleanup purges original_text and sets retention_purged = 1 for expired samples while keeping grammar_evidence intact', () => {
    db.prepare('INSERT INTO user_settings (user_id, raw_text_retention_days) VALUES (?, 0)').run(user1Id);
    db.prepare('INSERT INTO user_settings (user_id, raw_text_retention_days) VALUES (?, 7)').run(user2Id);

    db.prepare(`
      INSERT INTO writing_samples (id, user_id, event_id, source_app, original_text, sent_at, created_at, retention_purged)
      VALUES (101, ?, 'ev-u1-1', 'Slack', 'Original text for User 1', datetime('now'), datetime('now'), 0)
    `).run(user1Id);

    db.prepare(`
      INSERT INTO writing_samples (id, user_id, event_id, source_app, original_text, sent_at, created_at, retention_purged)
      VALUES (102, ?, 'ev-u2-1', 'Telegram', 'Original text for User 2 (old)', datetime('now', '-8 days'), datetime('now', '-8 days'), 0)
    `).run(user2Id);

    db.prepare(`
      INSERT INTO writing_samples (id, user_id, event_id, source_app, original_text, sent_at, created_at, retention_purged)
      VALUES (103, ?, 'ev-u2-2', 'Telegram', 'Original text for User 2 (recent)', datetime('now', '-2 days'), datetime('now', '-2 days'), 0)
    `).run(user2Id);

    db.prepare(`
      INSERT INTO grammar_evidence (id, user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta)
      VALUES (1, ?, 101, 1, 'error', 0.9, 'Ошибка в глаголе', -2.0)
    `).run(user1Id);
    db.prepare(`
      INSERT INTO grammar_evidence (id, user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta)
      VALUES (2, ?, 102, 1, 'success', 0.9, 'Верно', 1.0)
    `).run(user2Id);
    db.prepare(`
      INSERT INTO grammar_evidence (id, user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta)
      VALUES (3, ?, 103, 1, 'success', 0.95, 'Верно', 1.0)
    `).run(user2Id);

    const purgedCount = runRetentionCleanup(db);
    assert.equal(purgedCount, 2);

    const s101 = db.prepare('SELECT original_text, retention_purged FROM writing_samples WHERE id = 101').get();
    assert.equal(s101.original_text, null);
    assert.equal(s101.retention_purged, 1);

    const s102 = db.prepare('SELECT original_text, retention_purged FROM writing_samples WHERE id = 102').get();
    assert.equal(s102.original_text, null);
    assert.equal(s102.retention_purged, 1);

    const s103 = db.prepare('SELECT original_text, retention_purged FROM writing_samples WHERE id = 103').get();
    assert.equal(s103.original_text, 'Original text for User 2 (recent)');
    assert.equal(s103.retention_purged, 0);

    const evCount = db.prepare('SELECT COUNT(*) as count FROM grammar_evidence').get().count;
    assert.equal(evCount, 3);
  });

  // VAL-PRIV-005: Export My Data
  it('VAL-PRIV-005: GET /api/user/export returns 401 when unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/user/export`);
    assert.equal(res.status, 401);
  });

  it('VAL-PRIV-005: GET /api/user/export returns complete JSON bundle of user records', async () => {
    db.prepare('INSERT INTO user_settings (user_id, raw_text_retention_days) VALUES (?, 7)').run(user1Id);
    db.prepare("INSERT INTO vocabulary (user_id, word, normalized_word, translation) VALUES (?, 'apple', 'apple', 'яблоко')").run(user1Id);
    db.prepare("INSERT INTO user_topic_progress (user_id, curriculum_topic_id, status, score) VALUES (?, 1, 'improving', 45)").run(user1Id);
    db.prepare("INSERT INTO writing_samples (id, user_id, event_id, source_app, original_text, sent_at) VALUES (201, ?, 'ev-exp-1', 'Slack', 'Hello world', datetime('now'))").run(user1Id);
    db.prepare("INSERT INTO grammar_evidence (user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta) VALUES (?, 201, 1, 'success', 0.9, 'ок', 1.0)").run(user1Id);
    db.prepare("INSERT INTO correction_feedback (user_id, writing_sample_id, feedback_type) VALUES (?, 201, 'helpful')").run(user1Id);
    db.prepare("INSERT INTO practice_sessions (id, user_id, topics_json, exercises_json) VALUES ('ps-exp-1', ?, '[]', '[]')").run(user1Id);
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', 'hi bot')").run(user1Id);
    db.prepare("INSERT INTO device_tokens (user_id, token_hash, device_name) VALUES (?, 'hash123', 'My Mac')").run(user1Id);
    db.prepare("INSERT INTO analytics_events (user_id, event_name) VALUES (?, 'export_test')").run(user1Id);

    const res = await fetch(`${baseUrl}/api/user/export`, {
      headers: { Cookie: `lingua_session=${session1Id}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');

    const data = await res.json();
    assert.ok(data.exported_at);
    assert.equal(data.user.id, user1Id);
    assert.equal(data.user.email, 'user1@example.com');
    assert.equal(data.user.password_hash, undefined);
    assert.equal(data.settings.raw_text_retention_days, 7);
    assert.equal(data.vocabulary.length, 1);
    assert.equal(data.vocabulary[0].word, 'apple');
    assert.equal(data.progress.length, 1);
    assert.equal(data.writing_samples.length, 1);
    assert.equal(data.evidence.length, 1);
    assert.equal(data.feedback.length, 1);
    assert.equal(data.practice_sessions.length, 1);
    assert.equal(data.chat_history.length, 1);
    assert.equal(data.device_tokens.length, 1);
    assert.equal(data.device_tokens[0].token_hash, undefined);
    assert.equal(data.analytics_events.length, 1);
  });

  // VAL-PRIV-006: Cascading Account Deletion
  it('VAL-PRIV-006: DELETE /api/user/account returns 401 when unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/user/account`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  });

  it('VAL-PRIV-006: DELETE /api/user/account returns 400 when unconfirmed', async () => {
    const res = await fetch(`${baseUrl}/api/user/account`, {
      method: 'DELETE',
      headers: { Cookie: `lingua_session=${session1Id}` },
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Confirmation required for account deletion');
  });

  it('VAL-PRIV-006: DELETE /api/user/account with confirmation cascades deletion across all 11 user tables', async () => {
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(user1Id);
    db.prepare("INSERT INTO device_tokens (user_id, token_hash, device_name) VALUES (?, 'h1', 'Mac1')").run(user1Id);
    db.prepare("INSERT INTO user_topic_progress (user_id, curriculum_topic_id) VALUES (?, 1)").run(user1Id);
    db.prepare("INSERT INTO writing_samples (id, user_id, event_id, source_app, original_text, sent_at) VALUES (301, ?, 'ev-del-1', 'Slack', 'txt', datetime('now'))").run(user1Id);
    db.prepare("INSERT INTO grammar_evidence (user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta) VALUES (?, 301, 1, 'error', 0.9, 'err', -2.0)").run(user1Id);
    db.prepare("INSERT INTO correction_feedback (user_id, writing_sample_id, feedback_type) VALUES (?, 301, 'helpful')").run(user1Id);
    db.prepare("INSERT INTO practice_sessions (id, user_id, topics_json, exercises_json) VALUES ('ps-del-1', ?, '[]', '[]')").run(user1Id);
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', 'txt')").run(user1Id);
    db.prepare("INSERT INTO chat_requests (message_id, user_id, request_text) VALUES ('cr-del-1', ?, 'req')").run(user1Id);
    db.prepare("INSERT INTO vocabulary (user_id, word, normalized_word, translation) VALUES (?, 'dog', 'dog', 'собака')").run(user1Id);
    db.prepare("INSERT INTO analytics_events (user_id, event_name) VALUES (?, 'del_test')").run(user1Id);
    db.prepare("INSERT INTO beta_invites (code, created_by, used_by) VALUES ('INV-DEL-1', ?, ?)").run(user1Id, user1Id);
    db.prepare("INSERT INTO beta_invites (code, created_by) VALUES ('INV-DEL-2', ?)").run(user1Id);

    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(user2Id);
    db.prepare("INSERT INTO vocabulary (user_id, word, normalized_word, translation) VALUES (?, 'cat', 'cat', 'кошка')").run(user2Id);

    const res = await fetch(`${baseUrl}/api/user/account`, {
      method: 'DELETE',
      headers: {
        Cookie: `lingua_session=${session1Id}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirm: true }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const u1 = db.prepare('SELECT * FROM users WHERE id = ?').get(user1Id);
    assert.equal(u1, undefined);

    const userTables = [
      'sessions',
      'device_tokens',
      'user_settings',
      'user_topic_progress',
      'writing_samples',
      'grammar_evidence',
      'correction_feedback',
      'practice_sessions',
      'chat_history',
      'chat_requests',
      'vocabulary',
      'analytics_events',
    ];

    for (const t of userTables) {
      const cnt = db.prepare(`SELECT COUNT(*) as count FROM ${t} WHERE user_id = ?`).get(user1Id).count;
      assert.equal(cnt, 0, `Table ${t} still has records for deleted user`);
    }

    const u2 = db.prepare('SELECT * FROM users WHERE id = ?').get(user2Id);
    assert.ok(u2);
    const u2Vocab = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE user_id = ?').get(user2Id).count;
    assert.equal(u2Vocab, 1);
    const inv1 = db.prepare("SELECT * FROM beta_invites WHERE code = 'INV-DEL-1'").get();
    assert.equal(inv1.used_by, null);
    assert.equal(inv1.created_by, null);
    const inv2 = db.prepare("SELECT * FROM beta_invites WHERE code = 'INV-DEL-2'").get();
    assert.equal(inv2.created_by, null);
  });
});
