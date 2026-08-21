import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import { A1_SKILL_TASKS } from '../server/a1SkillTasksData.js';
import { evaluateObjectiveTask, publicA1SkillTask } from '../server/a1SkillEvaluator.js';

describe('A1 skill assessment integrity', () => {
  it('does not expose answer keys before an objective assessment is submitted', () => {
    const task = A1_SKILL_TASKS.reading[0];
    const publicTask = publicA1SkillTask(task);
    assert.ok(publicTask.questions.every((question) => question.correctIndex === undefined));
    assert.ok(publicTask.questions.every((question) => question.explanation === undefined));
    const listeningTask = publicA1SkillTask(A1_SKILL_TASKS.listening[0]);
    assert.equal(listeningTask.transcript, undefined);
  });

  it('scores objective answers against the canonical server task', () => {
    const task = A1_SKILL_TASKS.listening[0];
    const correct = task.questions.map((question) => question.correctIndex);
    const result = evaluateObjectiveTask(task, correct);
    assert.equal(result.score, 100);
    assert.equal(result.passed, true);
    const wrong = evaluateObjectiveTask(task, correct.map((index) => (index + 1) % 4));
    assert.ok(wrong.score < 70);
    assert.equal(wrong.passed, false);
  });

  it('contains no timer-only recorder or hard-coded productive score in the A1 UI', () => {
    const skillsSource = fs.readFileSync(new URL('../src/components/A1SkillsView.jsx', import.meta.url), 'utf8');
    const checkpointsSource = fs.readFileSync(new URL('../src/components/A1CheckpointsView.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(skillsSource, /calculatedScore\s*=\s*88|setTimeout\([^)]*5000/);
    assert.doesNotMatch(checkpointsSource, /score:\s*Math\.min|passed:\s*true/);
    assert.match(skillsSource, /useSpeechPractice/);
    assert.match(skillsSource, /\/evaluate/);
  });
});
