import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVE_BENCHMARK_SAMPLES,
  runLiveGeminiModelEval,
} from '../server/scripts/evalGeminiModelLive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Live Gemini Model Evaluation Harness (VAL-LIVE-002)', () => {
  it('has 120+ synthetic B1-B2 test cases covering typos, style, errors, prompt injection, and cyrillic', () => {
    assert.ok(Array.isArray(LIVE_BENCHMARK_SAMPLES), 'LIVE_BENCHMARK_SAMPLES must be an array');
    assert.ok(
      LIVE_BENCHMARK_SAMPLES.length >= 120,
      `LIVE_BENCHMARK_SAMPLES must contain at least 120 samples, got ${LIVE_BENCHMARK_SAMPLES.length}`
    );

    // Verify categories present
    const categories = new Set(LIVE_BENCHMARK_SAMPLES.map((s) => s.expectedCategory));
    assert.ok(categories.has('grammar_error'), 'Must contain grammar_error cases');
    assert.ok(categories.has('mechanical_only'), 'Must contain mechanical_only / typo cases');
    assert.ok(categories.has('acceptable'), 'Must contain acceptable / style cases');
    assert.ok(categories.has('error_free'), 'Must contain error_free cases');
    assert.ok(categories.has('prompt_injection'), 'Must contain prompt_injection cases');
    assert.ok(categories.has('rejected_cyrillic'), 'Must contain rejected_cyrillic cases');
  });

  it('fails closed when running in live mode without GEMINI_API_KEY (no silent mock fallback)', async () => {
    await assert.rejects(
      async () => {
        await runLiveGeminiModelEval({ mode: 'live', apiKey: '' });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: GEMINI_API_KEY is missing/);
        return true;
      }
    );
  });

  it('runs evaluation suite in mock mode, enforces precision >= 95% and false positives <= 2, generating server/reports/eval-gemini-live.json', async () => {
    // Run evaluation in mock mode for deterministic fast unit test
    const report = await runLiveGeminiModelEval({ mode: 'mock' });

    assert.ok(report, 'Report must be generated');
    assert.equal(typeof report.timestamp, 'string');
    assert.ok(report.metrics.totalSamples >= 120, 'totalSamples must be >= 120');

    // Precision >= 95%
    assert.ok(
      report.metrics.precision >= 0.95,
      `Precision must be >= 0.95, got ${report.metrics.precision}`
    );

    // False positive / false negative score penalties <= 2
    assert.ok(
      report.metrics.falseNegativeScorePenalties <= 2,
      `False negative score penalties must be <= 2, got ${report.metrics.falseNegativeScorePenalties}`
    );

    // Schema validity
    assert.equal(report.metrics.schemaValidityRate, 1.0, 'Schema validity rate must be 1.0');

    // Telemetry fields present
    assert.ok(typeof report.promptHash === 'string' && report.promptHash.length === 64, 'promptHash must be a 64-char sha256 hex');
    assert.ok(typeof report.corpusHash === 'string' && report.corpusHash.length === 64, 'corpusHash must be a 64-char sha256 hex');
    assert.ok(report.confusionMatrix && typeof report.confusionMatrix.tp === 'number', 'confusionMatrix must be present');

    // Metrics present
    assert.ok(typeof report.metrics.precision === 'number', 'precision metric must be a number');
    assert.ok(typeof report.metrics.recall === 'number', 'recall metric must be a number');
    assert.ok(typeof report.metrics.f1Score === 'number', 'f1Score metric must be a number');
    assert.ok(typeof report.metrics.tierAccuracy === 'number', 'tierAccuracy metric must be a number');

    // Latency breakdown present
    const lat = report.metrics.latencyBreakdown;
    assert.ok(lat, 'latencyBreakdown must exist');
    assert.ok(typeof lat.avgTotalMs === 'number', 'avgTotalMs must be a number');
    assert.ok(typeof lat.avgModelMs === 'number', 'avgModelMs must be a number');
    assert.ok(typeof lat.avgDbMs === 'number', 'avgDbMs must be a number');
    assert.ok(typeof lat.avgQueueMs === 'number', 'avgQueueMs must be a number');

    // Verify report file was written to server/reports/eval-gemini-live.json
    const baseServerDir = path.resolve(__dirname, '../server');
    const reportPath = path.join(baseServerDir, 'reports', 'eval-gemini-live.json');
    assert.ok(fs.existsSync(reportPath), `Report file must exist at ${reportPath}`);

    const fileContent = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(fileContent.metrics.totalSamples, report.metrics.totalSamples);
    assert.ok(fileContent.metrics.precision >= 0.95);
    assert.ok(fileContent.metrics.falseNegativeScorePenalties <= 2);
    assert.equal(fileContent.promptHash, report.promptHash);
    assert.equal(fileContent.corpusHash, report.corpusHash);
  });
});
