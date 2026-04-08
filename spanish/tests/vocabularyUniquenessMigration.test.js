import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureVocabularyExactDuplicateIndex } from '../server/vocabularyUniquenessMigration.js';

function createMigrationDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      translation TEXT,
      example TEXT,
      review_count INTEGER DEFAULT 0,
      profile_id INTEGER NOT NULL
    );
  `);

  return db;
}

describe('Vocabulary uniqueness migration', () => {
  it('widens the legacy word-only unique index without deleting alternate translations', () => {
    const db = createMigrationDb();
    db.exec(`
      CREATE UNIQUE INDEX idx_vocabulary_word_profile
      ON vocabulary(word COLLATE NOCASE, profile_id);
    `);

    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('banco', 'bank', 'Voy al banco.', 1);

    const migration = ensureVocabularyExactDuplicateIndex(db);
    const indexSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_vocabulary_word_profile'"
    ).get().sql;

    assert.equal(migration.createdUniqueIndex, true);
    assert.equal(migration.exactDuplicates.length, 0);
    assert.match(indexSql, /translation_key/i);

    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('banco', 'bench', 'Me siento en el banco.', 1);

    assert.throws(
      () => db.prepare(`
        INSERT INTO vocabulary (word, word_key, translation, translation_key, example, profile_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('Banco', 'banco', 'bank', 'bank', 'Duplicado exacto.', 1),
      /UNIQUE constraint failed/
    );

    const rows = db.prepare(
      'SELECT word, translation, example FROM vocabulary WHERE profile_id = 1 ORDER BY translation ASC'
    ).all();
    assert.deepEqual(rows, [
      { word: 'banco', translation: 'bank', example: 'Voy al banco.' },
      { word: 'banco', translation: 'bench', example: 'Me siento en el banco.' },
    ]);

    db.close();
  });

  it('keeps existing rows intact when exact duplicates already exist', () => {
    const db = createMigrationDb();
    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('carta', 'letter', 'Escribí una carta.', 1);
    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('Carta', 'letter', 'Recibí una carta.', 1);

    const firstPass = ensureVocabularyExactDuplicateIndex(db);
    const secondPass = ensureVocabularyExactDuplicateIndex(db);

    assert.equal(firstPass.createdUniqueIndex, false);
    assert.equal(firstPass.uniqueIndexPresent, false);
    assert.equal(firstPass.exactDuplicates.length, 1);
    assert.equal(secondPass.createdUniqueIndex, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vocabulary').get().count, 2);

    const indexSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_vocabulary_word_profile'"
    ).get();
    assert.equal(indexSql, undefined);

    const lookupSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_vocabulary_profile_word_translation_lookup'"
    ).get().sql;
    assert.match(lookupSql, /word_key/i);

    db.close();
  });

  it('detects accented case-only duplicates with Unicode-aware keys', () => {
    const db = createMigrationDb();
    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('Árbol', 'tree', 'Un árbol alto.', 1);
    db.prepare('INSERT INTO vocabulary (word, translation, example, profile_id) VALUES (?, ?, ?, ?)')
      .run('árbol', 'tree', 'Otro árbol.', 1);

    const migration = ensureVocabularyExactDuplicateIndex(db);

    assert.equal(migration.createdUniqueIndex, false);
    assert.equal(migration.uniqueIndexPresent, false);
    assert.equal(migration.exactDuplicates.length, 1);
    assert.equal(migration.exactDuplicates[0].duplicate_count, 2);

    db.close();
  });
});
