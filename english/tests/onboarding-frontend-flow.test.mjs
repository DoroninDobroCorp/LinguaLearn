import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';
import { getDb } from '../server/db.js';

test('Onboarding Flow Frontend & Guardrails Verification', async (t) => {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT INTO beta_invites (code, created_at)
    VALUES ('INVITE-UI-002', CURRENT_TIMESTAMP), ('INVITE-UI-005', CURRENT_TIMESTAMP)
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

  await t.test('VAL-UI-002: Complete multi-step onboarding wizard sequence', async () => {
    // 1. Signup
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'val.ui.002@example.com',
        password: 'Password123!',
        invite_code: 'INVITE-UI-002',
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupData = await signupRes.json();
    const cookie = signupRes.headers.get('set-cookie').split(';')[0];
    assert.equal(signupData.user.onboarding_completed, 0);

    // 2. Step 1: Level selection
    const s1Res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ cefr_level: 'B2', max_level: 'B2', onboarding_step: 2 }),
    });
    assert.equal(s1Res.status, 200);

    // 3. Step 2: Privacy explanation
    const s2Res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ raw_text_retention_days: 7, onboarding_step: 3 }),
    });
    assert.equal(s2Res.status, 200);

    // 4. Step 3: App selection
    const s3Res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ allowed_apps: 'ALL', onboarding_step: 4 }),
    });
    assert.equal(s3Res.status, 200);

    // 5. Step 4: Device token creation
    const tokenRes = await fetch(`${baseUrl}/api/devices/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ device_name: 'Work MacBook Pro' }),
    });
    assert.equal(tokenRes.status, 201);
    const tokenData = await tokenRes.json();
    assert.ok(tokenData.token.startsWith('ll_dev_'));

    const s4Res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ onboarding_step: 5 }),
    });
    assert.equal(s4Res.status, 200);

    // 6. Step 5: Test sentence & Complete
    const s5Res = await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ onboarding_completed: 1, onboarding_step: 6 }),
    });
    assert.equal(s5Res.status, 200);

    // Verify GET /api/auth/me reflects completed onboarding
    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    const meData = await meRes.json();
    assert.equal(meData.user.onboarding_completed, 1);
  });

  await t.test('VAL-UI-005: Onboarding state persistence across simulated page reloads', async () => {
    // Signup
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'val.ui.005@example.com',
        password: 'Password123!',
        invite_code: 'INVITE-UI-005',
      }),
    });
    assert.equal(signupRes.status, 201);
    const cookie = signupRes.headers.get('set-cookie').split(';')[0];

    // Advance to Step 3
    await fetch(`${baseUrl}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ onboarding_step: 3 }),
    });

    // Simulate page refresh: call GET /api/auth/me & GET /api/user/settings
    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    const meData = await meRes.json();
    assert.equal(meData.user.onboarding_completed, 0);
    assert.equal(meData.user.onboarding_step, 3);

    const setRes = await fetch(`${baseUrl}/api/user/settings`, { headers: { Cookie: cookie } });
    const setData = await setRes.json();
    assert.equal(setData.onboarding_step, 3);
  });

  server.close();
});
