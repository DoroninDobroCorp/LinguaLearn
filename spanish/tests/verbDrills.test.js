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
  DRILL_PRONOUN_MODES,
  FOUR_KEY_VERB_KEYS,
} from '../src/utils/verbDrills.js';

const byInfinitive = Object.fromEntries(REGULAR_VERBS.map((verb) => [verb.infinitive, verb]));

describe('verb drill helpers', () => {
  it('has a broad fixed bank for ser vs estar context practice', () => {
    assert.ok(SER_ESTAR_CONTEXTS.length >= 40);
    assert.ok(SER_ESTAR_CONTEXTS.some((example) => example.verb === 'ser'));
    assert.ok(SER_ESTAR_CONTEXTS.some((example) => example.verb === 'estar'));
    assert.ok(SER_ESTAR_CONTEXTS.every((example) => example.sentence.includes('___')));
    assert.ok(SER_ESTAR_CONTEXTS.some((example) => example.pronounId === 'tu'));
  });

  it('conjugates the top regular verbs in present tense including standard tú and vos', () => {
    assert.equal(conjugateVerb('regular', byInfinitive.hablar, 'yo'), 'hablo');
    assert.equal(conjugateVerb('regular', byInfinitive.hablar, 'tu'), 'hablas');
    assert.equal(conjugateVerb('regular', byInfinitive.trabajar, 'vos'), 'trabajás');
    assert.equal(conjugateVerb('regular', byInfinitive.trabajar, 'tu'), 'trabajas');
    assert.equal(conjugateVerb('regular', byInfinitive.estudiar, 'el'), 'estudia');
    assert.equal(conjugateVerb('regular', byInfinitive.comprar, 'nosotros'), 'compramos');
    assert.equal(conjugateVerb('regular', byInfinitive.llamar, 'ellos'), 'llaman');
    assert.equal(conjugateVerb('regular', byInfinitive.comer, 'yo'), 'como');
    assert.equal(conjugateVerb('regular', byInfinitive.comer, 'tu'), 'comes');
    assert.equal(conjugateVerb('regular', byInfinitive.aprender, 'ellos'), 'aprenden');
    assert.equal(conjugateVerb('regular', byInfinitive.vivir, 'nosotros'), 'vivimos');
    assert.equal(conjugateVerb('regular', byInfinitive.vivir, 'tu'), 'vives');
    assert.equal(conjugateVerb('regular', byInfinitive.escribir, 'vos'), 'escribís');
    assert.equal(conjugateVerb('regular', byInfinitive.escribir, 'tu'), 'escribes');
  });

  it('conjugates ser, estar, tener, and ir separately for all forms including tú and vos', () => {
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'yo'), 'soy');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'tu'), 'eres');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'vos'), 'sos');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'nosotros'), 'somos');
    assert.equal(conjugateVerb('ser', { infinitive: 'ser' }, 'ellos'), 'son');

    assert.equal(conjugateVerb('estar', { infinitive: 'estar' }, 'yo'), 'estoy');
    assert.equal(conjugateVerb('estar', { infinitive: 'estar' }, 'tu'), 'estás');
    assert.equal(conjugateVerb('estar', { infinitive: 'estar' }, 'vos'), 'estás');

    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'yo'), 'tengo');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'tu'), 'tienes');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'vos'), 'tenés');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'el'), 'tiene');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'nosotros'), 'tenemos');
    assert.equal(conjugateVerb('tener', { infinitive: 'tener' }, 'ellos'), 'tienen');

    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'yo'), 'voy');
    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'tu'), 'vas');
    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'vos'), 'vas');
    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'el'), 'va');
    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'nosotros'), 'vamos');
    assert.equal(conjugateVerb('ir', { infinitive: 'ir' }, 'ellos'), 'van');
  });

  it('generates questions from fourKeyVerbs mode covering all 4 irregular verbs', () => {
    const verbsSeen = new Set();
    for (let i = 0; i < 50; i++) {
      const q = createVerbDrillQuestion('fourKeyVerbs', 'all');
      assert.equal(q.drillType, 'fourKeyVerbs');
      assert.ok(FOUR_KEY_VERB_KEYS.includes(q.subDrillType));
      assert.ok(FOUR_KEY_VERB_KEYS.includes(q.verb));
      assert.ok(q.correctAnswer);
      assert.ok(isVerbDrillAnswerCorrect(q.correctAnswer, q));
      verbsSeen.add(q.verb);
    }
    assert.equal(verbsSeen.size, 4);
    assert.ok(verbsSeen.has('ser'));
    assert.ok(verbsSeen.has('estar'));
    assert.ok(verbsSeen.has('tener'));
    assert.ok(verbsSeen.has('ir'));
  });

  it('checks answers case-insensitively and tolerates missing accent marks', () => {
    assert.equal(isVerbDrillAnswerCorrect(' ESTAS ', 'estás'), true);
    assert.equal(isVerbDrillAnswerCorrect('manana', 'mañana'), true);
    assert.equal(isVerbDrillAnswerCorrect('soy', 'somos'), false);
  });

  it('accepts either the verb form or the pronoun plus verb form for tú and vos', () => {
    const questionVos = {
      correctAnswer: 'estudiás',
      pronounAliases: ['vos'],
    };
    assert.deepEqual(
      getVerbDrillAcceptedAnswers(questionVos),
      ['estudias', 'vos estudias'],
    );
    assert.equal(isVerbDrillAnswerCorrect('estudiás', questionVos), true);
    assert.equal(isVerbDrillAnswerCorrect('vos estudiás', questionVos), true);
    assert.equal(isVerbDrillAnswerCorrect('yo estudiás', questionVos), false);

    const questionTu = {
      correctAnswer: 'hablas',
      pronounAliases: ['tú', 'tu'],
    };
    assert.equal(isVerbDrillAnswerCorrect('hablas', questionTu), true);
    assert.equal(isVerbDrillAnswerCorrect('tú hablas', questionTu), true);
    assert.equal(isVerbDrillAnswerCorrect('tu hablas', questionTu), true);

    const questionIr = {
      correctAnswer: 'voy',
      pronounAliases: ['yo'],
    };
    assert.equal(isVerbDrillAnswerCorrect('voy', questionIr), true);
    assert.equal(isVerbDrillAnswerCorrect('yo voy', questionIr), true);
  });

  it('shows the correction with the prompt pronoun included', () => {
    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'vivís',
      pronounAliases: ['vos'],
    }), 'vos vivís');

    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'vives',
      pronounAliases: ['tú', 'tu'],
    }), 'tú vives');

    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'estudian',
      pronounAliases: ['ellos', 'ellas', 'ustedes'],
    }), 'ellos estudian');

    assert.equal(getVerbDrillDisplayAnswer({
      correctAnswer: 'vamos',
      pronounAliases: ['nosotros', 'nosotras'],
    }), 'nosotros vamos');
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

  it('filters pronouns when pronounMode is specified', () => {
    for (let i = 0; i < 20; i++) {
      const questionTu = createVerbDrillQuestion('regular', 'tu');
      assert.notEqual(questionTu.pronounId, 'vos');

      const questionVos = createVerbDrillQuestion('regular', 'vos');
      assert.notEqual(questionVos.pronounId, 'tu');

      const question2nd = createVerbDrillQuestion('regular', 'second_person_only');
      assert.ok(question2nd.pronounId === 'tu' || question2nd.pronounId === 'vos');
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
    assert.equal(getVerbDrillProgressTopic({ drillType: 'ir' }), 'Present tense irregular verbs (ir/hacer/decir)');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'fourKeyVerbs', subDrillType: 'ir' }), 'Present tense irregular verbs (ir/hacer/decir)');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'fourKeyVerbs', subDrillType: 'tener' }), 'Tener (to have) and tener expressions');
    assert.equal(getVerbDrillProgressTopic({ drillType: 'fourKeyVerbs', subDrillType: 'ser' }), 'Ser vs Estar (basic)');
  });
});
