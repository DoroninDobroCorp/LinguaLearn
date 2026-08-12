import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getDb } from '../server/db.js';
import { getOwnerId, migrateMultiUserSchema } from '../server/dbMigration.js';

describe('Multi-User Database Schema Migration & Isolation Tests', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');

    // Setup base users table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deactivated')),
        cefr_level TEXT DEFAULT 'B1',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch (e) {}
    }
  });

  test('All 10 domain tables + auxiliary tables have user_id columns referencing users(id)', () => {
    db.exec("INSERT INTO users (email, password_hash, role) VALUES ('owner@example.com', 'hash', 'owner')");
    migrateMultiUserSchema(db);

    const domainTables = [
      'user_settings',
      'user_topic_progress',
      'writing_samples',
      'grammar_evidence',
      'correction_feedback',
      'practice_sessions',
      'chat_history',
      'chat_requests',
      'vocabulary',
      'achievements',
      'device_tokens',
      'analytics_events'
    ];

    for (const tableName of domainTables) {
      const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const cols = tableInfo.map(c => c.name);
      assert.ok(cols.includes('user_id'), `Table ${tableName} must contain user_id column. Found: [${cols.join(', ')}]`);

      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
      const hasUserFk = foreignKeys.some(fk => fk.table === 'users' && (fk.from === 'user_id' || fk.from === null));
      // Note: user_settings has user_id as PK referencing users(id)
      assert.ok(hasUserFk, `Table ${tableName} must have foreign key referencing users(id). FKs: ${JSON.stringify(foreignKeys)}`);
    }
  });

  test('Unique constraints incorporate user_id (e.g. writing_samples UNIQUE(user_id, event_id))', () => {
    db.exec("INSERT INTO users (email, password_hash, role) VALUES ('owner@example.com', 'hash', 'owner')");
    db.exec("INSERT INTO users (email, password_hash, role) VALUES ('user2@example.com', 'hash', 'user')");
    migrateMultiUserSchema(db);

    const user1Id = 1;
    const user2Id = 2;

    // 1. writing_samples UNIQUE(user_id, event_id)
    db.prepare(`
      INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at)
      VALUES (?, 'evt-100', 'Slack', 'Hello world.', CURRENT_TIMESTAMP)
    `).run(user1Id);

    // Same event_id for User 2 must SUCCEED (isolation per user)
    db.prepare(`
      INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at)
      VALUES (?, 'evt-100', 'Slack', 'Hello world from user 2.', CURRENT_TIMESTAMP)
    `).run(user2Id);

    // Duplicate event_id for User 1 must FAIL
    assert.throws(() => {
      db.prepare(`
        INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at)
        VALUES (?, 'evt-100', 'Slack', 'Duplicate event for user 1.', CURRENT_TIMESTAMP)
      `).run(user1Id);
    }, /UNIQUE constraint failed/);

    // 2. vocabulary UNIQUE(user_id, normalized_word)
    db.prepare(`
      INSERT INTO vocabulary (user_id, word, normalized_word, translation)
      VALUES (?, 'Apple', 'apple', 'Яблоко')
    `).run(user1Id);

    // Same normalized word for User 2 must SUCCEED
    db.prepare(`
      INSERT INTO vocabulary (user_id, word, normalized_word, translation)
      VALUES (?, 'apple', 'apple', 'Яблоко')
    `).run(user2Id);

    // Duplicate normalized word for User 1 must FAIL
    assert.throws(() => {
      db.prepare(`
        INSERT INTO vocabulary (user_id, word, normalized_word, translation)
        VALUES (?, 'APPLE', 'apple', 'Яблоко 2')
      `).run(user1Id);
    }, /UNIQUE constraint failed/);

    // 3. achievements UNIQUE(user_id, name)
    db.prepare(`
      INSERT INTO achievements (user_id, name, description)
      VALUES (?, 'First Sentence', 'Analyzed first sentence')
    `).run(user1Id);

    db.prepare(`
      INSERT INTO achievements (user_id, name, description)
      VALUES (?, 'First Sentence', 'Analyzed first sentence')
    `).run(user2Id);

    assert.throws(() => {
      db.prepare(`
        INSERT INTO achievements (user_id, name, description)
        VALUES (?, 'First Sentence', 'Analyzed first sentence again')
      `).run(user1Id);
    }, /UNIQUE constraint failed/);
  });

  test('Migrates existing single-user data into initial owner account without data loss', () => {
    // Setup single-user tables with production-like data before migration
    db.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        max_level TEXT DEFAULT 'C2',
        dark_mode INTEGER DEFAULT 0,
        notifications_enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO user_settings (id, max_level, dark_mode) VALUES (1, 'B2', 1);

      CREATE TABLE chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO chat_history (role, content) VALUES ('user', 'Hello'), ('assistant', 'Hi there!');

      CREATE TABLE vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        translation TEXT NOT NULL,
        example TEXT,
        level INTEGER DEFAULT 0,
        next_review TEXT DEFAULT CURRENT_TIMESTAMP,
        review_count INTEGER DEFAULT 0,
        last_reviewed TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO vocabulary (word, translation) VALUES ('ubiquitous', 'вездесущий');

      CREATE TABLE writing_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        source_app TEXT NOT NULL,
        original_text TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
        accepted INTEGER,
        rejection_reason TEXT,
        analysis_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        analyzed_at TEXT
      );
      INSERT INTO writing_samples (event_id, source_app, original_text, sent_at, status)
      VALUES ('legacy-evt-1', 'Slack', 'Sample text', CURRENT_TIMESTAMP, 'completed');

      CREATE TABLE curriculum_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        score REAL DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_practiced TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO curriculum_topics (name, category, level, status, score, failure_count)
      VALUES ('Articles (a/an/the)', 'Grammar', 'A1', 'in_progress', -2.0, 3);
    `);

    // Insert owner account into users table
    const ownerRes = db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('owner@lingualearn.com', 'hash', 'owner')").run();
    const ownerId = ownerRes.lastInsertRowid;

    // Run migration
    migrateMultiUserSchema(db);

    // Verify user_settings
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(ownerId);
    assert.ok(settings);
    assert.equal(settings.max_level, 'B2');
    assert.equal(settings.dark_mode, 1);

    // Verify chat_history
    const chatRows = db.prepare('SELECT * FROM chat_history WHERE user_id = ?').all(ownerId);
    assert.equal(chatRows.length, 2);
    assert.equal(chatRows[0].content, 'Hello');

    // Verify vocabulary
    const vocabRows = db.prepare('SELECT * FROM vocabulary WHERE user_id = ?').all(ownerId);
    assert.equal(vocabRows.length, 1);
    assert.equal(vocabRows[0].word, 'ubiquitous');
    assert.equal(vocabRows[0].normalized_word, 'ubiquitous');

    // Verify writing_samples
    const sampleRows = db.prepare('SELECT * FROM writing_samples WHERE user_id = ?').all(ownerId);
    assert.equal(sampleRows.length, 1);
    assert.equal(sampleRows[0].event_id, 'legacy-evt-1');

    // Verify user_topic_progress
    const progressRows = db.prepare('SELECT * FROM user_topic_progress WHERE user_id = ?').all(ownerId);
    assert.equal(progressRows.length, 1);
    assert.equal(progressRows[0].score, -2.0);
    assert.equal(progressRows[0].error_count, 3);
    assert.equal(progressRows[0].status, 'recurring_problem');
  });

  test('VAL-CROSS-001: Strict multi-user data isolation', () => {
    db.exec("INSERT INTO users (email, password_hash, role) VALUES ('userA@example.com', 'hash', 'user')");
    db.exec("INSERT INTO users (email, password_hash, role) VALUES ('userB@example.com', 'hash', 'user')");
    migrateMultiUserSchema(db);

    const userA = 1;
    const userB = 2;

    // Insert User A data
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', 'Secret message from A')").run(userA);
    db.prepare("INSERT INTO vocabulary (user_id, word, normalized_word, translation) VALUES (?, 'Serendipity', 'serendipity', 'Интуитивная проницательность')").run(userA);
    db.prepare("INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at) VALUES (?, 'evt-A', 'Telegram', 'User A writing', CURRENT_TIMESTAMP)").run(userA);

    // Insert User B data
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', 'Message from B')").run(userB);
    db.prepare("INSERT INTO vocabulary (user_id, word, normalized_word, translation) VALUES (?, 'Ephemeral', 'ephemeral', 'Эфемерный')").run(userB);
    db.prepare("INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at) VALUES (?, 'evt-B', 'Slack', 'User B writing', CURRENT_TIMESTAMP)").run(userB);

    // Assert User B queries return ZERO User A records
    const userBHistory = db.prepare("SELECT * FROM chat_history WHERE user_id = ?").all(userB);
    assert.equal(userBHistory.length, 1);
    assert.equal(userBHistory[0].content, 'Message from B');

    const userBVocab = db.prepare("SELECT * FROM vocabulary WHERE user_id = ?").all(userB);
    assert.equal(userBVocab.length, 1);
    assert.equal(userBVocab[0].word, 'Ephemeral');

    const userBSamples = db.prepare("SELECT * FROM writing_samples WHERE user_id = ?").all(userB);
    assert.equal(userBSamples.length, 1);
    assert.equal(userBSamples[0].event_id, 'evt-B');

    // Cross-user access check (User B querying User A resource ID returns undefined)
    const userASampleId = db.prepare("SELECT id FROM writing_samples WHERE user_id = ?").get(userA).id;
    const directQuery = db.prepare("SELECT * FROM writing_samples WHERE id = ? AND user_id = ?").get(userASampleId, userB);
    assert.equal(directQuery, undefined);
  });
});
