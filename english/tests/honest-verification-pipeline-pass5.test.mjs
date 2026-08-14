import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../server/scripts/generateAuditEvidenceReport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('VAL-VERIFY-002: Honest Verification Pipeline & False-Positive Prevention', () => {
  let tmpDir;

  function createValidFixtures(baseDir) {
    const fixtureDir = path.join(baseDir, 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });

    // 1. Valid verified-manifest.json
    const manifestPath = path.join(fixtureDir, 'verified-manifest.json');
    const manifestData = {
      schemaVersion: 1,
      timestamp: '2026-08-14T00:00:00Z',
      gitCommit: '1f47c513d0fe2a0c60d130c8474ca99368a638ce',
      originMainCommit: '1f47c513d0fe2a0c60d130c8474ca99368a638ce',
      gitPushed: true,
      localVerification: {
        nodeBackendTests: { status: 'PASSED', passed: 235, failed: 0, skipped: 2 },
        webFrontendBuild: { status: 'PASSED' },
        macOSSwiftTests: { status: 'PASSED', passed: 47 },
        iOSSimulatorTests: { status: 'PASSED', passed: 30 },
        androidGradleTests: { status: 'PASSED', tasksPassed: 44 },
        windowsDotnetTests: { status: 'BLOCKED_HOST_UNSUPPORTED', reason: 'macOS host' },
      },
      ciStatus: {
        status: 'CI_BLOCKED_EXTERNAL',
        reason: 'Runner billing locked',
        hasFalsePositivePassedClaims: false,
      },
      overallStatus: 'VERIFIED_LOCAL_PASSED_CI_BLOCKED',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

    // 2. Valid eval-gemini-live.json (mode: live, 125 samples, matching call count)
    const liveEvalPath = path.join(fixtureDir, 'eval-gemini-live.json');
    const liveEvalData = {
      evaluator: 'Live Gemini API Evaluation Harness',
      modelName: 'gemini-3.5-flash-lite',
      mode: 'live',
      timestamp: '2026-08-14T12:00:00.000Z',
      promptVersion: 'v1',
      promptHash: '2f93e4db198219a3f2df6ecf688473cb023466a75e616eecdb36f7006b998340',
      corpusHash: 'c931d03d7d1e1fd11809c411cd716284cd39503237b594aa83f35fbbe1a8e560',
      totalSamples: 125,
      serviceAttemptCount: 125,
      realModelCallCount: 125,
      modelRetryCount: 0,
      locallyRejectedCount: 0,
      metrics: {
        totalSamples: 125,
        realModelCallCount: 125,
        precision: 0.98,
        recall: 0.98,
        f1Score: 0.98,
        falsePositivePenalties: 0,
        schemaValidityRate: 1.0,
        tierAccuracy: 0.95,
        latencyBreakdown: {
          avgQueueMs: 1.2,
          avgModelMs: 1.5,
          avgDbMs: 0.8,
          avgTotalMs: 3.5,
          p50TotalMs: 3.2,
          p95TotalMs: 4.8,
        },
      },
      confusionMatrix: { tp: 98, fp: 2, fn: 2, tn: 23 },
    };
    fs.writeFileSync(liveEvalPath, JSON.stringify(liveEvalData, null, 2));

    // 3. Valid backups directory & metadata
    const backupsDir = path.join(fixtureDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const dbFile = path.join(backupsDir, 'english_learning_valid.db');
    const dbContent = Buffer.from('VALID_SQLITE_DATABASE_BYTES_PASS5');
    fs.writeFileSync(dbFile, dbContent);
    const dbSha256 = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaFile = path.join(backupsDir, 'english_learning_valid.db.json');
    const metaData = {
      timestamp: '2026-08-14T00:00:00Z',
      filename: 'english_learning_valid.db',
      backupPath: dbFile,
      sizeBytes: dbContent.length,
      sha256: dbSha256,
      commitSha: '1f47c513d0fe2a0c60d130c8474ca99368a638ce',
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-verification-pass5-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. verify-english-beta.sh prevents recursive runner execution when VERIFY_ENGLISH_BETA_RUNNING=1', () => {
    const scriptPath = path.join(REPO_ROOT, 'Scripts/verify-english-beta.sh');
    const res = spawnSync('bash', [scriptPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, VERIFY_ENGLISH_BETA_RUNNING: '1' },
    });

    assert.equal(res.status, 1, 'Script must exit with status 1 on recursive call');
    assert.match(res.stderr, /Recursive execution of verify-english-beta.sh detected/, 'Stderr must report recursion error');
  });

  it('2. generateAuditEvidenceReport rejects report when live eval mode is not live (mode != live)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const mockEvalPath = path.join(tmpDir, 'mock-eval.json');
    const evalData = JSON.parse(fs.readFileSync(baseOpts.liveEvalPath, 'utf8'));
    evalData.mode = 'mock';
    fs.writeFileSync(mockEvalPath, JSON.stringify(evalData));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: mockEvalPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /live eval mode is "mock", required "live"/);
        return true;
      }
    );
  });

  it('3. generateAuditEvidenceReport rejects report when live eval totalSamples is less than 125', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const smallEvalPath = path.join(tmpDir, 'small-eval.json');
    const evalData = JSON.parse(fs.readFileSync(baseOpts.liveEvalPath, 'utf8'));
    evalData.mode = 'live';
    evalData.totalSamples = 100;
    evalData.metrics.totalSamples = 100;
    evalData.realModelCallCount = 100;
    fs.writeFileSync(smallEvalPath, JSON.stringify(evalData));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: smallEvalPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /totalSamples \(100\) below required 125/);
        return true;
      }
    );
  });

  it('4. generateAuditEvidenceReport rejects report when realModelCallCount does not equal totalSamples', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const mismatchCallPath = path.join(tmpDir, 'mismatch-call-eval.json');
    const evalData = JSON.parse(fs.readFileSync(baseOpts.liveEvalPath, 'utf8'));
    evalData.mode = 'live';
    evalData.totalSamples = 125;
    evalData.metrics.totalSamples = 125;
    evalData.realModelCallCount = 100; // Intentional mismatch
    fs.writeFileSync(mismatchCallPath, JSON.stringify(evalData));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: mismatchCallPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /realModelCallCount \(100\) does not match totalSamples \(125\)/);
        return true;
      }
    );
  });

  it('5. generateAuditEvidenceReport rejects report when tierAccuracy drops below gate (< 0.75)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const lowTierPath = path.join(tmpDir, 'low-tier-eval.json');
    const evalData = JSON.parse(fs.readFileSync(baseOpts.liveEvalPath, 'utf8'));
    evalData.mode = 'live';
    evalData.metrics.tierAccuracy = 0.50; // Below gate
    fs.writeFileSync(lowTierPath, JSON.stringify(evalData));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: lowTierPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /tierAccuracy \(0\.5\) below required gate/);
        return true;
      }
    );
  });

  it('6. generateAuditEvidenceReport rejects report on unverified database backup (SHA-256 mismatch)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const corruptBackupsDir = path.join(tmpDir, 'corrupt-backups-pass5');
    fs.mkdirSync(corruptBackupsDir, { recursive: true });

    const dbFile = path.join(corruptBackupsDir, 'english_learning.db');
    const metaFile = path.join(corruptBackupsDir, 'english_learning.db.json');

    const dbContent = Buffer.from('REAL_DATABASE_BYTES');
    fs.writeFileSync(dbFile, dbContent);

    const metaData = {
      timestamp: '2026-08-14T00:00:00Z',
      filename: 'english_learning.db',
      backupPath: dbFile,
      sizeBytes: dbContent.length,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Bad SHA
      integrityCheck: 'ok',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaData));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: corruptBackupsDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup SHA256 checksum mismatch/);
        return true;
      }
    );
  });
});
