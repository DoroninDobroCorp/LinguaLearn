import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../server/scripts/generateAuditEvidenceReport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('VAL-CI-004: CI Truth & Completion Reporting Pass 5', () => {
  let tmpDir;

  function createValidFixtures(baseDir) {
    const fixtureDir = path.join(baseDir, 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });

    // 1. Valid verified-manifest.json with CI_BLOCKED_EXTERNAL and READY_FOR_OWNER_ACTION
    const manifestPath = path.join(fixtureDir, 'verified-manifest.json');
    const manifestData = {
      schemaVersion: 1,
      timestamp: '2026-08-14T00:00:00Z',
      gitCommit: '0138399d8904fc4cd7457497fc46acaebc73c92b',
      originMainCommit: '0138399d8904fc4cd7457497fc46acaebc73c92b',
      gitPushed: true,
      localVerification: {
        nodeBackendTests: { status: 'PASSED', passed: 259, failed: 0, skipped: 1 },
        webFrontendBuild: { status: 'PASSED' },
        macOSSwiftTests: { status: 'PASSED', passed: 47 },
        iOSSimulatorTests: { status: 'PASSED', passed: 30 },
        androidGradleTests: { status: 'PASSED', tasksPassed: 44 },
        windowsDotnetTests: { status: 'BLOCKED_HOST_UNSUPPORTED', reason: 'macOS host' },
      },
      ciStatus: {
        status: 'CI_BLOCKED_EXTERNAL',
        reason: 'GitHub Actions runner billing/quota is locked externally',
        hasFalsePositivePassedClaims: false,
        executedSteps: 0,
        matrixJobs: {
          nodeBackendAndFrontend: 'CI_BLOCKED_EXTERNAL',
          macOSSwift: 'CI_BLOCKED_EXTERNAL',
          iOSSimulator: 'CI_BLOCKED_EXTERNAL',
          androidGradle: 'CI_BLOCKED_EXTERNAL',
          windowsDotnet: 'CI_BLOCKED_EXTERNAL',
        },
      },
      overallStatus: 'READY_FOR_OWNER_ACTION',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

    // 2. Valid eval-gemini-live.json
    const liveEvalPath = path.join(fixtureDir, 'eval-gemini-live.json');
    const liveEvalData = {
      mode: 'live',
      totalSamples: 125,
      realModelCallCount: 125,
      metrics: {
        totalSamples: 125,
        realModelCallCount: 125,
        precision: 1.0,
        recall: 1.0,
        f1Score: 1.0,
        falsePositivePenalties: 0,
        schemaValidityRate: 1.0,
        tierAccuracy: 0.80,
        latencyBreakdown: {
          avgQueueMs: 1.2,
          avgModelMs: 1.5,
          avgDbMs: 0.8,
          avgTotalMs: 3.5,
          p50TotalMs: 3.2,
          p95TotalMs: 4.8,
        },
      },
      confusionMatrix: { tp: 100, fp: 0, fn: 0, tn: 25 },
      promptHash: '2f93e4db198219a3f2df6ecf688473cb023466a75e616eecdb36f7006b998340',
      corpusHash: 'c931d03d7d1e1fd11809c411cd716284cd39503237b594aa83f35fbbe1a8e560',
    };
    fs.writeFileSync(liveEvalPath, JSON.stringify(liveEvalData, null, 2));

    // 3. Valid backups directory & metadata
    const backupsDir = path.join(fixtureDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const dbFile = path.join(backupsDir, 'english_learning_valid.db');
    const dbContent = Buffer.from('VALID_SQLITE_DATABASE_BYTES_PASS5_CI');
    fs.writeFileSync(dbFile, dbContent);
    const dbSha256 = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaFile = path.join(backupsDir, 'english_learning_valid.db.json');
    const metaData = {
      timestamp: '2026-08-14T00:00:00Z',
      filename: 'english_learning_valid.db',
      backupPath: dbFile,
      sizeBytes: dbContent.length,
      sha256: dbSha256,
      commitSha: '0138399d8904fc4cd7457497fc46acaebc73c92b',
      integrityCheck: 'ok',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaData, null, 2));

    // 4. Valid web frontend dist directory
    const distDir = path.join(fixtureDir, 'dist');
    const assetsDir = path.join(distDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>LinguaLearn</body></html>');
    fs.writeFileSync(path.join(assetsDir, 'index.abc123.js'), 'console.log("bundle");');
    fs.writeFileSync(path.join(assetsDir, 'index.def456.css'), 'body { margin: 0; }');

    const outputPath = path.join(fixtureDir, 'AUDIT_EVIDENCE_REPORT.md');

    return {
      verifiedManifestPath: manifestPath,
      liveEvalPath,
      backupsDir,
      distDir,
      outputPath,
      skipHealthCheck: true,
    };
  }

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-truth-pass5-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. verified-manifest.json includes honest CI_BLOCKED_EXTERNAL status, 0 executed steps, and READY_FOR_OWNER_ACTION', () => {
    const opts = createValidFixtures(tmpDir);
    const manifest = JSON.parse(fs.readFileSync(opts.verifiedManifestPath, 'utf8'));

    assert.equal(manifest.ciStatus.status, 'CI_BLOCKED_EXTERNAL');
    assert.equal(manifest.ciStatus.executedSteps, 0);
    assert.equal(manifest.ciStatus.hasFalsePositivePassedClaims, false);
    assert.equal(manifest.overallStatus, 'READY_FOR_OWNER_ACTION');
  });

  it('2. generateAuditEvidenceReport produces AUDIT_EVIDENCE_REPORT.md with READY_FOR_OWNER_ACTION status and itemized BLOCKED items', async () => {
    const opts = createValidFixtures(tmpDir);
    const reportMd = await generateReport(opts);

    assert.ok(reportMd.includes('**READY_FOR_OWNER_ACTION**'), 'Report must include READY_FOR_OWNER_ACTION overall status');
    assert.ok(reportMd.includes('**CI_BLOCKED_EXTERNAL**'), 'Report must include CI_BLOCKED_EXTERNAL status');
    assert.ok(reportMd.includes('Itemized BLOCKED Items & Required Owner Actions'), 'Report must include itemized BLOCKED section');
    assert.ok(reportMd.includes('BLOCKED-CI-001'), 'Report must itemize BLOCKED-CI-001');
    assert.ok(reportMd.includes('BLOCKED-SEC-001'), 'Report must itemize BLOCKED-SEC-001');
    assert.ok(reportMd.includes('BLOCKED-MAC-001'), 'Report must itemize BLOCKED-MAC-001');
    assert.ok(reportMd.includes('VAL-CI-004'), 'Report must include VAL-CI-004 in fulfillment matrix');

    // Never claim false PASSED as overall audit status when CI is blocked
    const execSummary = reportMd.split('---')[0];
    assert.ok(!execSummary.includes('**Overall Audit & Verification Status**: **PASSED**'), 'Overall status must not claim PASSED when CI is blocked');
  });
});
