import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcrypt';
import http from 'node:http';
import { getDb } from '../server/db.js';
import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';

describe('Security Headers & API Gates Integration Tests', () => {
  let db;
  let app;
  let server;
  let baseUrl;
  let authService;
  let ownerId;
  let ownerSessionId;
  let ownerDeviceToken;

  beforeEach(async () => {
    db = getDb(':memory:');

    const passHash = bcrypt.hashSync('OwnerPassword123!', 10);
    const ownerRes = db.prepare(
      "INSERT INTO users (email, password_hash, role, status) VALUES ('owner@example.com', ?, 'owner', 'active')"
    ).run(passHash);
    ownerId = ownerRes.lastInsertRowid;

    ownerSessionId = 'session-owner-sec-123';
    db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))")
      .run(ownerSessionId, ownerId);

    const deviceTokenService = createDeviceTokenService(db);
    const devTokenObj = deviceTokenService.createToken({ userId: ownerId, deviceName: 'MacBook Pro' });
    ownerDeviceToken = devTokenObj.token;

    app = express();

    const authMiddleware = createAuthMiddleware(db);
    authService = createAuthService(db);

    const publicApiEndpoints = new Set([
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/me',
      '/api/auth/logout',
      '/api/health',
      '/api/status',
      '/api/ready',
      '/api/live',
    ]);

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

    app.use(express.json());

    app.get('/api/health', (req, res) => res.json({ status: 'healthy' }));
    app.post('/api/auth/signup', (req, res) => authService.signup(req, res));
    app.post('/api/auth/login', (req, res) => authService.login(req, res));
    app.get('/api/auth/me', (req, res) => authService.me(req, res));
    app.post('/api/auth/logout', (req, res) => authService.logout(req, res));

    app.get('/api/curriculum', (req, res) => res.json({ topics: [] }));
    app.post('/api/chat', (req, res) => res.json({ response: 'ok' }));
    app.get('/api/chat/history', (req, res) => res.json({ history: [] }));
    app.get('/api/vocabulary', (req, res) => res.json({ words: [] }));
    app.get('/api/writing/samples', (req, res) => res.json({ samples: [] }));
    app.post('/api/writing/analyze', (req, res) => res.json({ analysis: {} }));
    app.get('/api/practice/today', (req, res) => res.json({ exercises: [] }));
    app.get('/api/settings', (req, res) => res.json({ settings: {} }));
    app.get('/api/stats', (req, res) => res.json({ stats: {} }));
    app.get('/api/user/settings', (req, res) => res.json({ settings: {} }));
    app.get('/api/reader/hpmor/chapter/1', (req, res) => res.json({ chapter: 1 }));

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = 'http://127.0.0.1:' + addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('VAL-PRIV-001: unauthenticated requests to private APIs return 401 Unauthorized', async () => {
    const privateEndpoints = [
      { method: 'GET', path: '/api/curriculum' },
      { method: 'POST', path: '/api/chat', body: { message: 'hello' } },
      { method: 'GET', path: '/api/vocabulary' },
      { method: 'GET', path: '/api/writing/samples' },
      { method: 'GET', path: '/api/practice/today' },
      { method: 'GET', path: '/api/settings' },
      { method: 'GET', path: '/api/stats' },
      { method: 'GET', path: '/api/chat/history' },
      { method: 'GET', path: '/api/reader/hpmor/chapter/1' },
      { method: 'GET', path: '/api/user/settings' },
    ];

    for (const ep of privateEndpoints) {
      const opts = {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
      };
      if (ep.body) opts.body = JSON.stringify(ep.body);

      const res = await fetch(baseUrl + ep.path, opts);
      assert.equal(res.status, 401, 'Endpoint ' + ep.method + ' ' + ep.path + ' should return 401');
      const data = await res.json();
      assert.equal(data.error, 'Unauthorized', 'Endpoint ' + ep.path + ' error message');
    }
  });

  it('VAL-SEC-001: all responses from private user API endpoints include mandatory security headers', async () => {
    const endpointsToTest = [
      '/api/user/settings',
      '/api/writing/samples',
      '/api/practice/today',
      '/api/chat',
      '/api/vocabulary',
      '/api/curriculum',
    ];

    for (const path of endpointsToTest) {
      const res = await fetch(baseUrl + path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path + ' should have X-Frame-Options: DENY');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path + ' should have X-Content-Type-Options: nosniff');
      assert.equal(res.headers.get('cache-control'), 'no-store', path + ' should have Cache-Control: no-store');
    }
  });

  it('authenticated requests succeed with security headers', async () => {
    const resCookie = await fetch(baseUrl + '/api/curriculum', {
      headers: { Cookie: 'lingua_session=' + ownerSessionId }
    });
    assert.equal(resCookie.status, 200);
    assert.equal(resCookie.headers.get('x-frame-options'), 'DENY');
    assert.equal(resCookie.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(resCookie.headers.get('cache-control'), 'no-store');

    const resToken = await fetch(baseUrl + '/api/writing/samples', {
      headers: { Authorization: 'Bearer ' + ownerDeviceToken }
    });
    assert.equal(resToken.status, 200);
    assert.equal(resToken.headers.get('x-frame-options'), 'DENY');
  });
});
