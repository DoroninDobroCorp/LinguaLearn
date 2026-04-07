import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTag, extractAllTags, extractFirstTag, stripTags } from '../lib/tagParser.js';
import { parseExerciseTag } from '../src/utils/exerciseParser.js';

// ---------------------------------------------------------------------------
// findTag – low-level boundary detection
// ---------------------------------------------------------------------------
describe('findTag', () => {
  it('returns null when prefix is absent', () => {
    assert.equal(findTag('hello world', '[EXERCISE: '), null);
  });

  it('finds a simple tag', () => {
    const text = '[EXERCISE: {"type":"open"}]';
    const loc = findTag(text, '[EXERCISE: ');
    assert.equal(loc.tagStart, 0);
    assert.equal(loc.jsonEnd, 26);  // after closing }
    assert.equal(loc.tagEnd, 27);   // after ]
    assert.equal(text.substring(loc.jsonStart, loc.jsonEnd), '{"type":"open"}');
  });

  it('handles }] inside a JSON string value', () => {
    const inner = '{"q":"What does }] mean?"}';
    const text = `prefix [EXERCISE: ${inner}] suffix`;
    const loc = findTag(text, '[EXERCISE: ');
    assert.ok(loc);
    assert.equal(text.substring(loc.jsonStart, loc.jsonEnd), inner);
  });

  it('handles escaped quotes inside JSON strings', () => {
    const inner = '{"q":"She said \\"hola\\""}';
    const text = `[EXERCISE: ${inner}]`;
    const loc = findTag(text, '[EXERCISE: ');
    assert.ok(loc);
    assert.equal(text.substring(loc.jsonStart, loc.jsonEnd), inner);
  });

  it('handles nested objects', () => {
    const inner = '{"a":{"b":{"c":1}}}';
    const text = `[TOPICS_UPDATE: ${inner}]`;
    const loc = findTag(text, '[TOPICS_UPDATE: ');
    assert.ok(loc);
    assert.equal(text.substring(loc.jsonStart, loc.jsonEnd), inner);
  });

  it('handles backslash at end of string value', () => {
    const inner = '{"path":"c:\\\\dir\\\\file"}';
    const text = `[VOCAB_ADD: ${inner}]`;
    const loc = findTag(text, '[VOCAB_ADD: ');
    assert.ok(loc);
    const parsed = JSON.parse(text.substring(loc.jsonStart, loc.jsonEnd));
    assert.equal(parsed.path, 'c:\\dir\\file');
  });

  it('returns null for unclosed braces', () => {
    assert.equal(findTag('[EXERCISE: {"open": true', '[EXERCISE: '), null);
  });

  it('respects searchFrom parameter', () => {
    const text = '[TAG: {"a":1}] ... [TAG: {"b":2}]';
    const first = findTag(text, '[TAG: ', 0);
    assert.ok(first);
    assert.equal(JSON.parse(text.substring(first.jsonStart, first.jsonEnd)).a, 1);

    const second = findTag(text, '[TAG: ', first.jsonEnd);
    assert.ok(second);
    assert.equal(JSON.parse(text.substring(second.jsonStart, second.jsonEnd)).b, 2);
  });

  it('handles braces inside string values that look like nested JSON', () => {
    const inner = '{"example":"Use {curly} braces like {this}"}';
    const text = `[VOCAB_ADD: ${inner}]`;
    const loc = findTag(text, '[VOCAB_ADD: ');
    assert.ok(loc);
    const parsed = JSON.parse(text.substring(loc.jsonStart, loc.jsonEnd));
    assert.equal(parsed.example, 'Use {curly} braces like {this}');
  });
});

