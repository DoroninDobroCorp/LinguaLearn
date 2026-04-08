import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureCaseInsensitiveProfileNameIndex } from '../server/profileNameMigration.js';

function createProfileMigrationDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '👤',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      translation TEXT,
      profile_id INTEGER NOT NULL
    );

    CREATE TABLE chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      profile_id INTEGER NOT NULL
    );

    CREATE TABLE curriculum_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      profile_id INTEGER NOT NULL
    );

    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      max_level TEXT DEFAULT 'B2'
    );

    CREATE UNIQUE INDEX idx_profiles_name ON profiles(name);
  `);

  return db;
}

describe('Profile name migration', () => {
  it('renames case-only duplicate profiles instead of deleting their Spanish data', () => {
    const db = createProfileMigrationDb();

    db.prepare(`
      INSERT INTO profiles (id, name, avatar_emoji)
      VALUES
        (1, 'Default', '👤'),
        (2, 'Alice', '👧'),
        (3, 'alice', '🧑'),
        (4, 'ALICE', '🦊'),
        (5, 'alice (3)', '🐻')
    `).run();

    db.prepare(`
      INSERT INTO vocabulary (word, translation, profile_id)
      VALUES
        ('hola', 'hello', 2),
        ('adiós', 'goodbye', 3),
        ('gracias', 'thanks', 4)
    `).run();
    db.prepare(`
      INSERT INTO chat_history (message, profile_id)
      VALUES
        ('first', 2),
        ('second', 3),
        ('third', 4)
    `).run();
    db.prepare(`
      INSERT INTO curriculum_progress (topic_id, completed, profile_id)
      VALUES
        ('greetings', 1, 3),
        ('travel', 0, 4)
    `).run();
    db.prepare(`
      INSERT INTO user_settings (profile_id, max_level)
      VALUES
        (2, 'A2'),
        (3, 'B1'),
        (4, 'C1')
    `).run();

    const firstPass = ensureCaseInsensitiveProfileNameIndex(db);
    const secondPass = ensureCaseInsensitiveProfileNameIndex(db);

    assert.deepEqual(
      firstPass.renamedProfiles,
      [
        { id: 3, previousName: 'alice', nextName: 'alice (3-2)' },
        { id: 4, previousName: 'ALICE', nextName: 'ALICE (4)' },
      ],
    );
    assert.deepEqual(secondPass.renamedProfiles, []);

    const profiles = db.prepare('SELECT id, name FROM profiles ORDER BY id ASC').all();
    assert.deepEqual(
      profiles,
      [
        { id: 1, name: 'Default' },
        { id: 2, name: 'Alice' },
        { id: 3, name: 'alice (3-2)' },
        { id: 4, name: 'ALICE (4)' },
        { id: 5, name: 'alice (3)' },
      ],
    );

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM profiles').get().count, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vocabulary').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chat_history').get().count, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM curriculum_progress').get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_settings').get().count, 3);

    assert.deepEqual(
      db.prepare('SELECT profile_id, word FROM vocabulary ORDER BY profile_id ASC').all(),
      [
        { profile_id: 2, word: 'hola' },
        { profile_id: 3, word: 'adiós' },
        { profile_id: 4, word: 'gracias' },
      ],
    );

    const indexSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_profiles_name'"
    ).get().sql;
    assert.match(indexSql, /\(\s*name_key\s*\)/i);
    assert.throws(
      () => db.prepare(
        "INSERT INTO profiles (name, name_key, avatar_emoji) VALUES ('ALICE', ?, '🙂')"
      ).run('alice'),
      /UNIQUE constraint failed: profiles.name_key/,
    );

    db.close();
  });

  it('treats accented Spanish names as case-insensitive duplicates', () => {
    const db = createProfileMigrationDb();

    db.prepare(`
      INSERT INTO profiles (id, name, avatar_emoji)
      VALUES
        (1, 'Álvaro', '👤'),
        (2, 'álvaro', '🧑')
    `).run();

    const migration = ensureCaseInsensitiveProfileNameIndex(db);
    const profiles = db.prepare('SELECT id, name, name_key FROM profiles ORDER BY id ASC').all();

    assert.deepEqual(migration.renamedProfiles, [
      { id: 2, previousName: 'álvaro', nextName: 'álvaro (2)' },
    ]);
    assert.equal(profiles[0].name_key, 'álvaro');
    assert.equal(profiles[1].name_key, 'álvaro (2)');

    db.close();
  });
});
