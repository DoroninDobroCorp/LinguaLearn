import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

describe('Stage A: Inventory, Backup, Retention, Model & OpenAPI Specification', () => {
  it('VAL-STAGEA-001: archives backups to /srv/backups/lingualearn/ and git status is clean', () => {
    // 1. Check /srv/backups/lingualearn/ directory exists
    assert.equal(fs.existsSync('/srv/backups/lingualearn'), true, '/srv/backups/lingualearn directory must exist');

    // 2. Check .gitignore exists and includes backup & cache patterns
    const gitignorePath = '/srv/LinguaLearn/.gitignore';
    assert.equal(fs.existsSync(gitignorePath), true, '.gitignore must exist at root');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    assert.match(gitignoreContent, /\*\.backup/i, '.gitignore must exclude backup files');
    assert.match(gitignoreContent, /\*\.bak/i, '.gitignore must exclude bak files');
    assert.match(gitignoreContent, /reports/i, '.gitignore must exclude reports directory');

    // 3. Run git status check in /srv/LinguaLearn
    const gitStatus = execSync('cd /srv/LinguaLearn && git status --porcelain', { encoding: 'utf8' }).trim();
    assert.equal(gitStatus, '', `git status must be completely clean, but found:\n${gitStatus}`);
  });

  it('VAL-STAGEA-002: node server/scripts/backupDatabase.js executes online backup with integrity checks', () => {
    const backupScriptPath = '/srv/LinguaLearn/english/server/scripts/backupDatabase.js';
    assert.equal(fs.existsSync(backupScriptPath), true, 'backupDatabase.js script must exist');

    const output = execSync('node server/scripts/backupDatabase.js', {
      cwd: '/srv/LinguaLearn/english',
      encoding: 'utf8',
    });

    assert.match(output, /integrity_check:?\s*ok/i, 'Backup output must verify PRAGMA integrity_check ok');
    assert.match(output, /foreign_key_check:?\s*ok/i, 'Backup output must verify PRAGMA foreign_key_check ok');
    assert.match(output, /backup created/i, 'Backup output must confirm creation');

    // Verify latest backup file in /srv/backups/lingualearn
    const files = fs.readdirSync('/srv/backups/lingualearn').filter((f) => f.endsWith('.db') || f.endsWith('.sqlite') || f.includes('backup'));
    assert.ok(files.length > 0, 'At least one backup file must exist in /srv/backups/lingualearn');

    const latestBackup = path.join('/srv/backups/lingualearn', files.sort().pop());
    const backupDb = new Database(latestBackup, { readonly: true });
    const integrityResult = backupDb.pragma('integrity_check');
    assert.equal(integrityResult[0].integrity_check, 'ok', 'Backed up DB must pass integrity_check');
    const fkResult = backupDb.pragma('foreign_key_check');
    assert.equal(fkResult.length, 0, 'Backed up DB must have zero foreign key violations');
    backupDb.close();
  });

  it('VAL-STAGEA-003: daily retention cleanup systemd service and timer are installed and active', () => {
    const servicePath = '/etc/systemd/system/lingualearn-retention.service';
    const timerPath = '/etc/systemd/system/lingualearn-retention.timer';

    assert.equal(fs.existsSync(servicePath), true, 'lingualearn-retention.service must exist in /etc/systemd/system/');
    assert.equal(fs.existsSync(timerPath), true, 'lingualearn-retention.timer must exist in /etc/systemd/system/');

    const timerStatus = execSync('systemctl status lingualearn-retention.timer', { encoding: 'utf8' });
    assert.match(timerStatus, /active \(waiting\)|active \(running\)/, 'Retention timer must be active in systemd');

    // Execute retentionCleanup.js dry-run / direct run
    const cleanupOutput = execSync('node server/scripts/retentionCleanup.js', {
      cwd: '/srv/LinguaLearn/english',
      encoding: 'utf8',
    });
    assert.match(cleanupOutput, /retention cleanup completed/i, 'Retention script must log completion');
  });

  it('VAL-STAGEA-004: Gemini 3.5 Flash-Lite default model configuration and evaluation suite', () => {
    const evalScriptPath = '/srv/LinguaLearn/english/server/scripts/evalGeminiModel.js';
    assert.equal(fs.existsSync(evalScriptPath), true, 'evalGeminiModel.js must exist');

    const output = execSync('node server/scripts/evalGeminiModel.js', {
      cwd: '/srv/LinguaLearn/english',
      encoding: 'utf8',
    });

    assert.match(output, /evaluation report/i, 'evalGeminiModel.js must output evaluation report summary');

    const reportPath = '/srv/LinguaLearn/english/server/reports/eval-gemini-model.json';
    assert.equal(fs.existsSync(reportPath), true, 'server/reports/eval-gemini-model.json report must exist');

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(report.metrics.totalSamples >= 60, 'Evaluation report must cover 60+ synthetic test samples');
    assert.ok(report.metrics.schemaValidityRate >= 0.95, 'Schema validity rate must be >= 95%');
    assert.ok(report.metrics.latencyBreakdown, 'Report must contain latency breakdown metrics');
  });

  it('VAL-STAGEA-005: OpenAPI 3.0 contract and shared fixtures published', () => {
    const openapiPath = '/srv/LinguaLearn/docs/openapi-writing-analysis-v1.json';
    assert.equal(fs.existsSync(openapiPath), true, 'OpenAPI spec must exist at docs/openapi-writing-analysis-v1.json');

    const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
    assert.equal(openapi.openapi, '3.0.3', 'OpenAPI version must be 3.0.3');
    assert.ok(openapi.paths['/api/writing/analyze'], 'OpenAPI spec must define /api/writing/analyze path');

    const fixturePath = '/srv/LinguaLearn/english/tests/fixtures/sample-analysis-payload.json';
    assert.equal(fs.existsSync(fixturePath), true, 'Shared fixture sample-analysis-payload.json must exist');

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.schemaVersion, 1, 'Fixture must have schemaVersion: 1');
    assert.ok(fixture.eventId, 'Fixture must have eventId');
    assert.ok(fixture.originalText, 'Fixture must have originalText');
  });
});
