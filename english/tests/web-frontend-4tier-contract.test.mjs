import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import express from 'express';
import http from 'node:http';
import { getSampleTierInfo } from '../src/utils/tierResolver.js';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService, createWritingSamplesHandler } from '../server/writingAnalysis.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from '../server/deviceTokens.js';

describe('VAL-WEB-003: Web Frontend 4-Tier Contract UI Rendering & Filtering', () => {

  it('correctly resolves 4 distinct UI card tiers via getSampleTierInfo()', () => {
    // 1. clear_error tier
    const sampleClearError = {
      originalText: 'Yesterday I go to store.',
      analysis: {
        assessment: 'clear_error',
        hasClearError: true,
        changed: true,
        recommendedText: 'Yesterday I went to the store.',
        correctedText: 'Yesterday I went to the store.',
        summaryRu: 'Исправлена форма глагола.',
        errors: [
          {
            original: 'go',
            correction: 'went',
            explanationRu: 'Используйте Past Simple.',
            topic: 'Past Simple',
            kind: 'grammar_error',
            category: 'verb_tense',
          },
        ],
        mechanicalCorrections: [],
        optionalSuggestions: [],
      },
    };
    const tierClear = getSampleTierInfo(sampleClearError);
    assert.equal(tierClear.tier, 'clear_error');
    assert.equal(tierClear.hasClearError, true);
    assert.equal(tierClear.errors.length, 1);
    assert.equal(tierClear.recommendedText, 'Yesterday I went to the store.');

    // 2. mechanical_only tier (changed === true, but hasClearError === false)
    const sampleMechanical = {
      originalText: 'Yesterday I went to teh store.',
      analysis: {
        assessment: 'mechanical_only',
        hasClearError: false,
        changed: true, // Note: changed === true must NOT produce clear_error tier
        recommendedText: 'Yesterday I went to the store.',
        correctedText: 'Yesterday I went to the store.',
        summaryRu: 'Опечатка в артикле.',
        errors: [],
        mechanicalCorrections: [
          {
            original: 'teh',
            correction: 'the',
            explanationRu: 'Опечатка в слове the.',
            kind: 'mechanical',
            category: 'spelling',
          },
        ],
        optionalSuggestions: [],
      },
    };
    const tierMech = getSampleTierInfo(sampleMechanical);
    assert.equal(tierMech.tier, 'mechanical_only');
    assert.equal(tierMech.hasClearError, false);
    assert.equal(tierMech.errors.length, 0);
    assert.equal(tierMech.mechanicalCorrections.length, 1);
    assert.equal(tierMech.recommendedText, 'Yesterday I went to the store.');

    // 3. acceptable tier (changed === true, optionalSuggestions)
    const sampleAcceptable = {
      originalText: 'Yesterday I went to the shop.',
      analysis: {
        assessment: 'acceptable',
        hasClearError: false,
        changed: true,
        recommendedText: 'Yesterday I visited the store.',
        correctedText: 'Yesterday I visited the store.',
        summaryRu: 'Фраза корректна, предложен более естественный вариант.',
        errors: [],
        mechanicalCorrections: [],
        optionalSuggestions: [
          {
            original: 'went to',
            suggestion: 'visited',
            explanationRu: 'Стилистический вариант.',
            kind: 'style',
            category: 'style',
          },
        ],
      },
    };
    const tierAcc = getSampleTierInfo(sampleAcceptable);
    assert.equal(tierAcc.tier, 'acceptable');
    assert.equal(tierAcc.hasClearError, false);
    assert.equal(tierAcc.errors.length, 0);
    assert.equal(tierAcc.optionalSuggestions.length, 1);
    assert.equal(tierAcc.recommendedText, 'Yesterday I visited the store.');

    // 4. correct tier
    const sampleCorrect = {
      originalText: 'I have been working here for three years.',
      analysis: {
        assessment: 'correct',
        hasClearError: false,
        changed: false,
        recommendedText: 'I have been working here for three years.',
        correctedText: 'I have been working here for three years.',
        summaryRu: 'Предложение написано без ошибок.',
        errors: [],
        mechanicalCorrections: [],
        optionalSuggestions: [],
      },
    };
    const tierCorr = getSampleTierInfo(sampleCorrect);
    assert.equal(tierCorr.tier, 'correct');
    assert.equal(tierCorr.hasClearError, false);
    assert.equal(tierCorr.errors.length, 0);
    assert.equal(tierCorr.recommendedText, 'I have been working here for three years.');
  });

  it('ensures filter "С ошибками" uses hasClearError/assessment instead of changed', () => {
    const samples = [
      {
        id: 1,
        originalText: 'Yesterday I go to store.',
        analysis: {
          assessment: 'clear_error',
          hasClearError: true,
          changed: true,
          errors: [{ original: 'go', correction: 'went' }],
        },
      },
      {
        id: 2,
        originalText: 'Yesterday I went to teh store.',
        analysis: {
          assessment: 'mechanical_only',
          hasClearError: false,
          changed: true, // changed is true!
          errors: [],
          mechanicalCorrections: [{ original: 'teh', correction: 'the' }],
        },
      },
      {
        id: 3,
        originalText: 'I am fine.',
        analysis: {
          assessment: 'correct',
          hasClearError: false,
          changed: false,
          errors: [],
        },
      },
    ];

    // Filter "С ошибками" (selectedStatus = "CHANGED" or "CLEAR_ERROR")
    const errorSamples = samples.filter((sample) => {
      const tierInfo = getSampleTierInfo(sample);
      return tierInfo.hasClearError || tierInfo.tier === 'clear_error';
    });

    assert.equal(errorSamples.length, 1, 'Filter "С ошибками" must match ONLY clear_error samples');
    assert.equal(errorSamples[0].id, 1);

    // Filter "Опечатки и оформление" (selectedStatus = "MECHANICAL")
    const mechanicalSamples = samples.filter((sample) => {
      const tierInfo = getSampleTierInfo(sample);
      return tierInfo.tier === 'mechanical_only';
    });
    assert.equal(mechanicalSamples.length, 1);
    assert.equal(mechanicalSamples[0].id, 2);

    // Filter "Без грамматических ошибок" (selectedStatus = "NO_ERRORS")
    const noErrorSamples = samples.filter((sample) => {
      const tierInfo = getSampleTierInfo(sample);
      return !tierInfo.hasClearError && tierInfo.tier !== 'clear_error';
    });
    assert.equal(noErrorSamples.length, 2, 'Filter "Без ошибок" includes mechanical_only and correct');
  });

  it('indexes mechanicalCorrections and optionalSuggestions in search', () => {
    const samples = [
      {
        id: 10,
        originalText: 'I write teh text.',
        analysis: {
          assessment: 'mechanical_only',
          hasClearError: false,
          recommendedText: 'I write the text.',
          mechanicalCorrections: [
            { original: 'teh', correction: 'the', explanationRu: 'Опечатка в артикле' },
          ],
        },
      },
      {
        id: 20,
        originalText: 'Please inform me.',
        analysis: {
          assessment: 'acceptable',
          hasClearError: false,
          recommendedText: 'Please let me know.',
          optionalSuggestions: [
            { original: 'inform me', suggestion: 'let me know', explanationRu: 'Более естественно' },
          ],
        },
      },
    ];

    // Search query for mechanical fix "teh"
    const searchMechanical = samples.filter((sample) => {
      const tierInfo = getSampleTierInfo(sample);
      const query = 'teh';
      return tierInfo.mechanicalCorrections.some(
        (m) => m.original?.includes(query) || m.correction?.includes(query)
      );
    });
    assert.equal(searchMechanical.length, 1);
    assert.equal(searchMechanical[0].id, 10);

    // Search query for optional suggestion "let me know"
    const searchSuggestion = samples.filter((sample) => {
      const tierInfo = getSampleTierInfo(sample);
      const query = 'let me know';
      return tierInfo.optionalSuggestions.some(
        (s) => s.suggestion?.includes(query) || s.original?.includes(query)
      );
    });
    assert.equal(searchSuggestion.length, 1);
    assert.equal(searchSuggestion[0].id, 20);
  });

  it('serves 4-tier writing samples via GET /api/writing/samples end-to-end', async () => {
    const db = getDb(':memory:');
    const user = db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('tier-user@example.com', 'hash', 'user') RETURNING id").get();
    const deviceTokenService = createDeviceTokenService(db);
    const { token } = deviceTokenService.createToken({ userId: user.id, deviceName: 'MacBook Air' });

    // Seed 4 samples representing each tier
    const payloadClear = {
      isEnglish: true,
      assessment: 'clear_error',
      hasClearError: true,
      changed: true,
      recommendedText: 'She went home.',
      correctedText: 'She went home.',
      summaryRu: 'Ошибка времени.',
      errors: [{ original: 'go', correction: 'went', topic: 'Past Simple', kind: 'grammar_error' }],
    };

    const payloadMech = {
      isEnglish: true,
      assessment: 'mechanical_only',
      hasClearError: false,
      changed: true,
      recommendedText: 'She went home.',
      correctedText: 'She went home.',
      summaryRu: 'Опечатка.',
      errors: [],
      mechanicalCorrections: [{ original: 'hom', correction: 'home', kind: 'mechanical' }],
    };

    db.prepare(`
      INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at, status, accepted, analysis_json)
      VALUES (?, 'evt-web-clear', 'Slack', 'She go home.', '2026-08-13T12:00:00.000Z', 'completed', 1, ?)
    `).run(user.id, JSON.stringify(payloadClear));

    db.prepare(`
      INSERT INTO writing_samples (user_id, event_id, source_app, original_text, sent_at, status, accepted, analysis_json)
      VALUES (?, 'evt-web-mech', 'Slack', 'She went hom.', '2026-08-13T12:01:00.000Z', 'completed', 1, ?)
    `).run(user.id, JSON.stringify(payloadMech));

    const writingAnalysisService = createWritingAnalysisService({ db, analyzer: async () => ({}) });
    const deviceAuth = createDeviceAuthMiddleware(db);

    const app = express();
    app.get('/api/writing/samples', deviceAuth, createWritingSamplesHandler({ service: writingAnalysisService }));

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

    try {
      const res = await fetch(`${baseUrl}/api/writing/samples`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.samples));
      assert.equal(data.samples.length, 2);

      const s1 = data.samples.find((s) => s.eventId === 'evt-web-clear');
      assert.ok(s1);
      assert.equal(s1.analysis.assessment, 'clear_error');
      assert.equal(s1.analysis.hasClearError, true);
      assert.equal(s1.analysis.recommendedText, 'She went home.');

      const s2 = data.samples.find((s) => s.eventId === 'evt-web-mech');
      assert.ok(s2);
      assert.equal(s2.analysis.assessment, 'mechanical_only');
      assert.equal(s2.analysis.hasClearError, false);
      assert.equal(s2.analysis.mechanicalCorrections.length, 1);
    } finally {
      if (server) await new Promise((res) => server.close(res));
      db.close();
    }
  });

});
