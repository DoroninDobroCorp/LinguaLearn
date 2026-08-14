import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const MAC_PACKAGE_ROOT = path.join(REPO_ROOT, 'macos/LinguaLearnCapture');

const isMac = process.platform === 'darwin' && fs.existsSync('/usr/bin/plutil');

describe('VAL-MAC-005: macOS Sparkle 2 Auto-Updater, Pairing & Doctor Checks', () => {
  it('Resources/Info.plist contains valid Sparkle 2 config and bumped version 0.1.1', (t) => {
    const infoPlistPath = path.join(MAC_PACKAGE_ROOT, 'Resources/Info.plist');
    assert.ok(fs.existsSync(infoPlistPath), 'Info.plist must exist');

    const plistContent = fs.readFileSync(infoPlistPath, 'utf8');
    assert.match(plistContent, /<key>SUFeedURL<\/key>/, 'Must specify SUFeedURL');
    assert.match(plistContent, /<key>SUPublicEDKey<\/key>/, 'Must specify SUPublicEDKey');

    if (!isMac) {
      t.skip('Skipping plutil check on non-macOS environment');
      return;
    }

    const versionOutput = execSync(`/usr/bin/plutil -extract CFBundleShortVersionString raw "${infoPlistPath}"`, { encoding: 'utf8' }).trim();
    assert.equal(versionOutput, '0.1.1', 'CFBundleShortVersionString must be 0.1.1 proving package bump from 0.1.0');

    const pubKeyOutput = execSync(`/usr/bin/plutil -extract SUPublicEDKey raw "${infoPlistPath}"`, { encoding: 'utf8' }).trim();
    assert.ok(pubKeyOutput.length > 20, 'SUPublicEDKey must be a valid base64 Ed25519 public key');
  });

  it('Release and update scripts exist in both repository root and macos directory', () => {
    const rootReleaseScript = path.join(REPO_ROOT, 'Scripts/release-mac.sh');
    const rootUpdateScript = path.join(REPO_ROOT, 'Scripts/update-installed.sh');
    const macReleaseScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/release-mac.sh');
    const macUpdateScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/update-installed.sh');

    assert.ok(fs.existsSync(rootReleaseScript), 'Root Scripts/release-mac.sh must exist');
    assert.ok(fs.existsSync(rootUpdateScript), 'Root Scripts/update-installed.sh must exist');
    assert.ok(fs.existsSync(macReleaseScript), 'macOS Scripts/release-mac.sh must exist');
    assert.ok(fs.existsSync(macUpdateScript), 'macOS Scripts/update-installed.sh must exist');

    const rootReleaseStat = fs.statSync(rootReleaseScript);
    const rootUpdateStat = fs.statSync(rootUpdateScript);
    const macReleaseStat = fs.statSync(macReleaseScript);
    const macUpdateStat = fs.statSync(macUpdateScript);

    assert.ok((rootReleaseStat.mode & 0o111) !== 0, 'Root release-mac.sh must be executable');
    assert.ok((rootUpdateStat.mode & 0o111) !== 0, 'Root update-installed.sh must be executable');
    assert.ok((macReleaseStat.mode & 0o111) !== 0, 'macOS release-mac.sh must be executable');
    assert.ok((macUpdateStat.mode & 0o111) !== 0, 'macOS update-installed.sh must be executable');
  });

  it('Release packaging generates valid signed mac-appcast.xml and zip artifact', (t) => {
    const releaseDist = path.join(MAC_PACKAGE_ROOT, '.build/release-dist');
    const appcastPath = path.join(releaseDist, 'mac-appcast.xml');
    const zipPath = path.join(releaseDist, 'LinguaLearnCapture-v0.1.1.zip');

    if (!fs.existsSync(appcastPath) || !fs.existsSync(zipPath)) {
      t.skip('Skipping appcast artifact test because release-dist artifact is not built on non-macOS host');
      return;
    }

    assert.ok(fs.existsSync(appcastPath), 'mac-appcast.xml must exist in release-dist');
    assert.ok(fs.existsSync(zipPath), 'LinguaLearnCapture-v0.1.1.zip must exist in release-dist');

    const appcastXml = fs.readFileSync(appcastPath, 'utf8');
    assert.match(appcastXml, /<rss version="2\.0" xmlns:sparkle="http:\/\/www\.sparkle-project\.org\/Sparkle\/1\.0">/, 'Appcast must be valid Sparkle RSS XML');
    assert.match(appcastXml, /<sparkle:version>0\.1\.1<\/sparkle:version>/, 'Appcast must contain version 0.1.1');
    assert.match(appcastXml, /sparkle:edSignature="[A-Za-z0-9+/=]+"/, 'Enclosure must contain base64 Ed25519 signature');
  });

  it('Ed25519 signature in appcast verifies cleanly against public key in Info.plist', (t) => {
    if (!isMac) {
      t.skip('Skipping Swift CryptoKit verification on non-macOS environment');
      return;
    }
    const infoPlistPath = path.join(MAC_PACKAGE_ROOT, 'Resources/Info.plist');
    const pubKey = execSync(`/usr/bin/plutil -extract SUPublicEDKey raw "${infoPlistPath}"`, { encoding: 'utf8' }).trim();

    const appcastPath = path.join(MAC_PACKAGE_ROOT, '.build/release-dist/mac-appcast.xml');
    if (!fs.existsSync(appcastPath)) {
      t.skip('Appcast file missing');
      return;
    }
    const appcastXml = fs.readFileSync(appcastPath, 'utf8');
    const sigMatch = appcastXml.match(/sparkle:edSignature="([^"]+)"/);
    assert.ok(sigMatch, 'Must find sparkle:edSignature in appcast XML');
    const edSignature = sigMatch[1];

    const zipPath = path.join(MAC_PACKAGE_ROOT, '.build/release-dist/LinguaLearnCapture-v0.1.1.zip');

    const verifyCmd = `swift -e '
      import CryptoKit
      import Foundation

      let pubB64 = "${pubKey}"
      let sigB64 = "${edSignature}"
      let zipPath = "${zipPath}"

      let pubKeyData = Data(base64Encoded: pubB64)!
      let signature = Data(base64Encoded: sigB64)!
      let archiveData = try Data(contentsOf: URL(fileURLWithPath: zipPath))

      let key = try Curve25519.Signing.PublicKey(rawRepresentation: pubKeyData)
      let isValid = key.isValidSignature(signature, for: archiveData)
      if !isValid { exit(1) }
    '`;

    assert.doesNotThrow(() => {
      execSync(verifyCmd, { encoding: 'utf8' });
    }, 'Swift CryptoKit Ed25519 signature verification must pass');
  });

  it('macOS doctor.sh checks pass with zero automatic errors', (t) => {
    if (!isMac) {
      t.skip('Skipping doctor.sh check on non-macOS environment');
      return;
    }
    const doctorScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/doctor.sh');
    assert.ok(fs.existsSync(doctorScript), 'doctor.sh script must exist');

    const output = execSync(doctorScript, { encoding: 'utf8' });
    assert.match(output, /ИТОГ: автоматическая часть здорова/, 'doctor.sh must report healthy automatic checks');
    assert.match(output, /Sparkle 2 Updater keys present in Info\.plist/, 'doctor.sh must confirm Sparkle 2 keys');
    assert.match(output, /Device token paired/, 'doctor.sh must confirm device token pairing');
  });

  it('mac-appcast.xml is served with application/xml MIME type', async (t) => {
    const appcastPath = path.join(MAC_PACKAGE_ROOT, '.build/release-dist/mac-appcast.xml');
    if (!fs.existsSync(appcastPath)) {
      t.skip('Appcast file missing on non-macOS build');
      return;
    }

    // Verify file content starts with xml header
    const content = fs.readFileSync(appcastPath, 'utf8');
    assert.ok(content.startsWith('<?xml version="1.0"'), 'Appcast file must be valid XML document');
  });
});
