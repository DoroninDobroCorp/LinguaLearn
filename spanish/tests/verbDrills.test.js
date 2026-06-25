import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  conjugateVerb,
  createVerbDrillQuestion,
  getVerbDrillAcceptedAnswers,
  getVerbDrillDisplayAnswer,
  getVerbDrillProgressTopic,
  isVerbDrillAnswerCorrect,
  isVerbDrillFinished,
  REGULAR_VERBS,
  SER_ESTAR_CONTEXTS,
} from '../src/utils/verbDrills.js';

const byInfinitive = Object.fromEntries(REGULAR_VERBS.map((verb) => [verb.infinitive, verb]));

describe('verb drill helpers', () => {
  it('has a broad fixed bank for ser vs estar context practice', () => {
    assert.ok(SER_ESTAR_CONTEXTS.length >= 40);
    assert.ok(SER_ESTAR_CONTEXTS.some((example) => example.verb === 'ser'));
    assert.ok(SER_ESTAR_CONTEXTS.some((example) => example.verb === 'estar'));
    assert.ok(SER_ESTAR_CONTEXTS.every((example) => example.sentence.includes('___')));
  });

  it('conjugates the top regular verbs in present tense', () => {
    assert.equal(conjugateVerb('regular', byInfinitive.hablar, 'yo'), 'hablo');
    assert.equal(conjugateVerb('regular', byInfinitive.trabajar, 'vos'), 'trabajás');
    assert.equal(conjugateVerb('regular', byInfinitive.estudiar, 'el'), 'estudia');
    assert.equal(conjugateVerb('regular', byInfinitive.comprar, 'nosotros'), 'compramos');
    assert.equal(conjugateVerb('regular', byInfinitive.llamar, 'ellos'), 'llaman');
    assert.equal(conjugateVerb('regular', byInfinitive.comer, 'yo'), 'como');
    assert.equal(conjugateVerb('regular', byInfinitive.aprender, 'ellos'), 'aprenden');
    assert.equal(conjugateVerb('regular', byInfinitive.vivir, 'nosotros'), 'vivimos');
    assert.equal(conjugateVerb('regular', byInfinitive.escribir, 'vos'), 'escribís');
  });

  it('conjugates ser and estar separately', () => {
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'yo'), 'soy');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'nosotros'), 'somos');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'ellos'), 'son');

    assert.equal(conjugateVerb('estar', { infinitive: 'estar' }, 'yo'), 'estoy');
    assert.equal(conjugateVerb('estar', { infinitive: 'estar' }, 'vos'), 'estás');

    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'yo'), 'tengo');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'vos'), 'tenés');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'el'), 'tiene');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'nosotros'), 'tenemos');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'ellos'), 'tienen');
  });

  it('checks answers case-insensitively and tolerates missing accent marks', () => {
    assert.equal(isVerbDrillAnswerCorrect(' ESTAS ', 'estás'), true);
    assert.equal(isVerbDrillAnswerCorrect('manana', 'mañana'), true);
    assert.equal(isVerbDrillAnswerCorrect('soy', 'somos'), false);
  });

  it('accepts either the verb form or the pronoun plus verb form', () => {
    const question = {
      correctAnswer: 'estudiás',
      pronounAliases: ['vos'],
    };

    assert.deepEqual(
      getVerbDrillAcceptedAnswers(question),
      ['estudiás', 'vos estudiás'],
    );
    assert.equal(isVerbDrillAnswerCorrect('estudiás', question), true);
    assert.equal(isVerbDrillAnswerCorrect('vos estudiás', question), true);
    assert.equal(isVerbDrillAnswerCorrect('yo estudiás', question), false);
  });

  it('shows the correction with the prompt pronoun included', () => {
    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'vivís',
      pronounAliases: ['vos'],
    }), 'vos vivís');

    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'estudian',
      pronounAliases: ['ellos', 'ellas', 'ustedes'],
    }), 'ellos estudian');
  });

  it('accepts every displayed compound pronoun option when included in the answer', () => {
    assert.equal(isVerbDrillAnswerCorrect('ella estudia', {
      correctAnswer: 'estudia',
      pronounAliases: ['él', 'el', 'ella', 'usted'],
    }), true);
    assert.equal(isVerbDrillAnswerCorrect('nosotras estudiamos', {
      correctAnswer: 'estudiamos',
      pronounAliases: ['nosotros', 'nosotras'],
    }), true);
    assert.equal(isVerbDrillAnswerCorrect('ustedes estudian', {
      correctAnswer: 'estudian',
      pronounAliases: ['ellos', 'ellas', 'ustedes'],
    }), true);
  });

  it('creates ser vs estar questions from context examples', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const question = createVerbDrillQuestion('serEstar');
      assert.equal(question.prompt, 'Yo ___ estudiante.');
      assert.equal(question.correctAnswer, 'soy');
      assert.equal(getVerbDrillDisplayAnswer(question), 'Yo soy estudiante.');
      assert.equal(isVerbDrillAnswerCorrect('soy', question), true);
      assert.equal(isVerbDrillAnswerCorrect('yo soy', question), true);
      assert.equal(isVerbDrillAnswerCorrect('Yo soy estudiante', question), true);
      assert.equal(isVerbDrillAnswerCorrect('estoy', question), false);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('stops only the finite 10-task mode after ten completed answers', () => {
    assert.equal(isVerbDrillFinished('ten', 9), false);
    assert.equal(isVerbDrillFinished('ten', 10), true);
    assert.equal(isVerbDrillFinished('infinite', 100), false);
  });

  it('maps drill questions to existing curriculum topics', () => {
    assert.equal(
      getVerbDrillProgressTopic({ drillType: 'regular', ending: 'ar' }),
      'Present tense regular -ar verbs',
    );
    assert.equal(
      getVerbDrillProgressTopic({ drillType: 'regular', ending: 'er' }),
      'Present tense regular -er/-ir verbs',
    );
    assert.equal(
      getVerbDrillProgressTopic({ drillType: 'regular', ending: 'ir' }),
      'Present tense regular -er/-ir verbs',
    );
    assert.equal(getVerbDrillProgressTopic({ drillType: 'ser' }), 'Ser vs Estar (basic)');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'estar' }), 'Ser vs Estar (basic)');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'serEstar' }), 'Ser vs Estar (basic)');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'tener' }), 'Tener (to have) and tener expressions');
  });
});
