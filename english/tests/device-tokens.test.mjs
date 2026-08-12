import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';
import { createWritingAnalysisService, createWritingAnalyzeHandler } from '../server/writingAnalysis.js';
import { getOwnerId } from '../server/dbMigration.js';

describe('Device Tokens & Legacy Fallback Integration Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let authService;
  let deviceTokenService;
  let writingService;
  let ownerId;
  let userId1;
  let userId2;
  const legacyCaptureToken = 'test-legacy-capture-token-secret-123';

  beforeEach(async () => {
    process.env.CAPTURE_API_TOKEN = legacyCaptureToken;
    db = getDb(':memory:');

    // Create owner user (ID 1)
    const ownerRes = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('owner@example.com', 'hash', 'owner', 'active')
    `).run();
    ownerId = ownerRes.lastInsertRowid;

    // Create user 1
    const u1Res = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('user1@example.com', 'hash', 'user', 'active')
    `).run();
    userId1 = u1Res.lastInsertRowid;

    // Create user 2
    const u2Res = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('user2@example.com', 'hash', 'user', 'active')
    `).run();
    userId2 = u2Res.lastInsertRowid;

    authService = createAuthService(db);
    deviceTokenService = createDeviceTokenService(db);

    const mockAnalyzer = async ({ text }) => ({
      isEnglish: true,
      correctedText: text,
      summaryRu: 'Отлично',
      errors: [],
      topicEvidence: [],
    });

    writingService = createWritingAnalysisService({
      db,
      analyzer: mockAnalyzer,
    });

    app = express();
    app.use(express.json());

    // Device token endpoints (protected by session auth)
    const authMiddleware = createAuthMiddleware(db);
    const deviceAuthMiddleware = createDeviceAuthMiddleware(db);

    app.post('/api/devices/tokens', authMiddleware, (req, res) => {
      deviceTokenService.handleCreateToken(req, res);
    });

    app.get('/api/devices/tokens', authMiddleware, (req, res) => {
      deviceTokenService.handleListTokens(req, res);
    });

    app.post('/api/devices/tokens/:id/revoke', authMiddleware, (req, res) => {
      deviceTokenService.handleRevokeToken(req, res);
    });

    // Protected writing analysis endpoint (accepts Bearer device token / legacy token / session)
    app.post(
      '/api/writing/analyze',
      deviceAuthMiddleware,
      createWritingAnalyzeHandler({ service: writingService })
    );

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
  });

  it('VAL-DEVC-001: POST /api/devices/tokens returns plain text token string ONCE and stores SHA-256 token_hash in DB', async () => {
    const { sessionId } = authService.createSession(userId1);

    const res = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lingua_session=${sessionId}`,
      },
      body: JSON.stringify({ device_name: 'Work MacBook', app_version: '1.2.0' }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token, 'Token string should be present');
    assert.ok(body.token.startsWith('ll_dev_'), 'Token should start with ll_dev_');

    const expectedHash = crypto.createHash('sha256').update(body.token).digest('hex');

    const dbToken = db.prepare('SELECT * FROM device_tokens WHERE id = ?').get(body.id);
    assert.ok(dbToken);
    assert.equal(dbToken.user_id, userId1);
    assert.equal(dbToken.token_hash, expectedHash);
    assert.equal(dbToken.device_name, 'Work MacBook');

    // Assert plain text token is NOT in DB
    const rawTokensInDb = db.prepare('SELECT * FROM device_tokens WHERE token_hash LIKE ?').all(`%${body.token}%`);
    assert.equal(rawTokensInDb.length, 0);
  });

  it('VAL-DEVC-002: POST /api/writing/analyze accepts Authorization: Bearer ll_dev_... token and scopes sample to device user_id', async () => {
    const created = deviceTokenService.createToken({
      userId: userId1,
      deviceName: 'Test Mac',
    });

    const eventId = `event-devc-002-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.token}`,
      },
      body: JSON.stringify({
        eventId,
        sourceApp: 'Slack',
        text: 'This is a test sentence for writing analysis.',
      }),
    });

    assert.equal(res.status, 200);

    const sample = db.prepare('SELECT * FROM writing_samples WHERE event_id = ?').get(eventId);
    assert.ok(sample);
    assert.equal(sample.user_id, userId1);
    assert.equal(sample.device_token_id, created.id);

    // Verify last_used_at was updated on device token
    const tokenDb = db.prepare('SELECT last_used_at FROM device_tokens WHERE id = ?').get(created.id);
    assert.ok(tokenDb.last_used_at);
  });

  it('VAL-DEVC-003: POST /api/devices/tokens/:id/revoke updates revoked_at timestamp on device token', async () => {
    const { sessionId } = authService.createSession(userId1);
    const created = deviceTokenService.createToken({
      userId: userId1,
      deviceName: 'Old MacBook',
    });

    const res = await fetch(`${baseUrl}/api/devices/tokens/${created.id}/revoke`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${sessionId}`,
      },
    });

    assert.equal(res.status, 200);

    const tokenDb = db.prepare('SELECT revoked_at FROM device_tokens WHERE id = ?').get(created.id);
    assert.ok(tokenDb.revoked_at !== null, 'revoked_at should be updated');
  });

  it('VAL-DEVC-004: Revoked device tokens return 401 Unauthorized', async () => {
    const created = deviceTokenService.createToken({
      userId: userId1,
      deviceName: 'Revoked Phone',
    });
    deviceTokenService.revokeToken({ userId: userId1, tokenId: created.id });

    const res = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${created.token}`,
      },
      body: JSON.stringify({
        eventId: 'event-revoked-004',
        sourceApp: 'Telegram',
        text: 'Hello world sentence for revoked test.',
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Device token revoked');
  });

  it('VAL-DEVC-005: Legacy CAPTURE_API_TOKEN falls back to owner account', async () => {
    const eventId = `event-legacy-005-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${legacyCaptureToken}`,
      },
      body: JSON.stringify({
        eventId,
        sourceApp: 'Xcode',
        text: 'Testing legacy token authorization.',
      }),
    });

    assert.equal(res.status, 200);

    const sample = db.prepare('SELECT * FROM writing_samples WHERE event_id = ?').get(eventId);
    assert.ok(sample);
    assert.equal(sample.user_id, ownerId);
  });

  it('Multi-user isolation: User A cannot revoke User B device token', async () => {
    const { sessionId: session1 } = authService.createSession(userId1);
    const token2 = deviceTokenService.createToken({
      userId: userId2,
      deviceName: 'User 2 Mac',
    });

    const res = await fetch(`${baseUrl}/api/devices/tokens/${token2.id}/revoke`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${session1}`,
      },
    });

    assert.equal(res.status, 404);

    const tokenDb = db.prepare('SELECT revoked_at FROM device_tokens WHERE id = ?').get(token2.id);
    assert.equal(tokenDb.revoked_at, null);
  });
});
