import getDb from '../db.js';
import { fileURLToPath } from 'url';

export function runRetentionCleanup(dbInput) {
  const db = dbInput || getDb();

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
  return info.changes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
