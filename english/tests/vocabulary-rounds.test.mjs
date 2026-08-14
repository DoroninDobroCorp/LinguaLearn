import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabularyRound } from '../src/utils/vocabularyRounds.js';

const words = [
  { id: 1, word: 'one', is_favorite: 1, learned_permanently_at: null },
  { id: 2, word: 'two', is_favorite: 0, learned_permanently_at: null },
  { id: 3, word: 'three', is_favorite: 1, learned_permanently_at: null },
  { id: 4, word: 'four', is_favorite: 1, learned_permanently_at: '2030-01-01T00:00:00.000Z' },
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

test('due round is deduplicated and excludes permanently learned words', () => {
  const round = buildVocabularyRound(words, 'due', [words[1], words[1], words[3]], () => 0.5);
  assert.deepEqual(round.map((word) => word.id), [2]);
});
