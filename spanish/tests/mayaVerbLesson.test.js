import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAYA_REGULAR_VERBS,
  ARGENTINE_PRONOUN_CARDS,
  PART2_REMAINING_PRONOUNS,
  buildMayaLessonQuiz,
  buildMayaPart2Quiz,
  conjugateMayaVerb,
  isMayaLessonAnswer,
} from '../src/utils/mayaVerbLesson.js';

describe('Maya regular-verb lesson (Part 1 & Part 2)', () => {
  it('only uses the regular verbs already in her deck', () => {
    const infinitives = MAYA_REGULAR_VERBS.map((verb) => verb.infinitive);
    assert.deepEqual(infinitives.sort(), [
      'ayudar', 'comer', 'comprar', 'correr', 'dibujar', 'entender',
      'escuchar', 'esperar', 'jugar', 'mirar', 'pintar', 'saltar',
    ].sort());
    assert.equal(infinitives.includes('querer'), false);
    assert.equal(infinitives.includes('tener'), false);
    assert.equal(infinitives.includes('vivir'), false);
  });

  it('builds Argentine pronoun conjugations across all persons', () => {
    const dibujar = MAYA_REGULAR_VERBS.find((verb) => verb.infinitive === 'dibujar');
    const comer = MAYA_REGULAR_VERBS.find((verb) => verb.infinitive === 'comer');

    // -AR endings
    assert.equal(conjugateMayaVerb(dibujar, 'yo'), 'dibujo');
    assert.equal(conjugateMayaVerb(dibujar, 'vos'), 'dibujás');
    assert.equal(conjugateMayaVerb(dibujar, 'ella'), 'dibuja');
    assert.equal(conjugateMayaVerb(dibujar, 'nosotros'), 'dibujamos');
    assert.equal(conjugateMayaVerb(dibujar, 'ustedes'), 'dibujan');
    assert.equal(conjugateMayaVerb(dibujar, 'ellos'), 'dibujan');

    // -ER endings
    assert.equal(conjugateMayaVerb(comer, 'yo'), 'como');
    assert.equal(conjugateMayaVerb(comer, 'vos'), 'comés');
    assert.equal(conjugateMayaVerb(comer, 'ella'), 'come');
    assert.equal(conjugateMayaVerb(comer, 'nosotros'), 'comemos');
    assert.equal(conjugateMayaVerb(comer, 'ustedes'), 'comen');
    assert.equal(conjugateMayaVerb(comer, 'ellos'), 'comen');
  });

  it('handles stem-preserving vos/nosotros vs diphthongs for jugar and entender', () => {
    const jugar = MAYA_REGULAR_VERBS.find((verb) => verb.infinitive === 'jugar');
    const entender = MAYA_REGULAR_VERBS.find((verb) => verb.infinitive === 'entender');

    assert.equal(conjugateMayaVerb(jugar, 'yo'), 'juego');
    assert.equal(conjugateMayaVerb(jugar, 'vos'), 'jugás');
    assert.equal(conjugateMayaVerb(jugar, 'ella'), 'juega');
    assert.equal(conjugateMayaVerb(jugar, 'nosotros'), 'jugamos');
    assert.equal(conjugateMayaVerb(jugar, 'ustedes'), 'juegan');

    assert.equal(conjugateMayaVerb(entender, 'yo'), 'entiendo');
    assert.equal(conjugateMayaVerb(entender, 'vos'), 'entendés');
    assert.equal(conjugateMayaVerb(entender, 'ella'), 'entiende');
    assert.equal(conjugateMayaVerb(entender, 'nosotros'), 'entendemos');
    assert.equal(conjugateMayaVerb(entender, 'ustedes'), 'entienden');
  });

  it('presents Argentine pronouns without Spain vosotros', () => {
    const pronounIds = ARGENTINE_PRONOUN_CARDS.map((card) => card.id);
    assert.deepEqual(pronounIds, ['yo', 'vos', 'ella', 'nosotros', 'ustedes']);
    assert.equal(pronounIds.includes('vosotros'), false);
  });

  it('focuses Part 2 exclusively on the remaining Argentine pronouns (not yo/vos)', () => {
    const part2Ids = PART2_REMAINING_PRONOUNS.map((c) => c.id);
    assert.deepEqual(part2Ids, ['ella', 'nosotros', 'ustedes']);

    const quiz = buildMayaPart2Quiz();
    assert.ok(quiz.length >= 10);
    const persons = new Set(quiz.map((q) => q.person));
    assert.equal(persons.has('yo'), false);
    assert.equal(persons.has('vos'), false);
    assert.ok(persons.has('ella'));
    assert.ok(persons.has('nosotros'));
    assert.ok(persons.has('ustedes'));
    assert.ok(persons.has('ellos'));
  });

  it('accepts answers with or without accents', () => {
    assert.equal(isMayaLessonAnswer('dibujamos', 'dibujamos'), true);
    assert.equal(isMayaLessonAnswer('comen', 'comen'), true);
    assert.equal(isMayaLessonAnswer('dibujas', 'dibujás'), true);
    assert.equal(isMayaLessonAnswer('DIBUJO', 'dibujo'), true);
  });
});
