import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampTopicScore,
  getTopicStage,
  getTopicStatusLabel,
  isTopicMastered,
  topicMatchesFilters,
} from '../src/utils/topicCatalog.js';

test('A1 phases are represented as real learning states', () => {
  const learning = { level: 'A1', status: 'learning', score: 24 };
  const review = { level: 'A1', status: 'review', score: 68 };
  const relearning = { level: 'A1', status: 'relearning', score: 41 };

  assert.equal(getTopicStage(learning), 'in_progress');
  assert.equal(getTopicStatusLabel(learning), 'Изучается');
  assert.equal(getTopicStatusLabel(review), 'На повторении');
  assert.equal(getTopicStatusLabel(relearning), 'Нужно повторить');
});

test('A1 mastery follows the certified phase instead of a raw score shortcut', () => {
  assert.equal(isTopicMastered({ level: 'A1', status: 'review', score: 99 }), false);
  assert.equal(isTopicMastered({ level: 'A1', status: 'mastered', score: 80 }), true);
});

test('legacy levels retain the existing score and lock mastery rules', () => {
  assert.equal(isTopicMastered({ level: 'B1', status: 'in_progress', score: 80 }), true);
  assert.equal(isTopicMastered({ level: 'C1', status: 'new', score: 0, is_locked: true }), true);
});

test('scores are rounded and constrained to a display-safe range', () => {
  assert.equal(clampTopicScore('63.7'), 64);
  assert.equal(clampTopicScore(-2), 0);
  assert.equal(clampTopicScore(140), 100);
  assert.equal(clampTopicScore('not-a-number'), 0);
});

test('catalog filtering combines category, status and text search', () => {
  const topic = {
    level: 'A1',
    category: 'Grammar',
    name: 'Настоящее время правильных глаголов',
    status: 'learning',
    score: 35,
  };

  assert.equal(topicMatchesFilters(topic, {
    category: 'Grammar',
    status: 'in_progress',
    search: 'глагол',
  }), true);
  assert.equal(topicMatchesFilters(topic, { category: 'Vocabulary' }), false);
  assert.equal(topicMatchesFilters(topic, { search: 'B2' }), false);
});
