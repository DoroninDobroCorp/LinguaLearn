import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function createTestDb() {
  const db = getDb(':memory:');
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, status) VALUES
      (1, 'owner@example.com', 'hash', 'owner', 'active')
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

describe('VAL-CONTRACT-002: Structured API Contract Fields & Error Categorization', () => {
  it('verifies OpenAPI spec file exists and includes required schema components', () => {
    const openapiPath = path.join(REPO_ROOT, 'docs', 'openapi-writing-analysis-v1.json');
    assert.ok(fs.existsSync(openapiPath), 'OpenAPI specification file must exist at english/docs/openapi-writing-analysis-v1.json');

    const spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
    assert.equal(spec.openapi, '3.0.3');

    const analyzeResponse = spec.components.schemas.AnalyzeResponse;
    assert.ok(analyzeResponse, 'AnalyzeResponse schema must exist in OpenAPI spec');

    const requiredFields = analyzeResponse.required;
    assert.ok(requiredFields.includes('assessment'), 'AnalyzeResponse must require assessment');
    assert.ok(requiredFields.includes('hasClearError'), 'AnalyzeResponse must require hasClearError');
    assert.ok(requiredFields.includes('errors'), 'AnalyzeResponse must require errors');
    assert.ok(requiredFields.includes('topicEvidence'), 'AnalyzeResponse must require topicEvidence');

    const props = analyzeResponse.properties;
    assert.ok(props.assessment, 'AnalyzeResponse must define assessment property');
    assert.deepEqual(props.assessment.enum, ['clear_error', 'mechanical_only', 'acceptable', 'correct']);
    assert.ok(props.hasClearError, 'AnalyzeResponse must define hasClearError property');
    assert.ok(props.recommendedText, 'AnalyzeResponse must define recommendedText property');
    assert.ok(props.mechanicalCorrections, 'AnalyzeResponse must define mechanicalCorrections property');
    assert.ok(props.optionalSuggestions, 'AnalyzeResponse must define optionalSuggestions property');
    assert.ok(props.previewOnly, 'AnalyzeResponse must define previewOnly property');

    assert.ok(spec.components.schemas.MechanicalCorrection, 'MechanicalCorrection schema must be defined');
    assert.ok(spec.components.schemas.OptionalSuggestion, 'OptionalSuggestion schema must be defined');

    const errorDetailProps = spec.components.schemas.ErrorDetail.properties;
    assert.ok(errorDetailProps.original, 'ErrorDetail must define original property');
    assert.ok(errorDetailProps.correction, 'ErrorDetail must define correction property');
    assert.ok(errorDetailProps.kind, 'ErrorDetail must define kind property');
    assert.ok(errorDetailProps.category, 'ErrorDetail must define category property');
  });

  it('POST /api/writing/analyze returns assessment, hasClearError, kind/category error tags, mechanicalCorrections, optionalSuggestions, recommendedText, and previewOnly', async () => {
    const db = createTestDb();

    const mockAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'Yesterday I went to the store.',
      recommendedText: 'Yesterday I went to the store.',
      summaryRu: 'Исправлена форма глагола в прошедшем времени.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Используйте Past Simple для прошедшего времени.',
          topic: 'Past Simple vs Present Perfect',
          confidence: 0.95,
          kind: 'grammar_error',
          category: 'verb_tense',
        },
      ],
      mechanicalCorrections: [
        {
          original: 'teh',
          correction: 'the',
          explanationRu: 'Опечатка в артикле.',
          kind: 'mechanical',
          category: 'spelling',
        },
      ],
      optionalSuggestions: [
        {
          original: 'went to',
          suggestion: 'visited',
          explanationRu: 'Стилистический вариант.',
          kind: 'style',
          category: 'style',
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Неверное время глагола.',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockAnalyzer });

    const result = await service.analyze({
      eventId: 'evt-contract-002-test-1',
      sourceApp: 'Slack',
      text: 'Yesterday I go teh store.',
      previewOnly: false,
    });

    const res = result.response;
    assert.equal(res.accepted, true);
    assert.equal(res.assessment, 'clear_error');
    assert.equal(res.hasClearError, true);
    assert.equal(res.changed, true);
    assert.equal(res.correctedText, 'Yesterday I went to the store.');
    assert.equal(res.recommendedText, 'Yesterday I went to the store.');
    assert.equal(res.previewOnly, false);

    assert.equal(res.errors.length, 1);
    assert.equal(res.errors[0].original, 'go');
    assert.equal(res.errors[0].correction, 'went');
    assert.equal(res.errors[0].kind, 'grammar_error');
    assert.equal(res.errors[0].category, 'verb_tense');

    assert.equal(res.mechanicalCorrections.length, 1);
    assert.equal(res.mechanicalCorrections[0].kind, 'mechanical');
    assert.equal(res.mechanicalCorrections[0].category, 'spelling');

    assert.equal(res.optionalSuggestions.length, 1);
    assert.equal(res.optionalSuggestions[0].kind, 'style');
    assert.equal(res.optionalSuggestions[0].category, 'style');

    assert.equal(res.topicEvidence.length, 1);
    assert.equal(res.topicEvidence[0].outcome, 'error');
  });

  it('ensures mechanical and optional suggestions never become negative evidence or reduce score', async () => {
    const db = createTestDb();

    // Model returns mechanical_only assessment with mechanical corrections and an attempted negative evidence
    const mockMechanicalAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'mechanical_only',
      correctedText: 'I received your message.',
      recommendedText: 'I received your message.',
      summaryRu: 'Опечатка в слове received.',
      errors: [],
      mechanicalCorrections: [
        {
          original: 'recieved',
          correction: 'received',
          explanationRu: 'Опечатка.',
          kind: 'mechanical',
          category: 'spelling',
        },
      ],
      optionalSuggestions: [
        {
          original: 'message',
          suggestion: 'note',
          explanationRu: 'Стилистическое отличие.',
          kind: 'style',
          category: 'style',
        },
      ],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Опечатка не должна снижать балл.',
        },
      ],
    });

    const service = createWritingAnalysisService({ db, analyzer: mockMechanicalAnalyzer });

    const initialProg = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 101').get();

    const result = await service.analyze({
      eventId: 'evt-contract-002-test-mechanical',
      sourceApp: 'Slack',
      text: 'I recieved your message.',
    });

    const res = result.response;
    assert.equal(res.assessment, 'mechanical_only');
    assert.equal(res.hasClearError, false);
    assert.deepEqual(res.errors, []);
    assert.equal(res.mechanicalCorrections.length, 1);
    assert.equal(res.optionalSuggestions.length, 1);

    const postProg = db.prepare('SELECT score FROM user_topic_progress WHERE user_id = 1 AND curriculum_topic_id = 101').get();
    assert.equal(postProg.score, initialProg.score, 'Mechanical & optional suggestions must NEVER decrease topic score');

    const evidenceRows = db.prepare('SELECT * FROM grammar_evidence WHERE writing_sample_id = ?').all(res.sampleId);
    assert.equal(evidenceRows.length, 0, 'No negative evidence stored in DB for mechanical_only');
  });
});
