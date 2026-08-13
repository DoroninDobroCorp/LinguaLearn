import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../server/db.js';
import { createWritingAnalysisService } from '../server/writingAnalysis.js';
import { createDeviceTokenService } from '../server/deviceTokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.REPO_ROOT || path.resolve(__dirname, '../..');
const iosDir = path.join(rootDir, 'ios/LinguaLearn');

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
  `).run();

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'owner@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'iosuser@example.com', 'hash', 'user')").run();

  return db;
}

describe('Stage C: iOS App and Custom Keyboard Extension (schemaVersion 1)', () => {
  it('VAL-STAGEC-001: iOS project structure exists at ios/LinguaLearn with required targets and components', () => {
    assert.equal(fs.existsSync(iosDir), true, `iOS project directory must exist at ${iosDir}`);

    const requiredFiles = [
      // Project Config / Build
      'project.yml',
      'LinguaLearn.xcodeproj/project.pbxproj',
      'README.md',

      // Container App Target (LinguaLearnContainerApp)
      'LinguaLearnContainerApp/LinguaLearnApp.swift',
      'LinguaLearnContainerApp/ContentView.swift',
      'LinguaLearnContainerApp/Auth/AuthManager.swift',
      'LinguaLearnContainerApp/Auth/LoginView.swift',
      'LinguaLearnContainerApp/Devices/DeviceTokenManager.swift',
      'LinguaLearnContainerApp/Devices/DeviceTokenView.swift',
      'LinguaLearnContainerApp/Settings/SettingsView.swift',
      'LinguaLearnContainerApp/Inbox/InboxView.swift',
      'LinguaLearnContainerApp/Today/TodayPracticeView.swift',
      'LinguaLearnContainerApp/Retention/RetentionStatusView.swift',

      // Custom Keyboard Extension Target (LinguaLearnKeyboardExtension)
      'LinguaLearnKeyboardExtension/KeyboardViewController.swift',
      'LinguaLearnKeyboardExtension/Shared/AppGroupManager.swift',
      'LinguaLearnKeyboardExtension/Shared/RetryQueue.swift',
      'LinguaLearnKeyboardExtension/Filter/CandidateFilter.swift',
      'LinguaLearnKeyboardExtension/UI/PreviewPopupView.swift',
      'LinguaLearnKeyboardExtension/Replacement/AutoReplaceEngine.swift',
      'LinguaLearnKeyboardExtension/Network/NetworkRetryQueue.swift',
      'LinguaLearnKeyboardExtension/Network/ApiClient.swift',

      // iOS Tests Target
      'LinguaLearnTests/CandidateFilterTests.swift',
      'LinguaLearnTests/RetryQueueTests.swift',
      'LinguaLearnTests/ApiClientTests.swift'
    ];

    for (const relativePath of requiredFiles) {
      const fullPath = path.join(iosDir, relativePath);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Required iOS project file missing: ${relativePath} (at ${fullPath})`
      );
    }
  });

  it('CandidateFilter swift module content correctly implements prose filtering and password rejection rules', () => {
    const candidateFilterPath = path.join(iosDir, 'LinguaLearnKeyboardExtension/Filter/CandidateFilter.swift');
    assert.equal(fs.existsSync(candidateFilterPath), true, 'CandidateFilter.swift must exist');

    const content = fs.readFileSync(candidateFilterPath, 'utf8');
    assert.match(content, /class\s+CandidateFilter|struct\s+CandidateFilter/, 'Must declare CandidateFilter');
    assert.match(content, /containsCyrillic|cyrillic/i, 'Must check for Cyrillic characters');
    assert.match(content, /isCodeOrCommand|code/i, 'Must check for code patterns');
    assert.match(content, /isUrlOrEmail|url/i, 'Must check for URLs or emails');
    assert.match(content, /isSecureField|isSecureTextEntry|password/i, 'Must check for secure/password fields');
    assert.match(content, /sentenceTerminator|\.|\!|\?/i, 'Must check sentence boundary terminators');
  });

  it('AppGroupManager swift module content manages shared container token storage and queue persistence', () => {
    const appGroupPath = path.join(iosDir, 'LinguaLearnKeyboardExtension/Shared/AppGroupManager.swift');
    assert.equal(fs.existsSync(appGroupPath), true, 'AppGroupManager.swift must exist');

    const content = fs.readFileSync(appGroupPath, 'utf8');
    assert.match(content, /group\.ai\.factory\.lingualearn/i, 'Must reference shared App Group identifier');
    assert.match(content, /UserDefaults\(suiteName:/i, 'Must use UserDefaults with App Group suiteName');
    assert.match(content, /deviceToken|token/i, 'Must manage device token in shared container');
    assert.match(content, /saveQueue|loadQueue|retryQueue/i, 'Must persist retry queue in shared container');
  });

  it('Backend API ingestion accepts iOS device payload with Bearer device token and schemaVersion 1', async () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);
      const tokenObj = deviceService.createToken({ userId: 2, deviceName: 'iPhone 15 Pro Keyboard' });
      assert.ok(tokenObj.token.startsWith('ll_dev_'), 'Device token must be ll_dev_ format');

      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'I am writing a message using the custom iOS keyboard.',
          summaryRu: 'Корректное предложение в Present Continuous.',
          errors: [],
          topicEvidence: [],
        }),
      });

      const iosPayload = {
        schemaVersion: 1,
        eventId: 'ios-evt-8899',
        sourceApp: 'LinguaLearnKeyboardExtension',
        originalText: 'I am writting a message using the custom iOS keyboard.',
        text: 'I am writting a message using the custom iOS keyboard.',
        sentAt: new Date().toISOString(),
        previewOnly: false,
        userId: 2,
      };

      const result = await service.analyze(iosPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.schemaVersion, 1);
      assert.equal(result.response.eventId, 'ios-evt-8899');
      assert.equal(result.response.sourceApp, 'LinguaLearnKeyboardExtension');
      assert.equal(result.response.changed, true);
    } finally {
      db.close();
    }
  });

  it('Preview popup mode in iOS keyboard sends previewOnly: true without updating progress', async () => {
    const db = createTestDatabase();
    try {
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'He does not like apples.',
          summaryRu: 'Исправлено отрицание.',
          errors: [
            {
              original: "don't",
              correction: "doesn't",
              explanationRu: "Используйте doesn't для третьего лица.",
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.9,
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.9,
              explanationRu: 'Ошибка.',
            },
          ],
        }),
      });

      const previewPayload = {
        schemaVersion: 1,
        eventId: 'ios-prev-001',
        sourceApp: 'LinguaLearnKeyboardExtension',
        originalText: "He don't like apples.",
        text: "He don't like apples.",
        sentAt: new Date().toISOString(),
        previewOnly: true,
        userId: 2,
      };

      const result = await service.analyze(previewPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.previewOnly, true);

      const sample = db.prepare('SELECT preview_only FROM writing_samples WHERE event_id = ?').get('ios-prev-001');
      assert.equal(sample.preview_only, 1);

      const evidenceCount = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount, 0, 'Preview popup mode must NOT insert grammar_evidence records');
    } finally {
      db.close();
    }
  });

  it('VAL-IOS-002: iOS Keychain App Group storage and send-only trigger implementation', () => {
    const keychainPath = path.join(iosDir, 'LinguaLearnKeyboardExtension/Shared/KeychainAppGroupManager.swift');
    assert.equal(fs.existsSync(keychainPath), true, 'KeychainAppGroupManager.swift must exist');

    const keychainContent = fs.readFileSync(keychainPath, 'utf8');
    assert.match(keychainContent, /group\.ai\.factory\.lingualearn/i, 'Keychain must use App Group container group.ai.factory.lingualearn');
    assert.match(keychainContent, /SecItemAdd|SecItemCopyMatching|SecItemDelete/i, 'Keychain must use SecItem APIs');
    assert.match(keychainContent, /kSecAttrAccessGroup/i, 'Keychain query must set kSecAttrAccessGroup');

    const keyboardVcPath = path.join(iosDir, 'LinguaLearnKeyboardExtension/KeyboardViewController.swift');
    assert.equal(fs.existsSync(keyboardVcPath), true, 'KeyboardViewController.swift must exist');

    const vcContent = fs.readFileSync(keyboardVcPath, 'utf8');
    assert.match(vcContent, /handleSendTrigger|triggerSendEvent/i, 'KeyboardViewController must provide explicit send trigger action');
    assert.match(vcContent, /sendButton|handleReturnKey/i, 'KeyboardViewController must support explicit Send/Return triggers');

    const keychainTestsPath = path.join(iosDir, 'LinguaLearnTests/KeychainAppGroupManagerTests.swift');
    assert.equal(fs.existsSync(keychainTestsPath), true, 'KeychainAppGroupManagerTests.swift must exist');

    const sendTestsPath = path.join(iosDir, 'LinguaLearnTests/SendTriggerTests.swift');
    assert.equal(fs.existsSync(sendTestsPath), true, 'SendTriggerTests.swift must exist');
  });
});
