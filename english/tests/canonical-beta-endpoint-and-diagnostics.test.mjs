import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.REPO_ROOT || path.resolve(__dirname, '../..');

describe('VAL-ENDPOINT-001: Canonical Beta Endpoint & Diagnostics UI Verification', () => {
  const canonicalEndpoint = 'https://145.239.82.124.sslip.io/english';

  it('1. iOS AppConfig specifies canonical default base URL', () => {
    const configPath = path.join(rootDir, 'ios/LinguaLearn/LinguaLearnKeyboardExtension/Shared/AppConfig.swift');
    assert.equal(fs.existsSync(configPath), true, `AppConfig.swift must exist at ${configPath}`);
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(
      content.includes(canonicalEndpoint),
      `iOS AppConfig.swift must set defaultBaseUrl to ${canonicalEndpoint}`
    );
  });

  it('2. Android ApiClient specifies canonical default base URL', () => {
    const apiClientPath = path.join(rootDir, 'android/LinguaLearn/app/src/main/java/com/factory/lingualearn/ime/net/ApiClient.kt');
    assert.equal(fs.existsSync(apiClientPath), true, `ApiClient.kt must exist at ${apiClientPath}`);
    const content = fs.readFileSync(apiClientPath, 'utf8');
    assert.ok(
      content.includes(canonicalEndpoint),
      `Android ApiClient.kt must set DEFAULT_BASE_URL to ${canonicalEndpoint}`
    );
  });

  it('3. Windows PrivacyConsentManager specifies canonical default base URL', () => {
    const settingsPath = path.join(rootDir, 'windows/LinguaLearnAgent/Settings/PrivacyConsentManager.cs');
    assert.equal(fs.existsSync(settingsPath), true, `PrivacyConsentManager.cs must exist at ${settingsPath}`);
    const content = fs.readFileSync(settingsPath, 'utf8');
    assert.ok(
      content.includes(canonicalEndpoint),
      `Windows PrivacyConsentManager.cs must set default ApiUrl to ${canonicalEndpoint}`
    );
  });

  it('4. macOS CaptureConfiguration specifies canonical default base URLs', () => {
    const configPath = path.join(rootDir, 'macos/LinguaLearnCapture/Sources/LinguaLearnCaptureCore/CaptureConfiguration.swift');
    assert.equal(fs.existsSync(configPath), true, `CaptureConfiguration.swift must exist at ${configPath}`);
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(
      content.includes(`${canonicalEndpoint}/api/writing/analyze`),
      `macOS template apiURL must point to ${canonicalEndpoint}/api/writing/analyze`
    );
    assert.ok(
      content.includes(canonicalEndpoint),
      `macOS template appURL must point to ${canonicalEndpoint}`
    );
  });

  it('5. iOS SettingsView implements Diagnostics UI with all required fields & Test Connection', () => {
    const settingsPath = path.join(rootDir, 'ios/LinguaLearn/LinguaLearnContainerApp/Settings/SettingsView.swift');
    assert.equal(fs.existsSync(settingsPath), true);
    const content = fs.readFileSync(settingsPath, 'utf8');
    assert.ok(content.includes('DiagnosticsView'), 'iOS must implement DiagnosticsView');
    assert.ok(content.includes('Test Connection'), 'iOS must implement Test Connection button');
    assert.ok(content.includes('appVersion'), 'iOS Diagnostics must include appVersion');
    assert.ok(content.includes('configuredUrl'), 'iOS Diagnostics must include configuredUrl');
    assert.ok(content.includes('backendCommit'), 'iOS Diagnostics must include backendCommit');
    assert.ok(content.includes('authStatus'), 'iOS Diagnostics must include authStatus');
    assert.ok(content.includes('deviceTokenStatus'), 'iOS Diagnostics must include deviceTokenStatus');
    assert.ok(content.includes('queueDepth'), 'iOS Diagnostics must include queueDepth');
    assert.ok(content.includes('syncStatus'), 'iOS Diagnostics must include syncStatus');
  });

  it('6. Android SettingsScreen implements Diagnostics UI with all required fields & Test Connection', () => {
    const settingsPath = path.join(rootDir, 'android/LinguaLearn/app/src/main/java/com/factory/lingualearn/settings/SettingsScreen.kt');
    assert.equal(fs.existsSync(settingsPath), true);
    const content = fs.readFileSync(settingsPath, 'utf8');
    assert.ok(content.includes('Diagnostics & Test Connection'), 'Android must include Diagnostics section');
    assert.ok(content.includes('Test Connection'), 'Android must include Test Connection button');
    assert.ok(content.includes('App Version'), 'Android Diagnostics must include App Version');
    assert.ok(content.includes('Configured URL'), 'Android Diagnostics must include Configured URL');
    assert.ok(content.includes('Backend Commit'), 'Android Diagnostics must include Backend Commit');
    assert.ok(content.includes('Auth Status'), 'Android Diagnostics must include Auth Status');
    assert.ok(content.includes('Device Token'), 'Android Diagnostics must include Device Token');
    assert.ok(content.includes('Queue Depth'), 'Android Diagnostics must include Queue Depth');
    assert.ok(content.includes('Sync Status'), 'Android Diagnostics must include Sync Status');
  });

  it('7. Windows MainWindow implements Diagnostics UI with all required fields & Test Connection', () => {
    const xamlPath = path.join(rootDir, 'windows/LinguaLearnAgent/MainWindow.xaml');
    const csPath = path.join(rootDir, 'windows/LinguaLearnAgent/MainWindow.xaml.cs');
    assert.equal(fs.existsSync(xamlPath), true);
    assert.equal(fs.existsSync(csPath), true);
    const xaml = fs.readFileSync(xamlPath, 'utf8');
    const cs = fs.readFileSync(csPath, 'utf8');
    assert.ok(xaml.includes('Diagnostics &amp; Test Connection'), 'Windows XAML must include Diagnostics section');
    assert.ok(xaml.includes('TestConnectionButton'), 'Windows XAML must include TestConnectionButton');
    assert.ok(cs.includes('TestConnectionButton_Click'), 'Windows C# must implement TestConnectionButton_Click');
    assert.ok(cs.includes('AppVersionTextBlock'), 'Windows C# must include AppVersionTextBlock');
    assert.ok(cs.includes('ConfiguredUrlTextBlock'), 'Windows C# must include ConfiguredUrlTextBlock');
    assert.ok(cs.includes('BackendCommitTextBlock'), 'Windows C# must include BackendCommitTextBlock');
    assert.ok(cs.includes('AuthStatusTextBlock'), 'Windows C# must include AuthStatusTextBlock');
    assert.ok(cs.includes('DeviceTokenStatusTextBlock'), 'Windows C# must include DeviceTokenStatusTextBlock');
    assert.ok(cs.includes('SyncStatusTextBlock'), 'Windows C# must include SyncStatusTextBlock');
  });

  it('8. macOS AppDelegate implements Diagnostics UI with all required fields & Test Connection', () => {
    const appDelegatePath = path.join(rootDir, 'macos/LinguaLearnCapture/Sources/LinguaLearnCapture/AppDelegate.swift');
    assert.equal(fs.existsSync(appDelegatePath), true);
    const content = fs.readFileSync(appDelegatePath, 'utf8');
    assert.ok(content.includes('Diagnostics / Test Connection'), 'macOS must include Diagnostics menu item');
    assert.ok(content.includes('openDiagnostics'), 'macOS must implement openDiagnostics()');
    assert.ok(content.includes('testConnectionFromDiagnostics'), 'macOS must implement testConnectionFromDiagnostics()');
    assert.ok(content.includes('App Version'), 'macOS Diagnostics must include App Version');
    assert.ok(content.includes('Configured URL'), 'macOS Diagnostics must include Configured URL');
    assert.ok(content.includes('Backend Commit'), 'macOS Diagnostics must include Backend Commit');
    assert.ok(content.includes('Auth Status'), 'macOS Diagnostics must include Auth Status');
    assert.ok(content.includes('Device Token Status'), 'macOS Diagnostics must include Device Token Status');
    assert.ok(content.includes('Queue Depth'), 'macOS Diagnostics must include Queue Depth');
    assert.ok(content.includes('Sync Status'), 'macOS Diagnostics must include Sync Status');
  });
});
