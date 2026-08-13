import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { generateReport } from '../server/scripts/generateAuditEvidenceReport.js';

describe('Fail-Closed Audit Evidence Pipeline (VAL-EVIDENCE-003)', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-fail-closed-test-'));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/health includes gitCommit, buildTime, and appVersion fields', async () => {
    let server;
    let url = 'http://127.0.0.1:3001/api/health';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Not OK');
    } catch {
      const { app } = await import('../server/index.js');
      await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          url = `http://127.0.0.1:${port}/api/health`;
          resolve();
        });
      });
    }

    try {
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

  it('fails closed when live eval JSON report file is missing', () => {
    const fakeLiveEvalPath = path.join(tmpDir, 'missing-eval.json');
    assert.throws(
      () => {
        generateReport({ liveEvalPath: fakeLiveEvalPath, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Live eval report missing/);
        return true;
      }
    );
  });

  it('fails closed when live eval report contains invalid/corrupt JSON', () => {
    const corruptEvalPath = path.join(tmpDir, 'corrupt-eval.json');
    fs.writeFileSync(corruptEvalPath, 'NOT_VALID_JSON{{{');

    assert.throws(
      () => {
        generateReport({ liveEvalPath: corruptEvalPath, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Corrupt live eval report/);
        return true;
      }
    );
  });

  it('fails closed when live eval report is missing required metrics (precision)', () => {
    const incompleteEvalPath = path.join(tmpDir, 'incomplete-eval.json');
    const payload = {
      metrics: {
        recall: 0.98,
        f1Score: 0.98,
      },
      confusionMatrix: { tp: 10, fp: 0, fn: 1, tn: 10 },
      promptHash: 'abc',
      corpusHash: 'def',
    };
    fs.writeFileSync(incompleteEvalPath, JSON.stringify(payload));

    assert.throws(
      () => {
        generateReport({ liveEvalPath: incompleteEvalPath, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: missing or invalid precision/);
        return true;
      }
    );
  });

  it('fails closed when live eval precision drops below quality gate (precision < 0.95)', () => {
    const lowPrecisionPath = path.join(tmpDir, 'low-precision-eval.json');
    const payload = {
      metrics: {
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

    assert.throws(
      () => {
        generateReport({ liveEvalPath: lowPrecisionPath, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /precision 0.85 below required 0.95/);
        return true;
      }
    );
  });

  it('fails closed when no database backup metadata exists', () => {
    const emptyBackupsDir = path.join(tmpDir, 'empty-backups');
    fs.mkdirSync(emptyBackupsDir, { recursive: true });

    assert.throws(
      () => {
        generateReport({ backupsDir: emptyBackupsDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: No database backup metadata/);
        return true;
      }
    );
  });

  it('fails closed on database backup SHA256 checksum mismatch (corrupted artifact)', () => {
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
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    assert.throws(
      () => {
        generateReport({ backupsDir: corruptBackupsDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: SQLite backup SHA256 checksum mismatch/);
        return true;
      }
    );
  });

  it('fails closed on database backup size mismatch', () => {
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
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    assert.throws(
      () => {
        generateReport({ backupsDir: sizeMismatchDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup file size mismatch/);
        return true;
      }
    );
  });

  it('fails closed when web dist entrypoint (index.html) is missing', () => {
    const emptyDistDir = path.join(tmpDir, 'empty-dist');
    fs.mkdirSync(emptyDistDir, { recursive: true });

    assert.throws(
      () => {
        generateReport({ distDir: emptyDistDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Dist HTML entrypoint missing/);
        return true;
      }
    );
  });

  it('fails closed when test runner exit code is non-zero', () => {
    assert.throws(
      () => {
        generateReport({
          testRunnerExitCodes: { nodeBackend: 0, macSwift: 1 },
          skipHealthCheck: true,
        });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Fail-closed: Test runner exit code failure/);
        return true;
      }
    );
  });

  it('fails closed when dist assets directory or JS/CSS bundle is missing', () => {
    const noAssetsDistDir = path.join(tmpDir, 'no-assets-dist');
    fs.mkdirSync(noAssetsDistDir, { recursive: true });
    fs.writeFileSync(path.join(noAssetsDistDir, 'index.html'), '<html></html>');

    assert.throws(
      () => {
        generateReport({ distDir: noAssetsDistDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Dist assets directory missing/);
        return true;
      }
    );

    const emptyAssetsDir = path.join(noAssetsDistDir, 'assets');
    fs.mkdirSync(emptyAssetsDir, { recursive: true });

    assert.throws(
      () => {
        generateReport({ distDir: noAssetsDistDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /JS asset bundle missing/);
        return true;
      }
    );
  });

  it('fails closed when backup database file is missing', () => {
    const missingDbFileDir = path.join(tmpDir, 'missing-db-file-backups');
    fs.mkdirSync(missingDbFileDir, { recursive: true });

    const metaFile = path.join(missingDbFileDir, 'nonexistent_backup.db.json');
    const metaPayload = {
      backupPath: path.join(missingDbFileDir, 'nonexistent_backup.db'),
      filename: 'nonexistent_backup.db',
      sha256: 'a'.repeat(64),
      sizeBytes: 1234,
    };
    fs.writeFileSync(metaFile, JSON.stringify(metaPayload));

    assert.throws(
      () => {
        generateReport({ backupsDir: missingDbFileDir, skipHealthCheck: true });
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /SQLite backup database file missing/);
        return true;
      }
    );
  });
});
