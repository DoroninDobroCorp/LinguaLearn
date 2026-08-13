import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService, filterWritingCandidate, validateWritingPayload } from '../server/writingAnalysis.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (2, 'Articles (a/an/the)', 'Grammar', 'A1', 'preset')
  `).run();

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'owner@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'macuser@example.com', 'hash', 'user')").run();

  return db;
}

describe('Stage B: Mac Desktop Client Alignment (schemaVersion 1)', () => {
  it('VAL-STAGEB-001: Mac desktop client contract schema version 1 alignment', async () => {
    const db = createTestDatabase();
    try {
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'She does not know the answer to this question.',
          summaryRu: 'Исправлена форма глагола в Present Simple.',
          errors: [
            {
              original: "don't",
              correction: "doesn't",
              explanationRu: "Используйте doesn't для третьего лица единственного числа.",
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.95,
              kind: 'grammar_error',
              category: 'subject_verb_agreement',
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.95,
              explanationRu: 'Ошибка в согласовании подлежащего и глагола.',
            },
          ],
        }),
      });

      const macPayload = {
        schemaVersion: 1,
        eventId: 'mac-evt-001',
        sourceApp: 'LinguaLearnCapture',
        originalText: "She don't know the answer to this question.",
        text: "She don't know the answer to this question.",
        sentAt: new Date().toISOString(),
        previewOnly: false,
        userId: 2,
      };

      const result = await service.analyze(macPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.schemaVersion, 1);
      assert.equal(result.response.eventId, 'mac-evt-001');
      assert.ok(Number.isInteger(result.response.sampleId), 'sampleId must be an integer');
      assert.equal(result.response.previewOnly, false);
      assert.equal(result.response.rejectionReason, null);
      assert.equal(result.response.sourceApp, 'LinguaLearnCapture');
      assert.equal(result.response.originalText, "She don't know the answer to this question.");
      assert.equal(result.response.correctedText, 'She does not know the answer to this question.');
      assert.equal(result.response.changed, true);
      assert.equal(typeof result.response.summaryRu, 'string');
      assert.equal(result.response.errors.length, 1);
      assert.equal(result.response.topicEvidence.length, 1);
    } finally {
      db.close();
    }
  });

  it('Candidate filter excludes non-prose inputs, code, URLs, and Cyrillic text', () => {
    const validProse = filterWritingCandidate('She does not understand this complex grammar rule.');
    assert.equal(validProse.accepted, true);
    assert.equal(validProse.reason, null);

    const codeInput = filterWritingCandidate('const x = () => { return 42; };');
    assert.equal(codeInput.accepted, false);
    assert.match(codeInput.reason, /code|command|not_a_sentence|no_sentence_terminator/);

    const urlInput = filterWritingCandidate('Check this link: https://example.com/login for details.');
    assert.equal(urlInput.accepted, false);
    assert.equal(urlInput.reason, 'url_or_email');

    const emailInput = filterWritingCandidate('Contact me at john.doe@company.org anytime.');
    assert.equal(emailInput.accepted, false);
    assert.equal(emailInput.reason, 'url_or_email');

    const cyrillicInput = filterWritingCandidate('Привет, как твои дела сегодня?');
    assert.equal(cyrillicInput.accepted, false);
    assert.equal(cyrillicInput.reason, 'contains_cyrillic');

    const shortPhrase = filterWritingCandidate('Hello world');
    assert.equal(shortPhrase.accepted, false);
    assert.equal(shortPhrase.reason, 'no_sentence_terminator');
  });

  it('Password and secure field input patterns are excluded', () => {
    const secureTerms = ['secure', 'password', 'passcode', 'secret', 'one-time code', 'verification code'];
    const secureTestFields = [
      { role: 'AXTextField', title: 'User Password', isSecure: true },
      { role: 'AXSecureTextField', title: '', isSecure: true },
      { role: 'AXTextField', placeholder: 'Enter one-time code', isSecure: true },
    ];

    for (const field of secureTestFields) {
      const combined = `${field.role} ${field.title || ''} ${field.placeholder || ''}`.toLowerCase();
      const matched = secureTerms.some((term) => combined.includes(term));
      assert.equal(matched, true, `Field ${JSON.stringify(field)} should be detected as secure field`);
    }
  });

  it('Preview hotkey mode sends previewOnly: true without modifying user progress', async () => {
    const db = createTestDatabase();
    try {
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'Yesterday I went home.',
          summaryRu: 'Исправлен глагол.',
          errors: [
            {
              original: 'go',
              correction: 'went',
              explanationRu: 'Используйте Past Simple.',
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.9,
              kind: 'grammar_error',
              category: 'verb_tense',
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.9,
              explanationRu: 'Ошибка.',
            },
          ],
        }),
      });

      const previewPayload = {
        schemaVersion: 1,
        eventId: 'mac-prev-001',
        sourceApp: 'Telegram',
        originalText: 'Yesterday I go home.',
        text: 'Yesterday I go home.',
        sentAt: new Date().toISOString(),
        previewOnly: true,
        userId: 2,
      };

      const result = await service.analyze(previewPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.previewOnly, true);
      assert.equal(result.response.errors.length, 1);

      const sample = db.prepare('SELECT preview_only FROM writing_samples WHERE event_id = ?').get('mac-prev-001');
      assert.equal(sample.preview_only, 1);

      const evidenceCount = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount, 0, 'Preview mode must NOT insert grammar_evidence records');

      const progressCount = db.prepare('SELECT COUNT(*) AS count FROM user_topic_progress WHERE user_id = 2').get().count;
      assert.equal(progressCount, 0, 'Preview mode must NOT alter user_topic_progress');
    } finally {
      db.close();
    }
  });

  it('Offline queue and exact-once replayed submissions', async () => {
    const db = createTestDatabase();
    try {
      let analyzerCallCount = 0;
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => {
          analyzerCallCount++;
          return {
            isEnglish: true,
            correctedText: 'Yesterday I went to the market.',
            summaryRu: 'Исправлена форма глагола.',
            errors: [
              {
                original: 'go',
                correction: 'went',
                explanationRu: 'Past Simple',
                topic: 'Past Simple (irregular verbs)',
                confidence: 0.9,
                kind: 'grammar_error',
                category: 'verb_tense',
              },
            ],
            topicEvidence: [
              {
                topic: 'Past Simple (irregular verbs)',
                outcome: 'error',
                confidence: 0.9,
                explanationRu: 'Ошибка в Past Simple.',
              },
            ],
          };
        },
      });

      const offlinePayload = {
        schemaVersion: 1,
        eventId: 'mac-offline-001',
        sourceApp: 'codex',
        originalText: 'Yesterday I go to market.',
        text: 'Yesterday I go to market.',
        sentAt: '2026-08-12T12:00:00.000Z',
        previewOnly: false,
        userId: 2,
      };

      const first = await service.analyze(offlinePayload);
      assert.equal(first.replayed, false);
      assert.equal(analyzerCallCount, 1);

      const evidenceCount1 = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount1, 1);

      const second = await service.analyze(offlinePayload);
      assert.equal(second.replayed, true);
      assert.equal(analyzerCallCount, 1);

      const evidenceCount2 = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount2, 1);
    } finally {
      db.close();
    }
  });

  it('Bearer device token authentication and revocation', () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);

      const tokenObj = deviceService.createToken({ userId: 2, deviceName: 'MacBook Pro Agent' });
      assert.ok(tokenObj.token.startsWith('ll_dev_'), 'Device token must start with ll_dev_');
      assert.ok(tokenObj.id, 'Must return device_id');

      const resolvedUser = deviceService.authenticateDeviceToken(tokenObj.token);
      assert.equal(resolvedUser.valid, true);
      assert.equal(resolvedUser.userId, 2);
      assert.equal(resolvedUser.deviceTokenId, tokenObj.id);

      deviceService.revokeToken({ userId: 2, tokenId: tokenObj.id });

      const revokedRes = deviceService.authenticateDeviceToken(tokenObj.token);
      assert.equal(revokedRes.valid, false);
      assert.equal(revokedRes.reason, 'revoked');
    } finally {
      db.close();
    }
  });
});
