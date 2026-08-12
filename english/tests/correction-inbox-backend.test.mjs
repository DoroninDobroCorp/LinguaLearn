import assert from 'node:assert/strict';
import test from 'node:test';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';

test('Correction Inbox backend: listRecent returns sample id and feedback array', async (t) => {
  const db = getDb(':memory:');
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'u1@ex.com', 'h', 'owner')").run();
  db.prepare("INSERT INTO curriculum_topics (id, name, category, level) VALUES (1, 'Past Simple', 'Grammar', 'A2')").run();

  const service = createWritingAnalysisService({
    db,
    analyzer: async () => ({
      isEnglish: true,
      correctedText: 'Corrected text.',
      summaryRu: 'Исправление.',
      errors: [],
      topicEvidence: [],
    }),
  });

  const res = await service.analyze({
    eventId: 'evt-inbox-1',
    sourceApp: 'Slack',
    text: 'Original text.',
    sentAt: '2026-08-12T10:00:00.000Z',
    userId: 1,
  });

  const sampleRow = db.prepare("SELECT id FROM writing_samples WHERE event_id = 'evt-inbox-1'").get();
  assert.ok(sampleRow, 'Sample should be created');

  // Submit helpful feedback
  service.submitFeedback({
    userId: 1,
    sampleId: sampleRow.id,
    feedbackType: 'helpful',
    notes: 'Good job',
  });

  const samples = service.listRecent(50, 1);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].id, sampleRow.id, 'Sample object should contain integer id');
  assert.equal(samples[0].eventId, 'evt-inbox-1');
  assert.equal(samples[0].sourceApp, 'Slack');
  assert.equal(samples[0].originalText, 'Original text.');
  assert.ok(Array.isArray(samples[0].feedback), 'Sample object should contain feedback array');
  assert.equal(samples[0].feedback.length, 1);
  assert.equal(samples[0].feedback[0].feedbackType, 'helpful');
  assert.equal(samples[0].feedback[0].notes, 'Good job');
});
