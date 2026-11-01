import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  A1_UNITS,
  ensureA1CourseSchema,
  getA1CheckpointByUnit,
  getAllA1Checkpoints,
  recordA1CheckpointSubmission,
  checkpointTaskNeedsText,
} from '../server/a1CourseEngine.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE profiles (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO profiles VALUES (10, 'Nataliia');
    CREATE TABLE curriculum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT DEFAULT 'preset',
      pedagogical_order INTEGER
    );
    CREATE TABLE curriculum_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'not_started',
      score REAL DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_practiced TEXT,
      is_locked INTEGER DEFAULT 0,
      UNIQUE(topic_id, profile_id)
    );
    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      learned_permanently_at TEXT
    );
    CREATE TABLE vocabulary_review_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vocabulary_id INTEGER NOT NULL,
      profile_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      state TEXT NOT NULL,
      interval_days REAL NOT NULL,
      review_count INTEGER NOT NULL
    );
  `);
  const insert = db.prepare('INSERT INTO curriculum_topics (name, category, level, source, pedagogical_order) VALUES (?, ?, ?, ?, ?)');
  const names = [...new Set(A1_UNITS.flatMap((unit) => unit.topics))];
  names.forEach((name, index) => insert.run(name, name.includes('(') ? 'Grammar' : 'Vocabulary', 'A1', 'preset', index + 1));
  ensureA1CourseSchema(db);
  return db;
}

describe('A1 Checkpoints Submission and Flow', () => {
  it('identifies typed vs choice tasks accurately', () => {
    const cp = getA1CheckpointByUnit('a1-u01-first-contact');
    assert.ok(cp, 'Unit 1 checkpoint must exist');
    assert.equal(cp.tasks.length, 14, 'Unit 1 checkpoint has 14 tasks');

    const gapTask = cp.tasks.find((t) => t.id === 'chk-u01-02');
    assert.ok(gapTask, 'chk-u01-02 must exist');
    assert.equal(gapTask.type, 'gap');
    assert.equal(checkpointTaskNeedsText(gapTask), true);

    const choiceTask = cp.tasks.find((t) => t.id === 'chk-u01-01');
    assert.ok(choiceTask, 'chk-u01-01 must exist');
    assert.equal(choiceTask.type, 'choice');
    assert.equal(checkpointTaskNeedsText(choiceTask), false);

    const writingTask = cp.tasks.find((t) => t.id === 'chk-u01-14');
    assert.ok(writingTask, 'chk-u01-14 must exist');
    assert.equal(writingTask.type, 'productive_writing');
    assert.equal(checkpointTaskNeedsText(writingTask), false);
  });

  it('allows full checkpoint submission with text tasks and productive writing', () => {
    const db = createDb();
    const cp = getA1CheckpointByUnit('a1-u01-first-contact');
    const answers = [];

    for (const t of cp.tasks) {
      if (t.options) {
        answers.push({
          taskId: t.id,
          topicId: 1, // mapped topic in test db
          selected: t.correctAnswer,
          eventId: `test-${t.id}`
        });
      } else if (checkpointTaskNeedsText(t)) {
        answers.push({
          taskId: t.id,
          topicId: 1,
          text: t.correctAnswer,
          eventId: `test-${t.id}`
        });
      } else if (t.type === 'productive_writing') {
        answers.push({
          taskId: t.id,
          topicId: 1,
          text: '¡Hola! Me llamo Natalia. Tengo 35 años y soy de Madrid. Mucho gusto en conocerte.',
          eventId: `test-${t.id}`
        });
      }
    }

    const result = recordA1CheckpointSubmission(db, 10, 'a1-u01-first-contact', { answers });
    assert.equal(result.success, true);
    assert.equal(result.passed, true);
    assert.equal(result.objectiveScore, 100);
    assert.equal(result.recordedAttempts, 13);
    assert.equal(result.productiveEvaluationRequired, true);

    // Verify written attempt and writing skill evidence were recorded
    const attempts = db.prepare('SELECT count(*) as cnt FROM a1_learning_attempts WHERE profile_id = 10').get();
    assert.equal(attempts.cnt, 14); // 13 objective + 1 productive writing

    const evidence = db.prepare("SELECT count(*) as cnt FROM a1_skill_evidence WHERE profile_id = 10 AND skill = 'writing'").get();
    assert.equal(evidence.cnt, 1);
  });

  it('supports Final Graduation Checkpoint with both tasks and sections', () => {
    const db = createDb();
    const finalCp = getA1CheckpointByUnit('a1-final-graduation');
    assert.ok(finalCp, 'Final checkpoint must exist');
    assert.ok(Array.isArray(finalCp.tasks), 'Final checkpoint must have tasks array');
    assert.ok(Array.isArray(finalCp.sections), 'Final checkpoint must preserve sections array');
    assert.equal(finalCp.tasks.length, 8);

    const answers = finalCp.tasks.filter((t) => t.options || t.type === 'choice').map((t) => ({
      taskId: t.id,
      topicId: 1,
      selected: t.correctAnswer,
      eventId: `final-${t.id}`
    }));
    answers.push({
      taskId: 'final-write-01',
      topicId: 1,
      text: 'Estimado amigo, me llamo Mateo. Todos los dias voy a la universidad en metro. En verano voy a viajar a Granada.',
      eventId: 'final-writing-01'
    });

    const result = recordA1CheckpointSubmission(db, 10, 'a1-final-graduation', { answers });
    assert.equal(result.success, true);
    assert.equal(result.passed, true);
    assert.equal(result.recordedAttempts, 6);
  });
});
