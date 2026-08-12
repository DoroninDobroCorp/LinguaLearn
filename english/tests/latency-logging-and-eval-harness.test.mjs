import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import {
  createWritingAnalysisService,
  createWritingAnalyzeHandler,
} from '../server/writingAnalysis.js';
import { runWritingAnalysisEval } from '../server/scripts/evalWritingAnalysis.js';

function setupTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (id, email, password_hash, role) VALUES (1, 'user1@test.com', 'hash', 'user');

    CREATE TABLE curriculum_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'preset'
    );

    INSERT INTO curriculum_topics (id, name, category, level) VALUES
      (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2');
  `);
  return db;
}

test('VAL-PERF-001: POST /api/writing/analyze returns X-Response-Time header and latencyMs breakdown in response and logs', async () => {
  const db = setupTestDb();
  const mockAnalyzer = async () => ({
    isEnglish: true,
    correctedText: 'Yesterday I went to the store.',
    summaryRu: 'Исправлена форма Past Simple.',
    errors: [
      {
        original: 'go',
        correction: 'went',
        explanationRu: 'Past Simple forma.',
        topic: 'Past Simple (irregular verbs)',
        confidence: 0.95,
      },
    ],
    topicEvidence: [
      {
        topic: 'Past Simple (irregular verbs)',
        outcome: 'error',
        confidence: 0.95,
        explanationRu: 'Past Simple error.',
      },
    ],
  });

  const service = createWritingAnalysisService({ db, analyzer: mockAnalyzer });
  const handler = createWritingAnalyzeHandler({ service });

  const req = {
    body: {
      eventId: 'evt-perf-001',
      sourceApp: 'Slack',
      text: 'Yesterday I go to the store.',
      userId: 1,
    },
    userId: 1,
  };

  const headers = {};
  let responseBody = null;
  let responseStatusCode = null;

  const res = {
    set(key, val) {
      headers[key.toLowerCase()] = val;
    },
    status(code) {
      responseStatusCode = code;
      return this;
    },
    json(data) {
      responseBody = data;
      return this;
    },
  };

  // Intercept console.log to verify structured JSON logging
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    origLog(...args);
  };

  try {
    await handler(req, res);
  } finally {
    console.log = origLog;
  }

  assert.equal(responseStatusCode, 200);
  assert.ok(headers['x-response-time'], 'X-Response-Time header must be present');
  assert.match(headers['x-response-time'], /^\d+ms$/, 'X-Response-Time must be in <number>ms format');

  assert.ok(responseBody.latencyMs, 'latencyMs object must be present in response');
  assert.equal(typeof responseBody.latencyMs.queue, 'number', 'latencyMs.queue must be a number');
  assert.equal(typeof responseBody.latencyMs.model, 'number', 'latencyMs.model must be a number');
  assert.equal(typeof responseBody.latencyMs.db, 'number', 'latencyMs.db must be a number');
  assert.equal(typeof responseBody.latencyMs.total, 'number', 'latencyMs.total must be a number');

  // Verify structured telemetry log
  const telemetryLog = logs.find((l) => l.includes('writing_analysis_latency'));
  assert.ok(telemetryLog, 'Structured JSON telemetry log must be output to server console');
  const parsedLog = JSON.parse(telemetryLog);
  assert.equal(parsedLog.type, 'writing_analysis_latency');
  assert.equal(parsedLog.eventId, 'evt-perf-001');
  assert.ok(parsedLog.latencyMs);
});

test('VAL-EVAL-001: evalWritingAnalysis runner produces benchmark metrics and JSON evaluation report', async () => {
  const report = await runWritingAnalysisEval();

  assert.ok(report.timestamp);
  assert.ok(report.metrics);
  assert.equal(typeof report.metrics.totalSamples, 'number');
  assert.equal(typeof report.metrics.acceptedRate, 'number');
  assert.equal(typeof report.metrics.rejectedRate, 'number');
  assert.equal(typeof report.metrics.schemaValidityRate, 'number');
  assert.equal(report.metrics.schemaValidityRate, 1.0, 'Schema validity rate should be 100%');

  assert.ok(report.metrics.latencyBreakdown);
  assert.equal(typeof report.metrics.latencyBreakdown.avgTotalMs, 'number');
  assert.equal(typeof report.metrics.latencyBreakdown.avgQueueMs, 'number');
  assert.equal(typeof report.metrics.latencyBreakdown.avgModelMs, 'number');
  assert.equal(typeof report.metrics.latencyBreakdown.avgDbMs, 'number');

  assert.ok(Array.isArray(report.results));
  assert.equal(report.results.length, report.metrics.totalSamples);
});
