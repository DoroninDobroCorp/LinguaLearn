import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOnceEachChoices,
  isReviewMistake,
  pickNextSessionCard,
  advanceReviewSession,
  removeEntryFromReviewSession,
  isEntryEligibleForLearnedStudy,
} from '../src/utils/vocabularyRounds.js';

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

test('isReviewMistake correctly identifies mistake grades without reference errors', () => {
  assert.equal(isReviewMistake('dont_know'), true);
  assert.equal(isReviewMistake('again'), true);
  assert.equal(isReviewMistake('hard'), true);
  assert.equal(isReviewMistake(1), true);

  assert.equal(isReviewMistake('good'), false);
  assert.equal(isReviewMistake('easy'), false);
  assert.equal(isReviewMistake(3), false);
  assert.equal(isReviewMistake(4), false);
});

test('advanceReviewSession advances to second card on successful review', () => {
  const sessionEntries = [
    {
      entryId: 101,
      word: 'hola',
      translation: 'привет',
      totalVariants: 1,
      remainingVariants: [{ key: 'v1', prompt: 'hola', answer: 'привет' }],
    },
    {
      entryId: 102,
      word: 'gracias',
      translation: 'спасибо',
      totalVariants: 1,
      remainingVariants: [{ key: 'v1', prompt: 'gracias', answer: 'спасибо' }],
    },
  ];

  const firstPick = pickNextSessionCard(sessionEntries, 'learned_once', null, () => 0);
  assert.equal(firstPick.entryId, 101);
  assert.equal(firstPick.card.id, 101);

  const initialSession = {
    mode: 'learned_once',
    entries: sessionEntries,
    totalEntries: 2,
    lap: 1,
    lastEntryId: 101,
    isComplete: false,
  };

  // Grade 'good': should remove 101's remainingVariant and advance to 102
  const next = advanceReviewSession(initialSession, firstPick.card, { repeatMistake: false, random: () => 0 });
  assert.equal(next.session.entries.length, 1);
  assert.equal(next.session.entries[0].entryId, 102);
  assert.ok(next.currentCard);
  assert.equal(next.currentCard.id, 102);
  assert.equal(next.currentCard.word, 'gracias');
  assert.equal(next.session.isComplete, false);

  // Complete second card
  const final = advanceReviewSession(next.session, next.currentCard, { repeatMistake: false, random: () => 0 });
  assert.equal(final.session.entries.length, 0);
  assert.equal(final.currentCard, null);
  assert.equal(final.session.isComplete, true);
});

test('advanceReviewSession repeats mistake card at end of round', () => {
  const sessionEntries = [
    {
      entryId: 201,
      word: 'perro',
      translation: 'собака',
      totalVariants: 1,
      remainingVariants: [{ key: 'v1', prompt: 'perro', answer: 'собака' }],
    },
    {
      entryId: 202,
      word: 'gato',
      translation: 'кот',
      totalVariants: 1,
      remainingVariants: [{ key: 'v1', prompt: 'gato', answer: 'кот' }],
    },
  ];

  const initialSession = {
    mode: 'learned_once',
    entries: sessionEntries,
    totalEntries: 2,
    lap: 1,
    lastEntryId: 201,
    isComplete: false,
  };

  const card1 = pickNextSessionCard(sessionEntries, 'learned_once', null, () => 0).card;
  assert.equal(card1.id, 201);

  // User rated card1 with 'hard' (repeatMistake: true)
  const afterMistake = advanceReviewSession(initialSession, card1, { repeatMistake: true, random: () => 0 });
  // Both entries still remain, but 201 is moved to the back, 202 is next!
  assert.equal(afterMistake.session.entries.length, 2);
  assert.equal(afterMistake.session.entries[0].entryId, 202);
  assert.equal(afterMistake.session.entries[1].entryId, 201);
  assert.equal(afterMistake.currentCard.id, 202);
  assert.equal(afterMistake.currentCard.word, 'gato');
});

test('isEntryEligibleForLearnedStudy accepts permanently learned words or all-learned cards', () => {
  const permanentlyLearned = {
    id: 1,
    learned_permanently_at: '2026-08-01T00:00:00.000Z',
    cards: [{ is_reviewable: true, status: 'review' }],
  };
  assert.equal(isEntryEligibleForLearnedStudy(permanentlyLearned), true);

  const regularActive = {
    id: 2,
    learned_permanently_at: null,
    cards: [{ is_reviewable: true, status: 'review' }],
  };
  assert.equal(isEntryEligibleForLearnedStudy(regularActive), false);

  const allCardsLearned = {
    id: 3,
    learned_permanently_at: null,
    cards: [
      { is_reviewable: true, status: 'learned' },
      { is_reviewable: true, status: 'learned' },
    ],
  };
  assert.equal(isEntryEligibleForLearnedStudy(allCardsLearned), true);
});
