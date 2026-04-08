import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  createVocabularyEntry,
  deleteVocabularyEntry,
  ensureVocabularyReviewSchema,
  listLegacyDueVocabularyWords,
  listDueReviewCards,
  listVocabularyEntries,
  markVocabularyCardLearned,
  reviewLegacyVocabularyEntry,
  reviewVocabularyCard,
} from '../server/vocabularyReview.js';
import { ensureVocabularyExactDuplicateIndex } from '../server/vocabularyUniquenessMigration.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
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
      example TEXT,
      level INTEGER DEFAULT 0,
      next_review TEXT DEFAULT CURRENT_TIMESTAMP,
      review_count INTEGER DEFAULT 0,
      last_reviewed TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      profile_id INTEGER DEFAULT 1
    );

    CREATE UNIQUE INDEX idx_vocabulary_word_profile
      ON vocabulary(word COLLATE NOCASE, translation COLLATE NOCASE, profile_id);

    INSERT INTO profiles (id, name, avatar_emoji) VALUES (1, 'Default', '👤');
    INSERT INTO profiles (id, name, avatar_emoji) VALUES (2, 'Alice', '👧');
  `);

  ensureVocabularyExactDuplicateIndex(db);
  return db;
}

describe('Vocabulary review cards', () => {
  it('migrates legacy vocabulary rows into two review cards idempotently', () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO vocabulary (word, translation, example, level, next_review, review_count, last_reviewed, profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('casa', 'house', 'La casa es grande.', 3, '2030-01-15T10:00:00.000Z', 4, '2030-01-10T10:00:00.000Z', 1);

    ensureVocabularyReviewSchema(db);
    ensureVocabularyReviewSchema(db);

    const cards = db.prepare(`
      SELECT direction, state, review_count, next_review_at
      FROM vocabulary_review_cards
      ORDER BY direction ASC
    `).all();

    assert.equal(cards.length, 2);
    const sourceCard = cards.find((card) => card.direction === 'source_to_target');
    const reverseCard = cards.find((card) => card.direction === 'target_to_source');

    assert.ok(sourceCard);
    assert.ok(reverseCard);
    assert.equal(sourceCard.review_count, 4);
    assert.equal(sourceCard.state, 'review');
    assert.ok(!Number.isNaN(Date.parse(sourceCard.next_review_at)));
    assert.equal(reverseCard.review_count, 0);
    assert.equal(reverseCard.state, 'new');
    assert.ok(!Number.isNaN(Date.parse(reverseCard.next_review_at)));

    db.close();
  });

  it('migrates null legacy next_review values to a valid current timestamp', () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO vocabulary (word, translation, example, level, next_review, review_count, last_reviewed, profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('mesa', 'table', 'La mesa está lista.', 1, null, 2, '2030-01-10T10:00:00.000Z', 1);

    ensureVocabularyReviewSchema(db);

    const card = db.prepare(`
      SELECT next_review_at
      FROM vocabulary_review_cards
      WHERE direction = 'source_to_target'
    `).get();

    assert.ok(!Number.isNaN(Date.parse(card.next_review_at)));
    assert.notEqual(card.next_review_at, '1970-01-01T00:00:00.000Z');

    db.close();
  });

  it('keeps due queues profile-scoped and suppresses learned cards', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);

    const fixedNow = new Date('2030-02-01T09:00:00.000Z');
    createVocabularyEntry(db, 1, { word: 'gato', translation: 'cat', example: 'El gato duerme.' }, fixedNow);
    createVocabularyEntry(db, 2, { word: 'perro', translation: 'dog', example: 'El perro corre.' }, fixedNow);

    const profileOneInitial = listDueReviewCards(db, 1, { now: fixedNow });
    assert.equal(profileOneInitial.cards.length, 2);
    assert.equal(listDueReviewCards(db, 2, { now: fixedNow }).cards.length, 2);

    const learnedCardId = profileOneInitial.cards[0].id;
    const learnedCard = markVocabularyCardLearned(db, 1, learnedCardId, fixedNow);

    assert.ok(learnedCard.learned_until);
    const learnedUntil = new Date(learnedCard.learned_until);
    assert.equal(Math.round((learnedUntil.getTime() - fixedNow.getTime()) / (1000 * 60 * 60 * 24)), 15);

    const profileOneAfterLearned = listDueReviewCards(db, 1, { now: fixedNow });
    assert.equal(profileOneAfterLearned.cards.length, 1);
    assert.equal(listDueReviewCards(db, 2, { now: fixedNow }).cards.length, 2);

    db.close();
  });

  it('allows same-word entries with different translations but rejects exact duplicates', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-02-10T09:00:00.000Z');

    createVocabularyEntry(db, 1, {
      word: 'banco',
      translation: 'bank',
      example: 'Voy al banco.',
    }, fixedNow);
    createVocabularyEntry(db, 1, {
      word: 'banco',
      translation: 'bench',
      example: 'Me siento en el banco.',
    }, fixedNow);

    assert.throws(
      () => createVocabularyEntry(db, 1, {
        word: 'Banco',
        translation: 'bank',
        example: 'Duplicado exacto.',
      }, fixedNow),
      {
        message: 'Word and translation already exist',
        status: 400,
        code: 'DUPLICATE_WORD',
      },
    );

    const entries = listVocabularyEntries(db, 1, fixedNow);
    assert.equal(entries.entries.length, 2);

    db.close();
  });

  it('treats accented case variants as exact duplicates but preserves accent distinctions', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-02-10T09:00:00.000Z');

    createVocabularyEntry(db, 1, {
      word: 'Árbol',
      translation: 'tree',
      example: 'El árbol es alto.',
    }, fixedNow);

    assert.throws(
      () => createVocabularyEntry(db, 1, {
        word: 'árbol',
        translation: 'tree',
        example: 'Duplicado con mayúsculas.',
      }, fixedNow),
      {
        message: 'Word and translation already exist',
        status: 400,
        code: 'DUPLICATE_WORD',
      },
    );

    createVocabularyEntry(db, 1, {
      word: 'Arbol',
      translation: 'tree',
      example: 'Sin tilde.',
    }, fixedNow);

    assert.equal(listVocabularyEntries(db, 1, fixedNow).entries.length, 2);

    db.close();
  });

  it('review scheduling always returns a valid next review timestamp', () => {
    for (const grade of ['dont_know', 'hard', 'good', 'easy']) {
      const db = createTestDb();
      ensureVocabularyReviewSchema(db);
      const fixedNow = new Date('2030-03-05T08:00:00.000Z');
      createVocabularyEntry(db, 1, {
        word: `palabra-${grade}`,
        translation: `meaning-${grade}`,
        example: 'Ejemplo.',
      }, fixedNow);

      const dueCard = listDueReviewCards(db, 1, { now: fixedNow }).cards[0];
      const reviewedCard = reviewVocabularyCard(db, 1, dueCard.id, grade, fixedNow);

      assert.equal(reviewedCard.review_count, 1);
      assert.ok(!Number.isNaN(Date.parse(reviewedCard.next_review_at)));
      assert.ok(reviewedCard.next_review_at.length > 0);

      db.close();
    }
  });

  it('rejects review attempts for cards that are not currently due', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-03-05T08:00:00.000Z');
    createVocabularyEntry(db, 1, {
      word: 'temprano',
      translation: 'early',
      example: 'Llegamos temprano.',
    }, fixedNow);

    const dueCard = listDueReviewCards(db, 1, { now: fixedNow }).cards[0];
    const reviewedCard = reviewVocabularyCard(db, 1, dueCard.id, 'good', fixedNow);

    assert.equal(reviewedCard.review_count, 1);
    assert.throws(
      () => reviewVocabularyCard(db, 1, dueCard.id, 'easy', fixedNow),
      {
        message: 'Review card is not currently due for review.',
        status: 409,
        code: 'CARD_NOT_DUE',
      },
    );

    const storedCard = db.prepare('SELECT review_count FROM vocabulary_review_cards WHERE id = ?').get(dueCard.id);
    assert.equal(storedCard.review_count, 1);

    db.close();
  });

  it('keeps a legacy entry-based due/review compatibility path', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-03-06T08:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'ventana',
      translation: 'window',
      example: 'La ventana está abierta.',
    }, fixedNow);

    const dueWords = listLegacyDueVocabularyWords(db, 1, fixedNow);
    assert.equal(dueWords.length, 1);
    assert.equal(dueWords[0].id, entry.id);
    assert.equal(dueWords[0].reviewable, true);

    const reviewedWord = reviewLegacyVocabularyEntry(db, 1, entry.id, { quality: 3 }, fixedNow);
    assert.equal(reviewedWord.id, entry.id);
    assert.equal(reviewedWord.review_card.direction, 'source_to_target');
    assert.equal(reviewedWord.card_id, entry.cards.find((card) => card.direction === 'target_to_source').id);
    assert.equal(reviewedWord.review_count, 0);
    assert.ok(!Number.isNaN(Date.parse(reviewedWord.next_review)));

    const remainingLegacyDue = listLegacyDueVocabularyWords(db, 1, fixedNow);
    const remainingQueue = listDueReviewCards(db, 1, { now: fixedNow });
    assert.equal(remainingLegacyDue.length, 1);
    assert.equal(remainingLegacyDue[0].card_id, remainingQueue.cards[0].id);
    assert.equal(remainingLegacyDue[0].state, 'new');
    assert.equal(remainingQueue.cards.length, 1);
    assert.equal(remainingQueue.cards[0].direction, 'target_to_source');

    db.close();
  });

  it('legacy due compatibility exposes and reviews the reverse card when it is next due', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-03-06T08:00:00.000Z');
    const later = new Date('2030-03-10T08:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'claro',
      translation: 'clear',
      example: 'Todo está claro.',
    }, fixedNow);

    const sourceCard = db.prepare(`
      SELECT id
      FROM vocabulary_review_cards
      WHERE vocabulary_id = ? AND direction = 'source_to_target'
    `).get(entry.id);
    reviewVocabularyCard(db, 1, sourceCard.id, 'good', fixedNow);

    const dueWords = listLegacyDueVocabularyWords(db, 1, fixedNow);
    assert.equal(dueWords.length, 1);
    assert.equal(dueWords[0].id, entry.id);
    assert.equal(dueWords[0].card_id, entry.cards.find((card) => card.direction === 'target_to_source').id);
    assert.equal(dueWords[0].state, 'new');
    assert.equal(dueWords[0].due, true);

    const reviewedWord = reviewLegacyVocabularyEntry(db, 1, entry.id, { quality: 2 }, fixedNow);
    assert.equal(reviewedWord.review_card.direction, 'target_to_source');

    const refreshedEntry = listVocabularyEntries(db, 1, later).entries.find((item) => item.id === entry.id);
    const sourceAfter = refreshedEntry.cards.find((card) => card.direction === 'source_to_target');
    const reverseAfter = refreshedEntry.cards.find((card) => card.direction === 'target_to_source');

    assert.equal(sourceAfter.review_count, 1);
    assert.equal(reverseAfter.review_count, 1);
    assert.equal(listLegacyDueVocabularyWords(db, 1, fixedNow).length, 0);

    db.close();
  });

  it('rejects legacy entry reviews when the selected card is not due', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-03-06T08:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'campana',
      translation: 'bell',
      example: 'La campana suena.',
    }, fixedNow);

    reviewLegacyVocabularyEntry(db, 1, entry.id, { quality: 2 }, fixedNow);

    assert.throws(
      () => reviewLegacyVocabularyEntry(db, 1, entry.id, { quality: 3, direction: 'source_to_target' }, fixedNow),
      {
        message: 'Review card is not currently due for review.',
        status: 409,
        code: 'CARD_NOT_DUE',
      },
    );

    db.close();
  });

  it('excludes blank-translation legacy entries from both due stats and queue', () => {
    const db = createTestDb();
    db.prepare(`
      INSERT INTO vocabulary (word, translation, example, level, next_review, review_count, last_reviewed, profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sin traducción', '', 'Fila migrada.', 2, '2030-01-01T00:00:00.000Z', 3, '2030-01-01T00:00:00.000Z', 1);

    ensureVocabularyReviewSchema(db);

    const fixedNow = new Date('2030-03-07T09:00:00.000Z');
    const vocabulary = listVocabularyEntries(db, 1, fixedNow);
    const queue = listDueReviewCards(db, 1, { now: fixedNow });

    assert.equal(vocabulary.stats.due_cards, 0);
    assert.equal(vocabulary.stats.pending_completion_entries, 1);
    assert.equal(vocabulary.stats.unreviewable_cards, 2);
    assert.equal(queue.stats.total_due, 0);
    assert.equal(queue.cards.length, 0);
    assert.equal(listLegacyDueVocabularyWords(db, 1, fixedNow).length, 0);
    assert.equal(vocabulary.entries[0].needs_completion, true);
    assert.equal(vocabulary.entries[0].card_summary.unreviewable_cards, 2);

    db.close();
  });

  it('deleting an entry cascades to review cards', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-04-01T12:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'libro',
      translation: 'book',
      example: 'Leo un libro.',
    }, fixedNow);

    const cardCountBeforeDelete = db.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_cards').get().count;
    assert.equal(cardCountBeforeDelete, 2);

    deleteVocabularyEntry(db, 1, entry.id);

    const cardCountAfterDelete = db.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_cards').get().count;
    const vocabCountAfterDelete = db.prepare('SELECT COUNT(*) AS count FROM vocabulary').get().count;

    assert.equal(cardCountAfterDelete, 0);
    assert.equal(vocabCountAfterDelete, 0);

    db.close();
  });

  it('rejects learned actions for cards that are already suppressed or otherwise not due', () => {
    const db = createTestDb();
    ensureVocabularyReviewSchema(db);
    const fixedNow = new Date('2030-04-01T12:00:00.000Z');
    createVocabularyEntry(db, 1, {
      word: 'sol',
      translation: 'sun',
      example: 'El sol brilla.',
    }, fixedNow);

    const dueCard = listDueReviewCards(db, 1, { now: fixedNow }).cards[0];
    const learnedCard = markVocabularyCardLearned(db, 1, dueCard.id, fixedNow);

    assert.ok(learnedCard.learned_until);
    assert.throws(
      () => markVocabularyCardLearned(db, 1, dueCard.id, fixedNow),
      {
        message: 'Review card is not currently due for review.',
        status: 409,
        code: 'CARD_NOT_DUE',
      },
    );

    const storedCard = db.prepare(
      'SELECT learned_until, review_count FROM vocabulary_review_cards WHERE id = ?'
    ).get(dueCard.id);
    assert.equal(storedCard.review_count, 1);
    assert.equal(storedCard.learned_until, learnedCard.learned_until);

    db.close();
  });
});
