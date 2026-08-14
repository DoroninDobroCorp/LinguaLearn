import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnceEachChoices } from '../src/utils/vocabularyRounds.js';

test('once-each snapshot keeps one form per unique vocabulary entry', () => {
  const entries = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }];
  const choices = buildOnceEachChoices(entries, (entry) => [`${entry.id}-front`, `${entry.id}-reverse`], () => 0.9);
  assert.equal(choices.length, 3);
  assert.deepEqual(choices.map(({ entry }) => entry.id), [1, 2, 3]);
  assert.deepEqual(choices.map(({ variant }) => variant), ['1-reverse', '2-reverse', '3-reverse']);
});

test('once-each snapshot skips entries that have no reviewable form', () => {
  const choices = buildOnceEachChoices([{ id: 1 }, { id: 2 }], (entry) => entry.id === 1 ? ['front'] : []);
  assert.deepEqual(choices.map(({ entry }) => entry.id), [1]);
});
