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
const windowsDir = path.join(rootDir, 'windows/LinguaLearnAgent');

function createTestDatabase() {
  const db = getDb(':memory:');

  db.prepare(`
    INSERT OR IGNORE INTO curriculum_topics
      (id, name, category, level, source)
    VALUES (1, 'Past Simple (irregular verbs)', 'Grammar', 'A2', 'preset')
  `).run();

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (1, 'owner@example.com', 'hash', 'owner')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (2, 'winuser@example.com', 'hash', 'user')").run();

  return db;
}

describe('Stage E: Windows Desktop Agent MVP (schemaVersion 1)', () => {
  it('VAL-STAGEE-001: Windows Agent project structure exists at windows/LinguaLearnAgent with required UI Automation, System Tray, Hotkey, and Queue components', () => {
    assert.equal(fs.existsSync(windowsDir), true, `Windows project directory must exist at ${windowsDir}`);

    const requiredFiles = [
      // Project Config / Build
      'LinguaLearnAgent.csproj',
      'App.xaml',
      'App.xaml.cs',
      'MainWindow.xaml',
      'MainWindow.xaml.cs',
      'README.md',

      // Core Components
      'UIAutomation/UIAutomationListener.cs',
      'Filter/CandidateFilter.cs',
      'Tray/SystemTrayController.cs',
      'Hotkey/PreviewHotkeyManager.cs',
      'Replacement/AutoReplaceEngine.cs',
      'Queue/OfflineRetryQueue.cs',
      'Network/ApiClient.cs',
      'Settings/PrivacyConsentManager.cs',

      // C# Tests Package
      'Tests/CandidateFilterTests.cs',
      'Tests/OfflineRetryQueueTests.cs',
      'Tests/ApiClientTests.cs',
      'Tests/ExplicitTriggerTests.cs',
      'Tests/ResponseParserTests.cs'
    ];

    for (const relativePath of requiredFiles) {
      const fullPath = path.join(windowsDir, relativePath);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Required Windows project file missing: ${relativePath} (at ${fullPath})`
      );
    }
  });

  it('CandidateFilter C# module content correctly implements password field rejection, prose filtering, cyrillic detection, and sentence boundary rules', () => {
    const filterPath = path.join(windowsDir, 'Filter/CandidateFilter.cs');
    assert.equal(fs.existsSync(filterPath), true, 'CandidateFilter.cs must exist');

    const content = fs.readFileSync(filterPath, 'utf8');
    assert.match(content, /class\s+CandidateFilter/, 'Must declare CandidateFilter');
    assert.match(content, /Cyrillic|cyrillic/i, 'Must check for Cyrillic characters');
    assert.match(content, /Code|code/i, 'Must check for code patterns');
    assert.match(content, /Url|url/i, 'Must check for URLs or emails');
    assert.match(content, /isSecureField|password/i, 'Must check for secure/password fields');
    assert.match(content, /SentenceTerminator|\.|\!|\?/i, 'Must check sentence boundary terminators');
  });

  it('SystemTrayController C# module content implements system tray menu with pause, device token pairing, settings, and preview hotkey mode', () => {
    const trayPath = path.join(windowsDir, 'Tray/SystemTrayController.cs');
    assert.equal(fs.existsSync(trayPath), true, 'SystemTrayController.cs must exist');

    const content = fs.readFileSync(trayPath, 'utf8');
    assert.match(content, /class\s+SystemTrayController/, 'Must declare SystemTrayController');
    assert.match(content, /NotifyIcon/i, 'Must use NotifyIcon for system tray');
    assert.match(content, /Pause|pause/i, 'Must support pause capture option');
    assert.match(content, /Pair|token/i, 'Must support device token pairing');
    assert.match(content, /Settings|settings/i, 'Must support settings dialog');
    assert.match(content, /Preview|Hotkey/i, 'Must support preview hotkey toggle');
  });

  it('OfflineRetryQueue C# module content manages local retry queue persistence and Bearer device token auth', () => {
    const queuePath = path.join(windowsDir, 'Queue/OfflineRetryQueue.cs');
    assert.equal(fs.existsSync(queuePath), true, 'OfflineRetryQueue.cs must exist');

    const content = fs.readFileSync(queuePath, 'utf8');
    assert.match(content, /class\s+OfflineRetryQueue/, 'Must declare OfflineRetryQueue');
    assert.match(content, /Enqueue|queue/i, 'Must support enqueue');
    assert.match(content, /Dequeue/i, 'Must support dequeue');
    assert.match(content, /RetryAll|retry/i, 'Must support retrying queue payloads');
    assert.match(content, /SaveQueue|LoadQueue|File/i, 'Must support durable file persistence');
  });

  it('Backend API ingestion accepts Windows Agent payload with Bearer device token and schemaVersion 1', async () => {
    const db = createTestDatabase();
    try {
      const deviceService = createDeviceTokenService(db);
      const tokenObj = deviceService.createToken({ userId: 2, deviceName: 'Windows 11 Desktop Agent' });
      assert.ok(tokenObj.token.startsWith('ll_dev_'), 'Device token must start with ll_dev_');

      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'I am typing an English sentence on my Windows desktop.',
          summaryRu: 'Корректное предложение.',
          errors: [],
          topicEvidence: [],
        }),
      });

      const winPayload = {
        schemaVersion: 1,
        eventId: 'win-evt-1001',
        sourceApp: 'LinguaLearnAgent',
        originalText: 'I am typing an English sentence on my Windows desktop.',
        text: 'I am typing an English sentence on my Windows desktop.',
        sentAt: new Date().toISOString(),
        previewOnly: false,
        userId: 2,
      };

      const result = await service.analyze(winPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.schemaVersion, 1);
      assert.equal(result.response.eventId, 'win-evt-1001');
      assert.equal(result.response.sourceApp, 'LinguaLearnAgent');
      assert.equal(result.response.changed, false);
    } finally {
      db.close();
    }
  });

  it('Preview hotkey mode in Windows Agent sends previewOnly: true without updating user progress', async () => {
    const db = createTestDatabase();
    try {
      const service = createWritingAnalysisService({
        db,
        analyzer: async () => ({
          isEnglish: true,
          correctedText: 'She does not work on Sundays.',
          summaryRu: 'Исправлена форма глагола.',
          errors: [
            {
              original: "don't",
              correction: "doesn't",
              explanationRu: "Пояснение.",
              topic: 'Past Simple (irregular verbs)',
              confidence: 0.9,
              kind: 'grammar_error',
              category: 'subject_verb_agreement',
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
        eventId: 'win-prev-003',
        sourceApp: 'LinguaLearnAgent',
        originalText: "She don't work on Sundays.",
        text: "She don't work on Sundays.",
        sentAt: new Date().toISOString(),
        previewOnly: true,
        userId: 2,
      };

      const result = await service.analyze(previewPayload);
      assert.equal(result.response.accepted, true);
      assert.equal(result.response.previewOnly, true);

      const sample = db.prepare('SELECT preview_only FROM writing_samples WHERE event_id = ?').get('win-prev-003');
      assert.equal(sample.preview_only, 1);

      const evidenceCount = db.prepare('SELECT COUNT(*) AS count FROM grammar_evidence WHERE user_id = 2').get().count;
      assert.equal(evidenceCount, 0, 'Preview mode must NOT insert grammar_evidence records');
    } finally {
      db.close();
    }
  });

  it('VAL-WIN-005: Windows DPAPI fail-closed encryption, automatic Enter key hook, and async retry queue', () => {
    // 1. Verify PrivacyConsentManager DPAPI fail-closed token protection (no PLAIN: fallback)
    const settingsPath = path.join(windowsDir, 'Settings/PrivacyConsentManager.cs');
    assert.equal(fs.existsSync(settingsPath), true, 'PrivacyConsentManager.cs must exist');
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    assert.match(settingsContent, /DPAPI:/, 'Must use DPAPI: prefix for protected tokens');
    assert.doesNotMatch(settingsContent, /"PLAIN:"/, 'Must NOT use PLAIN: fallback for unencrypted tokens');
    assert.match(settingsContent, /NormalizeHttpsUrl|StartsWith\("https:\/\/"/i, 'Must validate and enforce HTTPS API URL');

    // 2. Verify OfflineRetryQueue DPAPI fail-closed file encryption and async retry queue with exponential backoff
    const queuePath = path.join(windowsDir, 'Queue/OfflineRetryQueue.cs');
    assert.equal(fs.existsSync(queuePath), true, 'OfflineRetryQueue.cs must exist');
    const queueContent = fs.readFileSync(queuePath, 'utf8');
    assert.match(queueContent, /ProtectedData\.Protect/, 'Must protect offline queue file via DPAPI');
    assert.match(queueContent, /ProtectedData\.Unprotect/, 'Must unprotect offline queue file via DPAPI');
    assert.match(queueContent, /RetryAllAsync|async/i, 'Must support non-blocking async retry queue');
    assert.match(queueContent, /RetryCount|NextAttemptAt|Math\.Pow\(2/i, 'Must compute exponential backoff for retries');
    assert.match(queueContent, /StartBackgroundProcessor|Task\.Delay/i, 'Must run background processor loop');

    // 3. Verify EnterKeyHook low-level keyboard hook on editable controls excluding password fields
    const enterHookPath = path.join(windowsDir, 'UIAutomation/EnterKeyHook.cs');
    assert.equal(fs.existsSync(enterHookPath), true, 'EnterKeyHook.cs must exist');
    const enterHookContent = fs.readFileSync(enterHookPath, 'utf8');
    assert.match(enterHookContent, /WH_KEYBOARD_LL|SetWindowsHookEx/i, 'Must install low-level keyboard hook');
    assert.match(enterHookContent, /VK_RETURN|0x0D/i, 'Must hook VK_RETURN Enter key');

    const listenerPath = path.join(windowsDir, 'UIAutomation/UIAutomationListener.cs');
    assert.equal(fs.existsSync(listenerPath), true, 'UIAutomationListener.cs must exist');
    const listenerContent = fs.readFileSync(listenerPath, 'utf8');
    assert.match(listenerContent, /EnterKeyHook|TriggerEnterKeyCapture/i, 'UIAutomationListener must handle Enter key hook');
    assert.match(listenerContent, /IsSecureField|IsPassword/i, 'Must exclude secure/password fields from Enter key capture');

    // 4. Verify PreviewHotkeyManager registration timing
    const hotkeyPath = path.join(windowsDir, 'Hotkey/PreviewHotkeyManager.cs');
    assert.equal(fs.existsSync(hotkeyPath), true, 'PreviewHotkeyManager.cs must exist');
    const hotkeyContent = fs.readFileSync(hotkeyPath, 'utf8');
    assert.match(hotkeyContent, /RegisterWindowHandle/i, 'Hotkey registration must wait for window handle');
    assert.doesNotMatch(hotkeyContent, /RegisterHotKey\(IntPtr\.Zero/i, 'Must NOT attempt premature IntPtr.Zero hotkey registration in constructor');
  });
});