// ---------------------------------------------------------------------------
// extractAllTags
// ---------------------------------------------------------------------------
describe('extractAllTags', () => {
  it('returns empty array when no tags found', () => {
    assert.deepEqual(extractAllTags('just text', '[X: '), []);
  });

  it('extracts multiple tags', () => {
    const text =
      '[VOCAB_ADD: {"word":"hola","translation":"hello"}]' +
      ' some text ' +
      '[VOCAB_ADD: {"word":"adiós","translation":"goodbye"}]';
    const results = extractAllTags(text, '[VOCAB_ADD: ');
    assert.equal(results.length, 2);
    assert.equal(results[0].word, 'hola');
    assert.equal(results[1].word, 'adiós');
  });

  it('skips malformed JSON but continues', () => {
    const text =
      '[TAG: {invalid json}]' +
      '[TAG: {"valid":true}]';
    const results = extractAllTags(text, '[TAG: ');
    // The first payload is invalid JSON but has balanced braces;
    // extractAllTags skips it and continues.
    assert.equal(results.length, 1);
    assert.equal(results[0].valid, true);
  });

  it('handles }] inside string values across multiple tags', () => {
    const text =
      '[EXERCISE: {"q":"What is }]?"}]' +
      ' between ' +
      '[EXERCISE: {"q":"Another }] here"}]';
    const results = extractAllTags(text, '[EXERCISE: ');
    assert.equal(results.length, 2);
    assert.equal(results[0].q, 'What is }]?');
    assert.equal(results[1].q, 'Another }] here');
  });
});

