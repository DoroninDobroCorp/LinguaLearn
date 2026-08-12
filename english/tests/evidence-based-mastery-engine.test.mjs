import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrateMultiUserSchema } from '../server/dbMigration.js';
import {
  calculateTopicStatus,
  calculateMasteryConfidence,
  recordTopicEvidence,
  recalculateTopicProgress,
  getUserTopicProgress,
} from '../server/topicProgress.js';

test('Topic Status Engine: calculateTopicStatus logic', () => {
  // 0 evidence -> not_started
  assert.equal(
    calculateTopicStatus({
      score: 0,
      success_count: 0,
      error_count: 0,
      unique_practice_days: 0,
    }),
    'not_started'
  );

  // 1 success -> insufficient_evidence
  assert.equal(
    calculateTopicStatus({
      score: 1,
      success_count: 1,
      error_count: 0,
      unique_practice_days: 1,
      last_success_at: '2026-08-10 10:00:00',
    }),
    'insufficient_evidence'
  );

  // 2 errors in a row -> recurring_problem
  assert.equal(
    calculateTopicStatus({
      score: 0,
      success_count: 0,
      error_count: 2,
      unique_practice_days: 1,
      last_error_at: '2026-08-10 10:00:00',
    }),
    'recurring_problem'
  );

  // 3 evidence items, score 50 -> improving
  assert.equal(
    calculateTopicStatus({
      score: 50,
      success_count: 3,
      error_count: 0,
      unique_practice_days: 2,
      last_success_at: '2026-08-10 10:00:00',
    }),
    'improving'
  );

  // Score 75, 3 evidence items, 3 practice days -> stable
  assert.equal(
    calculateTopicStatus({
      score: 75,
      success_count: 5,
      error_count: 0,
      unique_practice_days: 3,
      last_success_at: '2026-08-10 10:00:00',
    }),
    'stable'
  );

  // Score 85, 4 unique practice days (needs 5 for mastery) -> stable
  assert.equal(
    calculateTopicStatus({
      score: 85,
      success_count: 8,
      error_count: 0,
      unique_practice_days: 4,
      last_success_at: '2026-08-10 10:00:00',
    }),
    'stable'
  );

  // Score 85, 5 unique practice days, zero recent errors -> mastered (VAL-PROG-001)
  assert.equal(
    calculateTopicStatus({
      score: 85,
      success_count: 10,
      error_count: 0,
      unique_practice_days: 5,
      last_success_at: '2026-08-10 10:00:00',
    }),
    'mastered'
  );

  // Score 85, 5 unique practice days, but recent error (last_error_at > last_success_at) -> recurring_problem (not mastered!)
  assert.notEqual(
    calculateTopicStatus({
      score: 85,
      success_count: 10,
      error_count: 2,
      unique_practice_days: 5,
      last_success_at: '2026-08-10 10:00:00',
      last_error_at: '2026-08-11 10:00:00',
    }),
    'mastered'
  );
});

test('Topic Status Engine: calculateMasteryConfidence metrics', () => {
  const conf1 = calculateMasteryConfidence({
    score: 0,
    success_count: 0,
    error_count: 0,
    unique_practice_days: 0,
  });
  assert.equal(conf1, 0);

  const conf2 = calculateMasteryConfidence({
    score: 85,
    success_count: 10,
    error_count: 0,
    unique_practice_days: 5,
    last_success_at: '2026-08-10 10:00:00',
  });
  assert.ok(conf2 >= 0.8 && conf2 <= 1.0);
});

test('VAL-PROG-001: Multi-dimensional topic status transitions over database evidence', () => {
  const db = new Database(':memory:');
  migrateMultiUserSchema(db);

  // Create initial user
  const user = db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('test@example.com', 'hash', 'user') RETURNING id").get();
  const userId = user.id;

  // Insert a curriculum topic
  const topic = db.prepare("INSERT INTO curriculum_topics (name, category, level, source) VALUES ('Articles (a/an/the)', 'Grammar', 'A1', 'preset') RETURNING id").get();
  const topicId = topic.id;

  // 1. Initial state before evidence
  let prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.status, 'not_started');

  // Day 1: 1 success -> insufficient_evidence
  recordTopicEvidence(db, {
    userId,
    curriculumTopicId: topicId,
    outcome: 'success',
    confidence: 0.9,
    timestamp: '2026-08-01 10:00:00',
  });
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.status, 'insufficient_evidence');
  assert.equal(prog.unique_practice_days, 1);
  assert.equal(prog.success_count, 1);
  assert.equal(prog.error_count, 0);

  // Day 2: 1 success -> still insufficient_evidence (total evidence 2)
  recordTopicEvidence(db, {
    userId,
    curriculumTopicId: topicId,
    outcome: 'success',
    confidence: 0.9,
    timestamp: '2026-08-02 10:00:00',
  });
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.unique_practice_days, 2);

  // Day 3: 1 success -> improving (total evidence 3)
  recordTopicEvidence(db, {
    userId,
    curriculumTopicId: topicId,
    outcome: 'success',
    confidence: 0.9,
    timestamp: '2026-08-03 10:00:00',
  });
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.unique_practice_days, 3);
  assert.equal(prog.status, 'improving');

  // Day 4: 70 additional successes -> score rises to >= 70 -> stable
  for (let i = 0; i < 70; i++) {
    recordTopicEvidence(db, {
      userId,
      curriculumTopicId: topicId,
      outcome: 'success',
      confidence: 1.0,
      timestamp: '2026-08-04 10:00:00',
    });
  }
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.unique_practice_days, 4);
  assert.equal(prog.status, 'stable');
  assert.ok(prog.score >= 70);

  // Day 5: 10 successes on 5th unique day -> score reaches 83 >= 80 -> mastered! (5 unique practice days, score >= 80, zero recent errors)
  for (let i = 0; i < 10; i++) {
    recordTopicEvidence(db, {
      userId,
      curriculumTopicId: topicId,
      outcome: 'success',
      confidence: 1.0,
      timestamp: '2026-08-05 10:00:00',
    });
  }
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.unique_practice_days, 5);
  assert.ok(prog.score >= 80);
  assert.equal(prog.status, 'mastered');

  // Error occurs -> transitions to recurring_problem if multiple errors occur
  recordTopicEvidence(db, {
    userId,
    curriculumTopicId: topicId,
    outcome: 'error',
    confidence: 0.9,
    timestamp: '2026-08-06 10:00:00',
  });
  recordTopicEvidence(db, {
    userId,
    curriculumTopicId: topicId,
    outcome: 'error',
    confidence: 0.9,
    timestamp: '2026-08-06 11:00:00',
  });
  prog = getUserTopicProgress(db, userId, topicId);
  assert.equal(prog.status, 'recurring_problem');

  db.close();
});
