import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';

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

describe('Strict Corrections & Server Evidence Guard (VAL-TIER-001 & VAL-GUARD-001)', () => {
  it('VAL-TIER-001: returns 4-tier assessment field and enforces empty errors for non-clear_error', async () => {
    const db = createTestDb();

    // Test case 1: clear_error
    const mockAnalyzerClearError = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Ошибка в согласовании подлежащего и сказуемого.',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Для третьего лица единственного числа нужно использовать doesn’t.',
          topic: 'Subject-Verb Agreement',
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
          explanationRu: 'Ошибка в согласовании подлежащего и сказуемого.',
        },
      ],
    });

    const service1 = createWritingAnalysisService({ db, analyzer: mockAnalyzerClearError });
    const res1 = await service1.analyze({
      eventId: 'evt-clear-error-001',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    assert.equal(res1.response.assessment, 'clear_error');
    assert.equal(res1.response.errors.length, 1);

    // Test case 2: mechanical_only
    const mockAnalyzerMechanical = async () => ({
      isEnglish: true,
      assessment: 'mechanical_only',
      correctedText: 'I received your message.',
      summaryRu: 'Опечатка в слове received.',
      errors: [],
      topicEvidence: [],
    });

    const service2 = createWritingAnalysisService({ db, analyzer: mockAnalyzerMechanical });
    const res2 = await service2.analyze({
      eventId: 'evt-mechanical-001',
      sourceApp: 'Slack',
      text: 'I recieved your mesage.',
    });

    assert.equal(res2.response.assessment, 'mechanical_only');
    assert.deepEqual(res2.response.errors, []);

    // Test case 3: acceptable
    const mockAnalyzerAcceptable = async () => ({
      isEnglish: true,
      assessment: 'acceptable',
      correctedText: 'Can you send me an update?',
      summaryRu: 'Фраза грамматически верна.',
      errors: [],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'success',
          confidence: 0.88,
          explanationRu: 'Правильное использование конструкции.',
        },
      ],
    });

    const service3 = createWritingAnalysisService({ db, analyzer: mockAnalyzerAcceptable });
    const res3 = await service3.analyze({
      eventId: 'evt-acceptable-001',
      sourceApp: 'Slack',
      text: 'Can you send me an update?',
    });

    assert.equal(res3.response.assessment, 'acceptable');
    assert.deepEqual(res3.response.errors, []);

    // Test case 4: correct
    const mockAnalyzerCorrect = async () => ({
      isEnglish: true,
      assessment: 'correct',
      correctedText: 'I went to the store yesterday.',
      summaryRu: 'Предложение полностью корректно.',
      errors: [],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'success',
          confidence: 0.95,
          explanationRu: 'Правильное время Past Simple.',
        },
      ],
    });

    const service4 = createWritingAnalysisService({ db, analyzer: mockAnalyzerCorrect });
    const res4 = await service4.analyze({
      eventId: 'evt-correct-001',
      sourceApp: 'Slack',
      text: 'I went to the store yesterday.',
    });

    assert.equal(res4.response.assessment, 'correct');
    assert.deepEqual(res4.response.errors, []);
  });

  it('VAL-GUARD-001: blocks progress deductions for non-clear_error inputs and enforces confidence >= 0.85 threshold', async () => {
    const db = createTestDb();
    const svaTopic = db.prepare("SELECT id FROM curriculum_topics WHERE name = 'Subject-Verb Agreement'").get();
    assert.ok(svaTopic, 'Subject-Verb Agreement topic must exist');
    const svaTopicId = svaTopic.id;

    // 1. Contradictory model output: mechanical_only with negative topicEvidence & non-empty errors
    const mockContradictoryMechanical = async () => ({
      isEnglish: true,
      assessment: 'mechanical_only',
      correctedText: 'I received your message.',
      summaryRu: 'Опечатки.',
      errors: [
        {
          original: 'recieved',
          correction: 'received',
          explanationRu: 'Опечатка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.9,
          kind: 'mechanical',
          category: 'spelling',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.9,
          explanationRu: 'Опечатка не должна снижать балл',
        },
      ],
    });

    const service1 = createWritingAnalysisService({ db, analyzer: mockContradictoryMechanical });
    const initialProg = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(svaTopicId);

    const res1 = await service1.analyze({
      eventId: 'evt-guard-001',
      sourceApp: 'Slack',
      text: 'I recieved your message.',
    });

    assert.equal(res1.response.assessment, 'mechanical_only');
    assert.deepEqual(res1.response.errors, []);
    const postProg1 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(svaTopicId);
    assert.equal(postProg1.score, initialProg.score, 'Progress score must not change for mechanical_only');

    const evRows1 = db.prepare("SELECT * FROM grammar_evidence WHERE writing_sample_id = ? AND outcome = 'error'").all(res1.response.sampleId);
    assert.equal(evRows1.length, 0, 'Negative grammar_evidence must be suppressed for mechanical_only');

    // 2. clear_error with confidence 0.80 (< 0.85 threshold for negative evidence)
    const mockLowConfidenceError = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'She does not know.',
      summaryRu: 'Возможная ошибка.',
      errors: [
        {
          original: "don't",
          correction: "doesn't",
          explanationRu: 'Возможная ошибка',
          topic: 'Subject-Verb Agreement',
          confidence: 0.80,
          kind: 'grammar_error',
          category: 'subject_verb_agreement',
        },
      ],
      topicEvidence: [
        {
          topic: 'Subject-Verb Agreement',
          outcome: 'error',
          confidence: 0.80,
          explanationRu: 'Низкая уверенность',
        },
      ],
    });

    const service2 = createWritingAnalysisService({ db, analyzer: mockLowConfidenceError });
    const res2 = await service2.analyze({
      eventId: 'evt-guard-002',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    assert.equal(res2.response.assessment, 'clear_error');
    const postProg2 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(svaTopicId);
    assert.equal(postProg2.score, initialProg.score, 'Confidence < 0.85 must NOT reduce topic progress score');

    // 3. clear_error with confidence 0.90 (>= 0.85 threshold for negative evidence)
    const mockHighConfidenceError = async () => ({
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
          explanationRu: 'Высокая уверенность',
        },
      ],
    });

    const service3 = createWritingAnalysisService({ db, analyzer: mockHighConfidenceError });
    const res3 = await service3.analyze({
      eventId: 'evt-guard-003',
      sourceApp: 'Slack',
      text: "She don't know.",
    });

    assert.equal(res3.response.assessment, 'clear_error');
    const postProg3 = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = ?').get(svaTopicId);
    assert.equal(postProg3.score, initialProg.score - 2, 'Confidence >= 0.85 for clear_error MUST reduce topic progress score by 2');
  });

  it('VAL-GUARD-002: verifies DB fields before and after for confidence threshold, non-clear_error, and matching objective error', async () => {
    const db = createTestDb();
    const topic = db.prepare("SELECT id FROM curriculum_topics WHERE name = 'Subject-Verb Agreement'").get();
    const topicId = topic.id;

    // Helper to query all fields of user_topic_progress
    const getProgState = () => db.prepare(`
      SELECT score, status, error_count, success_count, unique_practice_days, last_error_at, last_success_at, last_practiced
      FROM user_topic_progress
      WHERE user_id = 1 AND curriculum_topic_id = ?
    `).get(topicId);

    const initialState = getProgState();
    assert.deepEqual(initialState, {
      score: 50,
      status: 'improving',
      error_count: 0,
      success_count: 2,
      unique_practice_days: 0,
      last_error_at: null,
      last_success_at: null,
      last_practiced: null,
    });

    // 1. confidence < 0.85 (e.g. 0.80) with clear_error -> suppresses grammar_evidence and leaves all fields strictly unchanged
    const serviceLowConf = createWritingAnalysisService({
      db,
      analyzer: async () => ({
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'She does not know.',
        summaryRu: 'Возможная ошибка',
        errors: [{ original: "don't", correction: "doesn't", explanationRu: 'Ошибка', topic: 'Subject-Verb Agreement', confidence: 0.80, kind: 'grammar_error', category: 'subject_verb_agreement' }],
        topicEvidence: [{ topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.80, explanationRu: 'Ошибка' }],
      }),
    });

    const resLowConf = await serviceLowConf.analyze({ eventId: 'val-guard-low-conf-1', sourceApp: 'Slack', text: "She don't know." });
    const postLowConfState = getProgState();
    assert.deepEqual(postLowConfState, initialState, 'ALL DB fields must remain strictly unchanged when confidence < 0.85');
    const lowConfEvidenceCount = db.prepare("SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?").get(resLowConf.response.sampleId).c;
    assert.equal(lowConfEvidenceCount, 0, 'No grammar_evidence inserted when confidence < 0.85');

    // 2. non-clear_error assessment (mechanical_only) -> produces zero negative evidence and zero progress impact
    const serviceMechanical = createWritingAnalysisService({
      db,
      analyzer: async () => ({
        isEnglish: true,
        assessment: 'mechanical_only',
        correctedText: 'She does not know.',
        summaryRu: 'Опечатка',
        errors: [],
        topicEvidence: [{ topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.95, explanationRu: 'Ошибка' }],
      }),
    });

    const resMechanical = await serviceMechanical.analyze({ eventId: 'val-guard-mechanical-1', sourceApp: 'Slack', text: "She does not know" });
    const postMechanicalState = getProgState();
    assert.deepEqual(postMechanicalState, initialState, 'ALL DB fields must remain strictly unchanged for non-clear_error');
    const mechanicalEvidenceCount = db.prepare("SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?").get(resMechanical.response.sampleId).c;
    assert.equal(mechanicalEvidenceCount, 0, 'No grammar_evidence inserted for mechanical_only');

    // 3. clear_error with confidence >= 0.85 BUT NO matching objective error in errors[] (mismatched topic or original === correction)
    const serviceNoMatchingError = createWritingAnalysisService({
      db,
      analyzer: async () => ({
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'She does not know.',
        summaryRu: 'Ошибка',
        errors: [{ original: 'same', correction: 'same', explanationRu: 'Не ошибка', topic: 'Subject-Verb Agreement', confidence: 0.95, kind: 'grammar_error', category: 'grammar' }],
        topicEvidence: [{ topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.95, explanationRu: 'Ошибка' }],
      }),
    });

    const resNoMatchingError = await serviceNoMatchingError.analyze({ eventId: 'val-guard-no-matching-1', sourceApp: 'Slack', text: "She don't know." });
    const postNoMatchingState = getProgState();
    assert.deepEqual(postNoMatchingState, initialState, 'ALL DB fields must remain strictly unchanged when no matching objective error exists in errors[]');
    const noMatchingEvidenceCount = db.prepare("SELECT COUNT(*) AS c FROM grammar_evidence WHERE writing_sample_id = ?").get(resNoMatchingError.response.sampleId).c;
    assert.equal(noMatchingEvidenceCount, 0, 'No grammar_evidence inserted when matching objective error is missing');

    // 4. clear_error with confidence >= 0.85 AND matching objective error in errors[] -> records negative evidence and updates fields
    const serviceValidError = createWritingAnalysisService({
      db,
      analyzer: async () => ({
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'She does not know.',
        summaryRu: 'Ошибка в согласовании подлежащего и сказуемого.',
        errors: [{ original: "don't", correction: "doesn't", explanationRu: 'Используйте doesn’t.', topic: 'Subject-Verb Agreement', confidence: 0.90, kind: 'grammar_error', category: 'subject_verb_agreement' }],
        topicEvidence: [{ topic: 'Subject-Verb Agreement', outcome: 'error', confidence: 0.90, explanationRu: 'Ошибка в согласовании.' }],
      }),
    });

    const resValidError = await serviceValidError.analyze({ eventId: 'val-guard-valid-1', sourceApp: 'Slack', text: "She don't know." });
    const postValidState = getProgState();

    assert.equal(postValidState.score, 48, 'Score decreases by 2');
    assert.equal(postValidState.error_count, 1, 'error_count increments to 1');
    assert.equal(postValidState.success_count, 2, 'success_count remains 2');
    assert.equal(postValidState.unique_practice_days, 1, 'unique_practice_days updates to 1');
    assert.ok(postValidState.last_error_at !== null, 'last_error_at is set');
    assert.ok(postValidState.last_practiced !== null, 'last_practiced is set');
    assert.equal(postValidState.status, 'recurring_problem', 'status recalculated to recurring_problem when error occurs');

    const validEvidenceRows = db.prepare("SELECT * FROM grammar_evidence WHERE writing_sample_id = ?").all(resValidError.response.sampleId);
    assert.equal(validEvidenceRows.length, 1, 'Exactly one grammar_evidence row inserted for valid clear_error');
    assert.equal(validEvidenceRows[0].outcome, 'error');
    assert.equal(validEvidenceRows[0].score_delta, -2);
  });
});
