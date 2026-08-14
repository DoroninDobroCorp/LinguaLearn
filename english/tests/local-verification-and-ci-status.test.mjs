import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

test('VAL-VERIFY-001 / VAL-CI-003: Reproducible verification runner & verified manifest', async (t) => {
  const scriptPath = fs.existsSync(path.join(REPO_ROOT, 'scripts/verify-english-beta.sh'))
    ? path.join(REPO_ROOT, 'scripts/verify-english-beta.sh')
    : path.join(REPO_ROOT, 'Scripts/verify-english-beta.sh');

  if (process.env.VERIFY_ENGLISH_BETA_RUNNING === '1') {
    t.skip('Skipping recursive execution inside verify-english-beta.sh subshell');
    return;
  }

  await t.test('1. scripts/verify-english-beta.sh exists and is executable', () => {
    assert.equal(fs.existsSync(scriptPath), true, 'scripts/verify-english-beta.sh must exist');
    const stats = fs.statSync(scriptPath);
    // Check executable bit or permissions
    const isExecutable = (stats.mode & 0o111) !== 0;
    assert.equal(isExecutable, true, 'scripts/verify-english-beta.sh must be executable (chmod +x)');
  });

  await t.test('2. scripts/verify-english-beta.sh executes successfully and outputs verified manifest', { timeout: 300000 }, () => {
    const output = execSync(`bash "${scriptPath}"`, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 300000 });
    assert.match(output, /Verified Manifest Generated|VERIFIED/, 'Script stdout must indicate verified manifest generation');

    const manifestPath = path.join(REPO_ROOT, 'verified-manifest.json');
    const reportsManifestPath = path.join(REPO_ROOT, 'english/server/reports/verified-manifest.json');
    assert.equal(fs.existsSync(manifestPath), true, 'verified-manifest.json must exist at REPO_ROOT');
    assert.equal(fs.existsSync(reportsManifestPath), true, 'verified-manifest.json must exist in english/server/reports');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Check git SHA fields
    assert.ok(manifest.gitCommit, 'manifest must include gitCommit');
    assert.equal(typeof manifest.gitPushed, 'boolean', 'manifest must include gitPushed boolean');

    // Check localVerification object
    assert.ok(manifest.localVerification, 'manifest must include localVerification object');
    assert.equal(manifest.localVerification.nodeBackendTests.status, 'PASSED', 'Node backend tests status must be PASSED');
    assert.equal(manifest.localVerification.webFrontendBuild.status, 'PASSED', 'Web frontend build status must be PASSED');
    assert.equal(manifest.localVerification.openApiContractValidation.status, 'PASSED', 'OpenAPI contract validation status must be PASSED');
    assert.equal(manifest.localVerification.npmAuditProductionGate.status, 'PASSED', 'npm audit production gate status must be PASSED');
    assert.ok(
      manifest.localVerification.macOSSwiftTests.status === 'PASSED' ||
        manifest.localVerification.macOSSwiftTests.status.startsWith('BLOCKED'),
      'macOS Swift tests status must be PASSED or BLOCKED'
    );
    assert.ok(
      manifest.localVerification.iOSSimulatorTests.status === 'PASSED' ||
        manifest.localVerification.iOSSimulatorTests.status.startsWith('BLOCKED'),
      'iOS Simulator tests status must be PASSED or BLOCKED'
    );
    assert.ok(
      manifest.localVerification.androidGradleTests.status === 'PASSED' ||
        manifest.localVerification.androidGradleTests.status.startsWith('BLOCKED'),
      'Android Gradle tests status must be PASSED or BLOCKED'
    );

    // Check unexecuted platforms reported as BLOCKED/NOT_RUN (never false PASSED)
    assert.ok(
      manifest.localVerification.windowsDotnetTests.status.startsWith('BLOCKED') ||
        manifest.localVerification.windowsDotnetTests.status === 'NOT_RUN' ||
        manifest.localVerification.windowsDotnetTests.status === 'SKIPPED_HOST_UNSUPPORTED',
      'Unexecuted platform suites must be reported as BLOCKED/NOT_RUN'
    );
    assert.notEqual(manifest.localVerification.windowsDotnetTests.status, 'PASSED', 'Unexecuted windows tests must not be falsely claimed as PASSED');

    // Check artifact checksums
    assert.ok(manifest.artifactChecksums, 'manifest must include artifactChecksums');
    assert.equal(typeof manifest.artifactChecksums.webFrontendIndexHtml, 'string');
    assert.equal(manifest.artifactChecksums.webFrontendIndexHtml.length, 64, 'webFrontendIndexHtml sha256 must be 64 hex characters');
    assert.equal(typeof manifest.artifactChecksums.openApiSpec, 'string');
    assert.equal(manifest.artifactChecksums.openApiSpec.length, 64, 'openApiSpec sha256 must be 64 hex characters');

    // Check CI status reporting
    assert.ok(manifest.ciStatus, 'manifest must include ciStatus object');
    assert.equal(manifest.ciStatus.status, 'CI_BLOCKED_EXTERNAL', 'CI status must be reported as CI_BLOCKED_EXTERNAL');
    assert.equal(manifest.ciStatus.hasFalsePositivePassedClaims, false, 'hasFalsePositivePassedClaims must be false');
    assert.notEqual(manifest.ciStatus.status, 'PASSED', 'CI status must NOT be falsely claimed as PASSED');

    // Check overall status
    assert.ok(manifest.overallStatus, 'manifest must include overallStatus');
  });
});
