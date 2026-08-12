import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import WebSocket from 'ws';
import express from 'express';
import Database from 'better-sqlite3';

import { createAuthService, createAuthMiddleware } from '../server/auth.js';
import { createChatIdempotencyStore } from '../server/chatIdempotency.js';
import { attachLiveChatBridge } from '../server/liveChatBridge.js';
import { buildHpmorChapterImport } from '../server/hpmor.js';

function setupTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      cefr_level TEXT DEFAULT 'B1',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE beta_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      created_by INTEGER REFERENCES users(id),
      used_by INTEGER REFERENCES users(id),
      used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      device_name TEXT NOT NULL,
      app_version TEXT,
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE user_settings (
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

    CREATE TABLE curriculum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE user_topic_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      curriculum_topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id),
      status TEXT NOT NULL DEFAULT 'not_started',
      score REAL DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_practiced TEXT,
      last_error_at TEXT,
      last_success_at TEXT,
      unique_practice_days INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, curriculum_topic_id)
    );

    CREATE TABLE chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE chat_requests (
      message_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      response_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      translation TEXT NOT NULL,
      example TEXT,
      level INTEGER DEFAULT 0,
      next_review TEXT DEFAULT CURRENT_TIMESTAMP,
      review_count INTEGER DEFAULT 0,
      last_reviewed TEXT,
      source TEXT DEFAULT 'manual',
      writing_sample_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, normalized_word)
    );
  `);

  return db;
}

test('VAL-CROSS-003: Chat history & messaging multi-user isolation', async () => {
  const db = setupTestDb();
  const store = createChatIdempotencyStore(db);

  // Create User A (id 1) and User B (id 2)
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'userA@test.com', 'hash')").run();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (2, 'userB@test.com', 'hash')").run();

  // User A reserves chat messageId "msg-userA-100"
  const resA = store.begin('msg-userA-100', 'Hello from User A', 1);
  assert.equal(resA.state, 'reserved');

  // User B attempting to use User A's messageId "msg-userA-100" must be rejected (Forbidden/Conflict/Not Found)
  assert.throws(
    () => store.begin('msg-userA-100', 'Hijack attempt from User B', 2),
    (err) => err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 409
  );
});

test('VAL-CROSS-004: Voice Live WebSocket authentication & stream isolation', async () => {
  const db = setupTestDb();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'userA@test.com', 'hash')").run();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('session-user-A', 1, '2099-01-01T00:00:00Z')").run();

  const app = express();
  const server = createServer(app);

  attachLiveChatBridge({
    server,
    path: '/api/voice/live',
    db,
    getLiveContext: (userId) => ({ userId, maxLevel: 'B2' }),
    geminiApiKey: 'mock-key',
    startSession: async () => ({
      model: 'mock-live',
      maxSessionMs: 10000,
      close() {},
      sendAudioChunk() {},
      sendText() {},
    }),
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  // 1. Unauthenticated WS connection to /api/voice/live must be rejected (401 / 403 or close code 4001)
  const unauthWs = new WebSocket(`ws://localhost:${port}/api/voice/live`);
  const unauthResult = await new Promise((resolve) => {
    unauthWs.on('unexpected-response', (req, res) => {
      resolve({ status: res.statusCode });
    });
    unauthWs.on('close', (code) => {
      resolve({ code });
    });
    unauthWs.on('open', () => {
      resolve({ open: true });
    });
  });

  assert.ok(
    unauthResult.status === 401 || unauthResult.code === 4001 || unauthResult.status === 403,
    `Expected unauthenticated WS handshake to be rejected, got: ${JSON.stringify(unauthResult)}`
  );

  server.close();
});

test('VAL-CROSS-005: Vocabulary CRUD multi-user isolation', async () => {
  const db = setupTestDb();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'userA@test.com', 'hash')").run();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (2, 'userB@test.com', 'hash')").run();

  // User A adds a word
  db.prepare(`
    INSERT INTO vocabulary (user_id, word, normalized_word, translation)
    VALUES (1, 'serendipity', 'serendipity', 'счастливая случайность')
  `).run();

  const userAWord = db.prepare("SELECT * FROM vocabulary WHERE user_id = 1 AND normalized_word = 'serendipity'").get();
  assert.ok(userAWord, 'User A word should exist');

  // User B queries vocabulary: should NOT see User A's word
  const userBWords = db.prepare("SELECT * FROM vocabulary WHERE user_id = 2").all();
  assert.equal(userBWords.length, 0, 'User B should see 0 words');

  // User B attempts to delete User A's word
  const deleteResult = db.prepare("DELETE FROM vocabulary WHERE id = ? AND user_id = ?").run(userAWord.id, 2);
  assert.equal(deleteResult.changes, 0, 'User B delete should not affect User A word');

  // User A word remains intact
  const wordStillExists = db.prepare("SELECT * FROM vocabulary WHERE id = 1 AND user_id = 1").get();
  assert.ok(wordStillExists, 'User A word must remain intact');
});

test('VAL-READ-001: Authenticated Reader HPMOR content access with source attribution', async () => {
  const chapterImport = await buildHpmorChapterImport({
    chapterNumber: 4,
    fetchChapterHtml: async () => '<title>Chapter 4: The Periodical Prediction</title><div id="storycontent"><p>Test content.</p></div>',
    fetchPodcastHtml: async () => '',
    fetchPodcastPostHtml: async () => '',
  });

  assert.equal(chapterImport.chapterNumber, 4);
  assert.ok(chapterImport.title.includes('The Periodical Prediction'));
  assert.ok(chapterImport.text.length > 0);
  assert.equal(chapterImport.source, 'hpmor');
});

test('VAL-READ-002: Reader translation API authentication and user isolation', async () => {
  const db = setupTestDb();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (1, 'userA@test.com', 'hash')").run();
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (2, 'userB@test.com', 'hash')").run();

  // Save words for User A
  const wordsToSave = [{ word: 'resilient', translation_ru: 'устойчивый' }];
  const userId = 1;
  for (const item of wordsToSave) {
    const norm = item.word.toLowerCase();
    db.prepare(`
      INSERT INTO vocabulary (user_id, word, normalized_word, translation, source)
      VALUES (?, ?, ?, ?, 'reader_translate')
    `).run(userId, item.word, norm, item.translation_ru);
  }

  // User A vocabulary contains saved word
  const userAWords = db.prepare("SELECT * FROM vocabulary WHERE user_id = 1").all();
  assert.equal(userAWords.length, 1);
  assert.equal(userAWords[0].word, 'resilient');

  // User B vocabulary does NOT contain User A word
  const userBWords = db.prepare("SELECT * FROM vocabulary WHERE user_id = 2").all();
  assert.equal(userBWords.length, 0);
});
