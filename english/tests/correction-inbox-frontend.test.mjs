import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import http from 'node:http';
import { getDb } from '../server/db.js';
import {
  createWritingAnalysisService,
  createWritingSamplesHandler,
  createWritingFeedbackHandler,
} from '../server/writingAnalysis.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';

function setupTestData(db) {
  const email = `inbox-test-${Date.now()}@example.com`;
  const user = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, 'hash', 'user') RETURNING id").get(email);
  const deviceTokenService = createDeviceTokenService(db);
  const { token } = deviceTokenService.createToken({ userId: user.id, deviceName: 'MacBook Pro' });

  // Seed curriculum topics
  db.prepare("INSERT OR IGNORE INTO curriculum_topics (id, name, category, level) VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2')").run();
  db.prepare("INSERT OR IGNORE INTO curriculum_topics (id, name, category, level) VALUES (2, 'Articles (a/an/the)', 'Grammar', 'A1')").run();

  // Seed writing sample 1: Slack with 2 errors
  const analysis1 = {
    isEnglish: true,
    originalText: 'Yesterday I go to store and buy apple.',
    correctedText: 'Yesterday I went to the store and bought an apple.',
    changed: true,
    summaryRu: 'Исправлены формы глаголов в Past Simple и добавлены артикли.',
    errors: [
      {
        original: 'go',
        correction: 'went',
        explanationRu: 'Используйте прошедшее время Past Simple.',
        topic: 'Past Simple (irregular verbs)',
        confidence: 0.95,
      },
      {
        original: 'apple',
        correction: 'an apple',
        explanationRu: 'Перед гласным звуком используется неопределенный артикль an.',
        topic: 'Articles (a/an/the)',
        confidence: 0.9,
      },
    ],
    topicEvidence: [
      { topic: 'Past Simple (irregular verbs)', outcome: 'error', confidence: 0.95, explanationRu: 'Ошибка Past Simple' },
      { topic: 'Articles (a/an/the)', outcome: 'error', confidence: 0.9, explanationRu: 'Ошибка артикля' },
    ],
  };

  const sample1Res = db.prepare(`
    INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at, status, accepted, analysis_json)
    VALUES (?, ?, 'Slack', 'Yesterday I go to store and buy apple.', '2026-08-12T10:00:00.000Z', 'completed', 1, ?)
  `).run(user.id, `evt-inbox-${Date.now()}-1`, JSON.stringify(analysis1));
  const sample1Id = sample1Res.lastInsertRowid;

  // Seed sample 2: Telegram error-free
  const analysis2 = {
    isEnglish: true,
    originalText: 'I have been studying English for two years.',
    correctedText: 'I have been studying English for two years.',
    changed: false,
    summaryRu: 'Предложение написано без ошибок.',
    errors: [],
    topicEvidence: [],
  };

  const sample2Res = db.prepare(`
    INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at, status, accepted, analysis_json)
    VALUES (?, ?, 'Telegram', 'I have been studying English for two years.', '2026-08-12T11:00:00.000Z', 'completed', 1, ?)
  `).run(user.id, `evt-inbox-${Date.now()}-2`, JSON.stringify(analysis2));
  const sample2Id = sample2Res.lastInsertRowid;

  return { userId: user.id, token, sample1Id, sample2Id };
}

async function createTestServer(db) {
  const writingAnalysisService = createWritingAnalysisService({ db, analyzer: async () => ({}) });
  const deviceAuth = createDeviceAuthMiddleware(db);

  const app = express();
  app.get(
    '/api/writing/samples',
    deviceAuth,
    createWritingSamplesHandler({ service: writingAnalysisService }),
  );
  app.post(
    '/api/writing/samples/:id/feedback',
    deviceAuth,
    express.json({ limit: '32kb' }),
    createWritingFeedbackHandler({ service: writingAnalysisService }),
  );

  let server;
  let baseUrl;
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  return { server, baseUrl };
}