// ---------------------------------------------------------------------------
// extractFirstTag
// ---------------------------------------------------------------------------
describe('extractFirstTag', () => {
  it('returns null when absent', () => {
    assert.equal(extractFirstTag('no tag here', '[EXERCISE: '), null);
  });

  it('returns first tag only', () => {
    const text = '[TAG: {"n":1}] [TAG: {"n":2}]';
    const result = extractFirstTag(text, '[TAG: ');
    assert.equal(result.n, 1);
  });

  it('returns null on invalid JSON with balanced braces', () => {
    const result = extractFirstTag('[TAG: {not json}]', '[TAG: ');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// stripTags
// ---------------------------------------------------------------------------
describe('stripTags', () => {
  it('returns text unchanged when no tags present', () => {
    assert.equal(stripTags('hello world', '[TAG: '), 'hello world');
  });

  it('strips a single tag', () => {
    const text = 'before [TAG: {"a":1}] after';
    assert.equal(stripTags(text, '[TAG: '), 'before  after');
  });

  it('strips multiple tags', () => {
    const text = '[A: {"x":1}] middle [A: {"y":2}] end';
    assert.equal(stripTags(text, '[A: '), ' middle  end');
  });

  it('strips tag with }] inside JSON string', () => {
    const text = 'Hola [EXERCISE: {"q":"What is }]?"}] Adiós';
    assert.equal(stripTags(text, '[EXERCISE: '), 'Hola  Adiós');
  });

  it('strips all three tag types from a mixed message', () => {
    const text =
      'Hello! [TOPICS_UPDATE: {"updates":[{"topic":"Verbs"}]}] ' +
      '[VOCAB_ADD: {"word":"gato","translation":"cat"}] ' +
      '[EXERCISE: {"type":"open","question":"Translate }] please"}] Bye!';
    let clean = stripTags(text, '[TOPICS_UPDATE: ');
    clean = stripTags(clean, '[VOCAB_ADD: ');
    clean = stripTags(clean, '[EXERCISE: ');
    // stripTags only removes tag content, not surrounding whitespace.
    // The server applies .trim() on the final result; inner whitespace is preserved.
    assert.ok(!clean.includes('TOPICS_UPDATE'));
    assert.ok(!clean.includes('VOCAB_ADD'));
    assert.ok(!clean.includes('EXERCISE'));
    assert.ok(clean.startsWith('Hello!'));
    assert.ok(clean.endsWith('Bye!'));
  });
});

// ---------------------------------------------------------------------------
// parseExerciseTag (client-side wrapper)
// ---------------------------------------------------------------------------
describe('parseExerciseTag', () => {
  it('returns null when no exercise tag', () => {
    assert.equal(parseExerciseTag('just chat text'), null);
  });

  it('parses a standard exercise', () => {
    const json = '{"type":"multiple-choice","question":"Ayer yo ___ al mercado.","options":["fui","voy"],"correctAnswer":"fui"}';
    const text = `Great question! [EXERCISE: ${json}]`;
    const result = parseExerciseTag(text);
    assert.ok(result);
    assert.equal(result.exercise.type, 'multiple-choice');
    assert.equal(result.exercise.correctAnswer, 'fui');
    assert.equal(result.cleanContent, 'Great question!');
  });

  it('handles }] inside exercise question text', () => {
    const text = '[EXERCISE: {"type":"open","question":"Translate: }] is tricky"}]';
    const result = parseExerciseTag(text);
    assert.ok(result);
    assert.equal(result.exercise.question, 'Translate: }] is tricky');
    assert.equal(result.cleanContent, '');
  });

  it('handles escaped quotes in exercise', () => {
    const text = '[EXERCISE: {"type":"open","question":"She said \\"hola\\" to me"}]';
    const result = parseExerciseTag(text);
    assert.ok(result);
    assert.equal(result.exercise.question, 'She said "hola" to me');
  });

  it('returns cleanContent with tag removed', () => {
    const text = 'Before tag [EXERCISE: {"type":"open","question":"q"}] after tag';
    const result = parseExerciseTag(text);
    assert.ok(result);
    assert.equal(result.cleanContent, 'Before tag  after tag');
  });
});

// ---------------------------------------------------------------------------
// Profile isolation (basic server-side DB tests)
// ---------------------------------------------------------------------------
describe('Profile isolation (DB)', async () => {
  // Use dynamic import to get better-sqlite3 (already installed as a dependency)
  let Database;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch {
    // If better-sqlite3 not available, skip DB tests
    it('skipped – better-sqlite3 not available', () => { /* noop */ });
    return;
  }

  /** Create an in-memory DB with the same schema the server uses. */
  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        avatar_emoji TEXT DEFAULT '👤',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_profiles_name ON profiles(name COLLATE NOCASE);

      CREATE TABLE chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        profile_id INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        translation TEXT,
        example TEXT,
        level INTEGER DEFAULT 0,
        next_review TEXT DEFAULT CURRENT_TIMESTAMP,
        profile_id INTEGER DEFAULT 1
      );
      CREATE UNIQUE INDEX idx_vocabulary_word_profile ON vocabulary(word, profile_id);

      INSERT INTO profiles (name, avatar_emoji) VALUES ('Default', '👤');
      INSERT INTO profiles (name, avatar_emoji) VALUES ('Alice', '👧');
      INSERT INTO profiles (name, avatar_emoji) VALUES ('Bob', '👦');
    `);
    return db;
  }

  it('vocabulary rows are isolated between profiles', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('gato', 'cat', 1);
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('perro', 'dog', 2);

    const p1 = db.prepare('SELECT word FROM vocabulary WHERE profile_id = ?').all(1);
    const p2 = db.prepare('SELECT word FROM vocabulary WHERE profile_id = ?').all(2);

    assert.equal(p1.length, 1);
    assert.equal(p1[0].word, 'gato');
    assert.equal(p2.length, 1);
    assert.equal(p2[0].word, 'perro');
    db.close();
  });

  it('same word can exist in different profiles', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('hola', 'hello', 1);
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('hola', 'hello', 2);

    const all = db.prepare('SELECT * FROM vocabulary WHERE word = ?').all('hola');
    assert.equal(all.length, 2);
    db.close();
  });

  it('duplicate word in same profile is rejected', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('hola', 'hello', 1);
    assert.throws(
      () => db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('hola', 'hi', 1),
      /UNIQUE constraint/
    );
    db.close();
  });

  it('chat history is isolated between profiles', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('user', 'Hi from Alice', 2);
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('user', 'Hi from Bob', 3);

    const alice = db.prepare('SELECT content FROM chat_history WHERE profile_id = ?').all(2);
    const bob = db.prepare('SELECT content FROM chat_history WHERE profile_id = ?').all(3);

    assert.equal(alice.length, 1);
    assert.ok(alice[0].content.includes('Alice'));
    assert.equal(bob.length, 1);
    assert.ok(bob[0].content.includes('Bob'));
    db.close();
  });

  it('deleting a profile does not affect other profiles', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('sol', 'sun', 2);
    db.prepare('INSERT INTO vocabulary (word, translation, profile_id) VALUES (?, ?, ?)').run('luna', 'moon', 3);

    // Delete profile 2's data
    db.prepare('DELETE FROM vocabulary WHERE profile_id = ?').run(2);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(2);

    const remaining = db.prepare('SELECT word FROM vocabulary WHERE profile_id = ?').all(3);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].word, 'luna');

    const profiles = db.prepare('SELECT id FROM profiles').all();
    assert.equal(profiles.length, 2); // Default + Bob
    db.close();
  });
});
