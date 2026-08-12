import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';
import { createWritingAnalysisService, createWritingAnalyzeHandler } from '../server/writingAnalysis.js';

describe('Privacy Settings & Consent Integration Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let userId;
  let sessionId;
  let deviceToken;
  let writingService;

  beforeEach(async () => {
    db = getDb(':memory:');

    // Create a test user
    const passHash = bcrypt.hashSync('TestPassword123!', 10);
    const userRes = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('user@example.com', ?, 'user', 'active')"
    ).run(passHash);
    userId = userRes.lastInsertRowid;

    // Create session for user
    sessionId = 'test-session-privacy-123';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(sessionId, userId);

    // Create device token for user
    const deviceTokenService = createDeviceTokenService(db);
    const devTokenObj = deviceTokenService.createToken({ userId, deviceName: 'Test MacBook' });
    deviceToken = devTokenObj.token;

    // Mock writing analyzer (returns dummy analysis for valid samples)
    const mockAnalyzer = async ({ text }) => ({
      isEnglish: true,
      correctedText: text,
      summaryRu: 'Отлично написанный текст.',
      errors: [],
      topicEvidence: [],
    });

    writingService = createWritingAnalysisService({
      db,
      analyzer: mockAnalyzer,
      analysisTimeoutMs: 5000,
    });

    app = express();
    app.use(express.json());

    const authMiddleware = createAuthMiddleware(db);
    const deviceAuth = createDeviceAuthMiddleware(db);

    const publicApiEndpoints = new Set(['/api/health']);

    app.use('/api', (req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      const pathname = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
      if (publicApiEndpoints.has(pathname)) {
        return next();
      }

      return authMiddleware(req, res, next);
    });

    // Settings endpoints
    app.get('/api/user/settings', (req, res) => {
      try {
        const uId = req.user.id;
        db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(uId);
        const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uId);
        res.json(settings);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/user/settings', (req, res) => {
      try {
        const uId = req.user.id;
        db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(uId);

        const {
          maxLevel, max_level,
          darkMode, dark_mode,
          notificationsEnabled, notifications_enabled,
          externalCaptureEnabled, external_capture_enabled,
          rawTextRetentionDays, raw_text_retention_days,
          allowedApps, allowed_apps,
          deniedApps, denied_apps,
          capturePaused, capture_paused,
        } = req.body;

        const levelVal = max_level !== undefined ? max_level : maxLevel;
        const darkVal = dark_mode !== undefined ? dark_mode : darkMode;
        const notifVal = notifications_enabled !== undefined ? notifications_enabled : notificationsEnabled;
        const extCapVal = external_capture_enabled !== undefined ? external_capture_enabled : externalCaptureEnabled;
        const retVal = raw_text_retention_days !== undefined ? raw_text_retention_days : rawTextRetentionDays;
        const allowVal = allowed_apps !== undefined ? allowed_apps : allowedApps;
        const denyVal = denied_apps !== undefined ? denied_apps : deniedApps;
        const pauseVal = capture_paused !== undefined ? capture_paused : capturePaused;

        const updates = [];
        const params = [];

        if (levelVal !== undefined) {
          updates.push('max_level = ?');
          params.push(String(levelVal));
        }
        if (darkVal !== undefined) {
          updates.push('dark_mode = ?');
          params.push(darkVal ? 1 : 0);
        }
        if (notifVal !== undefined) {
          updates.push('notifications_enabled = ?');
          params.push(notifVal ? 1 : 0);
        }
        if (extCapVal !== undefined) {
          updates.push('external_capture_enabled = ?');
          params.push(extCapVal ? 1 : 0);
        }
        if (retVal !== undefined) {
          updates.push('raw_text_retention_days = ?');
          params.push(Number(retVal));
        }
        if (allowVal !== undefined) {
          const str = Array.isArray(allowVal) ? allowVal.join(',') : String(allowVal);
          updates.push('allowed_apps = ?');
          params.push(str);
        }
        if (denyVal !== undefined) {
          const str = Array.isArray(denyVal) ? denyVal.join(',') : String(denyVal);
          updates.push('denied_apps = ?');
          params.push(str);
        }
        if (pauseVal !== undefined) {
          updates.push('capture_paused = ?');
          params.push(pauseVal ? 1 : 0);
        }

        if (updates.length > 0) {
          updates.push('updated_at = CURRENT_TIMESTAMP');
          params.push(uId);
          db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
        }

        const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uId);
        res.json(settings);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Also support /api/settings as alias for backwards compatibility
    app.get('/api/settings', (req, res) => {
      req.url = '/api/user/settings';
      app._router.handle(req, res);
    });

    // Writing analyze route
    app.post('/api/writing/analyze', deviceAuth, createWritingAnalyzeHandler({ service: writingService }));

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

  it('GET /api/user/settings rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  it('POST /api/user/settings rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_paused: 1 }),
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/user/settings with cookie returns user settings with defaults', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      headers: { Cookie: `lingua_session=${sessionId}` },
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.user_id, userId);
    assert.equal(settings.capture_paused, 0);
    assert.equal(settings.allowed_apps, 'ALL');
    assert.equal(settings.denied_apps, '');
    assert.equal(settings.raw_text_retention_days, 7);
  });

  it('POST /api/user/settings updates privacy and capture settings', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${sessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        denied_apps: 'Telegram, WhatsApp',
        capture_paused: 1,
        raw_text_retention_days: 30,
      }),
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.denied_apps, 'Telegram, WhatsApp');
    assert.equal(settings.capture_paused, 1);
    assert.equal(settings.raw_text_retention_days, 30);
  });

  it('VAL-PRIV-002: Writing samples from denied apps return accepted = 0 and rejection_reason = "App denied"', async () => {
    // 1. Set denied_apps to 'Telegram'
    const setRes = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${sessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ denied_apps: 'Telegram' }),
    });
    assert.equal(setRes.status, 200);

    // 2. Submit writing sample from 'Telegram' via device token
    const analyzeRes = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId: 'event-denied-app-1',
        sourceApp: 'Telegram',
        text: 'This is a sample sentence from Telegram.',
      }),
    });

    assert.equal(analyzeRes.status, 200);
    const result = await analyzeRes.json();
    assert.equal(result.accepted, false);
    assert.equal(result.rejectionReason, 'App denied');

    // 3. Verify record in writing_samples table
    const sample = db.prepare('SELECT * FROM writing_samples WHERE user_id = ? AND event_id = ?')
      .get(userId, 'event-denied-app-1');
    assert.ok(sample);
    assert.equal(sample.accepted, 0);
    assert.equal(sample.rejection_reason, 'App denied');

    // 4. Submit writing sample from non-denied app ('Slack')
    const slackRes = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId: 'event-allowed-app-1',
        sourceApp: 'Slack',
        text: 'This is a sample sentence from Slack.',
      }),
    });

    assert.equal(slackRes.status, 200);
    const slackResult = await slackRes.json();
    assert.equal(slackResult.accepted, true);
    assert.equal(slackResult.rejectionReason, null);
  });

  it('VAL-PRIV-003: Writing samples received when capture_paused = 1 return accepted = 0 and rejection_reason = "Capture paused"', async () => {
    // 1. Set capture_paused = 1
    const setRes = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${sessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ capture_paused: 1 }),
    });
    assert.equal(setRes.status, 200);

    // 2. Submit writing sample via device token
    const analyzeRes = await fetch(`${baseUrl}/api/writing/analyze`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventId: 'event-paused-capture-1',
        sourceApp: 'Slack',
        text: 'This is a sample sentence while capture is paused.',
      }),
    });

    assert.equal(analyzeRes.status, 200);
    const result = await analyzeRes.json();
    assert.equal(result.accepted, false);
    assert.equal(result.rejectionReason, 'Capture paused');

    // 3. Verify record in writing_samples table
    const sample = db.prepare('SELECT * FROM writing_samples WHERE user_id = ? AND event_id = ?')
      .get(userId, 'event-paused-capture-1');
    assert.ok(sample);
    assert.equal(sample.accepted, 0);
    assert.equal(sample.rejection_reason, 'Capture paused');
  });

  it('Settings persist across user sessions', async () => {
    // 1. Update settings in Session A
    await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: {
        Cookie: `lingua_session=${sessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        denied_apps: 'WhatsApp',
        capture_paused: 0,
        raw_text_retention_days: 30,
      }),
    });

    // 2. Create a new session B for the same user
    const sessionB = 'test-session-privacy-456';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(sessionB, userId);

    // 3. Retrieve settings in Session B
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      headers: { Cookie: `lingua_session=${sessionB}` },
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.denied_apps, 'WhatsApp');
    assert.equal(settings.capture_paused, 0);
    assert.equal(settings.raw_text_retention_days, 30);
  });
});