test('VAL-INBOX-001: Correction Inbox data structure returns samples with diffs, Russian explanations, and error tags', async (t) => {
  const db = getDb(':memory:');
  const { server, baseUrl } = await createTestServer(db);
  t.after(async () => {
    if (server) await new Promise((res) => server.close(res));
    db.close();
  });

  const { userId, token, sample1Id } = setupTestData(db);

  const res = await fetch(`${baseUrl}/api/writing/samples`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assert.equal(res.status, 200, 'GET /api/writing/samples should return 200 OK');
  const data = await res.json();
  assert.ok(Array.isArray(data.samples), 'samples should be an array');
  assert.ok(data.samples.length >= 2, 'Should return seeded samples');

  const sample1 = data.samples.find((s) => s.id === sample1Id);
  assert.ok(sample1, 'Sample 1 should be present in response');
  assert.equal(sample1.sourceApp, 'Slack');
  assert.equal(sample1.originalText, 'Yesterday I go to store and buy apple.');
  assert.equal(sample1.analysis.correctedText, 'Yesterday I went to the store and bought an apple.');
  assert.equal(sample1.analysis.summaryRu, 'Исправлены формы глаголов в Past Simple и добавлены артикли.');
  assert.equal(sample1.analysis.errors.length, 2);
  assert.equal(sample1.analysis.errors[0].topic, 'Past Simple (irregular verbs)');
  assert.equal(sample1.analysis.errors[1].topic, 'Articles (a/an/the)');
});

test('VAL-INBOX-002: Correction Inbox filtering controls logic correctly narrows sample list', async (t) => {
  const db = getDb(':memory:');
  const { server, baseUrl } = await createTestServer(db);
  t.after(async () => {
    if (server) await new Promise((res) => server.close(res));
    db.close();
  });

  const { token, sample1Id, sample2Id } = setupTestData(db);

  const res = await fetch(`${baseUrl}/api/writing/samples`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  const samples = data.samples;

  // Filter by source app = "Slack"
  const slackSamples = samples.filter((s) => s.sourceApp === 'Slack');
  assert.equal(slackSamples.length, 1);
  assert.equal(slackSamples[0].id, sample1Id);

  // Filter by source app = "Telegram"
  const telegramSamples = samples.filter((s) => s.sourceApp === 'Telegram');
  assert.equal(telegramSamples.length, 1);
  assert.equal(telegramSamples[0].id, sample2Id);

  // Filter by changed status = "CHANGED" (only errors)
  const changedSamples = samples.filter((s) => s.analysis?.changed === true || (s.analysis?.errors && s.analysis.errors.length > 0));
  assert.equal(changedSamples.length, 1);
  assert.equal(changedSamples[0].id, sample1Id);

  // Filter by topic = "Articles (a/an/the)"
  const topicSamples = samples.filter((s) => s.analysis?.errors?.some((e) => e.topic === 'Articles (a/an/the)'));
  assert.equal(topicSamples.length, 1);
  assert.equal(topicSamples[0].id, sample1Id);
});

test('VAL-INBOX-003: Interactive feedback controls trigger API calls and record feedback', async (t) => {
  const db = getDb(':memory:');
  const { server, baseUrl } = await createTestServer(db);
  t.after(async () => {
    if (server) await new Promise((res) => server.close(res));
    db.close();
  });

  const { userId, token, sample1Id } = setupTestData(db);

  // 1. Submit helpful feedback
  const helpfulRes = await fetch(`${baseUrl}/api/writing/samples/${sample1Id}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ feedback_type: 'helpful', notes: 'Great correction' }),
  });

  assert.equal(helpfulRes.status, 200);
  const helpfulJson = await helpfulRes.json();
  assert.equal(helpfulJson.success, true);
  assert.equal(helpfulJson.feedback.feedback_type, 'helpful');

  // 2. Submit undo_progress feedback
  const undoRes = await fetch(`${baseUrl}/api/writing/samples/${sample1Id}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ feedback_type: 'undo_progress' }),
  });

  assert.equal(undoRes.status, 200);
  const undoJson = await undoRes.json();
  assert.equal(undoJson.success, true);

  // 3. Fetch samples again and confirm feedback array is populated in sample list response
  const samplesRes = await fetch(`${baseUrl}/api/writing/samples`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const samplesData = await samplesRes.json();
  const sample1Updated = samplesData.samples.find((s) => s.id === sample1Id);
  assert.ok(sample1Updated);
  assert.ok(Array.isArray(sample1Updated.feedback));
  assert.ok(sample1Updated.feedback.some((f) => f.feedbackType === 'helpful'));
  assert.ok(sample1Updated.feedback.some((f) => f.feedbackType === 'undo_progress'));
});
