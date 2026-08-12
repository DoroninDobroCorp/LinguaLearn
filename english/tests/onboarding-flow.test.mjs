import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';
import { getDb } from '../server/db.js';

test('Onboarding Flow Backend & State Persistence Integration Tests', async (t) => {
  const db = getDb(':memory:');

  // Seed invite code
  db.prepare(`
    INSERT INTO beta_invites (code, created_at)
    VALUES ('INVITE-ONBOARDING-1', CURRENT_TIMESTAMP), ('INVITE-ONBOARDING-2', CURRENT_TIMESTAMP)
  `).run();

  const authService = createAuthService(db);
  const authMiddleware = createAuthMiddleware(db);
  const deviceTokenService = createDeviceTokenService(db);

  const app = express();
  app.use(express.json());

  app.post('/api/auth/signup', (req, res) => authService.signup(req, res));
  app.post('/api/auth/login', (req, res) => authService.login(req, res));
  app.get('/api/auth/me', (req, res) => authService.me(req, res));

  app.use('/api/user/*', authMiddleware);
  app.use('/api/devices/*', authMiddleware);

  app.get('/api/user/settings', (req, res) => {
    const userId = req.userId;
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    res.json(settings);
  });

  app.post('/api/user/settings', (req, res) => {
    const userId = req.userId;
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);

    const {
      onboardingCompleted, onboarding_completed,
      onboardingStep, onboarding_step,
      cefrLevel, cefr_level,
      maxLevel, max_level,
      rawTextRetentionDays, raw_text_retention_days,
      allowedApps, allowed_apps,
      deniedApps, denied_apps,
    } = req.body || {};

    const compVal = onboarding_completed !== undefined ? onboarding_completed : onboardingCompleted;
    const stepVal = onboarding_step !== undefined ? onboarding_step : onboardingStep;
    const cefrVal = cefr_level !== undefined ? cefr_level : cefrLevel;
    const levelVal = max_level !== undefined ? max_level : maxLevel;
    const retVal = raw_text_retention_days !== undefined ? raw_text_retention_days : rawTextRetentionDays;
    const allowVal = allowed_apps !== undefined ? allowed_apps : allowedApps;
    const denyVal = denied_apps !== undefined ? denied_apps : deniedApps;

    const updates = [];
    const params = [];

    if (compVal !== undefined) {
      updates.push('onboarding_completed = ?');
      params.push(compVal ? 1 : 0);
    }
    if (stepVal !== undefined) {
      updates.push('onboarding_step = ?');
      params.push(Number(stepVal));
    }
    if (levelVal !== undefined || cefrVal !== undefined) {
      updates.push('max_level = ?');
      params.push(String(levelVal || cefrVal));
    }
    if (cefrVal !== undefined) {
      db.prepare('UPDATE users SET cefr_level = ? WHERE id = ?').run(String(cefrVal), userId);
    }
    if (retVal !== undefined) {
      updates.push('raw_text_retention_days = ?');
      params.push(Number(retVal));
    }
    if (allowVal !== undefined) {
      updates.push('allowed_apps = ?');
      params.push(Array.isArray(allowVal) ? allowVal.join(',') : String(allowVal));
    }
    if (denyVal !== undefined) {
      updates.push('denied_apps = ?');
      params.push(Array.isArray(denyVal) ? denyVal.join(',') : String(denyVal));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    }

    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    res.json(settings);
  });

  app.post('/api/devices/tokens', (req, res) => {
    try {
      const { device_name, deviceName, app_version, appVersion } = req.body || {};
      const result = deviceTokenService.createToken({
        userId: req.userId,
        deviceName: device_name || deviceName,
        appVersion: app_version || appVersion,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  await t.test('1. user_settings table schema includes onboarding columns', () => {
    const cols = db.prepare("PRAGMA table_info(user_settings)").all().map(c => c.name);
    assert.ok(cols.includes('onboarding_completed'), 'user_settings table must include onboarding_completed');
    assert.ok(cols.includes('onboarding_step'), 'user_settings table must include onboarding_step');
  });

  let userCookie = '';
  let userId = null;

  await t.test('2. New signup initializes onboarding_completed = 0 and onboarding_step = 1', async () => {
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'onboarding.user1@example.com',
        password: 'Password123!',
        invite_code: 'INVITE-ONBOARDING-1',
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupData = await signupRes.json();
    userId = signupData.user.id;
    assert.equal(signupData.user.onboarding_completed, 0);
    assert.equal(signupData.user.onboarding_step, 1);

    const setCookie = signupRes.headers.get('set-cookie');
    assert.ok(setCookie);
    userCookie = setCookie.split(';')[0];

    // Check GET /api/auth/me returns onboarding fields
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.onboarding_completed, 0);
    assert.equal(meData.user.onboarding_step, 1);
  });

  await t.test('3. Step 1: Updating level selection updates CEFR level and advances onboarding_step to 2', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        cefr_level: 'B2',
        max_level: 'B2',
        onboarding_step: 2,
      }),
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.onboarding_step, 2);
    assert.equal(settings.max_level, 'B2');

    const userRow = db.prepare('SELECT cefr_level FROM users WHERE id = ?').get(userId);
    assert.equal(userRow.cefr_level, 'B2');
  });

  await t.test('4. Step 2: Updating privacy explanation advances step to 3', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        raw_text_retention_days: 7,
        onboarding_step: 3,
      }),
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.onboarding_step, 3);
    assert.equal(settings.raw_text_retention_days, 7);
  });

  await t.test('5. Step 3: Updating app selection advances step to 4', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        allowed_apps: 'Telegram,Slack,Chrome',
        onboarding_step: 4,
      }),
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.onboarding_step, 4);
    assert.equal(settings.allowed_apps, 'Telegram,Slack,Chrome');
  });

  await t.test('6. Step 4: Creating device token and advancing step to 5', async () => {
    const devRes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ device_name: 'Work MacBook' }),
    });
    assert.equal(devRes.status, 201);
    const devData = await devRes.json();
    assert.ok(devData.token);

    const stepRes = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({ onboarding_step: 5 }),
    });
    assert.equal(stepRes.status, 200);
    const settings = await stepRes.json();
    assert.equal(settings.onboarding_step, 5);
  });

  await t.test('7. Step 5 & Finish: Completing onboarding updates onboarding_completed = 1', async () => {
    const res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userCookie },
      body: JSON.stringify({
        onboarding_completed: 1,
        onboarding_step: 6,
      }),
    });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.onboarding_completed, 1);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.onboarding_completed, 1);
  });

  await t.test('8. Multi-user isolation: User B signup has independent onboarding state', async () => {
    const signup2Res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'onboarding.user2@example.com',
        password: 'Password123!',
        invite_code: 'INVITE-ONBOARDING-2',
      }),
    });
    assert.equal(signup2Res.status, 201);
    const user2Data = await signup2Res.json();
    assert.equal(user2Data.user.onboarding_completed, 0);
    assert.equal(user2Data.user.onboarding_step, 1);

    // Confirm User A is still onboarding_completed = 1
    const meRes1 = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: userCookie },
    });
    const meData1 = await meRes1.json();
    assert.equal(meData1.user.onboarding_completed, 1);
  });

  server.close();
});
