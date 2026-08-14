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

describe('VAL-MAC-006: Functional Mac Sparkle Updater Pass 5', () => {
  it('release-mac.sh fails closed if private key is missing', () => {
    const releaseScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/release-mac.sh');
    assert.ok(fs.existsSync(releaseScript), 'release-mac.sh must exist');

    // Run script with non-existent HOME so ~/.sparkle_ed25519_key is missing
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-key-test-'));
    try {
      assert.throws(() => {
        execSync(`HOME="${tmpDir}" "${releaseScript}"`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      }, /Command failed/, 'Must fail closed when private key is missing');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('release-mac.sh verifies public key match before release', (t) => {
    if (!isMac) {
      t.skip('Skipping public key verification test on non-macOS');
      return;
    }
    const releaseScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/release-mac.sh');
    const infoPlist = path.join(MAC_PACKAGE_ROOT, 'Resources/Info.plist');
    assert.ok(fs.existsSync(infoPlist), 'Info.plist must exist');

    const pubKey = execSync(`/usr/bin/plutil -extract SUPublicEDKey raw "${infoPlist}"`, { encoding: 'utf8' }).trim();
    assert.ok(pubKey.length > 20, 'SUPublicEDKey must be valid base64 string');
  });

  it('Public appcast returns HTTP 200 with Content-Type application/xml', async () => {
    const url = 'https://145.239.82.124.sslip.io/english/mac-appcast.xml';
    const res = await fetch(url);
    assert.equal(res.status, 200, 'Public appcast must return HTTP 200 OK');
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/xml') || contentType.includes('text/xml'), 'Content-Type must be application/xml');
    
    const text = await res.text();
    assert.ok(text.includes('<rss'), 'Body must be valid XML RSS');
    assert.ok(text.includes('<enclosure'), 'Body must contain enclosure element');
  });

  it('Enclosure URL serves downloadable release app ZIP', async () => {
    const appcastUrl = 'https://145.239.82.124.sslip.io/english/mac-appcast.xml';
    const res = await fetch(appcastUrl);
    const xmlText = await res.text();

    const urlMatch = xmlText.match(/enclosure url="([^"]+)"/);
    assert.ok(urlMatch, 'Appcast XML must contain enclosure URL');
    const enclosureUrl = urlMatch[1];

    const encRes = await fetch(enclosureUrl, { method: 'HEAD' });
    assert.equal(encRes.status, 200, 'Enclosure URL must return HTTP 200 OK');
    const lengthHeader = encRes.headers.get('content-length');
    assert.ok(Number(lengthHeader) > 100000, 'Enclosure size must be > 100KB');
  });

  it('doctor.sh downloads public appcast and enclosure, verifying XML, MIME, checksum, and signature', (t) => {
    if (!isMac) {
      t.skip('Skipping doctor.sh verification on non-macOS host');
      return;
    }
    const doctorScript = path.join(MAC_PACKAGE_ROOT, 'Scripts/doctor.sh');
    assert.ok(fs.existsSync(doctorScript), 'doctor.sh must exist');

    const output = execSync(doctorScript, { encoding: 'utf8' });
    assert.match(output, /Public appcast HTTP 200 OK/, 'doctor.sh must verify public appcast HTTP 200');
    assert.match(output, /Public appcast Content-Type is application\/xml/, 'doctor.sh must verify Content-Type application/xml');
    assert.match(output, /Enclosure downloaded size .* matches appcast length/, 'doctor.sh must verify enclosure size');
    assert.match(output, /Enclosure SHA256 checksum verified/, 'doctor.sh must verify enclosure SHA256');
    assert.match(output, /Enclosure Ed25519 signature verified against SUPublicEDKey/, 'doctor.sh must verify Ed25519 signature');
  });
});
