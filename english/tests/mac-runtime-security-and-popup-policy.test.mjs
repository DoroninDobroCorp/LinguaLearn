import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const macRoot = join(root, 'macos', 'LinguaLearnCapture', 'Sources', 'LinguaLearnCapture');
const storeSource = readFileSync(join(macRoot, 'ConfigurationStore.swift'), 'utf8');
const appSource = readFileSync(join(macRoot, 'AppDelegate.swift'), 'utf8');
const popupSource = readFileSync(join(macRoot, 'CorrectionPopupController.swift'), 'utf8');

describe('macOS capture production policy', () => {
  it('stores device tokens only in Keychain and redacts config.json', () => {
    assert.match(storeSource, /guard KeychainTokenStorage\.saveToken\(token\)/);
    assert.match(storeSource, /var redacted = configuration/);
    assert.match(storeSource, /redacted\.bearerToken = "CHANGE_ME"/);
    assert.match(storeSource, /encode\(redacted\)/);
    assert.doesNotMatch(storeSource, /encode\(configuration\)/);
  });

  it('migrates legacy plaintext tokens and fails closed on Keychain failure', () => {
    assert.match(storeSource, /One-time migration from older builds/);
    assert.match(storeSource, /throw ConfigurationStoreError\.keychainWriteFailed/);
    assert.match(storeSource, /config\.bearerToken = keychainToken/);
  });

  it('does not show a large loading panel during automatic send capture', () => {
    const automaticStart = appSource.indexOf('private func submitAccessibilitySentence');
    const previewStart = appSource.indexOf('private func previewDraft');
    assert.ok(automaticStart > 0 && previewStart > automaticStart);
    const automaticBlock = appSource.slice(automaticStart, previewStart);
    assert.doesNotMatch(automaticBlock, /showAnalyzing/);

    const previewEnd = appSource.indexOf('private func handleAnalysis');
    const previewBlock = appSource.slice(previewStart, previewEnd);
    assert.match(previewBlock, /showAnalyzing/);
    assert.match(previewBlock, /previewOnly: true/);
  });

  it('coalesces automatic success chips while preserving detailed correction cards', () => {
    assert.match(popupSource, /viewModel\.displayMode == \.compactChip/);
    assert.match(popupSource, /presentations\.removeAll \{ \$0\.viewModel\.displayMode == \.compactChip \}/);
    assert.match(popupSource, /currentDisplayMode == \.compactChip/);
    assert.match(popupSource, /Grammar OK ✓/);
    assert.match(appSource, /configuration\?\.showOnlyWhenChanged == true/);
  });
});
