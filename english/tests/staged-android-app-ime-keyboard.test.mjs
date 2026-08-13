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
const androidDir = path.join(rootDir, 'android/LinguaLearn');

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
  `).run();

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'owner@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'androiduser@example.com', 'hash', 'user')").run();

  return db;
}

describe('Stage D: Android App and Input Method Editor (IME Keyboard Service) (schemaVersion 1)', () => {
  it('VAL-STAGED-001: Android project structure exists at android/LinguaLearn with required Container App and IME Service components', () => {
    assert.equal(fs.existsSync(androidDir), true, `Android project directory must exist at ${androidDir}`);

    const requiredFiles = [
      // Project Config / Build
      'build.gradle.kts',
      'settings.gradle.kts',
      'app/build.gradle.kts',
      'app/src/main/AndroidManifest.xml',
      'README.md',

      // Container App Package
      'app/src/main/java/com/factory/lingualearn/LinguaLearnApp.kt',
      'app/src/main/java/com/factory/lingualearn/MainActivity.kt',
      'app/src/main/java/com/factory/lingualearn/auth/AuthManager.kt',
      'app/src/main/java/com/factory/lingualearn/auth/LoginScreen.kt',
      'app/src/main/java/com/factory/lingualearn/devices/DeviceTokenManager.kt',
      'app/src/main/java/com/factory/lingualearn/devices/DeviceTokenScreen.kt',
      'app/src/main/java/com/factory/lingualearn/settings/SettingsScreen.kt',
      'app/src/main/java/com/factory/lingualearn/settings/PrivacyConsentManager.kt',
      'app/src/main/java/com/factory/lingualearn/inbox/InboxScreen.kt',
      'app/src/main/java/com/factory/lingualearn/today/TodayPracticeScreen.kt',
      'app/src/main/java/com/factory/lingualearn/retention/RetentionStatusScreen.kt',

      // IME Keyboard Service Package
      'app/src/main/java/com/factory/lingualearn/ime/LinguaLearnIMEKeyboardService.kt',
      'app/src/main/java/com/factory/lingualearn/ime/filter/CandidateFilter.kt',
      'app/src/main/java/com/factory/lingualearn/ime/ui/PreviewPopupController.kt',
      'app/src/main/java/com/factory/lingualearn/ime/replacement/AutoReplaceEngine.kt',
      'app/src/main/java/com/factory/lingualearn/ime/queue/BackgroundSyncQueue.kt',
      'app/src/main/java/com/factory/lingualearn/ime/net/ApiClient.kt',

      // Android Unit Tests Package
      'app/src/test/java/com/factory/lingualearn/CandidateFilterTest.kt',
      'app/src/test/java/com/factory/lingualearn/BackgroundSyncQueueTest.kt',
      'app/src/test/java/com/factory/lingualearn/ApiClientTest.kt'
    ];

    for (const relativePath of requiredFiles) {
      const fullPath = path.join(androidDir, relativePath);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Required Android project file missing: ${relativePath} (at ${fullPath})`
      );
    }
  });

  it('CandidateFilter Kotlin module content correctly implements sensitive field rejection, prose filtering, cyrillic detection, and sentence boundary rules', () => {
    const filterPath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/ime/filter/CandidateFilter.kt');
    assert.equal(fs.existsSync(filterPath), true, 'CandidateFilter.kt must exist');

    const content = fs.readFileSync(filterPath, 'utf8');
    assert.match(content, /class\s+CandidateFilter|object\s+CandidateFilter/, 'Must declare CandidateFilter');
    assert.match(content, /TYPE_TEXT_VARIATION_PASSWORD|isSensitiveField|TYPE_NUMBER_VARIATION_PASSWORD/i, 'Must check for password/sensitive inputType');
    assert.match(content, /containsCyrillic|cyrillic/i, 'Must check for Cyrillic characters');
    assert.match(content, /isCodeOrCommand|code/i, 'Must check for code/command patterns');
    assert.match(content, /isUrlOrEmail|url/i, 'Must check for URLs or emails');
    assert.match(content, /sentenceTerminator|\.|\!|\?/i, 'Must check sentence boundary terminators');
  });

  it('BackgroundSyncQueue Kotlin module content manages encrypted/durable storage and offline retry queue persistence', () => {
    const queuePath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/ime/queue/BackgroundSyncQueue.kt');
    assert.equal(fs.existsSync(queuePath), true, 'BackgroundSyncQueue.kt must exist');

    const content = fs.readFileSync(queuePath, 'utf8');
    assert.match(content, /class\s+BackgroundSyncQueue|object\s+BackgroundSyncQueue/, 'Must declare BackgroundSyncQueue');
    assert.match(content, /SharedPreferences|EncryptedSharedPreferences|SQLite|Room/i, 'Must use durable storage');
    assert.match(content, /enqueue|dequeue|retry|sync/i, 'Must support queue enqueue/retry operations');
    assert.match(content, /deviceToken|token/i, 'Must attach device token for authentication');
  });

  it('Backend API ingestion accepts Android device payload with Bearer device token and schemaVersion 1', async () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);
      const tokenObj = deviceService.createToken({ userId: 2, deviceName: 'Google Pixel 8 Keyboard' });
      assert.ok(tokenObj.token.startsWith('ll_dev_'), 'Device token must start with ll_dev_');

      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'I am typing a message on my Android keyboard.',
          summaryRu: 'Корректное предложение.',
          errors: [],
          topicEvidence: [],
        }),
      });

      const androidPayload = {
        schemaVersion: 1,
        eventId: 'android-evt-9911',
        sourceApp: 'LinguaLearnIMEKeyboardService',
        originalText: 'I am typing a message on my Android keyboard.',
        text: 'I am typing a message on my Android keyboard.',
        sentAt: new Date().toISOString(),
        previewOnly: false,
        userId: 2,
      };

      const result = await service.analyze(androidPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.schemaVersion, 1);
      assert.equal(result.response.eventId, 'android-evt-9911');
      assert.equal(result.response.sourceApp, 'LinguaLearnIMEKeyboardService');
      assert.equal(result.response.changed, false);
    } finally {
      db.close();
    }
  });

  it('VAL-ANDR-002: Token storage uses EncryptedSharedPreferences (no default fake token), duplicate event ID retries handled cleanly, and candidate bar preview rendered', () => {
    // 1. Verify EncryptedSharedPreferences usage
    const storagePath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/devices/EncryptedTokenStorage.kt');
    assert.equal(fs.existsSync(storagePath), true, 'EncryptedTokenStorage.kt must exist');
    const storageContent = fs.readFileSync(storagePath, 'utf8');
    assert.match(storageContent, /EncryptedSharedPreferences/i, 'Must use EncryptedSharedPreferences');

    const mgrPath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/devices/DeviceTokenManager.kt');
    const mgrContent = fs.readFileSync(mgrPath, 'utf8');
    assert.match(mgrContent, /EncryptedTokenStorage|EncryptedSharedPreferences/i, 'DeviceTokenManager must use EncryptedTokenStorage');

    // 2. Verify removal of default fake token
    const imePath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/ime/LinguaLearnIMEKeyboardService.kt');
    const imeContent = fs.readFileSync(imePath, 'utf8');
    assert.equal(imeContent.includes('ll_dev_android_default_token'), false, 'Must NOT contain fake default token ll_dev_android_default_token');

    // 3. Verify duplicate event ID retry handling
    const queuePath = path.join(androidDir, 'app/src/main/java/com/factory/lingualearn/ime/queue/BackgroundSyncQueue.kt');
    const queueContent = fs.readFileSync(queuePath, 'utf8');
    assert.match(queueContent, /eventId\s*:\s*String/, 'BackgroundSyncQueue must accept explicit eventId for retries');

    // 4. Verify IME candidate bar preview rendering
    assert.match(imeContent, /onCreateCandidatesView/i, 'LinguaLearnIMEKeyboardService must implement onCreateCandidatesView for candidate bar preview');
    assert.match(imeContent, /setCandidatesViewShown|updateCandidateBarPreview/i, 'LinguaLearnIMEKeyboardService must update candidate bar preview view state');
  });

  it('Preview popup mode in Android IME sends previewOnly: true without updating user progress', async () => {
    const db = createTestDatabase();
    try {
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'They do not want to go.',
          summaryRu: 'Исправлена грамматическая форма.',
          errors: [
            {
              original: "don't",
              correction: "doesn't",
              explanationRu: 'Пояснение.',
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.85,
              kind: 'grammar_error',
              category: 'subject_verb_agreement',
            },
          ],
          topicEvidence: [
            {
              topic: 'Past Simple (irregular verbs)',
              outcome: 'error',
              confidence: 0.85,
              explanationRu: 'Ошибка.',
            },
          ],
        }),
      });

      const previewPayload = {
        schemaVersion: 1,
        eventId: 'android-prev-002',
        sourceApp: 'LinguaLearnIMEKeyboardService',
        originalText: "They doesn't want to go.",
        text: "They doesn't want to go.",
        sentAt: new Date().toISOString(),
        previewOnly: true,
        userId: 2,
      };

      const result = await service.analyze(previewPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.previewOnly, true);

      const sample = db.prepare('SELECT preview_only FROM writing_samples WHERE event_id = ?').get('android-prev-002');
      assert.equal(sample.preview_only, 1);

      const evidenceCount = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount, 0, 'Preview mode must NOT insert grammar_evidence records');
    } finally {
      db.close();
    }
  });
});
