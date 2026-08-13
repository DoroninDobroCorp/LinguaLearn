import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db.js';
import {
  createWritingAnalysisService,
  hasMatchingObjectiveError,
  validateAnalyzerResult,
  OBJECTIVE_GRAMMAR_CATEGORIES,
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
      (101, 'Past Simple (irregular verbs)', 'grammar', 'A2', 'preset'),
      (102, 'Subject-Verb Agreement', 'grammar', 'B1', 'preset')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO user_topic_progress (user_id, curriculum_topic_id, score, status, success_count, error_count) VALUES
      (1, 101, 50, 'improving', 2, 0),
      (1, 102, 50, 'improving', 2, 0)
  `).run();
  return db;
}

describe('VAL-GUARD-004: Strict Guard Allowlist & Exact Topic Matching DB Regression Suite', () => {

  it('1. verifies OBJECTIVE_GRAMMAR_CATEGORIES is an immutable frozen Set of objective categories', () => {
    assert.ok(OBJECTIVE_GRAMMAR_CATEGORIES instanceof Set, 'OBJECTIVE_GRAMMAR_CATEGORIES must be a Set');
    assert.ok(Object.isFrozen(OBJECTIVE_GRAMMAR_CATEGORIES), 'OBJECTIVE_GRAMMAR_CATEGORIES must be frozen');
    assert.ok(OBJECTIVE_GRAMMAR_CATEGORIES.has('verb_tense'), 'Must include verb_tense');
    assert.ok(OBJECTIVE_GRAMMAR_CATEGORIES.has('subject_verb_agreement'), 'Must include subject_verb_agreement');
    assert.ok(OBJECTIVE_GRAMMAR_CATEGORIES.has('articles'), 'Must include articles');
    assert.ok(OBJECTIVE_GRAMMAR_CATEGORIES.has('prepositions'), 'Must include prepositions');
    assert.ok(!OBJECTIVE_GRAMMAR_CATEGORIES.has('spelling'), 'Must NOT include spelling');
    assert.ok(!OBJECTIVE_GRAMMAR_CATEGORIES.has('style'), 'Must NOT include style');
    assert.ok(!OBJECTIVE_GRAMMAR_CATEGORIES.has('mechanical'), 'Must NOT include mechanical');
    assert.ok(!OBJECTIVE_GRAMMAR_CATEGORIES.has('unknown_category'), 'Must NOT include unknown_category');
  });

  it('2. verifies hasMatchingObjectiveError requires kind === grammar_error and category in allowlist', () => {
    assert.equal(hasMatchingObjectiveError, reexportedHasMatching, 'hasMatchingObjectiveError must be reexported by topicProgress.js');

    const evidence = { topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.9 };

    const validError = [{
      original: "don't",
      correction: "doesn't",
      explanationRu: 'Ошибка в согласовании.',
      topic: 'Subject-Verb Agreement',
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'subject_verb_agreement',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, validError), true, 'Valid grammar_error and category in allowlist should return true');

    // Test non-grammar_error kinds (must return false)
    const invalidKinds = ['grammar', 'mechanical', 'style', 'spelling', 'typo', 'formatting'];
    for (const kind of invalidKinds) {
      const err = [{ ...validError[0], kind }];
      assert.equal(hasMatchingObjectiveError(evidence, err), false, `Kind '${kind}' must return false`);
    }

    // Test unknown / disallowed categories (must return false)
    const invalidCategories = ['spelling', 'typo', 'punctuation', 'style', 'wording', 'unknown_cat', 'foo'];
    for (const category of invalidCategories) {
      const err = [{ ...validError[0], category }];
      assert.equal(hasMatchingObjectiveError(evidence, err), false, `Category '${category}' must return false`);
    }
  });

  it('3. verifies exact case-insensitive normalized topic matching (no substring matches or topic=null)', () => {
    const evidence = { topic: 'Past Simple (irregular verbs)', outcome: 'error', confidence: 0.9 };

    // Exact match (case insensitive)
    const exactMatchError = [{
      original: 'go',
      correction: 'went',
      explanationRu: 'Ошибка.',
      topic: 'past simple (irregular verbs)',
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'verb_tense',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, exactMatchError), true, 'Exact case-insensitive match must return true');

    // Substring match: "Past Simple" vs "Past Simple (irregular verbs)"
    const substringTopicError = [{
      original: 'go',
      correction: 'went',
      explanationRu: 'Ошибка.',
      topic: 'Past Simple',
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'verb_tense',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, substringTopicError), false, 'Substring topic match ("Past Simple" vs "Past Simple (irregular verbs)") must return false');

    // Topic = null
    const nullTopicError = [{
      original: 'go',
      correction: 'went',
      explanationRu: 'Ошибка.',
      topic: null,
      confidence: 0.9,
      kind: 'grammar_error',
      category: 'verb_tense',
    }];
    assert.equal(hasMatchingObjectiveError(evidence, nullTopicError), false, 'topic=null must return false');
  });

  it('4. DB regression: unknown category error results in zero topic progress DB mutation and zero grammar_evidence', async () => {
    const db = createTestDb();
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 102').get();
    const initialProg = getProg();

    const mockUnknownCategoryAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка.',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Ошибка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.95,
          kind: 'grammar_error',
          category: 'unknown_custom_category',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Ошибка',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockUnknownCategoryAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-strict-unknown-cat-001',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    const postProg = getProg();
    assert.deepEqual(postProg, initialProg, 'DB topic progress must not be mutated for unknown category');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 0, 'Zero grammar_evidence inserted for unknown category');
  });

  it('5. DB regression: style / mechanical kind results in zero topic progress DB mutation', async () => {
    const db = createTestDb();
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 102').get();
    const initialProg = getProg();

    const mockStyleKindAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Стиль.',
      errors: [
        {
          original: "don't",
          correction: "does not",
          explanationRu: 'Стилистический совет',
          topic: 'Subject-Verb Agreement',
          confidence: 0.95,
          kind: 'style',
          category: 'subject_verb_agreement',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Стилистический совет',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockStyleKindAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-strict-style-kind-001',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    const postProg = getProg();
    assert.deepEqual(postProg, initialProg, 'DB topic progress must not be mutated for non-grammar_error kind');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 0, 'Zero grammar_evidence inserted for non-grammar_error kind');
  });

  it('6. DB regression: topic=null or substring topic match results in zero topic progress DB mutation', async () => {
    const db = createTestDb();
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 101').get();
    const initialProg = getProg();

    const mockSubstringTopicAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'Yesterday I went to the store.',
      summaryRu: 'Неверное время.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Past Simple',
          topic: 'Past Simple', // Substring of "Past Simple (irregular verbs)"
          confidence: 0.95,
          kind: 'grammar_error',
          category: 'verb_tense',
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple (irregular verbs)',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Неверная форма глагола',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockSubstringTopicAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-strict-substring-topic-001',
      sourceApp: 'Slack',
      text: 'Yesterday I go to the store.',
    });

    const postProg = getProg();
    assert.deepEqual(postProg, initialProg, 'DB topic progress must not be mutated for topic substring mismatch');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 0, 'Zero grammar_evidence inserted when topic is a substring mismatch');
  });

  it('7. DB regression: valid objective grammar error with exact topic match and confidence >= 0.85 updates topic progress', async () => {
    const db = createTestDb();
    const topicId = 101; // Past Simple (irregular verbs)
    const getProg = () => db.prepare('SELECT score, error_count, status FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(topicId);
    const initialProg = getProg();

    const mockValidAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'Yesterday I went to the store.',
      summaryRu: 'Исправлена форма Past Simple.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Нужен Past Simple.',
          topic: 'Past Simple (irregular verbs)',
          confidence: 0.92,
          kind: 'grammar_error',
          category: 'verb_tense',
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple (irregular verbs)',
          outcome: 'error',
          confidence: 0.92,
          explanationRu: 'Ошибка в Past Simple.',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockValidAnalyzer });
    const res = await service.analyze({
      eventId: 'evt-strict-valid-001',
      sourceApp: 'Slack',
      text: 'Yesterday I go to the store.',
    });

    const postProg = getProg();
    assert.equal(postProg.score, initialProg.score - 2, 'Score decreases by 2 for valid exact topic match');
    assert.equal(postProg.error_count, initialProg.error_count + 1, 'error_count increments');

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?').get(res.response.sampleId).c;
    assert.equal(evidenceCount, 1, 'Exactly 1 grammar_evidence row inserted for valid objective error');
  });

});
