import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getDatabasePath, getDb } from '../db.js';

const BACKUP_DIR = '/srv/backups/lingualearn';

export async function createOnlineBackup(options = {}) {
  const targetDir = options.backupDir || BACKUP_DIR;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dbPath = options.dbPath || getDatabasePath();
  const sourceDb = options.db || getDb();

  // 1. Pre-backup integrity check
  const preIntegrity = sourceDb.pragma('integrity_check');
  const preIntegrityOk = Array.isArray(preIntegrity) && preIntegrity[0]?.integrity_check === 'ok';
  if (!preIntegrityOk) {
    throw new Error(`Pre-backup integrity check failed: ${JSON.stringify(preIntegrity)}`);
  }

  const preFk = sourceDb.pragma('foreign_key_check');
  if (preFk.length > 0) {
    throw new Error(`Pre-backup foreign key check failed with ${preFk.length} violation(s)`);
  }

  // 2. Generate timestamp and destination path
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
  const filename = `english_learning_${timestamp}.db`;
  const backupPath = path.join(targetDir, filename);

  // 3. Perform Online Backup via SQLite VACUUM INTO or db.backup
  if (typeof sourceDb.backup === 'function') {
    await sourceDb.backup(backupPath);
  } else {
    // Escaped SQL query for VACUUM INTO
    sourceDb.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  }

  // 4. Fetch git commit SHA
  let commitSha = 'unknown';
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: '/srv/LinguaLearn', encoding: 'utf8' }).trim();
  } catch {
    // Ignore git error if repo unavailable
  }

  // 5. Verify Backup Integrity and Foreign Keys
  const backupDb = new Database(backupPath, { readonly: true });
  const postIntegrity = backupDb.pragma('integrity_check');
  const postIntegrityOk = Array.isArray(postIntegrity) && postIntegrity[0]?.integrity_check === 'ok';

  const postFk = backupDb.pragma('foreign_key_check');
  const postFkOk = postFk.length === 0;
  backupDb.close();

  if (!postIntegrityOk) {
    throw new Error(`Backup file integrity check failed: ${JSON.stringify(postIntegrity)}`);
  }
  if (!postFkOk) {
    throw new Error(`Backup file foreign key check failed with ${postFk.length} violation(s)`);
  }

  // 6. Compute checksum and file size
  const fileBuffer = fs.readFileSync(backupPath);
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const stats = fs.statSync(backupPath);

  // 7. Write sidecar metadata file
  const metaPath = `${backupPath}.json`;
  const metadata = {
    timestamp: now.toISOString(),
    filename,
    backupPath,
    sizeBytes: stats.size,
    sha256: checksum,
    commitSha,
    integrityCheck: 'ok',
    foreignKeyCheck: 'ok',
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log(`=== SQLite Online Backup Created Successfully ===`);
  console.log(`Backup file: ${backupPath}`);
  console.log(`Size: ${stats.size} bytes`);
  console.log(`Commit SHA: ${commitSha}`);
  console.log(`checksum: ${checksum}`);
  console.log(`integrity_check: ok`);
  console.log(`foreign_key_check: ok`);

  return metadata;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  createOnlineBackup().catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
  });
}
