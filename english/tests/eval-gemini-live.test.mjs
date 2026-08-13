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

describe('Live Gemini Model Evaluation Harness (VAL-LIVE-001)', () => {
  it('has 60+ synthetic B1-B2 test cases covering typos, style, errors, prompt injection, and cyrillic', () => {
    assert.ok(Array.isArray(LIVE_BENCHMARK_SAMPLES), 'LIVE_BENCHMARK_SAMPLES must be an array');
    assert.ok(
      LIVE_BENCHMARK_SAMPLES.length >= 60,
      `LIVE_BENCHMARK_SAMPLES must contain at least 60 samples, got ${LIVE_BENCHMARK_SAMPLES.length}`
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

  it('runs evaluation suite, enforces 0 false-negative score penalties for typos/style, and generates server/reports/eval-gemini-live.json', async () => {
    // Run evaluation in mock mode for deterministic fast unit test
    const report = await runLiveGeminiModelEval({ mode: 'mock' });

    assert.ok(report, 'Report must be generated');
    assert.equal(typeof report.timestamp, 'string');
    assert.ok(report.metrics.totalSamples >= 60, 'totalSamples must be >= 60');

    // Key invariant: Zero false-negative score penalties for typos/style
    assert.equal(
      report.metrics.falseNegativeScorePenalties,
      0,
      'There must be 0 false-negative score penalties for typos/style'
    );

    // Schema validity
    assert.equal(report.metrics.schemaValidityRate, 1.0, 'Schema validity rate must be 1.0');

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
    const baseServerDir = fs.existsSync('/srv/LinguaLearn/english/server')
      ? '/srv/LinguaLearn/english/server'
      : path.resolve(__dirname, '../server');
    const reportPath = path.join(baseServerDir, 'reports', 'eval-gemini-live.json');
    assert.ok(fs.existsSync(reportPath), `Report file must exist at ${reportPath}`);

    const fileContent = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(fileContent.metrics.totalSamples, report.metrics.totalSamples);
    assert.equal(fileContent.metrics.falseNegativeScorePenalties, 0);
  });
});
