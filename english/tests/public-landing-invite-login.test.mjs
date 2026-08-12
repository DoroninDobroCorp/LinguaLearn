import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';

async function createTestServer(db) {
  const authService = createAuthService(db);
  const authMiddleware = createAuthMiddleware(db);

  const app = express();
  app.use(express.json());

  app.post('/api/auth/signup', (req, res) => authService.signup(req, res));
  app.post('/api/auth/login', (req, res) => authService.login(req, res));
  app.get('/api/auth/me', (req, res) => authService.me(req, res));

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

  return { server, baseUrl };
}

test('VAL-UI-001 Backend Auth Gate Check: Unauthenticated access to /api/auth/me returns 401', async (t) => {
  const db = getDb(':memory:');
  const { server, baseUrl } = await createTestServer(db);
  t.after(async () => {
    if (server) await new Promise((res) => server.close(res));
    db.close();
  });

  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(res.status, 401, 'Unauthenticated /api/auth/me should return 401 Unauthorized');
});

test('VAL-UI-001 Signup and Login Flow via API', async (t) => {
  const db = getDb(':memory:');
  const { server, baseUrl } = await createTestServer(db);
  t.after(async () => {
    if (server) await new Promise((res) => server.close(res));
    db.close();
  });

  const inviteCode = 'TEST-INVITE-' + Date.now();
  db.prepare('INSERT INTO beta_invites (code) VALUES (?)').run(inviteCode);

  const email = `user-${Date.now()}@example.com`;
  const password = 'password123';

  // 1. Signup with valid invite code
  const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, invite_code: inviteCode })
  });
  assert.equal(signupRes.status, 201, 'Signup with valid invite code should return 201');
  const signupData = await signupRes.json();
  assert.ok(signupData.user, 'Signup response should contain user');
  assert.equal(signupData.user.email, email);

  // Extract set-cookie
  const cookieHeader = signupRes.headers.get('set-cookie');
  assert.ok(cookieHeader && cookieHeader.includes('lingua_session'), 'Signup should set lingua_session cookie');

  // 2. Login with credentials
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(loginRes.status, 200, 'Login should return 200');
  const loginData = await loginRes.json();
  assert.equal(loginData.user.email, email);
});
