import getDb from '../db.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { logAnalyticsEvent } from '../analytics.js';

const LOCK_FILE = '/tmp/lingualearn-retention.lock';

export function runRetentionCleanup(dbInput) {
  const db = dbInput || getDb();

  let lockFd;
  try {
    lockFd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(lockFd, `${process.pid}\n${new Date().toISOString()}`);
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.warn(`[retention] Job skipped: Lock file ${LOCK_FILE} already exists (concurrent execution blocked).`);
      return 0;
    }
    throw err;
  }

  try {
    const startTime = Date.now();
    const stmt = db.prepare(`
      UPDATE writing_samples
      SET original_text = NULL, retention_purged = 1
      WHERE (original_text IS NOT NULL OR retention_purged != 1)
        AND id IN (
          SELECT ws.id
          FROM writing_samples ws
          LEFT JOIN user_settings us ON ws.user_id = us.user_id
          WHERE (ws.original_text IS NOT NULL OR ws.retention_purged != 1)
            AND datetime(COALESCE(ws.created_at, ws.sent_at), '+' || COALESCE(us.raw_text_retention_days, 7) || ' days') <= datetime('now')
        )
    `);

    const info = stmt.run();
    const durationMs = Date.now() - startTime;
    const purgedCount = info.changes;

    // Structured log output
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'retention_cleanup_completed',
      purgedCount,
      durationMs,
    };
    console.log(JSON.stringify(logEntry));

    // Telemetry / metrics update
    try {
      logAnalyticsEvent(db, {
        userId: 1,
        eventName: 'retention_cleanup_executed',
        properties: { purgedCount, durationMs },
      });
    } catch {
      // Ignore if analytics logger unavailable
    }

    return purgedCount;
  } finally {
    try {
      if (lockFd !== undefined) {
        fs.closeSync(lockFd);
      }
      if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
      }
    } catch {
      // Ignore lock cleanup error
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    const db = getDb();
    const purgedCount = runRetentionCleanup(db);
    console.log(`Retention cleanup completed. Purged original_text for ${purgedCount} writing sample(s).`);
    process.exit(0);
  } catch (err) {
    console.error('Retention cleanup failed:', err);
    process.exit(1);
  }
}
