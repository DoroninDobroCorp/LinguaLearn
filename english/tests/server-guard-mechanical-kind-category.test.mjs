import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db.js';
import {
  createWritingAnalysisService,
  hasMatchingObjectiveError,
  validateAnalyzerResult,
} from '../server/writingAnalysis.js';
import { hasMatchingObjectiveError as reexportedHasMatching } from '../server/topicProgress.js';

function createTestDb() {
  const db = getDb(':memory:');
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, status) VALUES
      (1, 'test@example.com', 'hash', 'owner', 'active')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics (id, name, category, level, source) VALUES
      (101, 'Past Simple vs Present Perfect', 'grammar', 'B1', 'preset'),
      (102, 'Subject-Verb Agreement', 'grammar', 'B1', 'preset')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO user_topic_progress (user_id, curriculum_topic_id, score, status, success_count, error_count) VALUES
      (1, 101, 50, 'improving', 2, 0),
      (1, 102, 50, 'improving', 2, 0)
  `).run();
  return db;
}

describe('VAL-GUARD-003: Server evidence guard mechanical error allowlist & topic matching strictness', () => {

  it('1. verifies hasMatchingObjectiveError enforces explicit allowlist/kind/category tags and is re-exported by topicProgress.js', () => {
    assert.equal(hasMatchingObjectiveError, reexportedHasMatching, 'hasMatchingObjectiveError must be re-exported by topicProgress.js');

    const evidence = { topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.9 };

    // Valid objective error
    const validError = [{
      original: "don't",
      correction: "doesn't",
      explanationRu: 'Ошибка',
      topic: 'Subject-Verb Agreement',
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'subject_verb_agreement',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, validError), true, 'Valid grammar_error should match evidence');

    // Prohibited kinds: mechanical, spelling, typo, capitalization, punctuation, style, tone, optional_wording, naturalness, formatting
    const prohibitedKinds = ['mechanical', 'spelling', 'typo', 'capitalization', 'punctuation', 'style', 'tone', 'optional_wording', 'naturalness', 'formatting'];
    for (const kind of prohibitedKinds) {
      const err = [{ ...validError[0], kind }];
      assert.equal(hasMatchingObjectiveError(evidence, err), false, `Kind '${kind}' must be prohibited from negative evidence matching`);
    }

    // Prohibited categories: spelling, typo, capitalization, punctuation, style, tone, optional_wording, naturalness, formatting, wording
    const prohibitedCategories = ['spelling', 'typo', 'capitalization', 'punctuation', 'style', 'tone', 'optional_wording', 'naturalness', 'formatting', 'wording'];
    for (const category of prohibitedCategories) {
      const err = [{ ...validError[0], category }];
      assert.equal(hasMatchingObjectiveError(evidence, err), false, `Category '${category}' must be prohibited from negative evidence matching`);
    }

    // Missing kind or category
    const missingKind = [{ ...validError[0], kind: '' }];
    assert.equal(hasMatchingObjectiveError(evidence, missingKind), false, 'Missing kind must return false');

    const missingCategory = [{ ...validError[0], category: '' }];
    assert.equal(hasMatchingObjectiveError(evidence, missingCategory), false, 'Missing category must return false');

    // original === correction
    const sameWord = [{ ...validError[0], original: 'same', correction: 'same' }];
    assert.equal(hasMatchingObjectiveError(evidence, sameWord), false, 'original === correction must return false');
  });

  it('2. verifies exact canonical topic matching (disallowing topic=null or topic mismatch)', () => {
    const evidence = { topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.9 };

    // Null topic in error
    const nullTopicError = [{
      original: "don't",
      correction: "doesn't",
      explanationRu: 'Ошибка',
      topic: null,
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'subject_verb_agreement',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, nullTopicError), false, 'Error with topic=null must NOT match evidence');

    // Mismatched topic in error
    const mismatchedTopicError = [{
      original: "don't",
      correction: "doesn't",
      explanationRu: 'Ошибка',
      topic: 'Past Simple vs Present Perfect',
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'subject_verb_agreement',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, mismatchedTopicError), false, 'Error with mismatched topic must NOT match evidence');
  });

  it('3. verifies validateAnalyzerResult requires kind and category in schema and forbids default grammar_error fallback', () => {
    const responseWithoutKind = {
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Ошибка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.9,
          category: 'subject_verb_agreement',
        },
      ],
      topicEvidence: [],
    };

    assert.throws(
      () => validateAnalyzerResult(responseWithoutKind),
      { code: 'INVALID_ANALYZER_RESPONSE', statusCode: 502 },
      'Omitted kind must throw 502 without default fallback'
    );

    const responseWithoutCategory = {
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Ошибка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.9,
          kind: 'grammar_error',
        },
      ],
      topicEvidence: [],
    };

    assert.throws(
      () => validateAnalyzerResult(responseWithoutCategory),
      { code: 'INVALID_ANALYZER_RESPONSE', statusCode: 502 },
      'Omitted category must throw 502 without default fallback'
    );
  });

  it('4. clear_error with mechanical/spelling/style/typo error returns zero topic progress DB mutation', async () => {
    const db = createTestDb();
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 102').get();
    const initialProg = getProg();

    // Mock analyzer returning clear_error with mechanical error (kind: mechanical)
    const mockMechanicalAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'I received your message.',
      summaryRu: 'Опечатка в слове.',
      errors: [
        {
          original: 'recieved',
          correction: 'received',
          explanationRu: 'Опечатка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.95,
          kind: 'mechanical',
          category: 'spelling',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Опечатка',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockMechanicalAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-guard-mech-001',
      sourceApp: 'Slack',
      text: 'I recieved your message.',
    });

    // Assessment is sanitized or evidence suppressed
    const postProg = getProg();
    assert.deepEqual(postProg, initialProg, 'Zero DB topic progress mutation for mechanical error');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 0, 'Zero grammar_evidence records inserted for mechanical error');
  });

  it('5. objective error with null or non-canonical topic returns zero topic progress DB mutation', async () => {
    const db = createTestDb();
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 102').get();
    const initialProg = getProg();

    // Mock analyzer returning objective error with topic = null
    const mockNullTopicAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка в согласовании',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Ошибка',
          topic: null,
          confidence: 0.95,
          kind: 'grammar_error',
          category: 'subject_verb_agreement',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Ошибка в согласовании',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockNullTopicAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-guard-null-topic-001',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    const postProg = getProg();
    assert.deepEqual(postProg, initialProg, 'Zero DB topic progress mutation for error with null topic');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 0, 'Zero grammar_evidence records inserted when error topic is null');
  });

  it('6. objective grammar error with exact canonical topic and confidence >= 0.85 updates topic progress exactly once', async () => {
    const db = createTestDb();
    const topicId = 102; // Subject-Verb Agreement
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(topicId);
    const initialProg = getProg();

    const mockValidAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка в согласовании.',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Ошибка в согласовании',
          topic: 'Subject-Verb Agreement',
          confidence: 0.90,
          kind: 'grammar_error',
          category: 'subject_verb_agreement',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.90,
          explanationRu: 'Ошибка в согласовании',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockValidAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-guard-valid-001',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    const postProg = getProg();
    assert.equal(postProg.score, initialProg.score - 2, 'Score decreases by 2');
    assert.equal(postProg.error_count, initialProg.error_count + 1, 'error_count increments by 1');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 1, 'Exactly one grammar_evidence record inserted');
  });

});
