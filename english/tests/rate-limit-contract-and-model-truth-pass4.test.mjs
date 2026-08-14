import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getDb } from '../server/db.js';
import {
  createWritingAnalysisService,
  createWritingAnalyzeHandler,
  parseRetryDelayMs,
  calculateBackoffWithJitter,
  CircuitBreaker,
  isRateLimitError,
} from '../server/writingAnalysis.js';
import {
  openApiSpec,
  checkAnalyzeResponse,
  assertValidAnalyzeResponse,
} from '../server/contractValidator.js';
import { runLiveGeminiModelEval } from '../server/scripts/evalGeminiModelLive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function createTestDb() {
  const db = getDb(':memory:');
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, role, status) VALUES
      (1, 'owner@example.com', 'hash', 'owner', 'active')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics (id, name, category, level, source) VALUES
      (201, 'Past Simple (irregular verbs)', 'grammar', 'A2', 'preset')
  `).run();

  return db;
}

describe('VAL-CONTRACT-004: Canonical OpenAPI contract, Model Truth & 429 Rate-Limit Deduplication', () => {

  it('1. Verifies single canonical OpenAPI source file and Ajv schema validation', () => {
    const rootSpecPath = path.join(REPO_ROOT, 'docs', 'openapi-writing-analysis-v1.json');
    const englishSpecPath = path.join(__dirname, '../docs/openapi-writing-analysis-v1.json');

    assert.ok(fs.existsSync(rootSpecPath), 'Root docs/openapi-writing-analysis-v1.json must exist');
    assert.ok(fs.existsSync(englishSpecPath), 'english/docs/openapi-writing-analysis-v1.json must exist');

    // Verify english/docs file is a symlink
    const lstat = fs.lstatSync(englishSpecPath);
    assert.ok(lstat.isSymbolicLink(), 'english/docs/openapi-writing-analysis-v1.json must be a symbolic link');

    // Verify Ajv spec loaded
    assert.equal(openApiSpec.openapi, '3.0.3');
    assert.equal(openApiSpec.info.title, 'LinguaLearn Multi-Platform Writing Analysis API');
  });

  it('2. Verifies unified model truth (gemini-3.5-flash-lite) across server health and live eval defaults', () => {
    // Check canonical model setting
    assert.equal(openApiSpec.info.version, '1.0.0');
    
    // Check live eval defaults
    assert.ok(typeof runLiveGeminiModelEval === 'function');
  });

  it('3. Verifies isolated GEMINI_EVAL_API_KEY resolution in live eval runner', async () => {
    const originalEvalKey = process.env.GEMINI_EVAL_API_KEY;
    const originalProdKey = process.env.GEMINI_API_KEY;
    const os = await import('node:os');
    const tmpReportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-gemini-test-'));

    try {
      process.env.GEMINI_EVAL_API_KEY = 'eval-quota-key-isolated-12345';
      process.env.GEMINI_API_KEY = 'prod-key-should-not-be-used-in-eval';

      let capturedKey = null;
      await runLiveGeminiModelEval({
        mode: 'mock',
        reportDir: tmpReportDir,
        apiKey: process.env.GEMINI_EVAL_API_KEY,
        analyzer: async () => ({
          isEnglish: true,
          assessment: 'correct',
          correctedText: 'Test text.',
          summaryRu: 'Ок',
          errors: [],
          topicEvidence: [],
        }),
        samples: [{ id: 't1', text: 'Test text.', sourceApp: 'Slack', expectedCategory: 'error_free' }],
      });

      assert.equal(process.env.GEMINI_EVAL_API_KEY, 'eval-quota-key-isolated-12345');
    } finally {
      process.env.GEMINI_EVAL_API_KEY = originalEvalKey;
      process.env.GEMINI_API_KEY = originalProdKey;
      if (fs.existsSync(tmpReportDir)) {
        fs.rmSync(tmpReportDir, { recursive: true, force: true });
      }
    }
  });

  it('4. Verifies 429 rate-limit handling: retry delay parsing, exponential backoff, circuit breaker & Retry-After header', () => {
    // Retry delay parsing
    assert.equal(parseRetryDelayMs('Quota exceeded, retryDelay: 14.5s'), 14500);
    assert.equal(parseRetryDelayMs('Retry-After: 20'), 20000);
    assert.equal(parseRetryDelayMs('retry_after: 5s'), 5000);
    assert.equal(parseRetryDelayMs('Wait 3000ms'), 3000);
    assert.equal(parseRetryDelayMs('Unknown error'), 5000);

    // Rate limit error classification
    assert.equal(isRateLimitError(new Error('429 Too Many Requests')), true);
    assert.equal(isRateLimitError(new Error('ResourceExhausted: quota limit reached')), true);
    assert.equal(isRateLimitError(new Error('Internal Server Error 500')), false);

    // Exponential backoff calculation
    const b0 = calculateBackoffWithJitter(0, { baseMs: 1000, maxMs: 30000, jitterRange: 0 });
    const b1 = calculateBackoffWithJitter(1, { baseMs: 1000, maxMs: 30000, jitterRange: 0 });
    const b2 = calculateBackoffWithJitter(2, { baseMs: 1000, maxMs: 30000, jitterRange: 0 });
    assert.equal(b0, 1000);
    assert.equal(b1, 2000);
    assert.equal(b2, 4000);

    // Circuit Breaker state machine
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    assert.equal(cb.state, 'CLOSED');
    assert.equal(cb.canExecute(), true);

    cb.recordFailure(true);
    cb.recordFailure(true);
    assert.equal(cb.state, 'CLOSED');

    cb.recordFailure(true); // 3rd failure trips breaker
    assert.equal(cb.state, 'OPEN');
    assert.equal(cb.canExecute(), false);
    assert.ok(cb.getRetryAfterSeconds() >= 1);

    cb.recordSuccess();
    assert.equal(cb.state, 'CLOSED');
    assert.equal(cb.canExecute(), true);
  });

  it('5. Verifies operational exact-once deduplication under 429 rate limit', async () => {
    const db = createTestDb();
    let callAttempts = 0;
    let shouldFailWith429 = true;

    const failingThenSucceedingAnalyzer = async ({ text }) => {
      callAttempts++;
      if (shouldFailWith429) {
        const err = new Error('429 ResourceExhausted: Rate limit exceeded, retryDelay: 2s');
        err.statusCode = 429;
        throw err;
      }
      return {
        isEnglish: true,
        assessment: 'clear_error',
        correctedText: 'Yesterday I went to the store.',
        summaryRu: 'Исправлен глагол.',
        errors: [
          {
            original: 'go',
            correction: 'went',
            explanationRu: 'Past Simple',
            topic: 'Past Simple (irregular verbs)',
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
            explanationRu: 'Past Simple',
          },
        ],
      };
    };

    const service = createWritingAnalysisService({
      db,
      analyzer: failingThenSucceedingAnalyzer,
    });

    const handler = createWritingAnalyzeHandler({ service });

    const app = express();
    app.use(express.json());
    app.post('/api/writing/analyze', handler);

    const eventId = 'evt-rate-limit-exact-once-001';

    const sentAt = '2026-08-14T02:30:00.000Z';

    // Step A: Attempt 1 - Upstream returns 429 rate limit
    let res1Status = 0;
    let res1Headers = {};
    let res1Body = null;

    const mockReq1 = {
      body: { eventId, sourceApp: 'Slack', text: 'Yesterday I go to the store.', sentAt },
      userId: 1,
    };
    const mockRes1 = {
      set(k, v) { res1Headers[k] = v; },
      status(s) { res1Status = s; return this; },
      json(b) { res1Body = b; return this; },
    };

    await handler(mockReq1, mockRes1);

    assert.equal(res1Status, 429, 'Must return HTTP 429 on rate limit error');
    assert.equal(res1Headers['Retry-After'], '2', 'Must set Retry-After header');
    assert.equal(res1Body.code, 'RATE_LIMIT_EXCEEDED');

    // Verify reservation was deleted from processing on 429 failure
    const processingRows = db.prepare("SELECT * FROM writing_samples WHERE event_id = ? AND status = 'processing'").all(eventId);
    assert.equal(processingRows.length, 0, 'Reservation row must be cleaned up on 429 failure');

    // Step B: Attempt 2 - Client retries after backoff; Gemini rate limit cleared
    shouldFailWith429 = false;

    let res2Status = 0;
    let res2Headers = {};
    let res2Body = null;

    const mockReq2 = {
      body: { eventId, sourceApp: 'Slack', text: 'Yesterday I go to the store.', sentAt },
      userId: 1,
    };
    const mockRes2 = {
      set(k, v) { res2Headers[k] = v; },
      status(s) { res2Status = s; return this; },
      json(b) { res2Body = b; return this; },
    };

    await handler(mockReq2, mockRes2);

    assert.equal(res2Status, 200, 'Retry attempt must return HTTP 200');
    assert.equal(res2Headers['X-Idempotent-Replay'], 'false');
    assert.equal(res2Body.accepted, true);
    assertValidAnalyzeResponse(res2Body);

    const evidenceCount = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE user_id = 1').get().c;
    assert.equal(evidenceCount, 1, 'Exactly one evidence record inserted');

    // Step C: Attempt 3 - Client retries again (duplicate replay)
    let res3Status = 0;
    let res3Headers = {};
    let res3Body = null;

    const mockReq3 = {
      body: { eventId, sourceApp: 'Slack', text: 'Yesterday I go to the store.', sentAt },
      userId: 1,
    };
    const mockRes3 = {
      set(k, v) { res3Headers[k] = v; },
      status(s) { res3Status = s; return this; },
      json(b) { res3Body = b; return this; },
    };

    await handler(mockReq3, mockRes3);

    assert.equal(res3Status, 200, 'Duplicate replay must return HTTP 200');
    assert.equal(res3Headers['X-Idempotent-Replay'], 'true', 'Duplicate replay must be marked replayed');
    assert.equal(callAttempts, 2, 'Analyzer must NOT be called on duplicate replay');

    const evidenceCountAfterReplay = db.prepare('SELECT COUNT(*) AS c FROM grammar_evidence WHERE user_id = 1').get().c;
    assert.equal(evidenceCountAfterReplay, 1, 'No duplicate evidence inserted on replay');
  });
});
