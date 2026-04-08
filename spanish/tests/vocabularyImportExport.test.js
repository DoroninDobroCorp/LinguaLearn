import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  createVocabularyEntry,
  ensureVocabularyReviewSchema,
  exportVocabularyArchive,
  importVocabularyArchive,
  listVocabularyEntries,
  listDueReviewCards,
  markVocabularyCardLearned,
  reviewVocabularyCard,
} from '../server/vocabularyReview.js';
import { ensureVocabularyExactDuplicateIndex } from '../server/vocabularyUniquenessMigration.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  ensureVocabularyReviewSchema(db);
  return db;
}

describe('Vocabulary import/export', () => {
  it('exports review-card state and restores it into another profile', () => {
    const db = createTestDb();
    const fixedNow = new Date('2030-06-01T09:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'mar',
      translation: 'sea',
      example: 'El mar está tranquilo.',
    }, fixedNow);

    const sourceCard = entry.cards.find((card) => card.direction === 'source_to_target');
    const reverseCard = entry.cards.find((card) => card.direction === 'target_to_source');
    reviewVocabularyCard(db, 1, sourceCard.id, 'good', fixedNow);
    markVocabularyCardLearned(db, 1, reverseCard.id, fixedNow);

    const exported = exportVocabularyArchive(db, { id: 1, name: 'Default', avatar_emoji: '👤' }, fixedNow);
    const summary = importVocabularyArchive(db, 2, exported, fixedNow);

    assert.equal(summary.created_entries, 1);
    assert.equal(summary.merged_entries, 0);

    const importedEntry = listVocabularyEntries(db, 2, fixedNow).entries[0];
    const importedSource = importedEntry.cards.find((card) => card.direction === 'source_to_target');
    const importedReverse = importedEntry.cards.find((card) => card.direction === 'target_to_source');

    assert.equal(importedSource.review_count, 1);
    assert.equal(importedSource.state, 'learning');
    assert.equal(importedReverse.review_count, 1);
    assert.equal(importedReverse.status, 'learned');
    assert.equal(listDueReviewCards(db, 2, { now: fixedNow }).cards.length, 0);

    db.close();
  });

  it('merges exact duplicates instead of duplicating entries on re-import', () => {
    const db = createTestDb();
    const firstNow = new Date('2030-06-02T09:00:00.000Z');
    const later = new Date('2030-06-03T09:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'rio',
      translation: 'river',
      example: '',
    }, firstNow);

    const sourceCard = entry.cards.find((card) => card.direction === 'source_to_target');
    reviewVocabularyCard(db, 1, sourceCard.id, 'good', later);
    reviewVocabularyCard(db, 1, entry.cards.find((card) => card.direction === 'target_to_source').id, 'easy', later);

    const exported = exportVocabularyArchive(db, { id: 1, name: 'Default', avatar_emoji: '👤' }, later);

    reviewVocabularyCard(db, 1, sourceCard.id, 'easy', new Date('2030-06-06T09:00:00.000Z'));

    exported.entries.push({
      ...exported.entries[0],
      example: 'Un río muy largo.',
    });

    const summary = importVocabularyArchive(db, 1, exported, later);
    const refreshedEntry = listVocabularyEntries(db, 1, new Date('2030-06-07T09:00:00.000Z')).entries[0];
    const refreshedSource = refreshedEntry.cards.find((card) => card.direction === 'source_to_target');

    assert.equal(summary.created_entries, 0);
    assert.equal(summary.merged_entries, 1);
    assert.equal(summary.payload_duplicates_merged, 1);
    assert.equal(listVocabularyEntries(db, 1, later).entries.length, 1);
    assert.equal(refreshedEntry.example, 'Un río muy largo.');
    assert.equal(refreshedSource.review_count, 2);

    db.close();
  });

  it('merges Unicode case-only duplicates during import while preserving accents', () => {
    const db = createTestDb();
    const fixedNow = new Date('2030-06-02T09:00:00.000Z');

    const summary = importVocabularyArchive(db, 1, {
      format: 'lingualearn-spanish-vocabulary',
      version: 1,
      exported_at: fixedNow.toISOString(),
      profile: { id: 9, name: 'Other', avatar_emoji: '🦊' },
      stats: {},
      entries: [
        {
          word: 'Árbol',
          translation: 'tree',
          example: 'Primero.',
          created_at: fixedNow.toISOString(),
          cards: {},
        },
        {
          word: 'árbol',
          translation: 'tree',
          example: 'Segundo.',
          created_at: fixedNow.toISOString(),
          cards: {},
        },
        {
          word: 'Arbol',
          translation: 'tree',
          example: 'Sin tilde.',
          created_at: fixedNow.toISOString(),
          cards: {},
        },
      ],
    }, fixedNow);

    assert.equal(summary.created_entries, 2);
    assert.equal(summary.payload_duplicates_merged, 1);
    assert.equal(listVocabularyEntries(db, 1, fixedNow).entries.length, 2);

    db.close();
  });

  it('neutralizes implausibly future imported review timestamps before merging', () => {
    const db = createTestDb();
    const fixedNow = new Date('2030-06-04T09:00:00.000Z');
    const entry = createVocabularyEntry(db, 1, {
      word: 'sol',
      translation: 'sun',
      example: '',
    }, fixedNow);

    const farFuture = '2099-01-01T00:00:00.000Z';
    const summary = importVocabularyArchive(db, 1, {
      format: 'lingualearn-spanish-vocabulary',
      version: 1,
      exported_at: fixedNow.toISOString(),
      profile: { id: 9, name: 'Other', avatar_emoji: '🦊' },
      stats: {},
      entries: [
        {
          word: 'sol',
          translation: 'sun',
          example: 'Sale por el este.',
          created_at: farFuture,
          cards: {
            source_to_target: {
              direction: 'source_to_target',
              state: 'review',
              review_count: 5,
              lapse_count: 0,
              interval_days: 2,
              ease_factor: 2.6,
              next_review_at: farFuture,
              learned_until: null,
              last_reviewed_at: farFuture,
              created_at: farFuture,
              updated_at: farFuture,
            },
            target_to_source: {
              direction: 'target_to_source',
              state: 'review',
              review_count: 3,
              lapse_count: 0,
              interval_days: 15,
              ease_factor: 2.4,
              next_review_at: farFuture,
              learned_until: farFuture,
              last_reviewed_at: farFuture,
              created_at: farFuture,
              updated_at: farFuture,
            },
          },
        },
      ],
    }, fixedNow);

    const importedEntry = listVocabularyEntries(db, 1, fixedNow).entries.find((item) => item.word === 'sol');
    const importedSource = importedEntry.cards.find((card) => card.direction === 'source_to_target');
    const importedReverse = importedEntry.cards.find((card) => card.direction === 'target_to_source');
    const sourceDueAt = new Date(importedSource.next_review_at).getTime();
    const reverseLearnedUntil = new Date(importedReverse.learned_until).getTime();
    const maxMetadataFuture = fixedNow.getTime() + (2 * MS_PER_DAY);

    assert.equal(summary.merged_entries, 1);
    assert.equal(summary.updated_cards, 2);
    assert.equal(importedSource.review_count, 5);
    assert.equal(importedReverse.review_count, 3);
    assert.equal(importedEntry.example, 'Sale por el este.');
    assert.ok(new Date(importedSource.last_reviewed_at).getTime() <= maxMetadataFuture);
    assert.ok(new Date(importedSource.updated_at).getTime() <= maxMetadataFuture);
    assert.ok(sourceDueAt <= fixedNow.getTime() + (4 * MS_PER_DAY));
    assert.ok(reverseLearnedUntil <= fixedNow.getTime() + (17 * MS_PER_DAY));
    assert.equal(
      listDueReviewCards(db, 1, { now: new Date(fixedNow.getTime() + (5 * MS_PER_DAY)) }).cards
        .some((card) => card.id === importedSource.id),
      true,
    );
    assert.equal(
      listDueReviewCards(db, 1, { now: new Date(fixedNow.getTime() + (18 * MS_PER_DAY)) }).cards
        .some((card) => card.id === importedReverse.id),
      true,
    );

    db.close();
  });
});
