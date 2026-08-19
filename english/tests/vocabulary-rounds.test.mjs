import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabularyRound, restoreVocabularyRound } from '../src/utils/vocabularyRounds.js';

const words = [
  { id: 1, word: 'one', is_favorite: 1, group_ids: [10], learned_permanently_at: null },
  { id: 2, word: 'two', is_favorite: 0, group_ids: [10, 20], learned_permanently_at: null },
  { id: 3, word: 'three', is_favorite: 1, group_ids: [20], learned_permanently_at: null },
  { id: 4, word: 'four', is_favorite: 1, group_ids: [10], learned_permanently_at: '2030-01-01T00:00:00.000Z' },
];

test('all-words round contains each active word exactly once', () => {
  const round = buildVocabularyRound([...words, words[0]], 'once_all', [], () => 0.2);
  assert.deepEqual(new Set(round.map((word) => word.id)), new Set([1, 2, 3]));
  assert.equal(round.length, 3);
});

test('favorites round excludes non-favorites and permanently learned words', () => {
  const round = buildVocabularyRound(words, 'favorites', [], () => 0.5);
  assert.deepEqual(new Set(round.map((word) => word.id)), new Set([1, 3]));
  assert.equal(round.length, 2);
});

test('group round includes only active words belonging to specified group', () => {
  const round = buildVocabularyRound(words, 'group:10', [], () => 0.5);
  assert.deepEqual(new Set(round.map((word) => word.id)), new Set([1, 2]));
  assert.equal(round.length, 2);
});

test('due round is deduplicated and excludes permanently learned words', () => {
  const round = buildVocabularyRound(words, 'due', [words[1], words[1], words[3]], () => 0.5);
  assert.deepEqual(round.map((word) => word.id), [2]);
});

test('saved once-each queue resumes in the same order after a reload', () => {
  const restored = restoreVocabularyRound(words, { mode: 'once_all', queueIds: [3, 1], roundTotal: 4 });
  assert.deepEqual(restored.queue.map((word) => word.id), [3, 1]);
  assert.equal(restored.roundTotal, 4);
  assert.equal(restored.mode, 'once_all');
});

test('saved group queue resumes in the same order after a reload', () => {
  const restored = restoreVocabularyRound(words, { mode: 'group:10', queueIds: [2, 1], roundTotal: 2 });
  assert.deepEqual(restored.queue.map((word) => word.id), [2, 1]);
  assert.equal(restored.roundTotal, 2);
  assert.equal(restored.mode, 'group:10');
});

test('resume drops words learned forever or removed from favorites on another device', () => {
  const restored = restoreVocabularyRound(words, { mode: 'favorites', queueIds: [4, 3, 2, 99], roundTotal: 4 });
  assert.deepEqual(restored.queue.map((word) => word.id), [3]);
});
