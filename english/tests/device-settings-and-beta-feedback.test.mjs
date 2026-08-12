import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';

describe('Mac Device Settings & Beta Feedback API Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let authService;
  let deviceTokenService;
  let userId;
  let sessionId;

  beforeEach(async () => {
    db = getDb(':memory:');

    // Create user
    const uRes = db.prepare(`
      INSERT INTO users (email, password_hash, role, status)
      VALUES ('betauser@example.com', 'hash', 'user', 'active')
    `).run();
    userId = uRes.lastInsertRowid;

    authService = createAuthService(db);
    deviceTokenService = createDeviceTokenService(db);
    const sessionRes = authService.createSession(userId);
    sessionId = sessionRes.sessionId;

    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(db);

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

    // Feedback endpoint
    app.post('/api/feedback', authMiddleware, (req, res) => {
      try {
        const uId = req.user?.id;
        if (!uId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const { category, message, route, app_version, appVersion } = req.body || {};
        const trimmedMessage = String(message || '').trim();
        if (!trimmedMessage) {
          return res.status(400).json({ error: 'Message is required' });
        }

        const feedbackCategory = String(category || 'ux_feedback').trim();
        const feedbackRoute = String(route || '/feedback').trim();
        const clientAppVersion = String(app_version || appVersion || '1.0.0-beta').trim();

        const properties = {
          category: feedbackCategory,
          message: trimmedMessage,
          route: feedbackRoute,
          app_version: clientAppVersion,
          timestamp: new Date().toISOString(),
        };

        const result = db.prepare(`
          INSERT INTO analytics_events (user_id, event_name, properties_json)
          VALUES (?, 'beta_feedback', ?)
        `).run(uId, JSON.stringify(properties));

        return res.status(201).json({
          success: true,
          message: 'Feedback submitted successfully',
          feedback: {
            id: result.lastInsertRowid,
            category: feedbackCategory,
            message: trimmedMessage,
            route: feedbackRoute,
            app_version: clientAppVersion,
            created_at: new Date().toISOString(),
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    });

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

  it('VAL-UI-004: POST /api/feedback requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Great app!' }),
    });

    assert.equal(res.status, 401);
  });

  it('VAL-UI-004: POST /api/feedback validates non-empty message', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lingua_session=${sessionId}`,
      },
      body: JSON.stringify({ category: 'bug', message: '   ' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Message is required');
  });

  it('VAL-UI-004: POST /api/feedback stores feedback event in analytics_events with client telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lingua_session=${sessionId}`,
      },
      body: JSON.stringify({
        category: 'bug',
        message: 'The correction inbox search button is hard to see on dark mode.',
        route: '/correction-inbox',
        app_version: '1.0.0-beta.2',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.feedback.category, 'bug');
    assert.equal(body.feedback.route, '/correction-inbox');
    assert.equal(body.feedback.app_version, '1.0.0-beta.2');

    // Verify row in analytics_events
    const eventRow = db.prepare('SELECT * FROM analytics_events WHERE user_id = ? AND event_name = ?').get(userId, 'beta_feedback');
    assert.ok(eventRow, 'analytics_events row must exist');
    const props = JSON.parse(eventRow.properties_json);
    assert.equal(props.category, 'bug');
    assert.equal(props.message, 'The correction inbox search button is hard to see on dark mode.');
    assert.equal(props.route, '/correction-inbox');
    assert.equal(props.app_version, '1.0.0-beta.2');
  });

  it('VAL-UI-003: Device token creation, listing, and revocation actions', async () => {
    // List tokens (initially empty)
    const listRes1 = await fetch(`${baseUrl}/api/devices/tokens`, {
      headers: { Cookie: `lingua_session=${sessionId}` },
    });
    assert.equal(listRes1.status, 200);
    const listBody1 = await listRes1.json();
    assert.equal(listBody1.tokens.length, 0);

    // Create device token
    const createRes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `lingua_session=${sessionId}`,
      },
      body: JSON.stringify({ device_name: 'Work M1 MacBook', app_version: '1.0.0' }),
    });

    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.ok(createBody.token.startsWith('ll_dev_'));
    assert.equal(createBody.device_name, 'Work M1 MacBook');
    const tokenId = createBody.id;

    // List tokens after creation
    const listRes2 = await fetch(`${baseUrl}/api/devices/tokens`, {
      headers: { Cookie: `lingua_session=${sessionId}` },
    });
    const listBody2 = await listRes2.json();
    assert.equal(listBody2.tokens.length, 1);
    assert.equal(listBody2.tokens[0].device_name, 'Work M1 MacBook');
    assert.equal(listBody2.tokens[0].revoked_at, null);

    // Revoke token
    const revokeRes = await fetch(`${baseUrl}/api/devices/tokens/${tokenId}/revoke`, {
      method: 'POST',
      headers: { Cookie: `lingua_session=${sessionId}` },
    });

    assert.equal(revokeRes.status, 200);

    // Verify revoked in list
    const listRes3 = await fetch(`${baseUrl}/api/devices/tokens`, {
      headers: { Cookie: `lingua_session=${sessionId}` },
    });
    const listBody3 = await listRes3.json();
    assert.ok(listBody3.tokens[0].revoked_at !== null);
  });
});
