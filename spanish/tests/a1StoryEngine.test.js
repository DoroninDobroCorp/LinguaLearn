import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerStoryQuestion,
  buildA1StoryAccess,
  buildSandwichStoryAccess,
  buildScenarioAccess,
} from '../server/a1StoryEngine.js';

const units = Array.from({ length: 9 }, (_, index) => ({
  id: `u${index + 1}`,
  topics: [{ phase: 'new' }, { phase: 'new' }],
}));
const course = () => ({ units: structuredClone(units) });
const story = {
  id: 'main',
  chapters: [1, 2, 3].map((order) => ({
    id: `c${order}`,
    unitId: `u${order}`,
    title: `Chapter ${order}`,
    text: `secret ${order}`,
    question: { prompt: '?', options: ['a', 'b'], correctIndex: 1, explanation: 'secret answer' },
    choices: order < 3 ? [{ id: `go${order}`, targetChapterId: `c${order + 1}` }] : [],
  })),
};

test('fresh learner cannot see story content or answer keys', () => {
  const result = buildA1StoryAccess(story, course(), {});
  assert.equal(result.access.isUnlocked, false);
  assert.equal(result.chapters[0].text, undefined);
  assert.equal(result.chapters[0].question, undefined);
});

test('chapter unlocks after unit introduction and previous completion', () => {
  const state = course();
  state.units[0].topics.forEach((topic) => { topic.phase = 'learning'; });
  state.units[1].topics.forEach((topic) => { topic.phase = 'review'; });
  let result = buildA1StoryAccess(story, state, {});
  assert.equal(result.chapters[0].access.isUnlocked, true);
  assert.equal(result.chapters[1].access.isUnlocked, false);
  assert.equal(result.chapters[0].question.correctIndex, undefined);
  assert.equal(result.chapters[0].question.explanation, undefined);
  result = buildA1StoryAccess(story, state, { completedChapters: ['c1'] });
  assert.equal(result.chapters[1].access.isUnlocked, true);
  assert.equal(result.access.nextChapterId, 'c2');
});

test('story unlock does not require mastery or a calendar delay', () => {
  const state = course();
  state.units[0].topics.forEach((topic) => { topic.phase = 'learning'; topic.masteryScore = 1; });
  assert.equal(buildA1StoryAccess(story, state, {}).chapters[0].access.isUnlocked, true);
});

test('bonus story waits until all A1 units are introduced', () => {
  const state = course();
  const bonus = { id: 'bonus', chapters: [{ id: 'root', title: 'Root', text: 'secret', choices: [] }] };
  assert.equal(buildA1StoryAccess(bonus, state, {}).access.isUnlocked, false);
  state.units.forEach((unit) => unit.topics.forEach((topic) => { topic.phase = 'learning'; }));
  assert.equal(buildA1StoryAccess(bonus, state, {}).access.isUnlocked, true);
});

test('sandwich chapters use the same gate and hide answers', () => {
  const state = course();
  state.units[0].topics.forEach((topic) => { topic.phase = 'learning'; });
  const sandwich = { id: 'sandwich', chapters: [
    { id: 's1', stationOrder: 1, titleRu: 'One', paragraphs: ['secret'], quickQuiz: { options: ['a'], correctIndex: 0, explanation: 'x' } },
    { id: 's2', stationOrder: 2, titleRu: 'Two', paragraphs: ['secret'], quickQuiz: { options: ['a'], correctIndex: 0 } },
  ] };
  const result = buildSandwichStoryAccess(sandwich, state, []);
  assert.equal(result.chapters[0].access.isUnlocked, true);
  assert.equal(result.chapters[0].quickQuiz.correctIndex, undefined);
  assert.equal(result.chapters[1].paragraphs, undefined);
});

test('AI roleplays unlock only after the corresponding unit introduction', () => {
  const state = course();
  state.units[0].topics.forEach((topic) => { topic.phase = 'learning'; });
  const scenarios = [
    { id: 'q1', title: 'One', systemPrompt: 'secret', initialMessage: 'hello' },
    { id: 'q2', title: 'Two', systemPrompt: 'secret', initialMessage: 'hello' },
  ];
  const result = buildScenarioAccess(scenarios, state, []);
  assert.equal(result[0].access.isUnlocked, true);
  assert.equal(result[0].systemPrompt, undefined);
  assert.equal(result[1].access.isUnlocked, false);
  assert.equal(result[1].initialMessage, undefined);
});

test('branching story exposes only the path the learner selected', () => {
  const state = course();
  state.units.forEach((unit) => unit.topics.forEach((topic) => { topic.phase = 'learning'; }));
  const branching = {
    id: 'branching',
    chapters: [
      { id: 'root', title: 'Root', choices: [
        { id: 'left-choice', targetChapterId: 'left' },
        { id: 'right-choice', targetChapterId: 'right' },
      ] },
      { id: 'left', title: 'Left', text: 'left secret' },
      { id: 'right', title: 'Right', text: 'right secret' },
    ],
  };
  const result = buildA1StoryAccess(branching, state, {
    completedChapters: ['root'],
    currentChapterId: 'right',
  });
  assert.equal(result.chapters.find((item) => item.id === 'right').access.isUnlocked, true);
  assert.equal(result.chapters.find((item) => item.id === 'left').access.isUnlocked, false);
  assert.equal(result.access.nextChapterId, 'right');
});

test('sandwich chapter can require later units when its content runs ahead', () => {
  const state = course();
  state.units.slice(0, 6).forEach((unit) => unit.topics.forEach((topic) => { topic.phase = 'learning'; }));
  const sandwich = { id: 'sandwich', chapters: [
    { id: 's1', stationOrder: 1, requiredUnitIds: ['u7'], titleRu: 'Food', quickQuiz: { options: ['a'], correctIndex: 0 } },
  ] };
  assert.equal(buildSandwichStoryAccess(sandwich, state, []).chapters[0].access.isUnlocked, false);
  state.units[6].topics.forEach((topic) => { topic.phase = 'learning'; });
  assert.equal(buildSandwichStoryAccess(sandwich, state, []).chapters[0].access.isUnlocked, true);
});

test('answer verification is server authoritative', () => {
  assert.equal(answerStoryQuestion({ correctIndex: 2 }, 2).isCorrect, true);
  assert.equal(answerStoryQuestion({ correctIndex: 2 }, 1).isCorrect, false);
});
