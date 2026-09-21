import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReviewProgression,
  writeOfflineVocabularyCache,
  readOfflineVocabularyCacheSync,
  applyOfflineReview,
  applyOfflineLearned,
  applyOfflineFavorite,
  applyOfflineAddWord,
  applyOfflineDeleteWord,
  getOfflineMutations,
  clearOfflineMutations,
  syncOfflineMutations,
  saveOfflineStudySession,
  loadOfflineStudySession,
  resetMemoryCacheForTesting,
} from '../src/utils/offlineVocabularyCache.js';

test.beforeEach(() => {
  resetMemoryCacheForTesting();
});

test('calculateReviewProgression computes SM-2 levels and intervals accurately', () => {
  // Quality 0 (Forgot): level reset to 0, next_review in 0 days (due immediately)
  const q0 = calculateReviewProgression(3, 0);
  assert.equal(q0.newLevel, 0);
  assert.equal(q0.daysAdded, 0);

  // Quality 1 (Hard): +0.5
  const q1 = calculateReviewProgression(1, 1);
  assert.equal(q1.newLevel, 1.5);
  assert.equal(q1.daysAdded, 1);

  // Quality 2 (Good): +1
  const q2 = calculateReviewProgression(2, 2);
  assert.equal(q2.newLevel, 3);
  assert.equal(q2.daysAdded, 3);

  // Quality 3 (Easy): +2, capped at 5
  const q3 = calculateReviewProgression(4, 3);
  assert.equal(q3.newLevel, 5);
  assert.equal(q3.daysAdded, 7);
});

test('offline review updates word progress and enqueues sync mutation', () => {
  const initialWord = {
    id: 101,
    word: 'ubiquitous',
    translation: 'вездесущий',
    level: 1,
    review_count: 2,
    next_review: '2026-09-01T00:00:00.000Z',
    learned_permanently_at: null,
  };

  writeOfflineVocabularyCache({
    words: [initialWord],
    dueWords: [initialWord],
    groups: [],
    userId: 42,
  });

  const res = applyOfflineReview({ wordId: 101, quality: 2 }, 42);
  assert.ok(res);
  assert.equal(res.word.level, 2);
  assert.equal(res.word.review_count, 3);
  assert.ok(res.word.last_reviewed);

  // Check cached state
  const cached = readOfflineVocabularyCacheSync(42);
  assert.equal(cached.words[0].level, 2);
  assert.equal(cached.words[0].review_count, 3);

  // Check mutation queue
  const mutations = getOfflineMutations(42);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].type, 'REVIEW_WORD');
  assert.equal(mutations[0].wordId, 101);
  assert.equal(mutations[0].quality, 2);
});

test('offline toggle learned permanently updates cache and enqueues mutation', () => {
  const word = { id: 202, word: 'ephemeral', translation: 'эфемерный', learned_permanently_at: null };
  writeOfflineVocabularyCache({ words: [word], dueWords: [word], userId: 42 });

  applyOfflineLearned(202, true, 42);

  const cached = readOfflineVocabularyCacheSync(42);
  assert.ok(cached.words[0].learned_permanently_at);
  assert.equal(cached.dueWords.length, 0);

  const mutations = getOfflineMutations(42);
  const learnedMut = mutations.find((m) => m.type === 'LEARNED_WORD');
  assert.ok(learnedMut);
  assert.equal(learnedMut.wordId, 202);
  assert.equal(learnedMut.learnedPermanently, true);
});

test('offline toggle favorite updates cache and enqueues mutation', () => {
  const word = { id: 303, word: 'serendipity', translation: 'счастливая случайность', is_favorite: 0 };
  writeOfflineVocabularyCache({ words: [word], dueWords: [], userId: 42 });

  applyOfflineFavorite(303, true, 42);

  const cached = readOfflineVocabularyCacheSync(42);
  assert.equal(cached.words[0].is_favorite, 1);

  const mutations = getOfflineMutations(42);
  const favMut = mutations.find((m) => m.type === 'FAVORITE_WORD');
  assert.ok(favMut);
  assert.equal(favMut.wordId, 303);
  assert.equal(favMut.isFavorite, true);
});

test('offline add and delete word updates cache and enqueues mutations', () => {
  writeOfflineVocabularyCache({ words: [], dueWords: [], userId: 42 });

  const added = applyOfflineAddWord({ word: 'luminary', translation: 'светило' }, 42);
  assert.ok(added);
  assert.ok(added.word.id < 0);
  assert.equal(added.word.word, 'luminary');

  let cached = readOfflineVocabularyCacheSync(42);
  assert.equal(cached.words.length, 1);

  // Deleting the newly added offline word before sync cancels the add mutation
  applyOfflineDeleteWord(added.word.id, 42);
  cached = readOfflineVocabularyCacheSync(42);
  assert.equal(cached.words.length, 0);

  const mutations = getOfflineMutations(42);
  assert.equal(mutations.length, 0);
});

test('offline study session saves and restores queue position', async () => {
  const session = { mode: 'due', queueIds: [10, 20, 30], roundTotal: 5 };
  await saveOfflineStudySession('due', session, { id: 10, word: 'ten' }, 42);

  const loaded = await loadOfflineStudySession('due', 42);
  assert.ok(loaded);
  assert.equal(loaded.mode, 'due');
  assert.deepEqual(loaded.session.queueIds, [10, 20, 30]);
  assert.equal(loaded.session.roundTotal, 5);
  assert.equal(loaded.currentWord.word, 'ten');
});

test('syncOfflineMutations synchronizes pending reviews and clears queue', async () => {
  clearOfflineMutations(42);
  const word = { id: 505, word: 'tenacious', level: 0 };
  writeOfflineVocabularyCache({ words: [word], userId: 42 });

  applyOfflineReview({ wordId: 505, quality: 3 }, 42);
  assert.equal(getOfflineMutations(42).length, 1);

  const mockCalls = [];
  const customFetch = async (url, opts) => {
    mockCalls.push({ url, body: JSON.parse(opts.body) });
    return {
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    };
  };

  const result = await syncOfflineMutations(42, customFetch);
  assert.equal(result.synced, 1);
  assert.equal(result.remaining, 0);
  assert.equal(getOfflineMutations(42).length, 0);

  assert.equal(mockCalls.length, 1);
  assert.equal(mockCalls[0].url, '/english/api/vocabulary/505/review');
  assert.equal(mockCalls[0].body.quality, 3);
});
