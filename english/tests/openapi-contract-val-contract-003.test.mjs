import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';
import {
  openApiSpec,
  checkAnalyzeResponse,
  assertValidAnalyzeResponse,
  validateAnalyzeRequest,
  validateAnalyzeResponse,
  validateErrorDetail,
} from '../server/contractValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '../..');

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

describe('VAL-CONTRACT-003: Single Canonical OpenAPI Spec & Ajv Schema Validation', () => {
  it('1. Verifies single canonical OpenAPI 3.0 specification file exists with required properties', () => {
    const canonicalPath = path.join(REPO_ROOT, 'docs', 'openapi-writing-analysis-v1.json');
    assert.ok(fs.existsSync(canonicalPath), `Canonical OpenAPI spec must exist at ${canonicalPath}`);

    const spec = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.title, 'LinguaLearn Multi-Platform Writing Analysis API');

    // Check paths
    assert.ok(spec.paths['/api/writing/analyze'], '/api/writing/analyze path must be defined');
    assert.ok(spec.paths['/api/writing/samples/{id}/feedback'], '/api/writing/samples/{id}/feedback path must be defined');
    assert.ok(spec.paths['/api/devices/tokens'], '/api/devices/tokens path must be defined');
    assert.ok(spec.paths['/api/devices/tokens/{id}/revoke'], '/api/devices/tokens/{id}/revoke path must be defined');

    // Check schemas
    const schemas = spec.components.schemas;
    assert.ok(schemas.AnalyzeResponse, 'AnalyzeResponse schema must be defined');
    assert.ok(schemas.AnalyzeRequest, 'AnalyzeRequest schema must be defined');
    assert.ok(schemas.ErrorDetail, 'ErrorDetail schema must be defined');
    assert.ok(schemas.MechanicalCorrection, 'MechanicalCorrection schema must be defined');
    assert.ok(schemas.OptionalSuggestion, 'OptionalSuggestion schema must be defined');
    assert.ok(schemas.TopicEvidence, 'TopicEvidence schema must be defined');

    // Verify boolean accepted & previewOnly in AnalyzeResponse schema
    const responseProps = schemas.AnalyzeResponse.properties;
    assert.equal(responseProps.accepted.type, 'boolean', 'AnalyzeResponse.accepted must be type boolean');
    assert.equal(responseProps.previewOnly.type, 'boolean', 'AnalyzeResponse.previewOnly must be type boolean');
    assert.equal(responseProps.hasClearError.type, 'boolean', 'AnalyzeResponse.hasClearError must be type boolean');
    assert.equal(responseProps.changed.type, 'boolean', 'AnalyzeResponse.changed must be type boolean');

    // Verify boolean previewOnly in AnalyzeRequest schema
    const requestProps = schemas.AnalyzeRequest.properties;
    assert.equal(requestProps.previewOnly.type, 'boolean', 'AnalyzeRequest.previewOnly must be type boolean');

    // Verify mandatory kind and category in ErrorDetail
    const errorDetailRequired = schemas.ErrorDetail.required;
    assert.ok(errorDetailRequired.includes('kind'), 'ErrorDetail must require kind');
    assert.ok(errorDetailRequired.includes('category'), 'ErrorDetail must require category');
    assert.ok(errorDetailRequired.includes('original'), 'ErrorDetail must require original');
    assert.ok(errorDetailRequired.includes('correction'), 'ErrorDetail must require correction');
    assert.ok(errorDetailRequired.includes('explanationRu'), 'ErrorDetail must require explanationRu');
  });

  it('2. Validates client test fixtures against canonical Ajv schemas', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');

    // Request fixture
    const reqPath = path.join(fixturesDir, 'sample-analysis-payload.json');
    const reqFixture = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
    assert.ok(validateAnalyzeRequest(reqFixture), 'sample-analysis-payload.json must pass Ajv AnalyzeRequest validation');

    // Response fixtures
    const resClearErrorPath = path.join(fixturesDir, 'sample-analysis-response-clear-error.json');
    const resClearErrorFixture = JSON.parse(fs.readFileSync(resClearErrorPath, 'utf8'));
    assertValidAnalyzeResponse(resClearErrorFixture);

    const resMechanicalPath = path.join(fixturesDir, 'sample-analysis-response-mechanical.json');
    const resMechanicalFixture = JSON.parse(fs.readFileSync(resMechanicalPath, 'utf8'));
    assertValidAnalyzeResponse(resMechanicalFixture);

    const resCorrectPath = path.join(fixturesDir, 'sample-analysis-response-correct.json');
    const resCorrectFixture = JSON.parse(fs.readFileSync(resCorrectPath, 'utf8'));
    assertValidAnalyzeResponse(resCorrectFixture);
  });

  it('3. Validates real POST /api/writing/analyze response payloads via Ajv across 4 assessment tiers', async () => {
    const db = createTestDb();

    // 1. Clear Error Tier
    const clearErrorAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'clear_error',
      correctedText: 'Yesterday I went to the store.',
      recommendedText: 'Yesterday I went to the store.',
      summaryRu: 'Неверное время глагола.',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'Используйте Past Simple.',
          topic: 'Past Simple vs Present Perfect',
          confidence: 0.95,
          kind: 'grammar_error',
          category: 'verb_tense',
        },
      ],
      mechanicalCorrections: [],
      optionalSuggestions: [],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'error',
          confidence: 0.95,
          explanationRu: 'Ошибка в времени глагола.',
        },
      ],
    });

    const serviceClearError = createWritingAnalysisService({ db, analyzer: clearErrorAnalyzer });
    const resultClearError = await serviceClearError.analyze({
      eventId: 'evt-val-003-clear-error',
      sourceApp: 'Slack',
      text: 'Yesterday I go to the store.',
      previewOnly: false,
    });
    assertValidAnalyzeResponse(resultClearError.response);

    // 2. Mechanical Only Tier
    const mechanicalAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'mechanical_only',
      correctedText: 'She received the message.',
      recommendedText: 'She received the message.',
      summaryRu: 'Опечатка.',
      errors: [],
      mechanicalCorrections: [
        {
          original: 'recieved',
          correction: 'received',
          explanationRu: 'Исправление опечатки.',
          kind: 'mechanical',
          category: 'spelling',
        },
      ],
      optionalSuggestions: [],
      topicEvidence: [],
    });

    const serviceMechanical = createWritingAnalysisService({ db, analyzer: mechanicalAnalyzer });
    const resultMechanical = await serviceMechanical.analyze({
      eventId: 'evt-val-003-mechanical',
      sourceApp: 'Slack',
      text: 'She recieved the message.',
      previewOnly: false,
    });
    assertValidAnalyzeResponse(resultMechanical.response);

    // 3. Acceptable Tier with optional suggestions
    const acceptableAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'acceptable',
      correctedText: 'I think this is very good.',
      recommendedText: 'I think this is excellent.',
      summaryRu: 'Предложение приемлемо.',
      errors: [],
      mechanicalCorrections: [],
      optionalSuggestions: [
        {
          original: 'very good',
          suggestion: 'excellent',
          explanationRu: 'Стилистическое предложение.',
          kind: 'style',
          category: 'style',
        },
      ],
      topicEvidence: [],
    });

    const serviceAcceptable = createWritingAnalysisService({ db, analyzer: acceptableAnalyzer });
    const resultAcceptable = await serviceAcceptable.analyze({
      eventId: 'evt-val-003-acceptable',
      sourceApp: 'Slack',
      text: 'I think this is very good.',
      previewOnly: true,
    });
    assertValidAnalyzeResponse(resultAcceptable.response);

    // 4. Correct Tier
    const correctAnalyzer = async () => ({
      isEnglish: true,
      assessment: 'correct',
      correctedText: 'She went home.',
      recommendedText: 'She went home.',
      summaryRu: 'Всё верно.',
      errors: [],
      mechanicalCorrections: [],
      optionalSuggestions: [],
      topicEvidence: [
        {
          topic: 'Past Simple vs Present Perfect',
          outcome: 'success',
          confidence: 0.92,
          explanationRu: 'Правильное использование Past Simple.',
        },
      ],
    });

    const serviceCorrect = createWritingAnalysisService({ db, analyzer: correctAnalyzer });
    const resultCorrect = await serviceCorrect.analyze({
      eventId: 'evt-val-003-correct',
      sourceApp: 'Slack',
      text: 'She went home.',
      previewOnly: false,
    });
    assertValidAnalyzeResponse(resultCorrect.response);
  });

  it('4. Confirms Ajv contract validator flags invalid response payloads', () => {
    // Missing required field 'accepted'
    const missingAccepted = {
      schemaVersion: 1,
      eventId: 'evt-inv-1',
      originalText: 'test',
      correctedText: 'test',
      assessment: 'correct',
      hasClearError: false,
      changed: false,
      summaryRu: '',
      errors: [],
      topicEvidence: [],
    };
    const res1 = checkAnalyzeResponse(missingAccepted);
    assert.equal(res1.valid, false, 'Payload missing accepted must fail validation');

    // Integer accepted instead of boolean
    const integerAccepted = {
      ...missingAccepted,
      accepted: 1,
    };
    const res2 = checkAnalyzeResponse(integerAccepted);
    assert.equal(res2.valid, false, 'Integer accepted must fail boolean validation');

    // Missing mandatory kind/category in ErrorDetail
    const invalidErrorDetail = {
      accepted: true,
      schemaVersion: 1,
      eventId: 'evt-inv-2',
      originalText: 'test',
      correctedText: 'test',
      assessment: 'clear_error',
      hasClearError: true,
      changed: true,
      summaryRu: '',
      errors: [
        {
          original: 'go',
          correction: 'went',
          explanationRu: 'error',
          // missing kind and category
        },
      ],
      topicEvidence: [],
    };
    const res3 = checkAnalyzeResponse(invalidErrorDetail);
    assert.equal(res3.valid, false, 'ErrorDetail missing kind/category must fail validation');
  });
});
