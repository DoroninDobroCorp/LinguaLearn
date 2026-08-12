import assert from 'node:assert/strict';
import test from 'node:test';
import { getDb } from '../server/db.js';
import {
  createWritingAnalysisService,
} from '../server/writingAnalysis.js';

function createTestDatabase() {
  const db = getDb(':memory:');

  // Seed preset curriculum topics
  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (name, category, level, source)
    VALUES (?, 'Grammar', ?, ?)
  `).run('Past Simple (irregular verbs)', 'A2', 'preset');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (name, category, level, source)
    VALUES (?, 'Grammar', ?, ?)
  `).run('Articles (a/an/the)', 'A1', 'preset');

  // Seed two active users
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'user1@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'user2@example.com', 'hash', 'user')").run();

  return db;
}

function samplePayload(overrides = {}) {
  return {
    eventId: 'evt-fb-100',
    sourceApp: 'Slack',
    text: 'Yesterday I go to store.',
    sentAt: '2026-08-12T10:00:00.000Z',
    userId: 1,
    ...overrides,
  };
}

test('VAL-CAPT-007: Correction feedback submission records feedback in correction_feedback', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());

  const service = createWritingAnalysisService({
    db,
    analyzer: async () => ({
      isEnglish: true,
      correctedText: 'Yesterday I went to the store.',
      summaryRu: 'Исправлена форма глагола.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Используйте Past Simple.',
          topic: 'Past Simple (irregular verbs)',
          confidence: 0.95,
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple (irregular verbs)',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Ошибка в форме Past Simple.',
        },
      ],
    }),
  });

  const analyzed = await service.analyze(samplePayload({ userId: 1, eventId: 'evt-fb-1' }));
  assert.equal(analyzed.response.accepted, true);

  const sampleRow = db.prepare('SELECT id FROM writing_samples WHERE event_id = ? AND user_id = 1').get('evt-fb-1');
  assert.ok(sampleRow, 'Writing sample should be created');

  // Submit helpful feedback
  const result = service.submitFeedback({
    userId: 1,
    sampleId: sampleRow.id,
    feedbackType: 'helpful',
    notes: 'Great explanation',
  });

  assert.equal(result.success, true);
  assert.equal(result.feedback.feedback_type, 'helpful');
  assert.equal(result.feedback.notes, 'Great explanation');
  assert.equal(result.feedback.undone_evidence_count, 0);

  // Verify DB record
  const dbRecord = db.prepare('SELECT * FROM correction_feedback WHERE user_id = 1 AND writing_sample_id = ? AND feedback_type = ?')
    .get(sampleRow.id, 'helpful');
  assert.ok(dbRecord, 'Record should exist in correction_feedback');
  assert.equal(dbRecord.notes, 'Great explanation');

  // Resubmit identical feedback (idempotency)
  const result2 = service.submitFeedback({
    userId: 1,
    sampleId: sampleRow.id,
    feedbackType: 'helpful',
  });
  assert.equal(result2.success, true);
  assert.equal(result2.feedback.id, dbRecord.id);
});

test('VAL-CAPT-008: Idempotent progress undo via feedback reverses score deltas in user_topic_progress', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());

  const service = createWritingAnalysisService({
    db,
    analyzer: async () => ({
      isEnglish: true,
      correctedText: 'Yesterday I went to the store.',
      summaryRu: 'Исправлена форма глагола.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Используйте Past Simple.',
          topic: 'Past Simple (irregular verbs)',
          confidence: 0.95,
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple (irregular verbs)',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Ошибка в форме Past Simple.',
        },
      ],
    }),
  });

  // Seed initial user topic progress score = 50
  const topicRow = db.prepare('SELECT id FROM curriculum_topics WHERE name = ?').get('Past Simple (irregular verbs)');
  db.prepare(`
    INSERT INTO user_topic_progress (user_id, curriculum_topic_id, status, score, success_count, error_count)
    VALUES (1, ?, 'improving', 50.0, 1, 0)
  `).run(topicRow.id);

  // Analyze writing sample (applies -2.0 error score_delta)
  const analyzed = await service.analyze(samplePayload({ userId: 1, eventId: 'evt-undo-1' }));
  assert.equal(analyzed.response.accepted, true);

  const sampleRow = db.prepare('SELECT id FROM writing_samples WHERE event_id = ? AND user_id = 1').get('evt-undo-1');

  // Score after error should be 48.0, error_count = 1
  const progBefore = db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(topicRow.id);
  assert.equal(progBefore.score, 48.0);
  assert.equal(progBefore.error_count, 1);
  assert.equal(progBefore.status, 'recurring_problem');

  // Submit undo_progress feedback
  const undoRes1 = service.submitFeedback({
    userId: 1,
    sampleId: sampleRow.id,
    feedbackType: 'undo_progress',
  });

  assert.equal(undoRes1.success, true);
  assert.equal(undoRes1.undoneEvidenceCount, 1);

  // Score after undo should be restored to 50.0, error_count decremented to 0
  const progAfter1 = db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(topicRow.id);
  assert.equal(progAfter1.score, 50.0);
  assert.equal(progAfter1.error_count, 0);

  // Resubmit undo_progress feedback (idempotency check)
  const undoRes2 = service.submitFeedback({
    userId: 1,
    sampleId: sampleRow.id,
    feedbackType: 'undo_progress',
  });

  assert.equal(undoRes2.success, true);

  // Score should remain 50.0 without double-reversing
  const progAfter2 = db.prepare('SELECT score, error_count FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(topicRow.id);
  assert.equal(progAfter2.score, 50.0);
  assert.equal(progAfter2.error_count, 0);
});

test('Multi-user isolation and validation safeguards for feedback API', async (t) => {
  const db = createTestDatabase();
  t.after(() => db.close());

  const service = createWritingAnalysisService({
    db,
    analyzer: async () => ({
      isEnglish: true,
      correctedText: 'Corrected text',
      summaryRu: 'Summary',
      errors: [],
      topicEvidence: [],
    }),
  });

  const analyzed = await service.analyze(samplePayload({ userId: 1, eventId: 'evt-user1-sample' }));
  const sampleRow = db.prepare('SELECT id FROM writing_samples WHERE event_id = ? AND user_id = 1').get('evt-user1-sample');

  // User 2 tries to give feedback on User 1 sample -> 404 SAMPLE_NOT_FOUND
  assert.throws(
    () => service.submitFeedback({ userId: 2, sampleId: sampleRow.id, feedbackType: 'helpful' }),
    (err) => err.statusCode === 404 && err.code === 'SAMPLE_NOT_FOUND'
  );

  // Invalid feedback_type -> 400 INVALID_FEEDBACK_TYPE
  assert.throws(
    () => service.submitFeedback({ userId: 1, sampleId: sampleRow.id, feedbackType: 'invalid_type' }),
    (err) => err.statusCode === 400 && err.code === 'INVALID_FEEDBACK_TYPE'
  );

  // Invalid sampleId -> 400 INVALID_SAMPLE_ID
  assert.throws(
    () => service.submitFeedback({ userId: 1, sampleId: 'abc', feedbackType: 'helpful' }),
    (err) => err.statusCode === 400 && err.code === 'INVALID_SAMPLE_ID'
  );
});
