import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';

import { logAnalyticsEvent, getSystemMetrics, sanitizeTelemetryProperties } from '../server/analytics.js';
import { createAuthMiddleware, createAuthService } from '../server/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const testDbPath = path.join(projectRoot, 'server', 'english_learning_telemetry_test.db');
const adminScript = path.join(projectRoot, 'server', 'scripts', 'admin.js');

describe('Admin Telemetry & Aggregated Metrics (VAL-ADM-002)', () => {
  let db;

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new Database(testDbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    
    // Create base tables needed
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deactivated')),
        cefr_level TEXT DEFAULT 'B1',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS beta_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        created_by INTEGER REFERENCES users(id),
        used_by INTEGER REFERENCES users(id),
        used_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS device_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL,
        app_version TEXT,
        last_used_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        max_level TEXT DEFAULT 'C2',
        dark_mode INTEGER DEFAULT 0,
        notifications_enabled INTEGER DEFAULT 1,
        external_capture_enabled INTEGER DEFAULT 1,
        raw_text_retention_days INTEGER DEFAULT 7,
        allowed_apps TEXT DEFAULT 'ALL',
        denied_apps TEXT DEFAULT '',
        capture_paused INTEGER DEFAULT 0,
        onboarding_completed INTEGER DEFAULT 0,
        onboarding_step INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS writing_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_token_id INTEGER REFERENCES device_tokens(id),
        event_id TEXT NOT NULL,
        source_app TEXT NOT NULL,
        original_text TEXT,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing',
        accepted INTEGER DEFAULT 1,
        rejection_reason TEXT,
        preview_only INTEGER DEFAULT 0,
        analysis_json TEXT,
        retention_purged INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        analyzed_at TEXT,
        UNIQUE(user_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS correction_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        writing_sample_id INTEGER NOT NULL REFERENCES writing_samples(id) ON DELETE CASCADE,
        feedback_type TEXT NOT NULL,
        notes TEXT,
        undone_evidence_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, writing_sample_id, feedback_type)
      );

      CREATE TABLE IF NOT EXISTS practice_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress',
        topics_json TEXT NOT NULL,
        exercises_json TEXT NOT NULL,
        user_answers_json TEXT DEFAULT '[]',
        results_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,
        properties_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (e) {}
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
  });

  describe('Privacy-Safe Telemetry Logger', () => {
    it('sanitizes properties and redacts sensitive keys / raw user text', () => {
      const input = {
        originalText: 'Sensitive raw user text should not be logged',
        message: 'Secret message from user',
        token: 'll_dev_123456789',
        password: 'UserSecret123',
        source_app: 'Slack',
        changed: true,
        error_count: 2
      };

      const sanitized = sanitizeTelemetryProperties(input);
      assert.equal(sanitized.originalText, '[REDACTED]');
      assert.equal(sanitized.message, '[REDACTED]');
      assert.equal(sanitized.token, '[REDACTED]');
      assert.equal(sanitized.password, '[REDACTED]');
      assert.equal(sanitized.source_app, 'Slack');
      assert.equal(sanitized.changed, true);
      assert.equal(sanitized.error_count, 2);
    });

    it('logs privacy-safe events into analytics_events table', () => {
      const passHash = bcrypt.hashSync('pass123', 10);
      const res = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES ('telemetry_user@test.com', ?, 'user', 'active')").run(passHash);
      const userId = res.lastInsertRowid;

      logAnalyticsEvent(db, userId, 'writing_analyzed', {
        source_app: 'Telegram',
        original_text: 'Raw sentence text',
        error_count: 1
      });

      const row = db.prepare('SELECT * FROM analytics_events WHERE user_id = ?').get(userId);
      assert.ok(row, 'Event row must be created');
      assert.equal(row.event_name, 'writing_analyzed');
      
      const props = JSON.parse(row.properties_json);
      assert.equal(props.source_app, 'Telegram');
      assert.equal(props.error_count, 1);
      assert.equal(props.original_text, '[REDACTED]');
    });
  });

  describe('getSystemMetrics helper', () => {
    it('aggregates non-sensitive metrics correctly across tables', () => {
      // Seed test data
      const passHash = bcrypt.hashSync('pass123', 10);
      db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES ('owner@test.com', ?, 'owner', 'active')").run(passHash);
      const userRes = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES ('user@test.com', ?, 'user', 'active')").run(passHash);
      const userId = userRes.lastInsertRowid;

      db.prepare("INSERT INTO device_tokens (user_id, token_hash, device_name) VALUES (?, 'hash1', 'Mac 1')").run(userId);
      db.prepare("INSERT INTO device_tokens (user_id, token_hash, device_name, revoked_at) VALUES (?, 'hash2', 'Mac 2', '2026-01-01')").run(userId);

      db.prepare("INSERT INTO writing_samples (user_id, event_id, source_app, sent_at, status) VALUES (?, 'e1', 'Slack', '2026-08-12', 'completed')").run(userId);
      db.prepare("INSERT INTO writing_samples (user_id, event_id, source_app, sent_at, status) VALUES (?, 'e2', 'Slack', '2026-08-12', 'completed')").run(userId);

      db.prepare("INSERT INTO practice_sessions (id, user_id, status, topics_json, exercises_json) VALUES ('ps1', ?, 'completed', '[]', '[]')").run(userId);
      db.prepare("INSERT INTO practice_sessions (id, user_id, status, topics_json, exercises_json) VALUES ('ps2', ?, 'in_progress', '[]', '[]')").run(userId);

      db.prepare("INSERT INTO correction_feedback (user_id, writing_sample_id, feedback_type) VALUES (?, 1, 'helpful')").run(userId);

      logAnalyticsEvent(db, userId, 'test_event', { count: 1 });

      const metrics = getSystemMetrics(db);
      assert.equal(metrics.totalUsers, 2);
      assert.equal(metrics.activeDevices, 1);
      assert.equal(metrics.totalSentencesAnalyzed, 2);
      assert.equal(metrics.dailyPractice.totalSessions, 2);
      assert.equal(metrics.dailyPractice.completedSessions, 1);
      assert.equal(metrics.dailyPractice.completionRate, 50);
      assert.equal(metrics.feedback.totalCount, 1);
      assert.equal(metrics.telemetryEventsCount, 1);

      // Verify no passwords, raw text, or tokens are present in metrics
      const jsonStr = JSON.stringify(metrics);
      assert.doesNotMatch(jsonStr, /pass123/);
      assert.doesNotMatch(jsonStr, /hash1/);
      assert.doesNotMatch(jsonStr, /user@test\.com/);
    });
  });

  describe('Admin CLI metrics command', () => {
    it('executes node server/scripts/admin.js metrics and outputs formatted counters', () => {
      const env = { ...process.env, ENGLISH_DB_PATH: testDbPath };
      // Bootstrap owner
      execSync(`node "${adminScript}" bootstrap-owner --email=owner@test.com --password=OwnerPassword123!`, { env, encoding: 'utf8' });

      const output = execSync(`node "${adminScript}" metrics`, { env, encoding: 'utf8' });
      assert.match(output, /Aggregated System Metrics/i);
      assert.match(output, /Total Users/i);
      assert.match(output, /Active Devices/i);
      assert.match(output, /Total Sentences Analyzed/i);
      assert.match(output, /Daily Practice Sessions/i);
    });
  });

  describe('API GET /api/admin/metrics Endpoint', () => {
    let server;
    let baseUrl;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());

      const authMiddleware = createAuthMiddleware(db);

      function handleAdminMetrics(req, res) {
        if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'admin')) {
          return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        const metrics = getSystemMetrics(db);
        return res.status(200).json(metrics);
      }

      app.get('/api/admin/metrics', authMiddleware, handleAdminMetrics);

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
    });

    it('returns 401 Unauthorized for unauthenticated request', async () => {
      const res = await fetch(`${baseUrl}/api/admin/metrics`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, 'Unauthorized');
    });

    it('returns 403 Forbidden for authenticated non-admin user (role = user)', async () => {
      const passHash = bcrypt.hashSync('pass123', 10);
      const uRes = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES ('regular@test.com', ?, 'user', 'active')").run(passHash);
      const userId = uRes.lastInsertRowid;
      db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess_reg', ?, '2099-01-01T00:00:00.000Z')").run(userId);

      const res = await fetch(`${baseUrl}/api/admin/metrics`, {
        headers: { Cookie: 'lingua_session=sess_reg' }
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.match(body.error, /Forbidden/i);
    });

    it('returns 200 OK with aggregated usage metrics JSON for owner/admin user', async () => {
      const passHash = bcrypt.hashSync('pass123', 10);
      const oRes = db.prepare("INSERT INTO users (email, password_hash, role, status) VALUES ('owner@test.com', ?, 'owner', 'active')").run(passHash);
      const ownerId = oRes.lastInsertRowid;
      db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess_owner', ?, '2099-01-01T00:00:00.000Z')").run(ownerId);

      const res = await fetch(`${baseUrl}/api/admin/metrics`, {
        headers: { Cookie: 'lingua_session=sess_owner' }
      });
      assert.equal(res.status, 200);
      const metrics = await res.json();
      assert.ok(typeof metrics.totalUsers === 'number');
      assert.ok(typeof metrics.activeDevices === 'number');
      assert.ok(typeof metrics.totalSentencesAnalyzed === 'number');
      assert.ok(metrics.dailyPractice);
      assert.ok(metrics.feedback);
    });
  });
});
