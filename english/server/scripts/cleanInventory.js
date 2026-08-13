import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = process.env.REPO_ROOT || DEFAULT_REPO_ROOT;
const ENGLISH_DIR = process.env.ENGLISH_DIR || path.join(REPO_ROOT, 'english');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(REPO_ROOT, 'backups');

export function runInventoryCleanup() {
  console.log('=== Starting LinguaLearn Inventory Cleanup ===');

  // 1. Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}`);
  }

  // 2. Find and move runtime backups to /srv/backups/lingualearn/
  const serverDir = path.join(ENGLISH_DIR, 'server');
  if (fs.existsSync(serverDir)) {
    const files = fs.readdirSync(serverDir);
    for (const file of files) {
      if (
        file.includes('.backup') ||
        file.endsWith('.bak') ||
        (file.startsWith('english_learning.db') && file !== 'english_learning.db' && !file.endsWith('-wal') && !file.endsWith('-shm'))
      ) {
        const srcPath = path.join(serverDir, file);
        const destPath = path.join(BACKUP_DIR, file);
        fs.renameSync(srcPath, destPath);
        console.log(`Moved backup: ${file} -> ${destPath}`);
      }
    }
  }

  // Check English root for stray backup files as well
  const rootFiles = fs.readdirSync(ENGLISH_DIR);
  for (const file of rootFiles) {
    if (file.includes('.backup') || file.endsWith('.bak')) {
      const srcPath = path.join(ENGLISH_DIR, file);
      const destPath = path.join(BACKUP_DIR, file);
      fs.renameSync(srcPath, destPath);
      console.log(`Moved root backup: ${file} -> ${destPath}`);
    }
  }

  // 3. Remove stray duplicate root-level files in english/ that exist in server/, src/, or tests/
  const strayRootFiles = [
    'auth.js',
    'db.js',
    'dbMigration.js',
    'deviceTokens.js',
    'dailyPractice.js',
    'topicProgress.js',
    'writingAnalysis.js',
    'liveChat.js',
    'liveChatBridge.js',
    'chatIdempotency.js',
    'geminiAudioTranscription.js',
    'geminiSegmentTranslation.js',
    'localAudioTranscription.js',
    'hpmor.js',
    'transcribe_audio.py',
    'analytics.js',
    'App.jsx',
    'main.jsx',
    'index.css',
    'README.md',
    'build_handoff_report.py',
    'collect_correction_02_canary.py',
    'collect_correction_02_value_audit.py',
    'EXECUTOR_HANDOFF_TZ01_CORRECTION_02.md',
    'lingua.db',
  ];

  for (const f of strayRootFiles) {
    const p = path.join(ENGLISH_DIR, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      fs.unlinkSync(p);
      console.log(`Removed stray duplicate root file: ${f}`);
    }
  }

  // Remove stray duplicate root directories if present and identical to src/ or server/
  const strayRootDirs = ['components', 'contexts', 'hooks', 'utils', 'new'];
  for (const d of strayRootDirs) {
    const p = path.join(ENGLISH_DIR, d);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`Removed stray duplicate root directory: ${d}`);
    }
  }

  // Remove stray duplicate test files at english/ root (since they exist in english/tests/)
  for (const f of fs.readdirSync(ENGLISH_DIR)) {
    if (f !== 'playwright.config.cjs' && !f.includes('.config.') && (f.endsWith('.test.mjs') || f.endsWith('.test.js') || f.endsWith('.spec.js') || f.endsWith('.spec.cjs') || f.endsWith('.spec.ts'))) {
      const p = path.join(ENGLISH_DIR, f);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        fs.unlinkSync(p);
        console.log(`Removed stray test file at english root: ${f}`);
      }
    }
  }

  console.log('=== LinguaLearn Inventory Cleanup Complete ===');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runInventoryCleanup();
}
