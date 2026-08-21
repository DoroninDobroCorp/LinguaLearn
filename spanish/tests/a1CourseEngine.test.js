import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import {
  A1_UNITS,
  ensureA1CourseSchema,
  getA1CourseSnapshot,
  getA1TodayPlan,
  recordA1Attempt,
  recordA1SkillEvidence,
} from '../server/a1CourseEngine.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE profiles (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO profiles VALUES (1, 'Test');
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
  insert.run('Preterite tense (regular verbs)', 'Grammar', 'A2', 'preset', 31);
  ensureA1CourseSchema(db);
  return db;
}

function topicId(db, name = A1_UNITS[0].topics[0]) {
  return db.prepare('SELECT id FROM curriculum_topics WHERE name = ?').get(name).id;
}

describe('A1 adaptive mastery engine', () => {
  it('is exact-once and cannot master a topic with a same-day answer streak', () => {
    const db = createDb();
    const id = topicId(db);
    const day = new Date('2026-01-01T10:00:00Z');
    const first = recordA1Attempt(db, 1, { topicId: id, eventId: 'evt-1', correct: true, quality: 5 }, day);
    const scheduledReview = first.state.nextReviewAt;
    const extraPractice = recordA1Attempt(db, 1, { topicId: id, eventId: 'evt-extra', correct: true, quality: 5 }, day);
    assert.equal(first.retentionCredit, true);
    assert.equal(extraPractice.retentionCredit, false);
    assert.equal(extraPractice.state.nextReviewAt, scheduledReview);
    assert.match(extraPractice.feedbackRu, /не переносится/);
    const replay = recordA1Attempt(db, 1, { topicId: id, eventId: 'evt-1', correct: true, quality: 5 }, day);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    for (let index = 2; index <= 11; index += 1) {
      recordA1Attempt(db, 1, { topicId: id, eventId: `evt-${index}`, correct: true, quality: 5 }, day);
    }
    const state = getA1CourseSnapshot(db, 1, day).units[0].topics[0];
    assert.equal(state.successfulDays, 1);
    assert.notEqual(state.phase, 'mastered');
  });

  it('masters only after successful reviews across enough distinct days and retention', () => {
    const db = createDb();
    const id = topicId(db);
    for (let index = 0; index < 6; index += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + (index * 3), 12));
      recordA1Attempt(db, 1, { topicId: id, eventId: `spaced-${index}`, correct: true, quality: 5 }, date);
    }
    const state = getA1CourseSnapshot(db, 1, new Date('2026-01-17T13:00:00Z')).units[0].topics[0];
    assert.equal(state.phase, 'mastered');
    assert.ok(state.successfulDays >= 4);
    assert.ok(state.stabilityDays >= 14);
    assert.ok(state.masteryScore >= 85);
  });

  it('adapts downward after an error and schedules a short relearning interval', () => {
    const db = createDb();
    const id = topicId(db);
    const start = new Date('2026-02-01T08:00:00Z');
    recordA1Attempt(db, 1, { topicId: id, eventId: 'ok-1', correct: true, quality: 5 }, start);
    recordA1Attempt(db, 1, { topicId: id, eventId: 'ok-2', correct: true, quality: 5 }, new Date('2026-02-03T08:00:00Z'));
    const failedAt = new Date('2026-02-06T08:00:00Z');
    const failed = recordA1Attempt(db, 1, { topicId: id, eventId: 'fail-1', correct: false }, failedAt);
    assert.equal(failed.state.phase, 'relearning');
    assert.equal(failed.state.lapses, 1);
    const hours = (new Date(failed.state.nextReviewAt) - failedAt) / 3_600_000;
    assert.equal(hours, 6);
  });

  it('does not mutate A2 progress', () => {
    const db = createDb();
    const a2 = db.prepare("SELECT id FROM curriculum_topics WHERE level = 'A2'").get();
    db.prepare('INSERT INTO curriculum_progress (topic_id, profile_id, status, score) VALUES (?, 1, ?, ?)').run(a2.id, 'in_progress', 42);
    recordA1Attempt(db, 1, { topicId: topicId(db), eventId: 'a1-only', correct: true }, new Date('2026-03-01T00:00:00Z'));
    const after = db.prepare('SELECT status, score FROM curriculum_progress WHERE topic_id = ? AND profile_id = 1').get(a2.id);
    assert.deepEqual(after, { status: 'in_progress', score: 42 });
  });

  it('requires all four skills and mature vocabulary for A1 completion gates', () => {
    const db = createDb();
    for (const skill of ['listening', 'speaking', 'reading', 'writing']) {
      recordA1SkillEvidence(db, 1, { eventId: `${skill}-1`, skill, taskId: 'checkpoint-1', score: 75 }, new Date('2026-04-01T10:00:00Z'));
      recordA1SkillEvidence(db, 1, { eventId: `${skill}-2`, skill, taskId: 'checkpoint-2', score: 80 }, new Date('2026-04-03T10:00:00Z'));
      recordA1SkillEvidence(db, 1, { eventId: `${skill}-3`, skill, taskId: 'checkpoint-3', score: 85 }, new Date('2026-04-03T12:00:00Z'));
    }
    const snapshot = getA1CourseSnapshot(db, 1, new Date('2026-04-04T00:00:00Z'));
    assert.equal(snapshot.completionGates.skills, true);
    assert.equal(snapshot.completionGates.vocabulary, false);
    assert.equal(snapshot.completed, false);
    assert.equal(snapshot.vocabulary.target, 650);
  });

  it('keeps overdue reviews first without blocking optional new material or a deeper study pace', () => {
    const db = createDb();
    getA1CourseSnapshot(db, 1, new Date('2026-05-01T00:00:00Z'));
    const rows = db.prepare("SELECT id, name FROM curriculum_topics WHERE level = 'A1' ORDER BY id").all();
    const firstUnitNames = new Set(A1_UNITS[0].topics);
    for (const row of rows.filter((topic) => firstUnitNames.has(topic.name))) {
      db.prepare(`UPDATE a1_topic_mastery SET phase = 'learning', mastery_score = 45, next_review_at = ? WHERE profile_id = 1 AND topic_id = ?`)
        .run('2026-04-30T00:00:00Z', row.id);
    }
    for (const row of rows.filter((topic) => !A1_UNITS[1].topics.includes(topic.name)).slice(0, 9)) {
      db.prepare(`UPDATE a1_topic_mastery SET phase = 'learning', mastery_score = 45, next_review_at = ? WHERE profile_id = 1 AND topic_id = ?`)
        .run('2026-04-30T00:00:00Z', row.id);
    }

    const now = new Date('2026-05-03T00:00:00Z');
    const quick = getA1TodayPlan(db, 1, now, { targetMinutes: 15 });
    const deep = getA1TodayPlan(db, 1, now, { targetMinutes: 60 });
    assert.equal(quick.actions[0].kind, 'grammar_review');
    assert.match(quick.actions[0].actionUrl, /^\/exercises\?tab=classic_quiz&mode=recommended&topicIds=/);
    const recommendedIds = new URLSearchParams(quick.actions[0].actionUrl.split('?')[1]).get('topicIds').split(',').map(Number);
    assert.deepEqual(recommendedIds, quick.actions[0].topicIds);
    assert.ok(recommendedIds.every((id) => quick.course.dueTopics.some((topic) => topic.topicId === id)));
    assert.equal(quick.course.reviewBacklogHigh, true);
    assert.ok(quick.course.nextNewTopic, 'new material remains available to an intensive learner');
    assert.ok(quick.continueOptions.some((action) => action.kind === 'new_topic'));
    assert.equal(deep.targetMinutes, 60);
    assert.ok(deep.actions.length > quick.actions.length);
    assert.equal(deep.pace.unlimited, true);
  });

  it('cannot certify mastery before fourteen calendar days even when every review is forced due', () => {
    const db = createDb();
    const id = topicId(db);
    const days = [0, 2, 5, 9, 13];
    days.forEach((offset, index) => {
      if (index > 0) db.prepare('UPDATE a1_topic_mastery SET next_review_at = ? WHERE profile_id = 1 AND topic_id = ?').run('2000-01-01T00:00:00Z', id);
      recordA1Attempt(db, 1, { topicId: id, eventId: `forced-${index}`, correct: true, quality: 5 }, new Date(Date.UTC(2026, 5, 1 + offset, 10)));
    });
    let state = getA1CourseSnapshot(db, 1, new Date('2026-06-14T10:00:00Z')).units[0].topics[0];
    assert.notEqual(state.phase, 'mastered');
    assert.equal(state.learningSpanDays, 13);
    db.prepare('UPDATE a1_topic_mastery SET next_review_at = ? WHERE profile_id = 1 AND topic_id = ?').run('2000-01-01T00:00:00Z', id);
    recordA1Attempt(db, 1, { topicId: id, eventId: 'day-15', correct: true, quality: 5 }, new Date('2026-06-15T10:00:00Z'));
    state = getA1CourseSnapshot(db, 1, new Date('2026-06-15T10:00:00Z')).units[0].topics[0];
    assert.equal(state.phase, 'mastered');
    assert.equal(state.learningSpanDays, 14);
  });

});
