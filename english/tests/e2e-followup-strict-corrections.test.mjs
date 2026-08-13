import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.REPO_ROOT || path.resolve(__dirname, '../..');

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES
      (101, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset'),
      (102, 'Subject-Verb Agreement', 'Grammar', 'B1', 'preset'),
      (103, 'Articles (a/an/the)', 'Grammar', 'A1', 'preset')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, status) VALUES
      (1, 'owner@example.com', 'hash', 'owner', 'active'),
      (2, 'macuser@example.com', 'hash', 'user', 'active'),
      (3, 'iosuser@example.com', 'hash', 'user', 'active'),
      (4, 'androiduser@example.com', 'hash', 'user', 'active'),
      (5, 'winuser@example.com', 'hash', 'user', 'active')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO user_topic_progress (user_id, curriculum_topic_id, score, status, success_count, error_count) VALUES
      (2, 102, 50, 'improving', 2, 0),
      (3, 102, 50, 'improving', 2, 0),
      (4, 102, 50, 'improving', 2, 0),
      (5, 102, 50, 'improving', 2, 0)
  `).run();

  return db;
}

describe('VAL-E2E-002: E2E Follow-up Strict Corrections Integration Test Suite', () => {

  it('1. 4-Tier Semantic Assessment Model API Response & Schema Verification', async () => {
    const db = createTestDatabase();
    try {
      const tiers = [
        {
          tier: 'clear_error',
          text: "She don't know the answer.",
          correctedText: "She doesn't know the answer.",
          summaryRu: 'Ошибка в согласовании третьем лице.',
          errors: [
            {
              original: "don't",
              correction: "doesn't",
              explanationRu: 'Третье лицо требует doesn’t.',
              topic: 'Subject-Verb Agreement',
              confidence: 0.95,
            },
          ],
          topicEvidence: [
            {
              topic: 'Subject-Verb Agreement',
              outcome: 'error',
              confidence: 0.95,
              explanationRu: 'Ошибка согласования.',
            },
          ],
        },
        {
          tier: 'mechanical_only',
          text: 'I recieved your message yesterday.',
          correctedText: 'I received your message yesterday.',
          summaryRu: 'Опечатка в слове received.',
          errors: [],
          topicEvidence: [],
        },
        {
          tier: 'acceptable',
          text: 'Can you give me an advice about this?',
          correctedText: 'Can you give me advice about this?',
          summaryRu: 'Фраза понятна, предложение стилистически адаптировано.',
          errors: [],
          topicEvidence: [],
        },
        {
          tier: 'correct',
          text: 'We completed the project on time.',
          correctedText: 'We completed the project on time.',
          summaryRu: 'Предложение полностью корректно.',
          errors: [],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'success',
              confidence: 0.96,
              explanationRu: 'Верное применение Past Simple.',
            },
          ],
        },
      ];

      for (const t of tiers) {
        const service = createWritingAnalysisService({
          db,
          analyzer: async () => ({
            isEnglish: true,
            assessment: t.tier,
            correctedText: t.correctedText,
            summaryRu: t.summaryRu,
            errors: t.errors,
            topicEvidence: t.topicEvidence,
          }),
        });

        const res = await service.analyze({
          schemaVersion: 1,
          eventId: `e2e-tier-${t.tier}`,
          sourceApp: 'Slack',
          text: t.text,
          userId: 2,
        });

        assert.equal(res.response.accepted, true);
        assert.equal(res.response.assessment, t.tier);
        if (t.tier === 'clear_error') {
          assert.equal(res.response.errors.length > 0, true, 'clear_error must have non-empty errors array');
        } else {
          assert.deepEqual(res.response.errors, [], `Non-clear_error tier (${t.tier}) must have empty errors array`);
        }
      }
    } finally {
      db.close();
    }
  });

  it('2. Server Guard Enforcement: Blocking Negative Evidence & Confidence Threshold Validation', async () => {
    const db = createTestDatabase();
    try {
      const topicId = 102; // Subject-Verb Agreement
      const initialScore = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 2 AND curriculum_topic_id = ?').get(topicId).score;

      // Case 2a: Model returns mechanical_only but attempts to attach negative topic evidence
      const mockContradictoryMechanical = async () => ({
        isEnglish: true,
        assessment: 'mechanical_only',
        correctedText: 'I received your message.',
        summaryRu: 'Опечатка.',
        errors: [
          {
            original: 'recieved',
            correction: 'received',
            explanationRu: 'Опечатка в слове',
            topic: 'Subject-Verb Agreement',
            confidence: 0.95,
          },
        ],
        topicEvidence: [
          {
            topic: 'Subject-Verb Agreement',
            outcome: 'error',
            confidence: 0.95,
            explanationRu: 'Опечатка не должна приводить к вычету баллов',
          },
        ],
      });

      const service1 = createWritingAnalysisService({ db, analyzer: mockContradictoryMechanical });
      const res1 = await service1.analyze({
        schemaVersion: 1,
        eventId: 'e2e-guard-mechanical',
        sourceApp: 'Slack',
        text: 'I recieved your message.',
        userId: 2,
      });

      assert.equal(res1.response.assessment, 'mechanical_only');
      assert.deepEqual(res1.response.errors, []);
      const scoreAfter1 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 2 AND curriculum_topic_id = ?').get(topicId).score;
      assert.equal(scoreAfter1, initialScore, 'Progress score must not change for mechanical_only');

      const negEvidenceCount1 = db.prepare("SELECT COUNT(*) AS count FROM grammar_evidence WHERE writing_sample_id = ? AND outcome = 'error'").get(res1.response.sampleId).count;
      assert.equal(negEvidenceCount1, 0, 'Negative grammar evidence must be blocked for mechanical_only');

      // Case 2b: clear_error with confidence 0.80 (< 0.85 threshold)
      const mockLowConfidenceError = async () => ({
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'She does not know.',
        summaryRu: 'Низкая уверенность ошибки.',
        errors: [
          {
            original: "don't",
            correction: "doesn't",
            explanationRu: 'Низкая уверенность',
            topic: 'Subject-Verb Agreement',
            confidence: 0.80,
          },
        ],
        topicEvidence: [
          {
            topic: 'Subject-Verb Agreement',
            outcome: 'error',
            confidence: 0.80,
            explanationRu: 'Низкая уверенность в теме',
          },
        ],
      });

      const service2 = createWritingAnalysisService({ db, analyzer: mockLowConfidenceError });
      const res2 = await service2.analyze({
        schemaVersion: 1,
        eventId: 'e2e-guard-low-conf',
        sourceApp: 'Slack',
        text: "She don't know.",
        userId: 2,
      });

      assert.equal(res2.response.assessment, 'clear_error');
      const scoreAfter2 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 2 AND curriculum_topic_id = ?').get(topicId).score;
      assert.equal(scoreAfter2, initialScore, 'Confidence < 0.85 must not deduct progress score');

      // Case 2c: clear_error with confidence 0.90 (>= 0.85 threshold)
      const mockHighConfidenceError = async () => ({
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'She does not know.',
        summaryRu: 'Высокая уверенность ошибки.',
        errors: [
          {
            original: "don't",
            correction: "doesn't",
            explanationRu: 'Высокая уверенность',
            topic: 'Subject-Verb Agreement',
            confidence: 0.90,
          },
        ],
        topicEvidence: [
          {
            topic: 'Subject-Verb Agreement',
            outcome: 'error',
            confidence: 0.90,
            explanationRu: 'Высокая уверенность в теме',
          },
        ],
      });

      const service3 = createWritingAnalysisService({ db, analyzer: mockHighConfidenceError });
      const res3 = await service3.analyze({
        schemaVersion: 1,
        eventId: 'e2e-guard-high-conf',
        sourceApp: 'Slack',
        text: "She don't know.",
        userId: 2,
      });

      assert.equal(res3.response.assessment, 'clear_error');
      const scoreAfter3 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 2 AND curriculum_topic_id = ?').get(topicId).score;
      assert.equal(scoreAfter3, initialScore - 2, 'Confidence >= 0.85 for clear_error must deduct 2.0 score points');
    } finally {
      db.close();
    }
  });

  it('3. Compact Chip vs Large Popup UI Contract Verification', () => {
    // Contract Helper simulating Client UI Display Selection logic
    function resolveUiDisplay(assessment, isManualPreview) {
      if (isManualPreview) {
        return { uiMode: 'full_preview_modal', affectsScore: false };
      }
      if (assessment === 'clear_error') {
        return { uiMode: 'large_correction_card', affectsScore: true };
      }
      return { uiMode: 'compact_ok_chip', durationMs: 1500, affectsScore: false };
    }

    // Auto Send mode checks
    const clearErrDisplay = resolveUiDisplay('clear_error', false);
    assert.equal(clearErrDisplay.uiMode, 'large_correction_card');
    assert.equal(clearErrDisplay.affectsScore, true);

    const mechanicalDisplay = resolveUiDisplay('mechanical_only', false);
    assert.equal(mechanicalDisplay.uiMode, 'compact_ok_chip');
    assert.equal(mechanicalDisplay.affectsScore, false);

    const acceptableDisplay = resolveUiDisplay('acceptable', false);
    assert.equal(acceptableDisplay.uiMode, 'compact_ok_chip');
    assert.equal(acceptableDisplay.affectsScore, false);

    const correctDisplay = resolveUiDisplay('correct', false);
    assert.equal(correctDisplay.uiMode, 'compact_ok_chip');
    assert.equal(correctDisplay.affectsScore, false);

    // Manual Preview mode checks
    const manualPreviewDisplay = resolveUiDisplay('clear_error', true);
    assert.equal(manualPreviewDisplay.uiMode, 'full_preview_modal');
    assert.equal(manualPreviewDisplay.affectsScore, false);
  });

  it('4. Multi-Platform Client Payload Handling, Device Token Auth & Idempotency', async () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);
      const platforms = [
        { name: 'Mac Desktop', userId: 2, app: 'LinguaLearnCapture' },
        { name: 'iOS App/Keyboard', userId: 3, app: 'LinguaLearnKeyboardExtension' },
        { name: 'Android IME', userId: 4, app: 'LinguaLearnIMEKeyboardService' },
        { name: 'Windows Agent', userId: 5, app: 'LinguaLearnAgent' },
      ];

      for (const p of platforms) {
        // Device token validation
        const devToken = deviceService.createToken({ userId: p.userId, deviceName: `${p.name} Device` });
        const authCheck = deviceService.authenticateDeviceToken(devToken.token);
        assert.equal(authCheck.valid, true, `${p.name} token must be valid`);
        assert.equal(authCheck.userId, p.userId);

        const service = createWritingAnalysisService({
          db,
          analyzer: async () => ({
            isEnglish: true,
            assessment: 'acceptable',
            correctedText: 'Verified multi-platform payload.',
            summaryRu: 'Платформенный запрос успешен.',
            errors: [],
            topicEvidence: [],
          }),
        });

        const payload = {
          schemaVersion: 1,
          eventId: `e2e-payload-${p.userId}-001`,
          sourceApp: p.app,
          originalText: 'Verified multi-platform payload.',
          text: 'Verified multi-platform payload.',
          sentAt: '2026-08-13T10:00:00.000Z',
          userId: p.userId,
          previewOnly: false,
        };

        // First ingestion
        const first = await service.analyze(payload);
        assert.equal(first.response.accepted, true);
        assert.equal(first.replayed, false);

        // Idempotent duplicate ingestion
        const second = await service.analyze(payload);
        assert.equal(second.response.accepted, true);
        assert.equal(second.replayed, true, `${p.name} duplicate request must return cached replayed result`);
      }
    } finally {
      db.close();
    }
  });

});
