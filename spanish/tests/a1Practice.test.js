import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  A1PracticeError,
  buildA1PracticeExercises,
  buildA1StarterVocabulary,
  findA1PracticeExercise,
  isA1PracticeAnswerCorrect,
  parseA1PracticeTopicIds,
  selectA1PracticeTopicIds,
} from '../server/a1Practice.js';

const course = {
  dueTopics: [{ topicId: 27 }],
  units: [
    {
      id: 'a1-u01-first-contact',
      topics: [
        { topicId: 27, name: 'Greetings and introductions (saludos)', phase: 'learning', masteryScore: 12 },
        { topicId: 7, name: 'Subject pronouns (yo/tú/vos/él/ella)', phase: 'new', masteryScore: 0 },
      ],
    },
    {
      id: 'a1-u07-food',
      topics: [
        { topicId: 29, name: 'Ordering food (pedir comida)', phase: 'new', masteryScore: 0 },
      ],
    },
  ],
};

describe('adaptive A1 practice selection', () => {
  it('selects only due material that the learner has already encountered', () => {
    assert.deepEqual(selectA1PracticeTopicIds(course), [27]);
    const exercises = buildA1PracticeExercises(course, [], { count: 50, random: () => 0.5 });
    assert.ok(exercises.length > 0);
    assert.ok(exercises.every((exercise) => exercise.topicId === 27));
    assert.ok(exercises.every((exercise) => exercise.topic.includes('Greetings')));
    assert.ok(exercises.every((exercise) => !('correctAnswer' in exercise)));
    assert.ok(exercises.every((exercise) => !('explanation' in exercise)));
  });

  it('rejects future topics even when a client asks for them explicitly', () => {
    assert.throws(
      () => buildA1PracticeExercises(course, [29]),
      (error) => error instanceof A1PracticeError
        && error.status === 403
        && error.code === 'A1_TOPIC_NOT_INTRODUCED',
    );
    assert.throws(() => findA1PracticeExercise(course, 29, 'ex-29-01'), A1PracticeError);
  });

  it('parses a bounded topic list and verifies normalized accepted answers', () => {
    assert.deepEqual(parseA1PracticeTopicIds('27,27, 7'), [27, 7]);
    assert.throws(() => parseA1PracticeTopicIds('27,food'), A1PracticeError);
    assert.equal(isA1PracticeAnswerCorrect({
      correctAnswer: 'Buenos días',
      acceptableAnswers: ['buenos dias'],
    }, '  ¡BUENOS DÍAS! '), true);
  });

  it('builds a topic-specific starter word set before a new lesson', () => {
    const words = buildA1StarterVocabulary(27, null, 10).map((item) => item.word.toLowerCase());
    assert.ok(words.includes('buenos días'));
    assert.ok(words.includes('me llamo'));
    assert.ok(!words.includes('cerveza'));
    assert.ok(!words.includes('café'));
  });
});
