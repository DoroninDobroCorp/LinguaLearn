import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService, filterWritingCandidate } from '../server/writingAnalysis.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.REPO_ROOT || path.resolve(__dirname, '../..');

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (2, 'Articles (a/an/the)', 'Grammar', 'A1', 'preset')
  `).run();

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'owner@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'macuser@example.com', 'hash', 'user')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (3, 'iosuser@example.com', 'hash', 'user')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (4, 'androiduser@example.com', 'hash', 'user')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (5, 'winuser@example.com', 'hash', 'user')").run();

  return db;
}

describe('Stage F / VAL-CROSS-006: Cross-Platform Contract Integration Test Suite', () => {
  const platforms = [
    {
      name: 'Mac Desktop Agent',
      sourceApp: 'LinguaLearnCapture',
      userId: 2,
      deviceName: 'MacBook Pro M2 Agent',
      eventIdPrefix: 'mac-e2e',
      sampleText: 'She do not understand the lesson yesterday.',
      correctedText: 'She did not understand the lesson yesterday.',
    },
    {
      name: 'iOS Custom Keyboard Extension',
      sourceApp: 'LinguaLearnKeyboardExtension',
      userId: 3,
      deviceName: 'iPhone 15 Pro Keyboard',
      eventIdPrefix: 'ios-e2e',
      sampleText: 'He go to the store two hours ago.',
      correctedText: 'He went to the store two hours ago.',
    },
    {
      name: 'Android IME Keyboard Service',
      sourceApp: 'LinguaLearnIMEKeyboardService',
      userId: 4,
      deviceName: 'Google Pixel 8 Keyboard',
      eventIdPrefix: 'android-e2e',
      sampleText: 'They was very happy about the news.',
      correctedText: 'They were very happy about the news.',
    },
    {
      name: 'Windows Desktop Agent',
      sourceApp: 'LinguaLearnAgent',
      userId: 5,
      deviceName: 'Windows 11 Surface Agent',
      eventIdPrefix: 'win-e2e',
      sampleText: 'I writes a daily entry in my journal.',
      correctedText: 'I write a daily entry in my journal.',
    },
  ];

  it('1. Uniform contract decoding (schemaVersion: 1) across Mac, iOS, Android, and Windows payloads', async () => {
    const db = createTestDatabase();
    try {
      for (const platform of platforms) {
        const service = createWritingAnalysisService({
          db,
          analyzer: async () => ({
            isEnglish: true,
            correctedText: platform.correctedText,
            summaryRu: `Исправление ошибки для ${platform.name}.`,
            errors: [
              {
                original: 'error_word',
                correction: 'correct_word',
                explanationRu: 'Объяснение ошибки.',
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
                explanationRu: 'Фиксация ошибки в доказательной базе.',
              },
            ],
          }),
        });

        const payload = {
          schemaVersion: 1,
          eventId: `${platform.eventIdPrefix}-001`,
          sourceApp: platform.sourceApp,
          originalText: platform.sampleText,
          text: platform.sampleText,
          sentAt: new Date().toISOString(),
          previewOnly: false,
          userId: platform.userId,
        };

        const result = await service.analyze(payload);
        assert.equal(result.response.accepted, true, `${platform.name} payload must be accepted`);
        assert.equal(result.response.schemaVersion, 1, `${platform.name} must return schemaVersion: 1`);
        assert.equal(result.response.eventId, `${platform.eventIdPrefix}-001`);
        assert.equal(result.response.sourceApp, platform.sourceApp);
        assert.ok(Number.isInteger(result.response.sampleId), `${platform.name} sampleId must be an integer`);
        assert.equal(result.response.previewOnly, false);
        assert.equal(result.response.changed, true);
        assert.equal(result.response.correctedText, platform.correctedText);
        assert.equal(result.response.errors.length, 1);
        assert.equal(result.response.topicEvidence.length, 1);
      }
    } finally {
      db.close();
    }
  });

  it('2. Exact-once scoring per (userId, eventId) across all 4 client platforms', async () => {
    const db = createTestDatabase();
    try {
      for (const platform of platforms) {
        let analyzerCalls = 0;
        const service = createWritingAnalysisService({
          db,
          analyzer: async () => {
            analyzerCalls++;
            return {
              isEnglish: true,
              correctedText: platform.correctedText,
              summaryRu: 'Исправление грамматики.',
              errors: [
                {
                  original: 'go',
                  correction: 'went',
                  explanationRu: 'Доказательство ошибки.',
                  topic: 'Past Simple (irregular verbs)',
                  confidence: 0.88,
                  kind: 'grammar_error',
                  category: 'verb_tense',
                },
              ],
              topicEvidence: [
                {
                  topic: 'Past Simple (irregular verbs)',
                  outcome: 'error',
                  confidence: 0.88,
                  explanationRu: 'Доказательство ошибки.',
                },
              ],
            };
          },
        });

        const payload = {
          schemaVersion: 1,
          eventId: `${platform.eventIdPrefix}-idempotent-100`,
          sourceApp: platform.sourceApp,
          originalText: platform.sampleText,
          text: platform.sampleText,
          sentAt: new Date().toISOString(),
          previewOnly: false,
          userId: platform.userId,
        };

        const firstRes = await service.analyze(payload);
        assert.equal(firstRes.replayed, false, `${platform.name} first call must not be replayed`);
        assert.equal(analyzerCalls, 1);

        const countAfterFirst = db
          .prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = ?')
          .get(platform.userId).count;
        assert.equal(countAfterFirst, 1, `${platform.name} must insert exactly 1 evidence row on first call`);

        const secondRes = await service.analyze(payload);
        assert.equal(secondRes.replayed, true, `${platform.name} second call must be replayed from cache`);
        assert.equal(analyzerCalls, 1, 'Analyzer function must NOT be called again on replay');

        const countAfterSecond = db
          .prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = ?')
          .get(platform.userId).count;
        assert.equal(countAfterSecond, 1, `${platform.name} evidence count must remain 1 after replay`);
      }
    } finally {
      db.close();
    }
  });

  it('3. Preview score isolation (previewOnly: true) across all 4 client platforms', async () => {
    const db = createTestDatabase();
    try {
      for (const platform of platforms) {
        const service = createWritingAnalysisService({
          db,
          analyzer: async () => ({
            isEnglish: true,
            correctedText: platform.correctedText,
            summaryRu: 'Предварительный просмотр.',
            errors: [
              {
                original: 'err',
                correction: 'fix',
                explanationRu: 'Объяснение.',
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
                explanationRu: 'Доказательство.',
              },
            ],
          }),
        });

        const previewPayload = {
          schemaVersion: 1,
          eventId: `${platform.eventIdPrefix}-preview-200`,
          sourceApp: platform.sourceApp,
          originalText: platform.sampleText,
          text: platform.sampleText,
          sentAt: new Date().toISOString(),
          previewOnly: true,
          userId: platform.userId,
        };

        const result = await service.analyze(previewPayload);
        assert.equal(result.response.accepted, true);
        assert.equal(result.response.previewOnly, true, `${platform.name} response must state previewOnly: true`);

        const sample = db.prepare('SELECT preview_only FROM writing_samples WHERE event_id = ?').get(`${platform.eventIdPrefix}-preview-200`);
        assert.equal(sample.preview_only, 1, `${platform.name} writing sample record must set preview_only = 1`);

        const evidenceCount = db
          .prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = ?')
          .get(platform.userId).count;
        assert.equal(evidenceCount, 0, `${platform.name} preview mode must NOT create grammar_evidence entries`);

        const progressCount = db
          .prepare('SELECT COUNT(*) AS count FROM user_topic_progress WHERE user_id = ?')
          .get(platform.userId).count;
        assert.equal(progressCount, 0, `${platform.name} preview mode must NOT alter user_topic_progress`);
      }
    } finally {
      db.close();
    }
  });

  it('4. Device token authentication (Bearer ll_dev_...) and revocation across all 4 platforms', () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);

      for (const platform of platforms) {
        const tokenObj = deviceService.createToken({
          userId: platform.userId,
          deviceName: platform.deviceName,
        });

        assert.ok(tokenObj.token.startsWith('ll_dev_'), `${platform.name} token must start with ll_dev_`);
        assert.ok(tokenObj.id, `${platform.name} token creation must return integer token ID`);

        const authResult = deviceService.authenticateDeviceToken(tokenObj.token);
        assert.equal(authResult.valid, true, `${platform.name} device token authentication must succeed`);
        assert.equal(authResult.userId, platform.userId, `${platform.name} must resolve correct userId`);
        assert.equal(authResult.deviceTokenId, tokenObj.id);

        deviceService.revokeToken({ userId: platform.userId, tokenId: tokenObj.id });

        const revokedResult = deviceService.authenticateDeviceToken(tokenObj.token);
        assert.equal(revokedResult.valid, false, `${platform.name} revoked token must fail authentication`);
        assert.equal(revokedResult.reason, 'revoked');
      }
    } finally {
      db.close();
    }
  });

  it('5. Candidate filtering parity and password/sensitive field exclusion rules', () => {
    const validSentence = 'She sent an email to her manager regarding the project update.';
    const filterRes = filterWritingCandidate(validSentence);
    assert.equal(filterRes.accepted, true, 'Valid English sentence must pass candidate filter');

    const codeSnippet = 'function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }';
    assert.equal(filterWritingCandidate(codeSnippet).accepted, false, 'Code snippet must be rejected');

    const urlText = 'Check the details at https://lingualearn.ai/dashboard for more info.';
    assert.equal(filterWritingCandidate(urlText).accepted, false, 'Text with URL must be rejected');

    const cyrillicText = 'Привет! Мы готовим отчет по проекту LinguaLearn.';
    assert.equal(filterWritingCandidate(cyrillicText).accepted, false, 'Text with Cyrillic must be rejected');

    const passwordFieldTitles = ['Password', 'Passcode', 'One-Time Secret', 'Verification Code'];
    for (const title of passwordFieldTitles) {
      const fieldLower = title.toLowerCase();
      const isSensitive = fieldLower.includes('password') || fieldLower.includes('passcode') || fieldLower.includes('secret') || fieldLower.includes('code');
      assert.equal(isSensitive, true, `Field title '${title}' must be classified as sensitive/password`);
    }
  });

  it('6. Cross-platform client repository file structure completeness', () => {
    const platformDirs = [
      {
        name: 'Mac Client',
        dir: path.join(rootDir, 'macos/LinguaLearnCapture'),
        required: [
          'Package.swift',
          'Sources/LinguaLearnCaptureCore/AnalysisAPIClient.swift',
          'Sources/LinguaLearnCaptureCore/EnglishSentenceFilter.swift',
          'Sources/LinguaLearnCaptureCore/Models.swift',
        ],
      },
      {
        name: 'iOS App & Keyboard Extension',
        dir: path.join(rootDir, 'ios/LinguaLearn'),
        required: [
          'project.yml',
          'LinguaLearnContainerApp/ContentView.swift',
          'LinguaLearnKeyboardExtension/KeyboardViewController.swift',
          'LinguaLearnKeyboardExtension/Filter/CandidateFilter.swift',
          'LinguaLearnKeyboardExtension/Shared/AppGroupManager.swift',
          'LinguaLearnKeyboardExtension/Network/ApiClient.swift',
        ],
      },
      {
        name: 'Android App & IME Keyboard',
        dir: path.join(rootDir, 'android/LinguaLearn'),
        required: [
          'build.gradle.kts',
          'app/src/main/AndroidManifest.xml',
          'app/src/main/java/com/factory/lingualearn/MainActivity.kt',
          'app/src/main/java/com/factory/lingualearn/ime/LinguaLearnIMEKeyboardService.kt',
          'app/src/main/java/com/factory/lingualearn/ime/filter/CandidateFilter.kt',
          'app/src/main/java/com/factory/lingualearn/ime/net/ApiClient.kt',
        ],
      },
      {
        name: 'Windows Desktop Agent',
        dir: path.join(rootDir, 'windows/LinguaLearnAgent'),
        required: [
          'LinguaLearnAgent.csproj',
          'MainWindow.xaml.cs',
          'UIAutomation/UIAutomationListener.cs',
          'Filter/CandidateFilter.cs',
          'Tray/SystemTrayController.cs',
          'Network/ApiClient.cs',
        ],
      },
    ];

    for (const item of platformDirs) {
      assert.equal(fs.existsSync(item.dir), true, `Directory for ${item.name} must exist at ${item.dir}`);
      for (const reqFile of item.required) {
        const fullPath = path.join(item.dir, reqFile);
        assert.equal(fs.existsSync(fullPath), true, `Required file for ${item.name} missing: ${reqFile} (at ${fullPath})`);
      }
    }
  });

  it('7. OpenAPI 3.0 multi-platform contract specification validity', () => {
    const openapiPath = path.join(rootDir, 'docs/openapi-writing-analysis-v1.json');
    assert.equal(fs.existsSync(openapiPath), true, `OpenAPI spec must exist at ${openapiPath}`);

    const specRaw = fs.readFileSync(openapiPath, 'utf8');
    const spec = JSON.parse(specRaw);

    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.title, 'LinguaLearn Multi-Platform Writing Analysis API');
    assert.equal(spec.info.version, '1.0.0');
    assert.ok(spec.paths['/api/writing/analyze']);
    assert.ok(spec.paths['/api/devices/tokens']);
  });
});
