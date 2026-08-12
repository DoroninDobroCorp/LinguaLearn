import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware, LoginRateLimiter } from '../server/auth.js';

function parseSetCookie(response) {
  const headers = response.headers['set-cookie'] || [];
  const cookies = {};
  headers.forEach(h => {
    const parts = h.split(';')[0].split('=');
    cookies[parts[0].trim()] = parts[1] ? decodeURIComponent(parts[1].trim()) : '';
  });
  return { headers, cookies };
}

describe('Authentication & User Sessions Integration Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let authService;

  beforeEach(async () => {
    db = getDb(':memory:');
    authService = createAuthService(db, {
      rateLimiter: new LoginRateLimiter({ maxAttempts: 10, windowMs: 15 * 60 * 1000 })
    });

    app = express();
    app.use(express.json());

    app.post('/api/auth/signup', (req, res) => authService.signup(req, res));
    app.post('/api/auth/login', (req, res) => authService.login(req, res));
    app.get('/api/auth/me', (req, res) => authService.me(req, res));
    app.post('/api/auth/logout', (req, res) => authService.logout(req, res));

    const protectedMiddleware = createAuthMiddleware(db);
    app.get('/api/protected', protectedMiddleware, (req, res) => {
      res.json({ message: 'secret data', user: req.user });
    });

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) {
      try { db.close(); } catch (e) {}
    }
  });

  it('VAL-AUTH-001: signup with valid invite code succeeds and sets session cookie', async () => {
    // Insert unused invite code
    db.prepare("INSERT INTO beta_invites (code) VALUES ('VALID-CODE-123')").run();

    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'newuser@example.com',
        password: 'Password123!',
        invite_code: 'VALID-CODE-123'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.user);
    assert.equal(body.user.email, 'newuser@example.com');
    assert.equal(body.user.role, 'user');

    // Check Set-Cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /lingua_session=/);
    assert.match(setCookie, /HttpOnly/i);

    // Check DB user & invite update
    const userInDb = db.prepare("SELECT * FROM users WHERE email = 'newuser@example.com'").get();
    assert.ok(userInDb);
    assert.equal(userInDb.role, 'user');
    assert.ok(bcrypt.compareSync('Password123!', userInDb.password_hash));

    const inviteInDb = db.prepare("SELECT * FROM beta_invites WHERE code = 'VALID-CODE-123'").get();
    assert.equal(inviteInDb.used_by, userInDb.id);
    assert.ok(inviteInDb.used_at);
  });

  it('VAL-AUTH-002: signup rejection on invalid or missing invite code', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalidcode@example.com',
        password: 'Password123!',
        invite_code: 'NONEXISTENT-CODE'
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid invite code');

    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    assert.equal(userCount, 0);
  });

  it('VAL-AUTH-003: signup rejection on already used invite code', async () => {
    // Create existing user and used invite code
    const existingPass = bcrypt.hashSync('Password123!', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('used@example.com', ?, 'user')").run(existingPass);
    db.prepare("INSERT INTO beta_invites (code, used_by, used_at) VALUES ('USED-CODE-999', ?, CURRENT_TIMESTAMP)").run(u.lastInsertRowid);

    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'anotheruser@example.com',
        password: 'Password123!',
        invite_code: 'USED-CODE-999'
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invite code already used');
  });

  it('VAL-AUTH-004: signup rejection on duplicate email', async () => {
    db.prepare("INSERT INTO beta_invites (code) VALUES ('INVITE-A')").run();
    db.prepare("INSERT INTO beta_invites (code) VALUES ('INVITE-B')").run();

    const passHash = bcrypt.hashSync('Password123!', 10);
    db.prepare("INSERT INTO users (email, password_hash) VALUES ('duplicate@example.com', ?)").run(passHash);

    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'DUPLICATE@example.com',
        password: 'Password123!',
        invite_code: 'INVITE-B'
      })
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'Email already registered');
  });

  it('VAL-AUTH-005: valid user login and session cookie creation', async () => {
    const passHash = bcrypt.hashSync('MySecurePassword123', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash, role, cefr_level) VALUES ('login@example.com', ?, 'user', 'B2')").run(passHash);

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'login@example.com',
        password: 'MySecurePassword123'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.id, u.lastInsertRowid);
    assert.equal(body.user.email, 'login@example.com');
    assert.equal(body.user.cefr_level, 'B2');

    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /lingua_session=/);
    assert.match(setCookie, /HttpOnly/i);

    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ?").all(u.lastInsertRowid);
    assert.equal(sessions.length, 1);
  });

  it('VAL-AUTH-006: rejection of invalid login credentials', async () => {
    const passHash = bcrypt.hashSync('MySecurePassword123', 10);
    db.prepare("INSERT INTO users (email, password_hash) VALUES ('user@example.com', ?)").run(passHash);

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'WrongPassword'
      })
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid credentials');
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('VAL-AUTH-007: user profile resolution via GET /api/auth/me', async () => {
    const passHash = bcrypt.hashSync('Password123!', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash, role, cefr_level) VALUES ('me@example.com', ?, 'user', 'C1')").run(passHash);
    const sessionId = 'session-me-123';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(sessionId, u.lastInsertRowid);

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `lingua_session=${sessionId}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.id, u.lastInsertRowid);
    assert.equal(body.user.email, 'me@example.com');
    assert.equal(body.user.cefr_level, 'C1');
  });

  it('VAL-AUTH-008: explicit logout clears cookie and purges session record', async () => {
    const passHash = bcrypt.hashSync('Password123!', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash) VALUES ('logout@example.com', ?)").run(passHash);
    const sessionId = 'session-logout-123';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(sessionId, u.lastInsertRowid);

    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `lingua_session=${sessionId}` }
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);

    const sessionInDb = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    assert.equal(sessionInDb, undefined);
  });

  it('VAL-AUTH-009: access rejection for deactivated user account', async () => {
    const passHash = bcrypt.hashSync('Password123!', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash, status) VALUES ('deactive@example.com', ?, 'deactivated')").run(passHash);
    const sessionId = 'session-deactive-123';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").run(sessionId, u.lastInsertRowid);

    // Test Login rejection
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'deactive@example.com',
        password: 'Password123!'
      })
    });
    assert.equal(loginRes.status, 403);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.error, 'Account deactivated');

    // Test GET /api/auth/me rejection
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `lingua_session=${sessionId}` }
    });
    assert.equal(meRes.status, 403);
    const meBody = await meRes.json();
    assert.equal(meBody.error, 'Account deactivated');
  });

  it('VAL-AUTH-014: expired session token rejection and database cleanup', async () => {
    const passHash = bcrypt.hashSync('Password123!', 10);
    const u = db.prepare("INSERT INTO users (email, password_hash) VALUES ('expired@example.com', ?)").run(passHash);
    const sessionId = 'session-expired-999';
    // Expired 1 hour ago
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '-1 hour'))").run(sessionId, u.lastInsertRowid);

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `lingua_session=${sessionId}` }
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Session expired');

    // Verify session row was deleted
    const sessionInDb = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    assert.equal(sessionInDb, undefined);
  });

  it('VAL-AUTH-015: login rate limiting protection (429 after 10 failed attempts)', async () => {
    const passHash = bcrypt.hashSync('Password123!', 10);
    db.prepare("INSERT INTO users (email, password_hash) VALUES ('ratelimit@example.com', ?)").run(passHash);

    // Make 10 failed login attempts
    for (let i = 0; i < 10; i++) {
      const failRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ratelimit@example.com',
          password: 'WrongPassword!'
        })
      });
      assert.equal(failRes.status, 401);
    }

    // 11th attempt should trigger 429
    const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ratelimit@example.com',
        password: 'Password123!'
      })
    });

    assert.equal(blockedRes.status, 429);
    assert.ok(blockedRes.headers.get('retry-after'));
    const body = await blockedRes.json();
    assert.match(body.error, /too many login attempts/i);
  });

  it('VAL-AUTH-016: registration payload validation (short password, bad email)', async () => {
    db.prepare("INSERT INTO beta_invites (code) VALUES ('INVITE-VAL')").run();

    // Short password
    const resShortPass = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'valid@example.com',
        password: 'short',
        invite_code: 'INVITE-VAL'
      })
    });
    assert.equal(resShortPass.status, 400);

    // Invalid email format
    const resBadEmail = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email-format',
        password: 'Password123!',
        invite_code: 'INVITE-VAL'
      })
    });
    assert.equal(resBadEmail.status, 400);

    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    assert.equal(userCount, 0);
  });
});
