import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { generateReport } from '../server/scripts/generateAuditEvidenceReport.js';

describe('Fail-Closed Audit Evidence Pipeline (VAL-EVIDENCE-004)', () => {
  let tmpDir;

  function createValidFixtures(baseDir) {
    const fixtureDir = path.join(baseDir, 'fixtures');
    fs.mkdirSync(fixtureDir, { recursive: true });

    // 1. Valid verified-manifest.json
    const manifestPath = path.join(fixtureDir, 'verified-manifest.json');
    const manifestData = {
      schemaVersion: 1,
      timestamp: '2026-08-14T00:00:00Z',
      gitCommit: '6b3b80eb8407dafae06eb213cebbc52246d0a444',
      originMainCommit: '6b3b80eb8407dafae06eb213cebbc52246d0a444',
      gitPushed: true,
      localVerification: {
        nodeBackendTests: { status: 'PASSED', passed: 215, failed: 0, skipped: 1 },
        webFrontendBuild: { status: 'PASSED' },
        macOSSwiftTests: { status: 'PASSED', passed: 47 },
        iOSSimulatorTests: { status: 'PASSED', passed: 26 },
        androidGradleTests: { status: 'PASSED', tasksPassed: 44 },
        windowsDotnetTests: { status: 'SKIPPED_HOST_UNSUPPORTED', reason: 'macOS host' },
      },
      ciStatus: {
        status: 'CI_BLOCKED_EXTERNAL',
        reason: 'Runner billing locked',
        hasFalsePositivePassedClaims: false,
      },
      overallStatus: 'VERIFIED_LOCAL_PASSED_CI_BLOCKED',
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
      confusionMatrix: { tp: 98, fp: 2, fn: 2, tn: 100 },
      promptHash: 'abc123prompt',
      corpusHash: 'def456corpus',
    };
    fs.writeFileSync(liveEvalPath, JSON.stringify(liveEvalData, null, 2));

    // 3. Valid backups directory & metadata
    const backupsDir = path.join(fixtureDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const dbFile = path.join(backupsDir, 'english_learning_valid.db');
    const dbContent = Buffer.from('VALID_SQLITE_DATABASE_BYTES');
    fs.writeFileSync(dbFile, dbContent);
    const dbSha256 = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaFile = path.join(backupsDir, 'english_learning_valid.db.json');
    const metaData = {
      timestamp: '2026-08-14T00:00:00Z',
      filename: 'english_learning_valid.db',
      backupPath: dbFile,
      sizeBytes: dbContent.length,
      sha256: dbSha256,
      commitSha: '6b3b80eb8407dafae06eb213cebbc52246d0a444',
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-fail-closed-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/health includes gitCommit, buildTime, and appVersion fields', async () => {
    const { app } = await import('../server/index.js');
    let server;
    let port;

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    try {
      const url = `http://127.0.0.1:${port}/api/health`;
      const res = await fetch(url);
      assert.equal(res.status, 200, 'Health check must return HTTP 200');
      const data = await res.json();

      assert.equal(data.status, 'healthy');
      assert.equal(typeof data.gitCommit, 'string', 'gitCommit must be a string');
      assert.ok(data.gitCommit.length > 0, 'gitCommit must not be empty');
      assert.equal(typeof data.buildTime, 'string', 'buildTime must be a string');
      assert.ok(data.buildTime.length > 0, 'buildTime must not be empty');
      assert.equal(typeof data.appVersion, 'string', 'appVersion must be a string');
      assert.ok(data.appVersion.length > 0, 'appVersion must not be empty');
    } finally {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  });

  it('parses machine-readable verification outputs dynamically into markdown report without hardcoding', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const reportMd = await generateReport(baseOpts);

    assert.ok(reportMd.includes('| Node.js Backend & Integration | Node Test Runner (`node --test`) | 216 tests | 215 | 0 (1 skipped) | 100% | **PASSED** |'));
    assert.ok(reportMd.includes('| macOS Client (`LinguaLearnCapture`) | SwiftPM (`swift test`) | 47 tests | 47 | 0 | 100% | **PASSED** |'));
    assert.ok(reportMd.includes('| iOS Simulator (`LinguaLearn`) | Xcode (`run-tests.sh`) | 26 tests | 26 | 0 | 100% | **PASSED** |'));
    assert.ok(reportMd.includes('| Android Client (`LinguaLearn`) | Gradle (`./gradlew test`) | 44 Tasks | 44 | 0 | 100% | **PASSED** |'));
    assert.ok(reportMd.includes('| **Total Verified Test Suite** | **Multi-Stack** | **333 Tests & Tasks** | **332** | **0** | **100%** | **READY_FOR_OWNER_ACTION** |'));
    assert.ok(reportMd.includes('VAL-EVIDENCE-004'));
  });

  it('fails closed when verification manifest / test result artifact is missing', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const fakeManifestPath = path.join(tmpDir, 'missing-manifest.json');
    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, verifiedManifestPath: fakeManifestPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Verification manifest \/ test result artifact missing/);
        return true;
      }
    );
  });

  it('fails closed when verification manifest contains invalid/corrupt JSON', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const corruptManifestPath = path.join(tmpDir, 'corrupt-manifest.json');
    fs.writeFileSync(corruptManifestPath, '{ invalid json');
    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, verifiedManifestPath: corruptManifestPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Corrupt verification manifest/);
        return true;
      }
    );
  });

  it('fails closed when verification manifest indicates test failure', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const failedManifestPath = path.join(tmpDir, 'failed-manifest.json');
    const failedManifestData = {
      schemaVersion: 1,
      localVerification: {
        nodeBackendTests: { status: 'FAILED', passed: 10, failed: 1 },
      },
      overallStatus: 'FAILED',
    };
    fs.writeFileSync(failedManifestPath, JSON.stringify(failedManifestData));
    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, verifiedManifestPath: failedManifestPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Verification manifest overallStatus is FAILED|Node backend tests failed/);
        return true;
      }
    );
  });

  it('fails closed when live eval JSON report file is missing', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const fakeLiveEvalPath = path.join(tmpDir, 'missing-eval.json');
    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: fakeLiveEvalPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Live eval report missing/);
        return true;
      }
    );
  });

  it('fails closed when live eval report contains invalid/corrupt JSON', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const corruptEvalPath = path.join(tmpDir, 'corrupt-eval.json');
    fs.writeFileSync(corruptEvalPath, 'NOT_VALID_JSON{{{');

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: corruptEvalPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Corrupt live eval report/);
        return true;
      }
    );
  });

  it('fails closed when live eval report is missing required metrics (precision)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const incompleteEvalPath = path.join(tmpDir, 'incomplete-eval.json');
    const payload = {
      mode: 'live',
      totalSamples: 125,
      realModelCallCount: 125,
      metrics: {
        totalSamples: 125,
        realModelCallCount: 125,
        recall: 0.98,
        f1Score: 0.98,
      },
      confusionMatrix: { tp: 10, fp: 0, fn: 1, tn: 10 },
      promptHash: 'abc',
      corpusHash: 'def',
    };
    fs.writeFileSync(incompleteEvalPath, JSON.stringify(payload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: incompleteEvalPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: missing or invalid precision/);
        return true;
      }
    );
  });

  it('fails closed when live eval precision drops below quality gate (precision < 0.95)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const lowPrecisionPath = path.join(tmpDir, 'low-precision-eval.json');
    const payload = {
      mode: 'live',
      totalSamples: 125,
      realModelCallCount: 125,
      metrics: {
        totalSamples: 125,
        realModelCallCount: 125,
        precision: 0.85,
        recall: 0.95,
        f1Score: 0.90,
        falsePositivePenalties: 0,
        schemaValidityRate: 1.0,
        latencyBreakdown: { avgTotalMs: 1.0 },
      },
      confusionMatrix: { tp: 85, fp: 15, fn: 5, tn: 100 },
      promptHash: 'abc',
      corpusHash: 'def',
    };
    fs.writeFileSync(lowPrecisionPath, JSON.stringify(payload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, liveEvalPath: lowPrecisionPath });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /precision 0.85 below required 0.95/);
        return true;
      }
    );
  });

  it('fails closed when no database backup metadata exists', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const emptyBackupsDir = path.join(tmpDir, 'empty-backups');
    fs.mkdirSync(emptyBackupsDir, { recursive: true });

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: emptyBackupsDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: No database backup metadata/);
        return true;
      }
    );
  });

  it('fails closed on database backup SHA256 checksum mismatch (corrupted artifact)', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const corruptBackupsDir = path.join(tmpDir, 'corrupt-backups');
    fs.mkdirSync(corruptBackupsDir, { recursive: true });

    const dbFile = path.join(corruptBackupsDir, 'test_backup.db');
    const metaFile = path.join(corruptBackupsDir, 'test_backup.db.json');

    const dbContent = Buffer.from('REAL_DATABASE_BYTES_CONTENT');
    fs.writeFileSync(dbFile, dbContent);

    const fakeSha = '0000000000000000000000000000000000000000000000000000000000000000';
    const metaPayload = {
      backupPath: dbFile,
      filename: 'test_backup.db',
      sha256: fakeSha,
      sizeBytes: dbContent.length,
      integrityCheck: 'ok',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: corruptBackupsDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: SQLite backup SHA256 checksum mismatch/);
        return true;
      }
    );
  });

  it('fails closed on database backup size mismatch', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const sizeMismatchDir = path.join(tmpDir, 'size-mismatch-backups');
    fs.mkdirSync(sizeMismatchDir, { recursive: true });

    const dbFile = path.join(sizeMismatchDir, 'test_backup.db');
    const metaFile = path.join(sizeMismatchDir, 'test_backup.db.json');

    const dbContent = Buffer.from('DATABASE_CONTENT');
    fs.writeFileSync(dbFile, dbContent);
    const realSha = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaPayload = {
      backupPath: dbFile,
      filename: 'test_backup.db',
      sha256: realSha,
      sizeBytes: dbContent.length + 100, // Intentional mismatch
      integrityCheck: 'ok',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: sizeMismatchDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup file size mismatch/);
        return true;
      }
    );
  });

  it('fails closed on database backup integrity_check failure', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const badIntegrityDir = path.join(tmpDir, 'bad-integrity-backups');
    fs.mkdirSync(badIntegrityDir, { recursive: true });

    const dbFile = path.join(badIntegrityDir, 'test_backup.db');
    const metaFile = path.join(badIntegrityDir, 'test_backup.db.json');

    const dbContent = Buffer.from('DATABASE_CONTENT');
    fs.writeFileSync(dbFile, dbContent);
    const realSha = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaPayload = {
      backupPath: dbFile,
      filename: 'test_backup.db',
      sha256: realSha,
      sizeBytes: dbContent.length,
      integrityCheck: 'failed: corruption found',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: badIntegrityDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup integrity_check failed/);
        return true;
      }
    );
  });

  it('fails closed on database backup foreign_key_check failure', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const badFkDir = path.join(tmpDir, 'bad-fk-backups');
    fs.mkdirSync(badFkDir, { recursive: true });

    const dbFile = path.join(badFkDir, 'test_backup.db');
    const metaFile = path.join(badFkDir, 'test_backup.db.json');

    const dbContent = Buffer.from('DATABASE_CONTENT');
    fs.writeFileSync(dbFile, dbContent);
    const realSha = crypto.createHash('sha256').update(dbContent).digest('hex');

    const metaPayload = {
      backupPath: dbFile,
      filename: 'test_backup.db',
      sha256: realSha,
      sizeBytes: dbContent.length,
      integrityCheck: 'ok',
      foreignKeyCheck: 'failed: 2 violations',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: badFkDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup foreign_key_check failed/);
        return true;
      }
    );
  });

  it('fails closed when web dist entrypoint (index.html) is missing', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const emptyDistDir = path.join(tmpDir, 'empty-dist');
    fs.mkdirSync(emptyDistDir, { recursive: true });

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, distDir: emptyDistDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Dist HTML entrypoint missing/);
        return true;
      }
    );
  });

  it('fails closed when dist assets directory or JS/CSS bundle is missing', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const noAssetsDistDir = path.join(tmpDir, 'no-assets-dist');
    fs.mkdirSync(noAssetsDistDir, { recursive: true });
    fs.writeFileSync(path.join(noAssetsDistDir, 'index.html'), '<html></html>');

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, distDir: noAssetsDistDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Dist assets directory missing/);
        return true;
      }
    );

    const emptyAssetsDir = path.join(noAssetsDistDir, 'assets');
    fs.mkdirSync(emptyAssetsDir, { recursive: true });

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, distDir: noAssetsDistDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /JS asset bundle missing/);
        return true;
      }
    );
  });

  it('fails closed when test runner exit code is non-zero', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    await assert.rejects(
      async () => {
        await generateReport({
          ...baseOpts,
          testRunnerExitCodes: { nodeBackend: 0, macSwift: 1 },
        });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Test runner exit code failure/);
        return true;
      }
    );
  });

  it('fails closed when backup database file is missing', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    const missingDbFileDir = path.join(tmpDir, 'missing-db-file-backups');
    fs.mkdirSync(missingDbFileDir, { recursive: true });

    const metaFile = path.join(missingDbFileDir, 'nonexistent_backup.db.json');
    const metaPayload = {
      backupPath: path.join(missingDbFileDir, 'nonexistent_backup.db'),
      filename: 'nonexistent_backup.db',
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
      integrityCheck: 'ok',
      foreignKeyCheck: 'ok',
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    await assert.rejects(
      async () => {
        await generateReport({ ...baseOpts, backupsDir: missingDbFileDir });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup database file missing/);
        return true;
      }
    );
  });

  it('fails closed when server /api/health returns gitCommit: "unknown"', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    let mockServer;
    let mockPort;

    await new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            gitCommit: 'unknown',
            buildTime: new Date().toISOString(),
            appVersion: '0.1.0',
          })
        );
      });
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });

    try {
      await assert.rejects(
        async () => {
          await generateReport({
            ...baseOpts,
            skipHealthCheck: false,
            healthUrl: `http://127.0.0.1:${mockPort}/api/health`,
            spanishHealthUrl: `http://127.0.0.1:${mockPort}/api/health`,
          });
        },
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /invalid or unknown gitCommit/);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  it('fails closed when server /api/health returns gitCommit mismatching HEAD SHA', async () => {
    const baseOpts = createValidFixtures(tmpDir);
    let mockServer;
    let mockPort;

    await new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            gitCommit: '0000000000000000000000000000000000000000',
            buildTime: new Date().toISOString(),
            appVersion: '0.1.0',
          })
        );
      });
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });

    try {
      await assert.rejects(
        async () => {
          await generateReport({
            ...baseOpts,
            skipHealthCheck: false,
            healthUrl: `http://127.0.0.1:${mockPort}/api/health`,
            spanishHealthUrl: `http://127.0.0.1:${mockPort}/api/health`,
          });
        },
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /does not match HEAD SHA/);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });
});
